// API configuration
const API_CONFIG = {
    baseUrl: "https://xg77afez86.execute-api.eu-north-1.amazonaws.com/prod/evidencija",
    updateUrl: "https://xg77afez86.execute-api.eu-north-1.amazonaws.com/prod/update",
    headers: function() {
        return {
            "Authorization": `Bearer ${window.Auth.getIdToken()}`,
            "Content-Type": "application/json"
        };
    }
};

// Global variables
let collectionData = [];
let deviceSummaries = [];

// Parse JWT token to get user info
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Error parsing JWT', e);
        return null;
    }
}

// Display user information
function displayUserInfo() {
    const idToken = window.Auth.getIdToken();
    if (!idToken) return;
    
    const userData = parseJwt(idToken);
    if (!userData) return;
    
    // Update header with user name/email
    const userInfoElement = document.getElementById('user-info');
    if (userInfoElement) {
        userInfoElement.textContent = userData.email || userData.username || 'Prijavljeni korisnik';
    }
}

// Fetch waste collection data
async function fetchWasteCollectionData(date) {
    const dateObj = new Date(date);
    const formattedDate = dateObj.toISOString().split('T')[0];
    
    try {
        const params = new URLSearchParams({
            dateFrom: formattedDate,
            dateTo: formattedDate
        });
        
        // Debug logging
        console.log(`Fetching data for date: ${formattedDate}`);
        
        const response = await fetch(`${API_CONFIG.baseUrl}?${params}`, {
            method: 'GET',
            headers: API_CONFIG.headers()
        });
        
        if (!response.ok) {
            throw new Error(`API zahtjev nije uspio: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Received ${data.root ? data.root.length : 0} records from API`);
        
        // Log the first few records to see their structure
        if (data.root && data.root.length > 0) {
            console.log('Sample record:', data.root[0]);
            
            // Check and print dates to debug
            const uniqueDates = new Set();
            data.root.forEach(item => {
                if (item.date) {
                    uniqueDates.add(item.date);
                }
            });
            console.log('Unique dates in response:', Array.from(uniqueDates));
        }
        
        return data.root || [];
    } catch (error) {
        console.error('Greška pri dohvatu podataka:', error);
        throw error;
    }
}

// Process data to create device summaries
function processDataByDevice(data) {
    // Group data by device
    const deviceGroups = {};
    
    // Get the selected date for filtering
    const dateInput = document.getElementById('collection-date');
    const selectedDate = dateInput.value; // Format: YYYY-MM-DD
    const selectedDateParts = selectedDate.split('-');
    
    // Format selected date as DD.MM.YYYY for comparison with configuration records
    const formattedSelectedDate = `${selectedDateParts[2]}.${selectedDateParts[1]}.${selectedDateParts[0]}`;
    console.log(`Processing data for date: ${formattedSelectedDate}`);
    
    // Create date objects for pickup filtering
    const selectedDateStart = new Date(selectedDate);
    selectedDateStart.setHours(0, 0, 0, 0);
    const selectedDateEnd = new Date(selectedDate);
    selectedDateEnd.setHours(23, 59, 59, 999);
    
    // First pass: gather all unique devices
    const allDevices = new Set();
    data.forEach(item => {
        if (item.deviceId) {
            allDevices.add(item.deviceId);
        }
    });
    
    console.log(`Found ${allDevices.size} unique devices in the data`);
    
    // Initialize device groups for all devices
    allDevices.forEach(deviceId => {
        // Find a sample item for this device to get the name
        const deviceSample = data.find(item => item.deviceId === deviceId);
        const deviceName = deviceSample ? deviceSample.deviceName || 'Nepoznati uređaj' : 'Nepoznati uređaj';
        
        deviceGroups[deviceId] = {
            deviceId,
            deviceName,
            pickups: [],
            totalPickups: 0,
            withRfid: 0,
            withoutRfid: 0,
            responsiblePerson: null,
            regOznaka: null,
            napomena: null,
            date: null,
            hasConfigForSelectedDate: false
        };
    });
    
    // Second pass: Process each item
    data.forEach(item => {
        const deviceId = item.deviceId || 'unknown';
        
        if (!deviceGroups[deviceId]) {
            // This should never happen since we initialized all devices above
            console.warn(`Device ${deviceId} found in data but not initialized. Adding now.`);
            deviceGroups[deviceId] = {
                deviceId,
                deviceName: item.deviceName || 'Nepoznati uređaj',
                pickups: [],
                totalPickups: 0,
                withRfid: 0,
                withoutRfid: 0,
                responsiblePerson: null,
                regOznaka: null,
                napomena: null,
                date: null,
                hasConfigForSelectedDate: false
            };
        }
        
        // Check if this is a configuration record (has a date field)
        const isConfigRecord = !!item.date;
        
        if (isConfigRecord) {
            console.log(`Found config record for device ${deviceId}: date=${item.date}, matches selected=${item.date === formattedSelectedDate}`);
            
            // For config records, only use data if it matches our exact date
            if (item.date === formattedSelectedDate) {
                deviceGroups[deviceId].responsiblePerson = item.zaduzio || deviceGroups[deviceId].responsiblePerson;
                deviceGroups[deviceId].regOznaka = item.reg_oznaka || deviceGroups[deviceId].regOznaka;
                deviceGroups[deviceId].napomena = (item.napomena && item.napomena !== '-') ? 
                    item.napomena : deviceGroups[deviceId].napomena;
                deviceGroups[deviceId].date = item.date;
                deviceGroups[deviceId].hasConfigForSelectedDate = true;
                
                // Store the ID for updating
                if (item._id) {
                    if (!deviceGroups[deviceId].pickups.length) {
                        deviceGroups[deviceId].pickups.push({
                            _id: item._id,
                            deviceId: deviceId,
                            deviceName: item.deviceName,
                            date: item.date
                        });
                    } else {
                        // Only update if not already set
                        if (!deviceGroups[deviceId].pickups[0]._id) {
                            deviceGroups[deviceId].pickups[0]._id = item._id;
                        }
                    }
                }
            }
        } else {
            // This is a pickup record - filter by the dateTime field
            const isPickupOnSelectedDate = (() => {
                if (!item.dateTime) return false;
                
                try {
                    const pickupDate = new Date(item.dateTime);
                    if (isNaN(pickupDate.getTime())) return false;
                    
                    return (pickupDate >= selectedDateStart && pickupDate <= selectedDateEnd);
                } catch (e) {
                    console.error(`Error parsing date: ${item.dateTime}`, e);
                    return false;
                }
            })();
            
            if (isPickupOnSelectedDate) {
                // This pickup is for the selected date
                deviceGroups[deviceId].totalPickups++;
                
                if (item.rfid_value && item.rfid_value !== '-') {
                    deviceGroups[deviceId].withRfid++;
                } else {
                    deviceGroups[deviceId].withoutRfid++;
                }
                
                // Add to pickups array
                deviceGroups[deviceId].pickups.push(item);
            }
        }
    });
    
    // Convert to array and filter out irrelevant devices
    const filteredDevices = Object.values(deviceGroups).filter(device => {
        // Keep all devices that have pickups for this date
        if (device.totalPickups > 0) return true;
        
        // Keep devices that have config for this date
        if (device.hasConfigForSelectedDate) return true;
        
        // Otherwise filter it out
        console.log(`Filtering out device ${device.deviceName} (${device.deviceId}) - no activity on selected date`);
        return false;
    });
    
    console.log(`Showing ${filteredDevices.length} devices after filtering`);
    
    // Calculate percentages for the kept devices
    return filteredDevices.map(device => {
        device.rfidPercentage = device.totalPickups > 0 
            ? Math.round((device.withRfid / device.totalPickups) * 100) 
            : 0;
        return device;
    });
}

// Render device summaries
function renderDeviceSummaries(deviceSummaries) {
    const devicesOverviewElement = document.getElementById('devices-overview');
    devicesOverviewElement.innerHTML = '';
    
    if (deviceSummaries.length === 0) {
        devicesOverviewElement.innerHTML = '<p>Nema dostupnih podataka za odabrani datum.</p>';
        return;
    }
    
    deviceSummaries.forEach(device => {
        // Check if device is a handheld reader (case insensitive)
        const deviceNameLower = device.deviceName ? device.deviceName.toLowerCase() : '';
        const isHandheldReader = deviceNameLower.includes('ručni čitač') || deviceNameLower.includes('rucni citac');
        
        // Prepare percentage HTML
        let percentageHTML = '';
        if (!isHandheldReader) {
            let percentageClass = 'poor';
            if (device.rfidPercentage >= 80) {
                percentageClass = 'good';
            } else if (device.rfidPercentage >= 50) {
                percentageClass = 'medium';
            }
            percentageHTML = `<span class="percentage ${percentageClass}">${device.rfidPercentage}%</span>`;
        }
        
        // Prepare additional info for non-expanded card
        let additionalInfoHTML = '';
        if (device.responsiblePerson) {
            additionalInfoHTML += `<span class="device-info-item">Zadužio: ${device.responsiblePerson}</span>`;
        }
        if (device.regOznaka) {
            additionalInfoHTML += `<span class="device-info-item">Reg: ${device.regOznaka}</span>`;
        }
        if (device.napomena) {
            additionalInfoHTML += `<span class="device-info-item">Napomena: ${device.napomena}</span>`;
        }
        
        const deviceCardHTML = `
            <div class="device-card" data-device-id="${device.deviceId}">
                <div class="device-header" onclick="toggleDeviceDetails('${device.deviceId}')">
                    <div class="device-header-main">
                        <span class="device-name">${device.deviceName}</span>
                        ${additionalInfoHTML ? `<div class="device-additional-info">${additionalInfoHTML}</div>` : ''}
                    </div>
                    <div class="device-stats">
                        <span class="stat">Podizanja: ${device.totalPickups}</span>
                        ${percentageHTML}
                    </div>
                </div>
                <div class="device-details" id="device-${device.deviceId}">
                    <div class="device-summary">
                        <div class="device-edit-form">
                            <div class="form-row">
                                <label for="responsible-${device.deviceId}">Zadužio:</label>
                                <input type="text" id="responsible-${device.deviceId}" value="${device.responsiblePerson || ''}">
                            </div>
                            <div class="form-row">
                                <label for="registration-${device.deviceId}">Registracija:</label>
                                <input type="text" id="registration-${device.deviceId}" value="${device.regOznaka || ''}">
                            </div>
                            <div class="form-row">
                                <label for="note-${device.deviceId}">Napomena:</label>
                                <input type="text" id="note-${device.deviceId}" value="${device.napomena || ''}">
                            </div>
                            <button class="edit-save-btn" onclick="updateDeviceInfo('${device.deviceId}', '${device.deviceName}')">
                                <i class="fas fa-save"></i> Spremi promjene
                            </button>
                            <div id="update-status-${device.deviceId}" class="update-status"></div>
                        </div>
                    </div>
                    <h4>Podizanja (${device.totalPickups})</h4>
                    <div class="pickups-list">
                        ${renderPickupsList(device.pickups)}
                    </div>
                </div>
            </div>
        `;
        
        devicesOverviewElement.innerHTML += deviceCardHTML;
    });
}

// Render pickups list for a device
function renderPickupsList(pickups) {
    if (!pickups.length) return '<p>Nema pronađenih podizanja.</p>';
    
    return pickups.map((pickup, index) => {
        // Create address if both Ulica and KucniBroj exist
        const addressText = pickup.Ulica && pickup.KucniBroj 
            ? `${pickup.Ulica} ${pickup.KucniBroj}` 
            : (pickup.Ulica || pickup.KucniBroj || '-');

        // Check if ZajednickaPostuda is "Da"
        const isZajednickaPostuda = pickup.ZajednickaPostuda === "Da";
        const facilityNameDisplay = isZajednickaPostuda ? "Zajednička Posuda" : (pickup.NazivObjekta || pickup.real_estate_name || '-');
        const facilityCodeDisplay = isZajednickaPostuda ? "Zajednička Posuda" : (pickup.SifraObjekta || pickup.foreignId || '-');
        
        return `
        <div class="pickup-item" onclick="showPickupDetails(${index}, '${pickup.deviceId}')">
            <p><strong>Vrijeme:</strong> ${pickup.dateTime}</p>
            <p><strong>RFID:</strong> ${pickup.rfid_value || 'Nema'}</p>
            <p><strong>ID kolekcije:</strong> ${pickup.collectionId || 'N/A'}</p>
            <p><strong>Naziv objekta:</strong> ${facilityNameDisplay}</p>
            <p><strong>Šifra objekta:</strong> ${facilityCodeDisplay}</p>
            <p><strong>Adresa:</strong> ${addressText}</p>
        </div>
    `}).join('');
}

// Show pickup details
function showPickupDetails(pickupIndex, deviceId) {
    const device = deviceSummaries.find(d => d.deviceId === deviceId);
    if (!device || !device.pickups[pickupIndex]) return;
    
    const pickup = device.pickups[pickupIndex];
    const pickupDetailsElement = document.getElementById('pickup-details');
    
    // Combine address from Ulica and KucniBroj
    const addressText = pickup.Ulica && pickup.KucniBroj 
        ? `${pickup.Ulica} ${pickup.KucniBroj}` 
        : (pickup.Ulica || pickup.KucniBroj || 'Nije dostupno');
    
    // Check if ZajednickaPostuda is "Da"
    const isZajednickaPostuda = pickup.ZajednickaPostuda === "Da";
    const facilityNameDisplay = isZajednickaPostuda ? "Zajednička Posuda" : (pickup.NazivObjekta || pickup.real_estate_name || '-');
    const facilityCodeDisplay = isZajednickaPostuda ? "Zajednička Posuda" : (pickup.SifraObjekta || pickup.foreignId || '-');
    
    // Format coordinates as a Google Maps link if available
    let coordinatesDisplay = 'Nije dostupno';
    if (pickup.latitude && pickup.longitude) {
        coordinatesDisplay = `<a href="https://google.com/maps/place/${pickup.latitude},${pickup.longitude}" target="_blank">${pickup.latitude}, ${pickup.longitude}</a>`;
    }
    
    // Format details
    const detailsHTML = `
        <div class="pickup-detail">
            <h4>Detalji odvoza</h4>
            <div class="detail-row">
                <div class="detail-label">Datum/Vrijeme:</div>
                <div class="detail-value">${pickup.dateTime || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">ID kolekcije:</div>
                <div class="detail-value">${pickup.collectionId || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Uređaj:</div>
                <div class="detail-value">${pickup.deviceName || 'Nepoznato'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Naziv objekta:</div>
                <div class="detail-value">${facilityNameDisplay}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Šifra objekta:</div>
                <div class="detail-value">${facilityCodeDisplay}</div>
            </div>
            ${pickup.VrstaObjekta ? `
            <div class="detail-row">
                <div class="detail-label">Vrsta objekta:</div>
                <div class="detail-value">${pickup.VrstaObjekta}</div>
            </div>` : ''}
            ${pickup.VrstaPosude ? `
            <div class="detail-row">
                <div class="detail-label">Vrsta posude:</div>
                <div class="detail-value">${pickup.VrstaPosude}</div>
            </div>` : ''}
            <div class="detail-row">
                <div class="detail-label">Adresa:</div>
                <div class="detail-value">${addressText}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">RFID vrijednost:</div>
                <div class="detail-value">${pickup.rfid_value || 'Nema'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">RFID tip:</div>
                <div class="detail-value">${pickup.rfid_type || 'Nema'}</div>
            </div>
            ${pickup.DatumAktivacije ? `
            <div class="detail-row">
                <div class="detail-label">Datum aktivacije:</div>
                <div class="detail-value">${pickup.DatumAktivacije}</div>
            </div>` : ''}
            <div class="detail-row">
                <div class="detail-label">Koordinate:</div>
                <div class="detail-value">${coordinatesDisplay}</div>
            </div>
            ${pickup.ZajednickaPostuda ? `
            <div class="detail-row">
                <div class="detail-label">Zajednička posuda:</div>
                <div class="detail-value">${pickup.ZajednickaPostuda}</div>
            </div>` : ''}
        </div>
    `;
    
    pickupDetailsElement.innerHTML = detailsHTML;
    
    // Scroll to details section
    document.getElementById('details-section').scrollIntoView({ behavior: 'smooth' });
}

// Toggle device details
function toggleDeviceDetails(deviceId) {
    const deviceDetailsElement = document.getElementById(`device-${deviceId}`);
    if (deviceDetailsElement) {
        const isVisible = deviceDetailsElement.style.display === 'block';
        deviceDetailsElement.style.display = isVisible ? 'none' : 'block';
    }
}

// Show loading indicator
function showLoading() {
    const loader = document.getElementById('overview-loader');
    if (loader) {
        loader.style.display = 'flex';
    }
}

// Hide loading indicator
function hideLoading() {
    const loader = document.getElementById('overview-loader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// Load data for selected date
async function loadDataForDate() {
    const dateInput = document.getElementById('collection-date');
    const selectedDate = dateInput.value;
    
    if (!selectedDate) {
        alert('Molimo odaberite datum');
        return;
    }
    
    showLoading();
    
    try {
        // Clear existing data
        document.getElementById('pickup-details').innerHTML = '';
        
        // Fetch and process data
        collectionData = await fetchWasteCollectionData(selectedDate);
        deviceSummaries = processDataByDevice(collectionData);
        
        // Render data
        renderDeviceSummaries(deviceSummaries);
    } catch (error) {
        document.getElementById('devices-overview').innerHTML = `
            <div class="error-message">
                <h3>Greška pri učitavanju podataka</h3>
                <p>${error.message}</p>
            </div>
        `;
    } finally {
        hideLoading();
    }
}

// Initialize the application
async function initApp() {
    try {
        // Check if authenticated
        const isAuthenticated = await window.Auth.initAuth();
        
        if (isAuthenticated) {
            console.log('Korisnik je prijavljen');
            displayUserInfo();
            window.Auth.setupTokenRefresh();
            
            // Set today's date as default
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('collection-date').value = today;
            
            // Add event listener for load data button
            document.getElementById('load-data-btn').addEventListener('click', loadDataForDate);
        }
        
        // Debug token info in console
        window.Auth.debugTokens();
    } catch (error) {
        console.error('Greška pri inicijalizaciji aplikacije:', error);
        document.getElementById('loading').innerHTML = `
            <div class="error-message">
                <h3>Greška u aplikaciji</h3>
                <p>${error.message}</p>
                <button onclick="window.location.reload()">Pokušaj ponovno</button>
            </div>
        `;
    }
}

// Update device information
async function updateDeviceInfo(deviceId, deviceName) {
    const device = deviceSummaries.find(d => d.deviceId === deviceId);
    if (!device) return;
    
    // Get the values from the form
    const responsiblePerson = document.getElementById(`responsible-${deviceId}`).value;
    const regOznaka = document.getElementById(`registration-${deviceId}`).value;
    const napomena = document.getElementById(`note-${deviceId}`).value;
    
    // Determine if we need to create (POST) or update (PUT)
    const usePost = !device.pickups.length || !device.pickups[0]._id;
    
    // Get the date selected in the calendar
    const calendarDateInput = document.getElementById('collection-date');
    let selectedDateStr = calendarDateInput.value;
    
    // Convert YYYY-MM-DD to DD.MM.YYYY format for the API
    if (selectedDateStr) {
        const parts = selectedDateStr.split('-');
        if (parts.length === 3) {
            // Format as DD.MM.YYYY
            selectedDateStr = `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
    } else {
        // Fallback to today if somehow the date is not available
        const today = new Date();
        selectedDateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
    }
    
    // Log what we're doing for debugging
    console.log(`${usePost ? 'Creating new record' : 'Updating record'} for device ${deviceId} using selected date: ${selectedDateStr}`);
    
    // Prepare payload
    const payload = {
        deviceName: deviceName,
        napomena: napomena || '',
        reg_oznaka: regOznaka || '',
        zadužio: responsiblePerson || '',
        date: selectedDateStr
    };
    
    // If updating, add the _id
    if (!usePost && device.pickups[0]._id) {
        payload._id = device.pickups[0]._id;
        console.log(`Updating record with ID: ${payload._id}`);
    }
    
    // Show loading status
    showUpdateStatus(deviceId, 'Ažuriranje u tijeku...', 'loading');
    
    try {
        // Send the request (either POST or PUT)
        const response = await fetch(API_CONFIG.updateUrl, {
            method: usePost ? 'POST' : 'PUT',
            headers: API_CONFIG.headers(),
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Server response:", data);
        
        // Update the local data
        device.responsiblePerson = responsiblePerson;
        device.regOznaka = regOznaka;
        device.napomena = napomena;
        
        // If this was a POST and we got back an ID, store it
        if (usePost && data && data._id) {
            console.log("New record created with ID:", data._id);
            // If there are no pickups, create a dummy one to store the ID
            if (!device.pickups.length) {
                device.pickups.push({
                    _id: data._id,
                    deviceId: deviceId,
                    deviceName: deviceName,
                    date: selectedDateStr
                });
            } else {
                // Otherwise update the first pickup with the ID
                device.pickups[0]._id = data._id;
                device.pickups[0].date = selectedDateStr;
            }
        }
        
        // Show success message
        showUpdateStatus(deviceId, 'Uspješno ažurirano!', 'success');
        
        // Re-render device summaries to reflect changes
        renderDeviceSummaries(deviceSummaries);
        
        // Reopen the details view
        const deviceDetailsElement = document.getElementById(`device-${deviceId}`);
        if (deviceDetailsElement) {
            deviceDetailsElement.style.display = 'block';
        }
        
    } catch (error) {
        console.error('Error updating device info:', error);
        showUpdateStatus(deviceId, `Greška: ${error.message}`, 'error');
    }
}

// Display status message for update operation
function showUpdateStatus(deviceId, message, type) {
    const statusElement = document.getElementById(`update-status-${deviceId}`);
    if (!statusElement) return;
    
    statusElement.textContent = message;
    statusElement.className = 'update-status';
    statusElement.classList.add(type);
    statusElement.style.display = 'block';
    
    // Clear success/error message after 5 seconds
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = 'update-status';
            statusElement.style.display = 'none';
        }, 5000);
    }
}

// Make functions available globally for onclick handlers
window.toggleDeviceDetails = toggleDeviceDetails;
window.showPickupDetails = showPickupDetails;
window.updateDeviceInfo = updateDeviceInfo;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

console.log("Updating device info API integration active!"); 
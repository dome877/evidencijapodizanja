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
        
        const response = await fetch(`${API_CONFIG.baseUrl}?${params}`, {
            method: 'GET',
            headers: API_CONFIG.headers()
        });
        
        if (!response.ok) {
            throw new Error(`API zahtjev nije uspio: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
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
    
    data.forEach(item => {
        const deviceId = item.deviceId || 'unknown';
        const deviceName = item.deviceName || 'Nepoznati uređaj';
        
        if (!deviceGroups[deviceId]) {
            deviceGroups[deviceId] = {
                deviceId,
                deviceName,
                pickups: [],
                totalPickups: 0,
                withRfid: 0,
                withoutRfid: 0,
                responsiblePerson: null,
                regOznaka: null,
                napomena: null
            };
        }
        
        // Store responsible person (zaduzio) if available
        if (item.zaduzio && !deviceGroups[deviceId].responsiblePerson) {
            deviceGroups[deviceId].responsiblePerson = item.zaduzio;
        }
        
        // Store registration data (reg_oznaka) if available
        if (item.reg_oznaka && !deviceGroups[deviceId].regOznaka) {
            deviceGroups[deviceId].regOznaka = item.reg_oznaka;
        }
        
        // Store napomena if available
        if (item.napomena && item.napomena !== '-' && !deviceGroups[deviceId].napomena) {
            deviceGroups[deviceId].napomena = item.napomena;
        }
        
        // Count RFID vs non-RFID pickups
        deviceGroups[deviceId].totalPickups++;
        if (item.rfid_value && item.rfid_value !== '-') {
            deviceGroups[deviceId].withRfid++;
        } else {
            deviceGroups[deviceId].withoutRfid++;
        }
        
        // Add to pickups array
        deviceGroups[deviceId].pickups.push(item);
    });
    
    // Convert to array and calculate percentages
    return Object.values(deviceGroups).map(device => {
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
                        <span class="stat">RFID: ${device.withRfid}</span>
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
    
    // Get date to use - for updates, use the original date from the record
    let dateToUse;
    if (!usePost && device.pickups[0] && device.pickups[0].date) {
        // Use the original date for updates
        dateToUse = device.pickups[0].date;
    } else {
        // Use today's date for new records
        const today = new Date();
        dateToUse = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
    }
    
    // Log what we're doing for debugging
    console.log(`${usePost ? 'Creating new record' : 'Updating record'} for device ${deviceId} using date: ${dateToUse}`);
    
    // Prepare payload
    const payload = {
        deviceName: deviceName,
        napomena: napomena,
        reg_oznaka: regOznaka,
        zadužio: responsiblePerson,
        date: dateToUse
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
                    date: dateToUse
                });
            } else {
                // Otherwise update the first pickup with the ID
                device.pickups[0]._id = data._id;
                device.pickups[0].date = dateToUse;
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
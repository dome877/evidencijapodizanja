// API configuration
const API_CONFIG = {
    baseUrl: "https://xg77afez86.execute-api.eu-north-1.amazonaws.com/prod/evidencija",
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
                        ${device.responsiblePerson ? `<p><strong>Zadužio:</strong> ${device.responsiblePerson}</p>` : ''}
                        ${device.regOznaka ? `<p><strong>Registracija:</strong> ${device.regOznaka}</p>` : ''}
                        ${device.napomena ? `<p><strong>Napomena:</strong> ${device.napomena}</p>` : ''}
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
            ${pickup.napomena ? `
            <div class="detail-row">
                <div class="detail-label">Napomena:</div>
                <div class="detail-value">${pickup.napomena}</div>
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

// Make functions available globally for onclick handlers
window.toggleDeviceDetails = toggleDeviceDetails;
window.showPickupDetails = showPickupDetails;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp); 
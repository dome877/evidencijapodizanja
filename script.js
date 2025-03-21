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
        userInfoElement.textContent = userData.email || userData.username || 'Authenticated User';
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
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.root || [];
    } catch (error) {
        console.error('Error fetching waste collection data:', error);
        throw error;
    }
}

// Process data to create device summaries
function processDataByDevice(data) {
    // Group data by device
    const deviceGroups = {};
    
    data.forEach(item => {
        const deviceId = item.deviceId || 'unknown';
        const deviceName = item.deviceName || 'Unknown Device';
        
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
                napomena: '-'
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
        devicesOverviewElement.innerHTML = '<p>No data available for selected date.</p>';
        return;
    }
    
    deviceSummaries.forEach(device => {
        // Check if device is a handheld reader (case insensitive)
        const deviceNameLower = device.deviceName ? device.deviceName.toLowerCase() : '';
        const isHandheldReader = deviceNameLower.includes('ručni čitač') || deviceNameLower.includes('rucni citac');
        
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
        
        const deviceCardHTML = `
            <div class="device-card" data-device-id="${device.deviceId}">
                <div class="device-header" onclick="toggleDeviceDetails('${device.deviceId}')">
                    <span>${device.deviceName}</span>
                    <div class="device-stats">
                        <span class="stat">Pickups: ${device.totalPickups}</span>
                        <span class="stat">RFID: ${device.withRfid}</span>
                        ${percentageHTML}
                    </div>
                </div>
                <div class="device-details" id="device-${device.deviceId}">
                    <div class="device-summary">
                        <p><strong>Assigned to:</strong> ${device.responsiblePerson || 'Not assigned'}</p>
                        <p><strong>Registration:</strong> ${device.regOznaka || 'Not available'}</p>
                        <p><strong>Note:</strong> ${device.napomena || '-'}</p>
                    </div>
                    <h4>Pickups (${device.totalPickups})</h4>
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
    if (!pickups.length) return '<p>No pickups found.</p>';
    
    return pickups.map((pickup, index) => `
        <div class="pickup-item" onclick="showPickupDetails(${index}, '${pickup.deviceId}')">
            <p><strong>Time:</strong> ${pickup.dateTime}</p>
            <p><strong>RFID:</strong> ${pickup.rfid_value || 'None'}</p>
            <p><strong>Collection ID:</strong> ${pickup.collectionId || 'N/A'}</p>
            <p><strong>Facility Name:</strong> ${pickup.NazivObjekta || pickup.real_estate_name || '-'}</p>
            <p><strong>Facility Code:</strong> ${pickup.SifraObjekta || pickup.foreignId || '-'}</p>
        </div>
    `).join('');
}

// Show pickup details
function showPickupDetails(pickupIndex, deviceId) {
    const device = deviceSummaries.find(d => d.deviceId === deviceId);
    if (!device || !device.pickups[pickupIndex]) return;
    
    const pickup = device.pickups[pickupIndex];
    const pickupDetailsElement = document.getElementById('pickup-details');
    
    // Format details
    const detailsHTML = `
        <div class="pickup-detail">
            <h4>Pickup Details</h4>
            <div class="detail-row">
                <div class="detail-label">Date/Time:</div>
                <div class="detail-value">${pickup.dateTime || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Collection ID:</div>
                <div class="detail-value">${pickup.collectionId || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Device:</div>
                <div class="detail-value">${pickup.deviceName || 'Unknown'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Facility Name:</div>
                <div class="detail-value">${pickup.NazivObjekta || pickup.real_estate_name || '-'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Facility Code:</div>
                <div class="detail-value">${pickup.SifraObjekta || pickup.foreignId || '-'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">RFID Value:</div>
                <div class="detail-value">${pickup.rfid_value || 'None'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">RFID Type:</div>
                <div class="detail-value">${pickup.rfid_type || 'None'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Coordinates:</div>
                <div class="detail-value">${pickup.latitude && pickup.longitude ? `${pickup.latitude}, ${pickup.longitude}` : 'Not available'}</div>
            </div>
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
        alert('Please select a date');
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
                <h3>Error Loading Data</h3>
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
            console.log('User is authenticated');
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
        console.error('App initialization error:', error);
        document.getElementById('loading').innerHTML = `
            <div class="error-message">
                <h3>Application Error</h3>
                <p>${error.message}</p>
                <button onclick="window.location.reload()">Retry</button>
            </div>
        `;
    }
}

// Make functions available globally for onclick handlers
window.toggleDeviceDetails = toggleDeviceDetails;
window.showPickupDetails = showPickupDetails;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp); 
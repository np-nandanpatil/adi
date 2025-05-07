import { setLogLevel } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
setLogLevel('debug');

import { auth, db } from './firebase-config.js';
import { 
    collection, 
    doc, 
    getDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot,
    getDocs,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Initialize Chart.js with error handling
let dataChart;
let chartInitialized = false;
let firestoreListenerUnsubscribe = null; // Global variable for Firestore listener

// Global status element and update function
let statusElement = null;

function createStatusElement() {
    if (!document.getElementById('connectionStatus')) { // Check if element already exists by ID
        statusElement = document.createElement('div');
        statusElement.id = 'connectionStatus';
        statusElement.style.position = 'fixed';
        statusElement.style.top = '10px';
        statusElement.style.right = '10px';
        statusElement.style.padding = '8px 15px';
        statusElement.style.borderRadius = '4px';
        statusElement.style.zIndex = '1000';
        document.body.appendChild(statusElement);
    } else {
        statusElement = document.getElementById('connectionStatus'); // Assign existing element
    }
}

function updateConnectionStatus(status, message) {
    createStatusElement(); // Ensure element exists or is created
    if (!statusElement) return;
    
    const colors = {
        connected: '#4CAF50',
        disconnected: '#f44336',
        connecting: '#ff9800',
        error: '#f44336'
    };
    
    statusElement.style.backgroundColor = colors[status] || colors.error;
    statusElement.style.color = 'white';
    statusElement.textContent = message;
    
    if ((status === 'disconnected' || status === 'error') && typeof initializeDashboard === 'function') {
        statusElement.style.cursor = 'pointer';
        statusElement.title = 'Click to retry connection';
        // Ensure initializeDashboard is available in this scope or handle appropriately
        statusElement.onclick = () => initializeDashboard(); 
    } else {
        statusElement.style.cursor = 'default';
        statusElement.onclick = null;
    }
}


function initializeChart() {
    try {
        const ctx = document.getElementById('dataChart');
        if (!ctx) {
            console.error('Chart canvas element not found');
            return false;
        }
        
        dataChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#e74c3c',
                fill: false
            },
            {
                label: 'Humidity (%)',
                data: [],
                borderColor: '#3498db',
                fill: false
            },
            {
                label: 'Soil Moisture (%)',
                data: [],
                borderColor: '#2ecc71',
                fill: false
            }
        ]
    },
    options: {
        responsive: true,
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'hour'
                }
            },
            y: {
                beginAtZero: true
            }
        }
    }
});
        chartInitialized = true;
        return true;
    } catch (error) {
        console.error('Error initializing chart:', error);
        return false;
    }
}

// Update real-time data with error handling
function updateRealTimeData(data) {
    try {
        if (!data) {
            console.error('No data provided to updateRealTimeData');
            return;
        }
        
        const elements = {
            temperature: document.getElementById('temperature'),
            humidity: document.getElementById('humidity'),
            soilMoisture: document.getElementById('soilMoisture')
        };
        
        if (!Object.values(elements).every(el => el)) {
            console.error('One or more display elements not found');
            return;
        }
        
        elements.temperature.textContent = `${data.temperature ?? '--'}°C`;
        elements.humidity.textContent = `${data.humidity ?? '--'}%`;
        elements.soilMoisture.textContent = `${data.soilMoisture ?? '--'}%`;
    } catch (error) {
        console.error('Error updating real-time data:', error);
    }
}

// Update historical data chart
function updateChart(data) {
    try {
        if (!chartInitialized || !dataChart) {
            console.error('Chart not initialized');
            return;
        }
        
        if (!data || !data.timestamps || !data.temperatures || !data.humidities || !data.soilMoistures) {
            console.error('Invalid data format for chart update');
            return;
        }
        
        dataChart.data.labels = data.timestamps;
        dataChart.data.datasets[0].data = data.temperatures;
        dataChart.data.datasets[1].data = data.humidities;
        dataChart.data.datasets[2].data = data.soilMoistures;
        dataChart.update();
    } catch (error) {
        console.error('Error updating chart:', error);
    }
}

// Fetch historical data
async function fetchHistoricalData(range) {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.error('No authenticated user found');
            updateConnectionStatus('disconnected', 'Not authenticated');
            return;
        }

        const now = new Date();
        let startTime;
        switch (range) {
            case 'day':
                startTime = new Date(now - 24 * 60 * 60 * 1000);
                break;
            case 'week':
                startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startTime = new Date(now - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now - 24 * 60 * 60 * 1000);
        }

        const sensorQuery = query(
            collection(db, 'sensorData'),
            where('userId', '==', user.uid),
            where('timestamp', '>=', startTime),
            orderBy('timestamp', 'asc')
        );

        const snapshot = await getDocs(sensorQuery);

        if (snapshot.empty) {
            console.log('No historical data found for the specified range');
            updateChart({
                timestamps: [],
                temperatures: [],
                humidities: [],
                soilMoistures: []
            });
            return;
        }

        const data = {
            timestamps: [],
            temperatures: [],
            humidities: [],
            soilMoistures: []
        };

        snapshot.forEach(doc => {
            try {
                const sensorData = doc.data();
                if (!sensorData.timestamp || !sensorData.temperature || !sensorData.humidity || !sensorData.soilMoisture) {
                    console.warn('Incomplete sensor data found:', sensorData);
                    return;
                }
                data.timestamps.push(sensorData.timestamp.toDate());
                data.temperatures.push(sensorData.temperature);
                data.humidities.push(sensorData.humidity);
                data.soilMoistures.push(sensorData.soilMoisture);
            } catch (docError) {
                console.error('Error processing sensor data document:', docError);
            }
        });

        if (data.timestamps.length === 0) {
            console.warn('No valid data points found in the specified range');
        }

        updateChart(data);
    } catch (error) {
        console.error('Error fetching historical data:', error);
        if (error.code === 'permission-denied') {
            updateConnectionStatus('disconnected', 'Access denied');
        } else if (error.code === 'unavailable') {
            updateConnectionStatus('disconnected', 'Service unavailable');
        } else {
            updateConnectionStatus('disconnected', 'Error fetching data');
        }
    }
}

// System setup request handling
const setupModal = document.getElementById('setupModal');
const requestSetupBtn = document.getElementById('requestSetupBtn');
const closeModal = document.getElementById('closeModal');
const setupForm = document.getElementById('setupForm');

if (requestSetupBtn) {
    requestSetupBtn.addEventListener('click', () => {
        setupModal.style.display = 'block';
    });
}

if (closeModal) {
    closeModal.addEventListener('click', () => {
        setupModal.style.display = 'none';
    });
}

if (setupForm) {
    setupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const user = auth.currentUser;
        if (!user) return;

        const address = document.getElementById('address').value;
        const preferredDate = document.getElementById('preferredDate').value;
        const notes = document.getElementById('notes').value;

        try {
            await addDoc(collection(db, 'setupRequests'), {
                userId: user.uid,
                address: address,
                preferredDate: preferredDate,
                notes: notes,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            alert('Setup request submitted successfully!');
            setupModal.style.display = 'none';
            setupForm.reset();
        } catch (error) {
            alert('Error submitting setup request: ' + error.message);
        }
    });
}

// Time range buttons
const timeRangeButtons = document.querySelectorAll('.time-range button');
timeRangeButtons.forEach(button => {
    button.addEventListener('click', () => {
        timeRangeButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        fetchHistoricalData(button.dataset.range);
    });
});

// Initialize dashboard with comprehensive error handling and connection management
async function initializeDashboard(retryCount = 0) {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 3000; // 3 seconds
    const BACKOFF_MULTIPLIER = 1.5; // Exponential backoff
    // Initialize Chart.js
    if (!chartInitialized && !initializeChart()) {
        return;
    }
    
    createStatusElement(); // Ensure status element is created

    try {
        const user = auth.currentUser;
        if (!user) {
            updateConnectionStatus('disconnected', 'Not authenticated');
            console.warn('No authenticated user found');
            if (retryCount < MAX_RETRIES) {
                const nextDelay = RETRY_DELAY * Math.pow(BACKOFF_MULTIPLIER, retryCount);
                console.log(`Retrying initialization (${retryCount + 1}/${MAX_RETRIES}) in ${nextDelay/1000}s...`);
                setTimeout(() => initializeDashboard(retryCount + 1), nextDelay);
            } else {
                console.error('Authentication failed after maximum retries');
                alert('Unable to authenticate. Please try logging in again.');
                window.location.href = 'login.html';
            }
            return;
        }

        // Get user data
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
            updateConnectionStatus('disconnected', 'User data not found');
            console.error('User document not found');
            return;
        }

        const userData = userDoc.data();
        document.getElementById('userName').textContent = userData.name;

        // Set up real-time listener for sensor data with enhanced error handling
        const sensorQuery = query(
            collection(db, 'sensorData'),
            where('userId', '==', user.uid),
            orderBy('timestamp', 'desc'),
            limit(1)
        );

        let isFirstConnection = true;
        updateConnectionStatus('connecting', 'Establishing connection...');
        
        // Clean up existing listener if any
        if (firestoreListenerUnsubscribe) {
            firestoreListenerUnsubscribe();
            firestoreListenerUnsubscribe = null;
        }
        
        firestoreListenerUnsubscribe = onSnapshot(sensorQuery, 
            snapshot => {
                if (isFirstConnection) {
                    updateConnectionStatus('connected', 'Connected');
                    isFirstConnection = false;
                }
                if (!snapshot.empty) {
                    const data = snapshot.docs[0].data();
                    updateRealTimeData(data);
                }
            },
            error => {
                console.error('Error in real-time sensor data listener:', error);
                updateConnectionStatus('disconnected', 'Connection error');

                if (error.code === 'permission-denied') {
                    console.error('Firestore permission denied. Please check security rules.');
                    updateConnectionStatus('disconnected', 'Access denied');
                    alert('Access denied. Please ensure you have proper permissions.');
                    return;
                }

                if (error.code === 'unavailable' || error.code === 'resource-exhausted') {
                    updateConnectionStatus('disconnected', 'Server unavailable');
                }

                if (retryCount < MAX_RETRIES) {
                    const nextDelay = RETRY_DELAY * Math.pow(BACKOFF_MULTIPLIER, retryCount);
                    console.log(`Retrying real-time connection (${retryCount + 1}/${MAX_RETRIES}) in ${nextDelay/1000}s...`);
                    updateConnectionStatus('disconnected', `Reconnecting in ${Math.ceil(nextDelay/1000)}s...`);
                    setTimeout(() => {
                        if (firestoreListenerUnsubscribe) {
                            firestoreListenerUnsubscribe(); // Clean up existing listener
                            firestoreListenerUnsubscribe = null;
                        }
                        initializeDashboard(retryCount + 1);
                    }, nextDelay);
                } else {
                    updateConnectionStatus('disconnected', 'Connection failed');
                    alert('Unable to establish real-time connection. Please check your internet connection and refresh the page.');
                }
            }
        );

        // Load initial historical data
        fetchHistoricalData('day');
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        updateConnectionStatus('error', 'Dashboard init error'); // Now accessible
    }
}

// Initialize dashboard when auth state changes with cleanup
let dashboardInitialized = false;

auth.onAuthStateChanged((user) => {
    if (user && !dashboardInitialized) {
        dashboardInitialized = true;
        initializeDashboard();
    } else if (!user) {
        dashboardInitialized = false;
        if (firestoreListenerUnsubscribe) {
            firestoreListenerUnsubscribe();
            firestoreListenerUnsubscribe = null;
        }
        if (dataChart) {
            dataChart.destroy();
            dataChart = null;
            chartInitialized = false;
        }
        updateConnectionStatus('disconnected', 'Not authenticated'); // This call should now work
    }
});

// Cleanup on page unload
window.addEventListener('unload', () => {
    if (firestoreListenerUnsubscribe) {
        firestoreListenerUnsubscribe();
        firestoreListenerUnsubscribe = null;
    }
    if (dataChart) {
        dataChart.destroy();
    }
});
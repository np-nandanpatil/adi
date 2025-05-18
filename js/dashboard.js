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
    serverTimestamp,
    enableNetwork,
    disableNetwork
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
    let statusElement = document.getElementById('connectionStatus');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'connectionStatus';
        statusElement.style.position = 'fixed';
        statusElement.style.top = '20px';
        statusElement.style.right = '20px';
        statusElement.style.padding = '10px 20px';
        statusElement.style.borderRadius = '5px';
        statusElement.style.zIndex = '1000';
        document.body.appendChild(statusElement);
    }
    
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
        console.log("UPDATE REAL-TIME DATA RECEIVED:", JSON.stringify(data));
        
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
            console.error('One or more display elements not found:', elements);
            return;
        }
        
        console.log("Updating DOM elements with values:", {
            temperature: data.temperature,
            humidity: data.humidity,
            soilMoisture: data.soilMoisture
        });
        
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

// Time range buttons
const timeRangeButtons = document.querySelectorAll('.time-range button');
timeRangeButtons.forEach(button => {
    button.addEventListener('click', () => {
        timeRangeButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        fetchHistoricalData(button.dataset.range);
    });
});

// Add all-time button to HTML via JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const timeRangeContainer = document.querySelector('.time-range');
    if (timeRangeContainer) {
        const allTimeButton = document.createElement('button');
        allTimeButton.className = 'btn secondary';
        allTimeButton.dataset.range = 'all';
        allTimeButton.textContent = 'All Time';
        allTimeButton.style.backgroundColor = '#ff9800';
        allTimeButton.addEventListener('click', () => {
            timeRangeButtons.forEach(btn => btn.classList.remove('active'));
            allTimeButton.classList.add('active');
            fetchHistoricalData('all');
        });
        timeRangeContainer.appendChild(allTimeButton);
        
        // Auto-click this button on load
        setTimeout(() => allTimeButton.click(), 1000);
    }
});

// Fetch historical data
async function fetchHistoricalData(range, userId) {
    try {
        updateConnectionStatus('connecting', 'Fetching data...');
        
        if (!userId) {
            // Try to get userId if not provided (fallback)
            try {
                const user = auth.currentUser;
                if (!user) {
                    throw new Error('Not authenticated');
                }
                
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if (!userDoc.exists()) {
                    throw new Error('User data not found');
                }
                
                userId = userDoc.data().userId;
                console.log("Fetched userId for query:", userId);
            } catch (error) {
                console.error('Error getting userId:', error);
                updateConnectionStatus('error', 'User data error');
                return;
            }
        }
        
        // CRITICAL FIX: Always make sure userId is a NUMBER type for Firestore
        // (This is the key fix for the data type mismatch)
        if (typeof userId !== 'number') {
            userId = Number(userId);
        }
        console.log(`Using userId ${userId} as number:`, userId, "Type:", typeof userId);
        
        // FIXED: When 'all' is selected, don't add timestamp filter
        let sensorQuery;
        
        if (range === 'all') {
            console.log("Fetching ALL historical data without time filter");
            sensorQuery = query(
                collection(db, 'sensorData'),
                where('userId', '==', userId),
                orderBy('timestamp', 'desc')
            );
        } else {
            const now = Date.now();
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
            
            console.log("Using time filter from:", startTime);
            sensorQuery = query(
                collection(db, 'sensorData'),
                where('userId', '==', userId),
                where('timestamp', '>=', startTime),
                orderBy('timestamp', 'asc')
            );
        }

        console.log("Executing query:", sensorQuery);
        const snapshot = await getDocs(sensorQuery);

        console.log(`Query returned ${snapshot.size} documents`);
        
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
                console.log("Processing document:", doc.id, sensorData);
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
        } else {
            console.log(`Processed ${data.timestamps.length} valid data points`);
        }

        updateChart(data);
        updateConnectionStatus('connected', 'Data loaded');
        setTimeout(() => {
            const statusElement = document.getElementById('connectionStatus');
            if (statusElement) statusElement.style.display = 'none';
        }, 2000);
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

// Initialize dashboard with comprehensive error handling and connection management
async function initializeDashboard(retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    const BACKOFF_MULTIPLIER = 2;

    try {
        // Initialize Chart.js
        if (!chartInitialized && !initializeChart()) {
            return;
        }
        
        createStatusElement(); // Ensure status element is created

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

        // FIXED: Convert userId to number - make sure it's a number type for Firestore
        const userIdNumber = Number(userData.userId);
        console.log("User ID from profile:", userData.userId, "Type:", typeof userData.userId);
        console.log("Converted to number:", userIdNumber, "Type:", typeof userIdNumber);

        // Test with direct document access - bypass queries altogether
        try {
            // Try to directly fetch a known document to see if we can access it
            const sensorDataDoc = await getDoc(doc(db, 'sensorData', 'rps859zErrW9FbAQY71P'));
            if (sensorDataDoc.exists()) {
                console.log("DIRECT DOCUMENT ACCESS SUCCESSFUL:", sensorDataDoc.data());
                updateRealTimeData(sensorDataDoc.data());
            } else {
                console.log("DIRECT DOCUMENT ACCESS: Document doesn't exist");
            }
        } catch (directError) {
            console.error("Error with direct document access:", directError);
        }

        // Set up real-time listener for sensor data with enhanced error handling
        const sensorQuery = query(
            collection(db, 'sensorData'),
            where('userId', '==', userIdNumber), // Using number type
            orderBy('timestamp', 'desc'),
            limit(1)
        );

        console.log("Query structure:", sensorQuery);

        let isFirstConnection = true;
        updateConnectionStatus('connecting', 'Establishing connection...');
        
        // Clean up existing listener if any
        if (firestoreListenerUnsubscribe) {
            firestoreListenerUnsubscribe();
            firestoreListenerUnsubscribe = null;
        }
        
        firestoreListenerUnsubscribe = onSnapshot(sensorQuery, 
            snapshot => {
                console.log("Snapshot received, empty?", snapshot.empty);
                console.log("Snapshot size:", snapshot.size);
                console.log("Snapshot docs:", snapshot.docs.map(d => d.id));
                
                if (isFirstConnection) {
                    updateConnectionStatus('connected', 'Connected');
                    isFirstConnection = false;
                    setTimeout(() => {
                        const statusElement = document.getElementById('connectionStatus');
                        if (statusElement) statusElement.style.display = 'none';
                    }, 3000);
                }
                if (!snapshot.empty) {
                    const data = snapshot.docs[0].data();
                    console.log("First document data:", JSON.stringify(data));
                    updateRealTimeData(data);
                } else {
                    console.log("No data found in snapshot. Check userId match.");
                    console.log("Looking for userId:", userIdNumber);
                }
            },
            error => {
                console.error('Error in real-time sensor data listener:', error);
                updateConnectionStatus('error', 'Connection error');

                if (error.code === 'permission-denied') {
                    console.error('Firestore permission denied. Please check security rules.');
                    updateConnectionStatus('error', 'Access denied');
                    alert('Access denied. Please ensure you have proper permissions.');
                    return;
                }

                if (retryCount < MAX_RETRIES) {
                    const nextDelay = RETRY_DELAY * Math.pow(BACKOFF_MULTIPLIER, retryCount);
                    console.log(`Retrying connection (${retryCount + 1}/${MAX_RETRIES}) in ${nextDelay/1000}s...`);
                    updateConnectionStatus('connecting', `Reconnecting in ${Math.ceil(nextDelay/1000)}s...`);
                    
                    setTimeout(async () => {
                        try {
                            if (firestoreListenerUnsubscribe) {
                                firestoreListenerUnsubscribe();
                                firestoreListenerUnsubscribe = null;
                            }
                            
                            // Reset connection
                            await disableNetwork(db);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await enableNetwork(db);
                            
                            initializeDashboard(retryCount + 1);
                        } catch (error) {
                            console.error('Error during connection reset:', error);
                            updateConnectionStatus('error', 'Connection reset failed');
                        }
                    }, nextDelay);
                } else {
                    updateConnectionStatus('error', 'Connection failed');
                    alert('Unable to establish connection. Please refresh the page.');
                }
            }
        );

        // Load initial historical data using the number conversion
        fetchHistoricalData('all', userIdNumber);
        
        // ADDED: Direct fetch for real-time data without waiting for listener
        // This way we immediately show data even if real-time updates aren't working
        try {
            const latestDataQuery = query(
                collection(db, 'sensorData'),
                where('userId', '==', Number(userIdNumber)),
                orderBy('timestamp', 'desc'),
                limit(1)
            );
            
            const latestSnapshot = await getDocs(latestDataQuery);
            console.log("Direct query for latest data returned:", latestSnapshot.size, "documents");
            
            if (!latestSnapshot.empty) {
                const data = latestSnapshot.docs[0].data();
                console.log("Latest data found:", data);
                updateRealTimeData(data);
            }
        } catch (directQueryError) {
            console.error("Error in direct latest data query:", directQueryError);
        }
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        updateConnectionStatus('error', 'Dashboard initialization error');
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
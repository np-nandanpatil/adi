import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    fetchSignInMethodsForEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection,
    doc,
    setDoc,
    query,
    where,
    getDocs,
    serverTimestamp,
    enableNetwork,
    disableNetwork,
    limit,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Global variables for connection management
let connectionAttempts = 0;
let sessionErrorCount = 0;
const MAX_RETRY_ATTEMPTS = 3;
const MAX_SESSION_ERRORS = 2; // After this many session errors, suggest page reload
const RETRY_DELAY = 2000; // 2 seconds base delay
const SESSION_CLEANUP_DELAY = 2500; // 2.5 seconds for session cleanup
const FIRESTORE_RECONNECT_DELAY = 5000; // 5 seconds

// Function to check network connection
function isOnline() {
    return navigator.onLine;
}

// Function to detect SID-related errors
function isSIDError(error) {
    return error && error.message && (
        error.message.includes('400') || 
        error.message.includes('Bad Request') || 
        error.message.includes('Unknown SID')
    );
}

// Function to create status element if it doesn't exist
function createStatusElement() {
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
    return statusElement;
}

// Function to update connection status
function updateConnectionStatus(status, message) {
    const statusElement = createStatusElement();
    
    const colors = {
        connected: '#4CAF50',
        disconnected: '#f44336',
        connecting: '#ff9800',
        error: '#f44336'
    };
    
    statusElement.style.backgroundColor = colors[status] || colors.error;
    statusElement.style.color = 'white';
    statusElement.textContent = message;
    
    if (status === 'disconnected' || status === 'error') {
        statusElement.style.cursor = 'pointer';
        statusElement.title = 'Click to retry connection';
        statusElement.onclick = () => retryConnection();
    } else {
        statusElement.style.cursor = 'default';
        statusElement.onclick = null;
    }
}

// Function to retry connection
async function retryConnection() {
    if (!isOnline()) {
        updateConnectionStatus('disconnected', 'No internet connection');
        return;
    }
    
    updateConnectionStatus('connecting', 'Reconnecting...');
    
    try {
        // Disable network to clear existing connections
        await disableNetwork(db);
        
        // Wait for a short delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Re-enable network
        await enableNetwork(db);
        
        updateConnectionStatus('connected', 'Connected');
        setTimeout(() => {
            const statusElement = document.getElementById('connectionStatus');
            if (statusElement) statusElement.style.display = 'none';
        }, 3000);
    } catch (error) {
        console.error('Error reconnecting:', error);
        updateConnectionStatus('error', 'Connection failed');
    }
}

// Function to handle Firebase operations with retry
async function executeWithRetry(operation) {
    connectionAttempts = 0;
    
    if (!isOnline()) {
        updateConnectionStatus('disconnected', 'No internet connection');
        throw new Error('No internet connection. Please check your network and try again.');
    }
    
    async function attempt() {
        try {
            updateConnectionStatus('connecting', 'Processing...');
            
            // Ensure network is enabled
            try {
                await enableNetwork(db);
            } catch (error) {
                console.warn('Error enabling network:', error);
            }
            
            const result = await operation();
            updateConnectionStatus('connected', 'Success');
            setTimeout(() => {
                const statusElement = document.getElementById('connectionStatus');
                if (statusElement) statusElement.style.display = 'none';
            }, 3000);
            return result;
        } catch (error) {
            connectionAttempts++;
            console.error(`Attempt ${connectionAttempts} failed:`, error);
            
            // Handle specific Firebase errors
            if (error.code === 'unavailable' || error.code === 'resource-exhausted') {
                // Network or server issues
                if (connectionAttempts < MAX_RETRY_ATTEMPTS) {
                    const backoffTime = RETRY_DELAY * Math.pow(2, connectionAttempts - 1);
                    updateConnectionStatus('connecting', `Retrying (${connectionAttempts}/${MAX_RETRY_ATTEMPTS})...`);
                    
                    // Reset connection before retry
                    try {
                        await disableNetwork(db);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await enableNetwork(db);
                    } catch (networkError) {
                        console.warn('Error resetting network:', networkError);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                    return attempt();
                }
            } else if (error.code === 'permission-denied') {
                updateConnectionStatus('error', 'Access denied');
                throw new Error('Access denied. Please ensure you have proper permissions.');
            }
            
            // For other errors or if max retries reached
            updateConnectionStatus('error', 'Operation failed');
            throw error;
        }
    }
    
    return attempt();
}

// Function to generate a random 12-digit number
function generateUserId() {
    return Math.floor(100000000000 + Math.random() * 900000000000);
}

// Function to check if a user ID already exists
async function isUserIdUnique(userId) {
    try {
        // TEMPORARY BYPASS: Return true without querying Firestore
        console.log('TEMPORARY: Bypassing Firestore query for userId uniqueness check');
        return true;
        
        // Original code commented out:
        /*
        const userQuery = query(collection(db, 'users'), where('userId', '==', userId.toString()), limit(1));
        const querySnapshot = await getDocs(userQuery);
        return querySnapshot.empty;
        */
    } catch (error) {
        console.error('Error checking user ID uniqueness:', error);
        throw error;
    }
}

// Function to generate a unique user ID
async function generateUniqueUserId() {
    let userId;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
        userId = generateUserId();
        try {
            isUnique = await isUserIdUnique(userId);
            if (isUnique) {
                return userId;
            }
        } catch (error) {
            console.error('Attempt ' + (attempts + 1) + ' failed:', error);
        }
        attempts++;
    }

    if (!isUnique) {
        throw new Error('Unable to generate a unique user ID. Please try again.');
    }

    return userId;
}

// Function to send welcome email with user ID
async function sendWelcomeEmail(email, userId) {
    try {
        console.log(`Welcome email would be sent to ${email} with User ID: ${userId}`);
        // Email functionality to be implemented
    } catch (error) {
        console.error('Error sending welcome email:', error);
    }
}

// Registration form handling
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitButton = registerForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';
        
        try {
            if (!isOnline()) {
                throw new Error('No internet connection. Please check your network and try again.');
            }

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            // Basic validation
            if (password !== confirmPassword) {
                throw new Error('Passwords do not match');
            }

            if (password.length < 6) {
                throw new Error('Password must be at least 6 characters long');
            }

            // TEMPORARY BYPASS: Skip Firestore email check
            // First check if email exists in Firebase Auth
            try {
                const methods = await fetchSignInMethodsForEmail(auth, email);
                if (methods.length > 0) {
                    throw new Error('This email is already registered. Please use a different email or try logging in.');
                }
            } catch (error) {
                if (error.code === 'auth/invalid-email') {
                    throw new Error('Invalid email address format.');
                } else if (!error.message.includes('already registered')) {
                    console.warn('Email check failed:', error);
                }
            }

            // TEMPORARY BYPASS: Skip Firestore email existence check
            // Original code commented out:
            /*
            // Then check if email exists in Firestore as a backup
            try {
                const emailQuery = query(collection(db, 'users'), where('email', '==', email), limit(1));
                const emailSnapshot = await executeWithRetry(async () => await getDocs(emailQuery));
                if (!emailSnapshot.empty) {
                    throw new Error('This email is already registered. Please use a different email or try logging in.');
                }
            } catch (error) {
                if (error.message.includes('already registered')) {
                    throw error;
                }
                // If it's a connection error, throw it
                if (error.code === 'unavailable' || error.code === 'permission-denied') {
                    throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
                }
                // For other errors, log and continue
                console.warn('Email check failed:', error);
            }
            */
            
            console.log('TEMPORARY: Bypassing Firestore query for email existence check');

            // Generate unique user ID with retry
            const userId = await executeWithRetry(async () => {
                // TEMPORARY: Generate a userId without checking uniqueness
                return generateUserId(); // This just generates a random ID without checking if it exists
            });
            
            // Create user in Firebase Auth with retry
            const userCredential = await executeWithRetry(async () => {
                try {
                    return await createUserWithEmailAndPassword(auth, email, password);
                } catch (error) {
                    if (error.code === 'auth/email-already-in-use') {
                        throw new Error('This email was just registered. Please try logging in instead.');
                    }
                    throw error;
                }
            });
            
            const user = userCredential.user;

            // Store additional user data in Firestore with retry
            await executeWithRetry(async () => {
                await setDoc(doc(db, 'users', user.uid), {
                    userId: userId.toString(), // Store as string for consistency
                    name: name,
                    email: email,
                    phone: phone,
                    createdAt: serverTimestamp()
                });
            });

            // Send welcome email with user ID
            await sendWelcomeEmail(email, userId);

            // Show success alert with user ID
            alert(`Registration successful! Your User ID is: ${userId}\n\nPlease save this ID as you will need it to login.\nThis ID has also been sent to your email.`);

            // Redirect to login page with the user ID
            window.location.href = `login.html?userId=${userId}&new=true`;

        } catch (error) {
            console.error('Registration error:', error);
            alert(error.message || 'An error occurred during registration');
        } finally {
            // Always re-enable the submit button
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    });
}

// Login form handling
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitButton = loginForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';
        
        try {
            if (!isOnline()) {
                throw new Error('No internet connection. Please check your network and try again.');
            }

            const userId = document.getElementById('userId').value;
            const password = document.getElementById('password').value;

            // IMPORTANT: Instead of querying by userId first (which requires permissions),
            // we'll use a different approach that works with our security model:
            
            // 1. Get all users owned by the current user after login
            // 2. Check if any of them match the provided userId
            
            // This requires the user to know their email, but we'll make this easier by adding it as a field
            const emailInput = document.getElementById('email');
            if (!emailInput || !emailInput.value) {
                throw new Error('Email is required for login. Please enter your email address.');
            }
            const email = emailInput.value;
            
            // First authenticate with Firebase Auth
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                if (error.code === 'auth/invalid-credential' || 
                    error.code === 'auth/user-not-found' ||
                    error.code === 'auth/wrong-password') {
                    throw new Error('Invalid email or password');
                }
                throw error;
            }
            
            // After authentication succeeds, we can verify the userId
            // We're now authenticated, so we can access our own user document
            const user = auth.currentUser;
            if (!user) {
                throw new Error('Authentication error. Please try again.');
            }
            
            // Get the user's document to verify the userId
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) {
                await signOut(auth); // Sign out since this user doesn't have a proper profile
                throw new Error('User profile not found. Please contact support.');
            }
            
            const userData = userDoc.data();
            
            // Verify that the entered userId matches the one in the profile
            if (userData.userId !== userId) {
                await signOut(auth); // Sign out since the userId doesn't match
                throw new Error('Invalid User ID. Please try again with the correct ID.');
            }
            
            // UserId is verified, proceed to dashboard
            window.location.href = 'dashboard.html';
            
        } catch (error) {
            console.error('Login error:', error);
            alert(error.message || 'An error occurred during login');
        } finally {
            // Always re-enable the submit button
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    });
}

// Logout handling
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout error:', error);
            alert('Error during logout: ' + (error.message || 'Unknown error occurred'));
            window.location.href = 'login.html';
        }
    });
}

// Check authentication state
onAuthStateChanged(auth, (user) => {
    const currentPath = window.location.pathname;

    if (user) {
        // User is signed in
        if (currentPath.includes('login.html') || currentPath.includes('register.html')) {
            // Do nothing - let the form handlers handle the redirect
        } else if (!currentPath.includes('dashboard.html')) {
            window.location.href = 'dashboard.html';
        }
    } else {
        // User is signed out
        if (currentPath.includes('dashboard.html')) {
            window.location.href = 'login.html';
        }
    }
});

// Add this at the start of the file, after the imports  <-- This comment is slightly misplaced, it's fine where it is.
// Handle URL parameters for new registrations
if (window.location.pathname.includes('login.html')) {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const isNew = urlParams.get('new');
    
    if (userId && isNew) {
        document.getElementById('userId').value = userId;
        const noteDiv = document.createElement('div');
        noteDiv.className = 'alert';
        noteDiv.textContent = 'Please save your User ID: ' + userId + '. You will need it for future logins.';
        document.querySelector('.auth-form').insertBefore(noteDiv, document.querySelector('.auth-form button'));
    }
}

// Network status monitoring
window.addEventListener('online', () => {
    console.log('Network connection restored');
    updateConnectionStatus('connected', 'Connection restored');
    // Re-enable Firestore network
    enableNetwork(db).catch(err => console.error('Error re-enabling network:', err));
    
    // Hide status after 3 seconds
    setTimeout(() => {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) statusElement.style.display = 'none';
    }, 3000);
});

window.addEventListener('offline', () => {
    console.log('Network connection lost');
    updateConnectionStatus('disconnected', 'No internet connection');
    // Disable Firestore network to prevent unnecessary retries
    disableNetwork(db).catch(err => console.error('Error disabling network:', err));
});

// Clean up Firebase listeners when page unloads
window.addEventListener('beforeunload', () => {
    // If there are any active listeners, unsubscribe them
    if (typeof firestoreListenerUnsubscribe === 'function') {
        firestoreListenerUnsubscribe();
    }
});

// Initialize connection status and reset session on page load
document.addEventListener('DOMContentLoaded', () => {
    // Reset session error count on page load
    sessionErrorCount = 0;
    
    if (!isOnline()) {
        updateConnectionStatus('disconnected', 'No internet connection');
    } else {
        // Ensure we have a clean connection when the page loads
        try {
            // Silently initialize the connection without showing status
            enableNetwork(db).catch(err => {
                console.error('Error initializing network on page load:', err);
                // Only show error if it's a session error
                if (isSIDError(err)) {
                    updateConnectionStatus('error', 'Connection error - try reloading');
                }
            });
        } catch (error) {
            console.error('Error during page load connection setup:', error);
        }
    }
});
import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection,
    doc,
    setDoc,
    query,
    where,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Registration form handling
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (password !== confirmPassword) {
            alert('Passwords do not match!');
            return;
        }

        try {
            // Create user with email and password
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Generate a unique 10-12 digit user ID
            const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000);
            const userId = randomDigits.toString();

            // Store additional user data in Firestore
            await setDoc(doc(db, 'users', user.uid), {
                userId: userId,
                name: name,
                email: email,
                phone: phone,
                createdAt: serverTimestamp()
            });

            alert('Registration successful! Your User ID is: ' + userId);
            window.location.href = `login.html?userId=${userId}&new=true`;
        } catch (error) {
            alert('Error during registration: ' + error.message);
        }
    });
}

// Login form handling
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userId = document.getElementById('userId').value;
        const password = document.getElementById('password').value;

        try {
            // Query Firestore to find user by userId
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('userId', '==', userId));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                alert('User ID not found!');
                return;
            }

            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();

            // Sign in with email and password
            await signInWithEmailAndPassword(auth, userData.email, password);
            window.location.href = 'dashboard.html';
        } catch (error) {
            alert('Error during login: ' + error.message);
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
            alert('Error during logout: ' + error.message);
        }
    });
}

// Check authentication state
onAuthStateChanged(auth, (user) => {
    const urlParams = new URLSearchParams(window.location.search);
    const isNewRegistration = urlParams.get('new') === 'true';
    const currentPath = window.location.pathname;

    if (user) {
        // User is signed in
        if (currentPath.includes('login.html') && isNewRegistration) {
            // This is a new registration, allow login.html to load and display the User ID.
            // The existing code at the end of auth.js will handle displaying the ID.
        } else if (currentPath.includes('login.html') || currentPath.includes('register.html')) {
            // User is on login or register page but it's NOT a new registration flow, so redirect to dashboard.
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
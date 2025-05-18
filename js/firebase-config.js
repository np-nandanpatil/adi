// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC0vemzXZxu05Nc-B65-EvjDmb1uxGX30U",
    authDomain: "adirk-b2471.firebaseapp.com",
    projectId: "adirk-b2471",
    storageBucket: "adirk-b2471.appspot.com",
    messagingSenderId: "446142236645",
    appId: "1:446142236645:web:b02aa8bcc0ed70dbdf510c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);

// Export the Firebase instances
export { auth, db }; 
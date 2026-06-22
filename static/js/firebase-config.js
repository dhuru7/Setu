import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Firebase Configuration - DO NOT COMMIT THIS FILE
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCnYn--IBcrm1Wpuz5h1nkURCEtPyYHcQI",
    authDomain: "setu-9cb94.firebaseapp.com",
    projectId: "setu-9cb94",
    storageBucket: "setu-9cb94.firebasestorage.app",
    messagingSenderId: "255854071148",
    appId: "1:255854071148:web:5a195b0f22a5074d69f749",
    measurementId: "G-3YNVBDKFFB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
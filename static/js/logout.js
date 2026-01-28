import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

console.log("Logout script loaded");

// --- PASTE YOUR FIREBASE KEYS HERE ---
const firebaseConfig = {
    apiKey: "AIzaSyB7uvvN3Xlo64pKCkJwfjGXtdqHuHIG0mI",
    authDomain: "setu-6932f.firebaseapp.com",
    projectId: "setu-6932f",
    storageBucket: "setu-6932f.firebasestorage.app",
    messagingSenderId: "1060012410845",
    appId: "1:1060012410845:web:13da8942457a2d4ed89834"
};

// Prevent duplicate initialization error
let app;
if (getApps().length > 0) {
    app = getApp();
} else {
    app = initializeApp(firebaseConfig);
}

const auth = getAuth(app);

// Event Delegation for dynamically added settings panel
function attachLogoutListener() {
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('#logout-btn-settings');
        if (!btn) return;

        // Prevent default if it's a link (button shouldn't need it but good practice)
        e.preventDefault();
        console.log("Logout button clicked");

        await window.handleLogout();
    });
}

// Global handler that can be called via onclick="window.handleLogout()"
window.handleLogout = async function () {
    console.log("handleLogout called");
    try {
        if (!auth) {
            console.error("Auth not initialized, forcing local cleanup");
            // Force cleanup anyway
            localStorage.removeItem('userProfile');
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('userType');
            window.location.href = "login.html";
            return;
        }

        // 1. Tell Firebase to close the session
        await signOut(auth);

        // 2. Clear our local memory
        localStorage.removeItem('userProfile');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userType');

        // 3. Kick user to Login page
        window.location.href = "login.html";

    } catch (error) {
        console.error("Logout Error:", error);
        // Fallback: Force logout on error
        localStorage.removeItem('userProfile');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userType');
        window.location.href = "login.html";
    }
}

attachLogoutListener();
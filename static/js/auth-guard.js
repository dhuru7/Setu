// js/auth-guard.js
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// OPTIMIZATION: Check LocalStorage immediately for fast redirect
// This prevents the "flash" of index page before firebase loads
if (localStorage.getItem('isLoggedIn') !== 'true') {
    // Save current URL to redirect back after login if needed (optional, but good practice)
    // For now, just instant redirect
    window.location.href = "login.html";
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User is logged in:", user.email);
        localStorage.setItem('isLoggedIn', 'true');
    } else {
        console.log("No user found. Redirecting to Login...");
        localStorage.removeItem('isLoggedIn');
        window.location.href = "login.html";
    }
});
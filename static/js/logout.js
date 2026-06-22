import { auth } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


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
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// --- PASTE YOUR FIREBASE KEYS HERE ---
const firebaseConfig = {
    apiKey: "AIzaSyB7uvvN3Xlo64pKCkJwfjGXtdqHuHIG0mI",
    authDomain: "setu-6932f.firebaseapp.com",
    projectId: "setu-6932f",
    storageBucket: "setu-6932f.firebasestorage.app",
    messagingSenderId: "1060012410845",
    appId: "1:1060012410845:web:13da8942457a2d4ed89834"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- UI LOGIC ---
const theme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', theme);

const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
// Re-grabbing elements to be sure
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const themeToggles = document.querySelectorAll('.theme-toggle');
const logoText = document.querySelector('#animated-name');
const animatedName = document.getElementById('animated-name');

// 1. Mobile Menu Toggle
if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('open');
        mobileMenuBtn.classList.toggle('open');
    });
}

// 2. Theme Toggle Logic
function setTheme(isDark) {
    const newTheme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcons(newTheme);
}

function updateThemeIcons(theme) {
    const isDark = theme === 'dark';
    document.querySelectorAll('.sun-icon').forEach(icon => icon.classList.toggle('hidden', isDark));
    document.querySelectorAll('.moon-icon').forEach(icon => icon.classList.toggle('hidden', !isDark));
}

// Initialize Theme Icons
updateThemeIcons(theme);

themeToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        setTheme(!isDark);
    });
});

// 3. Language Selector Logic
const languages = {
    'en': 'English',
    'hi': 'Hindi',
    'bn': 'Bengali',
    'te': 'Telugu',
    'mr': 'Marathi',
    'ta': 'Tamil',
    'ur': 'Urdu',
    'gu': 'Gujarati',
    'kn': 'Kannada',
    'ml': 'Malayalam',
    'pa': 'Punjabi',
    'or': 'Odia',
    'as': 'Assamese',
    'ne': 'Nepali'
};

const currentLang = localStorage.getItem('google_translate_pre_selected_lang') || 'en';

function populateLanguageDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    dropdown.innerHTML = '';
    Object.keys(languages).forEach(code => {
        const item = document.createElement('a');
        item.className = 'dropdown-item';
        item.innerText = languages[code];
        item.addEventListener('click', () => changeLanguage(code));
        dropdown.appendChild(item);
    });
}

function changeLanguage(code) {
    localStorage.setItem('google_translate_pre_selected_lang', code);

    // Update UI text
    const langName = languages[code];
    document.querySelectorAll('.language-text').forEach(el => el.innerText = langName);
    document.querySelectorAll('.language-indicator').forEach(el => el.innerText = code.toUpperCase());

    // Trigger Google Translate
    const select = document.querySelector('.goog-te-combo');
    if (select) {
        select.value = code;
        select.dispatchEvent(new Event('change'));
    }

    // Close Dropdowns
    document.querySelectorAll('.dropdown-content').forEach(el => el.classList.remove('show'));
}

// Initialize Language Dropdowns
populateLanguageDropdown('language-dropdown');
populateLanguageDropdown('mobile-language-dropdown');

// Toggle Dropdown Visibility
const langBtn = document.getElementById('language-btn');
const mobileLangBtn = document.getElementById('mobile-language-btn');

[langBtn, mobileLangBtn].forEach(btn => {
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = btn.nextElementSibling;
            dropdown.classList.toggle('show');
        });
    }
});

// Close dropdown on outside click
window.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-content').forEach(el => el.classList.remove('show'));
});

// 3. Logo Animation (Renumbered to 4)
// 3. Logo Animation
// Using the same cycling animation as in signup.js
if (animatedName) {
    const names = ['Setu', 'सेतु', 'সেতু', 'सेतू', 'સેતુ', 'ಸೇತು'];
    let currentIndex = 0;

    setInterval(() => {
        // Add fade-out class to trigger CSS transition
        animatedName.style.opacity = '0';

        setTimeout(() => {
            currentIndex = (currentIndex + 1) % names.length;
            animatedName.textContent = names[currentIndex];
            // Remove fade-out (set opacity back to 1)
            animatedName.style.opacity = '1';
        }, 400); // 400ms matches the transition duration in CSS
    }, 4000); // Change every 4 seconds
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const inputVal = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!inputVal || !password) {
        alert("Please fill in all fields");
        return;
    }

    // Determine if input is mobile or email
    let email = inputVal;
    if (!inputVal.includes('@')) {
        email = `${inputVal}@setu.placeholder.com`;
    }

    // Show loading state
    loginBtn.textContent = "Logging in...";
    loginBtn.disabled = true;

    try {
        // 1. Authenticate with Firebase
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Check Database for Role (Citizen vs Authority)
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            let userData = docSnap.data();

            // SCRIPT TO FIX MISSING DEPARTMENT IN DB (Self-Healing)
            if (userData.role === 'authority' && !userData.department && userData.idCard) {
                let derivedDept = 'General Administration';
                const prefix = userData.idCard.substring(0, 4).toUpperCase();

                if (prefix === 'GPWD') derivedDept = 'Public Works Department (PWD)';
                else if (prefix === 'GSWM') derivedDept = 'Department of Sanitation';
                else if (prefix === 'GDJB') derivedDept = 'Water Supply & Sewerage Board';

                // Update Database immediately
                try {
                    await updateDoc(docRef, { department: derivedDept });
                    console.log("Database updated with missing department:", derivedDept);
                    // Update local object so it saves to localStorage correctly
                    userData.department = derivedDept;
                } catch (err) {
                    console.error("Failed to auto-update department in DB:", err);
                }
            }

            // Save info to LocalStorage for quick access
            localStorage.setItem('userProfile', JSON.stringify(userData));
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userType', userData.role);

            // Redirect based on Role
            if (userData.role === 'authority') {
                window.location.href = "authority-dashboard.html";
            } else {
                window.location.href = "index.html";
            }
        } else {
            // Fallback if no profile exists
            window.location.href = "index.html";
        }

    } catch (error) {
        console.error(error);
        alert("Login Failed: " + error.message); // e.g., Wrong password
        loginBtn.textContent = "Login";
        loginBtn.disabled = false;
    }
});
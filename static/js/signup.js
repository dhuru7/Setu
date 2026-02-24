// js/signup.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// --- 1. FIREBASE SETUP --- DO NOT COMMIT API KEY ---
const firebaseConfig = {
    apiKey: "AIzaSyD5MCFaYzkNhXQj1NKVmft680wgGu0Me8E",
    authDomain: "setu-6932f.firebaseapp.com",
    projectId: "setu-6932f",
    storageBucket: "setu-6932f.firebasestorage.app",
    messagingSenderId: "1060012410845",
    appId: "1:1060012410845:web:13da8942457a2d4ed89834"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 2. HEADER & UI LOGIC ---


// Logo Animation Logic
function setupLogoAnimation() {
    const names = ['Setu', 'सेतु', 'সেতু', 'सेतू', 'સેતુ', 'ಸೇತು'];
    let currentIndex = 0;
    const logoElement = document.getElementById('animated-name');
    if (!logoElement) return;

    setInterval(() => {
        // Trigger fade out
        logoElement.style.opacity = '0';

        setTimeout(() => {
            currentIndex = (currentIndex + 1) % names.length;
            logoElement.textContent = names[currentIndex];
            // Trigger fade in
            logoElement.style.opacity = '1';
        }, 400); // Wait for transition (matches CSS duration)
    }, 4000);
}

// Language Logic
function setupLanguage() {
    const LANGUAGES = {
        'en': { name: 'English', short: 'EN' },
        'hi': { name: 'हिन्दी', short: 'HI' },
        'bn': { name: 'বাংলা', short: 'BN' },
        'te': { name: 'తెలుగు', short: 'TE' },
        'mr': { name: 'मराठी', short: 'MR' },
        'ta': { name: 'தமிழ்', short: 'TA' },
        'ur': { name: 'اردو', short: 'UR' },
        'gu': { name: 'ગુજરાતી', short: 'GU' },
        'kn': { name: 'ಕನ್ನಡ', short: 'KN' },
        'ml': { name: 'മലയാളം', short: 'ML' },
        'pa': { name: 'ਪੰਜਾਬੀ', short: 'PA' },
        'or': { name: 'ଓଡ଼ିଆ', short: 'OR' },
        'as': { name: 'অসমীয়া', short: 'AS' },
        'ne': { name: 'नेपाली', short: 'NE' }
    };

    const dropdowns = [
        { btn: 'language-btn', list: 'language-dropdown', text: '.language-text', indicator: '#current-lang' },
        { btn: 'mobile-language-btn', list: 'mobile-language-dropdown', text: '.mobile-language-text', indicator: '#mobile-current-lang' }
    ];

    // Helper to set cookie
    const setLangCookie = (code) => {
        if (code === 'en') {
            document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        } else {
            document.cookie = `googtrans=/en/${code}; path=/;`;
        }
    };

    // Populate Lists
    dropdowns.forEach(config => {
        const listEl = document.getElementById(config.list);
        if (!listEl) return;

        listEl.innerHTML = Object.entries(LANGUAGES).map(([code, { name, short }]) => `
            <a href="#" class="block px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-accent)] notranslate" data-lang="${code}" data-name="${name}" data-short="${short}">
                <div class="flex justify-between items-center w-full">
                    <span>${name}</span>
                    <span class="text-xs bg-[var(--bg-primary)] px-1 rounded ml-2">${short}</span>
                </div>
            </a>
        `).join('');

        // Handle Selection
        listEl.addEventListener('click', (e) => {
            e.preventDefault();
            const item = e.target.closest('a');
            if (!item) return;
            const lang = item.dataset.lang;
            const name = item.dataset.name;

            localStorage.setItem('selectedLanguage', lang);
            localStorage.setItem('selectedLanguageName', name);
            setLangCookie(lang);
            location.reload();
        });
    });

    // Handle Dropdown Toggles and Restore Selection visible state
    const currentLangCode = localStorage.getItem('selectedLanguage') || 'en';
    const currentLangName = localStorage.getItem('selectedLanguageName') || 'English';
    const currentShort = LANGUAGES[currentLangCode]?.short || 'EN';

    dropdowns.forEach(config => {
        const btn = document.getElementById(config.btn);
        const list = document.getElementById(config.list);
        if (!btn || !list) return;

        // Update Button Text
        const textSpan = btn.querySelector(config.text);
        const indicatorSpan = btn.querySelector(config.indicator); // might need querySelector if it's ID-based in array but class in DOM? 
        // In config I used ID selector for indicator.
        const indicatorDom = btn.querySelector('.language-indicator');

        if (textSpan) textSpan.textContent = currentLangName;
        if (indicatorDom) indicatorDom.textContent = currentShort;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close others
            dropdowns.forEach(d => {
                const otherList = document.getElementById(d.list);
                if (otherList && otherList !== list) otherList.classList.remove('show');
            });
            list.classList.toggle('show');
        });
    });

    // Mobile Menu Toggle
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menuBtn.classList.toggle('open');
            mobileMenu.classList.toggle('open');
        });
    }

    // Close all on click outside
    document.addEventListener('click', () => {
        dropdowns.forEach(d => {
            const l = document.getElementById(d.list);
            if (l) l.classList.remove('show');
        });
        if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
            // Optional: close mobile menu on outside click if desired
            // mobileMenu.classList.add('hidden');
        }
    });
}


// --- 3. PAGE INIT ---
window.addEventListener('load', () => {
    setupLogoAnimation();
    setupLanguage();
    initSignupProcess();
});

// --- 4. SIGNUP PROCESS LOGIC ---
// --- 4. SIGNUP PROCESS LOGIC ---
function initSignupProcess() {
    const signupForm = document.getElementById('signup-form');
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const toStep2Btn = document.getElementById('to-step-2-btn');
    const backToStep1Btn = document.getElementById('back-to-step-1-btn');
    const signupBtn = document.getElementById('signup-btn');
    const noteContainer = document.getElementById('auth-note-container');

    // Validation definitions
    const fields = {
        fullname: { el: document.getElementById('fullname'), errorEl: document.getElementById('fullname-error'), validator: (val) => val.length >= 2 ? null : 'Full name is required.' },
        idCard: {
            el: document.getElementById('id-card'),
            errorEl: document.getElementById('id-error'),
            validator: (val) => {
                const citizenRegex = /^\d{12}$/;
                const officerRegex = /^[A-Z]{4}\d{8}$/;
                const workerRegex = /^AW\d{5}$/;
                if (citizenRegex.test(val)) return null;
                if (officerRegex.test(val)) return null;
                if (workerRegex.test(val)) return null;
                return 'Enter 12-digit Aadhaar, Officer ID (4 Caps + 8 Nos), or Worker ID (AW + 5 Nos)';
            }
        },
        dob: {
            el: document.getElementById('dob'),
            errorEl: document.getElementById('dob-error'),
            validator: (val) => {
                if (!val) return 'Date required.';
                const birthDate = new Date(val);
                const today = new Date();

                // Calculate age
                let age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }

                // Check constraints
                if (birthDate > today) return 'Date cannot be in the future.';
                if (age < 18) return 'You must be at least 18 years old.';
                if (age > 120) return 'Please enter a valid date.';
                if (birthDate.getFullYear() < 1900) return 'Please enter a valid year.';

                return null;
            }
        },
        mobile: { el: document.getElementById('mobile'), errorEl: document.getElementById('mobile-error'), validator: (val) => /^[6-9][0-9]{9}$/.test(val) ? null : 'Invalid mobile number.' },
        password: { el: document.getElementById('password'), errorEl: document.getElementById('password-error'), validator: (val) => val.length >= 6 ? null : 'Password must be 6+ chars.' },
        confirmPassword: { el: document.getElementById('confirm-password'), errorEl: document.getElementById('confirm-password-error'), validator: (val) => val === document.getElementById('password').value ? null : 'Passwords do not match.' }
    };

    function validateField(fieldName) {
        if (!fields[fieldName]) return true; // Handle missing fields gracefully
        const field = fields[fieldName];
        if (!field.el) return true;

        const error = field.validator(field.el.value.trim());
        if (error) {
            field.errorEl.textContent = error;
            field.errorEl.style.display = 'block';
            return false;
        } else {
            field.errorEl.style.display = 'none';
            return true;
        }
    }

    // Attach Input Listeners for real-time validation
    // ========= SIGNUP ROTATING PLACEHOLDER FOR ID =========
    const signupPlaceholderTexts = [
        'Aadhaar Number',
        'Officer ID (e.g. GPWD12345678)',
        'Worker ID (e.g. AW29393)'
    ];
    let signupPlaceholderIndex = 0;
    const signupRotatingEl = document.getElementById('signup-rotating-placeholder');
    const signupIdTypeHint = document.getElementById('signup-id-type-hint');

    if (signupRotatingEl && fields.idCard.el) {
        function rotateSignupPlaceholder() {
            if (fields.idCard.el.value.length > 0 || document.activeElement === fields.idCard.el) return;
            signupRotatingEl.style.opacity = '0';
            setTimeout(() => {
                signupPlaceholderIndex = (signupPlaceholderIndex + 1) % signupPlaceholderTexts.length;
                signupRotatingEl.textContent = signupPlaceholderTexts[signupPlaceholderIndex];
                signupRotatingEl.style.opacity = '1';
            }, 400);
        }
        setInterval(rotateSignupPlaceholder, 3000);

        fields.idCard.el.addEventListener('focus', () => {
            signupRotatingEl.style.opacity = '0';
        });
        fields.idCard.el.addEventListener('blur', () => {
            if (fields.idCard.el.value.length === 0) {
                signupRotatingEl.style.opacity = '1';
            }
        });
    }

    Object.keys(fields).forEach(key => {
        if (fields[key].el) {
            fields[key].el.addEventListener('input', (e) => {
                // Special handling for id-card
                if (key === 'idCard') {
                    let value = e.target.value.toUpperCase();

                    // Hide rotating placeholder
                    if (signupRotatingEl && value.length > 0) {
                        signupRotatingEl.style.opacity = '0';
                    }

                    const startsWithLetter = /^[A-Z]/.test(value);
                    const startsWithDigit = /^\d/.test(value);

                    if (startsWithLetter) {
                        if (/^AW/i.test(value)) {
                            // Worker ID: AW + 5 digits
                            const prefix = value.substring(0, 2);
                            let rest = value.substring(2).replace(/[^0-9]/g, '');
                            if (rest.length > 5) rest = rest.slice(0, 5);
                            e.target.value = prefix + rest;

                            if (signupIdTypeHint) {
                                signupIdTypeHint.textContent = '🔧 Worker ID';
                                signupIdTypeHint.className = 'login-id-hint show worker';
                            }
                        } else {
                            // Officer ID: 4 letters + 8 digits
                            let letters = value.match(/^[A-Z]*/)?.[0] || '';
                            if (letters.length > 4) letters = letters.slice(0, 4);
                            let rest = value.substring(letters.length).replace(/[^0-9]/g, '');
                            if (letters.length >= 4) {
                                if (rest.length > 8) rest = rest.slice(0, 8);
                                e.target.value = letters + rest;
                            } else {
                                e.target.value = letters;
                            }

                            if (signupIdTypeHint) {
                                signupIdTypeHint.textContent = letters.length < 4 ? '🏛️ Officer ID — enter 4-letter prefix' : '🏛️ Officer ID';
                                signupIdTypeHint.className = 'login-id-hint show officer';
                            }
                        }
                    } else if (startsWithDigit) {
                        // Aadhaar: 12 digits only
                        value = value.replace(/\D/g, '');
                        if (value.length > 12) value = value.slice(0, 12);
                        e.target.value = value;

                        if (signupIdTypeHint) {
                            signupIdTypeHint.textContent = '🪪 Aadhaar Number';
                            signupIdTypeHint.className = 'login-id-hint show aadhaar';
                        }
                    } else {
                        e.target.value = value.replace(/[^A-Z0-9]/g, '');
                        if (signupIdTypeHint) {
                            signupIdTypeHint.textContent = '';
                            signupIdTypeHint.className = 'login-id-hint';
                        }
                    }
                }
                validateField(key);
            });
        }
    });

    // Step 1 -> Step 2
    toStep2Btn.addEventListener('click', () => {
        const isNameValid = validateField('fullname');
        const isIdValid = validateField('idCard');
        const isDobValid = validateField('dob');

        if (isNameValid && isIdValid && isDobValid) {
            step1.classList.add('hidden');
            step2.classList.remove('hidden');

            // Focus on next input
            if (fields.mobile.el) fields.mobile.el.focus();
        }
    });

    // Step 2 -> Step 1 (Back Button)
    if (backToStep1Btn) {
        backToStep1Btn.addEventListener('click', () => {
            step2.classList.add('hidden');
            step1.classList.remove('hidden');

            // Focus on first input
            if (fields.fullname.el) fields.fullname.el.focus();
        });
    }

    // Swipe Feature for Note
    if (noteContainer) {
        let touchStartX = 0;
        let touchEndX = 0;

        noteContainer.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        noteContainer.addEventListener('touchend', e => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, { passive: true });

        const handleSwipe = () => {
            if (touchEndX - touchStartX > 50) { // Swipe Right
                noteContainer.classList.add('fade-out-right');
                setTimeout(() => {
                    noteContainer.style.display = 'none';
                }, 400); // Match animation duration
            }
        };
    }

    // Final Submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validate Step 2 fields
        const isMobileValid = validateField('mobile');
        const isPassValid = validateField('password');
        const isConfirmValid = validateField('confirmPassword');

        if (!isMobileValid || !isPassValid || !isConfirmValid) {
            return;
        }

        // Gather Data
        const fullname = fields.fullname.el.value.trim();
        const idCard = fields.idCard.el.value.trim();
        const dob = fields.dob.el.value;
        const mobile = fields.mobile.el.value.trim();
        const password = fields.password.el.value;

        // Synthesize email placeholder for Firebase Auth (required)
        // For workers/officers: use Employee ID so they can login with it
        // For citizens: use mobile number
        const isEmployeeId = /^[A-Z]{2,4}\d{5,8}$/.test(idCard);
        const placeholderEmail = isEmployeeId
            ? `${idCard}@setu.placeholder.com`
            : `${mobile}@setu.placeholder.com`;

        // Visual Feedback
        signupBtn.disabled = true;
        signupBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        `;

        try {
            // 1. Create User
            const userCredential = await createUserWithEmailAndPassword(auth, placeholderEmail, password);
            const user = userCredential.user;

            // Set displayName on Firebase Auth user object
            await updateProfile(user, { displayName: fullname });

            // 2. Save Data
            // Email is stored as empty string so Profile page prompts user to enter it
            // Determine Role based on ID format
            let role = 'citizen'; // Default
            let department = ''; // Default department

            const officerRegex = /^[A-Z]{4}\d{8}$/;
            const workerRegex = /^AW\d{5}$/;

            if (workerRegex.test(idCard)) {
                // Worker ID format: AW + 5 digits (e.g. AW29393)
                role = 'worker';
                department = 'Field Operations';
            } else if (officerRegex.test(idCard)) {
                role = 'authority';

                // Department allocation logic
                const prefix = idCard.substring(0, 4);
                if (prefix === 'GPWD') {
                    department = 'Public Works Department (PWD)';
                } else if (prefix === 'GSWM') {
                    department = 'Solid Waste Management (SWM)';
                } else if (prefix === 'GDJB') {
                    department = 'Water Supply & Sewerage Board';
                } else if (prefix === 'GOED') {
                    department = 'Electrical Department';
                } else {
                    department = 'General Administration'; // Fallback
                }
            }

            const userData = {
                fullname,
                idCard,
                dob,
                mobile,
                role: role,
                createdAt: new Date().toISOString(), // Serializing date for JSON
                email: "",
                city: "", // Explicitly empty city to trigger completion request
                department: department // Add the determined department
            };

            await setDoc(doc(db, "users", user.uid), userData);

            // Save info to LocalStorage for quick access
            localStorage.setItem('userProfile', JSON.stringify(userData));
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userType', role);

            // 3. Success
            alert("Account created successfully!");

            // Redirect based on role
            if (role === 'authority') {
                window.location.href = "authority-dashboard.html";
            } else if (role === 'worker') {
                window.location.href = "worker-home.html";
            } else {
                window.location.href = "index.html";
            }

        } catch (error) {
            console.error(error);
            alert("Registration failed: " + error.message);
            signupBtn.disabled = false;
            // Restore arrow icon
            signupBtn.innerHTML = `
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
            `;
        }
    });
}
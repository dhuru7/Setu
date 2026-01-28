import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const UI = {
        container: document.getElementById('profile-container'),
        // Edit Modal
        modalOverlay: document.getElementById('edit-modal-overlay'),
        modalTitle: document.getElementById('modal-title'),
        modalInput: document.getElementById('modal-input'),
        modalSave: document.getElementById('modal-save'),
        modalCancel: document.getElementById('modal-cancel'),

        profile: {
            avatar: document.getElementById('profile-avatar'),
            fullName: document.getElementById('profile-fullname'),
            city: document.getElementById('view-city'),
            dob: document.getElementById('view-dob'),
            mobile: document.getElementById('view-mobile'),
            email: document.getElementById('view-email'), // Changed to view-email (span) as mostly read-only/swipe to edit
            emailInput: document.getElementById('edit-email-inline'), // If exists
            saveEmailBtn: document.getElementById('save-email-inline-btn'),
            cityLoader: document.getElementById('city-loader')
        },
        avatarContainer: document.getElementById('avatar-container'),
        avatarInput: document.getElementById('avatar-input'),
        toast: document.getElementById('toast-notification'),
    };

    let currentUserUid = null;
    let currentUserData = {};
    let currentEditingField = null;

    // --- Authentication & Data Loading ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserUid = user.uid;
            await loadUserProfile(user.uid);
        } else {
            // Not logged in
            window.location.href = "login.html";
        }
    });

    async function loadUserProfile(uid) {
        // 1. FAST LOAD: Try LocalStorage first
        const cached = localStorage.getItem('userProfile');
        if (cached) {
            currentUserData = JSON.parse(cached);
            displayProfileData();
        }

        try {
            const docRef = doc(db, "users", uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                const freshData = {
                    fullname: data.fullname || 'Guest User',
                    city: data.city || '',
                    aadhaar: data.idCard || '',
                    dob: data.dob || '',
                    mobile: data.mobile || '',
                    email: data.email || '',
                    avatar: data.avatar || 'https://placehold.co/128x128/E1E2E2/1D2228?text=User'
                };

                // Only update and re-render if data changed
                if (JSON.stringify(freshData) !== JSON.stringify(currentUserData)) {
                    currentUserData = freshData;
                    localStorage.setItem('userProfile', JSON.stringify(freshData));
                    displayProfileData();
                }
            } else {
                console.log("No such document!");
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
        }
    }

    function displayProfileData() {
        // Clear skeleton states
        const elementsToRemoveSkeleton = [
            UI.profile.fullName,
            UI.profile.city,
            UI.profile.dob,
            UI.profile.mobile,
            document.getElementById('view-email')
        ];

        elementsToRemoveSkeleton.forEach(el => {
            if (el) {
                el.classList.remove('animate-pulse', 'bg-[var(--bg-accent)]', 'h-8', 'h-5', 'w-32', 'w-full', 'block', 'rounded');
            }
        });

        // Show ALL Icons that were hidden
        document.querySelectorAll('.detail-icon').forEach(icon => icon.classList.remove('hidden'));

        UI.profile.fullName.textContent = currentUserData.fullname;

        // City
        if (currentUserData.city) {
            UI.profile.city.textContent = currentUserData.city;
            UI.profile.city.classList.remove('text-accent-primary');
        } else {
            UI.profile.city.textContent = "Enter city";
            UI.profile.city.classList.add('text-accent-primary');
        }

        // DOB
        const dob = currentUserData.dob;
        if (dob) {
            UI.profile.dob.textContent = dob;
            UI.profile.dob.dataset.dob = dob;

            const birthDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            UI.profile.dob.dataset.age = `${age} years old`;
            UI.profile.dob.dataset.isDob = "true";
        } else {
            UI.profile.dob.textContent = 'N/A';
        }

        // Mobile
        UI.profile.mobile.textContent = currentUserData.mobile || 'N/A';

        // Email
        const emailEl = document.getElementById('view-email');
        if (emailEl) {
            const rawEmail = currentUserData.email || '';
            emailEl.dataset.fullEmail = rawEmail;

            if (!rawEmail) {
                // Empty Email state
                emailEl.textContent = "Enter Email";
                emailEl.classList.add('text-accent-primary');
                emailEl.dataset.isTruncated = "false";
                emailEl.onclick = null; // Remove expansion click for placeholder
            } else {
                // Active Email state
                emailEl.classList.remove('text-accent-primary');

                // Smart Truncation Logic
                const formatEmail = (email) => {
                    if (email.length <= 25) return email;
                    const parts = email.split('@');
                    if (parts.length < 2) return email;
                    const local = parts[0];
                    const domain = parts[1];
                    if (local.length < 8) return email;
                    // "yellobird.....12@gmail.com"
                    return `${local.substring(0, 8)}.....${local.substring(local.length - 2)}@${domain}`;
                };

                emailEl.textContent = formatEmail(rawEmail);
                emailEl.dataset.isTruncated = (emailEl.textContent !== rawEmail);

                // Click Handler for "Lift" and "Show Full"
                emailEl.onclick = (e) => {
                    e.stopPropagation(); // Prevent swipe or other clicks
                    const card = document.getElementById('email-card');
                    const isExpanded = card.classList.contains('card-lifted');

                    if (isExpanded) {
                        // Collapse
                        card.classList.remove('card-lifted');
                        emailEl.textContent = formatEmail(emailEl.dataset.fullEmail);
                    } else {
                        // Expand/Lift
                        card.classList.add('card-lifted');
                        emailEl.textContent = emailEl.dataset.fullEmail;
                    }
                };
            }
        }
        // Also update inline input if it exists
        const emailInput = document.getElementById('edit-email-inline');
        if (emailInput) {
            emailInput.value = currentUserData.email || '';
        }

        // Avatar
        if (UI.profile.avatar) {
            // Remove skeleton style from avatar if any
            UI.profile.avatar.style.backgroundColor = 'transparent';
            if (currentUserData.avatar) {
                UI.profile.avatar.src = currentUserData.avatar;
            } else {
                UI.profile.avatar.src = 'https://placehold.co/128x128/E1E2E2/1D2228?text=User';
            }
        }
    }

    // --- Updates ---

    // Expose openEditModal to window for inline onclicks
    window.openEditModal = function (fieldKey) {
        // Only allow editing city, email (via swipe mainly), maybe mobile if requested
        // User requested: "city and email should be updated". "User name, DOB, Mobile number from firebase...".
        // Implies Name, DOB, Mobile might be read-only? 
        // User said: "updated in the firebase as the user update it in the profile page".
        // It says "the city and email should be updated...". It doesn't explicitly forbid others, but implies they are the focused ones.
        // However, standard profile allows editing most. I will allow editing all for now, or restriction if needed.
        // The prompt says "take all the info like Name, DOB, Mobile ... from firebase ... and city and email should be updated".
        // This phrasing suggests Name/DOB/Mobile are READ from firebase (source of truth from signup), and City/Email are UPDATED.
        // I'll stick to allowing editing City and Email primarily. But if the UI calls openEditModal('mobile'), I should probably handle it or disable it.
        // For now, I'll allow edits but focus on City/Email logic reliability. 

        currentEditingField = fieldKey;
        const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
        UI.modalTitle.textContent = `Edit ${capitalize(fieldKey)}`;

        if (fieldKey === 'dob') UI.modalInput.type = 'date';
        else if (fieldKey === 'mobile') UI.modalInput.type = 'tel';
        else if (fieldKey === 'email') UI.modalInput.type = 'email';
        else UI.modalInput.type = 'text';

        UI.modalInput.value = currentUserData[fieldKey] || '';
        UI.modalOverlay.classList.add('open');

        // Location specific
        const existingBtn = document.getElementById('geo-btn');
        if (existingBtn) existingBtn.remove();

        if (fieldKey === 'city') {
            const btn = document.createElement('button');
            btn.id = 'geo-btn';
            btn.className = 'detect-location-btn';
            btn.type = 'button';
            btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
            `;
            btn.title = "Detect Location";
            btn.onclick = detectLocation;
            document.getElementById('modal-input-wrapper').appendChild(btn);
        }

        setTimeout(() => UI.modalInput.focus(), 100);
    };

    window.closeEditModal = function () { // Expose if needed by inline onclicks
        UI.modalOverlay.classList.remove('open');
        currentEditingField = null;
        const existingBtn = document.getElementById('geo-btn');
        if (existingBtn) existingBtn.remove();
        UI.modalInput.classList.remove('input-gradient-animation');
    }

    if (UI.modalCancel) UI.modalCancel.addEventListener('click', window.closeEditModal);
    if (UI.modalSave) UI.modalSave.addEventListener('click', saveModalValue);

    async function saveModalValue() {
        if (!currentEditingField || !currentUserUid) return;

        const newVal = UI.modalInput.value.trim();

        try {
            await updateDoc(doc(db, "users", currentUserUid), {
                [currentEditingField]: newVal
            });

            // Update local state
            currentUserData[currentEditingField] = newVal;
            displayProfileData();
            showToast(`${currentEditingField} updated!`);
            window.closeEditModal();

            // Reset swipe state
            const card = document.querySelector(`[data-swipe-edit="${currentEditingField}"]`);
            if (card) {
                const overlay = card.querySelector('.swipe-overlay');
                if (overlay) {
                    overlay.style.transform = 'translateX(100%)';
                    overlay.classList.remove('swiped-open');
                }
            }

        } catch (error) {
            console.error("Error updating profile:", error);
            showToast("Failed to update.");
        }
    }

    // --- Inline Email Save (if applicable) ---
    if (UI.profile.saveEmailBtn) {
        UI.profile.saveEmailBtn.addEventListener('click', async () => {
            const emailInput = document.getElementById('edit-email-inline');
            if (!emailInput) return;
            const newVal = emailInput.value.trim();
            if (!newVal) return; // Validation?

            try {
                await updateDoc(doc(db, "users", currentUserUid), {
                    email: newVal
                });
                currentUserData.email = newVal;
                displayProfileData();
                showToast("Email updated!");

                // Close swipe
                const card = document.getElementById('email-card');
                const overlay = card.querySelector('.swipe-overlay');
                if (overlay) {
                    overlay.style.transform = 'translateX(100%)';
                    overlay.classList.remove('swiped-open');
                }

                // Revert Inline Edit Mode
                const viewEl = document.getElementById('view-email');
                const inputEl = document.getElementById('edit-email-inline');
                const btnEl = document.getElementById('save-email-inline-btn');
                if (viewEl && inputEl && btnEl) {
                    viewEl.textContent = newVal; // Ensure view is updated
                    viewEl.classList.remove('hidden');
                    inputEl.classList.add('hidden');
                    btnEl.classList.add('hidden');
                }
            } catch (e) {
                console.error(e);
                showToast("Failed to save email.");
            }
        });
    }


    // --- Geolocation ---
    window.autoDetectCity = async function () {
        // Called from UI or Modal
        if (!navigator.geolocation) {
            showToast("Geolocation not supported.");
            return;
        }

        // If triggered from modal
        if (UI.modalOverlay.classList.contains('open')) {
            detectLocation();
        } else {
            // Direct detection logic if needed (e.g. from swipe card button)
            UI.profile.cityLoader.classList.remove('hidden');
            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                    const data = await response.json();
                    let city = data.address.city || data.address.town || data.address.village || "";
                    if (city) {
                        await updateDoc(doc(db, "users", currentUserUid), { city: city });
                        currentUserData.city = city;
                        displayProfileData();
                        showToast(`Location set to ${city}`);
                    }
                } catch (e) { showToast("Location fetch failed"); }
                finally { UI.profile.cityLoader.classList.add('hidden'); }
            });
        }
    }

    async function detectLocation() {
        const input = UI.modalInput;
        input.classList.add('input-gradient-animation');
        input.placeholder = "Detecting...";
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                const data = await response.json();
                let city = data.address.city || data.address.town || data.address.village || "";
                if (city) input.value = city;
                else showToast("City not found.");
            } catch (e) { showToast("Error finding city."); }
            finally { input.classList.remove('input-gradient-animation'); }
        });
    }

    // --- Swipe Logic (Copied and adapted) ---
    // Initial Swipe Logic replaced by improved version below

    initSwipeCards();

    // --- DOB Swipe Logic (Toggle Age/DOB) ---
    const dobCard = document.getElementById('dob-card');
    const dobValue = document.getElementById('view-dob');
    if (dobCard && dobValue) {
        let touchStartX = 0;
        let touchEndX = 0;
        dobCard.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; });
        dobCard.addEventListener('touchend', e => {
            touchEndX = e.changedTouches[0].screenX;
            if (Math.abs(touchEndX - touchStartX) > 50) {
                if (touchEndX < touchStartX) toggleDobDisplay(false); // Left -> Age
                else toggleDobDisplay(true); // Right -> DOB
            }
        });

        function toggleDobDisplay(showDob) {
            const currentIsDob = dobValue.dataset.isDob === "true";
            if (showDob && currentIsDob) return;
            if (!showDob && !currentIsDob) return;

            dobValue.style.opacity = '0';
            setTimeout(() => {
                if (showDob) {
                    dobValue.textContent = dobValue.dataset.dob;
                    dobValue.dataset.isDob = "true";
                } else {
                    dobValue.textContent = dobValue.dataset.age;
                    dobValue.dataset.isDob = "false";
                }
                dobValue.style.opacity = '1';
            }, 300);
        }
    }

    // Mobile Swipe Logic Removed as per request (Step 211)

    // --- Swipe Logic (Copied and adapted) ---
    function initSwipeCards() {
        const swipeCards = document.querySelectorAll('.swipe-card');
        swipeCards.forEach(card => {
            const overlay = card.querySelector('.swipe-overlay');
            if (!overlay) return;

            // Ensure transition for border-radius on the card is handled by CSS class now


            let startX = 0;
            let currentTranslate = 0;
            let isDragging = false;

            const handleStart = (clientX) => {
                startX = clientX;
                const style = window.getComputedStyle(overlay);
                const matrix = new WebKitCSSMatrix(style.transform);
                currentTranslate = matrix.m41;
                isDragging = true;
                overlay.style.transition = 'none';

                // Maximize roundness on interaction
                // Maximize roundness on interaction via CSS class
                card.classList.add('swiping-active');
            };

            const handleMove = (e) => {
                if (!isDragging) return;

                // Get current touch position
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;

                // Calculate movement
                const diffX = clientX - startX;

                // Direction Locking Idea:
                // If we haven't locked direction yet, decide now based on initial movement
                if (!card.dataset.swipeDir && Math.abs(diffX) > 5) {
                    const diffY = clientY - (startY || 0);
                    if (Math.abs(diffX) > Math.abs(diffY)) {
                        card.dataset.swipeDir = 'horizontal';
                    } else {
                        card.dataset.swipeDir = 'vertical';
                    }
                }

                // Only move if horizontal swipe
                if (card.dataset.swipeDir === 'horizontal') {
                    if (e.cancelable) e.preventDefault(); // STOP SCROLLING

                    const cardWidth = card.offsetWidth;
                    let newTranslate = currentTranslate + diffX;
                    if (newTranslate > cardWidth) newTranslate = cardWidth;
                    if (newTranslate < 0) newTranslate = 0;

                    // Use requestAnimationFrame for performance
                    requestAnimationFrame(() => {
                        overlay.style.transform = `translateX(${newTranslate}px)`;
                    });
                }
            };

            const handleEnd = () => {
                if (!isDragging) return;
                isDragging = false;
                delete card.dataset.swipeDir; // Reset lock

                // Revert roundness
                card.classList.remove('swiping-active');

                overlay.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                const style = window.getComputedStyle(overlay);
                const matrix = new WebKitCSSMatrix(style.transform);
                const finalX = matrix.m41;
                const cardWidth = card.offsetWidth;

                if (finalX < (cardWidth * 0.6)) {
                    overlay.style.transform = `translateX(0)`;
                    overlay.classList.add('swiped-open');
                } else {
                    overlay.style.transform = `translateX(100%)`;
                    overlay.classList.remove('swiped-open');
                }
            };

            // Enhanced Touch Start to capture Y for direction lock
            let startY = 0;
            const onTouchStart = (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                handleStart(startX);
            };

            card.addEventListener('touchstart', onTouchStart, { passive: true });
            card.addEventListener('touchmove', handleMove, { passive: false }); // Important: allow preventDefault
            card.addEventListener('touchend', handleEnd);

            // Mouse Support for Swipe Cards
            card.addEventListener('mousedown', e => handleStart(e.clientX));
            window.addEventListener('mousemove', e => { if (isDragging) handleMove(e.clientX); });
            window.addEventListener('mouseup', e => { if (isDragging) handleEnd(); });

            // Click Overlay
            overlay.addEventListener('click', () => {
                const field = card.dataset.swipeEdit;
                if (field === 'city') {
                    // Custom City Logic
                    if (currentUserData.city && !overlay.dataset.confirming) {
                        // Old user, first click
                        overlay.textContent = "Click again to confirm Locate again";
                        overlay.style.fontSize = "0.8rem"; // Minimize text
                        overlay.dataset.confirming = "true";
                        return; // Wait for second click
                    }

                    // Proceed if New User OR Confirmed
                    overlay.textContent = "Auto locate"; // Reset to new text
                    overlay.style.fontSize = "";
                    delete overlay.dataset.confirming;

                    // Close swipe visually immediately
                    overlay.style.transform = `translateX(100%)`;
                    overlay.classList.remove('swiped-open');

                    // Trigger Auto Detect directly
                    autoDetectCity();

                } else if (field === 'email') {
                    // Inline Email Edit Logic
                    const viewEl = document.getElementById('view-email');
                    const inputEl = document.getElementById('edit-email-inline');
                    const btnEl = document.getElementById('save-email-inline-btn');

                    if (viewEl && inputEl && btnEl) {
                        viewEl.classList.add('hidden');
                        inputEl.classList.remove('hidden');
                        btnEl.classList.remove('hidden');
                        inputEl.value = viewEl.textContent.trim(); // sync value
                        inputEl.focus();

                        // Close swipe visually to reveal input
                        overlay.style.transform = `translateX(100%)`;
                        overlay.classList.remove('swiped-open');
                    }
                } else {
                    openEditModal(field);
                }
            });
        });
    }

    function showToast(message) {
        if (UI.toast) {
            UI.toast.textContent = message;
            UI.toast.classList.add('show');
            setTimeout(() => UI.toast.classList.remove('show'), 3000);
        }
    }

    // --- Avatar Upload ---
    if (UI.avatarInput) {
        UI.avatarInput.addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (f) {
                if (!f.type.startsWith('image/')) {
                    showToast("Please upload an image file.");
                    return;
                }

                // No strict file size limit check here because we will compress it.

                const r = new FileReader();
                r.onload = (ev) => {
                    const img = new Image();
                    img.src = ev.target.result;
                    img.onload = async () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');

                        // Resize to 600px width (consistent with report logic)
                        const MAX_WIDTH = 600;
                        let width = img.width;
                        let height = img.height;

                        if (width > MAX_WIDTH) {
                            height = height * (MAX_WIDTH / width);
                            width = MAX_WIDTH;
                        }

                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(img, 0, 0, width, height);

                        // Convert to Base64 Text String (JPEG, 0.6 quality)
                        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);

                        // Update UI immediately
                        UI.profile.avatar.src = compressedDataUrl;

                        try {
                            if (currentUserUid) {
                                await updateDoc(doc(db, "users", currentUserUid), { avatar: compressedDataUrl });
                                currentUserData.avatar = compressedDataUrl;
                                showToast('Profile image updated!');
                            }
                        } catch (err) {
                            console.error("Avatar upload failed:", err);
                            showToast("Failed to save image.");
                        }
                    };
                };
                r.readAsDataURL(f);
            }
        });
    }

    // --- Setu AI & Settings ---
    window.openSettingsPanel = () => { if (window.Settings) window.Settings.open(); };

    if (window.SetuAI) {
        window.SetuAI.init({
            onSummarize: () => {
                const summaryPoints = [];
                if (!currentUserData || Object.keys(currentUserData).length === 0) { return ["No user profile data is available to summarize."]; }
                summaryPoints.push(`The user's name is ${currentUserData.fullname}.`);
                summaryPoints.push(`They live in ${currentUserData.city}.`);
                if (currentUserData.email) { summaryPoints.push(`Their email is available for contact.`); }
                return summaryPoints;
            },
            onNavigate: (targetId) => {
                if (targetId === 'settings') window.openSettingsPanel();
                else {
                    const el = document.getElementById(targetId);
                    if (el && el.href) window.location.href = el.href;
                    else if (el) el.click();
                }
            }
        });
    }

    // Avatar Click (since preview removed, trigger input)
    if (UI.avatarContainer) {
        UI.avatarContainer.onclick = function () {
            UI.avatarInput.click();
        };
    }

    // --- Swipe Hint Animation on Click ---
    function addClickHints() {
        const enableHint = (cardId) => {
            const card = document.getElementById(cardId);
            if (!card) return;

            const content = card.querySelector('.swipe-content');
            if (!content) return;

            content.addEventListener('click', (e) => {
                // Ignore if clicked on an expanded email that prevents propagation, 
                // but checking here ensures we don't animate if logic handled elsewhere.
                // e.stopPropagation from email text will prevent this if clicked on text.

                const overlay = card.querySelector('.swipe-overlay');
                // Only animate if not already open
                if (!overlay || overlay.classList.contains('swiped-open')) return;

                triggerSwipeHint(card, overlay);
            });
        };

        enableHint('city-card');
        enableHint('email-card');
    }

    function triggerSwipeHint(card, overlay) {
        if (card.classList.contains('hint-animating')) return;
        card.classList.add('hint-animating');

        // Slide 20% (reveal 20% means move to 80%)
        overlay.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        overlay.style.transform = 'translateX(80%)';

        setTimeout(() => {
            overlay.style.transform = 'translateX(100%)';
            setTimeout(() => {
                card.classList.remove('hint-animating');
            }, 300);
        }, 300);
    }

    addClickHints();
});

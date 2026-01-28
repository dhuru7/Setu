
const Settings = {
    init() {
        this.injectPanel();
        this.setupTheme();

        this.setupLanguage();
        this.setupEventListeners();
        this.setupResizing(); // Added resizing
    },

    injectPanel() {
        if (document.getElementById('settings-panel')) return;

        // Added resize-handle to the HTML
        const panelHTML = `
        <div id="settings-overlay" class="fixed inset-0 bg-black bg-opacity-50 z-[115] hidden"></div>
        <div id="settings-panel"
            class="fixed top-0 right-0 h-full bg-[var(--bg-secondary)] border-l border-[var(--border-light)] w-80 max-w-full shadow-lg z-[120] transform translate-x-full transition-transform duration-300 ease-in-out flex flex-col">
            <div id="settings-resize-handle" class="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-[121]"></div>
            
            <div class="p-4 border-b border-[var(--border-light)] flex-shrink-0">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold text-[var(--text-primary)]">Settings</h2>
                    <button id="close-settings-btn" class="p-1 rounded-full hover:bg-[var(--bg-accent)]">
                        <svg class="w-6 h-6 text-[var(--text-muted)]" xmlns="http://www.w3.org/2000/svg" fill="none"
                            viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="p-4 flex-grow overflow-y-auto">
                <div class="space-y-6">
                    <div>
                        <label class="text-sm font-semibold text-[var(--text-muted)] px-1">Appearance</label>
                        <div class="mt-2 flex items-center justify-between p-3 bg-[var(--bg-primary)] rounded-lg">
                            <span class="font-medium text-[var(--text-primary)]">Theme</span>
                            <button id="theme-toggle-settings"
                                class="p-2 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-light)]"
                                aria-label="Toggle theme">
                                <svg class="w-5 h-5 sun-icon text-yellow-500" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z">
                                    </path>
                                </svg>
                                <svg class="w-5 h-5 hidden moon-icon text-blue-300" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z">
                                    </path>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label class="text-sm font-semibold text-[var(--text-muted)] px-1">Content</label>
                        <div class="mt-2">
                            <button id="language-btn-settings"
                                class="w-full flex items-center justify-between text-left p-3 bg-[var(--bg-primary)] rounded-lg">
                                <span id="current-lang-text-settings"
                                    class="font-medium text-[var(--text-primary)] notranslate">English</span>
                                <svg id="language-arrow"
                                    class="w-5 h-5 text-[var(--text-muted)] transition-transform duration-300"
                                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                                    stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            <div id="language-list-settings" class="mt-2 space-y-1">
                                <!-- Language items populated by JS -->
                            </div>
                        </div>
                    </div>
                </div>
                    <div>
                        <label class="text-sm font-semibold text-[var(--text-muted)] px-1">Account</label>
                        <div class="mt-2">
                             <button id="logout-btn-settings" onclick="if(window.handleLogout) window.handleLogout();" class="w-full flex items-center justify-center space-x-2 p-3 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg transition-colors group">
                                <svg class="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                                </svg>
                                <span class="font-medium">Logout</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', panelHTML);
    },

    setupResizing() {
        const panel = document.getElementById('settings-panel');
        const handle = document.getElementById('settings-resize-handle');
        if (!panel || !handle) return;

        let isResizing = false;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'ew-resize';
            panel.classList.remove('transition-transform', 'duration-300', 'ease-in-out'); // Disable transition during drag
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            // Width is distance from right edge.
            const newWidth = window.innerWidth - e.clientX;
            // Constraints
            if (newWidth > 300 && newWidth < (window.innerWidth - 50)) {
                panel.style.width = `${newWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                panel.classList.add('transition-transform', 'duration-300', 'ease-in-out'); // Re-enable transition
            }
        });
    },


    setupEventListeners() {
        // Desktop Button
        const btnDesktop = document.getElementById('settings-btn-desktop');
        if (btnDesktop) {
            btnDesktop.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        // Mobile Button (if exists in header)
        const btnMobile = document.getElementById('settings-btn-mobile-header');
        if (btnMobile) {
            btnMobile.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        // Close Button & Overlay
        const closeBtn = document.getElementById('close-settings-btn');
        const overlay = document.getElementById('settings-overlay');

        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
        if (overlay) overlay.addEventListener('click', () => this.close());
    },

    toggle() {
        const panel = document.getElementById('settings-panel');
        // Check transform or class
        // Since we are now manipulating width, the translate-x-full might interact weirdly if we don't strictly follow it.
        // We rely on class list for visibility state.
        if (panel.classList.contains('translate-x-full')) {
            this.open();
        } else {
            this.close();
        }
    },

    open() {
        const panel = document.getElementById('settings-panel');
        const overlay = document.getElementById('settings-overlay');
        panel.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');

        // Animation for Icons (Play Once)
        const icons = document.querySelectorAll('#settings-btn-desktop svg, #settings-btn-mobile-header svg');
        icons.forEach(icon => {
            icon.classList.remove('settings-icon-spin-reverse');
            icon.classList.remove('settings-icon-spin');
            void icon.offsetWidth; // Trigger reflow
            icon.classList.add('settings-icon-spin');
        });
    },

    close() {
        const panel = document.getElementById('settings-panel');
        const overlay = document.getElementById('settings-overlay');
        panel.classList.add('translate-x-full');
        overlay.classList.add('hidden');

        // Reverse Animation for Icons
        const icons = document.querySelectorAll('#settings-btn-desktop svg, #settings-btn-mobile-header svg');
        icons.forEach(icon => {
            icon.classList.remove('settings-icon-spin');
            icon.classList.remove('settings-icon-spin-reverse');
            void icon.offsetWidth; // Trigger reflow
            icon.classList.add('settings-icon-spin-reverse');
        });
    },

    setupTheme() {
        const btn = document.getElementById('theme-toggle-settings');
        if (!btn) return;

        // Initial State
        const applyTheme = t => {
            const isDark = t === 'dark';
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            document.querySelectorAll('.sun-icon').forEach(i => i.classList.toggle('hidden', isDark));
            document.querySelectorAll('.moon-icon').forEach(i => i.classList.toggle('hidden', !isDark));
        };
        const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        applyTheme(currentTheme);

        btn.addEventListener('click', () => {
            const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', n);
            applyTheme(n);
        });
    },



    setupLanguage() {
        const LANGUAGES = { 'en': { name: 'English', short: 'EN' }, 'hi': { name: 'हिन्दी', short: 'HI' }, 'bn': { name: 'বাংলা', short: 'BN' }, 'te': { name: 'తెలుగు', short: 'TE' }, 'mr': { name: 'मराठी', short: 'MR' }, 'ta': { name: 'தமிழ்', short: 'TA' }, 'ur': { name: 'اردو', short: 'UR' }, 'gu': { name: 'ગુજરાતી', short: 'GU' }, 'kn': { name: 'ಕನ್ನಡ', short: 'KN' }, 'ml': { name: 'മലയാളം', short: 'ML' }, 'pa': { name: 'ਪੰਜਾਬੀ', short: 'PA' }, 'or': { name: 'ଓଡ଼ିଆ', short: 'OR' }, 'as': { name: 'অসমীয়া', short: 'AS' }, 'ne': { name: 'नेपाली', short: 'NE' } };

        const listContainer = document.getElementById('language-list-settings');
        const langBtn = document.getElementById('language-btn-settings');
        const langArrow = document.getElementById('language-arrow');
        const currentLangText = document.getElementById('current-lang-text-settings');

        if (!listContainer) return;

        const html = Object.entries(LANGUAGES).map(([c, { name, short }]) =>
            `<a href="#" class="dropdown-item notranslate flex justify-between items-center !p-2 !rounded-md" data-lang="${c}" data-name="${name}">
                <span class="notranslate">${name}</span>
                <span class="language-indicator notranslate !bg-[var(--bg-accent)] !text-[var(--text-primary)]">${short}</span>
            </a>`
        ).join('');
        listContainer.innerHTML = html;

        // Restore Display
        const n = localStorage.getItem('selectedLanguageName') || 'English';
        if (currentLangText) currentLangText.textContent = n;

        // Toggle List
        if (langBtn) {
            langBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = listContainer.style.maxHeight && listContainer.style.maxHeight !== '0px';
                if (isExpanded) {
                    listContainer.style.maxHeight = '0px';
                    if (langArrow) langArrow.classList.remove('rotate-180');
                } else {
                    listContainer.style.maxHeight = listContainer.scrollHeight + 'px';
                    if (langArrow) langArrow.classList.add('rotate-180');
                }
            });
        }

        // Selection
        listContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item) {
                e.preventDefault();
                const l = item.dataset.lang, name = item.dataset.name;
                localStorage.setItem('selectedLanguage', l);
                localStorage.setItem('selectedLanguageName', name);

                // Google Translate Cookie
                if (l === 'en') {
                    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                } else {
                    document.cookie = `googtrans=/en/${l}; path=/;`;
                }
                location.reload();
            }
        });
    }
};

// Fallback Logout Handler (in case logout.js fails to load)
if (!window.handleLogout) {
    window.handleLogout = function () {
        console.warn("Logout script missing/failed. Forcing local logout.");
        localStorage.removeItem('userProfile');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userType');
        window.location.href = "login.html";
    };
}

window.Settings = Settings;
// We allow Navigation.js to call Settings.init(), but if it's missing, we don't auto-init twice to not cause errors,
// OR we just assume Navigation.js is the entry point.
// For safety, checks in init are good (like if element exists return). 

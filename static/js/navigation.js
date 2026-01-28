
const Navigation = {
    init() {
        this.setupLogoAnimation();
        this.highlightActiveLink();
        this.resizeSetup();
        this.setupMobileInteractions();

        // Initialize other global components
        if (window.Notifications) window.Notifications.init();
        if (window.Settings) window.Settings.init();
        if (window.SetuAI) SetuAI.init(); // Assuming SetuAI has init and is loaded

        this.checkProfileCompletion();
    },

    checkProfileCompletion() {
        // Feature disabled: No notification dot on profile icon
    },

    setupLogoAnimation() {
        const names = ['Setu', 'सेतु', 'সেতু', 'सेतू', 'સેતુ', 'ಸೇತು'];
        let currentIndex = 0;
        const logoElements = [
            document.getElementById('animated-name-desktop-sidebar'),
            document.getElementById('animated-name-mobile')
        ].filter(el => el);

        if (logoElements.length === 0) return;

        setInterval(() => {
            logoElements.forEach(el => el.classList.add('fade-out'));
            setTimeout(() => {
                currentIndex = (currentIndex + 1) % names.length;
                logoElements.forEach(el => {
                    el.textContent = names[currentIndex];
                    el.classList.remove('fade-out');
                });
            }, 400);
        }, 4000);
    },

    highlightActiveLink() {
        // Simple logic to add 'active' class based on URL if not already present
        const path = window.location.pathname;
        const page = path.split("/").pop() || 'index.html';

        // Map pages to IDs (Desktop)
        const desktopMap = {
            'index.html': 'desktop-home-link',
            'search.html': 'desktop-search-link',
            'updates.html': 'desktop-updates-link',
            'report.html': 'desktop-report-link',
            'profile.html': 'desktop-profile-link'
        };

        // Mobile Map
        const mobileMap = {
            'index.html': 'bottom-nav-home',
            'search.html': 'bottom-nav-search',
            'updates.html': 'updates-nav-link',
            'profile.html': 'bottom-nav-profile'
        };

        const updateActiveState = (map, selector) => {
            const activeId = map[page];
            if (!activeId) return;

            const targetEl = document.getElementById(activeId);
            // If the target is already active, DO NOT touch DOM. This prevents animation on load.
            if (targetEl && targetEl.classList.contains('active')) {
                // Ensure others are NOT active (just in case of HTML errors), but don't touch the active one
                document.querySelectorAll(selector).forEach(el => {
                    if (el !== targetEl) el.classList.remove('active');
                });
                return;
            }

            // Standard fallback: Only if target wasn't found or wasn't active
            if (targetEl) {
                document.querySelectorAll(selector).forEach(el => el.classList.remove('active'));
                targetEl.classList.add('active');
            }
        };

        updateActiveState(desktopMap, '.desktop-nav-link');
        updateActiveState(mobileMap, '.mobile-nav-item');
    },

    resizeSetup() {
        // Placeholder if general app resizing is needed, 
        // but specific panel resizing is handled in settings.js/notifications.js
    },

    setupMobileInteractions() {
        const mobileItems = document.querySelectorAll('.mobile-nav-item');
        mobileItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const href = item.getAttribute('href');
                // Allow default behavior for empty links, internal anchors, or same-page clicks (optional)
                if (!href || href === '#' || href.startsWith('#')) return;

                // Stop immediate navigation
                e.preventDefault();

                // If already active, maybe just do nothing or reload?
                // For this animation request, if we click the active one, we do nothing to avoid glitch.
                if (item.classList.contains('active')) return;

                // 1. Deactivate current active item
                const currentActive = document.querySelector('.mobile-nav-item.active');
                if (currentActive) {
                    currentActive.classList.remove('active');
                }

                // 2. Activate clicked item (triggers CSS expansion animation)
                item.classList.add('active');

                // 3. Wait for animation to mostly finish, then navigate
                window.location.href = href;
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Navigation.init();
});

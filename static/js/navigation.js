/**
 * Navigation Module - Optimized for Smooth Page Transitions
 * Handles both desktop sidebar and mobile floating navigation
 */
const Navigation = {
    // Configuration
    config: {
        labelExpandDelay: 80,      // ms before label starts expanding
        preloadRemoveDelay: 100,   // ms before removing preload state
        viewTransitionDuration: 200 // ms for view transition
    },

    init() {
        this.setupLogoAnimation();
        this.highlightActiveLink(); // Ensure correct state based on URL
        this.setupMobileInteractions();

        // Initialize other global components
        if (window.Notifications) window.Notifications.init();
        if (window.Settings) window.Settings.init();
        if (window.SetuAI) SetuAI.init();

        this.checkProfileCompletion();
    },

    checkProfileCompletion() {
        // Feature disabled: No notification dot on profile icon
    },

    setupLogoAnimation() {
        const names = ['Setu', 'सेतु', 'সেতু', 'सेतू', 'ગુજ', 'ಸೇತು'];
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
            // If the target is already active, DO NOT touch DOM
            if (targetEl && targetEl.classList.contains('active')) {
                document.querySelectorAll(selector).forEach(el => {
                    if (el !== targetEl) {
                        el.classList.remove('active');
                        // el.classList.remove('show-label'); // No longer needed
                    }
                });
                return;
            }

            if (targetEl) {
                document.querySelectorAll(selector).forEach(el => {
                    el.classList.remove('active');
                    // el.classList.remove('show-label'); // No longer needed
                });
                targetEl.classList.add('active');
            }
        };

        updateActiveState(desktopMap, '.desktop-nav-link');
        updateActiveState(mobileMap, '.mobile-nav-item');
    },

    resizeSetup() {
        // Placeholder for general app resizing
    },

    setupMobileInteractions() {
        const mobileItems = document.querySelectorAll('.mobile-nav-item');

        mobileItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const href = item.getAttribute('href');

                // Skip for empty/anchor links
                if (!href || href === '#' || href.startsWith('#')) return;

                // If already active, do nothing
                if (item.classList.contains('active')) return;

                // Prevent default navigation to handle transition manually
                e.preventDefault();

                // 1. Collapse current active item
                const currentActive = document.querySelector('.mobile-nav-item.active');
                if (currentActive) {
                    currentActive.classList.remove('active');
                    // CSS transition will collapse the label
                }

                // 2. Highlight new item WITHOUT expanding label (to notify user of selection)
                // We add 'active' AND 'collapsed' so it gets colors but no width
                item.classList.add('active', 'collapsed');

                // 3. Navigate immediately
                this.navigateWithTransition(href);
            });
        });
    },

    /**
     * Navigate to a new page using View Transitions API if available
     */
    navigateWithTransition(href) {
        // Check if View Transitions API is supported
        if (document.startViewTransition) {
            document.startViewTransition(() => {
                window.location.href = href;
            });
        } else {
            // Fallback: Navigate normally
            window.location.href = href;
        }
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Navigation.init();
});

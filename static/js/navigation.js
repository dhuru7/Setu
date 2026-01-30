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
        // Add preload state to prevent transition flash
        this.addPreloadState();

        this.setupLogoAnimation();
        this.highlightActiveLink();
        this.resizeSetup();
        this.setupMobileInteractions();

        // Remove preload state after a short delay
        this.removePreloadState();

        // Initialize other global components
        if (window.Notifications) window.Notifications.init();
        if (window.Settings) window.Settings.init();
        if (window.SetuAI) SetuAI.init();

        this.checkProfileCompletion();
    },

    /**
     * Add preload state to prevent transition flash on page load
     */
    addPreloadState() {
        document.body.classList.add('nav-preload');
    },

    /**
     * Remove preload state after initial render
     */
    removePreloadState() {
        requestAnimationFrame(() => {
            setTimeout(() => {
                document.body.classList.remove('nav-preload');
                // After preload is removed, trigger label expansion for active nav item
                this.expandActiveLabel();
            }, this.config.preloadRemoveDelay);
        });
    },

    /**
     * Expand the label for the currently active mobile nav item
     */
    expandActiveLabel() {
        const activeItem = document.querySelector('.mobile-nav-item.active');
        if (activeItem) {
            // Use requestAnimationFrame for smooth animation
            requestAnimationFrame(() => {
                setTimeout(() => {
                    activeItem.classList.add('show-label');
                }, this.config.labelExpandDelay);
            });
        }
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
                        el.classList.remove('show-label');
                    }
                });
                return;
            }

            if (targetEl) {
                document.querySelectorAll(selector).forEach(el => {
                    el.classList.remove('active');
                    el.classList.remove('show-label');
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

                // Prevent default navigation
                e.preventDefault();

                // Collapse current active label first
                const currentActive = document.querySelector('.mobile-nav-item.active');
                if (currentActive) {
                    currentActive.classList.remove('show-label');
                }

                // Brief delay for label collapse, then navigate
                setTimeout(() => {
                    // Remove active from previous
                    if (currentActive) {
                        currentActive.classList.remove('active');
                    }

                    // Add active to clicked item (without label yet)
                    item.classList.add('active');

                    // Navigate with View Transitions API if supported
                    this.navigateWithTransition(href);
                }, 50);
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


const Notifications = {
    data: [],

    init() {
        this.injectPanel();
        this.load();
        this.setupEventListeners();
        this.setupResizing(); // Added resizing
        this.render();
    },

    injectPanel() {
        if (document.getElementById('notification-panel')) return;

        // Added resize-handle
        const panelHTML = `
        <div id="notification-backdrop" class="fixed inset-0 bg-black bg-opacity-60 z-[115] hidden"></div>
        <div id="notification-panel"
            class="fixed top-0 right-0 h-full w-80 max-w-full bg-[var(--bg-secondary)] shadow-xl z-[120] transform translate-x-full transition-transform duration-300 ease-in-out flex flex-col">
            <div id="notification-resize-handle" class="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-[121]"></div>

            <div class="p-4 border-b border-[var(--border-light)] flex justify-between items-center flex-shrink-0">
                <h3 class="text-lg font-semibold flex items-center text-[var(--text-primary)]">Notifications</h3>
                <button id="close-notification-btn"
                    class="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><svg class="w-6 h-6"
                        xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg></button>
            </div>
            <div id="notification-content" class="flex-grow overflow-y-auto"></div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', panelHTML);
    },

    setupResizing() {
        const panel = document.getElementById('notification-panel');
        const handle = document.getElementById('notification-resize-handle');
        if (!panel || !handle) return;

        let isResizing = false;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'ew-resize';
            panel.classList.remove('transition-transform', 'duration-300', 'ease-in-out');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 300 && newWidth < (window.innerWidth - 50)) {
                panel.style.width = `${newWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                panel.classList.add('transition-transform', 'duration-300', 'ease-in-out');
            }
        });
    },

    load() {
        let firstVisitTimestamp = localStorage.getItem('firstVisitTimestamp');
        if (!firstVisitTimestamp) {
            firstVisitTimestamp = new Date().toISOString();
            localStorage.setItem('firstVisitTimestamp', firstVisitTimestamp);
        }

        const welcomeNotificationRead = localStorage.getItem('welcomeNotificationRead') === 'true';
        const welcomeNotification = {
            id: 1,
            title: 'Welcome to Setu!',
            message: 'We\'re glad you\'re here. <a href="about.html" class="text-[var(--accent-primary)] font-semibold hover:underline">Learn more about Setu</a>.',
            timestamp: firstVisitTimestamp,
            read: welcomeNotificationRead
        };

        this.data = [welcomeNotification];
    },

    setupEventListeners() {
        const btnMobile = document.getElementById('notification-btn-mobile');
        const btnDesktop = document.getElementById('notification-btn-desktop');
        const closeBtn = document.getElementById('close-notification-btn');
        const backdrop = document.getElementById('notification-backdrop');

        if (btnMobile) btnMobile.addEventListener('click', () => this.open());
        if (btnDesktop) btnDesktop.addEventListener('click', () => this.open());
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
        if (backdrop) backdrop.addEventListener('click', () => this.close());
    },

    open() {
        const panel = document.getElementById('notification-panel');
        const backdrop = document.getElementById('notification-backdrop');

        if (panel) panel.classList.remove('translate-x-full');
        if (backdrop) backdrop.classList.remove('hidden');

        const welcomeNotif = this.data.find(n => n.id === 1);
        if (welcomeNotif && !welcomeNotif.read) {
            welcomeNotif.read = true;
            localStorage.setItem('welcomeNotificationRead', 'true');
            this.render();
        }
    },

    close() {
        const panel = document.getElementById('notification-panel');
        const backdrop = document.getElementById('notification-backdrop');

        if (panel) panel.classList.add('translate-x-full');
        if (backdrop) backdrop.classList.add('hidden');
    },

    render() {
        const content = document.getElementById('notification-content');
        const dotMobile = document.getElementById('notification-unread-dot');
        const dotDesktop = document.getElementById('notification-unread-dot-desktop');

        if (!content) return;

        const hasUnread = this.data.some(n => !n.read);

        if (dotMobile) dotMobile.classList.toggle('hidden', !hasUnread);
        if (dotDesktop) dotDesktop.classList.toggle('hidden', !hasUnread);

        if (this.data.length === 0) {
            content.innerHTML = `<p class="text-center text-[var(--text-muted)] p-8">You have no new notifications.</p>`;
            return;
        }

        const formatTimeAgo = t => {
            const seconds = Math.floor((new Date() - new Date(t)) / 1000);
            if (seconds < 2) return 'Just now';
            if (seconds < 60) return `${seconds}s ago`;
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m ago`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours}h ago`;
            return `${Math.floor(hours / 24)}d ago`;
        };

        content.innerHTML = this.data.map(n => `
            <div class="p-4 border-b border-[var(--border-light)] flex items-start space-x-3 ${!n.read ? '' : 'opacity-70'}">
                ${!n.read ? '<div class="w-2 h-2 rounded-full bg-[#f41f4e] mt-2 flex-shrink-0"></div>' : '<div class="w-2 h-2 flex-shrink-0"></div>'}
                <div class="flex-grow">
                    <p class="font-semibold text-[var(--text-primary)]">${n.title}</p>
                    <p class="text-sm text-[var(--text-secondary)]">${n.message}</p>
                    <p class="text-xs text-[var(--text-muted)] mt-1">${formatTimeAgo(n.timestamp)}</p>
                </div>
            </div>
        `).join('');
    },

    newNotification() {
        const dotMobile = document.getElementById('notification-unread-dot');
        const dotDesktop = document.getElementById('notification-unread-dot-desktop');
        if (dotMobile) dotMobile.classList.remove('hidden');
        if (dotDesktop) dotDesktop.classList.remove('hidden');
    }
};
window.Notifications = Notifications;

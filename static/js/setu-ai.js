
class AiWidget {
    constructor(element, isMobile = false) {
        this.element = element;
        this.isMobile = isMobile;
        this.isActive = false;

        this.originalIcon = this.element.querySelector('.original-icon');
        if (this.originalIcon) this.originalIcon.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

        this.element.insertAdjacentHTML('beforeend', this.createHTML());

        this.widgetInner = this.element.querySelector('.ai-widget-inner');
        this.statusEl = this.element.querySelector('.ai-status');
        this.logoIcon = this.element.querySelector('.ai-logo-icon');
        this.micIcon = this.element.querySelector('.ai-mic-icon');

        this.element.addEventListener('click', (e) => this.handleMainClick(e));
        this.widgetInner.querySelector('.ai-icon-container').addEventListener('click', (e) => this.handleMicClick(e));
    }

    createHTML() {
        const logoSize = this.isMobile ? 'w-5 h-5' : 'w-8 h-8';
        const micSize = this.isMobile ? 'w-6 h-6' : 'w-8 h-8';
        return `
            <div class="ai-widget-inner">
                <div class="ai-icon-container">
                    <svg class="${logoSize} text-white ai-logo-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12.0001 1.99219L3.45911 12.0002L12.0001 22.0082L20.5411 12.0002L12.0001 1.99219Z"/></svg>
                    <svg class="${micSize} text-white ai-mic-icon" viewBox="0 0 24 24" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor"/><path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V24h2v-3.06A9 9 0 0 0 21 12v-2h-2z" fill="currentColor"/></svg>
                </div>
                <div class="ai-content">
                    <p class="ai-status text-sm text-white w-full text-left font-semibold"></p>
                </div>
            </div>
        `;
    }

    handleMainClick(event) {
        if (event.target.closest('.ai-icon-container')) {
            return; // Let the mic click handler manage it
        }
        this.toggle(event);
    }

    handleMicClick(event) {
        event.stopPropagation();
        if (this.isActive) {
            SetuAI.startListening(event);
        } else {
            const showInfo = !localStorage.getItem('setuAiInfoShown');
            if (showInfo) {
                this.showAiInfoModal();
            } else {
                this.activate();
            }
        }
    }

    toggle(event) {
        event.stopPropagation();
        const showInfo = !this.isActive && !localStorage.getItem('setuAiInfoShown');
        if (showInfo) {
            this.showAiInfoModal();
            return;
        }
        this.isActive ? this.deactivate() : this.activate();
    }

    showAiInfoModal() {
        const overlay = document.getElementById('ai-info-modal-overlay');
        const modal = document.getElementById('ai-info-modal');
        const btn = document.getElementById('ai-info-got-it-btn');

        if (!overlay || !modal || !btn) return;

        overlay.classList.remove('hidden');
        // Force reflow
        void overlay.offsetWidth;

        overlay.classList.add('visible'); // If using CSS class for visibility
        overlay.style.opacity = '1'; // Fallback
        modal.classList.remove('scale-95', 'opacity-0');

        const gotItHandler = () => {
            localStorage.setItem('setuAiInfoShown', 'true');
            modal.classList.add('scale-95', 'opacity-0');
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.classList.add('hidden');
                overlay.classList.remove('visible');
                this.activate();
            }, 300);
            btn.removeEventListener('click', gotItHandler);
        };
        btn.addEventListener('click', gotItHandler);
    }

    activate() {
        if (navigator.vibrate) navigator.vibrate(50);
        this.element.classList.remove('modern-animation'); // Clear old animation class
        this.isActive = true;
        SetuAI.isAiActive = true;
        this.element.classList.add('active');

        // Toggle Screen Edge Glow
        const edgeGlow = document.querySelector('.screen-edge-glow');
        if (edgeGlow) edgeGlow.classList.add('active');

        const mobileHeader = document.getElementById('mobile-header');
        if (this.isMobile && mobileHeader) mobileHeader.classList.add('ai-active');

        this.setStatus('Tap the icon to speak.');

        if (!sessionStorage.getItem('setuAiButtonClicked')) {
            document.querySelectorAll('.ai-widget-container').forEach(el => el.classList.remove('setu-btn-animated'));
            sessionStorage.setItem('setuAiButtonClicked', 'true');
        }
        setTimeout(() => SetuAI.startListening({ stopPropagation: () => { } }), 500);
    }

    deactivate() {
        this.isActive = false;
        SetuAI.isAiActive = false;
        this.element.classList.remove('active', 'expanded-vertically', 'modern-animation');

        // Toggle Screen Edge Glow
        const edgeGlow = document.querySelector('.screen-edge-glow');
        if (edgeGlow) edgeGlow.classList.remove('active');

        const mobileHeader = document.getElementById('mobile-header');
        if (this.isMobile && mobileHeader) mobileHeader.classList.remove('ai-active');

        if (SetuAI.recognition) SetuAI.recognition.stop();

        const summaryBox = this.element.querySelector('#ai-summary-box');
        if (summaryBox) {
            summaryBox.classList.remove('visible');
            setTimeout(() => summaryBox.remove(), 300);
        }
    }

    setStatus(text, isError = false) {
        this.statusEl.textContent = text;
        this.statusEl.style.color = isError ? '#fee2e2' : '#ffffff';

        // Add/remove class based on text length to expand the container
        const characterLimit = 45; // Characters before expanding
        if (this.isActive && text.length > characterLimit) {
            this.element.classList.add('expanded-vertically');
        } else {
            this.element.classList.remove('expanded-vertically');
        }
    }

    setState(state) {
        this.element.classList.remove('listening', 'speaking');
        this.logoIcon.classList.remove('spin');
        this.micIcon.classList.remove('spin');
        if (state === 'listening') {
            this.element.classList.add('listening');
            this.logoIcon.classList.add('spin');
        } else if (state === 'speaking') {
            this.element.classList.add('speaking');
            this.micIcon.classList.add('spin');
        }
    }
}

const SetuAI = {
    recognition: null,
    isAiActive: false,
    aiTimeout: null,
    widgets: [],
    currentHighlight: null,
    config: {
        onSummarize: () => ["No summary available."],
        onNavigate: (targetId) => {
            const el = document.getElementById(targetId);
            if (el && el.href) window.location.href = el.href;
            else if (el) el.click();
        },
        customResponses: {}
    },

    init(config = {}) {
        this.config = { ...this.config, ...config };

        const desktopBtn = document.querySelector('#setu-ai-btn');
        const mobileBtn = document.querySelector('#setu-ai-btn-mobile');

        if (desktopBtn) this.widgets.push(new AiWidget(desktopBtn));
        if (mobileBtn) this.widgets.push(new AiWidget(mobileBtn, true));

        if (!sessionStorage.getItem('setuAiButtonClicked')) {
            document.querySelectorAll('.ai-widget-container').forEach(el => el.classList.add('setu-btn-animated'));
        }
        this.setupButtonSpin();
        this.setupSpeechRecognition();

        // Global click listener to close AI
        document.addEventListener('click', (e) => {
            if (this.isAiActive && !e.target.closest('.ai-widget-container')) {
                this.widgets.forEach(w => w.deactivate());
            }
        });

        // --- NEW: Inject Screen Edge Glow Element ---
        if (!document.querySelector('.screen-edge-glow')) {
            const glowEl = document.createElement('div');
            glowEl.className = 'screen-edge-glow';
            document.body.appendChild(glowEl);
        }

        // --- NEW: Global Touch Glow Listener ---
        ['click', 'touchstart'].forEach(evtType => {
            document.addEventListener(evtType, (e) => {
                if (this.isAiActive) {
                    this.createTouchRipple(e);
                }
            }, { passive: true });
        });
    },

    createTouchRipple(e) {
        const x = e.touches ? e.touches[0].clientX : e.clientX;
        const y = e.touches ? e.touches[0].clientY : e.clientY;

        const ripple = document.createElement('div');
        ripple.className = 'touch-glow-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        document.body.appendChild(ripple);

        requestAnimationFrame(() => {
            ripple.classList.add('animate');
        });

        setTimeout(() => {
            ripple.remove();
        }, 600);
    },

    setupButtonSpin() {
        setInterval(() => {
            document.querySelectorAll('.ai-widget-container:not(.active) .original-icon').forEach(icon => {
                if (icon) {
                    icon.classList.add('spin');
                    icon.addEventListener('animationend', () => {
                        icon.classList.remove('spin');
                    }, { once: true });
                }
            });
        }, 7000);
    },

    getCurrentLanguage() {
        const cookieValue = document.cookie.split('; ').find(row => row.startsWith('googtrans='));
        if (cookieValue) {
            const langCode = cookieValue.split('/')[2];
            const langMap = { 'hi': 'hi-IN', 'bn': 'bn-IN', 'te': 'te-IN', 'mr': 'mr-IN', 'ta': 'ta-IN', 'ur': 'ur-IN', 'gu': 'gu-IN', 'kn': 'kn-IN', 'ml': 'ml-IN' };
            return langMap[langCode] || 'en-US';
        }
        return 'en-US';
    },

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 1;
            this.recognition.onresult = (event) => {
                const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
                this.widgets.forEach(w => w.setStatus(`"${transcript}"`));
                if (event.results[0].isFinal) {
                    this.widgets.forEach(w => w.setState('idle'));
                    this.querySarvamAI(transcript);
                }
            };
            this.recognition.onerror = (event) => {
                const errorMsg = event.error === 'no-speech' ? "I didn't hear that." : "Mic error.";
                this.widgets.forEach(w => w.setStatus(errorMsg, true));
            };
            this.recognition.onend = () => { this.widgets.forEach(w => w.setState('idle')); };
        }
    },

    startListening(event) {
        if (event) event.stopPropagation();
        if (!this.isAiActive || !this.recognition) return;
        this.recognition.lang = this.getCurrentLanguage();
        this.recognition.start();
        this.widgets.forEach(w => w.setState('listening'));
    },

    async querySarvamAI(text) {
        this.widgets.forEach(w => w.setStatus('Thinking...'));
        try {
            // Mock AI response logic - can be replaced with real API call
            const result = this.getMockResponse(text, this.recognition.lang);
            this.processAIResponse(result);
        } catch (error) {
            this.widgets.forEach(w => w.setStatus("Sorry, I had an issue.", true));
            this.speak("Sorry, I am having trouble connecting right now.");
        }
    },

    getMockResponse(query, lang) {
        query = query.toLowerCase();
        let responseText = { 'en-US': "Sorry, I'm not sure how to help.", 'hi-IN': "क्षमा करें, मुझे यकीन नहीं है कि इसमें कैसे मदद की जाए।" };
        let result = { action: 'answer', targetId: null, responseText: responseText[lang] || responseText['en-US'] };

        const isDesktop = window.innerWidth >= 640;

        // Common responses
        if (query.includes('hello') || query.includes('hi') || query.includes('hey') || query.includes('नमस्ते')) {
            responseText = { 'en-US': 'Hello! How can I help you today?', 'hi-IN': 'नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?' };
            result = { action: 'answer', responseText: responseText[lang] || responseText['en-US'] };
        } else if (query.includes('who are you') || query.includes('what is setu')) {
            responseText = { 'en-US': 'I am Setu AI, your smart assistant.', 'hi-IN': 'मैं सेतु एआई हूं, आपका स्मार्ट सहायक।' };
            result = { action: 'answer', responseText: responseText[lang] || responseText['en-US'] };
        } else if (query.includes('summarise') || query.includes('summarize') || query.includes('summary')) {
            responseText = { 'en-US': 'Certainly. Here is a summary.', 'hi-IN': 'ज़रूर। यहाँ सारांश है।' };
            result = { action: 'summarize', responseText: responseText[lang] || responseText['en-US'] };
        } else if (query.includes('notification')) {
            responseText = { 'en-US': 'Showing your notifications.', 'hi-IN': 'आपकी सूचनाएं दिखा रहा हूँ।' };
            result = { action: 'open_panel', targetId: 'notification', responseText: responseText[lang] || responseText['en-US'] };
        }

        // Merge with custom responses from config if any
        // (Simplified for now, can be expanded)

        // Page specific navigation (can be handled via config or here if generic)
        const navKeywords = ['go', 'take', 'open', 'navigate', 'move', 'show me'];
        const isNavigationRequest = navKeywords.some(k => query.includes(k));

        if (query.includes('report') || query.includes('complaint')) {
            if (isNavigationRequest) {
                responseText = { 'en-US': "Sure, taking you to the report page now.", 'hi-IN': "ज़रूर, आपको रिपोर्ट पेज पर ले जा रहा हूँ।" };
                result = { action: 'navigate', targetId: isDesktop ? 'desktop-report-link' : 'bottom-nav-report', responseText: responseText[lang] || responseText['en-US'] };
            } else {
                responseText = { 'en-US': "I can help with that. The report button is right here.", 'hi-IN': "मैं इसमें मदद कर सकता हूँ। रिपोर्ट बटन यहाँ है।" };
                result = { action: 'highlight', targetId: isDesktop ? 'desktop-report-link' : 'bottom-nav-report', responseText: responseText[lang] || responseText['en-US'] };
            }
        } else if (query.includes('profile')) {
            if (isNavigationRequest) {
                responseText = { 'en-US': "Opening your profile.", 'hi-IN': "आपकी प्रोफ़ाइल खोल रहा हूँ।" };
                result = { action: 'navigate', targetId: isDesktop ? 'desktop-profile-link' : 'bottom-nav-profile', responseText: responseText[lang] || responseText['en-US'] };
            } else {
                responseText = { 'en-US': "Here is your profile section.", 'hi-IN': "यह आपका प्रोफ़ाइल अनुभाग है।" };
                result = { action: 'highlight', targetId: isDesktop ? 'desktop-profile-link' : 'bottom-nav-profile', responseText: responseText[lang] || responseText['en-US'] };
            }
        } else if (query.includes('home')) {
            if (isNavigationRequest) {
                responseText = { 'en-US': "Heading back home.", 'hi-IN': "घर वापस जा रहे हैं।" };
                result = { action: 'navigate', targetId: isDesktop ? 'desktop-home-link' : 'bottom-nav-home', responseText: responseText[lang] || responseText['en-US'] };
            } else {
                responseText = { 'en-US': "This is the home button.", 'hi-IN': "यह होम बटन है।" };
                result = { action: 'highlight', targetId: isDesktop ? 'desktop-home-link' : 'bottom-nav-home', responseText: responseText[lang] || responseText['en-US'] };
            }
        }

        return result;
    },

    processAIResponse(response) {
        clearTimeout(this.aiTimeout);
        if (response.responseText) {
            this.speak(response.responseText);
            this.widgets.forEach(w => w.setStatus(response.responseText));
        }
        if (this.currentHighlight) this.currentHighlight.classList.remove('ai-highlight');

        if (response.action === 'highlight' && response.targetId) {
            const element = document.getElementById(response.targetId);
            if (element) {
                if (this.isAiActive) this.widgets.forEach(w => w.deactivate());

                // Scroll first
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Add highlight after a short delay to allow scroll to start
                setTimeout(() => {
                    element.classList.add('ai-highlight');
                }, 300);

                this.currentHighlight = element;

                // Remove after 4 seconds
                setTimeout(() => {
                    if (this.currentHighlight === element) {
                        element.classList.remove('ai-highlight');
                        this.currentHighlight = null;
                    }
                }, 4000);
            }
        } else if (response.action === 'navigate' && response.targetId) {
            this.config.onNavigate(response.targetId);
        } else if (response.action === 'open_panel' && response.targetId) {
            if (this.isAiActive) this.widgets.forEach(w => w.deactivate());
            if (response.targetId === 'notification') {
                if (window.Notifications) window.Notifications.open();
            } else if (response.targetId === 'filter' && window.openFilter) {
                window.openFilter();
            } else if (response.targetId === 'settings' && window.openSettingsPanel) {
                window.openSettingsPanel();
            }
        } else if (response.action === 'summarize') {
            const summaryPoints = this.config.onSummarize();
            this.displaySummary(summaryPoints);
            this.aiTimeout = setTimeout(() => { if (this.isAiActive) this.widgets.forEach(w => w.deactivate()); }, 15000);
        } else {
            this.aiTimeout = setTimeout(() => { if (this.isAiActive) this.widgets.forEach(w => w.deactivate()); }, 5000);
        }
    },

    displaySummary(summaryPoints) {
        const existingBox = document.querySelector('#ai-summary-box');
        if (existingBox) existingBox.remove();

        const summaryBox = document.createElement('div');
        summaryBox.id = 'ai-summary-box';
        summaryBox.className = 'ai-summary-box';

        const title = document.createElement('h4');
        title.className = 'summary-title';
        title.textContent = 'Page Summary';
        summaryBox.appendChild(title);

        const list = document.createElement('ul');
        summaryPoints.forEach(point => {
            const li = document.createElement('li');
            li.textContent = point;
            list.appendChild(li);
        });
        summaryBox.appendChild(list);

        const activeWidget = document.querySelector('.ai-widget-container.active');
        if (activeWidget) {
            activeWidget.appendChild(summaryBox);
            requestAnimationFrame(() => {
                summaryBox.classList.add('visible');
            });
        }
    },

    speak(text) {
        if (!('speechSynthesis' in window)) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = this.getCurrentLanguage();
        utterance.onstart = () => { this.widgets.forEach(w => w.setState('speaking')); };
        utterance.onend = () => {
            this.widgets.forEach(w => w.setState('idle'));
            clearTimeout(this.aiTimeout);
            this.aiTimeout = setTimeout(() => { if (this.isAiActive) this.widgets.forEach(w => w.deactivate()); }, 5000);
        };
        window.speechSynthesis.speak(utterance);
    }
};
window.SetuAI = SetuAI;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Handle Page Load Expansion (replaces inline scripts)
    // 1. Handle Page Load Expansion
    // Use Double-RAF pattern to ensure the browser has painted the initial (collapsed) state
    // before applying the expanded class. This guarantees a smooth animation even on fast loads.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const activeItem = document.querySelector('.mobile-nav-item.active');
            if (activeItem) {
                activeItem.classList.add('delayed-expand');
            }
        });
    });

    // 2. Handle Navigation Click Transitions for smoother UX
    const navItems = document.querySelectorAll('.mobile-nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Allow default behavior for modifiers (new tab, etc.)
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

            // Immediately reset all items to contracted state
            navItems.forEach(nav => {
                nav.classList.remove('active', 'delayed-expand');
            });

            // Set the clicked item to active (but contracted) immediately
            // This provides instant visual feedback (black button) before page load
            item.classList.add('active');
        });
    });
});

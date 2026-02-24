import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy, limit, doc, getDoc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { generateResponse, clearKey, callSarvamAPI, getSarvamApiKey } from "./setu-ai.js";

// --- Firebase Config --- DO NOT COMMIT API KEY ---
const firebaseConfig = {
    apiKey: "AIzaSyD5MCFaYzkNhXQj1NKVmft680wgGu0Me8E",
    authDomain: "setu-6932f.firebaseapp.com",
    projectId: "setu-6932f",
    storageBucket: "setu-6932f.firebasestorage.app",
    messagingSenderId: "1060012410845",
    appId: "1:1060012410845:web:13da8942457a2d4ed89834"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Constants & State ---
const MAX_RESULTS = 50;
const RECENT_LIMIT = 3;
const CHAT_HISTORY_KEY = 'setuAI_chatHistory';
const CHAT_EXPIRY_DAYS = 7;
const MAX_CHATS = 5;
const EMOJIS = ["🔴", "🟥", "🟠", "🟧", "🟡", "🟨", "🟢", "🟩", "🔵", "🟦", "🟣", "🟪", "🟤", "🟫", "⚫", "⬛", "⚪", "⬜"];

let mainEmojiAnimationInterval = null;
let currentChatId = null;
let currentFirebaseUser = null; // Cached auth user
let cachedUserProfile = null;  // Cached user profile from Firestore

const statusStyles = {
    "Submitted": { bg: "bg-yellow-100", text: "text-yellow-800" },
    "In Progress": { bg: "bg-blue-100", text: "text-blue-800" },
    "Resolved": { bg: "bg-green-100", text: "text-green-800" }
};

// --- DOM Elements ---
const UI = {
    mainView: document.getElementById('search-view-main'),
    aiView: document.getElementById('search-view-ai'),
    transitionOverlay: document.getElementById('ai-transition-overlay'),

    mainSearchInput: document.getElementById('main-search-input'),
    mainSearchBtn: document.getElementById('main-search-btn'),
    aiEntryCard: document.getElementById('ai-entry-card'),
    searchHeader: document.getElementById('search-header'),
    recentSearchesList: document.getElementById('recent-searches-list'),
    searchResultsSection: document.getElementById('search-results-section'),
    recentSection: document.getElementById('recent-section'),
    aiLogoCircle: document.querySelector('.ai-logo-circle'),
    bottomNav: document.getElementById('bottom-nav'),

    aiInput: document.getElementById('ai-input'),
    aiSendBtn: document.getElementById('ai-send-btn'),
    aiChatArea: document.getElementById('ai-chat-area'),
    aiWelcome: document.getElementById('ai-welcome'),
    aiBackBtn: document.getElementById('ai-back-btn'),
    aiHistoryBtn: document.getElementById('ai-history-btn'),
    aiHistoryPanel: document.getElementById('ai-history-panel'),
    aiHistoryBackdrop: document.getElementById('ai-history-backdrop'),
    aiHistoryClose: document.getElementById('ai-history-close'),
    aiHistoryList: document.getElementById('ai-history-list'),
    aiWelcomeNameText: document.getElementById('ai-welcome-name-text'),
};

// --- Firebase Auth Listener - cache user as soon as auth resolves ---
onAuthStateChanged(auth, async (user) => {
    currentFirebaseUser = user;
    if (user) {
        try {
            const uDoc = await getDoc(doc(db, 'users', user.uid));
            if (uDoc.exists()) {
                cachedUserProfile = uDoc.data();
                console.log('[AI] User profile cached:', cachedUserProfile.fullname);
            }
        } catch (e) {
            console.warn('[AI] Failed to cache user profile:', e.message);
        }
    }
    // Also try localStorage
    if (!cachedUserProfile) {
        try {
            const lsProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
            if (lsProfile.fullname) cachedUserProfile = lsProfile;
        } catch (e) { /* ignore */ }
    }
});

// --- Initialization ---
let isSearchFocused = false;

document.addEventListener('DOMContentLoaded', () => {
    loadRecentSearches();
    startMainEmojiAnimation();
    cleanExpiredChats();

    if (UI.aiEntryCard) UI.aiEntryCard.addEventListener('click', () => toggleView('ai'));
    if (UI.aiBackBtn) UI.aiBackBtn.addEventListener('click', () => toggleView('main'));

    if (UI.aiHistoryBtn) UI.aiHistoryBtn.addEventListener('click', openHistoryPanel);
    if (UI.aiHistoryClose) UI.aiHistoryClose.addEventListener('click', closeHistoryPanel);
    if (UI.aiHistoryBackdrop) UI.aiHistoryBackdrop.addEventListener('click', closeHistoryPanel);

    if (UI.mainSearchBtn) UI.mainSearchBtn.addEventListener('click', executeStandardSearch);
    if (UI.mainSearchInput) {
        UI.mainSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') executeStandardSearch();
        });

        // Focus mode: heading fades, recent searches appear
        UI.mainSearchInput.addEventListener('focus', () => {
            if (!isSearchFocused) {
                isSearchFocused = true;
                UI.mainView.classList.add('search-focused');
                // Show recent searches when focusing (only if no results shown)
                if (!UI.searchResultsSection.classList.contains('visible')) {
                    loadRecentSearches();
                }
            }
        });

        // On input, if text is entered, hide recents and show live results
        UI.mainSearchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val.length === 0) {
                // Show recents, hide results
                UI.searchResultsSection.classList.remove('visible');
                UI.searchResultsSection.innerHTML = '';
                if (UI.recentSection) UI.recentSection.style.display = 'block';
            } else {
                // Hide recents when typing
                if (UI.recentSection) UI.recentSection.style.display = 'none';
            }
        });
    }

    // Click outside search to unfocus
    document.addEventListener('click', (e) => {
        if (isSearchFocused && UI.mainSearchInput) {
            const mainContainer = UI.mainView;
            const searchWrapper = UI.mainSearchInput.closest('.search-input-wrapper-1');
            const recentSec = UI.recentSection;
            const resultsSection = UI.searchResultsSection;

            // If click is outside search bar, recents, and results
            const clickedInside = searchWrapper?.contains(e.target) ||
                recentSec?.contains(e.target) ||
                resultsSection?.contains(e.target) ||
                UI.aiEntryCard?.contains(e.target);

            if (!clickedInside && UI.mainSearchInput.value.trim() === '') {
                isSearchFocused = false;
                UI.mainView.classList.remove('search-focused');
                UI.searchResultsSection.classList.remove('visible');
                UI.searchResultsSection.innerHTML = '';
            }
        }
    });

    if (UI.aiSendBtn) UI.aiSendBtn.addEventListener('click', executeAISearch);
    if (UI.aiInput) UI.aiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') executeAISearch();
    });

    // Mobile keyboard fix: keep input bar above keyboard
    if (window.visualViewport) {
        const inputArea = document.querySelector('.ai-chat-input-area');
        if (inputArea) {
            const adjustForKeyboard = () => {
                const vv = window.visualViewport;
                const bottomOffset = window.innerHeight - (vv.offsetTop + vv.height);
                inputArea.style.bottom = bottomOffset + 'px';
                // Adjust chat area padding to match
                if (UI.aiChatArea) {
                    UI.aiChatArea.style.paddingBottom = (bottomOffset + 80) + 'px';
                }
                scrollToBottom();
            };
            window.visualViewport.addEventListener('resize', adjustForKeyboard);
            window.visualViewport.addEventListener('scroll', adjustForKeyboard);
        }
    }
});

// --- Emoji animation for the AI card ---
function startMainEmojiAnimation() {
    if (!UI.aiLogoCircle) return;
    let index = 0;
    UI.aiLogoCircle.textContent = EMOJIS[0];
    mainEmojiAnimationInterval = setInterval(() => {
        index = (index + 1) % EMOJIS.length;
        UI.aiLogoCircle.textContent = EMOJIS[index];
    }, 5000);
}

// --- View Management ---
function toggleView(viewName) {
    if (viewName === 'ai') {
        // Smooth fade-in transition
        UI.transitionOverlay.classList.remove('fade-out');
        UI.transitionOverlay.classList.add('fade-in');

        // Switch views at the peak of the overlay opacity
        setTimeout(() => {
            requestAnimationFrame(() => {
                document.body.classList.add('ai-view-active');
                if (!currentChatId) {
                    currentChatId = 'chat_' + Date.now();
                }
                typeWelcomeName();
                setTimeout(() => UI.aiInput && UI.aiInput.focus(), 150);
            });
        }, 140);

        setTimeout(() => {
            UI.transitionOverlay.classList.remove('fade-in');
        }, 380);

    } else {
        // Smooth fade-out transition
        UI.transitionOverlay.classList.remove('fade-in');
        UI.transitionOverlay.classList.add('fade-out');

        setTimeout(() => {
            requestAnimationFrame(() => {
                document.body.classList.remove('ai-view-active');
            });
        }, 110);

        setTimeout(() => {
            UI.transitionOverlay.classList.remove('fade-out');
        }, 350);

        currentChatId = null;
        resetChatArea();
    }
}

function resetChatArea() {
    if (!UI.aiChatArea) return;
    const messages = UI.aiChatArea.querySelectorAll('.ai-chat-user, .ai-chat-ai, .ai-chat-time');
    messages.forEach(m => m.remove());
    if (UI.aiWelcome) UI.aiWelcome.style.display = 'flex';
    if (UI.aiInput) UI.aiInput.value = '';
    if (UI.aiWelcomeNameText) UI.aiWelcomeNameText.textContent = '';
}

// --- Welcome name typing animation ---
let welcomeTypingTimeout = null;
function typeWelcomeName() {
    if (!UI.aiWelcomeNameText) return;
    // Clear any previous animation
    if (welcomeTypingTimeout) clearTimeout(welcomeTypingTimeout);
    UI.aiWelcomeNameText.textContent = '';

    // Get user's first name
    let firstName = 'there';
    if (cachedUserProfile && cachedUserProfile.fullname) {
        firstName = cachedUserProfile.fullname.split(' ')[0];
    } else {
        try {
            const lsProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
            if (lsProfile.fullname) firstName = lsProfile.fullname.split(' ')[0];
        } catch (e) { /* ignore */ }
    }

    const fullText = `Hey ${firstName}, ask me anything`;
    let charIndex = 0;

    function typeNextChar() {
        if (charIndex < fullText.length) {
            UI.aiWelcomeNameText.textContent += fullText[charIndex];
            charIndex++;
            welcomeTypingTimeout = setTimeout(typeNextChar, 35 + Math.random() * 25);
        }
    }

    // Start with a small delay after view opens
    welcomeTypingTimeout = setTimeout(typeNextChar, 250);
}

// ===== CHAT HISTORY MANAGEMENT =====

function getChatHistory() {
    try {
        return JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveChatHistory(history) {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
}

function cleanExpiredChats() {
    const history = getChatHistory();
    const now = Date.now();
    const expiryMs = CHAT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const filtered = history.filter(chat => (now - chat.createdAt) < expiryMs);
    if (filtered.length !== history.length) {
        saveChatHistory(filtered);
    }
}

function saveMessageToChat(chatId, role, text) {
    let history = getChatHistory();
    let chat = history.find(c => c.id === chatId);
    if (!chat) {
        chat = {
            id: chatId,
            title: text.substring(0, 60),
            createdAt: Date.now(),
            messages: []
        };
        history.unshift(chat);
        // Enforce max chats limit — drop oldest
        if (history.length > MAX_CHATS) {
            history = history.slice(0, MAX_CHATS);
        }
    }
    chat.messages.push({ role, text, time: Date.now() });
    chat.lastActivity = Date.now();
    saveChatHistory(history);
}

function openHistoryPanel() {
    renderHistoryList();
    UI.aiHistoryPanel.classList.add('open');
    UI.aiHistoryBackdrop.classList.add('open');
}

function closeHistoryPanel() {
    UI.aiHistoryPanel.classList.remove('open');
    UI.aiHistoryBackdrop.classList.remove('open');
}

function renderHistoryList() {
    cleanExpiredChats();
    const history = getChatHistory();

    if (history.length === 0) {
        UI.aiHistoryList.innerHTML = `
            <div class="ai-history-empty">
                <div class="ai-history-empty-icon">💬</div>
                <div class="ai-history-empty-text">No chat history yet.<br>Start a conversation!</div>
            </div>
        `;
        return;
    }

    UI.aiHistoryList.innerHTML = history.map(chat => {
        const firstA = chat.messages.find(m => m.role === 'ai');
        const timeAgo = getTimeAgo(chat.createdAt);
        const preview = firstA ? firstA.text.substring(0, 80) + '...' : 'No response yet';
        return `
            <div class="ai-history-item" data-chat-id="${chat.id}">
                <div class="ai-history-item-content">
                    <div class="ai-history-item-title">${escapeHtml(chat.title)}</div>
                    <div class="ai-history-item-preview">${escapeHtml(preview)}</div>
                    <div class="ai-history-item-time">${timeAgo}</div>
                </div>
                <button class="ai-history-delete-btn" data-delete-id="${chat.id}" title="Delete chat">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                </button>
            </div>
        `;
    }).join('');

    // Click to load chat
    UI.aiHistoryList.querySelectorAll('.ai-history-item-content').forEach(content => {
        content.addEventListener('click', () => {
            const chatId = content.parentElement.dataset.chatId;
            loadChat(chatId);
            closeHistoryPanel();
        });
    });

    // Click to delete chat
    UI.aiHistoryList.querySelectorAll('.ai-history-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chatId = btn.dataset.deleteId;
            deleteChatById(chatId);
        });
    });
}

function deleteChatById(chatId) {
    let history = getChatHistory();
    history = history.filter(c => c.id !== chatId);
    saveChatHistory(history);
    // If we deleted the currently active chat, reset it
    if (currentChatId === chatId) {
        currentChatId = null;
        resetChatArea();
    }
    // Re-render the list
    renderHistoryList();
}

function loadChat(chatId) {
    const history = getChatHistory();
    const chat = history.find(c => c.id === chatId);
    if (!chat) return;

    currentChatId = chatId;

    const messages = UI.aiChatArea.querySelectorAll('.ai-chat-user, .ai-chat-ai, .ai-chat-time');
    messages.forEach(m => m.remove());
    if (UI.aiWelcome) UI.aiWelcome.style.display = 'none';

    chat.messages.forEach(msg => {
        if (msg.role === 'user') {
            appendUserBubble(msg.text);
        } else {
            appendAIBubble(msg.text, false);
        }
    });

    scrollToBottom();
}

function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== CHAT UI HELPERS =====

function appendUserBubble(text) {
    if (UI.aiWelcome) UI.aiWelcome.style.display = 'none';
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-chat-user';
    wrapper.innerHTML = `<div class="ai-chat-user-bubble">${escapeHtml(text)}</div>`;
    UI.aiChatArea.appendChild(wrapper);
    scrollToBottom();
}

function appendAIBubble(text, animate = true) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-chat-ai';

    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-ai-bubble';

    wrapper.appendChild(bubble);
    UI.aiChatArea.appendChild(wrapper);

    if (animate) {
        typeFormattedText(text, bubble);
    } else {
        bubble.innerHTML = formatAIResponse(text);
    }

    scrollToBottom();
    return bubble;
}

function appendThinkingBubble() {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-chat-ai ai-chat-thinking';
    wrapper.id = 'ai-thinking-bubble';

    // Emoji icon
    const emojiEl = document.createElement('span');
    emojiEl.className = 'ai-thinking-emoji';
    emojiEl.textContent = EMOJIS[0];

    // Right side: name + thinking dots
    const infoEl = document.createElement('div');
    infoEl.className = 'ai-thinking-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'ai-thinking-name';
    nameEl.textContent = 'Setu AI';

    const dotsLine = document.createElement('div');
    dotsLine.className = 'ai-thinking-dots-line';

    const thinkText = document.createElement('span');
    thinkText.textContent = 'Thinking';

    const dotsSpan = document.createElement('span');
    dotsSpan.className = 'ai-thinking-dots';
    dotsSpan.textContent = '.';

    dotsLine.appendChild(thinkText);
    dotsLine.appendChild(dotsSpan);

    infoEl.appendChild(nameEl);
    infoEl.appendChild(dotsLine);

    wrapper.appendChild(emojiEl);
    wrapper.appendChild(infoEl);
    UI.aiChatArea.appendChild(wrapper);

    // Cycle emojis — just swap, no animation
    let idx = 0;
    wrapper._emojiInterval = setInterval(() => {
        idx = (idx + 1) % EMOJIS.length;
        emojiEl.textContent = EMOJIS[idx];
    }, 600);

    // Animate dots: . → .. → ...
    let dotCount = 1;
    wrapper._dotsInterval = setInterval(() => {
        dotCount = (dotCount % 3) + 1;
        dotsSpan.textContent = '.'.repeat(dotCount);
    }, 500);

    scrollToBottom();
}

function removeThinkingBubble() {
    const bubble = document.getElementById('ai-thinking-bubble');
    if (bubble) {
        if (bubble._emojiInterval) clearInterval(bubble._emojiInterval);
        if (bubble._dotsInterval) clearInterval(bubble._dotsInterval);
        bubble.remove();
    }
}

function scrollToBottom() {
    if (UI.aiChatArea) {
        setTimeout(() => {
            UI.aiChatArea.scrollTop = UI.aiChatArea.scrollHeight;
        }, 50);
    }
}

// ===== AI RESPONSE FORMATTING =====

function formatAIResponse(text) {
    const lines = text.split('\n');
    let html = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === '') {
            html += '<div class="ai-spacer"></div>';
            continue;
        }

        const bulletMatch = line.match(/^([•\-\*]\s+|\d+\.\s+)/);

        if (bulletMatch) {
            const isNumbered = /^\d+\./.test(line);
            const marker = isNumbered ? bulletMatch[0].trim() : '•';
            const content = line.substring(bulletMatch[0].length);
            html += `<div class="ai-bullet-item">
                <span class="ai-bullet-marker">${marker}</span>
                <span class="ai-bullet-text">${formatInlineMarkdown(content)}</span>
            </div>`;
        } else {
            html += `<div class="ai-line">${formatInlineMarkdown(line)}</div>`;
        }
    }

    return html;
}

function formatInlineMarkdown(text) {
    return text.replace(/\*\*(.+?)\*\*/g, '<span class="ai-bold">$1</span>');
}

// Typing animation for AI responses
async function typeFormattedText(text, container) {
    const gradientColors = [
        '#ff6b6b', '#ff8e72', '#ffa94d', '#ffd43b',
        '#69db7c', '#38d9a9', '#74c0fc', '#748ffc',
        '#b197fc', '#e599f7', '#f783ac', '#ff6b6b'
    ];
    const WAVE_WIDTH = 10;
    const TYPING_SPEED = 25;
    const spans = [];
    let wordIndex = 0;

    function lerpColor(a, b, t) {
        const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
        const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
        const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
        return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
    }

    function getGradientColor(pos) {
        const scaled = pos * (gradientColors.length - 1);
        const idx = Math.floor(scaled);
        const t = scaled - idx;
        return lerpColor(gradientColors[Math.min(idx, gradientColors.length - 1)], gradientColors[Math.min(idx + 1, gradientColors.length - 1)], t);
    }

    const lines = text.split('\n');

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li].trim();

        if (line === '') {
            if (li > 0) {
                const spacer = document.createElement('div');
                spacer.className = 'ai-spacer';
                container.appendChild(spacer);
            }
            continue;
        }

        const bulletMatch = line.match(/^([•\-\*]\s+|\d+\.\s+)/);
        let lineContainer = container;

        if (bulletMatch) {
            const bulletDiv = document.createElement('div');
            bulletDiv.className = 'ai-bullet-item';

            const marker = document.createElement('span');
            marker.className = 'ai-bullet-marker';
            marker.textContent = line.match(/^\d+\./) ? bulletMatch[0].trim() : '•';
            bulletDiv.appendChild(marker);

            const content = document.createElement('span');
            content.className = 'ai-bullet-text';
            bulletDiv.appendChild(content);

            container.appendChild(bulletDiv);
            lineContainer = content;

            var wordsInLine = line.substring(bulletMatch[0].length).split(' ').filter(w => w);
        } else {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'ai-line';
            container.appendChild(lineDiv);
            lineContainer = lineDiv;

            var wordsInLine = line.split(' ').filter(w => w);
        }

        for (let wi = 0; wi < wordsInLine.length; wi++) {
            let word = wordsInLine[wi];
            const span = document.createElement('span');
            span.style.transition = 'color 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
            span.style.willChange = 'color';

            const isBold = word.includes('**');
            word = word.replace(/\*\*/g, '');
            span.textContent = word + ' ';
            span.style.fontWeight = isBold ? '700' : '450';
            if (isBold) span.style.color = '#1a1a1a';

            const wavePos = (wordIndex % WAVE_WIDTH) / WAVE_WIDTH;
            if (!isBold) span.style.color = getGradientColor(wavePos);

            lineContainer.appendChild(span);
            spans.push(span);
            wordIndex++;

            if (spans.length > WAVE_WIDTH) {
                const fadeSpan = spans[spans.length - WAVE_WIDTH - 1];
                if (fadeSpan && fadeSpan.style.fontWeight !== '700') {
                    fadeSpan.style.color = '#374151';
                }
            }

            scrollToBottom();
            await new Promise(r => setTimeout(r, TYPING_SPEED));
        }
    }

    spans.forEach(span => {
        if (span.style.fontWeight !== '700') {
            span.style.color = '#374151';
        }
    });

    return spans;
}

// --- Local Storage Management ---
function getRecent(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
        return [];
    }
}

function saveRecent(key, item) {
    let list = getRecent(key);
    list = list.filter(i => i.text.toLowerCase() !== item.text.toLowerCase());
    list.unshift(item);
    if (list.length > RECENT_LIMIT) list.pop();
    localStorage.setItem(key, JSON.stringify(list));
}

// --- Logic: Standard Search ---
function loadRecentSearches() {
    if (!UI.recentSearchesList) return;
    const list = getRecent('recentSearches');
    if (list.length === 0) {
        UI.recentSearchesList.innerHTML = '<div style="text-align:center; padding: 20px; color: #c7c7cc; font-size: 0.85rem;">No recent searches</div>';
        return;
    }
    UI.recentSearchesList.innerHTML = list.map(item => `
        <div class="recent-item cursor-pointer" onclick="handleRecentClick('${escapeHtml(item.text)}', 'main')">
            <div class="recent-icon-circle">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <div class="recent-content">
                <div class="recent-title">${escapeHtml(item.text)}</div>
                <div class="recent-time">${item.time}</div>
            </div>
            <div class="recent-arrow">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
            </div>
        </div>
    `).join('');
}

window.handleRecentClick = (text, type) => {
    if (type === 'main') {
        UI.mainSearchInput.value = text;
        if (UI.recentSection) UI.recentSection.style.display = 'none';
        executeStandardSearch();
    }
};

async function executeStandardSearch() {
    const queryText = UI.mainSearchInput.value.trim();
    if (!queryText) return;

    // Enter focus mode
    if (!isSearchFocused) {
        isSearchFocused = true;
        UI.mainView.classList.add('search-focused');
    }

    saveRecent('recentSearches', { text: queryText, time: 'Just now' });

    // Hide recents, show results section
    if (UI.recentSection) UI.recentSection.style.display = 'none';
    UI.searchResultsSection.classList.add('visible');

    // Show loading skeletons
    UI.searchResultsSection.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">
            ${[1, 2, 3].map(() => `
                <div class="search-skeleton">
                    <div class="skel-img"></div>
                    <div class="skel-text">
                        <div class="skel-line" style="width:70%"></div>
                        <div class="skel-line" style="width:50%"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    try {
        // Fetch both reports and officers in parallel
        const [reports, officers] = await Promise.all([
            fetchReports(queryText),
            fetchOfficers(queryText)
        ]);

        let html = '';

        // Officers section
        if (officers.length > 0) {
            html += '<div class="result-section-label">Officers</div>';
            html += '<div style="display:flex;flex-direction:column;gap:10px;">';
            html += officers.map(createOfficerCard).join('');
            html += '</div>';
        }

        // Reports section
        if (reports.length > 0) {
            html += '<div class="result-section-label">Reports</div>';
            html += '<div style="display:flex;flex-direction:column;gap:10px;">';
            html += reports.map(createReportCard).join('');
            html += '</div>';
        }

        // No results  
        if (reports.length === 0 && officers.length === 0) {
            html += `
                <div class="no-results">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <h4>No results found</h4>
                    <p>Try different keywords or let Setu AI help you find what you're looking for.</p>
                </div>
            `;
        }

        // Always add "Search with Setu AI" button
        html += createAISearchButton(queryText);

        UI.searchResultsSection.innerHTML = html;

        // Bind the AI search button
        const aiBtn = document.getElementById('search-with-ai-btn');
        if (aiBtn) {
            aiBtn.addEventListener('click', () => {
                const searchQuery = aiBtn.dataset.query;
                // Switch to AI view and populate the input
                toggleView('ai');
                setTimeout(() => {
                    if (UI.aiInput) {
                        UI.aiInput.value = searchQuery;
                        UI.aiInput.focus();
                    }
                }, 400);
            });
        }

    } catch (error) {
        console.error('[Search] Error:', error);
        UI.searchResultsSection.innerHTML = `
            <div class="no-results">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <h4>Something went wrong</h4>
                <p>Please try again or search with Setu AI.</p>
            </div>
            ${createAISearchButton(queryText)}
        `;
    }
}

// --- Logic: AI Search ---
async function executeAISearch() {
    const queryText = UI.aiInput.value.trim();
    if (!queryText) return;

    if (!currentChatId) {
        currentChatId = 'chat_' + Date.now();
    }

    appendUserBubble(queryText);
    saveMessageToChat(currentChatId, 'user', queryText);
    UI.aiInput.value = '';

    appendThinkingBubble();

    try {
        await askSetuAI(queryText);
    } catch (e) {
        removeThinkingBubble();
        appendAIBubble(`Sorry, I encountered an error: ${e.message}. Please try again.`, false);
    }
}

// ===== DATA-AWARE AI HELPERS (RAG) =====

function detectQueryIntent(prompt) {
    const lower = prompt.toLowerCase();
    const intents = { needsData: false, types: [] };
    const issueKw = ['pothole', 'streetlight', 'garbage', 'water', 'sewage', 'drainage', 'road', 'traffic', 'waste', 'light', 'broken', 'damage', 'dump', 'flood', 'leak', 'electricity', 'sewer', 'park', 'footpath', 'sidewalk', 'bridge', 'signal', 'noise', 'pollution', 'stray', 'animal', 'manhole', 'pipeline'];

    if (/\b(my report|my complaint|my issue|my submission|i reported|i submitted|i filed|did i|have i)\b/i.test(lower)) {
        intents.needsData = true; intents.types.push('my_reports');
    }
    // Detect update/status queries — also fetch officer info and notifications
    if (/\b(update|updates|any update|latest update|what.*(happen|update|progress|going on)|status update|news on|follow.?up|action taken|work start|work began|resolution|when.*(fix|resolv|complet|start)|is.*(being|anyone|officer).*(work|handl|look|assign))\b/i.test(lower)) {
        intents.needsData = true;
        if (!intents.types.includes('report_updates')) intents.types.push('report_updates');
        if (!intents.types.includes('my_reports')) intents.types.push('my_reports');
        if (!intents.types.includes('officer_info')) intents.types.push('officer_info');
    }
    if ((/\b(status|progress|update|resolved|pending|submitted|in progress|detail|info|check|show|find|get|fetch|look|search|any|what|which|where|list|tell)\b/i.test(lower) &&
        /\b(report|complaint|issue|problem|case|ticket)\b/i.test(lower)) || issueKw.some(k => lower.includes(k))) {
        intents.needsData = true;
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    if (/\b(reported by|who reported|filed by|submitted by|complaints?\s*(of|by|from)|reports?\s*(of|by|from))\b/i.test(lower)) {
        intents.needsData = true;
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    if (/\b(officer|authority|authorities|department|who.*(handl|assign|responsible|work)|assign.*(to|officer)|in\s*charge|municipal|corporation|nagar|panchayat|jurisdiction)\b/i.test(lower)) {
        intents.needsData = true;
        if (!intents.types.includes('officer_info')) intents.types.push('officer_info');
    }
    if (/\b(how many|count|total|statistic|stats|number of|pending report|resolved report|summary|overview|data|analytics|trend)\b/i.test(lower)) {
        intents.needsData = true; intents.types.push('stats');
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    if (/\b(in my area|nearby|my city|around me|my local|my district|my village|in my|near me|my town|my block|my ward|my zone)\b/i.test(lower)) {
        intents.needsData = true; intents.types.push('area_reports');
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    if (/\b(all report|recent report|latest report|show report|list report|recent issue|all issue|every report|open report|active report)\b/i.test(lower)) {
        intents.needsData = true;
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    // Catch-all: if user mentions a city name or location with report context
    if (/\b(reports?|issues?|complaints?)\b/i.test(lower) && !intents.needsData) {
        intents.needsData = true;
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    return intents;
}

function formatAITimestamp(ts) {
    if (!ts) return 'Unknown date';
    try {
        const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return 'Unknown date'; }
}

async function fetchRelevantData(intent) {
    const result = { myReports: [], reports: [], officers: [], stats: null, currentUser: null, userCity: '', notifications: [] };

    // Use cached user or try to get from auth
    const user = currentFirebaseUser || auth.currentUser;

    // Always get user profile for personalization
    if (user) {
        try {
            // Use cached profile if available, otherwise fetch
            let ud = cachedUserProfile;
            if (!ud) {
                const uDoc = await getDoc(doc(db, 'users', user.uid));
                if (uDoc.exists()) {
                    ud = uDoc.data();
                    cachedUserProfile = ud;
                }
            }
            if (ud) {
                result.currentUser = {
                    name: ud.fullname || 'User',
                    city: ud.city || '',
                    role: ud.role || 'citizen',
                    email: ud.email || '',
                    phone: ud.phone || ''
                };
                result.userCity = ud.city || '';
            }
        } catch (e) { console.warn('[AI] User profile fetch failed:', e.message); }
    }

    // Also try getting from localStorage as fallback
    if (!result.currentUser) {
        try {
            const lsProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
            if (lsProfile.fullname) {
                result.currentUser = {
                    name: lsProfile.fullname,
                    city: lsProfile.city || '',
                    role: lsProfile.role || 'citizen'
                };
                result.userCity = lsProfile.city || '';
            }
        } catch (e) { /* ignore parse error */ }
    }

    if (intent.types.includes('my_reports') && user) {
        try {
            let q;
            try { q = query(collection(db, 'reports'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)); }
            catch { q = query(collection(db, 'reports'), where('userId', '==', user.uid), limit(20)); }
            const snap = await getDocs(q);
            snap.forEach(d => {
                const r = d.data();
                result.myReports.push({
                    id: d.id, issueType: r.issueType || 'Unknown', description: (r.description || '').substring(0, 120),
                    status: r.status || 'Unknown', location: r.location?.full || r.location?.city || 'Unknown',
                    city: r.location?.city || '', createdAt: formatAITimestamp(r.createdAt),
                    department: r.assignedDepartment || r.department || 'Not assigned',
                    assignedOfficerName: r.assignedOfficerName || '',
                    assignedOfficerPhone: r.assignedOfficerPhone || '',
                    workStartDate: r.workStartDate || '',
                    resolutionDuration: r.resolutionDuration || '',
                    actionTakenAt: formatAITimestamp(r.actionTakenAt),
                    lastUpdatedAt: formatAITimestamp(r.lastUpdatedAt)
                });
            });
        } catch (e) { console.warn('[AI] My reports fetch failed:', e.message); }
    }

    // Fetch notifications for the user (report updates from officers)
    if (intent.types.includes('report_updates') && user) {
        try {
            const nq = query(collection(db, 'notifications'), where('recipientId', '==', user.uid));
            const nsnap = await getDocs(nq);
            nsnap.forEach(d => {
                const n = d.data();
                result.notifications.push({
                    reportId: n.reportId || '',
                    type: n.type || '',
                    title: n.title || '',
                    message: n.message || '',
                    officerName: n.actionData?.officerName || '',
                    officerPhone: n.actionData?.officerPhone || '',
                    startDate: n.actionData?.startDate || '',
                    resolutionDuration: n.actionData?.resolutionDuration || '',
                    previousStatus: n.actionData?.previousStatus || '',
                    newStatus: n.actionData?.newStatus || '',
                    department: n.department || '',
                    createdAt: formatAITimestamp(n.createdAt),
                    isRead: n.isRead || false
                });
            });
            // Sort newest first
            result.notifications.sort((a, b) => {
                const at = a.createdAt || ''; const bt = b.createdAt || '';
                return bt.localeCompare(at);
            });
        } catch (e) { console.warn('[AI] Notifications fetch failed:', e.message); }
    }

    if (intent.types.includes('report_lookup') || intent.types.includes('stats') || intent.types.includes('area_reports')) {
        try {
            let q;
            try { q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50)); }
            catch { q = query(collection(db, 'reports'), limit(50)); }
            const snap = await getDocs(q);
            const uidSet = new Set();
            const raw = [];
            snap.forEach(d => { const r = d.data(); raw.push({ id: d.id, ...r }); if (r.userId) uidSet.add(r.userId); });

            const nameMap = {};
            await Promise.all([...uidSet].slice(0, 30).map(async uid => {
                try { const ud = await getDoc(doc(db, 'users', uid)); if (ud.exists()) nameMap[uid] = ud.data().fullname || 'Anonymous'; }
                catch { nameMap[uid] = 'Anonymous'; }
            }));

            raw.forEach(r => {
                result.reports.push({
                    id: r.id, issueType: r.issueType || 'Unknown', description: (r.description || '').substring(0, 120),
                    status: r.status || 'Unknown', location: r.location?.full || r.location?.city || 'Unknown',
                    city: r.location?.city || '', area: r.location?.area || '', district: r.location?.district || '',
                    state: r.location?.state || '',
                    createdAt: formatAITimestamp(r.createdAt), department: r.assignedDepartment || r.department || 'Not assigned',
                    reporterName: nameMap[r.userId] || 'Anonymous',
                    assignedOfficerName: r.assignedOfficerName || '',
                    workStartDate: r.workStartDate || '',
                    resolutionDuration: r.resolutionDuration || '',
                    actionTakenAt: formatAITimestamp(r.actionTakenAt),
                    lastUpdatedAt: formatAITimestamp(r.lastUpdatedAt)
                });
            });
        } catch (e) { console.warn('[AI] Reports fetch failed:', e.message); }
    }

    if (intent.types.includes('officer_info')) {
        try {
            const q = query(collection(db, 'users'), where('role', '==', 'authority'));
            const snap = await getDocs(q);
            snap.forEach(d => {
                const u = d.data();
                const o = { name: u.fullname || 'Unknown', department: u.department || 'Not specified', city: u.city || 'Not specified', phone: u.phone || '' };
                if (u.jurisdiction) {
                    o.state = u.jurisdiction.state || ''; o.district = u.jurisdiction.district || '';
                    o.subDistrict = u.jurisdiction.subDistrict || ''; o.villages = (u.jurisdiction.villages || []).join(', ');
                }
                result.officers.push(o);
            });
        } catch (e) { console.warn('[AI] Officers fetch failed:', e.message); }
    }

    if (intent.types.includes('stats') && result.reports.length > 0) {
        const s = { total: result.reports.length, submitted: 0, inProgress: 0, resolved: 0, byType: {}, byCity: {} };
        result.reports.forEach(r => {
            if (r.status === 'Submitted') s.submitted++;
            else if (r.status === 'In Progress') s.inProgress++;
            else if (r.status === 'Resolved') s.resolved++;
            s.byType[r.issueType] = (s.byType[r.issueType] || 0) + 1;
            if (r.city) s.byCity[r.city] = (s.byCity[r.city] || 0) + 1;
        });
        result.stats = s;
    }

    return result;
}

function buildDataContext(data, intent) {
    let ctx = '';
    if (data.currentUser) ctx += `\n--- CURRENT USER (the person asking this question) ---\nName: ${data.currentUser.name} | City: ${data.currentUser.city || 'Not set'} | Role: ${data.currentUser.role}\n`;

    if (data.myReports.length > 0) {
        ctx += `\n--- THIS USER'S OWN REPORTS (${data.myReports.length}) ---\n`;
        data.myReports.forEach((r, i) => {
            ctx += `${i + 1}. [${r.issueType}] Status: ${r.status} | Location: ${r.location} | Date: ${r.createdAt} | Dept: ${r.department}`;
            if (r.assignedOfficerName) ctx += ` | Assigned Officer: ${r.assignedOfficerName}`;
            if (r.workStartDate) ctx += ` | Work Start: ${r.workStartDate}`;
            if (r.resolutionDuration) ctx += ` | Est. Resolution: ${r.resolutionDuration}`;
            if (r.actionTakenAt && r.actionTakenAt !== 'Unknown date') ctx += ` | Action Taken On: ${r.actionTakenAt}`;
            if (r.lastUpdatedAt && r.lastUpdatedAt !== 'Unknown date') ctx += ` | Last Updated: ${r.lastUpdatedAt}`;
            if (r.description) ctx += ` | Info: ${r.description}`;
            ctx += '\n';
        });
    }

    // Include notifications / updates for the user
    if (data.notifications && data.notifications.length > 0) {
        ctx += `\n--- REPORT UPDATES & NOTIFICATIONS (${data.notifications.length}) ---\n`;
        data.notifications.slice(0, 15).forEach((n, i) => {
            ctx += `${i + 1}. ${n.title}`;
            if (n.message) ctx += ` — ${n.message}`;
            if (n.officerName) ctx += ` | Officer: ${n.officerName}`;
            if (n.department) ctx += ` | Dept: ${n.department}`;
            if (n.startDate) ctx += ` | Work Start: ${n.startDate}`;
            if (n.resolutionDuration) ctx += ` | Est. Resolution: ${n.resolutionDuration}`;
            if (n.previousStatus && n.newStatus) ctx += ` | Status Change: ${n.previousStatus} → ${n.newStatus}`;
            ctx += ` | Date: ${n.createdAt}`;
            ctx += '\n';
        });
    }

    if (intent.types.includes('report_lookup') || intent.types.includes('area_reports')) {
        let reps = data.reports;
        if (intent.types.includes('area_reports') && data.userCity) {
            const uc = data.userCity.toLowerCase();
            const filtered = reps.filter(r => [r.city, r.area, r.district, r.location].some(f => (f || '').toLowerCase().includes(uc)));
            if (filtered.length > 0) reps = filtered;
        }
        const show = reps.slice(0, 20);
        if (show.length > 0) {
            ctx += `\n--- ALL REPORTS IN SYSTEM (${show.length} of ${reps.length}) ---\n`;
            show.forEach((r, i) => {
                ctx += `${i + 1}. [${r.issueType}] Status: ${r.status} | Location: ${r.location} | Date: ${r.createdAt} | By: ${r.reporterName} | Dept: ${r.department}`;
                if (r.assignedOfficerName) ctx += ` | Assigned Officer: ${r.assignedOfficerName}`;
                if (r.workStartDate) ctx += ` | Work Start: ${r.workStartDate}`;
                if (r.resolutionDuration) ctx += ` | Est. Resolution: ${r.resolutionDuration}`;
                if (r.lastUpdatedAt && r.lastUpdatedAt !== 'Unknown date') ctx += ` | Last Updated: ${r.lastUpdatedAt}`;
                if (r.description) ctx += ` | Info: ${r.description}`;
                ctx += '\n';
            });
            if (reps.length > 20) ctx += `...and ${reps.length - 20} more\n`;
        } else { ctx += '\n--- No matching reports found ---\n'; }
    }

    if (data.officers.length > 0) {
        ctx += `\n--- OFFICERS / AUTHORITIES (${data.officers.length}) ---\n`;
        data.officers.forEach((o, i) => {
            ctx += `${i + 1}. ${o.name} | Dept: ${o.department} | City: ${o.city}`;
            if (o.state) ctx += ` | State: ${o.state}`;
            if (o.district) ctx += ` | District: ${o.district}`;
            if (o.subDistrict) ctx += ` | Sub-Dist: ${o.subDistrict}`;
            if (o.villages) ctx += ` | Villages/Jurisdiction: ${o.villages}`;
            ctx += '\n';
        });
    }

    if (data.stats) {
        ctx += `\n--- STATISTICS ---\nTotal: ${data.stats.total} | Submitted: ${data.stats.submitted} | In Progress: ${data.stats.inProgress} | Resolved: ${data.stats.resolved}\n`;
        if (Object.keys(data.stats.byType).length) ctx += 'By Type: ' + Object.entries(data.stats.byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}(${c})`).join(', ') + '\n';
        if (Object.keys(data.stats.byCity).length) ctx += 'By City: ' + Object.entries(data.stats.byCity).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}(${n})`).join(', ') + '\n';
    }

    return ctx;
}

// ===== END RAG HELPERS =====

async function askSetuAI(prompt) {
    if (!getSarvamApiKey()) {
        removeThinkingBubble();
        throw new Error("Sarvam API key not set. Please add your API key in Profile settings.");
    }

    // ALWAYS detect intent and try to fetch data
    const intent = detectQueryIntent(prompt);
    let dataContext = '';

    // Always fetch user profile for personalization, even if no data intent
    const user = currentFirebaseUser || auth.currentUser;
    let userCtx = '';

    if (user || cachedUserProfile) {
        try {
            let profile = cachedUserProfile;
            if (!profile && user) {
                const uDoc = await getDoc(doc(db, 'users', user.uid));
                if (uDoc.exists()) {
                    profile = uDoc.data();
                    cachedUserProfile = profile;
                }
            }
            if (profile) {
                userCtx = `\n--- CURRENT USER (who is asking this question) ---\nName: ${profile.fullname || 'User'} | City: ${profile.city || 'Not set'} | Role: ${profile.role || 'citizen'}\n`;
            }
        } catch (e) {
            console.warn('[AI] Profile fetch for context failed:', e.message);
        }
    }

    // Fallback: try localStorage
    if (!userCtx) {
        try {
            const lsProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
            if (lsProfile.fullname) {
                userCtx = `\n--- CURRENT USER (who is asking this question) ---\nName: ${lsProfile.fullname} | City: ${lsProfile.city || 'Not set'} | Role: ${lsProfile.role || 'citizen'}\n`;
            }
        } catch (e) { /* ignore parse error */ }
    }

    if (intent.needsData) {
        console.log('[Setu AI] Data query detected. Intents:', intent.types);
        try {
            const data = await fetchRelevantData(intent);
            dataContext = buildDataContext(data, intent);
            console.log('[Setu AI] Data context built, length:', dataContext.length);
        } catch (e) {
            console.warn('[Setu AI] Data fetch error, falling back:', e.message);
        }
    }

    const SETU_KNOWLEDGE = `
=== ABOUT SETU ===
Setu is a civic issue reporting platform bridging citizens and municipal authorities.
"Setu" means "bridge" in Hindi/Sanskrit.

=== HOW IT WORKS ===
Citizens: Snap & Send (report with photo+location), Track Progress (real-time status), Stay Informed (community map).
Authorities: Unified Dashboard, Assign & Act (auto-routing), Analyze Data (insights).

=== ISSUE TYPES ===
Potholes, streetlights, garbage/waste, water supply, sewage/drainage, public property damage, traffic signals, other civic issues.

=== STATUSES ===
Submitted = pending review, In Progress = being worked on, Resolved = fixed.

=== FEATURES ===
Intuitive design, multilingual (14 Indian languages), full transparency, data-driven insights.

=== APP SECTIONS ===
Home, Search, Report, Updates, Profile, Report Feed, Your Reports.
`;

    const SETU_AI_PERSONA = `You are Setu AI, the official assistant for the Setu civic issue reporting platform.

IMPORTANT: You are chatting with a real user. Their profile data is provided below. Use their NAME to greet them personally. Be warm and conversational like a helpful friend.

YOU HAVE REAL-TIME DATABASE ACCESS. When database data is provided after "[REAL-TIME DATABASE DATA]", that data is REAL and ACCURATE from the live Firestore database. You MUST use it to give specific, factual answers. ABSOLUTELY DO NOT say "I can't access the database" or "I don't have access to your data" — the data IS right there in the message. Read it carefully and answer from it.

IMPORTANT DATA INSTRUCTIONS:
- The data sections labeled "--- THIS USER'S OWN REPORTS ---" contain the logged-in user's personal reports. USE THEM when they ask about "my reports".
- The data sections labeled "--- REPORT UPDATES & NOTIFICATIONS ---" contain status updates from officers/authorities, including which officer was assigned, when work started, and estimated resolution time. USE THEM when the user asks about updates or progress.
- The data sections labeled "--- ALL REPORTS IN SYSTEM ---" contain all public reports. USE THEM when they ask about any reports, issues, or civic problems.
- The data sections labeled "--- OFFICERS / AUTHORITIES ---" contain authority/officer details including their JURISDICTION (state, district, sub-district, villages). USE THEM when asked about officers, departments, or who is in charge of an area.
- The data sections labeled "--- STATISTICS ---" contain aggregate numbers. USE THEM when asked about counts, totals, or stats.
- If a specific report/issue is asked about, SEARCH through the provided data and pick matching entries.
- If the data section says "No matching reports found", then say so honestly.

OFFICER & UPDATE RESPONSE RULES:
- When a report has an "Assigned Officer" field, ALWAYS tell the user the officer's name.
- When a report has "Work Start" or "Est. Resolution", share those dates/timelines.
- When the user asks "any updates?", check BOTH their report statuses AND the notifications section for detailed update info.
- When the user asks about the officer handling their report, check: 1) The "Assigned Officer" field in their reports, 2) The notifications for officer assignment info, 3) The "OFFICERS / AUTHORITIES" section to find jurisdiction-matching officers (match by report location vs officer's jurisdiction district/villages).
- If no officer has been assigned yet (Assigned Officer is empty), tell the user honestly: the report is still pending assignment, and mention which department it falls under.
- If an officer's jurisdiction matches the report's location, you can tell the user that this officer is responsible for their area.

STRICT PRIVACY RULES:
1. CITIZENS: Only mention their NAME when saying who reported an issue. NEVER reveal phone, email, DOB, Aadhaar, or ID numbers.
2. OFFICERS/AUTHORITIES: You may share their NAME, DEPARTMENT, CITY, and JURISDICTION. NEVER reveal phone, email, DOB, or ID.
3. NEVER expose system IDs, passwords, or internal data.

PERSONALIZATION:
- Greet the user by their first name (e.g. "Hey Rahul!")
- Reference their city when relevant
- Be friendly and warm — not robotic

RESPONSE FORMAT (MANDATORY):
- Start with a brief personalized 1-line greeting.
- Then leave an empty line.
- Use dash bullet points (- ) for each detail item. Example: "- **Status:** In Progress"
- Each piece of information MUST be its own bullet point on a new line.
- For report listings, use numbered lists (1. 2. 3.).
- Use **bold** for labels.
- Leave empty lines between sections.
- End with a helpful closing line.

RESPONSE LENGTH: Keep responses under 200 words. Be concise and punchy. Do NOT write essays.

RESPONSE RULES:
1. When database data is provided, ALWAYS give SPECIFIC answers using ACTUAL data from it. NEVER ignore the data.
2. ALWAYS use bullet points or numbered lists.
3. Be friendly, warm, and concise.
4. Statuses: "Submitted" = pending review/assignment, "In Progress" = officer assigned and working on it, "Resolved" = fixed.
5. If no matching data, say so honestly and suggest alternatives.
6. If asked about unrelated topics, redirect politely in 1-2 sentences.
7. When no database data is provided, answer from general Setu knowledge.
8. When user asks for updates, provide: current status, assigned officer (if any), work start date (if set), estimated resolution time (if available), and which department is handling it.

SETU PLATFORM KNOWLEDGE:
${SETU_KNOWLEDGE}

Use REAL DATA when available. Be accurate, helpful, personalized, and protect user privacy.`;

    // Build the full message with all context
    let userMessage = prompt;
    const contextParts = [];
    if (userCtx) contextParts.push(userCtx);
    if (dataContext) contextParts.push(dataContext);

    if (contextParts.length > 0) {
        userMessage = `${prompt}\n\n[REAL-TIME DATABASE DATA]:\n${contextParts.join('\n')}`;
    }

    console.log('[Setu AI] Sending to Sarvam-M with context length:', userMessage.length);

    const messages = [
        { role: 'system', content: SETU_AI_PERSONA },
        { role: 'user', content: userMessage }
    ];

    const text = await callSarvamAPI(messages);

    removeThinkingBubble();
    saveMessageToChat(currentChatId, 'ai', text);
    appendAIBubble(text, true);
}

// --- Fetch Helpers ---

async function fetchReports(queryText) {
    const qLower = queryText.toLowerCase();
    const queryWords = qLower.split(/\s+/).filter(w => w.length > 1);
    console.log('[Search] Searching reports for:', queryWords);

    try {
        const reportsRef = collection(db, 'reports');
        let q;

        try {
            q = query(reportsRef, orderBy('createdAt', 'desc'), limit(100));
        } catch (indexError) {
            console.warn('[Search] Index not available, fetching without order');
            q = query(reportsRef, limit(100));
        }

        const snapshot = await getDocs(q);
        console.log('[Search] Total documents fetched:', snapshot.size);

        const scored = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const fields = [
                data.description || '',
                data.issueType || '',
                data.location?.full || '',
                data.location?.city || '',
                data.location?.area || '',
                data.location?.district || '',
                data.location?.state || '',
                data.status || '',
                data.assignedDepartment || '',
                data.department || ''
            ].join(' ').toLowerCase();

            // Score: count how many query words match
            let score = 0;
            for (const word of queryWords) {
                if (fields.includes(word)) score++;
            }
            // Full-phrase bonus
            if (fields.includes(qLower)) score += queryWords.length;

            if (score > 0) {
                scored.push({ score, report: { id: docSnap.id, ...data } });
            }
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        const reports = scored.slice(0, 20).map(s => s.report);

        console.log('[Search] Matching reports:', reports.length);
        return reports;
    } catch (e) {
        console.error('[Search] Fetch error:', e);
        return [];
    }
}

async function fetchOfficers(queryText) {
    const qLower = queryText.toLowerCase();
    const queryWords = qLower.split(/\s+/).filter(w => w.length > 1);
    console.log('[Search] Searching officers for:', queryWords);

    try {
        const q = query(collection(db, 'users'), where('role', '==', 'authority'));
        const snapshot = await getDocs(q);

        const scored = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const fields = [
                data.fullname || '',
                data.displayName || '',
                data.department || '',
                data.city || '',
                data.email || '',
                data.jurisdiction?.state || '',
                data.jurisdiction?.district || '',
                data.jurisdiction?.subDistrict || '',
                (data.jurisdiction?.villages || []).join(' ')
            ].join(' ').toLowerCase();

            let score = 0;
            for (const word of queryWords) {
                if (fields.includes(word)) score++;
            }
            if (fields.includes(qLower)) score += queryWords.length;

            if (score > 0) {
                scored.push({ score, officer: { id: docSnap.id, ...data } });
            }
        });

        scored.sort((a, b) => b.score - a.score);
        console.log('[Search] Matching officers:', scored.length);
        return scored.slice(0, 10).map(s => s.officer);
    } catch (e) {
        console.error('[Search] Officers fetch error:', e);
        return [];
    }
}

function getStatusBadgeClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'submitted') return 'badge-submitted';
    if (s.includes('progress')) return 'badge-in-progress';
    if (s === 'resolved') return 'badge-resolved';
    if (s.includes('pending')) return 'badge-pending';
    return 'badge-submitted';
}

function formatSearchDate(ts) {
    if (!ts) return '';
    try {
        const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch { return ''; }
}

function createReportCard(c) {
    const statusBadge = getStatusBadgeClass(c.status);
    const dateStr = formatSearchDate(c.createdAt);
    const location = c.location?.full || c.location?.city || c.location?.area || 'Unknown Location';
    const truncatedLocation = location.length > 45 ? location.substring(0, 42) + '...' : location;
    const imgSrc = c.imageUrl || '';
    const imgHtml = imgSrc
        ? `<img src="${imgSrc}" class="result-card-img" alt="Report" onerror="this.style.display='none'">`
        : `<div class="result-card-img" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem;">${getIssueEmoji(c.issueType)}</div>`;

    return `
    <div class="result-card">
        ${imgHtml}
        <div class="result-card-body">
            <div class="result-card-title">${escapeHtml(c.issueType || 'Report')}</div>
            <div class="result-card-sub">${escapeHtml(truncatedLocation)}${dateStr ? ' · ' + dateStr : ''}</div>
        </div>
        <span class="result-card-badge ${statusBadge}">${escapeHtml(c.status || 'Submitted')}</span>
    </div>`;
}

function createOfficerCard(o) {
    const name = o.fullname || o.displayName || 'Officer';
    const dept = o.department || 'Municipal';
    const city = o.city || '';
    const initial = name.charAt(0).toUpperCase();

    return `
    <div class="result-card">
        <div class="result-card-img" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-weight:700;font-size:1.2rem;">${initial}</div>
        <div class="result-card-body">
            <div class="result-card-title">${escapeHtml(name)}</div>
            <div class="result-card-sub">${escapeHtml(dept)}${city ? ' · ' + escapeHtml(city) : ''}</div>
        </div>
        <span class="result-card-badge badge-officer">Officer</span>
    </div>`;
}

function getIssueEmoji(issueType) {
    const type = (issueType || '').toLowerCase();
    if (type.includes('pothole') || type.includes('road')) return '🛣️';
    if (type.includes('light') || type.includes('street')) return '💡';
    if (type.includes('garbage') || type.includes('waste') || type.includes('dump')) return '🗑️';
    if (type.includes('water') || type.includes('supply')) return '💧';
    if (type.includes('sewage') || type.includes('drain')) return '🚰';
    if (type.includes('traffic') || type.includes('signal')) return '🚦';
    if (type.includes('park') || type.includes('garden')) return '🌳';
    if (type.includes('electric') || type.includes('power')) return '⚡';
    return '📋';
}

function createAISearchButton(queryText) {
    return `
    <button id="search-with-ai-btn" class="ai-search-btn" data-query="${escapeHtml(queryText)}">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
        <span class="ai-search-btn-text">Search with Setu AI</span>
        <svg class="ai-search-btn-arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
    </button>
    `;
}

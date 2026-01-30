import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy, limit, doc, getDoc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { generateResponse, clearKey } from "./setu-ai.js";

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyB7uvvN3Xlo64pKCkJwfjGXtdqHuHIG0mI",
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
const EMOJIS = ["🔴", "🟥", "🟠", "🟧", "🟡", "🟨", "🟢", "🟩", "🔵", "🟦", "🟣", "🟪", "🟤", "🟫", "⚫", "⬛", "⚪", "⬜"];

// State for emoji animation on the main "Ask Setu AI" card (slow, 5s)
let mainEmojiAnimationInterval = null;

// Styles for standard search results
const statusStyles = {
    "Submitted": { bg: "bg-yellow-100", text: "text-yellow-800" },
    "In Progress": { bg: "bg-blue-100", text: "text-blue-800" },
    "Resolved": { bg: "bg-green-100", text: "text-green-800" }
};

// --- DOM Elements ---
const UI = {
    // Views
    mainView: document.getElementById('search-view-main'),
    aiView: document.getElementById('search-view-ai'),

    // Main View Elements
    mainSearchInput: document.getElementById('main-search-input'),
    mainSearchBtn: document.getElementById('main-search-btn'),
    aiEntryCard: document.getElementById('ai-entry-card'),
    tagBtns: document.querySelectorAll('.tag-btn'),
    recentSearchesList: document.getElementById('recent-searches-list'),
    standardResultsContainer: document.getElementById('standard-results-container'),
    searchResultsList: document.getElementById('search-results-list'),
    closeResultsBtn: document.getElementById('close-results-btn'),

    // Sections to toggle
    tagsSection: document.querySelector('.tags-section'),
    recentSection: document.querySelector('.recent-section'),

    // AI Logo for animation (on the main search page card)
    aiLogoCircle: document.querySelector('.ai-logo-circle'),

    // AI View Elements
    aiInput: document.getElementById('ai-input'),
    aiSendBtn: document.getElementById('ai-send-btn'),
    recentQuestionsList: document.getElementById('recent-questions-list'),
    recentQuestionsSection: document.querySelector('.recent-questions-section'),
    aiResponseArea: document.getElementById('ai-response-area'),
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadRecentSearches();
    loadRecentQuestions();
    startMainEmojiAnimation(); // Slow animation for the card icon

    // Navigation (card click to enter AI mode)
    if (UI.aiEntryCard) UI.aiEntryCard.addEventListener('click', () => toggleView('ai'));

    // Main Search
    if (UI.mainSearchBtn) UI.mainSearchBtn.addEventListener('click', executeStandardSearch);
    if (UI.mainSearchInput) UI.mainSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') executeStandardSearch();
    });
    if (UI.closeResultsBtn) UI.closeResultsBtn.addEventListener('click', () => {
        UI.standardResultsContainer.classList.add('hidden');

        // Show sections again
        if (UI.tagsSection) UI.tagsSection.style.display = 'block';
        if (UI.recentSection) UI.recentSection.style.display = 'block';

        UI.searchResultsList.innerHTML = '';
        UI.mainSearchInput.value = '';
    });

    // Tags
    if (UI.tagBtns) UI.tagBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            UI.mainSearchInput.value = btn.dataset.search;
            executeStandardSearch();
        });
    });

    // Fade out sections on typing (Main Search)
    if (UI.mainSearchInput) {
        UI.mainSearchInput.addEventListener('input', (e) => {
            if (e.target.value.trim().length > 0) {
                if (UI.tagsSection) UI.tagsSection.style.display = 'none';
                if (UI.recentSection) UI.recentSection.style.display = 'none';
            }
        });
    }

    // Fade out recent questions on typing (AI Search)
    if (UI.aiInput) {
        UI.aiInput.addEventListener('input', (e) => {
            if (e.target.value.trim().length > 0) {
                if (UI.recentQuestionsSection) UI.recentQuestionsSection.style.display = 'none';
            } else {
                if (UI.recentQuestionsSection) UI.recentQuestionsSection.style.display = 'block';
            }
        });
    }

    // AI Search
    if (UI.aiSendBtn) UI.aiSendBtn.addEventListener('click', executeAISearch);
    if (UI.aiInput) UI.aiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') executeAISearch();
    });
});

// Slow animation for the "Ask Setu AI" card on the main search page (5 second interval)
function startMainEmojiAnimation() {
    if (!UI.aiLogoCircle) return;
    let index = 0;
    UI.aiLogoCircle.textContent = EMOJIS[0];

    mainEmojiAnimationInterval = setInterval(() => {
        index = (index + 1) % EMOJIS.length;
        UI.aiLogoCircle.textContent = EMOJIS[index];
    }, 5000); // 5 seconds
}

// --- View Management ---
function toggleView(viewName) {
    if (viewName === 'ai') {
        document.body.classList.add('ai-view-active');
        // Show recent questions when entering AI view
        if (UI.recentQuestionsSection) UI.recentQuestionsSection.style.display = 'block';
        setTimeout(() => UI.aiInput && UI.aiInput.focus(), 100);
    } else {
        document.body.classList.remove('ai-view-active');
    }
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
    UI.recentSearchesList.innerHTML = list.map(item => `
        <div class="recent-item cursor-pointer" onclick="handleRecentClick('${item.text}', 'main')">
            <div class="recent-icon-circle">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <div class="recent-content">
                <div class="recent-title">${item.text}</div>
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
        if (UI.tagsSection) UI.tagsSection.style.display = 'none';
        if (UI.recentSection) UI.recentSection.style.display = 'none';
        executeStandardSearch();
    } else {
        // AI: Just fill the input, don't execute
        UI.aiInput.value = text;
        UI.aiInput.focus();
        if (UI.recentQuestionsSection) UI.recentQuestionsSection.style.display = 'none';
    }
};

async function executeStandardSearch() {
    const queryText = UI.mainSearchInput.value.trim();
    if (!queryText) return;

    saveRecent('recentSearches', { text: queryText, time: 'Just now' });
    loadRecentSearches();

    UI.standardResultsContainer.classList.remove('hidden');
    if (UI.tagsSection) UI.tagsSection.style.display = 'none';
    if (UI.recentSection) UI.recentSection.style.display = 'none';

    UI.searchResultsList.innerHTML = '<p class="text-center text-gray-500 py-4">Searching...</p>';

    try {
        const reports = await fetchReports(queryText);
        if (reports.length === 0) {
            UI.searchResultsList.innerHTML = '<p class="text-center text-gray-500 py-4">No reports found.</p>';
        } else {
            UI.searchResultsList.innerHTML = reports.map(createReportCard).join('');
        }
    } catch (error) {
        console.error(error);
        UI.searchResultsList.innerHTML = '<p class="text-center text-red-500">Error fetching results.</p>';
    }
}

// --- Logic: AI Search ---

function loadRecentQuestions() {
    if (!UI.recentQuestionsList) return;
    const list = getRecent('recentQuestions');
    UI.recentQuestionsList.innerHTML = list.map(item => `
        <div class="ai-recent-item cursor-pointer" onclick="handleRecentClick('${item.text}', 'ai')">
            <div class="ai-recent-content">
                <div class="ai-recent-question">${item.text}</div>
                <div class="ai-recent-sub">Setu AI Answered</div>
            </div>
             <div class="recent-arrow">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
            </div>
        </div>
    `).join('');
}

async function executeAISearch() {
    const queryText = UI.aiInput.value.trim();
    if (!queryText) return;

    saveRecent('recentQuestions', { text: queryText, time: 'Just now' });
    loadRecentQuestions();

    if (UI.recentQuestionsSection) UI.recentQuestionsSection.style.display = 'none';

    UI.aiResponseArea.classList.remove('hidden');

    // "Thinking" state with fast-animating icon
    UI.aiResponseArea.innerHTML = `
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-pink-100">
             <div class="flex items-center gap-2 mb-3">
                <div id="ai-thinking-icon" class="w-8 h-8 flex items-center justify-center text-xl">🔴</div>
                <span class="font-bold text-gray-900">Setu AI</span>
             </div>
             <p class="text-gray-700 animate-pulse">Thinking...</p>
        </div>
    `;

    // Fast emoji animation during "thinking" (0.5s interval)
    const thinkingIconEl = document.getElementById('ai-thinking-icon');
    let thinkingIndex = 0;
    const thinkingInterval = setInterval(() => {
        if (thinkingIconEl) {
            thinkingIndex = (thinkingIndex + 1) % EMOJIS.length;
            thinkingIconEl.textContent = EMOJIS[thinkingIndex];
        }
    }, 500);

    try {
        await askGemini(queryText, thinkingInterval);
    } catch (e) {
        clearInterval(thinkingInterval);
        UI.aiResponseArea.innerHTML = `<p class="text-red-500">Error: ${e.message}</p>`;
    }
}

async function askGemini(prompt, thinkingInterval) {
    if (typeof puter === 'undefined') {
        clearInterval(thinkingInterval);
        throw new Error("AI Service not ready");
    }

    const SETU_AI_PERSONA = "You are Setu AI, a helpful civic assistant. Keep answers short, friendly, and helpful. Focus on Indian civic issues.";

    const response = await puter.ai.chat([
        { role: 'system', content: SETU_AI_PERSONA },
        { role: 'user', content: prompt }
    ]);

    let text = response?.message?.content || response?.content || JSON.stringify(response);

    // Stop the "thinking" animation - freeze the icon at current state
    clearInterval(thinkingInterval);

    // Get the current emoji from the thinking icon before replacing
    const currentThinkingIcon = document.getElementById('ai-thinking-icon');
    const frozenEmoji = currentThinkingIcon ? currentThinkingIcon.textContent : '🔴';

    // Container Setup for typing response
    UI.aiResponseArea.innerHTML = `
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-pink-100">
             <div class="flex items-center gap-2 mb-3">
                <div id="ai-response-icon" class="w-8 h-8 flex items-center justify-center text-xl">${frozenEmoji}</div>
                <span class="font-bold text-gray-900">Setu AI</span>
             </div>
             <div id="ai-typing-container" class="prose text-sm leading-relaxed font-medium"></div>
        </div>
    `;

    // Rainbow Typing Animation
    const container = document.getElementById('ai-typing-container');
    const typedSpans = await typeWithRainbow(text, container);

    // After typing is complete, fade ALL remaining colored words to dark
    typedSpans.forEach(span => {
        span.style.color = '#374151'; // dark gray
    });
}

async function typeWithRainbow(text, container) {
    // Rainbow colors matching the reference images
    const rainbowColors = [
        '#ff6b6b', // red/coral
        '#ffa94d', // orange
        '#ffe066', // yellow (softer)
        '#69db7c', // green
        '#74c0fc', // blue
        '#b197fc', // purple
        '#f783ac'  // pink
    ];

    const COLORED_WORDS_COUNT = 7; // How many words stay colored at a time
    const words = text.split(' ');
    const spans = []; // Track all word spans

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const span = document.createElement('span');
        span.textContent = word + ' ';
        span.style.transition = 'color 0.5s ease';

        // Assign rainbow color based on position in cycle
        const colorIndex = i % rainbowColors.length;
        span.style.color = rainbowColors[colorIndex];
        span.style.fontWeight = '500';

        container.appendChild(span);
        spans.push(span);

        // Fade older words to dark gray (keep only last N words colored)
        if (spans.length > COLORED_WORDS_COUNT) {
            const oldSpan = spans[spans.length - COLORED_WORDS_COUNT - 1];
            if (oldSpan) {
                oldSpan.style.color = '#374151'; // dark gray
            }
        }

        await new Promise(r => setTimeout(r, 45)); // Typing speed
    }

    // Return spans array so caller can finalize all colors
    return spans;
}

// --- Fetch Helpers ---

async function fetchReports(queryText) {
    const qLower = queryText.toLowerCase();
    console.log('[Search] Searching for:', qLower);

    try {
        // Fetch recent reports from Firestore
        const reportsRef = collection(db, 'reports');
        let q;

        try {
            // Try with ordering first
            q = query(reportsRef, orderBy('createdAt', 'desc'), limit(50));
        } catch (indexError) {
            // Fallback without ordering if index doesn't exist
            console.warn('[Search] Index not available, fetching without order');
            q = query(reportsRef, limit(50));
        }

        const snapshot = await getDocs(q);
        console.log('[Search] Total documents fetched:', snapshot.size);

        const reports = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Search in multiple fields
            const searchableText = [
                data.description || '',
                data.issueType || '',
                data.location?.full || '',
                data.location?.city || '',
                data.location?.area || '',
                data.status || ''
            ].join(' ').toLowerCase();

            if (searchableText.includes(qLower)) {
                reports.push({ id: docSnap.id, ...data });
            }
        });

        console.log('[Search] Matching reports:', reports.length);
        return reports;
    } catch (e) {
        console.error('[Search] Fetch error:', e);
        return [];
    }
}

function createReportCard(c) {
    return `
    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4">
        <img src="${c.imageUrl || 'https://placehold.co/100'}" class="w-20 h-20 object-cover rounded-lg bg-gray-100 flex-shrink-0">
        <div class="flex-grow min-w-0">
            <div class="flex justify-between items-start">
                <h4 class="font-bold text-gray-900 truncate">${c.issueType}</h4>
                <span class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">${c.status}</span>
            </div>
            <p class="text-sm text-gray-500 truncate mt-1">${c.location?.full || 'Unknown Location'}</p>
        </div>
    </div>`;
}

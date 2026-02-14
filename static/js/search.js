import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy, limit, doc, getDoc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { generateResponse, clearKey } from "./setu-ai.js";

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
        if (UI.recentQuestionsSection) UI.recentQuestionsSection.style.display = 'block';
        setTimeout(() => UI.aiInput && UI.aiInput.focus(), 100);

        // Magical color wash transition
        const aiView = document.getElementById('search-view-ai');
        if (aiView) {
            // Color wash overlay
            aiView.classList.remove('ai-color-wash');
            void aiView.offsetWidth;
            aiView.classList.add('ai-color-wash');
            // Background pulse
            aiView.classList.remove('ai-bg-pulse');
            void aiView.offsetWidth;
            aiView.classList.add('ai-bg-pulse');
            // Auto-cleanup so it doesn't interfere later
            setTimeout(() => {
                aiView.classList.remove('ai-color-wash', 'ai-bg-pulse');
            }, 2000);
        }
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
        await askSetuAI(queryText, thinkingInterval);
    } catch (e) {
        clearInterval(thinkingInterval);
        UI.aiResponseArea.innerHTML = `<p class="text-red-500">Error: ${e.message}</p>`;
    }
}

// ===== DATA-AWARE AI HELPERS (RAG) =====

function detectQueryIntent(prompt) {
    const lower = prompt.toLowerCase();
    const intents = { needsData: false, types: [] };
    const issueKw = ['pothole', 'streetlight', 'garbage', 'water', 'sewage', 'drainage', 'road', 'traffic', 'waste', 'light', 'broken', 'damage', 'dump', 'flood', 'leak', 'electricity', 'sewer'];

    if (/\b(my report|my complaint|my issue|my submission|i reported|i submitted|i filed|did i)\b/i.test(lower)) {
        intents.needsData = true; intents.types.push('my_reports');
    }
    if ((/\b(status|progress|update|resolved|pending|submitted|in progress|detail|info|check)\b/i.test(lower) &&
        /\b(report|complaint|issue|problem)\b/i.test(lower)) || issueKw.some(k => lower.includes(k))) {
        intents.needsData = true;
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    if (/\b(reported by|who reported|filed by|submitted by|complaints?\s*(of|by|from))\b/i.test(lower)) {
        intents.needsData = true;
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    if (/\b(officer|authority|authorities|department|who.*(handl|assign|responsible|work)|assign.*(to|officer)|in\s*charge)\b/i.test(lower)) {
        intents.needsData = true; intents.types.push('officer_info');
    }
    if (/\b(how many|count|total|statistic|stats|number of|pending report|resolved report)\b/i.test(lower)) {
        intents.needsData = true; intents.types.push('stats');
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    if (/\b(in my area|nearby|my city|around me|my local|my district|my village)\b/i.test(lower)) {
        intents.needsData = true; intents.types.push('area_reports');
        if (!intents.types.includes('report_lookup')) intents.types.push('report_lookup');
    }
    if (/\b(all report|recent report|latest report|show report|list report|recent issue|all issue)\b/i.test(lower)) {
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
    const result = { myReports: [], reports: [], officers: [], stats: null, currentUser: null, userCity: '' };
    const currentUser = auth.currentUser;

    // Current user profile
    if (currentUser) {
        try {
            const uDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (uDoc.exists()) {
                const ud = uDoc.data();
                result.currentUser = { name: ud.fullname || 'User', city: ud.city || '', role: ud.role || 'citizen' };
                result.userCity = ud.city || '';
            }
        } catch (e) { console.warn('[AI] User profile fetch failed:', e.message); }
    }

    // User's own reports
    if (intent.types.includes('my_reports') && currentUser) {
        try {
            let q;
            try { q = query(collection(db, 'reports'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(20)); }
            catch { q = query(collection(db, 'reports'), where('userId', '==', currentUser.uid), limit(20)); }
            const snap = await getDocs(q);
            snap.forEach(d => {
                const r = d.data();
                result.myReports.push({
                    id: d.id, issueType: r.issueType || 'Unknown', description: (r.description || '').substring(0, 120),
                    status: r.status || 'Unknown', location: r.location?.full || r.location?.city || 'Unknown',
                    city: r.location?.city || '', createdAt: formatAITimestamp(r.createdAt),
                    department: r.assignedDepartment || r.department || 'Not assigned'
                });
            });
        } catch (e) { console.warn('[AI] My reports fetch failed:', e.message); }
    }

    // All reports (for lookup, stats, area)
    if (intent.types.includes('report_lookup') || intent.types.includes('stats') || intent.types.includes('area_reports')) {
        try {
            let q;
            try { q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50)); }
            catch { q = query(collection(db, 'reports'), limit(50)); }
            const snap = await getDocs(q);
            const uidSet = new Set();
            const raw = [];
            snap.forEach(d => { const r = d.data(); raw.push({ id: d.id, ...r }); if (r.userId) uidSet.add(r.userId); });

            // Batch fetch reporter names
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
                    createdAt: formatAITimestamp(r.createdAt), department: r.assignedDepartment || r.department || 'Not assigned',
                    reporterName: nameMap[r.userId] || 'Anonymous'
                });
            });
        } catch (e) { console.warn('[AI] Reports fetch failed:', e.message); }
    }

    // Officers
    if (intent.types.includes('officer_info')) {
        try {
            const q = query(collection(db, 'users'), where('role', '==', 'authority'));
            const snap = await getDocs(q);
            snap.forEach(d => {
                const u = d.data();
                const o = { name: u.fullname || 'Unknown', department: u.department || 'Not specified', city: u.city || 'Not specified' };
                if (u.jurisdiction) {
                    o.state = u.jurisdiction.state || ''; o.district = u.jurisdiction.district || '';
                    o.subDistrict = u.jurisdiction.subDistrict || ''; o.villages = (u.jurisdiction.villages || []).join(', ');
                }
                result.officers.push(o);
            });
        } catch (e) { console.warn('[AI] Officers fetch failed:', e.message); }
    }

    // Stats
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
    if (data.currentUser) ctx += `\n--- CURRENT USER ---\nName: ${data.currentUser.name} | City: ${data.currentUser.city || 'Not set'} | Role: ${data.currentUser.role}\n`;

    if (data.myReports.length > 0) {
        ctx += `\n--- USER'S OWN REPORTS (${data.myReports.length}) ---\n`;
        data.myReports.forEach((r, i) => {
            ctx += `${i + 1}. [${r.issueType}] Status: ${r.status} | Location: ${r.location} | Date: ${r.createdAt} | Dept: ${r.department}`;
            if (r.description) ctx += ` | Info: ${r.description}`;
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
            ctx += `\n--- REPORTS (${show.length} of ${reps.length}) ---\n`;
            show.forEach((r, i) => {
                ctx += `${i + 1}. [${r.issueType}] Status: ${r.status} | Location: ${r.location} | Date: ${r.createdAt} | By: ${r.reporterName} | Dept: ${r.department}`;
                if (r.description) ctx += ` | Info: ${r.description}`;
                ctx += '\n';
            });
            if (reps.length > 20) ctx += `...and ${reps.length - 20} more\n`;
        } else { ctx += '\n--- No matching reports found ---\n'; }
    }

    if (data.officers.length > 0) {
        ctx += `\n--- OFFICERS (${data.officers.length}) ---\n`;
        data.officers.forEach((o, i) => {
            ctx += `${i + 1}. ${o.name} | Dept: ${o.department} | City: ${o.city}`;
            if (o.state) ctx += ` | State: ${o.state}`;
            if (o.district) ctx += ` | District: ${o.district}`;
            if (o.subDistrict) ctx += ` | Sub-Dist: ${o.subDistrict}`;
            if (o.villages) ctx += ` | Villages: ${o.villages}`;
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

async function askSetuAI(prompt, thinkingInterval) {
    if (typeof puter === 'undefined') {
        clearInterval(thinkingInterval);
        throw new Error("AI Service not ready");
    }

    // === RAG: Detect intent and fetch real database data ===
    const intent = detectQueryIntent(prompt);
    let dataContext = '';

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

YOU HAVE REAL-TIME DATABASE ACCESS. When database data is provided after the user's question, use it for specific, accurate answers.

STRICT PRIVACY RULES:
1. CITIZENS: Only mention their NAME when saying who reported an issue. NEVER reveal phone, email, DOB, Aadhaar, or ID numbers.
2. OFFICERS/AUTHORITIES: You may share their NAME, DEPARTMENT, CITY, and JURISDICTION (state, district, sub-district, villages). NEVER reveal phone, email, DOB, or ID.
3. NEVER expose system IDs, passwords, or internal data.

RESPONSE FORMAT (MANDATORY):
- Start with a brief 1-line greeting or summary, then use bullet points for details.
- Use dash bullet points (- ) for each item. Example: "- Status: In Progress"
- Each piece of information should be its own bullet point on a new line.
- Use short, punchy bullet points — not walls of text.
- For report listings, use numbered lists (1. 2. 3.) with key details on each line.
- Use bold text with ** for important labels like **Status:**, **Location:**, **Reported by:**

RESPONSE RULES:
1. When database data is provided, give SPECIFIC answers using actual names, statuses, locations, and dates from the data.
2. ALWAYS use bullet points or numbered lists. Never write paragraphs.
3. Be friendly, conversational, and concise.
4. Statuses: "Submitted" = pending, "In Progress" = being worked on, "Resolved" = fixed.
5. If no matching data found, say so and suggest alternatives.
6. If asked about unrelated topics, redirect politely.
7. When no database data is provided, answer from general Setu knowledge below.

SETU PLATFORM KNOWLEDGE:
${SETU_KNOWLEDGE}

Use REAL DATA when available. Be accurate, helpful, and protect user privacy.`;

    // Build augmented user message with data context
    let userMessage = prompt;
    if (dataContext) {
        userMessage = `${prompt}\n\n[REAL-TIME DATABASE DATA]:\n${dataContext}`;
    }

    const response = await puter.ai.chat([
        { role: 'system', content: SETU_AI_PERSONA },
        { role: 'user', content: userMessage }
    ]);

    let text = response?.message?.content || response?.content || JSON.stringify(response);

    // Stop the "thinking" animation
    clearInterval(thinkingInterval);

    const currentThinkingIcon = document.getElementById('ai-thinking-icon');
    const frozenEmoji = currentThinkingIcon ? currentThinkingIcon.textContent : '🔴';

    UI.aiResponseArea.innerHTML = `
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-pink-100">
             <div class="flex items-center gap-2 mb-3">
                <div id="ai-response-icon" class="w-8 h-8 flex items-center justify-center text-xl">${frozenEmoji}</div>
                <span class="font-bold text-gray-900">Setu AI</span>
             </div>
             <div id="ai-typing-container" class="prose leading-relaxed font-medium"></div>
        </div>
    `;

    const container = document.getElementById('ai-typing-container');
    const typedSpans = await typeWithRainbow(text, container);

    typedSpans.forEach(span => {
        span.style.color = '#374151';
    });
}

async function typeWithRainbow(text, container) {
    // Premium gradient colors
    const gradientColors = [
        '#ff6b6b', '#ff8e72', '#ffa94d', '#ffd43b',
        '#69db7c', '#38d9a9', '#74c0fc', '#748ffc',
        '#b197fc', '#e599f7', '#f783ac', '#ff6b6b'
    ];
    const WAVE_WIDTH = 10;
    const TYPING_SPEED = 30;
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

    // Split text into lines first, then process each line
    const lines = text.split('\n');

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li].trim();

        // Empty line = paragraph break
        if (line === '') {
            if (li > 0) {
                const spacer = document.createElement('div');
                spacer.style.height = '8px';
                container.appendChild(spacer);
            }
            continue;
        }

        // Detect bullet or numbered list items
        const bulletMatch = line.match(/^([•\-\*]\s+|\d+\.\s+)/);
        let lineContainer = container;

        if (bulletMatch) {
            // Create a bullet line wrapper
            const bulletDiv = document.createElement('div');
            bulletDiv.style.cssText = 'display:flex; gap:6px; align-items:flex-start; padding:3px 0 3px 4px; margin:2px 0;';

            // Bullet marker
            const marker = document.createElement('span');
            marker.textContent = line.match(/^\d+\./) ? bulletMatch[0].trim() : '•';
            marker.style.cssText = 'color:#b197fc; flex-shrink:0; font-weight:600; min-width:16px;';
            bulletDiv.appendChild(marker);

            // Content area
            const content = document.createElement('span');
            content.style.cssText = 'flex:1;';
            bulletDiv.appendChild(content);

            container.appendChild(bulletDiv);
            lineContainer = content;

            // Remove bullet prefix from text to type
            var wordsInLine = line.substring(bulletMatch[0].length).split(' ').filter(w => w);
        } else {
            var wordsInLine = line.split(' ').filter(w => w);
        }

        // Type each word in the line
        for (let wi = 0; wi < wordsInLine.length; wi++) {
            let word = wordsInLine[wi];
            const span = document.createElement('span');
            span.style.transition = 'color 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
            span.style.willChange = 'color';

            // Handle **bold** markdown
            const isBold = word.includes('**');
            word = word.replace(/\*\*/g, '');
            span.textContent = word + ' ';
            span.style.fontWeight = isBold ? '700' : '500';

            const wavePos = (wordIndex % WAVE_WIDTH) / WAVE_WIDTH;
            span.style.color = getGradientColor(wavePos);

            lineContainer.appendChild(span);
            spans.push(span);
            wordIndex++;

            // Fade older words
            if (spans.length > WAVE_WIDTH) {
                const fadeSpan = spans[spans.length - WAVE_WIDTH - 1];
                if (fadeSpan) fadeSpan.style.color = '#374151';
            }

            await new Promise(r => setTimeout(r, TYPING_SPEED));
        }

        // Line break between non-empty lines (unless it was a bullet)
        if (!bulletMatch && li < lines.length - 1 && lines[li + 1]?.trim() !== '') {
            container.appendChild(document.createElement('br'));
        }
    }

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

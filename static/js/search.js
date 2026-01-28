import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy, limit, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { generateResponse, clearKey } from "./setu-ai.js"; // New Module Import

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
let currentFilter = 'all';
let searchTimeout;
let isAIMode = false; // State for AI Mode
// geminiApiKey handled by module

// Static Departments (as no collection exists yet)
const DEPARTMENTS = [
    { id: 1, name: "Dhanbad Municipal Corp.", description: "Responsible for sanitation, waste management, and local infrastructure.", avatar: 'https://placehold.co/100x100/E1E2E2/1D2228?text=DMC' },
    { id: 2, name: "Public Works Dept.", description: "Manages construction and maintenance of roads, bridges, and public buildings.", avatar: 'https://placehold.co/100x100/E1E2E2/1D2228?text=PWD' },
    { id: 3, name: "Water Board", description: "Oversees the supply and quality of drinking water across the city.", avatar: 'https://placehold.co/100x100/E1E2E2/1D2228?text=WB' },
    { id: 4, name: "Electricity Board", description: "Manages power supply, grid maintenance, and billing.", avatar: 'https://placehold.co/100x100/E1E2E2/1D2228?text=EB' },
    { id: 5, name: "Police Department", description: "Law enforcement and public safety.", avatar: 'https://placehold.co/100x100/E1E2E2/1D2228?text=POL' }
];

// Styles
const statusStyles = {
    "Submitted": { bg: "bg-yellow-100", text: "text-yellow-800", darkBg: "dark:bg-yellow-500/20", darkText: "dark:text-yellow-300" },
    "In Progress": { bg: "bg-blue-100", text: "text-blue-800", darkBg: "dark:bg-blue-500/20", darkText: "dark:text-blue-300" },
    "Resolved": { bg: "bg-green-100", text: "text-green-800", darkBg: "dark:bg-green-500/20", darkText: "dark:text-green-300" }
};
const issueStyles = {
    "Garbage Dump": { bg: "bg-rose-100", text: "text-rose-700", darkBg: "dark:bg-rose-500/20", darkText: "dark:text-rose-300" },
    "No Dustbins": { bg: "bg-amber-100", text: "text-amber-700", darkBg: "dark:bg-amber-500/20", darkText: "dark:text-amber-300" },
    "Open Sewage": { bg: "bg-sky-100", text: "text-sky-700", darkBg: "dark:bg-sky-500/20", darkText: "dark:text-sky-300" },
    "Bad Roads": { bg: "bg-slate-200", text: "text-slate-700", darkBg: "dark:bg-slate-700/40", darkText: "dark:text-slate-300" }
};

// --- DOM Elements ---
const UI = {
    searchInput: document.getElementById('search-input'),
    searchDivWrapper: document.getElementById('search-container-wrapper'), // New wrapper
    searchBtn: document.getElementById('search-action-btn'),
    filterButtons: document.getElementById('filter-buttons'),
    resultsContainer: document.getElementById('search-results-container'),
    noResultsMessage: document.getElementById('no-results-message'),
    loadingSpinner: document.getElementById('search-loading'),
    toggleFilterBtn: document.getElementById('toggle-filter-btn-mobile'), // Might not exist in this page version, handling gracefully
};

// --- Handlers ---

document.addEventListener('DOMContentLoaded', () => {
    // setupPlaceholderAnimation(); // Removed to stop interfering with typing
    setupSwipeGesture(); // Initialize swipe listener
    // fetchGeminiKey(); // Try to fetch key on load

    // Event Listeners
    UI.searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        // If AI Mode, debounce longer or don't auto-search? AI calls cost $, usually explicit submit is better.
        // But for consistency let's keep it manual for AI, auto for Search.
        if (isAIMode) return;
        searchTimeout = setTimeout(executeSearch, 500);
    });

    UI.searchBtn.addEventListener('click', () => {
        clearTimeout(searchTimeout);
        executeSearch();
    });

    UI.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            executeSearch();
        }
    });

    UI.filterButtons.addEventListener('click', (e) => {
        const button = e.target.closest('.filter-btn');
        if (button) {
            UI.filterButtons.querySelector('.active').classList.remove('active');
            button.classList.add('active');
            currentFilter = button.dataset.filter;
            if (!isAIMode) executeSearch();
        }
    });

    // Handle initial state
    UI.resultsContainer.innerHTML = `<p class="text-center text-[var(--text-muted)] py-8">Enter a keyword to search reports, officers, or departments.</p>`;
});

// --- Swipe Logic ---
function setupSwipeGesture() {
    const el = UI.searchDivWrapper;
    if (!el) return;

    let touchStartX = 0;
    let touchEndX = 0;

    el.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    el.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    // Also mouse for desktop testing?
    el.addEventListener('mousedown', e => {
        touchStartX = e.screenX;
    });

    el.addEventListener('mouseup', e => {
        touchEndX = e.screenX;
        // prevent click trigger on input immediately
        if (Math.abs(touchEndX - touchStartX) > 50) handleSwipe();
    });

    function handleSwipe() {
        if (touchEndX - touchStartX > 50) {
            // Swipe Right -> Enable AI Mode
            if (!isAIMode) toggleAIMode(true);
        }
        if (touchStartX - touchEndX > 50) {
            // Swipe Left -> Disable AI Mode
            if (isAIMode) toggleAIMode(false);
        }
    }
}

function toggleAIMode(active) {
    isAIMode = active;
    const body = document.body;

    if (active) {
        body.classList.add('ai-mode-active');
        UI.searchInput.placeholder = "Ask anything to Setu AI...";
        UI.searchBtn.textContent = "Ask";
        UI.searchBtn.classList.add('ai-mode-btn', 'btn-cta'); // Custom gradient
        UI.searchBtn.classList.remove('btn-primary');

        // Hide standard filters in AI mode? Yes, irrelevant.
        UI.filterButtons.style.display = 'none';
        UI.resultsContainer.innerHTML = `<p class="text-center text-[var(--text-muted)] py-8">I'm Setu AI. Ask me about city issues, regulations, or app features!</p>`;
        UI.noResultsMessage.classList.add('hidden');
    } else {
        body.classList.remove('ai-mode-active');
        // Reset placeholder (animation logic will take over or simple reset)
        UI.searchInput.placeholder = "Search reports, officers...";
        UI.searchBtn.textContent = "Search";
        UI.searchBtn.classList.remove('ai-mode-btn', 'btn-cta');
        UI.searchBtn.classList.add('btn-primary');

        UI.filterButtons.style.display = 'flex';
        executeSearch(); // Restore search results
    }
}

// --- Search / AI Logic ---

async function executeSearch() {
    const queryText = UI.searchInput.value.trim();

    if (queryText.length === 0) {
        if (!isAIMode) {
            UI.resultsContainer.innerHTML = `<p class="text-center text-[var(--text-muted)] py-8">Start typing to search...</p>`;
            UI.noResultsMessage.classList.add('hidden');
            UI.loadingSpinner.classList.add('hidden');
        }
        return;
    }

    // Show Loading
    UI.resultsContainer.innerHTML = '';
    UI.loadingSpinner.classList.remove('hidden');
    UI.noResultsMessage.classList.add('hidden');

    try {
        if (isAIMode) {
            await askGemini(queryText);
        } else {
            // Standard Search
            let allResults = [];
            const qLower = queryText.toLowerCase();

            // 1. Search Reports
            if (currentFilter === 'all' || currentFilter === 'reports') {
                const reports = await fetchReports(qLower);
                allResults.push(...reports.map(r => ({ type: 'report', data: r })));
            }
            // 2. Search Officers
            if (currentFilter === 'all' || currentFilter === 'officers') {
                const officers = await fetchOfficers(qLower);
                allResults.push(...officers.map(o => ({ type: 'officer', data: o })));
            }
            // 3. Search Departments
            if (currentFilter === 'all' || currentFilter === 'departments') {
                const depts = searchDepartments(qLower);
                allResults.push(...depts.map(d => ({ type: 'department', data: d })));
            }

            renderResults(allResults);
        }

    } catch (error) {
        console.error("Operation failed:", error);
        // Show generic message to user, keep technical detail in console
        UI.resultsContainer.innerHTML = `
            <div class="text-center py-8">
                <p class="text-[var(--text-muted)]">Setu AI is struggling to connect. Please try again later.</p>
            </div>`;
    } finally {
        UI.loadingSpinner.classList.add('hidden');
    }
}

// --- Gemini AI ---

async function askGemini(prompt) {
    try {
        const responseText = await generateResponse(prompt, db);

        // Render AI Response
        const html = `
            <div class="ai-response-container">
                <h3>
                    <svg class="w-6 h-6 text-[var(--accent-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"/>
                    </svg>
                    Setu AI
                </h3>
                <div class="ai-content">
                    ${parseMarkdown(responseText)}
                </div>
            </div>
        `;
        UI.resultsContainer.innerHTML = html;

    } catch (error) {
        console.error("AI Response Failed:", error);

        // Friendly Error UI
        let userMsg = error.message; // SHOW RAW ERROR FOR DEBUGGING

        UI.resultsContainer.innerHTML = `
            <div class="text-center py-8">
                <p class="text-[var(--text-muted)] font-medium text-red-400">${userMsg}</p>
                <button id="retry-ai-btn" class="mt-4 btn btn-outline btn-sm">Try Again</button>
            </div>`;

        setTimeout(() => {
            document.getElementById('retry-ai-btn')?.addEventListener('click', () => {
                clearKey(); // Clear cache in case key was updated
                executeSearch();
            });
        }, 100);
    }
}

function parseMarkdown(text) {
    // Simple parser for bold and newlines
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}


// --- Fetch Functions ---

async function fetchReports(queryText) {
    // Firestore lacks native full-text search.
    // We will fetch recent reports and filter client-side for this MVP.
    // Fetching last 50 reports.
    try {
        const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'), limit(50));
        const snapshot = await getDocs(q);

        const reports = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Client-side Filter
            const textToSearch = `${data.description || ''} ${data.issue || ''} ${data.location || ''}`.toLowerCase();
            if (textToSearch.includes(queryText)) {
                reports.push({ id: doc.id, ...data });
            }
        });
        return reports;
    } catch (e) {
        console.warn("Report fetch error:", e);
        // Fallback for missing index or other errors
        return [];
    }
}

async function fetchOfficers(queryText) {
    try {
        // Fetch users who might be authorities. 
        // We can't filter by 'role' unless we know the exact field name in every doc (it was 'userType' or 'role').
        // Let's assume 'role' == 'authority' OR check if 'idCard' exists (officer indicator).

        // Strategy: Fetch 'users' collection (assuming not millions of users yet) or limit to 50 recent/verified.
        // Better: Use a compound query if possible, or just fetch all 'users' if dataset is small.
        // Assuming small dataset for prototype:
        const q = query(collection(db, 'users'), limit(50));
        const snapshot = await getDocs(q);

        const officers = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Check if looks like officer (has department, or idCard, or role=authority)
            const isOfficer = data.userType === 'authority' || data.department || (data.idCard && data.idCard.length > 5);

            if (isOfficer) {
                const textToSearch = `${data.fullname || ''} ${data.displayName || ''} ${data.department || ''}`.toLowerCase();
                if (textToSearch.includes(queryText)) {
                    officers.push({
                        name: data.fullname || data.displayName || "Officer",
                        designation: data.designation || "Authority Representative",
                        department: data.department || "General Administration",
                        avatar: data.avatar || data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.fullname || 'A')}&background=random`,
                        id: doc.id
                    });
                }
            }
        });
        return officers;
    } catch (e) {
        console.warn("Officer fetch error:", e);
        return [];
    }
}

function searchDepartments(queryText) {
    return DEPARTMENTS.filter(d =>
        d.name.toLowerCase().includes(queryText) ||
        d.description.toLowerCase().includes(queryText)
    );
}

// --- Rendering ---

function renderResults(results) {
    if (results.length === 0) {
        UI.noResultsMessage.classList.remove('hidden');
        return;
    }

    let html = '';
    results.forEach(item => {
        if (item.type === 'report') html += createReportCard(item.data);
        else if (item.type === 'officer') html += createOfficerCard(item.data);
        else if (item.type === 'department') html += createDepartmentCard(item.data);
    });

    UI.resultsContainer.innerHTML = html;
}

// Cards Generators

function createReportCard(c) {
    const s = statusStyles[c.status] || statusStyles["Submitted"];
    const i = issueStyles[c.issue] || { bg: "bg-gray-200", text: "text-gray-800", darkBg: "dark:bg-gray-700", darkText: "dark:text-gray-200" };

    // Fix timestamp handling
    let timeAgo = "Recently";
    if (c.timestamp) {
        // Handle Firestore Timestamp or ISO string or Date
        const date = c.timestamp.toDate ? c.timestamp.toDate() : new Date(c.timestamp);
        timeAgo = formatTimeAgo(date);
    }

    const desktopImageHtml = `
    <div class="hidden md:block md:w-1/3 lg:w-1/4 flex-shrink-0 relative card-image-container rounded-l-2xl">
        <img src="${c.image}" onerror="this.src='https://placehold.co/400x600/E1E2E2/1D2228?text=Image+Not+Available';" class="absolute top-0 left-0 w-full h-full object-cover" alt="Complaint Image"/>
    </div>
    `;

    const contentHtml = `
    <div class="main-content-wrapper flex-grow p-5 flex flex-col">
         <div class="flex items-center justify-between gap-2 mb-3">
             <span class="font-bold px-3 py-1 rounded-full text-xs ${i.bg} ${i.text} ${i.darkBg} ${i.darkText}">${c.issue || 'General Issue'}</span>
             <span class="px-3 py-1 text-xs font-bold rounded-full ${s.bg} ${s.text} ${s.darkBg} ${s.darkText}">${c.status || 'Submitted'}</span>
         </div>
         <div class="mb-2">
             <p class="text-[var(--text-primary)] text-2xl font-bold flex items-center gap-2">
                 <svg class="w-6 h-6 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.1.4-.27.61-.473A10.935 10.935 0 0014 15.25a10.934 10.934 0 00-4-10.75 10.934 10.934 0 00-4 10.75 10.935 10.935 0 003.11 3.213c.21.203.424.373.61.473a5.741 5.741 0 00.28.14l.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" /></svg>
                 <span>${c.location || 'Unknown Location'}</span>
             </p>
             <p class="text-sm text-[var(--text-muted)] mt-1">Submitted ${timeAgo}</p>
         </div>
        <div class="card-details flex-grow flex flex-col">
            <div class="card-details-inner">
                <div class="card-details-image-wrapper my-4 -mx-5 rounded-lg overflow-hidden md:hidden"><img src="${c.image}" onerror="this.src='https://placehold.co/800x400/E1E2E2/1D2228?text=Image+Not+Available';" class="w-full h-48 object-cover"/></div>
                <p class="text-[var(--text-secondary)] leading-relaxed my-4 line-clamp-2">${c.description || 'No description provided.'}</p>
            </div>
        </div>
        <div class="mt-auto pt-4 border-t border-[var(--border-light)] flex justify-end">
             <a href="reportfeed.html" class="text-sm font-semibold text-[var(--accent-primary)] hover:underline">View in Feed &rarr;</a>
        </div>
    </div>`;

    return `<div class="search-result-card bg-[var(--bg-secondary)] rounded-2xl overflow-hidden md:flex md:flex-row shadow-sm border border-[var(--border-light)] mb-4">${desktopImageHtml}${contentHtml}</div>`;
}

function createOfficerCard(officer) {
    return `
    <div class="search-result-card bg-[var(--bg-secondary)] rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-[var(--border-light)] mb-4">
        <img class="w-16 h-16 rounded-full flex-shrink-0 object-cover border-2 border-[var(--accent-primary)]" src="${officer.avatar}" alt="${officer.name}">
        <div class="flex-grow">
             <p class="text-[var(--text-primary)] text-lg font-bold">${officer.name}</p>
             <p class="text-sm font-semibold text-[var(--text-secondary)]">${officer.designation}</p>
             <p class="text-sm text-[var(--text-muted)]">${officer.department}</p>
        </div>
        <button class="btn btn-secondary text-sm px-3 py-1 rounded-lg">View Profile</button>
    </div>`;
}

function createDepartmentCard(dept) {
    return `
    <div class="search-result-card bg-[var(--bg-secondary)] rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-[var(--border-light)] mb-4">
        <img class="w-16 h-16 rounded-full flex-shrink-0 object-cover bg-gray-200" src="${dept.avatar}" alt="${dept.name}">
        <div class="flex-grow">
            <p class="text-[var(--text-primary)] text-lg font-bold mb-1">${dept.name}</p>
            <p class="text-sm text-[var(--text-muted)] line-clamp-2">${dept.description}</p>
        </div>
    </div>`;
}

// --- Utils ---
function formatTimeAgo(time) {
    const seconds = Math.floor((new Date() - time) / 1000);
    if (seconds < 2) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function setupPlaceholderAnimation() {
    const searchInput = UI.searchInput;
    if (!searchInput) return;

    const words = ['reports', 'officers', 'departments'];
    let wordIndex = 0;
    let charIndex = 0;
    const baseText = "Search for ";

    const type = () => {
        if (!searchInput.placeholder) return;
        // Stop if user is typing? No, placeholder is only visible when empty. 
        // But changing placeholder while typing is annoying if the browser shows it.
        // Usually placeholder is hidden when text exists.

        if (charIndex < words[wordIndex].length) {
            searchInput.placeholder = baseText + words[wordIndex].substring(0, charIndex + 1);
            charIndex++;
            setTimeout(type, 150);
        } else {
            setTimeout(erase, 2000);
        }
    };

    const erase = () => {
        if (charIndex > 0) {
            searchInput.placeholder = baseText + words[wordIndex].substring(0, charIndex - 1);
            charIndex--;
            setTimeout(erase, 100);
        } else {
            wordIndex = (wordIndex + 1) % words.length;
            setTimeout(type, 500);
        }
    };
    setTimeout(type, 500);
}

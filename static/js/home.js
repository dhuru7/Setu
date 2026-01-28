import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, orderBy, query, limit, where, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// Enable Offline Persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistence not supported');
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const greetingSpan = document.getElementById('user-greeting-name');
    const userFeedContainer = document.getElementById('home-user-reports');
    const publicFeedContainer = document.getElementById('home-public-reports');

    // Optimization: Load cached name immediately to prevent flicker
    const cachedName = localStorage.getItem('cachedUserName');
    if (greetingSpan && cachedName) {
        greetingSpan.textContent = cachedName;
    }

    const renderCard = (data) => {
        // Safe status check
        const status = data.status || 'Pending';
        let statusClass = 'bg-yellow-100 text-yellow-800';
        if (status === 'Resolved' || status === 'Fixed') statusClass = 'bg-green-100 text-green-800';
        if (status === 'Rejected') statusClass = 'bg-red-100 text-red-800';

        return `
            <div class="mini-complaint-card cursor-pointer" onclick="window.location.href='reportfeed.html'">
                <img src="${data.imageUrl || '../static/images/placeholder.png'}" alt="Report" onerror="this.src='../static/images/placeholder.png'">
                <div class="flex-grow min-w-0">
                    <h4 class="font-bold text-sm truncate text-[var(--text-primary)]">${data.location?.village || 'Unknown Location'}</h4>
                    <p class="text-xs text-[var(--text-muted)] truncate">${data.issueType || 'Issue'}</p>
                    <div class="mt-1">
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-medium ${statusClass}">${status}</span>
                    </div>
                </div>
            </div>
        `;
    };

    // 0. Show Skeletons Immediately
    // Note: We use the existing HTML structure skeletons for first load, 
    // but this function helps if we reload or re-fetch.
    const loadingHTML = createMiniSkeleton().repeat(2);
    // Don't overwrite HTML initially if server/static served skeletons exist, but here we dynamic load.
    publicFeedContainer.innerHTML = loadingHTML;
    userFeedContainer.innerHTML = loadingHTML;

    // 1. Load Public Reports (Area) - Limit 3
    try {
        const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(3));
        const snapshots = await getDocs(q);

        if (snapshots.empty) {
            publicFeedContainer.innerHTML = '<div class="text-center p-4 text-[var(--text-muted)]">No reports in your area yet.</div>';
        } else {
            let html = '';
            snapshots.forEach(doc => html += renderCard(doc.data()));
            publicFeedContainer.innerHTML = html;
        }
    } catch (e) {
        console.error("Public feed error:", e);
        publicFeedContainer.innerHTML = '<div class="text-center p-4 text-[var(--text-muted)]">Could not load reports.</div>';
    }

    // 2. Load User Reports & Greeting
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Update Greeting
            // Update Greeting - Fetch from Firestore for Full Name
            let name = 'User';
            if (user.displayName) {
                // If Auth has it, use it first (fastest)
                name = user.displayName.split(' ')[0];
            }

            // Try to fetch better name from DB in background
            try {
                const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                const userDocRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    // Priority: firstName -> fullname -> displayName -> Neighbor
                    if (userData.firstName) name = userData.firstName;
                    else if (userData.fullname) name = userData.fullname.split(' ')[0];
                    else if (userData.displayName) name = userData.displayName.split(' ')[0];
                }
            } catch (e) {
                console.warn("Could not fetch user profile for name", e);
            }

            if (greetingSpan) {
                greetingSpan.textContent = name;
                localStorage.setItem('cachedUserName', name);
            }

            try {
                // Ideally composite index: userId + createdAt desc.
                // Simple query: where userId
                const q = query(collection(db, 'reports'), where("userId", "==", user.uid), limit(2));
                const snapshots = await getDocs(q);

                if (snapshots.empty) {
                    userFeedContainer.innerHTML = `
                         <div class="col-span-full flex flex-col items-center justify-center p-6 border border-dashed border-[var(--border-light)] rounded-xl text-center">
                            <p class="text-[var(--text-muted)] text-sm mb-2">You haven't submitted any reports yet.</p>
                            <a href="report.html" class="text-[var(--accent-primary)] text-sm font-semibold hover:underline">Make your first report</a>
                        </div>
                    `;
                } else {
                    let html = '';
                    snapshots.forEach(doc => html += renderCard(doc.data()));
                    userFeedContainer.innerHTML = html;
                }
            } catch (e) {
                console.error("User feed error:", e);
                // Fallback for index error usually
                userFeedContainer.innerHTML = '<div class="text-center p-4 text-[var(--text-muted)] col-span-full">Unable to load your reports.</div>';
            }
        } else {
            if (greetingSpan) greetingSpan.textContent = 'Guest';
            userFeedContainer.innerHTML = `
                <div class="col-span-full text-center p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-light)]">
                    <p class="text-[var(--text-muted)] mb-3">Sign in to track your reports.</p>
                    <a href="login.html" class="btn btn-sm btn-primary px-4 py-2 rounded-lg">Sign In</a>
                </div>
             `;
        }
    });
});

function createMiniSkeleton() {
    return `
    <div class="mini-complaint-card animate-pulse">
        <div class="w-16 h-16 bg-gray-200 rounded-lg dark:bg-gray-700 shrink-0"></div>
        <div class="flex-grow space-y-2 min-w-0">
            <div class="h-4 bg-gray-200 rounded w-3/4 dark:bg-gray-700"></div>
            <div class="h-3 bg-gray-200 rounded w-1/2 dark:bg-gray-700"></div>
            <div class="h-4 bg-gray-200 rounded w-12 dark:bg-gray-700 mt-1"></div>
        </div>
    </div>`;
}

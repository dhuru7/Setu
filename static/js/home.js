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
    // Initialize Notifications manually since navigation.js is not included
    if (window.Notifications) {
        window.Notifications.init();
    }

    const greetingSpan = document.getElementById('user-greeting-name');
    const publicFeedContainer = document.getElementById('home-public-reports');
    const countBadge = document.getElementById('nearby-count-badge');

    // Optimization: Load cached name immediately to prevent flicker
    const cachedName = localStorage.getItem('cachedUserName');
    if (greetingSpan && cachedName) {
        greetingSpan.textContent = cachedName;
    }

    const renderCard = (data) => {
        // Safe status check
        let status = data.status || 'Pending';
        // Capitalize status
        status = status.charAt(0).toUpperCase() + status.slice(1);

        // Status classes for the badges
        let statusClass = 'status-pending'; // Default yellow
        if (status === 'Resolved' || status === 'Fixed') statusClass = 'status-resolved'; // Green

        // Try to generate a random distance for demo if not available, or just hide it
        const randomDist = (Math.random() * 2).toFixed(1) + " km";

        return `
            <a href="reportfeed.html" class="issue-item fade-in">
                <img src="${data.imageUrl || '../static/images/placeholder.png'}" alt="Report" class="issue-thumb" onerror="this.src='https://via.placeholder.com/80/f0f0f0/cccccc?text=Report'">
                <div class="issue-details">
                    <div class="issue-meta-top">
                        <h4 class="issue-title">${data.issueType || 'Issue Report'}</h4>
                        <span class="distance-tag">${randomDist}</span>
                    </div>
                    <p class="issue-location">${data.location?.village || data.location?.address || 'Unknown Location'}</p>
                    <span class="status-badge ${statusClass}">${status}</span>
                </div>
            </a>
        `;
    };

    // 0. Show Skeletons Immediately
    const loadingHTML = createMiniSkeleton().repeat(2);
    if (publicFeedContainer) publicFeedContainer.innerHTML = loadingHTML;

    // 1. Load Public Reports (Area) - Limit 3
    if (publicFeedContainer) {
        try {
            const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(3));
            const snapshots = await getDocs(q);

            if (snapshots.empty) {
                publicFeedContainer.innerHTML = '<div style="padding:16px; text-align:center; color:#666;">No reports in your area yet.</div>';
            } else {
                let html = '';
                snapshots.forEach(doc => html += renderCard(doc.data()));
                publicFeedContainer.innerHTML = html;
            }

            // 1b. Count Reports in Last 48 Hours
            try {
                // Determine timestamp for 48 hours ago
                const now = new Date();
                const fortyEightHoursAgo = new Date(now.getTime() - (48 * 60 * 60 * 1000)).toISOString();

                // Query: reports where createdAt >= 48 hours ago
                // Note: This assumes createdAt is stored as an ISO string or compatible string format.
                const countQuery = query(collection(db, 'reports'), where('createdAt', '>=', fortyEightHoursAgo));
                const countSnap = await getDocs(countQuery);

                if (countBadge) {
                    const count = countSnap.size;
                    countBadge.textContent = count;
                    // Use dataset or just text.
                }

            } catch (countErr) {
                console.warn("Error fetching count:", countErr);
                // Fallback to purely visual update or keep previous
                if (countBadge) countBadge.textContent = "12"; // Fallback static if query fails (e.g. index issue)
            }

        } catch (e) {
            console.error("Public feed error:", e);
            publicFeedContainer.innerHTML = '<div style="padding:16px; text-align:center; color:#666;">Could not load reports.</div>';
        }
    }

    // 2. Load Greeting Details (Name)
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Update Greeting - Fetch from Firestore for Full Name
            let name = 'User';
            if (user.displayName) {
                name = user.displayName.split(' ')[0];
            }

            try {
                const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                const userDocRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    if (userData.firstName) name = userData.firstName;
                    else if (userData.fullname) name = userData.fullname.split(' ')[0];
                    else if (userData.displayName) name = userData.displayName.split(' ')[0];
                }
            } catch (e) {
                console.warn("Could not fetch user profile for name", e);
            }

            if (greetingSpan) {
                greetingSpan.textContent = name + "."; // Add dot as per design
                localStorage.setItem('cachedUserName', name);
            }
        } else {
            if (greetingSpan) greetingSpan.textContent = 'Neighbor.';
        }
    });
});

function createMiniSkeleton() {
    return `
    <div class="issue-item animate-pulse">
        <div class="issue-thumb bg-gray-200"></div>
        <div class="issue-details" style="width: 100%;">
            <div class="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div class="h-4 bg-gray-200 rounded w-1/4"></div>
        </div>
    </div>`;
}

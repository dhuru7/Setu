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

// --- Distance Calculation Helpers ---

// Cache for geocoding results to minimize API calls
const geocodeCache = {};

async function getCoordinates(locationQuery) {
    if (!locationQuery) return null;
    if (geocodeCache[locationQuery]) return geocodeCache[locationQuery];

    try {
        // Use Nominatim OpenStreetMap API
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationQuery)}&limit=1`;
        const response = await fetch(url, { headers: { 'User-Agent': 'SetuApp/1.0' } });
        if (!response.ok) return null;

        const data = await response.json();
        if (data && data.length > 0) {
            const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            geocodeCache[locationQuery] = coords;
            return coords;
        }
    } catch (error) {
        console.warn("Geocoding error:", error);
    }
    return null;
}

function calculateHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d.toFixed(1);
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Global user city variable (set when auth loads)
let currentUserCity = null;
let currentUserCoords = null;
let reportItemsLoaded = false;

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

        // Determine location string for geocoding (Prioritize CITY for accurate distance)
        const geocodeQuery = data.location?.city || data.location?.village || data.location?.address;

        // Display Location: Prefer Village > Subdist > City
        let displayLocation = 'Unknown Location';
        if (data.location) {
            if (data.location.village) displayLocation = data.location.village;
            else if (data.location.address) displayLocation = data.location.address;
            else if (data.location.city) displayLocation = data.location.city;
        }
        if (displayLocation.length > 25) displayLocation = displayLocation.substring(0, 25) + '...';

        // Coordinates might be directly in the report
        const lat = data.location?.lat || data.location?.latitude;
        const lon = data.location?.long || data.location?.longitude;

        const coordsAttr = (lat && lon) ? `data-lat="${lat}" data-lon="${lon}"` : '';

        return `
            <a href="reportfeed.html" class="issue-item fade-in" data-location-query="${geocodeQuery}" ${coordsAttr}>
                <img src="${data.imageUrl || '../static/images/placeholder.png'}" alt="Report" class="issue-thumb" onerror="this.src='https://via.placeholder.com/80/f0f0f0/cccccc?text=Report'">
                <div class="issue-details">
                    <div class="issue-meta-top">
                        <h4 class="issue-title">${data.issueType || 'Issue Report'}</h4>
                        <span class="distance-tag">...</span>
                    </div>
                    <p class="issue-location">${displayLocation}</p>
                    <div><span class="status-badge ${statusClass}">${status}</span></div>
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
                publicFeedContainer.innerHTML = '<div style="padding:16px; text-align:center; color:#666; font-size: 0.8rem;">No reports available.</div>';
            } else {
                let html = '';
                snapshots.forEach(doc => html += renderCard(doc.data()));
                publicFeedContainer.innerHTML = html;
                reportItemsLoaded = true;

                // Try to update distances if user coords are already ready
                if (currentUserCoords) updateDistancesInFeed();
            }

            // 1b. Count Reports in Last 48 Hours
            try {
                const now = new Date();
                const fortyEightHoursAgo = new Date(now.getTime() - (48 * 60 * 60 * 1000)).toISOString();
                const countQuery = query(collection(db, 'reports'), where('createdAt', '>=', fortyEightHoursAgo));
                const countSnap = await getDocs(countQuery);

                if (countBadge) {
                    countBadge.textContent = countSnap.size;
                }
            } catch (countErr) {
                console.warn("Error fetching count:", countErr);
                if (countBadge) countBadge.textContent = "12";
            }

        } catch (e) {
            console.error("Public feed error:", e);
            publicFeedContainer.innerHTML = '<div style="padding:16px; text-align:center; color:#666;">Could not load reports.</div>';
        }
    }

    // 2. Load Greeting Details (Name & City)
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Update Greeting - Fetch from Firestore for Full Name & City
            let name = 'User';

            try {
                const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                const userDocRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userDocRef);

                if (userSnap.exists()) {
                    const userData = userSnap.data();

                    // Name logic
                    if (userData.firstName) name = userData.firstName;
                    else if (userData.fullname) name = userData.fullname.split(' ')[0];
                    else if (userData.displayName) name = userData.displayName.split(' ')[0];
                    else if (user.displayName) name = user.displayName.split(' ')[0];

                    // City logic for distance
                    if (userData.city) {
                        currentUserCity = userData.city;
                        // Start geocoding user city immediately
                        const coords = await getCoordinates(currentUserCity);
                        if (coords) {
                            currentUserCoords = coords;
                            // If reports are loaded, update distances now
                            if (reportItemsLoaded) updateDistancesInFeed();
                        }
                    }
                }
            } catch (e) {
                console.warn("Could not fetch user profile", e);
            }

            if (greetingSpan) {
                greetingSpan.textContent = name + ".";
                localStorage.setItem('cachedUserName', name);
            }
        } else {
            if (greetingSpan) greetingSpan.textContent = 'Neighbor.';
        }
    });

    async function updateDistancesInFeed() {
        if (!currentUserCoords) return;

        const items = document.querySelectorAll('.issue-item');
        for (const item of items) {
            const distTag = item.querySelector('.distance-tag');
            if (!distTag) continue;

            // Check if report already has coords
            let reportCoords = null;
            if (item.dataset.lat && item.dataset.lon) {
                reportCoords = { lat: parseFloat(item.dataset.lat), lon: parseFloat(item.dataset.lon) };
            } else {
                // Try geocoding the query string
                const query = item.dataset.locationQuery;
                if (query) {
                    reportCoords = await getCoordinates(query);
                }
            }

            if (reportCoords) {
                const dist = calculateHaversine(currentUserCoords.lat, currentUserCoords.lon, reportCoords.lat, reportCoords.lon);
                distTag.textContent = dist + " km";
            } else {
                distTag.textContent = "? km";
            }
        }
    }
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

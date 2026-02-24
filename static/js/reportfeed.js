import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, orderBy, query, limit, startAfter, doc, getDoc, updateDoc, deleteDoc, increment, arrayUnion, arrayRemove, where, documentId, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { createReportCardHTML } from "./report-card.js";

// Firebase Config - DO NOT COMMIT API KEY
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

// Enable Offline Persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistence not supported');
    }
});

// State
let currentUser = null;
let lastVisible = null;
let isFetching = false;
let hasMore = true;
const BATCH_SIZE = 5;
const userCache = new Map();

// Active filters state
let activeFilters = {
    status: null,
    issueType: null,
    nearby: false
};

// Highlight report from URL parameter
const urlParams = new URLSearchParams(window.location.search);
const highlightReportId = urlParams.get('highlight');
let highlightFound = false;

// User's location for nearby filter
let userLat = null;
let userLng = null;
const NEARBY_RADIUS_KM = 10;

onAuthStateChanged(auth, (user) => {
    currentUser = user;
});

// ── Geolocation Helpers ─────────────────────────

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function calculateHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
        );
    });
}

// ── Global Handlers ─────────────────────────────

// Image Viewer
window.initViewer = (imgElement) => {
    const viewer = new Viewer(imgElement, {
        toolbar: {
            zoomIn: 1, zoomOut: 1, oneToOne: 1, reset: 1, prev: 0, play: 0, next: 0,
            rotateLeft: 1, rotateRight: 1, flipHorizontal: 1, flipVertical: 1,
        },
        navbar: false, title: false, tooltip: false, movable: true, zoomable: true,
        rotatable: true, scalable: true, transition: true, fullscreen: true,
    });
    viewer.show();
};

// Image Fit/Fill Toggle
window.toggleImgFit = (toggleBtn) => {
    const cardImage = toggleBtn.closest('.card-image');
    const img = cardImage.querySelector('img');
    if (!img) return;

    const isContain = img.classList.toggle('img-contain');

    if (isContain) {
        toggleBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>`;
    } else {
        toggleBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>`;
    }
};

// Three-dot menu toggle
window.toggleCardMenu = (btn) => {
    const wrapper = btn.closest('.card-menu-wrapper');
    const dropdown = wrapper.querySelector('.card-menu-dropdown');
    const card = btn.closest('.report-card');
    const reportUserId = card?.dataset.userId || '';
    const reportId = card?.id?.replace('report-', '') || '';

    // Close all other open menus first
    document.querySelectorAll('.card-menu-dropdown.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
    });

    // Build menu items dynamically
    if (!dropdown.dataset.built) {
        let menuItems = '';

        // Check if current user owns this report
        if (currentUser && reportUserId && currentUser.uid === reportUserId) {
            menuItems += `
                <button class="card-menu-item card-menu-item-danger" onclick="event.stopPropagation(); handleDeleteFromMenu('${reportId}')">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    Delete Report
                </button>`;
        }

        dropdown.innerHTML = menuItems || `<div class="card-menu-empty">No actions available</div>`;
        dropdown.dataset.built = 'true';
    }

    dropdown.classList.toggle('open');
};

// Delete from menu handler
window.handleDeleteFromMenu = async (reportId) => {
    // Close open menu
    document.querySelectorAll('.card-menu-dropdown.open').forEach(d => d.classList.remove('open'));

    if (!confirm("Are you sure you want to delete this report? This action cannot be undone.")) return;

    try {
        await deleteDoc(doc(db, 'reports', reportId));
        const card = document.getElementById(`report-${reportId}`);
        if (card) {
            card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => card.remove(), 300);
        }
    } catch (error) {
        console.error("Error deleting report:", error);
        alert("Failed to delete report. Please try again.");
    }
};

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-menu-wrapper')) {
        document.querySelectorAll('.card-menu-dropdown.open').forEach(d => d.classList.remove('open'));
    }
});

// Follow Handler — Fixed: no layout shift
window.handleFollow = async (btn, reportId) => {
    if (!currentUser) { alert("Please log in to follow issues."); return; }
    try {
        const textSpan = btn.querySelector('.follow-text');
        const isFollowing = btn.classList.contains('text-[#2563eb]');

        if (isFollowing) {
            // Unfollow
            btn.classList.remove('text-[#2563eb]', 'active-follow');
            btn.querySelector('svg').setAttribute('fill', 'none');
            textSpan.textContent = "Follow";
            textSpan.classList.remove('animating-count');

            const currentCount = parseInt(btn.getAttribute('data-followers') || '0');
            btn.setAttribute('data-followers', Math.max(0, currentCount - 1));

            await updateDoc(doc(db, 'reports', reportId), { followers: arrayRemove(currentUser.uid) });
        } else {
            // Follow
            btn.classList.add('text-[#2563eb]', 'active-follow');

            let currentCount = parseInt(btn.getAttribute('data-followers') || '0');
            btn.setAttribute('data-followers', currentCount + 1);

            const othersCount = currentCount;
            const msg = othersCount > 0 ? `+${othersCount}` : "1st!";

            textSpan.textContent = msg;
            textSpan.classList.remove('animating-count');
            // Force reflow to restart animation
            void textSpan.offsetWidth;
            textSpan.classList.add('animating-count');

            // After animation, revert to "Following"
            setTimeout(() => {
                if (btn.classList.contains('text-[#2563eb]')) {
                    textSpan.classList.remove('animating-count');
                    textSpan.textContent = "Following";
                }
            }, 5000);

            await updateDoc(doc(db, 'reports', reportId), { followers: arrayUnion(currentUser.uid) });
        }
    } catch (error) {
        console.error("Error following:", error);
        alert("Action failed. Please check connection.");
    }
};

// Rating Handler — Citizen star rating for resolved reports
window.handleRating = async (reportId, score, starEl) => {
    if (!currentUser) { alert("Please log in to rate."); return; }
    try {
        // Immediately update UI
        const container = document.getElementById(`rating-${reportId}`);
        if (!container) return;
        const stars = container.querySelectorAll('.rating-star');
        stars.forEach(s => {
            const starVal = parseInt(s.dataset.star);
            s.textContent = starVal <= score ? '★' : '☆';
            if (starVal <= score) {
                s.classList.add('filled');
                s.style.color = '#f59e0b';
                s.style.transform = 'scale(1.2)';
                setTimeout(() => s.style.transform = 'scale(1)', 200);
            }
            // Disable clicking
            s.classList.remove('clickable');
            s.style.cursor = 'default';
            s.removeAttribute('onclick');
        });

        // Show confirmation
        const confirmEl = document.createElement('span');
        confirmEl.style.cssText = 'font-size: 0.7rem; color: #10b981; font-weight: 600; margin-left: 6px;';
        confirmEl.textContent = '✓ Rated!';
        container.appendChild(confirmEl);

        // Save to Firestore (ratings map: userId -> {score, timestamp})
        await updateDoc(doc(db, 'reports', reportId), {
            [`ratings.${currentUser.uid}`]: {
                score: score,
                timestamp: Date.now()
            }
        });

    } catch (error) {
        console.error("Error rating:", error);
        alert("Rating failed. Please try again.");
    }
};

// ── Main ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const feedContainer = document.getElementById('feed-container');
    const filterBtn = document.getElementById('filter-btn');
    const filterPanel = document.getElementById('filter-panel');

    // ── Filter Panel Logic ──────────────────────
    if (filterBtn && filterPanel) {
        filterBtn.addEventListener('click', () => {
            filterPanel.classList.toggle('open');
        });

        // Chip selection
        filterPanel.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;

            const group = chip.dataset.filterGroup;

            // Toggle selection within group (single selection per group)
            const siblings = filterPanel.querySelectorAll(`.filter-chip[data-filter-group="${group}"]`);
            siblings.forEach(s => {
                if (s === chip) {
                    s.classList.toggle('selected');
                } else {
                    s.classList.remove('selected');
                }
            });
        });

        // Apply button
        const applyBtn = filterPanel.querySelector('.filter-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', async () => {
                // Read selected chips
                const selectedStatus = filterPanel.querySelector('.filter-chip[data-filter-group="status"].selected');
                const selectedType = filterPanel.querySelector('.filter-chip[data-filter-group="type"].selected');
                const selectedNearby = filterPanel.querySelector('.filter-chip[data-filter-group="location"].selected');

                activeFilters.status = selectedStatus ? selectedStatus.dataset.filterValue : null;
                activeFilters.issueType = selectedType ? selectedType.dataset.filterValue : null;
                activeFilters.nearby = !!selectedNearby;

                // If nearby is selected, get user location
                if (activeFilters.nearby && !userLat) {
                    const nearbyChip = document.getElementById('nearby-chip');
                    if (nearbyChip) nearbyChip.textContent = '📍 Getting location...';

                    const loc = await getUserLocation();
                    if (loc) {
                        userLat = loc.lat;
                        userLng = loc.lng;
                        if (nearbyChip) nearbyChip.textContent = '📍 Nearby (10 km)';
                    } else {
                        alert('Could not get your location. Please enable location access.');
                        activeFilters.nearby = false;
                        if (nearbyChip) {
                            nearbyChip.classList.remove('selected');
                            nearbyChip.textContent = '📍 Nearby (10 km)';
                        }
                    }
                }

                // Update filter button badge
                updateFilterBadge();

                // Apply filters to visible cards
                applyClientFilters();

                // Close panel
                filterPanel.classList.remove('open');
            });
        }

        // Clear button
        const clearBtn = filterPanel.querySelector('.filter-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                filterPanel.querySelectorAll('.filter-chip.selected').forEach(c => c.classList.remove('selected'));
                activeFilters.status = null;
                activeFilters.issueType = null;
                activeFilters.nearby = false;
                updateFilterBadge();
                applyClientFilters();
            });
        }
    }

    function hasActiveFilters() {
        return activeFilters.status || activeFilters.issueType || activeFilters.nearby;
    }

    function updateFilterBadge() {
        if (!filterBtn) return;
        const count = (activeFilters.status ? 1 : 0) + (activeFilters.issueType ? 1 : 0) + (activeFilters.nearby ? 1 : 0);
        const badge = filterBtn.querySelector('.filter-count-badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
        filterBtn.classList.toggle('has-filters', count > 0);
    }

    function applyClientFilters() {
        const cards = feedContainer.querySelectorAll('.report-card');
        cards.forEach(card => {
            let show = true;

            // Status filter
            if (activeFilters.status) {
                const cardStatus = (card.dataset.status || '').toLowerCase();
                if (cardStatus !== activeFilters.status.toLowerCase()) {
                    show = false;
                }
            }

            // Issue type filter
            if (activeFilters.issueType) {
                const cardType = (card.dataset.issueType || '').toLowerCase();
                if (cardType !== activeFilters.issueType.toLowerCase()) {
                    show = false;
                }
            }

            // Nearby filter (10km radius)
            if (activeFilters.nearby && userLat && userLng) {
                const cardLat = parseFloat(card.dataset.lat);
                const cardLng = parseFloat(card.dataset.lng);

                if (!isNaN(cardLat) && !isNaN(cardLng)) {
                    const distance = calculateHaversine(userLat, userLng, cardLat, cardLng);
                    if (distance > NEARBY_RADIUS_KM) {
                        show = false;
                    }
                } else {
                    // No coordinates — hide when nearby filter is active
                    show = false;
                }
            }

            card.style.display = show ? '' : 'none';
        });

        // Show "no results" message if all hidden
        const visibleCount = feedContainer.querySelectorAll('.report-card:not([style*="display: none"])').length;
        let noResultsEl = feedContainer.querySelector('.filter-no-results');
        if (visibleCount === 0 && hasActiveFilters()) {
            if (!noResultsEl) {
                noResultsEl = document.createElement('div');
                noResultsEl.className = 'filter-no-results';
                noResultsEl.style.cssText = 'text-align:center; padding:2rem 1rem; color:#9ca3af; font-size:0.9rem; font-weight:500;';
                noResultsEl.textContent = 'No reports match your filters.';
                feedContainer.insertBefore(noResultsEl, document.getElementById('feed-sentinel'));
            }
        } else if (noResultsEl) {
            noResultsEl.remove();
        }
    }

    // ── Feed Loading ────────────────────────────

    // Clear initial content
    feedContainer.innerHTML = '';

    // Add Sentinel for Infinite Scroll
    const sentinel = document.createElement('div');
    sentinel.id = 'feed-sentinel';
    sentinel.className = 'py-4 text-center text-gray-500 text-sm';
    feedContainer.appendChild(sentinel);

    // Initial Fetch
    await fetchReports();

    // If we need to highlight a report, try to find it and keep loading if needed
    if (highlightReportId && !highlightFound) {
        await scrollToHighlightedReport();
    }

    // Intersection Observer for Infinite Scroll
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isFetching && hasMore) {
            fetchReports();
        }
    }, { rootMargin: '200px' });

    observer.observe(sentinel);

    async function fetchReports() {
        if (isFetching || !hasMore) return;
        isFetching = true;

        // Show Skeletons
        const skeletonContainer = document.createElement('div');
        skeletonContainer.id = 'skeleton-container';
        skeletonContainer.innerHTML = createSkeletonHTML().repeat(2);
        feedContainer.insertBefore(skeletonContainer, sentinel);

        try {
            let q;
            if (lastVisible) {
                q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(BATCH_SIZE));
            } else {
                q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(BATCH_SIZE));
            }

            const querySnapshot = await getDocs(q);

            // Remove Skeletons
            skeletonContainer.remove();

            if (querySnapshot.empty) {
                hasMore = false;
                sentinel.innerText = lastVisible ? "You've reached the end." : "No reports found.";
                isFetching = false;
                return;
            }

            lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

            // Collect User IDs for Batch Fetch
            const userIdsToFetch = new Set();
            querySnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.userId && !userCache.has(data.userId)) {
                    userIdsToFetch.add(data.userId);
                }
            });

            // Process Docs & Render Immediately (Optimistic UI)
            const fragment = document.createDocumentFragment();

            for (const docSnapshot of querySnapshot.docs) {
                const reportData = docSnapshot.data();

                // Auto-hide resolved reports older than 36 hours
                const RESOLVED_HIDE_HOURS = 36;
                const isResolvedStatus = (reportData.status || '').toLowerCase() === 'resolved' ||
                    (reportData.status || '').toLowerCase() === 'completed' ||
                    (reportData.status || '').toLowerCase() === 'fixed';
                if (isResolvedStatus && reportData.resolvedAt?.seconds) {
                    const resolvedTime = reportData.resolvedAt.seconds * 1000;
                    const hoursSinceResolved = (Date.now() - resolvedTime) / (1000 * 60 * 60);
                    if (hoursSinceResolved > RESOLVED_HIDE_HOURS) {
                        continue; // Skip this report — auto-hidden
                    }
                }

                let cachedName = undefined;
                let cachedPhoto = undefined;
                if (reportData.userId && userCache.has(reportData.userId)) {
                    const cached = userCache.get(reportData.userId);
                    cachedName = cached.name;
                    cachedPhoto = cached.photo;
                }

                const cardHTML = createReportCardHTML(docSnapshot.id, reportData, currentUser, {
                    userName: cachedName,
                    userPhoto: cachedPhoto
                });

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = cardHTML;
                const cardElement = tempDiv.firstElementChild;

                if (!cachedName && reportData.userId) {
                    cardElement.setAttribute('data-author-id', reportData.userId);
                }

                fragment.appendChild(cardElement);
            }

            feedContainer.insertBefore(fragment, sentinel);

            // Check if the highlighted report was loaded
            if (highlightReportId && !highlightFound) {
                const highlightedCard = document.getElementById(`report-${highlightReportId}`);
                if (highlightedCard) {
                    highlightFound = true;
                }
            }

            // Apply filters to new cards if any active
            if (hasActiveFilters()) {
                applyClientFilters();
            }

            // Fetch missing users in background & Hydrate DOM
            if (userIdsToFetch.size > 0) {
                fetchUsersAndHydrate(Array.from(userIdsToFetch));
            }

        } catch (error) {
            console.error("Error fetching reports:", error);
            skeletonContainer.remove();
            sentinel.innerText = "Error loading reports. Pull to refresh.";
        } finally {
            isFetching = false;
        }
    }

    async function fetchUsersAndHydrate(userIds) {
        const promises = userIds.map(async (uid) => {
            try {
                if (userCache.has(uid)) {
                    hydrateCardsForUser(uid, userCache.get(uid));
                    return;
                }

                const userSnap = await getDoc(doc(db, "users", uid));
                let userName = "Anonymous";
                let userPhoto = null;

                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    userName = userData.displayName || userData.fullname ||
                        (userData.firstName ? `${userData.firstName} ${userData.lastName || ''}`.trim() : "Anonymous");
                    userPhoto = userData.photoURL || userData.avatar || userData.profilePic || null;
                }

                const userInfo = { name: userName, photo: userPhoto };
                userCache.set(uid, userInfo);
                hydrateCardsForUser(uid, userInfo);

            } catch (e) {
                console.warn(`Failed to fetch user ${uid}`, e);
                userCache.set(uid, { name: "Anonymous", photo: null });
            }
        });

        await Promise.all(promises);
    }

    function hydrateCardsForUser(uid, userInfo) {
        const cards = document.querySelectorAll(`.report-card[data-author-id="${uid}"]`);
        cards.forEach(card => {
            const nameEl = card.querySelector('.username');
            const avatarContainer = card.querySelector('.user-profile');

            if (nameEl) nameEl.textContent = userInfo.name;

            if (avatarContainer) {
                const oldAvatar = avatarContainer.querySelector('.avatar-circle');
                if (oldAvatar) oldAvatar.remove();

                const newAvatarStr = userInfo.photo
                    ? `<img src="${userInfo.photo}" alt="${userInfo.name}" class="avatar-circle object-cover">`
                    : `<div class="avatar-circle">${userInfo.name.charAt(0).toUpperCase()}</div>`;

                avatarContainer.insertAdjacentHTML('afterbegin', newAvatarStr);
            }

            card.removeAttribute('data-author-id');
        });
    }

    // Scroll to and highlight a specific report card
    function highlightAndScrollToCard(card) {
        card.style.transition = 'box-shadow 0.5s ease, border-color 0.5s ease';
        card.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.2)';
        card.style.borderRadius = '12px';
        card.style.position = 'relative';
        card.style.zIndex = '5';

        setTimeout(() => {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);

        let pulseCount = 0;
        const pulseInterval = setInterval(() => {
            pulseCount++;
            if (pulseCount % 2 === 0) {
                card.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.2)';
            } else {
                card.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3), 0 0 10px rgba(59, 130, 246, 0.1)';
            }
            if (pulseCount >= 6) {
                clearInterval(pulseInterval);
                setTimeout(() => {
                    card.style.boxShadow = 'none';
                }, 500);
            }
        }, 500);

        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
    }

    async function scrollToHighlightedReport() {
        const existing = document.getElementById(`report-${highlightReportId}`);
        if (existing) {
            highlightFound = true;
            highlightAndScrollToCard(existing);
            return;
        }

        while (hasMore && !highlightFound) {
            await fetchReports();
            const card = document.getElementById(`report-${highlightReportId}`);
            if (card) {
                highlightFound = true;
                highlightAndScrollToCard(card);
                return;
            }
        }

        if (!highlightFound) {
            try {
                const reportRef = doc(db, 'reports', highlightReportId);
                const reportSnap = await getDoc(reportRef);
                if (reportSnap.exists()) {
                    const reportData = reportSnap.data();
                    let cachedName = undefined;
                    let cachedPhoto = undefined;
                    if (reportData.userId && userCache.has(reportData.userId)) {
                        const cached = userCache.get(reportData.userId);
                        cachedName = cached.name;
                        cachedPhoto = cached.photo;
                    }
                    const cardHTML = createReportCardHTML(highlightReportId, reportData, currentUser, {
                        userName: cachedName,
                        userPhoto: cachedPhoto
                    });
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = cardHTML;
                    const cardElement = tempDiv.firstElementChild;
                    if (!cachedName && reportData.userId) {
                        cardElement.setAttribute('data-author-id', reportData.userId);
                    }
                    feedContainer.insertBefore(cardElement, feedContainer.firstChild);
                    if (!cachedName && reportData.userId) {
                        fetchUsersAndHydrate([reportData.userId]);
                    }
                    highlightFound = true;
                    highlightAndScrollToCard(cardElement);
                }
            } catch (e) {
                console.warn('Could not fetch highlighted report:', e.message);
            }
        }
    }

    // Generate Skeleton HTML
    function createSkeletonHTML() {
        return `
        <div class="skeleton-card animate-pulse">
            <div class="skeleton-header">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-text-group">
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line short"></div>
                </div>
            </div>
            <div class="skeleton-image"></div>
            <div class="skeleton-actions"></div>
        </div>
        `;
    }

    // ── Swipe Event Delegation ──────────────────
    feedContainer.addEventListener('touchstart', (e) => {
        const card = e.target.closest('.report-card');
        if (!card) return;
        card.touchStartX = e.changedTouches[0].screenX;
        card.touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    feedContainer.addEventListener('touchend', (e) => {
        const card = e.target.closest('.report-card');
        if (!card) return;

        const endX = e.changedTouches[0].screenX;
        const endY = e.changedTouches[0].screenY;
        const startX = card.touchStartX || 0;
        const startY = card.touchStartY || 0;

        const xDiff = endX - startX;
        const yDiff = endY - startY;

        if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > 50) {
            card.classList.toggle('revealed');
        }
    }, { passive: true });

    // Desktop Swipe Simulation
    feedContainer.addEventListener('mousedown', (e) => {
        const card = e.target.closest('.report-card');
        if (!card) return;
        if (e.target.tagName === 'IMG' || e.target.closest('button')) return;

        card.isMouseDown = true;
        card.mouseStartX = e.screenX;
    });

    feedContainer.addEventListener('mouseup', (e) => {
        const card = e.target.closest('.report-card');
        if (!card || !card.isMouseDown) return;

        card.isMouseDown = false;
        const endX = e.screenX;
        if (Math.abs(endX - card.mouseStartX) > 50) {
            card.classList.toggle('revealed');
        }
    });
});

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, orderBy, query, limit, startAfter, doc, getDoc, updateDoc, increment, arrayUnion, arrayRemove, where, documentId, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
        // Multiple tabs open, persistence can only be enabled in one tab at a a time.
        console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        // The current browser does not support all of the features required to enable persistence
        console.warn('Persistence not supported');
    }
});

// State
let currentUser = null;
let lastVisible = null;
let isFetching = false;
let hasMore = true;
const BATCH_SIZE = 5;
const userCache = new Map(); // Cache user profiles to reduce reads

onAuthStateChanged(auth, (user) => {
    currentUser = user;
});

// Global Handlers
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

// (Vote handler removed as per request)

window.handleFollow = async (btn, reportId) => {
    if (!currentUser) { alert("Please log in to follow issues."); return; }
    try {
        const textSpan = btn.querySelector('.follow-text');
        const isFollowing = btn.classList.contains('text-[#6366f1]');

        // Toggle State Immediately
        if (isFollowing) {
            // Unfollow
            btn.classList.remove('text-[#6366f1]');
            textSpan.textContent = "Follow";

            // Decrement data attribute for consistency
            const currentCount = parseInt(btn.getAttribute('data-followers') || '0');
            btn.setAttribute('data-followers', Math.max(0, currentCount - 1));

            await updateDoc(doc(db, 'reports', reportId), { followers: arrayRemove(currentUser.uid) });
        } else {
            // Follow
            btn.classList.add('text-[#6366f1]');

            // Increment data attribute
            let currentCount = parseInt(btn.getAttribute('data-followers') || '0');
            btn.setAttribute('data-followers', currentCount + 1);

            // ANIMATION LOGIC
            // "tell how many more people are following... fade in animation for 5 sec and then fade back"

            // Current count includes me now. So "others" = currentCount (which was old total).
            // Example: 0 followers -> I follow -> total 1. "0 others".
            // Example: 5 followers -> I follow -> total 6. "5 others".
            // The prompt says "how many *more* people".
            const othersCount = currentCount;
            const msg = othersCount > 0 ? `+ ${othersCount} others` : "You're first!";

            textSpan.textContent = msg;
            textSpan.classList.add('animating-count');

            // After 5 seconds, revert to "Following"
            setTimeout(() => {
                // Only revert if we are still following!
                if (btn.classList.contains('text-[#6366f1]')) {
                    textSpan.classList.remove('animating-count');
                    textSpan.textContent = "Following"; // or maintain opacity transition

                    // Trigger a smooth fade back? The css removal might jump.
                    // The CSS @keyframes ends at opacity: 0. 
                    // To fade *back in* to "Following", we might need a 2nd step.
                    // But simpler: Just set text and let it stay. 
                    // Actually, the keyframes end with opacity 0?? 
                    // Wait, `fadeInOut` in CSS goes 0 -> 1 -> 1 -> 0.
                    // So at 5s, it is invisible (opacity 0). 
                    // We swap text to "Following" and remove class (opacity 1 default).
                    // This creates a "fade back in" effect implicitly if removed correctly.
                }
            }, 5000);

            await updateDoc(doc(db, 'reports', reportId), { followers: arrayUnion(currentUser.uid) });
        }
    } catch (error) {
        console.error("Error following:", error);
        alert("Action failed. Please check connection.");
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const feedContainer = document.getElementById('feed-container');

    // Clear initial content
    feedContainer.innerHTML = '';

    // Add Sentinel for Infinite Scroll
    const sentinel = document.createElement('div');
    sentinel.id = 'feed-sentinel';
    sentinel.className = 'py-4 text-center text-gray-500 text-sm';
    feedContainer.appendChild(sentinel);

    // Initial Fetch
    await fetchReports();

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
        skeletonContainer.innerHTML = createSkeletonHTML().repeat(2); // Show 2 skeletons
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

                // Get cached user info if available, else undefined (will default to Anonymous or snapshot name)
                let cachedName = undefined;
                let cachedPhoto = undefined;
                if (reportData.userId && userCache.has(reportData.userId)) {
                    const cached = userCache.get(reportData.userId);
                    cachedName = cached.name;
                    cachedPhoto = cached.photo;
                }

                // Render with current best knowledge
                const cardHTML = createReportCardHTML(docSnapshot.id, reportData, currentUser, {
                    userName: cachedName,
                    userPhoto: cachedPhoto
                });

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = cardHTML;
                const cardElement = tempDiv.firstElementChild;

                // Mark for hydration if needed
                if (!cachedName && reportData.userId) {
                    cardElement.setAttribute('data-author-id', reportData.userId);
                }

                fragment.appendChild(cardElement);
            }

            feedContainer.insertBefore(fragment, sentinel);

            // Fetch missing users in background & Hydrate DOM
            if (userIdsToFetch.size > 0) {
                // Do NOT await this. Let it run in background.
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
                // Check cache again in case populated
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
                // Don't cache failure forever ideally, but for now prevent loops
                userCache.set(uid, { name: "Anonymous", photo: null });
            }
        });

        await Promise.all(promises);
    }

    function hydrateCardsForUser(uid, userInfo) {
        const cards = document.querySelectorAll(`.report-card[data-author-id="${uid}"]`);
        cards.forEach(card => {
            const nameEl = card.querySelector('.username');
            const avatarContainer = card.querySelector('.user-profile'); // Wrapper

            if (nameEl) nameEl.textContent = userInfo.name;

            if (avatarContainer) {
                // Replace avatar
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

    // Event Delegation for Swipe
    feedContainer.addEventListener('touchstart', (e) => {
        const card = e.target.closest('.report-card');
        if (!card) return;

        // Store start coords on the card element
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

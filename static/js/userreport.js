import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy, doc, updateDoc, increment, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { createReportCardHTML } from "./report-card.js";

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

document.addEventListener('DOMContentLoaded', async () => {
    const feedContainer = document.getElementById('user-feed-container');

    // (Vote handler removed)

    // Initialize Viewer.js
    window.initViewer = (imgElement) => {
        const viewer = new Viewer(imgElement, {
            toolbar: {
                zoomIn: 1, zoomOut: 1, oneToOne: 1, reset: 1,
                prev: 0, play: 0, next: 0,
                rotateLeft: 1, rotateRight: 1, flipHorizontal: 1, flipVertical: 1,
            },
            navbar: false, title: false, tooltip: false, movable: true, zoomable: true, rotatable: true, scalable: true, transition: true, fullscreen: true,
        });
        viewer.show();
    };

    // Attach Delete Handler
    window.handleDelete = async (reportId) => {
        if (!confirm("Are you sure you want to delete this report? This action cannot be undone.")) return;
        try {
            await deleteDoc(doc(db, 'reports', reportId));
            const card = document.getElementById(`report-${reportId}`);
            if (card) card.remove();

            // Optional: Show toast or alert
        } catch (error) {
            console.error("Error deleting report:", error);
            alert("Failed to delete report. Please try again.");
        }
    };

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        try {
            const q = query(collection(db, 'reports'), where("userId", "==", user.uid));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                feedContainer.innerHTML = '<p class="text-center text-[var(--text-muted)] py-8">You haven\'t submitted any reports yet.</p>';
                return;
            }

            // Client-side sort
            const docs = [];
            querySnapshot.forEach(doc => docs.push({ ...doc.data(), id: doc.id }));
            docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

            // Fetch User Profile Data
            let realName = user.displayName || user.email || "Me";
            let realPhoto = user.photoURL || null;
            try {
                const userDocSnap = await getDoc(doc(db, "users", user.uid));
                if (userDocSnap.exists()) {
                    const uData = userDocSnap.data();
                    realName = uData.fullname || uData.displayName || realName;
                    realPhoto = uData.avatar || uData.photoURL || uData.profilePic || realPhoto;
                }
            } catch (e) { console.warn("Error fetching user profile:", e); }

            let html = '';

            docs.forEach((data) => {
                // Check deletion (48h)
                const dateObj = data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date();
                const hoursDiff = Math.abs(new Date() - dateObj) / 36e5;
                const canDelete = hoursDiff < 48;

                // Create Card HTML
                html += createReportCardHTML(data.id, data, user, {
                    isOwnReport: true, // Hides Follow Button
                    canDelete: canDelete,
                    userName: realName,  // Override with fetched profile
                    userPhoto: realPhoto
                });
            });

            feedContainer.innerHTML = html;

            // ATTACH SWIPE LISTENERS for CARD FLIP
            const cards = document.querySelectorAll('.report-card');

            cards.forEach(card => {
                let touchstartX = 0;
                let touchstartY = 0;
                let touchendX = 0;
                let touchendY = 0;

                card.addEventListener('touchstart', (e) => {
                    touchstartX = e.changedTouches[0].screenX;
                    touchstartY = e.changedTouches[0].screenY;
                }, { passive: true });

                card.addEventListener('touchend', (e) => {
                    touchendX = e.changedTouches[0].screenX;
                    touchendY = e.changedTouches[0].screenY;
                    handleGesture(card);
                }, { passive: true });

                // Mouse interaction for desktop testing
                let isMouseDown = false;
                card.addEventListener('mousedown', (e) => {
                    // Prevent drag on Viewer.js or buttons
                    if (e.target.tagName === 'IMG' || e.target.closest('button')) return;

                    isMouseDown = true;
                    touchstartX = e.screenX;
                });
                card.addEventListener('mouseup', (e) => {
                    if (!isMouseDown) return;
                    isMouseDown = false;
                    touchendX = e.screenX;
                    if (Math.abs(touchendX - touchstartX) > 50) {
                        toggleReveal(card);
                    }
                });

                function handleGesture(el) {
                    const xDiff = touchendX - touchstartX;
                    const yDiff = touchendY - touchstartY;
                    if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > 50) {
                        toggleReveal(el);
                    }
                }

                function toggleReveal(el) {
                    el.classList.toggle('revealed');
                }
            });

        } catch (error) {
            console.error("Error fetching user reports:", error);
            feedContainer.innerHTML = '<p class="text-center text-red-500 py-8">Failed to load your reports.</p>';
        }
    });
});

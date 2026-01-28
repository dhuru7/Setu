
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

// --- HELPER: Jurisdiction Match ---
function isReportInJurisdiction(report, officerJurisdiction) {
    if (!officerJurisdiction) return true; // Fail-safe: if no jurisdiction set, maybe show all (or none? conservative: show all for now or strict?)
    // User said "falls under his jurisdiction". If not set, maybe he sees nothing?
    // Let's assume if jurisdiction is NOT set, he sees nothing or just department based.
    // For now, if jurisdiction is empty object, we treat it as "Not Set". 

    // Strict Structure Check
    const j = officerJurisdiction;
    const loc = report.location || {};

    // 1. Village Match (Most Specific)
    // If officer has specific villages assigned, report MUST be in one of them.
    if (j.villages && Array.isArray(j.villages) && j.villages.length > 0) {
        const reportVillage = (loc.village || '').trim().toLowerCase();
        if (!reportVillage) return false;
        // Check if report village is in officer's list (normalized)
        const officerVillages = j.villages.map(v => v.trim().toLowerCase());
        if (officerVillages.includes(reportVillage)) return true;

        // If report is NOT in listed villages, but matches Sub-district?
        // Usually Village assignment implies ONLY those villages.
        return false;
    }

    // 2. Sub-district Match
    if (j.subDistrict) {
        const reportSub = (loc.subdistrict || '').trim().toLowerCase();
        const officerSub = j.subDistrict.trim().toLowerCase();
        // If report subdistrict matches, it's ours.
        if (reportSub === officerSub) return true;
        // If not, fail (assuming officer is restricted to this subdistrict)
        return false;
    }

    // 3. District Match
    if (j.district) {
        const reportDist = (loc.district || '').trim().toLowerCase();
        const officerDist = j.district.trim().toLowerCase();
        if (reportDist === officerDist) return true;
        return false;
    }

    // 4. State Match
    if (j.state) {
        const reportState = (loc.state || '').trim().toLowerCase();
        const officerState = j.state.trim().toLowerCase();
        if (reportState === officerState) return true;
    }

    // If no jurisdiction constraints (e.g. state/district empty), maybe national?
    // Assuming at least State is set usually.
    return false;
}

// --- CORE FUNCTION: Fetch Reports ---
export async function fetchOfficerReports(userUid) {
    try {
        // 1. Get Officer Profile
        const userDoc = await getDoc(doc(db, "users", userUid));
        if (!userDoc.exists()) throw new Error("User profile not found");

        const userData = userDoc.data();
        const officerDept = userData.department;
        const officerJurisdiction = userData.jurisdiction;

        if (!officerDept) {
            console.warn("Officer has no department assigned.");
            return [];
        }

        // 2. Get All Reports (Firestore Filtering Limitation: can't easily filter by JSON object field for jurisdiction)
        // We will fetch ALL reports and filter client-side for Jurisdiction.
        // We CAN filter by 'department' server-side if indexed, but for now fetch all to be safe or filter by dept.

        // OPTIMIZATION: Filter by department server-side
        const q = query(collection(db, "reports"), where("department", "==", officerDept));
        const querySnapshot = await getDocs(q);

        const reports = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id; // Attach ID
            // Client-side Jurisdiction Filter
            if (isReportInJurisdiction(data, officerJurisdiction)) {
                reports.push(data);
            }
        });

        // Sort by date desc
        reports.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        return reports;

    } catch (error) {
        console.error("Error fetching reports:", error);
        return [];
    }
}

// --- UI LOGIC (Only runs if on specific page) ---
if (document.getElementById('reports-table-body')) {
    // We are on Reports Page
    document.addEventListener('DOMContentLoaded', () => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const tbody = document.getElementById('reports-table-body');
                tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8">Loading reports...</td></tr>';

                const reports = await fetchOfficerReports(user.uid);

                if (reports.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-[var(--text-muted)]">No reports found for your department and jurisdiction.</td></tr>';
                    return;
                }

                tbody.innerHTML = ''; // Clear loading
                reports.forEach(report => {
                    const date = report.createdAt ? new Date(report.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
                    const statusClass = report.status === 'Resolved' ? 'text-green-600 bg-green-100' : (report.status === 'In Progress' ? 'text-blue-600 bg-blue-100' : 'text-yellow-600 bg-yellow-100');
                    const row = `
                        <tr class="border-t border-[var(--border-light)] hover:bg-[var(--bg-accent)] transition-colors">
                            <td class="p-4 font-mono text-xs">${report.id.substring(0, 6)}...</td>
                            <td class="p-4 font-medium">${report.issueType || 'Unspecified'}</td>
                            <td class="p-4 text-sm">${[report.location?.full, report.location?.district].filter(Boolean).join(', ') || 'Unknown Location'}</td>
                            <td class="p-4"><span class="px-2 py-1 text-xs rounded-full ${statusClass}">${report.status}</span></td>
                            <td class="p-4 text-sm">${date}</td>
                            <td class="p-4 text-sm">${report.userName || 'Anonymous'}</td>
                            <td class="p-4">
                                <button class="text-[var(--accent-primary)] hover:underline" onclick="alert('View Details feature coming soon for ID: ${report.id}')">View</button>
                            </td>
                        </tr>
                    `;
                    tbody.innerHTML += row;
                });
            }
        });
    });
}

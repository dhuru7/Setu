
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// --- HELPER: Jurisdiction Match ---
function isReportInJurisdiction(report, officerJurisdiction) {
    if (!officerJurisdiction) return true; // Default to showing if no specific restriction found? Or maybe stricter?

    // If strict jurisdiction is required:
    // User requirement: "sort them if the village or subdistrict or district falls in the officer jurisdriction"

    const j = officerJurisdiction;
    const loc = report.location || {};

    // 1. Village Match
    if (j.villages && Array.isArray(j.villages) && j.villages.length > 0) {
        const reportVillage = (loc.village || '').trim().toLowerCase();
        if (!reportVillage) return false;
        const officerVillages = j.villages.map(v => v.trim().toLowerCase());
        if (officerVillages.includes(reportVillage)) return true;
        return false;
    }

    // 2. Sub-district Match
    if (j.subDistrict) {
        const reportSub = (loc.subdistrict || '').trim().toLowerCase();
        const officerSub = j.subDistrict.trim().toLowerCase();
        if (reportSub === officerSub) return true;
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

    // If jurisdiction is set but empty? 
    // Assume if they have a profile but empty J fields, they might be top level?
    return false;
}

// --- CORE FUNCTION: Fetch Reports ---
export async function fetchOfficerReports(userUid) {
    try {
        console.log("Fetching reports for officer:", userUid);
        const userDoc = await getDoc(doc(db, "users", userUid));

        if (!userDoc.exists()) {
            console.error("User profile not found in DB");
            return [];
        }

        const userData = userDoc.data();
        let officerDept = userData.department;
        const officerJurisdiction = userData.jurisdiction;

        console.log("Officer Dept (Raw):", officerDept);
        console.log("Officer Jurisdiction:", officerJurisdiction);

        // Fallback: Infer department if missing (Self-healing from ID Card)
        if (!officerDept && userData.idCard) {
            console.warn("Officer has no department assigned. Inferring from ID...");
            const prefix = userData.idCard.substring(0, 4).toUpperCase();
            if (prefix === 'GPWD') officerDept = 'Public Works Department (PWD)';
            else if (prefix === 'GSWM') officerDept = 'Solid Waste Management (SWM)';
            else if (prefix === 'GDJB') officerDept = 'Water Supply & Sewerage Board';
            else if (prefix === 'GOED') officerDept = 'Electrical Department';
            else officerDept = 'General Administration';
        }

        if (!officerDept) {
            console.warn("Could not determine officer department.");
            return [];
        }

        // Department Aliasing (Handle Legacy Data Mismatches)
        let deptAliases = [officerDept];
        if (officerDept === "Solid Waste Management (SWM)") deptAliases.push("Department of Sanitation");
        if (officerDept === "Department of Sanitation") deptAliases.push("Solid Waste Management (SWM)");
        if (officerDept === "Electrical Department") deptAliases.push("Electricity Board");

        // 1. Fetch ALL reports for the department(s)
        console.log("Querying reports for departments:", deptAliases);
        const q = query(collection(db, "reports"), where("department", "in", deptAliases));
        const querySnapshot = await getDocs(q);

        const reports = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id;

            // 2. Client-side Jurisdiction Filter
            if (isReportInJurisdiction(data, officerJurisdiction)) {
                reports.push(data);
            }
        });

        // 3. Sort by date desc (Newest first)
        reports.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        console.log(`Found ${querySnapshot.size} total reports for department. Matching jurisdiction: ${reports.length}`);
        return reports;

    } catch (error) {
        console.error("Error fetching reports:", error);
        return [];
    }
}

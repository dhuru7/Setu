
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, where, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// --- HELPER: Jurisdiction Match ---
function isReportInJurisdiction(report, officerJurisdiction) {
    if (!officerJurisdiction) {
        console.log("Jurisdiction Check: Allowed (No jurisdiction set)");
        return true;
    }

    const j = officerJurisdiction;
    const loc = report.location || {};

    // 1. Village Match
    if (j.villages && Array.isArray(j.villages) && j.villages.length > 0) {
        const reportVillage = (loc.village || '').trim().toLowerCase();
        const officerVillages = j.villages.map(v => v.trim().toLowerCase());

        if (reportVillage && officerVillages.includes(reportVillage)) {
            console.log("Jurisdiction Match: Village");
            return true;
        }
    }

    // 2. Sub-district Match
    if (j.subDistrict) {
        const reportSub = (loc.subdistrict || '').trim().toLowerCase();
        const officerSub = j.subDistrict.trim().toLowerCase();
        if (reportSub === officerSub) {
            console.log("Jurisdiction Match: SubDistrict");
            return true;
        }
    }

    // 3. District Match
    if (j.district) {
        const reportDist = (loc.district || '').trim().toLowerCase();
        const officerDist = j.district.trim().toLowerCase();
        if (reportDist === officerDist) {
            console.log("Jurisdiction Match: District");
            return true;
        }
    }

    // 4. State Match
    if (j.state) {
        const reportState = (loc.state || '').trim().toLowerCase();
        const officerState = j.state.trim().toLowerCase();
        if (reportState === officerState) {
            console.log("Jurisdiction Match: State");
            return true;
        }
    }

    console.log("Jurisdiction Check: Failed for report", report.id);
    return false;
}

// --- HELPER: Determine Dept from Issue (For Data Recovery) ---
function determineDepartment(issueType) {
    if (!issueType) return "General Administration";
    const lower = issueType.toLowerCase();

    // Public Works
    if (lower.includes("road") || lower.includes("pothole")) return "Public Works Department (PWD)";

    // Sanitation
    if (lower.includes("garbage") || lower.includes("dustbin") || lower.includes("waste") || lower.includes("dump") || lower.includes("clean")) return "Solid Waste Management (SWM)";

    // Electrical
    if (lower.includes("light") || lower.includes("electric") || lower.includes("lamp") || lower.includes("pole") || lower.includes("streetlight")) return "Electrical Department";

    // Water/Sewage
    if (lower.includes("sewage") || lower.includes("water") || lower.includes("drain") || lower.includes("pipe") || lower.includes("leak")) return "Water Supply & Sewerage Board";

    return "General Administration";
}

// --- CORE FUNCTION: Fetch Reports ---
export async function fetchOfficerReports(userUid) {
    try {
        console.log("Fetching reports for officer (v2 - Dual Query):", userUid);
        const userDoc = await getDoc(doc(db, "users", userUid));

        if (!userDoc.exists()) {
            console.error("User profile not found in DB");
            return [];
        }

        const userData = userDoc.data();
        let officerDept = userData.department;
        const officerJurisdiction = userData.jurisdiction;

        console.log("Officer Dept:", officerDept);

        // Fallback: Infer department
        if (!officerDept && userData.idCard) {
            const prefix = userData.idCard.substring(0, 4).toUpperCase();
            if (prefix === 'GPWD') officerDept = 'Public Works Department (PWD)';
            else if (prefix === 'GSWM') officerDept = 'Solid Waste Management (SWM)';
            else if (prefix === 'GDJB') officerDept = 'Water Supply & Sewerage Board';
            else if (prefix === 'GOED') officerDept = 'Electrical Department';
            else officerDept = 'General Administration';
        }

        if (!officerDept) return [];

        // Aliases
        let deptAliases = [officerDept];
        if (officerDept === "Solid Waste Management (SWM)") deptAliases.push("Department of Sanitation");
        if (officerDept === "Department of Sanitation") deptAliases.push("Solid Waste Management (SWM)");
        if (officerDept === "Electrical Department") deptAliases.push("Electricity Board");

        // Include General for Rescue (only if not admin)
        if (officerDept !== "General Administration") {
            deptAliases.push("General Administration");
            deptAliases.push("General");
        }

        console.log("Querying for:", deptAliases);

        // DUAL QUERY STRATEGY: Fetch both 'assignedDepartment' (New) and 'department' (Old)
        let mergedReports = new Map();

        // Query 1: New Field (assignedDepartment)
        // If index is missing for assignedDepartment, this will log a warning and return empty, 
        // but new reports created after this deployed code will work eventually.
        try {
            const q1 = query(collection(db, "reports"), where("assignedDepartment", "in", deptAliases));
            const snap1 = await getDocs(q1);
            snap1.forEach(d => mergedReports.set(d.id, { id: d.id, ...d.data() }));
        } catch (e) {
            console.warn("Query 1 (assignedDepartment) returned error (possibly missing index or empty):", e.message);
        }

        // Query 2: Old Field (department) - for legacy support
        try {
            const q2 = query(collection(db, "reports"), where("department", "in", deptAliases));
            const snap2 = await getDocs(q2);
            snap2.forEach(d => {
                if (!mergedReports.has(d.id)) mergedReports.set(d.id, { id: d.id, ...d.data() });
            });
        } catch (e) {
            console.warn("Query 2 (department) returned error:", e.message);
        }

        const finalReports = [];
        mergedReports.forEach(data => {
            // Normalize field: prefer assigned, then old department, then General fallback
            const reportDept = data.assignedDepartment || data.department || "General";

            // SMART FILTERING / RESCUE
            let isRelevant = false;

            // Direct Match
            if (reportDept === officerDept) isRelevant = true;
            // Alias Match
            else if (deptAliases.includes(reportDept) && reportDept !== "General Administration" && reportDept !== "General") isRelevant = true;
            // Rescue from General
            else if (reportDept === "General Administration" || reportDept === "General") {
                const inferredDept = determineDepartment(data.issueType);
                if (inferredDept === officerDept) {
                    console.log(`Rescued ${data.id}: General -> ${officerDept}`);
                    data.assignedDepartment = officerDept; // Virtual Fix for display
                    data.department = officerDept; // Legacy fix
                    isRelevant = true;
                } else if (officerDept === "General Administration") {
                    isRelevant = true; // Admin sees all General
                }
            }

            if (isRelevant) {
                if (isReportInJurisdiction(data, officerJurisdiction)) {
                    finalReports.push(data);
                }
            }
        });

        // Sort
        finalReports.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        console.log(`Returning ${finalReports.length} reports.`);
        return finalReports;

    } catch (error) {
        console.error("Error fetching reports:", error);
        return [];
    }
}

// --- UPDATE REPORT STATUS ---
export async function updateReportStatus(reportId, actionData) {
    try {
        console.log("Updating report status:", reportId, actionData);

        const reportRef = doc(db, "reports", reportId);

        const updatePayload = {
            status: actionData.status || "In Progress",
            assignedOfficerName: actionData.officerName,
            assignedOfficerPhone: actionData.officerPhone,
            workStartDate: actionData.startDate,
            resolutionDuration: actionData.resolutionDuration,
            actionTakenAt: serverTimestamp(),
            lastUpdatedAt: serverTimestamp()
        };

        // Add worker assignment fields if present
        if (actionData.assignedWorkerId) {
            updatePayload.assignedWorkerId = actionData.assignedWorkerId;
        }
        if (actionData.assignedWorkerName) {
            updatePayload.assignedWorkerName = actionData.assignedWorkerName;
        }

        await updateDoc(reportRef, updatePayload);

        console.log("Report status updated successfully");
        return { success: true };

    } catch (error) {
        console.error("Error updating report status:", error);
        return { success: false, error: error.message };
    }
}

// --- GET SINGLE REPORT ---
export async function getReportById(reportId) {
    try {
        const reportRef = doc(db, "reports", reportId);
        const reportSnap = await getDoc(reportRef);

        if (reportSnap.exists()) {
            return { id: reportSnap.id, ...reportSnap.data() };
        }
        return null;
    } catch (error) {
        console.error("Error fetching report:", error);
        return null;
    }
}

// --- CREATE UPDATE NOTIFICATION ---
export async function createUpdateNotification(reportId, reportData, actionData, authorityInfo) {
    try {
        console.log("Creating update notification for report:", reportId);

        // Get all users who should receive this notification
        // 1. Report owner
        const recipients = [reportData.userId];

        // 2. Report followers (if followers field exists)
        if (reportData.followers && Array.isArray(reportData.followers)) {
            reportData.followers.forEach(follower => {
                if (!recipients.includes(follower)) {
                    recipients.push(follower);
                }
            });
        }

        // Create notification for each recipient
        for (const recipientId of recipients) {
            await addDoc(collection(db, "notifications"), {
                recipientId: recipientId,
                reportId: reportId,
                type: 'status_update',
                title: `Update on your report: ${reportData.issueType || 'Report'}`,
                message: `Your report has been updated to "${actionData.status || 'In Progress'}". An officer has been assigned.`,
                actionData: {
                    officerName: actionData.officerName,
                    officerPhone: actionData.officerPhone,
                    startDate: actionData.startDate,
                    resolutionDuration: actionData.resolutionDuration,
                    previousStatus: reportData.status || 'Pending',
                    newStatus: actionData.status || 'In Progress'
                },
                department: authorityInfo?.department || 'Authority',
                isRead: false,
                createdAt: serverTimestamp()
            });
        }

        console.log(`Created notifications for ${recipients.length} recipient(s)`);
        return { success: true, recipientCount: recipients.length };

    } catch (error) {
        console.error("Error creating notification:", error);
        return { success: false, error: error.message };
    }
}

// --- FETCH USER NOTIFICATIONS ---
export async function fetchUserNotifications(userId) {
    try {
        const q = query(
            collection(db, "notifications"),
            where("recipientId", "==", userId)
        );

        const snapshot = await getDocs(q);
        const notifications = [];

        snapshot.forEach(docSnap => {
            notifications.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        // Sort by creation date (newest first)
        notifications.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
        });

        return notifications;

    } catch (error) {
        console.error("Error fetching notifications:", error);
        return [];
    }
}

/**
 * Shared Report Card Generator
 * Returns the HTML string for a report card.
 */

export function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
}

export function createReportCardHTML(reportId, data, currentUser, options = {}) {
    // Options
    const {
        isOwnReport = false,
        canDelete = false
    } = options;

    // --- 1. RESOLVE USER INFO ---
    // If 'userName'/'userPhoto' are passed in options, use them (e.g. from userreports.js loop)
    // Otherwise fallback to data or default
    let userName = options.userName || data.userName || "Anonymous";
    let userPhoto = options.userPhoto || data.userPhoto || null;

    // --- 2. PREPARE DATA ---
    const dateObj = data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date();
    const timeString = timeAgo(dateObj); // Use internal helper
    const isResolved = data.status === 'Resolved';
    const statusClass = isResolved ? 'resolved' : 'pending';
    const statusText = data.status || 'In Progress';
    const locationText = data.location?.village || data.location?.full || 'Location not specified';
    const rawDescription = data.description || 'No description provided.';
    const descriptionText = rawDescription.length > 250 ? rawDescription.substring(0, 250) + "..." : rawDescription;
    const imageUrl = data.imageUrl || 'https://placehold.co/600x600?text=No+Image';
    const issueType = data.issueType || 'General Issue';
    const votes = data.votes || 0;
    const followers = data.followers || [];
    const votedBy = data.votedBy || [];

    // --- 3. ACTIONS LOGIC ---
    let isHasVoted = false;
    let isHasFollowed = false;
    let showFollowButton = true;

    if (currentUser) {
        isHasVoted = votedBy.includes(currentUser.uid);
        isHasFollowed = followers.includes(currentUser.uid);
        if (currentUser.uid === data.userId || isOwnReport) {
            showFollowButton = false;
        }
    }

    const voteActiveClass = isHasVoted ? 'vote-active' : '';
    const followActiveClass = isHasFollowed ? 'text-[#6366f1]' : '';
    const followText = isHasFollowed ? 'Following' : 'Follow';
    const cardId = `report-${reportId}`;

    // --- 4. BUILD HTML ---
    const avatarHtml = userPhoto
        ? `<img src="${userPhoto}" alt="${userName}" class="avatar-circle object-cover">`
        : `<div class="avatar-circle">${userName.charAt(0).toUpperCase()}</div>`;

    // Buttons
    // Delete Button (Only if requested)
    const deleteBtnHtml = canDelete ? `
        <button class="action-item delete-btn text-red-500 hover:text-red-700 ml-auto" onclick="handleDelete('${reportId}')" title="Delete Report (Available 48h)">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            <span class="text-xs ml-1 font-medium">Delete</span>
        </button>
    ` : '';

    // Follow Button (Logic: If NOT deleting, and NOT own report)
    // Actually, delete button usually replaces follow button or sits next to it?
    // In userreport.js, old code had follow button hardcoded.
    // Spec: "don't show the follow button to user on user's own report".
    // If showFollowButton is true, show it.

    const followBtnHtml = showFollowButton ? `
        <button class="action-item follow-btn ${followActiveClass}" onclick="handleFollow(this, '${reportId}')" data-followers="${followers.length}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            <span class="follow-text">${followText}</span>
        </button>
    ` : '';

    // Tag Alignment: If Delete btn exists, it has ml-auto. If not, Tag needs margin-left auto if it's the last item.
    // If follow btn is missing, and delete btn is missing, Tag needs auto.
    // If one of them exists, it pushes tag?
    // In CSS: .issue-tag { margin-left: auto } -> This handles it automatically!
    // But `deleteBtnHtml` uses `ml-auto`. If delete btn is present, IT takes the space, and issue tag might get pushed?
    // Flexbox: items flex. `ml-auto` on an item pushes it to the right AND everything after it.
    // So if delete btn has ml-auto, the tag after it will be on the right.
    // If delete btn is NOT there, and follow is there (no ml-auto), then tag needs ml-auto.
    // CSS .issue-tag { margin-left: auto } is already in CSS. So it should be fine.
    // Wait, if delete btn has ml-auto, and tag also has ml-auto?
    // If delete is present, it pushes itself right. Tag follows it.
    // Tag works best if it's just `margin-left: auto`.
    // Let's rely on CSS `margin-left: auto` for the issue tag, and remove `ml-auto` from delete btn to avoiding conflicts, OR keep it.
    // In `userreport.js` I added `ml-auto` to delete button.
    // I will remove `ml-auto` from delete btn string here and let `.issue-tag` handle the "far right" positioning if that was the intent, or let delete button sit next to others.
    // User request: "Delete button...". Usually replaces "Follow".
    // I'll keep `ml-auto` on delete button for now as it seemed to work for the user in `styles`.

    return `
        <div class="report-card" id="${cardId}">
            <!-- FRONT SIDE -->
            <div class="report-front">
                <div class="card-header">
                    <div class="user-profile">
                        ${avatarHtml}
                        <div class="user-text">
                            <span class="username">${userName}</span>
                            <span class="time-ago">${timeString} • ${locationText.split(',')[0]}</span>
                        </div>
                    </div>
                    <span class="status-pill ${statusClass}">${statusText}</span>
                </div>

                <div class="card-image" onclick="initViewer(this.querySelector('img'))">
                    <img src="${imageUrl}" alt="Report Evidence" loading="lazy" decoding="async" style="cursor: zoom-in;">
                </div>

                <div class="card-actions">
                    ${followBtnHtml}
                    ${deleteBtnHtml}

                    <span class="issue-tag" style="margin-left: auto;">#${issueType}</span>
                </div>

                <div class="swipe-instruction">
                    <span>Swipe to view details</span>
                    <span class="chevrons">>></span>
                </div>

                <button class="desktop-reveal-btn" onclick="this.closest('.report-card').classList.toggle('revealed')">
                    View Details
                </button>
            </div>

            <!-- BACK SIDE -->
            <div class="report-back">
                <div class="detail-group">
                    <div class="back-label">Description</div>
                    <p class="back-content text-sm mb-4">${descriptionText}</p>
                </div>

                <div class="detail-group">
                    <div class="back-label">Location</div>
                    <p class="back-content text-base font-medium mb-4">${locationText}</p>
                </div>

                <div class="detail-group">
                    <div class="back-label">Assigned Officer</div>
                    <p class="back-content text-base font-bold text-indigo-500">Officer Pending Assignment</p>
                </div>
                
                <div class="mt-auto flex justify-center gap-4">
                    <button class="text-sm font-bold text-indigo-500 hover:text-indigo-400 p-2" onclick="this.closest('.report-card').classList.toggle('revealed')">
                        &larr; Back to Image
                    </button>
                </div>
            </div>
        </div>
    `;
}

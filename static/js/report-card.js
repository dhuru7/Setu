/**
 * Shared Report Card Generator — Redesigned
 * Matches the new card UI with overlaid status, title row, description, and footer.
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

function formatDate(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const y = date.getFullYear();
    return `${m}/${d}/${y}`;
}

// Department mapping for the "Assigned To" footer
const DEPARTMENT_MAP = {
    'Pothole': 'Public Works Department',
    'Garbage Dumps': 'Solid Waste Management',
    'Broken Streetlight': 'Electrical Department',
    'Water Leakage': 'Water Supply Department',
    'Sewage Issue': 'Sewage & Drainage Department',
    'Illegal Parking': 'Traffic Management',
    'Road Damage': 'Public Works Department',
    'Noise Complaint': 'Pollution Control Board',
    'Air Pollution': 'Pollution Control Board',
    'Tree Fallen': 'Horticulture Department',
    'Stray Animals': 'Animal Husbandry Department',
    'Encroachment': 'Revenue Department',
    'General Issue': 'Municipal Corporation',
};

function getDepartment(issueType) {
    if (!issueType) return 'Municipal Corporation';
    if (DEPARTMENT_MAP[issueType]) return DEPARTMENT_MAP[issueType];
    const lower = issueType.toLowerCase();
    for (const [key, val] of Object.entries(DEPARTMENT_MAP)) {
        if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
            return val;
        }
    }
    return 'Municipal Corporation';
}

function buildRatingSection(reportId, data, currentUser) {
    const ratings = data.ratings || {};
    const ratingValues = Object.values(ratings);
    const avgRating = ratingValues.length > 0
        ? (ratingValues.reduce((sum, r) => sum + (r.score || r), 0) / ratingValues.length).toFixed(1)
        : null;
    const userRating = currentUser ? (ratings[currentUser.uid]?.score || ratings[currentUser.uid] || 0) : 0;
    const hasRated = userRating > 0;

    // If user is the report owner or has already rated, show existing rating
    const isOwner = currentUser && data.userId === currentUser.uid;

    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= userRating;
        const clickable = !hasRated && currentUser && !isOwner;
        starsHtml += `
            <span class="rating-star ${filled ? 'filled' : ''} ${clickable ? 'clickable' : ''}"
                  data-star="${i}"
                  data-report-id="${reportId}"
                  ${clickable ? `onclick="handleRating('${reportId}', ${i}, this)"` : ''}
                  style="cursor: ${clickable ? 'pointer' : 'default'}; font-size: 1.3rem; transition: transform 0.15s, color 0.15s;">
                ${filled ? '★' : '☆'}
            </span>`;
    }

    const avgHtml = avgRating
        ? `<span class="rating-avg" style="font-size: 0.75rem; color: #6b7280; margin-left: 8px;">
             ${avgRating} avg · ${ratingValues.length} rating${ratingValues.length === 1 ? '' : 's'}
           </span>`
        : '';

    const messageHtml = hasRated
        ? `<span style="font-size: 0.7rem; color: #10b981; font-weight: 600;">✓ You rated this</span>`
        : (isOwner ? '' : `<span style="font-size: 0.7rem; color: #6b7280;">Rate this resolution</span>`);

    return `
        <div class="rating-section" id="rating-${reportId}" style="margin-top: 10px; padding: 10px 12px; background: rgba(16, 185, 129, 0.04); border: 1px solid rgba(16, 185, 129, 0.12); border-radius: 12px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 2px;">${starsHtml}</div>
            ${avgHtml}
            ${messageHtml}
        </div>
    `;
}

export function createReportCardHTML(reportId, data, currentUser, options = {}) {
    const {
        isOwnReport = false,
        canDelete = false
    } = options;

    // --- 1. RESOLVE USER INFO ---
    let userName = options.userName || data.userName || "Anonymous";
    let userPhoto = options.userPhoto || data.userPhoto || null;

    // --- 2. PREPARE DATA ---
    const dateObj = data.createdAt ? new Date(data.createdAt.seconds ? data.createdAt.seconds * 1000 : data.createdAt) : new Date();
    const timeString = timeAgo(dateObj);
    const formattedDate = formatDate(dateObj);
    const locationText = data.location?.village || data.location?.full || data.location?.address || data.location?.city || 'Unknown';
    const locationShort = locationText.length > 20 ? locationText.substring(0, 20) + '...' : locationText;

    // Status
    let statusRaw = data.status || 'Pending';
    statusRaw = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
    let statusClass = 'pending';
    if (statusRaw === 'Resolved' || statusRaw === 'Fixed' || statusRaw === 'Completed') statusClass = 'resolved';
    else if (statusRaw === 'Pending Verification' || statusRaw === 'Pending verification') statusClass = 'pending-verification';
    else if (statusRaw === 'In Progress' || statusRaw === 'In progress') statusClass = 'in-progress';

    const rawDescription = data.description || 'No description provided.';
    const descMaxLen = 120;
    const isLong = rawDescription.length > descMaxLen;
    const descriptionSnippet = isLong ? rawDescription.substring(0, descMaxLen) + '...' : rawDescription;
    const imageUrl = data.imageUrl || 'https://placehold.co/600x400?text=No+Image';
    const issueType = data.issueType || 'General Issue';
    const followers = data.followers || [];
    const department = data.assignedDepartment || getDepartment(issueType);

    // --- 3. ACTIONS LOGIC ---
    let isHasFollowed = false;
    let showFollowButton = true;

    if (currentUser) {
        isHasFollowed = followers.includes(currentUser.uid);
        if (currentUser.uid === data.userId || isOwnReport) {
            showFollowButton = false;
        }
    }

    // Use both old class (for JS handlers) and new class (for CSS fill)
    const followActiveClass = isHasFollowed ? 'text-[#2563eb] active-follow' : '';
    const followText = isHasFollowed ? 'Following' : 'Follow';
    const cardId = `report-${reportId}`;

    // --- 4. BUILD HTML ---
    const avatarHtml = userPhoto
        ? `<img src="${userPhoto}" alt="${userName}" class="avatar-circle object-cover">`
        : `<div class="avatar-circle">${userName.charAt(0).toUpperCase()}</div>`;

    // Follow button — fixed size, filled icon when active
    const followBtnHtml = showFollowButton ? `
        <button class="follow-btn ${followActiveClass}" onclick="handleFollow(this, '${reportId}')" data-followers="${followers.length}" aria-label="Follow">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            <span class="follow-text">${followText}</span>
        </button>
    ` : '';

    // Delete (for user's own reports in userreport page)
    const deleteBtnHtml = canDelete ? `
        <button class="action-item delete-btn" onclick="handleDelete('${reportId}')" title="Delete Report" style="margin-left:auto; color:#ef4444; font-size:0.8rem; font-weight:600;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:18px;height:18px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
        </button>
    ` : '';

    // "more" link for description
    const moreHtml = isLong ? `<span class="more-link" onclick="this.closest('.report-card').classList.toggle('revealed')">more</span>` : '';

    // Store data attributes for filtering (include lat/lng for nearby filter)
    const reportLat = data.location?.lat || data.location?.latitude || '';
    const reportLng = data.location?.long || data.location?.longitude || data.location?.lng || '';
    const reportUserId = data.userId || '';
    const dataAttrs = `data-issue-type="${issueType}" data-status="${statusRaw}" data-lat="${reportLat}" data-lng="${reportLng}" data-user-id="${reportUserId}"`;

    return `
        <div class="report-card" id="${cardId}" ${dataAttrs}>
            <!-- FRONT SIDE -->
            <div class="report-front">
                <!-- Header: Avatar + Name + Menu -->
                <div class="card-header">
                    <div class="user-profile">
                        ${avatarHtml}
                        <div class="user-text">
                            <span class="username">${userName}</span>
                            <span class="time-ago">${formattedDate} • ${locationShort}</span>
                        </div>
                    </div>
                    <div class="card-menu-wrapper">
                        <button class="card-menu-btn" onclick="event.stopPropagation(); toggleCardMenu(this)" aria-label="More options">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                            </svg>
                        </button>
                        <div class="card-menu-dropdown" id="menu-${reportId}"></div>
                    </div>
                </div>

                <!-- Image with overlaid status badge + fit/fill toggle -->
                <div class="card-image-wrapper">
                    <div class="status-overlay">
                        <span class="status-pill ${statusClass}">
                            <span class="status-dot"></span>
                            ${statusRaw}
                        </span>
                    </div>
                    <div class="card-image" onclick="if(event.target.closest('.img-fit-toggle')) return; initViewer(this.querySelector('img'))">
                        <img src="${imageUrl}" alt="Report Evidence" loading="lazy" decoding="async" style="cursor: zoom-in;">
                        <button class="img-fit-toggle" onclick="event.stopPropagation(); toggleImgFit(this)" aria-label="Toggle image fit" title="Fit / Fill image">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Title Row: Issue Type + Follow -->
                <div class="card-title-row">
                    <span class="card-issue-title">${issueType}</span>
                    ${followBtnHtml}
                    ${deleteBtnHtml}
                </div>

                <!-- Description -->
                <div class="card-description">
                    ${descriptionSnippet}${moreHtml}
                </div>

                <!-- Footer: Assigned To — with building/office icon -->
                <div class="card-footer">
                    <div class="card-footer-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                        </svg>
                    </div>
                    <div class="card-footer-text">
                        <span class="card-footer-label">Assigned to</span>
                        <span class="card-footer-value">${department}</span>
                    </div>
                </div>

                ${statusClass === 'resolved' ? buildRatingSection(reportId, data, currentUser) : ''}

                <!-- Swipe Hint (mobile) -->
                <div class="swipe-instruction">
                    <span>Swipe to view details</span>
                    <span class="chevrons">&gt;&gt;</span>
                </div>

                <button class="desktop-reveal-btn" onclick="this.closest('.report-card').classList.toggle('revealed')">
                    View Details
                </button>
            </div>

            <!-- BACK SIDE -->
            <div class="report-back">
                <div class="detail-group">
                    <div class="back-label">Description</div>
                    <p class="back-content" style="font-size: 0.9rem; margin-bottom: 1rem;">${rawDescription}</p>
                </div>

                <div class="detail-group">
                    <div class="back-label">Location</div>
                    <p class="back-content" style="font-size: 0.95rem; font-weight: 500; margin-bottom: 1rem;">${locationText}</p>
                </div>

                <div class="detail-group">
                    <div class="back-label">Assigned Department</div>
                    <p class="back-content" style="font-size: 0.95rem; font-weight: 700; color: #2563eb;">${department}</p>
                </div>

                <div style="margin-top: auto; display: flex; justify-content: center; gap: 1rem;">
                    <button style="font-size: 0.85rem; font-weight: 700; color: #2563eb; background: none; border: none; cursor: pointer; padding: 0.5rem;" onclick="this.closest('.report-card').classList.toggle('revealed')">
                        &larr; Back to Image
                    </button>
                </div>
            </div>
        </div>
    `;
}

// My Complaints Page JavaScript
let refreshInterval;

// Load complaints for the logged-in citizen
async function loadMyComplaints() {
    const citizenName = document.getElementById('citizenName').value.trim();
    if (!citizenName) {
        alert('Please enter your name to view your complaints.');
        return;
    }

    const statusFilter = document.getElementById('statusFilter').value;
    const sortFilter = document.getElementById('sortFilter').value;
    
    // Show loading indicator
    document.getElementById('loadingIndicator').style.display = 'block';
    
    // Build API URL with parameters
    let url = `/api/my-complaints?name=${encodeURIComponent(citizenName)}`;
    if (statusFilter) {
        url += `&status=${encodeURIComponent(statusFilter)}`;
    }
    url += `&sort=${sortFilter}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        displayMyComplaints(data);
    } catch (error) {
        console.error('Error loading complaints:', error);
        const tbody = document.querySelector('#myComplaintsTable tbody');
        tbody.innerHTML = '<tr><td colspan="7">Error loading complaints. Please check your connection.</td></tr>';
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

// Display complaints in the table
function displayMyComplaints(complaints) {
    const tbody = document.querySelector('#myComplaintsTable tbody');
    tbody.innerHTML = "";

    if (complaints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No complaints found for your name.</td></tr>';
        return;
    }

    complaints.forEach(complaint => {
        // Determine status class for styling
        let statusClass = "status pending";
        if (complaint.status === "Resolved") {
            statusClass = "status resolved";
        } else if (complaint.status === "In Progress") {
            statusClass = "status inprogress";
        }

        // Create action buttons
        let actionButtons = '';
        if (complaint.status === "Resolved" && !complaint.rating) {
            actionButtons = `<button class="btn-small" onclick="openFeedbackModal(${complaint.id})">Rate & Feedback</button>`;
        } else if (complaint.rating) {
            actionButtons = `<span class="rating-display">⭐ ${complaint.rating}/5</span>`;
        } else {
            actionButtons = '<span class="status-text">Awaiting resolution</span>';
        }

        // Tracking Status column with colored badge
        const trackingStatus = `<span class="${statusClass}" id="track-status-${complaint.id}">${complaint.status}</span>`;

        const row = `
            <tr>
                <td>${complaint.id}</td>
                <td>${complaint.description}</td>
                <td>${complaint.category || 'Other'}</td>
                <td>
                    ${complaint.photo ? 
                        `<a href="${complaint.photo}" target="_blank">
                            <img src="${complaint.photo}" width="60" alt="Complaint Photo">
                        </a>` : 
                        'No photo'
                    }
                </td>
                <td>${trackingStatus}</td>
                <td>${complaint.created_at}</td>
                <td>${actionButtons}</td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

// Open feedback modal
function openFeedbackModal(complaintId) {
    document.getElementById('complaintId').value = complaintId;
    document.getElementById('feedbackModal').style.display = 'flex';
}

// Close feedback modal
function closeFeedbackModal() {
    document.getElementById('feedbackModal').style.display = 'none';
    document.getElementById('feedbackForm').reset();
}

// Submit feedback
document.getElementById('feedbackForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const complaintId = document.getElementById('complaintId').value;
    const rating = document.getElementById('rating').value;
    const feedback = document.getElementById('feedback').value;
    
    try {
        const response = await fetch(`/api/complaints/${complaintId}/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                rating: parseInt(rating),
                feedback: feedback
            })
        });
        
        if (response.ok) {
            alert('Thank you for your feedback!');
            closeFeedbackModal();
            loadMyComplaints(); // Refresh the table
        } else {
            const error = await response.json();
            alert('Error submitting feedback: ' + error.error);
        }
    } catch (error) {
        console.error('Error submitting feedback:', error);
        alert('Error submitting feedback. Please try again.');
    }
});

// Poll status every 15 seconds and update badges, send notifications
let lastStatuses = {};
function pollComplaintStatuses() {
    const citizenName = document.getElementById('citizenName').value.trim();
    if (!citizenName) return;
    let url = `/api/my-complaints?name=${encodeURIComponent(citizenName)}`;
    fetch(url)
        .then(res => res.json())
        .then(complaints => {
            complaints.forEach(complaint => {
                let badge = document.getElementById(`track-status-${complaint.id}`);
                if (badge) {
                    badge.textContent = complaint.status;
                    badge.className = 'status ' + (complaint.status === 'Resolved' ? 'resolved' : (complaint.status === 'In Progress' ? 'inprogress' : 'pending'));
                    // Notification API
                    if (lastStatuses[complaint.id] && lastStatuses[complaint.id] !== complaint.status) {
                        sendStatusNotification(complaint.id, complaint.status);
                    }
                    lastStatuses[complaint.id] = complaint.status;
                }
            });
        });
}

function sendStatusNotification(id, status) {
    if (window.Notification && Notification.permission === "granted") {
        new Notification(`Complaint #${id} status updated: ${status}`);
    } else if (window.Notification && Notification.permission !== "denied") {
        Notification.requestPermission().then(function (permission) {
            if (permission === "granted") {
                new Notification(`Complaint #${id} status updated: ${status}`);
            }
        });
    }
}

function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        loadMyComplaints();
        pollComplaintStatuses();
    }, 15000); // 15 seconds
}

// Stop auto-refresh
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Start auto-refresh when page loads
    startAutoRefresh();
    
    // Stop auto-refresh when page is hidden (user switches tabs)
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            stopAutoRefresh();
        } else {
            startAutoRefresh();
        }
    });
});

// Clean up on page unload
window.addEventListener('beforeunload', stopAutoRefresh);

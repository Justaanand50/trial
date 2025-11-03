let refreshInterval;
let lastStatuses = {};

async function loadComplaints() {
    const loading = document.getElementById('loadingIndicator');
    if (loading) loading.style.display = 'block';

    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const categoryFilter = document.getElementById('categoryFilter')?.value || '';
    const dateFilter = document.getElementById('dateFilter')?.value || '';
    const priorityFilter = document.getElementById('priorityFilter')?.value || '';

    let url = '/api/complaints';
    const params = [];
    if (statusFilter) params.push(`status=${encodeURIComponent(statusFilter)}`);
    if (categoryFilter) params.push(`category=${encodeURIComponent(categoryFilter)}`);
    if (dateFilter) params.push(`date=${encodeURIComponent(dateFilter)}`);
    if (priorityFilter) params.push(`priority=${encodeURIComponent(priorityFilter)}`);
    if (params.length) url += '?' + params.join('&');

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! ${res.status}`);
        const data = await res.json();

        const tbody = document.querySelector('#complaintsTable tbody');
        tbody.innerHTML = '';

        if (!Array.isArray(data) || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11">No complaints found.</td></tr>';
            return;
        }

        data.forEach(c => {
            const id = c.id ?? 'N/A';
            const name = c.name || 'N/A';
            const desc = c.description || '';
            const category = c.category || 'Other';
            const photo = c.photo ? `<a href="${c.photo}" target="_blank"><img src="${c.photo}" width="60"></a>` : 'No photo';
            const voice = c.voice ? `<audio controls style="width:100px;height:30px;"><source src="${c.voice}" type="audio/webm"></audio>` : 'No voice note';
            const lat = c.latitude ?? 'N/A';
            const lon = c.longitude ?? 'N/A';
            const address = c.address || 'Not available';
            const status = c.status || 'Pending';
            const autoPriority = c.auto_priority || 'Medium';
            const createdAt = c.created_at || '';

            let statusClass = status === 'Resolved' ? 'status resolved' : status === 'In Progress' ? 'status inprogress' : 'status pending';
            let priorityClass = autoPriority === 'Low' ? 'priority low' : autoPriority === 'High' ? 'priority high' : 'priority medium';

            const statusDropdown = `
                <select onchange="updateStatus(${id}, this.value)" class="status-update">
                    <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="In Progress" ${status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option value="Resolved" ${status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                </select>`;

            const priorityDropdown = `
                <select onchange="updatePriority(${id}, this.value)" class="priority-update">
                    <option value="Low" ${c.priority === 'Low' ? 'selected' : ''}>Low</option>
                    <option value="Medium" ${c.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                    <option value="High" ${c.priority === 'High' ? 'selected' : ''}>High</option>
                </select>`;

            const locationText = (c.latitude && c.longitude) ? `Lat: ${lat}, Lng: ${lon}<br>📍 ${address}` : 'Location not available';

            const row = `<tr data-id="${id}">
                <td>${id}</td>
                <td>${name}</td>
                <td>${desc}</td>
                <td>${category}</td>
                <td>${photo}</td>
                <td>${voice}</td>
                <td>${locationText}</td>
                <td><span class="status">${status}</span></td>
                <td><span class="${priorityClass}">${autoPriority}</span> ${priorityDropdown}</td>
                <td>${createdAt}</td>
                <td>${statusDropdown}</td>
            </tr>`;
            tbody.insertAdjacentHTML('beforeend', row);

            // store last status for notifications
            if (!(id in lastStatuses)) lastStatuses[id] = status;
        });
    } catch (err) {
        console.error('Error loading complaints:', err);
        const tbody = document.querySelector('#complaintsTable tbody');
        tbody.innerHTML = '<tr><td colspan="11">Error loading complaints. Check server connection.</td></tr>';
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function pollComplaintStatuses() {
    fetch('/api/complaints')
        .then(res => res.json())
        .then(complaints => {
            complaints.forEach(c => {
                const row = document.querySelector(`#complaintsTable tbody tr[data-id="${c.id}"]`);
                if (!row) return;

                const badge = row.querySelector('span.status');
                if (badge && lastStatuses[c.id] !== c.status) {
                    badge.textContent = c.status;
                    badge.className = 'status ' + (c.status === 'Resolved' ? 'resolved' : c.status === 'In Progress' ? 'inprogress' : 'pending');
                    sendStatusNotification(c.id, c.status);
                    lastStatuses[c.id] = c.status;
                }
            });
        })
        .catch(console.error);
}

function sendStatusNotification(id, status) {
    if (window.Notification && Notification.permission === 'granted') {
        new Notification(`Complaint #${id} status updated: ${status}`);
    } else if (window.Notification && Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => {
            if (p === 'granted') new Notification(`Complaint #${id} status updated: ${status}`);
        });
    }
}

function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        loadComplaints();
        pollComplaintStatuses();
    }, 15000);
}

function stopAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
}

document.addEventListener('DOMContentLoaded', () => {
    loadComplaints();
    startAutoRefresh();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopAutoRefresh();
        else startAutoRefresh();
    });
});

window.addEventListener('beforeunload', stopAutoRefresh);

/* ==================== Student Marks Sorting & Ranking System ====================
   JavaScript - Frontend Logic
   All sorting for ranking happens in the backend's manual merge_sort().
   This file never sorts student records itself.
   ============================================================================== */

// When the page is served by Flask (run.bat) the API is on the same origin.
// When opened from file:// or another dev server, talk to Flask on port 5000.
const API_BASE_URL = (location.protocol.startsWith('http') && location.port === '5000')
    ? ''
    : 'http://127.0.0.1:5000';

const SERIES = {
    merge:     { name: 'Merge Sort',     color: '#2a78d6' },
    insertion: { name: 'Insertion Sort', color: '#eb6834' },
    selection: { name: 'Selection Sort', color: '#1baf7a' },
    bubble:    { name: 'Bubble Sort',    color: '#eda100' }
};

let students = [];
let rankingData = null;          // last /api/ranking response
let rankedStudents = [];
let vizData = null;
let vizSteps = [];
let vizCurrentStep = 0;
let vizPlayInterval = null;
let vizTree = [];
let perfResults = [];            // merge sort scalability rows, kept in size order
let compareData = null;
let compareMetric = 'execution_time_ms';
let dbConnected = null;

// ==================== NAVIGATION ====================

const SECTIONS = ['dashboard', 'students', 'ranking', 'visualization', 'performance', 'algorithm'];

function showSection(sectionId) {
    if (!SECTIONS.includes(sectionId)) sectionId = 'dashboard';
    document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === sectionId));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === sectionId));
    closeNav();
    if (location.hash !== '#' + sectionId) history.replaceState(null, '', '#' + sectionId);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (sectionId !== 'visualization') vizPause();
    if (sectionId === 'dashboard') updateDashboard();
    if (sectionId === 'students') loadAndRenderStudents();
    if (sectionId === 'ranking') generateRanking();   // always a fresh Merge Sort of current data
}

function goToRanking() {
    showSection('ranking');
}

function toggleNav() {
    const links = document.getElementById('nav-links');
    const open = links.classList.toggle('open');
    document.getElementById('nav-toggle').setAttribute('aria-expanded', open);
}

function closeNav() {
    document.getElementById('nav-links').classList.remove('open');
    document.getElementById('nav-toggle').setAttribute('aria-expanded', 'false');
}

function focusForm() {
    setTimeout(() => document.getElementById('student-roll').focus(), 50);
}

// ==================== UTILITY FUNCTIONS ====================

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

function fmt(n) {
    if (n === null || n === undefined || n === '') return '–';
    const num = Number(n);
    return Number.isInteger(num) ? String(num) : String(Math.round(num * 100) / 100);
}

function fmtNum(n, digits = 0) {
    return Number(n).toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtMs(ms) {
    if (ms < 1) return ms.toFixed(3);
    if (ms < 100) return ms.toFixed(2);
    return fmtNum(ms, 0);
}

class ApiError extends Error {
    constructor(message, status, field) {
        super(message);
        this.status = status;
        this.field = field;
    }
}

async function apiCall(endpoint, method = 'GET', body = null, timeoutMs = 30000) {
    const url = `${API_BASE_URL}${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const options = { method, headers: { 'Content-Type': 'application/json' }, signal: controller.signal };
    if (body !== null) options.body = JSON.stringify(body);

    let response;
    try {
        response = await fetch(url, options);
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') throw new ApiError('The server took too long to respond. Try again.', 0);
        setDbStatus(false, 'Cannot reach the backend server. Is run.bat (python backend/app.py) still running?', true);
        throw new ApiError('Cannot reach the backend server. Make sure run.bat is running.', 0);
    }
    clearTimeout(timer);

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message = (data && data.error) || `Request failed (HTTP ${response.status})`;
        if (response.status === 503) setDbStatus(false, message);
        throw new ApiError(message, response.status, data && data.field);
    }
    if (dbConnected === false && endpoint !== '/api/health') checkHealth();
    return data;
}

async function withLoading(button, task, busyText) {
    if (!button) return task();
    if (button.disabled) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.classList.add('loading');
    if (busyText) button.innerHTML = `<span class="spinner"></span>${esc(busyText)}`;
    const busyHtml = button.innerHTML;
    try {
        return await task();
    } finally {
        button.disabled = false;
        button.classList.remove('loading');
        // Restore the label unless the task itself changed it (e.g. "Update" -> "Add Student")
        if (button.innerHTML === busyHtml) button.innerHTML = original;
    }
}

// ==================== TOAST ====================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const icons = { success: '✓', error: '⚠', info: 'ℹ' };
    toast.className = `toast ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `<span class="toast-icon">${icons[type] || ''}</span><span>${esc(message)}</span>`;
    toast.onclick = () => toast.remove();
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, type === 'error' ? 6000 : 3500);
}

// ==================== CONFIRM DIALOG ====================

function confirmDialog(title, text, okLabel = 'Delete') {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-text').textContent = text;
        const ok = document.getElementById('confirm-ok');
        const cancel = document.getElementById('confirm-cancel');
        ok.textContent = okLabel;
        modal.hidden = false;
        ok.focus();

        function close(result) {
            modal.hidden = true;
            ok.onclick = cancel.onclick = modal.onclick = null;
            document.removeEventListener('keydown', onKey);
            resolve(result);
        }
        function onKey(e) { if (e.key === 'Escape') close(false); }
        ok.onclick = () => close(true);
        cancel.onclick = () => close(false);
        modal.onclick = e => { if (e.target === modal) close(false); };
        document.addEventListener('keydown', onKey);
    });
}

// ==================== DATABASE STATUS ====================

function setDbStatus(connected, message, serverDown = false) {
    dbConnected = connected;
    const badge = document.getElementById('db-status');
    badge.classList.remove('checking', 'ok', 'bad');
    badge.classList.add(connected ? 'ok' : 'bad');
    document.getElementById('db-status-text').textContent =
        connected ? 'PostgreSQL connected' : (serverDown ? 'Server offline' : 'Database offline');
    badge.title = connected ? 'Click to re-check the database connection' : (message || '');

    const banner = document.getElementById('conn-banner');
    banner.hidden = connected;
    if (!connected) {
        document.getElementById('conn-banner-title').textContent =
            serverDown ? 'Backend server not reachable.' : 'Database not connected.';
        document.getElementById('conn-banner-text').textContent = message || '';
    }
}

async function checkHealth(manual = false) {
    const badge = document.getElementById('db-status');
    if (manual) {
        badge.classList.remove('ok', 'bad');
        badge.classList.add('checking');
        document.getElementById('db-status-text').textContent = 'Checking…';
    }
    const wasConnected = dbConnected;
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        const data = await response.json();
        setDbStatus(data.database === 'connected', data.message);
    } catch (err) {
        setDbStatus(false, 'Cannot reach the backend server. Start it with run.bat (or python backend/app.py).', true);
    }
    if (dbConnected && wasConnected === false) {
        showToast('Connected to PostgreSQL again', 'success');
        refreshCurrentSection();
    } else if (manual && !dbConnected) {
        showToast('Still not connected. See the message at the top.', 'error');
    } else if (manual && dbConnected) {
        showToast('PostgreSQL is connected', 'success');
    }
}

function refreshCurrentSection() {
    const active = document.querySelector('.section.active');
    if (!active) return;
    if (active.id === 'dashboard') updateDashboard();
    if (active.id === 'students') loadAndRenderStudents();
    if (active.id === 'ranking') generateRanking();
}

// ==================== DASHBOARD ====================

async function updateDashboard() {
    try {
        // /api/ranking = PostgreSQL records → manual Merge Sort → competition ranks
        const data = await apiCall('/api/ranking');
        rankingData = data;
        rankedStudents = data.students;
        const stats = data.statistics;
        const list = data.students;

        document.getElementById('dash-total').textContent = stats.total;
        document.getElementById('dash-highest').textContent = list.length ? fmt(stats.highest) : '–';
        document.getElementById('dash-average').textContent = list.length ? fmt(stats.average) : '–';
        document.getElementById('dash-lowest').textContent = list.length ? fmt(stats.lowest) : '–';
        document.getElementById('dash-highest-name').textContent = list.length ? `· ${namesWithMarks(list, stats.highest)}` : '';
        document.getElementById('dash-lowest-name').textContent = list.length ? `· ${namesWithMarks(list, stats.lowest)}` : '';

        renderTopFive(list);
        renderDistribution(list);
    } catch (err) {
        ['dash-total', 'dash-highest', 'dash-average', 'dash-lowest'].forEach(id => document.getElementById(id).textContent = '–');
        document.getElementById('dash-top').innerHTML = `<p class="error-text">${esc(err.message)}</p>`;
        document.getElementById('dash-dist').innerHTML = '';
    }
}

function namesWithMarks(list, marks) {
    const names = list.filter(s => s.marks === marks).map(s => s.name.split(' ')[0]);
    return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}

function renderTopFive(list) {
    const el = document.getElementById('dash-top');
    if (!list.length) {
        el.innerHTML = `<div class="empty-state"><p>No students yet.</p>
            <button class="btn btn-sm btn-info" onclick="loadSample().then(updateDashboard)">Load Sample Data</button></div>`;
        return;
    }
    el.innerHTML = list.slice(0, 5).map(s => `
        <div class="top-row">
            ${rankBadge(s.rank)}
            <span class="top-name">${esc(s.name)} <span class="muted small">#${esc(s.roll)}</span></span>
            <span class="top-marks">${fmt(s.marks)}</span>
        </div>`).join('');
}

function renderDistribution(list) {
    const el = document.getElementById('dash-dist');
    const bands = [
        { label: '90–100', min: 90, max: 100 },
        { label: '75–89', min: 75, max: 89.99 },
        { label: '60–74', min: 60, max: 74.99 },
        { label: '40–59', min: 40, max: 59.99 },
        { label: '0–39', min: 0, max: 39.99 }
    ];
    if (!list.length) { el.innerHTML = '<p class="placeholder-text">No data yet.</p>'; return; }
    // Simple counting in one pass: no sorting needed
    const counts = bands.map(() => 0);
    list.forEach(s => {
        const idx = bands.findIndex(b => s.marks >= b.min && s.marks <= b.max);
        if (idx >= 0) counts[idx]++;
    });
    const max = Math.max(...counts, 1);
    el.innerHTML = bands.map((b, i) => `
        <div class="dist-row" data-tip="${counts[i]} student${counts[i] === 1 ? '' : 's'} scored ${b.label}">
            <span class="dist-label">${b.label}</span>
            <span class="dist-track"><span class="dist-bar" style="width:${(counts[i] / max) * 100}%"></span></span>
            <span class="dist-count">${counts[i]}</span>
        </div>`).join('');
    const passed = list.filter(s => s.marks >= 40).length;
    document.getElementById('dash-dist-note').textContent = `${passed} of ${list.length} scored 40 or more`;
}

// ==================== STUDENT MANAGEMENT ====================

function clearFieldErrors() {
    ['roll', 'name', 'marks'].forEach(f => {
        document.getElementById('err-' + f).textContent = '';
        document.getElementById('student-' + f).classList.remove('invalid');
    });
}

function setFieldError(field, message) {
    const input = document.getElementById('student-' + field);
    document.getElementById('err-' + field).textContent = message;
    input.classList.add('invalid');
    input.focus();
}

function validateForm(roll, name, marks) {
    // Mirrors the backend rules so users get instant feedback
    if (!Number.isInteger(roll) || roll < 1) return ['roll', 'Enter a positive whole roll number'];
    if (!name) return ['name', 'Name cannot be empty'];
    if (name.length > 100) return ['name', 'Name must be at most 100 characters'];
    if (!/^\p{L}+(?:(?:[.'\-] ?| )\p{L}+)*\.?$/u.test(name)) return ['name', 'Use letters, spaces, dots, apostrophes or hyphens only'];
    if (Number.isNaN(marks)) return ['marks', 'Enter marks between 0 and 100'];
    if (marks < 0 || marks > 100) return ['marks', 'Marks must be between 0 and 100'];
    return null;
}

async function saveStudent(e) {
    e.preventDefault();
    clearFieldErrors();

    const rollRaw = document.getElementById('student-roll').value.trim();
    const marksRaw = document.getElementById('student-marks').value.trim();
    const roll = rollRaw === '' ? NaN : Number(rollRaw);
    const name = document.getElementById('student-name').value.trim().replace(/\s+/g, ' ');
    const marks = marksRaw === '' ? NaN : parseFloat(marksRaw);

    const problem = validateForm(roll, name, marks);
    if (problem) { setFieldError(problem[0], problem[1]); return; }

    const editId = document.getElementById('edit-index').value;
    const button = document.getElementById('submit-btn');
    await withLoading(button, async () => {
        try {
            let result;
            if (editId !== '-1') {
                result = await apiCall(`/api/students/${editId}`, 'PUT', { roll, name, marks });
            } else {
                result = await apiCall('/api/students', 'POST', { roll, name, marks });
            }
            showToast(result.message, 'success');
            clearForm();
            await loadAndRenderStudents(result.student && result.student.id);
            invalidateRanking();
        } catch (err) {
            if (err.field) setFieldError(err.field, err.message);
            showToast(err.message, 'error');
        }
    }, editId !== '-1' ? 'Updating…' : 'Adding…');
}

async function loadAndRenderStudents(highlightId = null) {
    const tbody = document.getElementById('student-tbody');
    if (!students.length) tbody.innerHTML = '<tr><td colspan="4" class="empty-message"><span class="spinner dark"></span> Loading students…</td></tr>';
    try {
        const data = await apiCall('/api/students');
        students = data.students;
        renderStudentTable(highlightId);
    } catch (err) {
        students = [];
        tbody.innerHTML = `<tr><td colspan="4" class="empty-message error-text">${esc(err.message)}</td></tr>`;
        document.getElementById('student-count').textContent = '0';
    }
}

function renderStudentTable(highlightId = null) {
    const tbody = document.getElementById('student-tbody');
    const query = document.getElementById('student-search').value.trim().toLowerCase();
    const editId = document.getElementById('edit-index').value;
    document.getElementById('student-count').textContent = students.length;
    document.getElementById('clear-all-btn').disabled = students.length === 0;

    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-message">No students found. Load sample data or add a student.</td></tr>';
        return;
    }
    const visible = query
        ? students.filter(s => s.name.toLowerCase().includes(query) || String(s.roll).includes(query))
        : students;
    if (!visible.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-message">No student matches "${esc(query)}".</td></tr>`;
        return;
    }

    tbody.innerHTML = visible.map(s => `
        <tr class="${String(s.id) === editId ? 'editing' : ''} ${s.id === highlightId ? 'flash' : ''}">
            <td>${esc(s.roll)}</td>
            <td>${esc(s.name)}</td>
            <td><span class="marks-pill ${marksClass(s.marks)}">${fmt(s.marks)}</span></td>
            <td class="actions-col">
                <button class="btn btn-sm btn-info" onclick="editStudent(${Number(s.id)})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteStudent(${Number(s.id)})">Delete</button>
            </td>
        </tr>
    `).join('');
}

function marksClass(m) {
    if (m >= 90) return 'm-high';
    if (m >= 60) return 'm-mid';
    if (m >= 40) return 'm-low';
    return 'm-fail';
}

function editStudent(id) {
    const student = students.find(s => s.id === id);
    if (!student) return;
    clearFieldErrors();
    document.getElementById('student-roll').value = student.roll;
    document.getElementById('student-name').value = student.name;
    document.getElementById('student-marks').value = student.marks;
    document.getElementById('edit-index').value = id;
    document.getElementById('submit-btn').textContent = 'Update Student';
    document.getElementById('cancel-btn').textContent = 'Cancel Edit';
    document.getElementById('form-title').textContent = `Edit Student: ${student.name}`;
    renderStudentTable();
    document.getElementById('student-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('student-marks').focus();
}

async function deleteStudent(id) {
    const student = students.find(s => s.id === id);
    const label = student ? `${student.name} (roll ${student.roll})` : 'this student';
    if (!await confirmDialog('Delete student?', `${label} will be removed from PostgreSQL.`)) return;
    try {
        const result = await apiCall(`/api/students/${id}`, 'DELETE');
        showToast(result.message, 'success');
        if (document.getElementById('edit-index').value === String(id)) clearForm();
        await loadAndRenderStudents();
        invalidateRanking();
    } catch (err) {
        showToast(err.message, 'error');
        loadAndRenderStudents();
    }
}

async function clearAllStudents() {
    if (students.length === 0) { showToast('There are no students to clear', 'info'); return; }
    if (!await confirmDialog('Clear all students?', `All ${students.length} student records will be permanently deleted from PostgreSQL.`, 'Delete all')) return;
    await withLoading(document.getElementById('clear-all-btn'), async () => {
        try {
            const result = await apiCall('/api/students', 'DELETE');
            showToast(result.message, 'success');
            clearForm();
            students = [];
            await loadAndRenderStudents();
            invalidateRanking();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, 'Clearing…');
}

async function loadSample() {
    await withLoading(document.getElementById('sample-btn'), async () => {
        try {
            const data = await apiCall('/api/sample', 'POST');
            showToast(data.message, data.added.length ? 'success' : 'info');
            students = data.students;
            renderStudentTable();
            invalidateRanking();
        } catch (err) {
            showToast('Failed to load sample data: ' + err.message, 'error');
        }
    }, 'Loading…');
}

function clearForm() {
    document.getElementById('student-form').reset();
    document.getElementById('edit-index').value = '-1';
    document.getElementById('submit-btn').textContent = 'Add Student';
    document.getElementById('cancel-btn').textContent = 'Clear';
    document.getElementById('form-title').textContent = 'Add Student';
    clearFieldErrors();
    renderStudentTable();
}

function invalidateRanking() {
    // Data changed: the next visit to Ranking/Dashboard fetches a fresh Merge Sort result
    rankingData = null;
}

// ==================== RANKING ====================

async function generateRanking() {
    const button = document.getElementById('rank-btn');
    const tbody = document.getElementById('ranking-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="empty-message"><span class="spinner dark"></span> Fetching from PostgreSQL and running Merge Sort…</td></tr>';
    await withLoading(button, async () => {
        try {
            const data = await apiCall('/api/ranking');
            rankingData = data;
            rankedStudents = data.students;
            renderAlgoSummary(data.algorithm);
            showRankingStats(data.statistics);
            renderBeforeTable(data.original);
            filterRanking();
            document.getElementById('export-btn').disabled = !rankedStudents.length;
            if (data.students.length) {
                showToast(`Ranked ${data.students.length} students with Merge Sort (${data.algorithm.comparisons} comparisons)`, 'success');
            }
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-message error-text">${esc(err.message)}</td></tr>`;
            document.getElementById('algo-summary').hidden = true;
            showToast('Error generating ranking: ' + err.message, 'error');
        }
    }, 'Sorting…');
}

function renderAlgoSummary(a) {
    const el = document.getElementById('algo-summary');
    if (!a || !a.n) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `
        <div class="algo-item"><span>Records (n)</span><b>${a.n}</b></div>
        <div class="algo-item"><span>Comparisons</span><b>${fmtNum(a.comparisons)}</b></div>
        <div class="algo-item"><span>n log₂ n</span><b>${fmtNum(a.n_log2_n, 0)}</b></div>
        <div class="algo-item"><span>Recursion depth</span><b>${a.recursion_depth}</b></div>
        <div class="algo-item"><span>Sort time</span><b>${fmtMs(a.execution_time_ms)} ms</b></div>
        <div class="algo-item"><span>Tied rank groups</span><b>${a.tied_groups}</b></div>`;
}

function rankBadge(rank) {
    const medal = { 1: 'gold', 2: 'silver', 3: 'bronze' }[rank] || '';
    return `<span class="rank-badge ${medal}">${rank}</span>`;
}

function renderRankingTable(data) {
    const tbody = document.getElementById('ranking-tbody');
    if (!rankedStudents.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-message">No students in the database. Add students or load sample data first.</td></tr>';
        return;
    }
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-message">No students match the filters.</td></tr>';
        return;
    }

    // A rank is "tied" when another student in the full ranking shares it
    const rankCount = {};
    rankedStudents.forEach(s => { rankCount[s.rank] = (rankCount[s.rank] || 0) + 1; });

    tbody.innerHTML = data.map(s => `
        <tr class="${s.rank <= 3 ? 'rank-top rank-' + s.rank : ''}">
            <td>${rankBadge(s.rank)}${rankCount[s.rank] > 1 ? '<span class="tie-chip" data-tip="Same marks, same rank">Tied</span>' : ''}</td>
            <td>${esc(s.roll)}</td>
            <td>${esc(s.name)}</td>
            <td><span class="marks-pill ${marksClass(s.marks)}">${fmt(s.marks)}</span></td>
        </tr>
    `).join('');
}

function renderBeforeTable(original) {
    const tbody = document.getElementById('before-tbody');
    if (!original || !original.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-message">No students in the database.</td></tr>';
        return;
    }
    tbody.innerHTML = original.map((s, i) => `
        <tr><td>${i + 1}</td><td>${esc(s.roll)}</td><td>${esc(s.name)}</td><td>${fmt(s.marks)}</td></tr>`).join('');
}

function setRankTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('rank-after').hidden = tab !== 'after';
    document.getElementById('rank-before').hidden = tab !== 'before';
}

function showRankingStats(stats) {
    const el = document.getElementById('ranking-stats');
    if (!stats || !stats.total) { el.innerHTML = ''; return; }
    el.innerHTML = `
        <div class="rank-stat">Total Students: <strong>${stats.total}</strong></div>
        <div class="rank-stat">Highest: <strong>${fmt(stats.highest)}</strong></div>
        <div class="rank-stat">Average: <strong>${fmt(stats.average)}</strong></div>
        <div class="rank-stat">Lowest: <strong>${fmt(stats.lowest)}</strong></div>
    `;
}

function filterRanking() {
    const search = document.getElementById('search-student').value.trim().toLowerCase();
    const minRaw = document.getElementById('filter-min').value;
    const maxRaw = document.getElementById('filter-max').value;
    const min = minRaw === '' ? -Infinity : parseFloat(minRaw);
    const max = maxRaw === '' ? Infinity : parseFloat(maxRaw);

    // Filtering keeps the Merge Sort order and the original ranks
    const filtered = rankedStudents.filter(s =>
        (!search || s.name.toLowerCase().includes(search) || String(s.roll).includes(search)) &&
        s.marks >= min && s.marks <= max);

    renderRankingTable(filtered);
}

function resetFilters() {
    ['search-student', 'filter-min', 'filter-max'].forEach(id => document.getElementById(id).value = '');
    filterRanking();
}

function exportCSV() {
    if (!rankedStudents.length) return;
    const quote = v => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Rank', 'Roll No', 'Name', 'Marks']].concat(rankedStudents.map(s => [s.rank, s.roll, s.name, s.marks]));
    const csv = rows.map(r => r.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_ranking.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Ranking exported as student_ranking.csv', 'success');
}

// ==================== MERGE SORT VISUALIZATION ====================

function parseVizInput() {
    const input = document.getElementById('viz-input').value.trim();
    if (!input) throw new Error('Enter marks separated by commas, e.g. 96, 72, 91, 85');
    const parts = input.split(',').map(p => p.trim()).filter(p => p !== '');
    const marks = [];
    for (const p of parts) {
        const m = Number(p);
        if (Number.isNaN(m) || m < 0 || m > 100) throw new Error(`"${p}" is not a valid mark (0-100)`);
        marks.push(m);
    }
    if (marks.length < 2 || marks.length > 16) throw new Error('Enter between 2 and 16 marks');
    return marks;
}

async function startViz(payload = null) {
    const button = document.getElementById('viz-start');
    let body = payload;
    if (!body) {
        try { body = { marks: parseVizInput() }; }
        catch (err) { showToast(err.message, 'error'); return; }
    }
    await withLoading(button, async () => {
        try {
            vizPause();
            vizData = await apiCall('/api/visualize', 'POST', body);
            vizSteps = vizData.steps;
            vizCurrentStep = 0;
            buildVizTree();
            renderVizSteps();
            renderVizStep();
            document.getElementById('viz-stats').textContent =
                `· n = ${vizData.n}, ${vizSteps.length} steps, ${vizData.stats.comparisons} comparisons`;
            showToast('Visualization ready. Press Play or Next.', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    }, 'Loading…');
}

function randomVizInput() {
    const n = 8;
    const marks = [];
    for (let i = 0; i < n; i++) marks.push(35 + Math.floor(Math.random() * 65));
    marks[5] = marks[1];          // guarantee one tie to show tie handling
    document.getElementById('viz-input').value = marks.join(', ');
    startViz();
}

async function vizFromDatabase() {
    try {
        if (!students.length) students = (await apiCall('/api/students')).students;
        if (students.length < 2) { showToast('Add at least 2 students first', 'error'); return; }
        const subset = students.slice(0, 16);
        document.getElementById('viz-input').value = subset.map(s => fmt(s.marks)).join(', ');
        await startViz({ students: subset.map(s => ({ roll: s.roll, name: s.name, marks: s.marks })) });
        if (students.length > 16) showToast('Showing the first 16 students from the database', 'info');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function buildVizTree() {
    // Nodes = sub-arrays A[low..high]. A child appears when its parent is divided.
    const nodes = {};
    const key = (lo, hi) => `${lo}-${hi}`;
    const n = vizSteps.length ? vizSteps[0].array.length : 0;
    nodes[key(0, n - 1)] = { low: 0, high: n - 1, depth: 0, appear: 0, done: Infinity };
    vizSteps.forEach((step, i) => {
        if (step.type === 'divide') {
            nodes[key(step.low, step.mid)] = nodes[key(step.low, step.mid)] ||
                { low: step.low, high: step.mid, depth: step.depth + 1, appear: i, done: Infinity };
            nodes[key(step.mid + 1, step.high)] = nodes[key(step.mid + 1, step.high)] ||
                { low: step.mid + 1, high: step.high, depth: step.depth + 1, appear: i, done: Infinity };
        }
        if (step.type === 'merged' || step.type === 'base') {
            const node = nodes[key(step.low, step.high)];
            if (node && node.done === Infinity) node.done = i;
        }
    });
    vizTree = Object.values(nodes);
}

function renderVizTree(step) {
    const el = document.getElementById('viz-tree');
    const n = step.array.length;
    el.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
    el.innerHTML = vizTree.filter(node => node.appear <= vizCurrentStep).map(node => {
        let state = 'pending';
        if (node.done <= vizCurrentStep) state = 'sorted';
        if (step.low === node.low && step.high === node.high) state = 'current';
        const values = step.array.slice(node.low, node.high + 1).map(v => fmt(v.marks)).join(' ');
        return `<div class="tree-node ${state}" style="grid-column:${node.low + 1} / ${node.high + 2}; grid-row:${node.depth + 1}">${values}</div>`;
    }).join('');
}

function renderVizSteps() {
    const container = document.getElementById('viz-steps');
    if (!vizSteps.length) {
        container.innerHTML = '<p class="placeholder-text">Steps will appear here. Click any step to jump to it.</p>';
        return;
    }
    const labels = { divide: 'DIVIDE', base: 'BASE', 'merge-start': 'COMBINE', compare: 'COMPARE', merged: 'MERGED' };
    container.innerHTML = vizSteps.map((step, i) => `
        <div class="step-item ${step.type}" data-step="${i}" style="margin-left:${Math.min(step.depth, 5) * 10}px" onclick="vizGoTo(${i})">
            <span class="step-tag">${labels[step.type] || ''}</span>
            <span><strong>${i + 1}.</strong> ${esc(step.message)}</span>
        </div>
    `).join('');
}

function renderVizStep() {
    const messageEl = document.getElementById('viz-message');
    const arrayEl = document.getElementById('viz-array');

    if (vizSteps.length === 0) {
        messageEl.textContent = 'Enter marks and click "Start"';
        messageEl.className = 'viz-message';
        arrayEl.innerHTML = '';
        document.getElementById('viz-counter').textContent = 'Step 0 / 0';
        document.getElementById('viz-progress').style.width = '0%';
        document.getElementById('viz-tree').innerHTML = '<p class="placeholder-text">Start the visualization to build the tree.</p>';
        document.getElementById('viz-result-card').hidden = true;
        return;
    }

    const step = vizSteps[vizCurrentStep];
    const isLast = vizCurrentStep === vizSteps.length - 1;
    messageEl.textContent = isLast ? `Done! Final sorted order (descending): [${vizData.sorted.map(s => fmt(s.marks)).join(', ')}]` : step.message;
    messageEl.className = `viz-message ${isLast ? 'done' : step.type}`;

    const maxMark = Math.max(...step.array.map(v => v.marks), 1);
    const compare = step.compare || [];
    arrayEl.innerHTML = step.array.map((v, i) => {
        let cls = 'idle';
        if (isLast) cls = 'merged';
        else if (i >= step.low && i <= step.high) {
            cls = 'active';
            if (step.type === 'merged') cls = 'merged';
            if (compare.includes(i)) cls = 'comparing';
        }
        const height = 18 + (v.marks / maxMark) * 82;
        return `<div class="viz-col">
            <div class="viz-bar ${cls}" style="height:calc((100% - 24px) * ${(height / 100).toFixed(3)})"><span>${fmt(v.marks)}</span></div>
            <div class="viz-label" title="${esc(v.label)}">${esc(v.label.split(' ')[0])}</div>
        </div>`;
    }).join('');

    document.getElementById('viz-counter').textContent = `Step ${vizCurrentStep + 1} / ${vizSteps.length}`;
    document.getElementById('viz-progress').style.width = `${((vizCurrentStep + 1) / vizSteps.length) * 100}%`;

    document.querySelectorAll('#viz-steps .step-item').forEach((el, i) => el.classList.toggle('current', i === vizCurrentStep));
    const current = document.querySelector(`#viz-steps .step-item[data-step="${vizCurrentStep}"]`);
    if (current) {
        const box = document.getElementById('viz-steps');
        box.scrollTop = current.offsetTop - box.clientHeight / 2 + current.clientHeight / 2;
    }

    renderVizTree(step);

    const resultCard = document.getElementById('viz-result-card');
    resultCard.hidden = !isLast;
    if (isLast) {
        document.getElementById('viz-result').innerHTML = vizData.sorted.map(s => `
            <div class="viz-result-item">${rankBadge(s.rank)}<b>${fmt(s.marks)}</b><span class="muted small">${esc(s.name)}</span></div>`).join('');
    }
}

function vizGoTo(i) {
    if (!vizSteps.length) return;
    vizCurrentStep = Math.max(0, Math.min(i, vizSteps.length - 1));
    renderVizStep();
}

function vizPrev() { if (!vizSteps.length) return showToast('Start the visualization first', 'info'); vizPause(); vizGoTo(vizCurrentStep - 1); }
function vizNext() { if (!vizSteps.length) return showToast('Start the visualization first', 'info'); vizPause(); vizGoTo(vizCurrentStep + 1); }

function vizPlay() {
    if (!vizSteps.length) { startViz().then(() => { if (vizSteps.length) vizPlay(); }); return; }
    if (vizCurrentStep >= vizSteps.length - 1) vizGoTo(0);
    if (vizPlayInterval) clearInterval(vizPlayInterval);
    document.getElementById('viz-play').classList.add('playing');
    vizPlayInterval = setInterval(() => {
        if (vizCurrentStep >= vizSteps.length - 1) { vizPause(); return; }
        vizGoTo(vizCurrentStep + 1);
    }, Number(document.getElementById('viz-speed').value));
}

function updateSpeed() {
    if (vizPlayInterval) vizPlay();
}

function vizPause() {
    if (vizPlayInterval) { clearInterval(vizPlayInterval); vizPlayInterval = null; }
    document.getElementById('viz-play').classList.remove('playing');
}

function vizReset() {
    vizPause();
    vizCurrentStep = 0;
    renderVizStep();
}

// ==================== CHARTS (small SVG helpers, no libraries) ====================

function niceMax(v) {
    if (v <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nice * exp;
}

function shortNum(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + 'k';
    return String(Math.round(v * 100) / 100);
}

/**
 * Line chart. series: [{ key, name, color, points: [{x, y, tip}] }]
 */
function lineChart(container, series, opts) {
    const W = Math.max(340, Math.min(container.clientWidth || 640, 900));
    const H = W < 500 ? 260 : 320;
    const m = { top: 16, right: W < 500 ? 96 : 118, bottom: 44, left: 58 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const allPoints = series.flatMap(s => s.points);
    if (!allPoints.length) { container.innerHTML = '<p class="placeholder-text">No data.</p>'; return; }
    const xStep = niceMax(Math.max(...allPoints.map(p => p.x)) / 5);
    const xMax = xStep * 5;
    const yStep = niceMax(Math.max(...allPoints.map(p => p.y)) / 4);
    const yTicks = Math.max(1, Math.ceil(Math.max(...allPoints.map(p => p.y)) / yStep));
    const yMax = yStep * yTicks;
    const x = v => m.left + (v / xMax) * iw;
    const y = v => m.top + ih - (v / yMax) * ih;

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(opts.title)}">`;
    // grid + y axis
    for (let i = 0; i <= yTicks; i++) {
        const v = yStep * i;
        svg += `<line class="grid" x1="${m.left}" x2="${m.left + iw}" y1="${y(v)}" y2="${y(v)}"/>`;
        svg += `<text class="tick" x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end">${shortNum(v)}</text>`;
    }
    for (let i = 0; i <= 5; i++) {
        const v = xStep * i;
        svg += `<text class="tick" x="${x(v)}" y="${m.top + ih + 18}" text-anchor="middle">${shortNum(v)}</text>`;
    }
    svg += `<line class="axis" x1="${m.left}" x2="${m.left + iw}" y1="${m.top + ih}" y2="${m.top + ih}"/>`;
    svg += `<text class="axis-title" x="${m.left + iw / 2}" y="${H - 6}" text-anchor="middle">${esc(opts.xLabel)}</text>`;
    svg += `<text class="axis-title" transform="translate(14 ${m.top + ih / 2}) rotate(-90)" text-anchor="middle">${esc(opts.yLabel)}</text>`;

    // lines
    series.forEach(s => {
        if (!s.points.length) return;
        const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
        svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    // markers with hover targets
    series.forEach(s => s.points.forEach(p => {
        svg += `<circle cx="${x(p.x)}" cy="${y(p.y)}" r="4.5" fill="${s.color}" stroke="var(--card-bg)" stroke-width="2"/>`;
        svg += `<circle class="hit" cx="${x(p.x)}" cy="${y(p.y)}" r="12" data-tip="${esc(p.tip)}"/>`;
    }));

    // direct labels at line ends, nudged apart so they never overlap
    const labels = series.filter(s => s.points.length).map(s => {
        const last = s.points[s.points.length - 1];
        return { s, ly: y(last.y), lx: x(last.x) };
    });
    for (let pass = 0; pass < 10; pass++) {
        for (let i = 0; i < labels.length; i++) {
            for (let j = 0; j < labels.length; j++) {
                if (i === j) continue;
                const a = labels[i], b = labels[j];
                if (Math.abs(a.ly - b.ly) < 14 && a.ly <= b.ly) { a.ly -= 1.5; b.ly += 1.5; }
            }
        }
    }
    labels.forEach(l => {
        svg += `<text class="direct-label" x="${l.lx + 10}" y="${l.ly + 4}">${esc(l.s.name)}</text>`;
    });
    svg += '</svg>';

    const legend = series.length > 1
        ? `<div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`
        : '';
    container.innerHTML = `<div class="chart-title">${esc(opts.title)}</div>${legend}${svg}`;
}

// Shared tooltip for any element with data-tip
(function setupTooltip() {
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    document.body.appendChild(tip);
    document.addEventListener('mouseover', e => {
        const t = e.target.closest('[data-tip]');
        if (!t) { tip.classList.remove('show'); return; }
        tip.innerHTML = esc(t.dataset.tip).replace(/\n/g, '<br>');
        tip.classList.add('show');
    });
    document.addEventListener('mousemove', e => {
        if (!tip.classList.contains('show')) return;
        const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = x + 'px';
        tip.style.top = (e.clientY + 14) + 'px';
    });
})();

// ==================== PERFORMANCE TESTING ====================

function insertBySize(rows, row) {
    // Keep rows ordered by dataset size (simple insertion, no built-in sort)
    const out = rows.filter(r => r.size !== row.size);
    let i = 0;
    while (i < out.length && out[i].size < row.size) i++;
    out.splice(i, 0, row);
    return out;
}

async function runPerformance(sizes) {
    const resultsContainer = document.getElementById('perf-results');
    const buttons = document.querySelectorAll('.perf-controls button');
    buttons.forEach(b => b.disabled = true);
    resultsContainer.innerHTML = `<p class="loading-text"><span class="spinner dark"></span> Running Merge Sort on ${sizes.map(s => fmtNum(s)).join(', ')} records…</p>`;

    try {
        const data = await apiCall('/api/performance', 'POST', { sizes, algorithms: ['merge'] }, 120000);
        data.results.forEach(r => {
            const m = r.results.merge;
            perfResults = insertBySize(perfResults, {
                size: r.size, time: m.execution_time_ms, comparisons: m.comparisons,
                nlogn: r.n_log2_n, correct: m.sort_correct
            });
        });

        resultsContainer.innerHTML = `
            <table>
                <thead><tr><th>n</th><th>Time (ms)</th><th>Comparisons</th><th>n log₂ n</th><th>Ratio</th><th>Correct</th></tr></thead>
                <tbody>
                    ${perfResults.map(r => `<tr>
                        <td>${fmtNum(r.size)}</td><td>${fmtMs(r.time)}</td><td>${fmtNum(r.comparisons)}</td>
                        <td>${fmtNum(r.nlogn)}</td><td>${r.nlogn ? (r.comparisons / r.nlogn).toFixed(3) : '–'}</td>
                        <td>${r.correct ? '✓' : '✗'}</td></tr>`).join('')}
                </tbody>
            </table>`;

        renderPerfChart();
        showToast('Performance test complete', 'success');
    } catch (err) {
        resultsContainer.innerHTML = `<p class="error-text">Error: ${esc(err.message)}</p>`;
        showToast(err.message, 'error');
    } finally {
        buttons.forEach(b => b.disabled = false);
    }
}

function renderPerfChart() {
    const chart = document.getElementById('perf-chart');
    if (perfResults.length >= 2) {
        lineChart(chart, [{
            key: 'merge', name: 'Merge Sort', color: SERIES.merge.color,
            points: perfResults.map(r => ({ x: r.size, y: r.time, tip: `n = ${fmtNum(r.size)}\n${fmtMs(r.time)} ms\n${fmtNum(r.comparisons)} comparisons` }))
        }], { title: 'Merge Sort time vs n (close to a straight line: n log n)', xLabel: 'Number of records (n)', yLabel: 'Time (ms)' });
    } else {
        chart.innerHTML = '<p class="placeholder-text">Run at least two sizes (or Run All) to see the growth curve.</p>';
    }
}

async function runComparison() {
    const algorithms = [...document.querySelectorAll('#algo-checks input:checked')].map(c => c.value);
    const order = document.getElementById('compare-order').value;
    const sizes = [100, 500, 1000, 2000, 5000];
    const chart = document.getElementById('compare-chart');
    chart.innerHTML = `<p class="loading-text"><span class="spinner dark"></span> Sorting ${sizes.map(s => fmtNum(s)).join(', ')} records with ${algorithms.length} algorithms. The O(n²) sorts take a few seconds at n = 5,000…</p>`;
    document.getElementById('compare-results').innerHTML = '';
    document.getElementById('compare-insight').hidden = true;

    await withLoading(document.getElementById('compare-btn'), async () => {
        try {
            compareData = await apiCall('/api/performance', 'POST', { sizes, algorithms, order }, 180000);
            renderComparison();
            showToast('Comparison complete', 'success');
        } catch (err) {
            chart.innerHTML = `<p class="error-text">Error: ${esc(err.message)}</p>`;
            showToast(err.message, 'error');
        }
    }, 'Running…');
}

function setCompareMetric(metric) {
    compareMetric = metric;
    document.querySelectorAll('.metric-toggle .chip').forEach(c => c.classList.toggle('active', c.dataset.metric === metric));
    if (compareData) renderComparison();
}

function renderComparison() {
    const { results, algorithms, order } = compareData;
    const metricLabel = compareMetric === 'execution_time_ms' ? 'Time (ms)' : 'Comparisons';
    const orderLabel = { random: 'random input', sorted: 'already sorted input', reverse: 'reverse sorted input' }[order];

    const series = algorithms.map(key => ({
        key, name: SERIES[key].name, color: SERIES[key].color,
        points: results.filter(r => !r.results[key].skipped).map(r => {
            const v = r.results[key];
            return { x: r.size, y: v[compareMetric], tip: `${SERIES[key].name}, n = ${fmtNum(r.size)}\n${fmtMs(v.execution_time_ms)} ms\n${fmtNum(v.comparisons)} comparisons` };
        })
    }));
    lineChart(document.getElementById('compare-chart'), series,
        { title: `${metricLabel} vs n (${orderLabel})`, xLabel: 'Number of records (n)', yLabel: metricLabel });

    const head = algorithms.map(k => `<th colspan="2">${SERIES[k].name}</th>`).join('');
    const sub = algorithms.map(() => '<th>ms</th><th>comparisons</th>').join('');
    document.getElementById('compare-results').innerHTML = `
        <table class="compare-table">
            <thead><tr><th rowspan="2">n</th>${head}</tr><tr>${sub}</tr></thead>
            <tbody>${results.map(r => `<tr><td>${fmtNum(r.size)}</td>${algorithms.map(k => {
                const v = r.results[k];
                return v.skipped ? '<td colspan="2" class="muted">skipped</td>'
                    : `<td>${fmtMs(v.execution_time_ms)}</td><td>${fmtNum(v.comparisons)}</td>`;
            }).join('')}</tr>`).join('')}</tbody>
        </table>`;

    // Insight at the largest size every selected algorithm ran
    const last = results[results.length - 1];
    const merge = last.results.merge;
    const others = algorithms.filter(k => k !== 'merge' && !last.results[k].skipped);
    const insight = document.getElementById('compare-insight');
    if (merge && others.length) {
        const lines = others.map(k => {
            const o = last.results[k];
            const speed = o.execution_time_ms / Math.max(merge.execution_time_ms, 0.0001);
            const cmp = o.comparisons / Math.max(merge.comparisons, 1);
            return `<li><b>${SERIES[k].name}</b>: ${speed >= 1 ? speed.toFixed(1) + '× slower' : (1 / speed).toFixed(1) + '× faster'} than Merge Sort, ${cmp >= 1 ? cmp.toFixed(1) + '× more' : (1 / cmp).toFixed(1) + '× fewer'} comparisons</li>`;
        }).join('');
        const note = order === 'sorted'
            ? '<p class="small">On already-sorted input Insertion Sort and Bubble Sort (early exit) hit their O(n) best case, which is why they can beat Merge Sort here. Merge Sort stays O(n log n) in every case, which is why it is used for ranking.</p>'
            : '<p class="small">Doubling n roughly quadruples the O(n²) times but only slightly more than doubles Merge Sort, matching the theory.</p>';
        insight.innerHTML = `<h4>At n = ${fmtNum(last.size)}</h4><ul>${lines}</ul>${note}`;
        insight.hidden = false;
    }
}

// ==================== INITIALIZE ====================

document.addEventListener('keydown', e => {
    if (!document.getElementById('visualization').classList.contains('active')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight') vizNext();
    if (e.key === 'ArrowLeft') vizPrev();
    if (e.key === ' ') { e.preventDefault(); vizPlayInterval ? vizPause() : vizPlay(); }
});

let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (perfResults.length >= 2) renderPerfChart();
        if (compareData) renderComparison();
    }, 200);
});

window.addEventListener('hashchange', () => showSection(location.hash.slice(1)));

(async function init() {
    await checkHealth();
    showSection(location.hash.slice(1) || 'dashboard');
    loadAndRenderStudents();
    setInterval(() => { if (document.visibilityState === 'visible') checkHealth(); }, 15000);
})();

/* ===========================
   LEADFLOW CRM — APP.JS
   =========================== */

'use strict';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_BASE = '/api';

// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('crm_token') || null,
  leads: [],
  currentLeadId: null,
};

// ─── UTILITIES ───────────────────────────────────────────────────────────────

/** Get/set token in memory + localStorage */
function setToken(token) {
  state.token = token;
  localStorage.setItem('crm_token', token);
}
function clearToken() {
  state.token = null;
  localStorage.removeItem('crm_token');
}

/** Base fetch wrapper – attaches JWT, handles errors */
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token expired / invalid
    clearToken();
    showLoginScreen();
    throw new Error('Unauthorized – please log in again.');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }

  return data;
}

/** Show a toast notification */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; }, 2800);
  setTimeout(() => toast.remove(), 3200);
}

/** Get initials from a name */
function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

/** Format status label */
function statusBadge(status) {
  const labels = { new: 'New', contacted: 'Contacted', converted: 'Converted' };
  return `<span class="status-badge status-${status}">${labels[status] || status}</span>`;
}

/** Format date */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────

function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.remove('hidden');
    pageEl.classList.add('active');
  }

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  document.getElementById('page-title').textContent =
    page.charAt(0).toUpperCase() + page.slice(1);

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.classList.add('hidden');
  btn.textContent = 'Signing in…';
  btn.disabled = true;

  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    setToken(data.token);
    showApp();
    navigateTo('dashboard');
    await loadDashboard();
  } catch (err) {
    errEl.textContent = err.message || 'Login failed. Please try again.';
    errEl.classList.remove('hidden');
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
}

function handleLogout() {
  clearToken();
  state.leads = [];
  showLoginScreen();
  showToast('You have been logged out.', 'info');
}

// ─── LEADS ───────────────────────────────────────────────────────────────────

/** Fetch all leads and update state */
async function fetchLeads() {
  const data = await apiFetch('/leads');
  // Accept array directly or { leads: [...] }
  state.leads = Array.isArray(data) ? data : (data.leads || []);
  return state.leads;
}

/** Render the leads table */
function renderLeadsTable(leads) {
  const tbody    = document.getElementById('leads-tbody');
  const emptyEl  = document.getElementById('empty-state');

  if (!leads || leads.length === 0) {
    tbody.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  tbody.innerHTML = leads.map(lead => `
    <tr data-id="${lead._id || lead.id}">
      <td class="name-cell">${escapeHtml(lead.name || '—')}</td>
      <td>${escapeHtml(lead.email || '—')}</td>
      <td><span class="source-tag">${escapeHtml(lead.source || '—')}</span></td>
      <td>
        <select class="status-select" data-id="${lead._id || lead.id}" data-current="${lead.status}">
          <option value="new"       ${lead.status === 'new'       ? 'selected' : ''}>🟡 New</option>
          <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>🔵 Contacted</option>
          <option value="converted" ${lead.status === 'converted' ? 'selected' : ''}>🟢 Converted</option>
        </select>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn-icon view-notes-btn" data-id="${lead._id || lead.id}" data-name="${escapeHtml(lead.name || '')}">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            Notes
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Attach status-change listeners
  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const id     = e.target.dataset.id;
      const status = e.target.value;
      await updateLeadStatus(id, status, e.target);
    });
  });

  // Attach notes-open listeners
  tbody.querySelectorAll('.view-notes-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openNotesModal(btn.dataset.id, btn.dataset.name);
    });
  });
}

/** Update lead status via PATCH */
async function updateLeadStatus(id, status, selectEl) {
  const prev = selectEl.dataset.current;
  selectEl.disabled = true;
  try {
    await apiFetch(`/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    selectEl.dataset.current = status;
    // Sync state
    const lead = state.leads.find(l => (l._id || l.id) === id);
    if (lead) lead.status = status;
    showToast('Status updated successfully.', 'success');
    // Refresh stats if on dashboard
    updateStats();
  } catch (err) {
    selectEl.value = prev; // revert
    showToast(`Failed to update: ${err.message}`, 'error');
  } finally {
    selectEl.disabled = false;
  }
}

/** Filter leads by search + status */
function getFilteredLeads() {
  const query  = (document.getElementById('search-input')?.value || '').toLowerCase();
  const status = document.getElementById('status-filter')?.value || '';

  return state.leads.filter(lead => {
    const matchesSearch =
      !query ||
      (lead.name  || '').toLowerCase().includes(query) ||
      (lead.email || '').toLowerCase().includes(query) ||
      (lead.source|| '').toLowerCase().includes(query);

    const matchesStatus = !status || lead.status === status;
    return matchesSearch && matchesStatus;
  });
}

/** Reload and render leads page */
async function loadLeadsPage() {
  const tbody = document.getElementById('leads-tbody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="5"><div class="loader"></div></td></tr>';
  document.getElementById('empty-state').classList.add('hidden');

  try {
    await fetchLeads();
    renderLeadsTable(getFilteredLeads());
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red);padding:24px">${err.message}</td></tr>`;
    showToast(err.message, 'error');
  }
}

// ─── ADD LEAD ─────────────────────────────────────────────────────────────────

async function handleAddLead(e) {
  e.preventDefault();
  const btn = document.getElementById('add-lead-btn');
  btn.textContent = 'Adding…';
  btn.disabled = true;

  const payload = {
    name:   document.getElementById('lead-name').value.trim(),
    email:  document.getElementById('lead-email').value.trim(),
    phone:  document.getElementById('lead-phone').value.trim(),
    source: document.getElementById('lead-source').value,
    note:   document.getElementById('lead-note').value.trim(),
  };

  try {
    const newLead = await apiFetch('/leads', { method: 'POST', body: JSON.stringify(payload) });
    state.leads.unshift(newLead.lead || newLead);
    hideModal('modal-add-lead');
    e.target.reset();
    renderLeadsTable(getFilteredLeads());
    updateStats();
    showToast('Lead added successfully!', 'success');
  } catch (err) {
    showToast(`Could not add lead: ${err.message}`, 'error');
  } finally {
    btn.textContent = 'Add Lead';
    btn.disabled = false;
  }
}

// ─── NOTES ────────────────────────────────────────────────────────────────────

async function openNotesModal(leadId, leadName) {
  state.currentLeadId = leadId;
  document.getElementById('notes-lead-name').textContent = leadName;
  document.getElementById('note-input').value = '';
  showModal('modal-notes');

  const listEl = document.getElementById('notes-list');
  listEl.innerHTML = '<div class="loader"></div>';

  try {
    const data = await apiFetch(`/leads/${leadId}`);
    const notes = data.notes || data.lead?.notes || [];
    renderNotes(notes);
  } catch (err) {
    listEl.innerHTML = `<p class="note-empty">${err.message}</p>`;
  }
}

function renderNotes(notes) {
  const listEl = document.getElementById('notes-list');
  if (!notes || notes.length === 0) {
    listEl.innerHTML = '<p class="note-empty">No notes yet. Add the first one below.</p>';
    return;
  }
  listEl.innerHTML = notes.map(n => `
    <div class="note-item">
      <div class="note-meta">${formatDate(n.createdAt || n.date)}</div>
      <div class="note-text">${escapeHtml(n.text || n.content || '')}</div>
    </div>
  `).join('');
  // Scroll to bottom
  listEl.scrollTop = listEl.scrollHeight;
}

async function handlePostNote(e) {
  e.preventDefault();
  const text = document.getElementById('note-input').value.trim();
  if (!text) return;

  const btn = document.getElementById('post-note-btn');
  btn.textContent = 'Posting…';
  btn.disabled = true;

  try {
    const data = await apiFetch(`/leads/${state.currentLeadId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    const notes = data.notes || data.lead?.notes || [];
    renderNotes(notes);
    document.getElementById('note-input').value = '';
    showToast('Note added.', 'success');
  } catch (err) {
    showToast(`Failed to post note: ${err.message}`, 'error');
  } finally {
    btn.textContent = 'Post Note';
    btn.disabled = false;
  }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function updateStats() {
  const leads  = state.leads;
  const total  = leads.length;
  const newC   = leads.filter(l => l.status === 'new').length;
  const contC  = leads.filter(l => l.status === 'contacted').length;
  const convC  = leads.filter(l => l.status === 'converted').length;

  setText('stat-total',     total);
  setText('stat-new',       newC);
  setText('stat-contacted', contC);
  setText('stat-converted', convC);

  if (total > 0) {
    setWidth('bar-new',       (newC  / total) * 100);
    setWidth('bar-contacted', (contC / total) * 100);
    setWidth('bar-converted', (convC / total) * 100);
  }
}

function renderRecentLeads(leads) {
  const el = document.getElementById('recent-leads-list');
  const recent = [...leads].slice(0, 5);

  if (recent.length === 0) {
    el.innerHTML = '<p style="color:var(--text3);font-size:0.85rem;padding:12px 0">No leads yet.</p>';
    return;
  }

  el.innerHTML = recent.map(lead => `
    <div class="recent-lead-row">
      <div class="lead-avatar">${getInitials(lead.name)}</div>
      <div class="lead-info">
        <strong>${escapeHtml(lead.name || '—')}</strong>
        <span>${escapeHtml(lead.email || '—')}</span>
      </div>
      ${statusBadge(lead.status)}
    </div>
  `).join('');
}

async function loadDashboard() {
  try {
    if (state.leads.length === 0) await fetchLeads();
    updateStats();
    renderRecentLeads(state.leads);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── SMALL HELPERS ────────────────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setWidth(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = `${Math.min(100, pct)}%`;
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── EVENT WIRING ─────────────────────────────────────────────────────────────

function attachEvents() {
  // Login
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Logout
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Sidebar toggle (mobile)
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
      if (page === 'dashboard') await loadDashboard();
      if (page === 'leads')     await loadLeadsPage();
    });
  });

  // Dashboard "View all" link
  document.querySelectorAll('[data-page-link]').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const page = link.dataset.pageLink;
      navigateTo(page);
      if (page === 'leads') await loadLeadsPage();
    });
  });

  // Add lead modal
  document.getElementById('open-add-lead').addEventListener('click', () => showModal('modal-add-lead'));
  document.getElementById('add-lead-form').addEventListener('submit', handleAddLead);

  // Notes modal
  document.getElementById('add-note-form').addEventListener('submit', handlePostNote);

  // Close modals
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => hideModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideModal(overlay.id);
    });
  });

  // Search + filter
  let searchTimer;
  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderLeadsTable(getFilteredLeads()), 200);
  });
  document.getElementById('status-filter').addEventListener('change', () => {
    renderLeadsTable(getFilteredLeads());
  });

  // Stat cards click → go to leads with filter
  document.querySelectorAll('.stat-card[data-status]').forEach(card => {
    card.addEventListener('click', async () => {
      const status = card.dataset.status;
      navigateTo('leads');
      await loadLeadsPage();
      if (status !== 'all') {
        document.getElementById('status-filter').value = status;
        renderLeadsTable(getFilteredLeads());
      }
    });
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

function init() {
  attachEvents();

  if (state.token) {
    showApp();
    navigateTo('dashboard');
    loadDashboard();
  } else {
    showLoginScreen();
  }
}

document.addEventListener('DOMContentLoaded', init);

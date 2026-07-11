<script>

// ============================================================
// APP STATE
// ============================================================
const App = {
  currentPage: 'dashboard',
  token: <?!= safeJson_(sessionToken) ?>,
  user: { email: <?!= safeJson_(userEmail) ?>, name: <?!= safeJson_(userName) ?>, role: <?!= safeJson_(userRole) ?>, department: <?!= safeJson_(userDepartment) ?>, circle_group: <?!= safeJson_(userCircleGroup) ?> },
  data: {
    docs: [],
    categories: [],
    departments: [],
    areas: [],
    retentions: [],
    revReasons: [],
    users: []
  },
  modals: {},
  currentDocId: null,
  masterType: null,
  masterEditId: null
};

const DOC_STATUS = {
  DRAFT: 'Draft',
  WAITING_REVIEW: 'Waiting Review',
  WAITING_APPROVAL: 'Waiting Approval',
  APPROVED: 'Approved',
  EFFECTIVE: 'Effective',
  REVISED: 'Revised',
  OBSOLETE: 'Obsolete',
  REJECTED: 'Rejected',
  CR_PENDING: 'CR Pending',
  CR_APPROVED: 'CR Approved'
};

// ============================================================
// GAS API WRAPPER — otomatis inject App.token sebagai arg terakhir
// ============================================================
function gasCall(fnName, ...args) {
  return new Promise((resolve, reject) => {
    const fn = google.script.run
      .withSuccessHandler(function(res) {
        // Deteksi session expired
        if (res && typeof res === 'object') {
          if (res.error && (
            res.error.includes('Session tidak valid') ||
            res.error.includes('login ulang') ||
            res.error.includes('Akun tidak ditemukan')
          )) {
            handleSessionExpired();
            reject(new Error(res.error));
            return;
          }
        }
        resolve(res ?? {});
      })
      .withFailureHandler(function(err) {
        console.error('GAS Error [' + fnName + ']:', err);
        reject(err);
      });
    
    fn[fnName](...args, App.token);
  });
}

function handleSessionExpired() {
  showSessionExpiredModal();
}

// ============================================================
// UTILITIES
// ============================================================
function showLoader() { document.getElementById('global-loader').style.display = 'flex'; }
function hideLoader() { document.getElementById('global-loader').style.display = 'none'; }
// Setelah line: function hideLoader() { ... }
let _splashCur = 0;
function splashStep(n) {
  for (let i = 0; i < n; i++) {
    const el = document.getElementById('splash-step-' + i);
    if (el) el.className = 'splash-step done';
  }
  const active = document.getElementById('splash-step-' + n);
  if (active) active.className = 'splash-step active';
  const bar = document.getElementById('splash-bar');
  if (bar) bar.style.width = (n / 3 * 95) + '%';
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.innerHTML = `<i class="bi bi-${type==='success'?'check-circle':type==='error'?'x-circle':type==='warning'?'exclamation-triangle':'info-circle'} me-2"></i>${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.4s'; setTimeout(() => el.remove(), 400); }, 3500);
}

function statusBadge(status) {
  const cls = {
    'Draft': 'badge-draft', 'Waiting Review': 'badge-review',
    'Waiting Approval': 'badge-approval', 'Approved': 'badge-approved',
    'Effective': 'badge-effective', 'Revised': 'badge-revised',
    'CR Pending': 'badge-cr-pending', 'CR Approved': 'badge-cr-approved',
    'Obsolete': 'badge-obsolete', 'Rejected': 'badge-rejected'
  };
  const labelID = {
    'Draft': 'Draft', 'Waiting Review': 'Menunggu Review',
    'Waiting Approval': 'Menunggu Persetujuan', 'Approved': 'Disetujui',
    'Effective': 'Efektif', 'Revised': 'Direvisi',
    'CR Pending': 'CR Menunggu', 'CR Approved': 'CR Disetujui',
    'Obsolete': 'Usang', 'Rejected': 'Ditolak'
  };
  return `<span class="badge rounded-pill ${cls[status]||'badge-draft'}">${labelID[status]||status||'-'}</span>`;
}

function fmtDate(dt) {
  if (!dt) return '-';
  try { return new Date(dt).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }); }
  catch { return dt; }
}

function fmtDateTime(dt) {
  if (!dt) return '-';
  try { return new Date(dt).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch { return dt; }
}

function toggleSidebar(forceState = null) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  const isOpen = forceState !== null
    ? forceState
    : !sidebar.classList.contains('open');

  sidebar.classList.toggle('open', isOpen);
  overlay.classList.toggle('open', isOpen);

  document.body.classList.toggle('sidebar-open', isOpen);

  if (isMobile()) {
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }
}

document.addEventListener('keydown', e => {

  if (!isMobile()) return;

  if (e.key !== 'Escape') return;

  const sidebar = document.getElementById('sidebar');

  if (!sidebar.classList.contains('open')) return;

  toggleSidebar(false);

});

function exportTable(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  let csv = [];
  for (const row of table.rows) {
    const cells = [];
    for (const cell of row.cells) {
      cells.push('"' + cell.innerText.replace(/"/g, '""') + '"');
    }
    csv.push(cells.join(','));
  }
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

// ============================================================
// CUSTOM CONFIRM & PROMPT DIALOG
// ============================================================
function showConfirm({ title = 'Konfirmasi', subtitle = '', message = '', okText = 'Ya', cancelText = 'Batal', type = 'danger' } = {}) {
  return new Promise(resolve => {
    const typeMap = {
      danger:  { iconBg: '#fee2e2', iconColor: '#ef4444', icon: 'bi-exclamation-triangle-fill', btnClass: 'btn-danger' },
      warning: { iconBg: '#fef3c7', iconColor: '#f59e0b', icon: 'bi-exclamation-circle-fill',  btnClass: 'btn-warning text-dark' },
      primary: { iconBg: '#dbeafe', iconColor: '#3b82f6', icon: 'bi-question-circle-fill',     btnClass: 'btn-primary' },
      success: { iconBg: '#dcfce7', iconColor: '#10b981', icon: 'bi-check-circle-fill',        btnClass: 'btn-success' },
    };
    const t = typeMap[type] || typeMap.primary;
    document.getElementById('confirmModalIcon').style.background = t.iconBg;
    document.getElementById('confirmModalIcon').innerHTML = `<i class="bi ${t.icon}" style="color:${t.iconColor}"></i>`;
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalSubtitle').textContent = subtitle;
    document.getElementById('confirmModalMessage').innerHTML = message;
    const okBtn = document.getElementById('confirmModalOkBtn');
    okBtn.textContent = okText;
    okBtn.className = `btn fw-medium ${t.btnClass}`;
    okBtn.style.cssText = 'border-radius:10px;padding:8px 20px;font-size:14px';
    document.getElementById('confirmModalCancelBtn').textContent = cancelText;
    const modal = getModal('confirmModal');
    const onOk = () => { cleanup(); modal.hide(); resolve(true); };
    const onCancel = () => { cleanup(); modal.hide(); resolve(false); };
    function cleanup() {
      okBtn.removeEventListener('click', onOk);
      document.getElementById('confirmModalCancelBtn').removeEventListener('click', onCancel);
    }
    okBtn.addEventListener('click', onOk);
    document.getElementById('confirmModalCancelBtn').addEventListener('click', onCancel);
    modal.show();
  });
}

function showPromptConfirm(title, placeholder = '', type = 'primary') {
  return new Promise(resolve => {
    const typeMap = {
      danger:  { iconBg: '#fee2e2', iconColor: '#ef4444', icon: 'bi-exclamation-triangle-fill', btnClass: 'btn-danger' },
      warning: { iconBg: '#fef3c7', iconColor: '#f59e0b', icon: 'bi-pencil-fill', btnClass: 'btn-warning text-dark' },
      primary: { iconBg: '#dbeafe', iconColor: '#3b82f6', icon: 'bi-pencil-fill', btnClass: 'btn-primary' },
    };
    const t = typeMap[type] || typeMap.primary;
    document.getElementById('confirmModalIcon').style.background = t.iconBg;
    document.getElementById('confirmModalIcon').innerHTML = `<i class="bi ${t.icon}" style="color:${t.iconColor}"></i>`;
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalSubtitle').textContent = '';
    document.getElementById('confirmModalMessage').innerHTML =
      `<input type="text" id="promptConfirmInput" class="form-control mt-1" placeholder="${placeholder}" style="border-radius:8px;font-size:14px">`;
    const okBtn = document.getElementById('confirmModalOkBtn');
    okBtn.textContent = 'OK';
    okBtn.className = `btn fw-medium ${t.btnClass}`;
    okBtn.style.cssText = 'border-radius:10px;padding:8px 20px;font-size:14px';
    document.getElementById('confirmModalCancelBtn').textContent = 'Batal';
    const modalEl = document.getElementById('confirmModal');
    const modal = getModal('confirmModal');
    const onOk = () => {
      const val = (document.getElementById('promptConfirmInput').value || '').trim();
      cleanup(); modal.hide(); resolve(val || null);
    };
    const onCancel = () => { cleanup(); modal.hide(); resolve(null); };
    function cleanup() {
      okBtn.removeEventListener('click', onOk);
      document.getElementById('confirmModalCancelBtn').removeEventListener('click', onCancel);
    }
    okBtn.addEventListener('click', onOk);
    document.getElementById('confirmModalCancelBtn').addEventListener('click', onCancel);
    if (modalEl.classList.contains('show')) {
      modalEl.addEventListener('hidden.bs.modal', function handler() {
        modalEl.removeEventListener('hidden.bs.modal', handler);
        modal.show();
        setTimeout(() => { const el = document.getElementById('promptConfirmInput'); if (el) el.focus(); }, 300);
      });
      modal.hide();
    } else {
      modal.show();
      setTimeout(() => { const el = document.getElementById('promptConfirmInput'); if (el) el.focus(); }, 300);
    }
  });
}

function getModal(id) {
  if (!App.modals[id]) {
    App.modals[id] = new bootstrap.Modal(document.getElementById(id));
  }
  const modalEl = document.getElementById(id);
  if (window.innerWidth < 768) {
    const dlg = modalEl.querySelector('.modal-dialog');
    if (dlg) {
      dlg.classList.add('modal-fullscreen-sm-down');
    }
  }
  return App.modals[id];
}

// ============================================================
// MOBILE DETECTION & CARD RENDERER
// ============================================================
function isMobile() { return window.innerWidth < 768; }
let __mobileState = isMobile();

let __resizeTimer = null;

window.addEventListener('resize', () => {

  clearTimeout(__resizeTimer);

  __resizeTimer = setTimeout(() => {

    const now = isMobile();

    if (now === __mobileState) return;

    __mobileState = now;

    if (App.currentPage) {
      loadPageData(App.currentPage);
    }

  }, 200);

});

window.addEventListener('orientationchange', () => {

  setTimeout(() => {

    if (App.currentPage) {
      loadPageData(App.currentPage);
    }

  }, 250);

});

// Render container sebagai card list (mobile) atau biarkan table (desktop)
// containerId = id dari <tbody> ATAU wrapper <div>
// items = array data
// cardFn = function(item) => HTML string satu card
// emptyHtml = string HTML saat kosong
// colCount = jumlah kolom table (untuk empty state di desktop)
function renderListOrCards(containerId, items, cardFn, emptyHtml, colCount) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!items || !items.length) {
    if (isMobile() && el.tagName === 'TBODY') {
      // Mobile empty state: sembunyikan table, tampilkan pesan di card container
      const target = _getOrCreateCardContainer(el);
      target.innerHTML = `<div class="text-center text-muted py-4"><i class="bi bi-inbox d-block fs-2 mb-2"></i>${emptyHtml}</div>`;
    } else {
      _restoreTableFromCardContainer(el);
      const isTbody = el.tagName === 'TBODY';
      el.innerHTML = isTbody
        ? `<tr><td colspan="${colCount||9}" class="text-center text-muted py-4">${emptyHtml}</td></tr>`
        : `<div class="text-center text-muted py-4">${emptyHtml}</div>`;
    }
    return;
  }

  if (isMobile()) {
    const target = el.tagName === 'TBODY' ? _getOrCreateCardContainer(el) : el;
    target.innerHTML = `<div class="mobile-card-list">${items.map(cardFn).join('')}</div>`;
  } else {
    _restoreTableFromCardContainer(el);
    el.innerHTML = items.map(cardFn).join('');
  }
}

function _getOrCreateCardContainer(tbody) {
  const table = tbody.closest('table');
  if (!table) return tbody;
  const wrapper = table.closest('.table-responsive');
  if (!wrapper) return tbody;
  // Sembunyikan table, buat/tampilkan card container di sebelahnya
  table.style.display = 'none';
  let cardDiv = wrapper.parentElement.querySelector('.mobile-card-container');
  if (!cardDiv) {
    cardDiv = document.createElement('div');
    cardDiv.className = 'mobile-card-container';
    wrapper.parentElement.insertBefore(cardDiv, wrapper.nextSibling);
  }
  cardDiv.style.display = '';
  return cardDiv;
}

function _restoreTableFromCardContainer(tbody) {
  const table = tbody.closest('table');
  if (!table) return;
  table.style.display = '';
  const wrapper = table.closest('.table-responsive');
  if (!wrapper) return;
  const cardDiv = wrapper.parentElement.querySelector('.mobile-card-container');
  if (cardDiv) cardDiv.style.display = 'none';
}

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ============================================================
// NAVIGATION
// ============================================================
// SESUDAH (tambahkan blok ini tepat setelah pageEl.classList.add('active'))
function navigate(page) {
  App.currentPage = page;
  
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#sidebar .nav-link').forEach(l => l.classList.remove('active'));
  
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  // TAMBAHAN: highlight ulang nav-link yang aktif + buka submenu induknya bila perlu
  document.querySelectorAll('#sidebar .nav-link').forEach(l => {
    const m = (l.getAttribute('onclick') || '').match(/navigate\('([^']+)'\)/);
    if (m && m[1] === page) {
      l.classList.add('active');
      const submenu = l.closest('.collapse.submenu');
      if (submenu && !submenu.classList.contains('show')) {
        submenu.classList.add('show');
        const toggle = document.querySelector(`.collapse-toggle[data-bs-target="#${submenu.id}"]`);
        if (toggle) toggle.classList.remove('collapsed');
      }
    }
  });
  
  const titleMap = {
    'dashboard': 'Dasbor',
    'doc-register': 'Registrasi Dokumen',
    'new-document': 'Registrasi Dokumen 2',
    'new-document-standard': 'Registrasi Dokumen 1',
    'review': 'Review Dokumen',
    'approval': 'Persetujuan Dokumen',
    'change-request': 'Permintaan Perubahan',
    'revision': 'Manajemen Revisi',
    'distribution': 'Daftar Distribusi',
    'read-ack': 'Konfirmasi Compliance',
    'mon-pending-review': 'Menunggu Review',
    'mon-pending-approval': 'Menunggu Persetujuan',
    'mon-near-expired': 'Dokumen Mendekati Kedaluwarsa',
    'mon-obsolete': 'Dokumen Usang',
    'mon-read-compliance': 'Kepatuhan Compliance',
    'rpt-master-list': 'Daftar Master Dokumen',
    'rpt-revision': 'Laporan Riwayat Revisi',
    'rpt-distribution': 'Laporan Distribusi',
    'rpt-obsolete': 'Laporan Dokumen Usang',
    'rpt-read-compliance': 'Laporan Kepatuhan Compliance',
    'master-category': 'Kategori Dokumen',
    'master-department': 'Departemen',
    'master-area': 'Area',
    'master-circlegroup': 'Circle Group',
    'master-distgroup': 'Distribution Group',
    'master-retention': 'Periode Retensi',
    'master-revreason': 'Alasan Revisi',
    'admin-users': 'Manajemen Pengguna',
    'admin-roles': 'Peran & Hak Akses',
    'admin-email': 'Pengaturan Notifikasi Email',
    'admin-login-settings': 'Pengaturan Login',
    'admin-sessions': 'Sesi Aktif',
    'data-import': 'Import Data (Migrasi)',
    'audit-trail': 'Jejak Audit'
};
  
  document.getElementById('page-title').textContent = titleMap[page] || page;
  
  // Close sidebar on mobile
  if (window.innerWidth < 768) {
      toggleSidebar(false);
    }

    loadPageData(page);
    var mainEl = document.getElementById('main');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function loadPageData(page) {
  switch(page) {
    case 'dashboard': loadDashboard(); break;
    case 'doc-register': loadDocRegister(); break;
    case 'new-document': loadNewDocs('nonstandard'); break;
    case 'new-document-standard': loadNewDocs('standard'); break;
    case 'review': loadReview(); break;
    case 'approval': loadApproval(); break;
    case 'change-request': loadChangeRequest(); break;
    case 'revision': loadRevisions(); break;
    case 'distribution': loadDistributionPage(); break;
    case 'read-ack': loadReadAck(); break;
    case 'mon-pending-review': loadMonPendingReview(); break;
    case 'mon-pending-approval': loadMonPendingApproval(); break;
    case 'mon-near-expired': loadMonNearExpired(); break;
    case 'mon-obsolete': loadMonObsolete(); break;
    case 'mon-read-compliance': loadMonReadCompliance(); break;
    case 'rpt-master-list': loadRptMasterList(); break;
    case 'rpt-revision': loadRptRevision(); break;
    case 'rpt-distribution': loadRptDistribution(); break;
    case 'rpt-obsolete': loadRptObsolete(); break;
    case 'rpt-read-compliance': loadRptReadCompliance(); break;
    case 'master-category': loadMaster('category'); break;
    case 'master-department': loadMaster('department'); break;
    case 'master-area': loadMaster('area'); break;
    case 'master-circlegroup': loadMaster('circle_group'); break;  // ← BARU
    case 'master-distgroup': loadMaster('distribution_group'); break;
    case 'master-retention': loadMaster('retention'); break;
    case 'master-revreason': loadMaster('revision_reason'); break;
    case 'admin-users': loadUsers(); break;
    case 'admin-roles': break;
    case 'admin-email': loadEmailSettings(); loadNotificationLog(); break;
    case 'admin-login-settings': loadLoginSettingsPage(); break;
    case 'admin-sessions': loadActiveSessions(); break;
    case 'data-import': break;
    case 'audit-trail': loadAuditTrail(); break;
  }
}

// ============================================================
// TAMBAH: Function untuk filter circle groups berdasarkan department
// ============================================================
async function filterCircleGroupsByDepartment(deptCode, selectedCG) {
  const cgSel = document.getElementById('doc-circle-group');
  if (!cgSel) return;
  
  const dept = (App.data.departments || []).find(d => d.code === deptCode);
  
  if (!dept || !dept.circle_groups || dept.circle_groups.trim() === '') {
    cgSel.innerHTML = '<option value="">Tidak ada circle group untuk department ini</option>';
    return;
  }
  
  const cgCodes = dept.circle_groups
    .split(',')
    .map(c => c.trim())
    .filter(c => c);
  
  if (cgCodes.length === 0) {
    cgSel.innerHTML = '<option value="">Tidak ada circle group</option>';
    return;
  }
  
  const availableCG = (App.data.circleGroups || []).filter(cg => 
    cgCodes.includes(cg.code)
  );
  
  cgSel.innerHTML = '<option value="">Pilih Circle Group...</option>' +
    availableCG.map(cg => `<option value="${cg.code}" ${cg.code === selectedCG ? 'selected' : ''}>${cg.name} (${cg.code})</option>`).join('');
}

async function loadReviewApprovalCandidates(selR2, selR3, selApprover) {
  try {
    document.getElementById('doc-reviewer2').innerHTML = '<option value="">-- Memuat... --</option>';
    document.getElementById('doc-reviewer3').innerHTML = '<option value="">-- Memuat... --</option>';
    document.getElementById('doc-approver').innerHTML = '<option value="">-- Memuat... --</option>';

    const res = await gasCall('apiGetReviewApprovalCandidates');

    const makeOptions = (users, selected, emptyLabel) => {
      if (!users || !users.length) return `<option value="">${emptyLabel}</option>`;
      return '<option value="">-- Pilih --</option>' +
        users.map(u => `<option value="${u.email}" ${u.email === selected ? 'selected' : ''}>${u.name} &lt;${u.email}&gt;</option>`).join('');
    };

    document.getElementById('doc-reviewer2').innerHTML = makeOptions(res.reviewer2, selR2 || '', 'Tidak ada user role DOCUMENT_CONTROL');
    document.getElementById('doc-reviewer3').innerHTML = makeOptions(res.reviewer3, selR3 || '', 'Tidak ada user role DOCUMENT_CONTROL_HEAD');
    document.getElementById('doc-approver').innerHTML = makeOptions(res.approvers, selApprover || '', 'Tidak ada user role FSTL');
    document.getElementById('doc-reviewer2').disabled = false;
    document.getElementById('doc-reviewer3').disabled = false;
    document.getElementById('doc-approver').disabled = false;
  } catch(e) {
    console.error('loadReviewApprovalCandidates error:', e);
    document.getElementById('doc-reviewer2').innerHTML = '<option value="">Error memuat data</option>';
    document.getElementById('doc-reviewer3').innerHTML = '<option value="">Error memuat data</option>';
    document.getElementById('doc-approver').innerHTML = '<option value="">Error memuat data</option>';
  }
}

function fillReviewer1Display(deptCode) {
  const dept = (App.data.departments || []).find(d => d.code === deptCode);
  document.getElementById('doc-reviewer1').value = dept ? (dept.reviewer1_email || '(belum diset di Department)') : '';
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  showLoader();
  try {
    const res = await gasCall('apiGetDashboardData');
    if (res && res.error) { toast(res.error, 'error'); return; }
    const d = res.data;

    document.getElementById('stat-total').textContent = d.cards.totalDocs;
    document.getElementById('stat-active').textContent = d.cards.activeDocs;
    document.getElementById('stat-review').textContent = d.cards.pendingReview;
    document.getElementById('stat-approval').textContent = d.cards.pendingApproval;
    document.getElementById('stat-expired').textContent = d.cards.nearExpired;
    document.getElementById('stat-obsolete').textContent = d.cards.obsoleteDocs;
    document.getElementById('stat-compliance').textContent = d.cards.readCompliance + '%';
    requestAnimationFrame(() => {
      renderBarChart('chart-dept', d.charts.byDept);
      renderBarChart('chart-cat', d.charts.byCat);
      renderTimeline('timeline-activity', d.recentActivity);
      renderExpiringDocs('dash-expiring', d.expiringDocs || []);
      renderComplianceByDept('dash-compliance-dept', d.complianceByDept || []);
      renderTopRead('dash-top-read', d.topRead || []);
      renderOldDrafts('dash-old-drafts', d.draftDocs || []);
    });
    // Load trend chart
    loadTrendChart();
  } catch(e) { toast('Gagal memuat dasbor: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

function renderBarChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!data || !Object.keys(data).length) { container.innerHTML = '<p class="text-muted text-center py-3">No data</p>'; return; }
  
  const max = Math.max(...Object.values(data));
  let html = '<div class="chart-bar-container">';
  
  Object.entries(data).sort((a,b) => b[1]-a[1]).forEach(([key, val]) => {
    const pct = max > 0 ? (val/max)*100 : 0;
    html += `<div class="chart-bar-item">
      <div class="chart-bar-label" title="${key}">${key||'Unknown'}</div>
      <div class="chart-bar-wrap"><div class="chart-bar-fill" style="width:${pct}%"></div></div>
      <div class="chart-bar-val">${val}</div>
    </div>`;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

function renderTimeline(containerId, history) {
  const container = document.getElementById(containerId);
  if (!history || !history.length) { container.innerHTML = '<p class="text-muted">No recent activity</p>'; return; }
  
  const actionColors = {
    'CREATE': 'var(--success)', 'APPROVED': 'var(--success)', 'REVIEW_APPROVED': 'var(--success)',
    'DELETE': 'var(--danger)', 'REJECTED': 'var(--danger)', 'REVIEW_REJECTED': 'var(--danger)',
    'UPDATE': 'var(--accent)', 'REVISION': 'var(--accent2)', 'OBSOLETE': 'var(--text-muted)'
  };
  
  let html = '';
  history.forEach(item => {
    const color = actionColors[item.action] || 'var(--accent)';
    html += `<div class="timeline-item">
      <div class="timeline-date">${fmtDateTime(item.performed_at)} &middot; ${item.performed_by||'System'}</div>
      <div class="timeline-content">
        <span class="badge" style="background:${color};color:#fff;margin-right:6px">${item.action||''}</span>
        ${item.notes||''}
        ${item.new_value ? `<span class="ms-1 text-muted">&rarr; ${item.new_value}</span>` : ''}
      </div>
    </div>`;
  });
  
  container.innerHTML = html;
}

function renderExpiringDocs(containerId, list) {
  const el = document.getElementById(containerId);
  if (!list.length) { el.innerHTML = '<p class="text-muted text-center py-3" style="font-size:13px">Tidak ada dokumen yang akan expired</p>'; return; }
  el.innerHTML = list.map(d => {
    const color = d.daysLeft <= 30 ? 'var(--danger)' : d.daysLeft <= 60 ? 'var(--warning)' : 'var(--success)';
    const bg    = d.daysLeft <= 30 ? '#fef2f2'      : d.daysLeft <= 60 ? '#fffbeb'       : '#f0fdf4';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border)">
      <div style="min-width:48px;height:48px;background:${bg};border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <span style="font-size:16px;font-weight:800;color:${color};line-height:1">${d.daysLeft}</span>
        <span style="font-size:9px;color:${color}">hari</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.title}</div>
        <div style="font-size:11px;color:var(--text-muted)">${d.doc_number} &middot; Exp: ${fmtDate(d.expiry_date)}</div>
      </div>
    </div>`;
  }).join('');
}

function renderComplianceByDept(containerId, list) {
  const el = document.getElementById(containerId);
  if (!list.length) { el.innerHTML = '<p class="text-muted text-center py-3" style="font-size:13px">Belum ada data distribusi</p>'; return; }
  el.innerHTML = list.map(d => {
    const color = d.pct >= 80 ? 'var(--success)' : d.pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    return `<div style="padding:8px 16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:13px;font-weight:600">${d.dept}</span>
        <span style="font-size:12px;font-weight:700;color:${color}">${d.pct}%</span>
      </div>
      <div style="height:6px;background:#e5e7eb;border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${d.pct}%;background:${color};border-radius:99px;transition:width .6s ease"></div>
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${d.read} / ${d.required} acknowledged</div>
    </div>`;
  }).join('');
}

function renderTopRead(containerId, list) {
  const el = document.getElementById(containerId);
  if (!list.length) { el.innerHTML = '<p class="text-muted text-center py-3" style="font-size:13px">Belum ada aktivitas pembacaan</p>'; return; }
  const max = list[0].count || 1;
  el.innerHTML = list.map((d, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border)">
      <div style="min-width:24px;font-size:14px;font-weight:800;color:var(--text-muted);text-align:center">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.title}</div>
        <div style="height:4px;background:#e5e7eb;border-radius:99px;margin-top:4px;overflow:hidden">
          <div style="height:100%;width:${Math.round((d.count/max)*100)}%;background:var(--accent);border-radius:99px"></div>
        </div>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--accent)">${d.count}×</div>
    </div>`).join('');
}

function renderOldDrafts(containerId, list) {
  const el = document.getElementById(containerId);
  if (!list.length) { el.innerHTML = '<p class="text-muted text-center py-3" style="font-size:13px">Tidak ada draft tertunda</p>'; return; }
  el.innerHTML = list.map(d => {
    const color = d.ageDays > 30 ? 'var(--danger)' : d.ageDays > 14 ? 'var(--warning)' : 'var(--text-muted)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border)">
      <div style="min-width:44px;height:44px;background:#f3f4f6;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <span style="font-size:14px;font-weight:800;color:${color};line-height:1">${d.ageDays}</span>
        <span style="font-size:9px;color:${color}">hari</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.title}</div>
        <div style="font-size:11px;color:var(--text-muted)">${d.doc_number} &middot; ${d.owner_email}</div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// DOCUMENT REGISTER
// ============================================================


function renderDocsTable(tbodyId, docs, showActions) {
  const rowFn = doc => {
    const actions = `
      <button class="btn btn-xs btn-outline-primary" style="font-size:11px;padding:2px 8px" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye"></i></button>
      ${doc.status === 'Draft' || doc.status === 'Rejected' ? `<button class="btn btn-xs btn-outline-secondary" style="font-size:11px;padding:2px 8px" onclick="openDocModal('${doc.id}')"><i class="bi bi-pencil"></i></button>` : ''}
      ${doc.status === 'Draft' || doc.status === 'Rejected' ? `<button class="btn btn-xs btn-outline-warning" style="font-size:11px;padding:2px 8px" onclick="submitForReview('${doc.id}')"><i class="bi bi-send"></i></button>` : ''}
      ${doc.status === DOC_STATUS.CR_APPROVED ? `<button class="btn btn-xs btn-outline-info" style="font-size:11px;padding:2px 8px" onclick="openRevisionModal('${doc.id}')"><i class="bi bi-arrow-clockwise"></i></button>` : ''}
      ${doc.status !== 'Obsolete' ? `<button class="btn btn-xs btn-outline-danger" style="font-size:11px;padding:2px 8px" onclick="obsoleteDoc('${doc.id}')"><i class="bi bi-archive"></i></button>` : ''}`;

    if (isMobile()) return `
      <div class="mobile-card">
        <div class="mobile-card-header">
          <div>
            <span class="doc-number">${doc.doc_number||'-'}</span>
            <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
          </div>
          ${statusBadge(doc.status)}
        </div>
        <div class="mobile-card-meta">
          <span><i class="bi bi-tag"></i>${doc.category||'-'}</span>
          <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
          <span><i class="bi bi-calendar"></i>${fmtDate(doc.effective_date)}</span>
        </div>
        <div class="mobile-card-actions">${actions}</div>
      </div>`;

    return `<tr>
      <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
      <td><a href="#" onclick="showDocDetail('${doc.id}')">${doc.title||'-'}</a></td>
      <td>${doc.category||'-'}</td>
      <td>${doc.department||'-'}</td>
      <td><span class="badge bg-secondary">${doc.revision||'Rev00'}</span></td>
      <td>${statusBadge(doc.status)}</td>
      <td><small>${doc.owner_email||'-'}</small></td>
      <td>${fmtDate(doc.effective_date)}</td>
      <td><div class="d-flex gap-1 flex-wrap">${actions}</div></td>
    </tr>`;
  };
  renderListOrCards(tbodyId, docs, rowFn, 'No documents found', 9);
}

function populateFilterDropdowns() {
  const statuses = [...new Set(App.data.docs.map(d => d.status).filter(Boolean))];
  const depts = [...new Set(App.data.docs.map(d => d.department).filter(Boolean))];
  const cats = [...new Set(App.data.docs.map(d => d.category).filter(Boolean))];
  
  const statusSel = document.getElementById('filter-status');
  const deptSel = document.getElementById('filter-dept');
  const catSel = document.getElementById('filter-cat');
  
  const addOpts = (sel, items, cur) => {
    const val = sel.value;
    sel.innerHTML = `<option value="${cur}">${cur||'All'}</option>` + items.map(i => `<option value="${i}">${i}</option>`).join('');
    sel.value = val;
  };
  
  addOpts(statusSel, statuses, 'Semua Status');
  addOpts(deptSel, depts, 'Semua Departemen');
  addOpts(catSel, cats, 'Semua Kategori');
}

function filterDocs() {
  const search = document.getElementById('filter-search').value.toLowerCase();
  const status = document.getElementById('filter-status').value;
  const dept = document.getElementById('filter-dept').value;
  const cat = document.getElementById('filter-cat').value;
  
  let filtered = App.data.docs.filter(d => {
    if (status && d.status !== status) return false;
    if (dept && d.department !== dept) return false;
    if (cat && d.category !== cat) return false;
    if (search) {
      return (d.doc_number||'').toLowerCase().includes(search) ||
             (d.title||'').toLowerCase().includes(search) ||
             (d.description||'').toLowerCase().includes(search);
    }
    return true;
  });
  
  renderDocsTableFull('docs-tbody', filtered);
}

// ============================================================
// NEW DOCUMENT
// ============================================================
async function loadNewDocs(mode) {
  mode = mode || 'nonstandard';
  const targetTbodyId = mode === 'standard' ? 'new-docs-standard-tbody' : 'new-docs-tbody';
  showLoader();
  try {
    const [docsRes, catRes] = await Promise.all([
      gasCall('apiGetDocuments', {}),
      (App.data.categories && App.data.categories.length) ? Promise.resolve({data: App.data.categories}) : gasCall('apiGetMasterData', 'category')
    ]);
    if (docsRes && docsRes.error) {
      toast(docsRes.error, 'error');
      hideLoader();
      return;
    }
    
    App.data.docs = docsRes.data || [];
    if (catRes && catRes.data) App.data.categories = catRes.data;

    const standardCodes = (App.data.categories || []).filter(c => c.form_type === 'standard').map(c => c.code);
    
    // Filter dokumen Draft/Rejected milik user atau yang dibuat user, sesuai tipe kategori
    const myDocs = App.data.docs.filter(d =>
      (d.created_by === App.user.email || d.owner_email === App.user.email) &&
      (d.status === DOC_STATUS.DRAFT || d.status === DOC_STATUS.REJECTED) &&
      (mode === 'standard' ? standardCodes.includes(d.category) : !standardCodes.includes(d.category))
    );
    
    const tbody = document.getElementById(targetTbodyId);
    
    if (!myDocs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-file-earmark-plus d-block fs-2 mb-2"></i>Tidak ada dokumen draft</td></tr>';
      hideLoader();
      return;
    }
    
    const newDocRowFn = doc => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div><span class="doc-number text-primary" style="font-size:12px">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
            ${statusBadge(doc.status)}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-tag"></i>${doc.category||'-'}</span>
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-calendar3"></i>${fmtDate(doc.created_at)}</span>
          </div>
          <div class="mobile-card-actions">
            <button class="btn btn-outline-primary btn-sm" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye me-1"></i>Detail</button>
            <button class="btn btn-outline-secondary btn-sm" onclick="openDocModal('${doc.id}')"><i class="bi bi-pencil me-1"></i>Edit</button>
            <button class="btn btn-success btn-sm" onclick="submitForReview('${doc.id}')"><i class="bi bi-send me-1"></i>Submit</button>
          </div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td><a href="#" onclick="showDocDetail('${doc.id}')" class="text-decoration-none fw-semibold" style="color:var(--primary)">${doc.title||'-'}</a></td>
        <td>${doc.category||'-'}</td>
        <td>${doc.department||'-'}</td>
        <td>${statusBadge(doc.status)}</td>
        <td><small>${fmtDate(doc.created_at)}</small></td>
        <td>
          <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-outline-primary" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye"></i> View</button>
            <button class="btn btn-outline-secondary" onclick="openDocModal('${doc.id}')"><i class="bi bi-pencil"></i> Edit</button>
            <button class="btn btn-success" onclick="submitForReview('${doc.id}')"><i class="bi bi-send"></i> Submit</button>
          </div>
        </td>
      </tr>`;
    };
    renderListOrCards(targetTbodyId, myDocs, newDocRowFn, '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-file-earmark-plus d-block fs-2 mb-2"></i>Tidak ada dokumen draft</td></tr>', 7);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

// ============================================================
// DOCUMENT MODAL
// ============================================================
async function openDocModal(docId, mode) {
  App.docModalMode = mode || 'nonstandard';
  await loadMasterDropdowns(App.docModalMode);
  
  const modal = getModal('docModal');

  // --- Reset semua field ---
  document.getElementById('doc-id').value = '';
  document.getElementById('doc-title').value = '';
  document.getElementById('doc-category').value = '';
  document.getElementById('doc-department').value = '';
  document.getElementById('doc-area').innerHTML = '<option value="">Select...</option>';
  document.getElementById('doc-circle-group').innerHTML = '<option value="">Select Circle Group...</option>';
  document.getElementById('doc-type').value = 'Controlled';
  document.getElementById('doc-retention').value = '';
  document.getElementById('doc-owner').value = App.user.email;
  document.getElementById('doc-reviewer1').value = '';
  document.getElementById('doc-reviewer2').innerHTML = '<option value="">-- Memuat... --</option>';
  document.getElementById('doc-reviewer3').innerHTML = '<option value="">-- Memuat... --</option>';
  document.getElementById('doc-approver').innerHTML = '<option value="">-- Memuat... --</option>';
  document.getElementById('doc-description').value = '';
  document.getElementById('doc-keywords').value = '';
  document.getElementById('doc-file-url').value = '';
  docFileQueue = [];
  renderFileList();
  document.getElementById('doc-upload-progress').style.display = 'none';
  document.getElementById('doc-modal-title').textContent = 'New Document';
  document.getElementById('doc-custom-fields-container').innerHTML = '';
  document.getElementById('doc-custom-fields-wrapper').style.display = 'none';

  // Auto-set department dari user login (readonly)
  const userDept = App.user.department || '';
  const userCG   = App.user.circle_group || '';
  if (userDept) {
    const deptEl = document.getElementById('doc-department');
    deptEl.value    = userDept;
    deptEl.disabled = true;
    await filterCircleGroupsByDepartment(userDept, userCG);
    fillReviewer1Display(userDept);
    await loadReviewApprovalCandidates('', '', '');
  }
  // Auto-set circle group dari user login (disabled — 1 user 1 CG)
  if (userCG) {
    const cgEl = document.getElementById('doc-circle-group');
    cgEl.value    = userCG;
    cgEl.disabled = true;
    await filterAreaByCG(userCG, '');  // cascade area dari CG
  }
  
  if (docId) {
    // === MODE EDIT ===
    const doc = (App.data.docs || []).find(d => d.id === docId);
    if (doc) {
      // Deteksi otomatis mode form (standar/non-standar) dari kategori dokumen
      const editCat = (App.data.categories || []).find(c => c.code === doc.category);
      App.docModalMode = (editCat && editCat.form_type === 'standard') ? 'standard' : 'nonstandard';
      await loadMasterDropdowns(App.docModalMode);

      document.getElementById('doc-modal-title').textContent = 'Edit Document - ' + doc.doc_number;
      document.getElementById('doc-id').value = doc.id;
      document.getElementById('doc-title').value = doc.title || '';
      document.getElementById('doc-category').value = doc.category || '';
      document.getElementById('doc-type').value = doc.doc_type || 'Controlled';
      if (App.docModalMode === 'standard') {
        await renderDocCustomFields(doc.category, doc.custom_fields);
      }

      // 1) Set department, lalu cascade area & circle group
      document.getElementById('doc-department').value = doc.department || '';
      if (doc.department) {
        await filterCircleGroupsByDepartment(doc.department, doc.circle_group || '');
        if (doc.circle_group) await filterAreaByCG(doc.circle_group, doc.area || '');
      }

      // 2) Set retention (Effective/Expiry Date sudah tidak diinput manual — auto-set saat FSTL approve)
      document.getElementById('doc-retention').value = doc.retention_period || '';

      // 3) Owner email selalu dari user login (readonly)
      document.getElementById('doc-owner').value = App.user.email;

      if (doc.department) {
        fillReviewer1Display(doc.department);
      }
      await loadReviewApprovalCandidates(doc.reviewer2_email || '', doc.reviewer3_email || '', doc.approver_email || '');
      document.getElementById('doc-description').value = doc.description || '';
      document.getElementById('doc-keywords').value = doc.keywords || '';
      // Load existing files ke queue sebagai "done" (sudah terupload)
      docFileQueue = [];
      if (doc.file_url) {
        try {
          const urls   = JSON.parse(doc.file_url);
          const ids    = JSON.parse(doc.file_id   || '[]');
          const names  = JSON.parse(doc.file_name || '[]');
          urls.forEach((url, i) => {
            docFileQueue.push({
              file: { name: names[i] || ('File ' + (i + 1)), size: 0 },
              status: 'done',
              result: { file_url: url, file_id: ids[i] || '', file_name: names[i] || '' }
            });
          });
        } catch(e) {
          // backward compat: single file string
          if (doc.file_url) {
            docFileQueue.push({
              file: { name: doc.file_name || 'existing_file', size: 0 },
              status: 'done',
              result: { file_url: doc.file_url, file_id: doc.file_id || '', file_name: doc.file_name || '' }
            });
          }
        }
        renderFileList();
        syncHiddenFileFields();
      }
    }
  }
  
  modal.show();
}


async function loadMasterDropdowns(mode) {
  try {
    const [catRes, deptRes, areaRes, retRes] = await Promise.all([
      gasCall('apiGetMasterData', 'category'),
      gasCall('apiGetMasterData', 'department'),
      gasCall('apiGetMasterData', 'area'),
      gasCall('apiGetMasterData', 'retention')
    ]);
    
    if (catRes.data) {
      App.data.categories = catRes.data;
      const filteredCats = mode === 'standard'
        ? catRes.data.filter(c => c.form_type === 'standard')
        : catRes.data.filter(c => c.form_type !== 'standard');
      fillSelect('doc-category', filteredCats, 'code', 'name');
    }
    if (deptRes.data) {
      App.data.departments = deptRes.data;
      fillSelect('doc-department', deptRes.data, 'code', 'name');
      fillSelect('user-dept', deptRes.data, 'code', 'name');
    }
    if (areaRes.data) {
      // Simpan semua area ke cache, JANGAN langsung fill dropdown
      // Dropdown area akan diisi saat department dipilih (onDepartmentChange)
      App.data.areas = areaRes.data;
    }
    if (retRes.data) {
      App.data.retentions = retRes.data;
      fillSelect('doc-retention', retRes.data, 'name', 'name', true);
    }
  } catch(e) { console.error(e); }
}

function fillSelect(id, data, valKey, labelKey, optional) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = (optional ? '<option value="">Select...</option>' : '') + 
    data.map(d => `<option value="${d[valKey]}">${d[labelKey]}</option>`).join('');
}

async function renderDocCustomFields(categoryCode, existingValuesJson) {
  const wrapper = document.getElementById('doc-custom-fields-wrapper');
  const container = document.getElementById('doc-custom-fields-container');
  container.innerHTML = '';
  App.richBlocks = {}; // reset state editor blok setiap field dirender ulang
  if (App.docModalMode !== 'standard' || !categoryCode) { wrapper.style.display = 'none'; return; }

  const cat = (App.data.categories || []).find(c => c.code === categoryCode);
  if (!cat) { wrapper.style.display = 'none'; return; }

  const res = await gasCall('apiGetCategoryFields', cat.id);
  const fields = (res && res.data) || [];
  if (!fields.length) { wrapper.style.display = 'none'; return; }

  let existingValues = {};
  try { existingValues = existingValuesJson ? JSON.parse(existingValuesJson) : {}; } catch(e) {}

  container.innerHTML = fields.map(f => {
    const val = existingValues[f.field_key] || '';
    const req = (f.is_required == 1 || f.is_required === true) ? '*' : '';
    let inputHtml = '';
    if (f.field_type === 'textarea') {
      inputHtml = `<textarea class="form-control" id="cf-${f.field_key}" rows="2">${val}</textarea>`;
    } else if (f.field_type === 'select') {
      const opts = (f.options || '').split(',').map(o => o.trim()).filter(Boolean);
      inputHtml = `<select class="form-select" id="cf-${f.field_key}">
        <option value="">Select...</option>
        ${opts.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('')}
      </select>`;
    } else if (f.field_type === 'date') {
      inputHtml = `<input type="date" class="form-control" id="cf-${f.field_key}" value="${val}">`;
    } else if (f.field_type === 'number') {
      inputHtml = `<input type="number" class="form-control" id="cf-${f.field_key}" value="${val}">`;
    } else if (f.field_type === 'richtext') {
      inputHtml = renderRichTextEditor_(f.field_key, val);
    } else if (f.field_type === 'table') {
      const cols = (f.options || '').split(',').map(o => o.trim()).filter(Boolean);
      let rows = [];
      try { rows = val ? JSON.parse(val) : []; } catch(e) { rows = []; }
      if (!rows.length) rows = [cols.map(() => '')];
      inputHtml = renderTableFieldEditor_(f.field_key, cols, rows);
    } else {
      inputHtml = `<input type="text" class="form-control" id="cf-${f.field_key}" value="${val}">`;
    }
    const colClass = (f.field_type === 'richtext' || f.field_type === 'table') ? 'col-12' : 'col-md-4';
    return `<div class="${colClass}">
      <label class="form-label">${f.field_label} ${req}</label>
      ${inputHtml}
    </div>`;
  }).join('');

  // Render isi blok RICHTEXT setelah HTML ter-attach ke DOM
  fields.filter(f => f.field_type === 'richtext').forEach(f => rtRenderBlocks(f.field_key));

  wrapper.style.display = '';
}

function renderTableFieldEditor_(key, cols, rows) {
  if (!cols.length) return `<div class="alert alert-warning py-2 px-3 mb-0">Kolom tabel belum diatur. Edit field ini di "Kelola Field" dan isi "Kolom Tabel".</div>`;
  const theadHtml = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '<th style="width:36px"></th></tr>';
  const tbodyHtml = rows.map((r, ri) => '<tr>' + cols.map((c, ci) =>
    `<td><input type="text" class="form-control form-control-sm" value="${(r[ci]||'').toString().replace(/"/g,'&quot;')}" oninput="syncTableField('${key}')"></td>`
  ).join('') + `<td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" onclick="removeTableFieldRow('${key}', ${ri})"><i class="bi bi-trash"></i></button></td></tr>`
  ).join('');
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered align-middle" id="cf-table-${key}">
        <thead class="table-light">${theadHtml}</thead>
        <tbody>${tbodyHtml}</tbody>
      </table>
    </div>
    <button type="button" class="btn btn-sm btn-outline-primary mb-2" onclick="addTableFieldRow('${key}', ${cols.length})"><i class="bi bi-plus"></i> Tambah Baris</button>
    <input type="hidden" id="cf-${key}" value='${JSON.stringify(rows).replace(/'/g, "&#39;")}'>
  `;
}

function addTableFieldRow(key, numCols) {
  const tbody = document.querySelector(`#cf-table-${key} tbody`);
  const tr = document.createElement('tr');
  for (let i = 0; i < numCols; i++) {
    tr.innerHTML += `<td><input type="text" class="form-control form-control-sm" oninput="syncTableField('${key}')"></td>`;
  }
  tr.innerHTML += `<td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" onclick="this.closest('tr').remove(); syncTableField('${key}')"><i class="bi bi-trash"></i></button></td>`;
  tbody.appendChild(tr);
  syncTableField(key);
}

function removeTableFieldRow(key, idx) {
  const tbody = document.querySelector(`#cf-table-${key} tbody`);
  if (tbody.rows.length > 1) tbody.deleteRow(idx);
  else { Array.from(tbody.querySelectorAll('input')).forEach(inp => inp.value = ''); }
  syncTableField(key);
}

function syncTableField(key) {
  const rows = [];
  document.querySelectorAll(`#cf-table-${key} tbody tr`).forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('input')).map(inp => inp.value);
    rows.push(cells);
  });
  document.getElementById(`cf-${key}`).value = JSON.stringify(rows);
}

// ============================================================
// RICH TEXT FIELD (editor blok): Paragraf, Gambar (multi), Tabel
// ============================================================
let rtBlockSeq = 0;

function parseRichBlocksClient_(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(b => ({ ...b, _uid: b._uid || ('b' + (++rtBlockSeq)) }));
  } catch (e) { /* data lama (string biasa) */ }
  return [{ type: 'text', content: String(raw), _uid: 'b' + (++rtBlockSeq) }];
}

function renderRichTextEditor_(key, existingVal) {
  App.richBlocks = App.richBlocks || {};
  if (!App.richBlocks[key]) {
    App.richBlocks[key] = parseRichBlocksClient_(existingVal);
  }
  return `
    <div class="rt-editor" id="rt-editor-${key}">
      <div class="btn-toolbar gap-1 mb-2">
        <button type="button" class="btn btn-sm btn-outline-primary" onclick="rtAddBlock('${key}','text')"><i class="bi bi-text-paragraph"></i> Paragraf</button>
        <button type="button" class="btn btn-sm btn-outline-primary" onclick="rtTriggerImagePicker('${key}')"><i class="bi bi-image"></i> Gambar</button>
        <button type="button" class="btn btn-sm btn-outline-primary" onclick="rtAddBlock('${key}','table')"><i class="bi bi-table"></i> Tabel</button>
        <input type="file" id="rt-filepicker-${key}" accept="image/*" multiple style="display:none" onchange="rtHandleImageFiles('${key}', this.files)">
      </div>
      <div id="rt-blocks-${key}"></div>
      <input type="hidden" id="cf-${key}">
    </div>`;
}

function rtRenderBlocks(key) {
  const container = document.getElementById(`rt-blocks-${key}`);
  if (!container) return;
  const blocks = App.richBlocks[key] || [];
  container.innerHTML = blocks.map((b, idx) => rtRenderBlock_(key, b, idx, blocks.length)).join('')
    || '<div class="text-muted small mb-2">Belum ada konten. Tambahkan Paragraf, Gambar, atau Tabel di atas.</div>';
  rtSync(key);
}

function rtRenderBlock_(key, block, idx, total) {
  const moveButtons = `
    <button type="button" class="btn btn-sm btn-light" title="Naik" ${idx === 0 ? 'disabled' : ''} onclick="rtMoveBlock('${key}',${idx},-1)"><i class="bi bi-arrow-up"></i></button>
    <button type="button" class="btn btn-sm btn-light" title="Turun" ${idx === total - 1 ? 'disabled' : ''} onclick="rtMoveBlock('${key}',${idx},1)"><i class="bi bi-arrow-down"></i></button>
    <button type="button" class="btn btn-sm btn-outline-danger" title="Hapus" onclick="rtRemoveBlock('${key}',${idx})"><i class="bi bi-trash"></i></button>`;

  if (block.type === 'image') {
    const items = block.items || [];
    const grid = items.map((img, ii) => `
      <div class="rt-image-thumb">
        <img src="${driveThumbUrl_(img.file_id)}" alt="${img.file_name || ''}">
        <button type="button" class="rt-img-remove" title="Hapus gambar" onclick="rtRemoveImage('${key}',${idx},${ii})"><i class="bi bi-x"></i></button>
        <input type="text" class="form-control form-control-sm mt-1" placeholder="Keterangan gambar (opsional)"
          value="${(img.caption || '').replace(/"/g,'&quot;')}" oninput="rtUpdateCaption('${key}',${idx},${ii},this.value)">
      </div>`).join('');
    return `
      <div class="rt-block">
        <div class="rt-block-header"><span><i class="bi bi-image"></i> Gambar (${items.length})</span><div class="d-flex gap-1">${moveButtons}</div></div>
        <div class="rt-image-grid">${grid || '<span class="text-muted small">Belum ada gambar</span>'}</div>
        <button type="button" class="btn btn-sm btn-outline-secondary mt-2" onclick="rtTriggerImagePicker('${key}', ${idx})"><i class="bi bi-plus"></i> Tambah Gambar ke Blok Ini</button>
      </div>`;
  }

  if (block.type === 'table') {
    const cols = block.cols && block.cols.length ? block.cols : ['Kolom 1', 'Kolom 2'];
    const rows = block.rows && block.rows.length ? block.rows : [cols.map(() => '')];
    const theadHtml = cols.map((c, ci) => `<th>
        <input type="text" class="form-control form-control-sm fw-bold" value="${(c||'').replace(/"/g,'&quot;')}"
          oninput="rtTableRenameCol('${key}',${idx},${ci},this.value)">
      </th>`).join('') + `<th style="width:70px"></th>`;
    const tbodyHtml = rows.map((r, ri) => '<tr>' + cols.map((c, ci) => `<td>
        <input type="text" class="form-control form-control-sm" value="${(r[ci]||'').toString().replace(/"/g,'&quot;')}"
          oninput="rtTableCellInput('${key}',${idx},${ri},${ci},this.value)">
      </td>`).join('') + `<td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" onclick="rtTableRemoveRow('${key}',${idx},${ri})"><i class="bi bi-trash"></i></button></td></tr>`).join('');
    return `
      <div class="rt-block">
        <div class="rt-block-header"><span><i class="bi bi-table"></i> Tabel</span><div class="d-flex gap-1">${moveButtons}</div></div>
        <div class="table-responsive">
          <table class="table table-sm table-bordered align-middle mb-2">
            <thead class="table-light"><tr>${theadHtml}</tr></thead>
            <tbody>${tbodyHtml}</tbody>
          </table>
        </div>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-outline-primary" onclick="rtTableAddRow('${key}',${idx})"><i class="bi bi-plus"></i> Baris</button>
          <button type="button" class="btn btn-sm btn-outline-primary" onclick="rtTableAddCol('${key}',${idx})"><i class="bi bi-plus"></i> Kolom</button>
          ${cols.length > 1 ? `<button type="button" class="btn btn-sm btn-outline-danger" onclick="rtTableRemoveCol('${key}',${idx})"><i class="bi bi-dash"></i> Kolom Terakhir</button>` : ''}
        </div>
      </div>`;
  }

  return `
    <div class="rt-block">
      <div class="rt-block-header"><span><i class="bi bi-text-paragraph"></i> Paragraf</span><div class="d-flex gap-1">${moveButtons}</div></div>
      <div class="btn-group btn-group-sm mb-1" role="group">
        <button type="button" class="btn btn-outline-secondary" onclick="rtInsertPrefix('${key}',${idx},'- ')"><i class="bi bi-list-ul"></i> Bullet</button>
        <button type="button" class="btn btn-outline-secondary" onclick="rtInsertPrefix('${key}',${idx},'### ')"><i class="bi bi-type-bold"></i> Sub Judul</button>
      </div>
      <textarea class="form-control" id="rt-text-${key}-${block._uid}" rows="5" placeholder="Tulis paragraf di sini..."
        oninput="rtUpdateText('${key}',${idx},this.value)">${block.content || ''}</textarea>
    </div>`;
}

function driveThumbUrl_(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w300`;
}

function rtSync(key) {
  const hidden = document.getElementById(`cf-${key}`);
  if (hidden) hidden.value = JSON.stringify((App.richBlocks[key] || []).map(({_uid, ...rest}) => rest));
}

function rtAddBlock(key, type) {
  App.richBlocks[key] = App.richBlocks[key] || [];
  const block = type === 'table'
    ? { type: 'table', cols: ['Kolom 1', 'Kolom 2'], rows: [['', '']], _uid: 'b' + (++rtBlockSeq) }
    : type === 'image'
      ? { type: 'image', items: [], _uid: 'b' + (++rtBlockSeq) }
      : { type: 'text', content: '', _uid: 'b' + (++rtBlockSeq) };
  App.richBlocks[key].push(block);
  rtRenderBlocks(key);
}

function rtRemoveBlock(key, idx) {
  App.richBlocks[key].splice(idx, 1);
  rtRenderBlocks(key);
}

function rtMoveBlock(key, idx, dir) {
  const arr = App.richBlocks[key];
  const target = idx + dir;
  if (target < 0 || target >= arr.length) return;
  [arr[idx], arr[target]] = [arr[target], arr[idx]];
  rtRenderBlocks(key);
}

function rtUpdateText(key, idx, value) {
  App.richBlocks[key][idx].content = value;
  rtSync(key); // tidak render ulang supaya fokus ketik di textarea tidak hilang
}

function rtInsertPrefix(key, idx, prefix) {
  const block = App.richBlocks[key][idx];
  const ta = document.getElementById(`rt-text-${key}-${block._uid}`);
  if (!ta) return;
  const start = ta.selectionStart || 0;
  const before = ta.value.slice(0, start);
  const needsNewline = before.length && !before.endsWith('\n');
  const insertion = (needsNewline ? '\n' : '') + prefix;
  ta.value = before + insertion + ta.value.slice(start);
  const pos = start + insertion.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
  block.content = ta.value;
  rtSync(key);
}

let rtImagePickerTarget = { key: null, blockIdx: null };

function rtTriggerImagePicker(key, blockIdx) {
  rtImagePickerTarget = { key, blockIdx: (blockIdx !== undefined ? blockIdx : null) };
  document.getElementById(`rt-filepicker-${key}`).click();
}

async function rtHandleImageFiles(key, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const MAX_SIZE = 10 * 1024 * 1024;
  let blockIdx = rtImagePickerTarget.blockIdx;

  if (blockIdx === null || blockIdx === undefined) {
    App.richBlocks[key].push({ type: 'image', items: [], _uid: 'b' + (++rtBlockSeq) });
    blockIdx = App.richBlocks[key].length - 1;
  }

  showLoader();
  try {
    for (const file of files) {
      if (file.size > MAX_SIZE) { toast(`Gambar "${file.name}" melebihi batas 10MB`, 'warning'); continue; }
      const base64 = await fileToBase64(file);
      const res = await gasCall('apiUploadFiles', [{ name: file.name, mimeType: file.type || 'image/png', base64 }]);
      if (res && res.success && res.data && res.data[0]) {
        App.richBlocks[key][blockIdx].items.push({ ...res.data[0], caption: '' });
      } else {
        toast(`Gagal upload "${file.name}": ${res?.error || 'Unknown error'}`, 'error');
      }
    }
  } catch (e) {
    toast('Error upload gambar: ' + e.message, 'error');
  } finally {
    hideLoader();
    document.getElementById(`rt-filepicker-${key}`).value = '';
    rtRenderBlocks(key);
  }
}

function rtRemoveImage(key, blockIdx, imgIdx) {
  App.richBlocks[key][blockIdx].items.splice(imgIdx, 1);
  rtRenderBlocks(key);
}

function rtUpdateCaption(key, blockIdx, imgIdx, value) {
  App.richBlocks[key][blockIdx].items[imgIdx].caption = value;
  rtSync(key);
}

function rtTableAddRow(key, blockIdx) {
  const block = App.richBlocks[key][blockIdx];
  block.rows.push(block.cols.map(() => ''));
  rtRenderBlocks(key);
}

function rtTableAddCol(key, blockIdx) {
  const block = App.richBlocks[key][blockIdx];
  block.cols.push('Kolom ' + (block.cols.length + 1));
  block.rows.forEach(r => r.push(''));
  rtRenderBlocks(key);
}

function rtTableRemoveCol(key, blockIdx) {
  const block = App.richBlocks[key][blockIdx];
  if (block.cols.length <= 1) return;
  block.cols.pop();
  block.rows.forEach(r => r.pop());
  rtRenderBlocks(key);
}

function rtTableRemoveRow(key, blockIdx, rowIdx) {
  const block = App.richBlocks[key][blockIdx];
  if (block.rows.length > 1) block.rows.splice(rowIdx, 1);
  else block.rows[0] = block.cols.map(() => '');
  rtRenderBlocks(key);
}

function rtTableCellInput(key, blockIdx, rowIdx, colIdx, value) {
  App.richBlocks[key][blockIdx].rows[rowIdx][colIdx] = value;
  rtSync(key);
}

function rtTableRenameCol(key, blockIdx, colIdx, value) {
  App.richBlocks[key][blockIdx].cols[colIdx] = value;
  rtSync(key);
}

function onDocCategoryChange() {
  const categoryCode = document.getElementById('doc-category').value;
  renderDocCustomFields(categoryCode, null);
}

// ============================================================
// DEPARTMENT → AREA CASCADE
// ============================================================
function onDepartmentChange() {
  const deptCode = document.getElementById('doc-department').value;

  document.getElementById('doc-area').innerHTML = '<option value="">Select...</option>';
  document.getElementById('doc-circle-group').innerHTML = '<option value="">Select Circle Group...</option>';

  if (!deptCode) {
    document.getElementById('doc-reviewer1').value = '';
    return;
  }

  fillReviewer1Display(deptCode);

  if (!App.data || !App.data.areas || App.data.areas.length === 0) {
    console.warn('Area data not loaded yet');
    return;
  }

  filterCircleGroupsByDepartment(deptCode, '');
  document.getElementById('doc-area').innerHTML = '<option value="">Select...</option>';
}

async function filterAreaByCG(cgCode, selectedAreaCode) {
  const areas = (App.data.areas || []).filter(a =>
    a.circle_group === cgCode || !a.circle_group || a.circle_group === ''
  );
  const sel = document.getElementById('doc-area');
  if (areas.length === 0) {
    sel.innerHTML = '<option value="">No area available for this circle group</option>';
    return;
  }
  sel.innerHTML = '<option value="">Select area...</option>' +
    areas.map(a => `<option value="${a.code}" ${a.code === selectedAreaCode ? 'selected' : ''}>${a.name}</option>`).join('');
}

function onCircleGroupChange() {
  const cgCode = document.getElementById('doc-circle-group').value;
  document.getElementById('doc-area').innerHTML = '<option value="">Select...</option>';
  if (cgCode) filterAreaByCG(cgCode, '');
}

// ============================================================
// RETENTION PERIOD → EXPIRY DATE AUTO-CALCULATE
// ============================================================
function onRetentionChange() {
  recalcExpiryDate();
}

function onEffectiveDateChange() {
  recalcExpiryDate();
}

function recalcExpiryDate() {
  const retentionName = document.getElementById('doc-retention').value;
  const effectiveDate = document.getElementById('doc-effective').value;
  const expiryInput   = document.getElementById('doc-expiry');

  if (!retentionName) {
    // Tidak ada retention → kosongkan, tunjukkan hint
    expiryInput.value       = '';
    expiryInput.placeholder = 'Select Retention Period first';
    expiryInput.style.fontStyle = '';
    return;
  }

  // Cari duration_years dari master data
  const retention = (App.data.retentions || []).find(function(r) { return r.name === retentionName; });
  if (!retention) {
    expiryInput.value       = '';
    expiryInput.placeholder = '';
    return;
  }

  const years = parseInt(retention.duration_years) || 0;

  // Jika permanent (99 years) → tampilkan teks Permanent
  if (years >= 99) {
    expiryInput.value       = '';
    expiryInput.placeholder = 'Permanent (no expiry)';
    expiryInput.style.fontStyle = 'italic';
    return;
  }

  expiryInput.style.fontStyle = '';

  // Hitung dari effective date jika ada, kalau tidak dari hari ini
  const baseDate = effectiveDate ? new Date(effectiveDate + 'T00:00:00') : new Date();
  baseDate.setFullYear(baseDate.getFullYear() + years);
  const yyyy = baseDate.getFullYear();
  const mm   = String(baseDate.getMonth() + 1).padStart(2, '0');
  const dd   = String(baseDate.getDate()).padStart(2, '0');
  expiryInput.value       = `${yyyy}-${mm}-${dd}`;
  expiryInput.placeholder = '';
}

// ============================================================
// FILE UPLOAD — MULTIPLE
// ============================================================

function parseDocFiles(doc) {
  try {
    const urls  = JSON.parse(doc.file_url  || '[]');
    const names = JSON.parse(doc.file_name || '[]');
    const ids   = JSON.parse(doc.file_id   || '[]');
    return urls.map((url, i) => ({
      url,
      name: names[i] || ('File ' + (i + 1)),
      id:   ids[i]   || ''
    }));
  } catch(e) {
    if (doc.file_url) {
      return [{ url: doc.file_url, name: doc.file_name || 'Download File', id: doc.file_id || '' }];
    }
    return [];
  }
}

function renderFileLinks(files, style = 'btn') {
  if (!files.length) return '';
  if (style === 'btn') {
    return files.map(f => `
      <a href="${f.url}" target="_blank" class="btn btn-sm btn-outline-primary">
        <i class="bi bi-download me-1"></i>${f.name}
      </a>`).join('');
  }
  if (style === 'list') {
    return files.map((f, i) => `
      <div class="d-flex align-items-center gap-2 py-1 border-bottom" style="font-size:0.85rem">
        <i class="bi ${fileIcon(f.name)}" style="color:#6c757d"></i>
        <a href="${f.url}" target="_blank" class="text-decoration-none flex-1" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${f.name}
        </a>
        <span class="badge bg-secondary" style="font-size:0.7rem">File ${i + 1}</span>
        <a href="${f.url}" target="_blank" class="btn btn-outline-primary" style="font-size:11px;padding:2px 8px">
          <i class="bi bi-box-arrow-up-right"></i>
        </a>
      </div>`).join('');
  }
  if (style === 'print') {
    return files.map((f, i) => `${i + 1}. ${f.name} — ${f.url}`).join('<br>');
  }
  return '';
}

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    pdf: 'bi-file-earmark-pdf-fill',
    doc: 'bi-file-earmark-word-fill', docx: 'bi-file-earmark-word-fill',
    xls: 'bi-file-earmark-excel-fill', xlsx: 'bi-file-earmark-excel-fill',
    ppt: 'bi-file-earmark-ppt-fill', pptx: 'bi-file-earmark-ppt-fill',
    png: 'bi-file-earmark-image-fill', jpg: 'bi-file-earmark-image-fill',
    jpeg: 'bi-file-earmark-image-fill', gif: 'bi-file-earmark-image-fill',
    txt: 'bi-file-earmark-text-fill'
  };
  return map[ext] || 'bi-file-earmark-fill';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

// --- DOC FILE QUEUE ---
let docFileQueue = [];

function onFileDrop(event) {
  event.preventDefault();
  document.getElementById('doc-dropzone').classList.remove('dz-hover');
  addFilesToQueue([...event.dataTransfer.files]);
}

function onFileInputChange(event) {
  addFilesToQueue([...event.target.files]);
  event.target.value = '';
}

function addFilesToQueue(files) {
  const MAX_SIZE = 10 * 1024 * 1024;
  files.forEach(f => {
    if (f.size > MAX_SIZE) { toast(`File "${f.name}" melebihi batas 10MB`, 'warning'); return; }
    if (docFileQueue.find(q => q.file.name === f.name && q.status !== 'error')) {
      toast(`File "${f.name}" sudah ada dalam list`, 'warning'); return;
    }
    docFileQueue.push({ file: f, status: 'pending', result: null });
  });
  renderFileList();
}

function renderFileList() {
  const listWrap  = document.getElementById('doc-file-list');
  const container = document.getElementById('doc-file-items');
  if (!listWrap || !container) return;
  if (!docFileQueue.length) { listWrap.style.display = 'none'; container.innerHTML = ''; return; }
  listWrap.style.display = 'block';
  container.innerHTML = docFileQueue.map((item, idx) => {
    const size = item.file.size > 0 ? (item.file.size / 1024).toFixed(1) + ' KB' : '';
    const statusIcon = {
      pending:   '<i class="bi bi-clock text-muted"></i>',
      uploading: '<div class="spinner-border spinner-border-sm text-primary" style="width:14px;height:14px"></div>',
      done:      '<i class="bi bi-check-circle-fill text-success"></i>',
      error:     '<i class="bi bi-x-circle-fill text-danger"></i>'
    }[item.status] || '';
    return `<div class="file-item ${item.status === 'done' ? 'uploaded' : item.status === 'error' ? 'error' : ''}">
      <i class="bi ${fileIcon(item.file.name)}" style="font-size:1rem;color:#6c757d"></i>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.file.name}</span>
      <span style="color:#adb5bd;white-space:nowrap">${size}</span>
      ${statusIcon}
      ${item.status !== 'uploading' ? `<button type="button" class="btn btn-link btn-sm p-0 text-danger" onclick="removeFileFromQueue(${idx})"><i class="bi bi-x-lg" style="font-size:0.75rem"></i></button>` : ''}
    </div>`;
  }).join('');
}

function removeFileFromQueue(idx) {
  docFileQueue.splice(idx, 1);
  renderFileList();
  syncHiddenFileFields();
}

function syncHiddenFileFields() {
  const done = docFileQueue.filter(q => q.status === 'done' && q.result);
  document.getElementById('doc-file-url').value  = JSON.stringify(done.map(q => q.result.file_url));
  document.getElementById('doc-file-id').value   = JSON.stringify(done.map(q => q.result.file_id));
  document.getElementById('doc-file-name').value = JSON.stringify(done.map(q => q.result.file_name));
}

async function uploadPendingFiles() {
  const pending = docFileQueue.filter(q => q.status === 'pending');
  if (!pending.length) return true;

  const progressWrap = document.getElementById('doc-upload-progress');
  const bar   = document.getElementById('doc-upload-bar');
  const label = document.getElementById('doc-upload-label');
  const pct   = document.getElementById('doc-upload-pct');
  progressWrap.style.display = 'block';

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    item.status = 'uploading';
    renderFileList();
    bar.style.width   = Math.round((i / pending.length) * 100) + '%';
    pct.textContent   = Math.round((i / pending.length) * 100) + '%';
    label.textContent = `Uploading ${i + 1} of ${pending.length}: ${item.file.name}`;

    try {
      const base64 = await fileToBase64(item.file);
      const res = await gasCall('apiUploadFiles', [{
        name: item.file.name,
        mimeType: item.file.type || 'application/octet-stream',
        base64
      }]);
      if (res && res.success && res.data && res.data[0]) {
        item.status = 'done'; item.result = res.data[0];
      } else {
        item.status = 'error';
        toast(`Gagal upload "${item.file.name}": ${res?.error || 'Unknown error'}`, 'error');
      }
    } catch(e) {
      item.status = 'error';
      toast(`Error upload "${item.file.name}": ${e.message}`, 'error');
    }
    renderFileList();
  }

  bar.style.width = '100%'; pct.textContent = '100%'; label.textContent = 'Upload selesai';
  setTimeout(() => { progressWrap.style.display = 'none'; }, 1500);
  syncHiddenFileFields();
  return !docFileQueue.some(q => q.status === 'error');
}

// --- REV FILE QUEUE ---
let revFileQueue = [];

function onRevFileDrop(event) {
  event.preventDefault();
  document.getElementById('rev-dropzone').classList.remove('dz-hover');
  addRevFilesToQueue([...event.dataTransfer.files]);
}

function onRevFileInputChange(event) {
  addRevFilesToQueue([...event.target.files]);
  event.target.value = '';
}

function addRevFilesToQueue(files) {
  const MAX_SIZE = 10 * 1024 * 1024;
  files.forEach(f => {
    if (f.size > MAX_SIZE) { toast(`File "${f.name}" melebihi 10MB`, 'warning'); return; }
    if (revFileQueue.find(q => q.file.name === f.name && q.status !== 'error')) {
      toast(`File "${f.name}" sudah ada`, 'warning'); return;
    }
    revFileQueue.push({ file: f, status: 'pending', result: null });
  });
  renderRevFileList();
}

function renderRevFileList() {
  const listWrap  = document.getElementById('rev-file-list');
  const container = document.getElementById('rev-file-items');
  if (!listWrap || !container) return;
  if (!revFileQueue.length) { listWrap.style.display = 'none'; container.innerHTML = ''; return; }
  listWrap.style.display = 'block';
  container.innerHTML = revFileQueue.map((item, idx) => {
    const size = item.file.size > 0 ? (item.file.size / 1024).toFixed(1) + ' KB' : '';
    const statusIcon = {
      pending:   '<i class="bi bi-clock text-muted"></i>',
      uploading: '<div class="spinner-border spinner-border-sm text-primary" style="width:14px;height:14px"></div>',
      done:      '<i class="bi bi-check-circle-fill text-success"></i>',
      error:     '<i class="bi bi-x-circle-fill text-danger"></i>'
    }[item.status] || '';
    return `<div class="file-item ${item.status === 'done' ? 'uploaded' : item.status === 'error' ? 'error' : ''}">
      <i class="bi ${fileIcon(item.file.name)}" style="font-size:1rem;color:#6c757d"></i>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.file.name}</span>
      <span style="color:#adb5bd;white-space:nowrap">${size}</span>
      ${statusIcon}
      ${item.status !== 'uploading' ? `<button type="button" class="btn btn-link btn-sm p-0 text-danger" onclick="revFileQueue.splice(${idx},1);renderRevFileList()"><i class="bi bi-x-lg" style="font-size:0.75rem"></i></button>` : ''}
    </div>`;
  }).join('');
}

async function uploadRevFiles() {
  const pending = revFileQueue.filter(q => q.status === 'pending');
  if (!pending.length) {
    const done = revFileQueue.filter(q => q.status === 'done' && q.result);
    document.getElementById('rev-file-url').value = JSON.stringify(done.map(q => q.result.file_url));
    return true;
  }

  const bar   = document.getElementById('rev-upload-bar');
  const label = document.getElementById('rev-upload-label');
  const pct   = document.getElementById('rev-upload-pct');
  document.getElementById('rev-upload-progress').style.display = 'block';

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    item.status = 'uploading';
    renderRevFileList();
    bar.style.width   = Math.round((i / pending.length) * 100) + '%';
    pct.textContent   = Math.round((i / pending.length) * 100) + '%';
    label.textContent = `Uploading ${i + 1} of ${pending.length}: ${item.file.name}`;

    try {
      const base64 = await fileToBase64(item.file);
      const res = await gasCall('apiUploadFiles', [{
        name: item.file.name,
        mimeType: item.file.type || 'application/octet-stream',
        base64
      }]);
      if (res && res.success && res.data && res.data[0]) {
        item.status = 'done'; item.result = res.data[0];
      } else {
        item.status = 'error';
        toast(`Gagal upload "${item.file.name}": ${res?.error || 'Unknown error'}`, 'error');
      }
    } catch(e) {
      item.status = 'error';
      toast(`Error upload "${item.file.name}": ${e.message}`, 'error');
    }
    renderRevFileList();
  }

  bar.style.width = '100%'; pct.textContent = '100%'; label.textContent = 'Upload selesai';
  setTimeout(() => { document.getElementById('rev-upload-progress').style.display = 'none'; }, 1500);

  const done = revFileQueue.filter(q => q.status === 'done' && q.result);
  document.getElementById('rev-file-url').value  = JSON.stringify(done.map(q => q.result.file_url));
  return !revFileQueue.some(q => q.status === 'error');
}

async function saveDocument(mode) {
  const title = document.getElementById('doc-title').value.trim();
  const category = document.getElementById('doc-category').value;
  const department = document.getElementById('doc-department').value;
  const circleGroup = document.getElementById('doc-circle-group').value;
  const owner = document.getElementById('doc-owner').value.trim();
  
  if (!title || !category || !department || !circleGroup) {
    toast('Title, Category, Department, dan Circle Group wajib diisi', 'warning');
    return;
  }
  
  let customFieldsData = {};
  if (App.docModalMode === 'standard') {
    const cfInputs = document.querySelectorAll('#doc-custom-fields-container [id^="cf-"]');
    for (const el of cfInputs) {
      const key = el.id.replace('cf-', '');
      customFieldsData[key] = el.value ? el.value.trim() : '';
    }
  }

  const uploadOk = await uploadPendingFiles();
    if (!uploadOk) {
      toast('Beberapa file gagal diupload. Silakan coba lagi.', 'error');
      return;
    }

    showLoader();

    const data = {
    title,
    category,
    department,
    area: document.getElementById('doc-area').value,
    circle_group: circleGroup,
    doc_type: document.getElementById('doc-type').value,
    retention_period: document.getElementById('doc-retention').value,
    owner_email: owner,
    reviewer2_email: document.getElementById('doc-reviewer2').value.trim(),
    reviewer3_email: document.getElementById('doc-reviewer3').value.trim(),
    approver_email: document.getElementById('doc-approver').value.trim(),
    // reviewer1_email TIDAK dikirim dari client — di-set server-side dari Department
    description: document.getElementById('doc-description').value,
    keywords: document.getElementById('doc-keywords').value,
    file_url:  document.getElementById('doc-file-url').value.trim(),
    file_name: document.getElementById('doc-file-name').value.trim(),
    file_id:   document.getElementById('doc-file-id').value.trim(),
    custom_fields: customFieldsData
  };
  
  const docId = document.getElementById('doc-id').value;
  
  try {
    let res;
    if (docId) {
      res = await gasCall('apiUpdateDocument', docId, data);
    } else {
      res = await gasCall('apiCreateDocument', data);
    }
    
    if (res && res.error) {
      toast(res.error, 'error');
      return;
    }
    
    getModal('docModal').hide();
    toast('Dokumen berhasil disimpan', 'success');

    if (mode === 'submit' && (res.data || docId)) {
      const id = docId || res.data.id;

      // Refresh App.data.docs dulu sebelum submitForReview
      // agar doc bisa ditemukan (terutama untuk dokumen baru)
      const docsRes = await gasCall('apiGetDocuments', {});
      if (docsRes && docsRes.data) App.data.docs = docsRes.data;

      hideLoader(); // ← Sembunyikan loader SEBELUM showConfirm dialog muncul
      await submitForReview(id);
      return; // ← submitForReview punya loader & hideLoader sendiri
    } else {
      loadPageData(App.currentPage);
    }
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

async function submitForReview(docId) {
  const doc = (App.data.docs || []).find(d => d.id === docId);
  
  if (!doc) {
    toast('Dokumen tidak ditemukan', 'error');
    return;
  }
  
  if (doc.status !== DOC_STATUS.DRAFT && doc.status !== DOC_STATUS.REJECTED) {
    toast('Dokumen harus dalam status Draft atau Rejected', 'warning');
    return;
  }
  
  if (!doc.reviewer1_email) {
    toast('Reviewer 1 (Atasan Langsung) belum diset di Master Data Department. Hubungi admin.', 'warning');
    return;
  }
  if (!doc.reviewer2_email) {
    toast('Silakan tentukan Reviewer 2 (Tim Document Control) terlebih dahulu', 'warning');
    return;
  }
  if (!doc.reviewer3_email) {
    toast('Silakan tentukan Reviewer 3 (Atasan Document Control) terlebih dahulu', 'warning');
    return;
  }
  if (!doc.approver_email) {
    toast('Silakan tentukan Approver (Tim FSTL) terlebih dahulu', 'warning');
    return;
  }
  
  const okSubmit = await showConfirm({
  title: 'Submit untuk Review', subtitle: doc.doc_number || '',
  message: `Dokumen <strong>${doc.title}</strong> akan dikirim ke Reviewer 1 (Atasan Langsung).<br><small style="color:#6b7280">Reviewer 1: ${doc.reviewer1_email || '-'}</small>`,
  okText: 'Submit', cancelText: 'Batal', type: 'primary'});
  if (!okSubmit) { return; } // loader sudah di-hide sebelum showConfirm dipanggil

  showLoader();
  try {
    const res = await gasCall('apiSubmitForReview', docId);
    if (res && res.error) {
      toast(res.error, 'error');
      return;
    }
    
    toast(res.message || 'Dokumen berhasil diajukan untuk review', 'success');
    loadNotificationBadges();
    loadPageData(App.currentPage);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

async function obsoleteDoc(docId) {
  const okObsolete = await showConfirm({
  title: 'Obsolete Dokumen', subtitle: 'Tindakan ini tidak dapat dibatalkan',
  message: 'Dokumen akan ditandai sebagai <strong>Obsolete</strong> dan tidak dapat digunakan kembali.',
  okText: 'Obsolete', cancelText: 'Batal', type: 'warning'});
  if (!okObsolete) return;
  const reason = await showPromptConfirm('Alasan Obsolete', 'Masukkan alasan dokumen di-obsolete');
  if (!reason) return;
  showLoader();
  try {
    const res = await gasCall('apiObsoleteDocument', docId, reason);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Dokumen ditandai Obsolete', 'success');
    loadNotificationBadges();
    loadPageData(App.currentPage);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// REVIEW
// ============================================================
async function loadReview() {
  showLoader();
  try {
    const res = await gasCall('apiGetPendingReview');
    if (res && res.error) {
      toast(res.error, 'error');
      hideLoader();
      return;
    }
    
    const docs = res.data || [];
    const tbody = document.getElementById('review-tbody');
    
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-inbox d-block fs-2 mb-2"></i>Tidak ada dokumen untuk direview</td></tr>';
      hideLoader();
      return;
    }
    
    const reviewRowFn = doc => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div>
              <span class="doc-number">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
            ${statusBadge(doc.status)}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-person"></i>${doc.owner_email||'-'}</span>
          </div>
          <div class="mobile-card-actions">
            <button class="btn btn-outline-primary btn-sm" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye me-1"></i>Detail</button>
            <button class="btn btn-success btn-sm" onclick="openActionModal('${doc.id}','review')"><i class="bi bi-search me-1"></i>Review</button>
          </div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td><a href="#" onclick="showDocDetail('${doc.id}')" class="text-decoration-none fw-semibold" style="color:var(--primary)">${doc.title||'-'}</a></td>
        <td>${doc.department||'-'}</td>
        <td><small class="text-muted">${doc.owner_email||'-'}</small></td>
        <td>${fmtDate(doc.updated_at)}</td>
        <td>${statusBadge(doc.status)}</td>
        <td><div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye"></i> View</button>
          <button class="btn btn-success" onclick="openActionModal('${doc.id}','review')"><i class="bi bi-search"></i> Review</button>
        </div></td>
      </tr>`;
    };
    renderListOrCards('review-tbody', docs, reviewRowFn,
      '<i class="bi bi-inbox d-block fs-2 mb-2"></i>Tidak ada dokumen untuk direview', 7);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

// ============================================================
// APPROVAL
// ============================================================
async function loadApproval() {
  showLoader();
  try {
    const res = await gasCall('apiGetPendingApproval');
    if (res && res.error) {
      toast(res.error, 'error');
      hideLoader();
      return;
    }
    
    const docs = res.data || [];
    const tbody = document.getElementById('approval-tbody');
    
    if (!docs.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-inbox d-block fs-2 mb-2"></i>Tidak ada dokumen untuk disetujui</td></tr>';
      hideLoader();
      return;
    }
    
    const approvalRowFn = doc => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div>
              <span class="doc-number">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
            ${statusBadge(doc.status)}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-person-check"></i>${doc.reviewer3_email||'-'}</span>
          </div>
          <div class="mobile-card-actions">
            <button class="btn btn-outline-primary btn-sm" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye me-1"></i>Detail</button>
            <button class="btn btn-success btn-sm" onclick="openActionModal('${doc.id}','approval')"><i class="bi bi-check2-square me-1"></i>Approve</button>
          </div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td><a href="#" onclick="showDocDetail('${doc.id}')" class="text-decoration-none fw-semibold" style="color:var(--primary)">${doc.title||'-'}</a></td>
        <td>${doc.department||'-'}</td>
        <td><small class="text-muted">${doc.owner_email||'-'}</small></td>
        <td><small class="text-muted">${doc.reviewer3_email||'-'}</small></td>
        <td>${statusBadge(doc.status)}</td>
        <td><div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye"></i> View</button>
          <button class="btn btn-success" onclick="openActionModal('${doc.id}','approval')"><i class="bi bi-check2-square"></i> Approve</button>
        </div></td>
      </tr>`;
    };
    renderListOrCards('approval-tbody', docs, approvalRowFn,
      '<i class="bi bi-inbox d-block fs-2 mb-2"></i>Tidak ada dokumen untuk disetujui', 7);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

// ============================================================
// ACTION MODAL (Review/Approve)
// ============================================================
function openActionModal(docId, type) {
  App.currentDocId = docId;
  const doc = (App.data.docs || []).find(d => d.id === docId);
  
  document.getElementById('action-doc-id').value = docId;
  document.getElementById('action-type').value = type;
  document.getElementById('action-modal-title').innerHTML =
    type === 'review' ? '<i class="bi bi-search me-2"></i>Review Document' : '<i class="bi bi-check2-square me-2"></i>Approve Document';
  document.getElementById('action-doc-number').textContent = doc ? doc.doc_number : docId;
  document.getElementById('action-doc-title').textContent = doc ? doc.title : '';
  document.getElementById('action-comments').value = '';
  
  if (doc) {
    const dl = daysLeft(doc.expiry_date);
    const expiryWarn = dl !== null && dl <= 30 ? ` <span class="badge bg-danger">${dl}d left</span>` : '';
    
    document.getElementById('action-doc-details').innerHTML = `
      <div class="row g-2" style="font-size:12.5px">
        <div class="col-6"><span class="text-muted">Department:</span> <strong>${doc.department||'-'}</strong></div>
        <div class="col-6"><span class="text-muted">Category:</span> <strong>${doc.category||'-'}</strong></div>
        <div class="col-6"><span class="text-muted">Revision:</span> <strong>${doc.revision||'-'}</strong></div>
        <div class="col-6"><span class="text-muted">Owner:</span> <strong>${doc.owner_email||'-'}</strong></div>
        <div class="col-12"><span class="text-muted">Expiry Date:</span> <strong>${fmtDate(doc.expiry_date)}${expiryWarn}</strong></div>
        ${(() => {
          const files = parseDocFiles(doc);
          return files.length ? `
          <div class="col-12">
            <div class="fw-semibold mb-1" style="font-size:12px;color:#6c757d">
              <i class="bi bi-paperclip me-1"></i>Attachments (${files.length})
            </div>
            <div class="d-flex flex-wrap gap-2">
              ${renderFileLinks(files, 'btn')}
            </div>
          </div>` : '';
        })()}
      </div>`;
  }
  
  getModal('actionModal').show();
}


async function performAction(action) {
  const docId = document.getElementById('action-doc-id').value;
  const type = document.getElementById('action-type').value;
  const comments = document.getElementById('action-comments').value.trim();
  
  if (!comments && action === 'reject') {
    toast('Berikan alasan penolakan', 'warning');
    return;
  }
  
  showLoader();
  try {
    let res;
    if (type === 'review') {
      res = await gasCall('apiReviewDocument', docId, action, comments);
    } else {
      res = await gasCall('apiApproveDocument', docId, action, comments);
    }
    
    if (res && res.error) {
      toast(res.error, 'error');
      return;
    }
    
    getModal('actionModal').hide();
    
    const successMsg = action === 'approve'
      ? 'Document ' + (type === 'review' ? 'reviewed and passed to approval' : 'approved successfully')
      : type === 'review'
      ? 'Document rejected - returned to owner for revision'
      : 'Document rejected - returned to owner for correction';
    
    toast(successMsg, 'success');
    loadNotificationBadges();
    loadPageData(App.currentPage);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

// ============================================================
// CHANGE REQUEST
// ============================================================
async function loadChangeRequest() {
  showLoader();
  try {
    const [docsRes, crsRes] = await Promise.all([
      gasCall('apiGetEffectiveDocs'),
      gasCall('apiGetChangeRequests')
    ]);
    if (docsRes && docsRes.error) { toast(docsRes.error, 'error'); return; }

    const allDocs = docsRes.data || [];
    const allCRs  = crsRes && crsRes.data ? crsRes.data : [];

    // Enrich docs dengan data CR terkait
    const docsWithCR = allDocs.map(doc => {
      const cr = allCRs.find(c => c.doc_id === doc.id && (c.status === 'Pending' || c.status === 'Approved'));
      return Object.assign({}, doc, { _cr: cr || null });
    });

    const perm = App.perms['change_request'] || {};
    const canCreate  = perm.can_create  == 1;
    const canApprove = perm.can_approve == 1;

    const tbody = document.getElementById('cr-tbody');
    if (!docsWithCR.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-inbox d-block fs-2 mb-2"></i>Tidak ada dokumen</td></tr>';
      return;
    }

    const crRowFn = doc => {
      const cr = doc._cr;
      let actionBtn = '';
      if (doc.status === DOC_STATUS.EFFECTIVE && canCreate) {
        actionBtn = `<button class="btn btn-warning btn-sm" onclick="openChangeRequestModal('${doc.id}')"><i class="bi bi-arrow-left-right me-1"></i>Change Req</button>`;
      } else if (doc.status === DOC_STATUS.CR_PENDING && canApprove && cr) {
        actionBtn = `
          <button class="btn btn-success btn-sm" onclick="approveCR('${cr.id}')"><i class="bi bi-check-lg me-1"></i>Approve</button>
          <button class="btn btn-danger btn-sm" onclick="rejectCR('${cr.id}')"><i class="bi bi-x-lg me-1"></i>Reject</button>`;
      } else if (doc.status === DOC_STATUS.CR_APPROVED) {
        actionBtn = `<span class="badge bg-info text-dark">Waiting Revision</span>`;
      }
      const crInfo = cr ? `<small class="text-muted d-block">by ${cr.requester_email} | ${cr.urgency}</small>` : '';

      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div><span class="doc-number text-primary" style="font-size:12px">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
              ${crInfo}
            </div>
            ${statusBadge(doc.status)}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-arrow-repeat"></i>${doc.revision||'Rev00'}</span>
            ${cr ? `<span><i class="bi bi-info-circle"></i>${cr.reason||'-'}</span>` : ''}
          </div>
          <div class="mobile-card-actions">
            <button class="btn btn-outline-primary btn-sm" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye me-1"></i>Detail</button>
            ${actionBtn}
          </div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td><a href="#" onclick="showDocDetail('${doc.id}')" class="text-decoration-none fw-semibold" style="color:var(--primary)">${doc.title||'-'}</a>${crInfo}</td>
        <td>${doc.department||'-'}</td>
        <td><span class="badge bg-secondary">${doc.revision||'Rev00'}</span></td>
        <td>${statusBadge(doc.status)}</td>
        <td>${cr ? (cr.reason + (cr.description ? '<br><small class="text-muted">'+cr.description+'</small>' : '')) : '-'}</td>
        <td><div class="d-flex gap-1 flex-wrap">
          <button class="btn btn-outline-primary btn-sm" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye"></i></button>
          ${actionBtn}
        </div></td>
      </tr>`;
    };
    renderListOrCards('cr-tbody', docsWithCR, crRowFn, '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-inbox d-block fs-2 mb-2"></i>Tidak ada dokumen</td></tr>', 7);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

// ============================================================
// REVISION
// ============================================================
async function loadRevisions() {
  showLoader();
  try {
    const res = await gasCall('apiGetReport', 'revision_history', {});
    if (res && res.error) {
      toast(res.error, 'error');
      hideLoader();
      return;
    }
    
    const revisions = res.data || [];
    const tbody = document.getElementById('rev-tbody');
    
    if (!revisions.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-inbox d-block fs-2 mb-2"></i>Belum ada riwayat revisi</td></tr>';
      hideLoader();
      return;
    }
    
    const revRowFn = r => {
      const docs = App.data.docs || [];
      const doc = docs.find(d => d.id === r.doc_id);
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div><span class="doc-number text-primary" style="font-size:12px">${doc ? doc.doc_number : (r.doc_id||'-').slice(0,8)}</span>
              <div class="mobile-card-title mt-1">${doc ? doc.title : 'Unknown'}</div>
            </div>
            <div class="d-flex gap-1 align-items-center">
              <span class="badge bg-secondary">${r.old_revision||'-'}</span>
              <i class="bi bi-arrow-right" style="font-size:10px;color:var(--text-muted)"></i>
              <span class="badge bg-primary">${r.new_revision||'-'}</span>
            </div>
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-card-text"></i>${r.reason||'-'}</span>
            <span><i class="bi bi-person"></i>${r.updated_by||'-'}</span>
            <span><i class="bi bi-calendar3"></i>${fmtDateTime(r.updated_at)}</span>
          </div>
          ${r.change_description ? `<div style="font-size:12px;color:var(--text-muted);padding-top:6px;border-top:1px solid var(--border-light);margin-top:4px">${r.change_description}</div>` : ''}
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc ? doc.doc_number : (r.doc_id||'-').slice(0,8)}</span></td>
        <td><strong>${doc ? doc.title : 'Unknown'}</strong></td>
        <td><span class="badge bg-secondary">${r.old_revision||'-'}</span></td>
        <td><span class="badge bg-primary">${r.new_revision||'-'}</span></td>
        <td><small><strong>${r.reason||'-'}</strong></small><br><small class="text-muted">${r.change_description||''}</small></td>
        <td><small class="text-muted">${r.updated_by||'-'}</small></td>
        <td><small>${fmtDateTime(r.updated_at)}</small></td>
      </tr>`;
    };
    renderListOrCards('rev-tbody', revisions, revRowFn, '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-inbox d-block fs-2 mb-2"></i>Belum ada riwayat revisi</td></tr>', 7);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

async function openRevisionModal(docId) {
  App.currentDocId = docId;
  let doc = (App.data.docs || []).find(d => d.id === docId);

  if (!doc) {
    try {
      const res = await gasCall('apiGetEffectiveDocs');
      if (res && res.data) doc = res.data.find(d => d.id === docId);
    } catch(e) {}
  }

  if (!doc) {
    toast('Dokumen tidak ditemukan', 'error');
    return;
  }

  const status = (doc.status || '').trim();
  if (status !== DOC_STATUS.EFFECTIVE && status !== DOC_STATUS.CR_APPROVED) {
    toast('Hanya dokumen dengan status Effective atau CR Approved yang dapat direvisi', 'warning');
    return;
  }
  
  document.getElementById('rev-doc-id').value = docId;
  document.getElementById('rev-reason').value = '';
  document.getElementById('rev-change-desc').value = '';
  document.getElementById('rev-file-url').value = '';
  revFileQueue = [];
  renderRevFileList();
  document.getElementById('rev-upload-progress').style.display = 'none';
  
  // Load revision reasons
  try {
    if (!App.data.revReasons || App.data.revReasons.length === 0) {
      const res = await gasCall('apiGetMasterData', 'revision_reason');
      if (res && res.data) {
        App.data.revReasons = res.data;
      }
    }
    fillSelect('rev-reason', App.data.revReasons || [], 'name', 'name', true);
  } catch(e) {}
  
  getModal('revisionModal').show();
}

async function submitRevision() {
  const docId = document.getElementById('rev-doc-id').value;
  const reason = document.getElementById('rev-reason').value.trim();
  const desc = document.getElementById('rev-change-desc').value.trim();
  
  if (!reason || !desc) {
    toast('Alasan revisi dan deskripsi perubahan wajib diisi', 'warning');
    return;
  }
  
  const uploadOk = await uploadRevFiles();
    if (!uploadOk) {
      toast('Beberapa file gagal diupload. Silakan coba lagi.', 'error');
      return;
    }

    showLoader();
    try {
      const fileUrlRaw = document.getElementById('rev-file-url').value;
      let parsedUrls = [];
      try { parsedUrls = JSON.parse(fileUrlRaw); } catch(e) {}

      const res = await gasCall('apiCreateRevision', {
        doc_id: docId,
        reason,
        change_description: desc,
        file_url: fileUrlRaw,
        file_name: JSON.stringify(revFileQueue.filter(q=>q.status==='done').map(q=>q.result.file_name)),
        file_id:   JSON.stringify(revFileQueue.filter(q=>q.status==='done').map(q=>q.result.file_id))
      });
    
    if (res && res.error) {
      toast(res.error, 'error');
      return;
    }
    
    getModal('revisionModal').hide();
    toast('Revisi ' + (res.newRevision || 'baru') + ' berhasil dibuat', 'success');
    loadNotificationBadges();
    loadPageData(App.currentPage);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

// ============================================================
// DISTRIBUTION
// ============================================================
async function loadDistributionPage() {
  showLoader();
  try {
    const res = await gasCall('apiGetDocuments', {});
    if (res && res.error) {
      hideLoader();
      return;
    }
    
    const docs = (res.data || []).filter(d => d.status === DOC_STATUS.EFFECTIVE);
    const sel = document.getElementById('dist-doc-select');
    
    if (!docs.length) {
      sel.innerHTML = '<option value="">Tidak ada dokumen Effective</option>';
    } else {
      sel.innerHTML = '<option value="">-- Pilih Dokumen --</option>' +
        docs.map(d => `<option value="${d.id}">${d.doc_number} - ${d.title}</option>`).join('');
    }
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

async function loadDistribution() {
  const docId = document.getElementById('dist-doc-select').value;
  if (!docId) {
    document.getElementById('dist-tbody').innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Pilih dokumen terlebih dahulu</td></tr>';
    return;
  }
  
  showLoader();
  try {
    const res = await gasCall('apiGetDistributionList', docId);
    if (res && res.error) {
      toast(res.error, 'error');
      hideLoader();
      return;
    }
    
    const list = res.data || [];
    const tbody = document.getElementById('dist-tbody');
    
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Dokumen belum didistribusikan</td></tr>';
      hideLoader();
      return;
    }
    
    let acknowledgedCount = 0;
    const distRowFn = d => {
      if (d.acknowledged) acknowledgedCount++;
      const ackBadge = d.acknowledged
        ? '<span class="badge bg-success">Sudah</span>'
        : '<span class="badge bg-warning text-dark">Belum</span>';
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div class="mobile-card-title">${d.user_email||'-'}</div>
            ${ackBadge}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-person-check"></i>By: ${d.distributed_by||'-'}</span>
            <span><i class="bi bi-calendar3"></i>${fmtDateTime(d.distributed_at)}</span>
            ${d.group_name ? `<span><i class="bi bi-people"></i>${d.group_name}</span>` : ''}
            ${d.read_at ? `<span><i class="bi bi-eye"></i>Read: ${fmtDateTime(d.read_at)}</span>` : ''}
          </div>
        </div>`;
      // SESUDAH
      return `<tr>
        <td><small class="text-muted">${d.user_email||'-'}</small></td>
        <td><small>${d.group_name || '<span class="text-muted">&mdash;</span>'}</small></td>
        <td><small>${d.distributed_by||'-'}</small></td>
        <td><small>${fmtDateTime(d.distributed_at)}</small></td>
        <td class="text-center">${ackBadge}</td>
        <td>${d.read_at ? fmtDateTime(d.read_at) : '<span class="text-muted">&mdash;</span>'}</td>
      </tr>`;
    };
    renderListOrCards('dist-tbody', list, distRowFn, '<tr><td colspan="5" class="text-center text-muted py-3">Dokumen belum didistribusikan</td></tr>', 5);
    
    // Tampilkan statistik
    const compliance = list.length > 0 ? Math.round((acknowledgedCount / list.length) * 100) : 0;
    const statsDiv = document.createElement('div');
    statsDiv.className = 'alert alert-info mt-2';
    statsDiv.innerHTML = `<i class="bi bi-info-circle me-2"></i><strong>Distribution Status:</strong> ${acknowledgedCount}/${list.length} acknowledged (${compliance}%)`;
    
    const tableContainer = document.querySelector('#page-distribution .table-responsive');
    const existingStats = tableContainer.querySelector('.alert-info');
    if (existingStats) existingStats.remove();
    tableContainer.parentElement.insertBefore(statsDiv, tableContainer);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

function openDistributeModal() {
  const docId = document.getElementById('dist-doc-select').value;
  if (!docId) { toast('Silakan pilih dokumen terlebih dahulu', 'warning'); return; }

  document.getElementById('dist-doc-id-modal').value = docId;

  // Isi dropdown Recipient Emails dari user directory (tampilkan nama, value = email)
  const emailsSelect = document.getElementById('dist-emails');
  if (emailsSelect) {
    const users = App.data.userDirectory || [];
    emailsSelect.innerHTML = users
      .slice()
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
      .map(u => `<option value="${u.email}">${u.name || u.email} (${u.email})</option>`).join('');
  }

  // TAMBAHAN: isi dropdown Distribution Group
  const groupSelect = document.getElementById('dist-group-select');
  if (groupSelect) {
    const groups = App.data.distributionGroups || [];
    groupSelect.innerHTML = '<option value="">-- Pilih Group --</option>' +
      groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  }

  getModal('distributeModal').show();
}

function applyDistributionGroup() {
  const groupId = document.getElementById('dist-group-select').value;
  if (!groupId) return;
  const group = (App.data.distributionGroups || []).find(g => g.id === groupId);
  if (!group || !group.members) { toast('Group ini belum punya anggota terdaftar', 'warning'); return; }

  const emailsEl = document.getElementById('dist-emails');
  const groupEmails = group.members.split(',').map(e => e.trim()).filter(Boolean);
  Array.from(emailsEl.options).forEach(opt => {
    if (groupEmails.includes(opt.value)) opt.selected = true;
  });
}

async function submitDistribution() {
  const docId = document.getElementById('dist-doc-id-modal').value;
  const emailsSelect = document.getElementById('dist-emails');
  const emails = Array.from(emailsSelect.selectedOptions).map(opt => opt.value).filter(Boolean);

  if (!emails.length) {
    toast('Silakan pilih minimal satu penerima', 'warning');
    return;
  }

  showLoader();
  try {
    // SESUDAH
    const groupId = document.getElementById('dist-group-select')?.value || '';
    const res = await gasCall('apiDistributeDocument', docId, groupId ? [groupId] : [], emails);
    if (res && res.error) {
      toast(res.error, 'error');
      return;
    }
    
    getModal('distributeModal').hide();
    toast(res.message || 'Dokumen berhasil didistribusikan', 'success');
    loadDistribution();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

// ============================================================
// READ ACKNOWLEDGEMENT
// ============================================================
async function loadReadAck() {
  showLoader();
  try {
    const res = await gasCall('apiGetMyDistributions');
    if (res && res.error) { toast(res.error, 'error'); return; }

    const myDocs = res.data || [];
    const tbody = document.getElementById('readack-tbody');

    if (!myDocs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-inbox d-block fs-2 mb-2"></i>Tidak ada dokumen untuk compliance</td></tr>';
      return;
    }

    const ackRowFn = doc => {
      const ackBadge = doc.acknowledged
        ? '<span class="badge bg-success">Complianced</span>'
        : '<span class="badge bg-warning text-dark">Pending</span>';
      const actionBtn = !doc.acknowledged
        ? `<button class="btn btn-outline-primary btn-sm" onclick="showDocDetail('${doc.doc_id}',true)"><i class="bi bi-eye me-1"></i>Open & Compliance</button>`
        : `<small class="text-muted">${fmtDate(doc.read_at)}</small>`;

      if (isMobile()) return `
        <div class="mobile-card" ${doc.acknowledged ? 'style="opacity:0.7"' : ''}>
          <div class="mobile-card-header">
            <div>
              <span class="doc-number">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
            ${ackBadge}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-arrow-clockwise"></i>${doc.revision||'Rev00'}</span>
            <span><i class="bi bi-calendar"></i>${fmtDate(doc.effective_date)}</span>
          </div>
          <div class="mobile-card-actions">${actionBtn}</div>
        </div>`;

      return `<tr ${doc.acknowledged ? 'style="opacity:0.7"' : ''}>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td><a href="#" onclick="showDocDetail('${doc.doc_id}',true)" class="text-decoration-none fw-semibold" style="color:var(--primary)">${doc.title||'-'}</a></td>
        <td><span class="badge bg-secondary">${doc.revision||'Rev00'}</span></td>
        <td>${fmtDate(doc.effective_date)}</td>
        <td>${ackBadge}</td>
        <td>${actionBtn}</td>
      </tr>`;
    };
    renderListOrCards('readack-tbody', myDocs, ackRowFn,
      '<i class="bi bi-inbox d-block fs-2 mb-2"></i>Tidak ada dokumen untuk compliance', 6);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

async function acknowledgeRead() {
  showLoader();
  try {
    const res = await gasCall('apiAcknowledgeRead', App.currentDocId);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Audit Doc berhasil dicatat', 'success');
    loadNotificationBadges();
    document.getElementById('btn-acknowledge').style.display = 'none';
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// MONITORING PAGES
// ============================================================
async function loadMonPendingReview() {
  showLoader();
  try {
    const res = await gasCall('apiGetPendingReview');
    if (res && res.error) return;
    const monReviewRowFn = doc => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div>
              <span class="doc-number">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-person-check"></i>${doc.current_reviewer_email||'-'} <small>(${doc.current_stage_label||'-'})</small></span>
            <span><i class="bi bi-person"></i>${doc.owner_email||'-'}</span>
          </div>
          <div class="mobile-card-actions">
            <button class="btn btn-outline-primary btn-sm" onclick="openActionModal('${doc.id}','review')"><i class="bi bi-search me-1"></i>Review</button>
          </div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td>${doc.title||'-'}</td>
        <td>${doc.department||'-'}</td>
        <td><small>${doc.current_reviewer_email||'-'} (${doc.current_stage_label||'-'})</small></td>
        <td><small>${doc.owner_email||'-'}</small></td>
        <td>${fmtDate(doc.updated_at)}</td>
        <td><button class="btn btn-xs btn-outline-primary" style="font-size:11px;padding:2px 8px" onclick="openActionModal('${doc.id}','review')">Review</button></td>
      </tr>`;
    };
    const reviewData = res.data || [];
    reviewData.forEach(d => {
      if (!(App.data.docs || []).find(x => x.id === d.id)) {
        App.data.docs = (App.data.docs || []).concat(d);
      }
    });
    renderListOrCards('mon-review-tbody', reviewData, monReviewRowFn, 'No pending reviews', 7);
  } catch(e) {} finally { hideLoader(); }
}

async function loadMonPendingApproval() {
  showLoader();
  try {
    const res = await gasCall('apiGetPendingApproval');
    if (res && res.error) return;
    const monApprovalRowFn = doc => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div>
              <span class="doc-number">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-person-check"></i>${doc.approver_email||'-'}</span>
            <span><i class="bi bi-person"></i>${doc.owner_email||'-'}</span>
          </div>
          <div class="mobile-card-actions">
            <button class="btn btn-success btn-sm" onclick="openActionModal('${doc.id}','approval')"><i class="bi bi-check2-square me-1"></i>Approve</button>
          </div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td>${doc.title||'-'}</td>
        <td>${doc.department||'-'}</td>
        <td><small>${doc.approver_email||'-'}</small></td>
        <td><small>${doc.owner_email||'-'}</small></td>
        <td>${fmtDate(doc.updated_at)}</td>
        <td><button class="btn btn-xs btn-outline-success" style="font-size:11px;padding:2px 8px" onclick="openActionModal('${doc.id}','approval')">Approve</button></td>
      </tr>`;
    };
    const approvalData = res.data || [];
    approvalData.forEach(d => {
      if (!(App.data.docs || []).find(x => x.id === d.id)) {
        App.data.docs = (App.data.docs || []).concat(d);
      }
    });
    renderListOrCards('mon-approval-tbody', approvalData, monApprovalRowFn, 'No pending approvals', 7);
  } catch(e) {} finally { hideLoader(); }
}

async function loadMonNearExpired() {
  showLoader();
  try {
    const res = await gasCall('apiGetNearExpired');
    if (res && res.error) return;
    const monExpiredRowFn = doc => {
      const dl = daysLeft(doc.expiry_date);
      const cls = dl <= 7 ? 'text-danger fw-bold' : dl <= 14 ? 'text-warning fw-bold' : '';
      const color = dl <= 7 ? 'var(--danger)' : dl <= 14 ? 'var(--warning)' : 'var(--text-muted)';
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div>
              <span class="doc-number">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
            <span style="font-size:13px;font-weight:800;color:${color}">${dl !== null ? dl + 'd' : '-'}</span>
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-calendar"></i>Exp: ${fmtDate(doc.expiry_date)}</span>
            <span><i class="bi bi-person"></i>${doc.owner_email||'-'}</span>
          </div>
          <div class="mobile-card-actions">
            ${doc.status===DOC_STATUS.EFFECTIVE?`<button class="btn btn-outline-warning btn-sm" onclick="openChangeRequestModal('${doc.id}')"><i class="bi bi-arrow-left-right me-1"></i>Change Req</button>`:''}
            ${doc.status===DOC_STATUS.CR_APPROVED?`<button class="btn btn-outline-info btn-sm" onclick="openRevisionModal('${doc.id}')"><i class="bi bi-arrow-clockwise me-1"></i>Buat Revisi</button>`:''}
          </div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td>${doc.title||'-'}</td>
        <td>${doc.department||'-'}</td>
        <td>${fmtDate(doc.expiry_date)}</td>
        <td class="${cls}">${dl !== null ? dl + ' days' : '-'}</td>
        <td><small>${doc.owner_email||'-'}</small></td>
        <td>
          ${doc.status===DOC_STATUS.EFFECTIVE?`<button class="btn btn-xs btn-outline-warning" style="font-size:11px;padding:2px 8px" onclick="openChangeRequestModal('${doc.id}')"><i class="bi bi-arrow-left-right"></i> Change Req</button>`:''}
          ${doc.status===DOC_STATUS.CR_APPROVED?`<button class="btn btn-xs btn-outline-info" style="font-size:11px;padding:2px 8px" onclick="openRevisionModal('${doc.id}')"><i class="bi bi-arrow-clockwise"></i> Buat Revisi</button>`:''}
        </td>
      </tr>`;
    };
    
    renderListOrCards('mon-expired-tbody', res.data||[], monExpiredRowFn, 'No near-expired documents', 7);
  } catch(e) {} finally { hideLoader(); }
}

async function loadMonObsolete() {
  showLoader();
  try {
    const res = await gasCall('apiGetObsoleteDocs');
    if (res && res.error) return;
    const monObsoleteRowFn = doc => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div>
              <span class="doc-number">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
            <span class="badge bg-secondary">${doc.revision||'-'}</span>
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-calendar"></i>${fmtDate(doc.updated_at)}</span>
            <span><i class="bi bi-person"></i>${doc.owner_email||'-'}</span>
          </div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td>${doc.title||'-'}</td>
        <td>${doc.department||'-'}</td>
        <td><span class="badge bg-secondary">${doc.revision||'-'}</span></td>
        <td>${fmtDate(doc.updated_at)}</td>
        <td><small>${doc.owner_email||'-'}</small></td>
      </tr>`;
    };
    renderListOrCards('mon-obsolete-tbody', res.data||[], monObsoleteRowFn, 'No obsolete documents', 6);
  } catch(e) {} finally { hideLoader(); }
}

async function loadMonReadCompliance() {
  showLoader();
  try {
    const res = await gasCall('apiGetReadCompliance', '');
    if (res && res.error) return;
    const data = res && res.data || [];
    const monComplianceRowFn = d => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div class="mobile-card-title">${d.user_email||'-'}</div>
            ${d.acknowledged ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>'}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-calendar-plus"></i>Dist: ${fmtDate(d.distributed_at)}</span>
            <span><i class="bi bi-calendar-check"></i>Read: ${fmtDate(d.read_at)}</span>
          </div>
        </div>`;
      return `<tr>
        <td><small class="text-muted">${(d.doc_id||'').slice(0,8)}...</small></td>
        <td>${d.user_email||'-'}</td>
        <td>${fmtDate(d.distributed_at)}</td>
        <td>${d.acknowledged ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>'}</td>
        <td>${fmtDate(d.read_at)}</td>
      </tr>`;
    };
    renderListOrCards('mon-compliance-tbody', data, monComplianceRowFn, 'No data', 5);
  } catch(e) {} finally { hideLoader(); }
}

// ============================================================
// REPORTS
// ============================================================
async function loadRptMasterList() {
  showLoader();
  try {
    const res = await gasCall('apiGetReport', 'master_list', {});
    if (res && res.error) return;
    const tbody = document.getElementById('rpt-master-tbody');
    const rptMasterRowFn = doc => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div><span class="doc-number text-primary" style="font-size:12px">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
            ${statusBadge(doc.status)}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-tag"></i>${doc.category||'-'}</span>
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-arrow-repeat"></i>${doc.revision||'-'}</span>
            <span><i class="bi bi-calendar3"></i>${fmtDate(doc.effective_date)}</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px"><i class="bi bi-person me-1"></i>${doc.owner_email||'-'}</div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td>${doc.title||'-'}</td>
        <td>${doc.category||'-'}</td>
        <td>${doc.department||'-'}</td>
        <td>${doc.revision||'-'}</td>
        <td>${statusBadge(doc.status)}</td>
        <td>${fmtDate(doc.effective_date)}</td>
        <td><small>${doc.owner_email||'-'}</small></td>
      </tr>`;
    };
    renderListOrCards('rpt-master-tbody', res.data||[], rptMasterRowFn, '<tr><td colspan="8" class="text-center text-muted py-3">No documents</td></tr>', 8);
  } catch(e) {} finally { hideLoader(); }
}

async function loadRptRevision() {
  showLoader();
  try {
    const res = await gasCall('apiGetReport', 'revision_history', {});
    if (res && res.error) return;
    const tbody = document.getElementById('rpt-rev-tbody');
    const rptRevRowFn = r => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div class="mobile-card-title">${r.reason||'-'}</div>
            <div class="d-flex gap-1 align-items-center">
              <span class="badge bg-secondary">${r.old_revision||'-'}</span>
              <i class="bi bi-arrow-right" style="font-size:10px;color:var(--text-muted)"></i>
              <span class="badge bg-primary">${r.new_revision||'-'}</span>
            </div>
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-file-earmark"></i>${(r.doc_id||'').slice(0,8)}...</span>
            <span><i class="bi bi-person"></i>${r.updated_by||'-'}</span>
            <span><i class="bi bi-calendar3"></i>${fmtDate(r.updated_at)}</span>
          </div>
          ${r.change_description ? `<div style="font-size:12px;color:var(--text-muted);padding-top:6px;border-top:1px solid var(--border-light);margin-top:4px">${r.change_description}</div>` : ''}
        </div>`;
      return `<tr>
        <td><small>${(r.doc_id||'').slice(0,8)}...</small></td>
        <td>${r.old_revision||'-'}</td>
        <td>${r.new_revision||'-'}</td>
        <td>${r.reason||'-'}</td>
        <td>${r.change_description||'-'}</td>
        <td><small>${r.updated_by||'-'}</small></td>
        <td>${fmtDate(r.updated_at)}</td>
      </tr>`;
    };
    renderListOrCards('rpt-rev-tbody', res.data||[], rptRevRowFn, '<tr><td colspan="7" class="text-center text-muted py-3">No revision history</td></tr>', 7);
  } catch(e) {} finally { hideLoader(); }
}

async function loadRptDistribution() {
  showLoader();
  try {
    const res = await gasCall('apiGetReport', 'distribution', {});
    if (res && res.error) return;
    const tbody = document.getElementById('rpt-dist-tbody');
    const rptDistRowFn = d => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div class="mobile-card-title">${d.user_email||'-'}</div>
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-file-earmark"></i>${(d.doc_id||'').slice(0,8)}...</span>
            <span><i class="bi bi-person-check"></i>By: ${d.distributed_by||'-'}</span>
            <span><i class="bi bi-calendar3"></i>${fmtDate(d.distributed_at)}</span>
          </div>
        </div>`;
      // SESUDAH
      return `<tr>
        <td><small>${(d.doc_id||'').slice(0,8)}...</small></td>
        <td>${d.user_email||'-'}</td>
        <td><small>${d.group_name || '<span class="text-muted">&mdash;</span>'}</small></td>
        <td><small>${d.distributed_by||'-'}</small></td>
        <td>${fmtDate(d.distributed_at)}</td>
      </tr>`;
    };
    renderListOrCards('rpt-dist-tbody', res.data||[], rptDistRowFn, '<tr><td colspan="4" class="text-center text-muted py-3">No distribution data</td></tr>', 4);
  } catch(e) {} finally { hideLoader(); }
}

async function loadRptObsolete() {
  showLoader();
  try {
    const res = await gasCall('apiGetReport', 'obsolete', {});
    if (res && res.error) return;
    const tbody = document.getElementById('rpt-obs-tbody');
    const rptObsRowFn = doc => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div><span class="doc-number text-primary" style="font-size:12px">${doc.doc_number||'-'}</span>
              <div class="mobile-card-title mt-1">${doc.title||'-'}</div>
            </div>
            <span class="badge bg-secondary">${doc.revision||'-'}</span>
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-tag"></i>${doc.category||'-'}</span>
            <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
            <span><i class="bi bi-person"></i>${doc.owner_email||'-'}</span>
          </div>
        </div>`;
      return `<tr>
        <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
        <td>${doc.title||'-'}</td>
        <td>${doc.category||'-'}</td>
        <td>${doc.department||'-'}</td>
        <td>${doc.revision||'-'}</td>
        <td><small>${doc.owner_email||'-'}</small></td>
      </tr>`;
    };
    renderListOrCards('rpt-obs-tbody', res.data||[], rptObsRowFn, '<tr><td colspan="6" class="text-center text-muted py-3">No obsolete documents</td></tr>', 6);
  } catch(e) {} finally { hideLoader(); }
}

async function loadRptReadCompliance() {
  showLoader();
  try {
    const res = await gasCall('apiGetReadCompliance', '');
    if (res && res.error) return;
    const tbody = document.getElementById('rpt-comp-tbody');
    const rptCompRowFn = d => {
      const ackBadge = d.acknowledged ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>';
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div class="mobile-card-title">${d.user_email||'-'}</div>
            ${ackBadge}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-file-earmark"></i>${(d.doc_id||'').slice(0,8)}...</span>
            <span><i class="bi bi-send"></i>Dist: ${fmtDate(d.distributed_at)}</span>
            ${d.read_at ? `<span><i class="bi bi-eye"></i>Read: ${fmtDate(d.read_at)}</span>` : ''}
          </div>
        </div>`;
      return `<tr>
        <td><small>${(d.doc_id||'').slice(0,8)}...</small></td>
        <td>${d.user_email||'-'}</td>
        <td>${fmtDate(d.distributed_at)}</td>
        <td>${ackBadge}</td>
        <td>${fmtDate(d.read_at)}</td>
      </tr>`;
    };
    renderListOrCards('rpt-comp-tbody', res.data||[], rptCompRowFn, '<tr><td colspan="5" class="text-center text-muted py-3">No compliance data</td></tr>', 5);
  } catch(e) {} finally { hideLoader(); }
}

// ============================================================
// MASTER DATA
// ============================================================
// Cache key map: type -> App.data key
const MASTER_CACHE_KEY = {
  'category': 'categories',
  'department': 'departments',
  'area': 'areas',
  'circle_group': 'circleGroups',  // ← BARU
  'distribution_group': 'distributionGroups',
  'retention': 'retentions',
  'revision_reason': 'revReasons'
};

async function loadMaster(type) {
  showLoader();
  try {
    // Jika load area, pastikan departments juga ter-load untuk dropdown
    if (type === 'area' && (!App.data.departments || App.data.departments.length === 0)) {
      const deptRes = await gasCall('apiGetMasterData', 'department');
      if (deptRes && deptRes.data) App.data.departments = deptRes.data;
    }
    const res = await gasCall('apiGetMasterData', type);
    if (res && res.error) { toast(res.error, 'error'); return; }
    // Cache data
    const cacheKey = MASTER_CACHE_KEY[type];
    if (cacheKey) App.data[cacheKey] = res.data || [];
    renderMasterTable(type, res.data || []);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

function renderMasterTable(type, data) {
  const tbodyMap = {
    'category': 'tbody-category',
    'department': 'tbody-department',
    'area': 'tbody-area',
    'circle_group': 'tbody-circlegroup',
    'distribution_group': 'tbody-distgroup',
    'retention': 'tbody-retention',
    'revision_reason': 'tbody-revreason'
  };

  const tbody = document.getElementById(tbodyMap[type]);
  if (!tbody) return;

  const actions = (item) => `
    <button class="btn btn-xs btn-outline-secondary" style="font-size:11px;padding:2px 8px" onclick="openMasterModal('${type}','${item.id}')"><i class="bi bi-pencil"></i></button>
    <button class="btn btn-xs btn-outline-danger" style="font-size:11px;padding:2px 8px" onclick="deleteMaster('${type}','${item.id}')"><i class="bi bi-trash"></i></button>
  `;
  const actionBtns = (item) => `
    <button class="btn btn-outline-secondary btn-sm" onclick="openMasterModal('${type}','${item.id}')"><i class="bi bi-pencil me-1"></i>Edit</button>
    <button class="btn btn-outline-danger btn-sm" onclick="deleteMaster('${type}','${item.id}')"><i class="bi bi-trash me-1"></i>Hapus</button>
  `;

  const renderRow = (item) => {
    if (isMobile()) {
      let title = '', metas = [];
      switch(type) {
        case 'category':
          title = item.name||'-';
          metas = [`<span><i class="bi bi-hash"></i>${item.code||'-'}</span>`, `<span><i class="bi bi-text-left"></i>${item.description||'-'}</span>`, `<span>${item.form_type === 'standard' ? 'Standar' : 'Non-Standar'}</span>`];
          break;
        case 'department':
          title = item.name||'-';
          metas = [`<span><i class="bi bi-hash"></i>${item.code||'-'}</span>`, `<span><i class="bi bi-person"></i>${item.head_email||'-'}</span>`, `<span><i class="bi bi-text-left"></i>${item.description||'-'}</span>`];
          break;
        case 'area':
          title = item.name||'-';
          metas = [`<span><i class="bi bi-hash"></i>${item.code||'-'}</span>`, `<span><i class="bi bi-building"></i>${item.department||'Global'}</span>`, `<span><i class="bi bi-text-left"></i>${item.description||'-'}</span>`];
          break;
        case 'circle_group':
          title = item.name||'-';
          metas = [`<span><i class="bi bi-hash"></i>${item.code||'-'}</span>`];
          break;
        case 'distribution_group':
          title = item.name||'-';
          metas = [`<span><i class="bi bi-text-left"></i>${item.description||'-'}</span>`];
          break;
        case 'retention':
          title = item.name||'-';
          metas = [`<span><i class="bi bi-clock"></i>${item.duration_years||'-'} tahun</span>`, `<span><i class="bi bi-text-left"></i>${item.description||'-'}</span>`];
          break;
        case 'revision_reason':
          title = item.name||'-';
          metas = [`<span><i class="bi bi-hash"></i>${item.code||'-'}</span>`, `<span><i class="bi bi-text-left"></i>${item.description||'-'}</span>`];
          break;
      }
      return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div class="mobile-card-title">${title}</div>
          </div>
          <div class="mobile-card-meta">${metas.join('')}</div>
          <div class="mobile-card-actions">${actionBtns(item)}</div>
        </div>`;
    }

    switch(type) {
      case 'category': {
        const isStd = item.form_type === 'standard';
        const formTypeBadge = isStd
          ? '<span class="badge bg-primary">Standar</span>'
          : '<span class="badge bg-secondary">Non-Standar</span>';
        const manageFieldBtn = isStd
          ? `<button class="btn btn-xs btn-outline-primary" style="font-size:11px;padding:2px 8px" onclick="openCategoryFieldManager('${item.id}','${(item.name||'').replace(/'/g,"\\'")}')"><i class="bi bi-ui-checks"></i></button>`
          : '';
        return `<tr><td>${item.code||'-'}</td><td>${item.name||'-'}</td><td>${item.description||'-'}</td><td>${formTypeBadge}</td><td>${actions(item)}${manageFieldBtn}</td></tr>`;
      }
      case 'department':
        const cgList = item.circle_groups ? item.circle_groups.split(',').map(c => `<span class="badge bg-info me-1">${c.trim()}</span>`).join('') : '<span class="text-muted">-</span>';
        return `<tr><td>${item.code||'-'}</td><td>${item.name||'-'}</td><td><small>${item.head_email||'-'}</small></td><td>${cgList}</td><td>${item.description||'-'}</td><td>${actions(item)}</td></tr>`;
      case 'area':
        const areaCG = (App.data.circleGroups || []).find(cg => cg.code === item.circle_group);
        const areaCGLabel = areaCG ? `${areaCG.name} (${areaCG.code})` : (item.circle_group || '-');
        const areaDept = (App.data.departments || []).find(d =>
          (d.circle_groups || '').split(',').map(c => c.trim()).includes(item.circle_group)
        );
        const areaDeptLabel = areaDept ? areaDept.name : '<span class="text-muted">-</span>';
        return `<tr><td>${item.code||'-'}</td><td>${item.name||'-'}</td><td>${areaDeptLabel}</td><td><span class="badge bg-info">${areaCGLabel}</span></td><td>${item.description||'-'}</td><td>${actions(item)}</td></tr>`;
      case 'circle_group':
        const cgDepts = (App.data.departments || []).filter(d =>
          (d.circle_groups || '').split(',').map(c => c.trim()).includes(item.code)
        ).map(d => d.name);
        const cgDeptLabel = cgDepts.length ? cgDepts.join(', ') : '<span class="text-muted">-</span>';
        return `<tr><td>${item.code||'-'}</td><td>${item.name||'-'}</td><td><small>${cgDeptLabel}</small></td><td>${actions(item)}</td></tr>`;
      case 'distribution_group':
        const memberEmails = (item.members || '').split(',').map(e => e.trim()).filter(Boolean);
        const memberNames = memberEmails.length
          ? memberEmails.map(email => {
              const u = (App.data.userDirectory || []).find(u => u.email === email);
              return u ? u.name : email;
            }).join(', ')
          : '-';
        return `<tr><td>${item.name||'-'}</td><td><small>${memberNames}</small></td><td>${actions(item)}</td></tr>`;
      case 'retention': return `<tr><td>${item.name||'-'}</td><td>${item.duration_years||'-'}</td><td>${item.description||'-'}</td><td>${actions(item)}</td></tr>`;
      case 'revision_reason': return `<tr><td>${item.code||'-'}</td><td>${item.name||'-'}</td><td>${item.description||'-'}</td><td>${actions(item)}</td></tr>`;
      default: return '';
    }
  };

  renderListOrCards(tbodyMap[type], data, renderRow, '<tr><td colspan="10" class="text-center text-muted py-3">No data</td></tr>', 10);
}

// Helper: generate UUID v4 di client side (preview saja, server tetap generate final)
function generateClientUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback untuk browser lama
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Shared ID field HTML (readonly, selalu tampil di semua form)
function renderIdField(idValue, isEdit) {
  const label = isEdit
    ? `ID <i class="bi bi-lock-fill text-secondary" style="font-size:0.7rem" title="ID tidak dapat diubah"></i>`
    : `ID <span class="badge bg-secondary" style="font-size:0.65rem;vertical-align:middle">Auto</span>`;
  return `
    <div class="mb-3">
      <label class="form-label">${label}</label>
      <input type="text" class="form-control form-control-sm font-monospace" id="m-id"
        value="${idValue}" readonly tabindex="-1"
        style="background:#f8f9fa;cursor:not-allowed;color:#6c757d;font-size:0.78rem;letter-spacing:0.03em"
        title="${isEdit ? 'ID record, tidak dapat diubah' : 'ID akan di-generate otomatis oleh sistem'}">
    </div>`;
}

function filterCircleGroupOptionsForArea() {
  const deptCode = document.getElementById('m-area-dept-filter')?.value || '';
  const cgSelect = document.getElementById('m-circle-group');
  if (!cgSelect) return;
  const currentVal = cgSelect.value;

  let cgList = App.data.circleGroups || [];
  if (deptCode) {
    const dept = (App.data.departments || []).find(d => d.code === deptCode);
    const allowedCodes = (dept && dept.circle_groups)
      ? dept.circle_groups.split(',').map(c => c.trim()).filter(Boolean)
      : [];
    cgList = cgList.filter(cg => allowedCodes.includes(cg.code));
  }

  cgSelect.innerHTML = '<option value="">-- Pilih Circle Group --</option>' +
    cgList.map(cg => `<option value="${cg.code}" ${cg.code === currentVal ? 'selected' : ''}>${cg.name} (${cg.code})</option>`).join('');
}

function openMasterModal(type, id) {
  App.masterType = type;
  App.masterEditId = id || null;

  const isEdit = !!id;

  const titleMap = {
    'category': 'Document Category',
    'department': 'Department',
    'area': 'Area',
    'circle_group': 'Circle Group',  // ← BARU
    'distribution_group': 'Distribution Group',
    'retention': 'Retention Period',
    'revision_reason': 'Revision Reason'
  };

  document.getElementById('master-modal-title').textContent = (isEdit ? 'Edit' : 'Add') + ' ' + (titleMap[type]||type);

  const previewId = isEdit ? (id) : generateClientUUID();
  const idFieldHtml = renderIdField(previewId, isEdit);

  const formMap = {
    'category': `
      ${idFieldHtml}
      <div class="mb-3"><label class="form-label">Code *</label><input type="text" class="form-control" id="m-code" placeholder="e.g. SOP"></div>
      <div class="mb-3"><label class="form-label">Name *</label><input type="text" class="form-control" id="m-name"></div>
      <div class="mb-3"><label class="form-label">Tipe Form *</label>
        <select class="form-select" id="m-form-type">
          <option value="non_standard">Non-Standar (pakai Registrasi Dokumen 2)</option>
          <option value="standard">Standar (pakai Registrasi Dokumen 1, field bisa dikustom)</option>
        </select>
      </div>
      <div class="mb-3"><label class="form-label">Description</label><textarea class="form-control" id="m-desc" rows="2"></textarea></div>`,
    'department': `
      ${idFieldHtml}
      <div class="mb-3"><label class="form-label">Code *</label><input type="text" class="form-control" id="m-code"></div>
      <div class="mb-3"><label class="form-label">Name *</label><input type="text" class="form-control" id="m-name"></div>
      <div class="mb-3"><label class="form-label">Head Email</label><input type="email" class="form-control" id="m-head"></div>
      <div class="mb-3"><label class="form-label">Reviewer 1 Email (Atasan Langsung) <small class="text-muted">- untuk flow review dokumen</small></label>
        <select class="form-select" id="m-reviewer1">
          <option value="">-- Pilih User --</option>
          ${(App.data.userDirectory||[]).slice().sort((a,b)=>(a.name||a.email).localeCompare(b.name||b.email))
            .map(u=>`<option value="${u.email}">${u.name || u.email} (${u.email})</option>`).join('')}
        </select>
      </div>
      <div class="mb-3"><label class="form-label">Circle Groups <small class="text-muted">(select multiple)</small></label>
        <select class="form-select" id="m-circle-groups" multiple style="height:120px">
          ${(App.data.circleGroups||[]).map(cg=>`<option value="${cg.code}">${cg.name} (${cg.code})</option>`).join('')}
        </select>
        <div class="form-text">Hold Ctrl/Cmd to select multiple circle groups</div>
      </div>
      <div class="mb-3"><label class="form-label">Description</label><textarea class="form-control" id="m-desc" rows="2"></textarea></div>`,
    'area': `
      ${idFieldHtml}
      <div class="mb-3"><label class="form-label">Code *</label><input type="text" class="form-control" id="m-code"></div>
      <div class="mb-3"><label class="form-label">Name *</label><input type="text" class="form-control" id="m-name"></div>
      <div class="mb-3"><label class="form-label">Department <small class="text-muted">(untuk memfilter pilihan Circle Group di bawah)</small></label>
        <select class="form-select" id="m-area-dept-filter" onchange="filterCircleGroupOptionsForArea()">
          <option value="">-- Semua Department --</option>${
            (App.data.departments||[]).map(d=>`<option value="${d.code}">${d.name}</option>`).join('')
          }</select>
      </div>
      <div class="mb-3"><label class="form-label">Circle Group *</label>
        <select class="form-select" id="m-circle-group">
          <option value="">-- Pilih Circle Group --</option>${
            (App.data.circleGroups||[]).map(cg=>`<option value="${cg.code}">${cg.name} (${cg.code})</option>`).join('')
          }</select>
      </div>
      <div class="mb-3"><label class="form-label">Description</label><textarea class="form-control" id="m-desc" rows="2"></textarea></div>`,
    'circle_group': `
      ${idFieldHtml}
      <div class="mb-3"><label class="form-label">Code *</label><input type="text" class="form-control" id="m-code" placeholder="e.g. CG001"></div>
      <div class="mb-3"><label class="form-label">Name *</label><input type="text" class="form-control" id="m-name" placeholder="e.g. Quality Assurance"></div>`,
    // SESUDAH
    'distribution_group': `
      ${idFieldHtml}
      <div class="mb-3"><label class="form-label">Name *</label><input type="text" class="form-control" id="m-name"></div>
      <div class="mb-3"><label class="form-label">Description</label><textarea class="form-control" id="m-desc" rows="2"></textarea></div>
      <div class="mb-3"><label class="form-label">Members <small class="text-muted">(select multiple)</small></label>
        <select class="form-select" id="m-members" multiple style="height:160px">
          ${(App.data.userDirectory||[]).slice().sort((a,b)=>(a.name||a.email).localeCompare(b.name||b.email))
            .map(u=>`<option value="${u.email}">${u.name || u.email} (${u.email})</option>`).join('')}
        </select>
        <div class="form-text">Hold Ctrl/Cmd to select multiple members</div>
      </div>`,
    'retention': `
      ${idFieldHtml}
      <div class="mb-3"><label class="form-label">Name *</label><input type="text" class="form-control" id="m-name" placeholder="e.g. 5 Years"></div>
      <div class="mb-3"><label class="form-label">Duration (Years) *</label><input type="number" class="form-control" id="m-duration" min="1"></div>
      <div class="mb-3"><label class="form-label">Description</label><textarea class="form-control" id="m-desc" rows="2"></textarea></div>`,
    'revision_reason': `
      ${idFieldHtml}
      <div class="mb-3"><label class="form-label">Code *</label><input type="text" class="form-control" id="m-code"></div>
      <div class="mb-3"><label class="form-label">Name *</label><input type="text" class="form-control" id="m-name"></div>
      <div class="mb-3"><label class="form-label">Description</label><textarea class="form-control" id="m-desc" rows="2"></textarea></div>`
  };

  document.getElementById('master-modal-body').innerHTML = formMap[type] || '';

  // Populate form jika mode edit
  if (isEdit) {
    const cacheKey = MASTER_CACHE_KEY[type];
    const cachedList = cacheKey ? (App.data[cacheKey] || []) : [];
    const item = cachedList.find(r => r.id === id);
    if (item) {
      const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
      const elId = document.getElementById('m-id');
      if (elId) elId.value = item.id || id;
      setVal('m-code', item.code);
      setVal('m-name', item.name);
      setVal('m-desc', item.description);
      setVal('m-form-type', item.form_type || 'non_standard');
      setVal('m-head', item.head_email);
      setVal('m-reviewer1', item.reviewer1_email);
      setVal('m-duration', item.duration_years);

      // Area: tentukan department filter dari circle_group (reverse lookup), lalu isi Circle Group
      if (type === 'area') {
        const parentDept = (App.data.departments || []).find(d =>
          (d.circle_groups || '').split(',').map(c => c.trim()).includes(item.circle_group)
        );
        setVal('m-area-dept-filter', parentDept ? parentDept.code : '');
        filterCircleGroupOptionsForArea();
        setVal('m-circle-group', item.circle_group);
      }
      // TAMBAHAN
      const membersEl = document.getElementById('m-members');
      if (membersEl) {
        const memberEmails = (item.members || '').split(',').map(m => m.trim()).filter(Boolean);
        Array.from(membersEl.options).forEach(opt => { opt.selected = memberEmails.includes(opt.value); });
      }
      
      // Multi-select untuk circle_groups di department
      if (type === 'department' && item.circle_groups) {
        const cgCodes = item.circle_groups.split(',').map(c => c.trim());
        const cgSelect = document.getElementById('m-circle-groups');
        if (cgSelect) {
          for (const opt of cgSelect.options) {
            opt.selected = cgCodes.includes(opt.value);
          }
        }
      }
    }
  }

  getModal('masterModal').show();
}

async function saveMasterData() {
  const type = App.masterType;
  const name = document.getElementById('m-name')?.value?.trim();
  
  if (!name) {
    toast('Name wajib diisi', 'warning');
    return;
  }
  
  // Validasi per tipe
  if (['category', 'revision_reason', 'circle_group'].includes(type)) {
    const code = document.getElementById('m-code')?.value?.trim();
    if (!code) {
      toast('Code wajib diisi', 'warning');
      return;
    }
  }
  
  if (type === 'retention') {
    const dur = document.getElementById('m-duration')?.value;
    if (!dur || isNaN(dur) || parseInt(dur) < 1) {
      toast('Duration harus angka positif', 'warning');
      return;
    }
  }

  if (type === 'area') {
    const cg = document.getElementById('m-circle-group')?.value?.trim();
    if (!cg) {
      toast('Circle Group wajib dipilih', 'warning');
      return;
    }
  }
  
  const data = {
    id: App.masterEditId || null,
    code: document.getElementById('m-code')?.value?.trim() || '',
    name,
    description: document.getElementById('m-desc')?.value?.trim() || '',
    head_email: document.getElementById('m-head')?.value?.trim() || '',
    reviewer1_email: document.getElementById('m-reviewer1')?.value?.trim() || '',
    duration_years: document.getElementById('m-duration')?.value?.trim() || '',
    circle_group: document.getElementById('m-circle-group')?.value?.trim() || '',
    circle_groups: '',
    form_type: document.getElementById('m-form-type')?.value || undefined
  };

  // Handle multi-select circle_groups
  const cgSelect = document.getElementById('m-circle-groups');
  if (cgSelect) {
    const selected = Array.from(cgSelect.selectedOptions).map(opt => opt.value);
    data.circle_groups = selected.join(', ');
  }

  // TAMBAHAN
  const membersEl = document.getElementById('m-members');
  if (membersEl) {
    data.members = Array.from(membersEl.selectedOptions).map(opt => opt.value).filter(Boolean).join(',');
  }
  
  if (!data.id) delete data.id;
  
  showLoader();
  try {
    const res = await gasCall('apiSaveMasterData', type, data);
    if (res && res.error) {
      toast(res.error, 'error');
      return;
    }
    
    getModal('masterModal').hide();
    toast(App.masterEditId ? 'Data berhasil diupdate' : 'Data berhasil ditambahkan', 'success');
    loadMaster(type);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

async function deleteMaster(type, id) {
  const cacheKey = MASTER_CACHE_KEY[type];
  const cachedList = cacheKey ? (App.data[cacheKey] || []) : [];
  const item = cachedList.find(r => r.id === id);
  const label = item ? ` "${item.name}"` : '';
  const okDel = await showConfirm({
  title: 'Hapus Data', subtitle: 'Data tidak dapat dipulihkan setelah dihapus',
  message: `Yakin ingin menghapus item <strong>${label}</strong>?`,
  okText: 'Hapus', cancelText: 'Batal', type: 'danger'});
  if (!okDel) return;
  showLoader();
  try {
    const res = await gasCall('apiDeleteMasterData', type, id);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Data berhasil dihapus', 'success');
    loadMaster(type);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// CATEGORY FIELD MANAGER (Field Dinamis untuk Registrasi Dokumen 1)
// ============================================================
let cfCurrentCategoryId = null;

async function openCategoryFieldManager(categoryId, categoryName) {
  cfCurrentCategoryId = categoryId;
  document.getElementById('cf-modal-category-name').textContent = categoryName || '';
  document.getElementById('cf-category-id').value = categoryId;
  document.getElementById('cf-form-container').style.display = 'none';
  await loadCategoryFields(categoryId);
  getModal('categoryFieldModal').show();
}

async function loadCategoryFields(categoryId) {
  showLoader();
  try {
    const res = await gasCall('apiGetCategoryFields', categoryId);
    const fields = (res && res.data) || [];
    App.data.categoryFields = fields;
    const tbody = document.getElementById('cf-list-tbody');
    if (!fields.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Belum ada field</td></tr>';
      return;
    }
    tbody.innerHTML = fields.map(f => `<tr>
      <td>${f.field_label}</td>
      <td><code>${f.field_key}</code></td>
      <td>${f.field_type}</td>
      <td>${(f.is_required == 1 || f.is_required === true) ? 'Ya' : 'Tidak'}</td>
      <td>${f.sort_order || 0}</td>
      <td>
        <button class="btn btn-xs btn-outline-secondary" style="font-size:11px;padding:2px 8px" onclick="openCategoryFieldForm('${f.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-xs btn-outline-danger" style="font-size:11px;padding:2px 8px" onclick="deleteCategoryField('${f.id}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`).join('');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

function openCategoryFieldForm(fieldId) {
  document.getElementById('cf-form-container').style.display = '';
  document.getElementById('cf-id').value = '';
  document.getElementById('cf-field-label').value = '';
  document.getElementById('cf-field-key').value = '';
  document.getElementById('cf-field-type').value = 'text';
  document.getElementById('cf-is-required').value = '0';
  document.getElementById('cf-sort-order').value = '0';
  document.getElementById('cf-options').value = '';

  if (fieldId) {
    const f = (App.data.categoryFields || []).find(x => x.id === fieldId);
    if (f) {
      document.getElementById('cf-id').value = f.id;
      document.getElementById('cf-field-label').value = f.field_label || '';
      document.getElementById('cf-field-key').value = f.field_key || '';
      document.getElementById('cf-field-type').value = f.field_type || 'text';
      document.getElementById('cf-is-required').value = String(f.is_required == 1 || f.is_required === true ? 1 : 0);
      document.getElementById('cf-sort-order').value = f.sort_order || 0;
      document.getElementById('cf-options').value = f.options || '';
    }
  }
  onCfFieldTypeChange();
}

// BARU: toggle & ganti label kolom "Opsi" sesuai tipe field yang dipilih
function onCfFieldTypeChange() {
  const type = document.getElementById('cf-field-type').value;
  const wrap = document.getElementById('cf-options-wrap');
  const label = document.getElementById('cf-options-label');
  const hint = document.getElementById('cf-options-hint');
  const input = document.getElementById('cf-options');
  if (type === 'select') {
    wrap.style.display = '';
    label.textContent = 'Opsi (khusus tipe Select)';
    hint.textContent = 'pisahkan dengan koma, contoh: Opsi A, Opsi B';
    input.placeholder = 'Opsi A, Opsi B, Opsi C';
  } else if (type === 'table') {
    wrap.style.display = '';
    label.textContent = 'Kolom Tabel (khusus tipe Tabel)';
    hint.textContent = 'nama-nama kolom tabel, pisahkan dengan koma, sesuai urutan';
    input.placeholder = 'Jenis Ancaman, Contoh';
  } else {
    wrap.style.display = 'none';
  }
}

async function saveCategoryField() {
  const label = document.getElementById('cf-field-label').value.trim();
  const key = document.getElementById('cf-field-key').value.trim().replace(/\s+/g, '_');
  if (!label || !key) { toast('Label dan Key wajib diisi', 'warning'); return; }

  const data = {
    id: document.getElementById('cf-id').value || null,
    category_id: cfCurrentCategoryId,
    field_key: key,
    field_label: label,
    field_type: document.getElementById('cf-field-type').value,
    is_required: document.getElementById('cf-is-required').value,
    sort_order: document.getElementById('cf-sort-order').value,
    options: document.getElementById('cf-options').value.trim()
  };
  if (!data.id) delete data.id;

  showLoader();
  try {
    const res = await gasCall('apiSaveCategoryField', data);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Field berhasil disimpan', 'success');
    document.getElementById('cf-form-container').style.display = 'none';
    await loadCategoryFields(cfCurrentCategoryId);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

async function deleteCategoryField(id) {
  const okDel = await showConfirm({
    title: 'Hapus Field', subtitle: 'Data tidak dapat dipulihkan',
    message: 'Yakin ingin menghapus field ini? Nilai yang sudah tersimpan di dokumen lama tidak akan ikut terhapus.',
    okText: 'Hapus', cancelText: 'Batal', type: 'danger'});
  if (!okDel) return;
  showLoader();
  try {
    const res = await gasCall('apiDeleteCategoryField', id);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Field berhasil dihapus', 'success');
    await loadCategoryFields(cfCurrentCategoryId);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// USER MANAGEMENT
// ============================================================
function onUserRoleChange() {
  const role = document.getElementById('user-role').value;
  const roleHint = document.getElementById('user-role-hint');
  const deptHint = document.getElementById('user-dept-hint');

  const hints = {
    'REVIEWER': {
      role: '<i class="bi bi-info-circle text-primary me-1"></i>User ini akan muncul sebagai pilihan <strong>Reviewer</strong> di form New Document.',
      dept: '<i class="bi bi-exclamation-circle text-warning me-1"></i><strong>Wajib diisi</strong> — menentukan di department mana user ini tampil sebagai Reviewer.'
    },
    'APPROVER': {
      role: '<i class="bi bi-info-circle text-primary me-1"></i>User ini akan muncul sebagai pilihan <strong>Approver</strong> di form New Document.',
      dept: '<i class="bi bi-exclamation-circle text-warning me-1"></i><strong>Wajib diisi</strong> — menentukan di department mana user ini tampil sebagai Approver.'
    },
    'DEPARTMENT_HEAD': {
      role: '<i class="bi bi-info-circle text-primary me-1"></i>Department Head dapat muncul sebagai Reviewer <strong>dan</strong> Approver di departmentnya.',
      dept: '<i class="bi bi-exclamation-circle text-warning me-1"></i><strong>Wajib diisi</strong> — menentukan department yang dipimpin.'
    }
  };

  if (hints[role]) {
    roleHint.innerHTML = hints[role].role;
    deptHint.innerHTML = hints[role].dept;
  } else {
    roleHint.innerHTML = '';
    deptHint.innerHTML = '';
  }
}

function openUserModal(elOrId, email, name, role, dept, status, cg) {
  if (elOrId && elOrId.dataset) {
    const d = elOrId.dataset;
    email  = d.email  || '';
    name   = d.name   || '';
    role   = d.role   || 'USER';
    dept   = d.dept   || '';
    status = d.status || 'Active';
    cg     = d.cg     || '';
    elOrId = d.id     || '';
  }
  const id = elOrId || '';
  document.getElementById('user-id').value     = id;
  document.getElementById('user-email').value  = email  || '';
  document.getElementById('user-name').value   = name   || '';
  document.getElementById('user-role').value   = role   || 'USER';
  document.getElementById('user-dept').value   = dept   || '';
  document.getElementById('user-status').value = status || 'Active';

  const userCgSel = document.getElementById('user-cg');
  if (userCgSel) {
    userCgSel.innerHTML = '<option value="">Select...</option>' +
      (App.data.circleGroups || []).map(c => `<option value="${c.code}" ${c.code === (cg||'') ? 'selected' : ''}>${c.name} (${c.code})</option>`).join('');
  }

  // Disable email jika edit
  const emailInput = document.getElementById('user-email');
  const pwSection = document.getElementById('user-password-section');
  const pwInput = document.getElementById('user-password');
  if (id) {
    pwSection.style.display = 'none';
    pwInput.value = '';
  } else {
    pwSection.style.display = 'block';
    pwInput.value = '';
  }
  emailInput.readOnly = !!id;
  emailInput.style.background = id ? '#f8f9fa' : '';

  document.getElementById('user-modal-title').textContent = id ? 'Edit User' : 'Add User';
  onUserRoleChange();
  getModal('userModal').show();
}

// BARU
async function saveUser() {
  const email = document.getElementById('user-email').value.trim();
  const name = document.getElementById('user-name').value.trim();
  const userId = document.getElementById('user-id').value;
  const password = document.getElementById('user-password').value;

  if (!email || !name) {
    toast('Email dan nama wajib diisi', 'warning');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    toast('Format email tidak valid', 'warning');
    return;
  }

  // Validasi password hanya saat Add baru
  if (!userId) {
    if (!password || password.length < 6) {
      toast('Password wajib diisi minimal 6 karakter', 'warning');
      return;
    }
  }

  showLoader();
  try {
    const res = await gasCall('apiSaveUser', {
      id: userId || null,
      email,
      name,
      role: document.getElementById('user-role').value,
      department: document.getElementById('user-dept').value,
      circle_group: document.getElementById('user-cg').value,
      status: document.getElementById('user-status').value,
      password: userId ? null : password
    });
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast(userId ? 'Pengguna berhasil diperbarui' : 'Pengguna berhasil dibuat', 'success');
    getModal('userModal').hide();
    loadUsers();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}
async function deleteUser(id) {
  const okDelUser = await showConfirm({
  title: 'Hapus User', subtitle: 'Data tidak dapat dipulihkan',
  message: 'Yakin ingin menghapus user ini dari sistem?',
  okText: 'Hapus', cancelText: 'Batal', type: 'danger'});
  if (!okDelUser) return;
  showLoader();
  try {
    const res = await gasCall('apiDeleteUser', id);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Pengguna berhasil dihapus', 'success');
    loadUsers();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// PERMISSIONS
// ============================================================
const MENUS = [
  {id:'dashboard',         label:'Dasbor',                 group:'General'},
  {id:'master_data',       label:'Data Master',            group:'Master Data'},
  {id:'document_register', label:'Registrasi Dokumen',     group:'Transaction'},
  {id:'new_document_standard', label:'Registrasi Dokumen 1', group:'Transaction'},
  {id:'new_document',      label:'Registrasi Dokumen 2',   group:'Transaction'},
  {id:'review',            label:'Review',                 group:'Transaction'},
  {id:'approval',          label:'Persetujuan',            group:'Transaction'},
  {id:'change_request',    label:'Permintaan Perubahan',   group:'Transaction'},
  {id:'revision',          label:'Revisi',                 group:'Transaction'},
  {id:'distribution',      label:'Distribusi',             group:'Transaction'},
  {id:'read_acknowledgement',label:'Konfirmasi Compliance',      group:'Transaction'},
  {id:'monitoring',        label:'Pemantauan',             group:'Monitoring'},
  {id:'reports',           label:'Laporan',                group:'Reports'},
  {id:'administration',    label:'Administrasi',           group:'Administration'},
  {id:'user_management',   label:'Manajemen Pengguna',     group:'Administration'},
  {id:'role_management',   label:'Manajemen Peran',        group:'Administration'},
  {id:'audit_trail',       label:'Jejak Audit',            group:'Administration'},
  {id:'data_import',       label:'Import Data',            group:'Administration'},
];

let currentPermData = {};

async function loadPermissions() {
  const role = document.getElementById('perm-role-select').value;
  if (!role) return;

  showLoader();
  try {
    const res = await gasCall('apiGetPermissions', role);
    if (res && res.error) { toast(res.error, 'error'); return; }

    currentPermData = {};
    (res.data||[]).forEach(p => { currentPermData[p.menu] = p; });

    const isSuperAdmin = role === 'SUPER_ADMIN';
    const FIELDS = ['can_view','can_create','can_edit','can_delete','can_approve','can_export','can_print'];
    const COLS = 7;

    // Reset select-all header checkboxes
    FIELDS.forEach(f => {
      const el = document.getElementById('chk-all-' + f);
      if (el) { el.checked = false; el.disabled = isSuperAdmin; }
    });

    let lastGroup = null;
    const rows = MENUS.map(menu => {
      const p = isSuperAdmin
        ? Object.fromEntries(FIELDS.map(f => [f, 1]))
        : (currentPermData[menu.id] || {});
      const dis = isSuperAdmin ? 'disabled' : '';
      const chk = (f) => (p[f] == 1 || p[f] === true) ? 'checked' : '';

      let groupRow = '';
      if (menu.group !== lastGroup) {
        lastGroup = menu.group;
        groupRow = `<tr class="table-light"><td colspan="${COLS + 1}"><small class="fw-semibold text-muted text-uppercase" style="letter-spacing:.05em">${menu.group}</small></td></tr>`;
      }

      const allChecked = FIELDS.every(f => p[f] == 1 || p[f] === true);
      return groupRow + `<tr>
        <td>
          <div class="d-flex align-items-center gap-2">
            <input type="checkbox" class="form-check-input chk-row" ${dis}
              ${allChecked ? 'checked' : ''}
              onchange="toggleAllRow('${menu.id}', this.checked)"
              title="Select all for ${menu.label}">
            ${menu.label}
          </div>
        </td>
        ${FIELDS.map(f =>
          `<td class="text-center"><input type="checkbox" class="form-check-input" data-menu="${menu.id}" data-field="${f}" ${chk(f)} ${dis}></td>`
        ).join('')}
      </tr>`;
    }).join('');

    document.getElementById('perm-tbody').innerHTML = rows;

    const saveBtn = document.querySelector('#perm-table-container .btn-primary');
    if (saveBtn) saveBtn.style.display = isSuperAdmin ? 'none' : '';

    if (isSuperAdmin) {
      const notice = document.getElementById('super-admin-notice');
      if (notice) notice.style.display = 'block';
    } else {
      const notice = document.getElementById('super-admin-notice');
      if (notice) notice.style.display = 'none';
    }

    document.getElementById('perm-table-container').style.display = 'block';
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

async function savePermissions() {
  const role = document.getElementById('perm-role-select').value;
  if (!role || role === 'SUPER_ADMIN') return;

  const checkboxes = document.querySelectorAll('#perm-tbody input[type=checkbox][data-menu]');
  const permData = {};
  checkboxes.forEach(cb => {
    const menu = cb.dataset.menu;
    const field = cb.dataset.field;
    if (!menu || !field) return;
    if (!permData[menu]) permData[menu] = { role, menu };
    permData[menu][field] = cb.checked ? 1 : 0;
  });

  showLoader();
  try {
    const res = await gasCall('apiSavePermissions', Object.values(permData));
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Hak akses berhasil disimpan', 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

function toggleAllCol(field, checked) {
  document.querySelectorAll(`#perm-tbody input[data-field="${field}"]`).forEach(cb => {
    if (!cb.disabled) cb.checked = checked;
  });
}

function toggleAllRow(menuId, checked) {
  document.querySelectorAll(`#perm-tbody input[data-menu="${menuId}"]`).forEach(cb => {
    if (!cb.disabled) cb.checked = checked;
  });
}

// ============================================================
// EMAIL SETTINGS
// ============================================================
async function loadEmailSettings() {
  showLoader();
  try {
    const res = await gasCall('apiGetEmailSettings');
    if (res && res.error) return;
    const tbody = document.getElementById('tbody-email');
    const emailRowFn = s => {
      const activeB = s.is_active == 1 ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>';
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div>
              <span class="badge bg-info text-dark" style="font-size:10px">${s.event||'-'}</span>
              <div class="mobile-card-title mt-1" style="font-size:13px">${s.template_subject||'-'}</div>
            </div>
            ${activeB}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-person"></i>${s.recipient_type||'-'}${s.cc_emails ? ' +cc' : ''}</span>
            <span><i class="bi bi-info-circle"></i>${s.trigger_description||'-'}</span>
          </div>
          <div class="mobile-card-actions">
            <button class="btn btn-outline-primary btn-sm" onclick='openEmailSettingModal(${JSON.stringify(s)})'><i class="bi bi-pencil me-1"></i>Edit</button>
          </div>
        </div>`;
      return `<tr>
        <td><span class="badge bg-info text-dark" style="font-size:10px">${s.event||'-'}</span></td>
        <td><small class="text-muted">${s.trigger_description||'-'}</small></td>
        <td><small>${s.recipient_type||'-'}${s.cc_emails ? ' <span class="text-muted">+cc</span>' : ''}</small></td>
        <td>${s.template_subject||'-'}</td>
        <td>${activeB}</td>
        <td><button class="btn btn-xs btn-outline-primary" style="font-size:11px;padding:2px 8px" onclick='openEmailSettingModal(${JSON.stringify(s)})'><i class="bi bi-pencil"></i> Edit</button></td>
      </tr>`;
    };
    renderListOrCards('tbody-email', res.data||[], emailRowFn, '<tr><td colspan="6" class="text-center text-muted py-3">No settings</td></tr>', 6);
  } catch(e) {} finally { hideLoader(); }
}

function escHtml(str) {
  return (str||'').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function openEmailSettingModal(s) {
  document.getElementById('email-setting-id').value              = s.id;
  document.getElementById('email-setting-event').value           = s.event;
  document.getElementById('email-setting-trigger-desc').textContent = s.trigger_description || '-';
  document.getElementById('email-setting-recipient').value       = s.recipient_type || '';
  document.getElementById('email-setting-cc').value              = s.cc_emails || '';
  document.getElementById('email-setting-subject').value         = (s.template_subject || '').replace(/\\n/g,'\n');
  document.getElementById('email-setting-body').value            = (s.template_body    || '').replace(/\\n/g,'\n');
  document.getElementById('email-setting-active').checked        = s.is_active == 1;
  getModal('emailSettingModal').show();
}

async function saveEmailSetting() {
  showLoader();
  try {
    const res = await gasCall('apiSaveEmailSetting', {
      id:               document.getElementById('email-setting-id').value,
      event:            document.getElementById('email-setting-event').value,
      cc_emails:        document.getElementById('email-setting-cc').value.trim(),
      template_subject: document.getElementById('email-setting-subject').value,
      template_body:    document.getElementById('email-setting-body').value,
      is_active:        document.getElementById('email-setting-active').checked ? 1 : 0
    });
    if (res && res.error) { toast(res.error, 'error'); return; }
    getModal('emailSettingModal').hide();
    toast('Pengaturan email berhasil disimpan', 'success');
    loadEmailSettings();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

async function loadNotificationLog() {
  showLoader();
  try {
    const filters = {
      type:            document.getElementById('notif-filter-type').value,
      recipient_email: document.getElementById('notif-filter-email').value,
      status:          document.getElementById('notif-filter-status').value
    };
    const res = await gasCall('apiGetNotifications', filters);
    if (res && res.error) { toast(res.error, 'error'); return; }
    const tbody = document.getElementById('tbody-notif-log');
    const notifRowFn = n => {
      const statusBadgeN = n.status === 'Sent'   ? '<span class="badge bg-success">Sent</span>'
                         : n.status === 'Resent' ? '<span class="badge bg-primary">Resent</span>'
                         :                         '<span class="badge bg-danger">Failed</span>';
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div><div class="mobile-card-title" style="font-size:13px">${n.subject||'-'}</div>
              <small class="text-muted">${n.recipient_email||'-'}</small>
            </div>
            ${statusBadgeN}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-bell"></i><span class="badge bg-info text-dark" style="font-size:10px">${n.type||'-'}</span></span>
            <span><i class="bi bi-calendar3"></i>${fmtDateTime(n.created_at)}</span>
          </div>
          <div class="mobile-card-actions">
            <button class="btn btn-outline-warning btn-sm" onclick="resendNotification('${n.id}','${(n.recipient_email||'').replace(/'/g,"\\'")}')">
              <i class="bi bi-send me-1"></i>Resend
            </button>
          </div>
        </div>`;
      return `<tr>
        <td style="white-space:nowrap"><small>${fmtDateTime(n.created_at)}</small></td>
        <td><span class="badge bg-info text-dark" style="font-size:10px">${n.type||'-'}</span></td>
        <td><small>${n.recipient_email||'-'}</small></td>
        <td><small>${n.subject||'-'}</small></td>
        <td>${statusBadgeN}</td>
        <td><button class="btn btn-xs btn-outline-warning" style="font-size:11px;padding:2px 8px"
            onclick="resendNotification('${n.id}','${(n.recipient_email||'').replace(/'/g,"\\'")}')">
            <i class="bi bi-send me-1"></i>Resend</button></td>
      </tr>`;
    };
    renderListOrCards('tbody-notif-log', res.data||[], notifRowFn, '<tr><td colspan="6" class="text-center text-muted py-3">Tidak ada notifikasi</td></tr>', 6);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

async function resendNotification(notifId, recipientEmail) {
  const ok = await showConfirm({
    title: 'Resend Notification',
    message: `Kirim ulang email ke <strong>${recipientEmail}</strong>?`,
    okText: 'Kirim', cancelText: 'Batal', type: 'primary'
  });
  if (!ok) return;
  showLoader();
  try {
    const res = await gasCall('apiResendNotification', notifId);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast(res.message || 'Email berhasil dikirim ulang', 'success');
    loadNotificationLog();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// AUDIT TRAIL
// ============================================================
async function loadAuditTrail() {
  showLoader();
  try {
    const filters = {
      user: document.getElementById('audit-filter-user').value,
      action: document.getElementById('audit-filter-action').value
    };
    const res = await gasCall('apiGetAuditTrail', filters);
    if (res && res.error) return;
    const tbody = document.getElementById('tbody-audit');
    const auditRowFn = t => {
      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div><span class="badge bg-secondary" style="font-size:10px">${t.action||'-'}</span>
              <div class="mobile-card-title mt-1" style="font-size:13px">${t.module||'-'}</div>
            </div>
            <small class="text-muted" style="white-space:nowrap;font-size:11px">${fmtDateTime(t.datetime)}</small>
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-person"></i>${t.user_email||'-'}</span>
            <span><i class="bi bi-hash"></i>${(t.record_id||'').slice(0,12)}${t.record_id && t.record_id.length > 12 ? '...' : ''}</span>
          </div>
          ${t.notes ? `<div style="font-size:12px;color:var(--text-muted);padding-top:6px;border-top:1px solid var(--border-light);margin-top:4px">${t.notes}</div>` : ''}
        </div>`;
      return `<tr>
        <td style="white-space:nowrap">${fmtDateTime(t.datetime)}</td>
        <td><small>${t.user_email||'-'}</small></td>
        <td><span class="badge bg-secondary" style="font-size:10px">${t.action||'-'}</span></td>
        <td>${t.module||'-'}</td>
        <td><small class="text-muted">${(t.record_id||'').slice(0,12)}${t.record_id && t.record_id.length > 12 ? '...' : ''}</small></td>
        <td>${t.notes||'-'}</td>
      </tr>`;
    };
    renderListOrCards('tbody-audit', res.data||[], auditRowFn, '<tr><td colspan="6" class="text-center text-muted py-3">No audit records</td></tr>', 6);
  } catch(e) {} finally { hideLoader(); }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  showLoader();
  splashStep(0);

  // Set user info
  const _su = document.getElementById('sidebar-user');
  const _tn = document.getElementById('topbar-name');
  if (_su) _su.textContent = App.user.name || App.user.email;
  if (_tn) _tn.textContent = App.user.name || App.user.email;
  document.getElementById('topbar-role').textContent  = App.user.role || 'USER';
  document.getElementById('user-avatar').textContent  = (App.user.name || App.user.email || '?')[0].toUpperCase();

  // Tampilkan menu Download Source Code hanya untuk SUPER_ADMIN
  if (App.user.role === 'SUPER_ADMIN') {
    const menuDl = document.getElementById('menu-download-source');
    if (menuDl) menuDl.style.display = '';
    const menuImport = document.getElementById('menu-data-import');
    if (menuImport) menuImport.style.display = '';
  }

  // Sembunyikan semua menu dulu sampai permission selesai dimuat
  if (App.user.role !== 'SUPER_ADMIN') {
    document.querySelectorAll('#sidebar li[data-menu]').forEach(li => li.style.display = 'none');
  }

  startSessionHeartbeat();
  setInterval(loadNotificationBadges, 120000);

  // Load master data & permission paralel
  splashStep(1);
  const [masterRes, permRes, , dirRes] = await Promise.allSettled([
    gasCall('apiGetAllMasterData'),
    gasCall('apiGetMyPermissions'),
    loadNotificationBadges(),
    gasCall('apiGetUserDirectory')
  ]);

  // Apply master data
  try {
    const res = masterRes.value;
    if (res && res.success && res.data) {
      App.data.categories         = res.data.categories   || [];
      App.data.departments        = res.data.departments  || [];
      App.data.areas              = res.data.areas        || [];
      App.data.circleGroups       = res.data.circleGroups || [];
      App.data.retentions         = res.data.retentions   || [];
      App.data.revReasons         = res.data.revReasons   || [];
      App.data.distributionGroups = res.data.distGroups   || [];
      App.data.users              = res.data.users        || [];
    }
  } catch(e) { console.warn('Master data preload failed:', e); }

  // Apply user directory (untuk dropdown Members / Recipient Emails)
  try {
    const dir = dirRes.value;
    if (dir && dir.success && dir.data) {
      App.data.userDirectory = dir.data;
    }
  } catch(e) { console.warn('User directory preload failed:', e); }

  // Apply permissions ke sidebar
  splashStep(2);
  try {
    const perm = permRes.value;
    if (perm && perm.success) {
      App.perms = {};
      (perm.data || []).forEach(p => { App.perms[p.menu] = p; });
    }
  } catch(e) { console.warn('Permission load failed:', e); }
  applyPermissionsToSidebar();

  // Load dashboard lalu tutup splash
  splashStep(3);
  await loadDashboard().catch(e => console.warn('Dashboard load failed:', e));
  hideLoader();
});

// ============================================================
// NOTIFICATION BADGES
// ============================================================
async function loadNotificationBadges() {
  try {
    const res = await gasCall('apiGetNotificationCounts');
    if (!res || !res.success) return;
    const d = res.data;

    const setBadge = (id, count) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = count > 0 ? 'block' : 'none';
      el.textContent = count > 99 ? '99+' : count;
    };

    setBadge('badge-review', d.pendingReview);
    setBadge('badge-expired', d.nearExpired);
    setBadge('badge-unread', d.unread);
    setBadge('badge-approval', d.pendingApproval);

    // Sidebar badges
    updateSidebarBadge('sidebar-badge-review', d.pendingReview);
    updateSidebarBadge('sidebar-badge-approval', d.pendingApproval);
    updateSidebarBadge('sidebar-badge-cr', d.pendingCR || 0);
  } catch(e) {}
}

function updateSidebarBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = count > 0 ? 'inline-flex' : 'none';
  el.textContent = count;
}

// ============================================================
// GLOBAL SEARCH
// ============================================================
let searchTimer = null;
function globalSearchDebounce(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => performGlobalSearch(val), 350);
}

async function performGlobalSearch(keyword) {
  const resultsEl = document.getElementById('search-results');
  if (!keyword || keyword.length < 2) { resultsEl.style.display = 'none'; return; }

  try {
    const res = await gasCall('apiGlobalSearch', keyword);
    if (!res.success || !res.data.length) {
      resultsEl.innerHTML = '<div class="p-3 text-muted text-center" style="font-size:13px">No results found</div>';
      resultsEl.style.display = 'block';
      return;
    }

    resultsEl.innerHTML = res.data.map(doc => `
      <div class="p-2 border-bottom" style="cursor:pointer;font-size:13px" onmousedown="selectSearchResult('${doc.id}')">
        <div class="d-flex align-items-center gap-2">
          <span class="doc-number" style="font-size:11px">${doc.doc_number||''}</span>
          ${statusBadge(doc.status)}
        </div>
        <div class="fw-semibold text-truncate">${doc.title||''}</div>
        <div style="font-size:11px;color:var(--text-muted)">${doc.department||''} &middot; ${doc.category||''} &middot; ${doc.revision||''}</div>
      </div>`).join('');
    resultsEl.style.display = 'block';
  } catch(e) {}
}

function selectSearchResult(docId) {
  closeSearchResults();
  document.getElementById('global-search-input').value = '';
  // Cek apakah user punya akses doc-register; jika tidak, tampilkan di read-ack context
  const hasDocRegister = App.perms && App.perms['document_register'] && App.perms['document_register'].can_view;
  if (hasDocRegister) {
    navigate('doc-register');
    setTimeout(() => showDocDetail(docId), 400);
  } else {
    setTimeout(() => showDocDetail(docId, true), 100);
  }
}

function closeSearchResults() {
  const el = document.getElementById('search-results');
  if (el) el.style.display = 'none';
}

// ============================================================
// TREND CHART ON DASHBOARD
// ============================================================
async function loadTrendChart() {
  try {
    const res = await gasCall('apiGetTrendData');
    if (!res || !res.success) return;
    const d = res.data;
    const container = document.getElementById('trend-chart');
    if (!container) return;

    // Simple multi-row bar chart
    const labels = d.labels || [];
    const created = d.createTrend || [];
    const approved = d.approvalTrend || [];
    const revised = d.revisionTrend || [];

    const maxVal = Math.max(
      ...created.map(x => x.count),
      ...approved.map(x => x.count),
      ...revised.map(x => x.count), 1
    );

    let html = `
      <div class="d-flex gap-3 mb-3 flex-wrap" style="font-size:12px">
        <span><span style="display:inline-block;width:12px;height:12px;background:var(--accent);border-radius:2px"></span> Created</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:var(--success);border-radius:2px"></span> Approved</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:var(--accent2);border-radius:2px"></span> Revised</span>
      </div>`;

    labels.forEach((label, i) => {
      const c = created[i]?.count || 0;
      const a = approved[i]?.count || 0;
      const r = revised[i]?.count || 0;

      html += `<div class="mb-2">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:3px">${label}</div>
        <div class="d-flex gap-1 align-items-center">
          <div style="width:60px;font-size:11px;text-align:right;color:var(--text-muted)">Created</div>
          <div style="flex:1;height:14px;background:#f0f0f0;border-radius:3px;overflow:hidden">
            <div style="width:${(c/maxVal)*100}%;height:100%;background:var(--accent);border-radius:3px;transition:width .5s"></div>
          </div>
          <div style="width:20px;font-size:11px;font-weight:700">${c}</div>
        </div>
        <div class="d-flex gap-1 align-items-center mt-1">
          <div style="width:60px;font-size:11px;text-align:right;color:var(--text-muted)">Approved</div>
          <div style="flex:1;height:14px;background:#f0f0f0;border-radius:3px;overflow:hidden">
            <div style="width:${(a/maxVal)*100}%;height:100%;background:var(--success);border-radius:3px;transition:width .5s"></div>
          </div>
          <div style="width:20px;font-size:11px;font-weight:700">${a}</div>
        </div>
        <div class="d-flex gap-1 align-items-center mt-1">
          <div style="width:60px;font-size:11px;text-align:right;color:var(--text-muted)">Revised</div>
          <div style="flex:1;height:14px;background:#f0f0f0;border-radius:3px;overflow:hidden">
            <div style="width:${(r/maxVal)*100}%;height:100%;background:var(--accent2);border-radius:3px;transition:width .5s"></div>
          </div>
          <div style="width:20px;font-size:11px;font-weight:700">${r}</div>
        </div>
      </div>`;
    });

    container.innerHTML = html;
  } catch(e) {}
}


// ============================================================
// PROFILE
// ============================================================
function openProfileModal() {
  const u = App.user;
  document.getElementById('profile-avatar').textContent = (u.name || u.email || '?')[0].toUpperCase();
  document.getElementById('profile-name').textContent   = u.name || u.email;
  document.getElementById('profile-role').textContent   = u.role || 'USER';
  document.getElementById('profile-email').textContent  = u.email || '-';
  document.getElementById('profile-dept').textContent   = u.department || '-';
  document.getElementById('profile-status').textContent = 'Active';
  document.getElementById('profile-docs').textContent   = '-';
  document.getElementById('profile-dists').textContent  = '-';
  document.getElementById('profile-reads').textContent  = '-';
  document.getElementById('profile-name-input').value   = u.name || '';
  getModal('profileModal').show();
}

async function saveProfile() {
  const name = document.getElementById('profile-name-input').value.trim();
  if (!name) { toast('Nama tidak boleh kosong', 'warning'); return; }
  showLoader();
  try {
    const res = await gasCall('apiUpdateMyProfile', { name });
    if (res && res.error) { toast(res.error, 'error'); return; }
    App.user.name = name;
    const _tn2 = document.getElementById('topbar-name');
    if (_tn2) _tn2.textContent = name;
    const _su2 = document.getElementById('sidebar-user');
    if (_su2) _su2.textContent = name;
    document.getElementById('user-avatar').textContent    = name[0].toUpperCase();
    document.getElementById('profile-name').textContent   = name;
    document.getElementById('profile-avatar').textContent = name[0].toUpperCase();
    getModal('profileModal').hide();
    toast('Profil berhasil diperbarui', 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// CHANGE REQUEST FORM
// ============================================================
async function openChangeRequestModal(docId) {
  const docs = App.data.docs || [];
  let doc = docs.find(d => d.id === docId);
  
  if (!doc) {
    // Try to fetch if not in cache
    try {
      const res = await gasCall('apiGetEffectiveDocs');
      if (res && res.data) {
        doc = res.data.find(d => d.id === docId);
      }
    } catch(e) {}
  }
  
  if (!doc) {
    toast('Dokumen tidak ditemukan', 'error');
    return;
  }
  
  if ((doc.status || '').trim() !== DOC_STATUS.EFFECTIVE) {
    toast('Hanya dokumen dengan status Effective yang dapat di-change request', 'warning');
    return;
  }
  
  document.getElementById('cr-doc-id').value = docId;
  document.getElementById('cr-doc-number').textContent = doc.doc_number || docId;
  document.getElementById('cr-doc-title').textContent = doc.title || '';
  document.getElementById('cr-description').value = '';
  document.getElementById('cr-urgency').value = 'Normal';
  
  // Load revision reasons
  try {
    if (!App.data.revReasons || App.data.revReasons.length === 0) {
      const res = await gasCall('apiGetMasterData', 'revision_reason');
      if (res && res.data) {
        App.data.revReasons = res.data;
      }
    }
    fillSelect('cr-reason-select', App.data.revReasons || [], 'name', 'name', true);
  } catch(e) {}
  
  getModal('changeRequestModal').show();
}

async function submitChangeRequest() {
  const docId = document.getElementById('cr-doc-id').value;
  const reason = document.getElementById('cr-reason-select').value.trim();
  const description = document.getElementById('cr-description').value.trim();
  const urgency = document.getElementById('cr-urgency').value;
  
  if (!reason || !description) {
    toast('Alasan dan deskripsi perubahan wajib diisi', 'warning');
    return;
  }
  
  showLoader();
  try {
    const res = await gasCall('apiSubmitChangeRequest', {
      doc_id: docId,
      reason,
      description,
      urgency
    });
    
    if (res && res.error) {
      toast(res.error, 'error');
      return;
    }
    
    getModal('changeRequestModal').hide();
    toast('Permintaan perubahan berhasil diajukan', 'success');
    loadNotificationBadges();
    loadPageData(App.currentPage);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

async function approveCR(crId) {
  const ok = await showConfirm({
    title: 'Approve Change Request',
    message: 'Approve change request ini? Owner dokumen akan mendapat notifikasi untuk segera membuat revisi.',
    okText: 'Approve', cancelText: 'Batal', type: 'success'
  });
  if (!ok) return;
  showLoader();
  try {
    const res = await gasCall('apiApproveCR', { cr_id: crId });
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Permintaan perubahan disetujui', 'success');
    loadNotificationBadges();
    loadChangeRequest();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

async function rejectCR(crId) {
  const ok = await showConfirm({
    title: 'Reject Change Request',
    message: 'Reject change request ini? Dokumen akan kembali ke status Effective.',
    okText: 'Reject', cancelText: 'Batal', type: 'danger',
    showInput: true, inputPlaceholder: 'Alasan penolakan...'
  });
  if (!ok) return;
  showLoader();
  try {
    const comments = typeof ok === 'string' ? ok : '';
    const res = await gasCall('apiRejectCR', { cr_id: crId, comments });
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Permintaan perubahan ditolak', 'success');
    loadNotificationBadges();
    loadChangeRequest();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}



// ============================================================
// PRINT DOCUMENT
// ============================================================
async function printDocument(docId) {
  showLoader();
  try {
    const res = await gasCall('apiGetDocumentForPrint', docId);
    if (!res || !res.success) { toast(res.error || 'Error', 'error'); return; }
    const { doc, history, reviews, approvals, revisions, distribution } = res.data;

    const printBody = document.getElementById('print-modal-body');
    printBody.innerHTML = `
      <div class="print-section">
        <div class="d-flex align-items-start justify-content-between mb-3">
          <div>
            <div class="print-title">${doc.title||'-'}</div>
            <div class="mt-1">
              <span class="doc-number me-2">${doc.doc_number||'-'}</span>
              ${statusBadge(doc.status)}
              <span class="badge bg-secondary ms-1">${doc.revision||'Rev00'}</span>
            </div>
          </div>
          <div style="text-align:right;font-size:12px;color:#666">
            Printed: ${new Date().toLocaleString()}<br>
            By: ${App.user.email}
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <div class="print-label">Category</div><div class="print-value">${doc.category||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Department</div><div class="print-value">${doc.department||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Document Type</div><div class="print-value">${doc.doc_type||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Area</div><div class="print-value">${doc.area||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Document Owner</div><div class="print-value">${doc.owner_email||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Reviewer 1 (Atasan Langsung)</div><div class="print-value">${doc.reviewer1_email||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Reviewer 2 (Tim Doc. Control)</div><div class="print-value">${doc.reviewer2_email||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Reviewer 3 (Atasan Doc. Control)</div><div class="print-value">${doc.reviewer3_email||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Approver (Tim FSTL)</div><div class="print-value">${doc.approver_email||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Retention Period</div><div class="print-value">${doc.retention_period||'-'}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Effective Date</div><div class="print-value">${fmtDate(doc.effective_date)}</div>
          </div>
          <div class="col-md-6">
            <div class="print-label">Expiry Date</div><div class="print-value">${fmtDate(doc.expiry_date)}</div>
          </div>
          <div class="col-12">
            <div class="print-label">Description</div><div class="print-value">${doc.description||'-'}</div>
            <div class="print-label">Attachments</div>
            <div class="print-value">
              ${(() => {
                const files = parseDocFiles(doc);
                return files.length ? renderFileLinks(files, 'print') : '-';
              })()}
            </div>
          </div>
        </div>
      </div>

      <div class="print-section">
        <h6 class="fw-bold mb-2">Review History</h6>
        <table><thead><tr><th>Stage</th><th>Reviewer</th><th>Status</th><th>Comments</th><th>Date</th></tr></thead>
        <tbody>${reviews.map(r => `<tr><td>${r.stage_label||'-'}</td><td>${r.reviewer_email}</td><td>${r.status}</td><td>${r.comments||'-'}</td><td>${fmtDate(r.reviewed_at)}</td></tr>`).join('')||'<tr><td colspan="5" style="text-align:center;color:#999">No reviews</td></tr>'}</tbody></table>
      </div>

      <div class="print-section">
        <h6 class="fw-bold mb-2">Approval History</h6>
        <table><thead><tr><th>Approver</th><th>Status</th><th>Comments</th><th>Date</th></tr></thead>
        <tbody>${approvals.map(a => `<tr><td>${a.approver_email}</td><td>${a.status}</td><td>${a.comments||'-'}</td><td>${fmtDate(a.approved_at)}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#999">No approvals</td></tr>'}</tbody></table>
      </div>

      <div class="print-section">
        <h6 class="fw-bold mb-2">Revision History</h6>
        <table><thead><tr><th>Old Rev</th><th>New Rev</th><th>Reason</th><th>Description</th><th>By</th><th>Date</th></tr></thead>
        <tbody>${revisions.map(r => `<tr><td>${r.old_revision}</td><td>${r.new_revision}</td><td>${r.reason}</td><td>${r.change_description||'-'}</td><td>${r.updated_by}</td><td>${fmtDate(r.updated_at)}</td></tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:#999">No revisions</td></tr>'}</tbody></table>
      </div>

      <div class="print-section">
        <h6 class="fw-bold mb-2">Distribution List (${distribution.length} recipients)</h6>
        <table><thead><tr><th>Email</th><th>Distributed By</th><th>Date</th></tr></thead>
        <tbody>${distribution.map(d => `<tr><td>${d.user_email}</td><td>${d.distributed_by}</td><td>${fmtDate(d.distributed_at)}</td></tr>`).join('')||'<tr><td colspan="3" style="text-align:center;color:#999">Not distributed</td></tr>'}</tbody></table>
      </div>

      <div class="print-section">
        <h6 class="fw-bold mb-2">Activity Log</h6>
        <table><thead><tr><th>Date</th><th>Action</th><th>By</th><th>Notes</th></tr></thead>
        <tbody>${history.map(h => `<tr><td>${fmtDate(h.performed_at)}</td><td>${h.action}</td><td>${h.performed_by}</td><td>${h.notes||'-'}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#999">No history</td></tr>'}</tbody></table>
      </div>

      <div style="border-top:2px solid #ddd;margin-top:20px;padding-top:12px;font-size:11px;color:#999;text-align:center">
        Document Control System - Confidential - ${doc.doc_type||'Controlled'} Document
      </div>
    `;

    getModal('printModal').show();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// EXPORT PDF EFFECTIVE DOCUMENT (Kop Surat KALBE MILKO)
// ============================================================
async function exportDocumentPdf(docId) {
  if (!docId) return;
  showLoader();
  try {
    const res = await gasCall('apiGetDocumentForPdfExport', docId);
    if (!res || res.error) { toast((res && res.error) || 'Error', 'error'); return; }
    const { doc, fields, customValues, signatures, company } = res.data;

    const fmt = (d) => d ? fmtDate(d) : '-';

    const bodySections = (fields || []).map((f, i) => `
    <div class="pdf-section">
      <div class="pdf-section-title">${i + 1}. ${f.field_label}</div>
      <div class="pdf-section-content">${renderFieldValueForPdfPreview_(f, customValues)}</div>
    </div>`).join('');

    const tocRows = (fields || []).map((f, i) => `
      <div class="pdf-toc-row">
        <span class="pdf-toc-num">${i + 1}.</span>
        <span>${f.field_label}</span>
        <span class="pdf-toc-dots"></span>
        <span class="pdf-toc-page">-</span>
      </div>`).join('');

    const html = `
      <div class="pdf-page">
        <div class="pdf-header">
          <div class="pdf-logo-box">
            ${company.logoUrl ? `<img src="${company.logoUrl}">` : `<div class="pdf-logo-text">${company.name || 'LOGO'}</div>`}
          </div>
          <table class="pdf-info-table">
            <tr><td class="pdf-info-label">No. Dokumen</td><td class="pdf-info-colon">:</td><td class="pdf-info-value">${doc.doc_number || '-'}</td></tr>
            <tr><td class="pdf-info-label">Tgl. Berlaku</td><td class="pdf-info-colon">:</td><td class="pdf-info-value">${fmt(doc.effective_date)}</td></tr>
            <tr><td class="pdf-info-label">No. Revisi</td><td class="pdf-info-colon">:</td><td class="pdf-info-value">${doc.revision || '-'}</td></tr>
          </table>
        </div>
        <div class="pdf-title">${(doc.title || '').toUpperCase()}</div>

        <div class="pdf-toc">
          <div class="pdf-toc-title">Daftar Isi / Table of Content</div>
          ${tocRows || '<div style="font-size:12px;color:#777">Belum ada field kategori</div>'}
        </div>

        <table class="pdf-sign">
          <tr><td></td><td>Dibuat Oleh</td><td>Diperiksa Oleh</td><td>Disahkan Oleh</td></tr>
          <tr class="pdf-sign-space"><td>Tanda Tangan</td><td></td><td></td><td></td></tr>
          <tr>
            <td>Nama</td>
            <td>${signatures.preparedBy.name}</td>
            <td>${signatures.checkedBy.name}</td>
            <td>${signatures.approvedBy.name}</td>
          </tr>
          <tr>
            <td>Tanggal</td>
            <td>${fmt(signatures.preparedBy.date)}</td>
            <td>${fmt(signatures.checkedBy.date)}</td>
            <td>${fmt(signatures.approvedBy.date)}</td>
          </tr>
        </table>

        ${bodySections}
      </div>`;

    const container = document.getElementById('pdf-export-container');
    container.innerHTML = html;

    const imgs = container.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(img => {
      img.crossOrigin = 'anonymous';
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => {
        img.onload  = resolve;
        img.onerror = () => { img.remove(); resolve(); };
      });
    }));
    console.log('HTML masuk container?', container.innerHTML.length, container.offsetHeight);
    await html2pdf().set({
      margin: [15, 15, 15, 15],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, allowTaint: false }
    }).from(container).toCanvas().then(function () {
      const canvas = this.prop.canvas;
      console.log('Canvas size:', canvas.width, canvas.height);
      const debugImg = document.createElement('img');
      debugImg.src = canvas.toDataURL('image/png');
      debugImg.style.cssText = 'position:fixed;top:10px;left:10px;width:300px;border:3px solid red;z-index:99999;background:#fff';
      debugImg.id = 'pdf-debug-preview';
      document.getElementById('pdf-debug-preview')?.remove();
      document.body.appendChild(debugImg);
    });

    container.innerHTML = '';
  } catch (e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// STATISTICS POPUP
// ============================================================
async function openStatsModal() {
  getModal('statsModal').show();
  try {
    const res = await gasCall('apiGetStatistics');
    if (!res || !res.success) return;
    const d = res.data;
    const body = document.getElementById('stats-modal-body');

    const statusColors = {
      'Draft':'#6c757d','Waiting Review':'#ffc107','Waiting Approval':'#0dcaf0',
      'Effective':'#198754','Obsolete':'#dc3545','Rejected':'#dc3545','Revised':'#6f42c1'
    };

    const maxStatus = Math.max(...Object.values(d.statusCount||{1:1}));

    body.innerHTML = `
      <div class="row g-3">
        <div class="col-md-4 col-6">
          <div class="stat-card text-center">
            <div class="stat-label">Total Documents</div>
            <div class="stat-value primary">${d.totalDocuments}</div>
          </div>
        </div>
        <div class="col-md-4 col-6">
          <div class="stat-card text-center">
            <div class="stat-label">Total Revisions</div>
            <div class="stat-value" style="color:var(--accent2)">${d.totalRevisions}</div>
          </div>
        </div>
        <div class="col-md-4 col-6">
          <div class="stat-card text-center">
            <div class="stat-label">Read Compliance</div>
            <div class="stat-value success">${d.compliance}%</div>
          </div>
        </div>
        <div class="col-md-4 col-6">
          <div class="stat-card text-center">
            <div class="stat-label">Distributions</div>
            <div class="stat-value" style="color:var(--accent)">${d.totalDistributions}</div>
          </div>
        </div>
        <div class="col-md-4 col-6">
          <div class="stat-card text-center">
            <div class="stat-label">Near Expired</div>
            <div class="stat-value warning">${d.nearExpired}</div>
          </div>
        </div>
        <div class="col-md-4 col-6">
          <div class="stat-card text-center">
            <div class="stat-label">Audit Entries</div>
            <div class="stat-value" style="color:#6f42c1">${d.totalAuditEntries}</div>
          </div>
        </div>
        <div class="col-12">
          <h6 class="fw-bold mb-2">Documents by Status</h6>
          <div class="chart-bar-container">
            ${Object.entries(d.statusCount||{}).map(([status, count]) => `
              <div class="chart-bar-item">
                <div class="chart-bar-label">${status}</div>
                <div class="chart-bar-wrap">
                  <div class="chart-bar-fill" style="width:${(count/maxStatus)*100}%;background:${statusColors[status]||'var(--accent)'}"></div>
                </div>
                <div class="chart-bar-val">${count}</div>
              </div>`).join('')}
          </div>
        </div>
        <div class="col-md-6">
          <h6 class="fw-bold mb-2">By Department</h6>
          ${renderMiniChart(d.deptCount||{})}
        </div>
        <div class="col-md-6">
          <h6 class="fw-bold mb-2">By Category</h6>
          ${renderMiniChart(d.catCount||{})}
        </div>
      </div>`;
  } catch(e) {
    document.getElementById('stats-modal-body').innerHTML = '<p class="text-danger">Failed to load statistics</p>';
  }
}

function renderMiniChart(data) {
  const max = Math.max(...Object.values(data), 1);
  return '<div class="chart-bar-container">' +
    Object.entries(data).sort((a,b) => b[1]-a[1]).slice(0,8).map(([k,v]) => `
      <div class="chart-bar-item">
        <div class="chart-bar-label" style="font-size:11px">${k||'?'}</div>
        <div class="chart-bar-wrap"><div class="chart-bar-fill" style="width:${(v/max)*100}%"></div></div>
        <div class="chart-bar-val" style="font-size:11px">${v}</div>
      </div>`).join('') + '</div>';
}

// ============================================================
// EXTEND showDocDetail to add Print button
// ============================================================
const _origShowDocDetail = showDocDetail;
async function showDocDetail(docId, showAck) {
  showLoader();
  try {
    // Jika dipanggil dari Read Acknowledgement, gunakan API khusus yang tidak
    // memerlukan permission document_register (cukup read_acknowledgement)
    let res, doc;
    if (showAck) {
      res = await gasCall('apiGetDocumentForAck', docId);
      if (res && res.error) { toast(res.error, 'error'); return; }
      doc = res.data && res.data.document ? res.data.document : null;
    } else {
      res = await gasCall('apiGetDocumentHistory', docId);
      doc = App.data.docs.find(d => d.id === docId);
      if (!doc) {
        const docsRes = await gasCall('apiGetDocuments', {});
        if (docsRes && docsRes.data) {
          doc = docsRes.data.find(d => d.id === docId);
        }
      }
    }
    if (!doc) { toast('Dokumen tidak ditemukan', 'error'); return; }

    const history = res.data || {};
    const statuses = ['Draft','Waiting Review','Waiting Approval','Effective','Obsolete'];
    const stepHtml = statuses.map(s => {
      let cls = '';
      if (doc.status === 'Rejected' && s === 'Draft') cls = 'rejected';
      else if (s === doc.status) cls = 'active';
      else if (statuses.indexOf(s) < statuses.indexOf(doc.status) && doc.status !== 'Rejected') cls = 'done';
      return `<div class="workflow-step"><div class="step-box ${cls}">${s}</div><div class="arrow">${s !== 'Obsolete' ? '&rarr;' : ''}</div></div>`;
    }).join('');

    // BARU
    const body = document.getElementById('doc-detail-body');
    body.innerHTML = `
      <div class="mb-3">
        <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
          ${stepHtml}
        </div>
      </div>
      <div class="row g-3">
        <div class="col-md-6">
          <div class="card border-0 bg-light p-3 h-100">
            <div class="fw-bold mb-2" style="color:var(--primary)"><i class="bi bi-file-earmark-text me-1"></i>Document Info</div>
              <div class="table-responsive">
                <table class="table table-sm table-borderless mb-0">
                  <tr><td class="text-muted" style="width:40%">Doc Number</td><td><span class="doc-number">${doc.doc_number||'-'}</span></td></tr>
                  <tr><td class="text-muted">Title</td><td><strong>${doc.title||'-'}</strong></td></tr>
                  <tr><td class="text-muted">Category</td><td>${doc.category||'-'}</td></tr>
                  <tr><td class="text-muted">Department</td><td>${doc.department||'-'}</td></tr>
                  <tr><td class="text-muted">Area</td><td>${doc.area||'-'}</td></tr>
                  <tr><td class="text-muted">Circle Group</td><td>${doc.circle_group||'-'}</td></tr>
                  <tr><td class="text-muted">Doc Type</td><td>${doc.doc_type||'-'}</td></tr>
                  <tr><td class="text-muted">Status</td><td>${statusBadge(doc.status)}</td></tr>
                </table>
              </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card border-0 bg-light p-3 h-100">
            <div class="fw-bold mb-2" style="color:var(--primary)"><i class="bi bi-people me-1"></i>People & Dates</div>
            <div class="table-responsive">
              <table class="table table-sm table-borderless mb-0">
                <tr><td class="text-muted" style="width:40%">Owner</td><td>${doc.owner_email||'-'}</td></tr>
                <tr><td class="text-muted">Reviewer 1</td><td>${doc.reviewer1_email||'-'}</td></tr>
                <tr><td class="text-muted">Reviewer 2</td><td>${doc.reviewer2_email||'-'}</td></tr>
                <tr><td class="text-muted">Reviewer 3</td><td>${doc.reviewer3_email||'-'}</td></tr>
                <tr><td class="text-muted">Approver</td><td>${doc.approver_email||'-'}</td></tr>
                <tr><td class="text-muted">Revision</td><td><span class="badge bg-secondary">${doc.revision||'Rev00'}</span></td></tr>
                <tr><td class="text-muted">Effective Date</td><td>${fmtDate(doc.effective_date)}</td></tr>
                <tr><td class="text-muted">Expiry Date</td><td>${fmtDate(doc.expiry_date)}</td></tr>
                <tr><td class="text-muted">Retention</td><td>${doc.retention_period||'-'}</td></tr>
                <tr><td class="text-muted">Created By</td><td>${doc.created_by||'-'}</td></tr>
              </table>
            </div>  
          </div>
        </div>
        ${doc.description ? `
        <div class="col-12">
          <div class="card border-0 bg-light p-3">
            <div class="fw-bold mb-2" style="color:var(--primary)"><i class="bi bi-card-text me-1"></i>Description</div>
            <p class="mb-0">${doc.description}</p>
          </div>
        </div>` : ''}
        ${(() => {
          const files = parseDocFiles(doc);
          return files.length ? `
          <div class="col-12">
            <div class="card border-0 bg-light p-3">
              <div class="fw-bold mb-2" style="color:var(--primary)">
                <i class="bi bi-paperclip me-1"></i>Attachments
                <span class="badge bg-secondary ms-1" style="font-weight:500">${files.length}</span>
              </div>
              <div class="d-flex flex-column gap-1">
                ${renderFileLinks(files, 'list')}
              </div>
            </div>
          </div>` : '';
        })()}
        ${history.reviews && history.reviews.length ? `
        <div class="col-12">
          <div class="card border-0 bg-light p-3">
            <div class="fw-bold mb-2" style="color:var(--primary)"><i class="bi bi-search me-1"></i>Review History</div>
            <div class="table-responsive">
              <table class="table table-sm mb-0">
                <thead><tr><th>Stage</th><th>Reviewer</th><th>Status</th><th>Comments</th><th>Date</th></tr></thead>
                <tbody>${(history.reviews||[]).map(r => `<tr>
                  <td>${r.stage_label||'-'}</td>
                  <td>${r.reviewer_email||'-'}</td>
                  <td>${statusBadge(r.status)}</td>
                  <td>${r.comments||'-'}</td>
                  <td>${fmtDate(r.reviewed_at)}</td>
                </tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
        </div>` : ''}
        ${history.approvals && history.approvals.length ? `
        <div class="col-12">
          <div class="card border-0 bg-light p-3">
            <div class="fw-bold mb-2" style="color:var(--primary)"><i class="bi bi-check-circle me-1"></i>Approval History</div>
             <div class="table-responsive">
                <table class="table table-sm mb-0">
                  <thead><tr><th>Approver</th><th>Status</th><th>Comments</th><th>Date</th></tr></thead>
                  <tbody>${(history.approvals||[]).map(a => `<tr>
                    <td>${a.approver_email||'-'}</td>
                    <td>${statusBadge(a.status)}</td>
                    <td>${a.comments||'-'}</td>
                    <td>${fmtDate(a.approved_at)}</td>
                  </tr>`).join('')}</tbody>
                </table>
              </div>
          </div>
        </div>` : ''}
        ${history.revisions && history.revisions.length ? `
        <div class="col-12">
          <div class="card border-0 bg-light p-3">
            <div class="fw-bold mb-2" style="color:var(--primary)"><i class="bi bi-arrow-clockwise me-1"></i>Revision History</div>
              <div class="table-responsive">
                <table class="table table-sm mb-0">
                  <thead><tr><th>Old Rev</th><th>New Rev</th><th>Reason</th><th>Description</th><th>File</th><th>By</th><th>Date</th></tr></thead>
                  <tbody>${(history.revisions||[]).map(r => `<tr>
                    <td><span class="badge bg-secondary">${r.old_revision||'-'}</span></td>
                    <td><span class="badge bg-primary">${r.new_revision||'-'}</span></td>
                    <td>${r.reason||'-'}</td>
                    <td>${r.change_description||'-'}</td>
                    <td>${r.file_url ? `<a href="${r.file_url}" target="_blank" class="btn btn-xs btn-outline-primary" style="font-size:11px;padding:2px 8px"><i class="bi bi-file-earmark me-1"></i>${r.file_name||'File'}</a>` : '-'}</td>
                    <td>${r.updated_by||'-'}</td>
                    <td>${fmtDate(r.updated_at)}</td>
                  </tr>`).join('')}</tbody>
                </table>
              </div>
          </div>
        </div>` : ''}
      </div>`;

    App.currentDocId = docId;
    const ackBtn = document.getElementById('btn-acknowledge');
    ackBtn.style.display = showAck ? 'block' : 'none';
    const pdfBtn = document.getElementById('btn-export-pdf');
    // SUPER_ADMIN tetap bisa export PDF walau status belum Effective (untuk cek hasil export)
    if (pdfBtn) pdfBtn.style.display = (doc.status === 'Effective' || App.user.role === 'SUPER_ADMIN') ? 'inline-block' : 'none';
    getModal('docDetailModal').show();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

function renderFieldValueForPdfPreview_(f, customValues) {
  const raw = customValues[f.field_key];
  if (f.field_type === 'richtext') {
    const blocks = parseRichBlocksClient_(raw);
    return blocks.map(b => {
      if (b.type === 'image') {
        return (b.items || []).map(img => `
          <div style="margin:8px 0;text-align:center">
            <img src="${driveThumbUrl_(img.file_id)}" style="max-width:100%;border:1px solid #ddd">
            ${img.caption ? `<div style="font-size:11px;color:#666;font-style:italic;margin-top:4px">${img.caption}</div>` : ''}
          </div>`).join('');
      }
      if (b.type === 'table') {
        const cols = b.cols || [];
        const rows = b.rows && b.rows.length ? b.rows : [cols.map(() => '-')];
        return `<table style="width:100%;border-collapse:collapse;margin:8px 0">
          <thead><tr>${cols.map(c => `<th style="border:1px solid #ccc;background:#f0f0f0;padding:4px">${c}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${cols.map((c, ci) => `<td style="border:1px solid #ccc;padding:4px">${r[ci] || '-'}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
      }
      return `<div>${(b.content || '').replace(/\n/g, '<br>')}</div>`;
    }).join('');
  }
  if (f.field_type === 'table') {
    const cols = (f.options || '').split(',').map(o => o.trim()).filter(Boolean);
    let rows = [];
    try { rows = raw ? JSON.parse(raw) : []; } catch(e) { rows = []; }
    if (!rows.length) rows = [cols.map(() => '-')];
    return `<table style="width:100%;border-collapse:collapse;margin:8px 0">
      <thead><tr>${cols.map(c => `<th style="border:1px solid #ccc;background:#f0f0f0;padding:4px">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${cols.map((c, ci) => `<td style="border:1px solid #ccc;padding:4px">${r[ci] || '-'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  }
  return (raw || '-').toString().replace(/\n/g, '<br>');
}

async function exportDocumentPdf(docId) {
  showLoader();
  try {
    const res = await gasCall('apiExportDocumentPdf', docId);
    if (res && res.error) { toast(res.error, 'error'); return; }
    const { fileName, base64 } = res.data;
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('PDF berhasil dibuat', 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

async function cloneDocument(docId) {
  const okClone = await showConfirm({
  title: 'Clone Dokumen', subtitle: 'Salinan baru akan dibuat sebagai Draft',
  message: 'Dokumen akan diduplikasi dan disimpan sebagai Draft baru. Lanjutkan?',
  okText: 'Clone', cancelText: 'Batal', type: 'primary'});
  if (!okClone) return;
  showLoader();
  try {
    const res = await gasCall('apiCloneDocument', docId);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Dokumen berhasil diduplikasi: ' + res.data.doc_number, 'success');
    loadPageData(App.currentPage);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// STATISTICS SHORTCUT ON DASHBOARD
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Add stats button to dashboard stat cards area
  setTimeout(() => {
    const statRow = document.querySelector('#page-dashboard .row.g-3.mb-4');
    if (statRow) {
      const col = document.createElement('div');
      col.className = 'col-6 col-md-4 col-lg-3';
      col.innerHTML = `<div class="stat-card" style="cursor:pointer;border-style:dashed" onclick="openStatsModal()">
        <i class="bi bi-graph-up stat-icon"></i>
        <div class="stat-label">Full Statistics</div>
        <div class="stat-value" style="color:var(--primary);font-size:20px">View &rarr;</div>
      </div>`;
      statRow.appendChild(col);
    }
  }, 100);
});

// ============================================================
// OVERRIDE loadDocRegister to pre-cache doc list
// ============================================================
async function loadDocRegister() {
  showLoader();
  try {
    const res = await gasCall('apiGetDocuments', {});
    if (res && res.error) { toast(res.error, 'error'); return; }
    App.data.docs = res.data || [];
    renderDocsTableFull('docs-tbody', App.data.docs);
    populateFilterDropdowns();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

function renderDocsTableFull(tbodyId, docs) {
  const emptyHtml = '<i class="bi bi-folder-x d-block fs-2 mb-2"></i>Tidak ada dokumen';

  const rowFn = doc => {
    const dl = daysLeft(doc.expiry_date);
    const expiryWarn = dl !== null && dl <= 30 && doc.status === 'Effective'
      ? `<span class="badge bg-danger ms-1" style="font-size:9px">${dl}d</span>` : '';

    const perm         = App.perms['document_register'] || {};
    const permRev      = App.perms['revision']          || {};
    const permCR       = App.perms['change_request']    || {};
    const isSuperAdmin = App.user.role === 'SUPER_ADMIN';
    const canEdit      = isSuperAdmin || perm.can_edit    == 1;
    const canCreate    = isSuperAdmin || perm.can_create  == 1;
    const canDelete    = isSuperAdmin || perm.can_delete  == 1;
    const canCR        = isSuperAdmin || permCR.can_create  == 1;
    const canRevise    = isSuperAdmin || permRev.can_create == 1;
    const s            = doc.status;

    const actions = `
      <button class="btn btn-outline-primary btn-sm" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye me-1"></i>Detail</button>
      ${(s===DOC_STATUS.DRAFT||s===DOC_STATUS.REJECTED)&&canEdit  ?`<button class="btn btn-outline-secondary btn-sm" onclick="openDocModal('${doc.id}')"><i class="bi bi-pencil me-1"></i>Edit</button>`:''}
      ${(s===DOC_STATUS.DRAFT||s===DOC_STATUS.REJECTED)&&canEdit  ?`<button class="btn btn-outline-success btn-sm" onclick="submitForReview('${doc.id}')"><i class="bi bi-send me-1"></i>Submit</button>`:''}
      ${s===DOC_STATUS.EFFECTIVE&&canCR                            ?`<button class="btn btn-warning btn-sm" onclick="openChangeRequestModal('${doc.id}')"><i class="bi bi-arrow-left-right me-1"></i>Change Req</button>`:''}
      ${(s===DOC_STATUS.EFFECTIVE||isSuperAdmin)                    ?`<button class="btn btn-outline-danger btn-sm" onclick="exportDocumentPdf('${doc.id}')"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>`:''}
      ${s===DOC_STATUS.CR_APPROVED&&canRevise                      ?`<button class="btn btn-outline-info btn-sm" onclick="openRevisionModal('${doc.id}')"><i class="bi bi-arrow-clockwise me-1"></i>Buat Revisi</button>`:''}
      ${s!==DOC_STATUS.OBSOLETE&&canCreate                         ?`<button class="btn btn-outline-dark btn-sm" onclick="cloneDocument('${doc.id}')"><i class="bi bi-files me-1"></i>Clone</button>`:''}
      ${s!==DOC_STATUS.OBSOLETE&&canDelete                         ?`<button class="btn btn-outline-danger btn-sm" onclick="obsoleteDoc('${doc.id}')"><i class="bi bi-archive me-1"></i>Obsolete</button>`:''}`;

    if (isMobile()) return `
      <div class="mobile-card">
        <div class="mobile-card-header">
          <div>
            <span class="doc-number">${doc.doc_number||'-'}</span>
            <div class="mobile-card-title mt-1">${doc.title||'-'}${expiryWarn}</div>
          </div>
          ${statusBadge(doc.status)}
        </div>
        <div class="mobile-card-meta">
          <span><i class="bi bi-tag"></i>${doc.category||'-'}</span>
          <span><i class="bi bi-building"></i>${doc.department||'-'}</span>
          <span><i class="bi bi-calendar"></i>${fmtDate(doc.effective_date)}</span>
        </div>
        <div class="mobile-card-actions">${actions}</div>
      </div>`;

    return `<tr>
      <td><span class="doc-number">${doc.doc_number||'-'}</span></td>
      <td><a href="#" onclick="showDocDetail('${doc.id}')" class="text-decoration-none fw-semibold" style="color:var(--primary)">${doc.title||'-'}</a>${expiryWarn}</td>
      <td><span class="badge bg-light text-dark border" style="font-size:11px">${doc.category||'-'}</span></td>
      <td>${doc.department||'-'}</td>
      <td><span class="badge bg-secondary">${doc.revision||'Rev00'}</span></td>
      <td>${statusBadge(doc.status)}</td>
      <td><small class="text-muted">${doc.owner_email||'-'}</small></td>
      <td><small>${fmtDate(doc.effective_date)}</small></td>
      <td><div class="btn-group btn-group-sm">
        <button class="btn btn-outline-primary" onclick="showDocDetail('${doc.id}')"><i class="bi bi-eye"></i></button>
        ${(s===DOC_STATUS.DRAFT||s===DOC_STATUS.REJECTED)&&canEdit ?`<button class="btn btn-outline-secondary" onclick="openDocModal('${doc.id}')"><i class="bi bi-pencil"></i></button>`:''}
        ${(s===DOC_STATUS.DRAFT||s===DOC_STATUS.REJECTED)&&canEdit ?`<button class="btn btn-outline-success" onclick="submitForReview('${doc.id}')"><i class="bi bi-send"></i></button>`:''}
        ${s===DOC_STATUS.EFFECTIVE&&canCR                           ?`<button class="btn btn-warning" onclick="openChangeRequestModal('${doc.id}')"><i class="bi bi-arrow-left-right"></i></button>`:''}
        ${(s===DOC_STATUS.EFFECTIVE||isSuperAdmin)                   ?`<button class="btn btn-outline-danger" onclick="exportDocumentPdf('${doc.id}')"><i class="bi bi-file-earmark-pdf"></i></button>`:''}
        ${s===DOC_STATUS.CR_APPROVED&&canRevise                     ?`<button class="btn btn-outline-info" onclick="openRevisionModal('${doc.id}')"><i class="bi bi-arrow-clockwise"></i></button>`:''}
        ${s!==DOC_STATUS.OBSOLETE&&canCreate                        ?`<button class="btn btn-outline-dark" onclick="cloneDocument('${doc.id}')"><i class="bi bi-files"></i></button>`:''}
        ${s!==DOC_STATUS.OBSOLETE&&canDelete                        ?`<button class="btn btn-outline-danger" onclick="obsoleteDoc('${doc.id}')"><i class="bi bi-archive"></i></button>`:''}
      </div></td>
    </tr>`;
  };

  renderListOrCards(tbodyId, docs, rowFn, emptyHtml, 9);
}

// ============================================================
// AUTH — LOGOUT
// ============================================================
async function doLogout() {
  const okLogout = await showConfirm({
  title: 'Keluar dari Sistem', subtitle: 'Sesi Anda akan diakhiri',
  message: 'Yakin ingin logout? Semua perubahan yang belum disimpan akan hilang.',
  okText: 'Logout', cancelText: 'Batal', type: 'danger'});
  if (!okLogout) return;
  showLoader();
  var token = App.token;
  google.script.run
    .withSuccessHandler(function() { redirectToLogin(); })
    .withFailureHandler(function() { redirectToLogin(); })
    .apiLogout(token);
}

function redirectToLogin() {
  try { localStorage.removeItem('dcs_token'); } catch(e) {}
  google.script.run
    .withSuccessHandler(function(appUrl) {
      window.location.href = appUrl || window.location.href.split('?')[0];
    })
    .withFailureHandler(function() {
      window.location.href = window.location.href.split('?')[0];
    })
    .apiGetAppUrl();
}

function showSessionExpiredModal() {
  try { getModal('sessionExpiredModal').show(); } catch(e) { redirectToLogin(); }
}

// ============================================================
// AUTH — CHANGE PASSWORD
// ============================================================
function openChangePwModal() {
  document.getElementById('cp-old').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-alert').style.display = 'none';
  document.getElementById('cp-strength').style.display = 'none';
  getModal('changePwModal').show();
}

async function submitChangePassword() {
  const oldPw  = document.getElementById('cp-old').value;
  const newPw  = document.getElementById('cp-new').value;
  const confPw = document.getElementById('cp-confirm').value;

  if (!oldPw || !newPw || !confPw) {
    showCpAlert('Semua field wajib diisi.', 'danger'); return;
  }
  if (newPw !== confPw) {
    showCpAlert('Konfirmasi password tidak cocok.', 'danger'); return;
  }

  showLoader();
  try {
    const res = await gasCall('apiChangePassword', App.token, oldPw, newPw, confPw);
    if (res && res.error) { showCpAlert(res.error, 'danger'); return; }
    getModal('changePwModal').hide();
    toast('Password berhasil diubah', 'success');
  } catch(e) { showCpAlert('Error: ' + e.message, 'danger'); }
  finally { hideLoader(); }
}

function showCpAlert(msg, type) {
  const el = document.getElementById('cp-alert');
  const cls = { danger:'danger', success:'success', info:'info', warning:'warning' };
  el.innerHTML = `<div class="alert alert-${cls[type]||'info'} p-2" style="font-size:13px">${msg}</div>`;
  el.style.display = 'block';
}

// ============================================================
// AUTH — RESET PASSWORD BY ADMIN
// ============================================================
function openResetPwModal(elOrEmail, userName) {
  let userEmail = elOrEmail;
  if (elOrEmail && elOrEmail.dataset) {
    userEmail = elOrEmail.dataset.email || '';
    userName  = elOrEmail.dataset.name  || '';
  }
  document.getElementById('rp-user-email').value            = userEmail;
  document.getElementById('rp-user-name').textContent       = userName || userEmail;
  document.getElementById('rp-user-email-show').textContent = userEmail;
  document.getElementById('rp-password').value = '';
  document.getElementById('rp-confirm').value = '';
  getModal('resetPwModal').show();
}


async function submitResetPassword() {
  const email   = document.getElementById('rp-user-email').value;
  const newPw   = document.getElementById('rp-password').value;
  const confPw  = document.getElementById('rp-confirm').value;

  if (!newPw || !confPw) { toast('Semua field wajib diisi', 'warning'); return; }
  if (newPw !== confPw) { toast('Konfirmasi password tidak cocok', 'warning'); return; }

  showLoader();
  try {
    const res = await gasCall('apiResetPasswordByAdmin', App.token, email, newPw);
    if (res && res.error) { toast(res.error, 'error'); return; }
    getModal('resetPwModal').hide();
    toast('Password berhasil direset untuk ' + email, 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// PASSWORD STRENGTH (inline for modal)
// ============================================================
function togglePwField(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon  = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text'; icon.className = 'bi bi-eye-slash';
  } else {
    input.type = 'password'; icon.className = 'bi bi-eye';
  }
}

function checkPwStrength(pw) {
  var wrapper = document.getElementById('pw-strength');
  if (!pw) { wrapper.classList.remove('show'); return; }
  wrapper.classList.add('show');

  var score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  var cls = score <= 1 ? 'weak' : score <= 3 ? 'medium' : 'strong';
  var texts = ['', 'Lemah', 'Sedang', 'Sedang', 'Kuat', 'Sangat Kuat'];

  for (var i = 1; i <= 4; i++) {
    var bar = document.getElementById('pw-strength-bar-' + i);
    if (bar) {
      bar.className = 'pw-bar' + (i <= score ? ' active ' + cls : '');
    }
  }
  
  var label = document.getElementById('pw-strength-label');
  if (label) label.textContent = texts[score] || '';
}

// ============================================================
// LOGIN SETTINGS PAGE
// ============================================================
let _loginSettings = {};

async function loadLoginSettingsPage() {
  showLoader();
  try {
    const res = await gasCall('apiGetLoginSettings', App.token);
    if (res && res.error) { toast(res.error, 'error'); return; }
    _loginSettings = res.data || {};
    renderLoginSettingsForm(_loginSettings);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

function renderLoginSettingsForm(s) {
  const body = document.getElementById('login-settings-body');
  if (!body) return;

  const row = (label, key, type, options) => {
    const val = s[key] !== undefined ? s[key] : '';
    if (type === 'boolean') {
      return `<div class="col-md-6">
        <div class="section-card p-3" style="border-radius:10px">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" id="ls-${key}" ${val === true || val === 'true' || val == 1 ? 'checked' : ''} style="width:40px;height:20px">
            <label class="form-check-label ms-2 fw-semibold" for="ls-${key}" style="font-size:13.5px">${label}</label>
          </div>
        </div>
      </div>`;
    }
    if (type === 'number') {
      return `<div class="col-md-6 col-lg-4">
        <label class="form-label">${label}</label>
        <input type="number" class="form-control" id="ls-${key}" value="${val}" min="1">
      </div>`;
    }
    if (type === 'color') {
      return `<div class="col-md-6 col-lg-4">
        <label class="form-label">${label}</label>
        <div class="input-group">
          <input type="color" class="form-control form-control-color" id="ls-${key}-picker" value="${val||'#0f2644'}" ooninput="document.getElementById(&quot;ls-${key}-picker&quot;).value=this.value">
          <input type="text" class="form-control" id="ls-${key}" value="${val||'#0f2644'}" placeholder="#0f2644" oninput="document.getElementById(&quot;ls-${key}&quot;).value=this.value">
        </div>
      </div>`;
    }
    return `<div class="col-md-6 col-lg-${type==='text-wide'?'8':'4'}">
      <label class="form-label">${label}</label>
      <input type="text" class="form-control" id="ls-${key}" value="${(val||'').toString().replace(/"/g,'&quot;')}" placeholder="${label}">
    </div>`;
  };

  body.innerHTML = `
    <div class="col-12"><h6 class="fw-bold text-primary mb-0"><i class="bi bi-shield-lock me-1"></i>Keamanan Login</h6><hr class="mt-1"></div>
    ${row('Login Sistem Aktif','login_enabled','boolean')}
    ${row('Maksimum Percobaan Login','max_attempts','number')}
    ${row('Durasi Lockout (menit)','lockout_minutes','number')}
    ${row('Durasi Session (jam)','session_hours','number')}

   <div class="col-12 mt-2"><h6 class="fw-bold text-primary mb-0"><i class="bi bi-key me-1"></i>Kebijakan Password</h6><hr class="mt-1"></div>
    ${row('Panjang Minimum Password','min_password_length','number')}
    ${row('Wajib Huruf Kapital (A-Z)','require_uppercase','boolean')}
    ${row('Wajib Angka (0-9)','require_number','boolean')}
    ${row('Wajib Karakter Spesial (!@#$)','require_special','boolean')}
    ${row('Aktifkan Lupa Password','allow_forgot_password','boolean')}
    ${row('Tampilkan Registrasi Mandiri','show_register','boolean')}

    <div class="col-12 mt-2"><h6 class="fw-bold text-primary mb-0"><i class="bi bi-palette me-1"></i>Tampilan Halaman Login</h6><hr class="mt-1"></div>
    ${row('Nama Perusahaan','company_name','text')}
    ${row('Judul Login','login_title','text-wide')}
    ${row('Sub-Judul Login','login_subtitle','text')}
    ${row('URL Logo (opsional)','login_logo_url','text-wide')}
    ${row('Warna Background','login_bg_color','color')}

    <div class="col-12 mt-3">
      <div class="section-card p-3" style="background:#f0f6ff;border-color:#cfe2ff">
        <h6 class="fw-bold mb-2"><i class="bi bi-eye me-1"></i>Preview Halaman Login</h6>
        <button class="btn btn-sm btn-outline-primary" onclick="previewLogin()"><i class="bi bi-box-arrow-up-right me-1"></i>Buka Preview Login</button>
        <div class="mt-2" style="font-size:12px;color:var(--text-muted)">Preview akan membuka tab baru dengan tampilan halaman login terkini.</div>
      </div>
    </div>
  `;
}

async function saveLoginSettings() {
  const keys = [
    'login_enabled','max_attempts','lockout_minutes','session_hours',
    'min_password_length','require_uppercase','require_number','require_special',
    'allow_forgot_password','show_register',
    'company_name','login_title','login_subtitle','login_logo_url','login_bg_color'
  ];

  const settings = {};
  keys.forEach(key => {
    const el = document.getElementById('ls-' + key);
    if (!el) return;
    if (el.type === 'checkbox') {
      settings[key] = el.checked;
    } else {
      settings[key] = el.value;
    }
  });

  showLoader();
  try {
    const res = await gasCall('apiSaveLoginSettings', App.token, settings);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Login settings berhasil disimpan', 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

function previewLogin() {
  const url = '<?!= ScriptApp.getService().getUrl() ?>';
  if (!url) { toast('URL deployment tidak tersedia', 'warning'); return; }
  window.open(url + '?preview=login', '_blank');
}

// ============================================================
// DOWNLOAD SOURCE CODE (ZIP) — SUPER_ADMIN ONLY
// ============================================================
async function downloadSourceCode() {
  showLoader();
  try {
    const res = await gasCall('apiDownloadSourceCode');
    if (res && res.error) {
      hideLoader();
      // Cek apakah error karena belum ada backup
      if (res.error.indexOf('generateSourceCodeBackup') !== -1) {
        toast('Belum ada backup. Jalankan generateSourceCodeBackup() dari editor Apps Script.', 'warning');
        showConfirm({
          title: 'Backup Belum Tersedia', subtitle: 'Perlu dibuat terlebih dahulu',
          message: `Belum ada backup source code.<br><br><small style="color:#6b7280">Cara membuat backup:<br>1. Buka editor Apps Script<br>2. Pilih fungsi: <strong>generateSourceCodeBackup</strong><br>3. Klik Run<br>4. Kembali ke sini dan klik Download lagi</small>`,
          okText: 'Buka Editor', cancelText: 'Tutup', type: 'warning'
        }).then(ok => {
          if (ok) {
            var scriptId = '<?!= ScriptApp.getScriptId() ?>';
            window.open('https://script.google.com/d/' + scriptId + '/edit', '_blank');
          }
        });
      } else {
        toast(res.error, 'error');
      }
      return;
    }
    if (!res || !res.base64) { toast('Gagal: response tidak valid', 'error'); return; }

    const byteChars = atob(res.base64);
    const byteArr   = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: 'application/zip' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = res.filename || 'Backup.zip';
    a.click();
    URL.revokeObjectURL(url);

    const info = res.timestamp ? ' (backup: ' + res.timestamp + ')' : '';
    toast('Source code berhasil diunduh (' + (res.fileCount || 0) + ' file)' + info, 'success');
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

// ============================================================
// IMPORT DATA (MIGRASI) — SUPER_ADMIN ONLY
// ============================================================
let importWorkbookData = null;

function handleImportFileSelect(evt) {
  const file = evt.target.files[0];
  document.getElementById('btn-process-import').disabled = true;
  document.getElementById('import-summary-wrap').style.display = 'none';
  importWorkbookData = null;
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      importWorkbookData = buildImportPayload(wb);
      document.getElementById('btn-process-import').disabled = false;
      toast('File terbaca. Klik "Proses Import" untuk melanjutkan.', 'info');
    } catch (err) {
      toast('Gagal membaca file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function buildImportPayload(wb) {
  const sheetMap = {
    'Circle Group': 'circle_group',
    'Department': 'department',
    'Document Category': 'document_category',
    'Area': 'area',
    'Retention Period': 'retention_period',
    'Revision Reason': 'revision_reason',
    'Distribution Group': 'distribution_group',
    'Users': 'users',
    'Documents': 'documents'
  };
  const fieldMap = {
    circle_group: ['code', 'name', 'description'],
    department: ['code', 'name', 'head_email', 'reviewer1_email', 'description', 'circle_groups'],
    document_category: ['code', 'name', 'description'],
    area: ['code', 'name', 'circle_group', 'description'],
    retention_period: ['name', 'duration_years', 'description'],
    revision_reason: ['code', 'name', 'description'],
    distribution_group: ['name', 'description', 'members'],
    users: ['email', 'name', 'role', 'department', 'circle_group', 'status', 'initial_password'],
    documents: ['doc_number', 'title', 'category', 'department', 'area', 'circle_group', 'doc_type',
                'owner_email', 'reviewer1_email', 'reviewer2_email', 'reviewer3_email', 'approver_email', 'status', 'revision',
                'effective_date', 'expiry_date', 'retention_period', 'description', 'keywords', 'file_name']
  };

  const payload = {};
  Object.keys(sheetMap).forEach(function(sheetName) {
    const key = sheetMap[sheetName];
    const ws = wb.Sheets[sheetName];
    if (!ws) { payload[key] = []; return; }
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    payload[key] = rows.map(function(r) {
      const obj = {};
      fieldMap[key].forEach(function(f) { obj[f] = (r[f + '*'] !== undefined ? r[f + '*'] : r[f]) || ''; });
      return obj;
    });
  });
  return payload;
}

async function processImportFile() {
  if (!importWorkbookData) { toast('Pilih file terlebih dahulu.', 'warning'); return; }
  const okConfirm = await showConfirm({
    title: 'Proses Import Data', subtitle: 'Migrasi data massal',
    message: 'Data baru akan ditambahkan ke sistem. Data yang sudah ada (berdasarkan code/email/doc number) akan dilewati otomatis. Lanjutkan?',
    okText: 'Ya, Proses', cancelText: 'Batal', type: 'warning'
  });
  if (!okConfirm) return;

  showLoader();
  try {
    const res = await gasCall('apiImportData', importWorkbookData);
    if (res && res.error) { toast(res.error, 'error'); return; }
    renderImportSummary(res.summary);
    toast('Import selesai.', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

function renderImportSummary(summary) {
  const labelMap = {
    circle_group: 'Circle Group', department: 'Department', document_category: 'Document Category',
    area: 'Area', retention_period: 'Retention Period', revision_reason: 'Revision Reason',
    distribution_group: 'Distribution Group', users: 'Users', documents: 'Documents'
  };
  const tbody = document.getElementById('tbody-import-summary');
  const errWrap = document.getElementById('import-error-detail');
  tbody.innerHTML = '';
  let errorHtml = '';

  Object.keys(labelMap).forEach(function(key) {
    const s = (summary && summary[key]) || { inserted: 0, skipped: 0, errors: [] };
    tbody.innerHTML += '<tr><td>' + labelMap[key] + '</td><td>' + s.inserted +
      '</td><td>' + s.skipped + '</td><td>' + s.errors.length + '</td></tr>';
    if (s.errors.length) {
      errorHtml += '<div class="mt-2"><strong>' + labelMap[key] + ':</strong><ul class="small mb-0">' +
        s.errors.map(function(er) { return '<li>Baris ' + er.row + ': ' + er.reason + '</li>'; }).join('') +
        '</ul></div>';
    }
  });

  errWrap.innerHTML = errorHtml;
  document.getElementById('import-summary-wrap').style.display = '';
}

// ============================================================
// ACTIVE SESSIONS PAGE
// ============================================================
async function loadActiveSessions() {
  showLoader();
  try {
    const res = await gasCall('apiGetActiveSessions', App.token);
    if (res && res.error) { toast(res.error, 'error'); return; }
    const sessions = res.data || [];
    const tbody = document.getElementById('tbody-sessions');
    const sessionRowFn = s => {
      const expiry = new Date(s.expires_at);
      const remaining = Math.round((expiry - new Date()) / 60000);
      const remainingTxt = remaining > 60 ? Math.round(remaining/60) + ' jam' : remaining + ' menit';
      const isCurrent = s.email === App.user.email;
      const remainingBadge = `<span class="badge ${remaining < 60 ? 'bg-warning text-dark' : 'bg-success'}">${remainingTxt}</span>`;
      const kickBtn = !isCurrent
        ? `<button class="btn btn-outline-danger btn-sm" onclick="kickSession('${s.id}','${s.email}')"><i class="bi bi-x-circle me-1"></i>Kick</button>`
        : '';
      if (isMobile()) return `
        <div class="mobile-card" ${isCurrent ? 'style="border-left:3px solid var(--primary)"' : ''}>
          <div class="mobile-card-header">
            <div>
              <div class="mobile-card-title">${s.email||'-'}${isCurrent ? ' <span class="badge bg-primary" style="font-size:10px">Sesi Anda</span>' : ''}</div>
            </div>
            ${remainingBadge}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-box-arrow-in-right"></i>${fmtDateTime(s.created_at)}</span>
            <span><i class="bi bi-clock"></i>Exp: ${fmtDateTime(s.expires_at)}</span>
          </div>
          ${kickBtn ? `<div class="mobile-card-actions">${kickBtn}</div>` : ''}
        </div>`;
      return `<tr ${isCurrent ? 'class="table-primary"' : ''}>
        <td>
          ${s.email}
          ${isCurrent ? '<span class="badge bg-primary ms-1" style="font-size:10px">Sesi Anda</span>' : ''}
        </td>
        <td>${fmtDateTime(s.created_at)}</td>
        <td>${fmtDateTime(s.expires_at)}</td>
        <td>${remainingBadge}</td>
        <td>${kickBtn || '<span class="text-muted" style="font-size:12px">&mdash;</span>'}</td>
      </tr>`;
    };
    renderListOrCards('tbody-sessions', sessions, sessionRowFn, '<tr><td colspan="5" class="text-center text-muted py-3">Tidak ada sesi aktif</td></tr>', 5);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

async function kickSession(sessionId, email) {
  const okKick = await showConfirm({
  title: 'Paksa Logout User', subtitle: email,
  message: `User <strong>${email}</strong> akan dipaksa logout dari sistem. Lanjutkan?`,
  okText: 'Paksa Logout', cancelText: 'Batal', type: 'warning'});
  if (!okKick) return;
  showLoader();
  try {
    const res = await gasCall('apiKickSession', App.token, sessionId);
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('User ' + email + ' telah di-kick', 'success');
    loadActiveSessions();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// UPDATE USER TABLE — tambahkan tombol Reset Password
// ============================================================
async function loadUsers() {
  showLoader();
  try {
    await loadMasterDropdowns();
    const res = await gasCall('apiGetUsers');
    if (res && res.error) { toast(res.error, 'error'); return; }
    const tbody = document.getElementById('tbody-users');
    const userRowFn = u => {
      const statusBadgeU = u.status === 'Active'
        ? '<span class="badge bg-success">Active</span>'
        : u.status === 'Pending'
        ? '<span class="badge bg-warning text-dark">Pending</span>'
        : '<span class="badge bg-secondary">Inactive</span>';
      const actionBtns = u.status === 'Pending' ? `
        <button class="btn btn-outline-success btn-sm" onclick="approveRegister('${u.id}','${u.email}')"><i class="bi bi-check-lg"></i></button>
        <button class="btn btn-outline-danger btn-sm" onclick="rejectRegister('${u.id}','${u.email}')"><i class="bi bi-x-lg"></i></button>` : `
        <button class="btn btn-outline-secondary btn-sm" onclick="openUserModal(this)"
          data-id="${u.id}" data-email="${u.email}" data-name="${(u.name||'').replace(/"/g,'&quot;')}" data-role="${u.role}" data-dept="${u.department||''}" data-status="${u.status||'Active'}" data-cg="${u.circle_group||''}">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-outline-warning btn-sm" onclick="openResetPwModal(this)" data-email="${u.email}" data-name="${(u.name||'').replace(/"/g,'&quot;')}"><i class="bi bi-key"></i></button>
        <button class="btn btn-outline-danger btn-sm" onclick="deleteUser('${u.id}')"><i class="bi bi-trash"></i></button>`;

      if (isMobile()) return `
        <div class="mobile-card">
          <div class="mobile-card-header">
            <div><div class="mobile-card-title">${u.name||'-'}</div>
              <small class="text-muted">${u.email||'-'}</small>
            </div>
            ${statusBadgeU}
          </div>
          <div class="mobile-card-meta">
            <span><i class="bi bi-shield"></i><span class="badge bg-primary" style="font-size:10px">${u.role||'-'}</span></span>
            <span><i class="bi bi-building"></i>${u.department||'-'}</span>
            <span><i class="bi bi-people"></i>${u.circle_group||'-'}</span>
            <span><i class="bi bi-clock"></i>${fmtDate(u.last_login)}</span>
          </div>
          <div class="mobile-card-actions">${actionBtns}</div>
        </div>`;
      return `<tr>
        <td>${u.email||'-'}</td>
        <td>${u.name||'-'}</td>
        <td><span class="badge bg-primary" style="font-size:10px">${u.role||'-'}</span></td>
        <td>${u.department||'-'}</td>
        <td>${u.circle_group||'-'}</td>
        <td>${statusBadgeU}</td>
        <td>${fmtDate(u.last_login)}</td>
        <td><div class="btn-group btn-group-sm">${actionBtns}</div></td>
      </tr>`;
    };
    renderListOrCards('tbody-users', res.data||[], userRowFn, '<tr><td colspan="8" class="text-center text-muted py-3">Tidak ada user</td></tr>', 8);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

// ============================================================
// SESSION HEARTBEAT (cek setiap 5 menit)
// ============================================================
function startSessionHeartbeat() {
  setInterval(async function() {
    try {
      // Bypass auto-inject: token sudah di-pass manual ke apiValidateSession
      const res = await new Promise((resolve) => {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(() => resolve(null))
          .apiValidateSession(App.token);
      });
      if (!res || !res.valid) {
        handleSessionExpired();
      }
    } catch(e) {}
  }, 5 * 60 * 1000); // 5 menit
}

function applyPermissionsToSidebar() {
  if (App.user.role === 'SUPER_ADMIN') return; // SUPER_ADMIN lihat semua

  document.querySelectorAll('#sidebar li[data-menu]').forEach(li => {
    const menu = li.dataset.menu;
    const perm = App.perms[menu];
    const canView = perm && (perm.can_view == 1 || perm.can_view === true);
    li.style.display = canView ? '' : 'none';
  });

  // Sembunyikan juga nav-section label jika semua item dalam group hidden
  document.querySelectorAll('#sidebar .nav-section').forEach(section => {
    const group = section.closest('li');
    if (!group) return;
    let next = group.nextElementSibling;
    let allHidden = true;
    while (next && !next.querySelector('.nav-section')) {
      if (next.style.display !== 'none') { allHidden = false; break; }
      next = next.nextElementSibling;
    }
    if (group) group.style.display = allHidden ? 'none' : '';
  });
}
function toggleMobileSearch() {
  const bar = document.getElementById('mobile-search-bar');
  const isVisible = bar.style.display !== 'none';
  bar.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) setTimeout(() => document.getElementById('mobile-search-input').focus(), 100);
}

async function approveRegister(userId, userEmail) {
  const ok = await showConfirm({
    title: 'Setujui Registrasi',
    message: `Setujui pendaftaran <strong>${userEmail}</strong>?<br><small class="text-muted">Admin perlu set password via Reset Password setelahnya.</small>`,
    okText: 'Setujui', cancelText: 'Batal', type: 'primary'
  });
  if (!ok) return;
  showLoader();
  try {
    const res = await gasCall('apiApproveRegister', { userId, userEmail });
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Registrasi disetujui. Email notifikasi terkirim ke ' + userEmail, 'success');
    setTimeout(() => loadUsers(), 1000);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}

async function rejectRegister(userId, userEmail) {
  const ok = await showConfirm({
    title: 'Tolak Registrasi',
    message: `Tolak pendaftaran <strong>${userEmail}</strong>? Data akan dihapus.`,
    okText: 'Tolak', cancelText: 'Batal', type: 'danger'
  });
  if (!ok) return;
  showLoader();
  try {
    const res = await gasCall('apiRejectRegister', { userId, userEmail });
    if (res && res.error) { toast(res.error, 'error'); return; }
    toast('Registrasi ditolak.', 'info');
    loadPageData('user-management');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideLoader(); }
}
</script>
/* ReceiptLog — Contractor Receipt Tracking PWA
   All modules as IIFEs. No imports, no framework. */

// ─── DB Module ──────────────────────────────────────────────────────────────
const DB = (() => {
  let db = null;
  const DB_NAME = 'receiptlog';
  const DB_VERSION = 1;

  async function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const database = e.target.result;

        if (!database.objectStoreNames.contains('jobs')) {
          const jobStore = database.createObjectStore('jobs', { keyPath: 'id' });
          jobStore.createIndex('status', 'status', { unique: false });
          jobStore.createIndex('created', 'created', { unique: false });
        }

        if (!database.objectStoreNames.contains('receipts')) {
          const receiptStore = database.createObjectStore('receipts', { keyPath: 'id' });
          receiptStore.createIndex('jobId', 'jobId', { unique: false });
          receiptStore.createIndex('store', 'store', { unique: false });
          receiptStore.createIndex('isGas', 'isGas', { unique: false });
          receiptStore.createIndex('date', 'date', { unique: false });
          receiptStore.createIndex('category', 'category', { unique: false });
        }
      };

      req.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };

      req.onerror = (e) => {
        reject(e.target.error);
      };
    });
  }

  async function getAll(store, indexName, query) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const objectStore = tx.objectStore(store);
      let req;

      if (indexName) {
        const index = objectStore.index(indexName);
        req = query !== undefined ? index.getAll(query) : index.getAll();
      } else {
        req = objectStore.getAll();
      }

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(store, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(store, record) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(store, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  return { open, getAll, get, put, remove };
})();


// ─── Router Module ──────────────────────────────────────────────────────────
const Router = (() => {
  const viewMap = {
    dashboard: { view: 'view-dashboard', render: () => Dashboard.render() },
    jobs: { view: 'view-jobs', render: () => Jobs.renderList() },
    'job-detail': { view: 'view-job-detail', render: null },
    gas: { view: 'view-gas', render: () => GasLog.render() },
    add: { view: 'view-add', render: () => AddReceipt.populateForm() },
  };

  function init() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const viewName = btn.getAttribute('data-view');
        navigate(viewName);
      });
    });

    document.getElementById('btn-back-jobs').addEventListener('click', () => {
      navigate('jobs');
    });
  }

  function navigate(viewName, data) {
    // Hide all views
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    // Deactivate all nav buttons
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));

    const entry = viewMap[viewName];
    if (!entry) return;

    // Show target view
    const viewEl = document.getElementById(entry.view);
    if (viewEl) viewEl.classList.add('active');

    // Activate matching nav button (if one exists for this view)
    const navBtn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Call render function
    if (viewName === 'job-detail' && data) {
      Jobs.renderDetail(data);
    } else if (entry.render) {
      entry.render();
    }
  }

  return { init, navigate };
})();


// ─── Helpers ────────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatMoney(n) {
  return '$' + (Number(n) || 0).toFixed(2);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString();
}

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// ─── Dashboard Module ───────────────────────────────────────────────────────
const Dashboard = (() => {
  let currentFilter = 'pending'; // default to pending

  async function render() {
    const [jobs, receipts] = await Promise.all([
      DB.getAll('jobs'),
      DB.getAll('receipts'),
    ]);

    const activeJobs = jobs.filter((j) => j.status === 'active').length;
    const pendingCount = receipts.filter((r) => !r.submitted).length;

    // Wire up filter toggle
    const filterEl = document.getElementById('dashboard-filter');
    filterEl.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === currentFilter);
      btn.onclick = () => {
        currentFilter = btn.getAttribute('data-filter');
        render();
      };
    });

    const recentEl = document.getElementById('dashboard-recent');
    const emptyEl = document.getElementById('dashboard-empty');

    // Apply filter
    const filtered = currentFilter === 'pending'
      ? receipts.filter((r) => !r.submitted)
      : receipts;

    // Stats reflect the active filter
    const totalSpend = filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const gasTotal = filtered
      .filter((r) => r.isGas)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    document.getElementById('dashboard-total').textContent = formatMoney(totalSpend);
    document.getElementById('dashboard-job-count').textContent = activeJobs;
    document.getElementById('dashboard-pending-count').textContent = pendingCount;
    document.getElementById('dashboard-gas-total').textContent = formatMoney(gasTotal);

    if (filtered.length === 0) {
      recentEl.style.display = 'none';
      emptyEl.style.display = '';
      if (currentFilter === 'pending' && receipts.length > 0) {
        emptyEl.querySelector('p').textContent = 'All receipts submitted!';
      } else {
        emptyEl.querySelector('p').textContent = 'No receipts yet. Tap + to add your first one.';
      }
      return;
    }

    recentEl.style.display = '';
    emptyEl.style.display = 'none';

    // Sort by date descending, then by created descending
    const sorted = filtered
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0))
      .slice(0, 10);

    // Build a job lookup map
    const jobMap = {};
    jobs.forEach((j) => (jobMap[j.id] = j));

    recentEl.innerHTML = sorted
      .map((r) => {
        const job = jobMap[r.jobId];
        const jobName = job ? escapeHTML(job.name) : 'Unknown Job';
        const statusClass = r.submitted ? 'status-dot status-submitted' : 'status-dot';
        const statusTitle = r.submitted ? 'Submitted' : 'Pending';
        return `
        <div class="receipt-card" data-id="${r.id}">
          <div class="receipt-meta"><span class="${statusClass}" title="${statusTitle}"></span> ${formatDate(r.date)} &middot; ${jobName}</div>
          <div class="receipt-card-row">
            <span class="receipt-store">${escapeHTML(r.store)}</span>
            <span class="amount">${formatMoney(r.amount)}</span>
          </div>
          <span class="category-tag cat-${(r.category || 'Other').toLowerCase()}">${escapeHTML(r.category || 'Other')}</span>
          ${r.notes ? `<div class="receipt-notes">${escapeHTML(r.notes)}</div>` : ''}
        </div>`;
      })
      .join('');
  }

  return { render };
})();


// ─── Jobs Module ────────────────────────────────────────────────────────────
const Jobs = (() => {
  let editingJobId = null;

  async function renderList() {
    const [jobs, receipts] = await Promise.all([
      DB.getAll('jobs'),
      DB.getAll('receipts'),
    ]);

    const listEl = document.getElementById('jobs-list');
    const emptyEl = document.getElementById('jobs-empty');

    if (jobs.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = '';
    } else {
      listEl.style.display = '';
      emptyEl.style.display = 'none';
    }

    // Compute per-job stats
    const jobStats = {};
    receipts.forEach((r) => {
      if (!jobStats[r.jobId]) jobStats[r.jobId] = { total: 0, count: 0 };
      jobStats[r.jobId].total += Number(r.amount) || 0;
      jobStats[r.jobId].count += 1;
    });

    // Sort: active first, then by created desc
    const sorted = jobs.slice().sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return (b.created || 0) - (a.created || 0);
    });

    listEl.innerHTML = sorted
      .map((j) => {
        const stats = jobStats[j.id] || { total: 0, count: 0 };
        const badgeClass = j.status === 'active' ? 'badge-active' : 'badge-complete';
        return `
        <div class="job-card" data-id="${j.id}">
          <div class="job-card-top">
            <div class="job-card-info">
              <h3 class="job-card-name">${escapeHTML(j.name)}</h3>
              ${j.client ? `<div class="job-card-client">${escapeHTML(j.client)}</div>` : ''}
            </div>
            <span class="badge ${badgeClass}">${j.status}</span>
          </div>
          <div class="job-card-bottom">
            <span class="amount">${formatMoney(stats.total)}</span>
            <span class="job-card-count">${stats.count} receipt${stats.count !== 1 ? 's' : ''}</span>
            <div class="job-card-actions">
              <button class="btn-icon btn-edit-job" data-id="${j.id}" title="Edit Job">&#9998;</button>
              <button class="btn-icon btn-delete-job" data-id="${j.id}" title="Delete Job">&#128465;</button>
            </div>
          </div>
        </div>`;
      })
      .join('');

    // Attach click listeners
    listEl.querySelectorAll('.job-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Don't navigate if clicking edit/delete buttons
        if (e.target.closest('.btn-edit-job') || e.target.closest('.btn-delete-job')) return;
        Router.navigate('job-detail', card.getAttribute('data-id'));
      });
    });

    listEl.querySelectorAll('.btn-edit-job').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        await openJobModal(id);
      });
    });

    listEl.querySelectorAll('.btn-delete-job').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        await deleteJob(id);
      });
    });

    // Add job button
    document.getElementById('btn-add-job').onclick = () => openJobModal(null);
  }

  async function openJobModal(jobId) {
    editingJobId = jobId;
    const modal = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');

    if (jobId) {
      title.textContent = 'Edit Job';
      const job = await DB.get('jobs', jobId);
      if (job) {
        document.getElementById('job-name').value = job.name || '';
        document.getElementById('job-client').value = job.client || '';
        document.getElementById('job-address').value = job.address || '';
        document.getElementById('job-status').value = job.status || 'active';
      }
    } else {
      title.textContent = 'New Job';
      document.getElementById('job-form').reset();
    }

    modal.style.display = '';
  }

  function closeJobModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    editingJobId = null;
    document.getElementById('job-form').reset();
  }

  async function saveJob(e) {
    e.preventDefault();

    const name = document.getElementById('job-name').value.trim();
    const client = document.getElementById('job-client').value.trim();
    const address = document.getElementById('job-address').value.trim();
    const status = document.getElementById('job-status').value;

    if (!name) return;

    if (editingJobId) {
      const existing = await DB.get('jobs', editingJobId);
      await DB.put('jobs', {
        ...existing,
        name,
        client,
        address,
        status,
      });
    } else {
      await DB.put('jobs', {
        id: generateId(),
        name,
        client,
        address,
        status,
        created: Date.now(),
      });
    }

    closeJobModal();
    await renderList();
  }

  async function deleteJob(jobId) {
    const job = await DB.get('jobs', jobId);
    if (!job) return;
    if (!confirm(`Delete "${job.name}" and all its receipts?`)) return;

    // Delete all receipts for this job
    const receipts = await DB.getAll('receipts', 'jobId', jobId);
    for (const r of receipts) {
      await DB.remove('receipts', r.id);
    }

    await DB.remove('jobs', jobId);
    await renderList();
  }

  async function renderDetail(jobId) {
    const [job, allReceipts] = await Promise.all([
      DB.get('jobs', jobId),
      DB.getAll('receipts', 'jobId', jobId),
    ]);

    if (!job) {
      Router.navigate('jobs');
      return;
    }

    const totalSpend = allReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const badgeClass = job.status === 'active' ? 'badge-active' : 'badge-complete';
    const pendingCount = allReceipts.filter((r) => !r.submitted).length;

    const headerEl = document.getElementById('job-detail-header');
    headerEl.innerHTML = `
      <div class="job-detail-top">
        <div>
          <h2 class="job-detail-name">${escapeHTML(job.name)}</h2>
          ${job.client ? `<div class="job-detail-client">${escapeHTML(job.client)}</div>` : ''}
          ${job.address ? `<div class="job-detail-address">${escapeHTML(job.address)}</div>` : ''}
        </div>
        <span class="badge ${badgeClass}">${job.status}</span>
      </div>
      <div class="job-detail-stats">
        <span class="amount">${formatMoney(totalSpend)}</span>
        <span class="job-detail-count">${allReceipts.length} receipt${allReceipts.length !== 1 ? 's' : ''} &middot; ${pendingCount} pending</span>
      </div>
      <div class="job-detail-actions">
        <button class="btn-secondary btn-sm btn-edit-detail-job" data-id="${job.id}">Edit Job</button>
        <button class="btn-primary btn-sm btn-share-report">Share Report</button>
        <button class="btn-secondary btn-sm btn-export-job" data-id="${job.id}">CSV</button>
        ${pendingCount > 0 ? `<button class="btn-mark-submitted btn-sm btn-mark-all-submitted" data-id="${job.id}">Mark All Submitted</button>` : ''}
        <button class="btn-danger btn-sm btn-delete-detail-job" data-id="${job.id}">Delete Job</button>
      </div>`;

    // Edit button in detail header
    headerEl.querySelector('.btn-edit-detail-job').addEventListener('click', async () => {
      await openJobModal(job.id);
    });

    // Share Report button
    headerEl.querySelector('.btn-share-report').addEventListener('click', async () => {
      await Export.shareReport(job, allReceipts, () => renderDetail(jobId));
    });

    // Export CSV button
    headerEl.querySelector('.btn-export-job').addEventListener('click', () => {
      Export.jobToCSV(job, allReceipts);
    });

    // Mark All Submitted button
    const markAllBtn = headerEl.querySelector('.btn-mark-all-submitted');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', async () => {
        for (const r of allReceipts) {
          if (!r.submitted) {
            r.submitted = true;
            await DB.put('receipts', r);
          }
        }
        await renderDetail(jobId);
      });
    }

    // Delete button in detail header
    headerEl.querySelector('.btn-delete-detail-job').addEventListener('click', async () => {
      await deleteJob(job.id);
      Router.navigate('jobs');
    });

    // Group receipts by store
    const grouped = {};
    allReceipts.forEach((r) => {
      const store = r.store || 'Other';
      if (!grouped[store]) grouped[store] = [];
      grouped[store].push(r);
    });

    // Sort each group by date descending
    Object.values(grouped).forEach((arr) =>
      arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    );

    const receiptsEl = document.getElementById('job-detail-receipts');

    if (allReceipts.length === 0) {
      receiptsEl.innerHTML = `
        <div class="empty-state">
          <p>No receipts for this job yet.</p>
        </div>`;
      return;
    }

    const storeNames = Object.keys(grouped).sort();

    receiptsEl.innerHTML = storeNames
      .map((store) => {
        const items = grouped[store];
        const subtotal = items.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        return `
        <div class="receipt-group">
          <div class="receipt-group-header">
            <span>${escapeHTML(store)}</span>
            <span class="amount">${formatMoney(subtotal)}</span>
          </div>
          <div class="receipt-group-items">
            ${items
              .map(
                (r) => {
                  const statusClass = r.submitted ? 'status-dot status-submitted' : 'status-dot';
                  const statusTitle = r.submitted ? 'Submitted — tap to mark pending' : 'Pending — tap to mark submitted';
                  return `
              <div class="receipt-card" data-id="${r.id}">
                <div class="receipt-meta"><span class="${statusClass}" data-receipt-id="${r.id}" title="${statusTitle}"></span> ${formatDate(r.date)}</div>
                <div class="receipt-card-row">
                  <span class="amount">${formatMoney(r.amount)}</span>
                  <span class="category-tag cat-${(r.category || 'Other').toLowerCase()}">${escapeHTML(r.category || 'Other')}</span>
                </div>
                ${r.notes ? `<div class="receipt-notes">${escapeHTML(r.notes)}</div>` : ''}
                ${r.photo ? `<img class="photo-thumb" src="${r.photo}" alt="Receipt photo">` : ''}
                <div class="receipt-card-actions">
                  ${r.photo ? `<button class="btn-icon btn-share-photo" data-id="${r.id}" title="Share Photo">&#x1F4E4;</button>` : ''}
                  <button class="btn-icon btn-edit-receipt" data-id="${r.id}" title="Edit Receipt">&#9998;</button>
                  <button class="btn-icon btn-delete-receipt" data-id="${r.id}" title="Delete Receipt">&#128465;</button>
                </div>
              </div>`;
                }
              )
              .join('')}
          </div>
        </div>`;
      })
      .join('');

    // Toggle collapsible groups
    receiptsEl.querySelectorAll('.receipt-group-header').forEach((header) => {
      header.addEventListener('click', () => {
        const items = header.nextElementSibling;
        items.style.display = items.style.display === 'none' ? '' : 'none';
      });
    });

    // Toggle submitted status on status dot click
    receiptsEl.querySelectorAll('.status-dot').forEach((dot) => {
      dot.addEventListener('click', async (e) => {
        e.stopPropagation();
        const receiptId = dot.getAttribute('data-receipt-id');
        const receipt = await DB.get('receipts', receiptId);
        if (receipt) {
          receipt.submitted = !receipt.submitted;
          await DB.put('receipts', receipt);
          await renderDetail(jobId);
        }
      });
    });

    // Edit receipt — populate form and navigate to add view
    // Share individual receipt photo
    receiptsEl.querySelectorAll('.btn-share-photo').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const receipt = await DB.get('receipts', id);
        if (receipt) await sharePhoto(receipt);
      });
    });

    receiptsEl.querySelectorAll('.btn-edit-receipt').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        document.getElementById('receipt-edit-id').value = id;
        Router.navigate('add');
      });
    });

    // Delete receipt
    receiptsEl.querySelectorAll('.btn-delete-receipt').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!confirm('Delete this receipt?')) return;
        await DB.remove('receipts', id);
        await renderDetail(jobId);
      });
    });
  }

  // Wire up modal close and form submit once
  function initModal() {
    document.getElementById('modal-close').addEventListener('click', closeJobModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeJobModal();
    });
    document.getElementById('job-form').addEventListener('submit', saveJob);
  }

  // Call initModal on load
  initModal();

  return { renderList, renderDetail };
})();


// ─── GasLog Module ──────────────────────────────────────────────────────────
const GasLog = (() => {
  let currentPeriod = 'week';

  function getWeekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().split('T')[0];
  }

  function getWeekLabel(mondayStr) {
    const mon = new Date(mondayStr + 'T00:00:00');
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return mon.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' - ' +
           sun.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function getMonthKey(dateStr) {
    return dateStr.slice(0, 7); // "2026-03"
  }

  function getMonthLabel(monthKey) {
    const d = new Date(monthKey + '-01T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  async function render() {
    const allReceipts = await DB.getAll('receipts');
    const filtered = allReceipts.filter((r) => r.isGas === true || r.isGas === 1);

    const sorted = filtered
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Update stats bar
    const total = sorted.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const pendingCount = sorted.filter((r) => !r.submitted).length;
    const reimbursedCount = sorted.filter((r) => !!r.submitted).length;
    document.getElementById('gas-total').textContent = formatMoney(total);
    document.getElementById('gas-pending').textContent = pendingCount;
    document.getElementById('gas-reimbursed').textContent = reimbursedCount;

    // Wire up period toggle
    const toggleEl = document.getElementById('gas-period-toggle');
    toggleEl.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-period') === currentPeriod);
      btn.onclick = () => {
        currentPeriod = btn.getAttribute('data-period');
        render();
      };
    });

    const listEl = document.getElementById('gas-list');
    const emptyEl = document.getElementById('gas-empty');

    if (sorted.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = '';
      return;
    }

    listEl.style.display = '';
    emptyEl.style.display = 'none';

    // Build job lookup
    const jobs = await DB.getAll('jobs');
    const jobMap = {};
    jobs.forEach((j) => (jobMap[j.id] = j));

    // Group by period
    const groups = {};
    sorted.forEach((r) => {
      const key = currentPeriod === 'week' ? getWeekKey(r.date) : getMonthKey(r.date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    // Sort group keys descending (most recent first)
    const groupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    listEl.innerHTML = groupKeys
      .map((key) => {
        const items = groups[key];
        const groupTotal = items.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        const groupPending = items.filter((r) => !r.submitted).length;
        const groupReimbursed = items.filter((r) => !!r.submitted).length;
        const label = currentPeriod === 'week' ? getWeekLabel(key) : getMonthLabel(key);

        const statusParts = [];
        if (groupPending > 0) statusParts.push(groupPending + ' pending');
        if (groupReimbursed > 0) statusParts.push(groupReimbursed + ' reimbursed');

        return `
        <div class="receipt-group">
          <div class="receipt-group-header">
            <span>${escapeHTML(label)}</span>
            <div class="gas-group-meta">
              <span class="amount">${formatMoney(groupTotal)}</span>
              <span class="gas-group-status">${statusParts.join(' \u00b7 ')}</span>
            </div>
          </div>
          <div class="receipt-group-items">
            ${items.map((r) => {
              const job = jobMap[r.jobId];
              const jobName = job ? escapeHTML(job.name) : 'Unknown Job';
              const statusClass = r.submitted ? 'status-dot status-submitted' : 'status-dot';
              const statusTitle = r.submitted ? 'Submitted' : 'Pending';
              return `
              <div class="receipt-card" data-id="${r.id}">
                <div class="receipt-meta"><span class="${statusClass}" title="${statusTitle}"></span> ${formatDate(r.date)} &middot; ${jobName}</div>
                <div class="receipt-card-row">
                  <span class="receipt-store">${escapeHTML(r.store)}</span>
                  <span class="amount">${formatMoney(r.amount)}</span>
                </div>
                ${r.notes ? `<div class="receipt-notes">${escapeHTML(r.notes)}</div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      })
      .join('');

    // Toggle collapsible groups
    listEl.querySelectorAll('.receipt-group-header').forEach((header) => {
      header.addEventListener('click', () => {
        const items = header.nextElementSibling;
        items.style.display = items.style.display === 'none' ? '' : 'none';
      });
    });
  }

  return { render };
})();


// ─── AddReceipt Module ─────────────────────────────────────────────────────
const AddReceipt = (() => {
  let photoData = null;

  function init() {
    // Default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('field-date').value = today;

    // Camera button triggers file input
    document.getElementById('camera-btn').addEventListener('click', () => {
      document.getElementById('field-photo').click();
    });

    // Photo file selected
    document.getElementById('field-photo').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        photoData = ev.target.result;
        document.getElementById('photo-preview-img').src = photoData;
        document.getElementById('photo-preview').style.display = '';
      };
      reader.readAsDataURL(file);
    });

    // Remove photo
    document.getElementById('photo-remove').addEventListener('click', () => {
      photoData = null;
      document.getElementById('photo-preview').style.display = 'none';
      document.getElementById('photo-preview-img').src = '';
      document.getElementById('field-photo').value = '';
    });

    // Gas toggle <-> category sync
    document.getElementById('field-gas').addEventListener('change', (e) => {
      if (e.target.checked) {
        document.getElementById('field-category').value = 'Gas';
      }
    });

    document.getElementById('field-category').addEventListener('change', (e) => {
      document.getElementById('field-gas').checked = e.target.value === 'Gas';
    });

    // Form submit
    document.getElementById('receipt-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveReceipt();
    });
  }

  async function populateForm() {
    // Refresh job dropdown
    const jobs = await DB.getAll('jobs');
    const jobSelect = document.getElementById('field-job');
    // Keep the first placeholder option
    jobSelect.innerHTML = '<option value="">Select a job...</option>';
    jobs.forEach((j) => {
      const opt = document.createElement('option');
      opt.value = j.id;
      opt.textContent = j.name;
      jobSelect.appendChild(opt);
    });

    // Refresh store suggestions
    const allReceipts = await DB.getAll('receipts');
    const storeNames = [...new Set(allReceipts.map((r) => r.store).filter(Boolean))].sort();
    const datalist = document.getElementById('store-suggestions');
    datalist.innerHTML = storeNames.map((s) => `<option value="${escapeHTML(s)}">`).join('');

    // Check if editing
    const editId = document.getElementById('receipt-edit-id').value;
    const titleEl = document.getElementById('add-view-title');

    if (editId) {
      titleEl.textContent = 'Edit Receipt';
      const receipt = await DB.get('receipts', editId);
      if (receipt) {
        document.getElementById('field-job').value = receipt.jobId || '';
        document.getElementById('field-store').value = receipt.store || '';
        document.getElementById('field-amount').value = receipt.amount || '';
        document.getElementById('field-date').value = receipt.date || '';
        document.getElementById('field-category').value = receipt.category || 'Materials';
        document.getElementById('field-notes').value = receipt.notes || '';
        document.getElementById('field-gas').checked = !!receipt.isGas;

        if (receipt.photo) {
          photoData = receipt.photo;
          document.getElementById('photo-preview-img').src = photoData;
          document.getElementById('photo-preview').style.display = '';
        } else {
          photoData = null;
          document.getElementById('photo-preview').style.display = 'none';
        }
      }
    } else {
      titleEl.textContent = 'Add Receipt';
      // Reset form for new entry
      document.getElementById('receipt-form').reset();
      // Re-set date to today after reset
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('field-date').value = today;
      photoData = null;
      document.getElementById('photo-preview').style.display = 'none';
      document.getElementById('photo-preview-img').src = '';
    }
  }

  async function saveReceipt() {
    const editId = document.getElementById('receipt-edit-id').value;
    const jobId = document.getElementById('field-job').value;
    const store = document.getElementById('field-store').value.trim();
    const amount = parseFloat(document.getElementById('field-amount').value);
    const date = document.getElementById('field-date').value;
    const category = document.getElementById('field-category').value;
    const notes = document.getElementById('field-notes').value.trim();
    const isGas = document.getElementById('field-gas').checked;

    if (!jobId || !store || isNaN(amount) || !date) return;

    let receipt;

    if (editId) {
      const existing = await DB.get('receipts', editId);
      receipt = {
        id: editId,
        jobId,
        store,
        amount,
        date,
        category,
        notes,
        isGas,
        photo: photoData || null,
        created: existing ? existing.created : Date.now(),
        submitted: existing ? !!existing.submitted : false,
      };
    } else {
      receipt = {
        id: generateId(),
        jobId,
        store,
        amount,
        date,
        category,
        notes,
        isGas,
        photo: photoData || null,
        created: Date.now(),
        submitted: false,
      };
    }

    await DB.put('receipts', receipt);

    // Clear form
    document.getElementById('receipt-form').reset();
    document.getElementById('receipt-edit-id').value = '';
    photoData = null;
    document.getElementById('photo-preview').style.display = 'none';
    document.getElementById('photo-preview-img').src = '';
    document.getElementById('field-photo').value = '';

    // Reset date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('field-date').value = today;

    Router.navigate('dashboard');
  }

  return { init, populateForm };
})();


// ─── Export Module ──────────────────────────────────────────────────────────
const Export = (() => {
  async function toCSV() {
    const [receipts, jobs] = await Promise.all([
      DB.getAll('receipts'),
      DB.getAll('jobs'),
    ]);

    const jobMap = {};
    jobs.forEach((j) => (jobMap[j.id] = j));

    const header = 'Date,Job,Store,Category,Amount,Gas,Submitted,Notes';
    const rows = receipts
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map((r) => {
        const job = jobMap[r.jobId];
        const jobName = job ? job.name : '';
        return [
          r.date || '',
          csvEscape(jobName),
          csvEscape(r.store || ''),
          csvEscape(r.category || ''),
          (Number(r.amount) || 0).toFixed(2),
          r.isGas ? 'Yes' : 'No',
          r.submitted ? 'Yes' : 'No',
          csvEscape(r.notes || ''),
        ].join(',');
      });

    const csv = [header, ...rows].join('\n');
    downloadCSV(csv, `receiptlog-${new Date().toISOString().split('T')[0]}.csv`);
  }

  function jobToCSV(job, receipts) {
    const header = 'Date,Store,Category,Amount,Gas,Submitted,Notes';
    const rows = receipts
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map((r) => {
        return [
          r.date || '',
          csvEscape(r.store || ''),
          csvEscape(r.category || ''),
          (Number(r.amount) || 0).toFixed(2),
          r.isGas ? 'Yes' : 'No',
          r.submitted ? 'Yes' : 'No',
          csvEscape(r.notes || ''),
        ].join(',');
      });

    const csv = [header, ...rows].join('\n');
    const safeName = (job.name || 'job').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `receiptlog-${safeName}-${today}.csv`);
  }

  function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, filename);
  }

  function generateReport(job, receipts) {
    const sorted = receipts.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const totalSpend = receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const receiptCount = receipts.length;
    const pendingCount = receipts.filter((r) => !r.submitted).length;
    const gasTotal = receipts.filter((r) => r.isGas).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const photosExist = receipts.some((r) => r.photo);

    // Date range
    const dates = sorted.map((r) => r.date).filter(Boolean);
    const dateFrom = dates.length > 0 ? dates[0] : '';
    const dateTo = dates.length > 0 ? dates[dates.length - 1] : '';
    const now = new Date();
    const generatedDate = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const generatedTimestamp = now.toLocaleString();

    // Category breakdown
    const catMap = {};
    receipts.forEach((r) => {
      const cat = r.category || 'Other';
      if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
      catMap[cat].total += Number(r.amount) || 0;
      catMap[cat].count += 1;
    });
    const categories = Object.keys(catMap).sort();

    // Category color map (matches app CSS)
    const catColors = {
      Materials: { bg: '#DBEAFE', color: '#1E40AF' },
      Tools: { bg: '#F3E8FF', color: '#6B21A8' },
      Gas: { bg: '#FEF3C7', color: '#92400E' },
      Permits: { bg: '#D1FAE5', color: '#065F46' },
      Meals: { bg: '#FFE4E6', color: '#9F1239' },
      Rental: { bg: '#E0E7FF', color: '#3730A3' },
      Other: { bg: '#F0F2F7', color: '#475569' },
    };

    function getCatStyle(cat) {
      const c = catColors[cat] || catColors.Other;
      return `background:${c.bg};color:${c.color};padding:3px 10px;border-radius:50px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:inline-block;`;
    }

    function esc(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString();
    }

    function fmtMoney(n) {
      return '$' + (Number(n) || 0).toFixed(2);
    }

    // Build category breakdown rows
    const catRows = categories.map((cat) => {
      const data = catMap[cat];
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E5F0;"><span style="${getCatStyle(cat)}">${esc(cat)}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E5F0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${fmtMoney(data.total)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E5F0;text-align:center;color:#4B5563;">${data.count}</td>
      </tr>`;
    }).join('');

    // Build receipt table rows
    const receiptRows = sorted.map((r) => {
      const statusColor = r.submitted ? '#10B981' : '#F59E0B';
      const statusLabel = r.submitted ? 'Submitted' : 'Pending';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E5F0;white-space:nowrap;">${fmtDate(r.date)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E5F0;font-weight:500;">${esc(r.store)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E5F0;"><span style="${getCatStyle(r.category || 'Other')}">${esc(r.category || 'Other')}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E5F0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${fmtMoney(r.amount)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E5F0;color:#4B5563;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.notes)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E5F0;white-space:nowrap;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};margin-right:6px;vertical-align:middle;"></span>
          <span style="color:${statusColor};font-weight:500;font-size:13px;">${statusLabel}</span>
        </td>
      </tr>`;
    }).join('');

    // Build photos section
    let photosSection = '';
    if (photosExist) {
      const photoCards = sorted.filter((r) => r.photo).map((r) => {
        return `<div style="break-inside:avoid;margin-bottom:16px;border:1px solid #E2E5F0;border-radius:12px;overflow:hidden;background:#fff;">
          <img src="${r.photo}" alt="Receipt photo" style="width:100%;display:block;max-height:400px;object-fit:contain;background:#F7F8FC;">
          <div style="padding:10px 14px;">
            <div style="font-weight:600;font-size:14px;color:#111827;">${esc(r.store)} &mdash; ${fmtDate(r.date)}</div>
            <div style="font-weight:700;font-size:16px;color:#6366F1;margin-top:2px;">${fmtMoney(r.amount)}</div>
          </div>
        </div>`;
      }).join('');

      photosSection = `
      <div style="margin-top:32px;">
        <h2 style="font-size:18px;font-weight:700;color:#111827;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #6366F1;">Receipt Photos</h2>
        <div style="column-count:2;column-gap:16px;">
          ${photoCards}
        </div>
      </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ReceiptLog Report - ${esc(job.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #111827; background: #fff; }
  table { border-collapse: collapse; width: 100%; }
  @media print {
    body { font-size: 12px; }
    .page-break { page-break-before: always; }
  }
  @media (max-width: 600px) {
    .summary-grid { flex-direction: column !important; }
    .summary-card { min-width: 100% !important; }
    table { font-size: 12px; }
    td, th { padding: 6px 8px !important; }
    .photos-grid { column-count: 1 !important; }
  }
</style>
</head>
<body style="padding:0;margin:0;">
  <!-- Header -->
  <div style="background:linear-gradient(135deg, #6366F1, #8B5CF6);padding:32px 24px;color:#fff;">
    <div style="font-size:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;opacity:0.85;margin-bottom:8px;">ReceiptLog</div>
    <h1 style="font-size:28px;font-weight:800;margin-bottom:8px;color:#fff;">${esc(job.name)}</h1>
    ${job.client ? `<div style="font-size:15px;opacity:0.9;margin-bottom:4px;">${esc(job.client)}</div>` : ''}
    ${job.address ? `<div style="font-size:14px;opacity:0.75;">${esc(job.address)}</div>` : ''}
    <div style="margin-top:16px;font-size:13px;opacity:0.75;">
      ${dateFrom && dateTo ? `${fmtDate(dateFrom)} &ndash; ${fmtDate(dateTo)} &nbsp;&bull;&nbsp; ` : ''}
      Report generated ${esc(generatedDate)}
    </div>
  </div>

  <div style="padding:24px;max-width:800px;margin:0 auto;">
    <!-- Summary -->
    <div style="margin-bottom:32px;">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #6366F1;">Summary</h2>
      <div class="summary-grid" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <div class="summary-card" style="flex:1;min-width:140px;padding:16px;background:#F7F8FC;border-radius:12px;border-left:4px solid #6366F1;">
          <div style="font-size:12px;font-weight:600;color:#4B5563;margin-bottom:4px;">Total Spend</div>
          <div style="font-size:28px;font-weight:800;color:#111827;font-variant-numeric:tabular-nums;">${fmtMoney(totalSpend)}</div>
        </div>
        <div class="summary-card" style="flex:1;min-width:140px;padding:16px;background:#F7F8FC;border-radius:12px;border-left:4px solid #10B981;">
          <div style="font-size:12px;font-weight:600;color:#4B5563;margin-bottom:4px;">Receipts</div>
          <div style="font-size:28px;font-weight:800;color:#111827;">${receiptCount}</div>
        </div>
        ${gasTotal > 0 ? `<div class="summary-card" style="flex:1;min-width:140px;padding:16px;background:#F7F8FC;border-radius:12px;border-left:4px solid #06B6D4;">
          <div style="font-size:12px;font-weight:600;color:#4B5563;margin-bottom:4px;">Gas Total</div>
          <div style="font-size:28px;font-weight:800;color:#111827;font-variant-numeric:tabular-nums;">${fmtMoney(gasTotal)}</div>
        </div>` : ''}
      </div>

      <!-- Category Breakdown -->
      <table style="margin-bottom:8px;">
        <thead>
          <tr style="background:#F7F8FC;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E5F0;">Category</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E5F0;">Amount</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E5F0;">Count</th>
          </tr>
        </thead>
        <tbody>
          ${catRows}
        </tbody>
      </table>
    </div>

    <!-- Receipt Table -->
    <div style="margin-bottom:32px;">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #6366F1;">All Receipts</h2>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr style="background:#F7F8FC;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E5F0;">Date</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E5F0;">Store</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E5F0;">Category</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E5F0;">Amount</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E5F0;">Details</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #E2E5F0;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${receiptRows}
            <tr style="background:#F7F8FC;font-weight:700;">
              <td style="padding:10px 12px;border-top:2px solid #6366F1;" colspan="3">Total</td>
              <td style="padding:10px 12px;border-top:2px solid #6366F1;text-align:right;font-variant-numeric:tabular-nums;color:#6366F1;font-size:16px;">${fmtMoney(totalSpend)}</td>
              <td style="padding:10px 12px;border-top:2px solid #6366F1;" colspan="2">${receiptCount} receipt${receiptCount !== 1 ? 's' : ''} &bull; ${pendingCount} pending</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Photos -->
    ${photosExist ? `<div class="page-break"></div>` : ''}
    <div class="photos-grid">${photosSection}</div>

    <!-- Footer -->
    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #E2E5F0;text-align:center;">
      <div style="font-size:12px;color:#9CA3AF;">Generated by ReceiptLog &bull; ${esc(generatedTimestamp)}</div>
    </div>
  </div>
</body>
</html>`;

    return new Blob([html], { type: 'text/html' });
  }

  async function shareReport(job, receipts, onShared) {
    const reportBlob = generateReport(job, receipts);
    const safeName = (job.name || 'job').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    const totalSpend = receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const shareTitle = `ReceiptLog: ${job.name}`;
    const shareText = `${job.name} — ${receipts.length} receipts, ${formatMoney(totalSpend)} total`;

    let shared = false;

    // Try sharing as HTML file first
    const htmlFile = new File([reportBlob], `receiptlog-${safeName}-${today}.html`, { type: 'text/html' });

    if (navigator.share) {
      // Strategy 1: Share HTML file
      if (navigator.canShare && navigator.canShare({ files: [htmlFile] })) {
        try {
          await navigator.share({ title: shareTitle, text: shareText, files: [htmlFile] });
          shared = true;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }

      // Strategy 2: Share as text/URL (no file — works on more platforms)
      if (!shared) {
        try {
          // Build a plain-text summary for email/messaging
          const summary = buildTextSummary(job, receipts);
          await navigator.share({ title: shareTitle, text: summary });
          shared = true;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
    }

    // Strategy 3: mailto with summary + download the file
    if (!shared) {
      const summary = buildTextSummary(job, receipts);
      const mailtoLink = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(summary)}`;
      window.open(mailtoLink, '_blank');
      downloadFile(reportBlob, `receiptlog-${safeName}-${today}.html`);
    }

    // Mark as submitted on successful share
    if (shared) {
      for (const r of receipts) {
        if (!r.submitted) {
          r.submitted = true;
          await DB.put('receipts', r);
        }
      }
      if (onShared) onShared();
    }
  }

  function buildTextSummary(job, receipts) {
    const totalSpend = receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const pending = receipts.filter(r => !r.submitted).length;
    const dates = receipts.map(r => r.date).filter(Boolean).sort();
    const dateRange = dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : 'N/A';

    // Category breakdown
    const cats = {};
    receipts.forEach(r => {
      const c = r.category || 'Other';
      cats[c] = (cats[c] || 0) + (Number(r.amount) || 0);
    });

    let summary = `RECEIPT REPORT: ${job.name}\n`;
    summary += `Client: ${job.client || 'N/A'}\n`;
    if (job.address) summary += `Address: ${job.address}\n`;
    summary += `Date Range: ${dateRange}\n`;
    summary += `\nTOTAL: ${formatMoney(totalSpend)} (${receipts.length} receipts, ${pending} pending)\n`;
    summary += `\nBREAKDOWN:\n`;
    Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
      summary += `  ${cat}: ${formatMoney(amt)}\n`;
    });
    summary += `\nDETAIL:\n`;
    receipts.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(r => {
      summary += `  ${r.date || 'N/A'}  ${r.store}  ${formatMoney(r.amount)}  ${r.category || ''}`;
      if (r.notes) summary += `  (${r.notes})`;
      summary += `  [${r.submitted ? 'Submitted' : 'Pending'}]\n`;
    });
    summary += `\nGenerated by ReceiptLog — ${new Date().toLocaleString()}`;
    return summary;
  }

  function csvEscape(str) {
    if (!str) return '';
    // If it contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function init() {
    document.getElementById('btn-export').addEventListener('click', toCSV);
  }

  return { init, jobToCSV, shareReport };
})();


// ─── Data Manager Module ───────────────────────────────────────────────────
const DataManager = (() => {
  async function exportBackup() {
    const [jobs, receipts] = await Promise.all([
      DB.getAll('jobs'),
      DB.getAll('receipts'),
    ]);
    const backup = {
      version: 1,
      app: 'ReceiptLog',
      exportedAt: new Date().toISOString(),
      jobs,
      receipts,
    };
    return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  }

  async function shareBackup() {
    const blob = await exportBackup();
    const today = new Date().toISOString().split('T')[0];
    const file = new File([blob], `receiptlog-backup-${today}.json`, { type: 'application/json' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: 'ReceiptLog Backup', text: 'ReceiptLog data backup', files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    // Fallback: download
    downloadBackup();
  }

  async function downloadBackup() {
    const blob = await exportBackup();
    const today = new Date().toISOString().split('T')[0];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receiptlog-backup-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function importBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const backup = JSON.parse(e.target.result);
          if (backup.app !== 'ReceiptLog' || !backup.jobs || !backup.receipts) {
            alert('Invalid backup file.');
            reject(new Error('Invalid backup'));
            return;
          }
          let jobCount = 0, receiptCount = 0;
          for (const job of backup.jobs) {
            await DB.put('jobs', job);
            jobCount++;
          }
          for (const receipt of backup.receipts) {
            await DB.put('receipts', receipt);
            receiptCount++;
          }
          alert(`Imported ${jobCount} jobs and ${receiptCount} receipts.`);
          Dashboard.render();
          resolve();
        } catch (err) {
          alert('Could not read backup file.');
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  }

  async function clearAll() {
    if (!confirm('Delete ALL jobs and receipts? This cannot be undone.')) return;
    if (!confirm('Are you sure? Everything will be permanently erased.')) return;
    const [jobs, receipts] = await Promise.all([
      DB.getAll('jobs'),
      DB.getAll('receipts'),
    ]);
    for (const r of receipts) await DB.remove('receipts', r.id);
    for (const j of jobs) await DB.remove('jobs', j.id);
    alert('All data cleared.');
    Dashboard.render();
  }

  function init() {
    const modalOverlay = document.getElementById('data-modal-overlay');
    document.getElementById('btn-data').addEventListener('click', () => {
      modalOverlay.style.display = '';
    });
    document.getElementById('data-modal-close').addEventListener('click', () => {
      modalOverlay.style.display = 'none';
    });
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.style.display = 'none';
    });
    document.getElementById('btn-backup-share').addEventListener('click', shareBackup);
    document.getElementById('btn-backup-download').addEventListener('click', downloadBackup);
    document.getElementById('btn-restore').addEventListener('click', () => {
      document.getElementById('restore-file-input').click();
    });
    document.getElementById('restore-file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await importBackup(file);
        modalOverlay.style.display = 'none';
      }
      e.target.value = '';
    });
    document.getElementById('btn-clear-data').addEventListener('click', async () => {
      await clearAll();
      modalOverlay.style.display = 'none';
    });
  }

  return { init };
})();


// ─── Photo Share Helper ────────────────────────────────────────────────────
async function sharePhoto(receipt) {
  if (!receipt.photo) return;

  // Convert base64 data URL to blob
  const res = await fetch(receipt.photo);
  const blob = await res.blob();
  const ext = blob.type.includes('png') ? 'png' : 'jpg';
  const filename = `receipt-${receipt.store}-${receipt.date}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `Receipt: ${receipt.store}`,
        text: `${receipt.store} — ${formatMoney(receipt.amount)} on ${receipt.date}${receipt.notes ? '\n' + receipt.notes : ''}`,
        files: [file],
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Fallback: open in new tab
        window.open(receipt.photo, '_blank');
      }
    }
  } else {
    // Fallback: open in new tab
    window.open(receipt.photo, '_blank');
  }
}


// ─── Demo Data ─────────────────────────────────────────────────────────────
const DemoData = (() => {
  const DEMO_JOB_ID = 'demo-store-remodel';

  async function seed() {
    const existing = await DB.get('jobs', DEMO_JOB_ID);
    if (existing) return;

    const today = new Date().toISOString().split('T')[0];
    const d1 = new Date(Date.now() - 345600000).toISOString().split('T')[0];
    const d2 = new Date(Date.now() - 259200000).toISOString().split('T')[0];
    const d3 = new Date(Date.now() - 172800000).toISOString().split('T')[0];
    const d4 = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    await DB.put('jobs', {
      id: DEMO_JOB_ID,
      name: 'Store Remodel - Westfield',
      client: 'Westfield Properties',
      address: '1200 Commerce Blvd, Suite 4',
      status: 'active',
      created: Date.now() - 400000000,
    });

    const receipts = [
      { id: 'demo-r1', jobId: DEMO_JOB_ID, store: 'Home Depot', amount: 872.45, date: d1, category: 'Materials', notes: 'Drywall sheets, joint compound, corner bead, screws', isGas: false, submitted: true, created: Date.now() - 345600000 },
      { id: 'demo-r2', jobId: DEMO_JOB_ID, store: 'Home Depot', amount: 1536.00, date: d2, category: 'Materials', notes: 'LVT flooring (24 boxes), adhesive, transition strips', isGas: false, submitted: true, created: Date.now() - 259200000 },
      { id: 'demo-r3', jobId: DEMO_JOB_ID, store: 'Lowes', amount: 249.99, date: d3, category: 'Tools', notes: 'Oscillating multi-tool, blade set, dust shroud', isGas: false, submitted: false, created: Date.now() - 172800000 },
      { id: 'demo-r4', jobId: DEMO_JOB_ID, store: 'Shell', amount: 68.50, date: d4, category: 'Gas', notes: 'Fill up — supply run to job site', isGas: true, submitted: false, created: Date.now() - 86400000 },
      { id: 'demo-r5', jobId: DEMO_JOB_ID, store: 'Sherwin-Williams', amount: 312.80, date: today, category: 'Materials', notes: 'Interior paint (8 gal), primer, rollers, tape', isGas: false, submitted: false, created: Date.now() },
    ];

    for (const r of receipts) {
      await DB.put('receipts', r);
    }
  }

  async function clear() {
    const receipts = await DB.getAll('receipts', 'jobId', DEMO_JOB_ID);
    for (const r of receipts) {
      await DB.remove('receipts', r.id);
    }
    await DB.remove('jobs', DEMO_JOB_ID);
  }

  return { DEMO_JOB_ID, seed, clear };
})();


// ─── Tutorial Module ────────────────────────────────────────────────────────
const Tutorial = (() => {
  let currentStep = 0;
  const steps = [
    { title: 'Welcome to ReceiptLog', text: 'Track every receipt, organize by job, and share reports with your team. We\'ve loaded a sample project so you can see everything in action.', highlight: null, navigate: 'dashboard' },
    { title: 'Your Dashboard', text: 'At a glance — total spend, active jobs, pending receipts, and gas costs. This is what it looks like with a real project loaded.', highlight: '.stats-grid', navigate: 'dashboard' },
    { title: 'Pending Filter', text: 'Toggle between Pending and All. Pending shows receipts you haven\'t submitted yet — so nothing falls through the cracks.', highlight: '#dashboard-filter', navigate: null },
    { title: 'Recent Receipts', text: 'Your latest receipts with store, amount, category, and details. Orange dot = still pending. These are from the sample Store Remodel project.', highlight: '.receipt-list', navigate: null },
    { title: 'Jobs', text: 'Tap Jobs to see your projects. Each job tracks its own receipts organized by store.', highlight: '#nav-jobs', navigate: 'jobs' },
    { title: 'Job Cards', text: 'Each card shows total spend and receipt count. Tap a card to drill into the details. Tap + New Job anytime to add more.', highlight: '.job-card', navigate: null },
    { title: 'Inside a Job', text: 'Receipts grouped by store with subtotals. Tap a store header to collapse or expand it. This is the Store Remodel breakdown.', highlight: '.receipt-groups', navigate: 'job-detail', navigateData: 'demo-store-remodel' },
    { title: 'Status Tracking', text: 'Orange dot = pending, green = submitted. Tap any dot to toggle. Hit Mark All Submitted when you\'ve turned in the batch.', highlight: '.receipt-card', navigate: null },
    { title: 'Share Report', text: 'Generates a professional report with summary, receipt table, and photos — all in one file. Share via email, text, or any app on your phone.', highlight: '.btn-share-report', navigate: null },
    { title: 'Add a Receipt', text: 'Select the job, enter the store and amount, pick a category, and list what you bought in the Details field.', highlight: '#nav-add', navigate: 'add' },
    { title: 'The Form', text: 'Store names auto-suggest from your history. Use Details to itemize — "2x4 lumber, deck screws, joist hangers." Snap a photo for proof.', highlight: '#receipt-form', navigate: null },
    { title: 'Gas & Photos', text: 'Flip the Gas toggle for fuel purchases — they show up in your Gas Log. Capture a photo of the physical receipt below.', highlight: '.toggle-label', navigate: null },
    { title: 'Gas Log', text: 'All fuel purchases across every job in one place, grouped by week or month.', highlight: '#nav-gas', navigate: 'gas' },
    { title: 'Gas Tracking', text: 'Total gas spend, pending count, and reimbursed count at a glance. Tap + Add Gas for a quick fill-up entry.', highlight: '#btn-add-gas', navigate: null },
    { title: 'CSV Export', text: 'Each job has a CSV button for spreadsheets. The download icon in the header exports everything across all jobs.', highlight: '#btn-export', navigate: 'dashboard' },
    { title: 'Works Offline', text: 'ReceiptLog works without internet. Add it to your home screen for the full app experience — fast, private, always available.', highlight: null, navigate: null },
    { title: 'You\'re All Set!', text: 'Create a job and add your first receipt to get started. Tap ? anytime to replay this guide. Happy tracking!', highlight: null, navigate: null, isFinal: true },
  ];

  const overlay = () => document.getElementById('tutorial-overlay');
  const spotlight = () => document.getElementById('tutorial-spotlight');
  const titleEl = () => document.getElementById('tutorial-title');
  const textEl = () => document.getElementById('tutorial-text');
  const counterEl = () => document.getElementById('tutorial-step-counter');
  const backBtn = () => document.getElementById('tutorial-back');
  const nextBtn = () => document.getElementById('tutorial-next');

  async function start() {
    currentStep = 0;
    await DemoData.seed();
    await Dashboard.render();
    await new Promise(r => setTimeout(r, 100));
    overlay().style.display = '';
    renderStep();
  }

  async function close() {
    overlay().style.display = 'none';
    clearSpotlight();
    await DemoData.clear();
    Router.navigate('dashboard');
    Dashboard.render();
  }

  function next() {
    if (currentStep < steps.length - 1) {
      currentStep++;
      renderStep();
    } else {
      close();
    }
  }

  function back() {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  }

  function renderStep() {
    const step = steps[currentStep];

    counterEl().textContent = `STEP ${currentStep + 1} OF ${steps.length}`;
    titleEl().textContent = step.title;
    textEl().textContent = step.text;

    // Back button visibility
    backBtn().style.display = currentStep === 0 ? 'none' : '';

    // Next button text
    nextBtn().textContent = currentStep === steps.length - 1 ? 'Get Started' : 'Next \u2192';

    backBtn().textContent = '\u2190 Back';

    // Final step gets "Get Started" button
    if (step.isFinal) {
      nextBtn().textContent = 'Get Started';
    }

    // Navigate to view if specified
    if (step.navigate) {
      if (step.navigate === 'job-detail' && step.navigateData) {
        Router.navigate('job-detail', step.navigateData);
      } else {
        Router.navigate(step.navigate);
      }
    }

    // Highlight element
    clearSpotlight();
    if (step.highlight) {
      overlay().classList.remove('no-spotlight');
      requestAnimationFrame(() => setTimeout(() => highlightElement(step.highlight), 100));
    } else {
      overlay().classList.add('no-spotlight');
    }
  }

  function highlightElement(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      overlay().classList.add('no-spotlight');
      return;
    }

    const rect = el.getBoundingClientRect();
    const pad = 8;
    const sl = spotlight();
    sl.style.display = 'block';
    sl.style.top = (rect.top - pad + window.scrollY) + 'px';
    sl.style.left = (rect.left - pad) + 'px';
    sl.style.width = (rect.width + pad * 2) + 'px';
    sl.style.height = (rect.height + pad * 2) + 'px';

    // Scroll the highlighted element into view if needed
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearSpotlight() {
    spotlight().style.display = 'none';
  }

  function init() {
    document.getElementById('btn-tutorial').addEventListener('click', start);
    document.getElementById('tutorial-close').addEventListener('click', close);
    document.getElementById('tutorial-next').addEventListener('click', next);
    document.getElementById('tutorial-back').addEventListener('click', back);

    // Close on overlay click (outside modal)
    overlay().addEventListener('click', (e) => {
      if (e.target === overlay()) close();
    });
  }

  return { init, start };
})();


// ─── App Init ───────────────────────────────────────────────────────────────
(async () => {
  await DB.open();
  Router.init();
  AddReceipt.init();
  Export.init();
  DataManager.init();
  Tutorial.init();

  // Wire up "Add Gas" button in Gas Log view
  document.getElementById('btn-add-gas').addEventListener('click', () => {
    Router.navigate('add');
    setTimeout(() => {
      document.getElementById('field-category').value = 'Gas';
      document.getElementById('field-gas').checked = true;
    }, 50);
  });

  // Clean up any leftover demo data from a previous tutorial
  await DemoData.clear();

  Dashboard.render();
})();

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
  async function render() {
    const [jobs, receipts] = await Promise.all([
      DB.getAll('jobs'),
      DB.getAll('receipts'),
    ]);

    const totalSpend = receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const activeJobs = jobs.filter((j) => j.status === 'active').length;
    const receiptCount = receipts.length;
    const gasTotal = receipts
      .filter((r) => r.isGas)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    document.getElementById('dashboard-total').textContent = formatMoney(totalSpend);
    document.getElementById('dashboard-job-count').textContent = activeJobs;
    document.getElementById('dashboard-receipt-count').textContent = receiptCount;
    document.getElementById('dashboard-gas-total').textContent = formatMoney(gasTotal);

    const recentEl = document.getElementById('dashboard-recent');
    const emptyEl = document.getElementById('dashboard-empty');

    if (receipts.length === 0) {
      recentEl.style.display = 'none';
      emptyEl.style.display = '';
      return;
    }

    recentEl.style.display = '';
    emptyEl.style.display = 'none';

    // Sort by date descending, then by created descending
    const sorted = receipts
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
        return `
        <div class="receipt-card" data-id="${r.id}">
          <div class="receipt-meta">${formatDate(r.date)} &middot; ${jobName}</div>
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
        <span class="job-detail-count">${allReceipts.length} receipt${allReceipts.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="job-detail-actions">
        <button class="btn-secondary btn-sm btn-edit-detail-job" data-id="${job.id}">Edit Job</button>
        <button class="btn-danger btn-sm btn-delete-detail-job" data-id="${job.id}">Delete Job</button>
      </div>`;

    // Edit button in detail header
    headerEl.querySelector('.btn-edit-detail-job').addEventListener('click', async () => {
      await openJobModal(job.id);
    });

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
                (r) => `
              <div class="receipt-card" data-id="${r.id}">
                <div class="receipt-meta">${formatDate(r.date)}</div>
                <div class="receipt-card-row">
                  <span class="amount">${formatMoney(r.amount)}</span>
                  <span class="category-tag cat-${(r.category || 'Other').toLowerCase()}">${escapeHTML(r.category || 'Other')}</span>
                </div>
                ${r.notes ? `<div class="receipt-notes">${escapeHTML(r.notes)}</div>` : ''}
                ${r.photo ? `<img class="photo-thumb" src="${r.photo}" alt="Receipt photo">` : ''}
                <div class="receipt-card-actions">
                  <button class="btn-icon btn-edit-receipt" data-id="${r.id}" title="Edit Receipt">&#9998;</button>
                  <button class="btn-icon btn-delete-receipt" data-id="${r.id}" title="Delete Receipt">&#128465;</button>
                </div>
              </div>`
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

    // Edit receipt — populate form and navigate to add view
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
  async function render() {
    const gasReceipts = await DB.getAll('receipts', 'isGas', 1);
    // Also catch boolean true values
    const allReceipts = await DB.getAll('receipts');
    const filtered = allReceipts.filter((r) => r.isGas === true || r.isGas === 1);

    const sorted = filtered
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const total = sorted.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    document.getElementById('gas-total').textContent = formatMoney(total);

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

    listEl.innerHTML = sorted
      .map((r) => {
        const job = jobMap[r.jobId];
        const jobName = job ? escapeHTML(job.name) : 'Unknown Job';
        return `
        <div class="receipt-card" data-id="${r.id}">
          <div class="receipt-meta">${formatDate(r.date)} &middot; ${jobName}</div>
          <div class="receipt-card-row">
            <span class="receipt-store">${escapeHTML(r.store)}</span>
            <span class="amount">${formatMoney(r.amount)}</span>
          </div>
          ${r.notes ? `<div class="receipt-notes">${escapeHTML(r.notes)}</div>` : ''}
        </div>`;
      })
      .join('');
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

    const header = 'Date,Job,Store,Category,Amount,Gas,Notes';
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
          csvEscape(r.notes || ''),
        ].join(',');
      });

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const today = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `receiptlog-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  return { init };
})();


// ─── App Init ───────────────────────────────────────────────────────────────
(async () => {
  await DB.open();
  Router.init();
  AddReceipt.init();
  Export.init();
  Dashboard.render();
})();

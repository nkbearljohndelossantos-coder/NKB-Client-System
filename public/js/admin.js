/**
 * NKB Manufacturing & Trading - Admin & Operations Script
 */

let yieldChart = null;
let monthlySalesChart = null;
let cachedClients = [];
let cachedProducts = [];
let cachedPayments = [];
let cachedEmployees = [];
let cachedCategories = [];

async function ensureCategoriesLoaded() {
    if (!cachedCategories || cachedCategories.length === 0) {
        const res = await NKB.api('/api/products/categories');
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
            cachedCategories = res.data;
        } else {
            cachedCategories = [
                { name: 'Body Care' },
                { name: 'Face Care' },
                { name: 'Sun Care' },
                { name: 'Bath & Body' },
                { name: 'Hair Care' },
                { name: 'Cosmetics' },
                { name: 'Skincare Treatment' },
                { name: 'Cosmetics & Skincare' },
                { name: 'Fragrance & Perfume' },
                { name: 'Personal Care' }
            ];
        }
    }
    return cachedCategories;
}

function showAddCategoryInline(targetSelectId) {
    const box = document.getElementById(`add-category-box-${targetSelectId}`);
    if (box) {
        box.classList.remove('hidden');
        const input = document.getElementById(`new-category-input-${targetSelectId}`);
        if (input) {
            input.focus();
        }
    }
}

function hideAddCategoryInline(targetSelectId) {
    const box = document.getElementById(`add-category-box-${targetSelectId}`);
    if (box) {
        box.classList.add('hidden');
        const input = document.getElementById(`new-category-input-${targetSelectId}`);
        if (input) input.value = '';
    }
}

async function saveNewCategory(targetSelectId) {
    const input = document.getElementById(`new-category-input-${targetSelectId}`);
    if (!input || !input.value.trim()) {
        NKB.showToast('Please enter a category name.', 'warning');
        return;
    }
    const catName = input.value.trim();

    try {
        const res = await NKB.api('/api/products/categories', {
            method: 'POST',
            body: { name: catName }
        });

        if (res && res.success && res.data) {
            const addedCat = res.data;
            if (!cachedCategories.some(c => c.name.toLowerCase() === addedCat.name.toLowerCase())) {
                cachedCategories.push(addedCat);
                cachedCategories.sort((a, b) => a.name.localeCompare(b.name));
            }

            if (targetSelectId) {
                const select = document.getElementById(targetSelectId);
                if (select) {
                    let exists = false;
                    for (let opt of select.options) {
                        if (opt.value.toLowerCase() === addedCat.name.toLowerCase()) {
                            opt.selected = true;
                            exists = true;
                            break;
                        }
                    }
                    if (!exists) {
                        const newOpt = new Option(addedCat.name, addedCat.name, true, true);
                        select.add(newOpt);
                    }
                }
                hideAddCategoryInline(targetSelectId);
            }

            NKB.showToast(`Category "${addedCat.name}" added successfully!`, 'success');
        } else {
            NKB.showToast(res ? (res.error || res.message || 'Failed to add category.') : 'Failed to add category.', 'error');
        }
    } catch (err) {
        NKB.showToast('Failed to add category.', 'error');
    }
}

async function promptAddNewCategory(targetSelectId = null) {
    if (targetSelectId && document.getElementById(`add-category-box-${targetSelectId}`)) {
        showAddCategoryInline(targetSelectId);
        return;
    }

    const catName = prompt('Enter new Product Category name (e.g. Perfume & Fragrance):');
    if (!catName || !catName.trim()) return;

    try {
        const res = await NKB.api('/api/products/categories', {
            method: 'POST',
            body: { name: catName.trim() }
        });

        if (res && res.success && res.data) {
            const addedCat = res.data;
            if (!cachedCategories.some(c => c.name.toLowerCase() === addedCat.name.toLowerCase())) {
                cachedCategories.push(addedCat);
                cachedCategories.sort((a, b) => a.name.localeCompare(b.name));
            }
            if (targetSelectId) {
                const select = document.getElementById(targetSelectId);
                if (select) {
                    let exists = false;
                    for (let opt of select.options) {
                        if (opt.value.toLowerCase() === addedCat.name.toLowerCase()) {
                            opt.selected = true;
                            exists = true;
                            break;
                        }
                    }
                    if (!exists) {
                        select.add(new Option(addedCat.name, addedCat.name, true, true));
                    }
                }
            }
            NKB.showToast(`Category "${addedCat.name}" added successfully!`, 'success');
        } else {
            NKB.showToast(res ? (res.error || res.message || 'Failed to add category.') : 'Failed to add category.', 'error');
        }
    } catch (err) {
        NKB.showToast('Failed to save category.', 'error');
    }
}

async function ensureEmployeesLoaded() {
    if (!cachedEmployees || cachedEmployees.length === 0) {
        const res = await NKB.api('/api/employees');
        if (res.success && Array.isArray(res.data)) {
            cachedEmployees = res.data;
        }
    }
    return cachedEmployees;
}

document.addEventListener('DOMContentLoaded', async () => {
    await NKB.init();
    if (!NKB.user || NKB.user.role === 'CLIENT') {
        window.location.href = '/index.html';
        return;
    }
    
    // Apply Role-Based Navigation & Access Restrictions
    applyRoleBasedUI();

    // Initial Load
    await loadInitialData();
    loadDashboard();
});

function applyRoleBasedUI() {
    const role = NKB.user.role;
    const roleMap = {
        'SUPER_ADMIN': { title: 'Executive Admin', badge: 'bg-red-900/80 text-red-300 border-red-700/50' },
        'ADMIN': { title: 'Operations Manager', badge: 'bg-indigo-900/80 text-indigo-300 border-indigo-700/50' },
        'PRODUCTION': { title: 'Production Supervisor', badge: 'bg-amber-900/80 text-amber-300 border-amber-700/50' },
        'WAREHOUSE': { title: 'Logistics & Warehouse', badge: 'bg-purple-900/80 text-purple-300 border-purple-700/50' },
        'ACCOUNTING': { title: 'Senior Accountant', badge: 'bg-emerald-900/80 text-emerald-300 border-emerald-700/50' }
    };

    const config = roleMap[role] || { title: role };
    const roleBadgeEl = document.getElementById('nav-user-role');
    if (roleBadgeEl) {
        roleBadgeEl.textContent = config.title;
    }
    const nameEl = document.getElementById('nav-user-name');
    if (nameEl && NKB.user.name) {
        nameEl.textContent = NKB.user.name;
    }

    // Role-specific sidebar tab visibility
    const hideTab = (id) => {
        const btn = document.getElementById(`tab-btn-${id}`);
        if (btn) btn.style.display = 'none';
    };

    if (role === 'PRODUCTION') {
        hideTab('deliveries');
        hideTab('invoices');
        hideTab('payments');
        hideTab('buffer');
        hideTab('clients');
        hideTab('users');
        hideTab('audit');
    } else if (role === 'WAREHOUSE') {
        hideTab('orders');
        hideTab('job-orders');
        hideTab('production');
        hideTab('invoices');
        hideTab('payments');
        hideTab('clients');
        hideTab('users');
        hideTab('audit');
    } else if (role === 'ACCOUNTING') {
        hideTab('job-orders');
        hideTab('production');
        hideTab('deliveries');
        hideTab('clients');
        hideTab('users');
        hideTab('audit');
    } else if (role === 'ADMIN') {
        // Admin sees everything except super-admin exclusive config
    }
}

async function loadInitialData() {
    const [clientsRes, productsRes, categoriesRes] = await Promise.all([
        NKB.api('/api/clients'),
        NKB.api('/api/products'),
        NKB.api('/api/products/categories')
    ]);
    if (clientsRes.success) cachedClients = clientsRes.data;
    if (productsRes.success) cachedProducts = productsRes.data;
    if (categoriesRes && categoriesRes.success) cachedCategories = categoriesRes.data;
}

// Tab Switching
function switchTab(tabId) {
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.querySelectorAll('.sidebar-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'font-bold', 'shadow-md', 'shadow-indigo-600/30', 'bg-slate-800');
        btn.classList.add('text-slate-400');
    });

    const targetSec = document.getElementById(`view-${tabId}`);
    const targetBtn = document.getElementById(`tab-btn-${tabId}`);

    if (targetSec) targetSec.classList.remove('hidden');
    if (targetBtn) {
        targetBtn.classList.add('bg-indigo-600', 'text-white', 'font-bold', 'shadow-md', 'shadow-indigo-600/30');
        targetBtn.classList.remove('text-slate-400');
    }

    // Call tab-specific loader
    if (tabId === 'dashboard') loadDashboard();
    else if (tabId === 'orders') loadOrders();
    else if (tabId === 'job-orders') loadJobOrders();
    else if (tabId === 'production') loadBatches();
    else if (tabId === 'deliveries') loadDeliveries();
    else if (tabId === 'invoices') loadInvoices();
    else if (tabId === 'payments') loadPayments();
    else if (tabId === 'buffer') loadBufferStock();
    else if (tabId === 'clients') loadClients();
    else if (tabId === 'products') loadProducts();
    else if (tabId === 'users') loadUsers();
    else if (tabId === 'reports') loadReports();
    else if (tabId === 'audit') loadAuditLogs();
}

// -------------------------------------------------------------
// 1. DASHBOARD LOADER
// -------------------------------------------------------------
async function loadDashboard() {
    const [kpiRes, unbilledRes, arRes, yieldRes] = await Promise.all([
        NKB.api('/api/reports/overview'),
        NKB.api('/api/reports/unbilled-drs'),
        NKB.api('/api/reports/ar'),
        NKB.api('/api/reports/yield')
    ]);

    const setElText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    if (kpiRes.success && kpiRes.data) {
        const d = kpiRes.data;
        setElText('kpi-open-pos', NKB.formatNumber(d.openPOs));
        setElText('kpi-active-batches', NKB.formatNumber(d.activeBatches));
        setElText('kpi-pending-approval-batches', `${d.pendingApprovalBatches} over-tolerance requiring approval`);
        setElText('kpi-unbilled-drs', NKB.formatNumber(d.unbilledAcceptedDRs));
        setElText('kpi-ar-total', NKB.formatCurrency(d.arTotal));
        setElText('kpi-overdue-ar', `${NKB.formatCurrency(d.overdueAR)} overdue`);
        setElText('kpi-ar-overdue', `${NKB.formatCurrency(d.overdueAR)} overdue`);
    }

    if (arRes.success && arRes.data && arRes.data.summary) {
        const s = arRes.data.summary;
        setElText('aging-current', NKB.formatCurrency(s.current));
        setElText('aging-1-30', NKB.formatCurrency(s.days1to30));
        setElText('aging-31-60', NKB.formatCurrency(s.days31to60));
        setElText('aging-61-90', NKB.formatCurrency(s.days61to90));
        setElText('aging-90plus', NKB.formatCurrency(s.days90plus));
    }

    // Unbilled DRs Table
    const tbody = document.getElementById('table-unbilled-drs-body');
    if (unbilledRes.success && unbilledRes.data && unbilledRes.data.length > 0) {
        tbody.innerHTML = unbilledRes.data.map(dr => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">${dr.dr_number}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${dr.company_name}</td>
                <td class="py-3 px-4">
                    <button onclick="openViewPOModal('${dr.po_id}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline" title="View Purchase Order Details">
                        ${dr.po_number}
                    </button>
                </td>
                <td class="py-3 px-4 font-extrabold text-emerald-700">${NKB.formatNumber(dr.total_accepted)} pcs</td>
                <td class="py-3 px-4 text-slate-500">${dr.signer_name || 'Authorized'}</td>
                <td class="py-3 px-4"><span class="badge ${dr.billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}">${dr.billing_policy}</span></td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openViewPOModal('${dr.po_id}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs transition" title="View Purchase Order">
                        👁️ View PO
                    </button>
                    <button onclick="openGenerateInvoiceModal('${dr.id}', '${dr.dr_number}', '${dr.company_name}', ${dr.total_accepted})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-sm transition">
                        ⚡ Generate Invoice
                    </button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400 font-medium">No pending unbilled deliveries found. All accepted DRs have been invoiced!</td></tr>`;
    }

    // Yield Chart
    if (yieldRes.success && yieldRes.data && yieldRes.data.batches) {
        renderYieldChart(yieldRes.data.batches.slice(0, 8).reverse());
    }
}

function renderYieldChart(batches) {
    const ctx = document.getElementById('chart-yield-variance');
    if (!ctx) return;

    const labels = batches.map(b => `${b.batch_number} (${b.sku})`);
    const targetData = batches.map(b => b.target_quantity);
    const actualData = batches.map(b => b.actual_yield);

    if (yieldChart) yieldChart.destroy();

    yieldChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Target Output', data: targetData, backgroundColor: '#94a3b8', borderRadius: 6 },
                { label: 'Actual Yield', data: actualData, backgroundColor: '#4f46e5', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// -------------------------------------------------------------
// 2. PURCHASE ORDERS (PO)
// -------------------------------------------------------------
async function loadOrders() {
    const search = document.getElementById('filter-po-search')?.value || '';
    const status = document.getElementById('filter-po-status')?.value || '';

    const res = await NKB.api(`/api/orders?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
    const tbody = document.getElementById('table-orders-body');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(po => {
            const canStartJO = (po.status === 'APPROVED' || po.status === 'IN_PRODUCTION');
            const itemsList = (po.items && po.items.length > 0)
                ? po.items.map(it => {
                    const prodId = it.product_id || it.id;
                    const prodQty = it.target_quantity || 1000;
                    return `
                    <div class="flex flex-col gap-1 text-[11px] bg-slate-50 hover:bg-indigo-50/50 p-2 rounded-xl border border-slate-200 transition mb-1 last:mb-0">
                        <div class="flex items-center justify-between gap-2">
                            <div class="truncate max-w-[140px]">
                                <span class="font-bold text-slate-900 block truncate" title="${it.product_name}">${it.product_name}</span>
                                <span class="text-[10px] text-slate-400 font-mono">${it.sku}</span>
                            </div>
                            <div class="text-right font-mono flex-shrink-0">
                                <span class="font-bold text-slate-800 block">${NKB.formatNumber(it.target_quantity)} ${it.unit || 'pcs'}</span>
                                <span class="text-[10px] text-indigo-700 font-semibold">@ ₱${Number(it.unit_price).toFixed(2)}</span>
                            </div>
                        </div>
                        ${canStartJO ? `
                            <div class="pt-1.5 border-t border-slate-200/70 flex justify-end">
                                <button type="button" onclick="event.stopPropagation(); openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name.replace(/'/g, "\\'")}', '${prodId}', ${prodQty})" class="w-full py-1 px-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-[10.5px] font-bold transition flex items-center justify-center gap-1 shadow-sm" title="Start Job Order for ${it.product_name}">
                                    <span>🏭 Start Job Order</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `}).join('')
                : '<span class="text-slate-400 italic text-[11px]">No items recorded</span>';

            return `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600 cursor-pointer hover:underline whitespace-nowrap" onclick="openViewPOModal('${po.id}')" title="Click to view full PO details">
                    ${po.po_number}
                </td>
                <td class="py-3 px-4 text-slate-600 whitespace-nowrap">
                    <div class="font-medium text-slate-800">${NKB.formatDate(po.po_date)}</div>
                </td>
                <td class="py-3 px-4 font-bold text-slate-800">${po.company_name}</td>
                <td class="py-3 px-4">
                    <div class="space-y-1 w-64">
                        ${itemsList}
                    </div>
                </td>
                <td class="py-3 px-4 whitespace-nowrap"><span class="badge bg-slate-100 text-slate-700">±${po.tolerance_percent}%</span></td>
                <td class="py-3 px-4 whitespace-nowrap"><span class="badge ${po.billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}">${po.billing_policy}</span></td>
                <td class="py-3 px-4 font-bold text-slate-700 whitespace-nowrap font-mono">${NKB.formatNumber(po.total_target_quantity)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-slate-900 whitespace-nowrap font-mono">${NKB.formatCurrency(po.grand_total)}</td>
                <td class="py-3 px-4 whitespace-nowrap">${NKB.renderStatusBadge(po.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openViewPOModal('${po.id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="View Full Order Info">
                        <span>👁️ View</span>
                    </button>
                    <a href="/print-po.html?id=${po.id}" target="_blank" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Print Purchase Order">
                        <span>🖨️ Print</span>
                    </a>
                    ${po.jo_count === 0 && po.status !== 'CANCELLED' ? `
                        <button onclick="openEditPOModal('${po.id}')" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Edit Purchase Order (before entering JO)">
                            <span>✏️ Edit</span>
                        </button>
                    ` : ''}
                    ${po.status === 'PENDING_APPROVAL' ? `
                        <button onclick="approvePO('${po.id}', '${po.po_number}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">
                            Approve
                        </button>
                    ` : ''}
                    ${po.status === 'APPROVED' || po.status === 'IN_PRODUCTION' ? `
                        <button onclick="openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name.replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition">
                            + Job Order
                        </button>
                    ` : ''}
                </td>
            </tr>
            `;
        }).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="10" class="py-6 text-center text-slate-400">No purchase orders found.</td></tr>`;
    }
}

async function approvePO(id, poNumber) {
    if (!confirm(`Approve Purchase Order ${poNumber}?`)) return;
    const res = await NKB.api(`/api/orders/${id}/approve`, { method: 'POST' });
    if (res.success) {
        NKB.showToast(`Purchase Order ${poNumber} approved!`, 'success');
        loadOrders();
    } else {
        NKB.showToast(res.error || 'Failed to approve PO.', 'error');
    }
}

// -------------------------------------------------------------
// 3. JOB ORDERS (JO)
// -------------------------------------------------------------
let cachedJobOrders = [];

async function loadJobOrders() {
    const res = await NKB.api('/api/job-orders');
    const tbody = document.getElementById('table-jos-body');
    const clientFilter = document.getElementById('filter-jo-client');

    if (res.success && res.data && res.data.length > 0) {
        cachedJobOrders = res.data;

        // Populate client filter dropdown
        if (clientFilter) {
            const clientsMap = new Map();
            res.data.forEach(jo => {
                if (jo.client_id && jo.company_name) {
                    clientsMap.set(jo.client_id, jo.company_name);
                }
            });
            const currentVal = clientFilter.value;
            clientFilter.innerHTML = `<option value="">All Clients (${clientsMap.size})</option>` + 
                Array.from(clientsMap.entries()).map(([cid, name]) => 
                    `<option value="${cid}" ${cid === currentVal ? 'selected' : ''}>${name}</option>`
                ).join('');
        }

        renderJobOrdersTable(res.data);
    } else {
        cachedJobOrders = [];
        tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-slate-400">No job orders found.</td></tr>`;
    }
}

function renderJobOrdersTable(jobOrders) {
    const tbody = document.getElementById('table-jos-body');
    if (!tbody) return;

    if (!jobOrders || jobOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-slate-400">No job orders found matching filter.</td></tr>`;
        return;
    }

    // Group job orders by Client
    const grouped = new Map();
    jobOrders.forEach(jo => {
        const ckey = jo.client_id || jo.company_name || 'other';
        if (!grouped.has(ckey)) {
            grouped.set(ckey, {
                clientId: jo.client_id,
                companyName: jo.company_name,
                items: []
            });
        }
        grouped.get(ckey).items.push(jo);
    });

    let html = '';
    grouped.forEach(group => {
        const totalQty = group.items.reduce((sum, j) => sum + (j.target_quantity || 0), 0);
        html += `
            <!-- Client Group Banner Row -->
            <tr class="bg-indigo-50/80 border-t-2 border-indigo-200">
                <td colspan="8" class="py-2.5 px-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-2.5">
                            <span class="text-base">🏢</span>
                            <div>
                                <span class="font-extrabold text-sm text-slate-900">${group.companyName}</span>
                                <span class="text-[11px] text-indigo-700 font-semibold ml-2">(${group.items.length} Product${group.items.length > 1 ? 's' : ''} in Production • Total: ${NKB.formatNumber(totalQty)} pcs)</span>
                            </div>
                        </div>
                        <a href="/print-jo.html?client_id=${group.clientId}" target="_blank" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm" title="Print Consolidated Job Order for ${group.companyName} (All Products)">
                            <span>🖨️ Print Client JO (${group.items.length} Products)</span>
                        </a>
                    </div>
                </td>
            </tr>
        `;

        // Product Job Order rows under this client
        group.items.forEach(jo => {
            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-b-2">
                <td class="py-3 px-4 font-bold text-indigo-600 font-mono">${jo.jo_number}</td>
                <td class="py-3 px-4">
                    <button onclick="openViewPOModal('${jo.po_id}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline" title="View Purchase Order Details">
                        ${jo.po_number}
                    </button>
                </td>
                <td class="py-3 px-4 font-bold text-slate-800">${jo.company_name}</td>
                <td class="py-3 px-4 font-semibold text-slate-800">${jo.product_name} <span class="text-xs text-slate-400 font-mono">(${jo.sku})</span></td>
                <td class="py-3 px-4 font-bold text-slate-700 font-mono">${NKB.formatNumber(jo.target_quantity)} pcs</td>
                <td class="py-3 px-4 text-slate-600 font-medium">${jo.assigned_team}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(jo.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openViewPOModal('${jo.po_id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition" title="View Purchase Order Details">
                        👁️ View PO
                    </button>
                    <a href="/print-jo.html?client_id=${jo.client_id}&id=${jo.id}" target="_blank" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Print Job Order for ${jo.company_name} (All Products)">
                        🖨️ Print
                    </a>
                    <button onclick="openCreateBatchModal('${jo.id}', '${jo.jo_number}', ${jo.target_quantity}, '${jo.product_name}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition">
                        + Start Batch
                    </button>
                </td>
            </tr>
            `;
        });
    });

    tbody.innerHTML = html;
}

function filterJobOrdersByClient() {
    const sel = document.getElementById('filter-jo-client');
    if (!sel) return;
    const cid = sel.value;
    if (!cid) {
        renderJobOrdersTable(cachedJobOrders);
    } else {
        const filtered = cachedJobOrders.filter(j => j.client_id === cid);
        renderJobOrdersTable(filtered);
    }
}

function printJobOrdersForSelectedClient() {
    const sel = document.getElementById('filter-jo-client');
    const cid = sel ? sel.value : '';
    if (cid) {
        window.open(`/print-jo.html?client_id=${cid}`, '_blank');
    } else {
        window.open('/print-jo.html?all=1', '_blank');
    }
}

window.loadJobOrders = loadJobOrders;
window.renderJobOrdersTable = renderJobOrdersTable;
window.filterJobOrdersByClient = filterJobOrdersByClient;
window.printJobOrdersForSelectedClient = printJobOrdersForSelectedClient;

// -------------------------------------------------------------
// 4. PRODUCTION BATCHES & YIELD LOGGER
// -------------------------------------------------------------
async function loadBatches() {
    const res = await NKB.api('/api/production/batches');
    const tbody = document.getElementById('table-batches-body');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(b => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">${b.batch_number}</td>
                <td class="py-3 px-4">
                    <button onclick="openViewPOModal('${b.po_id}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline" title="View Purchase Order Details">
                        ${b.po_number}
                    </button>
                    <div class="text-[11px] text-slate-400 font-medium">JO: ${b.jo_number}</div>
                </td>
                <td class="py-3 px-4">
                    <div class="font-semibold text-slate-800">${b.product_name}</div>
                    ${b.compounding_operator || b.bottling_lead || b.qc_inspector ? `
                        <div class="text-[10px] text-slate-400 flex flex-wrap gap-1 mt-0.5">
                            ${b.compounding_operator ? `<span class="bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded" title="Compounding Operator">🥣 ${b.compounding_operator}</span>` : ''}
                            ${b.bottling_lead ? `<span class="bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded" title="Bottling Line Lead">🧴 ${b.bottling_lead}</span>` : ''}
                            ${b.qc_inspector ? `<span class="bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded" title="QC Inspector">🔬 ${b.qc_inspector}</span>` : ''}
                        </div>
                    ` : ''}
                </td>
                <td class="py-3 px-4 font-bold text-slate-700">${NKB.formatNumber(b.target_quantity)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-indigo-700">${b.actual_yield > 0 ? NKB.formatNumber(b.actual_yield) + ' pcs' : '<span class="text-slate-400 italic">In progress</span>'}</td>
                <td class="py-3 px-4">${b.actual_yield > 0 ? NKB.renderVarianceBadge(b.variance_quantity, b.variance_percent) : '-'}</td>
                <td class="py-3 px-4 text-slate-500">${NKB.formatDate(b.expiry_date)}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(b.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openViewPOModal('${b.po_id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block" title="View Purchase Order Details">
                        👁️ View PO
                    </button>
                    ${b.status === 'MIXING' || b.status === 'BOTTLING' || b.status === 'PLANNED' ? `
                        <button onclick="openLogYieldModal('${b.id}', '${b.batch_number}', ${b.target_quantity}, ${b.tolerance_percent})" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition">
                            📝 Log Yield
                        </button>
                    ` : ''}
                    ${b.status === 'EXCEPTION_REQUIRES_APPROVAL' ? `
                        <button onclick="openApproveOverrunModal('${b.id}', '${b.batch_number}', ${b.target_quantity}, ${b.actual_yield}, ${b.tolerance_percent})" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition animate-bounce">
                            ⚠️ Approve Overrun
                        </button>
                    ` : ''}
                    ${b.status === 'APPROVED_FOR_DISPATCH' || b.status === 'QC_PASSED' ? `
                        <button onclick="openCreateDRModal('${b.po_number}', '${b.jo_number}', '${b.id}', '${b.batch_number}', ${b.actual_yield}, '${b.product_name}', '${b.client_id}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">
                            🚚 Dispatch / DR
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-400">No production batches found.</td></tr>`;
    }
}

// -------------------------------------------------------------
// 5. DELIVERIES / DR
// -------------------------------------------------------------
async function loadDeliveries() {
    const res = await NKB.api('/api/deliveries');
    const tbody = document.getElementById('table-deliveries-body');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(dr => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">${dr.dr_number}</td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(dr.delivery_date)}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${dr.company_name}</td>
                <td class="py-3 px-4">
                    <button onclick="openViewPOModal('${dr.po_id}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline" title="View Purchase Order Details">
                        ${dr.po_number}
                    </button>
                </td>
                <td class="py-3 px-4 font-bold text-slate-700">${NKB.formatNumber(dr.total_delivered)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-emerald-700">${dr.total_accepted > 0 ? NKB.formatNumber(dr.total_accepted) + ' pcs' : '-'}</td>
                <td class="py-3 px-4 font-bold text-rose-600">${dr.total_rejected > 0 ? NKB.formatNumber(dr.total_rejected) + ' pcs' : '0'}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(dr.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openViewPOModal('${dr.po_id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block" title="View Purchase Order Details">
                        👁️ View PO
                    </button>
                    <a href="/print-dr.html?id=${dr.id}" target="_blank" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block">
                        🖨️ Print DR
                    </a>
                    ${dr.status === 'ACCEPTED' ? `
                        <button onclick="openGenerateInvoiceModal('${dr.id}', '${dr.dr_number}', '${dr.company_name}', ${dr.total_accepted})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">
                            ⚡ Invoice
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-400">No deliveries found.</td></tr>`;
    }
}

// -------------------------------------------------------------
// 6. SALES INVOICES
// -------------------------------------------------------------
async function loadInvoices() {
    const res = await NKB.api('/api/invoices');
    const tbody = document.getElementById('table-invoices-body');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(si => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">${si.invoice_number}</td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(si.invoice_date)} <br><span class="text-[10px] text-slate-400">Due: ${NKB.formatDate(si.due_date)}</span></td>
                <td class="py-3 px-4 font-bold text-slate-800">${si.company_name}</td>
                <td class="py-3 px-4">
                    <div class="text-slate-700 font-medium">${si.dr_number}</div>
                    ${si.po_id ? `
                        <button onclick="openViewPOModal('${si.po_id}')" class="text-[11px] font-bold text-indigo-600 hover:underline block mt-0.5" title="View Purchase Order Details">
                            PO: ${si.po_number}
                        </button>
                    ` : ''}
                </td>
                <td class="py-3 px-4 font-extrabold text-slate-900">${NKB.formatCurrency(si.total_amount)}</td>
                <td class="py-3 px-4 font-bold text-emerald-700">${NKB.formatCurrency(si.paid_amount)}</td>
                <td class="py-3 px-4 font-extrabold text-rose-700">${NKB.formatCurrency(si.balance_due)}</td>
                <td class="py-3 px-4"><span class="badge ${si.agingCategory === 'Current' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-800 font-bold'}">${si.agingCategory}</span></td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(si.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    ${si.po_id ? `
                        <button onclick="openViewPOModal('${si.po_id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block" title="View Purchase Order Details">
                            👁️ View PO
                        </button>
                    ` : ''}
                    <a href="/print-invoice.html?id=${si.id}" target="_blank" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block">
                        🖨️ Print SI
                    </a>
                    ${si.balance_due > 0 ? `
                        <button onclick="openRecordPaymentModal('${si.id}', '${si.invoice_number}', ${si.balance_due}, '${si.company_name}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">
                            💵 Pay
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="10" class="py-6 text-center text-slate-400">No invoices generated yet.</td></tr>`;
    }
}

// -------------------------------------------------------------
// 7. PAYMENTS & AR
// -------------------------------------------------------------
async function loadPayments() {
    const res = await NKB.api('/api/payments');
    cachedPayments = (res.success && Array.isArray(res.data)) ? res.data : [];

    // Calculate totals
    const totalPaid = cachedPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalCount = cachedPayments.length;
    const summary = res.summary || {};
    const totalAR = parseFloat(summary.totalAR != null ? summary.totalAR : 0);
    const totalInvoiced = parseFloat(summary.totalInvoiced != null ? summary.totalInvoiced : 0);
    const avgAmount = totalCount > 0 ? (totalPaid / totalCount) : 0;
    const collectionRate = totalInvoiced > 0 ? ((totalPaid / totalInvoiced) * 100).toFixed(1) : (totalPaid > 0 ? '100' : '0');

    // Update KPI cards in view-payments
    const setEl = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setEl('payments-kpi-total-paid', NKB.formatCurrency(totalPaid));
    setEl('payments-kpi-count', `${totalCount} verified collection${totalCount === 1 ? '' : 's'}`);
    setEl('payments-kpi-total-ar', NKB.formatCurrency(totalAR));
    setEl('payments-kpi-total-invoiced', NKB.formatCurrency(totalInvoiced));
    setEl('payments-kpi-collection-rate', `${collectionRate}% Collection Rate`);
    setEl('payments-kpi-avg-amount', NKB.formatCurrency(avgAmount));
    setEl('table-footer-total-paid', NKB.formatCurrency(totalPaid));
    setEl('payments-visible-count', `Showing all (${totalCount})`);

    // Reset filters
    const searchInput = document.getElementById('payments-search-input');
    if (searchInput) searchInput.value = '';
    const methodFilter = document.getElementById('payments-method-filter');
    if (methodFilter) methodFilter.value = '';

    renderPaymentsRows(cachedPayments, totalPaid);
}

function renderPaymentsRows(paymentsList, currentTotal) {
    const tbody = document.getElementById('table-payments-body');
    if (!tbody) return;

    if (!paymentsList || paymentsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400 font-medium">No payment records found.</td></tr>`;
        const footerTotal = document.getElementById('table-footer-total-paid');
        if (footerTotal) footerTotal.textContent = NKB.formatCurrency(0);
        return;
    }

    const calcTotal = currentTotal != null ? currentTotal : paymentsList.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const footerTotal = document.getElementById('table-footer-total-paid');
    if (footerTotal) footerTotal.textContent = NKB.formatCurrency(calcTotal);

    tbody.innerHTML = paymentsList.map(p => `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="py-3 px-4 font-bold text-indigo-600">${p.payment_number}</td>
            <td class="py-3 px-4 text-slate-600 whitespace-nowrap">${NKB.formatDate(p.payment_date)}</td>
            <td class="py-3 px-4">
                <div class="font-semibold text-slate-800">${p.invoice_number}</div>
                ${p.po_number ? `<div class="text-[10px] text-slate-400">PO: ${p.po_number}</div>` : ''}
            </td>
            <td class="py-3 px-4">
                <div class="font-bold text-slate-800">${p.company_name}</div>
                ${p.contact_person ? `<div class="text-[10px] text-slate-400">${p.contact_person}</div>` : ''}
            </td>
            <td class="py-3 px-4">
                <span class="badge bg-slate-100 text-slate-700 font-bold">${(p.payment_method || '').replace(/_/g, ' ')}</span>
            </td>
            <td class="py-3 px-4 font-mono text-slate-600">${p.reference_number || '—'}</td>
            <td class="py-3 px-4 text-right font-extrabold text-emerald-700 text-sm whitespace-nowrap">${NKB.formatCurrency(p.amount)}</td>
            <td class="py-3 px-4">${NKB.renderStatusBadge(p.invoice_status || 'PAID')}</td>
            <td class="py-3 px-4 text-slate-500 whitespace-nowrap">${p.recorded_by_name || 'Accounting Staff'}</td>
        </tr>
    `).join('');
}

function filterPaymentsTable() {
    if (!cachedPayments) return;
    const query = (document.getElementById('payments-search-input')?.value || '').trim().toLowerCase();
    const method = (document.getElementById('payments-method-filter')?.value || '').trim();

    const filtered = cachedPayments.filter(p => {
        const matchesQuery = !query || 
            (p.payment_number && p.payment_number.toLowerCase().includes(query)) ||
            (p.invoice_number && p.invoice_number.toLowerCase().includes(query)) ||
            (p.company_name && p.company_name.toLowerCase().includes(query)) ||
            (p.reference_number && p.reference_number.toLowerCase().includes(query)) ||
            (p.po_number && p.po_number.toLowerCase().includes(query)) ||
            (p.contact_person && p.contact_person.toLowerCase().includes(query));

        const matchesMethod = !method || p.payment_method === method;
        return matchesQuery && matchesMethod;
    });

    const filteredTotal = filtered.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const countEl = document.getElementById('payments-visible-count');
    if (countEl) {
        countEl.textContent = `Showing ${filtered.length} of ${cachedPayments.length}`;
    }

    renderPaymentsRows(filtered, filteredTotal);
}

function exportPaymentsToExcel() {
    if (!cachedPayments || cachedPayments.length === 0) {
        NKB.showToast('No payment records available to export.', 'warning');
        return;
    }

    const totalPaid = cachedPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const currentDate = new Date().toISOString().split('T')[0];

    // Verify SheetJS is available
    if (typeof XLSX !== 'undefined') {
        const rows = [
            ['NKB MANUFACTURING & TRADING'],
            ['B2B PAYMENTS & ACCOUNTS RECEIVABLE (AR) COLLECTION REPORT'],
            [`Export Date: ${new Date().toLocaleString()}`, '', `Total Records: ${cachedPayments.length}`, '', `Total Amount Paid: PHP ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
            [], // spacer row
            [
                '#',
                'Payment No.',
                'Payment Date',
                'Invoice No.',
                'PO No.',
                'DR No.',
                'Client Company',
                'Contact Person',
                'Payment Method',
                'Reference / Check No.',
                'Amount Paid (PHP)',
                'Invoice Total (PHP)',
                'Invoice Balance Due (PHP)',
                'Invoice Status',
                'Recorded By',
                'Notes',
                'Recorded Timestamp'
            ]
        ];

        cachedPayments.forEach((p, idx) => {
            rows.push([
                idx + 1,
                p.payment_number || '',
                p.payment_date || '',
                p.invoice_number || '',
                p.po_number || '',
                p.dr_number || '',
                p.company_name || '',
                p.contact_person || '',
                (p.payment_method || '').replace(/_/g, ' '),
                p.reference_number || '',
                parseFloat(p.amount) || 0,
                parseFloat(p.invoice_total_amount || p.total_amount) || 0,
                parseFloat(p.invoice_balance_due != null ? p.invoice_balance_due : 0),
                (p.invoice_status || 'PAID').replace(/_/g, ' '),
                p.recorded_by_name || 'Staff',
                p.notes || '',
                p.created_at || ''
            ]);
        });

        // Summary Total Row
        rows.push([]);
        rows.push([
            'TOTAL',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            'TOTAL PAID:',
            totalPaid,
            '',
            '',
            '',
            '',
            '',
            ''
        ]);

        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Styling: Column auto-widths
        ws['!cols'] = [
            { wch: 6 },  // #
            { wch: 18 }, // Payment No.
            { wch: 14 }, // Payment Date
            { wch: 16 }, // Invoice No.
            { wch: 16 }, // PO No.
            { wch: 16 }, // DR No.
            { wch: 30 }, // Client Company
            { wch: 22 }, // Contact Person
            { wch: 18 }, // Method
            { wch: 22 }, // Reference No.
            { wch: 20 }, // Amount Paid
            { wch: 20 }, // Invoice Total
            { wch: 24 }, // Invoice Balance Due
            { wch: 16 }, // Invoice Status
            { wch: 20 }, // Recorded By
            { wch: 28 }, // Notes
            { wch: 22 }  // Timestamp
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Payments & AR');
        XLSX.writeFile(wb, `NKB_Payments_AR_Report_${currentDate}.xlsx`);
        NKB.showToast(`Exported ${cachedPayments.length} payment records to Excel successfully!`, 'success');
    } else {
        exportPaymentsToCSV();
    }
}

function exportPaymentsToCSV() {
    if (!cachedPayments || cachedPayments.length === 0) {
        NKB.showToast('No payment records available to export.', 'warning');
        return;
    }

    const totalPaid = cachedPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const currentDate = new Date().toISOString().split('T')[0];

    const headers = [
        '#', 'Payment Number', 'Payment Date', 'Invoice Number', 'PO Number', 'DR Number',
        'Client Company', 'Contact Person', 'Payment Method', 'Reference Number',
        'Amount Paid (PHP)', 'Invoice Total (PHP)', 'Invoice Balance Due (PHP)',
        'Invoice Status', 'Recorded By', 'Notes', 'Recorded Timestamp'
    ];

    const escapeCsv = (val) => {
        if (val == null) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
    };

    const csvRows = [];
    csvRows.push(['NKB MANUFACTURING & TRADING - PAYMENTS & AR REPORT']);
    csvRows.push([`Export Date: ${new Date().toLocaleString()}`, `Total Records: ${cachedPayments.length}`, `Total Paid: PHP ${totalPaid.toFixed(2)}`]);
    csvRows.push([]);
    csvRows.push(headers.map(escapeCsv).join(','));

    cachedPayments.forEach((p, idx) => {
        csvRows.push([
            idx + 1,
            escapeCsv(p.payment_number),
            escapeCsv(p.payment_date),
            escapeCsv(p.invoice_number),
            escapeCsv(p.po_number || ''),
            escapeCsv(p.dr_number || ''),
            escapeCsv(p.company_name),
            escapeCsv(p.contact_person || ''),
            escapeCsv((p.payment_method || '').replace(/_/g, ' ')),
            escapeCsv(p.reference_number),
            (parseFloat(p.amount) || 0).toFixed(2),
            (parseFloat(p.invoice_total_amount || p.total_amount) || 0).toFixed(2),
            (parseFloat(p.invoice_balance_due != null ? p.invoice_balance_due : 0)).toFixed(2),
            escapeCsv((p.invoice_status || 'PAID').replace(/_/g, ' ')),
            escapeCsv(p.recorded_by_name || 'Staff'),
            escapeCsv(p.notes || ''),
            escapeCsv(p.created_at || '')
        ].join(','));
    });

    csvRows.push([]);
    csvRows.push([
        '"TOTAL"', '""', '""', '""', '""', '""', '""', '""', '""', '"TOTAL PAID:"',
        totalPaid.toFixed(2), '""', '""', '""', '""', '""', '""'
    ].join(','));

    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NKB_Payments_AR_Report_${currentDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    NKB.showToast(`Exported ${cachedPayments.length} payment records to CSV successfully!`, 'success');
}

function printPaymentsReport() {
    if (!cachedPayments || cachedPayments.length === 0) {
        NKB.showToast('No payment records to print.', 'warning');
        return;
    }

    const totalPaid = cachedPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>NKB Payments & Collections Report</title>
            <style>
                @page { size: landscape; margin: 12mm; }
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 20px; color: #0f172a; font-size: 11px; }
                .header-container { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
                h1 { font-size: 18px; font-weight: 900; margin: 0 0 4px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
                .subtitle { font-size: 11px; color: #64748b; margin: 0; }
                .kpi-cards { display: flex; gap: 16px; margin-bottom: 16px; }
                .kpi-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; flex: 1; background: #f8fafc; }
                .kpi-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; }
                .kpi-value { font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 2px; }
                .text-emerald { color: #047857; }
                table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                th { background: #f1f5f9; text-align: left; padding: 7px 9px; border: 1px solid #cbd5e1; font-weight: 700; font-size: 10px; text-transform: uppercase; }
                td { padding: 7px 9px; border: 1px solid #e2e8f0; font-size: 10px; }
                tr:nth-child(even) { background: #f8fafc; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .font-mono { font-family: monospace; }
                .total-row { background: #e2e8f0 !important; font-weight: 900; }
                .report-footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
                @media print {
                    body { margin: 0; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="header-container">
                <div>
                    <h1>NKB Manufacturing & Trading</h1>
                    <p class="subtitle">Official B2B Payments & Accounts Receivable (AR) Collection Ledger</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 11px; color: #64748b;">Generated: ${new Date().toLocaleString()}</div>
                    <button class="no-print" onclick="window.print()" style="margin-top: 6px; padding: 6px 14px; background: #0f172a; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">🖨️ Print / Save as PDF</button>
                </div>
            </div>

            <div class="kpi-cards">
                <div class="kpi-card">
                    <div class="kpi-label">Total Amount Paid</div>
                    <div class="kpi-value text-emerald">${NKB.formatCurrency(totalPaid)}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Total Verified Transactions</div>
                    <div class="kpi-value">${cachedPayments.length}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 30px;">#</th>
                        <th>Payment No.</th>
                        <th>Date</th>
                        <th>Invoice</th>
                        <th>Client Company</th>
                        <th>Method</th>
                        <th>Reference / Check No.</th>
                        <th class="text-right">Amount Paid</th>
                        <th>Status</th>
                        <th>Recorded By</th>
                    </tr>
                </thead>
                <tbody>
                    ${cachedPayments.map((p, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td class="font-bold">${p.payment_number}</td>
                            <td>${NKB.formatDate(p.payment_date)}</td>
                            <td>${p.invoice_number}</td>
                            <td class="font-bold">${p.company_name}</td>
                            <td>${(p.payment_method || '').replace(/_/g, ' ')}</td>
                            <td class="font-mono">${p.reference_number || '—'}</td>
                            <td class="text-right font-bold text-emerald" style="font-size: 11px;">${NKB.formatCurrency(p.amount)}</td>
                            <td>${p.invoice_status || 'PAID'}</td>
                            <td>${p.recorded_by_name || 'Staff'}</td>
                        </tr>
                    `).join('')}
                    <tr class="total-row">
                        <td colspan="7" class="text-right font-bold">TOTAL AMOUNT OF PAID:</td>
                        <td class="text-right font-bold text-emerald" style="font-size: 12px;">${NKB.formatCurrency(totalPaid)}</td>
                        <td colspan="2"></td>
                    </tr>
                </tbody>
            </table>

            <div class="report-footer">
                <div>Report automatically compiled by NKB ERP System.</div>
                <div>Confidential - Internal Accounting & Audit Document</div>
            </div>
            <script>
                window.onload = function() { window.print(); };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// -------------------------------------------------------------
// 8. BUFFER STOCK
// -------------------------------------------------------------
async function loadBufferStock() {
    const res = await NKB.api('/api/buffer-stock');
    const tbody = document.getElementById('table-buffer-body');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(bs => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-slate-800">${bs.company_name}</td>
                <td class="py-3 px-4 font-semibold text-slate-800">${bs.product_name} <span class="text-xs text-slate-400">(${bs.sku})</span></td>
                <td class="py-3 px-4">
                    <button onclick="openViewPOModal('${bs.source_po_id}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline" title="View Purchase Order Details">
                        ${bs.po_number}
                    </button>
                    <div class="text-[11px] text-slate-400 font-medium">Batch: ${bs.batch_number}</div>
                </td>
                <td class="py-3 px-4 font-bold text-slate-700">${NKB.formatNumber(bs.initial_quantity)} pcs</td>
                <td class="py-3 px-4 font-semibold text-purple-700">${NKB.formatNumber(bs.quantity_released)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-emerald-700">${NKB.formatNumber(bs.quantity_remaining)} pcs</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(bs.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openViewPOModal('${bs.source_po_id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block" title="View Purchase Order Details">
                        👁️ View PO
                    </button>
                    ${bs.quantity_remaining > 0 ? `
                        <button onclick="openReleaseBufferModal('${bs.id}', ${bs.quantity_remaining}, '${bs.company_name}', '${bs.product_name}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition">
                            Release Stock
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-slate-400">No buffer inventory stored.</td></tr>`;
    }
}

// -------------------------------------------------------------
// 9. CLIENTS & PRODUCTS
// -------------------------------------------------------------
async function loadClients() {
    const res = await NKB.api('/api/clients');
    const tbody = document.getElementById('table-clients-body');

    if (res.success && res.data && res.data.length > 0) {
        cachedClients = res.data;
        tbody.innerHTML = res.data.map(c => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-slate-900">${c.company_name}</td>
                <td class="py-3 px-4 font-semibold text-slate-800">${c.contact_person}</td>
                <td class="py-3 px-4 text-slate-600">${c.email} <br><span class="text-xs text-slate-400">${c.phone}</span></td>
                <td class="py-3 px-4"><span class="badge ${c.default_billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}">${c.default_billing_policy}</span></td>
                <td class="py-3 px-4 font-bold text-slate-700">±${c.default_tolerance_percent}%</td>
                <td class="py-3 px-4 font-bold text-emerald-700">${NKB.formatCurrency(c.credit_limit)}</td>
                <td class="py-3 px-4">
                    ${c.user_id ? `
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Login: ${c.user_email}">
                            <span>●</span><span>Login Active</span>
                        </span>
                    ` : `
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                            <span>○</span><span>No Login</span>
                        </span>
                    `}
                </td>
                <td class="py-3 px-4 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end gap-1.5">
                        <button onclick="openResetClientCredentialsModal('${c.id}', '${c.company_name.replace(/'/g, "\\'")}', '${c.email}')" class="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Manage Client Login & Reset Password">
                            <span>🔑</span><span>${c.user_id ? 'Reset Password' : 'Create Login'}</span>
                        </button>
                        <button onclick="openClientPricingModal('${c.id}', '${c.company_name.replace(/'/g, "\\'")}')" class="px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="View & Edit Client Pricing Catalog">
                            <span>📦</span><span>Catalog</span>
                        </button>
                        <button onclick="openCreateProductModal('${c.id}')" class="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Add Cosmetic Product for ${c.company_name.replace(/'/g, "\\'")}">
                            <span>➕</span><span>Add Product</span>
                        </button>
                        <button onclick="openEditClientModal('${c.id}')" class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition" title="Edit Client">
                            <span>✏️</span>
                        </button>
                        <button onclick="deleteClient('${c.id}', '${c.company_name.replace(/'/g, "\\'")}')" class="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold transition" title="Delete Client">
                            <span>🗑️</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-slate-400">No clients registered.</td></tr>`;
    }
}

async function loadProducts() {
    const res = await NKB.api('/api/products');
    const tbody = document.getElementById('table-products-body');

    if (res.success && res.data && res.data.length > 0) {
        cachedProducts = res.data;
        tbody.innerHTML = res.data.map(p => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-mono font-bold text-indigo-600">${p.sku}</td>
                <td class="py-3 px-4 font-bold text-slate-900">${p.name}</td>
                <td class="py-3 px-4"><span class="badge bg-slate-100 text-slate-700">${p.category}</span></td>
                <td class="py-3 px-4">
                    ${p.client_name 
                        ? `<button onclick="switchTab('clients')" class="badge bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 transition" title="View in B2B Clients Directory">🏢 ${p.client_name}</button>` 
                        : `<span class="badge bg-slate-100 text-slate-500">Master / All Clients</span>`}
                </td>
                <td class="py-3 px-4 font-extrabold text-slate-900">${NKB.formatCurrency(p.default_price)}</td>
                <td class="py-3 px-4"><span class="badge ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">${p.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                <td class="py-3 px-4 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end gap-1.5">
                        <button onclick="openEditProductModal('${p.id}')" class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition" title="Edit Product">
                            <span>✏️</span>
                        </button>
                        <button onclick="deleteProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')" class="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold transition" title="Delete Product">
                            <span>🗑️</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">No products found.</td></tr>`;
    }
}

// -------------------------------------------------------------
// 10. REPORTS & AUDIT
// -------------------------------------------------------------
async function loadReports() {
    const [yieldRes, salesRes] = await Promise.all([
        NKB.api('/api/reports/yield'),
        NKB.api('/api/reports/monthly-sales')
    ]);

    if (yieldRes.success && yieldRes.data && yieldRes.data.summary) {
        const s = yieldRes.data.summary;
        document.getElementById('yield-summary-content').innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div class="text-slate-400 font-bold">Total Batches Produced</div>
                    <div class="text-xl font-black text-slate-900">${NKB.formatNumber(s.totalBatches)}</div>
                </div>
                <div class="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <div class="text-indigo-600 font-bold">Net Yield Output</div>
                    <div class="text-xl font-black text-indigo-900">${NKB.formatNumber(s.totalActual)} pcs</div>
                </div>
                <div class="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div class="text-amber-700 font-bold">Over-run Batches</div>
                    <div class="text-xl font-black text-amber-900">${s.overrunCount} batches</div>
                </div>
                <div class="p-3 rounded-xl bg-purple-50 border border-purple-200">
                    <div class="text-purple-700 font-bold">Average Variance %</div>
                    <div class="text-xl font-black text-purple-900">${s.avgVariancePercent > 0 ? '+' : ''}${s.avgVariancePercent}%</div>
                </div>
            </div>
        `;
    }

    if (salesRes.success && salesRes.data) {
        const ctx = document.getElementById('chart-monthly-sales');
        if (ctx) {
            if (monthlySalesChart) monthlySalesChart.destroy();
            monthlySalesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: salesRes.data.map(d => d.month),
                    datasets: [
                        { label: 'Invoiced Sales (₱)', data: salesRes.data.map(d => d.total_invoiced), borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.1)', fill: true, tension: 0.3 },
                        { label: 'Collections (₱)', data: salesRes.data.map(d => d.total_collected), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.3 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }
    }
}

async function loadAuditLogs() {
    const res = await NKB.api('/api/audit-logs?limit=50');
    const tbody = document.getElementById('table-audit-body');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(log => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-2.5 px-4 text-slate-500">${NKB.formatDateTime(log.timestamp)}</td>
                <td class="py-2.5 px-4 font-bold text-slate-900">${log.user_name}</td>
                <td class="py-2.5 px-4 text-indigo-600">${log.user_role}</td>
                <td class="py-2.5 px-4 font-bold text-slate-800">${log.action}</td>
                <td class="py-2.5 px-4 text-emerald-700">${log.entity_id}</td>
                <td class="py-2.5 px-4 text-slate-600 truncate max-w-xs">${log.details || '-'}</td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">No audit logs found.</td></tr>`;
    }
}

// -------------------------------------------------------------
// MODALS CONTROLLER & POPUPS
// -------------------------------------------------------------

function closeModal() {
    const root = document.getElementById('modals-root');
    if (root) root.innerHTML = '';
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// CLIENT PRODUCTS & CUSTOM PRICING MODAL
// -------------------------------------------------------------
let currentClientMasterProducts = [];

async function openClientPricingModal(clientId, companyName) {
    await ensureCategoriesLoaded();
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3 flex-shrink-0">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Custom Catalog & Contract Pricing</h3>
                        <p class="text-xs text-slate-500">Client: <strong class="text-indigo-600">${companyName}</strong></p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
                </div>

                <!-- Action Bar -->
                <div class="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 flex-shrink-0">
                    <div class="text-xs text-slate-600">
                        Manage exclusive product prices and SKU mappings for <strong>${companyName}</strong>.
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="toggleAddClientProductForm()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-sm transition flex items-center gap-1">
                            <span>✨ Create New Product for this Client</span>
                        </button>
                    </div>
                </div>

                <!-- 1. Form to Assign Master Product to Client with Custom Price -->
                <div class="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3 flex-shrink-0">
                    <h4 class="font-bold text-slate-800 text-xs">Assign Product from Master Catalog to this Client</h4>
                    <form onsubmit="submitAssignClientProduct(event, '${clientId}', '${companyName.replace(/'/g, "\\'")}')" class="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-semibold">
                        <div class="sm:col-span-2">
                            <label class="block text-slate-600 mb-1">Select Master Product *</label>
                            <select id="assign-product-id" onchange="onAssignProductSelected()" required class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-bold text-slate-800">
                                <option value="">-- Choose a Product --</option>
                            </select>
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-slate-600 mb-1">Client Custom Product Name (Optional)</label>
                            <input type="text" id="assign-custom-name" placeholder="e.g. ABC Whitening Lotion 250ml" class="w-full px-2.5 py-1.5 border rounded-lg bg-white">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Client SKU / Code</label>
                            <input type="text" id="assign-custom-sku" placeholder="e.g. ABC-KL250" class="w-full px-2.5 py-1.5 border rounded-lg bg-white font-mono uppercase">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Formula Code</label>
                            <input type="text" id="assign-custom-formula" placeholder="e.g. FORM-KL-V2" class="w-full px-2.5 py-1.5 border rounded-lg bg-white font-mono">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Contract Price (₱) *</label>
                            <input type="number" step="0.01" min="0" inputmode="decimal" id="assign-custom-price" required placeholder="120.00" onblur="if(this.value && !isNaN(this.value)) this.value = parseFloat(this.value).toFixed(2)" class="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg bg-white font-bold text-indigo-900">
                        </div>
                        <div class="sm:col-span-2 flex items-end justify-end">
                            <button type="submit" class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-sm">
                                ➕ Add to Client Catalog
                            </button>
                        </div>
                    </form>
                </div>

                <!-- 2. Inline Form to Create Brand New Product Directly for Client -->
                <div id="box-create-client-product" class="hidden p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 flex-shrink-0">
                    <div class="flex justify-between items-center border-b border-slate-200 pb-2">
                        <h4 class="font-bold text-slate-900 text-xs">Create New Exclusive Cosmetic Product for ${companyName}</h4>
                        <button type="button" onclick="toggleAddClientProductForm()" class="text-slate-400 hover:text-slate-600 text-xs">✕ Close</button>
                    </div>
                    <form onsubmit="submitCreateClientProduct(event, '${clientId}', '${companyName.replace(/'/g, "\\'")}')" class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-semibold">
                        <div>
                            <label class="block text-slate-600 mb-1">Product Name *</label>
                            <input type="text" id="new-client-prod-name" required placeholder="e.g. Glutathione Facial Wash 100ml" class="w-full px-2.5 py-1.5 border rounded-lg bg-white">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">SKU / Code *</label>
                            <input type="text" id="new-client-prod-sku" required placeholder="e.g. GFW-100" class="w-full px-2.5 py-1.5 border rounded-lg bg-white font-mono uppercase">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Category</label>
                            <div class="flex gap-1">
                                <select id="new-client-prod-category" class="w-full px-2.5 py-1.5 border rounded-lg bg-white font-bold text-slate-800">
                                    ${(cachedCategories || []).map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                                </select>
                                <button type="button" onclick="showAddCategoryInline('new-client-prod-category')" title="Add New Category" class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold text-xs transition flex items-center gap-0.5 flex-shrink-0">
                                    <span>➕ Add</span>
                                </button>
                            </div>
                            <div id="add-category-box-new-client-prod-category" class="hidden mt-1.5 p-2 bg-slate-100 border border-indigo-200 rounded-lg space-y-1.5">
                                <div class="flex items-center justify-between text-[10px] font-bold text-indigo-900">
                                    <span>🏷️ Add New Category</span>
                                    <button type="button" onclick="hideAddCategoryInline('new-client-prod-category')" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                                </div>
                                <div class="flex gap-1">
                                    <input type="text" id="new-category-input-new-client-prod-category" onkeydown="if(event.key==='Enter'){event.preventDefault();saveNewCategory('new-client-prod-category');}" placeholder="e.g. Perfume & Fragrance" class="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800">
                                    <button type="button" onclick="saveNewCategory('new-client-prod-category')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition flex-shrink-0 shadow-sm">
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Formula Code</label>
                            <input type="text" id="new-client-prod-formula" placeholder="e.g. FORM-GFW-V1" class="w-full px-2.5 py-1.5 border rounded-lg bg-white font-mono">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Contract Price (₱) *</label>
                            <input type="number" step="0.01" min="0" inputmode="decimal" id="new-client-prod-price" required placeholder="150.00" onblur="if(this.value && !isNaN(this.value)) this.value = parseFloat(this.value).toFixed(2)" class="w-full px-2.5 py-1.5 border rounded-lg bg-white font-bold text-indigo-900">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Unit</label>
                            <input type="text" id="new-client-prod-unit" value="pcs" class="w-full px-2.5 py-1.5 border rounded-lg bg-white">
                        </div>
                        <div class="sm:col-span-3 flex justify-end">
                            <button type="submit" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-sm shadow-emerald-600/30">
                                🚀 Create & Link to Client
                            </button>
                        </div>
                    </form>
                </div>

                <div class="flex items-center justify-between gap-3 flex-shrink-0">
                    <input type="text" id="filter-client-products-search" oninput="filterClientPricingRows()" placeholder="Search client products..." class="px-3 py-1.5 border border-slate-300 rounded-xl text-xs w-64">
                    <span class="text-xs text-slate-500 font-medium"><strong id="client-assigned-count" class="text-indigo-600 font-bold">0</strong> products in client catalog</span>
                </div>

                <form onsubmit="submitSaveClientPricing(event, '${clientId}')" class="space-y-4 text-xs font-semibold flex-1 overflow-y-auto pr-1">
                    <div class="overflow-x-auto border border-slate-200 rounded-xl">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase sticky top-0 z-10">
                                <tr>
                                    <th class="py-2.5 px-3">Master Product</th>
                                    <th class="py-2.5 px-3">Client Custom Name</th>
                                    <th class="py-2.5 px-3">Client SKU</th>
                                    <th class="py-2.5 px-3">Formula Code</th>
                                    <th class="py-2.5 px-3">Contract Rate (₱)</th>
                                    <th class="py-2.5 px-3 text-center w-16">Action</th>
                                </tr>
                            </thead>
                            <tbody id="client-pricing-table-body" class="divide-y divide-slate-100 font-medium">
                                <tr><td colspan="6" class="py-8 text-center text-slate-400">Loading catalog...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="flex justify-between items-center pt-3 border-t border-slate-100 flex-shrink-0">
                        <span class="text-xs text-slate-400">💡 Only assigned products above will appear in the Client Portal.</span>
                        <div class="flex gap-2">
                            <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
                            <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30">💾 Save Changes</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;

    await loadClientPricingData(clientId);
}

function toggleAssignMasterProductForm() {
    const box = document.getElementById('box-assign-master-product');
    const boxNew = document.getElementById('box-create-client-product');
    if (boxNew) boxNew.classList.add('hidden');
    if (box) box.classList.toggle('hidden');
}

function toggleAddClientProductForm() {
    const box = document.getElementById('box-create-client-product');
    const boxAssign = document.getElementById('box-assign-master-product');
    if (boxAssign) boxAssign.classList.add('hidden');
    if (box) box.classList.toggle('hidden');
}

function onSelectMasterProductToAssign() {
    const select = document.getElementById('assign-master-select');
    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption || !selectedOption.value) return;

    const name = selectedOption.getAttribute('data-name') || '';
    const sku = selectedOption.getAttribute('data-sku') || '';
    const formula = selectedOption.getAttribute('data-formula') || '';
    const price = selectedOption.getAttribute('data-price') || '';

    const nameInput = document.getElementById('assign-custom-name');
    const skuInput = document.getElementById('assign-custom-sku');
    const formulaInput = document.getElementById('assign-custom-formula');
    const priceInput = document.getElementById('assign-custom-price');

    if (nameInput) nameInput.value = name;
    if (skuInput) skuInput.value = sku;
    if (formulaInput) formulaInput.value = formula;
    if (priceInput) priceInput.value = price && !isNaN(price) ? parseFloat(price).toFixed(2) : '';
}

async function submitAssignMasterProduct(e, clientId) {
    e.preventDefault();
    const product_id = document.getElementById('assign-master-select').value;
    const custom_name = document.getElementById('assign-custom-name').value;
    const custom_sku = document.getElementById('assign-custom-sku').value;
    const custom_formula_code = document.getElementById('assign-custom-formula').value;
    const custom_price = parseFloat(document.getElementById('assign-custom-price').value);

    if (!product_id) {
        NKB.showToast('Please select a master product.', 'error');
        return;
    }

    const res = await NKB.api(`/api/clients/${clientId}/pricing`, {
        method: 'POST',
        body: JSON.stringify({
            product_id,
            custom_name,
            custom_sku,
            custom_formula_code,
            custom_price,
            is_assigned: 1
        })
    });

    if (res.success) {
        NKB.showToast('Product successfully assigned to client!', 'success');
        toggleAssignMasterProductForm();
        await loadClientPricingData(clientId);
    } else {
        NKB.showToast(res.error || 'Failed to assign product.', 'error');
    }
}

async function loadClientPricingData(clientId) {
    const res = await NKB.api(`/api/clients/${clientId}/pricing`);
    const tbody = document.getElementById('client-pricing-table-body');
    const countEl = document.getElementById('client-assigned-count');
    const assignSelect = document.getElementById('assign-master-select');
    if (!tbody) return;

    if (res.success && res.data) {
        currentClientMasterProducts = res.data.master_products || [];
        const assigned = res.data.assigned_products || [];
        const assignedIds = new Set(assigned.map(p => p.product_id));

        // Populate Assign Master Select with only unassigned products
        if (assignSelect) {
            const availableMaster = currentClientMasterProducts.filter(p => !assignedIds.has(p.id));
            if (availableMaster.length === 0) {
                assignSelect.innerHTML = '<option value="">-- All master products are already assigned --</option>';
            } else {
                assignSelect.innerHTML = '<option value="">-- Choose a product from catalog --</option>' + 
                    availableMaster.map(p => `<option value="${p.id}" data-sku="${p.sku}" data-name="${p.name}" data-formula="${p.formula_code || ''}" data-price="${Number(p.default_price).toFixed(2)}">${p.name} (${p.sku}) - ₱${Number(p.default_price).toFixed(2)}</option>`).join('');
            }
        }

        if (countEl) countEl.textContent = assigned.length;

        if (assigned.length > 0) {
            tbody.innerHTML = assigned.map(p => `
                <tr class="hover:bg-slate-50 transition" data-product-id="${p.product_id}" data-search="${(p.name + ' ' + p.sku + ' ' + (p.custom_name || '')).toLowerCase()}">
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${p.name}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${p.sku} • Base: ₱${Number(p.default_price).toFixed(2)}</div>
                    </td>
                    <td class="py-2.5 px-3">
                        <input type="text" 
                               name="custom-name-${p.product_id}" 
                               value="${p.custom_name || ''}" 
                               placeholder="${p.name}" 
                               class="w-44 px-2 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="py-2.5 px-3">
                        <input type="text" 
                               name="sku-${p.product_id}" 
                               value="${p.custom_sku || ''}" 
                               placeholder="${p.sku}" 
                               class="w-28 px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="py-2.5 px-3">
                        <input type="text" 
                               name="formula-${p.product_id}" 
                               value="${p.custom_formula_code || ''}" 
                               placeholder="${p.formula_code || '-'}" 
                               class="w-28 px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="py-2.5 px-3">
                        <div class="relative">
                            <span class="absolute left-2.5 top-2 text-slate-400 font-bold">₱</span>
                            <input type="number" step="0.01" min="0" inputmode="decimal"
                                   name="price-${p.product_id}" 
                                   value="${(p.custom_price !== null && p.custom_price !== undefined ? Number(p.custom_price) : Number(p.default_price)).toFixed(2)}" 
                                   placeholder="${Number(p.default_price).toFixed(2)}" 
                                   onblur="if(this.value && !isNaN(this.value)) this.value = parseFloat(this.value).toFixed(2)"
                                   class="w-28 pl-6 pr-2 py-1.5 border ${p.has_custom_price ? 'border-indigo-500 bg-indigo-50/50 font-bold text-indigo-900' : 'border-slate-300 bg-white'} rounded-lg text-xs focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <button type="button" 
                                onclick="removeClientProductRow('${clientId}', '${p.product_id}', '${p.name.replace(/'/g, "\\'")}')" 
                                class="p-1.5 hover:bg-rose-100 text-rose-500 hover:text-rose-700 rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto" 
                                title="Remove from Client">
                            <span>🗑️</span>
                        </button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-12 text-center bg-slate-50/50">
                        <div class="text-4xl mb-2">📦</div>
                        <div class="font-bold text-slate-700 text-sm">No Products Assigned Yet</div>
                        <div class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                            This client currently has 0 products. Click <strong>"➕ Assign from Master Catalog"</strong> or <strong>"✨ New Exclusive Product"</strong> above to add products.
                        </div>
                    </td>
                </tr>
            `;
        }
    }
}

async function removeClientProductRow(clientId, productId, productName) {
    if (!confirm(`Are you sure you want to unassign "${productName}" from this client?`)) return;

    const res = await NKB.api(`/api/clients/${clientId}/pricing/${productId}`, {
        method: 'DELETE'
    });

    if (res.success) {
        NKB.showToast(`Product "${productName}" unassigned from client.`, 'success');
        await loadClientPricingData(clientId);
    } else {
        NKB.showToast(res.error || 'Failed to remove assignment.', 'error');
    }
}

function onClientProductAssignmentToggle(productId, isChecked) {
    const row = document.querySelector(`tr[data-product-id="${productId}"]`);
    if (row) {
        if (isChecked) {
            row.classList.remove('opacity-70');
            row.classList.add('bg-indigo-50/20');
        } else {
            row.classList.add('opacity-70');
            row.classList.remove('bg-indigo-50/20');
        }
    }
    const totalAssigned = document.querySelectorAll('#client-pricing-table-body input[type="checkbox"]:checked').length;
    const countEl = document.getElementById('client-assigned-count');
    if (countEl) countEl.textContent = totalAssigned;
}

function filterClientPricingRows() {
    const q = (document.getElementById('filter-client-products-search')?.value || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#client-pricing-table-body tr[data-product-id]');
    rows.forEach(r => {
        const searchData = r.getAttribute('data-search') || '';
        r.style.display = searchData.includes(q) ? '' : 'none';
    });
}

async function submitCreateClientProduct(e, clientId, companyName) {
    e.preventDefault();
    const name = document.getElementById('new-client-prod-name').value;
    const sku = document.getElementById('new-client-prod-sku').value;
    const category = document.getElementById('new-client-prod-category').value;
    const formula_code = document.getElementById('new-client-prod-formula').value;
    const default_price = parseFloat(document.getElementById('new-client-prod-price').value);
    const unit = document.getElementById('new-client-prod-unit').value || 'pcs';

    const res = await NKB.api(`/api/clients/${clientId}/products`, {
        method: 'POST',
        body: JSON.stringify({ name, sku, category, formula_code, default_price, unit })
    });

    if (res.success) {
        NKB.showToast(`Product "${name}" created and assigned to ${companyName}!`, 'success');
        toggleAddClientProductForm();
        await loadClientPricingData(clientId);
        loadProducts(); // refresh master products
    } else {
        NKB.showToast(res.error || 'Failed to create product.', 'error');
    }
}

async function submitSaveClientPricing(e, clientId) {
    e.preventDefault();
    const rows = document.querySelectorAll('#client-pricing-table-body tr[data-product-id]');
    const items = [];

    rows.forEach(row => {
        const productId = row.getAttribute('data-product-id');
        const customNameInput = row.querySelector(`input[name="custom-name-${productId}"]`);
        const priceInput = row.querySelector(`input[name="price-${productId}"]`);
        const skuInput = row.querySelector(`input[name="sku-${productId}"]`);
        const formulaInput = row.querySelector(`input[name="formula-${productId}"]`);

        items.push({
            product_id: productId,
            is_assigned: 1,
            custom_name: customNameInput && customNameInput.value.trim() !== '' ? customNameInput.value.trim() : null,
            custom_price: priceInput && priceInput.value.trim() !== '' ? parseFloat(priceInput.value) : null,
            custom_sku: skuInput && skuInput.value.trim() !== '' ? skuInput.value.trim() : null,
            custom_formula_code: formulaInput && formulaInput.value.trim() !== '' ? formulaInput.value.trim() : null
        });
    });

    const res = await NKB.api(`/api/clients/${clientId}/pricing/batch`, {
        method: 'POST',
        body: JSON.stringify({ items })
    });

    if (res.success) {
        NKB.showToast('Client products and pricing updated successfully!', 'success');
        closeModal();
    } else {
        NKB.showToast(res.error || 'Failed to update pricing.', 'error');
    }
}

// -------------------------------------------------------------
// CLIENT & PRODUCT EDIT / DELETE ACTIONS
// -------------------------------------------------------------

async function deleteClient(clientId, companyName) {
    if (!confirm(`Are you sure you want to delete client "${companyName}"?\n\nThis will remove their client account, user logins, and custom product catalog.`)) {
        return;
    }

    const res = await NKB.api(`/api/clients/${clientId}`, {
        method: 'DELETE'
    });

    if (res.success) {
        NKB.showToast(res.message || `Client "${companyName}" deleted.`, 'success');
        await loadInitialData();
        loadClients();
    } else {
        NKB.showToast(res.error || 'Failed to delete client.', 'error');
    }
}

async function deleteProduct(productId, productName) {
    if (!confirm(`Are you sure you want to delete product "${productName}" from the master catalog?`)) {
        return;
    }

    const res = await NKB.api(`/api/products/${productId}`, {
        method: 'DELETE'
    });

    if (res.success) {
        NKB.showToast(res.message || `Product "${productName}" deleted.`, 'success');
        await loadInitialData();
        loadProducts();
    } else {
        NKB.showToast(res.error || 'Failed to delete product.', 'error');
    }
}

async function openEditClientModal(clientId) {
    const res = await NKB.api(`/api/clients`);
    if (!res.success || !res.data) return;
    const client = res.data.find(c => c.id === clientId);
    if (!client) return;

    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900">Edit B2B Client Details</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitEditClient(event, '${client.id}')" class="space-y-4 text-xs font-semibold">
                    <div>
                        <label class="block text-slate-600 mb-1">Company / Brand Name</label>
                        <input type="text" id="edit-client-name" required value="${client.company_name}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Contact Person</label>
                            <input type="text" id="edit-client-contact" required value="${client.contact_person}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Email</label>
                            <input type="email" id="edit-client-email" required value="${client.email}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Contact Number (Optional)</label>
                            <input type="text" id="edit-client-phone" value="${client.phone || ''}" placeholder="+63 917 000 0000" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">TIN</label>
                            <input type="text" id="edit-client-tin" value="${client.tin || ''}" placeholder="000-000-000-000" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Business Address (Optional)</label>
                        <input type="text" id="edit-client-address" value="${client.address || ''}" placeholder="Building, Street, City, Metro Manila" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Default Billing Policy</label>
                            <select id="edit-client-policy" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                                <option value="ACTUAL_DELIVERY" ${client.default_billing_policy === 'ACTUAL_DELIVERY' ? 'selected' : ''}>Option A: Bill Actual Delivered</option>
                                <option value="FIXED_PO_BUFFER" ${client.default_billing_policy === 'FIXED_PO_BUFFER' ? 'selected' : ''}>Option B: Fixed PO + Buffer</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Credit Limit (₱)</label>
                            <input type="number" step="1000" id="edit-client-credit" value="${client.credit_limit || 500000}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Update Client</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitEditClient(e, clientId) {
    e.preventDefault();
    const company_name = document.getElementById('edit-client-name').value;
    const contact_person = document.getElementById('edit-client-contact').value;
    const email = document.getElementById('edit-client-email').value;
    const phone = document.getElementById('edit-client-phone').value;
    const tin = document.getElementById('edit-client-tin').value;
    const address = document.getElementById('edit-client-address').value;
    const default_billing_policy = document.getElementById('edit-client-policy').value;
    const toleranceEl = document.getElementById('edit-client-tolerance');
    const default_tolerance_percent = toleranceEl ? parseFloat(toleranceEl.value) : undefined;
    const credit_limit = parseFloat(document.getElementById('edit-client-credit').value);

    const res = await NKB.api(`/api/clients/${clientId}`, {
        method: 'PUT',
        body: JSON.stringify({
            company_name,
            contact_person,
            email,
            phone,
            tin,
            address,
            default_billing_policy,
            default_tolerance_percent,
            credit_limit
        })
    });

    if (res.success) {
        NKB.showToast(`Client "${company_name}" updated!`, 'success');
        closeModal();
        await loadInitialData();
        loadClients();
    } else {
        NKB.showToast(res.error || 'Failed to update client.', 'error');
    }
}

async function openEditProductModal(productId) {
    await Promise.all([ensureClientsLoaded(), ensureCategoriesLoaded()]);
    const res = await NKB.api(`/api/products/${productId}`);
    if (!res.success || !res.data) return;
    const prod = res.data;

    if (prod.category && !cachedCategories.some(c => c.name.toLowerCase() === prod.category.toLowerCase())) {
        cachedCategories.push({ name: prod.category });
        cachedCategories.sort((a, b) => a.name.localeCompare(b.name));
    }

    const editCategoryOptions = (cachedCategories || []).map(cat => {
        return `<option value="${cat.name}" ${prod.category === cat.name ? 'selected' : ''}>${cat.name}</option>`;
    }).join('');

    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900">Edit Cosmetic Product</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitEditProduct(event, '${prod.id}')" class="space-y-4 text-xs font-semibold">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">SKU</label>
                            <input type="text" value="${prod.sku}" readonly class="w-full px-3 py-2 border rounded-xl bg-slate-100 font-mono font-bold text-slate-700">
                        </div>
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="block text-slate-600 font-bold">Category</label>
                            </div>
                            <div class="flex gap-1.5">
                                <select id="edit-prod-category" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold text-slate-900">
                                    ${editCategoryOptions}
                                </select>
                                <button type="button" onclick="showAddCategoryInline('edit-prod-category')" title="Add New Category" class="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition flex items-center gap-1 flex-shrink-0">
                                    <span>➕ Add</span>
                                </button>
                            </div>
                            <div id="add-category-box-edit-prod-category" class="hidden mt-2 p-2.5 bg-slate-50 border border-indigo-200 rounded-xl space-y-2">
                                <div class="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                                    <span>🏷️ Add New Category</span>
                                    <button type="button" onclick="hideAddCategoryInline('edit-prod-category')" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                                </div>
                                <div class="flex gap-1.5">
                                    <input type="text" id="new-category-input-edit-prod-category" onkeydown="if(event.key==='Enter'){event.preventDefault();saveNewCategory('edit-prod-category');}" placeholder="e.g. Perfume & Fragrance" class="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800">
                                    <button type="button" onclick="saveNewCategory('edit-prod-category')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex-shrink-0 shadow-sm">
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Product Name *</label>
                        <input type="text" id="edit-prod-name" required value="${prod.name}" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold">
                    </div>
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <label class="block text-slate-600">Client / Brand (from Clients Directory)</label>
                            <span class="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">🏢 Clients Directory</span>
                        </div>
                        <select id="edit-prod-client-id" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-800">
                            <option value="">-- Master / All Clients --</option>
                            ${(cachedClients || []).map(c => `<option value="${c.id}" ${c.id === prod.client_id ? 'selected' : ''}>${c.company_name || c.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Default Unit Price (₱) *</label>
                            <input type="number" step="0.01" min="0" inputmode="decimal" id="edit-prod-price" required value="${Number(prod.default_price || 0).toFixed(2)}" onblur="if(this.value && !isNaN(this.value)) this.value = parseFloat(this.value).toFixed(2)" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-extrabold text-indigo-900">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Unit of Measure</label>
                            <input type="text" id="edit-prod-unit" value="${prod.unit || 'pcs'}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Update Product</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitEditProduct(e, productId) {
    e.preventDefault();
    const category = document.getElementById('edit-prod-category').value;
    const name = document.getElementById('edit-prod-name').value;
    const client_id = document.getElementById('edit-prod-client-id').value || null;
    const default_price = parseFloat(document.getElementById('edit-prod-price').value);
    const unit = document.getElementById('edit-prod-unit').value || 'pcs';

    const res = await NKB.api(`/api/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
            category,
            name,
            client_id,
            default_price,
            unit
        })
    });

    if (res.success) {
        NKB.showToast(`Product "${name}" updated!`, 'success');
        closeModal();
        await loadInitialData();
        loadProducts();
    } else {
        NKB.showToast(res.error || 'Failed to update product.', 'error');
    }
}

// -------------------------------------------------------------
// 1. MULTI-ITEM PURCHASE ORDER MODAL
// -------------------------------------------------------------
let adminPOLineItems = [];
let adminPOCatalog = [];

async function openCreatePOModal() {
    const root = document.getElementById('modals-root');
    adminPOLineItems = [];
    adminPOCatalog = cachedProducts.slice();

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3 flex-shrink-0">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Create Multi-Item Purchase Order (PO)</h3>
                        <p class="text-xs text-slate-500">Order multiple cosmetic products with client-specific pricing</p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>
                <form id="form-create-po" onsubmit="submitCreatePO(event)" class="space-y-4 text-xs font-semibold flex-1 overflow-y-auto pr-1">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Select Client *</label>
                            <select id="po-client-id" onchange="onAdminPOClientChanged()" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                                ${cachedClients.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Billing Policy</label>
                            <select id="po-billing-policy" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold">
                                <option value="ACTUAL_DELIVERY">Option A: Bill Actual Delivered</option>
                                <option value="FIXED_PO_BUFFER">Option B: Fixed PO + Buffer Stock</option>
                            </select>
                        </div>
                    </div>

                    <!-- Line Items Section -->
                    <div class="space-y-2 pt-2 border-t border-slate-100">
                        <div class="flex justify-between items-center">
                            <span class="text-xs font-bold uppercase tracking-wider text-slate-700">Order Products (Line Items)</span>
                            <button type="button" onclick="addAdminPOLineItem()" class="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition flex items-center gap-1">
                                <span>➕</span><span>Add Product Line</span>
                            </button>
                        </div>

                        <div class="overflow-x-auto border border-slate-200 rounded-xl">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                                    <tr>
                                        <th class="py-2.5 px-3">Product</th>
                                        <th class="py-2.5 px-3 w-32">Target Qty (pcs)</th>
                                        <th class="py-2.5 px-3 w-36">Fixed Unit Price (₱)</th>
                                        <th class="py-2.5 px-3 w-32">Subtotal (₱)</th>
                                        <th class="py-2.5 px-2 w-12 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="admin-po-lines-body" class="divide-y divide-slate-100 font-medium">
                                    <!-- Dynamic Rows -->
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Summary & Totals -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <div>
                            <label class="block text-slate-600 mb-1">Packaging / Batch Notes</label>
                            <textarea id="po-notes" rows="2" placeholder="Formulation variants, packaging specifics..." class="w-full px-3 py-2 border rounded-xl bg-white"></textarea>
                        </div>
                        <div class="space-y-1.5 text-right flex flex-col justify-center">
                            <div class="text-slate-500">Total Items: <strong id="admin-po-total-items" class="text-slate-900">0</strong></div>
                            <div class="text-slate-500">Total Target Quantity: <strong id="admin-po-total-qty" class="text-slate-900">0 pcs</strong></div>
                            <div class="text-base font-extrabold text-indigo-900 pt-1 border-t border-slate-200">Grand Total: <span id="admin-po-grand-total">₱0.00</span></div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 flex-shrink-0">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
                        <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30">Submit Purchase Order</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    await onAdminPOClientChanged();
}

async function onAdminPOClientChanged() {
    const clientSelect = document.getElementById('po-client-id');
    if (!clientSelect) return;
    const clientId = clientSelect.value;

    const res = await NKB.api(`/api/products?clientId=${clientId}&assignedOnly=true`);
    if (res.success && res.data) {
        adminPOCatalog = res.data;
    } else {
        adminPOCatalog = [];
    }

    // Reset lines to current client's products only
    adminPOLineItems = [];
    if (adminPOCatalog.length > 0) {
        addAdminPOLineItem();
    } else {
        renderAdminPOLineItems();
    }
}

function addAdminPOLineItem() {
    if (adminPOCatalog.length === 0) return;
    const defaultProd = adminPOCatalog[0];
    adminPOLineItems.push({
        product_id: defaultProd.id,
        target_quantity: 1000,
        unit_price: Number(defaultProd.default_price || 0)
    });
    renderAdminPOLineItems();
}

function removeAdminPOLineItem(index) {
    adminPOLineItems.splice(index, 1);
    if (adminPOLineItems.length === 0 && adminPOCatalog.length > 0) {
        addAdminPOLineItem();
    } else {
        renderAdminPOLineItems();
    }
}

function updateAdminPOLineItem(index, field, value) {
    if (!adminPOLineItems[index]) return;
    if (field === 'product_id') {
        const prod = adminPOCatalog.find(p => p.id === value);
        adminPOLineItems[index].product_id = value;
        if (prod) {
            adminPOLineItems[index].unit_price = Number(prod.default_price || 0);
        }
        renderAdminPOLineItems();
        return;
    } else if (field === 'target_quantity') {
        adminPOLineItems[index].target_quantity = parseInt(value, 10) || 0;
    }

    // Update line total and summary totals
    const lineSubtotal = (adminPOLineItems[index].target_quantity || 0) * (adminPOLineItems[index].unit_price || 0);
    const lineTotalEl = document.getElementById(`admin-po-line-total-${index}`);
    if (lineTotalEl) lineTotalEl.textContent = NKB.formatCurrency(lineSubtotal);

    let totalQty = 0;
    let grandTotal = 0;
    adminPOLineItems.forEach(item => {
        totalQty += item.target_quantity || 0;
        grandTotal += (item.target_quantity || 0) * (item.unit_price || 0);
    });

    const elTotalItems = document.getElementById('admin-po-total-items');
    if (elTotalItems) elTotalItems.textContent = adminPOLineItems.length;
    const elTotalQty = document.getElementById('admin-po-total-qty');
    if (elTotalQty) elTotalQty.textContent = `${NKB.formatNumber(totalQty)} pcs`;
    const elGrandTotal = document.getElementById('admin-po-grand-total');
    if (elGrandTotal) elGrandTotal.textContent = NKB.formatCurrency(grandTotal);
}

function renderAdminPOLineItems() {
    const tbody = document.getElementById('admin-po-lines-body');
    if (!tbody) return;

    if (adminPOCatalog.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-amber-600 font-medium bg-amber-50/50 rounded-lg">⚠️ No products available in this client's catalog.</td></tr>`;
        const elTotalItems = document.getElementById('admin-po-total-items');
        if (elTotalItems) elTotalItems.textContent = '0';
        const elTotalQty = document.getElementById('admin-po-total-qty');
        if (elTotalQty) elTotalQty.textContent = '0 pcs';
        const elGrandTotal = document.getElementById('admin-po-grand-total');
        if (elGrandTotal) elGrandTotal.textContent = '₱0.00';
        return;
    }

    let totalQty = 0;
    let grandTotal = 0;

    tbody.innerHTML = adminPOLineItems.map((item, idx) => {
        const lineSubtotal = (item.target_quantity || 0) * (item.unit_price || 0);
        totalQty += item.target_quantity || 0;
        grandTotal += lineSubtotal;

        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-2.5 px-3">
                    <select onchange="updateAdminPOLineItem(${idx}, 'product_id', this.value)" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium">
                        ${adminPOCatalog.map(p => `
                            <option value="${p.id}" ${p.id === item.product_id ? 'selected' : ''}>
                                ${p.name} (${p.effective_sku || p.sku}) - ₱${Number(p.default_price).toFixed(2)}${p.has_custom_price ? ' [Contract Rate]' : ''}
                            </option>
                        `).join('')}
                    </select>
                </td>
                <td class="py-2.5 px-3">
                    <input type="number" min="1" step="1" 
                           value="${item.target_quantity}" 
                           oninput="updateAdminPOLineItem(${idx}, 'target_quantity', this.value)" 
                           class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                </td>
                <td class="py-2.5 px-3">
                    <div class="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 font-mono flex items-center justify-between">
                        <span>₱${Number(item.unit_price || 0).toFixed(2)}</span>
                        <span class="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Fixed</span>
                    </div>
                </td>
                <td id="admin-po-line-total-${idx}" class="py-2.5 px-3 font-extrabold text-slate-900 font-mono">
                    ${NKB.formatCurrency(lineSubtotal)}
                </td>
                <td class="py-2.5 px-2 text-center">
                    <button type="button" onclick="removeAdminPOLineItem(${idx})" class="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition" title="Remove line">
                        ✖
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    const elTotalItems = document.getElementById('admin-po-total-items');
    if (elTotalItems) elTotalItems.textContent = adminPOLineItems.length;
    const elTotalQty = document.getElementById('admin-po-total-qty');
    if (elTotalQty) elTotalQty.textContent = `${NKB.formatNumber(totalQty)} pcs`;
    const elGrandTotal = document.getElementById('admin-po-grand-total');
    if (elGrandTotal) elGrandTotal.textContent = NKB.formatCurrency(grandTotal);
}

async function submitCreatePO(e) {
    e.preventDefault();
    const clientId = document.getElementById('po-client-id').value;
    const toleranceEl = document.getElementById('po-tolerance');
    const tolerance = toleranceEl ? parseFloat(toleranceEl.value) : undefined;
    const policy = document.getElementById('po-billing-policy').value;
    const notes = document.getElementById('po-notes').value;

    if (!adminPOLineItems || adminPOLineItems.length === 0) {
        NKB.showToast('Please add at least one product line item to the order.', 'error');
        return;
    }

    for (const item of adminPOLineItems) {
        if (!item.product_id || item.target_quantity <= 0) {
            NKB.showToast('All product lines must have valid quantity > 0.', 'error');
            return;
        }
    }

    const res = await NKB.api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
            client_id: clientId,
            tolerance_percent: tolerance,
            billing_policy: policy,
            notes,
            items: adminPOLineItems.map(item => ({
                product_id: item.product_id,
                target_quantity: item.target_quantity,
                unit_price: Math.round(Number(item.unit_price || 0) * 100) / 100
            }))
        })
    });

    if (res.success) {
        NKB.showToast(`Purchase Order ${res.data.po_number} created successfully!`, 'success');
        closeModal();
        loadOrders();
        if (res.data && res.data.id) {
            await openViewPOModal(res.data.id);
        }
    } else {
        NKB.showToast(res.error || 'Failed to create PO.', 'error');
    }
}

// -------------------------------------------------------------
// 2. CREATE JOB ORDER MODAL
// -------------------------------------------------------------
async function openCreateJOModal(poId, poNumber, clientName, preselectedProductId = null, preselectedQty = null) {
    const root = document.getElementById('modals-root') || document.getElementById('client-modals-root');
    const [orderRes, employees] = await Promise.all([
        NKB.api(`/api/orders/${poId}`),
        ensureEmployeesLoaded()
    ]);
    const poItems = (orderRes.success && orderRes.data && orderRes.data.items) ? orderRes.data.items : [];
    const prodStaff = employees.filter(e => e.department === 'Production' || e.department === 'Compounding');

    let selectedItem = poItems[0];
    if (preselectedProductId) {
        const found = poItems.find(it => String(it.product_id) === String(preselectedProductId) || String(it.id) === String(preselectedProductId));
        if (found) selectedItem = found;
    }
    const initialQty = (preselectedQty !== null && preselectedQty !== undefined && !isNaN(Number(preselectedQty)))
        ? Number(preselectedQty)
        : (selectedItem ? selectedItem.target_quantity : 1000);

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Create Job Order</h3>
                        <p class="text-xs text-slate-500">For PO: <strong class="text-indigo-600">${poNumber}</strong> (${clientName})</p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>
                <form onsubmit="submitCreateJO(event, '${poId}')" class="space-y-4 text-xs font-semibold">
                    <div>
                        <label class="block text-slate-600 mb-1">Select Product from PO *</label>
                        <select id="jo-product-id" onchange="onJOProductChanged()" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                            ${poItems.length > 0 ? poItems.map(item => {
                                const isSelected = selectedItem && (String(item.product_id) === String(selectedItem.product_id) || String(item.id) === String(selectedItem.id));
                                return `
                                    <option value="${item.product_id}" data-qty="${item.target_quantity}" ${isSelected ? 'selected' : ''}>
                                        ${item.product_name} (${item.sku}) — Target: ${NKB.formatNumber(item.target_quantity)} pcs
                                    </option>
                                `;
                            }).join('') : cachedProducts.map(p => {
                                const isSelected = preselectedProductId && (String(p.id) === String(preselectedProductId));
                                return `<option value="${p.id}" data-qty="1000" ${isSelected ? 'selected' : ''}>${p.name} (${p.sku})</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Target Production Qty (pcs) *</label>
                        <input type="number" id="jo-target-qty" value="${initialQty}" min="1" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Assigned Production Supervisor / Team Lead *</label>
                        <select id="jo-team" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                            <option value="Formulation & Bottling Team Alpha">Formulation & Bottling Team Alpha (Standard)</option>
                            ${prodStaff.map(e => `
                                <option value="${e.name} (${e.department})">${e.name} — ${e.department} [${e.employee_id}]</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30">Create JO</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function onJOProductChanged() {
    const sel = document.getElementById('jo-product-id');
    const targetQtyInput = document.getElementById('jo-target-qty');
    if (sel && targetQtyInput) {
        const opt = sel.options[sel.selectedIndex];
        const qty = opt ? opt.getAttribute('data-qty') : 1000;
        if (qty) targetQtyInput.value = qty;
    }
}

async function submitCreateJO(e, poId) {
    e.preventDefault();
    const productId = document.getElementById('jo-product-id').value;
    const targetQty = parseInt(document.getElementById('jo-target-qty').value);
    const assignedTeam = document.getElementById('jo-team').value;

    const res = await NKB.api('/api/job-orders', {
        method: 'POST',
        body: JSON.stringify({
            po_id: poId,
            product_id: productId,
            target_quantity: targetQty,
            assigned_team: assignedTeam
        })
    });

    if (res.success) {
        NKB.showToast(`Job Order ${res.data.jo_number} created!`, 'success');
        closeModal();
        if (typeof switchTab === 'function') {
            switchTab('job-orders');
        } else {
            location.reload();
        }
    } else {
        NKB.showToast(res.error || 'Failed to create Job Order.', 'error');
    }
}

window.openCreateJOModal = openCreateJOModal;
window.onJOProductChanged = onJOProductChanged;
window.submitCreateJO = submitCreateJO;

// -------------------------------------------------------------
// 3. CREATE PRODUCTION BATCH MODAL
// -------------------------------------------------------------
async function openCreateBatchModal(joId, joNumber, targetQty, productName) {
    const root = document.getElementById('modals-root');
    const employees = await ensureEmployeesLoaded();

    const compoundingStaff = employees.filter(e => e.department === 'Compounding' || e.department === 'Production' || e.department === 'R&D');
    const bottlingStaff = employees.filter(e => e.department === 'Production');
    const qcStaff = employees.filter(e => e.department === 'QC' || e.department === 'Regulatory');

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Start Production Batch</h3>
                        <p class="text-xs text-slate-500">JO Reference: <strong>${joNumber}</strong></p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>
                <form onsubmit="submitCreateBatch(event, '${joId}')" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-slate-50 rounded-xl text-slate-600 space-y-1">
                        <div>Product: <strong class="text-slate-900">${productName}</strong></div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Target Batch Quantity (pcs) *</label>
                        <input type="number" id="batch-target-qty" value="${targetQty}" min="1" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">🥣 Compounding Chemist / Operator *</label>
                            <select id="batch-compounding-operator" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium text-slate-900">
                                ${compoundingStaff.map(e => `
                                    <option value="${e.name}" ${e.department === 'Compounding' ? 'selected' : ''}>${e.name} (${e.department})</option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">🧴 Bottling & Packaging Lead *</label>
                            <select id="batch-bottling-lead" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium text-slate-900">
                                ${bottlingStaff.map((e, idx) => `
                                    <option value="${e.name}" ${idx === 0 ? 'selected' : ''}>${e.name} [${e.employee_id}]</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">🔬 Quality Control (QC) Inspector *</label>
                            <select id="batch-qc-inspector" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium text-slate-900">
                                ${qcStaff.map((e, idx) => `
                                    <option value="${e.name}" ${idx === 0 ? 'selected' : ''}>${e.name} (${e.department})</option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">🏭 Line / Cleanroom Assignment</label>
                            <select id="batch-line-assignment" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium text-slate-900">
                                <option value="Cleanroom Line 1 (Alpha)">Cleanroom Line 1 (Alpha)</option>
                                <option value="Cleanroom Line 2 (Beta)">Cleanroom Line 2 (Beta)</option>
                                <option value="High-Speed Bottling Line 3">High-Speed Bottling Line 3</option>
                                <option value="Compounding Kettle Area A">Compounding Kettle Area A</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30">Start Batch</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateBatch(e, joId) {
    e.preventDefault();
    const targetQty = parseInt(document.getElementById('batch-target-qty').value);
    const compoundingOperator = document.getElementById('batch-compounding-operator')?.value || '';
    const bottlingLead = document.getElementById('batch-bottling-lead')?.value || '';
    const qcInspector = document.getElementById('batch-qc-inspector')?.value || '';
    const lineAssignment = document.getElementById('batch-line-assignment')?.value || '';

    const res = await NKB.api('/api/production/batches', {
        method: 'POST',
        body: JSON.stringify({
            jo_id: joId,
            target_quantity: targetQty,
            compounding_operator: compoundingOperator,
            bottling_lead: bottlingLead,
            qc_inspector: qcInspector,
            line_assignment: lineAssignment
        })
    });

    if (res.success) {
        NKB.showToast(`Batch ${res.data.batch_number} started with assigned operators!`, 'success');
        closeModal();
        switchTab('production');
    } else {
        NKB.showToast(res.error || 'Failed to create Batch.', 'error');
    }
}

// 4. Log Batch Yield Modal (The Core Yield Variance Calculator)
function openLogYieldModal(batchId, batchNumber, targetQty, tolerancePercent = 10) {
    const root = document.getElementById('modals-root');
    const maxAllowed = Math.ceil(targetQty * (1 + tolerancePercent / 100));

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Log Production Output & Yield</h3>
                        <p class="text-xs text-slate-500">Batch: <strong>${batchNumber}</strong></p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitLogYield(event, '${batchId}', ${targetQty}, ${tolerancePercent})" class="space-y-4 text-xs font-semibold">
                    <div class="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl text-slate-700">
                        <div>Target Output: <strong class="text-slate-900">${NKB.formatNumber(targetQty)} pcs</strong></div>
                        <div>Tolerance: <strong class="text-indigo-600">±${tolerancePercent}%</strong> (Max: ${maxAllowed} pcs)</div>
                    </div>

                    <div>
                        <label class="block text-slate-600 mb-1">Actual Bottled/Finished Yield (pcs)</label>
                        <input type="number" id="actual-yield-input" oninput="calculateYieldPreview(${targetQty}, ${tolerancePercent})" value="${targetQty}" min="0" required class="w-full px-4 py-2.5 border-2 border-indigo-200 rounded-xl text-base font-bold text-indigo-900 focus:outline-none focus:border-indigo-600">
                    </div>

                    <!-- Live Calculation Box -->
                    <div id="yield-preview-box" class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                        <div class="text-slate-600">Variance: <strong id="preview-variance-qty" class="text-emerald-700">0 pcs (0%)</strong></div>
                        <div id="preview-status-desc" class="text-xs text-emerald-800 font-bold">Status: Within agreed manufacturing tolerance</div>
                    </div>

                    <div>
                        <label class="block text-slate-600 mb-1">QC & Testing Notes</label>
                        <textarea id="yield-qc-notes" rows="2" placeholder="Microbiological test, pH, viscosity check..." class="w-full px-3 py-2 border rounded-xl bg-slate-50">Viscosity passed, pH 5.5, zero contamination.</textarea>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Record Output & Pass QC</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function calculateYieldPreview(targetQty, tolerancePercent) {
    const input = document.getElementById('actual-yield-input');
    const val = parseInt(input.value) || 0;
    const diff = val - targetQty;
    const pct = targetQty > 0 ? ((diff / targetQty) * 100).toFixed(2) : 0;
    const maxAllowed = Math.ceil(targetQty * (1 + tolerancePercent / 100));

    const previewQty = document.getElementById('preview-variance-qty');
    const previewDesc = document.getElementById('preview-status-desc');
    const box = document.getElementById('yield-preview-box');

    previewQty.textContent = `${diff > 0 ? '+' : ''}${diff} pcs (${pct > 0 ? '+' : ''}${pct}%)`;

    if (val > maxAllowed) {
        box.className = 'p-3 rounded-xl bg-rose-50 border border-rose-300 space-y-1';
        previewDesc.className = 'text-xs text-rose-800 font-bold';
        previewDesc.textContent = `⚠️ EXCEPTION: Exceeds +${tolerancePercent}% tolerance (Max allowed: ${maxAllowed} pcs). Will require manager approval.`;
    } else if (diff > 0) {
        box.className = 'p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-1';
        previewDesc.className = 'text-xs text-amber-800 font-bold';
        previewDesc.textContent = `✅ Over-run (+${pct}%) within agreed tolerance. Full ${val} pcs will be billable on DR!`;
    } else {
        box.className = 'p-3 rounded-xl bg-emerald-50 border border-emerald-300 space-y-1';
        previewDesc.className = 'text-xs text-emerald-800 font-bold';
        previewDesc.textContent = `✅ Within agreed manufacturing tolerance.`;
    }
}

async function submitLogYield(e, batchId, targetQty, tolerancePercent) {
    e.preventDefault();
    const actualYield = parseInt(document.getElementById('actual-yield-input').value);
    const qcNotes = document.getElementById('yield-qc-notes').value;

    const res = await NKB.api(`/api/production/batches/${batchId}/yield`, {
        method: 'POST',
        body: JSON.stringify({
            actual_yield: actualYield,
            qc_notes: qcNotes
        })
    });

    if (res.success) {
        NKB.showToast(res.message, res.exceptionRequiresApproval ? 'warning' : 'success');
        closeModal();
        loadBatches();
    } else {
        NKB.showToast(res.error || 'Failed to log yield.', 'error');
    }
}

// 5. Overrun Exception Approval Modal
function openApproveOverrunModal(batchId, batchNumber, targetQty, actualYield, tolerancePercent) {
    const maxAllowed = Math.ceil(targetQty * (1 + tolerancePercent / 100));
    const excess = actualYield - maxAllowed;

    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border-t-4 border-rose-500">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900">Authorize Over-Tolerance Batch</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitApproveOverrun(event, '${batchId}')" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-rose-900">
                        <div>Batch: <strong>${batchNumber}</strong></div>
                        <div>Target: <strong>${NKB.formatNumber(targetQty)} pcs</strong></div>
                        <div>Actual Output: <strong class="text-rose-700">${NKB.formatNumber(actualYield)} pcs</strong></div>
                        <div>Excess above tolerance: <strong class="text-rose-700">+${NKB.formatNumber(excess)} pcs</strong></div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Approved Billable Quantity (pcs)</label>
                        <input type="number" id="overrun-approved-qty" value="${actualYield}" required class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Approval Reason</label>
                        <input type="text" id="overrun-reason" value="Client confirmed absorption of excess production run." required class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold">Approve For Dispatch</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitApproveOverrun(e, batchId) {
    e.preventDefault();
    const approvedQty = parseInt(document.getElementById('overrun-approved-qty').value);
    const reason = document.getElementById('overrun-reason').value;

    const res = await NKB.api(`/api/production/batches/${batchId}/approve-overrun`, {
        method: 'POST',
        body: JSON.stringify({
            approved_quantity: approvedQty,
            reason
        })
    });

    if (res.success) {
        NKB.showToast(res.message, 'success');
        closeModal();
        loadBatches();
    } else {
        NKB.showToast(res.error || 'Failed to approve overrun.', 'error');
    }
}

// 6. Create Delivery Receipt (DR) Modal
function openCreateDRModal(poNumber, joNumber, batchId, batchNumber, deliveredQty, productName, clientId) {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900">Create Delivery Receipt & Dispatch</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitCreateDR(event, '${poNumber}', '${batchId}')" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-slate-50 rounded-xl space-y-1 text-slate-700">
                        <div>PO Reference: <strong class="text-slate-900">${poNumber}</strong></div>
                        <div>Batch: <strong class="text-indigo-600">${batchNumber}</strong> (${productName})</div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Delivered Quantity (pcs)</label>
                        <input type="number" id="dr-delivered-qty" value="${deliveredQty}" min="1" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Driver Name</label>
                            <input type="text" id="dr-driver-name" value="Danilo Gomez" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Vehicle Plate</label>
                            <input type="text" id="dr-vehicle-plate" value="NKB-8899" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Dispatch Notes</label>
                        <textarea id="dr-notes" rows="2" class="w-full px-3 py-2 border rounded-xl bg-slate-50">Dispatched in protective shrink-wrapped master boxes.</textarea>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold">Dispatch & Issue DR</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateDR(e, poNumber, batchId) {
    e.preventDefault();
    const deliveredQty = parseInt(document.getElementById('dr-delivered-qty').value);
    const driverName = document.getElementById('dr-driver-name').value;
    const vehiclePlate = document.getElementById('dr-vehicle-plate').value;
    const notes = document.getElementById('dr-notes').value;

    // Fetch PO details to get product ID and PO ID
    const poListRes = await NKB.api(`/api/orders?search=${encodeURIComponent(poNumber)}`);
    if (!poListRes.success || !poListRes.data || poListRes.data.length === 0) {
        NKB.showToast('PO record not found.', 'error');
        return;
    }
    const po = poListRes.data[0];

    const batchRes = await NKB.api(`/api/production/batches/${batchId}`);
    if (!batchRes.success || !batchRes.data) {
        NKB.showToast('Batch record not found.', 'error');
        return;
    }
    const batch = batchRes.data;

    const res = await NKB.api('/api/deliveries', {
        method: 'POST',
        body: JSON.stringify({
            po_id: po.id,
            jo_id: batch.jo_id,
            driver_name: driverName,
            vehicle_plate: vehiclePlate,
            notes,
            items: [
                { product_id: batch.product_id, batch_id: batchId, delivered_quantity: deliveredQty }
            ]
        })
    });

    if (res.success) {
        NKB.showToast(`Delivery Receipt ${res.data.dr_number} created! Waiting for client digital acceptance.`, 'success');
        closeModal();
        switchTab('deliveries');
    } else {
        NKB.showToast(res.error || 'Failed to create DR.', 'error');
    }
}

// 7. Generate Invoice Modal
function openGenerateInvoiceModal(drId, drNumber, clientName, totalAccepted) {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900">Generate Sales Invoice (SI)</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitGenerateInvoice(event, '${drId}')" class="space-y-4 text-xs font-semibold">
                    <div class="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2 text-indigo-950">
                        <div>DR Reference: <strong class="text-indigo-900 font-extrabold">${drNumber}</strong></div>
                        <div>Client: <strong>${clientName}</strong></div>
                        <div class="text-sm font-extrabold text-emerald-800">
                            Accepted Count to Bill: ${NKB.formatNumber(totalAccepted)} pcs
                        </div>
                        <div class="text-[11px] text-indigo-700 italic">
                            Core Rule: Sales Invoice will be strictly computed from the accepted DR quantity (${totalAccepted} pcs).
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Invoice Due Date</label>
                        <input type="date" id="inv-due-date" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Invoice Notes / Terms</label>
                        <textarea id="inv-notes" rows="2" class="w-full px-3 py-2 border rounded-xl bg-slate-50">Standard payment term: 30 days upon DR acceptance.</textarea>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold">Generate Official Invoice</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Set default due date to 30 days from today
    const d = new Date();
    d.setDate(d.getDate() + 30);
    document.getElementById('inv-due-date').value = d.toISOString().split('T')[0];
}

async function submitGenerateInvoice(e, drId) {
    e.preventDefault();
    const dueDate = document.getElementById('inv-due-date').value;
    const notes = document.getElementById('inv-notes').value;

    const res = await NKB.api(`/api/invoices/from-dr/${drId}`, {
        method: 'POST',
        body: JSON.stringify({
            due_date: dueDate,
            notes
        })
    });

    if (res.success) {
        NKB.showToast(res.message, 'success');
        closeModal();
        switchTab('invoices');
    } else {
        NKB.showToast(res.error || 'Failed to generate invoice.', 'error');
    }
}

// 8. Record Payment Modal
function openRecordPaymentModal(invoiceId, invoiceNumber, balanceDue, clientName) {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900">Record Payment</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitRecordPayment(event, '${invoiceId}', ${balanceDue})" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-slate-50 rounded-xl space-y-1 text-slate-700">
                        <div>Invoice: <strong class="text-indigo-600">${invoiceNumber}</strong></div>
                        <div>Client: <strong>${clientName}</strong></div>
                        <div class="text-sm font-extrabold text-rose-700">Balance Due: ${NKB.formatCurrency(balanceDue)}</div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Payment Amount (₱)</label>
                        <input type="number" step="0.01" min="0.01" max="${Number(balanceDue).toFixed(2)}" value="${Number(balanceDue).toFixed(2)}" inputmode="decimal" onblur="if(this.value && !isNaN(this.value)) this.value = parseFloat(this.value).toFixed(2)" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-emerald-800">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Payment Method</label>
                            <select id="pay-method" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                <option value="CHECK">Check</option>
                                <option value="ONLINE_BANKING">Online Banking</option>
                                <option value="GCASH">GCash</option>
                                <option value="CASH">Cash</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Reference Number</label>
                            <input type="text" id="pay-ref" placeholder="BDO-TXN-12345" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold">Record Payment</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitRecordPayment(e, invoiceId, balanceDue) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const method = document.getElementById('pay-method').value;
    const ref = document.getElementById('pay-ref').value;

    const res = await NKB.api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
            invoice_id: invoiceId,
            amount,
            payment_method: method,
            reference_number: ref
        })
    });

    if (res.success) {
        NKB.showToast(res.message, 'success');
        closeModal();
        loadInvoices();
        loadPayments();
    } else {
        NKB.showToast(res.error || 'Failed to record payment.', 'error');
    }
}

// 9. Release Buffer Stock Modal
function openReleaseBufferModal(bufferId, remainingQty, clientName, productName) {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900">Release Client Buffer Stock</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitReleaseBuffer(event, '${bufferId}', ${remainingQty})" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-slate-50 rounded-xl space-y-1 text-slate-700">
                        <div>Client: <strong>${clientName}</strong></div>
                        <div>Product: <strong>${productName}</strong></div>
                        <div class="text-sm font-extrabold text-emerald-700">Available to Draw: ${NKB.formatNumber(remainingQty)} pcs</div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Release Quantity (pcs)</label>
                        <input type="number" id="buffer-rel-qty" max="${remainingQty}" min="1" value="${remainingQty}" required class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Reason / Destination</label>
                        <input type="text" id="buffer-rel-reason" value="Client drawdown request for promotional campaign." required class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Release to Client</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitReleaseBuffer(e, bufferId, remainingQty) {
    e.preventDefault();
    const qty = parseInt(document.getElementById('buffer-rel-qty').value);
    const reason = document.getElementById('buffer-rel-reason').value;

    const res = await NKB.api(`/api/buffer-stock/${bufferId}/release`, {
        method: 'POST',
        body: JSON.stringify({
            release_quantity: qty,
            reason
        })
    });

    if (res.success) {
        NKB.showToast(res.message, 'success');
        closeModal();
        loadBufferStock();
    } else {
        NKB.showToast(res.error || 'Failed to release buffer stock.', 'error');
    }
}

// 10. Create Client Modal
function openCreateClientModal() {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900">Add New B2B Client</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitCreateClient(event)" class="space-y-4 text-xs font-semibold">
                    <div>
                        <label class="block text-slate-600 mb-1">Company / Brand Name *</label>
                        <input type="text" id="client-name" required placeholder="e.g. Luxe Skin Aesthetics Inc." class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Contact Person *</label>
                            <input type="text" id="client-contact" required placeholder="Full Name" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Email (Login Username) *</label>
                            <input type="email" id="client-email" required placeholder="client@company.com" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Contact Number (Optional)</label>
                            <input type="text" id="client-phone" placeholder="+63 917 000 0000" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">TIN (Optional)</label>
                            <input type="text" id="client-tin" placeholder="000-000-000-000" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Business Address (Optional)</label>
                        <input type="text" id="client-address" placeholder="Building, Street, City, Metro Manila" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Default Billing Policy</label>
                        <select id="client-policy" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                            <option value="ACTUAL_DELIVERY">Option A: Bill Actual Delivered</option>
                            <option value="FIXED_PO_BUFFER">Option B: Fixed PO + Buffer</option>
                        </select>
                    </div>

                    <!-- Client Portal Login Account Generator -->
                    <div class="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                        <div class="flex items-center justify-between">
                            <label class="flex items-center gap-2 font-bold text-amber-900 cursor-pointer">
                                <input type="checkbox" id="client-create-account" checked class="rounded border-amber-300 text-amber-600 focus:ring-amber-500">
                                <span>Create Client Portal Login Credentials</span>
                            </label>
                            <span class="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">Automated</span>
                        </div>
                        <div>
                            <label class="block text-amber-800 text-[11px] mb-0.5">Initial Default Password</label>
                            <input type="text" id="client-default-pass" value="Client123!" class="w-full px-3 py-1.5 border border-amber-300 rounded-lg bg-white text-slate-800 font-mono text-xs">
                            <p class="text-[10px] text-amber-700 mt-0.5">The client will use their email and this password to log in, and can change it anytime in the Client Portal.</p>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Save Client</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateClient(e) {
    e.preventDefault();
    const companyName = document.getElementById('client-name').value;
    const contactPerson = document.getElementById('client-contact').value;
    const email = document.getElementById('client-email').value;
    const phone = document.getElementById('client-phone').value;
    const tin = document.getElementById('client-tin').value;
    const address = document.getElementById('client-address').value;
    const policy = document.getElementById('client-policy').value;
    const createAccount = document.getElementById('client-create-account').checked;
    const defaultPassword = document.getElementById('client-default-pass').value;

    const res = await NKB.api('/api/clients', {
        method: 'POST',
        body: JSON.stringify({
            company_name: companyName,
            contact_person: contactPerson,
            email,
            phone,
            tin,
            address,
            default_billing_policy: policy,
            default_tolerance_percent: 10.0,
            create_portal_account: createAccount,
            default_password: defaultPassword
        })
    });

    if (res.success) {
        closeModal();
        await loadInitialData();
        loadClients();

        if (res.credentials) {
            openClientCredentialsSummaryModal(companyName, res.credentials.email, res.credentials.password);
        } else {
            NKB.showToast(`Client "${companyName}" registered successfully!`, 'success');
        }
    } else {
        NKB.showToast(res.error || 'Failed to add client.', 'error');
    }
}

function openClientCredentialsSummaryModal(companyName, email, password) {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-emerald-200">
                <div class="text-center space-y-1">
                    <div class="text-4xl">🎉</div>
                    <h3 class="text-lg font-extrabold text-slate-900">Client Login Credentials Created!</h3>
                    <p class="text-xs text-slate-500">${companyName}</p>
                </div>

                <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
                    <div class="flex justify-between items-center">
                        <span class="text-slate-500 font-bold">Portal URL:</span>
                        <a href="/index.html" target="_blank" class="font-mono text-indigo-600 font-bold hover:underline">/index.html</a>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-slate-500 font-bold">Username / Email:</span>
                        <span class="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border">${email}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-slate-500 font-bold">Default Password:</span>
                        <span class="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">${password}</span>
                    </div>
                </div>

                <p class="text-[11px] text-slate-500 text-center">
                    You may share these credentials with the client. The client can change their password anytime from their Client Portal.
                </p>

                <button onclick="closeModal()" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl shadow-lg transition text-xs">
                    Got it, Close
                </button>
            </div>
        </div>
    `;
}

function openResetClientCredentialsModal(clientId, companyName, email) {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-amber-200">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">🔑</span>
                        <h3 class="text-base font-extrabold text-slate-900">Manage Client Credentials</h3>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>

                <div class="text-xs text-slate-600">
                    Client: <strong class="text-slate-900">${companyName}</strong><br>
                    Login Email: <strong class="text-slate-900">${email}</strong>
                </div>

                <form onsubmit="submitResetClientCredentials(event, '${clientId}', '${companyName.replace(/'/g, "\\'")}', '${email}')" class="space-y-4 text-xs font-semibold">
                    <div>
                        <label class="block text-slate-700 mb-1">Set New Password (Default: Client123!)</label>
                        <input type="text" id="reset-client-password" required value="Client123!" minlength="8" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono text-xs">
                        <p class="text-[10px] text-slate-500 mt-1">This will update or create the client's login account with this new password.</p>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" id="btn-submit-reset" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-md">Reset & Save Password</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitResetClientCredentials(e, clientId, companyName, email) {
    e.preventDefault();
    const newPassword = document.getElementById('reset-client-password').value;
    const btn = document.getElementById('btn-submit-reset');

    btn.disabled = true;
    btn.textContent = 'Saving...';

    const res = await NKB.api(`/api/clients/${clientId}/credentials/reset`, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPassword })
    });

    if (res.success) {
        closeModal();
        loadClients();
        openClientCredentialsSummaryModal(companyName, email, newPassword);
    } else {
        btn.disabled = false;
        btn.textContent = 'Reset & Save Password';
        NKB.showToast(res.error || res.message || 'Failed to reset password.', 'error');
    }
}

// 11. Create Product Modal & Auto-SKU Generator
let skuDebounceTimer = null;
async function autoGenerateProductSKU(force = false) {
    clearTimeout(skuDebounceTimer);
    const run = async () => {
        const nameInput = document.getElementById('prod-name');
        const clientSelect = document.getElementById('prod-client-id');
        const skuInput = document.getElementById('prod-sku');
        if (!nameInput || !skuInput) return;

        const name = nameInput.value.trim();
        const clientId = clientSelect ? clientSelect.value : '';

        if (!name && !force) {
            return;
        }

        try {
            const url = `/api/products/generate-sku?name=${encodeURIComponent(name || 'Product')}&clientId=${encodeURIComponent(clientId)}`;
            const res = await NKB.api(url);
            const skuVal = res.data?.sku || res.sku;
            if (res.success && skuVal) {
                skuInput.value = skuVal;
            }
        } catch (err) {
            console.error('Failed to generate SKU:', err);
        }
    };

    if (force) {
        await run();
    } else {
        skuDebounceTimer = setTimeout(run, 300);
    }
}

async function openCreateProductModal(preselectedClientId = null) {
    await Promise.all([ensureClientsLoaded(), ensureCategoriesLoaded()]);
    const clientOptions = (cachedClients || []).map(c => {
        const isSelected = preselectedClientId && c.id === preselectedClientId;
        return `<option value="${c.id}" ${isSelected ? 'selected' : ''}>${c.company_name || c.name}</option>`;
    }).join('');

    const categoryOptions = (cachedCategories || []).map(cat => {
        return `<option value="${cat.name}">${cat.name}</option>`;
    }).join('');

    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">✨</span>
                        <div>
                            <h3 class="text-lg font-black text-slate-900">Add Cosmetic Product</h3>
                            <p class="text-xs text-slate-500">Register new item connected to Clients Directory & Catalog</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
                </div>
                <form onsubmit="submitCreateProduct(event)" class="space-y-3.5 text-xs font-semibold">
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <label class="block text-slate-700 font-bold">Client / Brand (from Clients Directory)</label>
                            <span class="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">🏢 Clients Directory</span>
                        </div>
                        <select id="prod-client-id" onchange="autoGenerateProductSKU(true)" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500">
                            <option value="">-- Master / All Clients --</option>
                            ${clientOptions}
                        </select>
                        <p class="text-[10px] text-slate-400 mt-1">Assigns this product to the client in the Clients Directory & prefixes SKU with client initials.</p>
                    </div>
                    <div>
                        <label class="block text-slate-700 font-bold mb-1">Product Commercial Name *</label>
                        <input type="text" id="prod-name" required oninput="autoGenerateProductSKU()" placeholder="e.g. Vitamin C Brightening Body Lotion 300ml" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="block text-slate-700 font-bold">SKU / Item Code *</label>
                                <span class="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">Auto-Generated</span>
                            </div>
                            <div class="flex gap-1.5">
                                <input type="text" id="prod-sku" required placeholder="e.g. VCB-101" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 text-slate-900 font-mono font-black uppercase tracking-wider focus:ring-2 focus:ring-indigo-500">
                                <button type="button" onclick="autoGenerateProductSKU(true)" title="Regenerate SKU" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition flex items-center justify-center">
                                    🔄
                                </button>
                            </div>
                        </div>
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="block text-slate-700 font-bold">Category *</label>
                            </div>
                            <div class="flex gap-1.5">
                                <select id="prod-category" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 font-semibold focus:ring-2 focus:ring-indigo-500">
                                    ${categoryOptions}
                                </select>
                                <button type="button" onclick="showAddCategoryInline('prod-category')" title="Add New Category" class="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition flex items-center gap-1 flex-shrink-0">
                                    <span>➕ Add</span>
                                </button>
                            </div>
                            <div id="add-category-box-prod-category" class="hidden mt-2 p-2.5 bg-slate-50 border border-indigo-200 rounded-xl space-y-2">
                                <div class="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                                    <span>🏷️ Add New Category</span>
                                    <button type="button" onclick="hideAddCategoryInline('prod-category')" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                                </div>
                                <div class="flex gap-1.5">
                                    <input type="text" id="new-category-input-prod-category" onkeydown="if(event.key==='Enter'){event.preventDefault();saveNewCategory('prod-category');}" placeholder="e.g. Perfume & Fragrance" class="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800">
                                    <button type="button" onclick="saveNewCategory('prod-category')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex-shrink-0 shadow-sm">
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Default Unit Price (₱) *</label>
                            <input type="number" step="0.01" min="0" inputmode="decimal" id="prod-price" required placeholder="120.00" onblur="if(this.value && !isNaN(this.value)) this.value = parseFloat(this.value).toFixed(2)" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-extrabold text-indigo-900 text-sm focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Unit of Measure</label>
                            <input type="text" id="prod-unit" value="pcs" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">Cancel</button>
                        <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-600/30 transition">Save Product</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateProduct(e) {
    e.preventDefault();
    const sku = document.getElementById('prod-sku').value.trim();
    const category = document.getElementById('prod-category').value;
    const name = document.getElementById('prod-name').value.trim();
    const clientId = document.getElementById('prod-client-id')?.value || null;
    const price = parseFloat(document.getElementById('prod-price').value);
    const unit = document.getElementById('prod-unit').value || 'pcs';

    const res = await NKB.api('/api/products', {
        method: 'POST',
        body: JSON.stringify({
            sku,
            category,
            name,
            client_id: clientId,
            default_price: price,
            unit
        })
    });

    if (res.success) {
        NKB.showToast(`Product "${name}" added successfully!`, 'success');
        closeModal();
        await loadInitialData();
        loadProducts();
    } else {
        NKB.showToast(res.error || 'Failed to add product.', 'error');
    }
}

// -------------------------------------------------------------
// 11. STAFF & RBAC USER MANAGEMENT
// -------------------------------------------------------------
async function ensureClientsLoaded() {
    if (!cachedClients || cachedClients.length === 0) {
        try {
            const res = await NKB.api('/api/clients');
            if (res.success && res.data) {
                cachedClients = res.data;
            }
        } catch (e) {
            console.error('Error fetching clients:', e);
        }
    }
    return cachedClients || [];
}

async function loadUsers() {
    const search = document.getElementById('filter-users-search')?.value || '';
    const tbody = document.getElementById('table-users-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">Loading users directory...</td></tr>';

    const res = await NKB.api(`/api/users?search=${encodeURIComponent(search)}`);
    if (!res.success || !res.data || res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">No users found.</td></tr>';
        return;
    }

    const roleBadges = {
        'SUPER_ADMIN': 'bg-red-100 text-red-800 border-red-200',
        'ADMIN': 'bg-indigo-100 text-indigo-800 border-indigo-200',
        'PRODUCTION': 'bg-amber-100 text-amber-800 border-amber-200',
        'WAREHOUSE': 'bg-purple-100 text-purple-800 border-purple-200',
        'ACCOUNTING': 'bg-emerald-100 text-emerald-800 border-emerald-200',
        'CLIENT': 'bg-blue-100 text-blue-800 border-blue-200'
    };

    const roleIcons = {
        'SUPER_ADMIN': '🛡️',
        'ADMIN': '👑',
        'PRODUCTION': '🧪',
        'WAREHOUSE': '🚚',
        'ACCOUNTING': '💰',
        'CLIENT': '🏢'
    };

    tbody.innerHTML = res.data.map(u => `
        <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-4">
                <div class="font-bold text-slate-900">${u.name}</div>
                <div class="text-[11px] text-slate-400 font-mono">${u.email}</div>
            </td>
            <td class="py-3 px-4">
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border ${roleBadges[u.role] || 'bg-slate-100 text-slate-800 border-slate-200'}">
                    <span>${roleIcons[u.role] || '👤'}</span>
                    <span>${u.role}</span>
                </span>
            </td>
            <td class="py-3 px-4 font-medium text-slate-700">
                ${u.company_name ? `🏢 ${u.company_name}` : '🏭 NKB Internal'}
            </td>
            <td class="py-3 px-4">
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${u.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                    ${u.is_active ? '● Active' : '○ Deactivated'}
                </span>
            </td>
            <td class="py-3 px-4 text-slate-500 font-mono text-[11px]">
                ${NKB.formatDate(u.created_at)}
            </td>
            <td class="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                <button onclick="openEditUserModal('${u.id}')" class="px-2.5 py-1 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1">
                    <span>✏️</span> Edit
                </button>
                <button onclick="promptResetUserPassword('${u.id}', '${u.email}')" class="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1">
                    <span>🔑</span> Reset
                </button>
                <button onclick="toggleUserStatus('${u.id}', ${u.is_active})" class="px-2.5 py-1 ${u.is_active ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'} border rounded-lg text-xs font-semibold transition">
                    ${u.is_active ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        </tr>
    `).join('');
}

function toggleClientDropdown(role, containerId = 'client-select-container') {
    const container = document.getElementById(containerId);
    if (container) {
        container.style.display = (role === 'CLIENT') ? 'block' : 'none';
    }
}

async function openCreateUserModal() {
    await ensureClientsLoaded();
    const root = document.getElementById('modals-root');
    const isSuperAdmin = NKB.user && NKB.user.role === 'SUPER_ADMIN';

    const clientOptions = (cachedClients || []).map(c => `
        <option value="${c.id}">${c.company_name} (${c.client_code || 'ID: ' + c.id.slice(0, 6)})</option>
    `).join('');

    root.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-base font-bold">➕</div>
                        <div>
                            <h3 class="text-base font-extrabold text-slate-900">Add Staff Member / Portal User</h3>
                            <p class="text-[11px] text-slate-500">Create login credentials and assign enterprise access privileges.</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition">✕</button>
                </div>
                <form onsubmit="submitCreateUser(event)" class="space-y-3.5 text-xs">
                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Full Name <span class="text-rose-500">*</span></label>
                        <input type="text" id="usr-name" placeholder="Juan dela Cruz" required class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition">
                    </div>
                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Corporate / Login Email <span class="text-rose-500">*</span></label>
                        <input type="email" id="usr-email" placeholder="staff@nkbmanufacturing.com" required class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition">
                    </div>
                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Initial Password <span class="text-rose-500">*</span></label>
                        <input type="password" id="usr-pwd" placeholder="Minimum 8 characters" required minlength="8" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition">
                    </div>
                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Assigned Enterprise Role <span class="text-rose-500">*</span></label>
                        <select id="usr-role" onchange="toggleClientDropdown(this.value, 'client-select-container')" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 transition">
                            <option value="PRODUCTION">🧪 Production Supervisor (Formulas & Batches)</option>
                            <option value="WAREHOUSE">🚚 Logistics & Warehouse (Inventory & DR)</option>
                            <option value="ACCOUNTING">💰 Senior Accountant (Invoices & AR)</option>
                            <option value="ADMIN">👑 Operations Manager (Admin)</option>
                            ${isSuperAdmin ? '<option value="SUPER_ADMIN">🛡️ Executive Super Admin (Full Control)</option>' : ''}
                            <option value="CLIENT">🏢 B2B Client Portal User</option>
                        </select>
                    </div>
                    <div id="client-select-container" style="display: none;" class="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1">
                        <label class="block text-blue-900 font-bold">Link to Client Company <span class="text-rose-500">*</span></label>
                        <select id="usr-client-id" class="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-slate-800">
                            ${clientOptions ? clientOptions : '<option value="">No clients found - create a client first</option>'}
                        </select>
                        <p class="text-[10px] text-blue-600">This user will only have isolated access to their company's orders, invoices, and DRs.</p>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">Cancel</button>
                        <button type="submit" id="btn-create-user-submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition">Create User Account</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateUser(e) {
    e.preventDefault();
    const name = document.getElementById('usr-name')?.value.trim();
    const email = document.getElementById('usr-email')?.value.trim();
    const password = document.getElementById('usr-pwd')?.value;
    const role = document.getElementById('usr-role')?.value;
    const client_id = role === 'CLIENT' ? document.getElementById('usr-client-id')?.value : null;

    if (!name || !email || !password || !role) {
        NKB.showToast('Please fill out all required fields.', 'error');
        return;
    }

    if (role === 'CLIENT' && !client_id) {
        NKB.showToast('Please select a client company for client portal users.', 'error');
        return;
    }

    const submitBtn = document.getElementById('btn-create-user-submit');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Creating...';
    }

    try {
        const res = await NKB.api('/api/users', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, role, client_id })
        });

        if (res.success) {
            NKB.showToast(`User ${name} created with role ${role}!`, 'success');
            closeModal();
            loadUsers();
        } else {
            NKB.showToast(res.message || res.error || 'Failed to create user.', 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Create User Account';
            }
        }
    } catch (err) {
        NKB.showToast('Network error while creating user.', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Create User Account';
        }
    }
}

async function openEditUserModal(userId) {
    await ensureClientsLoaded();
    const root = document.getElementById('modals-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 text-center space-y-2">
                <div class="inline-block animate-spin text-2xl">⏳</div>
                <p class="text-xs font-bold text-slate-700">Loading user profile...</p>
            </div>
        </div>
    `;

    const res = await NKB.api(`/api/users/${userId}`);
    if (!res.success || !res.data) {
        closeModal();
        NKB.showToast(res.message || res.error || 'Failed to load user details.', 'error');
        return;
    }

    const u = res.data;
    const isCurrentUserSuperAdmin = NKB.user && NKB.user.role === 'SUPER_ADMIN';
    const isTargetSuperAdmin = u.role === 'SUPER_ADMIN';
    const isSelf = NKB.user && NKB.user.id === u.id;

    if (isTargetSuperAdmin && !isCurrentUserSuperAdmin) {
        closeModal();
        alert('Only Super Administrators have permission to edit Super Admin accounts.');
        return;
    }

    const clientOptions = (cachedClients || []).map(c => `
        <option value="${c.id}" ${u.client_id === c.id ? 'selected' : ''}>${c.company_name} (${c.client_code || 'ID: ' + c.id.slice(0, 6)})</option>
    `).join('');

    root.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-base font-bold">✏️</div>
                        <div>
                            <h3 class="text-base font-extrabold text-slate-900">Edit Staff Member / Portal User</h3>
                            <p class="text-[11px] text-slate-500">Update account credentials, RBAC role, client assignment, or status.</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition">✕</button>
                </div>
                <form onsubmit="submitEditUser(event, '${u.id}')" class="space-y-3.5 text-xs">
                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Full Name <span class="text-rose-500">*</span></label>
                        <input type="text" id="usr-edit-name" value="${u.name ? u.name.replace(/"/g, '&quot;') : ''}" required class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition">
                    </div>
                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Corporate / Login Email <span class="text-rose-500">*</span></label>
                        <input type="email" id="usr-edit-email" value="${u.email ? u.email.replace(/"/g, '&quot;') : ''}" required class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-700 mb-1 font-bold">Assigned Role <span class="text-rose-500">*</span></label>
                            <select id="usr-edit-role" onchange="toggleClientDropdown(this.value, 'usr-edit-client-container')" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 transition">
                                <option value="PRODUCTION" ${u.role === 'PRODUCTION' ? 'selected' : ''}>🧪 Production Supervisor</option>
                                <option value="WAREHOUSE" ${u.role === 'WAREHOUSE' ? 'selected' : ''}>🚚 Logistics & Warehouse</option>
                                <option value="ACCOUNTING" ${u.role === 'ACCOUNTING' ? 'selected' : ''}>💰 Senior Accountant</option>
                                <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>👑 Operations Manager</option>
                                ${isCurrentUserSuperAdmin ? `<option value="SUPER_ADMIN" ${u.role === 'SUPER_ADMIN' ? 'selected' : ''}>🛡️ Executive Super Admin</option>` : ''}
                                <option value="CLIENT" ${u.role === 'CLIENT' ? 'selected' : ''}>🏢 B2B Client Portal</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-700 mb-1 font-bold">Account Status <span class="text-rose-500">*</span></label>
                            <select id="usr-edit-status" ${isSelf ? 'disabled' : ''} class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 transition">
                                <option value="1" ${u.is_active ? 'selected' : ''}>● Active</option>
                                <option value="0" ${!u.is_active ? 'selected' : ''}>○ Deactivated</option>
                            </select>
                            ${isSelf ? '<p class="text-[10px] text-amber-600 mt-0.5 font-medium">Cannot deactivate yourself</p>' : ''}
                        </div>
                    </div>
                    <div id="usr-edit-client-container" style="display: ${u.role === 'CLIENT' ? 'block' : 'none'};" class="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1">
                        <label class="block text-blue-900 font-bold">Link to Client Company <span class="text-rose-500">*</span></label>
                        <select id="usr-edit-client-id" class="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-slate-800">
                            ${clientOptions ? clientOptions : '<option value="">No clients found - create a client first</option>'}
                        </select>
                    </div>
                    <div class="pt-2 border-t border-slate-100">
                        <label class="block text-slate-700 mb-1 font-bold">New Password <span class="text-slate-400 font-normal">(Optional)</span></label>
                        <input type="password" id="usr-edit-pwd" placeholder="Leave blank to keep existing password" minlength="8" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition">
                        <p class="text-[10px] text-slate-400 mt-1">Leave blank to retain current password. If updating, minimum 8 characters.</p>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">Cancel</button>
                        <button type="submit" id="btn-edit-user-submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitEditUser(e, userId) {
    e.preventDefault();
    const name = document.getElementById('usr-edit-name')?.value.trim();
    const email = document.getElementById('usr-edit-email')?.value.trim();
    const role = document.getElementById('usr-edit-role')?.value;
    const client_id = role === 'CLIENT' ? document.getElementById('usr-edit-client-id')?.value : null;
    const is_active_el = document.getElementById('usr-edit-status');
    const is_active = is_active_el ? parseInt(is_active_el.value, 10) : 1;
    const password = document.getElementById('usr-edit-pwd')?.value.trim();

    if (!name || !email || !role) {
        NKB.showToast('Name, email, and role are required.', 'error');
        return;
    }

    if (role === 'CLIENT' && !client_id) {
        NKB.showToast('Please select a client company for client portal users.', 'error');
        return;
    }

    if (password && password.length < 8) {
        NKB.showToast('New password must be at least 8 characters long.', 'error');
        return;
    }

    const submitBtn = document.getElementById('btn-edit-user-submit');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving...';
    }

    try {
        const payload = { name, email, role, is_active, client_id };
        if (password) payload.password = password;

        const res = await NKB.api(`/api/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        if (res.success) {
            NKB.showToast(`User ${name} updated successfully!`, 'success');
            closeModal();
            loadUsers();
        } else {
            NKB.showToast(res.message || res.error || 'Failed to update user.', 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Save Changes';
            }
        }
    } catch (err) {
        NKB.showToast('Network error while updating user.', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save Changes';
        }
    }
}

async function toggleUserStatus(userId, currentStatus) {
    const newStatus = currentStatus === 1 ? 0 : 1;
    const actionName = newStatus === 1 ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${actionName} this user account?`)) return;

    const res = await NKB.api(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: newStatus })
    });

    if (res.success) {
        NKB.showToast(`User status updated to ${newStatus === 1 ? 'Active' : 'Deactivated'}.`, 'success');
        loadUsers();
    } else {
        NKB.showToast(res.message || res.error || 'Failed to update user status.', 'error');
    }
}

async function promptResetUserPassword(userId, email) {
    const newPwd = prompt(`Enter new secure password for ${email} (minimum 8 characters):`);
    if (!newPwd) return;
    if (newPwd.length < 8) {
        alert('Password must be at least 8 characters long.');
        return;
    }

    const res = await NKB.api(`/api/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPwd })
    });

    if (res.success) {
        NKB.showToast(`Password reset successfully for ${email}.`, 'success');
    } else {
        NKB.showToast(res.message || res.error || 'Failed to reset password.', 'error');
    }
}

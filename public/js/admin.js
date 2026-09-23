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
        'IT_ADMIN': { title: 'IT Administrator', badge: 'bg-cyan-900/80 text-cyan-300 border-cyan-700/50' },
        'CEO': { title: 'Chief Executive Officer', badge: 'bg-purple-900/80 text-purple-300 border-purple-700/50' },
        'QC': { title: 'Quality Control Inspector', badge: 'bg-teal-900/80 text-teal-300 border-teal-700/50' },
        'ADMIN': { title: 'Operations Manager', badge: 'bg-indigo-900/80 text-indigo-300 border-indigo-700/50' },
        'PURCHASING': { title: 'Purchasing Department', badge: 'bg-emerald-900/80 text-emerald-300 border-emerald-700/50' },
        'PRODUCTION': { title: 'Production Supervisor', badge: 'bg-amber-900/80 text-amber-300 border-amber-700/50' },
        'WAREHOUSE': { title: 'Logistics & Warehouse', badge: 'bg-purple-900/80 text-purple-300 border-purple-700/50' },
        'ACCOUNTING': { title: 'Senior Accountant', badge: 'bg-emerald-900/80 text-emerald-300 border-emerald-700/50' },
        'INVENTORY': { title: 'Inventory Officer', badge: 'bg-teal-900/80 text-teal-300 border-teal-700/50' }
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

    if (role === 'INVENTORY') {
        // Inventory role: No new tab created, focused directly on Orders with SO copy, confirmation, and supplies request
        hideTab('dashboard');
        hideTab('job-orders');
        hideTab('production');
        hideTab('deliveries');
        hideTab('invoices');
        hideTab('payments');
        hideTab('buffer');
        hideTab('clients');
        hideTab('products');
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        switchTab('orders');
    } else if (role === 'PURCHASING') {
        hideTab('dashboard');
        hideTab('job-orders');
        hideTab('production');
        hideTab('deliveries');
        hideTab('invoices');
        hideTab('payments');
        hideTab('buffer');
        hideTab('clients');
        hideTab('products');
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        switchTab('purchasing');
    } else if (role === 'QC') {
        hideTab('invoices');
        hideTab('payments');
        hideTab('clients');
        hideTab('users');
        hideTab('audit');
        hideTab('purchasing');
        switchTab('production');
    } else if (role === 'PRODUCTION') {
        // PRODUCTION role now manages deliveries alongside ADMIN and WAREHOUSE
        hideTab('invoices');
        hideTab('payments');
        hideTab('buffer');
        hideTab('users');
        hideTab('audit');
    } else if (role === 'WAREHOUSE') {
        hideTab('orders');
        hideTab('job-orders');
        hideTab('production');
        hideTab('invoices');
        hideTab('payments');
        hideTab('users');
        hideTab('audit');
    } else if (role === 'ACCOUNTING') {
        hideTab('job-orders');
        hideTab('production');
        // Deliveries tab is visible for Accounting to record client receiving and issue invoices
        hideTab('users');
        hideTab('audit');
    } else if (role === 'CEO' || role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'IT_ADMIN') {
        // Full oversight
    }

    // Proprietary chemical formulations are strictly confidential trade secrets
    const canViewFormulations = ['SUPER_ADMIN', 'ADMIN', 'IT_ADMIN', 'CEO', 'PRODUCTION', 'INVENTORY'].includes(role);
    if (!canViewFormulations) {
        hideTab('formulations');
    }

    // Developer API Keys management restricted to technical & company executives
    const canManageApiKeys = ['SUPER_ADMIN', 'ADMIN', 'IT_ADMIN', 'CEO'].includes(role);
    if (!canManageApiKeys) {
        hideTab('apikeys');
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

// Mobile Sidebar Toggle
function toggleMobileSidebar(show) {
    const sidebar = document.getElementById('admin-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;
    const shouldOpen = (show !== undefined) ? !!show : !sidebar.classList.contains('sidebar-open');
    if (shouldOpen) {
        sidebar.classList.add('sidebar-open');
        if (backdrop) backdrop.classList.remove('hidden');
    } else {
        sidebar.classList.remove('sidebar-open');
        if (backdrop) backdrop.classList.add('hidden');
    }
}
window.toggleMobileSidebar = toggleMobileSidebar;

// Tab Switching
function switchTab(tabId) {
    toggleMobileSidebar(false);
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
    else if (tabId === 'formulations') loadFormulations();
    else if (tabId === 'users') loadUsers();
    else if (tabId === 'purchasing') loadPurchasingRequisitions();
    else if (tabId === 'reports') loadReports();
    else if (tabId === 'audit') loadAuditLogs();
    else if (tabId === 'apikeys') loadApiKeys();
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
        setElText('kpi-ongoing-deliveries', NKB.formatNumber(d.ongoingDeliveries || 0));
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
                <td class="py-3 px-4 font-bold text-slate-800">${(dr.is_vyuceutical_ops === 1 || (dr.company_name && dr.company_name.toLowerCase().includes('vyuceutical'))) ? `Vyuceutical OPC - ${dr.contact_person || dr.company_name}` : dr.company_name}</td>
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
        const userRole = NKB.user ? NKB.user.role : '';
        const isExecAdmin = ['ADMIN', 'SUPER_ADMIN', 'IT_ADMIN'].includes(userRole);
        const canViewPrices = isExecAdmin || ['CEO', 'ACCOUNTING'].includes(userRole);
        const canEditOrder = isExecAdmin || userRole === 'ACCOUNTING';
        const canConfirmAccounting = isExecAdmin || userRole === 'ACCOUNTING';
        const canConfirmInventory = isExecAdmin || userRole === 'INVENTORY';
        const canManageProduction = isExecAdmin || userRole === 'PRODUCTION' || userRole === 'WAREHOUSE';

        tbody.innerHTML = res.data.map(po => {
            const itemsList = (po.items && po.items.length > 0)
                ? po.items.map(it => {
                    const hasJO = it.jo_number;
                    return `
                    <div class="flex flex-col gap-1 text-[11px] bg-slate-50 hover:bg-slate-100/70 p-2 rounded-xl border border-slate-200 transition mb-1 last:mb-0">
                        <div class="flex items-center justify-between gap-2">
                            <div class="truncate max-w-[140px]">
                                <span class="font-black text-slate-950 text-xs block truncate" title="${it.product_name}">${it.product_name}</span>
                                <span class="text-[10px] text-indigo-900 font-mono font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 inline-block mt-0.5">${it.sku}</span>
                            </div>
                            <div class="text-right font-mono flex-shrink-0">
                                <span class="font-black text-slate-950 text-xs block">${NKB.formatNumber(it.target_quantity)} ${it.unit || 'pcs'}</span>
                                ${canViewPrices && it.unit_price !== null && it.unit_price !== undefined ? `
                                    <span class="text-[10px] text-emerald-900 font-bold font-mono">@ ₱${Number(it.unit_price).toFixed(2)}</span>
                                ` : ''}
                            </div>
                        </div>
                        <div class="pt-1 border-t border-slate-200/60 flex justify-between items-center text-[10px]">
                            <span class="text-slate-500 font-bold">Status:</span>
                            ${it.dr_number ? `
                                <span class="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono font-bold text-[9.5px]" title="Dispatched on Delivery Receipt ${it.dr_number}">🚚 ${it.dr_number}</span>
                            ` : it.batch_number ? `
                                <span class="px-1.5 py-0.2 bg-purple-50 text-purple-700 border border-purple-200 rounded font-mono font-bold text-[9.5px]" title="Batched and ready for delivery">✓ ${it.batch_number} (Batched)</span>
                            ` : hasJO ? `
                                <span class="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-mono font-bold text-[9.5px]" title="Job Order active (Product being made in factory)">🏭 ${it.jo_number} (Making)</span>
                            ` : `
                                <span class="px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded font-mono text-[9.5px]">Pending JO</span>
                            `}
                        </div>
                    </div>
                `}).join('')
                : '<span class="text-slate-400 italic text-[11px]">No items recorded</span>';

            const totalItemsCount = po.items ? po.items.length : 0;
            const allJOsStarted = totalItemsCount > 0 && (po.jo_count >= totalItemsCount);
            const allBatchesStarted = totalItemsCount > 0 && po.items && po.items.every(it => it.batch_number);
            const allDispatched = totalItemsCount > 0 && po.items && po.items.every(it => it.dr_number);
            const isVoided = po.status === 'VOIDED';

            return `
            <tr class="hover:bg-slate-50 transition ${isVoided ? 'opacity-60 bg-rose-50/20' : ''}">
                <td class="py-3 px-4 font-bold text-indigo-600 cursor-pointer hover:underline whitespace-nowrap" onclick="openViewPOModal('${po.id}')" title="Click to view full PO details">
                    ${po.po_number}
                </td>
                <td class="py-3 px-4 text-slate-600 whitespace-nowrap">
                    <div class="font-medium text-slate-800">${NKB.formatDate(po.po_date)}</div>
                </td>
                <td class="py-3 px-4 font-bold text-slate-800">${(po.is_vyuceutical_ops === 1 || (po.company_name && po.company_name.toLowerCase().includes('vyuceutical'))) ? `<span class="text-purple-900 font-extrabold">Vyuceutical OPC - ${po.contact_person || po.company_name}</span>` : po.company_name}</td>
                <td class="py-3 px-4">
                    <div class="space-y-1 w-64 max-h-28 overflow-y-auto pr-1">
                        ${itemsList}
                    </div>
                </td>
                <td class="py-3 px-4 whitespace-nowrap"><span class="badge bg-slate-100 text-slate-700">±${po.tolerance_percent}%</span></td>
                <td class="py-3 px-4 whitespace-nowrap">
                    <div><span class="badge ${po.billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}">${po.billing_policy}</span></div>
                    <div class="mt-1">
                        <span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-800 border border-blue-200 inline-flex items-center gap-1" title="Term of Payment: ${po.form_of_payment || 'COD'}">
                            💳 ${po.form_of_payment || 'COD'}
                        </span>
                    </div>
                </td>
                <td class="py-3 px-4 font-black text-slate-950 whitespace-nowrap font-mono">${NKB.formatNumber(po.total_target_quantity)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-slate-900 whitespace-nowrap font-mono">${canViewPrices && po.grand_total !== null && po.grand_total !== undefined ? NKB.formatCurrency(po.grand_total) : '—'}</td>
                <td class="py-3 px-4 whitespace-nowrap">
                    <div>${NKB.renderStatusBadge(po.status)}</div>
                    ${po.accounting_confirmed === 1 ? `
                        <div class="mt-1">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1" title="Confirmed by Accounting on ${po.accounting_confirmed_at ? NKB.formatDate(po.accounting_confirmed_at) : 'N/A'}">
                                💳 Acct Confirmed
                            </span>
                        </div>
                    ` : `
                        <div class="mt-1">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                                ⏳ Acct Pending
                            </span>
                        </div>
                    `}
                    ${po.raw_materials_status === 'SUPPLIES_REQUESTED' ? `
                        <div class="mt-1">
                            <button onclick="viewSupplyRequestsModal('${po.id}', '${po.po_number}')" class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 transition inline-flex items-center gap-1" title="Click to view supply requisition submitted to Purchasing Dept">
                                ⚠️ Supplies Needed (${po.supply_requests_count || 1})
                            </button>
                        </div>
                    ` : po.inventory_confirmed === 1 ? `
                        <div class="mt-1">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800 border border-teal-300 inline-flex items-center gap-1" title="Raw Materials Confirmed Sufficient on ${po.inventory_confirmed_at ? NKB.formatDate(po.inventory_confirmed_at) : 'N/A'}">
                                ✓ Materials Confirmed
                            </span>
                        </div>
                    ` : `
                        <div class="mt-1">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
                                ⏳ Materials Pending
                            </span>
                        </div>
                    `}
                </td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openViewPOModal('${po.id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="View Full Order Info">
                        <span>👁️ View</span>
                    </button>
                    <a href="/print-po.html?id=${po.id}" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Print Purchase Order">
                        <span>🖨️ PO</span>
                    </a>
                    <a href="/print-jo.html?po_id=${po.id}" class="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Print Sales Order Copy (2 Portrait Slips on A4 Landscape)">
                        <span>📄 SO Copy</span>
                    </a>
                    ${(po.accounting_confirmed === 1 || po.formulation_converted === 1) ? `
                        <a href="/print-formulation-receipt.html?id=${po.id}" target="_blank" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Print Formulation & Raw Material Breakdown Receipt">
                            <span>🧪 Formulation Receipt</span>
                        </a>
                    ` : ''}
                    ${(canConfirmAccounting && !po.accounting_confirmed && po.status !== 'CANCELLED' && po.status !== 'VOIDED') ? `
                        <button onclick="confirmAccountingPO('${po.id}', '${po.po_number}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm" title="Confirm order financing & payment terms">
                            <span>💳 Confirm (Accounting)</span>
                        </button>
                    ` : ''}
                    ${(canConfirmInventory && !po.inventory_confirmed && po.status !== 'CANCELLED' && po.status !== 'VOIDED') ? `
                        ${po.accounting_confirmed === 1 ? `
                            <button onclick="confirmInventoryPO('${po.id}', '${po.po_number}')" class="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm" title="Confirm sufficient raw materials exist for manufacturing">
                                <span>✅ Confirm Raw Materials</span>
                            </button>
                        ` : `
                            <button disabled class="px-2.5 py-1 bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed rounded-lg text-xs font-medium inline-flex items-center gap-1" title="Order must first be confirmed by Accounting Department">
                                <span>⏳ Awaiting Acct Confirm</span>
                            </button>
                        `}
                    ` : ''}
                    ${(canConfirmInventory && po.status !== 'CANCELLED' && po.status !== 'VOIDED') ? `
                        <button onclick="openSupplyRequestModal('${po.id}', '${po.po_number}', '${(po.company_name || '').replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm" title="Submit requisition form to Purchasing Department for needed raw materials / supplies">
                            <span>📋 Request Supplies</span>
                        </button>
                    ` : ''}
                    ${(po.supply_requests_count > 0) ? `
                        <button onclick="viewSupplyRequestsModal('${po.id}', '${po.po_number}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="View submitted requisitions for Purchasing Dept">
                            <span>📜 View Requisitions (${po.supply_requests_count})</span>
                        </button>
                    ` : ''}
                    ${(canEditOrder && po.status !== 'COMPLETED' && po.status !== 'CANCELLED' && po.status !== 'VOIDED' && (!po.dr_count || po.dr_count === 0)) ? `
                        <button onclick="openEditPOModal('${po.id}')" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm" title="Update Purchase Order products, form of payment, and details">
                            <span>✏️ Update</span>
                        </button>
                    ` : ''}
                    ${(isExecAdmin && po.status === 'PENDING_APPROVAL') ? `
                        <button onclick="approvePO('${po.id}', '${po.po_number}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">
                            Approve
                        </button>
                    ` : ''}
                    ${(canManageProduction && (po.status === 'APPROVED' || po.status === 'IN_PRODUCTION' || po.status === 'PARTIALLY_DELIVERED')) ? `
                        ${!allJOsStarted ? `
                            <button onclick="openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name.replace(/'/g, "\\'")}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition inline-flex items-center gap-1.5 shadow-sm" title="Start Job Orders for all products in this order for ${po.company_name}">
                                <span>🏭 Start Job Order</span>
                            </button>
                        ` : !allBatchesStarted ? `
                            <button onclick="openCreateAllBatchesModal('${po.client_id}', '${po.id}', '${po.company_name.replace(/'/g, "\\'")}')" class="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition inline-flex items-center gap-1.5 shadow-md shadow-purple-600/20" title="Products are made. Click to record batch numbers and actual yield before delivering.">
                                <span>⚗️ Batch Products</span>
                            </button>
                        ` : !allDispatched ? `
                            <button onclick="openCreateAllDRModal('${po.client_id}', '${po.id}', '${po.company_name.replace(/'/g, "\\'")}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20" title="Batches are ready for delivery. Click to create Delivery Receipt.">
                                <span>🚚 Deliver (DR)</span>
                            </button>
                        ` : `
                            <span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold font-mono inline-flex items-center gap-1" title="All products have been dispatched on Delivery Receipts">
                                <span>✓ Dispatched</span>
                            </span>
                        `}
                    ` : ''}
                    ${(isExecAdmin && po.status !== 'VOIDED' && po.status !== 'CANCELLED' && po.status !== 'COMPLETED') ? `
                        <button onclick="voidPO('${po.id}', '${po.po_number}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm" title="Void Purchase Order ${po.po_number}">
                            <span>🚫 Void</span>
                        </button>
                    ` : ''}
                    ${(isExecAdmin && po.status === 'VOIDED') ? `
                        <button onclick="deletePO('${po.id}', '${po.po_number}')" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm" title="Permanently Delete Voided Order ${po.po_number}">
                            <span>🗑️ Delete</span>
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

async function confirmAccountingPO(id, poNumber) {
    const root = document.getElementById('modals-root');
    if (!root) return;

    // Fetch PO details to get current payment terms and client info
    const res = await NKB.api(`/api/orders/${id}`);
    const po = (res.success && res.data) ? res.data : null;
    const rawTerm = (po?.form_of_payment || po?.terms || 'COD').trim();
    const lowerRaw = rawTerm.toLowerCase();
    let selectedTerm = 'COD';
    let isCustom = false;
    if (lowerRaw === 'cod' || lowerRaw === 'cash on delivery' || lowerRaw === 'cod / bank transfer') {
        selectedTerm = 'COD';
    } else if (lowerRaw === '7d' || lowerRaw === '7 days' || lowerRaw === 'net 7' || lowerRaw === '7day') {
        selectedTerm = '7d';
    } else if (lowerRaw === '15d' || lowerRaw === '15 days' || lowerRaw === 'net 15' || lowerRaw === '15day') {
        selectedTerm = '15d';
    } else if (lowerRaw === '30d' || lowerRaw === '30 days' || lowerRaw === 'net 30' || lowerRaw === '30day') {
        selectedTerm = '30d';
    } else {
        selectedTerm = 'CUSTOM';
        isCustom = true;
    }

    const clientName = po ? (po.company_name || 'Client') : 'Client';
    const totalDisplay = (po && po.grand_total !== null && po.grand_total !== undefined) ? NKB.formatCurrency(po.grand_total) : '—';

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 my-auto">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="p-2 bg-emerald-100 text-emerald-700 rounded-xl text-lg">💳</span>
                        <div>
                            <h3 class="text-base font-bold text-slate-900">Confirm Order Financing</h3>
                            <p class="text-xs text-slate-500">Accounting Department Certification</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>

                <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div class="flex justify-between">
                        <span class="text-slate-500">PO Number:</span>
                        <span class="font-bold text-slate-900 font-mono">${poNumber}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Client:</span>
                        <span class="font-bold text-slate-900">${clientName}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Order Total:</span>
                        <span class="font-black text-emerald-700 font-mono">${totalDisplay}</span>
                    </div>
                </div>

                <form onsubmit="submitAccountingConfirm(event, '${id}', '${poNumber}')" class="space-y-4 text-xs font-semibold">
                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Term of Payment *</label>
                        <select id="acct-confirm-po-form-of-payment" onchange="toggleCustomPOTerm('acct-confirm')" class="w-full px-3 py-2 border rounded-xl bg-white font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500">
                            <option value="COD" ${selectedTerm === 'COD' ? 'selected' : ''}>COD (Cash on Delivery)</option>
                            <option value="7d" ${selectedTerm === '7d' ? 'selected' : ''}>7d (7 Days)</option>
                            <option value="15d" ${selectedTerm === '15d' ? 'selected' : ''}>15d (15 Days)</option>
                            <option value="30d" ${selectedTerm === '30d' ? 'selected' : ''}>30d (30 Days)</option>
                            <option value="CUSTOM" ${isCustom ? 'selected' : ''}>Custom Term...</option>
                        </select>
                        <input type="text" id="acct-confirm-po-form-of-payment-custom" value="${isCustom ? rawTerm.replace(/"/g, '&quot;') : ''}" placeholder="e.g. 50% DP, 50% upon delivery..." class="${isCustom ? '' : 'hidden'} mt-1.5 w-full px-3 py-1.5 border rounded-lg bg-white text-xs font-medium text-slate-900">
                    </div>

                    <p class="text-[11px] text-slate-500 leading-relaxed">
                        By confirming, you certify that client credit, payment terms, and order financing are verified. This authorizes raw materials confirmation and factory manufacturing.
                    </p>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 border rounded-xl text-slate-600 hover:bg-slate-50">Cancel</button>
                        <button type="submit" id="btn-submit-acct-confirm" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5">
                            <span>💳 Confirm Financing</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitAccountingConfirm(e, id, poNumber) {
    e.preventDefault();
    const termSelect = document.getElementById('acct-confirm-po-form-of-payment');
    let formOfPayment = termSelect ? termSelect.value : 'COD';
    if (formOfPayment === 'CUSTOM') {
        const customInput = document.getElementById('acct-confirm-po-form-of-payment-custom');
        formOfPayment = customInput ? (customInput.value.trim() || 'COD') : 'COD';
    }

    const btn = document.getElementById('btn-submit-acct-confirm');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Confirming...';
    }

    const res = await NKB.api(`/api/orders/${id}/accounting-confirm`, {
        method: 'POST',
        body: JSON.stringify({ form_of_payment: formOfPayment })
    });

    if (res.success) {
        NKB.showToast(`Purchase Order ${poNumber} confirmed by Accounting (${formOfPayment})!`, 'success');
        closeModal();
        loadOrders();
    } else {
        NKB.showToast(res.error || 'Failed to confirm order for Accounting.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>💳 Confirm Financing</span>';
        }
    }
}
window.confirmAccountingPO = confirmAccountingPO;
window.submitAccountingConfirm = submitAccountingConfirm;

if (!window.toggleCustomPOTerm) {
    window.toggleCustomPOTerm = function(prefix = 'edit') {
        const selectEl = document.getElementById(`${prefix}-po-form-of-payment`) || document.getElementById(`${prefix}-form-of-payment`);
        const customEl = document.getElementById(`${prefix}-po-form-of-payment-custom`) || document.getElementById(`${prefix}-form-of-payment-custom`);
        if (selectEl && customEl) {
            if (selectEl.value === 'CUSTOM') {
                customEl.classList.remove('hidden');
                customEl.focus();
            } else {
                customEl.classList.add('hidden');
            }
        }
    };
}

async function confirmInventoryPO(id, poNumber) {
    if (!confirm(`Confirm sufficient raw materials for Purchase Order ${poNumber}?\n\nThis certifies that sufficient chemicals, packaging, and raw materials exist in inventory for manufacturing.`)) return;
    const res = await NKB.api(`/api/orders/${id}/inventory-confirm`, { method: 'POST' });
    if (res.success) {
        NKB.showToast(`Raw materials confirmed for ${poNumber}! Order is ready for production.`, 'success');
        loadOrders();
    } else {
        NKB.showToast(res.error || 'Failed to confirm raw materials.', 'error');
    }
}

async function openSupplyRequestModal(poId, poNumber, companyName) {
    const root = document.getElementById('modals-root');
    if (!root) return;

    // Fetch PO details to get ordered items
    const res = await NKB.api(`/api/orders/${poId}`);
    const po = (res.success && res.data) ? res.data : null;
    const items = po?.items || [];

    root.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 text-base font-bold">📋</div>
                        <div>
                            <h3 class="text-base font-extrabold text-slate-900">Supply Requisition Form</h3>
                            <p class="text-[11px] text-slate-500">Request missing raw materials/supplies to Purchasing Department</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition">✕</button>
                </div>

                <div class="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl text-xs space-y-1">
                    <div class="flex justify-between">
                        <span class="text-amber-800 font-bold">PO Reference:</span>
                        <span class="font-mono font-extrabold text-amber-950">${poNumber}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-amber-800 font-bold">Client:</span>
                        <span class="font-bold text-amber-950">${companyName}</span>
                    </div>
                </div>

                <form onsubmit="submitSupplyRequest(event, '${poId}', '${poNumber}')" class="space-y-3.5 text-xs">
                    ${items.length > 0 ? `
                        <div>
                            <label class="block text-slate-700 mb-1.5 font-bold">Select Ordered Products Needing Supplies:</label>
                            <div class="max-h-32 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1.5 bg-slate-50">
                                ${items.map((it, idx) => `
                                    <label class="flex items-center gap-2 text-[11px] hover:bg-white p-1 rounded-lg transition cursor-pointer">
                                        <input type="checkbox" name="sr_product" value="${it.product_name} (${it.sku})" class="rounded text-amber-600 focus:ring-amber-500">
                                        <span class="font-black text-slate-950">${it.product_name}</span>
                                        <span class="text-[10px] font-mono text-indigo-900 font-bold bg-indigo-50 border border-indigo-200 px-1 rounded">${it.sku}</span>
                                        <span class="text-slate-900 ml-auto font-black font-mono">${NKB.formatNumber(it.target_quantity)} pcs</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Raw Materials & Supplies Needed <span class="text-rose-500">*</span></label>
                        <textarea id="sr-materials-needed" rows="3" required placeholder="Specify raw materials needed by Purchasing Dept (e.g. 5,000 pcs 50ml Amber Glass Dropper Bottles, 25kg Niacinamide Raw Powder, 5,000 pcs Gold Matte Pump Caps)..." class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition font-bold text-slate-900"></textarea>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-700 mb-1 font-bold">Urgency Level <span class="text-rose-500">*</span></label>
                            <select id="sr-urgency" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition">
                                <option value="NORMAL">Standard / Normal Requisition</option>
                                <option value="HIGH">High Priority (Tight Deadline)</option>
                                <option value="CRITICAL">🚨 Critical / Production Blocked</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-700 mb-1 font-bold">Target Needed By Date</label>
                            <input type="date" id="sr-target-date" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 transition">
                        </div>
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Additional Notes / Preferred Supplier</label>
                        <textarea id="sr-notes" rows="2" placeholder="Optional notes for Purchasing Department (e.g. check supplier X for available stock, rush courier)..." class="w-full px-3.5 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white text-slate-800"></textarea>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">Cancel</button>
                        <button type="submit" id="btn-submit-supply-request" class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-lg shadow-amber-600/20 transition flex items-center gap-1.5">
                            <span>📤</span><span>Submit to Purchasing Department</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitSupplyRequest(e, poId, poNumber) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-supply-request');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Submitting Requisition...';
    }

    const checkedBoxes = Array.from(document.querySelectorAll('input[name="sr_product"]:checked'));
    const affectedProducts = checkedBoxes.map(cb => cb.value).join(', ');
    const materialsNeeded = document.getElementById('sr-materials-needed')?.value || '';
    const urgency = document.getElementById('sr-urgency')?.value || 'NORMAL';
    const targetDate = document.getElementById('sr-target-date')?.value || '';
    const notes = document.getElementById('sr-notes')?.value || '';

    try {
        const res = await NKB.api(`/api/orders/${poId}/request-supplies`, {
            method: 'POST',
            body: {
                materials_needed: materialsNeeded,
                urgency,
                target_date: targetDate,
                notes,
                affected_products: affectedProducts
            }
        });

        if (res.success) {
            NKB.showToast(`Supply requisition submitted to Purchasing Department for ${poNumber}!`, 'success');
            closeModal();
            loadOrders();
        } else {
            NKB.showToast(res.error || 'Failed to submit supply requisition.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>📤</span><span>Submit to Purchasing Department</span>';
            }
        }
    } catch (err) {
        NKB.showToast('Network error while submitting requisition.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>📤</span><span>Submit to Purchasing Department</span>';
        }
    }
}

async function viewSupplyRequestsModal(poId, poNumber) {
    const root = document.getElementById('modals-root');
    if (!root) return;

    const res = await NKB.api(`/api/orders/${poId}/supply-requests`);
    const requests = (res.success && res.data) ? res.data : [];

    root.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 text-base font-bold">📜</div>
                        <div>
                            <h3 class="text-base font-extrabold text-slate-900">Purchasing Requisition History</h3>
                            <p class="text-[11px] text-slate-500">Supplies and raw materials requested for ${poNumber}</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition">✕</button>
                </div>

                ${requests.length === 0 ? `
                    <div class="p-8 text-center text-slate-400 font-medium">No requisitions submitted for this order yet.</div>
                ` : `
                    <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                        ${requests.map((r, idx) => `
                            <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                                <div class="flex justify-between items-center flex-wrap gap-2">
                                    <div class="flex items-center gap-2">
                                        <span class="px-2 py-0.5 rounded-lg text-[10px] font-black ${r.urgency === 'CRITICAL' ? 'bg-red-100 text-red-800 border border-red-300' : (r.urgency === 'HIGH' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-indigo-50 text-indigo-800 border border-indigo-200')}">
                                            ${r.urgency === 'CRITICAL' ? '🚨 CRITICAL' : (r.urgency === 'HIGH' ? '⚡ HIGH' : '● NORMAL')}
                                        </span>
                                        <span class="font-bold text-slate-900 text-xs">To: ${r.department || 'Purchasing Department'}</span>
                                    </div>
                                    <span class="text-[11px] text-slate-400 font-mono">${NKB.formatDate(r.created_at)}</span>
                                </div>
                                <div class="p-3 bg-white rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 whitespace-pre-line">
                                    ${r.materials_needed}
                                </div>
                                ${r.notes ? `
                                    <div class="text-[11px] text-slate-600 whitespace-pre-line pl-1">
                                        ${r.notes}
                                    </div>
                                ` : ''}
                                <div class="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                                    <span>Requested by: <strong class="text-slate-700">${r.requester_name || 'Inventory Officer'}</strong></span>
                                    <span>Target Date: <strong class="text-slate-700 font-mono">${r.target_date ? NKB.formatDate(r.target_date) : 'ASAP'}</strong></span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}

                <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">Close</button>
                </div>
            </div>
        </div>
    `;
}

window.confirmAccountingPO = confirmAccountingPO;
window.confirmInventoryPO = confirmInventoryPO;
window.openSupplyRequestModal = openSupplyRequestModal;
window.submitSupplyRequest = submitSupplyRequest;
window.viewSupplyRequestsModal = viewSupplyRequestsModal;

async function voidPO(id, poNumber) {
    if (!confirm(`Are you sure you want to VOID Purchase Order "${poNumber}"?\n\nThis will mark the order as VOIDED and automatically cancel any open Job Orders. This action cannot be undone.`)) {
        return;
    }
    const res = await NKB.api(`/api/orders/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Voided by user' })
    });
    if (res.success) {
        NKB.showToast(`Purchase Order ${poNumber} has been voided.`, 'success');
        if (typeof loadOrders === 'function') loadOrders();
        if (typeof loadDashboard === 'function') loadDashboard();
        if (typeof loadClientOrders === 'function') loadClientOrders();
        // If View PO modal is currently open for this PO, refresh it
        const root = document.getElementById('modals-root') || document.getElementById('client-modals-root');
        if (root && root.innerHTML.includes(poNumber) && typeof openViewPOModal === 'function') {
            await openViewPOModal(id);
        }

        // Offer immediate permanent deletion if desired
        const newNo = (res.data && res.data.po_number) ? res.data.po_number : poNumber;
        if (confirm(`Purchase Order "${poNumber}" is now VOIDED.\n\nWould you like to permanently delete it from the database right now?`)) {
            await deletePO(id, newNo);
        }
    } else {
        NKB.showToast(res.error || 'Failed to void Purchase Order.', 'error');
    }
}
window.voidPO = voidPO;

async function deletePO(id, poNumber) {
    if (!confirm(`Are you sure you want to PERMANENTLY delete Purchase Order "${poNumber}"?\n\nThis will completely remove this order and all its linked records from the database. This action cannot be undone.`)) {
        return;
    }
    const res = await NKB.api(`/api/orders/${id}`, { method: 'DELETE' });
    if (res.success) {
        NKB.showToast(res.message || `Purchase Order ${poNumber} permanently deleted.`, 'success');
        if (typeof loadOrders === 'function') loadOrders();
        if (typeof loadDashboard === 'function') loadDashboard();
        if (typeof loadClientOrders === 'function') loadClientOrders();
        if (typeof closeModal === 'function') closeModal();
    } else {
        NKB.showToast(res.error || 'Failed to delete Purchase Order.', 'error');
    }
}
window.deletePO = deletePO;

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

        filterJobOrders();
    } else {
        cachedJobOrders = [];
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">No job orders found.</td></tr>`;
    }
}

function renderJobOrdersTable(jobOrders) {
    const tbody = document.getElementById('table-jos-body');
    if (!tbody) return;

    if (!jobOrders || jobOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">No job orders found matching filter.</td></tr>`;
        return;
    }

    // Group job orders by Purchase Order (separating every order per PO regardless of brand)
    const grouped = new Map();
    jobOrders.forEach(jo => {
        const pkey = jo.po_id || jo.po_number || 'other';
        if (!grouped.has(pkey)) {
            const rawSo = (jo.po_number && jo.po_number.startsWith('PO-'))
                ? jo.po_number.replace('PO-', 'SO-')
                : (jo.so_number || 'SO-2026-000001');
            grouped.set(pkey, {
                poId: jo.po_id,
                poNumber: jo.po_number || 'Unlinked PO',
                soNumber: rawSo,
                clientId: jo.client_id,
                companyName: jo.company_name || 'Client',
                contactPerson: jo.contact_person || '',
                is_vyuceutical_ops: jo.is_vyuceutical_ops,
                dateEncoded: jo.po_created_at || jo.created_at,
                poDate: jo.po_date,
                items: []
            });
        }
        grouped.get(pkey).items.push(jo);
    });

    // Sort PO groups by date encoded (Newest Encoded first by default)
    const sortVal = document.getElementById('filter-jo-sort')?.value || 'date_desc';
    const groupsArray = Array.from(grouped.values());
    groupsArray.sort((a, b) => {
        const timeA = new Date(a.dateEncoded || 0).getTime();
        const timeB = new Date(b.dateEncoded || 0).getTime();
        return sortVal === 'date_asc' ? (timeA - timeB) : (timeB - timeA);
    });

    let html = '';
    groupsArray.forEach(group => {
        const totalQty = group.items.reduce((sum, j) => sum + (j.target_quantity || 0), 0);
        const poNumber = group.poNumber || '';
        // Strict tally: SO must always tally with PO number
        const clientSO = (poNumber && poNumber.startsWith('PO-')) ? poNumber.replace('PO-', 'SO-') : group.soNumber;
        const pendingBatchItems = group.items.filter(j => !j.batch_count || j.batch_count === 0);
        const allBatchesStarted = group.items.length > 0 && pendingBatchItems.length === 0;
        const allDispatched = group.items.length > 0 && group.items.every(j => j.latest_dr_number);
        const isGroupVyu = group.is_vyuceutical_ops === 1 || (group.companyName && group.companyName.toLowerCase().includes('vyuceutical'));
        const groupDisplayName = isGroupVyu ? `Vyuceutical OPC - ${group.contactPerson || group.companyName}` : group.companyName;
        const encodedDateFormatted = group.dateEncoded ? NKB.formatDate(group.dateEncoded) : (group.poDate ? NKB.formatDate(group.poDate) : 'N/A');

        html += `
            <!-- PO Order Group Banner Row (Separated per PO) -->
            <tr class="bg-indigo-50/80 border-t-2 border-indigo-200">
                <td colspan="7" class="py-2.5 px-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-2.5">
                            <span class="text-base">📦</span>
                            <div>
                                <span class="font-black text-sm text-slate-900 font-mono">${poNumber}</span>
                                <span class="ml-2 px-2.5 py-0.5 bg-indigo-100/90 text-indigo-800 font-mono font-bold text-xs rounded-lg border border-indigo-200" title="Sales Order Number tallied to this PO">SO: ${clientSO}</span>
                                <span class="ml-2 font-bold text-xs text-slate-700">(${groupDisplayName})</span>
                                <span class="text-[11px] text-indigo-700 font-semibold ml-2">
                                    • Encoded: ${encodedDateFormatted} 
                                    • ${group.items.length} Product${group.items.length > 1 ? 's' : ''} (${NKB.formatNumber(totalQty)} pcs)
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <a href="/print-jo.html?po_id=${group.poId}&client_id=${group.clientId}" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm" title="Print Job Order / Sales Order for ${poNumber} (${clientSO}) (2 Portrait Copies on A4 Landscape)">
                                <span>🖨️ Print PO JO/SO</span>
                            </a>
                            ${!allBatchesStarted ? `
                                <button onclick="openCreateAllBatchesModal('${group.clientId}', '${group.poId}', '${(group.companyName || '').replace(/'/g, "\\'")}')" class="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition inline-flex items-center gap-1.5 shadow-md shadow-purple-600/20" title="Products are made. Click to record batch numbers and actual yield before delivering.">
                                <span>⚗️ Batch All Products</span>
                                </button>
                            ` : !allDispatched ? `
                                <button onclick="openCreateAllDRModal('${group.clientId}', '${group.poId}', '${(group.companyName || '').replace(/'/g, "\\'")}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20" title="Batches are ready for delivery. Click to create Delivery Receipt.">
                                <span>🚚 Deliver All Products (DR)</span>
                                </button>
                            ` : `
                                <span class="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold font-mono inline-flex items-center gap-1.5">
                                    <span>✓ All Products Dispatched</span>
                                </span>
                            `}
                        </div>
                    </div>
                </td>
            </tr>
        `;

        // Product Job Order rows under this PO (regardless of brand)
        group.items.forEach(jo => {
            const hasBatch = jo.batch_count > 0;
            const hasDR = !!jo.latest_dr_number;
            const itemSO = (jo.po_number && jo.po_number.startsWith('PO-')) ? jo.po_number.replace('PO-', 'SO-') : clientSO;
            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-b-2">
                <td class="py-3 px-4 font-bold text-indigo-600 font-mono">${jo.jo_number}</td>
                <td class="py-3 px-4">
                    <button onclick="openViewPOModal('${jo.po_id}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline" title="View Purchase Order Details">
                        ${jo.po_number}
                    </button>
                </td>
                <td class="py-3 px-4">
                    <span class="font-black text-slate-950 text-xs">${jo.product_name}</span>
                    ${jo.sku ? `<div class="mt-0.5"><span class="text-[10px] text-indigo-900 font-mono font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 inline-block">SKU: ${jo.sku}</span></div>` : ''}
                </td>
                <td class="py-3 px-4 font-black text-slate-950 font-mono">${NKB.formatNumber(jo.target_quantity)} pcs</td>
                <td class="py-3 px-4 text-slate-600 font-medium">${jo.assigned_team || 'Team Alpha'}</td>
                <td class="py-3 px-4">
                    ${jo.status === 'COMPLETED' ? `
                        <span class="badge bg-emerald-50 text-emerald-700 border border-emerald-200">Product Made & Batched</span>
                    ` : jo.status === 'IN_PRODUCTION' ? `
                        <span class="badge bg-indigo-50 text-indigo-700 border border-indigo-200">Making Product</span>
                    ` : NKB.renderStatusBadge(jo.status)}
                </td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openViewPOModal('${jo.po_id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition" title="View Purchase Order Details">
                        👁️ View PO
                    </button>
                    <a href="/print-jo.html?po_id=${jo.po_id}&client_id=${jo.client_id}" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Print PO Job Order / Sales Order (${itemSO}) (2 Portrait Copies on A4 Landscape)">
                        🖨️ Print
                    </a>
                    ${hasDR ? `
                        <span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold font-mono inline-flex items-center gap-1" title="Dispatched on Delivery Receipt ${jo.latest_dr_number}">
                            <span>🚚 ${jo.latest_dr_number}</span>
                        </span>
                    ` : hasBatch ? `
                        <button onclick="openCreateDRModal('${jo.po_number}', '${jo.jo_number}', '${jo.latest_batch_id}', '${jo.latest_batch_number}', ${jo.total_yield || jo.target_quantity}, '${(jo.product_name || '').replace(/'/g, "\\'")}', '${jo.client_id}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Batch ${jo.latest_batch_number} ready. Click to create Delivery Receipt.">
                            <span>🚚 Dispatch / DR</span>
                        </button>
                    ` : `
                        <button onclick="openCreateBatchModal('${jo.id}', '${jo.jo_number}', ${jo.target_quantity}, '${(jo.product_name || '').replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Product is made. Click to record batch & yield before delivering.">
                            <span>⚗️ Batch Product</span>
                        </button>
                    `}
                </td>
            </tr>
            `;
        });
    });

    tbody.innerHTML = html;
}

function filterJobOrders() {
    const searchVal = (document.getElementById('filter-jo-search')?.value || '').toLowerCase().trim();
    const clientVal = document.getElementById('filter-jo-client')?.value || '';
    const statusVal = document.getElementById('filter-jo-status')?.value || '';

    let filtered = cachedJobOrders;

    if (clientVal) {
        filtered = filtered.filter(j => j.client_id === clientVal);
    }
    if (statusVal) {
        filtered = filtered.filter(j => (j.status || '').toUpperCase() === statusVal.toUpperCase());
    }
    if (searchVal) {
        filtered = filtered.filter(j => {
            const joNum = (j.jo_number || '').toLowerCase();
            const poNum = (j.po_number || '').toLowerCase();
            const soNum = (j.so_number || (j.po_number ? j.po_number.replace('PO-', 'SO-') : '')).toLowerCase();
            const prodName = (j.product_name || '').toLowerCase();
            const sku = (j.sku || '').toLowerCase();
            const clientName = (j.company_name || '').toLowerCase();
            const contactPerson = (j.contact_person || '').toLowerCase();
            const team = (j.assigned_team || '').toLowerCase();
            return joNum.includes(searchVal) ||
                   poNum.includes(searchVal) ||
                   soNum.includes(searchVal) ||
                   prodName.includes(searchVal) ||
                   sku.includes(searchVal) ||
                   clientName.includes(searchVal) ||
                   contactPerson.includes(searchVal) ||
                   team.includes(searchVal);
        });
    }

    renderJobOrdersTable(filtered);
}

function filterJobOrdersByClient() {
    filterJobOrders();
}

function printJobOrdersForSelectedClient() {
    const sel = document.getElementById('filter-jo-client');
    const cid = sel ? sel.value : '';
    if (cid) {
        window.location.href = `/print-jo.html?client_id=${cid}`;
    } else {
        window.location.href = '/print-jo.html?all=1';
    }
}

window.loadJobOrders = loadJobOrders;
window.renderJobOrdersTable = renderJobOrdersTable;
window.filterJobOrders = filterJobOrders;
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

    const userRole = NKB.user?.role;
    const canInvoice = ['ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'CEO'].includes(userRole);
    const canReceive = ['ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'CEO'].includes(userRole);
    const canEditDispatch = ['ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'PRODUCTION', 'WAREHOUSE'].includes(userRole);

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(dr => {
            const hasItems = Array.isArray(dr.items) && dr.items.length > 0;
            const progressHtml = hasItems ? dr.items.map(it => {
                const itemDelivered = it.delivered_quantity || 0;
                const itemTarget = it.po_target_quantity || itemDelivered;
                const itemCumul = it.cumulative_delivered_quantity || itemDelivered;
                const isPartial = itemCumul < itemTarget;
                const label = isPartial ? `Initial: ${NKB.formatNumber(itemDelivered)} pcs` : 'Completed Delivery';
                return NKB.renderDeliveryProgressBar(itemCumul, itemTarget, {
                    itemName: it.product_name,
                    batchNumber: it.batch_number,
                    label
                });
            }).join('') : NKB.renderDeliveryProgressBar(dr.po_delivered_total || dr.total_delivered, dr.po_total_target || dr.total_delivered, {
                label: ((dr.po_delivered_total || dr.total_delivered) < (dr.po_total_target || dr.total_delivered) ? `Initial: ${NKB.formatNumber(dr.total_delivered)} pcs` : 'Completed Delivery')
            });

            return `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">
                    <div class="font-mono text-sm">${dr.dr_number}</div>
                    ${dr.so_number ? `<div class="text-[10px] text-slate-500 font-mono font-bold mt-0.5">SO: ${dr.so_number}</div>` : ''}
                </td>
                <td class="py-3 px-4 text-slate-600 whitespace-nowrap">${NKB.formatDate(dr.delivery_date)}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${(dr.is_vyuceutical_ops === 1 || (dr.company_name && dr.company_name.toLowerCase().includes('vyuceutical'))) ? `<span class="text-purple-900 font-extrabold">Vyuceutical OPC - ${dr.contact_person || dr.company_name}</span>` : dr.company_name}</td>
                <td class="py-3 px-4 whitespace-nowrap">
                    <button onclick="openViewPOModal('${dr.po_id}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline block" title="View Purchase Order Details">
                        ${dr.po_number}
                    </button>
                    ${dr.so_number ? `<span class="text-[10px] font-mono text-slate-500 font-semibold">SO: ${dr.so_number}</span>` : ''}
                </td>
                <td class="py-3 px-4 min-w-[220px]">
                    ${progressHtml}
                </td>
                <td class="py-3 px-4 font-extrabold text-emerald-700 whitespace-nowrap">${dr.total_accepted > 0 ? NKB.formatNumber(dr.total_accepted) + ' pcs' : '-'}</td>
                <td class="py-3 px-4 font-bold text-rose-600 whitespace-nowrap">${dr.total_rejected > 0 ? NKB.formatNumber(dr.total_rejected) + ' pcs' : '0'}</td>
                <td class="py-3 px-4 whitespace-nowrap">${NKB.renderStatusBadge(dr.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openViewDRModal('${dr.id}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-block" title="View Delivery Receipt Details">
                        🔍 Details
                    </button>
                    <button onclick="openViewPOModal('${dr.po_id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block" title="View Purchase Order Details">
                        👁️ View PO
                    </button>
                    <a href="/print-dr.html?id=${dr.id}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block">
                        🖨️ Print
                    </a>
                    ${(dr.status !== 'ACCEPTED' && dr.status !== 'INVOICED' && dr.status !== 'CANCELLED') ? `
                        ${canReceive ? `
                            <button onclick="openClientReceivingModal('${dr.id}')" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition inline-block shadow-sm" title="Record Client Receiving & Acceptance">
                                📥 Receive Product
                            </button>
                        ` : ''}
                        ${canEditDispatch ? `
                            <button onclick="openEditDRModal('${dr.id}')" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition inline-block" title="Edit Dispatch Details">
                                ✏️ Edit
                            </button>
                        ` : ''}
                    ` : ''}
                    ${dr.status === 'ACCEPTED' ? `
                        ${canInvoice ? `
                            <button onclick="openGenerateInvoiceModal('${dr.id}', '${dr.dr_number}', '${dr.company_name}', ${dr.total_accepted})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm">
                                ⚡ Invoice
                            </button>
                        ` : `
                            <span class="text-[11px] text-slate-400 italic px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg inline-block">Awaiting Accounting Invoice</span>
                        `}
                    ` : ''}
                </td>
            </tr>
            `;
        }).join('');
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
                <td class="py-3 px-4 font-bold text-slate-800">${(si.is_vyuceutical_ops === 1 || (si.company_name && si.company_name.toLowerCase().includes('vyuceutical'))) ? `<span class="text-purple-900 font-extrabold">Vyuceutical OPC - ${si.contact_person || si.company_name}</span>` : si.company_name}</td>
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
                    <a href="/print-invoice.html?id=${si.id}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block">
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
            <td class="py-3 px-4">
                <div class="font-mono text-slate-700 text-xs font-semibold">${p.reference_number || '—'}</div>
                ${p.notes ? `<div class="text-[11px] text-slate-500 italic mt-0.5 flex items-start gap-1"><span class="text-amber-600 font-bold">📝</span> <span class="break-words">${p.notes}</span></div>` : ''}
            </td>
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
            (p.notes && p.notes.toLowerCase().includes(query)) ||
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
    const currentDate = NKB.getManilaDate();

    // Verify SheetJS is available
    if (typeof XLSX !== 'undefined') {
        const rows = [
            ['NKB MANUFACTURING CORPORATION'],
            ['B2B PAYMENTS & ACCOUNTS RECEIVABLE (AR) COLLECTION REPORT'],
            [`Export Date: ${NKB.getManilaDateTime()}`, '', `Total Records: ${cachedPayments.length}`, '', `Total Amount Paid: PHP ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
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
    const currentDate = NKB.getManilaDate();

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
    csvRows.push(['NKB MANUFACTURING CORPORATION - PAYMENTS & AR REPORT']);
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
    let printIframe = document.getElementById('print-payments-iframe');
    if (!printIframe) {
        printIframe = document.createElement('iframe');
        printIframe.id = 'print-payments-iframe';
        printIframe.style.position = 'fixed';
        printIframe.style.right = '0';
        printIframe.style.bottom = '0';
        printIframe.style.width = '0';
        printIframe.style.height = '0';
        printIframe.style.border = '0';
        document.body.appendChild(printIframe);
    }
    const doc = printIframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>NKB Payments & Collections Report</title>
            <style>
                @page { size: landscape; margin: 0; }
                @media print {
                    @page { size: landscape; margin: 0; }
                    body { margin: 0 !important; padding: 12mm !important; }
                }
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
                    <h1>NKB MANUFACTURING CORPORATION</h1>
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
                window.onload = function() {
                    window.addEventListener('beforeprint', function() { document.title = ''; });
                    window.addEventListener('afterprint', function() { document.title = 'NKB Payments & Collections Report'; });
                    window.focus();
                    window.print();
                };
            </script>
        </body>
        </html>
    `);
    doc.close();
    setTimeout(() => {
        if (printIframe.contentWindow) {
            printIframe.contentWindow.focus();
            printIframe.contentWindow.print();
        }
    }, 400);
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
                <td class="py-3 px-4 font-bold text-slate-900">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span>${c.company_name}</span>
                        ${(c.is_vyuceutical_ops === 1 || (c.company_name && c.company_name.toLowerCase().includes('vyuceutical'))) ? `
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200" title="Registered as VYUCEUTICAL OPC">Vyuceutical OPC - ${c.contact_person || c.company_name}</span>
                        ` : ''}
                    </div>
                </td>
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
    if (res.success && res.data && res.data.length > 0) {
        cachedProducts = res.data;
        populateProductFilters();
        renderProductsTable(cachedProducts);
    } else {
        const tbody = document.getElementById('table-products-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">No products found.</td></tr>`;
    }
}

function populateProductFilters() {
    const catSelect = document.getElementById('filter-product-category');
    const clientSelect = document.getElementById('filter-product-client');
    if (catSelect && cachedCategories) {
        const curCat = catSelect.value;
        catSelect.innerHTML = '<option value="">All Categories</option>' + 
            cachedCategories.map(c => `<option value="${c.name}" ${curCat === c.name ? 'selected' : ''}>${c.name}</option>`).join('');
    }
    if (clientSelect && cachedClients) {
        const curClient = clientSelect.value;
        clientSelect.innerHTML = '<option value="">🏢 All Companies / Clients</option>' +
            '<option value="__master__">🏢 Master / Standard Catalog</option>' +
            cachedClients.map(c => `<option value="${c.id}" ${curClient === c.id ? 'selected' : ''}>${c.company_name}</option>`).join('');
    }
}

function filterProductsTable() {
    const searchVal = (document.getElementById('filter-product-search')?.value || '').toLowerCase().trim();
    const catVal = document.getElementById('filter-product-category')?.value || '';
    const clientVal = document.getElementById('filter-product-client')?.value || '';
    const fallbackNotice = document.getElementById('product-company-fallback-notice');

    let filtered = cachedProducts || [];

    if (catVal) {
        filtered = filtered.filter(p => p.category === catVal);
    }

    if (searchVal) {
        filtered = filtered.filter(p => {
            const name = (p.name || '').toLowerCase();
            const sku = (p.sku || '').toLowerCase();
            const formula = (p.formula_code || '').toLowerCase();
            const client = (p.client_name || '').toLowerCase();
            return name.includes(searchVal) || sku.includes(searchVal) || formula.includes(searchVal) || client.includes(searchVal);
        });
    }

    if (clientVal) {
        if (clientVal === '__master__') {
            if (fallbackNotice) fallbackNotice.classList.add('hidden');
            filtered = filtered.filter(p => !p.client_id && !p.client_name);
        } else {
            const clientObj = (cachedClients || []).find(c => c.id === clientVal);
            const clientName = clientObj ? clientObj.company_name : 'Selected Client';
            const specificProducts = filtered.filter(p => p.client_id === clientVal || (p.client_name && p.client_name === clientName));

            if (specificProducts.length > 0) {
                if (fallbackNotice) fallbackNotice.classList.add('hidden');
                filtered = specificProducts;
            } else {
                // If a client doesn't have products yet, show all products per company!
                if (fallbackNotice) {
                    fallbackNotice.classList.remove('hidden');
                    fallbackNotice.innerHTML = `
                        <div class="flex items-center gap-2">
                            <span class="text-base">🏢</span>
                            <div><strong>${clientName}:</strong> This client does not have exclusive products yet. Showing all standard company products available for manufacturing.</div>
                        </div>
                    `;
                }
                // Keep all company products in the view
            }
        }
    } else {
        if (fallbackNotice) fallbackNotice.classList.add('hidden');
    }

    renderProductsTable(filtered);
}

function renderProductsTable(products) {
    const tbody = document.getElementById('table-products-body');
    if (!tbody) return;

    if (!products || products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">No products match your filter criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = products.map(p => `
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
            // If a client doesn't have products yet, show all products per company
            if (countEl) countEl.innerHTML = `<span class="text-amber-600 font-bold">${currentClientMasterProducts.length} (Showing All Company Products)</span>`;
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-3 bg-amber-50/90 border-b border-amber-200 text-amber-900 text-xs">
                        <div class="flex items-center gap-2 font-medium">
                            <span class="text-base">🏢</span>
                            <div><strong>All Company Products:</strong> This client currently has no exclusive products mapped yet. Showing all ${currentClientMasterProducts.length} standard products from the company catalog. You can customize rates or SKUs below and click <strong>"Save Changes"</strong> to lock them in.</div>
                        </div>
                    </td>
                </tr>
            ` + currentClientMasterProducts.map(p => `
                <tr class="hover:bg-slate-50 transition" data-product-id="${p.id}" data-search="${(p.name + ' ' + p.sku).toLowerCase()}">
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${p.name}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${p.sku} • Base: ₱${Number(p.default_price).toFixed(2)}</div>
                    </td>
                    <td class="py-2.5 px-3">
                        <input type="text" 
                               name="custom-name-${p.id}" 
                               value="" 
                               placeholder="${p.name}" 
                               class="w-44 px-2 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="py-2.5 px-3">
                        <input type="text" 
                               name="sku-${p.id}" 
                               value="" 
                               placeholder="${p.sku}" 
                               class="w-28 px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="py-2.5 px-3">
                        <input type="text" 
                               name="formula-${p.id}" 
                               value="" 
                               placeholder="${p.formula_code || '-'}" 
                               class="w-28 px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="py-2.5 px-3">
                        <div class="relative">
                            <span class="absolute left-2.5 top-2 text-slate-400 font-bold">₱</span>
                            <input type="number" step="0.01" min="0" inputmode="decimal"
                                   name="price-${p.id}" 
                                   value="${Number(p.default_price).toFixed(2)}" 
                                   placeholder="${Number(p.default_price).toFixed(2)}" 
                                   onblur="if(this.value && !isNaN(this.value)) this.value = parseFloat(this.value).toFixed(2)"
                                   class="w-28 pl-6 pr-2 py-1.5 border border-slate-300 bg-white rounded-lg text-xs focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="text-[10px] text-slate-400 font-medium">Standard</span>
                    </td>
                </tr>
            `).join('');
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

                    <!-- Vyuceutical OPC Affiliation -->
                    <div class="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-1">
                        <label class="flex items-center gap-2 font-bold text-purple-900 cursor-pointer text-xs">
                            <input type="checkbox" id="edit-client-is-vyuceutical" ${client.is_vyuceutical_ops ? 'checked' : ''} class="rounded border-purple-300 text-purple-600 focus:ring-purple-500">
                            <span>Affiliated Under Vyuceutical OPC</span>
                        </label>
                        <p class="text-[10px] text-purple-700 leading-normal">
                            When active, official documents will display manufacturer as <strong>VYUCEUTICAL OPC</strong> and client name as the <strong>contact person</strong>. When creating POs, brands will be selectable and brand prefixes will be removed from product names.
                        </p>
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
    const is_vyuceutical_ops = document.getElementById('edit-client-is-vyuceutical').checked ? 1 : 0;

    const res = await NKB.api(`/api/clients/${clientId}`, {
        method: 'PUT',
        body: JSON.stringify({
            company_name,
            contact_person,
            email,
            phone,
            tin,
            address,
            is_vyuceutical_ops,
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
// PO Brand detection and cleaning helpers are provided on window via app.js
if (!window.KNOWN_PO_BRANDS) {
    window.KNOWN_PO_BRANDS = [
        'HER CHOICE PH', 'HER CHOICE', 'BELLA SKIN', 'K BELLA SKIN', 'SKEENCARE',
        'NATASHA', 'HANAPAM', 'GELIS PHARMA', 'JGLOWW', 'BRIGHTEST SKIN',
        'BRIGHTEST', 'ROYCE B', 'ELIXIA', 'ADORN', 'CUTIS ANO NE',
        'TARATITAT', 'MAGNIFIQUE WHITE', 'DREAM GIRL', 'SABELA SKIN', 'KKSKIN.PH',
        'KYLE SKIN', 'RG LOVE', 'CZAR', 'MI.SKIN', 'EIGHT',
        'BEAUTAIN', 'BIOESSENCE', 'INTIMATE WHITE', 'JLS NO BRAND'
    ].sort((a, b) => b.length - a.length);
}
if (!window.detectPOBrand) {
    window.detectPOBrand = function(name) {
        if (!name) return null;
        const upper = name.toUpperCase().trim();
        if (upper.startsWith('SUS ') || upper.startsWith('SUS-') || upper === 'SUS') {
            return 'BELLA SKIN';
        }
        for (const b of window.KNOWN_PO_BRANDS) {
            if (upper.startsWith(b)) return b;
        }
        return null;
    };
}
if (!window.cleanPOBrandFromName) {
    window.cleanPOBrandFromName = function(name, chosenBrand = null) {
        if (!name) return '';
        let cleaned = name.trim();
        if (chosenBrand && chosenBrand !== 'ALL') {
            const esc = chosenBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cleaned = cleaned.replace(new RegExp('^' + esc + '\\s*[-:–—]?\\s*', 'i'), '');
            cleaned = cleaned.replace(new RegExp('\\(' + esc + '\\s*[-:–—]?\\s*', 'gi'), '(');
            if (chosenBrand.toUpperCase() === 'BELLA SKIN') {
                cleaned = cleaned.replace(/^SUS\s*[-:–—]?\s*/i, '');
            }
        } else {
            if (/^SUS\s*[-:–—]?\s*/i.test(cleaned)) {
                cleaned = cleaned.replace(/^SUS\s*[-:–—]?\s*/i, '');
            }
            for (const b of window.KNOWN_PO_BRANDS) {
                const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const reg = new RegExp('^' + esc + '\\s*[-:–—]?\\s*', 'i');
                if (reg.test(cleaned)) {
                    cleaned = cleaned.replace(reg, '');
                    cleaned = cleaned.replace(new RegExp('\\(' + esc + '\\s*[-:–—]?\\s*', 'gi'), '(');
                    cleaned = cleaned.replace(/^SUS\s*[-:–—]?\s*/i, '');
                    break;
                }
            }
        }
        return cleaned.trim() || name;
    };
}

let adminPOLineItems = [];
let adminPOCatalog = [];
let adminPORawCatalog = [];

async function openCreatePOModal() {
    const root = document.getElementById('modals-root');
    adminPOLineItems = [];
    adminPORawCatalog = cachedProducts.slice();
    adminPOCatalog = cachedProducts.slice();

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-2xl max-w-4xl w-full p-6 sm:p-7 shadow-2xl space-y-4 max-h-[92vh] flex flex-col my-auto">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3 flex-shrink-0">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Create Multi-Item Purchase Order (PO)</h3>
                        <p class="text-xs text-slate-500">Order multiple cosmetic products with client-specific pricing</p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>
                <form id="form-create-po" onsubmit="submitCreatePO(event)" class="space-y-4 text-xs font-semibold flex-1 overflow-y-auto pr-1">
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Select Client *</label>
                            <select id="po-client-id" onchange="onAdminPOClientChanged()" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                                ${cachedClients.map(c => {
                                    const isVyu = c.is_vyuceutical_ops === 1 || (c.company_name && c.company_name.toLowerCase().includes('vyuceutical'));
                                    const label = isVyu ? `Vyuceutical OPC - ${c.contact_person || c.company_name}` : c.company_name;
                                    return `<option value="${c.id}">${label}</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Billing Policy</label>
                            <select id="po-billing-policy" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold">
                                <option value="ACTUAL_DELIVERY">Option A: Bill Actual Delivered</option>
                                <option value="FIXED_PO_BUFFER">Option B: Fixed PO + Buffer Stock</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1 font-bold">Term of Payment *</label>
                            <select id="create-po-form-of-payment" onchange="toggleCustomPOTerm('create')" class="w-full px-3 py-2 border rounded-xl bg-white font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                                <option value="COD" selected>COD (Cash on Delivery)</option>
                                <option value="7d">7d (7 Days)</option>
                                <option value="15d">15d (15 Days)</option>
                                <option value="30d">30d (30 Days)</option>
                                <option value="CUSTOM">Custom Term...</option>
                            </select>
                            <input type="text" id="create-po-form-of-payment-custom" placeholder="e.g. 50% DP, 50% upon delivery..." class="hidden mt-1.5 w-full px-3 py-1.5 border rounded-lg bg-white text-xs font-medium text-slate-900">
                        </div>
                    </div>

                    <!-- Multi-Brand Search with Suggestions -->
                    <div class="p-3 bg-slate-50 border border-slate-300 rounded-2xl space-y-2 relative shadow-sm" id="po-search-wrapper">
                        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5">
                                <span class="text-sm">🔍</span>
                                <span class="text-xs font-bold text-slate-900">Search & Add Products</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-extrabold uppercase">Multi-Brand Order</span>
                            </div>
                            <div class="flex items-center gap-2 w-full sm:w-auto" id="po-brand-filter-container">
                                <label for="po-brand-select" class="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Filter Brand:</label>
                                <select id="po-brand-select" onchange="onAdminPOBrandFilterChanged()" class="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500">
                                    <option value="ALL">-- All Brands --</option>
                                </select>
                            </div>
                        </div>

                        <!-- Search input + Search button -->
                        <div class="relative">
                            <div class="flex items-stretch gap-2">
                                <div class="relative flex-1">
                                    <input type="text" 
                                           id="po-product-search-input" 
                                           oninput="handlePOSearchInput(this.value)" 
                                           onkeydown="handlePOSearchKeydown(event)"
                                           onfocus="showPOSuggestions()"
                                           placeholder="Type product name, SKU, or brand (e.g. Amber Romance, Toner, Sunscreen, BSSA)..." 
                                           autocomplete="off"
                                           class="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm">
                                    <span class="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                                    <button type="button" 
                                            id="po-search-clear-btn" 
                                            onclick="clearPOSearch()" 
                                            class="hidden absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs px-1 font-bold">✕</button>
                                </div>
                                <button type="button" 
                                        id="po-search-btn" 
                                        onclick="triggerPOSearchBtn()" 
                                        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 active:scale-95">
                                    <span>🔍</span>
                                    <span>Search Product</span>
                                </button>
                            </div>

                            <!-- Floating Suggestions Dropdown -->
                            <div id="po-suggestions-container" 
                                 class="hidden absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto divide-y divide-slate-100">
                                <!-- Populated dynamically by renderPOSuggestions() -->
                            </div>
                        </div>
                        <p id="po-search-note" class="text-[10px] text-slate-500 flex items-center gap-1">
                            <span>💡</span>
                            <span>Order products from different brands in the same PO. Click any suggestion to add it to the table below.</span>
                        </p>
                    </div>

                    <!-- Line Items Section -->
                    <div class="space-y-2 pt-2 border-t border-slate-100">
                        <div class="flex justify-between items-center">
                            <span class="text-xs font-bold uppercase tracking-wider text-slate-700">Order Products (Line Items)</span>
                            <button type="button" onclick="addAdminPOLineItem()" class="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition flex items-center gap-1">
                                <span>➕</span><span>Add Product Line</span>
                            </button>
                        </div>

                        <div class="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div class="max-h-72 sm:max-h-80 overflow-y-auto overflow-x-auto">
                                <table class="w-full text-left text-xs">
                                    <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase sticky top-0 z-10 shadow-sm">
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

let poHighlightedSuggestionIdx = -1;

async function onAdminPOClientChanged() {
    const clientSelect = document.getElementById('po-client-id');
    if (!clientSelect) return;
    const clientId = clientSelect.value;
    const client = (cachedClients || []).find(c => c.id === clientId);
    const isVyuceutical = client && (client.is_vyuceutical_ops === 1 || (client.company_name && client.company_name.toLowerCase().includes('vyuceutical')));

    let res = await NKB.api(`/api/products?clientId=${clientId}&assignedOnly=true`);
    if (res.success && res.data && res.data.length > 0) {
        adminPORawCatalog = res.data;
    } else {
        // Fallback: If client doesn't have custom products yet, show all company products!
        const allRes = await NKB.api('/api/products?activeOnly=true');
        adminPORawCatalog = (allRes.success && allRes.data) ? allRes.data : [];
    }

    // Process adminPOCatalog: Every product has brand and clean_name preserved for multi-brand orders
    adminPOCatalog = adminPORawCatalog.map(p => {
        const brand = detectPOBrand(p.name) || 'OTHER';
        const cleanName = isVyuceutical ? cleanPOBrandFromName(p.name) : p.name;
        return {
            ...p,
            brand,
            clean_name: cleanName,
            display_name: cleanName
        };
    });

    // Populate brand filter options (allowing optional narrowing without clearing line items)
    const brandSelect = document.getElementById('po-brand-select');
    if (brandSelect) {
        const brandSet = new Set();
        adminPOCatalog.forEach(p => {
            if (p.brand) brandSet.add(p.brand);
        });
        const detectedList = Array.from(brandSet).sort();
        brandSelect.innerHTML = `<option value="ALL">-- All Brands (${adminPOCatalog.length} Products) --</option>` +
            detectedList.map(b => `<option value="${b}">${b}</option>`).join('');
    }

    const noteEl = document.getElementById('po-search-note');
    if (noteEl) {
        if (isVyuceutical) {
            noteEl.innerHTML = `<span>💡</span><span>Vyuceutical OPC (${client.contact_person || client.company_name}): Brand names & SUS prefixes are automatically removed. You can order items across different brands simultaneously.</span>`;
        } else {
            noteEl.innerHTML = `<span>💡</span><span>Order products across multiple different brands in the same PO. Click any suggestion or use Search Product to add items.</span>`;
        }
    }

    // Initialize line items if empty
    if (adminPOLineItems.length === 0 && adminPOCatalog.length > 0) {
        addAdminPOLineItem();
    } else {
        renderAdminPOLineItems();
    }
}

function onAdminPOBrandFilterChanged() {
    // Non-destructive: Changing brand filter NEVER wipes existing line items!
    const searchInput = document.getElementById('po-product-search-input');
    renderPOSuggestions(searchInput ? searchInput.value : '');
}

function getFilteredPOSuggestions(query = '') {
    const brandSelect = document.getElementById('po-brand-select');
    const chosenBrand = brandSelect ? brandSelect.value : 'ALL';
    let list = adminPOCatalog.slice();

    if (chosenBrand && chosenBrand !== 'ALL') {
        list = list.filter(p => {
            if (chosenBrand === 'BELLA SKIN') {
                return p.brand === 'BELLA SKIN' || p.name.toUpperCase().startsWith('BELLA SKIN') || p.name.toUpperCase().startsWith('SUS ') || p.name.toUpperCase().startsWith('SUS-');
            }
            return p.brand === chosenBrand || p.name.toUpperCase().startsWith(chosenBrand.toUpperCase());
        });
    }

    const q = (query || '').trim().toLowerCase();
    if (q) {
        const terms = q.split(/\s+/).filter(Boolean);
        list = list.filter(p => {
            const haystack = `${p.name} ${p.display_name} ${p.clean_name || ''} ${p.sku} ${p.effective_sku || ''} ${p.brand || ''} ${p.category || ''}`.toLowerCase();
            return terms.every(t => haystack.includes(t));
        });
    }

    return list;
}

function showPOSuggestions() {
    const searchInput = document.getElementById('po-product-search-input');
    renderPOSuggestions(searchInput ? searchInput.value : '');
}

function handlePOSearchInput(val) {
    const clearBtn = document.getElementById('po-search-clear-btn');
    if (clearBtn) {
        if (val && val.length > 0) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
    poHighlightedSuggestionIdx = -1;
    renderPOSuggestions(val);
}

function clearPOSearch() {
    const searchInput = document.getElementById('po-product-search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    const clearBtn = document.getElementById('po-search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    renderPOSuggestions('');
}

function triggerPOSearchBtn() {
    const container = document.getElementById('po-suggestions-container');
    const searchInput = document.getElementById('po-product-search-input');
    if (container && !container.classList.contains('hidden')) {
        container.classList.add('hidden');
    } else {
        if (searchInput) searchInput.focus();
        renderPOSuggestions(searchInput ? searchInput.value : '');
    }
}

function renderPOSuggestions(query = '') {
    const container = document.getElementById('po-suggestions-container');
    if (!container) return;

    const matches = getFilteredPOSuggestions(query);
    container.classList.remove('hidden');

    if (matches.length === 0) {
        container.innerHTML = `
            <div class="p-4 text-center text-xs font-semibold" style="color: #475569 !important; background-color: #ffffff !important;">
                <span>⚠️ No products found matching your search. Try another keyword or select "All Brands".</span>
            </div>
        `;
        return;
    }

    const displayList = matches.slice(0, 40);
    container.innerHTML = `
        <div class="suggestion-header p-2 text-[11px] font-bold flex justify-between items-center" style="background-color: #f1f5f9 !important; color: #1e293b !important; border-bottom: 1px solid #cbd5e1 !important;">
            <span class="font-extrabold" style="color: #1e293b !important;">Found ${matches.length} products (showing ${displayList.length})</span>
            <span class="text-[10px] font-semibold" style="color: #64748b !important;">Click to add to PO</span>
        </div>
        <div class="divide-y divide-slate-100">
            ${displayList.map((p, idx) => {
                const isCleaned = p.clean_name && p.clean_name !== p.name;
                const isSelected = idx === poHighlightedSuggestionIdx;
                return `
                    <div id="po-suggestion-item-${idx}" 
                         onclick="selectPOSuggestion('${p.id}')" 
                         class="suggestion-item p-2.5 cursor-pointer flex items-center justify-between gap-3 transition ${isSelected ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'bg-white'}"
                         style="${isSelected ? 'background-color: #eef2ff !important;' : 'background-color: #ffffff !important;'}">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${window.getBrandBadgeClass ? window.getBrandBadgeClass(p.brand) : 'bg-slate-100 text-slate-700'}" style="font-weight: 700 !important;">${p.brand || 'OTHER'}</span>
                                <span class="suggestion-prod-name font-black text-xs truncate" style="color: #020617 !important; font-weight: 800 !important;">${p.display_name}</span>
                                <span class="suggestion-prod-sku text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border" style="color: #1e1b4b !important; background-color: #e0e7ff !important; border-color: #c7d2fe !important;">${p.effective_sku || p.sku}</span>
                            </div>
                            ${isCleaned ? `<div class="text-[10px] mt-0.5 truncate font-semibold" style="color: #64748b !important;">Original: ${p.name}</div>` : ''}
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <span class="suggestion-prod-price text-xs font-black font-mono" style="color: #065f46 !important; font-weight: 900 !important;">₱${Number(p.default_price || 0).toFixed(2)}</span>
                            <button type="button" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-[11px] font-bold border border-indigo-200 hover:border-indigo-600 transition flex items-center gap-1 shadow-sm" style="color: #4338ca !important;">
                                <span>➕</span><span>Add</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function handlePOSearchKeydown(e) {
    const container = document.getElementById('po-suggestions-container');
    if (!container || container.classList.contains('hidden')) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
            showPOSuggestions();
            e.preventDefault();
        }
        return;
    }

    const matches = getFilteredPOSuggestions(e.target.value).slice(0, 40);
    if (matches.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        poHighlightedSuggestionIdx = Math.min(poHighlightedSuggestionIdx + 1, matches.length - 1);
        renderPOSuggestions(e.target.value);
        const el = document.getElementById(`po-suggestion-item-${poHighlightedSuggestionIdx}`);
        if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        poHighlightedSuggestionIdx = Math.max(poHighlightedSuggestionIdx - 1, 0);
        renderPOSuggestions(e.target.value);
        const el = document.getElementById(`po-suggestion-item-${poHighlightedSuggestionIdx}`);
        if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (poHighlightedSuggestionIdx >= 0 && poHighlightedSuggestionIdx < matches.length) {
            selectPOSuggestion(matches[poHighlightedSuggestionIdx].id);
        } else if (matches.length > 0) {
            selectPOSuggestion(matches[0].id);
        }
    } else if (e.key === 'Escape') {
        container.classList.add('hidden');
    }
}

function selectPOSuggestion(productId) {
    const prod = adminPOCatalog.find(p => p.id === productId);
    if (!prod) return;

    // Check if already in line items
    const existingIdx = adminPOLineItems.findIndex(it => it.product_id === productId);
    if (existingIdx !== -1) {
        renderAdminPOLineItems();
        const rowInput = document.querySelector(`#admin-po-lines-body tr:nth-child(${existingIdx + 1}) input[type="number"]`);
        if (rowInput) {
            rowInput.focus();
            rowInput.select();
        }
        NKB.showToast(`"${prod.display_name}" is already in order (Row #${existingIdx + 1}). Quantity highlighted.`, 'info');
    } else {
        // If single line item that hasn't been touched, replace it
        if (adminPOLineItems.length === 1 && adminPOLineItems[0].target_quantity === 1000 && adminPOLineItems[0].product_id === adminPOCatalog[0]?.id && !adminPOLineItems[0]._userEdited) {
            adminPOLineItems[0].product_id = prod.id;
            adminPOLineItems[0].unit_price = Number(prod.default_price || 0);
            adminPOLineItems[0]._userEdited = true;
        } else {
            adminPOLineItems.push({
                product_id: prod.id,
                target_quantity: 1000,
                unit_price: Number(prod.default_price || 0),
                _userEdited: true
            });
        }
        renderAdminPOLineItems();
        NKB.showToast(`Added ${prod.display_name} [${prod.brand}] to order!`, 'success');

        const lastIdx = adminPOLineItems.length - 1;
        setTimeout(() => {
            const rowInput = document.querySelector(`#admin-po-lines-body tr:nth-child(${lastIdx + 1}) input[type="number"]`);
            if (rowInput) {
                rowInput.focus();
                rowInput.select();
            }
        }, 50);
    }

    const container = document.getElementById('po-suggestions-container');
    if (container) container.classList.add('hidden');
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
    adminPOLineItems[index]._userEdited = true;
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

        const currentProd = adminPOCatalog.find(p => p.id === item.product_id);
        const brandBadge = currentProd ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${window.getBrandBadgeClass ? window.getBrandBadgeClass(currentProd.brand) : 'bg-slate-100 text-slate-700'} mr-1">${currentProd.brand || 'OTHER'}</span>` : '';

        return `
            <tr class="hover:bg-slate-50 transition" id="admin-po-row-${idx}">
                <td class="py-2.5 px-3">
                    <div class="flex items-center gap-1 mb-1">
                        ${brandBadge}
                        <span class="text-[10px] font-mono text-indigo-900 font-bold bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">${currentProd ? (currentProd.effective_sku || currentProd.sku) : ''}</span>
                    </div>
                    <select onchange="updateAdminPOLineItem(${idx}, 'product_id', this.value)" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                        ${window.renderProductOptionsGroupedByBrand ? window.renderProductOptionsGroupedByBrand(adminPOCatalog, item.product_id) : adminPOCatalog.map(p => `
                            <option value="${p.id}" ${p.id === item.product_id ? 'selected' : ''}>
                                ${p.display_name || p.clean_name || p.name} (${p.effective_sku || p.sku}) - ₱${Number(p.default_price).toFixed(2)}${p.has_custom_price ? ' [Contract Rate]' : ''}
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
    const termSelect = document.getElementById('create-po-form-of-payment') || document.getElementById('po-form-of-payment');
    let formOfPayment = termSelect ? termSelect.value : 'COD';
    if (formOfPayment === 'CUSTOM') {
        const customInput = document.getElementById('create-po-form-of-payment-custom') || document.getElementById('po-form-of-payment-custom');
        formOfPayment = customInput ? (customInput.value.trim() || 'COD') : 'COD';
    }
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

    const submitBtn = document.querySelector('#modals-root button[type="submit"]') || document.querySelector('button[type="submit"]');
    if (submitBtn) {
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        submitBtn.dataset.origHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Creating PO...';
    }

    try {
        const res = await NKB.api('/api/orders', {
            method: 'POST',
            body: JSON.stringify({
                client_id: clientId,
                tolerance_percent: tolerance,
                billing_policy: policy,
                form_of_payment: formOfPayment,
                notes,
                items: adminPOLineItems.map(item => {
                    const prod = adminPOCatalog.find(p => p.id === item.product_id);
                    return {
                        product_id: item.product_id,
                        item_name: prod ? (prod.clean_name || prod.display_name || prod.name) : undefined,
                        target_quantity: item.target_quantity,
                        unit_price: Math.round(Number(item.unit_price || 0) * 100) / 100
                    };
                })
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
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            if (submitBtn.dataset.origHtml) submitBtn.innerHTML = submitBtn.dataset.origHtml;
        }
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

    const totalTargetQty = poItems.reduce((sum, it) => sum + (Number(it.target_quantity) || 0), 0);
    const unstartedItems = poItems.filter(it => !it.jo_number);
    const unstartedCount = unstartedItems.length;

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col border border-slate-200">
                <!-- Header -->
                <div class="flex justify-between items-start border-b border-slate-100 pb-3 flex-shrink-0">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-xl">🏭</span>
                            <h3 class="text-lg font-extrabold text-slate-900">Start Job Order (All Products)</h3>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">
                            Client: <strong class="text-slate-900 font-bold">${clientName}</strong> • PO: <strong class="text-indigo-600 font-mono">${poNumber}</strong>
                        </p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl px-2">&times;</button>
                </div>

                <!-- Form with All Products & Single Execution -->
                <form onsubmit="submitCreateAllJO(event, '${poId}', '${clientName.replace(/'/g, "\\'")}')" class="space-y-4 text-xs font-semibold overflow-y-auto flex-1 pr-1">
                    <!-- Products in Order -->
                    <div>
                        <div class="flex justify-between items-center mb-1.5">
                            <span class="text-slate-700 font-bold uppercase tracking-wider text-[10.5px]">All Products for this Client (${poItems.length} Products):</span>
                            <span class="text-slate-500 font-mono text-[11px]">Total: ${NKB.formatNumber(totalTargetQty)} pcs</span>
                        </div>
                        <div class="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-slate-50 max-h-52 overflow-y-auto">
                            ${poItems.length > 0 ? poItems.map((item, i) => {
                                const hasJO = item.jo_number;
                                return `
                                    <div class="p-2.5 flex items-center justify-between text-xs hover:bg-white transition">
                                        <div class="flex items-center gap-2 min-w-0 pr-2">
                                            <span class="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">${i + 1}</span>
                                            <div class="truncate">
                                                <span class="font-bold text-slate-900 block truncate" title="${item.product_name}">${item.product_name}</span>
                                                <span class="text-[10px] text-slate-400 font-mono">${item.sku}</span>
                                            </div>
                                        </div>
                                        <div class="text-right font-mono flex items-center gap-2 flex-shrink-0">
                                            <span class="font-extrabold text-slate-800">${NKB.formatNumber(item.target_quantity)} pcs</span>
                                            ${hasJO ? `
                                                <span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold text-[10px]">✓ ${item.jo_number}</span>
                                            ` : `
                                                <span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-bold text-[10px]">Ready to Start</span>
                                            `}
                                        </div>
                                    </div>
                                `;
                            }).join('') : `
                                <div class="p-4 text-center text-slate-400">No products recorded in this purchase order.</div>
                            `}
                        </div>
                    </div>

                    <!-- Team & Date Assignment -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                            <label class="block text-slate-600 mb-1 font-bold">Assigned Production Team / Lead *</label>
                            <select id="jo-team" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900 text-xs">
                                <option value="Formulation & Bottling Team Alpha">Formulation & Bottling Team Alpha (Standard)</option>
                                ${prodStaff.map(e => `
                                    <option value="${e.name} (${e.department})">${e.name} — ${e.department} [${e.employee_id}]</option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1 font-bold">Scheduled Start Date *</label>
                            <input type="date" id="jo-start-date" value="${NKB.getManilaDate()}" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900 text-xs">
                        </div>
                    </div>

                    <div>
                        <label class="block text-slate-600 mb-1 font-bold">Production Instructions / Notes (Optional)</label>
                        <input type="text" id="jo-notes" placeholder="e.g. Standard cleanroom compounding run, expedited bottling" class="w-full px-3 py-2 border rounded-xl bg-slate-50 text-slate-900 text-xs font-medium">
                    </div>

                    <div class="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl text-indigo-900 flex items-start gap-2.5">
                        <span class="text-base">ℹ️</span>
                        <p class="text-[11px] leading-relaxed">
                            Clicking the button below will start production for <strong>all products</strong> in this client's order simultaneously. Sequential Job Orders will be assigned, the PO will be marked <strong>IN PRODUCTION</strong>, and you can view or print all products immediately.
                        </p>
                    </div>

                    <!-- Single Execution Button on Bottom Right -->
                    <div class="flex justify-between items-center pt-3 border-t border-slate-100 flex-shrink-0">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">
                            Cancel
                        </button>
                        <button type="submit" id="btn-submit-jo-all" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-black text-xs shadow-md shadow-indigo-600/30 transition flex items-center gap-2">
                            <span>🚀 Start All Job Orders (${unstartedCount > 0 ? unstartedCount : poItems.length} Products)</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateAllJO(e, poId, clientName) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-jo-all');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Starting Production...</span>';
    }

    const assignedTeam = document.getElementById('jo-team').value;
    const startDate = document.getElementById('jo-start-date').value;
    const notes = document.getElementById('jo-notes') ? document.getElementById('jo-notes').value : '';

    const res = await NKB.api('/api/job-orders', {
        method: 'POST',
        body: JSON.stringify({
            po_id: poId,
            create_all: true,
            assigned_team: assignedTeam,
            scheduled_start_date: startDate,
            notes: notes
        })
    });

    if (res.success) {
        const count = res.count || (res.data ? res.data.length : 0);
        NKB.showToast(`🎉 Successfully started Job Orders for all products (${count} created)!`, 'success');
        closeModal();
        if (typeof switchTab === 'function') {
            switchTab('job-orders');
        } else {
            location.reload();
        }
    } else {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🚀 Start All Job Orders</span>';
        }
        NKB.showToast(res.error || 'Failed to start Job Orders.', 'error');
    }
}

async function submitCreateJO(e, poId) {
    return submitCreateAllJO(e, poId, '');
}

window.openCreateJOModal = openCreateJOModal;
window.submitCreateAllJO = submitCreateAllJO;
window.submitCreateJO = submitCreateJO;

// -------------------------------------------------------------
// 3. CREATE ALL PRODUCTION BATCHES MODAL (BATCH EXECUTION FOR ALL PRODUCTS)
// -------------------------------------------------------------
async function openCreateAllBatchesModal(clientId, poId, companyName) {
    const root = document.getElementById('modals-root');
    const employees = await ensureEmployeesLoaded();

    const compoundingStaff = employees.filter(e => e.department === 'Compounding' || e.department === 'Production' || e.department === 'R&D');
    const bottlingStaff = employees.filter(e => e.department === 'Production');
    const qcStaff = employees.filter(e => e.department === 'QC' || e.department === 'Regulatory');

    // Fetch Job Orders for this PO / Client
    let clientJOs = [];
    if (poId) {
        const res = await NKB.api(`/api/job-orders?poId=${poId}`);
        if (res.success && res.data) clientJOs = res.data;
    } else if (clientId) {
        const res = await NKB.api('/api/job-orders');
        if (res.success && res.data) {
            clientJOs = res.data.filter(j => j.client_id === clientId);
        }
    }
    if (clientJOs.length === 0 && typeof cachedJobOrders !== 'undefined' && cachedJobOrders && cachedJobOrders.length > 0) {
        clientJOs = cachedJobOrders.filter(j => (clientId && j.client_id === clientId) || (poId && j.po_id === poId));
    }

    if (clientJOs.length === 0) {
        NKB.showToast('No active Job Orders found for this client order.', 'error');
        return;
    }

    const clientCompName = companyName || clientJOs[0]?.company_name || 'Client Order';
    const primaryPoNum = clientJOs[0]?.po_number || '';
    const clientSO = primaryPoNum ? primaryPoNum.replace('PO-', 'SO-') : 'SO-2026-000001';
    const totalTargetUnits = clientJOs.reduce((sum, j) => sum + (j.target_quantity || 0), 0);

    const itemsRowsHtml = clientJOs.map((jo, idx) => {
        const hasBatch = jo.batch_count > 0;
        return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0 batch-launch-item" data-jo-id="${jo.id}">
            <td class="py-2.5 px-3 font-mono font-bold text-indigo-600">${jo.jo_number}</td>
            <td class="py-2.5 px-3">
                <div class="font-bold text-slate-800">${jo.product_name}</div>
                ${jo.sku ? `<div class="text-[10px] text-slate-400 font-mono">SKU: ${jo.sku}</div>` : ''}
            </td>
            <td class="py-2.5 px-3">
                <input type="text" value="${jo.formula_code || 'FORM-2026-V1'}" class="batch-item-formula w-28 px-2 py-1 text-xs border rounded-lg bg-slate-50 font-mono text-slate-700">
            </td>
            <td class="py-2.5 px-3 font-mono text-right">
                <span class="font-bold text-slate-700">${NKB.formatNumber(jo.target_quantity)} pcs</span>
                <input type="hidden" class="batch-item-qty" value="${jo.target_quantity}">
            </td>
            <td class="py-2.5 px-3 text-right">
                <input type="number" min="1" value="${jo.target_quantity}" required class="batch-item-actual-yield w-24 px-2 py-1 text-xs border rounded-lg bg-emerald-50 border-emerald-300 font-bold text-emerald-900 text-right" title="Enter actual manufactured units">
            </td>
            <td class="py-2.5 px-3 text-center whitespace-nowrap">
                ${hasBatch ? `
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 font-mono" title="Batch recorded">
                        ✓ ${jo.latest_batch_number || 'Batched'}
                    </span>
                ` : `
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Ready to Batch
                    </span>
                `}
            </td>
        </tr>
        `;
    }).join('');

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-5 my-8 max-h-[92vh] flex flex-col">
                <!-- Header -->
                <div class="flex justify-between items-center border-b border-slate-100 pb-3 flex-shrink-0">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-2xl">⚗️</span>
                            <h3 class="text-xl font-black text-slate-900">Batching & Quality Inspection (Products Made)</h3>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">
                            Client: <strong class="text-indigo-600">${clientCompName}</strong> • SO: <strong class="font-mono text-slate-800">${clientSO}</strong> • PO: <strong class="font-mono text-slate-800">${primaryPoNum}</strong>
                            <br><span class="text-slate-400">Products are physically manufactured in cleanroom. Enter confirmed actual yield to issue batch numbers and QC release before delivering.</span>
                        </p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl px-2">&times;</button>
                </div>

                <form onsubmit="submitCreateAllBatches(event, '${clientId || ''}', '${poId || ''}', '${clientCompName.replace(/'/g, "\\'")}')" class="space-y-4 text-xs font-semibold flex-1 overflow-y-auto pr-1">
                    <!-- Cleanroom Personnel & Line Assignments (Shared Defaults) -->
                    <div class="p-4 bg-purple-50/60 border border-purple-100 rounded-2xl space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                                <span>👨‍🔬</span><span>Cleanroom Personnel & Line Assignments</span>
                            </span>
                            <span class="text-[11px] text-purple-700 font-medium">Applied to all product batches in this run</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-slate-600 mb-1">🥣 Compounding Chemist / Operator *</label>
                                <select id="batch-all-compounding-operator" required class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                                    ${compoundingStaff.map(e => `
                                        <option value="${e.name}" ${e.department === 'Compounding' ? 'selected' : ''}>${e.name} (${e.department})</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-slate-600 mb-1">🧴 Bottling & Packaging Lead *</label>
                                <select id="batch-all-bottling-lead" required class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                                    ${bottlingStaff.map((e, idx) => `
                                        <option value="${e.name}" ${idx === 0 ? 'selected' : ''}>${e.name} [${e.employee_id}]</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-slate-600 mb-1">🔬 Quality Control (QC) Inspector *</label>
                                <select id="batch-all-qc-inspector" required class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                                    ${qcStaff.map((e, idx) => `
                                        <option value="${e.name}" ${idx === 0 ? 'selected' : ''}>${e.name} (${e.department})</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-slate-600 mb-1">🏭 Cleanroom Line Assignment *</label>
                                <select id="batch-all-line-assignment" class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                                    <option value="Cleanroom Line 1 (Alpha)">Cleanroom Line 1 (Alpha)</option>
                                    <option value="Cleanroom Line 2 (Beta)">Cleanroom Line 2 (Beta)</option>
                                    <option value="High-Speed Bottling Line 3">High-Speed Bottling Line 3</option>
                                    <option value="Compounding Kettle Area A">Compounding Kettle Area A</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Products Table -->
                    <div class="space-y-2">
                        <div class="flex justify-between items-center px-1">
                            <span class="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <span>📦</span><span>Finished Products & Confirmed Yield (${clientJOs.length} Products • Total Target: ${NKB.formatNumber(totalTargetUnits)} pcs)</span>
                            </span>
                        </div>
                        <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                                    <tr>
                                        <th class="py-2.5 px-3">JO Ref</th>
                                        <th class="py-2.5 px-3">Product Name & SKU</th>
                                        <th class="py-2.5 px-3">Formula Code</th>
                                        <th class="py-2.5 px-3 text-right">Target Qty</th>
                                        <th class="py-2.5 px-3 text-right">Actual Qty Made (Yield) *</th>
                                        <th class="py-2.5 px-3 text-center">Batch Status</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 font-medium">
                                    ${itemsRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Footer Actions -->
                    <div class="flex justify-between items-center pt-3 border-t border-slate-100 flex-shrink-0">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">
                            Cancel
                        </button>
                        <button type="submit" id="btn-submit-all-batches" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-lg shadow-purple-600/30 transition flex items-center gap-2">
                            <span>🚀 Complete Batching (${clientJOs.length} Products) — Ready for Delivery</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateAllBatches(e, clientId, poId, companyName) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-all-batches');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Recording Batches & Yields...</span>';
    }

    const compoundingOperator = document.getElementById('batch-all-compounding-operator')?.value || '';
    const bottlingLead = document.getElementById('batch-all-bottling-lead')?.value || '';
    const qcInspector = document.getElementById('batch-all-qc-inspector')?.value || '';
    const lineAssignment = document.getElementById('batch-all-line-assignment')?.value || '';

    const items = [];
    document.querySelectorAll('.batch-launch-item').forEach(el => {
        const joId = el.dataset.joId;
        const qty = parseInt(el.querySelector('.batch-item-qty')?.value || '0');
        const actualYield = parseInt(el.querySelector('.batch-item-actual-yield')?.value || qty || '0');
        const formula = el.querySelector('.batch-item-formula')?.value || '';
        if (joId && qty > 0) {
            items.push({
                jo_id: joId,
                target_quantity: qty,
                actual_yield: actualYield,
                formula_code: formula
            });
        }
    });

    const res = await NKB.api('/api/production/batches', {
        method: 'POST',
        body: JSON.stringify({
            create_all: true,
            po_id: poId || undefined,
            client_id: clientId || undefined,
            compounding_operator: compoundingOperator,
            bottling_lead: bottlingLead,
            qc_inspector: qcInspector,
            line_assignment: lineAssignment,
            items: items
        })
    });

    if (res.success) {
        const count = res.count || items.length;
        NKB.showToast(`🎉 Successfully batched and inspected ${count} products for ${companyName}! Ready for delivery.`, 'success');
        closeModal();
        if (typeof loadJobOrders === 'function') loadJobOrders();
        if (typeof loadOrders === 'function') loadOrders();
        if (typeof loadBatches === 'function') loadBatches();
    } else {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🚀 Complete Batching</span>';
        }
        NKB.showToast(res.error || 'Failed to record batches.', 'error');
    }
}

window.openCreateAllBatchesModal = openCreateAllBatchesModal;
window.submitCreateAllBatches = submitCreateAllBatches;

// -------------------------------------------------------------
// 4. CREATE SINGLE PRODUCTION BATCH MODAL
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
                        <h3 class="text-lg font-bold text-slate-900">⚗️ Batching & Quality Inspection (Product Made)</h3>
                        <p class="text-xs text-slate-500">JO Reference: <strong>${joNumber}</strong></p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>
                <form onsubmit="submitCreateBatch(event, '${joId}')" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-slate-50 rounded-xl text-slate-600 space-y-1">
                        <div>Product: <strong class="text-slate-900">${productName}</strong></div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Target Batch Qty (pcs)</label>
                            <input type="number" id="batch-target-qty" value="${targetQty}" min="1" required readonly class="w-full px-3 py-2 border rounded-xl bg-slate-100 font-bold text-slate-600 cursor-not-allowed">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Actual Qty Made / Yield (pcs) *</label>
                            <input type="number" id="batch-actual-yield" value="${targetQty}" min="1" required class="w-full px-3 py-2 border rounded-xl bg-emerald-50 border-emerald-300 font-bold text-emerald-900" placeholder="Actual units produced">
                        </div>
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
                        <button type="submit" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-md shadow-purple-600/30">🚀 Complete Batch (Ready for Delivery)</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateBatch(e, joId) {
    e.preventDefault();
    const targetQty = parseInt(document.getElementById('batch-target-qty').value);
    const actualYield = parseInt(document.getElementById('batch-actual-yield')?.value || targetQty);
    const compoundingOperator = document.getElementById('batch-compounding-operator')?.value || '';
    const bottlingLead = document.getElementById('batch-bottling-lead')?.value || '';
    const qcInspector = document.getElementById('batch-qc-inspector')?.value || '';
    const lineAssignment = document.getElementById('batch-line-assignment')?.value || '';

    const res = await NKB.api('/api/production/batches', {
        method: 'POST',
        body: JSON.stringify({
            jo_id: joId,
            target_quantity: targetQty,
            actual_yield: actualYield,
            compounding_operator: compoundingOperator,
            bottling_lead: bottlingLead,
            qc_inspector: qcInspector,
            line_assignment: lineAssignment
        })
    });

    if (res.success) {
        NKB.showToast(`Batch ${res.data.batch_number} recorded & approved for delivery!`, 'success');
        closeModal();
        if (typeof loadJobOrders === 'function') loadJobOrders();
        if (typeof loadOrders === 'function') loadOrders();
        if (typeof loadBatches === 'function') loadBatches();
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
                        <div class="flex items-center justify-between">
                            <span>PO Ref: <strong class="text-slate-900 font-mono">${poNumber}</strong></span>
                            <span class="text-[11px] text-slate-500 font-mono">SO: <strong class="text-slate-800">${poNumber ? poNumber.replace('PO-', 'SO-') : '—'}</strong></span>
                        </div>
                        <div>Batch: <strong class="text-indigo-600 font-mono font-bold">${batchNumber}</strong> (${productName})</div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Delivered Quantity (pcs)</label>
                        <input type="number" id="dr-delivered-qty" value="${deliveredQty}" min="1" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                        <p class="text-[10.5px] text-slate-500 mt-1 font-normal">
                            Enter the units to dispatch for this delivery (e.g. initial shipment of 720 pcs). The progress bar and remaining balance will be automatically tracked against the PO and SO.
                        </p>
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

// 6b. Create Unified Delivery Receipt (All Products in Client PO) Modal
async function openCreateAllDRModal(clientId, poId, companyName) {
    const root = document.getElementById('modals-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl p-6 shadow-2xl flex items-center gap-3 text-slate-700 font-bold text-sm">
                <span class="animate-spin text-xl">⏳</span>
                <span>Loading batched products for delivery...</span>
            </div>
        </div>
    `;

    let clientJOs = [];
    if (poId) {
        const res = await NKB.api(`/api/job-orders?poId=${poId}`);
        if (res.success && res.data) clientJOs = res.data;
    } else if (clientId) {
        const res = await NKB.api('/api/job-orders');
        if (res.success && res.data) {
            clientJOs = res.data.filter(j => j.client_id === clientId);
        }
    }

    if (clientJOs.length === 0 && typeof cachedJobOrders !== 'undefined' && cachedJobOrders && cachedJobOrders.length > 0) {
        clientJOs = cachedJobOrders.filter(j => (clientId && j.client_id === clientId) || (poId && j.po_id === poId));
    }

    // Filter items that have batches
    const batchedJOs = clientJOs.filter(j => j.latest_batch_id);

    if (batchedJOs.length === 0) {
        NKB.showToast('No batched products found ready for delivery. Please batch products first.', 'warning');
        closeModal();
        return;
    }

    // Filter items not yet dispatched, or list all batched items
    const pendingDispatchJOs = batchedJOs.filter(j => !j.latest_dr_number);
    const itemsToRender = pendingDispatchJOs.length > 0 ? pendingDispatchJOs : batchedJOs;

    const clientCompName = companyName || itemsToRender[0]?.company_name || 'Client Order';
    const primaryPoId = poId || itemsToRender[0]?.po_id;
    const primaryPoNum = itemsToRender[0]?.po_number || '';
    const clientSO = primaryPoNum ? primaryPoNum.replace('PO-', 'SO-') : 'SO-2026-000001';

    const itemsRowsHtml = itemsToRender.map((jo, idx) => {
        const defaultQty = jo.total_yield || jo.target_quantity;
        const alreadyDispatched = !!jo.latest_dr_number;
        return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0 dr-item-row"
            data-jo-id="${jo.id}" data-product-id="${jo.product_id}" data-batch-id="${jo.latest_batch_id}">
            <td class="py-2.5 px-3 font-mono font-bold text-indigo-600">${jo.jo_number}</td>
            <td class="py-2.5 px-3 font-mono font-bold text-purple-700">
                <span class="px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 rounded-md font-mono text-[11px]">
                    ${jo.latest_batch_number || 'BAT-PENDING'}
                </span>
            </td>
            <td class="py-2.5 px-3">
                <div class="font-bold text-slate-800">${jo.product_name}</div>
                ${jo.sku ? `<div class="text-[10px] text-slate-400 font-mono">SKU: ${jo.sku}</div>` : ''}
            </td>
            <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                ${NKB.formatNumber(defaultQty)} pcs
            </td>
            <td class="py-2.5 px-3 text-right">
                ${alreadyDispatched ? `
                    <span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-xs font-mono font-bold">
                        Dispatched (${jo.latest_dr_number})
                    </span>
                ` : `
                    <input type="number" min="1" max="${Math.ceil(defaultQty * 1.2)}" value="${defaultQty}" required
                        class="dr-item-qty w-28 px-2.5 py-1 text-xs border rounded-lg bg-emerald-50 border-emerald-300 font-bold text-emerald-900 text-right">
                `}
            </td>
        </tr>
        `;
    }).join('');

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-5 my-8 max-h-[92vh] flex flex-col">
                <!-- Header -->
                <div class="flex justify-between items-center border-b border-slate-100 pb-3 flex-shrink-0">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-2xl">🚚</span>
                            <h3 class="text-xl font-black text-slate-900">Issue Delivery Receipt & Dispatch (All Products)</h3>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">
                            Client: <strong class="text-indigo-600">${clientCompName}</strong> • SO: <strong class="font-mono text-slate-800">${clientSO}</strong> • PO: <strong class="font-mono text-slate-800">${primaryPoNum}</strong>
                        </p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl px-2">&times;</button>
                </div>

                <form onsubmit="submitCreateAllDR(event, '${primaryPoId}', '${clientCompName.replace(/'/g, "\\'")}')" class="space-y-4 text-xs font-semibold flex-1 overflow-y-auto pr-1">
                    <!-- Logistics Information -->
                    <div class="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                                <span>🚛</span><span>Logistics & Dispatch Details</span>
                            </span>
                            <span class="text-[11px] text-emerald-700 font-medium">Single unified delivery receipt for client order</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label class="block text-slate-600 mb-1">Driver Name *</label>
                                <input type="text" id="dr-all-driver-name" value="Danilo Gomez" required class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                            </div>
                            <div>
                                <label class="block text-slate-600 mb-1">Vehicle Plate *</label>
                                <input type="text" id="dr-all-vehicle-plate" value="NKB-8899" required class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                            </div>
                            <div>
                                <label class="block text-slate-600 mb-1">Dispatch Date *</label>
                                <input type="date" id="dr-all-delivery-date" value="${NKB.getManilaDate()}" required class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                            </div>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Dispatch Notes / Packaging Inspection</label>
                            <input type="text" id="dr-all-notes" value="Dispatched in protective shrink-wrapped master boxes. Cleanroom QC inspected." class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                        </div>
                    </div>

                    <!-- Batched Products Table -->
                    <div class="space-y-2">
                        <div class="flex justify-between items-center px-1">
                            <span class="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <span>📦</span><span>Batched Products Ready for Dispatch (${itemsToRender.length} Items)</span>
                            </span>
                        </div>
                        <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                                    <tr>
                                        <th class="py-2.5 px-3">JO Ref</th>
                                        <th class="py-2.5 px-3">Batch Number</th>
                                        <th class="py-2.5 px-3">Product Name & SKU</th>
                                        <th class="py-2.5 px-3 text-right">Available Yield</th>
                                        <th class="py-2.5 px-3 text-right">Delivered Qty (pcs)</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 font-medium">
                                    ${itemsRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Footer Actions -->
                    <div class="flex justify-between items-center pt-3 border-t border-slate-100 flex-shrink-0">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">
                            Cancel
                        </button>
                        <button type="submit" id="btn-submit-all-dr" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center gap-2">
                            <span>🚚 Issue DR & Dispatch (${itemsToRender.length} Products)</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateAllDR(e, poId, companyName) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-all-dr');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Creating Delivery Receipt...</span>';
    }

    const driverName = document.getElementById('dr-all-driver-name')?.value || '';
    const vehiclePlate = document.getElementById('dr-all-vehicle-plate')?.value || '';
    const deliveryDate = document.getElementById('dr-all-delivery-date')?.value || '';
    const notes = document.getElementById('dr-all-notes')?.value || '';

    const items = [];
    document.querySelectorAll('.dr-item-row').forEach(row => {
        const productId = row.dataset.productId;
        const batchId = row.dataset.batchId;
        const qtyInput = row.querySelector('.dr-item-qty');
        const qty = qtyInput ? parseInt(qtyInput.value || '0') : 0;
        if (productId && batchId && qty > 0) {
            items.push({
                product_id: productId,
                batch_id: batchId,
                delivered_quantity: qty
            });
        }
    });

    if (items.length === 0) {
        NKB.showToast('No items selected for delivery.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🚚 Issue DR & Dispatch</span>';
        }
        return;
    }

    const res = await NKB.api('/api/deliveries', {
        method: 'POST',
        body: JSON.stringify({
            po_id: poId,
            driver_name: driverName,
            vehicle_plate: vehiclePlate,
            delivery_date: deliveryDate,
            notes: notes,
            items: items
        })
    });

    if (res.success) {
        NKB.showToast(`🎉 Delivery Receipt ${res.data.dr_number} issued for ${companyName}!`, 'success');
        closeModal();
        if (typeof loadJobOrders === 'function') loadJobOrders();
        if (typeof loadOrders === 'function') loadOrders();
        if (typeof loadDeliveries === 'function') loadDeliveries();
        if (typeof switchTab === 'function') {
            switchTab('deliveries');
        }
    } else {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🚚 Issue DR & Dispatch</span>';
        }
        NKB.showToast(res.error || 'Failed to create Delivery Receipt.', 'error');
    }
}

window.openCreateAllDRModal = openCreateAllDRModal;
window.submitCreateAllDR = submitCreateAllDR;

// 6c. Select Batch for DR Modal (Direct from Deliveries Tab)
async function openSelectBatchForDRModal() {
    const root = document.getElementById('modals-root');
    if (!root) return;
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">🚚</span>
                        <div>
                            <h3 class="text-lg font-bold text-slate-900">Create Delivery Receipt</h3>
                            <p class="text-[11px] text-slate-500">Select an approved batch ready for dispatch or client delivery.</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <div id="ready-batches-list" class="overflow-y-auto flex-1 space-y-2.5 pr-1 min-h-[150px]">
                    <div class="p-8 text-center text-slate-400">Loading production batches...</div>
                </div>
                <div class="flex justify-end pt-3 border-t border-slate-100">
                    <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">Cancel</button>
                </div>
            </div>
        </div>
    `;

    const res = await NKB.api('/api/production/batches');
    const container = document.getElementById('ready-batches-list');
    if (!container) return;

    if (!res.success || !res.data || res.data.length === 0) {
        container.innerHTML = `
            <div class="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                <div class="text-2xl">🧪</div>
                <div class="font-bold text-slate-800">No production batches found</div>
                <p class="text-xs text-slate-500">Create a Job Order and log QC yield to make batches ready for dispatch.</p>
                <button onclick="closeModal(); switchTab('job-orders')" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold">Go to Job Orders</button>
            </div>
        `;
        return;
    }

    // Filter batches ready for delivery (QC_PASSED, APPROVED_FOR_DISPATCH, or COMPLETED)
    const readyBatches = res.data.filter(b => b.status === 'APPROVED_FOR_DISPATCH' || b.status === 'QC_PASSED' || b.status === 'COMPLETED');
    const displayBatches = readyBatches.length > 0 ? readyBatches : res.data;

    container.innerHTML = displayBatches.map(b => `
        <div class="p-3.5 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 rounded-xl transition flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div class="space-y-1 text-xs">
                <div class="flex items-center gap-2">
                    <strong class="text-indigo-600 font-bold">${b.batch_number}</strong>
                    <span class="badge ${b.status === 'APPROVED_FOR_DISPATCH' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'} font-bold">${b.status}</span>
                </div>
                <div class="font-bold text-slate-800">${b.product_name || 'Product'} (${b.sku || 'SKU'})</div>
                <div class="text-[11px] text-slate-500">
                    <span>PO: <strong>${b.po_number || 'N/A'}</strong></span>
                    ${b.company_name ? ` • <span>Client: <strong>${b.company_name}</strong></span>` : ''}
                    • <span>Yield: <strong class="text-emerald-700">${NKB.formatNumber(b.actual_yield || b.target_quantity)} pcs</strong></span>
                </div>
            </div>
            <button onclick="openCreateDRModal('${b.po_number}', '${b.jo_number}', '${b.id}', '${b.batch_number}', ${b.actual_yield || b.target_quantity}, '${(b.product_name || '').replace(/'/g, "\\'")}', '${b.client_id}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition whitespace-nowrap flex items-center gap-1">
                <span>🚚</span><span>Dispatch & Issue DR →</span>
            </button>
        </div>
    `).join('');
}
window.openSelectBatchForDRModal = openSelectBatchForDRModal;

// 6d. Edit Delivery Receipt Details Modal
async function openEditDRModal(drId) {
    const res = await NKB.api(`/api/deliveries/${drId}`);
    if (!res.success || !res.data) {
        NKB.showToast(res.error || 'Failed to load Delivery Receipt.', 'error');
        return;
    }
    const dr = res.data;
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">✏️</span>
                        <div>
                            <h3 class="text-lg font-bold text-slate-900">Edit Delivery Dispatch</h3>
                            <p class="text-[11px] text-slate-500">${dr.dr_number} • ${dr.company_name}</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitEditDR(event, '${dr.id}')" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-slate-50 rounded-xl space-y-1 text-slate-700">
                        <div>Client: <strong class="text-slate-900">${dr.company_name}</strong></div>
                        <div>PO Reference: <strong class="text-slate-900">${dr.po_number}</strong></div>
                        <div>Current Status: <strong class="text-amber-600">${dr.status}</strong></div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Delivery Date</label>
                        <input type="date" id="edit-dr-date" value="${dr.delivery_date ? dr.delivery_date.split('T')[0] : ''}" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Driver Name</label>
                            <input type="text" id="edit-dr-driver" value="${(dr.driver_name || '').replace(/"/g, '&quot;')}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Vehicle Plate</label>
                            <input type="text" id="edit-dr-plate" value="${(dr.vehicle_plate || '').replace(/"/g, '&quot;')}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Dispatch / Logistics Notes</label>
                        <textarea id="edit-dr-notes" rows="3" class="w-full px-3 py-2 border rounded-xl bg-slate-50">${dr.notes || ''}</textarea>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Save Dispatch Updates</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}
window.openEditDRModal = openEditDRModal;

async function submitEditDR(e, drId) {
    e.preventDefault();
    const delivery_date = document.getElementById('edit-dr-date')?.value;
    const driver_name = document.getElementById('edit-dr-driver')?.value;
    const vehicle_plate = document.getElementById('edit-dr-plate')?.value;
    const notes = document.getElementById('edit-dr-notes')?.value;

    const res = await NKB.api(`/api/deliveries/${drId}`, {
        method: 'PUT',
        body: JSON.stringify({ delivery_date, driver_name, vehicle_plate, notes })
    });

    if (res.success) {
        NKB.showToast('Delivery Receipt updated successfully!', 'success');
        closeModal();
        loadDeliveries();
    } else {
        NKB.showToast(res.error || 'Failed to update Delivery Receipt.', 'error');
    }
}
window.submitEditDR = submitEditDR;

// 6e. View Delivery Receipt Details Modal
async function openViewDRModal(drId) {
    const res = await NKB.api(`/api/deliveries/${drId}`);
    if (!res.success || !res.data) {
        NKB.showToast(res.error || 'Failed to load Delivery Receipt details.', 'error');
        return;
    }
    const dr = res.data;
    const items = dr.items || [];
    const acceptance = dr.acceptance;
    const root = document.getElementById('modals-root');

    const userRole = NKB.user?.role;
    const canInvoice = ['ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'CEO'].includes(userRole);
    const canReceive = ['ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'CEO'].includes(userRole);

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">📋</span>
                        <div>
                            <h3 class="text-base font-bold text-slate-900">${dr.dr_number}</h3>
                            <p class="text-[11px] text-slate-500">Issued: ${NKB.formatDate(dr.delivery_date)} • Client: ${dr.company_name}</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>

                <div class="overflow-y-auto flex-1 space-y-4 pr-1 text-xs">
                    <!-- Dispatch Metadata -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 rounded-xl font-medium text-slate-700">
                        <div>
                            <span class="text-[10px] text-slate-400 uppercase block">Status</span>
                            <span>${NKB.renderStatusBadge(dr.status)}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-400 uppercase block">PO Reference</span>
                            <span class="font-bold text-slate-900">${dr.po_number || 'N/A'}</span>
                            ${dr.so_number ? `<span class="text-[10px] font-mono text-slate-500 font-bold block">SO: ${dr.so_number}</span>` : ''}
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-400 uppercase block">Driver</span>
                            <span class="font-bold text-slate-900">${dr.driver_name || '—'}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-400 uppercase block">Plate No.</span>
                            <span class="font-bold text-slate-900">${dr.vehicle_plate || '—'}</span>
                        </div>
                    </div>

                    ${dr.notes ? `
                        <div class="p-2.5 bg-amber-50/70 border border-amber-200/50 rounded-xl text-amber-900">
                            <strong>Dispatch Notes:</strong> ${dr.notes}
                        </div>
                    ` : ''}

                    <!-- Items Table -->
                    <div>
                        <h4 class="font-bold text-slate-800 mb-2">Delivered Products & Order Progress</h4>
                        <div class="border border-slate-200 rounded-xl overflow-hidden">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                    <tr>
                                        <th class="py-2.5 px-3">Product</th>
                                        <th class="py-2.5 px-3">Batch</th>
                                        <th class="py-2.5 px-3 min-w-[160px]">Delivery Progress</th>
                                        <th class="py-2.5 px-3 text-right">Accepted</th>
                                        <th class="py-2.5 px-3 text-right">Rejected</th>
                                        <th class="py-2.5 px-3 text-right">Unit Price</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${items.map(it => {
                                        const itemDelivered = it.delivered_quantity || 0;
                                        const itemTarget = it.po_target_quantity || itemDelivered;
                                        const itemCumul = it.cumulative_delivered_quantity || itemDelivered;
                                        const isPartial = itemCumul < itemTarget;
                                        const label = isPartial ? `Initial: ${NKB.formatNumber(itemDelivered)} pcs` : 'Completed';
                                        return `
                                        <tr>
                                            <td class="py-2.5 px-3 font-semibold text-slate-800">
                                                <div>${it.product_name || 'Product'}</div>
                                                ${it.sku ? `<div class="text-[10px] text-slate-400 font-mono">SKU: ${it.sku}</div>` : ''}
                                            </td>
                                            <td class="py-2.5 px-3 text-indigo-600 font-bold font-mono">${it.batch_number || '—'}</td>
                                            <td class="py-2.5 px-3">
                                                ${NKB.renderDeliveryProgressBar(itemCumul, itemTarget, { compact: true, label })}
                                            </td>
                                            <td class="py-2.5 px-3 text-right font-extrabold text-emerald-700">${it.accepted_quantity > 0 ? NKB.formatNumber(it.accepted_quantity) + ' pcs' : '—'}</td>
                                            <td class="py-2.5 px-3 text-right font-bold text-rose-600">${it.rejected_quantity > 0 ? NKB.formatNumber(it.rejected_quantity) + ' pcs' : '0'}</td>
                                            <td class="py-2.5 px-3 text-right text-slate-600">${NKB.formatCurrency(it.unit_price)}</td>
                                        </tr>
                                    `}).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Digital Client Acceptance Section -->
                    ${acceptance ? `
                        <div class="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 text-emerald-950">
                            <div class="flex items-center gap-2">
                                <span class="text-base">✍️</span>
                                <strong class="text-emerald-900 font-bold">Client Acceptance Recorded</strong>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-xs">
                                <div>Signer: <strong>${acceptance.signer_name}</strong> (${acceptance.signer_title || 'Authorized Signatory'})</div>
                                <div>Accepted At: <strong>${NKB.formatDate(acceptance.signed_at || acceptance.created_at)}</strong></div>
                            </div>
                            ${acceptance.acceptance_notes ? `<div>Notes: <em>${acceptance.acceptance_notes}</em></div>` : ''}
                        </div>
                    ` : `
                        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs flex justify-between items-center">
                            <div>
                                <span class="font-bold text-slate-800 block">⏳ Awaiting Client Product Receiving</span>
                                <span class="text-[11px] text-slate-500">Products are out for delivery / awaiting signed receipt.</span>
                            </div>
                            ${(canReceive && dr.status !== 'CANCELLED') ? `
                                <button onclick="closeModal(); openClientReceivingModal('${dr.id}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition shadow-sm flex items-center gap-1">
                                    <span>📥</span> Record Receiving
                                </button>
                            ` : ''}
                        </div>
                    `}
                </div>

                <div class="flex justify-between items-center pt-3 border-t border-slate-100">
                    <div class="flex items-center gap-2">
                        <a href="/print-dr.html?id=${dr.id}" class="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1">
                            🖨️ Print DR
                        </a>
                        ${(dr.status === 'ACCEPTED' && canInvoice) ? `
                            <button onclick="closeModal(); openGenerateInvoiceModal('${dr.id}', '${dr.dr_number}', '${dr.company_name}', ${dr.total_accepted})" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm">
                                ⚡ Generate Sales Invoice
                            </button>
                        ` : ''}
                    </div>
                    <button type="button" onclick="closeModal()" class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition">Close</button>
                </div>
            </div>
        </div>
    `;
}
window.openViewDRModal = openViewDRModal;

// 6f. Record Client Product Receiving Modal (Assigned to Accounting & Admin)
async function openClientReceivingModal(drId) {
    const res = await NKB.api(`/api/deliveries/${drId}`);
    if (!res.success || !res.data) {
        NKB.showToast(res.error || 'Failed to load Delivery Receipt for receiving.', 'error');
        return;
    }
    const dr = res.data;
    const items = dr.items || [];
    const root = document.getElementById('modals-root');

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">📥</span>
                        <div>
                            <h3 class="text-base font-bold text-slate-900">Record Client Product Receiving</h3>
                            <p class="text-[11px] text-slate-500">${dr.dr_number} • ${dr.company_name} • PO: ${dr.po_number || 'N/A'}</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>

                <form onsubmit="submitClientReceiving(event, '${dr.id}')" class="space-y-4 text-xs font-semibold overflow-y-auto flex-1 pr-1">
                    <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 text-emerald-950">
                        <div class="font-bold text-emerald-900 flex items-center gap-1.5">
                            <span>✅</span> Assigned to Senior Accountant & Administration
                        </div>
                        <p class="text-[11px] text-emerald-800 font-normal leading-relaxed">
                            Verify and record the client's physical receiving of goods (e.g. from signed Delivery Receipt / receiving report). 
                            Confirming this marks the delivery as <strong>ACCEPTED</strong> and makes it immediately ready for official Sales Invoicing.
                        </p>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-700 mb-1">Receiver Name <span class="text-rose-500">*</span></label>
                            <input type="text" id="admin-recv-signer-name" placeholder="e.g. Client Receiving Officer / Manager" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 text-slate-900 font-bold">
                        </div>
                        <div>
                            <label class="block text-slate-700 mb-1">Receiver Title / Designation</label>
                            <input type="text" id="admin-recv-signer-title" placeholder="e.g. Warehouse Custodian / Store Head" value="Authorized Client Signatory" class="w-full px-3 py-2 border rounded-xl bg-slate-50 text-slate-900">
                        </div>
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1">Receiving Notes / Client Remarks</label>
                        <textarea id="admin-recv-notes" rows="2" placeholder="e.g. Goods received in good order and condition per signed physical DR" class="w-full px-3 py-2 border rounded-xl bg-slate-50 text-slate-800 font-normal">Confirmed per signed physical DR / client receiving inspection.</textarea>
                    </div>

                    <div>
                        <div class="flex justify-between items-center mb-1.5">
                            <label class="block text-slate-700 font-bold">Delivered Items & Quantities</label>
                            <span class="text-[11px] text-slate-500">Specify accepted vs rejected units</span>
                        </div>
                        <div class="border border-slate-200 rounded-xl overflow-hidden">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                    <tr>
                                        <th class="py-2.5 px-3">Product</th>
                                        <th class="py-2.5 px-3 min-w-[150px]">Delivered & Progress</th>
                                        <th class="py-2.5 px-3 text-right w-28">Accepted (pcs)</th>
                                        <th class="py-2.5 px-3 text-right w-24">Rejected</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${items.map(it => `
                                        <tr>
                                            <td class="py-2.5 px-3">
                                                <div class="font-bold text-slate-800">${it.product_name || 'Product'}</div>
                                                <div class="text-[10px] text-indigo-600 font-mono">Batch: ${it.batch_number || '—'}</div>
                                            </td>
                                            <td class="py-2.5 px-3">
                                                <div class="font-extrabold text-slate-900 text-xs mb-1 text-right font-mono">${NKB.formatNumber(it.delivered_quantity)} pcs</div>
                                                ${NKB.renderDeliveryProgressBar(it.cumulative_delivered_quantity || it.delivered_quantity, it.po_target_quantity || it.delivered_quantity, { compact: true })}
                                            </td>
                                            <td class="py-2.5 px-3 text-right">
                                                <input type="number" id="admin-recv-accept-${it.id}" min="0" max="${it.delivered_quantity}" value="${it.delivered_quantity}"
                                                    oninput="validateAdminRecvCounts('${it.id}', ${it.delivered_quantity})"
                                                    class="w-24 px-2 py-1 border border-emerald-300 rounded-lg text-right font-extrabold text-emerald-700 bg-emerald-50/50">
                                            </td>
                                            <td class="py-2.5 px-3 text-right">
                                                <input type="number" id="admin-recv-reject-${it.id}" min="0" max="${it.delivered_quantity}" value="0"
                                                    oninput="validateAdminRecvRejectCounts('${it.id}', ${it.delivered_quantity})"
                                                    class="w-20 px-2 py-1 border border-rose-300 rounded-lg text-right font-bold text-rose-700 bg-rose-50/50">
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow">
                            <span>📥</span> Confirm Receiving & Accept DR
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}
window.openClientReceivingModal = openClientReceivingModal;

function validateAdminRecvCounts(itemId, deliveredQty) {
    const acceptInput = document.getElementById(`admin-recv-accept-${itemId}`);
    const rejectInput = document.getElementById(`admin-recv-reject-${itemId}`);
    if (!acceptInput || !rejectInput) return;
    const acceptVal = parseInt(acceptInput.value) || 0;
    rejectInput.value = Math.max(0, deliveredQty - acceptVal);
}
window.validateAdminRecvCounts = validateAdminRecvCounts;

function validateAdminRecvRejectCounts(itemId, deliveredQty) {
    const acceptInput = document.getElementById(`admin-recv-accept-${itemId}`);
    const rejectInput = document.getElementById(`admin-recv-reject-${itemId}`);
    if (!acceptInput || !rejectInput) return;
    const rejectVal = parseInt(rejectInput.value) || 0;
    acceptInput.value = Math.max(0, deliveredQty - rejectVal);
}
window.validateAdminRecvRejectCounts = validateAdminRecvRejectCounts;

async function submitClientReceiving(e, drId) {
    e.preventDefault();
    const signerName = document.getElementById('admin-recv-signer-name')?.value?.trim();
    const signerTitle = document.getElementById('admin-recv-signer-title')?.value?.trim();
    const remarks = document.getElementById('admin-recv-notes')?.value?.trim();

    if (!signerName) {
        NKB.showToast('Receiver name is required.', 'error');
        return;
    }

    const acceptInputs = document.querySelectorAll('[id^="admin-recv-accept-"]');
    const items = [];
    let totalAccepted = 0;

    acceptInputs.forEach(input => {
        const itemId = input.id.replace('admin-recv-accept-', '');
        const rejectInput = document.getElementById(`admin-recv-reject-${itemId}`);
        const accQty = parseInt(input.value) || 0;
        const rejQty = rejectInput ? (parseInt(rejectInput.value) || 0) : 0;
        totalAccepted += accQty;
        items.push({
            id: itemId,
            accepted_quantity: accQty,
            rejected_quantity: rejQty,
            reason: rejQty > 0 ? 'Defective or rejected upon delivery inspection' : undefined
        });
    });

    const res = await NKB.api(`/api/deliveries/${drId}/accept`, {
        method: 'POST',
        body: JSON.stringify({
            signer_name: signerName,
            signer_title: signerTitle,
            signature_type: 'TYPED',
            items,
            acceptance_notes: remarks
        })
    });

    if (res.success) {
        NKB.showToast(res.message || 'Client product receiving recorded successfully!', 'success');
        closeModal();
        loadDeliveries();

        // Prompt Accountant or Admin to immediately generate invoice
        const canInvoice = ['ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'CEO'].includes(NKB.user?.role);
        if (canInvoice && res.data) {
            setTimeout(() => {
                openGenerateInvoiceModal(drId, res.data.dr_number, res.data.company_name, totalAccepted);
            }, 350);
        }
    } else {
        NKB.showToast(res.error || 'Failed to record product receiving.', 'error');
    }
}
window.submitClientReceiving = submitClientReceiving;

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
    document.getElementById('inv-due-date').value = NKB.getManilaDate(d);
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
                        <input type="number" id="pay-amount" step="0.01" min="0.01" max="${Number(balanceDue).toFixed(2)}" value="${Number(balanceDue).toFixed(2)}" inputmode="decimal" onblur="if(this.value && !isNaN(this.value)) this.value = parseFloat(this.value).toFixed(2)" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-emerald-800">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Payment Method</label>
                            <select id="pay-method" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium">
                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                <option value="CHECK">Check</option>
                                <option value="ONLINE_BANKING">Online Banking</option>
                                <option value="GCASH">GCash</option>
                                <option value="CASH">Cash</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Reference Number</label>
                            <input type="text" id="pay-ref" placeholder="Ref # / Check # / OR # / Txn ID (Optional/Freeform)" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono">
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Notes / Remarks</label>
                        <textarea id="pay-notes" rows="2" placeholder="e.g. Cleared check, BDO branch deposit, payment terms, or receipt details" class="w-full px-3 py-2 border rounded-xl bg-slate-50 text-slate-800 font-normal"></textarea>
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
    const amountEl = document.getElementById('pay-amount');
    const amount = amountEl ? parseFloat(amountEl.value) : 0;
    const method = document.getElementById('pay-method')?.value;
    const ref = document.getElementById('pay-ref')?.value?.trim() || '';
    const notes = document.getElementById('pay-notes')?.value?.trim() || '';

    const res = await NKB.api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
            invoice_id: invoiceId,
            amount,
            payment_method: method,
            reference_number: ref,
            notes
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

                    <!-- Vyuceutical OPC Affiliation -->
                    <div class="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-1">
                        <label class="flex items-center gap-2 font-bold text-purple-900 cursor-pointer text-xs">
                            <input type="checkbox" id="client-is-vyuceutical" class="rounded border-purple-300 text-purple-600 focus:ring-purple-500">
                            <span>Affiliated Under Vyuceutical OPC</span>
                        </label>
                        <p class="text-[10px] text-purple-700 leading-normal">
                            When active, official documents will display manufacturer as <strong>VYUCEUTICAL OPC</strong> and the client name as the <strong>contact person</strong>. When creating POs, brands will be selectable and brand prefixes will be removed from product names.
                        </p>
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
    const isVyuceutical = document.getElementById('client-is-vyuceutical').checked ? 1 : 0;
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
            is_vyuceutical_ops: isVyuceutical,
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
                        <a href="/index.html" class="font-mono text-indigo-600 font-bold hover:underline">/index.html</a>
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

let currentUsersSubTab = 'staff';

function switchUsersSubTab(tab) {
    currentUsersSubTab = tab;
    const staffView = document.getElementById('subtab-staff-view');
    const clientsView = document.getElementById('subtab-clients-view');
    const staffBtn = document.getElementById('subtab-staff-btn');
    const clientsBtn = document.getElementById('subtab-clients-btn');

    if (tab === 'staff') {
        if (staffView) staffView.classList.remove('hidden');
        if (clientsView) clientsView.classList.add('hidden');
        if (staffBtn) staffBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-white text-indigo-700 shadow-sm';
        if (clientsBtn) clientsBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-600 hover:text-slate-900';
    } else {
        if (staffView) staffView.classList.add('hidden');
        if (clientsView) clientsView.classList.remove('hidden');
        if (clientsBtn) clientsBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-white text-indigo-700 shadow-sm';
        if (staffBtn) staffBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-600 hover:text-slate-900';
    }
}

function togglePasswordVisibility(userId, pwd) {
    const span = document.getElementById(`pwd-disp-${userId}`);
    const eye = document.getElementById(`pwd-eye-${userId}`);
    if (!span) return;
    if (span.innerText === '••••••••') {
        span.innerText = pwd || '(No Password)';
        span.classList.add('text-indigo-600', 'font-bold');
        if (eye) eye.innerText = '🙈';
    } else {
        span.innerText = '••••••••';
        span.classList.remove('text-indigo-600', 'font-bold');
        if (eye) eye.innerText = '👁️';
    }
}

function copyPassword(pwd) {
    if (!pwd) {
        NKB.showToast('No password set to copy.', 'error');
        return;
    }
    navigator.clipboard.writeText(pwd);
    NKB.showToast('Password copied to clipboard! 📋', 'success');
}

async function loadUsers() {
    const search = document.getElementById('filter-users-search')?.value || '';
    const staffTbody = document.getElementById('table-staff-body');
    const clientsTbody = document.getElementById('table-clients-body');
    const fallbackTbody = document.getElementById('table-users-body');

    if (staffTbody) staffTbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">Loading staff directory...</td></tr>';
    if (clientsTbody) clientsTbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">Loading client accounts...</td></tr>';

    const res = await NKB.api(`/api/users?search=${encodeURIComponent(search)}`);
    if (!res.success || !res.data) {
        if (staffTbody) staffTbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">No staff found.</td></tr>';
        if (clientsTbody) clientsTbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">No clients found.</td></tr>';
        return;
    }

    const roleBadges = {
        'SUPER_ADMIN': 'bg-red-100 text-red-800 border-red-200',
        'IT_ADMIN': 'bg-cyan-100 text-cyan-800 border-cyan-200',
        'CEO': 'bg-purple-100 text-purple-800 border-purple-200',
        'QC': 'bg-teal-100 text-teal-800 border-teal-200',
        'ADMIN': 'bg-indigo-100 text-indigo-800 border-indigo-200',
        'PURCHASING': 'bg-teal-100 text-teal-800 border-teal-200',
        'PRODUCTION': 'bg-amber-100 text-amber-800 border-amber-200',
        'WAREHOUSE': 'bg-purple-100 text-purple-800 border-purple-200',
        'ACCOUNTING': 'bg-emerald-100 text-emerald-800 border-emerald-200',
        'INVENTORY': 'bg-teal-100 text-teal-800 border-teal-200',
        'CLIENT': 'bg-blue-100 text-blue-800 border-blue-200'
    };

    const roleIcons = {
        'SUPER_ADMIN': '🛡️',
        'IT_ADMIN': '💻',
        'CEO': '👔',
        'QC': '🔬',
        'ADMIN': '👑',
        'PURCHASING': '🛒',
        'PRODUCTION': '🧪',
        'WAREHOUSE': '🚚',
        'ACCOUNTING': '💰',
        'INVENTORY': '📦',
        'CLIENT': '🏢'
    };

    const staffUsers = res.data.filter(u => u.role !== 'CLIENT');
    const clientUsers = res.data.filter(u => u.role === 'CLIENT');

    const staffCountEl = document.getElementById('staff-count');
    const clientCountEl = document.getElementById('client-count');
    if (staffCountEl) staffCountEl.innerText = staffUsers.length;
    if (clientCountEl) clientCountEl.innerText = clientUsers.length;

    // Render Staff Table
    if (staffTbody) {
        if (staffUsers.length === 0) {
            staffTbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">No staff members found matching search.</td></tr>';
        } else {
            staffTbody.innerHTML = staffUsers.map(u => `
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
                    <td class="py-3 px-4">
                        <div class="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200 text-xs">
                            <span id="pwd-disp-${u.id}" class="font-mono text-slate-600 select-all tracking-wider">••••••••</span>
                            <button type="button" onclick="togglePasswordVisibility('${u.id}', '${(u.plain_password || '').replace(/'/g, "\\'")}')" title="Show / Hide Password" class="text-slate-400 hover:text-slate-700 ml-1">
                                <span id="pwd-eye-${u.id}">👁️</span>
                            </button>
                            <button type="button" onclick="copyPassword('${(u.plain_password || '').replace(/'/g, "\\'")}')" title="Copy Password" class="text-slate-400 hover:text-slate-700">
                                📋
                            </button>
                        </div>
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
    }

    // Render Clients Table
    if (clientsTbody) {
        if (clientUsers.length === 0) {
            clientsTbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">No client accounts found matching search.</td></tr>';
        } else {
            clientsTbody.innerHTML = clientUsers.map(u => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="py-3 px-4">
                        <div class="font-bold text-slate-900">${u.name}</div>
                        <div class="text-[11px] text-slate-400 font-mono">${u.email}</div>
                    </td>
                    <td class="py-3 px-4 font-semibold text-slate-800">
                        ${u.company_name ? `🏢 ${u.company_name}` : 'Unassigned Client'}
                    </td>
                    <td class="py-3 px-4">
                        <div class="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200 text-xs">
                            <span id="pwd-disp-${u.id}" class="font-mono text-slate-600 select-all tracking-wider">••••••••</span>
                            <button type="button" onclick="togglePasswordVisibility('${u.id}', '${(u.plain_password || '').replace(/'/g, "\\'")}')" title="Show / Hide Password" class="text-slate-400 hover:text-slate-700 ml-1">
                                <span id="pwd-eye-${u.id}">👁️</span>
                            </button>
                            <button type="button" onclick="copyPassword('${(u.plain_password || '').replace(/'/g, "\\'")}')" title="Copy Password" class="text-slate-400 hover:text-slate-700">
                                📋
                            </button>
                        </div>
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
    }

    // Support fallback table if present
    if (fallbackTbody && !staffTbody) {
        fallbackTbody.innerHTML = res.data.map(u => `
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
    const isSuperAdmin = NKB.user && (NKB.user.role === 'SUPER_ADMIN' || NKB.user.role === 'IT_ADMIN');

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
                            <option value="PURCHASING">🛒 Purchasing Department (Raw Materials & Requisitions)</option>
                            <option value="PRODUCTION">🧪 Production Supervisor (Formulas & Batches)</option>
                            <option value="QC">🔬 Quality Control Inspector (QC)</option>
                            <option value="WAREHOUSE">🚚 Logistics & Warehouse (Inventory & DR)</option>
                            <option value="ACCOUNTING">💰 Senior Accountant (Invoices & AR)</option>
                            <option value="INVENTORY">📦 Inventory Officer (Raw Materials & Supplies)</option>
                            <option value="ADMIN">👑 Operations Manager (Admin)</option>
                            ${isSuperAdmin ? `
                                <option value="CEO">👔 Chief Executive Officer (CEO)</option>
                                <option value="IT_ADMIN">💻 IT Administrator (Universal Control)</option>
                                <option value="SUPER_ADMIN">🛡️ Executive Super Admin (Full Control)</option>
                            ` : ''}
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
    const isCurrentUserSuperAdmin = NKB.user && (NKB.user.role === 'SUPER_ADMIN' || NKB.user.role === 'IT_ADMIN');
    const isTargetSuperAdmin = u.role === 'SUPER_ADMIN' || u.role === 'IT_ADMIN';
    const isSelf = NKB.user && NKB.user.id === u.id;

    if (isTargetSuperAdmin && !isCurrentUserSuperAdmin) {
        closeModal();
        alert('Only Super Administrators or IT Administrators have permission to edit Admin accounts.');
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
                                <option value="PURCHASING" ${u.role === 'PURCHASING' ? 'selected' : ''}>🛒 Purchasing Department</option>
                                <option value="PRODUCTION" ${u.role === 'PRODUCTION' ? 'selected' : ''}>🧪 Production Supervisor</option>
                                <option value="QC" ${u.role === 'QC' ? 'selected' : ''}>🔬 Quality Control Inspector</option>
                                <option value="WAREHOUSE" ${u.role === 'WAREHOUSE' ? 'selected' : ''}>🚚 Logistics & Warehouse</option>
                                <option value="ACCOUNTING" ${u.role === 'ACCOUNTING' ? 'selected' : ''}>💰 Senior Accountant</option>
                                <option value="INVENTORY" ${u.role === 'INVENTORY' ? 'selected' : ''}>📦 Inventory Officer</option>
                                <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>👑 Operations Manager</option>
                                ${isCurrentUserSuperAdmin ? `
                                    <option value="CEO" ${u.role === 'CEO' ? 'selected' : ''}>👔 Chief Executive Officer</option>
                                    <option value="IT_ADMIN" ${u.role === 'IT_ADMIN' ? 'selected' : ''}>💻 IT Administrator</option>
                                    <option value="SUPER_ADMIN" ${u.role === 'SUPER_ADMIN' ? 'selected' : ''}>🛡️ Executive Super Admin</option>
                                ` : ''}
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

// Global click-away listener to dismiss PO product suggestions
document.addEventListener('click', (e) => {
    const container = document.getElementById('po-suggestions-container');
    const input = document.getElementById('po-product-search-input');
    const btn = document.getElementById('po-search-btn');
    if (container && !container.classList.contains('hidden')) {
        if (!container.contains(e.target) && e.target !== input && e.target !== btn && !btn?.contains(e.target)) {
            container.classList.add('hidden');
        }
    }
});

// -------------------------------------------------------------
// PURCHASING & RAW MATERIALS REQUISITIONS
// -------------------------------------------------------------
async function loadPurchasingRequisitions() {
    const status = document.getElementById('filter-purchasing-status')?.value || '';
    const urgency = document.getElementById('filter-purchasing-urgency')?.value || '';
    const search = document.getElementById('filter-purchasing-search')?.value || '';
    const tbody = document.getElementById('table-purchasing-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400">Loading supply requisitions...</td></tr>';

    let url = `/api/supply-requests?search=${encodeURIComponent(search)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (urgency) url += `&urgency=${encodeURIComponent(urgency)}`;

    const res = await NKB.api(url);
    if (!res.success || !res.data || res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400">No supply requisitions found.</td></tr>';
        return;
    }

    const statusBadges = {
        'SUBMITTED': 'bg-amber-100 text-amber-800 border-amber-200',
        'ORDERED': 'bg-blue-100 text-blue-800 border-blue-200',
        'IN_TRANSIT': 'bg-purple-100 text-purple-800 border-purple-200',
        'DELIVERED': 'bg-emerald-100 text-emerald-800 border-emerald-200',
        'CANCELLED': 'bg-rose-100 text-rose-800 border-rose-200'
    };

    const urgencyBadges = {
        'CRITICAL': 'bg-rose-100 text-rose-800 border-rose-200 font-black',
        'HIGH': 'bg-amber-100 text-amber-800 border-amber-200 font-bold',
        'NORMAL': 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
    };

    tbody.innerHTML = res.data.map(r => `
        <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-4">
                <div class="font-black text-indigo-700 font-mono">${r.po_number}</div>
                <div class="text-[11px] text-slate-500 font-medium">${r.client_name}</div>
            </td>
            <td class="py-3 px-4 max-w-xs">
                <div class="text-xs font-bold text-slate-800 line-clamp-2">${r.materials_needed}</div>
                ${r.notes ? `<div class="text-[10px] text-slate-400 truncate mt-0.5">${r.notes}</div>` : ''}
            </td>
            <td class="py-3 px-4">
                <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] border ${urgencyBadges[r.urgency] || 'bg-slate-100 text-slate-700'}">
                    ${r.urgency}
                </span>
            </td>
            <td class="py-3 px-4 font-mono text-slate-600 text-xs">
                ${r.target_date || 'ASAP'}
            </td>
            <td class="py-3 px-4">
                <span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${statusBadges[r.status] || 'bg-slate-100 text-slate-700'}">
                    ${r.status}
                </span>
            </td>
            <td class="py-3 px-4 text-slate-500 text-xs">
                <div>${r.requested_by_name}</div>
                <div class="text-[10px] text-slate-400 font-mono">${NKB.formatDate(r.created_at)}</div>
            </td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
                <button onclick="openUpdateRequisitionModal('${r.id}')" class="px-2.5 py-1 bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-700 rounded-lg text-xs font-bold shadow-sm transition inline-flex items-center gap-1">
                    <span>✏️</span> Manage
                </button>
            </td>
        </tr>
    `).join('');
}

async function openUpdateRequisitionModal(reqId) {
    const res = await NKB.api(`/api/supply-requests/${reqId}`);
    if (!res.success || !res.data) {
        NKB.showToast('Failed to load requisition details.', 'error');
        return;
    }

    const r = res.data;
    const root = document.getElementById('modals-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 text-base font-bold">🛒</div>
                        <div>
                            <h3 class="text-base font-extrabold text-slate-900">Manage Supply Requisition</h3>
                            <p class="text-[11px] text-slate-500">${r.po_number} • ${r.client_name}</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition">✕</button>
                </div>

                <div class="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
                    <div class="font-bold text-slate-700">Materials Needed:</div>
                    <div class="text-slate-900 font-medium">${r.materials_needed}</div>
                    <div class="text-[11px] text-slate-500 pt-1">Requested by: <b>${r.requested_by_name}</b> | Urgency: <b class="text-rose-600">${r.urgency}</b></div>
                </div>

                <form onsubmit="submitUpdateRequisition(event, '${r.id}')" class="space-y-3.5 text-xs">
                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Procurement Status <span class="text-rose-500">*</span></label>
                        <select id="req-update-status" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 transition">
                            <option value="SUBMITTED" ${r.status === 'SUBMITTED' ? 'selected' : ''}>⚠️ SUBMITTED (Sourcing Supplier)</option>
                            <option value="ORDERED" ${r.status === 'ORDERED' ? 'selected' : ''}>📦 ORDERED (PO Issued to Vendor)</option>
                            <option value="IN_TRANSIT" ${r.status === 'IN_TRANSIT' ? 'selected' : ''}>🚚 IN TRANSIT (Shipped by Vendor)</option>
                            <option value="DELIVERED" ${r.status === 'DELIVERED' ? 'selected' : ''}>✅ DELIVERED (Received at Warehouse & Fulfilled)</option>
                            <option value="CANCELLED" ${r.status === 'CANCELLED' ? 'selected' : ''}>❌ CANCELLED</option>
                        </select>
                        <p class="text-[10px] text-slate-400 mt-1">Marking as DELIVERED unblocks production and updates PO raw materials to SUFFICIENT.</p>
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Supplier / Order Tracking Details</label>
                        <input type="text" id="req-update-supplier" placeholder="e.g., Croda Chemicals / PO# 88492 / ETA Friday" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 transition">
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Expected Arrival Date</label>
                        <input type="date" id="req-update-target-date" value="${r.target_date || ''}" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 transition">
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Procurement Notes / Instructions</label>
                        <textarea id="req-update-notes" rows="2" placeholder="Additional vendor or quality inspection notes..." class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 transition"></textarea>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">Cancel</button>
                        <button type="submit" id="btn-update-req-submit" class="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-bold shadow-lg shadow-teal-600/20 transition">Save Status Update</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitUpdateRequisition(e, reqId) {
    e.preventDefault();
    const status = document.getElementById('req-update-status')?.value;
    const supplier_details = document.getElementById('req-update-supplier')?.value.trim();
    const target_date = document.getElementById('req-update-target-date')?.value || null;
    const notes = document.getElementById('req-update-notes')?.value.trim();

    const submitBtn = document.getElementById('btn-update-req-submit');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Updating...';
    }

    try {
        const res = await NKB.api(`/api/supply-requests/${reqId}`, {
            method: 'PUT',
            body: JSON.stringify({ status, supplier_details, target_date, notes })
        });

        if (res.success) {
            NKB.showToast(res.message || 'Requisition status updated successfully!', 'success');
            closeModal();
            loadPurchasingRequisitions();
            if (typeof loadOrders === 'function') loadOrders();
            if (window.NKB_Agents && window.NKB_Agents.refreshPendingNotifications) {
                window.NKB_Agents.refreshPendingNotifications();
            }
        } else {
            NKB.showToast(res.message || res.error || 'Failed to update requisition.', 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Save Status Update';
            }
        }
    } catch (err) {
        NKB.showToast('Network error updating requisition.', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save Status Update';
        }
    }
}

// -------------------------------------------------------------
// 12. PROPRIETARY FORMULATIONS & BILL OF MATERIALS (BOM)
// -------------------------------------------------------------
let cachedFormulations = [];

async function loadFormulations() {
    const tbody = document.getElementById('table-formulations-body');
    const convertedTbody = document.getElementById('table-converted-orders-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400 font-bold">Loading formulations & chemical recipes...</td></tr>';
    }
    if (convertedTbody) {
        convertedTbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400 font-bold">Loading order material conversions...</td></tr>';
    }

    try {
        const [formRes, ordersRes] = await Promise.all([
            NKB.api('/api/formulations'),
            NKB.api('/api/orders')
        ]);

        if (formRes.success && formRes.data) {
            cachedFormulations = formRes.data;
            renderFormulationsTable(cachedFormulations);

            const totalFormulas = cachedFormulations.length;
            let totalIngredients = 0;
            cachedFormulations.forEach(f => {
                totalIngredients += Number(f.ingredient_count || (f.ingredients ? f.ingredients.length : 0));
            });

            const kpiCount = document.getElementById('kpi-formulations-count');
            if (kpiCount) kpiCount.textContent = totalFormulas;
            const kpiIng = document.getElementById('kpi-formulations-ingredients');
            if (kpiIng) kpiIng.textContent = totalIngredients;
            const counter = document.getElementById('formulations-table-counter');
            if (counter) counter.textContent = `${totalFormulas} formulas`;
        } else {
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-rose-500 font-bold">${formRes.error || 'Failed to load formulations.'}</td></tr>`;
        }

        if (ordersRes.success && ordersRes.data) {
            const allOrders = ordersRes.data;
            const convertedOrders = allOrders.filter(po => po.accounting_confirmed === 1 || po.formulation_converted === 1);

            const kpiConverted = document.getElementById('kpi-formulations-converted-orders');
            if (kpiConverted) kpiConverted.textContent = convertedOrders.length;

            if (convertedTbody) {
                if (allOrders.length === 0) {
                    convertedTbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">No purchase orders found.</td></tr>';
                } else {
                    convertedTbody.innerHTML = allOrders.slice(0, 15).map(po => {
                        const itemsSummary = (po.items && po.items.length > 0)
                            ? po.items.map(it => `<span class="inline-block bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-700 font-semibold mr-1 mb-1">${it.product_name} (${NKB.formatNumber(it.target_quantity)} pcs)</span>`).join('')
                            : '<span class="text-slate-400">No items</span>';

                        const isConfirmed = po.accounting_confirmed === 1;
                        const isConverted = po.formulation_converted === 1 || isConfirmed;

                        return `
                            <tr class="hover:bg-slate-50 transition">
                                <td class="py-3 px-4 whitespace-nowrap">
                                    <span class="font-bold text-indigo-600 cursor-pointer hover:underline" onclick="openViewPOModal('${po.id}')">${po.po_number}</span>
                                    ${po.so_number ? `<span class="block text-[10px] font-mono text-purple-700 font-bold">${po.so_number}</span>` : ''}
                                </td>
                                <td class="py-3 px-4 font-bold text-slate-800">
                                    ${po.company_name || '—'}
                                </td>
                                <td class="py-3 px-4 max-w-xs">
                                    <div class="line-clamp-2">${itemsSummary}</div>
                                </td>
                                <td class="py-3 px-4 text-center whitespace-nowrap">
                                    ${isConfirmed ? `
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                                            ✓ Confirmed
                                        </span>
                                    ` : `
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                                            ⏳ Pending Acct
                                        </span>
                                    `}
                                </td>
                                <td class="py-3 px-4 text-center whitespace-nowrap">
                                    ${isConverted ? `
                                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-teal-100 text-teal-800 border border-teal-300 inline-flex items-center gap-1">
                                            🧪 Auto-Converted
                                        </span>
                                    ` : `
                                        <span class="text-slate-400 text-[11px] italic">Awaiting Confirmation</span>
                                    `}
                                </td>
                                <td class="py-3 px-4 text-right whitespace-nowrap">
                                    ${isConfirmed ? `
                                        <a href="/print-formulation-receipt.html?id=${po.id}" target="_blank" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-500/20 transition inline-flex items-center gap-1.5">
                                            <span>🧪 Print Receipt</span>
                                        </a>
                                    ` : `
                                        <button disabled class="px-2.5 py-1 bg-slate-100 text-slate-400 rounded-lg text-xs font-medium cursor-not-allowed">
                                            Requires Confirmation
                                        </button>
                                    `}
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }
        }
    } catch (err) {
        console.error('Error loading formulations:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-rose-500 font-bold">Error loading formulations.</td></tr>`;
    }
}

function renderFormulationsTable(list) {
    const tbody = document.getElementById('table-formulations-body');
    if (!tbody) return;

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400 font-medium">No formulation recipes found matching criteria.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(f => `
        <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-4 font-mono font-black text-indigo-700 whitespace-nowrap">
                ${f.formula_code}
            </td>
            <td class="py-3 px-4">
                <div class="font-black text-slate-900 text-xs">${f.name || f.product_name}</div>
                <div class="text-[10px] text-slate-500 font-mono">${f.product_sku ? `SKU: ${f.product_sku}` : ''}</div>
            </td>
            <td class="py-3 px-4 whitespace-nowrap">
                <span class="badge bg-slate-100 text-slate-700 font-semibold">${f.product_category || 'Cosmetics'}</span>
            </td>
            <td class="py-3 px-4 text-center font-mono font-bold text-slate-800 whitespace-nowrap">
                ${f.base_dose_qty} ${f.base_unit}
            </td>
            <td class="py-3 px-4 text-center whitespace-nowrap">
                <span class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200">
                    ⚗️ ${f.ingredient_count || (f.ingredients ? f.ingredients.length : 0)} ingredients
                </span>
            </td>
            <td class="py-3 px-4 text-center whitespace-nowrap">
                <span class="px-2 py-0.5 rounded-full text-[9.5px] font-black bg-rose-50 text-rose-700 border border-rose-200 tracking-wide uppercase">
                    🔒 STRICT STAFF ONLY
                </span>
            </td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
                <button onclick="openViewFormulationModal('${f.product_id}')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 shadow-sm">
                    <span>🔬 View Recipe</span>
                </button>
            </td>
        </tr>
    `).join('');
}

function filterFormulationsTable() {
    const term = (document.getElementById('filter-formulation-search')?.value || '').trim().toLowerCase();
    if (!term) {
        renderFormulationsTable(cachedFormulations);
        return;
    }
    const filtered = cachedFormulations.filter(f => 
        (f.formula_code && f.formula_code.toLowerCase().includes(term)) ||
        (f.name && f.name.toLowerCase().includes(term)) ||
        (f.product_name && f.product_name.toLowerCase().includes(term)) ||
        (f.product_sku && f.product_sku.toLowerCase().includes(term)) ||
        (f.product_category && f.product_category.toLowerCase().includes(term))
    );
    renderFormulationsTable(filtered);
}

async function openViewFormulationModal(productId) {
    const root = document.getElementById('modals-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 my-auto">
                <div class="flex items-center gap-3 text-slate-700 font-bold text-sm">
                    <span class="animate-spin text-xl">🧪</span>
                    <span>Retrieving Confidential Formulation & BOM...</span>
                </div>
            </div>
        </div>
    `;

    try {
        const res = await NKB.api(`/api/formulations/${productId}`);
        if (!res.success || !res.data) {
            NKB.showToast(res.error || 'Failed to load formulation details.', 'error');
            closeModal();
            return;
        }

        const data = res.data;
        const formulation = data.formulation || data;
        const ingredients = data.ingredients || formulation.ingredients || [];
        const prodName = data.product_name || formulation.product_name || (data.product && data.product.name) || formulation.name;
        const prodSku = data.product_sku || formulation.product_sku || (data.product && data.product.sku) || formulation.formula_code || 'N/A';

        const phases = {};
        ingredients.forEach(ing => {
            const p = ing.phase || 'Phase A';
            if (!phases[p]) phases[p] = [];
            phases[p].push(ing);
        });

        root.innerHTML = `
            <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
                <div class="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 my-auto max-h-[92vh] flex flex-col">
                    <div class="flex justify-between items-start border-b border-slate-100 pb-3 flex-shrink-0">
                        <div class="flex items-center gap-3">
                            <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center text-xl shadow-md shadow-indigo-500/20">
                                🧪
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h3 class="text-base font-black text-slate-900">${formulation.name}</h3>
                                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-800 border border-rose-300 uppercase tracking-wide">
                                        🔒 CONFIDENTIAL BOM
                                    </span>
                                </div>
                                <p class="text-xs text-slate-500 font-medium mt-0.5">Formula Code: <strong class="font-mono text-indigo-700">${formulation.formula_code}</strong> • Standard Batch Dose: <strong class="font-mono text-slate-800">${formulation.base_dose_qty} ${formulation.base_unit}</strong></p>
                            </div>
                        </div>
                        <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-2xl leading-none">&times;</button>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-shrink-0">
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span class="text-[10px] text-slate-400 uppercase font-bold block">Target Product</span>
                            <div class="font-black text-slate-900 text-xs mt-0.5">${prodName}</div>
                            <div class="text-[10px] font-mono text-indigo-700 font-bold mt-0.5">SKU: ${prodSku}</div>
                        </div>
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span class="text-[10px] text-slate-400 uppercase font-bold block">Chemical Stability & Yield</span>
                            <div class="font-bold text-emerald-700 text-xs mt-0.5">Cleanroom Grade Tested</div>
                            <div class="text-[10px] text-slate-500 mt-0.5">${ingredients.length} Active Ingredients</div>
                        </div>
                        <div class="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                            <span class="text-[10px] text-emerald-800 uppercase font-bold block">Live Inventory Synced</span>
                            <div class="font-mono font-bold text-emerald-900 text-[11px] mt-0.5 truncate">Key: nkb_inv_live_6ae...</div>
                            <div class="text-[10px] text-emerald-700 font-medium">Automatic BOM translation active</div>
                        </div>
                    </div>

                    <div class="overflow-y-auto flex-1 space-y-4 border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                        ${Object.keys(phases).map(phaseName => {
                            const phaseItems = phases[phaseName];
                            const phasePct = phaseItems.reduce((acc, it) => acc + Number(it.percentage || 0), 0);
                            return `
                                <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                    <div class="bg-slate-100 px-4 py-2 flex justify-between items-center border-b border-slate-200">
                                        <span class="font-black text-slate-800 text-xs">${phaseName}</span>
                                        <span class="text-[11px] font-mono font-bold text-indigo-700">Subtotal: ${phasePct.toFixed(2)}%</span>
                                    </div>
                                    <table class="w-full text-left text-xs">
                                        <thead class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                                            <tr>
                                                <th class="py-2 px-3">Material Code</th>
                                                <th class="py-2 px-3">Material Name / INCI</th>
                                                <th class="py-2 px-3 text-center">% w/w</th>
                                                <th class="py-2 px-3 text-right">Dose / Unit</th>
                                                <th class="py-2 px-3 text-right">Est. Unit Cost</th>
                                                <th class="py-2 px-3">Application Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-slate-100 font-medium">
                                            ${phaseItems.map(item => `
                                                <tr class="hover:bg-slate-50">
                                                    <td class="py-2 px-3 font-mono font-bold text-slate-800 text-[11px] whitespace-nowrap">${item.material_code}</td>
                                                    <td class="py-2 px-3 font-bold text-slate-900">${item.material_name}</td>
                                                    <td class="py-2 px-3 text-center font-mono font-bold text-indigo-700">${Number(item.percentage).toFixed(2)}%</td>
                                                    <td class="py-2 px-3 text-right font-mono font-black text-slate-900">${Number(item.quantity_per_unit).toFixed(4)} ${item.unit}</td>
                                                    <td class="py-2 px-3 text-right font-mono text-emerald-700 font-bold">₱${(Number(item.unit_cost) || 0).toFixed(2)}</td>
                                                    <td class="py-2 px-3 text-slate-500 text-[11px]">${item.notes || '—'}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `;
                        }).join('')}

                        ${formulation.instructions ? `
                            <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                                <span class="font-bold text-amber-900 block uppercase text-[10px] tracking-wider">🔬 Compounding & Mixing Instructions:</span>
                                <p class="text-slate-800 leading-relaxed">${formulation.instructions}</p>
                            </div>
                        ` : ''}
                    </div>

                    <div class="flex justify-between items-center pt-2 border-t border-slate-100 flex-shrink-0">
                        <div class="text-[10px] text-slate-400 font-medium">
                            NKB Chemical & Formulation Secret • Unauthorized copying is strictly prohibited.
                        </div>
                        <button type="button" onclick="closeModal()" class="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Error viewing formulation modal:', err);
        NKB.showToast('Error opening formulation details.', 'error');
        closeModal();
    }
}

window.loadFormulations = loadFormulations;
window.renderFormulationsTable = renderFormulationsTable;
window.filterFormulationsTable = filterFormulationsTable;
window.openViewFormulationModal = openViewFormulationModal;

// -------------------------------------------------------------
// 16. DEVELOPER REST API & API KEYS MANAGER
// -------------------------------------------------------------
let cachedApiKeys = [];

function escapeApiKeyHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function loadApiKeys() {
    const tbody = document.getElementById('table-api-keys-body');
    const kpiEl = document.getElementById('kpi-api-active-keys');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">
            <div class="inline-block animate-spin text-xl mr-2">⚙️</div> Loading API keys...
        </td></tr>`;
    }

    try {
        const res = await NKB.api('/api/api-keys');
        if (!res.success || !Array.isArray(res.data)) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-500 font-semibold">Failed to load API keys: ${res.error || 'Unknown error'}</td></tr>`;
            return;
        }

        cachedApiKeys = res.data;
        const activeCount = cachedApiKeys.filter(k => k.status === 'ACTIVE').length;
        if (kpiEl) kpiEl.textContent = activeCount;

        renderApiKeysTable(cachedApiKeys);
    } catch (err) {
        console.error('Failed to load API keys:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-500">Error connecting to API keys service.</td></tr>`;
    }
}

function renderApiKeysTable(keys) {
    const tbody = document.getElementById('table-api-keys-body');
    if (!tbody) return;

    if (!keys || keys.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-12 text-center text-slate-400 space-y-3">
                    <div class="text-4xl">🔑</div>
                    <div class="font-bold text-slate-700 text-sm">No external API keys provisioned yet</div>
                    <p class="text-xs text-slate-500 max-w-md mx-auto">Generate API keys to allow external eCommerce platforms, ERPs, or automated pipelines to sync orders, products, and inventory.</p>
                    <button onclick="openCreateApiKeyModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 inline-flex items-center gap-1.5 transition">
                        <span>➕ Generate First API Key</span>
                    </button>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = keys.map(k => {
        const scopes = Array.isArray(k.scopes) ? k.scopes : (typeof k.scopes === 'string' ? JSON.parse(k.scopes || '[]') : []);
        
        let statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">ACTIVE</span>';
        if (k.status === 'REVOKED') {
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">REVOKED</span>';
        } else if (k.status === 'EXPIRED') {
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">EXPIRED</span>';
        }

        const clientLabel = k.client_name 
            ? `<span class="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-md font-bold text-[11px]">${escapeApiKeyHtml(k.client_name)}</span>`
            : `<span class="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-md text-[10px] font-medium">All Clients (Global)</span>`;

        const lastUsedFormatted = k.last_used_at 
            ? `<span class="font-mono text-[11px] text-slate-700">${k.last_used_at.substring(0, 16)}</span>`
            : `<span class="text-slate-400 italic text-[11px]">Never used</span>`;

        const createdDate = k.created_at ? k.created_at.substring(0, 10) : '';

        return `
            <tr class="hover:bg-slate-50/80 transition group">
                <td class="py-3 px-4">
                    <div class="font-bold text-slate-900">${escapeApiKeyHtml(k.name)}</div>
                    <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>Created ${createdDate}</span>
                        ${k.created_by_name ? `<span>by ${escapeApiKeyHtml(k.created_by_name)}</span>` : ''}
                        <span>• Limit: ${k.rate_limit_rpm || 120} rpm</span>
                    </div>
                </td>
                <td class="py-3 px-4">
                    <span class="font-mono text-xs text-indigo-700 bg-indigo-50/70 border border-indigo-200/70 px-2 py-1 rounded select-all font-semibold">
                        ${escapeApiKeyHtml(k.key_prefix)}
                    </span>
                </td>
                <td class="py-3 px-4">
                    ${clientLabel}
                </td>
                <td class="py-3 px-4">
                    <div class="flex flex-wrap gap-1 max-w-xs">
                        ${scopes.map(s => {
                            let color = 'bg-slate-100 text-slate-700 border-slate-200';
                            if (s.includes('write')) color = 'bg-amber-50 text-amber-800 border-amber-200';
                            else if (s.includes('orders')) color = 'bg-blue-50 text-blue-800 border-blue-200';
                            else if (s.includes('inventory')) color = 'bg-purple-50 text-purple-800 border-purple-200';
                            return `<span class="text-[10px] px-1.5 py-0.5 rounded border ${color} font-mono font-medium">${s}</span>`;
                        }).join('')}
                    </div>
                </td>
                <td class="py-3 px-4 text-center">
                    ${statusBadge}
                </td>
                <td class="py-3 px-4">
                    ${lastUsedFormatted}
                </td>
                <td class="py-3 px-4 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        ${k.status === 'ACTIVE' ? `
                            <button onclick="revokeApiKey('${k.id}', '${escapeApiKeyHtml(k.name)}')" class="px-2.5 py-1 text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-bold transition" title="Revoke this API Key immediately">
                                Revoke
                            </button>
                        ` : ''}
                        <button onclick="deleteApiKey('${k.id}', '${escapeApiKeyHtml(k.name)}')" class="px-2.5 py-1 text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-bold transition" title="Permanently delete this key">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function openCreateApiKeyModal() {
    const root = document.getElementById('modals-root');
    if (!root) return;

    if (!cachedClients || cachedClients.length === 0) {
        const cRes = await NKB.api('/api/clients');
        if (cRes.success) cachedClients = cRes.data;
    }

    const clientOptions = (cachedClients || []).map(c => `
        <option value="${c.id}">${escapeApiKeyHtml(c.name || c.company_name)}</option>
    `).join('');

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-base">🔑</div>
                        <div>
                            <h3 class="text-lg font-bold text-slate-900">Generate Developer API Key</h3>
                            <p class="text-[11px] text-slate-500">Create a secure credential for external integrations & eCommerce sync.</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>

                <form onsubmit="submitCreateApiKey(event)" class="overflow-y-auto flex-1 space-y-4 pr-1">
                    <!-- Key Name -->
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Key Name / Identifier <span class="text-rose-500">*</span></label>
                        <input type="text" id="api-key-name" required placeholder="e.g. Shopify Store Sync, Vyuceutical ERP, Warehouse Barcode App" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                    </div>

                    <!-- Client Binding -->
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Associate Client (Data Isolation Scope)</label>
                        <select id="api-key-client-id" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                            <option value="">— Global / Internal System (Full Access to all clients) —</option>
                            ${clientOptions}
                        </select>
                        <p class="text-[10px] text-slate-400 mt-1">If bound to a client, external requests using this key will only be able to view and create orders/products for that client.</p>
                    </div>

                    <!-- Scopes Selection -->
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <label class="block text-xs font-bold text-slate-700">Permission Scopes <span class="text-rose-500">*</span></label>
                            <div class="flex gap-2">
                                <button type="button" onclick="selectAllApiScopes(true)" class="text-[10px] text-indigo-600 hover:underline font-bold">Select All</button>
                                <span class="text-slate-300">•</span>
                                <button type="button" onclick="selectAllApiScopes(false)" class="text-[10px] text-slate-500 hover:underline">Clear</button>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                            <label class="flex items-start gap-2 cursor-pointer p-1.5 hover:bg-white rounded-lg transition">
                                <input type="checkbox" name="api-scope" value="products:read" checked class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
                                <div>
                                    <div class="font-bold text-slate-800">products:read</div>
                                    <div class="text-[10px] text-slate-500 leading-tight">View cosmetic catalog & prices</div>
                                </div>
                            </label>
                            <label class="flex items-start gap-2 cursor-pointer p-1.5 hover:bg-white rounded-lg transition">
                                <input type="checkbox" name="api-scope" value="orders:read" checked class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
                                <div>
                                    <div class="font-bold text-slate-800">orders:read</div>
                                    <div class="text-[10px] text-slate-500 leading-tight">Read purchase orders & status</div>
                                </div>
                            </label>
                            <label class="flex items-start gap-2 cursor-pointer p-1.5 hover:bg-white rounded-lg transition">
                                <input type="checkbox" name="api-scope" value="orders:write" checked class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
                                <div>
                                    <div class="font-bold text-slate-800">orders:write</div>
                                    <div class="text-[10px] text-slate-500 leading-tight">Create & submit orders via API</div>
                                </div>
                            </label>
                            <label class="flex items-start gap-2 cursor-pointer p-1.5 hover:bg-white rounded-lg transition">
                                <input type="checkbox" name="api-scope" value="deliveries:read" checked class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
                                <div>
                                    <div class="font-bold text-slate-800">deliveries:read</div>
                                    <div class="text-[10px] text-slate-500 leading-tight">Track Delivery Receipts (DR)</div>
                                </div>
                            </label>
                            <label class="flex items-start gap-2 cursor-pointer p-1.5 hover:bg-white rounded-lg transition">
                                <input type="checkbox" name="api-scope" value="invoices:read" checked class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
                                <div>
                                    <div class="font-bold text-slate-800">invoices:read</div>
                                    <div class="text-[10px] text-slate-500 leading-tight">Read billing invoices & balance</div>
                                </div>
                            </label>
                            <label class="flex items-start gap-2 cursor-pointer p-1.5 hover:bg-white rounded-lg transition">
                                <input type="checkbox" name="api-scope" value="inventory:read" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500">
                                <div>
                                    <div class="font-bold text-slate-800">inventory:read</div>
                                    <div class="text-[10px] text-slate-500 leading-tight">Live inventory & BOM materials</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- Expiration & Rate Limit -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Key Expiration</label>
                            <select id="api-key-expires" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                                <option value="">Never Expires (Recommended)</option>
                                <option value="30">Expires in 30 days</option>
                                <option value="90">Expires in 90 days</option>
                                <option value="365">Expires in 1 year</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Rate Limit (Requests / Min)</label>
                            <input type="number" id="api-key-rate-limit" value="120" min="10" max="1000" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">Cancel</button>
                        <button type="submit" id="btn-submit-api-key" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition">Generate Key</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function selectAllApiScopes(select) {
    document.querySelectorAll('input[name="api-scope"]').forEach(cb => {
        cb.checked = !!select;
    });
}

async function submitCreateApiKey(e) {
    if (e && e.preventDefault) e.preventDefault();

    const name = document.getElementById('api-key-name')?.value?.trim();
    const clientId = document.getElementById('api-key-client-id')?.value || null;
    const expiresInDays = document.getElementById('api-key-expires')?.value || null;
    const rateLimitRpm = parseInt(document.getElementById('api-key-rate-limit')?.value || '120', 10);

    const checkedBoxes = Array.from(document.querySelectorAll('input[name="api-scope"]:checked'));
    const scopes = checkedBoxes.map(cb => cb.value);

    if (!name) {
        NKB.showToast('Please enter an API key name.', 'warning');
        return;
    }
    if (scopes.length === 0) {
        NKB.showToast('Please select at least one permission scope.', 'warning');
        return;
    }

    const submitBtn = document.getElementById('btn-submit-api-key');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Generating...';
    }

    try {
        const res = await NKB.api('/api/api-keys', {
            method: 'POST',
            body: {
                name,
                clientId,
                scopes,
                expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : null,
                rateLimitRpm
            }
        });

        if (!res.success || !res.rawKey) {
            NKB.showToast(`Failed to generate key: ${res.error || 'Unknown error'}`, 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Generate Key';
            }
            return;
        }

        NKB.showToast('API Key generated successfully!', 'success');
        loadApiKeys();
        openRawKeyRevealModal(res.rawKey, res.apiKey.name, res.apiKey.scopes);
    } catch (err) {
        console.error('Error submitting API key:', err);
        NKB.showToast('Error generating API key.', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Generate Key';
        }
    }
}

function openRawKeyRevealModal(rawKey, keyName, scopes = []) {
    const root = document.getElementById('modals-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl font-bold">✨</div>
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">API Key Generated!</h3>
                        <p class="text-xs text-slate-500">Key: <span class="font-bold text-slate-800">${escapeApiKeyHtml(keyName)}</span></p>
                    </div>
                </div>

                <div class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
                    <div class="font-bold flex items-center gap-1.5 text-amber-800">
                        <span>⚠️</span> Important Security Notice:
                    </div>
                    <p class="leading-relaxed">
                        Copy this secret API key now. For your security, this key is encrypted with SHA-256 and <strong>will never be shown to you again</strong>.
                    </p>
                </div>

                <div class="space-y-1.5">
                    <label class="block text-xs font-bold text-slate-700">Your Live API Key</label>
                    <div class="flex items-center gap-2">
                        <input type="text" id="reveal-raw-key-input" readonly value="${rawKey}" class="w-full px-3 py-2.5 bg-slate-900 text-indigo-300 font-mono text-xs rounded-xl font-bold border border-slate-700 select-all focus:outline-none">
                        <button onclick="copyRawApiKey()" id="btn-copy-raw-key" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 whitespace-nowrap transition flex items-center gap-1.5">
                            <span id="copy-btn-icon">📋</span>
                            <span id="copy-btn-text">Copy Key</span>
                        </button>
                    </div>
                </div>

                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-600">
                    <div class="font-bold text-slate-700">How to use this key in HTTP requests:</div>
                    <code class="block font-mono text-[11px] bg-white p-2 rounded border border-slate-200 text-indigo-700 select-all">
                        x-api-key: ${rawKey}
                    </code>
                </div>

                <div class="flex justify-between items-center pt-2 border-t border-slate-100">
                    <a href="/api/docs" target="_blank" class="text-xs text-indigo-600 hover:underline font-bold inline-flex items-center gap-1">
                        <span>📖 Test in Interactive API Docs</span>
                        <span>↗</span>
                    </a>
                    <button type="button" onclick="closeModal()" class="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition">
                        I Have Copied My Key
                    </button>
                </div>
            </div>
        </div>
    `;
}

function copyRawApiKey() {
    const input = document.getElementById('reveal-raw-key-input');
    if (!input) return;
    input.select();
    input.setSelectionRange(0, 99999);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(() => {
            handleCopySuccess();
        }).catch(() => {
            document.execCommand('copy');
            handleCopySuccess();
        });
    } else {
        document.execCommand('copy');
        handleCopySuccess();
    }
}

function handleCopySuccess() {
    const btnText = document.getElementById('copy-btn-text');
    const btnIcon = document.getElementById('copy-btn-icon');
    if (btnText) btnText.textContent = 'Copied!';
    if (btnIcon) btnIcon.textContent = '✅';
    NKB.showToast('API key copied to clipboard!', 'success');
    setTimeout(() => {
        if (btnText) btnText.textContent = 'Copy Key';
        if (btnIcon) btnIcon.textContent = '📋';
    }, 2500);
}

async function revokeApiKey(id, name) {
    if (!confirm(`Are you sure you want to revoke API key "${name}"?\n\nExternal systems using this key will immediately lose access.`)) {
        return;
    }

    try {
        const res = await NKB.api(`/api/api-keys/${id}/revoke`, { method: 'POST' });
        if (res.success) {
            NKB.showToast(`API key "${name}" revoked.`, 'info');
            loadApiKeys();
        } else {
            NKB.showToast(`Failed to revoke key: ${res.error}`, 'error');
        }
    } catch (err) {
        console.error('Revoke key failed:', err);
        NKB.showToast('Error revoking API key.', 'error');
    }
}

async function deleteApiKey(id, name) {
    if (!confirm(`Are you sure you want to permanently delete API key "${name}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    try {
        const res = await NKB.api(`/api/api-keys/${id}`, { method: 'DELETE' });
        if (res.success) {
            NKB.showToast(`API key "${name}" permanently deleted.`, 'success');
            loadApiKeys();
        } else {
            NKB.showToast(`Failed to delete key: ${res.error}`, 'error');
        }
    } catch (err) {
        console.error('Delete key failed:', err);
        NKB.showToast('Error deleting API key.', 'error');
    }
}

window.loadApiKeys = loadApiKeys;
window.renderApiKeysTable = renderApiKeysTable;
window.openCreateApiKeyModal = openCreateApiKeyModal;
window.selectAllApiScopes = selectAllApiScopes;
window.submitCreateApiKey = submitCreateApiKey;
window.openRawKeyRevealModal = openRawKeyRevealModal;
window.copyRawApiKey = copyRawApiKey;
window.revokeApiKey = revokeApiKey;
window.deleteApiKey = deleteApiKey;



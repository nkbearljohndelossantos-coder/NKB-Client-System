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
let cachedOrders = [];
let cachedDeliveries = [];
let cachedInvoices = [];

// Expose caches for Command Palette search
window.cachedClients = cachedClients;
window.cachedProducts = cachedProducts;
window.cachedOrders = cachedOrders;
window.cachedDeliveries = cachedDeliveries;
window.cachedInvoices = cachedInvoices;

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
    restoreSidebarSections();

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

    // Role-specific sidebar tab & section group visibility
    const hideTab = (id) => {
        const btn = document.getElementById(`tab-btn-${id}`);
        if (btn) btn.style.display = 'none';
    };
    const hideGroup = (groupId) => {
        const grp = document.getElementById(`sidebar-group-${groupId}`);
        if (grp) grp.style.display = 'none';
    };

    const showTab = (id) => {
        const btn = document.getElementById(`tab-btn-${id}`);
        if (btn) btn.style.display = '';
    };
    const showGroup = (groupId) => {
        const grp = document.getElementById(`sidebar-group-${groupId}`);
        if (grp) grp.style.display = '';
    };

    // Rule 1: In ALL accounts EXCEPT Super Admin and Executives (CEO & COO), remove Lab & Formulations and Management
    const isSuperOrExecutive = ['SUPER_ADMIN', 'ADMIN', 'CEO', 'COO'].includes(role);
    if (!isSuperOrExecutive) {
        hideGroup('lab');
        hideGroup('management');
        hideTab('formulations');
        hideTab('clients');
        hideTab('products');
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        hideTab('apikeys');
        hideTab('it-management');
        const cmLink = document.getElementById('tab-link-concept-map');
        if (cmLink) cmLink.style.display = 'none';
    }

    if (role === 'INVENTORY') {
        // Inventory Officer: remove Finance & Stock and Management (and Lab & Formulations).
        // Has Warehouse Inventory (Raw Materials) and Purchase Orders / Requisitions.
        hideGroup('finance');
        hideGroup('management');
        hideGroup('lab');
        hideTab('dashboard');
        hideTab('job-orders');
        hideTab('production');
        hideTab('deliveries');
        hideTab('invoices');
        hideTab('payments');
        hideTab('payables');
        hideTab('buffer');
        hideTab('clients');
        hideTab('products');
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        hideTab('it-management');
        switchTab('raw-materials');
    } else if (role === 'PURCHASING') {
        // Purchasing Department: remove Management and Lab & Formulations
        hideGroup('finance');
        hideGroup('management');
        hideGroup('lab');
        hideTab('dashboard');
        hideTab('job-orders');
        hideTab('production');
        hideTab('deliveries');
        hideTab('invoices');
        hideTab('payments');
        hideTab('payables');
        hideTab('buffer');
        hideTab('clients');
        hideTab('products');
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        hideTab('it-management');
        switchTab('purchasing');
    } else if (role === 'QC') {
        // QC: remove Finance & Stock, Management, Lab & Formulations, and Requisitions
        hideGroup('finance');
        hideGroup('management');
        hideGroup('lab');
        hideTab('raw-materials');
        hideTab('invoices');
        hideTab('payments');
        hideTab('payables');
        hideTab('buffer');
        hideTab('clients');
        hideTab('products');
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        hideTab('purchasing');
        hideTab('it-management');
        switchTab('production');
    } else if (role === 'PRODUCTION') {
        // Production Supervisor: remove Finance & Stock, Requisitions, Lab & Formulations, and Management.
        // Dashboard customized to interactive Sales Orders & 4 Production KPIs.
        hideGroup('finance');
        hideGroup('management');
        hideGroup('lab');
        hideTab('purchasing');
        hideTab('raw-materials');
        hideTab('invoices');
        hideTab('payments');
        hideTab('payables');
        hideTab('buffer');
        hideTab('clients');
        hideTab('products');
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        hideTab('it-management');
        const soLabel = document.getElementById('sidebar-label-orders');
        if (soLabel) soLabel.textContent = 'Sales Orders';
    } else if (role === 'WAREHOUSE') {
        hideGroup('finance');
        hideGroup('management');
        hideGroup('lab');
        hideTab('orders');
        hideTab('purchasing');
        hideTab('job-orders');
        hideTab('production');
        hideTab('invoices');
        hideTab('payments');
        hideTab('payables');
        hideTab('users');
        hideTab('audit');
        hideTab('it-management');
    } else if (role === 'ACCOUNTING') {
        // Senior Accountant: remove Requisitions, IT Management, and Lab & Formulations.
        // Keep Clients and Cosmetic Products visible for Senior Accountant, while hiding Staff & Roles, Reports, Audit Trails, Developer API, and IT Management.
        hideGroup('lab');
        showGroup('management');
        showTab('clients');
        showTab('products');
        hideTab('purchasing');
        hideTab('raw-materials');
        hideTab('it-management');
        hideTab('job-orders');
        hideTab('production');
        // Deliveries tab is visible for Accounting to record client receiving and issue invoices
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        hideTab('apikeys');
    } else if (role === 'CEO' || role === 'COO' || role === 'ADMIN' || role === 'SUPER_ADMIN') {
        // Full executive & superadmin oversight
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

function toggleSidebarSection(id) {
    const section = document.getElementById(`section-${id}`);
    const chevron = document.getElementById(`chevron-${id}`);
    if (!section) return;
    const isClosed = section.classList.contains('hidden');
    if (isClosed) {
        section.classList.remove('hidden');
        if (chevron) chevron.classList.remove('-rotate-90');
        try { localStorage.setItem(`nkb_sidebar_${id}`, 'open'); } catch (_) {}
    } else {
        section.classList.add('hidden');
        if (chevron) chevron.classList.add('-rotate-90');
        try { localStorage.setItem(`nkb_sidebar_${id}`, 'closed'); } catch (_) {}
    }
}
window.toggleSidebarSection = toggleSidebarSection;

function restoreSidebarSections() {
    ['operations', 'finance', 'lab', 'management'].forEach(id => {
        try {
            const saved = localStorage.getItem(`nkb_sidebar_${id}`);
            if (saved === 'closed') {
                const section = document.getElementById(`section-${id}`);
                const chevron = document.getElementById(`chevron-${id}`);
                if (section) section.classList.add('hidden');
                if (chevron) chevron.classList.add('-rotate-90');
            }
        } catch (_) {}
    });
}
window.restoreSidebarSections = restoreSidebarSections;

function setPOSegmentedFilter(status) {
    const select = document.getElementById('filter-po-status');
    if (select) select.value = status;

    document.querySelectorAll('.po-filter-pill').forEach(pill => {
        if (pill.getAttribute('data-status') === status) {
            pill.className = 'po-filter-pill px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white shadow-sm transition whitespace-nowrap cursor-pointer';
        } else {
            const isVoidedPill = pill.getAttribute('data-status') === 'VOIDED';
            pill.className = isVoidedPill
                ? 'po-filter-pill px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition whitespace-nowrap cursor-pointer'
                : 'po-filter-pill px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition whitespace-nowrap cursor-pointer';
        }
    });

    loadOrders();
}
window.setPOSegmentedFilter = setPOSegmentedFilter;

function onPOSelectFilterChange() {
    const select = document.getElementById('filter-po-status');
    const val = select ? select.value : '';
    setPOSegmentedFilter(val);
}
window.onPOSelectFilterChange = onPOSelectFilterChange;

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

        // Automatically expand parent section if collapsed
        const parentSection = targetBtn.closest('[id^="section-"]');
        if (parentSection && parentSection.classList.contains('hidden')) {
            parentSection.classList.remove('hidden');
            const secId = parentSection.id.replace('section-', '');
            const chevron = document.getElementById(`chevron-${secId}`);
            if (chevron) chevron.classList.remove('-rotate-90');
        }
    }

    // Call tab-specific loader
    if (tabId === 'dashboard') loadDashboard();
    else if (tabId === 'orders') loadOrders();
    else if (tabId === 'raw-materials') loadRawMaterials();
    else if (tabId === 'job-orders') loadJobOrders();
    else if (tabId === 'production') loadBatches();
    else if (tabId === 'deliveries') loadDeliveries();
    else if (tabId === 'invoices') loadInvoices();
    else if (tabId === 'payments') loadPayments();
    else if (tabId === 'payables') loadPayables();
    else if (tabId === 'buffer') loadBufferStock();
    else if (tabId === 'clients') loadClients();
    else if (tabId === 'products') loadProducts();
    else if (tabId === 'formulations') loadFormulations();
    else if (tabId === 'users') loadUsers();
    else if (tabId === 'purchasing') loadPurchasingRequisitions();
    else if (tabId === 'reports') loadReports();
    else if (tabId === 'audit') loadAuditLogs();
    else if (tabId === 'apikeys') loadApiKeys();
    else if (tabId === 'it-management') loadITManagement();
}

// -------------------------------------------------------------
// 1. DASHBOARD LOADER
// -------------------------------------------------------------
async function loadDashboard() {
    const role = NKB.user ? NKB.user.role : '';
    const prodDash = document.getElementById('production-supervisor-dashboard');
    const execDash = document.getElementById('executive-dashboard-content');
    const dashTitle = document.getElementById('dashboard-main-title');
    const dashSub = document.getElementById('dashboard-main-subtitle');

    if (role === 'PRODUCTION') {
        if (prodDash) prodDash.classList.remove('hidden');
        if (execDash) execDash.classList.add('hidden');
        if (dashTitle) dashTitle.textContent = 'Production Supervisor — Factory Floor & Sales Orders';
        if (dashSub) dashSub.textContent = 'Assign Sales Order queue priority, decide what is active today in the factory, and monitor live batches & deliveries.';
        await loadProductionSupervisorDashboard();
        return;
    } else {
        if (prodDash) prodDash.classList.add('hidden');
        if (execDash) execDash.classList.remove('hidden');
    }

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

        // Monthly Sales Performance & Statistics
        const sm = d.salesThisMonth || {};
        const totalSold = sm.totalSold != null ? sm.totalSold : (d.soldThisMonth || 0);
        setElText('kpi-sold-this-month', NKB.formatCurrency(totalSold));
        setElText('kpi-sold-mom', `${sm.invoiceCount || 0} invoices this month · ${sm.momGrowthPercent >= 0 ? '+' : ''}${sm.momGrowthPercent || 0}% MoM`);

        // Sub-stat cards
        setElText('stat-sales-collected', NKB.formatCurrency(sm.totalCollected || 0));
        const collectionRate = totalSold > 0 ? Math.round(((sm.totalCollected || 0) / totalSold) * 100) : 0;
        setElText('stat-sales-collection-rate', `${collectionRate}% collection rate`);

        setElText('stat-sales-balance', NKB.formatCurrency(sm.totalBalance || 0));
        setElText('stat-sales-balance-sub', `${NKB.formatCurrency(sm.totalBalance || 0)} outstanding this month`);

        const momSign = (sm.momGrowthPercent || 0) >= 0 ? '+' : '';
        setElText('stat-sales-mom-growth', `${momSign}${sm.momGrowthPercent || 0}%`);
        setElText('stat-sales-last-month', `vs Last Month (${NKB.formatCurrency(sm.lastMonthSold || 0)})`);

        setElText('stat-sales-units', `${NKB.formatNumber(sm.totalUnitsSold || 0)} pcs`);
        setElText('stat-sales-invoice-count', `across ${sm.invoiceCount || 0} invoice${(sm.invoiceCount || 0) === 1 ? '' : 's'}`);

        // Badge
        if (sm.monthStr) {
            setElText('dashboard-sales-month-badge', `Month: ${sm.monthStr}`);
        }

        // Render Top Invoiced Products
        renderDashboardTopProducts(sm.topProducts || []);

        // Render 6-Month Sales Trend Chart
        if (sm.salesTrend && sm.salesTrend.length > 0) {
            renderMonthlySalesChart(sm.salesTrend);
        }
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

function renderDashboardTopProducts(products) {
    const container = document.getElementById('dashboard-top-products');
    if (!container) return;

    if (!products || products.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-slate-400 bg-slate-50 rounded-xl">No invoiced sales recorded this month yet.</div>`;
        return;
    }

    container.innerHTML = products.slice(0, 5).map((p, idx) => `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition">
            <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full ${idx === 0 ? 'bg-amber-100 text-amber-700 font-black' : 'bg-slate-200 text-slate-600 font-bold'} text-[10px]">
                    ${idx + 1}
                </span>
                <div class="truncate">
                    <div class="font-bold text-slate-800 truncate">${p.product_name || 'Cosmetic Item'}</div>
                    <div class="text-[10px] text-slate-500">${NKB.formatNumber(p.units_sold || 0)} pcs sold</div>
                </div>
            </div>
            <div class="text-right font-extrabold text-slate-900 ml-2 whitespace-nowrap">
                ${NKB.formatCurrency(p.revenue || 0)}
            </div>
        </div>
    `).join('');
}

function renderMonthlySalesChart(trend) {
    const ctx = document.getElementById('chart-monthly-sales');
    if (!ctx) return;

    const labels = trend.map(t => t.month);
    const salesData = trend.map(t => t.totalSold);
    const collectedData = trend.map(t => t.totalCollected);

    if (monthlySalesChart) monthlySalesChart.destroy();

    monthlySalesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Invoiced Sales (₱)',
                    data: salesData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5,
                    pointBackgroundColor: '#10b981',
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Collected (₱)',
                    data: collectedData,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.05)',
                    fill: false,
                    tension: 0.35,
                    borderWidth: 2,
                    borderDash: [4, 4],
                    pointBackgroundColor: '#6366f1',
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, font: { size: 11, weight: 'bold' } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ₱${(context.raw || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000000) return '₱' + (value / 1000000).toFixed(1) + 'M';
                            if (value >= 1000) return '₱' + (value / 1000).toFixed(0) + 'k';
                            return '₱' + value;
                        },
                        font: { size: 10 }
                    },
                    grid: { color: 'rgba(226, 232, 240, 0.6)' }
                },
                x: {
                    ticks: { font: { size: 11 } },
                    grid: { display: false }
                }
            }
        }
    });
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
        cachedOrders = res.data;
        window.cachedOrders = cachedOrders;
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
            const hasBatchesReady = po.items && po.items.some(it => it.batch_number || it.batch_id || (Number(it.actual_yield) > 0));
            const isVoided = po.status === 'VOIDED';

            const statusBorderColor = isVoided ? 'border-l-rose-500' :
                po.status === 'COMPLETED' ? 'border-l-emerald-600' :
                po.status === 'APPROVED' ? 'border-l-indigo-600' :
                po.status === 'IN_PRODUCTION' ? 'border-l-blue-600' :
                po.status === 'PARTIALLY_DELIVERED' ? 'border-l-purple-600' :
                (po.status === 'PENDING_APPROVAL' || po.status === 'DRAFT') ? 'border-l-amber-500' :
                'border-l-slate-400';

            return `
            <tr class="bg-white hover:bg-slate-50/90 transition shadow-xs rounded-2xl group ${isVoided ? 'opacity-60 bg-rose-50/20' : ''}">
                <td class="py-3.5 px-4 whitespace-nowrap rounded-l-2xl border-y border-l border-slate-200/90 border-l-4 ${statusBorderColor}">
                    <div class="text-[11px] text-slate-500 font-semibold leading-none mb-1">${NKB.formatDate(po.po_date)}</div>
                    <button type="button" onclick="openViewPOModal('${po.id}')" class="font-mono font-black text-indigo-600 hover:text-indigo-800 hover:underline text-left block text-sm tracking-tight" title="Click to view full PO details">
                        ${po.po_number}
                    </button>
                    ${po.form_of_payment ? `
                        <div class="mt-1">
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1" title="Term of Payment: ${po.form_of_payment}">
                                💳 ${po.form_of_payment}
                            </span>
                        </div>
                    ` : ''}
                </td>
                <td class="py-3.5 px-4 font-bold text-slate-800 border-y border-slate-200/90">${(po.is_vyuceutical_ops === 1 || (po.company_name && po.company_name.toLowerCase().includes('vyuceutical'))) ? `<span class="text-purple-900 font-extrabold">Vyuceutical OPC - ${po.contact_person || po.company_name}</span>` : po.company_name}</td>
                <td class="py-3.5 px-4 border-y border-slate-200/90">
                    <div class="space-y-1 w-64 max-h-28 overflow-y-auto pr-1">
                        ${itemsList}
                    </div>
                </td>
                <td class="py-3.5 px-4 font-black text-slate-950 whitespace-nowrap font-mono border-y border-slate-200/90">${NKB.formatNumber(po.total_target_quantity)} pcs</td>
                <td class="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap font-mono border-y border-slate-200/90">${canViewPrices && po.grand_total !== null && po.grand_total !== undefined ? NKB.formatCurrency(po.grand_total) : '—'}</td>
                <td class="py-3.5 px-4 whitespace-nowrap border-y border-slate-200/90">
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
                <td class="py-3.5 px-4 text-right whitespace-nowrap rounded-r-2xl border-y border-r border-slate-200/90">
                    <div class="inline-flex items-center gap-1.5 justify-end">
                        ${(isExecAdmin && po.status === 'PENDING_APPROVAL') ? `
                            <button onclick="approvePO('${po.id}', '${po.po_number}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer" title="Approve Purchase Order">
                                Approve
                            </button>
                        ` : (canManageProduction && (po.status === 'APPROVED' || po.status === 'IN_PRODUCTION' || po.status === 'PARTIALLY_DELIVERED') && po.status !== 'COMPLETED') ? `
                            ${!allJOsStarted ? `
                                <button onclick="openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name.replace(/'/g, "\\'")}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer" title="Start Job Orders for all products in this order">
                                    <span>🏭 Start JO</span>
                                </button>
                            ` : (po.status === 'PARTIALLY_DELIVERED' || hasBatchesReady) ? `
                                <button onclick="openCreateAllDRModal('${po.client_id}', '${po.id}', '${po.company_name.replace(/'/g, "\\'")}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer" title="Create Delivery Receipt">
                                    <span>🚚 Deliver (DR)</span>
                                </button>
                            ` : `
                                <button onclick="openCreateAllBatchesModal('${po.client_id}', '${po.id}', '${po.company_name.replace(/'/g, "\\'")}')" class="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer" title="Record batch numbers and yield">
                                    <span>⚗️ Batch</span>
                                </button>
                            `}
                        ` : `
                            <button onclick="openViewPOModal('${po.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer" title="View Full Order Info">
                                <span>👁️ View</span>
                            </button>
                        `}

                        <!-- 3-Dot (•••) Dropdown Menu -->
                        <div class="relative inline-block text-left">
                            <button type="button" onclick="togglePOActionMenu(event, '${po.id}')" class="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition focus:outline-none cursor-pointer" title="More Actions">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/></svg>
                            </button>
                            <div id="po-menu-${po.id}" class="table-action-menu hidden absolute right-0 mt-1 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-40 text-left animate-fade-in font-medium text-xs divide-y divide-slate-100">
                                <div class="py-1">
                                    <div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order Info & Docs</div>
                                    <button onclick="openViewPOModal('${po.id}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 transition text-left cursor-pointer">
                                        <span>👁️</span><span>View Full Details</span>
                                    </button>
                                    <a href="/print-po.html?id=${po.id}" class="flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition">
                                        <span>🖨️</span><span>Print Purchase Order</span>
                                    </a>
                                    <a href="/print-jo.html?po_id=${po.id}" class="flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition">
                                        <span>📄</span><span>Print SO Slip Copy</span>
                                    </a>
                                    ${(po.accounting_confirmed === 1 || po.formulation_converted === 1) ? `
                                        <a href="/print-formulation-receipt.html?id=${po.id}" target="_blank" class="flex items-center gap-2 px-3 py-1.5 text-amber-800 hover:bg-amber-50 transition">
                                            <span>🧪</span><span>Formulation Receipt</span>
                                        </a>
                                    ` : ''}
                                </div>
                                <div class="py-1">
                                    <div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Workflow Actions</div>
                                    ${(canEditOrder && po.status !== 'COMPLETED' && po.status !== 'CANCELLED' && po.status !== 'VOIDED' && (!po.dr_count || po.dr_count === 0)) ? `
                                        <button onclick="openEditPOModal('${po.id}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-amber-700 hover:bg-amber-50 transition text-left font-bold cursor-pointer">
                                            <span>✏️</span><span>Update Order Details</span>
                                        </button>
                                    ` : ''}
                                    ${(canConfirmAccounting && !po.accounting_confirmed && po.status !== 'CANCELLED' && po.status !== 'VOIDED') ? `
                                        <button onclick="confirmAccountingPO('${po.id}', '${po.po_number}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 transition text-left font-bold cursor-pointer">
                                            <span>💳</span><span>Confirm (Accounting)</span>
                                        </button>
                                    ` : ''}
                                    ${(canConfirmInventory && !po.inventory_confirmed && po.status !== 'CANCELLED' && po.status !== 'VOIDED') ? `
                                        ${po.accounting_confirmed === 1 ? `
                                            <button onclick="confirmInventoryPO('${po.id}', '${po.po_number}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-teal-700 hover:bg-teal-50 transition text-left font-bold cursor-pointer">
                                                <span>✅</span><span>Confirm Raw Materials</span>
                                            </button>
                                        ` : `
                                            <div class="px-3 py-1.5 text-slate-400 italic text-[11px]">⏳ Awaiting Acct Confirm</div>
                                        `}
                                    ` : ''}
                                    ${(canConfirmInventory && po.status !== 'CANCELLED' && po.status !== 'VOIDED') ? `
                                        <button onclick="openSupplyRequestModal('${po.id}', '${po.po_number}', '${(po.company_name || '').replace(/'/g, "\\'")}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 transition text-left cursor-pointer">
                                            <span>📋</span><span>Request Supplies</span>
                                        </button>
                                    ` : ''}
                                    ${(canManageProduction && po.status !== 'COMPLETED' && po.status !== 'CANCELLED' && po.status !== 'VOIDED' && po.status !== 'DRAFT') ? `
                                        <button onclick="openCreateAllDRModal('${po.client_id}', '${po.id}', '${(po.company_name || '').replace(/'/g, "\\'")}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 transition text-left font-bold cursor-pointer">
                                            <span>🚚</span><span>Deliver Products (DR)</span>
                                        </button>
                                        <button onclick="promptDeclareOrderFinished('${po.id}', '${po.po_number}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-indigo-700 hover:bg-indigo-50 transition text-left font-bold cursor-pointer">
                                            <span>✅</span><span>Declare Order Finished</span>
                                        </button>
                                    ` : ''}
                                    ${(po.supply_requests_count > 0) ? `
                                        <button onclick="viewSupplyRequestsModal('${po.id}', '${po.po_number}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-rose-700 hover:bg-rose-50 transition text-left font-bold cursor-pointer">
                                            <span>📜</span><span>View Requisitions (${po.supply_requests_count})</span>
                                        </button>
                                    ` : ''}
                                </div>
                                ${(isExecAdmin && (po.status !== 'COMPLETED' || po.status === 'VOIDED')) ? `
                                    <div class="py-1">
                                        <div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Danger Zone</div>
                                        ${po.status !== 'VOIDED' && po.status !== 'CANCELLED' && po.status !== 'COMPLETED' ? `
                                            <button onclick="voidPO('${po.id}', '${po.po_number}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-rose-600 hover:bg-rose-50 transition text-left font-bold cursor-pointer">
                                                <span>🚫</span><span>Void Order</span>
                                            </button>
                                        ` : ''}
                                        ${po.status === 'VOIDED' ? `
                                            <button onclick="deletePO('${po.id}', '${po.po_number}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-red-700 hover:bg-red-50 transition text-left font-bold cursor-pointer">
                                                <span>🗑️</span><span>Permanently Delete</span>
                                            </button>
                                        ` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-xs">No purchase orders found.</td></tr>`;
    }
}

function toggleTableActionMenu(e, menuId) {
    if (e) {
        e.stopPropagation();
    }
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    // Close any other open table menus
    document.querySelectorAll('.table-action-menu, [id^="po-menu-"]').forEach(m => m.classList.add('hidden'));
    if (isHidden) {
        menu.classList.remove('hidden');
    }
}
window.toggleTableActionMenu = toggleTableActionMenu;

function togglePOActionMenu(e, id) {
    toggleTableActionMenu(e, `po-menu-${id}`);
}
window.togglePOActionMenu = togglePOActionMenu;

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

let srBomItems = [];

function renderSrBomTable() {
    const tbody = document.getElementById('sr-bom-table-body');
    const countBadge = document.getElementById('sr-bom-count-badge');
    if (!tbody) return;

    if (countBadge) {
        const checkedCount = srBomItems.filter(it => it.checked !== false).length;
        countBadge.textContent = `${checkedCount} Material${checkedCount === 1 ? '' : 's'} Selected`;
    }

    if (!srBomItems || srBomItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-6 text-center text-slate-400 text-xs font-medium">
                    No raw materials added to Bill of Materials yet. Pick from Warehouse Inventory, load a Product Formulation BOM above, or click <b>+ Custom Row</b>.
                </td>
            </tr>
        `;
        syncSrBomToMaterialsTextarea();
        return;
    }

    tbody.innerHTML = srBomItems.map((it, idx) => {
        const stockNum = Number(it.current_stock || 0);
        const stockBadge = stockNum <= 0
            ? `<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 font-mono text-[10px] font-black">${stockNum} ${it.unit || 'kg'}</span>`
            : `<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px] font-bold">${stockNum} ${it.unit || 'kg'}</span>`;

        return `
            <tr class="border-b border-slate-100 hover:bg-amber-50/40 transition ${it.checked === false ? 'opacity-50 bg-slate-50' : 'bg-white'}">
                <td class="py-2 px-2.5 text-center">
                    <input type="checkbox" ${it.checked !== false ? 'checked' : ''} onchange="updateSrBomItem(${idx}, 'checked', this.checked)" class="w-3.5 h-3.5 accent-amber-600 rounded cursor-pointer">
                </td>
                <td class="py-2 px-2.5">
                    <input type="text" value="${(it.material_code || 'None').replace(/"/g, '&quot;')}" onchange="updateSrBomItem(${idx}, 'material_code', this.value)"
                        class="w-20 px-1.5 py-1 border border-slate-200 rounded-lg font-mono font-black text-[11px] text-slate-900 bg-slate-50 focus:bg-white">
                </td>
                <td class="py-2 px-2.5">
                    <input type="text" value="${(it.material_name || '').replace(/"/g, '&quot;')}" onchange="updateSrBomItem(${idx}, 'material_name', this.value)" placeholder="Raw Material Name"
                        class="w-full min-w-[150px] px-2 py-1 border border-slate-200 rounded-lg font-bold text-xs text-slate-900 bg-white focus:ring-1 focus:ring-amber-500">
                </td>
                <td class="py-2 px-2.5">
                    <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] whitespace-nowrap">${it.category || it.phase || 'Cosmetics'}</span>
                </td>
                <td class="py-2 px-2.5 text-right whitespace-nowrap">
                    ${stockBadge}
                </td>
                <td class="py-2 px-2.5">
                    <div class="flex items-center gap-1 justify-end">
                        <input type="number" step="0.01" min="0.01" value="${it.requested_qty || 1}" oninput="updateSrBomItem(${idx}, 'requested_qty', this.value)"
                            class="w-20 px-2 py-1 border border-amber-300 rounded-lg font-black text-xs text-right text-slate-950 bg-amber-50/40 focus:bg-white focus:ring-1 focus:ring-amber-500">
                        <select onchange="updateSrBomItem(${idx}, 'unit', this.value)" class="px-1.5 py-1 border border-slate-200 rounded-lg font-bold text-[11px] text-slate-700 bg-slate-50">
                            ${['kg', 'g', 'L', 'mL', 'pcs', 'boxes', 'drums'].map(u => `<option value="${u}" ${(it.unit || 'kg') === u ? 'selected' : ''}>${u}</option>`).join('')}
                        </select>
                    </div>
                </td>
                <td class="py-2 px-2 text-center">
                    <button type="button" onclick="removeSrBomRow(${idx})" class="w-6 h-6 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs inline-flex items-center justify-center transition cursor-pointer" title="Remove row">✕</button>
                </td>
            </tr>
        `;
    }).join('');

    syncSrBomToMaterialsTextarea();
}

function updateSrBomItem(idx, field, value) {
    if (!srBomItems[idx]) return;
    if (field === 'requested_qty') {
        srBomItems[idx].requested_qty = Number(value) || 0;
    } else if (field === 'checked') {
        srBomItems[idx].checked = Boolean(value);
    } else {
        srBomItems[idx][field] = value;
    }
    if (field === 'checked') {
        renderSrBomTable();
    } else {
        syncSrBomToMaterialsTextarea();
    }
}

function removeSrBomRow(idx) {
    srBomItems.splice(idx, 1);
    renderSrBomTable();
}

function syncSrBomToMaterialsTextarea() {
    const textarea = document.getElementById('sr-materials-needed');
    if (!textarea) return;
    const activeItems = srBomItems.filter(it => it.checked !== false && (it.material_name || '').trim() !== '');
    if (activeItems.length === 0) return;

    const lines = activeItems.map((it, i) => {
        const codeStr = it.material_code && it.material_code !== 'None' ? `[${it.material_code}] ` : '';
        const catStr = it.category || it.phase ? ` (${it.category || it.phase})` : '';
        return `${i + 1}. ${codeStr}${it.material_name}${catStr} — ${it.requested_qty || 0} ${it.unit || 'kg'}`;
    });
    textarea.value = `BILL OF MATERIALS (BOM) REQUISITION:\n` + lines.join('\n');
}

function addRawMaterialToSrBom() {
    const selectEl = document.getElementById('sr-rm-inventory-picker');
    const qtyEl = document.getElementById('sr-rm-picker-qty');
    if (!selectEl || !selectEl.value) {
        if (NKB.showToast) NKB.showToast('Please select a raw material from the dropdown first.', 'warning');
        return;
    }
    const rmId = selectEl.value;
    const reqQty = qtyEl ? (Number(qtyEl.value) || 10) : 10;
    const rm = (typeof cachedRawMaterials !== 'undefined' ? cachedRawMaterials : []).find(r => r.id === rmId);
    if (!rm) return;

    const existingIdx = srBomItems.findIndex(x => x.raw_material_id === rm.id || (x.material_code === rm.material_code && x.material_name === rm.material_name));
    if (existingIdx >= 0) {
        srBomItems[existingIdx].requested_qty = Number((Number(srBomItems[existingIdx].requested_qty || 0) + reqQty).toFixed(2));
        srBomItems[existingIdx].checked = true;
    } else {
        srBomItems.push({
            checked: true,
            raw_material_id: rm.id,
            material_code: rm.material_code || 'None',
            material_name: rm.material_name,
            category: rm.category || 'Cosmetics',
            current_stock: Number(rm.current_stock || 0),
            requested_qty: reqQty,
            unit: rm.unit || 'kg',
            supplier: rm.supplier || 'None'
        });
    }
    renderSrBomTable();
}

function addCustomSrBomRow() {
    srBomItems.push({
        checked: true,
        raw_material_id: null,
        material_code: 'CUSTOM',
        material_name: '',
        category: 'Cosmetics',
        current_stock: 0,
        requested_qty: 10,
        unit: 'kg',
        supplier: 'None'
    });
    renderSrBomTable();
}

function addOutOfStockRawMaterialsToSrBom() {
    const list = typeof cachedRawMaterials !== 'undefined' ? cachedRawMaterials : [];
    const depleted = list.filter(r => Number(r.current_stock || 0) <= 0).slice(0, 25);
    if (depleted.length === 0) {
        if (NKB.showToast) NKB.showToast('No out-of-stock (0 kg) raw materials found.', 'info');
        return;
    }
    let added = 0;
    depleted.forEach(rm => {
        const exists = srBomItems.some(x => x.raw_material_id === rm.id || (x.material_code === rm.material_code && x.material_name === rm.material_name));
        if (!exists) {
            srBomItems.push({
                checked: true,
                raw_material_id: rm.id,
                material_code: rm.material_code || 'None',
                material_name: rm.material_name,
                category: rm.category || 'Cosmetics',
                current_stock: Number(rm.current_stock || 0),
                requested_qty: 10,
                unit: rm.unit || 'kg',
                supplier: rm.supplier || 'None'
            });
            added++;
        }
    });
    renderSrBomTable();
    if (NKB.showToast) NKB.showToast(`Added ${added} Red-Zone (0 stock) raw materials to Bill of Materials.`, 'success');
}

async function loadFormulationBomIntoRequisition() {
    const formSelect = document.getElementById('sr-formulation-picker');
    const batchQtyEl = document.getElementById('sr-formulation-batch-qty');
    if (!formSelect || !formSelect.value) {
        if (NKB.showToast) NKB.showToast('Select a Product Formulation first to load its Bill of Materials.', 'warning');
        return;
    }
    const formId = formSelect.value;
    const targetUnits = batchQtyEl ? (Number(batchQtyEl.value) || 1000) : 1000;

    const res = await NKB.api(`/api/formulations/${formId}`);
    if (!res.success || !res.data) {
        if (NKB.showToast) NKB.showToast('Failed to load formulation BOM.', 'error');
        return;
    }

    const f = res.data;
    const baseBatchKg = Number(f.standard_batch_size_kg || 100);
    const unitWeightGrams = Number(f.unit_weight_grams || 50);
    const totalBatchKgNeeded = (targetUnits * unitWeightGrams) / 1000;
    const scaleFactor = baseBatchKg > 0 ? (totalBatchKgNeeded / baseBatchKg) : 1;

    const ingredients = f.ingredients || [];
    if (ingredients.length === 0) {
        if (NKB.showToast) NKB.showToast('This formulation has no ingredients defined.', 'warning');
        return;
    }

    const rmList = typeof cachedRawMaterials !== 'undefined' ? cachedRawMaterials : [];
    ingredients.forEach(ing => {
        const rawName = ing.raw_material_name || ing.ingredient_name || 'Raw Material';
        const matchedRm = rmList.find(r =>
            (ing.raw_material_id && r.id === ing.raw_material_id) ||
            (r.material_name && r.material_name.toLowerCase() === rawName.toLowerCase())
        );
        const baseQtyKg = Number(ing.grams_per_batch ? (ing.grams_per_batch / 1000) : (ing.percentage || 1));
        const reqKg = Number(Math.max(0.1, baseQtyKg * scaleFactor).toFixed(2));

        srBomItems.push({
            checked: true,
            raw_material_id: matchedRm ? matchedRm.id : null,
            material_code: matchedRm ? matchedRm.material_code : (ing.phase ? `PH-${ing.phase}` : 'BOM'),
            material_name: rawName,
            category: matchedRm ? matchedRm.category : (ing.phase ? `Phase ${ing.phase} (${ing.function_role || 'Active'})` : 'Formulation BOM'),
            current_stock: matchedRm ? Number(matchedRm.current_stock || 0) : 0,
            requested_qty: reqKg,
            unit: matchedRm ? (matchedRm.unit || 'kg') : 'kg',
            supplier: matchedRm ? (matchedRm.supplier || 'None') : 'None'
        });
    });

    renderSrBomTable();
    if (NKB.showToast) NKB.showToast(`Loaded ${ingredients.length} BOM ingredients from ${f.product_name} (${targetUnits} pcs batch)!`, 'success');
}

async function handleSrPoChange(selectedPoId) {
    if (!selectedPoId || selectedPoId === 'WAREHOUSE-STOCK') return;
    const breakdownRes = await NKB.api(`/api/formulations/orders/${selectedPoId}/breakdown`);
    if (breakdownRes && breakdownRes.success && breakdownRes.data && Array.isArray(breakdownRes.data.aggregated_raw_materials)) {
        const agg = breakdownRes.data.aggregated_raw_materials;
        if (agg.length > 0) {
            const rmList = typeof cachedRawMaterials !== 'undefined' ? cachedRawMaterials : [];
            agg.forEach(item => {
                const matchedRm = rmList.find(r => r.material_name && r.material_name.toLowerCase() === (item.raw_material_name || '').toLowerCase());
                const reqKg = Number(Math.max(0.1, Number(item.shortage_kg > 0 ? item.shortage_kg : item.total_required_kg || 1)).toFixed(2));
                srBomItems.push({
                    checked: true,
                    raw_material_id: matchedRm ? matchedRm.id : null,
                    material_code: matchedRm ? matchedRm.material_code : 'PO-BOM',
                    material_name: item.raw_material_name,
                    category: matchedRm ? matchedRm.category : `Phase ${item.phase || 'A'}`,
                    current_stock: matchedRm ? Number(matchedRm.current_stock || 0) : Number(item.warehouse_stock_kg || 0),
                    requested_qty: reqKg,
                    unit: 'kg',
                    supplier: matchedRm ? (matchedRm.supplier || 'None') : 'None'
                });
            });
            renderSrBomTable();
            if (NKB.showToast) NKB.showToast(`Loaded ${agg.length} BOM raw materials from PO #${breakdownRes.data.po_number}!`, 'success');
        }
    }
}

async function openSupplyRequestModal(poId = null, poNumber = null, companyName = null, preselectedRmId = null) {
    const root = document.getElementById('modals-root');
    if (!root) return;

    srBomItems = [];

    // Ensure Warehouse Raw Materials are loaded so the BOM inventory selector is populated
    if (typeof cachedRawMaterials === 'undefined' || !cachedRawMaterials || cachedRawMaterials.length === 0) {
        const rmRes = await NKB.api('/api/raw-materials');
        if (rmRes && rmRes.success && Array.isArray(rmRes.data)) {
            cachedRawMaterials = rmRes.data;
        }
    }

    // Load formulations list for the BOM Recipe loader
    const formRes = await NKB.api('/api/formulations');
    const formulations = (formRes && formRes.success && Array.isArray(formRes.data)) ? formRes.data : [];

    // Load PO details or active PO list if opened standalone via shortcut [B]
    let po = null;
    let items = [];
    let availableOrders = [];

    if (poId && poId !== 'WAREHOUSE-STOCK') {
        const res = await NKB.api(`/api/orders/${poId}`);
        po = (res.success && res.data) ? res.data : null;
        items = po?.items || [];
    } else {
        const ordersRes = await NKB.api('/api/orders');
        if (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) {
            availableOrders = ordersRes.data.filter(o => o.overall_status !== 'DELIVERED' && o.overall_status !== 'CANCELLED');
        }
    }

    // If triggered from a selected raw material row or shortcut [B], pre-populate it in the BOM
    if (preselectedRmId && typeof cachedRawMaterials !== 'undefined') {
        const preRm = cachedRawMaterials.find(r => r.id === preselectedRmId);
        if (preRm) {
            srBomItems.push({
                checked: true,
                raw_material_id: preRm.id,
                material_code: preRm.material_code || 'None',
                material_name: preRm.material_name,
                category: preRm.category || 'Cosmetics',
                current_stock: Number(preRm.current_stock || 0),
                requested_qty: 25,
                unit: preRm.unit || 'kg',
                supplier: preRm.supplier || 'None'
            });
        }
    }

    // Also auto-load PO BOM breakdown if opened for a specific PO
    if (poId && poId !== 'WAREHOUSE-STOCK') {
        const breakdownRes = await NKB.api(`/api/formulations/orders/${poId}/breakdown`);
        if (breakdownRes && breakdownRes.success && breakdownRes.data && Array.isArray(breakdownRes.data.aggregated_raw_materials)) {
            const rmList = typeof cachedRawMaterials !== 'undefined' ? cachedRawMaterials : [];
            breakdownRes.data.aggregated_raw_materials.forEach(item => {
                const matchedRm = rmList.find(r => r.material_name && r.material_name.toLowerCase() === (item.raw_material_name || '').toLowerCase());
                const reqKg = Number(Math.max(0.1, Number(item.shortage_kg > 0 ? item.shortage_kg : item.total_required_kg || 1)).toFixed(2));
                srBomItems.push({
                    checked: true,
                    raw_material_id: matchedRm ? matchedRm.id : null,
                    material_code: matchedRm ? matchedRm.material_code : 'PO-BOM',
                    material_name: item.raw_material_name,
                    category: matchedRm ? matchedRm.category : `Phase ${item.phase || 'A'}`,
                    current_stock: matchedRm ? Number(matchedRm.current_stock || 0) : Number(item.warehouse_stock_kg || 0),
                    requested_qty: reqKg,
                    unit: 'kg',
                    supplier: matchedRm ? (matchedRm.supplier || 'None') : 'None'
                });
            });
        }
    }

    const rmOptionsHtml = (typeof cachedRawMaterials !== 'undefined' ? cachedRawMaterials : []).map(rm =>
        `<option value="${rm.id}" ${preselectedRmId === rm.id ? 'selected' : ''}>[${rm.material_code}] ${rm.material_name} — (${rm.category} • Stock: ${rm.current_stock} ${rm.unit})</option>`
    ).join('');

    root.innerHTML = `
        <div id="modal-supply-requisition-bom" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 text-lg font-bold">📋</div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-base font-extrabold text-slate-900">Supply Requisition & Bill of Materials (BOM) Form</h3>
                                <span class="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-mono text-[10px] font-black">Shortcut: B</span>
                            </div>
                            <p class="text-[11px] text-slate-500">Build a structured Raw Material Bill of Materials (BOM) for Purchasing Department procurement</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition cursor-pointer">✕</button>
                </div>

                ${poId && poId !== 'WAREHOUSE-STOCK' ? `
                <div class="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl text-xs flex flex-wrap justify-between items-center gap-2">
                    <div>
                        <span class="text-amber-800 font-bold">PO Reference:</span>
                        <span class="font-mono font-extrabold text-amber-950 ml-1">${poNumber || po?.po_number || poId}</span>
                    </div>
                    <div>
                        <span class="text-amber-800 font-bold">Client:</span>
                        <span class="font-bold text-amber-950 ml-1">${companyName || po?.company_name || 'Client Order'}</span>
                    </div>
                </div>
                ` : `
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                        <label class="block text-slate-700 font-extrabold mb-1">Requisition Allocation Target:</label>
                        <select id="sr-target-po-select" onchange="handleSrPoChange(this.value)" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-900">
                            <option value="WAREHOUSE-STOCK">🏭 Warehouse Raw Material Stock Replenishment (General BOM)</option>
                            ${availableOrders.map(o => `<option value="${o.id}">${o.po_number} — ${o.company_name || 'Client'} (${o.overall_status})</option>`).join('')}
                        </select>
                    </div>
                    <div class="text-[11px] text-slate-500">
                        Select <strong class="text-slate-700">Warehouse Stock Replenishment</strong> to request raw materials for Peeling Lotion & Cosmetics inventory, or link directly to an active Client Purchase Order.
                    </div>
                </div>
                `}

                <form onsubmit="submitSupplyRequest(event, '${poId || ''}', '${poNumber || ''}')" class="space-y-4 text-xs">
                    ${items.length > 0 ? `
                        <div>
                            <label class="block text-slate-700 mb-1.5 font-bold">Select Ordered Products Needing Supplies:</label>
                            <div class="max-h-28 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1.5 bg-slate-50">
                                ${items.map(it => `
                                    <label class="flex items-center gap-2 text-[11px] hover:bg-white p-1 rounded-lg transition cursor-pointer">
                                        <input type="checkbox" name="sr_product" value="${it.product_name} (${it.sku})" checked class="rounded text-amber-600 focus:ring-amber-500">
                                        <span class="font-black text-slate-950">${it.product_name}</span>
                                        <span class="text-[10px] font-mono text-indigo-900 font-bold bg-indigo-50 border border-indigo-200 px-1 rounded">${it.sku}</span>
                                        <span class="text-slate-900 ml-auto font-black font-mono">${NKB.formatNumber(it.target_quantity)} pcs</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- BILL OF MATERIALS (BOM) BUILDER -->
                    <div class="p-4 rounded-2xl border-2 border-amber-200 bg-amber-50/30 space-y-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <span class="text-sm font-black text-slate-900">🧪 Bill of Materials (BOM) Raw Material Selector</span>
                                <span id="sr-bom-count-badge" class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-black text-[10px]">0 Materials Selected</span>
                            </div>
                            <div class="flex flex-wrap items-center gap-1.5">
                                <button type="button" onclick="addOutOfStockRawMaterialsToSrBom()" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-[11px] transition cursor-pointer">
                                    🚨 + Add Red-Zone (0 Stock)
                                </button>
                                <button type="button" onclick="addCustomSrBomRow()" class="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold text-[11px] transition cursor-pointer">
                                    ➕ Custom BOM Row
                                </button>
                            </div>
                        </div>

                        <!-- Picker Row 1: Warehouse Raw Materials Inventory (Peeling Lotion & Cosmetics) -->
                        <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-white p-2.5 rounded-xl border border-slate-200">
                            <div class="md:col-span-7">
                                <label class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">1. Pick from Warehouse Raw Materials (Peeling Lotion & Cosmetics)</label>
                                <select id="sr-rm-inventory-picker" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-xs text-slate-900 bg-slate-50 focus:bg-white">
                                    <option value="">-- Select Raw Material (${typeof cachedRawMaterials !== 'undefined' ? cachedRawMaterials.length : 0} items) --</option>
                                    ${rmOptionsHtml}
                                </select>
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Req. Qty</label>
                                <input type="number" id="sr-rm-picker-qty" step="0.01" min="0.01" value="25" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-black text-xs text-slate-900">
                            </div>
                            <div class="md:col-span-3">
                                <button type="button" onclick="addRawMaterialToSrBom()" class="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-black text-xs shadow-xs transition cursor-pointer">
                                    + Add to BOM
                                </button>
                            </div>
                        </div>

                        <!-- Picker Row 2: Load from Product Formulation Recipe BOM -->
                        <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-white p-2.5 rounded-xl border border-slate-200">
                            <div class="md:col-span-7">
                                <label class="block text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 mb-1">2. Or Auto-Calculate BOM from Product Formulation Recipe</label>
                                <select id="sr-formulation-picker" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-xs text-slate-900 bg-slate-50 focus:bg-white">
                                    <option value="">-- Select Product Formulation to Load Ingredients --</option>
                                    ${formulations.map(f => `<option value="${f.id}">${f.product_name} (${f.product_code || f.category || 'Formula'}) — ${f.ingredient_count || ''} ingredients</option>`).join('')}
                                </select>
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Target Units (pcs)</label>
                                <input type="number" id="sr-formulation-batch-qty" step="1" min="1" value="1000" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-black text-xs text-slate-900">
                            </div>
                            <div class="md:col-span-3">
                                <button type="button" onclick="loadFormulationBomIntoRequisition()" class="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black text-xs shadow-xs transition cursor-pointer">
                                    🧪 Load Formula BOM
                                </button>
                            </div>
                        </div>

                        <!-- Interactive BOM Table -->
                        <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
                            <div class="max-h-56 overflow-y-auto">
                                <table class="w-full text-left border-collapse">
                                    <thead>
                                        <tr class="bg-slate-900 text-white text-[10px] uppercase tracking-wider">
                                            <th class="py-2 px-2.5 text-center w-8">✓</th>
                                            <th class="py-2 px-2.5">Code</th>
                                            <th class="py-2 px-2.5">Raw Material Name</th>
                                            <th class="py-2 px-2.5">Section / Phase</th>
                                            <th class="py-2 px-2.5 text-right">Whse Stock</th>
                                            <th class="py-2 px-2.5 text-right">Qty to Request</th>
                                            <th class="py-2 px-2 text-center w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="sr-bom-table-body"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1 font-bold">Requisition Summary / Raw Materials & Supplies Needed <span class="text-rose-500">*</span></label>
                        <textarea id="sr-materials-needed" rows="3" required placeholder="Auto-populated from the Bill of Materials (BOM) above, or type additional packaging/raw material requirements..." class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition font-bold text-slate-900"></textarea>
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
                        <textarea id="sr-notes" rows="2" placeholder="Optional notes for Purchasing Department (e.g. check supplier for available stock, rush courier)..." class="w-full px-3.5 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white text-slate-800"></textarea>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer">Cancel (Esc)</button>
                        <button type="submit" id="btn-submit-supply-request" class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-lg shadow-amber-600/20 transition flex items-center gap-1.5 cursor-pointer">
                            <span>📤</span><span>Submit BOM Requisition to Purchasing</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    renderSrBomTable();
}

async function submitSupplyRequest(e, poId, poNumber) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-supply-request');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Submitting BOM Requisition...';
    }

    const selectedTargetPo = document.getElementById('sr-target-po-select')?.value;
    const effectivePoId = (poId && poId !== '') ? poId : (selectedTargetPo || 'WAREHOUSE-STOCK');

    const checkedBoxes = Array.from(document.querySelectorAll('input[name="sr_product"]:checked'));
    const affectedProducts = checkedBoxes.map(cb => cb.value).join(', ');
    const materialsNeeded = document.getElementById('sr-materials-needed')?.value || '';
    const urgency = document.getElementById('sr-urgency')?.value || 'NORMAL';
    const targetDate = document.getElementById('sr-target-date')?.value || '';
    const notes = document.getElementById('sr-notes')?.value || '';

    const activeBomItems = (srBomItems || [])
        .filter(it => it.checked !== false && (it.material_name || '').trim() !== '')
        .map(it => ({
            raw_material_id: it.raw_material_id || null,
            material_code: it.material_code || 'None',
            material_name: it.material_name.trim(),
            category: it.category || 'Cosmetics',
            current_stock: Number(it.current_stock || 0),
            requested_qty: Number(it.requested_qty || 0),
            unit: it.unit || 'kg',
            supplier: it.supplier || 'None'
        }));

    try {
        const endpoint = (effectivePoId && effectivePoId !== 'WAREHOUSE-STOCK')
            ? `/api/orders/${effectivePoId}/request-supplies`
            : `/api/supply-requests`;

        const res = await NKB.api(endpoint, {
            method: 'POST',
            body: {
                po_id: effectivePoId,
                materials_needed: materialsNeeded,
                bom_items: activeBomItems,
                urgency,
                target_date: targetDate,
                notes,
                affected_products: affectedProducts
            }
        });

        if (res.success) {
            NKB.showToast(res.message || `BOM Supply requisition submitted to Purchasing Department!`, 'success');
            closeModal();
            if (typeof loadOrders === 'function') loadOrders();
            if (typeof loadPurchasingRequisitions === 'function') loadPurchasingRequisitions();
        } else {
            NKB.showToast(res.error || 'Failed to submit supply requisition.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>📤</span><span>Submit BOM Requisition to Purchasing</span>';
            }
        }
    } catch (err) {
        NKB.showToast('Network error while submitting requisition.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>📤</span><span>Submit BOM Requisition to Purchasing</span>';
        }
    }
}

function formatRequisitionBomHtml(bomItemsRaw) {
    if (!bomItemsRaw) return '';
    let parsed = [];
    try {
        parsed = typeof bomItemsRaw === 'string' ? JSON.parse(bomItemsRaw) : bomItemsRaw;
    } catch (_) {
        parsed = [];
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return '';

    return `
        <div class="mt-2 border border-amber-200 rounded-xl overflow-hidden bg-white">
            <div class="px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                <span class="text-[10px] font-black uppercase tracking-wider text-amber-900">📋 Bill of Materials (BOM) Breakdown</span>
                <span class="text-[10px] font-bold text-amber-800">${parsed.length} Item${parsed.length === 1 ? '' : 's'}</span>
            </div>
            <table class="w-full text-left border-collapse text-[11px]">
                <thead>
                    <tr class="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase">
                        <th class="py-1.5 px-2.5">Code</th>
                        <th class="py-1.5 px-2.5">Material Name</th>
                        <th class="py-1.5 px-2.5">Section</th>
                        <th class="py-1.5 px-2.5 text-right">Requested Qty</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${parsed.map(item => `
                        <tr>
                            <td class="py-1.5 px-2.5 font-mono font-bold text-slate-700">${item.material_code || 'None'}</td>
                            <td class="py-1.5 px-2.5 font-bold text-slate-900">${item.material_name || '-'}</td>
                            <td class="py-1.5 px-2.5 text-slate-500">${item.category || '-'}</td>
                            <td class="py-1.5 px-2.5 text-right font-mono font-black text-amber-800">${item.requested_qty || 0} ${item.unit || 'kg'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
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
                                ${formatRequisitionBomHtml(r.bom_items)}
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
window.updateSrBomItem = updateSrBomItem;
window.removeSrBomRow = removeSrBomRow;
window.addRawMaterialToSrBom = addRawMaterialToSrBom;
window.addCustomSrBomRow = addCustomSrBomRow;
window.addOutOfStockRawMaterialsToSrBom = addOutOfStockRawMaterialsToSrBom;
window.loadFormulationBomIntoRequisition = loadFormulationBomIntoRequisition;
window.handleSrPoChange = handleSrPoChange;
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
let cachedBatches = [];

async function loadBatches() {
    const tbody = document.getElementById('table-batches-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" class="py-6 text-center text-slate-400">Loading production batches...</td></tr>';
    }

    const res = await NKB.api('/api/production/batches');

    if (res.success && res.data) {
        cachedBatches = res.data;
        window.cachedBatches = cachedBatches;

        // Populate client filter dropdown if empty
        const clientSelect = document.getElementById('filter-batch-client');
        if (clientSelect && clientSelect.options.length <= 1) {
            const clientMap = new Map();
            cachedBatches.forEach(b => {
                if (b.client_id && b.company_name) {
                    clientMap.set(b.client_id, b.company_name);
                }
            });
            clientMap.forEach((name, id) => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = name;
                clientSelect.appendChild(opt);
            });
        }

        filterBatches();
    } else {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" class="py-6 text-center text-rose-500 font-bold">${res.error || 'Failed to load batches.'}</td></tr>`;
        }
    }
}

function filterBatches() {
    const tbody = document.getElementById('table-batches-body');
    if (!tbody) return;

    const searchTerm = (document.getElementById('filter-batch-search')?.value || '').toLowerCase().trim();
    const dateFilter = document.getElementById('filter-batch-date')?.value || '';
    const clientFilter = document.getElementById('filter-batch-client')?.value || '';
    const statusFilter = document.getElementById('filter-batch-status')?.value || '';

    let filtered = cachedBatches;

    if (searchTerm) {
        filtered = filtered.filter(b =>
            (b.batch_number && b.batch_number.toLowerCase().includes(searchTerm)) ||
            (b.po_number && b.po_number.toLowerCase().includes(searchTerm)) ||
            (b.jo_number && b.jo_number.toLowerCase().includes(searchTerm)) ||
            (b.product_name && b.product_name.toLowerCase().includes(searchTerm)) ||
            (b.company_name && b.company_name.toLowerCase().includes(searchTerm)) ||
            (b.compounding_operator && b.compounding_operator.toLowerCase().includes(searchTerm)) ||
            (b.bottling_lead && b.bottling_lead.toLowerCase().includes(searchTerm)) ||
            (b.qc_inspector && b.qc_inspector.toLowerCase().includes(searchTerm))
        );
    }

    if (dateFilter) {
        filtered = filtered.filter(b => {
            if (!b.production_date) return false;
            return b.production_date.startsWith(dateFilter);
        });
    }

    if (clientFilter) {
        filtered = filtered.filter(b => b.client_id === clientFilter);
    }

    if (statusFilter) {
        filtered = filtered.filter(b => b.status === statusFilter);
    }

    const counter = document.getElementById('batches-table-counter');
    if (counter) {
        counter.textContent = `Showing ${filtered.length} of ${cachedBatches.length} batches`;
    }

    renderBatchesTable(filtered);
}

function setBatchDateFilter(mode) {
    const dateInput = document.getElementById('filter-batch-date');
    if (!dateInput) return;

    if (mode === 'today') {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    } else {
        dateInput.value = '';
    }
    filterBatches();
}

function renderBatchesTable(batches) {
    const tbody = document.getElementById('table-batches-body');
    if (!tbody) return;

    if (!batches || batches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="py-6 text-center text-slate-400">No production batches found matching the selected filter.</td></tr>';
        return;
    }

    tbody.innerHTML = batches.map(b => {
        const formattedDate = b.production_date ? NKB.formatDate(b.production_date) : '—';
        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600 font-mono">${b.batch_number}</td>
                <td class="py-3 px-4 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-950 font-bold font-mono text-[11px]" title="Production Date">
                        📅 ${b.production_date || formattedDate}
                    </span>
                </td>
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
                    <!-- 1-Click Batch Sales Order Print Shortcut -->
                    <a href="/print-po.html?id=${b.po_id}&title=SALES%20ORDER&batch_id=${b.id}" target="_blank" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm" title="Print Sales Order (1-Click Shortcut)">
                        <span>🖨️ Sales Order</span>
                    </a>
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
        `;
    }).join('');
}

window.filterBatches = filterBatches;
window.setBatchDateFilter = setBatchDateFilter;
window.renderBatchesTable = renderBatchesTable;

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
        cachedDeliveries = res.data;
        window.cachedDeliveries = cachedDeliveries;
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
                <td class="py-3 px-4 text-right whitespace-nowrap">
                    <div class="inline-flex items-center gap-1.5 justify-end">
                        ${dr.status === 'ACCEPTED' ? (
                            canInvoice ? `
                                <button onclick="openGenerateInvoiceModal('${dr.id}', '${dr.dr_number}', '${(dr.company_name || '').replace(/'/g, "\\'")}', ${dr.total_accepted})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-1 cursor-pointer">
                                    <span>⚡ Invoice</span>
                                </button>
                            ` : `
                                <span class="text-[11px] text-slate-400 italic px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg inline-block">Awaiting Accounting Invoice</span>
                            `
                        ) : (dr.status !== 'INVOICED' && dr.status !== 'CANCELLED' && canReceive) ? `
                            <button onclick="openClientReceivingModal('${dr.id}')" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer shadow-xs" title="Record Client Receiving & Acceptance">
                                <span>📥 Receive</span>
                            </button>
                        ` : `
                            <button onclick="openViewDRModal('${dr.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer" title="View Delivery Receipt Details">
                                <span>🔍 Details</span>
                            </button>
                        `}

                        <!-- WhatsApp / SMS Dispatch Milestone Notice -->
                        <button onclick="openDispatchAlertModal('${dr.id}')" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer shadow-xs" title="WhatsApp & SMS Dispatch Milestone">
                            <span>📲</span><span class="hidden xl:inline">Alert</span>
                        </button>

                        <!-- 3-Dot (•••) Dropdown Menu -->
                        <div class="relative inline-block text-left">
                            <button type="button" onclick="toggleTableActionMenu(event, 'dr-menu-${dr.id}')" class="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition focus:outline-none cursor-pointer" title="More Actions">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/></svg>
                            </button>
                            <div id="dr-menu-${dr.id}" class="table-action-menu hidden absolute right-0 mt-1 w-52 bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-40 text-left animate-fade-in font-medium text-xs divide-y divide-slate-100">
                                <div class="py-1">
                                    <div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">DR Actions</div>
                                    <button onclick="openDispatchAlertModal('${dr.id}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 transition text-left cursor-pointer font-bold">
                                        <span>📲</span><span>WhatsApp / SMS Alert</span>
                                    </button>
                                    <button onclick="openViewDRModal('${dr.id}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 transition text-left cursor-pointer">
                                        <span>🔍</span><span>View DR Details</span>
                                    </button>
                                    <button onclick="openViewPOModal('${dr.po_id}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-indigo-700 hover:bg-indigo-50 transition text-left cursor-pointer">
                                        <span>👁️</span><span>View PO (${dr.po_number})</span>
                                    </button>
                                    <a href="/print-dr.html?id=${dr.id}" class="flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 transition">
                                        <span>🖨️</span><span>Print Delivery Receipt</span>
                                    </a>
                                </div>
                                ${(canEditDispatch || canReceive) ? `
                                    <div class="py-1">
                                        <div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Operations</div>
                                        ${(canEditDispatch && dr.status !== 'ACCEPTED' && dr.status !== 'INVOICED' && dr.status !== 'CANCELLED') ? `
                                            <button onclick="openEditDRModal('${dr.id}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-amber-700 hover:bg-amber-50 transition text-left cursor-pointer font-bold">
                                                <span>✏️</span><span>Edit Dispatch Info</span>
                                            </button>
                                        ` : ''}
                                        ${(canReceive && dr.status !== 'ACCEPTED' && dr.status !== 'INVOICED' && dr.status !== 'CANCELLED') ? `
                                            <button onclick="openClientReceivingModal('${dr.id}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 transition text-left cursor-pointer font-bold">
                                                <span>📥</span><span>Client Acceptance</span>
                                            </button>
                                        ` : ''}
                                        ${(canInvoice && dr.status === 'ACCEPTED') ? `
                                            <button onclick="openGenerateInvoiceModal('${dr.id}', '${dr.dr_number}', '${(dr.company_name || '').replace(/'/g, "\\'")}', ${dr.total_accepted})" class="w-full flex items-center gap-2 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 transition text-left cursor-pointer font-bold">
                                                <span>⚡</span><span>Generate Invoice</span>
                                            </button>
                                        ` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
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
        cachedInvoices = res.data;
        window.cachedInvoices = cachedInvoices;
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
                <td class="py-3 px-4 text-right whitespace-nowrap">
                    <div class="inline-flex items-center gap-1.5 justify-end">
                        ${si.balance_due > 0 ? `
                            <button onclick="openRecordPaymentModal('${si.id}', '${si.invoice_number}', ${si.balance_due}, '${(si.company_name || '').replace(/'/g, "\\'")}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-1 cursor-pointer">
                                <span>💵 Pay</span>
                            </button>
                        ` : `
                            <a href="/print-invoice.html?id=${si.id}" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition inline-flex items-center gap-1">
                                <span>🖨️ Print SI</span>
                            </a>
                        `}

                        <!-- 3-Dot (•••) Dropdown Menu -->
                        <div class="relative inline-block text-left">
                            <button type="button" onclick="toggleTableActionMenu(event, 'si-menu-${si.id}')" class="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition focus:outline-none cursor-pointer" title="More Actions">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/></svg>
                            </button>
                            <div id="si-menu-${si.id}" class="table-action-menu hidden absolute right-0 mt-1 w-48 bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-40 text-left animate-fade-in font-medium text-xs divide-y divide-slate-100">
                                <div class="py-1">
                                    <div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoice Options</div>
                                    <a href="/print-invoice.html?id=${si.id}" class="flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 transition">
                                        <span>🖨️</span><span>Print Sales Invoice</span>
                                    </a>
                                    ${si.po_id ? `
                                        <button onclick="openViewPOModal('${si.po_id}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-indigo-700 hover:bg-indigo-50 transition text-left cursor-pointer">
                                            <span>👁️</span><span>View PO (${si.po_number || ''})</span>
                                        </button>
                                    ` : ''}
                                    ${si.balance_due > 0 ? `
                                        <button onclick="openRecordPaymentModal('${si.id}', '${si.invoice_number}', ${si.balance_due}, '${(si.company_name || '').replace(/'/g, "\\'")}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 transition text-left font-bold cursor-pointer">
                                            <span>💵</span><span>Record Payment</span>
                                        </button>
                                    ` : ''}
                                    <button onclick="openEditInvoiceDatesModal('${si.id}', '${si.invoice_number}', '${si.invoice_date || ''}', '${si.due_date || ''}')" class="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:bg-slate-50 transition text-left cursor-pointer">
                                        <span>📅</span><span>Edit Dates (Late Encoding)</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
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
    checkClientPaymentSubmissionsAlert();
}

function renderPaymentsRows(paymentsList, currentTotal) {
    const tbody = document.getElementById('table-payments-body');
    if (!tbody) return;

    if (!paymentsList || paymentsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-slate-400 font-medium">No payment records found.</td></tr>`;
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
                ${p.bank_name ? `<div class="text-[10px] font-semibold text-slate-500 mt-0.5">${p.bank_name}</div>` : ''}
            </td>
            <td class="py-3 px-4">
                <div class="font-mono text-slate-700 text-xs font-semibold">${p.reference_number || '—'}</div>
                ${p.check_number ? `<div class="text-[10px] font-bold text-indigo-600">Check #: ${p.check_number}</div>` : ''}
                ${p.notes ? `<div class="text-[11px] text-slate-500 italic mt-0.5 flex items-start gap-1"><span class="text-amber-600 font-bold">📝</span> <span class="break-words">${p.notes}</span></div>` : ''}
            </td>
            <td class="py-3 px-4 text-right font-extrabold text-emerald-700 text-sm whitespace-nowrap">${NKB.formatCurrency(p.amount)}</td>
            <td class="py-3 px-4 text-center whitespace-nowrap">
                ${p.attachment_url ? `
                    <button onclick="openViewCheckModal('${p.id}')" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold inline-flex items-center gap-1 shadow-2xs transition cursor-pointer" title="View Check Image">
                        <span>🖼️</span>
                        <span>View Check</span>
                    </button>
                ` : `
                    <button onclick="openAttachCheckModal('${p.id}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer" title="Attach Check or Deposit Proof">
                        <span>➕</span>
                        <span>Attach</span>
                    </button>
                `}
            </td>
            <td class="py-3 px-4">${NKB.renderStatusBadge(p.invoice_status || 'PAID')}</td>
            <td class="py-3 px-4 text-slate-500 whitespace-nowrap">${p.recorded_by_name || 'Accounting Staff'}</td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
                <a href="/print-receipt.html?id=${p.id}" target="_blank" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg border border-indigo-200 text-xs inline-flex items-center gap-1 shadow-2xs transition cursor-pointer" title="Print Official BIR Collection Receipt">
                    <span>🖨️</span><span>Receipt</span>
                </a>
            </td>
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
            (p.check_number && p.check_number.toLowerCase().includes(query)) ||
            (p.bank_name && p.bank_name.toLowerCase().includes(query)) ||
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

/**
 * Check and display client payment submissions pending review
 */
async function checkClientPaymentSubmissionsAlert() {
    const alertEl = document.getElementById('payments-client-submissions-alert');
    const textEl = document.getElementById('payments-client-submissions-text');
    if (!alertEl) return;

    try {
        const res = await NKB.api('/api/payments/client-submissions/list?status=PENDING_REVIEW');
        if (res.success && res.data && res.data.length > 0) {
            const count = res.data.length;
            const amt = res.summary?.pendingAmount || 0;
            if (textEl) {
                textEl.textContent = `You have ${count} client payment proof${count === 1 ? '' : 's'} totaling ${NKB.formatCurrency(amt)} waiting for accounting verification.`;
            }
            alertEl.classList.remove('hidden');
        } else {
            alertEl.classList.add('hidden');
        }
    } catch (_) {
        alertEl.classList.add('hidden');
    }
}

/**
 * Open Client Payment Submissions Review Modal
 */
async function openClientSubmissionsReviewModal() {
    const root = document.getElementById('modals-root');
    const modalId = 'modal-client-submissions-review';

    let existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const res = await NKB.api('/api/payments/client-submissions/list');
    const submissions = (res.success && Array.isArray(res.data)) ? res.data : [];

    const wrapper = document.createElement('div');
    wrapper.id = modalId;
    wrapper.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn';
    wrapper.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn">
            <div class="p-6 bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between flex-shrink-0">
                <div>
                    <h3 class="text-base font-black flex items-center gap-2">
                        <span>🧾</span><span>Client Payment Proofs Verification Queue</span>
                    </h3>
                    <p class="text-xs text-slate-300 mt-0.5">Inspect client uploaded checks and deposit slips, verify bank details, and post payment to ledger with 1-click.</p>
                </div>
                <button type="button" onclick="closeClientSubmissionsReviewModal()" class="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-white/10 transition text-xl font-bold">&times;</button>
            </div>

            <div class="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
                ${submissions.length === 0 ? `
                    <div class="py-12 text-center text-slate-400">
                        <span class="text-3xl block mb-2">📋</span>
                        <div class="font-bold text-slate-600">No client payment submissions found.</div>
                    </div>
                ` : submissions.map(s => {
                    const isPending = s.status === 'PENDING_REVIEW';
                    const isApproved = s.status === 'APPROVED';

                    return `
                        <div class="p-4 rounded-2xl border ${isPending ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200 bg-white'} shadow-sm space-y-3">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">${s.submission_number}</span>
                                    <span class="font-bold text-slate-800">${s.company_name}</span>
                                    <span class="text-slate-400">•</span>
                                    <span class="font-mono text-slate-600">Invoice: ${s.invoice_number}</span>
                                </div>
                                <div>
                                    ${isPending ? '<span class="badge bg-amber-100 text-amber-800 border border-amber-300 font-bold">Pending Review</span>' :
                                      isApproved ? '<span class="badge bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">Approved & Recorded</span>' :
                                      '<span class="badge bg-rose-100 text-rose-800 border border-rose-300 font-bold">Rejected</span>'}
                                </div>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                <div class="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                                    <div class="text-[10px] text-slate-500 uppercase font-semibold">Amount Submitted</div>
                                    <div class="text-base font-black text-emerald-700 mt-0.5">${NKB.formatCurrency(s.amount)}</div>
                                </div>
                                <div class="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                                    <div class="text-[10px] text-slate-500 uppercase font-semibold">Payment Method</div>
                                    <div class="font-bold text-slate-800 mt-0.5">${(s.payment_method || '').replace(/_/g, ' ')}</div>
                                </div>
                                <div class="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                                    <div class="text-[10px] text-slate-500 uppercase font-semibold">Bank Name</div>
                                    <div class="font-bold text-slate-800 mt-0.5">${s.bank_name || '—'}</div>
                                </div>
                                <div class="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                                    <div class="text-[10px] text-slate-500 uppercase font-semibold">Check / Ref #</div>
                                    <div class="font-mono font-bold text-slate-800 mt-0.5">${s.check_number || s.reference_number || '—'}</div>
                                </div>
                            </div>

                            ${s.notes ? `
                                <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
                                    <span class="font-bold text-slate-700">Client Note:</span> ${s.notes}
                                </div>
                            ` : ''}

                            ${s.attachment_url ? `
                                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <img src="${s.attachment_url}" alt="Check Proof" class="h-14 w-20 object-cover rounded-lg border border-slate-300 flex-shrink-0 cursor-pointer" onclick="window.open('${s.attachment_url}', '_blank')">
                                        <div class="text-xs">
                                            <div class="font-bold text-slate-800">Uploaded Check / Slip Proof</div>
                                            <div class="text-[11px] text-slate-500">Click to view in high resolution</div>
                                        </div>
                                    </div>
                                    <a href="${s.attachment_url}" target="_blank" class="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 text-xs">
                                        Full Image ↗
                                    </a>
                                </div>
                            ` : ''}

                            ${isPending ? `
                                <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                    <button onclick="handleRejectSubmissionPrompt('${s.id}')" class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 text-xs transition">
                                        ❌ Reject
                                    </button>
                                    <button onclick="handleApproveSubmission('${s.id}')" class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-md shadow-emerald-600/20">
                                        ✅ Approve & Credit Invoice
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>

            <div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-end flex-shrink-0">
                <button type="button" onclick="closeClientSubmissionsReviewModal()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition">
                    Close
                </button>
            </div>
        </div>
    `;

    root.appendChild(wrapper);
}

function closeClientSubmissionsReviewModal() {
    const el = document.getElementById('modal-client-submissions-review');
    if (el) el.remove();
}

async function handleApproveSubmission(id) {
    if (!confirm('Approve this client payment submission? This will automatically record the official payment, update the invoice balance, and credit the depository bank account.')) return;

    try {
        const res = await NKB.api(`/api/payments/client-submissions/${id}/review`, {
            method: 'POST',
            body: { action: 'APPROVE' }
        });

        if (res.success) {
            NKB.showToast(res.message || 'Payment submission approved and applied to invoice!', 'success');
            closeClientSubmissionsReviewModal();
            loadPayments();
        } else {
            NKB.showToast(res.error || 'Failed to approve submission.', 'error');
        }
    } catch (err) {
        NKB.showToast('Server error approving payment.', 'error');
    }
}

async function handleRejectSubmissionPrompt(id) {
    const reason = prompt('Please enter a reason for rejecting this payment submission:');
    if (!reason) return;

    try {
        const res = await NKB.api(`/api/payments/client-submissions/${id}/review`, {
            method: 'POST',
            body: { action: 'REJECT', rejection_reason: reason }
        });

        if (res.success) {
            NKB.showToast('Submission rejected.', 'info');
            closeClientSubmissionsReviewModal();
            loadPayments();
        } else {
            NKB.showToast(res.error || 'Failed to reject submission.', 'error');
        }
    } catch (err) {
        NKB.showToast('Server error rejecting payment.', 'error');
    }
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
// 7B. CHEQUE PAYABLES & COO APPROVALS (ACCOUNTANT WORKFLOW)
// -------------------------------------------------------------
let cachedPayables = [];
let cachedPayablesSummary = {};
let cachedPayablesMeta = { banks: [], categories: [] };
let cachedBankAccounts = [];
let currentPayableAttachmentBase64 = null;
let currentPayableExistingAttachmentUrl = null;
let currentPayableAttachmentRemoved = false;
const LIVE_COO_API_KEY = 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b';

async function loadBankBalances() {
    try {
        const res = await NKB.api('/api/bank-accounts');
        if (!res.success) return;

        cachedBankAccounts = Array.isArray(res.data) ? res.data : [];
        window.cachedBankAccounts = cachedBankAccounts;
        const summary = res.summary || {};

        const totalEl = document.getElementById('bank-balances-total');
        if (totalEl) {
            totalEl.textContent = NKB.formatCurrency(summary.totalLiquidBalance || 0);
        }

        const grid = document.getElementById('bank-balances-grid');
        if (!grid) return;

        if (cachedBankAccounts.length === 0) {
            grid.innerHTML = `<div class="text-center py-4 text-xs text-slate-500 col-span-full">No active bank accounts found.</div>`;
            return;
        }

        grid.innerHTML = cachedBankAccounts.map(acc => {
            const bal = parseFloat(acc.current_balance) || 0;
            const isLow = bal < 100000;
            const bankInitials = (acc.bank_name || 'BK')
                .split(' ')
                .filter(w => !['and', '&', 'of', 'the', 'co.', 'corp.'].includes(w.toLowerCase()))
                .map(w => w[0])
                .slice(0, 3)
                .join('');

            return `
                <div class="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex flex-col justify-between transition group shadow-sm">
                    <div>
                        <div class="flex items-center justify-between gap-1 mb-1">
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-800 text-amber-400 font-mono tracking-wider">${bankInitials}</span>
                            <span class="text-[10px] font-mono text-slate-500">${acc.account_number ? acc.account_number.slice(-4) : '—'}</span>
                        </div>
                        <div class="font-bold text-xs text-slate-200 truncate" title="${acc.bank_name}">
                            ${acc.bank_name}
                        </div>
                        <div class="text-[10px] text-slate-400 font-mono truncate">
                            ${acc.account_number || ''}
                        </div>
                    </div>
                    <div class="mt-2.5 pt-2 border-t border-slate-800/80">
                        <div class="text-[9px] uppercase font-bold text-slate-400">Available Balance</div>
                        <div class="text-sm font-black ${isLow ? 'text-amber-400' : 'text-emerald-400'}">
                            ${NKB.formatCurrency(bal)}
                        </div>
                        ${acc.pending_outflows > 0 ? `
                            <div class="text-[9px] text-slate-400 mt-0.5">
                                Pending: <span class="text-amber-400 font-semibold">-${NKB.formatCurrency(acc.pending_outflows)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('loadBankBalances failed:', err);
    }
}

async function loadPayables() {
    try {
        const res = await NKB.api('/api/cheque-payables');
        if (!res.success) {
            NKB.showToast(res.error || 'Failed to load cheque payables.', 'error');
            return;
        }

        cachedPayables = Array.isArray(res.data) ? res.data : [];
        window.cachedPayables = cachedPayables;
        cachedPayablesSummary = res.summary || {};
        cachedPayablesMeta = {
            banks: Array.isArray(res.banks) ? res.banks : [],
            categories: Array.isArray(res.categories) ? res.categories : []
        };
        window.cachedPayablesMeta = cachedPayablesMeta;

        // Also fetch live bank balances
        loadBankBalances();

        // Update KPI Cards
        const setEl = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        const totalReq = parseFloat(cachedPayablesSummary.totalRequested) || 0;
        const totalCount = parseInt(cachedPayablesSummary.totalCount, 10) || cachedPayables.length;
        const pendingAmt = parseFloat(cachedPayablesSummary.totalPending) || 0;
        const pendingCount = parseInt(cachedPayablesSummary.countPending, 10) || 0;
        const confAmt = parseFloat(cachedPayablesSummary.totalConfirmed) || 0;
        const confCount = parseInt(cachedPayablesSummary.countConfirmed, 10) || 0;
        const disbAmt = parseFloat(cachedPayablesSummary.totalDisbursed) || 0;
        const disbCount = parseInt(cachedPayablesSummary.countDisbursed, 10) || 0;

        setEl('payables-kpi-total-amount', NKB.formatCurrency(totalReq));
        setEl('payables-kpi-total-count', `${totalCount} total request${totalCount === 1 ? '' : 's'}`);
        setEl('payables-kpi-pending-amount', NKB.formatCurrency(pendingAmt));
        setEl('payables-kpi-pending-count', `${pendingCount} awaiting COO authorization`);
        setEl('payables-kpi-confirmed-amount', NKB.formatCurrency(confAmt));
        setEl('payables-kpi-confirmed-count', `${confCount} confirmed for release`);
        setEl('payables-kpi-disbursed-amount', NKB.formatCurrency(disbAmt));
        setEl('payables-kpi-disbursed-count', `${disbCount} cheques released`);
        setEl('payables-visible-count', `Showing all (${cachedPayables.length})`);

        // Update Post-Dated Cheque (PDC) Maturity Alert Banner
        const pdcBanner = document.getElementById('payables-pdc-alert-banner');
        if (pdcBanner) {
            const m48Count = cachedPayablesSummary.countMaturing48h || 0;
            const m48Total = cachedPayablesSummary.totalMaturing48h || 0;
            const m7dCount = cachedPayablesSummary.countMaturing7d || 0;
            const m7dTotal = cachedPayablesSummary.totalMaturing7d || 0;

            if (m48Count > 0) {
                pdcBanner.classList.remove('hidden');
                const titleEl = document.getElementById('pdc-alert-title');
                const descEl = document.getElementById('pdc-alert-desc');
                if (titleEl) titleEl.textContent = `⚠️ ${m48Count} Cheque${m48Count === 1 ? '' : 's'} Maturing within 48 Hours!`;
                if (descEl) descEl.textContent = `${m48Count} cheque(s) maturing within 48 hours totaling ${NKB.formatCurrency(m48Total)}. (Next 7 days total: ${m7dCount} cheques totaling ${NKB.formatCurrency(m7dTotal)}). Please verify adequate depository account balances.`;
            } else if (m7dCount > 0) {
                pdcBanner.classList.remove('hidden');
                const titleEl = document.getElementById('pdc-alert-title');
                const descEl = document.getElementById('pdc-alert-desc');
                if (titleEl) titleEl.textContent = `🗓️ ${m7dCount} Cheque${m7dCount === 1 ? '' : 's'} Maturing in Next 7 Days`;
                if (descEl) descEl.textContent = `${m7dCount} cheque(s) scheduled for encashment totaling ${NKB.formatCurrency(m7dTotal)}. Monitor your liquid depository balances.`;
            } else {
                pdcBanner.classList.add('hidden');
            }
        }

        // Populate Category Filter Dropdown if needed
        const catSelect = document.getElementById('payables-category-filter');
        if (catSelect && cachedPayablesMeta.categories && catSelect.options.length <= 1) {
            cachedPayablesMeta.categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                catSelect.appendChild(opt);
            });
        }

        // Populate Bank Filter Dropdown if needed
        const bankSelect = document.getElementById('payables-bank-filter');
        if (bankSelect && cachedPayablesMeta.banks && bankSelect.options.length <= 1) {
            cachedPayablesMeta.banks.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.name;
                opt.textContent = b.name;
                bankSelect.appendChild(opt);
            });
        }

        renderPayablesRows(cachedPayables, totalReq);
    } catch (err) {
        console.error('loadPayables failed:', err);
        NKB.showToast('Error loading cheque payables.', 'error');
    }
}

function renderPayablesRows(payablesList, currentTotal) {
    const tbody = document.getElementById('table-payables-body');
    if (!tbody) return;

    if (!payablesList || payablesList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="py-12 text-center text-slate-400">
                    <span class="text-3xl block mb-2">📑</span>
                    <div class="font-bold text-slate-600">No cheque payable records found</div>
                    <div class="text-xs text-slate-400 mt-1">Click "Request Payables" above to submit a new cheque requisition for COO approval.</div>
                </td>
            </tr>
        `;
        const footerTotal = document.getElementById('table-payables-footer-total');
        if (footerTotal) footerTotal.textContent = NKB.formatCurrency(0);
        return;
    }

    const calcTotal = currentTotal != null ? currentTotal : payablesList.reduce((sum, cp) => sum + (parseFloat(cp.amount) || 0), 0);
    const footerTotal = document.getElementById('table-payables-footer-total');
    if (footerTotal) footerTotal.textContent = NKB.formatCurrency(calcTotal);

    const getCategoryBadge = (cat) => {
        const c = String(cat || '').toLowerCase();
        let bg = 'bg-slate-100 text-slate-700 border-slate-200';
        if (c.includes('material')) bg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        else if (c.includes('pack')) bg = 'bg-purple-50 text-purple-700 border-purple-200';
        else if (c.includes('util')) bg = 'bg-amber-50 text-amber-700 border-amber-200';
        else if (c.includes('rent')) bg = 'bg-blue-50 text-blue-700 border-blue-200';
        else if (c.includes('pay') || c.includes('labor')) bg = 'bg-cyan-50 text-cyan-700 border-cyan-200';
        else if (c.includes('maint') || c.includes('repair')) bg = 'bg-orange-50 text-orange-700 border-orange-200';
        else if (c.includes('freight') || c.includes('logist')) bg = 'bg-teal-50 text-teal-700 border-teal-200';
        else if (c.includes('tax')) bg = 'bg-rose-50 text-rose-700 border-rose-200';
        return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold border ${bg} whitespace-nowrap">${cat || 'General'}</span>`;
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'PENDING_COO_APPROVAL':
                return `<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1 shadow-2xs animate-pulse"><span>⏳</span><span>Pending COO</span></span>`;
            case 'CONFIRMED':
                return `<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1 shadow-2xs"><span>✅</span><span>COO Approved</span></span>`;
            case 'ISSUED':
                return `<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300 inline-flex items-center gap-1 shadow-2xs"><span>📤</span><span>Issued</span></span>`;
            case 'CLEARED':
                return `<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800 border border-teal-300 inline-flex items-center gap-1 shadow-2xs"><span>🏦</span><span>Cleared</span></span>`;
            case 'REJECTED':
                return `<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center gap-1 shadow-2xs"><span>❌</span><span>COO Rejected</span></span>`;
            default:
                return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">${(status || '').replace(/_/g, ' ')}</span>`;
        }
    };

    const getPdcBadge = (cp) => {
        if (['CLEARED', 'REJECTED', 'VOIDED'].includes(cp.status)) return '';
        if (cp.maturity_status === 'DUE_TODAY') {
            return `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">DUE TODAY</span>`;
        }
        if (cp.maturity_status === 'MATURING_48H') {
            return `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300">≤48H</span>`;
        }
        if (cp.maturity_status === 'MATURING_7D') {
            return `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200">${cp.days_until_maturity}d</span>`;
        }
        if (cp.days_until_maturity < 0) {
            return `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-700">Matured</span>`;
        }
        if (cp.is_pdc) {
            return `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700">PDC</span>`;
        }
        return '';
    };

    tbody.innerHTML = payablesList.map(cp => {
        const hasAttachment = !!cp.attachment_url;
        const isPdf = hasAttachment && cp.attachment_url.toLowerCase().endsWith('.pdf');

        return `
            <tr class="hover:bg-slate-50/80 transition border-b border-slate-100">
                <td class="py-3.5 px-4 font-mono font-bold text-indigo-700 whitespace-nowrap">
                    <div>${cp.request_number}</div>
                    ${cp.cheque_number ? `<div class="text-[10px] text-slate-500 font-normal">Chq: ${cp.cheque_number}</div>` : ''}
                </td>
                <td class="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                    <div class="flex items-center">
                        <span>${NKB.formatDate(cp.cheque_date)}</span>
                        ${getPdcBadge(cp)}
                    </div>
                </td>
                <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-900 leading-tight">${cp.payee_name}</div>
                    ${cp.invoice_reference ? `<div class="text-[10px] text-indigo-600 font-mono mt-0.5 font-semibold">Ref: ${cp.invoice_reference}</div>` : ''}
                </td>
                <td class="py-3.5 px-4">${getCategoryBadge(cp.category)}</td>
                <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-800">${cp.bank_name || '—'}</div>
                    ${cp.bank_account_number ? `<div class="text-[10px] text-slate-400 font-mono">${cp.bank_account_number}</div>` : ''}
                </td>
                <td class="py-3.5 px-4">
                    <div class="text-xs text-slate-700 line-clamp-2 max-w-xs" title="${(cp.purpose || '').replace(/"/g, '&quot;')}">
                        ${cp.purpose || '—'}
                    </div>
                </td>
                <td class="py-3.5 px-4 text-right font-black text-slate-900 text-sm whitespace-nowrap">
                    ${NKB.formatCurrency(cp.amount)}
                </td>
                <td class="py-3.5 px-4 text-center whitespace-nowrap">
                    ${hasAttachment ? `
                        <button onclick="openViewPayableDetailsModal('${cp.id}')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs transition cursor-pointer" title="View Voucher / Bill Attachment">
                            <span>${isPdf ? '📄' : '🖼️'}</span>
                            <span>View</span>
                        </button>
                    ` : `
                        <span class="text-slate-300 text-xs">—</span>
                    `}
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">${getStatusBadge(cp.status)}</td>
                <td class="py-3.5 px-4 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end gap-1.5">
                        <button onclick="openRequestPayableModal('${cp.id}')" class="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition cursor-pointer" title="Edit Payable Request">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onclick="openViewPayableDetailsModal('${cp.id}')" class="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer" title="View Full Cheque Details & Audit">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        </button>
                        <button onclick="printSingleChequeVoucher('${cp.id}')" class="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer" title="Print Cheque Disbursement Voucher (CDV)">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                        </button>
                        ${['CONFIRMED', 'ISSUED'].includes(cp.status) ? `
                            <button onclick="markChequeAsCleared('${cp.id}')" class="px-2 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-[11px] font-bold shadow-2xs transition inline-flex items-center gap-1 cursor-pointer" title="Mark Cheque Cleared at Bank & Debit Account">
                                <span>🏦</span>
                                <span>Clear</span>
                            </button>
                        ` : ''}
                        ${cp.status === 'PENDING_COO_APPROVAL' ? `
                            <button onclick="openCooConfirmPayableModal('${cp.id}')" class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-bold shadow-2xs transition inline-flex items-center gap-1 cursor-pointer" title="Confirm via COO Integration">
                                <span>⚡</span>
                                <span>COO Action</span>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterPayablesTable() {
    if (!cachedPayables) return;
    const query = (document.getElementById('payables-search-input')?.value || '').trim().toLowerCase();
    const status = (document.getElementById('payables-status-filter')?.value || '').trim();
    const category = (document.getElementById('payables-category-filter')?.value || '').trim();
    const bank = (document.getElementById('payables-bank-filter')?.value || '').trim().toLowerCase();
    const dateFrom = (document.getElementById('payables-date-from')?.value || '').trim();
    const dateTo = (document.getElementById('payables-date-to')?.value || '').trim();

    const filtered = cachedPayables.filter(cp => {
        const matchesQuery = !query ||
            (cp.request_number && cp.request_number.toLowerCase().includes(query)) ||
            (cp.cheque_number && cp.cheque_number.toLowerCase().includes(query)) ||
            (cp.payee_name && cp.payee_name.toLowerCase().includes(query)) ||
            (cp.purpose && cp.purpose.toLowerCase().includes(query)) ||
            (cp.bank_name && cp.bank_name.toLowerCase().includes(query)) ||
            (cp.invoice_reference && cp.invoice_reference.toLowerCase().includes(query)) ||
            (cp.internal_notes && cp.internal_notes.toLowerCase().includes(query));

        let matchesStatus = true;
        if (status === 'MATURING_48H') {
            matchesStatus = (cp.maturity_status === 'MATURING_48H' || cp.maturity_status === 'DUE_TODAY') && !['CLEARED', 'REJECTED', 'VOIDED'].includes(cp.status);
        } else if (status === 'MATURING_7D') {
            matchesStatus = (cp.days_until_maturity >= 0 && cp.days_until_maturity <= 7) && !['CLEARED', 'REJECTED', 'VOIDED'].includes(cp.status);
        } else if (status) {
            matchesStatus = cp.status === status;
        }

        const matchesCategory = !category || cp.category === category;
        const matchesBank = !bank || (cp.bank_name && cp.bank_name.toLowerCase().includes(bank));
        const matchesDateFrom = !dateFrom || cp.cheque_date >= dateFrom;
        const matchesDateTo = !dateTo || cp.cheque_date <= dateTo;

        return matchesQuery && matchesStatus && matchesCategory && matchesBank && matchesDateFrom && matchesDateTo;
    });

    const filteredTotal = filtered.reduce((sum, cp) => sum + (parseFloat(cp.amount) || 0), 0);
    const countEl = document.getElementById('payables-visible-count');
    if (countEl) {
        countEl.textContent = `Showing ${filtered.length} of ${cachedPayables.length}`;
    }

    renderPayablesRows(filtered, filteredTotal);
}

function setPayablesDatePreset(preset) {
    const fromEl = document.getElementById('payables-date-from');
    const toEl = document.getElementById('payables-date-to');
    if (!fromEl || !toEl) return;

    const today = NKB.getManilaDate();
    if (preset === 'today') {
        fromEl.value = today;
        toEl.value = today;
    } else if (preset === 'week') {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(d.setDate(diff));
        fromEl.value = monday.toISOString().split('T')[0];
        toEl.value = today;
    } else if (preset === 'month') {
        const parts = today.split('-');
        fromEl.value = `${parts[0]}-${parts[1]}-01`;
        toEl.value = today;
    } else {
        fromEl.value = '';
        toEl.value = '';
    }

    filterPayablesTable();
}

function resetPayablesFilters() {
    const sInput = document.getElementById('payables-search-input');
    const stSelect = document.getElementById('payables-status-filter');
    const catSelect = document.getElementById('payables-category-filter');
    const bSelect = document.getElementById('payables-bank-filter');
    const fromEl = document.getElementById('payables-date-from');
    const toEl = document.getElementById('payables-date-to');

    if (sInput) sInput.value = '';
    if (stSelect) stSelect.value = '';
    if (catSelect) catSelect.value = '';
    if (bSelect) bSelect.value = '';
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';

    filterPayablesTable();
}

function quickFilterPayablesStatus(status) {
    const stSelect = document.getElementById('payables-status-filter');
    if (stSelect) {
        stSelect.value = status;
        filterPayablesTable();
    }
}

function quickFilterPayablesPDC(code) {
    const stSelect = document.getElementById('payables-status-filter');
    if (stSelect) {
        stSelect.value = code;
        filterPayablesTable();
    }
}

async function markChequeAsCleared(payableId) {
    const cp = cachedPayables.find(item => item.id === payableId);
    const payee = cp ? cp.payee_name : 'this cheque';
    const amtStr = cp ? NKB.formatCurrency(cp.amount) : '';

    if (!confirm(`Mark cheque for ${payee} (${amtStr}) as CLEARED in depository bank?\n\nThis will debit the company bank account ledger balance.`)) {
        return;
    }

    try {
        const res = await NKB.api(`/api/cheque-payables/${payableId}/clear`, {
            method: 'POST',
            body: JSON.stringify({ notes: 'Cleared at depository bank' })
        });

        if (res.success) {
            NKB.showToast(`Cheque marked as CLEARED. Bank account debited.`, 'success');
            loadPayables();
            loadBankBalances();
        } else {
            NKB.showToast(res.error || 'Failed to clear cheque.', 'error');
        }
    } catch (err) {
        console.error('markChequeAsCleared error:', err);
        NKB.showToast('Server error clearing cheque.', 'error');
    }
}

// Accountant Cheque Payable Requisition Modal
async function handlePayableAttachmentSelect(input) {
    const previewContainer = document.getElementById('req-payable-preview-container');
    const previewImg = document.getElementById('req-payable-preview-img');
    const previewName = document.getElementById('req-payable-preview-name');
    const previewLink = document.getElementById('req-payable-preview-link');
    const dropText = document.getElementById('req-payable-droptext');

    if (!input.files || !input.files[0]) {
        currentPayableAttachmentBase64 = null;
        if (!currentPayableExistingAttachmentUrl) {
            if (previewContainer) previewContainer.classList.add('hidden');
            if (dropText) dropText.classList.remove('hidden');
        }
        return;
    }

    const file = input.files[0];
    if (file.size > 12 * 1024 * 1024) {
        NKB.showToast('Attachment must be under 12MB.', 'warning');
        input.value = '';
        return;
    }

    try {
        currentPayableAttachmentRemoved = false;
        currentPayableExistingAttachmentUrl = null;
        if (file.type && file.type.startsWith('image/')) {
            const compressed = await NKB.compressImage(file, { maxWidth: 1600, quality: 0.82 });
            currentPayableAttachmentBase64 = compressed;
            if (previewContainer) previewContainer.classList.remove('hidden');
            if (dropText) dropText.classList.add('hidden');
            if (previewLink) {
                previewLink.textContent = `🖼️ ${file.name} (Optimized)`;
                previewLink.href = currentPayableAttachmentBase64;
                previewLink.classList.remove('hidden');
            } else if (previewName) {
                previewName.textContent = `${file.name} (Optimized)`;
            }
            if (previewImg) {
                previewImg.src = currentPayableAttachmentBase64;
                previewImg.classList.remove('hidden');
            }
        } else {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentPayableAttachmentBase64 = e.target.result;
                if (previewContainer) previewContainer.classList.remove('hidden');
                if (dropText) dropText.classList.add('hidden');
                if (previewLink) {
                    previewLink.textContent = `📄 ${file.name}`;
                    previewLink.href = currentPayableAttachmentBase64;
                    previewLink.classList.remove('hidden');
                } else if (previewName) {
                    previewName.textContent = file.name;
                }
                if (previewImg) previewImg.classList.add('hidden');
            };
            reader.readAsDataURL(file);
        }
    } catch (err) {
        console.error('handlePayableAttachmentSelect error:', err);
        NKB.showToast('Error processing attachment.', 'error');
    }
}

function clearPayableAttachment() {
    currentPayableAttachmentBase64 = null;
    currentPayableExistingAttachmentUrl = null;
    currentPayableAttachmentRemoved = true;
    const input = document.getElementById('req-payable-file');
    if (input) input.value = '';
    const previewContainer = document.getElementById('req-payable-preview-container');
    if (previewContainer) previewContainer.classList.add('hidden');
    const previewImg = document.getElementById('req-payable-preview-img');
    if (previewImg) {
        previewImg.src = '';
        previewImg.classList.add('hidden');
    }
    const dropText = document.getElementById('req-payable-droptext');
    if (dropText) {
        dropText.textContent = 'No file chosen';
        dropText.classList.remove('hidden');
    }
}

let currentEditingPayableId = null;

const PAYABLE_COMPANY_BANK_MAP = {
    'NKB Manufacturing Corporation': 'BDO: NKB Manufacturing Corporation - 0080-5801-0547',
    'NKB Cosmetics Manufacturing': 'BDO: NKB Cosmetics Manufacturing - 0105-4800-4829',
    'Vyuceutical OPC': 'BDO: Vyuceutical - 0080-5801-0717',
    'NKB Manufacturing Coorporation - COOP': 'BDO: Norvin Bella (COOP) - 0080-5801-0563',
    'New Yra Enterprises': 'BDO: New Yra Enterprises - 0036-8801-3196',
    'NKB Cosmetic Products Trading': 'BDO: NKB Cosmetic Products Trading - 0105-4800-3245'
};

const DEFAULT_PAYABLE_CATEGORIES_LIST = [
    'Commission',
    'Returned of Borrow Funds',
    'Contribution - SSS',
    'Contribution - PhilHealth',
    'Contribution - Pag-ibig',
    'BIR Tax Payment',
    'City Hall Tax Payment',
    'City Hall Expenses',
    'Investment Payout',
    'Marketing Expenses',
    'Office Expenses',
    'Petty Cash',
    'Raw Materials',
    'Vehicle Payment',
    'Salaries',
    'TDF',
    'TDF(COOP)',
    'Personal Expenses',
    'Repair Expenses',
    'Construction',
    'Insurance (Personal)'
];

const DEFAULT_PAYABLE_COMPANIES_LIST = [
    'NKB Manufacturing Corporation',
    'NKB Cosmetics Manufacturing',
    'Vyuceutical OPC',
    'NKB Manufacturing Coorporation - COOP',
    'New Yra Enterprises',
    'NKB Cosmetic Products Trading'
];

const DEFAULT_PAYABLE_BANKS_LIST = [
    { id: 'ba-bdo-coop', name: 'BDO: Norvin Bella (COOP) - 0080-5801-0563', bank_name: 'BDO: Norvin Bella (COOP) - 0080-5801-0563', account_name: 'Norvin Bella (COOP)', account_number: '0080-5801-0563', balance: 650000 },
    { id: 'ba-bdo-nkb-mfg', name: 'BDO: NKB Manufacturing Corporation - 0080-5801-0547', bank_name: 'BDO: NKB Manufacturing Corporation - 0080-5801-0547', account_name: 'NKB Manufacturing Corporation', account_number: '0080-5801-0547', balance: 950000 },
    { id: 'ba-bdo-nkb-cosm', name: 'BDO: NKB Cosmetics Manufacturing - 0105-4800-4829', bank_name: 'BDO: NKB Cosmetics Manufacturing - 0105-4800-4829', account_name: 'NKB Cosmetics Manufacturing', account_number: '0105-4800-4829', balance: 800000 },
    { id: 'ba-bdo-nkb-cpt', name: 'BDO: NKB Cosmetic Products Trading - 0105-4800-3245', bank_name: 'BDO: NKB Cosmetic Products Trading - 0105-4800-3245', account_name: 'NKB Cosmetic Products Trading', account_number: '0105-4800-3245', balance: 700000 },
    { id: 'ba-bdo-new-yra', name: 'BDO: New Yra Enterprises - 0036-8801-3196', bank_name: 'BDO: New Yra Enterprises - 0036-8801-3196', account_name: 'New Yra Enterprises', account_number: '0036-8801-3196', balance: 600000 },
    { id: 'ba-bdo-vyu', name: 'BDO: Vyuceutical - 0080-5801-0717', bank_name: 'BDO: Vyuceutical - 0080-5801-0717', account_name: 'Vyuceutical OPC', account_number: '0080-5801-0717', balance: 550000 },
    { id: 'ba-sec-nkb-mfg', name: 'Security Bank: NKB Manufacturing Corporation - 0000079720871', bank_name: 'Security Bank: NKB Manufacturing Corporation - 0000079720871', account_name: 'NKB Manufacturing Corporation', account_number: '0000079720871', balance: 500000 },
    { id: 'ba-mb-nkb-mfg', name: 'Metrobank: NKB Manufacturing Corporation - 788-7-78803245-1', bank_name: 'Metrobank: NKB Manufacturing Corporation - 788-7-78803245-1', account_name: 'NKB MANUFACTURING CORPORATION', account_number: '788-7-78803245-1', balance: 750000 }
];

function checkPayableOverdraft(overrideAmount = null) {
    const bankSelect = document.getElementById('req-payable-bank');
    const warnBox = document.getElementById('req-payable-overdraft-warn');
    const warnText = document.getElementById('req-payable-overdraft-text');
    if (!bankSelect || !warnBox) return;

    const opt = bankSelect.options[bankSelect.selectedIndex];
    const balance = opt ? parseFloat(opt.getAttribute('data-balance') || 0) : 0;
    
    let amount = overrideAmount != null ? overrideAmount : 0;
    if (overrideAmount == null) {
        const rows = document.querySelectorAll('#payable-items-table-body tr');
        rows.forEach(r => {
            const qty = parseFloat(r.querySelector('.payable-item-qty')?.value) || 0;
            const cost = parseFloat(r.querySelector('.payable-item-cost')?.value) || 0;
            amount += (qty * cost);
        });
    }

    if (amount > 0 && balance > 0 && amount > balance) {
        warnBox.classList.remove('hidden');
        if (warnText) {
            warnText.textContent = `Warning: Cheque amount (${NKB.formatCurrency(amount)}) exceeds available funds in ${bankSelect.value} (${NKB.formatCurrency(balance)})! You may still submit, but account will overdraft unless funded.`;
        }
    } else {
        warnBox.classList.add('hidden');
    }
}

function onPayableCompanyChange(selectEl) {
    const compName = selectEl.value;
    const targetBank = PAYABLE_COMPANY_BANK_MAP[compName];
    const bankSelect = document.getElementById('req-payable-bank');
    if (targetBank && bankSelect) {
        for (let i = 0; i < bankSelect.options.length; i++) {
            if (bankSelect.options[i].value === targetBank || bankSelect.options[i].text.includes(targetBank)) {
                bankSelect.selectedIndex = i;
                onPayableBankChange(bankSelect);
                break;
            }
        }
    }
}

async function openAddPayableCompanyModal() {
    const existing = document.getElementById('add-company-mini-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'add-company-mini-modal';
    overlay.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]';
    overlay.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4 border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h4 class="text-sm font-bold text-slate-800">Add New Company</h4>
                <button type="button" onclick="document.getElementById('add-company-mini-modal').remove()" class="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none cursor-pointer">&times;</button>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Company Name</label>
                <input type="text" id="add-company-input" placeholder="e.g. Bella Skin Enterprise" class="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
            </div>
            <div class="flex items-center justify-end gap-2 pt-2">
                <button type="button" onclick="document.getElementById('add-company-mini-modal').remove()" class="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer">Cancel</button>
                <button type="button" id="btn-save-new-company" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer">Save Company</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById('add-company-input');
    const saveBtn = document.getElementById('btn-save-new-company');
    if (input) input.focus();

    async function handleSave() {
        const compName = input?.value?.trim();
        if (!compName) {
            NKB.showToast('Please enter a company name.', 'warning');
            return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        try {
            const res = await NKB.api('/api/cheque-payables/companies', {
                method: 'POST',
                body: JSON.stringify({ name: compName })
            });
            if (res.success) {
                NKB.showToast(`Company "${res.data.name}" added successfully!`, 'success');
                const select = document.getElementById('req-payable-company');
                if (select) {
                    const opt = document.createElement('option');
                    opt.value = res.data.name;
                    opt.textContent = res.data.name;
                    select.appendChild(opt);
                    select.value = res.data.name;
                    onPayableCompanyChange(select);
                }
                overlay.remove();
            } else {
                NKB.showToast(res.error || 'Failed to add company.', 'error');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Company';
            }
        } catch (err) {
            console.error('Add company error:', err);
            NKB.showToast('Server error adding company.', 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Company';
        }
    }

    if (saveBtn) saveBtn.onclick = handleSave;
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            } else if (e.key === 'Escape') {
                overlay.remove();
            }
        });
    }
}

function onPayableTermChange(selectEl) {
    if (!selectEl) return;
    const term = selectEl.value;
    const invDateInput = document.getElementById('req-payable-invoice-date');
    const dueDateInput = document.getElementById('req-payable-due-date');
    if (!invDateInput || !dueDateInput) return;
    const baseDateStr = invDateInput.value || NKB.getManilaDate();
    const baseDate = new Date(baseDateStr + 'T00:00:00+08:00');
    if (isNaN(baseDate.getTime())) return;

    let daysToAdd = 30;
    if (term === 'Net 15') daysToAdd = 15;
    else if (term === 'Net 30') daysToAdd = 30;
    else if (term === 'Net 60') daysToAdd = 60;
    else if (term === 'COD' || term === 'Due upon receipt') daysToAdd = 0;

    baseDate.setDate(baseDate.getDate() + daysToAdd);
    dueDateInput.value = baseDate.toISOString().split('T')[0];
}

function onPayableBankChange(selectEl) {
    const selectedBankName = selectEl.value;
    const bankAccountInput = document.getElementById('req-payable-bank-acct');
    
    const bankObj = (cachedBankAccounts && cachedBankAccounts.length > 0)
        ? cachedBankAccounts.find(b => b.bank_name === selectedBankName || b.name === selectedBankName)
        : (cachedPayablesMeta?.banks || []).find(b => b.name === selectedBankName || b.bank_name === selectedBankName);

    if (bankAccountInput) {
        if (bankObj && bankObj.account_number) {
            bankAccountInput.value = bankObj.account_number;
        } else {
            const match = selectedBankName.match(/\d{4}-\d{4}-\d{4}/);
            bankAccountInput.value = match ? match[0] : '';
        }
    }
    checkPayableOverdraft();
}

function recalcPayableItem(el) {
    const row = el.closest('tr');
    if (!row) return;
    const qtyInput = row.querySelector('.payable-item-qty');
    const costInput = row.querySelector('.payable-item-cost');
    const subtotalEl = row.querySelector('.payable-item-subtotal');
    
    const qty = parseFloat(qtyInput?.value) || 0;
    const cost = parseFloat(costInput?.value) || 0;
    const sub = qty * cost;
    
    if (subtotalEl) {
        subtotalEl.value = sub.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    recalcPayableTotals();
}

function recalcPayableTotals() {
    const rows = document.querySelectorAll('#payable-items-table-body tr');
    let total = 0;
    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.payable-item-qty')?.value) || 0;
        const cost = parseFloat(row.querySelector('.payable-item-cost')?.value) || 0;
        total += (qty * cost);
    });

    const subtotalDisplay = document.getElementById('req-payable-summary-subtotal');
    const totalDisplay = document.getElementById('req-payable-summary-total');
    if (subtotalDisplay) subtotalDisplay.textContent = NKB.formatCurrency(total);
    if (totalDisplay) totalDisplay.textContent = NKB.formatCurrency(total);

    checkPayableOverdraft(total);
}

function addPayableItemRow(item = null) {
    const tbody = document.getElementById('payable-items-table-body');
    if (!tbody) return;

    const desc = item ? (item.description || '') : '';
    const cat = item ? (item.category || 'Raw Materials') : 'Raw Materials';
    const qty = item && item.quantity != null ? parseFloat(item.quantity) : 1;
    const cost = item && item.cost != null ? parseFloat(item.cost) : 0;
    const subtotal = qty * cost;

    const categories = (cachedPayablesMeta?.categories?.length > 0)
        ? cachedPayablesMeta.categories
        : DEFAULT_PAYABLE_CATEGORIES_LIST;

    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-200 hover:bg-slate-50/70 transition';
    tr.innerHTML = `
        <td class="py-1.5 px-2 sm:px-2.5">
            <input type="text" class="payable-item-desc w-full h-8 sm:h-9 px-2 sm:px-2.5 border border-slate-300 rounded text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="e.g. RAW MATERIALS" value="${desc.replace(/"/g, '&quot;')}">
        </td>
        <td class="py-1.5 px-2 sm:px-2.5">
            <select class="payable-item-cat w-full h-8 sm:h-9 px-2 sm:px-2.5 border border-slate-300 rounded text-xs sm:text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                ${categories.map(c => `<option value="${c}" ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
        </td>
        <td class="py-1.5 px-1.5 sm:px-2 text-center">
            <input type="number" step="any" min="0" class="payable-item-qty w-full h-8 sm:h-9 px-1.5 sm:px-2 border border-slate-300 rounded text-xs sm:text-sm font-semibold text-center focus:border-blue-500" value="${qty}" oninput="recalcPayableItem(this)">
        </td>
        <td class="py-1.5 px-1.5 sm:px-2 text-right">
            <input type="number" step="0.01" min="0" class="payable-item-cost w-full h-8 sm:h-9 px-1.5 sm:px-2 border border-slate-300 rounded text-xs sm:text-sm font-semibold text-right focus:border-blue-500" value="${cost.toFixed(2)}" oninput="recalcPayableItem(this)">
        </td>
        <td class="py-1.5 px-1.5 sm:px-2 text-right">
            <input type="text" readonly class="payable-item-subtotal w-full h-8 sm:h-9 px-1.5 sm:px-2 bg-slate-50 border border-slate-300 rounded text-xs sm:text-sm font-bold text-slate-800 text-right font-mono" value="${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}">
        </td>
        <td class="py-1.5 px-2 text-center">
            <button type="button" onclick="removePayableItemRow(this)" class="h-8 sm:h-9 px-2.5 sm:px-3 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition shadow-xs cursor-pointer">Delete</button>
        </td>
    `;
    tbody.appendChild(tr);
    recalcPayableTotals();
}

function removePayableItemRow(btn) {
    const row = btn.closest('tr');
    const tbody = document.getElementById('payable-items-table-body');
    if (!row || !tbody) return;
    if (tbody.children.length > 1) {
        row.remove();
        recalcPayableTotals();
    } else {
        const descInput = row.querySelector('.payable-item-desc');
        const qtyInput = row.querySelector('.payable-item-qty');
        const costInput = row.querySelector('.payable-item-cost');
        const subInput = row.querySelector('.payable-item-subtotal');
        if (descInput) descInput.value = '';
        if (qtyInput) qtyInput.value = '1';
        if (costInput) costInput.value = '0.00';
        if (subInput) subInput.value = '0.00';
        recalcPayableTotals();
    }
}

function printCurrentPayableForm() {
    if (currentEditingPayableId) {
        printSingleChequeVoucher(currentEditingPayableId);
    } else {
        NKB.showToast('Please click Save first before printing the official voucher.', 'info');
    }
}

async function openRequestPayableModal(payableId = null) {
    currentPayableAttachmentBase64 = null;
    currentPayableAttachmentRemoved = false;
    currentEditingPayableId = payableId;
    const root = document.getElementById('modals-root');
    const today = NKB.getManilaDate();

    // Check if editing
    let cp = null;
    if (payableId) {
        cp = (typeof cachedPayables !== 'undefined' ? cachedPayables : (window.cachedPayables || [])).find(item => item.id === payableId || item.request_number === payableId);
        try {
            const res = await NKB.api(`/api/cheque-payables/${encodeURIComponent(payableId)}`);
            if (res?.success && res.data) {
                cp = res.data;
            }
        } catch (_) {}
    }

    currentPayableExistingAttachmentUrl = cp?.attachment_url || null;

    const isEdit = !!cp;
    const modalTitle = isEdit ? 'Editing Payable' : 'Payable Request Form';

    const companies = ((typeof cachedPayablesMeta !== 'undefined' && cachedPayablesMeta?.companies?.length > 0)
        ? cachedPayablesMeta.companies
        : ((window.cachedPayablesMeta?.companies?.length > 0)
            ? window.cachedPayablesMeta.companies
            : DEFAULT_PAYABLE_COMPANIES_LIST));

    const banksList = ((typeof cachedBankAccounts !== 'undefined' && cachedBankAccounts.length > 0)
        ? cachedBankAccounts
        : ((window.cachedBankAccounts && window.cachedBankAccounts.length > 0)
            ? window.cachedBankAccounts
            : ((typeof cachedPayablesMeta !== 'undefined' && cachedPayablesMeta?.banks?.length > 0)
                ? cachedPayablesMeta.banks
                : ((window.cachedPayablesMeta?.banks?.length > 0)
                    ? window.cachedPayablesMeta.banks
                    : DEFAULT_PAYABLE_BANKS_LIST))));

    const selectedCompany = cp?.company_name || companies[0];
    const defaultBankName = PAYABLE_COMPANY_BANK_MAP[selectedCompany] || banksList[0]?.bank_name || banksList[0]?.name;

    // Formatting date created
    let dateCreatedFormatted = today;
    if (cp?.created_at) {
        try {
            const d = new Date(cp.created_at);
            if (!isNaN(d.getTime())) {
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const yyyy = d.getFullYear();
                dateCreatedFormatted = `${mm}/${dd}/${yyyy}`;
            }
        } catch (_) {}
    } else {
        const parts = today.split('-');
        if (parts.length === 3) dateCreatedFormatted = `${parts[1]}/${parts[2]}/${parts[0]}`;
    }

    const payableNumberDisplay = cp?.request_number || 'PB-Auto';
    const currentUser = (typeof NKB !== 'undefined' && NKB.getUser) ? NKB.getUser() : null;
    const createdByDisplay = cp?.requested_by_name || cp?.requestor_name || currentUser?.name || 'Accountant';
    const statusDisplay = cp ? (cp.status || '').replace(/_/g, ' ') : 'Submitted For Approval';

    // Due date default: 30 days from today
    let dueDateVal = cp?.due_date;
    if (!dueDateVal) {
        const d = new Date(today + 'T00:00:00+08:00');
        d.setDate(d.getDate() + 30);
        dueDateVal = d.toISOString().split('T')[0];
    }

    const existingFileName = cp?.attachment_url ? (cp.attachment_url.split('/').pop() || 'Existing Attachment') : '';

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-2 sm:p-4 md:p-6 z-50 overflow-y-auto">
            <div class="bg-white rounded-lg sm:rounded-xl md:rounded-2xl max-w-5xl lg:max-w-6xl w-full p-4 sm:p-6 md:p-7 shadow-2xl space-y-4 sm:space-y-5 my-auto max-h-[95vh] overflow-y-auto border border-slate-200">
                <!-- Header matching Reference Image -->
                <div class="flex justify-between items-center border-b border-slate-200 pb-3">
                    <h3 class="text-base sm:text-lg md:text-xl font-bold text-slate-800 tracking-tight">${modalTitle}</h3>
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="printCurrentPayableForm()" class="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition cursor-pointer" title="Print Cheque Disbursement Voucher">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                        </button>
                        <button type="button" onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-2xl leading-none px-1 cursor-pointer">&times;</button>
                    </div>
                </div>

                <form onsubmit="submitRequestPayable(event)" class="space-y-4">
                    <!-- Top Grid matching Reference Image with perfect symmetry across devices -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
                        <!-- Row 1: Company (with Add button in label header) -->
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="text-[11px] sm:text-xs font-semibold text-slate-600">Company</label>
                                <button type="button" onclick="openAddPayableCompanyModal()" class="text-[11px] sm:text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer" title="Add New Company">+ Add</button>
                            </div>
                            <select id="req-payable-company" onchange="onPayableCompanyChange(this)" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                ${companies.map(c => `<option value="${c}" ${c === selectedCompany ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>

                        <!-- Row 1: Invoice Number -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Invoice Number</label>
                            <input type="text" id="req-payable-invoice-no" value="${cp?.invoice_number || cp?.invoice_reference || ''}" placeholder="e.g. 239683" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-mono text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        </div>

                        <!-- Row 1: Date Created -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Date Created</label>
                            <input type="text" id="req-payable-created-date" readonly value="${dateCreatedFormatted}" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-200 rounded-md sm:rounded-lg bg-slate-50 text-xs sm:text-sm text-slate-600 font-medium cursor-not-allowed">
                        </div>

                        <!-- Row 1: Payable Number (Blue label in reference) -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-bold text-blue-600 mb-1">Payable Number</label>
                            <input type="text" id="req-payable-number" readonly value="${payableNumberDisplay}" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-blue-200 rounded-md sm:rounded-lg bg-blue-50/60 text-xs sm:text-sm text-blue-700 font-bold font-mono cursor-not-allowed">
                        </div>

                        <!-- Row 2: Payable Category -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Payable Category</label>
                            <input type="text" id="req-payable-category-type" value="${cp?.payable_category || 'Trade payable'}" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        </div>

                        <!-- Row 2: Invoice Date -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Invoice Date</label>
                            <input type="date" id="req-payable-invoice-date" value="${cp?.invoice_date || today}" onchange="onPayableTermChange(document.getElementById('req-payable-terms'))" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        </div>

                        <!-- Row 2: Created By -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Created By</label>
                            <input type="text" id="req-payable-created-by" readonly value="${createdByDisplay}" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-200 rounded-md sm:rounded-lg bg-slate-50 text-xs sm:text-sm text-slate-700 font-medium cursor-not-allowed">
                        </div>

                        <!-- Row 2: Control Number -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Control Number</label>
                            <input type="text" id="req-payable-control-no" value="${cp?.control_number || ''}" placeholder="e.g. 1993" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-mono text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        </div>

                        <!-- Row 3: Vendor -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Vendor *</label>
                            <input type="text" id="req-payable-payee" required value="${cp?.payee_name || cp?.vendor || ''}" placeholder="e.g. MARK JOSEPH Q. REALUYO" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-bold text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        </div>

                        <!-- Row 3: Term -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Term</label>
                            <select id="req-payable-terms" onchange="onPayableTermChange(this)" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                <option value="Net 30" ${(cp?.terms === 'Net 30' || !cp) ? 'selected' : ''}>Net 30</option>
                                <option value="Net 15" ${cp?.terms === 'Net 15' ? 'selected' : ''}>Net 15</option>
                                <option value="Net 60" ${cp?.terms === 'Net 60' ? 'selected' : ''}>Net 60</option>
                                <option value="COD" ${cp?.terms === 'COD' ? 'selected' : ''}>COD</option>
                                <option value="Due upon receipt" ${cp?.terms === 'Due upon receipt' ? 'selected' : ''}>Due upon receipt</option>
                            </select>
                        </div>

                        <!-- Row 3: Due Date -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Due Date</label>
                            <input type="date" id="req-payable-due-date" value="${dueDateVal}" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        </div>

                        <!-- Row 3: Status -->
                        <div>
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Status</label>
                            <input type="text" id="req-payable-status" readonly value="${statusDisplay}" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-200 rounded-md sm:rounded-lg bg-slate-50 text-xs sm:text-sm font-semibold text-amber-700 cursor-not-allowed">
                        </div>

                        <!-- Row 4: Description (2 columns on tablet & desktop) -->
                        <div class="sm:col-span-2">
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Description</label>
                            <input type="text" id="req-payable-description" value="${cp?.purpose || cp?.description || ''}" placeholder="e.g. RAW MATERIALS" class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        </div>

                        <!-- Row 4: Bank to use for check (2 columns on tablet & desktop) -->
                        <div class="sm:col-span-2">
                            <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Bank to use for check *</label>
                            <select id="req-payable-bank" onchange="onPayableBankChange(this)" required class="w-full h-9 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                <option value="">Select Bank Account...</option>
                                ${banksList.map(b => {
                                    const bName = b.bank_name || b.name;
                                    const balStr = b.current_balance != null ? ` (Avail: ${NKB.formatCurrency(b.current_balance)})` : (b.balance != null ? ` (Avail: ${NKB.formatCurrency(b.balance)})` : '');
                                    const isSel = (cp && (cp.bank_name === bName || cp.bank_name === b.name)) || (!cp && bName === defaultBankName);
                                    return `<option value="${bName}" data-balance="${b.current_balance || b.balance || 0}" ${isSel ? 'selected' : ''}>${bName}${balStr}</option>`;
                                }).join('')}
                            </select>
                            <input type="hidden" id="req-payable-bank-acct" value="${cp?.bank_account_number || ''}">
                            <input type="hidden" id="req-payable-check-no" value="${cp?.cheque_number || ''}">
                        </div>
                    </div>

                    <!-- Overdraft Warning Notice -->
                    <div id="req-payable-overdraft-warn" class="hidden p-3 rounded-md sm:rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-2">
                        <span class="text-base">⚠️</span>
                        <span id="req-payable-overdraft-text"></span>
                    </div>

                    <!-- Line Items Table (Streamlined) -->
                    <div class="space-y-1.5 pt-1">
                        <div class="border border-slate-300 rounded-md sm:rounded-lg overflow-x-auto bg-white shadow-xs">
                            <table class="w-full text-left border-collapse min-w-[560px] sm:min-w-[660px]">
                                <thead>
                                    <tr class="bg-slate-50 border-b border-slate-300 text-slate-700 text-[11px] sm:text-xs font-semibold">
                                        <th class="py-2 px-2.5 sm:px-3">Description</th>
                                        <th class="py-2 px-2.5 sm:px-3 w-48 sm:w-56">Expense Category</th>
                                        <th class="py-2 px-2.5 sm:px-3 w-20 sm:w-24 text-center">Quantity</th>
                                        <th class="py-2 px-2.5 sm:px-3 w-28 sm:w-32 text-right">Cost</th>
                                        <th class="py-2 px-2.5 sm:px-3 w-28 sm:w-32 text-right">Subtotal</th>
                                        <th class="py-2 px-2.5 sm:px-3 w-20 sm:w-24 text-center">
                                            <button type="button" onclick="addPayableItemRow()" class="px-2.5 sm:px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded text-xs font-bold transition shadow-xs cursor-pointer" title="Add Line Item">Add</button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody id="payable-items-table-body">
                                    <!-- Dynamic Rows inserted via JavaScript -->
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Comments, Files & Totals Section -->
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 pt-1">
                        <!-- Left Side: Comments & Files -->
                        <div class="md:col-span-7 lg:col-span-8 space-y-3">
                            <div>
                                <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Comments</label>
                                <textarea id="req-payable-comments" rows="3" placeholder="NKB MANUFACTURING CORPORATION CHECK DETAILS..." class="w-full px-2.5 sm:px-3 py-2 border border-slate-300 rounded-md sm:rounded-lg bg-white text-xs sm:text-sm font-mono text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">${cp?.comments || ''}</textarea>
                            </div>

                            <div>
                                <label class="block text-[11px] sm:text-xs font-semibold text-slate-600 mb-1">Attachment / Encoded File</label>
                                <div class="border border-slate-300 rounded-md sm:rounded-lg p-2 bg-white flex items-center justify-between text-xs sm:text-sm relative overflow-hidden">
                                    <div class="flex items-center gap-2 min-w-0 flex-1">
                                        <label for="req-payable-file" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap transition">
                                            Choose File
                                        </label>
                                        <input type="file" id="req-payable-file" accept="image/*,.pdf" onchange="handlePayableAttachmentSelect(this)" class="sr-only">
                                        <span id="req-payable-droptext" class="text-xs text-slate-400 truncate ${cp?.attachment_url ? 'hidden' : ''}">
                                            No file chosen
                                        </span>
                                    </div>
                                    <div id="req-payable-preview-container" class="${cp?.attachment_url ? '' : 'hidden'} flex items-center gap-2 pl-2">
                                        <a id="req-payable-preview-link" href="${cp?.attachment_url || '#'}" target="_blank" class="${cp?.attachment_url ? '' : 'hidden'} text-xs font-bold text-blue-600 hover:underline truncate max-w-[150px] sm:max-w-[220px]" title="Click to view existing attachment">
                                            📎 ${existingFileName}
                                        </a>
                                        <span id="req-payable-preview-name" class="${cp?.attachment_url ? 'hidden' : ''} text-xs font-medium text-slate-600 truncate max-w-[120px] sm:max-w-[180px]"></span>
                                        <button type="button" onclick="clearPayableAttachment()" class="text-xs text-red-600 hover:text-red-800 font-semibold cursor-pointer">Remove</button>
                                    </div>
                                    <img id="req-payable-preview-img" class="hidden" alt="preview">
                                </div>
                            </div>
                        </div>

                        <!-- Right Side: Clean Summary Card -->
                        <div class="md:col-span-5 lg:col-span-4 bg-white rounded-md sm:rounded-lg border border-slate-300 p-3.5 sm:p-4 space-y-2.5 shadow-xs flex flex-col justify-center">
                            <div class="flex justify-between items-center text-xs sm:text-sm">
                                <span class="text-slate-600 font-medium">Subtotal:</span>
                                <span id="req-payable-summary-subtotal" class="font-mono font-bold text-slate-900">₱0.00</span>
                            </div>
                            <div class="border-t border-slate-200 pt-2.5 flex justify-between items-center text-xs sm:text-sm">
                                <span class="text-slate-700 font-bold">Total:</span>
                                <span id="req-payable-summary-total" class="font-mono font-bold text-slate-900">₱0.00</span>
                            </div>
                            <div class="border-t border-slate-200 pt-2 flex justify-between items-center text-xs sm:text-sm">
                                <span class="text-slate-800 font-extrabold">Amount Due:</span>
                                <span id="req-payable-summary-due" class="font-mono font-black text-slate-900 text-sm sm:text-base">₱0.00</span>
                            </div>
                        </div>
                    </div>

                    <!-- Bottom Action Buttons matching reference image -->
                    <div class="flex flex-wrap items-center gap-2 sm:gap-2.5 pt-3 border-t border-slate-200">
                        <button type="submit" class="h-9 sm:h-10 px-5 sm:px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md sm:rounded-lg text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer">Save</button>
                        <button type="button" onclick="closeModal()" class="h-9 sm:h-10 px-4 sm:px-5 bg-red-600 hover:bg-red-700 text-white rounded-md sm:rounded-lg text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer">Cancel</button>
                        <button type="button" onclick="closeModal()" class="h-9 sm:h-10 px-4 sm:px-5 bg-slate-600 hover:bg-slate-700 text-white rounded-md sm:rounded-lg text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer">Back</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Populate line items
    let initialItems = [];
    if (cp?.line_items) {
        try {
            initialItems = typeof cp.line_items === 'string' ? JSON.parse(cp.line_items) : cp.line_items;
        } catch (_) {}
    }
    if (!initialItems || initialItems.length === 0) {
        if (cp) {
            initialItems = [{
                description: cp.purpose || cp.payee_name || 'RAW MATERIALS',
                category: cp.category || 'Raw Materials',
                quantity: 1,
                cost: parseFloat(cp.amount) || 0,
                subtotal: parseFloat(cp.amount) || 0
            }];
        } else {
            initialItems = [{
                description: '',
                category: 'Raw Materials',
                quantity: 1,
                cost: 0,
                subtotal: 0
            }];
        }
    }

    initialItems.forEach(item => addPayableItemRow(item));
    recalcPayableTotals();
}

async function submitRequestPayable(e) {
    e.preventDefault();

    const companyName = document.getElementById('req-payable-company')?.value;
    const invoiceNumber = document.getElementById('req-payable-invoice-no')?.value?.trim() || null;
    const invoiceDate = document.getElementById('req-payable-invoice-date')?.value || null;
    const payableCategory = document.getElementById('req-payable-category-type')?.value?.trim() || 'Trade payable';
    const controlNumber = document.getElementById('req-payable-control-no')?.value?.trim() || null;
    const payee = document.getElementById('req-payable-payee')?.value?.trim();
    const terms = document.getElementById('req-payable-terms')?.value || 'Net 30';
    const dueDate = document.getElementById('req-payable-due-date')?.value || null;
    const description = document.getElementById('req-payable-description')?.value?.trim() || 'Payable Requisition';
    const bankName = document.getElementById('req-payable-bank')?.value;
    const bankAccount = document.getElementById('req-payable-bank-acct')?.value?.trim() || null;
    const chequeNumber = document.getElementById('req-payable-check-no')?.value?.trim() || null;
    const comments = document.getElementById('req-payable-comments')?.value?.trim() || null;

    if (!payee || !bankName) {
        NKB.showToast('Please fill in required fields (Vendor / Payee and Bank).', 'warning');
        return;
    }

    // Collect line items
    const rows = document.querySelectorAll('#payable-items-table-body tr');
    const lineItems = [];
    let calculatedTotal = 0;
    rows.forEach(r => {
        const desc = r.querySelector('.payable-item-desc')?.value?.trim() || '';
        const cat = r.querySelector('.payable-item-cat')?.value || 'Raw Materials';
        const qty = parseFloat(r.querySelector('.payable-item-qty')?.value) || 0;
        const cost = parseFloat(r.querySelector('.payable-item-cost')?.value) || 0;
        const sub = qty * cost;
        calculatedTotal += sub;
        if (desc || cost > 0) {
            lineItems.push({
                description: desc,
                category: cat,
                quantity: qty,
                cost: cost,
                subtotal: sub
            });
        }
    });

    if (calculatedTotal <= 0) {
        NKB.showToast('Please enter at least one line item with a positive cost.', 'warning');
        return;
    }

    try {
        const payload = {
            company_name: companyName,
            invoice_number: invoiceNumber,
            invoice_date: invoiceDate,
            payable_category: payableCategory,
            control_number: controlNumber,
            payee_name: payee,
            vendor: payee,
            terms: terms,
            due_date: dueDate,
            cheque_date: dueDate || invoiceDate || NKB.getManilaDate(),
            description: description,
            purpose: description,
            bank_name: bankName,
            bank_account_number: bankAccount,
            cheque_number: chequeNumber,
            comments: comments,
            line_items: lineItems,
            amount: calculatedTotal,
            category: lineItems[0]?.category || 'Raw Materials',
            attachment_data: currentPayableAttachmentBase64,
            attachment_url: currentPayableExistingAttachmentUrl,
            attachment_removed: currentPayableAttachmentRemoved
        };

        let res;
        if (currentEditingPayableId) {
            res = await NKB.api(`/api/cheque-payables/${currentEditingPayableId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
        } else {
            res = await NKB.api('/api/cheque-payables', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        }

        if (res.success) {
            const reqNum = res.data?.request_number || '';
            NKB.showToast(`Cheque payable ${reqNum} ${currentEditingPayableId ? 'updated' : 'submitted'} successfully!`, 'success');
            closeModal();
            loadPayables();
            loadBankBalances();
        } else {
            NKB.showToast(res.error || 'Failed to save cheque payable.', 'error');
        }
    } catch (err) {
        console.error('submitRequestPayable error:', err);
        NKB.showToast('Server error saving cheque payable.', 'error');
    }
}

// View Details Modal with Timeline & Audit
async function openViewPayableDetailsModal(payableId) {
    let cp = (typeof cachedPayables !== 'undefined' ? cachedPayables : (window.cachedPayables || [])).find(item => item.id === payableId || item.request_number === payableId);
    try {
        const res = await NKB.api(`/api/cheque-payables/${encodeURIComponent(payableId)}`);
        if (res?.success && res.data) {
            cp = res.data;
        }
    } catch (_) {}

    if (!cp) {
        NKB.showToast('Cheque payable record not found.', 'error');
        return;
    }

    const root = document.getElementById('modals-root');
    const hasAttachment = !!cp.attachment_url;
    const isPdf = hasAttachment && cp.attachment_url.toLowerCase().endsWith('.pdf');
    const isImg = hasAttachment && (cp.attachment_url.match(/\.(jpeg|jpg|png|webp|gif|svg)$/i) || cp.attachment_url.startsWith('data:image/'));

    // Parse line items
    let lineItems = [];
    if (cp.line_items) {
        try {
            lineItems = typeof cp.line_items === 'string' ? JSON.parse(cp.line_items) : cp.line_items;
        } catch (_) {}
    }
    if (!lineItems || lineItems.length === 0) {
        lineItems = [{
            description: cp.purpose || cp.payee_name || 'Payable Requisition',
            category: cp.category || 'Raw Materials',
            quantity: 1,
            cost: parseFloat(cp.amount) || 0,
            subtotal: parseFloat(cp.amount) || 0
        }];
    }

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-3 sm:p-5 z-50 overflow-y-auto">
            <div class="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl space-y-4 my-6 max-h-[92vh] overflow-y-auto border border-slate-200">
                <!-- Top Header -->
                <div class="flex justify-between items-start border-b border-slate-200 pb-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-xl">📑</span>
                            <h3 class="text-base sm:text-lg font-bold text-slate-900">Cheque Payable Details</h3>
                            <span class="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">${cp.request_number}</span>
                        </div>
                        <div class="text-[11px] text-slate-400 mt-1">Created ${NKB.formatDate(cp.created_at)} by <strong class="text-slate-600">${cp.requested_by_name || cp.requestor_name || 'Accountant'}</strong></div>
                    </div>
                    <button type="button" onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-2xl leading-none px-1 cursor-pointer">&times;</button>
                </div>

                <!-- Status Banner -->
                <div class="p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                    cp.status === 'CONFIRMED' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
                    cp.status === 'PENDING_COO_APPROVAL' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                    cp.status === 'REJECTED' ? 'bg-rose-50 border-rose-200 text-rose-900' :
                    'bg-slate-50 border-slate-200 text-slate-900'
                }">
                    <div class="flex items-center gap-2.5">
                        <span class="text-xl">${cp.status === 'CONFIRMED' ? '✅' : cp.status === 'PENDING_COO_APPROVAL' ? '⏳' : '📋'}</span>
                        <div>
                            <div class="font-bold uppercase tracking-wider text-[11px]">Status: ${(cp.status || '').replace(/_/g, ' ')}</div>
                            ${cp.coo_confirmed_at ? `<div class="text-[10px] opacity-80">Confirmed by ${cp.coo_confirmed_by || 'COO'} on ${NKB.formatDate(cp.coo_confirmed_at)}</div>` : ''}
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] uppercase font-bold text-slate-500">Payable Amount</div>
                        <div class="text-xl font-black text-slate-900">${NKB.formatCurrency(cp.amount)}</div>
                    </div>
                </div>

                <!-- Info Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Company</span>
                        <span class="font-bold text-slate-900">${cp.company_name || 'NKB Manufacturing Corporation'}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Vendor / Payee</span>
                        <span class="font-bold text-indigo-700">${cp.payee_name}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Invoice Number</span>
                        <span class="font-mono font-bold text-slate-800">${cp.invoice_number || cp.invoice_reference || '—'}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Invoice Date</span>
                        <span class="font-medium text-slate-800">${cp.invoice_date ? NKB.formatDate(cp.invoice_date) : '—'}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Control Number</span>
                        <span class="font-mono font-bold text-slate-800">${cp.control_number || '—'}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Terms & Due Date</span>
                        <span class="font-semibold text-slate-800">${cp.terms || 'Net 30'} (${cp.due_date ? NKB.formatDate(cp.due_date) : NKB.formatDate(cp.cheque_date)})</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Payable Category</span>
                        <span class="font-bold text-slate-800">${cp.payable_category || 'Trade payable'}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Expense Category</span>
                        <span class="font-bold text-indigo-600">${cp.category || 'Raw Materials'}</span>
                    </div>
                    <div class="sm:col-span-2">
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Designated Bank</span>
                        <span class="font-bold text-slate-800">${cp.bank_name || '—'}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Account Number</span>
                        <span class="font-mono text-slate-700">${cp.bank_account_number || '—'}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Cheque Number</span>
                        <span class="font-mono font-bold text-indigo-600">${cp.cheque_number || 'Pending Issuance'}</span>
                    </div>
                </div>

                <!-- Line Items Table -->
                <div class="space-y-1.5">
                    <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Particulars & Line Items</span>
                    <div class="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-2xs">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                    <th class="py-2.5 px-3">Description</th>
                                    <th class="py-2.5 px-3">Expense Category</th>
                                    <th class="py-2.5 px-3 text-center w-20">Quantity</th>
                                    <th class="py-2.5 px-3 text-right w-28">Cost</th>
                                    <th class="py-2.5 px-3 text-right w-32">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${lineItems.map(item => `
                                    <tr class="border-b border-slate-100 hover:bg-slate-50/50">
                                        <td class="py-2.5 px-3 font-medium text-slate-800">${item.description || '—'}</td>
                                        <td class="py-2.5 px-3 text-slate-600 font-semibold">${item.category || 'Raw Materials'}</td>
                                        <td class="py-2.5 px-3 text-center font-mono">${item.quantity || 1}</td>
                                        <td class="py-2.5 px-3 text-right font-mono">${NKB.formatCurrency(item.cost || 0)}</td>
                                        <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${NKB.formatCurrency(item.subtotal || 0)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot>
                                <tr class="bg-slate-50 font-bold">
                                    <td colspan="4" class="py-2.5 px-3 text-right text-slate-600 uppercase text-[11px]">Total Amount:</td>
                                    <td class="py-2.5 px-3 text-right font-mono text-sm font-black text-indigo-700">${NKB.formatCurrency(cp.amount)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <!-- Purpose / Utilization & Comments -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1">
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Purpose & Fund Utilization</span>
                        <p class="text-xs text-slate-800 leading-relaxed whitespace-pre-line font-medium">${cp.purpose || 'No purpose stated.'}</p>
                    </div>
                    <div class="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1">
                        <span class="text-[10px] text-slate-400 font-bold uppercase block">Comments / Check Particulars</span>
                        <p class="text-xs text-slate-800 leading-relaxed whitespace-pre-line font-medium">${cp.comments || 'No comments provided.'}</p>
                    </div>
                </div>

                ${cp.coo_notes ? `
                    <div class="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1 text-xs text-amber-900">
                        <span class="font-bold text-[10px] uppercase text-amber-800 block">COO Approval Remarks</span>
                        <p>${cp.coo_notes}</p>
                    </div>
                ` : ''}

                <!-- Attachment / Encoded File Section -->
                <div class="space-y-1.5">
                    <span class="text-[10px] text-slate-400 font-bold uppercase block">Attachment / Encoded File</span>
                    ${hasAttachment ? `
                        <div class="rounded-xl border border-slate-200 bg-slate-900 p-3 overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-3">
                            <div class="flex items-center gap-3 text-white">
                                <span class="text-2xl">${isPdf ? '📄' : isImg ? '🖼️' : '📎'}</span>
                                <div class="min-w-0">
                                    <div class="text-xs font-bold text-slate-100 truncate max-w-xs sm:max-w-md">${cp.attachment_url.split('/').pop() || 'Attachment Document'}</div>
                                    <div class="text-[10px] text-slate-400">${isPdf ? 'Portable Document Format (PDF)' : isImg ? 'Image Document' : 'Attached File'}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <a href="${cp.attachment_url}" target="_blank" class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm cursor-pointer">
                                    <span>${isPdf ? 'Open PDF ↗' : 'View Full File ↗'}</span>
                                </a>
                            </div>
                        </div>
                        ${isImg ? `
                            <div class="mt-2 text-center p-2 bg-slate-50 rounded-xl border border-slate-200">
                                <img src="${cp.attachment_url}" alt="Attachment Preview" class="max-w-full max-h-[300px] object-contain rounded mx-auto cursor-zoom-in shadow-2xs" onclick="window.open('${cp.attachment_url}', '_blank')">
                            </div>
                        ` : ''}
                    ` : `
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-400 italic">
                            No file attached to this payable request.
                        </div>
                    `}
                </div>

                <!-- Footer Actions -->
                <div class="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="closeModal(); openRequestPayableModal('${cp.id}')" class="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs" title="Edit Payable Request">
                            <span>✏️</span>
                            <span>Edit Request</span>
                        </button>
                        <button type="button" onclick="printSingleChequeVoucher('${cp.id}')" class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs">
                            <span>🖨️</span>
                            <span>Print Cheque Voucher</span>
                        </button>
                        ${cp.status === 'PENDING_COO_APPROVAL' ? `
                            <button type="button" onclick="openCooConfirmPayableModal('${cp.id}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer shadow-xs">
                                <span>⚡</span>
                                <span>COO Confirm</span>
                            </button>
                        ` : ''}
                    </div>
                    <button type="button" onclick="closeModal()" class="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
}

// COO Confirmation Modal
function openCooConfirmPayableModal(payableId) {
    const cp = cachedPayables.find(item => item.id === payableId || item.request_number === payableId);
    if (!cp) {
        NKB.showToast('Cheque payable record not found.', 'error');
        return;
    }

    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">⚡</span>
                        <h3 class="text-base font-bold text-slate-900">COO Cheque Authorization</h3>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>

                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1 text-xs">
                    <div class="flex justify-between">
                        <span class="text-slate-500">Request:</span>
                        <span class="font-mono font-bold text-indigo-700">${cp.request_number}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Payee:</span>
                        <span class="font-bold text-slate-900">${cp.payee_name}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Bank:</span>
                        <span class="font-semibold text-slate-800">${cp.bank_name}</span>
                    </div>
                    <div class="flex justify-between pt-1 border-t border-slate-200">
                        <span class="text-slate-500 font-bold">Amount:</span>
                        <span class="font-black text-base text-emerald-700">${NKB.formatCurrency(cp.amount)}</span>
                    </div>
                </div>

                <form onsubmit="submitCooConfirmPayable(event, '${cp.id}')" class="space-y-4 text-xs font-semibold">
                    <div>
                        <label class="block text-slate-700 mb-1">COO Decision *</label>
                        <select id="coo-action-decision" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-800 focus:bg-white">
                            <option value="CONFIRMED">✅ CONFIRM & APPROVE CHEQUE</option>
                            <option value="REJECTED">❌ REJECT CHEQUE REQUEST</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1">Assigned Cheque Number (Optional / if issued now)</label>
                        <input type="text" id="coo-action-check-number" value="${cp.cheque_number || ''}" placeholder="e.g. 0004928172" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono">
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1">COO Approver Name</label>
                        <input type="text" id="coo-action-approver" value="Chief Operating Officer (COO)" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium">
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1">COO Remarks / Directives</label>
                        <textarea id="coo-action-notes" rows="2" placeholder="e.g. Approved as budgeted for factory raw materials." class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-normal focus:bg-white"></textarea>
                    </div>

                    <div class="p-2.5 bg-indigo-50 rounded-xl text-[11px] text-indigo-900 border border-indigo-200">
                        <strong class="font-bold">API Key:</strong> <span class="font-mono">${LIVE_COO_API_KEY}</span>
                        <div class="text-[10px] text-indigo-700 mt-0.5">Executes via live COO authorization API gateway.</div>
                    </div>

                    <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20 cursor-pointer">Save COO Authorization</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCooConfirmPayable(e, payableId) {
    e.preventDefault();
    const decision = document.getElementById('coo-action-decision')?.value || 'CONFIRMED';
    const checkNumber = document.getElementById('coo-action-check-number')?.value?.trim() || null;
    const approverName = document.getElementById('coo-action-approver')?.value?.trim() || 'COO';
    const notes = document.getElementById('coo-action-notes')?.value?.trim() || null;

    try {
        const res = await NKB.api(`/api/cheque-payables/${payableId}/confirm`, {
            method: 'POST',
            body: JSON.stringify({
                action: decision,
                confirmed_by: approverName,
                cheque_number: checkNumber,
                coo_notes: notes,
                api_key: LIVE_COO_API_KEY
            })
        });

        if (res.success) {
            NKB.showToast(res.message || 'COO authorization processed successfully.', 'success');
            closeModal();
            loadPayables();
        } else {
            NKB.showToast(res.error || 'Failed to process authorization.', 'error');
        }
    } catch (err) {
        console.error('submitCooConfirmPayable error:', err);
        NKB.showToast('Server error processing COO confirmation.', 'error');
    }
}

// Export Cheque Payables to Excel
function exportPayablesToExcel() {
    if (!cachedPayables || cachedPayables.length === 0) {
        NKB.showToast('No cheque payable records available to export.', 'warning');
        return;
    }

    const totalAmt = cachedPayables.reduce((sum, cp) => sum + (parseFloat(cp.amount) || 0), 0);

    if (typeof XLSX !== 'undefined') {
        const rows = [
            ['NKB MANUFACTURING CORPORATION'],
            ['CHEQUE PAYABLES & COO APPROVAL DISBURSEMENT REGISTER'],
            [`Export Date: ${NKB.getManilaDateTime()}`, '', `Total Records: ${cachedPayables.length}`, '', `Total Amount: PHP ${totalAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
            [],
            [
                '#',
                'Request No.',
                'Cheque Date',
                'Payee / Beneficiary',
                'Amount (PHP)',
                'Category',
                'Bank Name',
                'Bank Account',
                'Cheque No.',
                'Purpose / Usage',
                'Invoice Ref',
                'Status',
                'Requested By',
                'COO Confirmed By',
                'COO Confirmed Date',
                'COO Remarks'
            ]
        ];

        cachedPayables.forEach((cp, idx) => {
            rows.push([
                idx + 1,
                cp.request_number || '',
                cp.cheque_date || '',
                cp.payee_name || '',
                parseFloat(cp.amount) || 0,
                cp.category || '',
                cp.bank_name || '',
                cp.bank_account_number || '',
                cp.cheque_number || '',
                cp.purpose || '',
                cp.invoice_reference || '',
                (cp.status || '').replace(/_/g, ' '),
                cp.requestor_name || 'Accountant',
                cp.coo_confirmed_by || '',
                cp.coo_confirmed_at ? cp.coo_confirmed_at.split('T')[0] : '',
                cp.coo_notes || ''
            ]);
        });

        rows.push([]);
        rows.push(['TOTAL', '', '', '', totalAmt, '', '', '', '', '', '', '', '', '', '', '']);

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
            { wch: 6 },  // #
            { wch: 18 }, // Request No.
            { wch: 14 }, // Cheque Date
            { wch: 28 }, // Payee
            { wch: 18 }, // Amount
            { wch: 22 }, // Category
            { wch: 22 }, // Bank
            { wch: 18 }, // Account
            { wch: 16 }, // Cheque No.
            { wch: 35 }, // Purpose
            { wch: 16 }, // Invoice Ref
            { wch: 18 }, // Status
            { wch: 18 }, // Requested By
            { wch: 20 }, // Confirmed By
            { wch: 16 }, // Confirmed Date
            { wch: 30 }  // Remarks
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Cheque Payables');
        XLSX.writeFile(wb, `NKB_Cheque_Payables_${NKB.getManilaDate()}.xlsx`);
        NKB.showToast(`Exported ${cachedPayables.length} cheque records to Excel successfully!`, 'success');
    } else {
        // Fallback to CSV API
        window.location.href = '/api/cheque-payables/export-csv';
    }
}

// Print Cheque Payables Summary Report
function printPayablesReport() {
    if (!cachedPayables || cachedPayables.length === 0) {
        NKB.showToast('No cheque payable records to print.', 'warning');
        return;
    }

    const totalAmt = cachedPayables.reduce((sum, cp) => sum + (parseFloat(cp.amount) || 0), 0);
    let printIframe = document.getElementById('print-payables-iframe');
    if (!printIframe) {
        printIframe = document.createElement('iframe');
        printIframe.id = 'print-payables-iframe';
        printIframe.style.display = 'none';
        document.body.appendChild(printIframe);
    }

    const doc = printIframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>NKB Cheque Payables Report - ${NKB.getManilaDate()}</title>
            <style>
                @page { margin: 12mm 15mm; size: landscape; }
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 10px; }
                .header-container { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px; }
                h1 { margin: 0; font-size: 18px; font-weight: 900; letter-spacing: -0.5px; }
                .subtitle { margin: 3px 0 0 0; font-size: 11px; color: #64748b; font-weight: 500; }
                .kpi-row { display: flex; gap: 15px; margin-bottom: 15px; }
                .kpi-box { padding: 8px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; flex: 1; }
                .kpi-label { font-size: 9px; font-weight: bold; text-transform: uppercase; color: #64748b; }
                .kpi-val { font-size: 16px; font-weight: 900; color: #0f172a; margin-top: 2px; }
                table { width: 100%; border-collapse: collapse; font-size: 10px; }
                th { background-color: #f1f5f9; color: #475569; font-weight: 800; text-transform: uppercase; font-size: 9px; padding: 7px 8px; border-bottom: 1px solid #cbd5e1; text-align: left; }
                td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
                tr:nth-child(even) td { background-color: #f8fafc; }
                .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
                .font-bold { font-weight: bold; }
                .text-right { text-align: right; }
                .total-row td { background-color: #f8fafc; font-weight: 900; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; }
                .footer { margin-top: 25px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
                @media print {
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="header-container">
                <div>
                    <h1>NKB MANUFACTURING CORPORATION</h1>
                    <p class="subtitle">Official Cheque Payables & COO Authorization Register</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 10px; color: #64748b;">Generated: ${new Date().toLocaleString()}</div>
                    <button class="no-print" onclick="window.print()" style="margin-top: 4px; padding: 5px 12px; background: #0f172a; color: white; border: none; border-radius: 6px; font-size: 10px; font-weight: bold; cursor: pointer;">🖨️ Print Document</button>
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi-box">
                    <div class="kpi-label">Total Cheques Amount</div>
                    <div class="kpi-val">${NKB.formatCurrency(totalAmt)}</div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-label">Total Requisitions</div>
                    <div class="kpi-val">${cachedPayables.length}</div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-label">Integration Key</div>
                    <div class="kpi-val font-mono" style="font-size: 11px;">${LIVE_COO_API_KEY.slice(0, 18)}...</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 25px;">#</th>
                        <th>Req Number</th>
                        <th>Cheque Date</th>
                        <th>Payee Name</th>
                        <th>Category</th>
                        <th>Bank & Account</th>
                        <th>Cheque No.</th>
                        <th>Purpose / Usage</th>
                        <th class="text-right">Amount (PHP)</th>
                        <th>Status</th>
                        <th>COO Confirmed By</th>
                    </tr>
                </thead>
                <tbody>
                    ${cachedPayables.map((cp, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td class="font-mono font-bold">${cp.request_number}</td>
                            <td>${NKB.formatDate(cp.cheque_date)}</td>
                            <td class="font-bold">${cp.payee_name}</td>
                            <td>${cp.category}</td>
                            <td>${cp.bank_name || '—'}</td>
                            <td class="font-mono">${cp.cheque_number || '—'}</td>
                            <td>${cp.purpose || '—'}</td>
                            <td class="text-right font-bold">${NKB.formatCurrency(cp.amount)}</td>
                            <td>${(cp.status || '').replace(/_/g, ' ')}</td>
                            <td>${cp.coo_confirmed_by || '—'}</td>
                        </tr>
                    `).join('')}
                    <tr class="total-row">
                        <td colspan="8" class="text-right">TOTAL CHEQUE AMOUNT:</td>
                        <td class="text-right font-bold" style="font-size: 11px;">${NKB.formatCurrency(totalAmt)}</td>
                        <td colspan="2"></td>
                    </tr>
                </tbody>
            </table>

            <div class="footer">
                <div>Prepared by: Senior Accountant</div>
                <div>Approved by: Chief Operating Officer (COO)</div>
                <div>Confidential Financial Document • NKB ERP System</div>
            </div>

            <script>
                window.onload = function() {
                    window.addEventListener('beforeprint', function() { document.title = ''; });
                    window.addEventListener('afterprint', function() { document.title = 'NKB Cheque Payables Report'; });
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

// Print Single Cheque Disbursement Voucher (CDV)
async function printSingleChequeVoucher(payableId) {
    let cp = cachedPayables.find(item => item.id === payableId || item.request_number === payableId);
    if (!cp) {
        try {
            const res = await NKB.api(`/api/cheque-payables/${encodeURIComponent(payableId)}`);
            if (res.success && res.data) {
                cp = res.data;
            }
        } catch (_) {}
    }
    if (!cp) {
        window.open('/print-payable.html?id=' + encodeURIComponent(payableId) + '&autoprint=1', '_blank');
        return;
    }

    let printIframe = document.getElementById('print-voucher-iframe');
    if (!printIframe) {
        printIframe = document.createElement('iframe');
        printIframe.id = 'print-voucher-iframe';
        printIframe.style.display = 'none';
        document.body.appendChild(printIframe);
    }

    let lineItems = [];
    if (cp.line_items) {
        try {
            lineItems = typeof cp.line_items === 'string' ? JSON.parse(cp.line_items) : cp.line_items;
        } catch (_) {}
    }
    if (!lineItems || lineItems.length === 0) {
        lineItems = [{
            description: cp.purpose || cp.payee_name || 'Payable Disbursement',
            category: cp.category || 'General',
            quantity: 1,
            cost: parseFloat(cp.amount) || 0,
            subtotal: parseFloat(cp.amount) || 0
        }];
    }

    const companyTitle = (cp.company_name || 'NKB MANUFACTURING CORPORATION').toUpperCase();

    const doc = printIframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cheque Disbursement Voucher - ${cp.request_number}</title>
            <style>
                @page { margin: 15mm; size: portrait; }
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 15px; }
                .voucher-box { border: 2px solid #0f172a; border-radius: 8px; padding: 20px; }
                .top-header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
                h1 { margin: 0; font-size: 18px; font-weight: 900; }
                .voucher-title { font-size: 13px; font-weight: 800; color: #b45309; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
                .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; font-size: 11px; }
                .meta-item { display: flex; gap: 6px; }
                .meta-label { font-weight: bold; color: #475569; width: 110px; }
                .meta-val { font-weight: bold; color: #0f172a; }
                .particulars-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 16px; background: #f8fafc; }
                .particulars-title { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
                .accounting-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .accounting-table th { background: #0f172a; color: white; padding: 6px 10px; font-size: 10px; text-align: left; }
                .accounting-table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
                .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
                .sig-box { text-align: center; border-top: 1px solid #0f172a; padding-top: 6px; }
                .sig-role { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
                .sig-name { font-weight: 800; color: #0f172a; margin-top: 2px; }
                @media print {
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="voucher-box">
                <div class="top-header">
                    <div>
                        <h1>${companyTitle}</h1>
                        <div class="voucher-title">Cheque Disbursement Voucher (CDV)</div>
                        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Quezon City, Metro Manila • Operations & Finance</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 13px; font-weight: 900; font-family: monospace; color: #4338ca;">${cp.request_number}</div>
                        <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Date: ${NKB.formatDate(cp.cheque_date)}</div>
                        <button class="no-print" onclick="window.print()" style="margin-top: 8px; padding: 4px 10px; background: #0f172a; color: white; border: none; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">🖨️ Print Voucher</button>
                    </div>
                </div>

                <div class="meta-grid">
                    <div class="meta-item"><span class="meta-label">Payee / Vendor:</span><span class="meta-val" style="font-size: 13px;">${cp.payee_name}</span></div>
                    <div class="meta-item"><span class="meta-label">Total Amount:</span><span class="meta-val" style="font-size: 13px; color: #047857;">${NKB.formatCurrency(cp.amount)}</span></div>
                    <div class="meta-item"><span class="meta-label">Drawee Bank:</span><span class="meta-val">${cp.bank_name}</span></div>
                    <div class="meta-item"><span class="meta-label">Cheque Number:</span><span class="meta-val font-mono">${cp.cheque_number || 'Pending Check Release'}</span></div>
                    <div class="meta-item"><span class="meta-label">Account No:</span><span class="meta-val font-mono">${cp.bank_account_number || '—'}</span></div>
                    <div class="meta-item"><span class="meta-label">Invoice Ref:</span><span class="meta-val font-mono">${cp.invoice_number || cp.invoice_reference || '—'}</span></div>
                    ${cp.control_number ? `<div class="meta-item"><span class="meta-label">Control No:</span><span class="meta-val font-mono">${cp.control_number}</span></div>` : ''}
                    ${cp.terms ? `<div class="meta-item"><span class="meta-label">Terms:</span><span class="meta-val">${cp.terms}</span></div>` : ''}
                    ${cp.due_date ? `<div class="meta-item"><span class="meta-label">Due Date:</span><span class="meta-val">${NKB.formatDate(cp.due_date)}</span></div>` : ''}
                    ${cp.payable_category ? `<div class="meta-item"><span class="meta-label">Payable Type:</span><span class="meta-val">${cp.payable_category}</span></div>` : ''}
                </div>

                ${(cp.purpose || cp.comments) ? `
                    <div class="particulars-box">
                        <div class="particulars-title">Particulars & Remarks:</div>
                        <div style="font-size: 11px; line-height: 1.5; color: #1e293b;">${cp.purpose ? `<div style="font-weight: 600; margin-bottom: 4px;">${cp.purpose}</div>` : ''}${cp.comments ? `<div style="color: #475569; font-style: italic;">${cp.comments}</div>` : ''}</div>
                    </div>
                ` : ''}

                <!-- Itemized Breakdown (NO VAT) -->
                <table class="accounting-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Expense Category</th>
                            <th style="text-align: center;">Quantity</th>
                            <th style="text-align: right;">Unit Cost (PHP)</th>
                            <th style="text-align: right;">Subtotal (PHP)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineItems.map(it => `
                            <tr>
                                <td style="font-weight: bold;">${it.description || 'General Item'}</td>
                                <td>${it.category || cp.category || 'Raw Materials'}</td>
                                <td style="text-align: center;">${parseFloat(it.quantity || 1).toFixed(2)}</td>
                                <td style="text-align: right;">${(parseFloat(it.cost) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td style="text-align: right; font-weight: bold;">${(parseFloat(it.subtotal || it.quantity * it.cost) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background: #f8fafc; font-weight: bold;">
                            <td colspan="4" style="text-align: right; padding: 10px; font-size: 11px;">Total Amount Due:</td>
                            <td style="text-align: right; font-size: 12px; font-weight: 900; color: #047857; padding: 10px;">${NKB.formatCurrency(cp.amount)}</td>
                        </tr>
                    </tfoot>
                </table>

                <div style="font-size: 10px; color: #64748b; margin-bottom: 20px;">
                    <div>COO Authorization Status: <strong>${(cp.status || '').replace(/_/g, ' ')}</strong></div>
                    ${cp.coo_confirmed_at ? `<div>Confirmed by: <strong>${cp.coo_confirmed_by || 'COO'}</strong> on ${cp.coo_confirmed_at}</div>` : ''}
                    ${cp.coo_notes ? `<div>COO Notes: <em>${cp.coo_notes}</em></div>` : ''}
                </div>

                <div class="signatures">
                    <div class="sig-box">
                        <div class="sig-name">${cp.requestor_name || 'Senior Accountant'}</div>
                        <div class="sig-role">Prepared by (Accounting)</div>
                    </div>
                    <div class="sig-box">
                        <div class="sig-name">Finance Officer</div>
                        <div class="sig-role">Checked & Verified by</div>
                    </div>
                    <div class="sig-box">
                        <div class="sig-name">${cp.coo_confirmed_by || 'Executive COO'}</div>
                        <div class="sig-role">Approved by (COO / CEO)</div>
                    </div>
                </div>
            </div>

            <script>
                window.onload = function() {
                    window.addEventListener('beforeprint', function() { document.title = ''; });
                    window.addEventListener('afterprint', function() { document.title = 'NKB Cheque Voucher - ${cp.request_number}'; });
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
                    <button onclick="openProductFormulationModal('${p.id}')" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs" title="Equivalent Chemical Formulation & Manual Counter-Check">
                        <span>🧪 Formulation</span>
                    </button>
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
                    <div class="flex justify-between items-center pt-2 border-t border-slate-100">
                        <button type="button" onclick="openProductFormulationModal('${prod.id}')" class="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs" title="Equivalent Chemical Formulation & Counter-Check">
                            <span>🧪 Formulation & BOM</span>
                        </button>
                        <div class="flex gap-2">
                            <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                            <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Update Product</button>
                        </div>
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
                    <button onclick="closeModal()" title="Close (Esc)" class="text-slate-400 hover:text-slate-600 font-bold text-lg flex items-center gap-1.5">
                        <kbd class="text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-normal">Esc</kbd>
                        <span>&times;</span>
                    </button>
                </div>
                <form id="form-create-po" onsubmit="submitCreatePO(event)" class="space-y-4 text-xs font-normal flex-1 overflow-y-auto pr-1">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                            <label class="block text-slate-500 font-medium text-xs mb-1.5 uppercase tracking-wider">Select Client *</label>
                            <select id="po-client-id" onchange="onAdminPOClientChanged()" required class="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-normal text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm">
                                ${cachedClients.map(c => {
                                    const isVyu = c.is_vyuceutical_ops === 1 || (c.company_name && c.company_name.toLowerCase().includes('vyuceutical'));
                                    const label = isVyu ? `Vyuceutical OPC - ${c.contact_person || c.company_name}` : c.company_name;
                                    return `<option value="${c.id}">${label}</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-500 font-medium text-xs mb-1.5 uppercase tracking-wider">Term of Payment *</label>
                            <select id="create-po-form-of-payment" onchange="toggleCustomPOTerm('create')" class="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-normal text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm">
                                <option value="COD" selected>COD (Cash on Delivery)</option>
                                <option value="7d">7d (7 Days)</option>
                                <option value="15d">15d (15 Days)</option>
                                <option value="30d">30d (30 Days)</option>
                                <option value="CUSTOM">Custom Term...</option>
                            </select>
                            <input type="text" id="create-po-form-of-payment-custom" placeholder="e.g. 50% DP, 50% upon delivery..." class="hidden mt-1.5 w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs font-normal text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm">
                        </div>
                        <!-- Hidden Billing Policy (defaults to ACTUAL_DELIVERY) -->
                        <input type="hidden" id="po-billing-policy" value="ACTUAL_DELIVERY">
                    </div>

                    <!-- Multi-Brand Search with Suggestions -->
                    <div class="p-3.5 bg-slate-50/70 border border-slate-200/90 rounded-2xl space-y-2.5 relative shadow-sm" id="po-search-wrapper">
                        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <span class="text-sm">🔍</span>
                                <span class="text-xs font-semibold text-slate-800 tracking-wide">Search & Add Products</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium uppercase border border-indigo-200/60">Multi-Brand Order</span>
                            </div>
                            <div class="flex items-center gap-2 w-full sm:w-auto" id="po-brand-filter-container">
                                <label for="po-brand-select" class="text-[11px] font-normal text-slate-500 whitespace-nowrap">Filter Brand:</label>
                                <select id="po-brand-select" onchange="onAdminPOBrandFilterChanged()" class="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white font-normal text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition">
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
                                           class="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-xl bg-white font-normal text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm transition">
                                    <span class="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                                    <button type="button" 
                                            id="po-search-clear-btn" 
                                            onclick="clearPOSearch()" 
                                            class="hidden absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs px-1 font-bold">✕</button>
                                </div>
                                <button type="button" 
                                        id="po-search-btn" 
                                        onclick="triggerPOSearchBtn()" 
                                        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 active:scale-95">
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
                        <p id="po-search-note" class="text-[11px] text-slate-500 font-normal flex items-center gap-1.5">
                            <span>💡</span>
                            <span>Order products from different brands in the same PO. Click any suggestion to add it to the table below.</span>
                        </p>
                    </div>

                    <!-- Line Items Section -->
                    <div class="space-y-2.5 pt-2 border-t border-slate-100">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-semibold uppercase tracking-wider text-slate-700">Order Products (Line Items)</span>
                                <span class="text-[11px] text-slate-400 font-normal">· Clean selection & quantities</span>
                            </div>
                            <button type="button" onclick="addAdminPOLineItem()" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow-sm">
                                <span>➕</span><span>Add Product Line</span>
                            </button>
                        </div>

                        <div class="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div class="max-h-72 sm:max-h-80 overflow-y-auto overflow-x-auto">
                                <table class="w-full text-left text-xs">
                                    <thead class="bg-slate-50/90 backdrop-blur-sm border-b border-slate-200 text-slate-500 font-medium text-[11px] uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th class="py-3 px-3.5">Product</th>
                                            <th class="py-3 px-3.5 w-32">Target Qty (pcs)</th>
                                            <th class="py-3 px-3.5 w-36">Fixed Unit Price (₱)</th>
                                            <th class="py-3 px-3.5 w-32">Subtotal (₱)</th>
                                            <th class="py-3 px-2 w-12 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody id="admin-po-lines-body" class="divide-y divide-slate-100 font-normal">
                                        <!-- Dynamic Rows -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Summary & Totals -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 mt-3">
                        <div>
                            <label class="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Packaging / Batch Notes</label>
                            <textarea id="po-notes" rows="2" placeholder="Formulation variants, packaging specifics..." class="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs text-slate-700 font-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm"></textarea>
                        </div>
                        <div class="space-y-2 text-right flex flex-col justify-center">
                            <div class="text-xs text-slate-500 font-normal flex justify-between sm:justify-end gap-3">
                                <span>Total Items:</span>
                                <strong id="admin-po-total-items" class="text-slate-700 font-medium font-mono">0</strong>
                            </div>
                            <div class="text-xs text-slate-500 font-normal flex justify-between sm:justify-end gap-3">
                                <span>Total Target Quantity:</span>
                                <strong id="admin-po-total-qty" class="text-slate-700 font-medium font-mono">0 pcs</strong>
                            </div>
                            <div class="pt-2 border-t border-slate-200 flex justify-between sm:justify-end items-baseline gap-3">
                                <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">Grand Total:</span>
                                <span id="admin-po-grand-total" class="text-xl font-bold text-indigo-600 font-mono tracking-tight">₱0.00</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2.5 pt-3 border-t border-slate-100 flex-shrink-0">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium text-xs transition">Cancel</button>
                        <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-xs shadow-md shadow-indigo-600/30 transition">Submit Purchase Order</button>
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

        return `
            <tr class="hover:bg-slate-50/70 transition" id="admin-po-row-${idx}">
                <td class="py-3 px-3.5">
                    <select onchange="updateAdminPOLineItem(${idx}, 'product_id', this.value)" class="w-full px-3 py-2 border border-slate-200 hover:border-slate-300 rounded-xl text-xs bg-white font-normal text-slate-800 tracking-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm">
                        ${window.renderProductOptionsGroupedByBrand ? window.renderProductOptionsGroupedByBrand(adminPOCatalog, item.product_id) : adminPOCatalog.map(p => `
                            <option value="${p.id}" ${p.id === item.product_id ? 'selected' : ''}>
                                ${p.display_name || p.clean_name || p.name} - ₱${Number(p.default_price).toFixed(2)}${p.has_custom_price ? ' [Contract Rate]' : ''}
                            </option>
                        `).join('')}
                    </select>
                </td>
                <td class="py-3 px-3.5">
                    <input type="number" min="1" step="1" 
                           value="${item.target_quantity}" 
                           oninput="updateAdminPOLineItem(${idx}, 'target_quantity', this.value)" 
                           class="w-full px-3 py-2 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-normal text-slate-800 text-center tracking-normal focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm">
                </td>
                <td class="py-3 px-3.5">
                    <div class="px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-normal text-slate-600 font-mono flex items-center justify-between shadow-sm">
                        <span>₱${Number(item.unit_price || 0).toFixed(2)}</span>
                        <span class="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium border border-emerald-200/60">Fixed</span>
                    </div>
                </td>
                <td id="admin-po-line-total-${idx}" class="py-3 px-3.5 font-semibold text-slate-900 font-mono text-xs tracking-tight">
                    ${NKB.formatCurrency(lineSubtotal)}
                </td>
                <td class="py-3 px-2 text-center">
                    <button type="button" onclick="removeAdminPOLineItem(${idx})" class="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition" title="Remove line">
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
        <div class="fixed inset-0 modal-backdrop flex items-start justify-center p-3 sm:p-6 z-50 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl space-y-5 my-auto max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3.5rem)] flex flex-col">
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
        if (res.data?.id) {
            setTimeout(() => {
                if (typeof openDispatchAlertModal === 'function') {
                    openDispatchAlertModal(res.data.id);
                }
            }, 300);
        }
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

    // All batched products can be dispatched across continuous partial deliveries
    const itemsToRender = batchedJOs;

    const clientCompName = companyName || itemsToRender[0]?.company_name || 'Client Order';
    const primaryPoId = poId || itemsToRender[0]?.po_id;
    const primaryPoNum = itemsToRender[0]?.po_number || '';
    const clientSO = primaryPoNum ? primaryPoNum.replace('PO-', 'SO-') : 'SO-2026-000001';

    const itemsRowsHtml = itemsToRender.map((jo, idx) => {
        const targetQty = Number(jo.target_quantity) || 0;
        const deliveredSoFar = Number(jo.delivered_quantity != null ? jo.delivered_quantity : (jo.cumulative_delivered_quantity || 0));
        const remainingQty = Math.max(0, targetQty - deliveredSoFar);
        const batchYield = Number(jo.latest_batch_yield || jo.total_yield || targetQty);
        // Default quantity to remaining undelivered quantity, or available batch yield
        const defaultQty = remainingQty > 0 ? remainingQty : batchYield;
        const isTargetMet = targetQty > 0 && deliveredSoFar >= targetQty;

        return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-b-0 dr-item-row"
            data-jo-id="${jo.id}" data-product-id="${jo.product_id}" data-batch-id="${jo.latest_batch_id}">
            <td class="py-2.5 px-3">
                <input type="checkbox" class="dr-item-include accent-emerald-600 w-4 h-4 cursor-pointer" ${remainingQty > 0 || !isTargetMet ? 'checked' : ''} onchange="this.closest('tr').classList.toggle('opacity-50', !this.checked); const inp = this.closest('tr').querySelector('.dr-item-qty'); if (inp) inp.disabled = !this.checked;">
            </td>
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
            <td class="py-2.5 px-3 text-right">
                <div class="font-mono font-bold text-slate-800">${NKB.formatNumber(deliveredSoFar)} / ${NKB.formatNumber(targetQty)} pcs</div>
                <div class="text-[10px] ${remainingQty > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-extrabold'}">
                    ${remainingQty > 0 ? `(${NKB.formatNumber(remainingQty)} pcs remaining)` : '✓ Target Reached'}
                </div>
            </td>
            <td class="py-2.5 px-3 text-right">
                <input type="number" min="1" max="${Math.max(100000, defaultQty * 2)}" value="${defaultQty}" required
                    class="dr-item-qty w-28 px-2.5 py-1 text-xs border rounded-lg bg-emerald-50 border-emerald-300 font-bold text-emerald-900 text-right">
            </td>
        </tr>
        `;
    }).join('');

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-start justify-center p-3 sm:p-6 z-50 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl space-y-5 my-auto max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3.5rem)] flex flex-col">
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
                                        <th class="py-2.5 px-3 w-8">Ship</th>
                                        <th class="py-2.5 px-3">JO Ref</th>
                                        <th class="py-2.5 px-3">Batch Number</th>
                                        <th class="py-2.5 px-3">Product Name & SKU</th>
                                        <th class="py-2.5 px-3 text-right">Delivered Progress</th>
                                        <th class="py-2.5 px-3 text-right">Dispatch Qty (pcs)</th>
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
        const includeCb = row.querySelector('.dr-item-include');
        if (includeCb && !includeCb.checked) return;
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
        if (res.data?.id) {
            setTimeout(() => {
                if (typeof openDispatchAlertModal === 'function') {
                    openDispatchAlertModal(res.data.id);
                }
            }, 300);
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
                        <button type="button" onclick="openDispatchAlertModal('${dr.id}')" class="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer" title="WhatsApp & SMS Dispatch Milestone Alert">
                            <span>📲</span><span>WhatsApp / SMS Alert</span>
                        </button>
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

// 6g. WhatsApp & SMS Dispatch Milestone Notification Modal
async function openDispatchAlertModal(drId) {
    const root = document.getElementById('modals-root');
    if (!root) return;

    // Show loading skeleton
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl text-center space-y-3">
                <div class="text-3xl animate-bounce">📲</div>
                <div class="text-sm font-bold text-slate-800">Generating WhatsApp & SMS Dispatch Alert...</div>
                <div class="text-xs text-slate-500">Preparing tracking link and milestone message</div>
            </div>
        </div>
    `;

    const res = await NKB.api(`/api/deliveries/${drId}/dispatch-alert`);
    if (!res.success || !res.data) {
        NKB.showToast(res.error || 'Failed to load dispatch milestone alert.', 'error');
        closeModal();
        return;
    }

    const data = res.data;
    const history = data.history || [];

    const safeEscape = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in">
            <div class="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col animate-scaleIn">
                <!-- Header -->
                <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xl text-emerald-600 flex-shrink-0">
                            📲
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-base font-black text-slate-900">WhatsApp & SMS Dispatch Milestone</h3>
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Live DR Notice</span>
                            </div>
                            <p class="text-xs text-slate-500">${data.drNumber} • PO: ${data.poNumber} • ${data.recipientName}</p>
                        </div>
                    </div>
                    <button type="button" onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl p-1 cursor-pointer">&times;</button>
                </div>

                <div class="overflow-y-auto flex-1 space-y-4 pr-1 text-xs">
                    <!-- Client & Recipient Information -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                        <div>
                            <span class="text-[10px] text-slate-400 uppercase font-bold block">Client Contact</span>
                            <span class="font-extrabold text-slate-900 text-xs">${data.recipientName || 'Client Recipient'}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-400 uppercase font-bold block">Mobile Phone (PH)</span>
                            <span class="font-mono font-bold text-indigo-700 text-xs">${data.recipientPhone ? '+' + data.recipientPhone : 'No mobile registered'}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-400 uppercase font-bold block">Milestone Status</span>
                            ${data.whatsappNotifiedAt ? `
                                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                    <span>✅</span><span>Milestone Dispatched</span>
                                </span>
                            ` : `
                                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                                    <span>⏳</span><span>Ready to Dispatch</span>
                                </span>
                            `}
                        </div>
                    </div>

                    <!-- Message Preview in Chat Bubble -->
                    <div class="space-y-1.5">
                        <div class="flex items-center justify-between">
                            <label class="font-bold text-slate-800 flex items-center gap-1.5">
                                <span>💬</span><span>Pre-Formatted Milestone Message Preview</span>
                            </label>
                            <button type="button" onclick="copyDispatchMessage()" class="text-[11px] text-indigo-600 font-bold hover:underline flex items-center gap-1 cursor-pointer">
                                <span>📋</span><span>Copy Text</span>
                            </button>
                        </div>
                        <div class="p-4 bg-emerald-950 text-emerald-100 rounded-2xl border border-emerald-800 font-mono text-[11px] whitespace-pre-wrap select-all leading-relaxed shadow-inner max-h-56 overflow-y-auto" id="dispatch-message-text">${safeEscape(data.message)}</div>
                    </div>

                    <!-- Instant Click-to-Send Actions -->
                    <div class="space-y-2">
                        <label class="font-bold text-slate-800 flex items-center gap-1.5">
                            <span>🚀</span><span>Instant Dispatch Channels</span>
                        </label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <!-- WhatsApp -->
                            <button type="button" onclick="sendViaWhatsApp('${drId}', '${encodeURIComponent(data.whatsappUrl)}')" class="p-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-2xl font-bold shadow-md shadow-emerald-600/30 transition flex flex-col items-center justify-center gap-1 text-center cursor-pointer group">
                                <div class="flex items-center gap-1.5 text-sm">
                                    <span>🟢</span><span>Send WhatsApp</span>
                                </div>
                                <span class="text-[10px] text-emerald-100 font-normal">Opens chat with pre-filled text</span>
                            </button>

                            <!-- SMS -->
                            <button type="button" onclick="sendViaSMS('${drId}', '${encodeURIComponent(data.smsUrl)}')" class="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-bold shadow-md shadow-indigo-600/30 transition flex flex-col items-center justify-center gap-1 text-center cursor-pointer group">
                                <div class="flex items-center gap-1.5 text-sm">
                                    <span>📱</span><span>Send Native SMS</span>
                                </div>
                                <span class="text-[10px] text-indigo-100 font-normal">Launches default SMS messenger</span>
                            </button>

                            <!-- Log Only / Resend Record -->
                            <button type="button" onclick="recordDispatchMilestone('${drId}')" class="p-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-2xl font-bold transition flex flex-col items-center justify-center gap-1 text-center cursor-pointer">
                                <div class="flex items-center gap-1.5 text-sm">
                                    <span>🔔</span><span>Log Milestone</span>
                                </div>
                                <span class="text-[10px] text-slate-500 font-normal">Record milestone in audit trail</span>
                            </button>
                        </div>
                    </div>

                    <!-- Dispatch Notification Audit History -->
                    <div class="space-y-1.5 pt-1">
                        <label class="font-bold text-slate-800 flex items-center justify-between">
                            <span>📜 Dispatch Milestone History</span>
                            <span class="text-[11px] text-slate-500 font-normal">${history.length} log(s)</span>
                        </label>
                        ${history.length > 0 ? `
                            <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                                <table class="w-full text-left text-xs">
                                    <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                        <tr>
                                            <th class="py-2 px-3">Date & Time</th>
                                            <th class="py-2 px-3">Channel</th>
                                            <th class="py-2 px-3">Recipient Phone</th>
                                            <th class="py-2 px-3">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-100">
                                        ${history.map(h => `
                                            <tr class="hover:bg-slate-50">
                                                <td class="py-2 px-3 text-slate-600 whitespace-nowrap">${NKB.formatDate(h.sent_at)}</td>
                                                <td class="py-2 px-3 font-bold text-slate-800">
                                                    <span class="px-1.5 py-0.5 rounded text-[10px] ${h.channel === 'WHATSAPP' ? 'bg-emerald-100 text-emerald-800' : (h.channel === 'SMS' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800')}">${h.channel}</span>
                                                </td>
                                                <td class="py-2 px-3 font-mono text-slate-700">${h.recipient_phone || '—'}</td>
                                                <td class="py-2 px-3 text-emerald-700 font-bold">${h.status === 'SENT' ? '✅ Sent' : h.status}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : `
                            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center text-slate-400 text-xs italic">
                                No dispatch milestones logged yet. Click WhatsApp or SMS above to notify the client!
                            </div>
                        `}
                    </div>
                </div>

                <!-- Footer -->
                <div class="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span class="text-[11px] text-slate-500">Auto-formatted with Philippine mobile format (+639...)</span>
                    <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer">Close</button>
                </div>
            </div>
        </div>
    `;
}
window.openDispatchAlertModal = openDispatchAlertModal;

function copyDispatchMessage() {
    const el = document.getElementById('dispatch-message-text');
    if (el) {
        navigator.clipboard.writeText(el.innerText || el.textContent);
        NKB.showToast('📋 Dispatch notice copied to clipboard!', 'success');
    }
}
window.copyDispatchMessage = copyDispatchMessage;

async function sendViaWhatsApp(drId, encodedUrl) {
    const url = decodeURIComponent(encodedUrl);
    window.open(url, '_blank');
    try {
        await NKB.api(`/api/deliveries/${drId}/send-dispatch-alert`, {
            method: 'POST',
            body: JSON.stringify({ channel: 'WHATSAPP' })
        });
        NKB.showToast('🟢 WhatsApp milestone opened & recorded in audit log!', 'success');
        openDispatchAlertModal(drId);
    } catch (_) {}
}
window.sendViaWhatsApp = sendViaWhatsApp;

async function sendViaSMS(drId, encodedUrl) {
    const url = decodeURIComponent(encodedUrl);
    window.location.href = url;
    try {
        await NKB.api(`/api/deliveries/${drId}/send-dispatch-alert`, {
            method: 'POST',
            body: JSON.stringify({ channel: 'SMS' })
        });
        NKB.showToast('📱 SMS client opened & milestone recorded in audit log!', 'success');
        openDispatchAlertModal(drId);
    } catch (_) {}
}
window.sendViaSMS = sendViaSMS;

async function recordDispatchMilestone(drId) {
    const res = await NKB.api(`/api/deliveries/${drId}/send-dispatch-alert`, {
        method: 'POST',
        body: JSON.stringify({ channel: 'ALL' })
    });
    if (res.success) {
        NKB.showToast('🔔 Dispatch milestone recorded in audit trail!', 'success');
        openDispatchAlertModal(drId);
    } else {
        NKB.showToast(res.error || 'Failed to record dispatch milestone.', 'error');
    }
}
window.recordDispatchMilestone = recordDispatchMilestone;

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
    const today = NKB.getManilaDate();
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const defaultDueDate = NKB.getManilaDate(d);

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Generate Sales Invoice (SI)</h3>
                        <p class="text-xs text-slate-500">Supports custom issuance date for late-encoding</p>
                    </div>
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
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Invoice Date <span class="text-indigo-600 font-normal">(Late Encoding)</span></label>
                            <input type="date" id="inv-date" value="${today}" onchange="autoUpdateInvoiceDueDate(this.value)" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                            <span class="text-[10px] text-slate-500 block mt-0.5">Specify actual date if late-encoded</span>
                        </div>
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Payment Due Date</label>
                            <input type="date" id="inv-due-date" value="${defaultDueDate}" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                            <span class="text-[10px] text-slate-500 block mt-0.5">Payment term due date</span>
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Invoice Notes / Terms</label>
                        <textarea id="inv-notes" rows="2" class="w-full px-3 py-2 border rounded-xl bg-slate-50">Standard payment term: 30 days upon DR acceptance.</textarea>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer">Generate Official Invoice</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}
window.openGenerateInvoiceModal = openGenerateInvoiceModal;

function autoUpdateInvoiceDueDate(invDateVal) {
    if (!invDateVal) return;
    try {
        const d = new Date(invDateVal);
        d.setDate(d.getDate() + 30);
        const dueEl = document.getElementById('inv-due-date');
        if (dueEl) dueEl.value = NKB.getManilaDate(d);
    } catch (_) {}
}
window.autoUpdateInvoiceDueDate = autoUpdateInvoiceDueDate;

async function submitGenerateInvoice(e, drId) {
    e.preventDefault();
    const invoiceDate = document.getElementById('inv-date')?.value || null;
    const dueDate = document.getElementById('inv-due-date')?.value || null;
    const notes = document.getElementById('inv-notes')?.value || '';

    const res = await NKB.api(`/api/invoices/from-dr/${drId}`, {
        method: 'POST',
        body: JSON.stringify({
            invoice_date: invoiceDate,
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
window.submitGenerateInvoice = submitGenerateInvoice;

function openEditInvoiceDatesModal(invoiceId, invoiceNumber, currentInvoiceDate, currentDueDate) {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Edit Invoice Dates</h3>
                        <p class="text-xs text-slate-500">Late Encoding Correction for ${invoiceNumber}</p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitEditInvoiceDates(event, '${invoiceId}')" class="space-y-4 text-xs font-semibold">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Invoice Issuance Date</label>
                            <input type="date" id="edit-inv-date" value="${currentInvoiceDate || ''}" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                            <span class="text-[10px] text-slate-500 block mt-0.5">Official transaction / billing date</span>
                        </div>
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Due Date</label>
                            <input type="date" id="edit-inv-due-date" value="${currentDueDate || ''}" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                            <span class="text-[10px] text-slate-500 block mt-0.5">Payment due date</span>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold cursor-pointer">Save Dates</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}
window.openEditInvoiceDatesModal = openEditInvoiceDatesModal;

async function submitEditInvoiceDates(e, invoiceId) {
    e.preventDefault();
    const invoiceDate = document.getElementById('edit-inv-date')?.value;
    const dueDate = document.getElementById('edit-inv-due-date')?.value;

    const res = await NKB.api(`/api/invoices/${invoiceId}/dates`, {
        method: 'PATCH',
        body: JSON.stringify({ invoice_date: invoiceDate, due_date: dueDate })
    });

    if (res.success) {
        NKB.showToast(res.message || 'Invoice dates updated successfully!', 'success');
        closeModal();
        loadInvoices();
    } else {
        NKB.showToast(res.error || 'Failed to update invoice dates.', 'error');
    }
}
window.submitEditInvoiceDates = submitEditInvoiceDates;

// 8. Record Payment Modal with Check Attachment & Bank Details
let currentPaymentAttachmentBase64 = null;

function handlePaymentAttachmentSelect(input) {
    const previewContainer = document.getElementById('pay-attachment-preview');
    const previewImg = document.getElementById('pay-attachment-img');
    const previewName = document.getElementById('pay-attachment-name');
    const dropText = document.getElementById('pay-attachment-droptext');

    if (!input.files || !input.files[0]) {
        currentPaymentAttachmentBase64 = null;
        if (previewContainer) previewContainer.classList.add('hidden');
        if (dropText) dropText.classList.remove('hidden');
        return;
    }

    const file = input.files[0];
    if (file.size > 10 * 1024 * 1024) {
        NKB.showToast('File size must be under 10MB.', 'warning');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        currentPaymentAttachmentBase64 = e.target.result;
        if (previewContainer) previewContainer.classList.remove('hidden');
        if (dropText) dropText.classList.add('hidden');
        if (previewName) previewName.textContent = file.name;
        if (previewImg) {
            if (file.type.startsWith('image/')) {
                previewImg.src = currentPaymentAttachmentBase64;
                previewImg.classList.remove('hidden');
            } else {
                previewImg.classList.add('hidden');
            }
        }
    };
    reader.readAsDataURL(file);
}
window.handlePaymentAttachmentSelect = handlePaymentAttachmentSelect;

function clearPaymentAttachment() {
    currentPaymentAttachmentBase64 = null;
    const input = document.getElementById('pay-attachment-file');
    if (input) input.value = '';
    const previewContainer = document.getElementById('pay-attachment-preview');
    if (previewContainer) previewContainer.classList.add('hidden');
    const dropText = document.getElementById('pay-attachment-droptext');
    if (dropText) dropText.classList.remove('hidden');
}
window.clearPaymentAttachment = clearPaymentAttachment;

function openRecordPaymentModal(invoiceId, invoiceNumber, balanceDue, clientName) {
    currentPaymentAttachmentBase64 = null;
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">💵</span>
                        <h3 class="text-lg font-bold text-slate-900">Record Payment</h3>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer">&times;</button>
                </div>
                <form onsubmit="submitRecordPayment(event, '${invoiceId}', ${balanceDue})" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-slate-50 rounded-xl space-y-1 text-slate-700 border border-slate-200/80">
                        <div class="flex justify-between">
                            <span>Invoice: <strong class="text-indigo-600 font-mono">${invoiceNumber}</strong></span>
                            <span>Client: <strong>${clientName}</strong></span>
                        </div>
                        <div class="text-sm font-extrabold text-rose-700 pt-1 border-t border-slate-200">Balance Due: ${NKB.formatCurrency(balanceDue)}</div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Payment Amount (₱) *</label>
                            <input type="number" id="pay-amount" step="0.01" min="0.01" max="${Number(balanceDue).toFixed(2)}" value="${Number(balanceDue).toFixed(2)}" inputmode="decimal" onblur="if(this.value && !isNaN(this.value)) this.value = parseFloat(this.value).toFixed(2)" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-emerald-800 focus:bg-white focus:ring-2 focus:ring-emerald-500">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Payment Date</label>
                            <input type="date" id="pay-date" value="${NKB.getManilaDate()}" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium">
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Payment Method *</label>
                            <select id="pay-method" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium focus:bg-white">
                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                <option value="CHECK" selected>Check / Cheque</option>
                                <option value="ONLINE_BANKING">Online Banking</option>
                                <option value="GCASH">GCash</option>
                                <option value="CASH">Cash</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Issuing / Depository Bank</label>
                            <select id="pay-bank-name" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium focus:bg-white">
                                <option value="">Select or leave blank...</option>
                                <option value="BDO Unibank">BDO Unibank</option>
                                <option value="Bank of the Philippine Islands (BPI)">Bank of the Philippine Islands (BPI)</option>
                                <option value="Metrobank">Metrobank</option>
                                <option value="Security Bank">Security Bank</option>
                                <option value="UnionBank of the Philippines">UnionBank of the Philippines</option>
                                <option value="RCBC">RCBC</option>
                                <option value="China Bank">China Bank</option>
                                <option value="PNB">PNB</option>
                                <option value="Landbank">Landbank</option>
                                <option value="Other Bank">Other Bank</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Check Number / Slip #</label>
                            <input type="text" id="pay-check-number" placeholder="e.g. 0001289456" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Reference / Transaction Ref</label>
                            <input type="text" id="pay-ref" placeholder="Ref # / Check # / OR # / Txn ID (Optional/Freeform)" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono">
                        </div>
                    </div>

                    <!-- Check Attachment & Proof Section -->
                    <div class="space-y-1.5">
                        <label class="block text-slate-600">Attachment / Check Image / Deposit Proof</label>
                        <div class="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-3 bg-slate-50 transition relative text-center">
                            <input type="file" id="pay-attachment-file" accept="image/*,.pdf" onchange="handlePaymentAttachmentSelect(this)" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                            <div id="pay-attachment-droptext" class="space-y-1 py-1 pointer-events-none">
                                <div class="text-xl">📷</div>
                                <div class="text-xs text-slate-600 font-bold">Click or drag & drop check image here</div>
                                <div class="text-[10px] text-slate-400">Supports PNG, JPG, WEBP, or PDF up to 10MB</div>
                            </div>
                            <div id="pay-attachment-preview" class="hidden flex items-center justify-between gap-3 p-2 bg-white rounded-lg border border-slate-200 text-left">
                                <div class="flex items-center gap-2 min-w-0">
                                    <img id="pay-attachment-img" src="" alt="Check Preview" class="w-12 h-10 object-cover rounded border border-slate-200 hidden">
                                    <div class="min-w-0">
                                        <div id="pay-attachment-name" class="text-xs font-bold text-slate-800 truncate">check.jpg</div>
                                        <div class="text-[10px] text-emerald-600 font-bold">Ready to upload</div>
                                    </div>
                                </div>
                                <button type="button" onclick="clearPaymentAttachment()" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded text-[10px] font-bold border border-rose-200 cursor-pointer">Remove</button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label class="block text-slate-600 mb-1">Notes / Remarks</label>
                        <textarea id="pay-notes" rows="2" placeholder="e.g. Physical check verified, post-dated check details, branch deposit" class="w-full px-3 py-2 border rounded-xl bg-slate-50 text-slate-800 font-normal focus:bg-white"></textarea>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20 cursor-pointer">Record Payment</button>
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
    const paymentDate = document.getElementById('pay-date')?.value || NKB.getManilaDate();
    const bankName = document.getElementById('pay-bank-name')?.value?.trim() || null;
    const checkNumber = document.getElementById('pay-check-number')?.value?.trim() || null;

    const res = await NKB.api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
            invoice_id: invoiceId,
            amount,
            payment_date: paymentDate,
            payment_method: method,
            reference_number: ref,
            notes,
            bank_name: bankName,
            check_number: checkNumber,
            attachment_data: currentPaymentAttachmentBase64
        })
    });

    if (res.success) {
        NKB.showToast(res.message || 'Payment recorded successfully.', 'success');
        closeModal();
        loadInvoices();
        loadPayments();
    } else {
        NKB.showToast(res.error || 'Failed to record payment.', 'error');
    }
}

// Check Attachment Preview & Update Modals
function openViewCheckModal(paymentId) {
    const payment = cachedPayments ? cachedPayments.find(p => p.id === paymentId || p.payment_number === paymentId) : null;
    if (!payment) {
        NKB.showToast('Payment record not found.', 'error');
        return;
    }

    const root = document.getElementById('modals-root');
    const attachmentUrl = payment.attachment_url || '';
    const isPdf = attachmentUrl.toLowerCase().endsWith('.pdf');

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">🖼️</span>
                        <div>
                            <h3 class="text-base font-bold text-slate-900">Check / Payment Attachment</h3>
                            <div class="text-[11px] text-slate-500 font-mono">${payment.payment_number} • ${payment.invoice_number}</div>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer">&times;</button>
                </div>

                <!-- Info Badges -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-xl text-xs border border-slate-200/80">
                    <div>
                        <div class="text-[10px] text-slate-400 font-bold uppercase">Client</div>
                        <div class="font-bold text-slate-800 truncate">${payment.company_name}</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-slate-400 font-bold uppercase">Amount Paid</div>
                        <div class="font-black text-emerald-700">${NKB.formatCurrency(payment.amount)}</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-slate-400 font-bold uppercase">Bank Name</div>
                        <div class="font-semibold text-slate-700">${payment.bank_name || '—'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] text-slate-400 font-bold uppercase">Check Number</div>
                        <div class="font-mono font-bold text-indigo-600">${payment.check_number || payment.reference_number || '—'}</div>
                    </div>
                </div>

                <!-- Attachment Preview Area -->
                <div class="rounded-xl border border-slate-200 bg-slate-950 p-2 overflow-hidden flex items-center justify-center min-h-[280px] max-h-[500px]">
                    ${attachmentUrl ? (
                        isPdf ? `
                            <div class="text-center p-6 space-y-3">
                                <span class="text-4xl">📄</span>
                                <div class="text-sm font-bold text-white">PDF Document Attached</div>
                                <a href="${attachmentUrl}" target="_blank" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold inline-block text-xs">
                                    Open / Download PDF ↗
                                </a>
                            </div>
                        ` : `
                            <img src="${attachmentUrl}" alt="Check Image" class="max-w-full max-h-[480px] object-contain rounded cursor-zoom-in" onclick="window.open('${attachmentUrl}', '_blank')" title="Click to view full resolution in new tab">
                        `
                    ) : `
                        <div class="text-center text-slate-400 py-10">
                            <span class="text-3xl block mb-1">📭</span>
                            <span>No check image has been attached to this payment record yet.</span>
                        </div>
                    `}
                </div>

                ${payment.notes ? `
                    <div class="p-2.5 bg-amber-50 rounded-xl text-xs text-amber-900 border border-amber-200/80">
                        <strong class="font-bold">Remarks:</strong> ${payment.notes}
                    </div>
                ` : ''}

                <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                    <button type="button" onclick="openAttachCheckModal('${payment.id}')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer">
                        <span>🔄</span>
                        <span>Update / Replace Check</span>
                    </button>
                    <button type="button" onclick="closeModal()" class="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
}
window.openViewCheckModal = openViewCheckModal;

let currentUpdateCheckAttachmentBase64 = null;

function handleUpdateCheckAttachmentSelect(input) {
    if (!input.files || !input.files[0]) {
        currentUpdateCheckAttachmentBase64 = null;
        return;
    }
    const file = input.files[0];
    if (file.size > 10 * 1024 * 1024) {
        NKB.showToast('File size must be under 10MB.', 'warning');
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        currentUpdateCheckAttachmentBase64 = e.target.result;
        const nameEl = document.getElementById('update-check-preview-name');
        if (nameEl) nameEl.textContent = `Selected: ${file.name}`;
    };
    reader.readAsDataURL(file);
}
window.handleUpdateCheckAttachmentSelect = handleUpdateCheckAttachmentSelect;

function openAttachCheckModal(paymentId) {
    const payment = cachedPayments ? cachedPayments.find(p => p.id === paymentId || p.payment_number === paymentId) : null;
    if (!payment) {
        NKB.showToast('Payment record not found.', 'error');
        return;
    }

    currentUpdateCheckAttachmentBase64 = null;
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">📎</span>
                        <h3 class="text-base font-bold text-slate-900">Attach / Update Check</h3>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>

                <form onsubmit="submitAttachCheck(event, '${payment.id}')" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-slate-50 rounded-xl space-y-1 text-slate-700 border border-slate-200">
                        <div>Payment: <strong class="text-indigo-600">${payment.payment_number}</strong> (${NKB.formatCurrency(payment.amount)})</div>
                        <div>Invoice: <strong>${payment.invoice_number}</strong> • Client: <strong>${payment.company_name}</strong></div>
                    </div>

                    <div>
                        <label class="block text-slate-600 mb-1">Check Number</label>
                        <input type="text" id="update-check-number" value="${payment.check_number || ''}" placeholder="e.g. 0001289456" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono">
                    </div>

                    <div>
                        <label class="block text-slate-600 mb-1">Issuing / Depository Bank</label>
                        <input type="text" id="update-check-bank" value="${payment.bank_name || ''}" placeholder="e.g. BDO Unibank, BPI, Metrobank" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>

                    <div>
                        <label class="block text-slate-600 mb-1">Upload Check Image / Proof *</label>
                        <div class="border-2 border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 text-center relative hover:border-indigo-400 transition">
                            <input type="file" id="update-check-file" accept="image/*,.pdf" onchange="handleUpdateCheckAttachmentSelect(this)" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                            <div class="space-y-1 pointer-events-none">
                                <span class="text-xl">📷</span>
                                <div class="text-xs text-slate-600 font-bold">Select new check photo / PDF</div>
                                <div id="update-check-preview-name" class="text-[10px] text-indigo-600 font-medium">Click to browse or drop file</div>
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20 cursor-pointer">Save Check Attachment</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}
window.openAttachCheckModal = openAttachCheckModal;

async function submitAttachCheck(e, paymentId) {
    e.preventDefault();
    const checkNumber = document.getElementById('update-check-number')?.value?.trim() || null;
    const bankName = document.getElementById('update-check-bank')?.value?.trim() || null;

    if (!currentUpdateCheckAttachmentBase64 && !checkNumber && !bankName) {
        NKB.showToast('Please provide a file or updated check details.', 'warning');
        return;
    }

    const res = await NKB.api(`/api/payments/${paymentId}/attachment`, {
        method: 'POST',
        body: JSON.stringify({
            check_number: checkNumber,
            bank_name: bankName,
            attachment_data: currentUpdateCheckAttachmentBase64
        })
    });

    if (res.success) {
        NKB.showToast(res.message || 'Check attachment updated.', 'success');
        closeModal();
        loadPayments();
    } else {
        NKB.showToast(res.error || 'Failed to update check attachment.', 'error');
    }
}
window.submitAttachCheck = submitAttachCheck;

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

    setTimeout(() => {
        const input = document.getElementById('client-name');
        if (input) input.focus();
    }, 50);
}
window.openCreateClientModal = openCreateClientModal;

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

    setTimeout(() => {
        const input = document.getElementById('prod-name');
        if (input) input.focus();
    }, 50);
}
window.openCreateProductModal = openCreateProductModal;

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
            <td class="py-3 px-4 max-w-sm">
                <div class="text-xs font-bold text-slate-800 line-clamp-2">${r.materials_needed}</div>
                ${formatRequisitionBomHtml(r.bom_items)}
                ${r.notes ? `<div class="text-[10px] text-slate-400 truncate mt-1">${r.notes}</div>` : ''}
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
                <button onclick="openUpdateRequisitionModal('${r.id}')" class="px-2.5 py-1 bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-700 rounded-lg text-xs font-bold shadow-sm transition inline-flex items-center gap-1 cursor-pointer">
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
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 text-base font-bold">🛒</div>
                        <div>
                            <h3 class="text-base font-extrabold text-slate-900">Manage Supply Requisition</h3>
                            <p class="text-[11px] text-slate-500">${r.po_number} • ${r.client_name}</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 font-bold flex items-center justify-center transition cursor-pointer">✕</button>
                </div>

                <div class="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
                    <div class="font-bold text-slate-700">Materials Needed:</div>
                    <div class="text-slate-900 font-medium whitespace-pre-line">${r.materials_needed}</div>
                    ${formatRequisitionBomHtml(r.bom_items)}
                    <div class="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 mt-1">Requested by: <b>${r.requested_by_name}</b> | Urgency: <b class="text-rose-600">${r.urgency}</b></div>
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

async function syncFmsFormulations() {
    const btn = document.getElementById('btn-sync-fms');
    const icon = document.getElementById('btn-sync-fms-icon');
    const text = document.getElementById('btn-sync-fms-text');
    if (btn) btn.disabled = true;
    if (icon) icon.className = "inline-block animate-spin";
    if (text) text.textContent = "Syncing from FMS API...";
    NKB.showToast('Connecting to live FMS API (fms.nkbmanufacturing.com)...', 'info');

    try {
        const res = await NKB.api('/api/formulations/sync-fms', { method: 'POST' });
        if (res.success && res.data) {
            const count = res.data.synced || res.data.syncedFormulas || 58;
            NKB.showToast(`✅ Synced ${count} authentic formulations from FMS API!`, 'success');
            await loadFormulations();
        } else {
            NKB.showToast(res.error || 'Failed to sync formulas from FMS API.', 'error');
        }
    } catch (err) {
        console.error('Error syncing FMS formulations:', err);
        NKB.showToast('Error communicating with FMS API.', 'error');
    } finally {
        if (btn) btn.disabled = false;
        if (icon) {
            icon.className = "";
            icon.textContent = "🔄";
        }
        if (text) text.textContent = "Live Sync from FMS API";
    }
}

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
        const [formRes, ordersRes, fmsStatusRes] = await Promise.all([
            NKB.api('/api/formulations'),
            NKB.api('/api/orders'),
            NKB.api('/api/formulations/fms-status').catch(() => ({ success: false }))
        ]);

        if (fmsStatusRes && fmsStatusRes.success && fmsStatusRes.data) {
            const fmsCount = document.getElementById('fms-formula-sync-count');
            if (fmsCount) fmsCount.textContent = `${fmsStatusRes.data.total_approved_fms_formulas || 58} Approved`;
            const fmsBadge = document.getElementById('fms-status-badge');
            if (fmsBadge) {
                fmsBadge.textContent = '🟢 ACTIVE & CONNECTED';
                fmsBadge.className = 'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold border border-emerald-300';
            }
        }

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

    tbody.innerHTML = list.map(f => {
        const isFms = !!(f.compounding_code || f.fms_formula_id);
        const versionBadge = f.active_version 
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono">${f.active_version}</span>`
            : `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">V1.0</span>`;
        const statusText = f.version_status ? `<span class="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">${f.version_status}</span>` : '';

        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 whitespace-nowrap">
                    <div class="font-mono font-black text-indigo-700 text-xs">${f.formula_code}</div>
                    ${f.compounding_code ? `
                        <div class="mt-1">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10.5px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                                <span>🧪</span><span>${f.compounding_code}</span>
                            </span>
                        </div>
                    ` : ''}
                </td>
                <td class="py-3 px-4">
                    <div class="font-black text-slate-900 text-xs">${f.name || f.product_name}</div>
                    <div class="text-[10px] text-slate-500 font-mono">${f.product_sku ? `SKU: ${f.product_sku}` : ''}</div>
                </td>
                <td class="py-3 px-4 whitespace-nowrap">
                    <span class="badge bg-slate-100 text-slate-700 font-semibold">${f.product_category || 'Cosmetics'}</span>
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                    ${versionBadge}
                    ${statusText}
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200">
                        ⚗️ ${f.ingredient_count || (f.ingredients ? f.ingredients.length : 0)} ingredients
                    </span>
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                    ${isFms ? `
                        <span class="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-teal-50 text-teal-800 border border-teal-200 tracking-wide inline-flex items-center gap-1">
                            <span>🏢</span><span>FMS Live API</span>
                        </span>
                    ` : `
                        <span class="px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            Custom Entry
                        </span>
                    `}
                </td>
                <td class="py-3 px-4 text-right whitespace-nowrap">
                    <button onclick="openViewFormulationModal('${f.product_id}')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition inline-flex items-center gap-1 shadow-sm">
                        <span>🔬 View Recipe</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterFormulationsTable() {
    const term = (document.getElementById('filter-formulation-search')?.value || '').trim().toLowerCase();
    if (!term) {
        renderFormulationsTable(cachedFormulations);
        return;
    }
    const filtered = cachedFormulations.filter(f => 
        (f.formula_code && f.formula_code.toLowerCase().includes(term)) ||
        (f.compounding_code && f.compounding_code.toLowerCase().includes(term)) ||
        (f.name && f.name.toLowerCase().includes(term)) ||
        (f.product_name && f.product_name.toLowerCase().includes(term)) ||
        (f.product_sku && f.product_sku.toLowerCase().includes(term)) ||
        (f.product_category && f.product_category.toLowerCase().includes(term))
    );
    renderFormulationsTable(filtered);
}

// =============================================================
// COSMETIC PRODUCT FORMULATION & MANUAL COUNTER-CHECK SYSTEM
// =============================================================

let currentActiveFormulation = null;
let currentFormulationTab = 'countercheck'; // 'countercheck' | 'edit'
let currentCounterCheckQty = 1000;
let currentCounterCheckUnit = 'pcs';
let counterCheckCheckedMap = {}; // ingredient key -> true/false

const STANDARD_RECIPE_PRESETS = {
    SUNSCREEN: {
        code: 'FORM-SGC-V1',
        name: 'Broad Spectrum SPF 50+ Gel-Cream Formulation',
        baseDose: 50,
        unit: 'g',
        instructions: 'Mix Phase A at 75°C. Disperse Phase B at 75°C. Emulsify Phase B into Phase A. Cool down to 45°C before adding Phase C actives and Phase D aroma/preservatives.',
        ingredients: [
            { material_code: 'RM-WTR-01', material_name: 'Deionized Water (Aqua)', phase: 'Phase A - Water Base', percentage: 65.5, qty: 32.75, unit: 'g', unit_cost: 0.02, notes: 'Purified USP Grade' },
            { material_code: 'RM-GLY-01', material_name: 'Vegetable Glycerin 99.5%', phase: 'Phase A - Water Base', percentage: 5.0, qty: 2.50, unit: 'g', unit_cost: 0.18, notes: 'Humectant' },
            { material_code: 'RM-CAR-01', material_name: 'Carbomer 940 Polymer', phase: 'Phase A - Water Base', percentage: 0.5, qty: 0.25, unit: 'g', unit_cost: 1.40, notes: 'Thickening Agent' },
            { material_code: 'RM-OMC-01', material_name: 'Octyl Methoxycinnamate (OMC)', phase: 'Phase B - UV Filters', percentage: 7.5, qty: 3.75, unit: 'g', unit_cost: 2.20, notes: 'UVB Organic Absorber' },
            { material_code: 'RM-AVO-01', material_name: 'Avobenzone (Butyl Methoxydibenzoylmethane)', phase: 'Phase B - UV Filters', percentage: 3.0, qty: 1.50, unit: 'g', unit_cost: 2.80, notes: 'UVA Organic Absorber' },
            { material_code: 'RM-TIO-01', material_name: 'Micronized Titanium Dioxide', phase: 'Phase B - UV Filters', percentage: 2.0, qty: 1.00, unit: 'g', unit_cost: 1.50, notes: 'Physical Mineral Filter' },
            { material_code: 'RM-CTA-01', material_name: 'Cetearyl Alcohol 30/70', phase: 'Phase B - UV Filters', percentage: 3.5, qty: 1.75, unit: 'g', unit_cost: 0.45, notes: 'Emulsifying Co-wax' },
            { material_code: 'RM-NIA-01', material_name: 'Niacinamide USP (Vitamin B3)', phase: 'Phase C - Actives', percentage: 5.0, qty: 2.50, unit: 'g', unit_cost: 1.80, notes: 'Brightening & Barrier Repair' },
            { material_code: 'RM-CEN-01', material_name: 'Centella Asiatica (Cica) Leaf Extract', phase: 'Phase C - Actives', percentage: 3.0, qty: 1.50, unit: 'g', unit_cost: 3.50, notes: 'Soothing Botanical' },
            { material_code: 'RM-HYA-01', material_name: 'Sodium Hyaluronate (Hyaluronic Acid)', phase: 'Phase C - Actives', percentage: 1.0, qty: 0.50, unit: 'g', unit_cost: 12.00, notes: 'Multi-depth Hydration' },
            { material_code: 'RM-TEA-01', material_name: 'Triethanolamine 99% (TEA)', phase: 'Phase D - Finishing', percentage: 2.0, qty: 1.00, unit: 'g', unit_cost: 0.35, notes: 'pH Neutralizer' },
            { material_code: 'RM-PHX-01', material_name: 'Phenoxyethanol & Ethylhexylglycerin', phase: 'Phase D - Finishing', percentage: 1.0, qty: 0.50, unit: 'g', unit_cost: 0.95, notes: 'Broad-Spectrum Preservative' },
            { material_code: 'RM-FRG-01', material_name: 'Fresh Dewdrop Fragrance Oil (Hypoallergenic)', phase: 'Phase D - Finishing', percentage: 1.0, qty: 0.50, unit: 'g', unit_cost: 2.50, notes: 'Cosmetic Grade Scent' }
        ]
    },
    SOAP: {
        code: 'FORM-BLS-V1',
        name: 'Triple Whitening Bleaching Cold-Process Soap Formula',
        baseDose: 135,
        unit: 'g',
        instructions: 'Saponify oils in Phase A with lye solution at 40°C. Blend to light trace. Incorporate Phase B whitening powders and Phase C essential oils.',
        ingredients: [
            { material_code: 'RM-CNO-01', material_name: 'Refined Coconut Oil (Cocos Nucifera)', phase: 'Phase A - Saponified Base', percentage: 48.0, qty: 64.80, unit: 'g', unit_cost: 0.15, notes: 'Cleansing Lather Base' },
            { material_code: 'RM-PKO-01', material_name: 'Palm Kernel Oil', phase: 'Phase A - Saponified Base', percentage: 20.0, qty: 27.00, unit: 'g', unit_cost: 0.14, notes: 'Hardness & Conditioning' },
            { material_code: 'RM-WTR-01', material_name: 'Deionized Water (Aqua)', phase: 'Phase A - Saponified Base', percentage: 16.0, qty: 21.60, unit: 'g', unit_cost: 0.02, notes: 'Lye Solvent' },
            { material_code: 'RM-NAOH-01', material_name: 'Sodium Hydroxide Flakes 99% (Lye)', phase: 'Phase A - Saponified Base', percentage: 8.0, qty: 10.80, unit: 'g', unit_cost: 0.12, notes: 'Saponification Agent' },
            { material_code: 'RM-KJC-01', material_name: 'Kojic Acid Dipalmitate Pure', phase: 'Phase B - Whitening Actives', percentage: 2.5, qty: 3.375, unit: 'g', unit_cost: 4.20, notes: 'Tyrosinase Inhibitor' },
            { material_code: 'RM-GLU-01', material_name: 'Reduced L-Glutathione Powder 98%', phase: 'Phase B - Whitening Actives', percentage: 1.5, qty: 2.025, unit: 'g', unit_cost: 8.50, notes: 'Master Antioxidant' },
            { material_code: 'RM-PAP-01', material_name: 'Papain Enzyme Extract (Carica Papaya)', phase: 'Phase B - Whitening Actives', percentage: 1.5, qty: 2.025, unit: 'g', unit_cost: 3.80, notes: 'Enzymatic Exfoliant' },
            { material_code: 'RM-BHT-01', material_name: 'Butylated Hydroxytoluene (BHT)', phase: 'Phase C - Aroma & Stabilization', percentage: 0.5, qty: 0.675, unit: 'g', unit_cost: 0.60, notes: 'Antioxidant Stabilizer' },
            { material_code: 'RM-FRG-02', material_name: 'Sweet Citrus Blossom Fragrance Oil', phase: 'Phase C - Aroma & Stabilization', percentage: 2.0, qty: 2.70, unit: 'g', unit_cost: 2.20, notes: 'Aromatic Fragrance' }
        ]
    },
    LOTION: {
        code: 'FORM-KLC-V2',
        name: 'Intensive Kojic Body Lotion Formulation',
        baseDose: 250,
        unit: 'g',
        instructions: 'Heat water phase A to 80°C. Melt oil phase B to 80°C. Homogenize for 10 minutes. Cool to 40°C before adding Phase C actives.',
        ingredients: [
            { material_code: 'RM-WTR-01', material_name: 'Deionized Water (Aqua)', phase: 'Phase A - Water Phase', percentage: 70.0, qty: 175.0, unit: 'g', unit_cost: 0.02, notes: 'Base Vehicle' },
            { material_code: 'RM-GLY-01', material_name: 'Vegetable Glycerin 99.5%', phase: 'Phase A - Water Base', percentage: 4.0, qty: 10.0, unit: 'g', unit_cost: 0.18, notes: 'Hydrating Humectant' },
            { material_code: 'RM-EDTA-01', material_name: 'Disodium EDTA', phase: 'Phase A - Water Phase', percentage: 0.2, qty: 0.5, unit: 'g', unit_cost: 0.85, notes: 'Chelating Agent' },
            { material_code: 'RM-CTA-01', material_name: 'Cetyl Alcohol NF', phase: 'Phase B - Oil Phase', percentage: 4.0, qty: 10.0, unit: 'g', unit_cost: 0.45, notes: 'Emollient & Viscosity Builder' },
            { material_code: 'RM-STA-01', material_name: 'Triple Pressed Stearic Acid', phase: 'Phase B - Oil Phase', percentage: 3.0, qty: 7.5, unit: 'g', unit_cost: 0.35, notes: 'Thickener & Emulsifier' },
            { material_code: 'RM-MNO-01', material_name: 'White Mineral Oil USP', phase: 'Phase B - Oil Phase', percentage: 6.0, qty: 15.0, unit: 'g', unit_cost: 0.28, notes: 'Occlusive Moisturizer' },
            { material_code: 'RM-DMT-01', material_name: 'Dimethicone 350 cSt', phase: 'Phase B - Oil Phase', percentage: 2.0, qty: 5.0, unit: 'g', unit_cost: 0.75, notes: 'Slip & Velvet Feel' },
            { material_code: 'RM-KJC-01', material_name: 'Kojic Acid Dipalmitate', phase: 'Phase C - Actives', percentage: 2.5, qty: 6.25, unit: 'g', unit_cost: 4.20, notes: 'Skin Brightener' },
            { material_code: 'RM-ARB-01', material_name: 'Alpha Arbutin Powder', phase: 'Phase C - Actives', percentage: 1.5, qty: 3.75, unit: 'g', unit_cost: 6.50, notes: 'Dark Spot Correction' },
            { material_code: 'RM-ASC-01', material_name: 'Sodium Ascorbyl Phosphate (Vitamin C)', phase: 'Phase C - Actives', percentage: 2.0, qty: 5.0, unit: 'g', unit_cost: 3.20, notes: 'Stable Vitamin C Active' },
            { material_code: 'RM-PHX-01', material_name: 'Phenoxyethanol & Ethylhexylglycerin', phase: 'Phase D - Preservation', percentage: 1.8, qty: 4.5, unit: 'g', unit_cost: 0.95, notes: 'Microbial Preservative' },
            { material_code: 'RM-FRG-03', material_name: 'Silk Blossom Premium Perfume Essence', phase: 'Phase D - Preservation', percentage: 3.0, qty: 7.5, unit: 'g', unit_cost: 2.80, notes: 'Body Fragrance' }
        ]
    },
    SERUM: {
        code: 'FORM-NCS-V3',
        name: 'Pore Refining 10% Niacinamide Facial Serum',
        baseDose: 30,
        unit: 'g',
        instructions: 'Hydrate hyaluronic acid in Phase A water. Dissolve Niacinamide and Zinc PCA until crystal clear. Preserve with Phase C.',
        ingredients: [
            { material_code: 'RM-WTR-01', material_name: 'Deionized Water (Aqua)', phase: 'Phase A - Hydration Base', percentage: 76.5, qty: 22.95, unit: 'g', unit_cost: 0.02, notes: 'Ultra-Pure Deionized' },
            { material_code: 'RM-GLY-01', material_name: 'Vegetable Glycerin 99.5%', phase: 'Phase A - Hydration Base', percentage: 5.0, qty: 1.50, unit: 'g', unit_cost: 0.18, notes: 'Hydrating Humectant' },
            { material_code: 'RM-HYA-01', material_name: 'Sodium Hyaluronate High MW', phase: 'Phase A - Hydration Base', percentage: 0.5, qty: 0.15, unit: 'g', unit_cost: 12.00, notes: 'Viscosity & Film Former' },
            { material_code: 'RM-NIA-01', material_name: 'Niacinamide Pure Powder (Vitamin B3)', phase: 'Phase B - Sebum Regulating Actives', percentage: 10.0, qty: 3.00, unit: 'g', unit_cost: 1.80, notes: 'Sebum & Pore Minimizer' },
            { material_code: 'RM-ZNC-01', material_name: 'Zinc PCA Pure Powder', phase: 'Phase B - Sebum Regulating Actives', percentage: 1.0, qty: 0.30, unit: 'g', unit_cost: 5.50, notes: 'Anti-Acne Astringent' },
            { material_code: 'RM-CEN-01', material_name: 'Centella Asiatica Extract', phase: 'Phase B - Sebum Regulating Actives', percentage: 5.0, qty: 1.50, unit: 'g', unit_cost: 3.50, notes: 'Calming Botanical' },
            { material_code: 'RM-ALN-01', material_name: 'Allantoin USP', phase: 'Phase B - Sebum Regulating Actives', percentage: 0.5, qty: 0.15, unit: 'g', unit_cost: 1.20, notes: 'Anti-Irritant' },
            { material_code: 'RM-PHX-01', material_name: 'Phenoxyethanol Optiphen Plus', phase: 'Phase C - Preservation', percentage: 1.5, qty: 0.45, unit: 'g', unit_cost: 0.95, notes: 'Broad-Spectrum Preservative' }
        ]
    }
};

function formatMassCalc(grams) {
    if (grams >= 1000) {
        return (grams / 1000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg';
    }
    return Number(grams).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' g';
}

async function openProductFormulationModal(productId, initialTab = 'countercheck') {
    const root = document.getElementById('modals-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 my-auto">
                <div class="flex items-center gap-3 text-slate-700 font-bold text-sm">
                    <span class="animate-spin text-xl">🧪</span>
                    <span>Retrieving Product Formulation & BOM...</span>
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

        currentActiveFormulation = res.data.formulation || res.data;
        if (!currentActiveFormulation.ingredients) {
            currentActiveFormulation.ingredients = res.data.ingredients || [];
        }
        currentFormulationTab = initialTab;
        counterCheckCheckedMap = {};

        renderFullFormulationModal();
    } catch (err) {
        console.error('Error opening formulation modal:', err);
        NKB.showToast('Error opening formulation details.', 'error');
        closeModal();
    }
}

function renderFullFormulationModal() {
    const root = document.getElementById('modals-root');
    if (!root || !currentActiveFormulation) return;

    const f = currentActiveFormulation;
    const prodName = f.product_name || f.name || 'Cosmetic Product';
    const prodSku = f.product_sku || (f.product && f.product.sku) || 'SKU-N/A';
    const formulaCode = f.formula_code || 'FORM-CUSTOM';
    const baseDose = Number(f.base_dose_qty) || 50;
    const baseUnit = f.base_unit || 'g';

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-2xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[94vh] flex flex-col">
                <!-- TOP HEADER -->
                <div class="flex justify-between items-start border-b border-slate-100 pb-3 flex-shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-indigo-600 to-purple-600 text-white flex items-center justify-center text-xl shadow-md shadow-indigo-500/20 flex-shrink-0">
                            🧪
                        </div>
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="text-base font-black text-slate-900">${prodName}</h3>
                                <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-800 border border-rose-300 uppercase tracking-wide">
                                    🔒 CONFIDENTIAL BOM
                                </span>
                                <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    ${formulaCode}
                                </span>
                                ${f.compounding_code ? `
                                    <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-black bg-purple-100 text-purple-800 border border-purple-300">
                                        🧪 ${f.compounding_code}
                                    </span>
                                ` : ''}
                                ${f.active_version ? `
                                    <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        ${f.active_version} (${f.version_status || 'APPROVED'})
                                    </span>
                                ` : ''}
                            </div>
                            <p class="text-xs text-slate-500 font-medium mt-0.5">
                                SKU: <strong class="font-mono text-slate-700">${prodSku}</strong> • Standard Dose: <strong class="font-mono text-indigo-700">${baseDose} ${baseUnit}</strong> per unit
                            </p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-2xl leading-none">&times;</button>
                </div>

                <!-- TAB SWITCHER HEADER -->
                <div class="flex items-center justify-between border-b border-slate-200 pb-2 flex-shrink-0">
                    <div class="flex items-center gap-2">
                        <button id="tab-btn-countercheck" onclick="switchFormulationModalTab('countercheck')" class="px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${currentFormulationTab === 'countercheck' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                            <span>🧮 Manual Counter-Check Calculator</span>
                        </button>
                        <button id="tab-btn-edit" onclick="switchFormulationModalTab('edit')" class="px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${currentFormulationTab === 'edit' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                            <span>📝 Edit Formulation & Recipe BOM</span>
                        </button>
                    </div>

                    <div class="hidden sm:flex items-center gap-2 text-xs">
                        <button onclick="printFormulationCounterCheck('${f.product_id}')" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition flex items-center gap-1 shadow-sm">
                            <span>🖨️ Print Cleanroom Sheet</span>
                        </button>
                    </div>
                </div>

                <!-- TAB 1: MANUAL COUNTER-CHECK CALCULATOR -->
                <div id="section-form-countercheck" class="${currentFormulationTab === 'countercheck' ? 'flex' : 'hidden'} flex-col flex-1 overflow-hidden space-y-3">
                    
                    <!-- BATCH SELECTOR & PRESETS BAR -->
                    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 flex-shrink-0">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div class="flex items-center gap-2">
                                <label class="text-xs font-bold text-slate-700 whitespace-nowrap">Target Batch Quantity:</label>
                                <input type="number" id="fc-batch-qty" min="1" step="1" value="${currentCounterCheckQty}" oninput="updateCounterCheckMath()" class="w-28 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-black text-indigo-900 focus:ring-2 focus:ring-indigo-500">
                                <select id="fc-batch-unit" onchange="updateCounterCheckMath()" class="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800">
                                    <option value="pcs" ${currentCounterCheckUnit === 'pcs' ? 'selected' : ''}>pcs (units)</option>
                                    <option value="kg" ${currentCounterCheckUnit === 'kg' ? 'selected' : ''}>kg (bulk mass)</option>
                                </select>
                            </div>

                            <!-- QUICK PRESET PILLS -->
                            <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span class="text-slate-400 font-bold uppercase text-[9.5px]">Presets:</span>
                                <button type="button" onclick="setCounterCheckPreset(250, 'pcs')" class="px-2 py-0.5 bg-white hover:bg-indigo-50 text-slate-700 border border-slate-200 rounded-md font-bold transition">250 pcs</button>
                                <button type="button" onclick="setCounterCheckPreset(500, 'pcs')" class="px-2 py-0.5 bg-white hover:bg-indigo-50 text-slate-700 border border-slate-200 rounded-md font-bold transition">500 pcs</button>
                                <button type="button" onclick="setCounterCheckPreset(1000, 'pcs')" class="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-300 rounded-md font-bold transition">1,000 pcs</button>
                                <button type="button" onclick="setCounterCheckPreset(2500, 'pcs')" class="px-2 py-0.5 bg-white hover:bg-indigo-50 text-slate-700 border border-slate-200 rounded-md font-bold transition">2,500 pcs</button>
                                <button type="button" onclick="setCounterCheckPreset(5000, 'pcs')" class="px-2 py-0.5 bg-white hover:bg-indigo-50 text-slate-700 border border-slate-200 rounded-md font-bold transition">5,000 pcs</button>
                                <button type="button" onclick="setCounterCheckPreset(50, 'kg')" class="px-2 py-0.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 rounded-md font-bold transition">50 kg</button>
                                <button type="button" onclick="setCounterCheckPreset(100, 'kg')" class="px-2 py-0.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 rounded-md font-bold transition">100 kg</button>
                            </div>
                        </div>

                        <!-- KPI SUMMARY CARDS -->
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-200">
                            <div class="p-2 bg-white rounded-lg border border-slate-200">
                                <span class="text-[10px] text-slate-400 uppercase font-bold block">Finished Output</span>
                                <div id="kpi-fc-output" class="font-black text-slate-900 text-xs mt-0.5 font-mono">1,000 pcs</div>
                            </div>
                            <div class="p-2 bg-white rounded-lg border border-slate-200">
                                <span class="text-[10px] text-slate-400 uppercase font-bold block">Compounding Mass</span>
                                <div id="kpi-fc-mass" class="font-black text-indigo-700 text-xs mt-0.5 font-mono">50.00 kg</div>
                            </div>
                            <div class="p-2 bg-white rounded-lg border border-slate-200">
                                <span class="text-[10px] text-slate-400 uppercase font-bold block">Manual Check Progress</span>
                                <div id="kpi-fc-progress" class="font-black text-emerald-700 text-xs mt-0.5">0 / 0 Verified</div>
                            </div>
                            <div class="p-2 bg-white rounded-lg border border-slate-200">
                                <span class="text-[10px] text-slate-400 uppercase font-bold block">Est. Raw Material Cost</span>
                                <div id="kpi-fc-cost" class="font-black text-slate-900 text-xs mt-0.5 font-mono">₱0.00</div>
                            </div>
                        </div>
                    </div>

                    <!-- INGREDIENTS COUNTER-CHECK TABLE -->
                    <div class="flex-1 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-3" id="container-countercheck-table">
                        <!-- Populated by updateCounterCheckMath() -->
                    </div>

                    <!-- INSTRUCTIONS & BOTTOM CONTROLS -->
                    ${f.instructions ? `
                        <div class="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs space-y-1 flex-shrink-0">
                            <span class="font-bold text-amber-900 block uppercase text-[10px] tracking-wider">🔬 Compounding & Mixing Instructions:</span>
                            <p class="text-slate-800 text-[11px] leading-relaxed">${f.instructions}</p>
                        </div>
                    ` : ''}

                    <div class="flex justify-between items-center pt-2 border-t border-slate-100 flex-shrink-0">
                        <div class="text-[10px] text-slate-400 font-medium">
                            💡 Tip: Tick the checkbox next to each raw material as you physically counter-check weights and lot numbers.
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="printFormulationCounterCheck('${f.product_id}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-sm">
                                <span>🖨️ Print Sheet</span>
                            </button>
                            <button type="button" onclick="switchFormulationModalTab('edit')" class="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition flex items-center gap-1">
                                <span>✏️ Edit Recipe</span>
                            </button>
                            <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition">
                                Close
                            </button>
                        </div>
                    </div>
                </div>

                <!-- TAB 2: EDIT FORMULATION & RECIPE BOM -->
                <div id="section-form-edit" class="${currentFormulationTab === 'edit' ? 'flex' : 'hidden'} flex-col flex-1 overflow-hidden space-y-3">
                    
                    <!-- EDIT PARAMETERS BAR -->
                    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3 flex-shrink-0">
                        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div>
                                <label class="block text-[11px] font-bold text-slate-700 mb-1">Formula Code *</label>
                                <input type="text" id="fe-formula-code" value="${formulaCode}" required class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-indigo-700">
                            </div>
                            <div class="sm:col-span-2">
                                <label class="block text-[11px] font-bold text-slate-700 mb-1">Formulation Name *</label>
                                <input type="text" id="fe-formula-name" value="${f.name || ''}" required class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900">
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="block text-[11px] font-bold text-slate-700 mb-1">Base Dose</label>
                                    <input type="number" id="fe-base-dose" step="0.01" min="0.01" value="${baseDose}" oninput="recalcEditIngredientsFromDose()" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-slate-700 mb-1">Unit</label>
                                    <select id="fe-base-unit" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900">
                                        <option value="g" ${baseUnit === 'g' ? 'selected' : ''}>g</option>
                                        <option value="ml" ${baseUnit === 'ml' ? 'selected' : ''}>ml</option>
                                        <option value="kg" ${baseUnit === 'kg' ? 'selected' : ''}>kg</option>
                                        <option value="pcs" ${baseUnit === 'pcs' ? 'selected' : ''}>pcs</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- TEMPLATE PRESETS -->
                        <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 text-xs">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="text-[10px] text-slate-500 font-bold uppercase">Load Standard Template:</span>
                                <button type="button" onclick="loadStandardFormulationTemplate('SUNSCREEN')" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-md font-bold text-[11px] transition">☀️ Sunscreen</button>
                                <button type="button" onclick="loadStandardFormulationTemplate('SOAP')" class="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-md font-bold text-[11px] transition">🧼 Soap</button>
                                <button type="button" onclick="loadStandardFormulationTemplate('LOTION')" class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-md font-bold text-[11px] transition">🧴 Lotion</button>
                                <button type="button" onclick="loadStandardFormulationTemplate('SERUM')" class="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-md font-bold text-[11px] transition">💧 Serum</button>
                            </div>
                            <div class="flex items-center gap-2">
                                <label class="inline-flex items-center gap-1 text-[11px] text-slate-600 font-semibold cursor-pointer">
                                    <input type="checkbox" id="fe-is-confidential" checked class="rounded text-indigo-600">
                                    <span>🔒 Strict Staff Only</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- INGREDIENTS EDITING GRID -->
                    <div class="flex-1 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-slate-200">
                                <tr>
                                    <th class="py-2 px-2" style="width: 140px;">Phase</th>
                                    <th class="py-2 px-2" style="width: 100px;">Mat. Code</th>
                                    <th class="py-2 px-2">Material Name / INCI</th>
                                    <th class="py-2 px-2 text-center" style="width: 75px;">% w/w</th>
                                    <th class="py-2 px-2 text-right" style="width: 85px;">Dose / Unit</th>
                                    <th class="py-2 px-2" style="width: 55px;">Unit</th>
                                    <th class="py-2 px-2 text-right" style="width: 80px;">Cost (₱)</th>
                                    <th class="py-2 px-2">Notes</th>
                                    <th class="py-2 px-1 text-center" style="width: 35px;"></th>
                                </tr>
                            </thead>
                            <tbody id="fe-ingredients-tbody" class="divide-y divide-slate-200 font-medium">
                                <!-- Populated dynamically -->
                            </tbody>
                        </table>
                    </div>

                    <!-- BALANCE FOOTER & ADD BUTTON -->
                    <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-100 rounded-xl flex-shrink-0 text-xs">
                        <button type="button" onclick="addFormulationIngredientRow()" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition flex items-center gap-1 shadow-sm">
                            <span>➕ Add Ingredient</span>
                        </button>

                        <div class="flex items-center gap-3">
                            <div id="fe-balance-badge" class="px-3 py-1 rounded-full font-mono font-bold text-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Total: 100.00% w/w
                            </div>
                            <div class="text-[11px] text-slate-600 font-bold">
                                Est. Unit Cost: <span id="fe-total-unit-cost" class="font-mono text-emerald-700">₱0.00</span>
                            </div>
                        </div>
                    </div>

                    <!-- INSTRUCTIONS EDIT -->
                    <div class="flex-shrink-0">
                        <label class="block text-[11px] font-bold text-slate-700 mb-1">Compounding & Homogenization Instructions:</label>
                        <textarea id="fe-instructions" rows="2" placeholder="e.g. Heat Phase A to 75°C. Disperse Phase B. Emulsify under vacuum..." class="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 leading-relaxed font-normal">${f.instructions || ''}</textarea>
                    </div>

                    <div class="flex justify-between items-center pt-2 border-t border-slate-100 flex-shrink-0">
                        <div class="text-[10px] text-slate-400 font-medium">
                            Changes will immediately update the Cleanroom Counter-Checking calculator and BOM.
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="switchFormulationModalTab('countercheck')" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition">
                                Back to Counter-Check
                            </button>
                            <button type="button" onclick="saveProductFormulation('${f.product_id}')" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20">
                                <span>💾 Save Formulation</span>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `;

    // Initialize the active view
    updateCounterCheckMath();
    populateEditIngredientsTable();
}

function switchFormulationModalTab(tab) {
    currentFormulationTab = tab;
    const secCc = document.getElementById('section-form-countercheck');
    const secEdit = document.getElementById('section-form-edit');
    const btnCc = document.getElementById('tab-btn-countercheck');
    const btnEdit = document.getElementById('tab-btn-edit');

    if (!secCc || !secEdit) return;

    if (tab === 'countercheck') {
        secCc.classList.remove('hidden');
        secCc.classList.add('flex');
        secEdit.classList.add('hidden');
        secEdit.classList.remove('flex');
        btnCc.className = "px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 bg-indigo-600 text-white shadow-sm";
        btnEdit.className = "px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200";
        updateCounterCheckMath();
    } else {
        secEdit.classList.remove('hidden');
        secEdit.classList.add('flex');
        secCc.classList.add('hidden');
        secCc.classList.remove('flex');
        btnEdit.className = "px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 bg-indigo-600 text-white shadow-sm";
        btnCc.className = "px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200";
        populateEditIngredientsTable();
    }
}

function setCounterCheckPreset(qty, unit) {
    currentCounterCheckQty = qty;
    currentCounterCheckUnit = unit;
    const inputQty = document.getElementById('fc-batch-qty');
    const inputUnit = document.getElementById('fc-batch-unit');
    if (inputQty) inputQty.value = qty;
    if (inputUnit) inputUnit.value = unit;
    updateCounterCheckMath();
}

function toggleCounterCheckItem(key) {
    counterCheckCheckedMap[key] = !counterCheckCheckedMap[key];
    updateCounterCheckMath();
}

function updateCounterCheckMath() {
    if (!currentActiveFormulation) return;
    const f = currentActiveFormulation;
    const ingredients = f.ingredients || [];
    const baseDose = Number(f.base_dose_qty) || 50;
    const baseUnit = f.base_unit || 'g';

    const inputQty = parseFloat(document.getElementById('fc-batch-qty')?.value);
    currentCounterCheckQty = (!isNaN(inputQty) && inputQty > 0) ? inputQty : 1000;
    currentCounterCheckUnit = document.getElementById('fc-batch-unit')?.value || 'pcs';

    // Calculate total batch mass in grams and finished pcs
    let totalPieces = 0;
    let totalCompoundingMassGrams = 0;

    if (currentCounterCheckUnit === 'pcs') {
        totalPieces = currentCounterCheckQty;
        totalCompoundingMassGrams = totalPieces * baseDose;
    } else {
        totalCompoundingMassGrams = currentCounterCheckQty * 1000;
        totalPieces = baseDose > 0 ? (totalCompoundingMassGrams / baseDose) : currentCounterCheckQty;
    }

    // Update KPI Bar
    const kpiOutput = document.getElementById('kpi-fc-output');
    const kpiMass = document.getElementById('kpi-fc-mass');
    const kpiProgress = document.getElementById('kpi-fc-progress');
    const kpiCost = document.getElementById('kpi-fc-cost');

    if (kpiOutput) kpiOutput.textContent = `${Number(totalPieces).toLocaleString('en-US', { maximumFractionDigits: 0 })} pcs`;
    if (kpiMass) kpiMass.textContent = `${(totalCompoundingMassGrams / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg (${totalCompoundingMassGrams.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g)`;

    // Group ingredients by Phase
    const phases = {};
    ingredients.forEach((ing, idx) => {
        const ph = ing.phase || 'Phase A - Base';
        if (!phases[ph]) phases[ph] = [];
        phases[ph].push({ ...ing, originalIndex: idx });
    });

    let totalVerified = 0;
    let totalBatchEstCost = 0;

    const container = document.getElementById('container-countercheck-table');
    if (!container) return;

    if (ingredients.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-slate-400 font-medium">
                No ingredients defined in this recipe. Switch to "Edit Formulation" tab to add materials.
            </div>
        `;
        return;
    }

    container.innerHTML = Object.keys(phases).map(phaseName => {
        const phaseItems = phases[phaseName];
        const phasePct = phaseItems.reduce((acc, it) => acc + (Number(it.percentage) || 0), 0);

        return `
            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div class="bg-slate-100/90 px-3.5 py-1.5 flex justify-between items-center border-b border-slate-200">
                    <span class="font-black text-slate-800 text-xs flex items-center gap-1.5">
                        <span>⚗️</span>
                        <span>${phaseName}</span>
                    </span>
                    <span class="text-[11px] font-mono font-bold text-indigo-700">Subtotal: ${phasePct.toFixed(2)}% w/w</span>
                </div>
                <table class="w-full text-left text-xs">
                    <thead class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[9.5px] border-b border-slate-100">
                        <tr>
                            <th class="py-1.5 px-3" style="width: 32px; text-align: center;">✓</th>
                            <th class="py-1.5 px-3" style="width: 100px;">Material Code</th>
                            <th class="py-1.5 px-3">Material Description / INCI</th>
                            <th class="py-1.5 px-3 text-center" style="width: 70px;">% w/w</th>
                            <th class="py-1.5 px-3 text-right" style="width: 80px;">Dose / Unit</th>
                            <th class="py-1.5 px-3 text-right" style="width: 130px;">Required for Batch</th>
                            <th class="py-1.5 px-3 text-right" style="width: 90px;">Est. Cost</th>
                            <th class="py-1.5 px-3">Notes</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 font-medium">
                        ${phaseItems.map(item => {
                            const pct = Number(item.percentage) || 0;
                            const dose = Number(item.quantity_per_unit || item.qty) || ((baseDose * pct) / 100);
                            const reqGrams = (totalCompoundingMassGrams * pct) / 100;
                            const formattedReq = formatMassCalc(reqGrams);
                            const unitCost = Number(item.unit_cost) || 0;
                            const itemBatchCost = reqGrams * unitCost;
                            totalBatchEstCost += itemBatchCost;

                            const itemKey = item.material_code || `ing_${item.originalIndex}`;
                            const isChecked = !!counterCheckCheckedMap[itemKey];
                            if (isChecked) totalVerified++;

                            return `
                                <tr class="${isChecked ? 'bg-emerald-50/70' : 'hover:bg-slate-50'} transition">
                                    <td class="py-2 px-3 text-center">
                                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleCounterCheckItem('${itemKey}')" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer">
                                    </td>
                                    <td class="py-2 px-3 font-mono font-bold text-slate-800 text-[11px] whitespace-nowrap">
                                        ${item.material_code || '-'}
                                    </td>
                                    <td class="py-2 px-3 font-bold text-slate-900">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                            <span>${item.material_name || 'Raw Material'}</span>
                                            ${item.supplier ? `<span class="px-1.5 py-0.5 rounded text-[9.5px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">🏢 ${item.supplier}</span>` : ''}
                                        </div>
                                    </td>
                                    <td class="py-2 px-3 text-center font-mono font-bold text-indigo-700">
                                        ${pct.toFixed(2)}%
                                    </td>
                                    <td class="py-2 px-3 text-right font-mono text-slate-700">
                                        ${dose.toFixed(4)} ${item.unit || 'g'}
                                    </td>
                                    <td class="py-2 px-3 text-right font-mono font-black text-indigo-900 bg-indigo-50/40 text-[11.5px]">
                                        ${formattedReq}
                                    </td>
                                    <td class="py-2 px-3 text-right font-mono text-emerald-700 font-bold">
                                        ₱${itemBatchCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td class="py-2 px-3 text-slate-500 text-[11px]">
                                        ${isChecked ? '<span class="text-emerald-700 font-bold">✅ Verified Scale Check</span>' : (item.notes || '—')}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }).join('');

    if (kpiProgress) {
        const pctVerified = ingredients.length > 0 ? Math.round((totalVerified / ingredients.length) * 100) : 0;
        kpiProgress.textContent = `${totalVerified} / ${ingredients.length} Checked (${pctVerified}%)`;
    }

    if (kpiCost) {
        const perUnitCost = totalPieces > 0 ? (totalBatchEstCost / totalPieces) : 0;
        kpiCost.textContent = `₱${totalBatchEstCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (₱${perUnitCost.toFixed(2)}/u)`;
    }
}

function printFormulationCounterCheck(productId) {
    const qty = currentCounterCheckQty || 1000;
    const unit = currentCounterCheckUnit || 'pcs';
    window.open(`/print-formulation-countercheck.html?productId=${productId}&batchQty=${qty}&batchUnit=${unit}`, '_blank');
}

// -------------------------------------------------------------
// RECIPE EDITOR TAB FUNCTIONS
// -------------------------------------------------------------
function populateEditIngredientsTable() {
    if (!currentActiveFormulation) return;
    const tbody = document.getElementById('fe-ingredients-tbody');
    if (!tbody) return;

    const ingredients = currentActiveFormulation.ingredients || [];
    tbody.innerHTML = '';

    if (ingredients.length === 0) {
        addFormulationIngredientRow();
    } else {
        ingredients.forEach(ing => addFormulationIngredientRow(ing));
    }
    updateFormulationBalance();
}

let editRowCounter = 0;

function addFormulationIngredientRow(data = null) {
    const tbody = document.getElementById('fe-ingredients-tbody');
    if (!tbody) return;

    editRowCounter++;
    const rowId = `fe-row-${editRowCounter}`;

    const defaultPhase = data?.phase || 'Phase A - Water Base';
    const code = data?.material_code || '';
    const name = data?.material_name || '';
    const pct = data?.percentage !== undefined ? Number(data.percentage) : 0;
    const qty = data?.quantity_per_unit !== undefined ? Number(data.quantity_per_unit) : 0;
    const unit = data?.unit || 'g';
    const cost = data?.unit_cost !== undefined ? Number(data.unit_cost) : 0.50;
    const notes = data?.notes || '';

    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.className = "hover:bg-slate-50 transition";
    tr.innerHTML = `
        <td class="py-1 px-2">
            <input type="text" value="${defaultPhase}" class="ing-phase w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white font-semibold text-slate-800" placeholder="Phase A">
        </td>
        <td class="py-1 px-2">
            <input type="text" value="${code}" class="ing-code w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono font-bold text-slate-800" placeholder="RM-CODE">
        </td>
        <td class="py-1 px-2">
            <input type="text" value="${name}" class="ing-name w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white font-bold text-slate-900" placeholder="Raw Material Name">
        </td>
        <td class="py-1 px-2">
            <input type="number" step="0.01" min="0" max="100" value="${pct.toFixed(2)}" oninput="onEditIngredientPctChange('${rowId}')" class="ing-pct w-full px-1.5 py-1 text-xs text-center border border-slate-300 rounded bg-white font-mono font-bold text-indigo-700">
        </td>
        <td class="py-1 px-2">
            <input type="number" step="0.0001" min="0" value="${qty.toFixed(4)}" oninput="onEditIngredientQtyChange('${rowId}')" class="ing-qty w-full px-1.5 py-1 text-xs text-right border border-slate-300 rounded bg-white font-mono font-black text-slate-800">
        </td>
        <td class="py-1 px-2">
            <input type="text" value="${unit}" class="ing-unit w-full px-1 py-1 text-xs text-center border border-slate-300 rounded bg-white font-semibold">
        </td>
        <td class="py-1 px-2">
            <input type="number" step="0.01" min="0" value="${cost.toFixed(2)}" oninput="updateFormulationBalance()" class="ing-cost w-full px-1.5 py-1 text-xs text-right border border-slate-300 rounded bg-white font-mono font-bold text-emerald-700">
        </td>
        <td class="py-1 px-2">
            <input type="text" value="${notes}" class="ing-notes w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-600" placeholder="Notes...">
        </td>
        <td class="py-1 px-1 text-center">
            <button type="button" onclick="removeFormulationIngredientRow('${rowId}')" class="p-1 hover:bg-rose-100 text-rose-600 rounded transition" title="Delete Row">
                🗑️
            </button>
        </td>
    `;

    tbody.appendChild(tr);
    updateFormulationBalance();
}

function removeFormulationIngredientRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        updateFormulationBalance();
    }
}

function onEditIngredientPctChange(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const baseDose = parseFloat(document.getElementById('fe-base-dose')?.value) || 50;
    const pctInput = row.querySelector('.ing-pct');
    const qtyInput = row.querySelector('.ing-qty');

    const pct = parseFloat(pctInput.value) || 0;
    const qty = (baseDose * pct) / 100;
    if (qtyInput) qtyInput.value = qty.toFixed(4);

    updateFormulationBalance();
}

function onEditIngredientQtyChange(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const baseDose = parseFloat(document.getElementById('fe-base-dose')?.value) || 50;
    const pctInput = row.querySelector('.ing-pct');
    const qtyInput = row.querySelector('.ing-qty');

    const qty = parseFloat(qtyInput.value) || 0;
    const pct = baseDose > 0 ? (qty / baseDose) * 100 : 0;
    if (pctInput) pctInput.value = pct.toFixed(2);

    updateFormulationBalance();
}

function recalcEditIngredientsFromDose() {
    const baseDose = parseFloat(document.getElementById('fe-base-dose')?.value) || 50;
    const rows = document.querySelectorAll('#fe-ingredients-tbody tr');

    rows.forEach(row => {
        const pctInput = row.querySelector('.ing-pct');
        const qtyInput = row.querySelector('.ing-qty');
        const pct = parseFloat(pctInput?.value) || 0;
        const qty = (baseDose * pct) / 100;
        if (qtyInput) qtyInput.value = qty.toFixed(4);
    });

    updateFormulationBalance();
}

function updateFormulationBalance() {
    const rows = document.querySelectorAll('#fe-ingredients-tbody tr');
    let sumPct = 0;
    let sumUnitCost = 0;

    rows.forEach(row => {
        const pct = parseFloat(row.querySelector('.ing-pct')?.value) || 0;
        const qty = parseFloat(row.querySelector('.ing-qty')?.value) || 0;
        const cost = parseFloat(row.querySelector('.ing-cost')?.value) || 0;

        sumPct += pct;
        sumUnitCost += (qty * cost);
    });

    const badge = document.getElementById('fe-balance-badge');
    const costDisplay = document.getElementById('fe-total-unit-cost');

    if (badge) {
        const isBalanced = Math.abs(sumPct - 100.0) < 0.05;
        if (isBalanced) {
            badge.className = "px-3 py-1 rounded-full font-mono font-bold text-xs bg-emerald-100 text-emerald-800 border border-emerald-300";
            badge.textContent = `✅ Balanced: ${sumPct.toFixed(2)}% w/w`;
        } else {
            badge.className = "px-3 py-1 rounded-full font-mono font-bold text-xs bg-amber-100 text-amber-900 border border-amber-300";
            badge.textContent = `⚠️ Total: ${sumPct.toFixed(2)}% w/w (Target: 100%)`;
        }
    }

    if (costDisplay) {
        costDisplay.textContent = `₱${sumUnitCost.toFixed(2)} / unit`;
    }
}

function loadStandardFormulationTemplate(key) {
    const template = STANDARD_RECIPE_PRESETS[key];
    if (!template) return;

    if (!confirm(`Load standard ${template.name} template? This will replace the ingredients below.`)) {
        return;
    }

    document.getElementById('fe-formula-code').value = template.code;
    document.getElementById('fe-formula-name').value = template.name;
    document.getElementById('fe-base-dose').value = template.baseDose;
    document.getElementById('fe-base-unit').value = template.unit;
    document.getElementById('fe-instructions').value = template.instructions;

    const tbody = document.getElementById('fe-ingredients-tbody');
    tbody.innerHTML = '';

    template.ingredients.forEach(ing => {
        addFormulationIngredientRow({
            phase: ing.phase,
            material_code: ing.material_code,
            material_name: ing.material_name,
            percentage: ing.percentage,
            quantity_per_unit: ing.qty,
            unit: ing.unit,
            unit_cost: ing.unit_cost,
            notes: ing.notes
        });
    });

    updateFormulationBalance();
    NKB.showToast(`Loaded ${key} recipe template successfully.`, 'success');
}

async function saveProductFormulation(productId) {
    if (!productId && currentActiveFormulation) {
        productId = currentActiveFormulation.product_id;
    }

    const formulaCode = (document.getElementById('fe-formula-code')?.value || '').trim();
    const name = (document.getElementById('fe-formula-name')?.value || '').trim();
    const baseDoseQty = parseFloat(document.getElementById('fe-base-dose')?.value) || 50;
    const baseUnit = document.getElementById('fe-base-unit')?.value || 'g';
    const instructions = (document.getElementById('fe-instructions')?.value || '').trim();
    const isConfidential = document.getElementById('fe-is-confidential')?.checked ? 1 : 0;

    if (!name) {
        NKB.showToast('Please enter a formulation name.', 'warning');
        return;
    }

    // Collect ingredient rows
    const rows = document.querySelectorAll('#fe-ingredients-tbody tr');
    const ingredients = [];

    rows.forEach((row, idx) => {
        const phase = row.querySelector('.ing-phase')?.value.trim() || 'Phase A';
        const material_code = row.querySelector('.ing-code')?.value.trim() || `RM-${idx + 1}`;
        const material_name = row.querySelector('.ing-name')?.value.trim() || 'Raw Material';
        const percentage = parseFloat(row.querySelector('.ing-pct')?.value) || 0;
        const quantity_per_unit = parseFloat(row.querySelector('.ing-qty')?.value) || 0;
        const unit = row.querySelector('.ing-unit')?.value.trim() || 'g';
        const unit_cost = parseFloat(row.querySelector('.ing-cost')?.value) || 0;
        const notes = row.querySelector('.ing-notes')?.value.trim() || '';

        ingredients.push({
            phase,
            material_code,
            material_name,
            percentage,
            quantity_per_unit,
            unit,
            unit_cost,
            notes
        });
    });

    if (ingredients.length === 0) {
        NKB.showToast('Please add at least one ingredient to the formulation.', 'warning');
        return;
    }

    try {
        const payload = {
            productId,
            formulaCode,
            name,
            baseDoseQty,
            baseUnit,
            instructions,
            isConfidential,
            ingredients
        };

        const res = await NKB.api('/api/formulations', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!res.success) {
            NKB.showToast(res.error || 'Failed to save formulation.', 'error');
            return;
        }

        NKB.showToast('✅ Formulation and BOM saved successfully!', 'success');
        currentActiveFormulation = res.data;

        // Refresh background formulations table if active
        if (typeof loadFormulations === 'function') {
            loadFormulations();
        }

        // Switch to Counter-Check tab with updated numbers
        switchFormulationModalTab('countercheck');
    } catch (err) {
        console.error('Error saving formulation:', err);
        NKB.showToast('Error saving formulation.', 'error');
    }
}

// Window Exports
window.loadFormulations = loadFormulations;
window.syncFmsFormulations = syncFmsFormulations;
window.renderFormulationsTable = renderFormulationsTable;
window.filterFormulationsTable = filterFormulationsTable;
window.openProductFormulationModal = openProductFormulationModal;
window.openViewFormulationModal = openProductFormulationModal;
window.switchFormulationModalTab = switchFormulationModalTab;
window.setCounterCheckPreset = setCounterCheckPreset;
window.toggleCounterCheckItem = toggleCounterCheckItem;
window.updateCounterCheckMath = updateCounterCheckMath;
window.printFormulationCounterCheck = printFormulationCounterCheck;
window.populateEditIngredientsTable = populateEditIngredientsTable;
window.addFormulationIngredientRow = addFormulationIngredientRow;
window.removeFormulationIngredientRow = removeFormulationIngredientRow;
window.onEditIngredientPctChange = onEditIngredientPctChange;
window.onEditIngredientQtyChange = onEditIngredientQtyChange;
window.recalcEditIngredientsFromDose = recalcEditIngredientsFromDose;
window.updateFormulationBalance = updateFormulationBalance;
window.loadStandardFormulationTemplate = loadStandardFormulationTemplate;
window.saveProductFormulation = saveProductFormulation;

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
                            if (s.includes('payables')) color = 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold';
                            else if (s.includes('write')) color = 'bg-amber-50 text-amber-800 border-amber-200';
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

async function openCreateApiKeyModal(defaultName = 'COO External Portal API') {
    const root = document.getElementById('modals-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-base">🔑</div>
                        <div>
                            <h3 class="text-lg font-bold text-slate-900">Generate Cheque Payables API Key</h3>
                            <p class="text-[11px] text-slate-500">Create a secure external API credential restricted exclusively to Cheque Payables & COO Approvals.</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>

                <div class="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5">
                    <span class="text-base mt-0.5">🔒</span>
                    <div class="text-[11px] text-amber-900 leading-snug">
                        <span class="font-bold">Cheque Payables Access Only:</span>
                        This API generator issues credentials restricted strictly to <strong>Cheque Payables & COO Approvals</strong> (<code class="bg-amber-100 px-1 py-0.5 rounded text-[10px] font-mono">/api/v1/payables</code>). External access to client orders, product catalogs, and finished goods inventory is disabled.
                    </div>
                </div>

                <form onsubmit="submitCreateApiKey(event)" class="overflow-y-auto flex-1 space-y-4 pr-1">
                    <!-- Key Name -->
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Key Name / Identifier <span class="text-rose-500">*</span></label>
                        <input type="text" id="api-key-name" required value="${escapeApiKeyHtml(defaultName)}" placeholder="e.g. COO External Portal Integration, ERP Cheque Payables Sync" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none">
                    </div>

                    <!-- Integration Scope -->
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Integration Scope</label>
                        <div class="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium flex items-center justify-between">
                            <span>🏢 Internal Corporate System (Cheque Payables & All Companies)</span>
                            <span class="px-2 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-bold text-slate-600">Company-wide</span>
                        </div>
                        <input type="hidden" id="api-key-client-id" value="">
                    </div>

                    <!-- Cheque Payables Permission Scopes Selection -->
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <label class="block text-xs font-bold text-slate-700">Cheque Payables Permission Scopes <span class="text-rose-500">*</span></label>
                            <div class="flex gap-2">
                                <button type="button" onclick="selectAllApiScopes(true)" class="text-[10px] text-amber-700 hover:underline font-bold">Select All</button>
                                <span class="text-slate-300">•</span>
                                <button type="button" onclick="selectAllApiScopes(false)" class="text-[10px] text-slate-500 hover:underline">Clear</button>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <label class="flex items-start gap-2.5 cursor-pointer p-2.5 bg-slate-50 hover:bg-amber-50/40 border border-slate-200 rounded-xl text-xs transition">
                                <input type="checkbox" name="api-scope" value="payables:read" checked class="mt-0.5 rounded text-amber-600 focus:ring-amber-500">
                                <div class="flex-1">
                                    <div class="font-bold text-slate-800 flex items-center gap-2">
                                        <span class="font-mono text-xs text-indigo-700">payables:read</span>
                                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">Required for Queries</span>
                                    </div>
                                    <div class="text-[10px] text-slate-500 leading-tight mt-0.5">Query & monitor cheque payables, requisitions, vouchers, bank accounts, and COO approval statuses.</div>
                                </div>
                            </label>

                            <label class="flex items-start gap-2.5 cursor-pointer p-2.5 bg-slate-50 hover:bg-amber-50/40 border border-slate-200 rounded-xl text-xs transition">
                                <input type="checkbox" name="api-scope" value="payables:confirm" checked class="mt-0.5 rounded text-amber-600 focus:ring-amber-500">
                                <div class="flex-1">
                                    <div class="font-bold text-slate-800 flex items-center gap-2">
                                        <span class="font-mono text-xs text-indigo-700">payables:confirm</span>
                                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-200">COO Approval</span>
                                    </div>
                                    <div class="text-[10px] text-slate-500 leading-tight mt-0.5">Authorize, confirm, assign cheque numbers, reject, or mark payables as cleared via external COO portal.</div>
                                </div>
                            </label>

                            <label class="flex items-start gap-2.5 cursor-pointer p-2.5 bg-slate-50 hover:bg-amber-50/40 border border-slate-200 rounded-xl text-xs transition">
                                <input type="checkbox" name="api-scope" value="payables:write" checked class="mt-0.5 rounded text-amber-600 focus:ring-amber-500">
                                <div class="flex-1">
                                    <div class="font-bold text-slate-800 flex items-center gap-2">
                                        <span class="font-mono text-xs text-indigo-700">payables:write</span>
                                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">Requisitions</span>
                                    </div>
                                    <div class="text-[10px] text-slate-500 leading-tight mt-0.5">Submit new cheque payable requests and line-item expense vouchers programmatically via REST API.</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- Expiration & Rate Limit -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Key Expiration</label>
                            <select id="api-key-expires" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none">
                                <option value="">Never Expires (Recommended for COO Portal)</option>
                                <option value="30">Expires in 30 days</option>
                                <option value="90">Expires in 90 days</option>
                                <option value="365">Expires in 1 year</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Rate Limit (Requests / Min)</label>
                            <input type="number" id="api-key-rate-limit" value="120" min="10" max="1000" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none">
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">Cancel</button>
                        <button type="submit" id="btn-submit-api-key" class="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition flex items-center gap-1.5">
                            <span>🔑</span>
                            <span>Generate Cheque Payables API Key</span>
                        </button>
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
        NKB.showToast('Please select at least one Cheque Payables permission scope.', 'warning');
        return;
    }

    const submitBtn = document.getElementById('btn-submit-api-key');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Generating Key...';
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
                submitBtn.innerHTML = '🔑 Generate Cheque Payables API Key';
            }
            return;
        }

        NKB.showToast('Cheque Payables API Key generated successfully!', 'success');
        loadApiKeys();
        openRawKeyRevealModal(res.rawKey, res.apiKey.name, res.apiKey.scopes);
    } catch (err) {
        console.error('Error submitting API key:', err);
        NKB.showToast('Error generating API key.', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🔑 Generate Cheque Payables API Key';
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
                        <h3 class="text-lg font-bold text-slate-900">Cheque Payables API Key Generated!</h3>
                        <p class="text-xs text-slate-500">Key: <span class="font-bold text-slate-800">${escapeApiKeyHtml(keyName)}</span> <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Payables Only</span></p>
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
                        <input type="text" id="reveal-raw-key-input" readonly value="${rawKey}" class="w-full px-3 py-2.5 bg-slate-900 text-amber-300 font-mono text-xs rounded-xl font-bold border border-slate-700 select-all focus:outline-none">
                        <button onclick="copyRawApiKey()" id="btn-copy-raw-key" class="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 whitespace-nowrap transition flex items-center gap-1.5">
                            <span id="copy-btn-icon">📋</span>
                            <span id="copy-btn-text">Copy Key</span>
                        </button>
                    </div>
                </div>

                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5 text-slate-600">
                    <div class="font-bold text-slate-700 flex items-center gap-1.5">
                        <span>🔌</span>
                        <span>Sample Integration Requests:</span>
                    </div>
                    <div class="space-y-1 font-mono text-[10px]">
                        <div class="text-slate-500 font-sans font-semibold">1. Query Pending Cheque Payables:</div>
                        <code class="block bg-white p-2 rounded border border-slate-200 text-slate-800 select-all overflow-x-auto">curl -H "x-api-key: ${rawKey}" "https://my.nkbmanufacturing.com/api/v1/payables?status=PENDING_COO_APPROVAL"</code>
                        
                        <div class="text-slate-500 font-sans font-semibold pt-1">2. Confirm / Authorize via External COO Portal:</div>
                        <code class="block bg-white p-2 rounded border border-slate-200 text-slate-800 select-all overflow-x-auto">curl -X POST "https://my.nkbmanufacturing.com/api/v1/payables/{PAYABLE_ID}/confirm" -H "x-api-key: ${rawKey}" -H "Content-Type: application/json" -d '{"action":"CONFIRMED","cheque_number":"CHQ-123456"}'</code>
                    </div>
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
window.openCreatePOModal = openCreatePOModal;

// Cheque Payables & Payments Check Attachments Exports
window.loadPayables = loadPayables;
window.renderPayablesRows = renderPayablesRows;
window.filterPayablesTable = filterPayablesTable;
window.setPayablesDatePreset = setPayablesDatePreset;
window.resetPayablesFilters = resetPayablesFilters;
window.quickFilterPayablesStatus = quickFilterPayablesStatus;
window.openRequestPayableModal = openRequestPayableModal;
window.handlePayableAttachmentSelect = handlePayableAttachmentSelect;
window.clearPayableAttachment = clearPayableAttachment;
window.onPayableBankChange = onPayableBankChange;
window.submitRequestPayable = submitRequestPayable;
window.openViewPayableDetailsModal = openViewPayableDetailsModal;
window.openCooConfirmPayableModal = openCooConfirmPayableModal;
window.submitCooConfirmPayable = submitCooConfirmPayable;
window.exportPayablesToExcel = exportPayablesToExcel;
window.printPayablesReport = printPayablesReport;
window.printSingleChequeVoucher = printSingleChequeVoucher;
window.openViewCheckModal = openViewCheckModal;
window.openAttachCheckModal = openAttachCheckModal;
window.submitAttachCheck = submitAttachCheck;
window.handlePaymentAttachmentSelect = handlePaymentAttachmentSelect;
window.clearPaymentAttachment = clearPaymentAttachment;

// =============================================================
// IT MANAGEMENT & MASTER RECORDS EDITOR
// =============================================================
let itCurrentTable = 'purchase_orders';
let itCurrentPage = 1;
let itLookups = null;
let itTablesMetadata = [];
let itDebounceTimer = null;
let itEditingTable = null;
let itEditingId = null;

async function loadITManagement(table = null, page = 1) {
    if (table) itCurrentTable = table;
    itCurrentPage = page;

    // Load tables metadata if needed
    if (!itTablesMetadata.length) {
        try {
            const res = await NKB.api('/api/it-management/tables');
            if (res.success && res.data) itTablesMetadata = res.data;
        } catch (e) {
            console.error('Failed to load IT tables metadata:', e);
        }
    }

    // Load lookups if needed
    if (!itLookups) {
        try {
            const res = await NKB.api('/api/it-management/lookups');
            if (res.success && res.data) {
                itLookups = res.data;
                populateITQuickActionSelects();
            }
        } catch (e) {
            console.error('Failed to load IT lookups:', e);
        }
    }

    renderITTablePills();
    await fetchAndRenderITRecords();
}

function renderITTablePills() {
    const pillsContainer = document.getElementById('it-table-pills');
    if (!pillsContainer || !itTablesMetadata.length) return;

    pillsContainer.innerHTML = itTablesMetadata.map(t => {
        const isActive = t.tableName === itCurrentTable;
        const activeCls = isActive
            ? 'bg-rose-600 text-white font-bold shadow-md shadow-rose-600/30 border-rose-600'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200';
        return `
            <button type="button" onclick="selectITTable('${t.tableName}')" class="px-3 py-1.5 rounded-xl text-xs border transition flex items-center gap-1.5 ${activeCls}">
                <span>${t.icon || '📄'}</span>
                <span>${t.label}</span>
            </button>
        `;
    }).join('');
}

function selectITTable(tableName) {
    itCurrentTable = tableName;
    itCurrentPage = 1;
    const searchInput = document.getElementById('it-search-input');
    if (searchInput) searchInput.value = '';
    renderITTablePills();
    fetchAndRenderITRecords();
}

function populateITQuickActionSelects() {
    if (!itLookups) return;

    // Quick PO select
    const poSelect = document.getElementById('it-quick-po-select');
    if (poSelect && itLookups.orders) {
        poSelect.innerHTML = '<option value="">-- Choose a Purchase Order --</option>' +
            itLookups.orders.map(o => {
                const isSelected = o.po_number === 'PO-2026-000021' ? 'selected' : '';
                return `<option value="${o.id}" ${isSelected}>${o.po_number} [${o.status}]</option>`;
            }).join('');
    }

    // Quick Client select
    const clientSelect = document.getElementById('it-quick-client-select');
    if (clientSelect && itLookups.clients) {
        clientSelect.innerHTML = '<option value="">-- Choose Target Client --</option>' +
            itLookups.clients.map(c => {
                const isGems = c.company_name.toLowerCase().includes('gems') ? 'selected' : '';
                return `<option value="${c.id}" ${isGems}>${c.company_name} (${c.contact_person || 'No Contact'})</option>`;
            }).join('');
    }

    onITStatusTableChange();
}

function onITStatusTableChange() {
    const tableSelect = document.getElementById('it-quick-status-table');
    const valSelect = document.getElementById('it-quick-status-val');
    if (!tableSelect || !valSelect || !itLookups || !itLookups.statuses) return;

    const tbl = tableSelect.value;
    const statuses = itLookups.statuses[tbl] || [];
    valSelect.innerHTML = statuses.map(s => `<option value="${s}">${s}</option>`).join('');
}

async function fetchAndRenderITRecords() {
    const searchInput = document.getElementById('it-search-input');
    const search = searchInput ? searchInput.value.trim() : '';

    const tbody = document.getElementById('it-records-tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" class="py-8 text-center text-slate-400">Loading records...</td></tr>';
    }

    try {
        const queryParams = new URLSearchParams({
            page: itCurrentPage,
            limit: 50,
            search
        });

        const res = await NKB.api(`/api/it-management/records/${itCurrentTable}?${queryParams.toString()}`);
        if (!res.success) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-rose-500 font-bold">${res.error || 'Failed to load records'}</td></tr>`;
            return;
        }

        renderITRecordsUI(res);
    } catch (err) {
        console.error('Error fetching IT records:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-rose-500 font-bold">Error loading records: ${err.message}</td></tr>`;
    }
}

function renderITRecordsUI(res) {
    const { table, data, pagination, definition } = res;

    // Update Header Info
    const iconEl = document.getElementById('it-current-table-icon');
    const titleEl = document.getElementById('it-current-table-title');
    const descEl = document.getElementById('it-current-table-desc');
    const counterEl = document.getElementById('it-records-counter');

    if (iconEl) iconEl.textContent = definition.icon || '📋';
    if (titleEl) titleEl.textContent = definition.label;
    if (descEl) descEl.textContent = `Managing ${pagination.total} total records in table '${table}'.`;
    if (counterEl) counterEl.textContent = `${pagination.total} records`;

    // Render Table Header
    const thead = document.getElementById('it-records-thead');
    if (thead) {
        thead.innerHTML = getITTableHeaderHTML(table);
    }

    // Render Table Rows
    const tbody = document.getElementById('it-records-tbody');
    if (tbody) {
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="py-8 text-center text-slate-400">No records found matching criteria.</td></tr>';
        } else {
            tbody.innerHTML = data.map(row => getITTableRowHTML(table, row)).join('');
        }
    }

    // Pagination
    const pageInfo = document.getElementById('it-pagination-info');
    const prevBtn = document.getElementById('it-prev-page-btn');
    const nextBtn = document.getElementById('it-next-page-btn');

    if (pageInfo) {
        pageInfo.textContent = `Showing page ${pagination.page} of ${pagination.pages} (${pagination.total} records)`;
    }
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= pagination.pages;
}

function getITTableHeaderHTML(table) {
    const baseHeader = (cols) => `
        <tr>
            ${cols.map(c => `<th class="py-3 px-3">${c}</th>`).join('')}
            <th class="py-3 px-3 text-right">Actions</th>
        </tr>
    `;

    switch (table) {
        case 'purchase_orders':
            return baseHeader(['PO / SO No.', 'Client Company', 'Date', 'Status', 'Grand Total', 'Form of Payment', 'Notes']);
        case 'purchase_order_items':
            return baseHeader(['Item Name', 'PO Number', 'Product', 'Target Qty', 'Delivered Qty', 'Unit Price', 'Subtotal']);
        case 'job_orders':
            return baseHeader(['JO Number', 'PO Number', 'Product', 'Target Qty', 'Team', 'Status', 'Start Date']);
        case 'production_batches':
            return baseHeader(['Batch No.', 'JO / PO', 'Product', 'Formula', 'Prod Date', 'Yield / Target', 'Status', 'QC Notes']);
        case 'delivery_receipts':
            return baseHeader(['DR Number', 'Client Company', 'PO Number', 'Delivery Date', 'Driver & Plate', 'Status']);
        case 'sales_invoices':
            return baseHeader(['Invoice No.', 'Client Company', 'PO Number', 'DR Number', 'Total Amount', 'Due Date', 'Status']);
        case 'payments':
            return baseHeader(['Payment Ref', 'Invoice No.', 'Client Company', 'Amount', 'Method', 'Date', 'Status']);
        case 'cheque_payables':
            return baseHeader(['Voucher No.', 'Payee', 'Company', 'Amount', 'Bank', 'Cheque No.', 'Status']);
        case 'clients':
            return baseHeader(['Company Name', 'Contact Person', 'Email', 'Phone', 'Billing Policy', 'Credit Limit', 'Status']);
        case 'products':
            return baseHeader(['SKU', 'Product Name', 'Category', 'Unit', 'Price', 'Formula Code', 'Stock', 'Status']);
        case 'raw_materials':
            return baseHeader(['Code', 'Material Name', 'Category', 'Current Stock', 'Unit', 'Min Level', 'Cost']);
        case 'users':
            return baseHeader(['Name', 'Email', 'Role', 'Linked Client', 'Phone', 'Plain Pwd', 'Status']);
        default:
            return baseHeader(['ID', 'Details', 'Created At']);
    }
}

function getITTableRowHTML(table, r) {
    const statusBadge = (s) => {
        if (!s) return '<span class="text-slate-400">-</span>';
        let bg = 'bg-slate-100 text-slate-700 border-slate-200';
        if (s.includes('APPROV') || s.includes('COMPLET') || s.includes('PAID') || s.includes('CLEARED') || s === 'ACTIVE') bg = 'bg-emerald-100 text-emerald-800 border-emerald-200 font-bold';
        else if (s.includes('PRODUC') || s.includes('DISPATCH') || s.includes('PARTIAL')) bg = 'bg-indigo-100 text-indigo-800 border-indigo-200 font-bold';
        else if (s.includes('PENDING') || s.includes('DRAFT')) bg = 'bg-amber-100 text-amber-800 border-amber-200 font-bold';
        else if (s.includes('CANCEL') || s.includes('VOID') || s.includes('REJECT')) bg = 'bg-rose-100 text-rose-800 border-rose-200 font-bold';
        return `<span class="px-2 py-0.5 rounded text-[10px] border ${bg}">${s}</span>`;
    };

    const actionButtons = `
        <td class="py-2.5 px-3 text-right whitespace-nowrap">
            <button type="button" onclick="openITEditModal('${table}', '${r.id}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg border border-indigo-200 transition text-[11px] shadow-sm">
                ✏️ Edit
            </button>
            <button type="button" onclick="deleteITRecord('${table}', '${r.id}')" class="px-2 py-1 ml-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg border border-rose-200 transition text-[11px] shadow-sm" title="Delete Record">
                🗑️
            </button>
        </td>
    `;

    switch (table) {
        case 'purchase_orders':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono font-bold text-indigo-700">${r.po_number}${r.so_number ? `<br><span class="text-[10px] text-slate-400">${r.so_number}</span>` : ''}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-800">${r.client_company_name || r.client_id}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-slate-600">${r.po_date || '-'}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.status)}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${NKB.formatCurrency(r.grand_total)}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.form_of_payment || 'COD'}</td>
                    <td class="py-2.5 px-3 text-slate-500 max-w-xs truncate" title="${r.notes || ''}">${r.notes || '-'}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'purchase_order_items':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-bold text-slate-800">${r.item_name || r.product_name || '-'}</td>
                    <td class="py-2.5 px-3 font-mono text-indigo-600 font-bold">${r.po_number || r.po_id}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.product_name || '-'}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${NKB.formatNumber(r.target_quantity)}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-700">${NKB.formatNumber(r.delivered_quantity || 0)}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-900">${NKB.formatCurrency(r.unit_price)}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-emerald-700">${NKB.formatCurrency(r.subtotal)}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'job_orders':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono font-bold text-indigo-700">${r.jo_number}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${r.po_number || r.po_id}</td>
                    <td class="py-2.5 px-3 text-slate-800">${r.product_name || r.product_id}</td>
                    <td class="py-2.5 px-3 font-mono font-bold">${NKB.formatNumber(r.target_quantity)}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.assigned_team || '-'}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.status)}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-slate-600">${r.scheduled_start_date || '-'}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'production_batches':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono font-bold text-indigo-700">${r.batch_number}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${r.jo_number || r.jo_id}</td>
                    <td class="py-2.5 px-3 text-slate-800 font-semibold">${r.product_name || r.product_id}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-500">${r.formula_code || '-'}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-slate-600">${r.production_date || '-'}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${NKB.formatNumber(r.actual_yield || 0)} / ${NKB.formatNumber(r.target_quantity)}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.status)}</td>
                    <td class="py-2.5 px-3 text-slate-500 max-w-xs truncate" title="${r.qc_notes || ''}">${r.qc_notes || '-'}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'delivery_receipts':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono font-bold text-indigo-700">${r.dr_number}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-800">${r.client_company_name || r.client_id}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${r.po_number || r.po_id}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-slate-600">${r.delivery_date || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-700">${r.driver_name || '-'} [${r.vehicle_plate || '-'}]</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.status)}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'sales_invoices':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono font-bold text-indigo-700">${r.invoice_number}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-800">${r.client_company_name || r.client_id}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${r.po_number || r.po_id}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${r.dr_number || r.dr_id || '-'}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${NKB.formatCurrency(r.total_amount)}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-slate-600">${r.due_date || '-'}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.status)}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'payments':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono font-bold text-indigo-700">${r.payment_reference || r.id}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${r.invoice_number || r.invoice_id}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-800">${r.client_company_name || r.client_id}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-emerald-700">${NKB.formatCurrency(r.amount)}</td>
                    <td class="py-2.5 px-3 text-slate-700">${r.payment_method || '-'}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-slate-600">${r.payment_date || '-'}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.status)}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'cheque_payables':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono font-bold text-amber-700">${r.voucher_number || '-'}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-800">${r.payee_name || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.company || '-'}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${NKB.formatCurrency(r.amount)}</td>
                    <td class="py-2.5 px-3 text-slate-700">${r.bank_name || '-'}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${r.cheque_number || '-'}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.status)}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'clients':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-bold text-slate-900">${r.company_name}</td>
                    <td class="py-2.5 px-3 text-slate-700">${r.contact_person || '-'}</td>
                    <td class="py-2.5 px-3 font-mono text-indigo-600">${r.email || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.phone || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.default_billing_policy || '-'}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${NKB.formatCurrency(r.credit_limit)}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.is_active ? 'ACTIVE' : 'INACTIVE')}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'products':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono font-bold text-indigo-700">${r.sku}</td>
                    <td class="py-2.5 px-3 font-bold text-slate-800">${r.name}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.category || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.unit || 'pcs'}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${NKB.formatCurrency(r.default_price)}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-500">${r.formula_code || '-'}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-800">${NKB.formatNumber(r.current_stock || 0)}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.is_active ? 'ACTIVE' : 'INACTIVE')}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'raw_materials':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono font-bold text-emerald-700">${r.material_code || '-'}</td>
                    <td class="py-2.5 px-3 font-bold text-slate-800">${r.material_name}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.category || '-'}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${NKB.formatNumber(r.current_stock || 0)}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.unit || 'KG'}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${NKB.formatNumber(r.minimum_stock_level || 0)}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${NKB.formatCurrency(r.unit_cost || 0)}</td>
                    ${actionButtons}
                </tr>
            `;
        case 'users':
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-bold text-slate-900">${r.name}</td>
                    <td class="py-2.5 px-3 font-mono text-indigo-600">${r.email}</td>
                    <td class="py-2.5 px-3 font-bold text-rose-700">${r.role}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.client_company_name || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.phone || '-'}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-500">${r.plain_password || '********'}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${statusBadge(r.is_active ? 'ACTIVE' : 'INACTIVE')}</td>
                    ${actionButtons}
                </tr>
            `;
        default:
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 font-mono text-slate-600">${r.id}</td>
                    <td class="py-2.5 px-3 text-slate-800">${JSON.stringify(r).slice(0, 80)}...</td>
                    <td class="py-2.5 px-3 text-slate-500">${r.created_at || '-'}</td>
                    ${actionButtons}
                </tr>
            `;
    }
}

function debounceITSearch() {
    clearTimeout(itDebounceTimer);
    itDebounceTimer = setTimeout(() => {
        itCurrentPage = 1;
        fetchAndRenderITRecords();
    }, 300);
}

function changeITPage(delta) {
    itCurrentPage = Math.max(1, itCurrentPage + delta);
    fetchAndRenderITRecords();
}

// Open Universal Edit Modal
async function openITEditModal(table, id) {
    itEditingTable = table;
    itEditingId = id;

    const modal = document.getElementById('modal-it-edit-record');
    const container = document.getElementById('it-modal-fields-container');
    const titleEl = document.getElementById('it-modal-title');
    const subtitleEl = document.getElementById('it-modal-subtitle');
    const iconEl = document.getElementById('it-modal-icon');

    if (!modal || !container) return;

    container.innerHTML = '<div class="col-span-2 py-8 text-center text-slate-400">Loading record details...</div>';
    modal.classList.remove('hidden');

    try {
        const res = await NKB.api(`/api/it-management/records/${table}/${id}`);
        if (!res.success || !res.data) {
            alert('Failed to load record details: ' + (res.error || 'Not found'));
            closeITEditModal();
            return;
        }

        const record = res.data;
        const def = res.definition;

        if (titleEl) titleEl.textContent = `Edit ${def.label} Record`;
        if (subtitleEl) subtitleEl.textContent = `Table: ${table} | ID: ${id}`;
        if (iconEl) iconEl.textContent = def.icon || '✏️';

        container.innerHTML = def.editableColumns.map(col => {
            return generateITFieldInputHTML(col, record[col], table);
        }).join('');

    } catch (err) {
        console.error('Error opening IT edit modal:', err);
        alert('Error: ' + err.message);
        closeITEditModal();
    }
}

function generateITFieldInputHTML(col, val, table) {
    const safeVal = (val === null || val === undefined) ? '' : val;
    const label = col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // 1. Client dropdown
    if (col === 'client_id' && itLookups && itLookups.clients) {
        return `
            <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
                <select name="${col}" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500 font-semibold text-slate-800">
                    <option value="">-- No Client Linked --</option>
                    ${itLookups.clients.map(c => `
                        <option value="${c.id}" ${c.id === safeVal ? 'selected' : ''}>
                            ${c.company_name} (${c.contact_person || 'No Contact'})
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    // 2. Product dropdown
    if (col === 'product_id' && itLookups && itLookups.products) {
        return `
            <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
                <select name="${col}" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500 font-semibold text-slate-800">
                    <option value="">-- Select Product --</option>
                    ${itLookups.products.map(p => `
                        <option value="${p.id}" ${p.id === safeVal ? 'selected' : ''}>
                            ${p.name} [${p.sku}]
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    // 3. Purchase Order dropdown
    if (col === 'po_id' && itLookups && itLookups.orders) {
        return `
            <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
                <select name="${col}" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500 font-mono text-slate-800">
                    <option value="">-- Select Order --</option>
                    ${itLookups.orders.map(o => `
                        <option value="${o.id}" ${o.id === safeVal ? 'selected' : ''}>
                            ${o.po_number} [${o.status}]
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    // 4. Status dropdown
    if (col === 'status' && itLookups && itLookups.statuses && itLookups.statuses[table]) {
        return `
            <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
                <select name="${col}" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500 font-bold text-indigo-700">
                    ${itLookups.statuses[table].map(s => `
                        <option value="${s}" ${s === safeVal ? 'selected' : ''}>${s}</option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    // 5. User role dropdown
    if (col === 'role' && itLookups && itLookups.statuses && itLookups.statuses.users) {
        return `
            <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
                <select name="${col}" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500 font-bold text-rose-700">
                    ${itLookups.statuses.users.map(r => `
                        <option value="${r}" ${r === safeVal ? 'selected' : ''}>${r}</option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    // 6. Boolean flags (1 / 0)
    if (['accounting_confirmed', 'inventory_confirmed', 'formulation_converted', 'is_active', 'is_vyuceutical_ops'].includes(col)) {
        return `
            <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
                <select name="${col}" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500">
                    <option value="1" ${safeVal == 1 ? 'selected' : ''}>Yes (Active / Confirmed)</option>
                    <option value="0" ${safeVal == 0 ? 'selected' : ''}>No (Inactive / Unconfirmed)</option>
                </select>
            </div>
        `;
    }

    // 7. Date inputs
    if (col.includes('date')) {
        return `
            <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
                <input type="date" name="${col}" value="${safeVal}" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500">
            </div>
        `;
    }

    // 8. Textareas (Notes, description, address, qc_notes)
    if (['notes', 'description', 'qc_notes', 'address'].includes(col)) {
        return `
            <div class="col-span-1 sm:col-span-2">
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
                <textarea name="${col}" rows="3" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500 font-sans">${safeVal}</textarea>
            </div>
        `;
    }

    // 9. Numeric inputs
    if (['subtotal', 'grand_total', 'total_amount', 'amount', 'tax_amount', 'unit_price', 'default_price', 'credit_limit', 'target_quantity', 'actual_yield', 'variance_quantity', 'delivered_quantity', 'accepted_quantity', 'rejected_quantity', 'tolerance_percent', 'tax_percent', 'variance_percent', 'current_stock', 'minimum_stock_level', 'unit_cost', 'auto_lock_minutes'].includes(col)) {
        return `
            <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
                <input type="number" step="any" name="${col}" value="${safeVal}" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500 font-mono">
            </div>
        `;
    }

    // Default: text input
    return `
        <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">${label}</label>
            <input type="text" name="${col}" value="${safeVal}" class="w-full text-xs p-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-500">
        </div>
    `;
}

function closeITEditModal() {
    const modal = document.getElementById('modal-it-edit-record');
    if (modal) modal.classList.add('hidden');
    itEditingTable = null;
    itEditingId = null;
}

async function submitITRecordEdit(event) {
    if (event) event.preventDefault();
    if (!itEditingTable || !itEditingId) return;

    const form = document.getElementById('form-it-edit-record');
    if (!form) return;

    const formData = new FormData(form);
    const payload = {};
    for (const [key, value] of formData.entries()) {
        payload[key] = value.trim();
    }

    const saveBtn = document.getElementById('it-modal-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>⏳ Saving Changes...</span>';
    }

    try {
        const res = await NKB.api(`/api/it-management/records/${itEditingTable}/${itEditingId}`, {
            method: 'PUT',
            body: payload
        });

        if (!res.success) {
            alert('Failed to save record changes: ' + (res.error || 'Server error'));
            return;
        }

        NKB.toast('✅ Record updated successfully in database!');
        closeITEditModal();
        await fetchAndRenderITRecords();
    } catch (err) {
        console.error('Error saving IT record:', err);
        alert('Error: ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span>💾 Save Record Changes</span>';
        }
    }
}

async function executeQuickPOReassignment() {
    const poSelect = document.getElementById('it-quick-po-select');
    const clientSelect = document.getElementById('it-quick-client-select');
    const cascadeCheckbox = document.getElementById('it-quick-po-cascade');

    const poId = poSelect ? poSelect.value : null;
    const newClientId = clientSelect ? clientSelect.value : null;
    const cascade = cascadeCheckbox ? cascadeCheckbox.checked : true;

    if (!poId) {
        alert('Please select a Purchase Order to reassign.');
        return;
    }
    if (!newClientId) {
        alert('Please select a target client.');
        return;
    }

    if (!confirm('Are you sure you want to reassign this Purchase Order and its related transactions to the selected client?')) {
        return;
    }

    try {
        const res = await NKB.api('/api/it-management/quick-actions/reassign-po-client', {
            method: 'POST',
            body: { poId, newClientId, cascade }
        });

        if (!res.success) {
            alert('Failed to reassign client: ' + (res.error || 'Unknown error'));
            return;
        }

        NKB.toast(`✅ ${res.message || 'Purchase Order client reassigned successfully!'}`);
        await loadITManagement('purchase_orders');
    } catch (err) {
        console.error('Error reassigning PO client:', err);
        alert('Error: ' + err.message);
    }
}

async function executeQuickStatusOverride() {
    const tableSelect = document.getElementById('it-quick-status-table');
    const idInput = document.getElementById('it-quick-status-id');
    const valSelect = document.getElementById('it-quick-status-val');
    const reasonInput = document.getElementById('it-quick-status-reason');

    const table = tableSelect ? tableSelect.value : null;
    const docId = idInput ? idInput.value.trim() : null;
    const newStatus = valSelect ? valSelect.value : null;
    const reason = reasonInput ? reasonInput.value.trim() : null;

    if (!table || !docId || !newStatus) {
        alert('Please provide table, document ID / number, and new status.');
        return;
    }

    if (!confirm(`Are you sure you want to override status of ${docId} to ${newStatus}?`)) {
        return;
    }

    try {
        const res = await NKB.api('/api/it-management/quick-actions/override-status', {
            method: 'POST',
            body: { table, id: docId, newStatus, reason }
        });

        if (!res.success) {
            alert('Status override failed: ' + (res.error || 'Server error'));
            return;
        }

        NKB.toast(`⚡ Status updated to ${newStatus}!`);
        if (idInput) idInput.value = '';
        if (reasonInput) reasonInput.value = '';
        await fetchAndRenderITRecords();
    } catch (err) {
        console.error('Error overriding status:', err);
        alert('Error: ' + err.message);
    }
}

async function deleteITRecord(table, id) {
    if (!confirm(`Are you sure you want to permanently delete record ${id} from table '${table}'? This action cannot be undone.`)) {
        return;
    }

    try {
        const res = await NKB.api(`/api/it-management/records/${table}/${id}`, {
            method: 'DELETE'
        });

        if (!res.success) {
            alert('Failed to delete record: ' + (res.error || 'Foreign key conflict or server error'));
            return;
        }

        NKB.toast('🗑️ Record deleted successfully.');
        await fetchAndRenderITRecords();
    } catch (err) {
        console.error('Error deleting IT record:', err);
        alert('Error: ' + err.message);
    }
}

// Global exports for inline HTML event handlers
window.loadITManagement = loadITManagement;
window.selectITTable = selectITTable;
window.debounceITSearch = debounceITSearch;
window.changeITPage = changeITPage;
window.openITEditModal = openITEditModal;
window.closeITEditModal = closeITEditModal;
window.submitITRecordEdit = submitITRecordEdit;
window.executeQuickPOReassignment = executeQuickPOReassignment;
window.executeQuickStatusOverride = executeQuickStatusOverride;
window.onITStatusTableChange = onITStatusTableChange;
window.deleteITRecord = deleteITRecord;

// =============================================================
// PRODUCTION SUPERVISOR DASHBOARD & INTERACTIVE SALES ORDER BOARD
// =============================================================
let cachedProductionOrders = [];
let cachedSupervisorReminders = null;
let currentProdBoardFilter = '';
let supervisorReminderTimer = null;
const notifiedEscalatedSOIds = new Set();

function formatReminderDisplay(remStr) {
    if (!remStr) return '';
    const clean = String(remStr).trim().replace('T', ' ');
    return clean.length > 16 ? clean.slice(0, 16) : clean;
}

function getLocalManilaStrings() {
    const now = new Date();
    const manilaOffsetMs = 8 * 60 * 60 * 1000;
    const manilaDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + manilaOffsetMs);
    const yyyy = manilaDate.getFullYear();
    const mm = String(manilaDate.getMonth() + 1).padStart(2, '0');
    const dd = String(manilaDate.getDate()).padStart(2, '0');
    const hh = String(manilaDate.getHours()).padStart(2, '0');
    const min = String(manilaDate.getMinutes()).padStart(2, '0');
    const ss = String(manilaDate.getSeconds()).padStart(2, '0');
    return {
        today: `${yyyy}-${mm}-${dd}`,
        now: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`,
        datetimeLocal: `${yyyy}-${mm}-${dd}T${hh}:${min}`
    };
}

async function loadProductionSupervisorDashboard() {
    try {
        const [kpiRes, ordersRes, remRes] = await Promise.all([
            NKB.api('/api/reports/overview'),
            NKB.api('/api/orders'),
            NKB.api('/api/orders/supervisor-reminders').catch(() => null)
        ]);

        const setElText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        if (ordersRes && ordersRes.success && Array.isArray(ordersRes.data)) {
            cachedProductionOrders = ordersRes.data.filter(o => o.status !== 'CANCELLED' && o.status !== 'VOIDED');
        }
        if (remRes && remRes.success && remRes.data) {
            cachedSupervisorReminders = remRes.data;
            // Notify supervisor via toast if any order was newly auto-prioritized or due today
            const dueList = remRes.data.dueTodayOrTriggered || [];
            for (const item of dueList) {
                if (!notifiedEscalatedSOIds.has(item.id)) {
                    notifiedEscalatedSOIds.add(item.id);
                    const soNum = item.so_number || (item.po_number || '').replace('PO-', 'SO-');
                    const msg = `⏰ Reminder Alert: ${soNum} (${item.company_name}) needs to be done today! Priority: ${item.priority_status || 'RUSH'}.`;
                    if (NKB.showToast) NKB.showToast(msg, 'warning');
                    else if (NKB.toast) NKB.toast(msg);
                }
            }
        }

        const totalPOCount = cachedProductionOrders.length || (kpiRes.data ? kpiRes.data.totalPOs : 0) || 0;
        const openPOCount = cachedProductionOrders.filter(o => o.status !== 'COMPLETED').length;
        const activeTodayCount = cachedProductionOrders.filter(o => Number(o.is_active_today) === 1).length;
        const activeBatchesCount = (kpiRes && kpiRes.data && kpiRes.data.activeBatches != null) ? kpiRes.data.activeBatches : 0;
        const ongoingDeliveriesCount = (kpiRes && kpiRes.data && kpiRes.data.ongoingDeliveries != null) ? kpiRes.data.ongoingDeliveries : 0;

        setElText('prod-kpi-total-pos', NKB.formatNumber(totalPOCount));
        setElText('prod-kpi-open-pos-sub', `${NKB.formatNumber(openPOCount)} active open sales orders →`);
        setElText('prod-kpi-active-batches', NKB.formatNumber(activeBatchesCount));
        setElText('prod-kpi-active-today', NKB.formatNumber(activeTodayCount));
        setElText('prod-kpi-ongoing-deliveries', NKB.formatNumber(ongoingDeliveriesCount));

        renderSupervisorReminderBanner();
        renderProductionSalesOrderBoard();

        if (!supervisorReminderTimer) {
            supervisorReminderTimer = setInterval(() => {
                const dashEl = document.getElementById('production-supervisor-dashboard');
                if (dashEl && !dashEl.classList.contains('hidden')) {
                    loadProductionSupervisorDashboard();
                }
            }, 30000);
        }
    } catch (err) {
        console.error('Error loading Production Supervisor dashboard:', err);
    }
}

function renderSupervisorReminderBanner() {
    const bannerEl = document.getElementById('prod-supervisor-reminder-banner');
    if (!bannerEl) return;

    const { today, now } = getLocalManilaStrings();
    const openOrders = cachedProductionOrders.filter(o => o.status !== 'COMPLETED');
    const rushOrders = openOrders.filter(o => o.priority_status === 'RUSH');
    const prioritizedOrders = openOrders.filter(o => o.priority_status === 'PRIORITIZED');
    const activeTodayOrders = openOrders.filter(o => Number(o.is_active_today) === 1);

    const dueReminders = openOrders.filter(o => {
        if (!o.reminder_at || Number(o.reminder_dismissed) === 1) return false;
        const norm = String(o.reminder_at).replace('T', ' ');
        return norm <= now || norm.startsWith(today) || Number(o.reminder_triggered) === 1;
    });

    const hasMorePrioritizedWork = (rushOrders.length + prioritizedOrders.length) > 1 || (dueReminders.length > 0 && (rushOrders.length + prioritizedOrders.length) > 0);

    if (dueReminders.length === 0 && !hasMorePrioritizedWork) {
        bannerEl.classList.add('hidden');
        bannerEl.innerHTML = '';
        return;
    }

    bannerEl.classList.remove('hidden');

    const dueCardsHtml = dueReminders.map(po => {
        const soNum = po.so_number || po.po_number.replace('PO-', 'SO-');
        const isTriggered = Number(po.reminder_triggered) === 1 || String(po.reminder_at).replace('T', ' ') <= now;
        return `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white/90 p-3 rounded-xl border ${isTriggered ? 'border-rose-300' : 'border-amber-300'} shadow-xs">
                <div class="flex items-start gap-2.5">
                    <span class="text-lg">${isTriggered ? '🚨' : '⏰'}</span>
                    <div>
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="font-black text-slate-900 text-xs">${soNum} (${po.company_name})</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${isTriggered ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}">
                                ${isTriggered ? `AUTO-PRIORITIZED TO ${po.priority_status || 'RUSH'} · NEEDS TO BE DONE TODAY` : `DUE TODAY @ ${formatReminderDisplay(po.reminder_at)}`}
                            </span>
                        </div>
                        <div class="text-[11px] text-slate-600 mt-0.5">
                            ${po.reminder_note ? `<span class="font-bold text-slate-800">Note: "${po.reminder_note}"</span> · ` : ''}
                            Target Auto-Priority: <strong>${po.auto_priority_target || 'RUSH'}</strong>
                            ${(rushOrders.length + prioritizedOrders.length) > 1 ? ` · <span class="text-rose-700 font-bold">⚠️ You have ${(rushOrders.length + prioritizedOrders.length) - 1} other Rush/Prioritized SO(s) in queue!</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 self-end sm:self-center">
                    <button type="button" onclick="openSOReminderModal('${po.id}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold border border-indigo-200 cursor-pointer">✏️ Adjust</button>
                    <button type="button" onclick="updateOrderProductionSchedule('${po.id}', { reminder_dismissed: 1 })" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer">✓ Acknowledge</button>
                </div>
            </div>
        `;
    }).join('');

    bannerEl.innerHTML = `
        <div class="p-4 rounded-2xl ${dueReminders.length > 0 ? 'bg-rose-50/90 border border-rose-200' : 'bg-amber-50/90 border border-amber-200'} space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    <span class="text-base">${dueReminders.length > 0 ? '🔔' : '⚡'}</span>
                    <div>
                        <h4 class="font-black text-xs sm:text-sm ${dueReminders.length > 0 ? 'text-rose-950' : 'text-amber-950'}">
                            ${dueReminders.length > 0
                                ? `Supervisor Reminder Alert: ${dueReminders.length} Sales Order(s) Need To Be Done Today!`
                                : `Supervisor Prioritized Workload Notice: ${rushOrders.length} Rush & ${prioritizedOrders.length} Prioritized Orders Active`}
                        </h4>
                        <p class="text-[11px] ${dueReminders.length > 0 ? 'text-rose-800' : 'text-amber-800'}">
                            ${hasMorePrioritizedWork
                                ? `You currently have <strong>${rushOrders.length} Rush</strong>, <strong>${prioritizedOrders.length} Prioritized</strong>, and <strong>${activeTodayOrders.length} Active Today</strong> Sales Orders competing in the factory floor queue.`
                                : `Scheduled reminder has automatically prioritized this order for today's factory production.`}
                        </p>
                    </div>
                </div>
                <button type="button" onclick="setProdBoardFilter('HAS_REMINDER')" class="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-[11px] font-extrabold shadow-2xs self-start sm:self-center cursor-pointer">
                    ⏰ View All Reminders
                </button>
            </div>
            ${dueCardsHtml ? `<div class="space-y-2">${dueCardsHtml}</div>` : ''}
        </div>
    `;
}

function setProdBoardFilter(filterVal) {
    currentProdBoardFilter = filterVal || '';
    const selectEl = document.getElementById('prod-so-filter-priority');
    if (selectEl) selectEl.value = currentProdBoardFilter;

    document.querySelectorAll('.prod-board-pill').forEach(pill => {
        if (pill.getAttribute('data-filter') === currentProdBoardFilter) {
            pill.className = 'prod-board-pill px-3 py-1.5 rounded-xl font-bold bg-slate-900 text-white transition';
        } else {
            pill.className = 'prod-board-pill px-3 py-1.5 rounded-xl font-semibold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition';
        }
    });

    renderProductionSalesOrderBoard();
}

function renderProductionSalesOrderBoard() {
    const tbody = document.getElementById('table-prod-supervisor-so-body');
    if (!tbody) return;

    const searchInput = document.getElementById('prod-so-search');
    const selectFilter = document.getElementById('prod-so-filter-priority');
    const searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const filterVal = selectFilter ? selectFilter.value : currentProdBoardFilter;
    const { today, now } = getLocalManilaStrings();

    const priorityRankWeight = {
        'RUSH': 1,
        'PRIORITIZED': 2,
        'NORMAL': 3,
        'ON_HOLD': 4
    };

    let list = [...cachedProductionOrders];

    if (filterVal === 'ACTIVE_TODAY') {
        list = list.filter(o => Number(o.is_active_today) === 1);
    } else if (filterVal === 'HAS_REMINDER') {
        list = list.filter(o => o.reminder_at && String(o.reminder_at).trim() !== '');
    } else if (filterVal) {
        list = list.filter(o => (o.priority_status || 'NORMAL') === filterVal);
    }

    if (searchTerm) {
        list = list.filter(o => {
            const soStr = (o.so_number || o.po_number || '').toLowerCase();
            const poStr = (o.po_number || '').toLowerCase();
            const clientStr = (o.company_name || '').toLowerCase();
            const itemsStr = (o.items || []).map(i => (i.product_name || '')).join(' ').toLowerCase();
            const remStr = (o.reminder_note || '').toLowerCase();
            return soStr.includes(searchTerm) || poStr.includes(searchTerm) || clientStr.includes(searchTerm) || itemsStr.includes(searchTerm) || remStr.includes(searchTerm);
        });
    }

    // Sort: Active Today first -> Priority Status weight (RUSH > PRIORITIZED > NORMAL > ON_HOLD) -> priority_order ASC -> created_at DESC
    list.sort((a, b) => {
        const actA = Number(a.is_active_today) ? 0 : 1;
        const actB = Number(b.is_active_today) ? 0 : 1;
        if (actA !== actB) return actA - actB;

        const pA = priorityRankWeight[a.priority_status || 'NORMAL'] || 3;
        const pB = priorityRankWeight[b.priority_status || 'NORMAL'] || 3;
        if (pA !== pB) return pA - pB;

        const ordA = a.priority_order != null ? Number(a.priority_order) : 100;
        const ordB = b.priority_order != null ? Number(b.priority_order) : 100;
        if (ordA !== ordB) return ordA - ordB;

        return String(b.po_number || '').localeCompare(String(a.po_number || ''));
    });

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">No matching Sales Orders found in queue.</td></tr>`;
        return;
    }

    const totalHighPrioInQueue = list.filter(o => o.priority_status === 'RUSH' || o.priority_status === 'PRIORITIZED' || Number(o.is_active_today) === 1).length;

    const prioritySelectStyleMap = {
        'RUSH': 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold',
        'PRIORITIZED': 'bg-amber-100 text-amber-800 border-amber-300 font-extrabold',
        'NORMAL': 'bg-slate-100 text-slate-700 border-slate-300 font-bold',
        'ON_HOLD': 'bg-slate-200 text-slate-600 border-slate-300 font-extrabold'
    };

    tbody.innerHTML = list.map((po, idx) => {
        const soNum = po.so_number || po.po_number.replace('PO-', 'SO-');
        const pStatus = po.priority_status || 'NORMAL';
        const isActiveToday = Number(po.is_active_today) === 1;
        const totalQty = po.total_target_quantity || (po.items || []).reduce((s, i) => s + (Number(i.target_quantity) || 0), 0);
        const totalDelivered = (po.items || []).reduce((s, i) => s + Number(i.delivered_quantity != null ? i.delivered_quantity : (i.total_delivered || 0)), 0);

        const itemsHtml = (po.items && po.items.length > 0)
            ? po.items.map(it => {
                const target = Number(it.target_quantity) || 0;
                const del = Number(it.delivered_quantity != null ? it.delivered_quantity : (it.total_delivered || 0));
                const isFullDel = del >= target && target > 0;
                return `
                    <div class="flex items-center justify-between text-[11px] gap-2 py-0.5 border-b border-slate-100/80 last:border-b-0">
                        <span class="font-bold text-slate-800 truncate text-[11px]" title="${it.product_name}">${it.product_name}</span>
                        <div class="flex items-center gap-1 shrink-0">
                            <span class="px-1.5 py-0.2 rounded font-mono text-[9.5px] font-bold ${isFullDel ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : (del > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600')}">
                                🚚 ${NKB.formatNumber(del)} / ${NKB.formatNumber(target)} pcs
                            </span>
                        </div>
                    </div>
                `;
            }).join('')
            : '<span class="text-slate-400 italic text-[11px]">No items recorded</span>';

        // Reminder & Automatic Prioritizing cell HTML
        const hasReminder = !!(po.reminder_at && String(po.reminder_at).trim() !== '');
        const normRem = hasReminder ? String(po.reminder_at).replace('T', ' ') : '';
        const isRemTriggered = hasReminder && (Number(po.reminder_triggered) === 1 || normRem <= now);
        const isRemToday = hasReminder && normRem.startsWith(today);
        const autoTarget = po.auto_priority_target || 'RUSH';
        const higherPrioAheadCount = list.slice(0, idx).filter(o => o.priority_status === 'RUSH' || o.priority_status === 'PRIORITIZED' || Number(o.is_active_today) === 1).length;

        let reminderCellHtml = '';
        if (hasReminder) {
            const badgeStyle = isRemTriggered
                ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                : (isRemToday ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-indigo-50 text-indigo-700 border-indigo-200');
            const badgeText = isRemTriggered
                ? `🔔 DUE TODAY · AUTO-${autoTarget}`
                : (isRemToday ? `⏰ TODAY ${formatReminderDisplay(po.reminder_at).slice(11)} → ${autoTarget}` : `⏰ ${formatReminderDisplay(po.reminder_at)} → ${autoTarget}`);

            reminderCellHtml = `
                <div class="flex flex-col items-center gap-0.5 mt-1">
                    <span class="px-2 py-0.5 rounded-full border font-extrabold text-[9.5px] inline-flex items-center gap-1 ${badgeStyle}">
                        ${badgeText}
                    </span>
                    ${po.reminder_note ? `<div class="text-[9.5px] text-slate-600 italic truncate max-w-[170px]" title="${po.reminder_note}">"${po.reminder_note}"</div>` : ''}
                    <div class="flex items-center gap-1 mt-0.5">
                        <button type="button" onclick="openSOReminderModal('${po.id}')" class="px-1.5 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[9.5px] font-bold cursor-pointer">✏️ Edit</button>
                        <button type="button" onclick="clearSOReminder('${po.id}')" class="px-1 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[9.5px] font-bold cursor-pointer" title="Clear Reminder">✕</button>
                    </div>
                </div>
            `;
        } else {
            reminderCellHtml = `
                <div class="flex items-center justify-center gap-1 mt-1">
                    <button type="button" onclick="openSOReminderModal('${po.id}')" class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition inline-flex items-center gap-1 cursor-pointer">
                        <span>⏰ + Reminder</span>
                    </button>
                </div>
            `;
        }

        return `
            <tr class="${isActiveToday ? 'bg-emerald-50/40' : (pStatus === 'RUSH' ? 'bg-rose-50/25' : 'hover:bg-slate-50/80')} transition border-b border-slate-100">
                <!-- Col 1: Queue Rank & Order Details -->
                <td class="py-2.5 px-3 w-32 sm:w-36 align-top">
                    <div class="flex flex-col gap-1.5">
                        <div class="flex items-center gap-1">
                            <span class="w-6 h-6 rounded-full ${idx === 0 ? 'bg-indigo-600 text-white font-black' : 'bg-slate-200 text-slate-700 font-bold'} flex items-center justify-center text-[11px] shrink-0">#${idx + 1}</span>
                            <button onclick="updateOrderProductionSchedule('${po.id}', { move_direction: 'FIRST' })" title="Move to Top (#1 in Queue)" class="text-[9.5px] px-1 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-bold border border-indigo-200 cursor-pointer">⏫</button>
                            <button onclick="updateOrderProductionSchedule('${po.id}', { move_direction: 'UP' })" title="Move Up in Queue" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold cursor-pointer">↑</button>
                            <button onclick="updateOrderProductionSchedule('${po.id}', { move_direction: 'DOWN' })" title="Move Down in Queue" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold cursor-pointer">↓</button>
                        </div>
                        <div>
                            <button onclick="openViewPOModal('${po.id}')" class="font-black text-indigo-600 hover:underline text-xs cursor-pointer block leading-tight text-left">${soNum}</button>
                            <div class="text-[9.5px] text-slate-400 font-mono mt-0.5">${po.po_number} · ${po.po_date ? po.po_date.slice(5) : ''}</div>
                        </div>
                    </div>
                </td>

                <!-- Col 2: Client & Ordered Products with Progress -->
                <td class="py-2.5 px-3 min-w-[200px] align-top">
                    <div class="space-y-1">
                        <div class="flex items-center justify-between gap-1">
                            <span class="font-black text-slate-900 text-xs truncate max-w-[200px] sm:max-w-xs" title="${po.company_name}">${po.company_name}</span>
                            <span class="text-[10px] font-extrabold text-slate-600 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">Total: ${NKB.formatNumber(totalQty)} pcs</span>
                        </div>
                        <div class="bg-slate-50/80 rounded-xl p-1.5 border border-slate-200/70 max-h-24 overflow-y-auto">
                            ${itemsHtml}
                        </div>
                    </div>
                </td>

                <!-- Col 3: Stage & Priority & Reminder -->
                <td class="py-2.5 px-3 w-48 text-center align-top">
                    <div class="flex flex-col items-center gap-1">
                        <div class="flex items-center gap-1.5">
                            <span class="px-2 py-0.5 rounded-lg text-[9.5px] font-bold ${po.status === 'PARTIALLY_DELIVERED' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}">${po.status}</span>
                            <span class="text-[9.5px] text-slate-500 font-medium">${po.jo_count || 0} JOs · ${po.dr_count || 0} DRs</span>
                        </div>
                        <select onchange="updateOrderProductionSchedule('${po.id}', { priority_status: this.value })" class="w-full text-[10.5px] px-2 py-1 border rounded-lg cursor-pointer transition ${prioritySelectStyleMap[pStatus] || prioritySelectStyleMap['NORMAL']}">
                            <option value="RUSH" ${pStatus === 'RUSH' ? 'selected' : ''}>🔥 Rush</option>
                            <option value="PRIORITIZED" ${pStatus === 'PRIORITIZED' ? 'selected' : ''}>⚡ Prioritized</option>
                            <option value="NORMAL" ${pStatus === 'NORMAL' ? 'selected' : ''}>📋 Normal</option>
                            <option value="ON_HOLD" ${pStatus === 'ON_HOLD' ? 'selected' : ''}>⏸️ On Hold</option>
                        </select>
                        <div class="w-full">
                            ${reminderCellHtml}
                        </div>
                    </div>
                </td>

                <!-- Col 4: Factory Today Floor Assignment -->
                <td class="py-2.5 px-2 w-32 text-center align-middle">
                    <button onclick="updateOrderProductionSchedule('${po.id}', { is_active_today: ${isActiveToday ? 0 : 1} })"
                        class="w-full py-1.5 px-2 rounded-xl text-[10.5px] font-black transition shadow-2xs cursor-pointer ${isActiveToday ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-300'}">
                        ${isActiveToday ? '🏭 ACTIVE ✓' : 'Set Active'}
                    </button>
                </td>

                <!-- Col 5: Actions -->
                <td class="py-2.5 px-3 w-28 text-right align-middle">
                    <div class="flex flex-col gap-1 items-end">
                        <button onclick="openViewPOModal('${po.id}')" class="w-full px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[10.5px] transition cursor-pointer text-center">👁️ View</button>
                        ${(po.status !== 'COMPLETED' && po.status !== 'CANCELLED' && po.status !== 'VOIDED' && po.status !== 'DRAFT') ? `
                            <button onclick="openCreateAllDRModal('${po.client_id}', '${po.id}', '${po.company_name.replace(/'/g, "\\'")}')" class="w-full px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10.5px] transition shadow-xs cursor-pointer text-center">🚚 Deliver</button>
                            <button onclick="promptDeclareOrderFinished('${po.id}', '${po.po_number}')" class="w-full px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold text-[9.5px] transition cursor-pointer text-center" title="Declare Order Finished">✓ Finish</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function promptDeclareOrderFinished(poId, poNumber) {
    if (!confirm(`Declare Sales Order (${poNumber}) as fully finished and completed?\n\nDelivering will only complete if all products needed have been fully produced and delivered.`)) {
        return;
    }
    const res = await NKB.api(`/api/orders/${poId}/declare-finished`, {
        method: 'POST',
        body: JSON.stringify({})
    });
    if (res.success) {
        NKB.showToast(res.message || `Order ${poNumber} declared finished!`, 'success');
        if (typeof loadProductionSupervisorDashboard === 'function') loadProductionSupervisorDashboard();
        if (typeof loadOrders === 'function') loadOrders();
    } else {
        if (res.can_force) {
            if (confirm(`${res.error}\n\nDo you want to override and declare the order completed anyway?`)) {
                const forceRes = await NKB.api(`/api/orders/${poId}/declare-finished`, {
                    method: 'POST',
                    body: JSON.stringify({ force: true, notes: 'Supervisor approved completion override' })
                });
                if (forceRes.success) {
                    NKB.showToast(`Order ${poNumber} declared finished (override)!`, 'success');
                    if (typeof loadProductionSupervisorDashboard === 'function') loadProductionSupervisorDashboard();
                    if (typeof loadOrders === 'function') loadOrders();
                    return;
                } else {
                    NKB.showToast(forceRes.error || 'Failed to complete order.', 'error');
                }
            }
        } else {
            alert(res.error || 'Cannot declare order as finished.');
        }
    }
}
window.promptDeclareOrderFinished = promptDeclareOrderFinished;

function openSOReminderModal(poId) {
    const po = cachedProductionOrders.find(o => o.id === poId);
    if (!po) return;

    const existingModal = document.getElementById('modal-so-reminder');
    if (existingModal) existingModal.remove();

    const soNum = po.so_number || po.po_number.replace('PO-', 'SO-');
    const { datetimeLocal } = getLocalManilaStrings();
    const initialDateTime = po.reminder_at
        ? String(po.reminder_at).trim().replace(' ', 'T').slice(0, 16)
        : datetimeLocal;
    const initialTarget = po.auto_priority_target || 'RUSH';
    const initialActiveToday = po.auto_active_today !== undefined && po.auto_active_today !== null ? Number(po.auto_active_today) === 1 : true;
    const initialNote = po.reminder_note || '';

    const rushCount = cachedProductionOrders.filter(o => o.status !== 'COMPLETED' && o.priority_status === 'RUSH').length;
    const prioCount = cachedProductionOrders.filter(o => o.status !== 'COMPLETED' && o.priority_status === 'PRIORITIZED').length;

    const modalHtml = `
        <div id="modal-so-reminder" class="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">⏰</span>
                        <div>
                            <h3 class="font-black text-sm">Set Reminder & Automatic Prioritizing</h3>
                            <p class="text-[11px] text-slate-300 font-mono">${soNum} · ${po.company_name}</p>
                        </div>
                    </div>
                    <button type="button" onclick="document.getElementById('modal-so-reminder').remove()" class="text-slate-400 hover:text-white cursor-pointer">✕</button>
                </div>

                <form onsubmit="submitSOReminderForm(event, '${po.id}')" class="p-6 space-y-4 text-xs">
                    ${(rushCount + prioCount) > 0 ? `
                        <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                            <span class="text-base">⚡</span>
                            <div>
                                <strong>Supervisor Queue Workload Notice:</strong> You currently have <strong>${rushCount} Rush</strong> and <strong>${prioCount} Prioritized</strong> Sales Order(s) in the queue. Setting this reminder will notify you when ${soNum} needs to be done and automatically escalate its priority at the scheduled time.
                            </div>
                        </div>
                    ` : ''}

                    <div>
                        <label class="block font-extrabold text-slate-700 mb-1.5">Quick Schedule Presets</label>
                        <div class="flex flex-wrap gap-1.5">
                            <button type="button" onclick="applySOReminderPreset('NOW')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-[11px] cursor-pointer">🔥 Due Right Now (Today)</button>
                            <button type="button" onclick="applySOReminderPreset('30M')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold text-[11px] cursor-pointer">+30 Mins</button>
                            <button type="button" onclick="applySOReminderPreset('1H')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold text-[11px] cursor-pointer">+1 Hour</button>
                            <button type="button" onclick="applySOReminderPreset('TODAY_13')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-[11px] cursor-pointer">Today 1:00 PM</button>
                            <button type="button" onclick="applySOReminderPreset('TODAY_16')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-[11px] cursor-pointer">Today 4:00 PM</button>
                            <button type="button" onclick="applySOReminderPreset('TOMORROW_08')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-[11px] cursor-pointer">Tomorrow 8:00 AM</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block font-extrabold text-slate-700 mb-1">Reminder Date & Time *</label>
                            <input type="datetime-local" id="so-rem-datetime" required value="${initialDateTime}" class="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-xs bg-slate-50 focus:bg-white">
                        </div>
                        <div>
                            <label class="block font-extrabold text-slate-700 mb-1">Auto-Prioritize To *</label>
                            <select id="so-rem-target" class="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-800 bg-slate-50 focus:bg-white">
                                <option value="RUSH" ${initialTarget === 'RUSH' ? 'selected' : ''}>🔥 Escalate to RUSH (#1 Priority)</option>
                                <option value="PRIORITIZED" ${initialTarget === 'PRIORITIZED' ? 'selected' : ''}>⚡ Escalate to PRIORITIZED</option>
                            </select>
                        </div>
                    </div>

                    <div class="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                        <label class="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" id="so-rem-active-today" ${initialActiveToday ? 'checked' : ''} class="w-4 h-4 accent-emerald-600 rounded">
                            <span class="font-bold text-emerald-950 text-xs">🏭 Automatically mark as "Needs to be done that day" (Active Today in Factory)</span>
                        </label>
                    </div>

                    <div>
                        <label class="block font-extrabold text-slate-700 mb-1">Supervisor Reminder Note (Optional)</label>
                        <input type="text" id="so-rem-note" value="${initialNote.replace(/"/g, '&quot;')}" placeholder="e.g. Must finish compounding today before 4 PM client dispatch" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs">
                    </div>

                    <div class="flex items-center justify-between pt-3 border-t border-slate-200">
                        ${po.reminder_at ? `
                            <button type="button" onclick="clearSOReminder('${po.id}')" class="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl font-bold cursor-pointer">🗑️ Remove Reminder</button>
                        ` : '<div></div>'}
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="document.getElementById('modal-so-reminder').remove()" class="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 cursor-pointer">Cancel</button>
                            <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold shadow-md cursor-pointer">⏰ Save Reminder</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function applySOReminderPreset(preset) {
    const input = document.getElementById('so-rem-datetime');
    if (!input) return;

    const now = new Date();
    const manilaOffsetMs = 8 * 60 * 60 * 1000;
    const manilaNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + manilaOffsetMs);

    let target = new Date(manilaNow.getTime());
    if (preset === '30M') {
        target = new Date(manilaNow.getTime() + 30 * 60000);
    } else if (preset === '1H') {
        target = new Date(manilaNow.getTime() + 60 * 60000);
    } else if (preset === 'TODAY_13') {
        target.setHours(13, 0, 0, 0);
    } else if (preset === 'TODAY_16') {
        target.setHours(16, 0, 0, 0);
    } else if (preset === 'TOMORROW_08') {
        target.setDate(target.getDate() + 1);
        target.setHours(8, 0, 0, 0);
    }

    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const hh = String(target.getHours()).padStart(2, '0');
    const min = String(target.getMinutes()).padStart(2, '0');
    input.value = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

async function submitSOReminderForm(e, poId) {
    e.preventDefault();
    const reminder_at = document.getElementById('so-rem-datetime').value;
    const auto_priority_target = document.getElementById('so-rem-target').value;
    const auto_active_today = document.getElementById('so-rem-active-today').checked ? 1 : 0;
    const reminder_note = document.getElementById('so-rem-note').value.trim();

    const modal = document.getElementById('modal-so-reminder');
    if (modal) modal.remove();

    await updateOrderProductionSchedule(poId, {
        reminder_at,
        auto_priority_target,
        auto_active_today,
        reminder_note
    });
}

async function clearSOReminder(poId) {
    const modal = document.getElementById('modal-so-reminder');
    if (modal) modal.remove();
    await updateOrderProductionSchedule(poId, {
        clear_reminder: true
    });
}

async function updateOrderProductionSchedule(poId, payload) {
    try {
        const res = await NKB.api(`/api/orders/${poId}/production-priority`, {
            method: 'PUT',
            body: payload
        });
        if (res && res.success) {
            if (NKB.showToast) NKB.showToast(res.message || 'Sales Order priority & reminder updated!', 'success');
            await loadProductionSupervisorDashboard();
            if (window.NKB_Agents && typeof window.NKB_Agents.refresh === 'function') {
                window.NKB_Agents.refresh();
            }
        } else {
            alert((res && res.error) || 'Failed to update production schedule.');
        }
    } catch (err) {
        console.error('Error updating production priority:', err);
    }
}

window.loadProductionSupervisorDashboard = loadProductionSupervisorDashboard;
window.setProdBoardFilter = setProdBoardFilter;
window.renderProductionSalesOrderBoard = renderProductionSalesOrderBoard;
window.updateOrderProductionSchedule = updateOrderProductionSchedule;
window.openSOReminderModal = openSOReminderModal;
window.applySOReminderPreset = applySOReminderPreset;
window.submitSOReminderForm = submitSOReminderForm;
window.clearSOReminder = clearSOReminder;

// =============================================================
// WAREHOUSE INVENTORY (RAW MATERIALS) MODULE
// =============================================================
let cachedRawMaterials = [];
let currentRawMaterialStatusFilter = '';
let currentRawMaterialSupplierFilter = '';
let selectedRawMaterialId = null;
let selectedRawMaterialIndex = 0;

function isInventoryOfficerAccount() {
    return Boolean(typeof NKB !== 'undefined' && NKB.user && NKB.user.role === 'INVENTORY');
}

function updateInventoryShortcutsBarVisibility() {
    const bar = document.getElementById('rm-inventory-shortcuts-bar');
    if (!bar) return;
    if (isInventoryOfficerAccount()) {
        bar.classList.remove('hidden');
    } else {
        bar.classList.add('hidden');
    }
    updateSelectedRawMaterialBanner();
}

function updateSelectedRawMaterialBanner() {
    const label = document.getElementById('rm-selected-material-label');
    const fastBtnLabel = document.getElementById('rm-shortcut-fast-label');
    if (!label) return;
    const rm = cachedRawMaterials[selectedRawMaterialIndex] || cachedRawMaterials.find(r => r.id === selectedRawMaterialId);
    if (!rm) {
        label.textContent = 'Use ↑ / ↓ arrows or click a row to select';
        if (fastBtnLabel) fastBtnLabel.textContent = '🔥 Tag Fast Moving';
        return;
    }
    const isFast = Number(rm.is_fast_moving) === 1;
    const fastTag = isFast ? ' 🔥 Fast Moving' : '';
    label.textContent = `[${rm.material_code}] ${rm.material_name} — ${NKB.formatNumber(rm.current_stock)} ${rm.unit}${fastTag}`;
    if (fastBtnLabel) {
        fastBtnLabel.textContent = isFast ? '🔥 Untag Fast Moving' : '🔥 Tag Fast Moving';
    }
}

function toggleInventoryShortcutSuggestions() {
    const panel = document.getElementById('rm-shortcut-suggestions-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
}

function cycleRawMaterialSortMode() {
    const sortSelect = document.getElementById('rm-sort-select');
    if (!sortSelect) return;
    const modes = ['PRIORITIZED', 'MOST_CRITICAL', 'ALPHABETICAL_ASC', 'STOCK_LOW'];
    const currentIdx = modes.indexOf(sortSelect.value);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    sortSelect.value = nextMode;
    const selectedOpt = sortSelect.options[sortSelect.selectedIndex];
    if (NKB.showToast && selectedOpt) {
        NKB.showToast(`Sorted by: ${selectedOpt.textContent}`, 'info');
    }
    loadRawMaterials();
}

function filterRawMaterialsBySupplier(supplierName) {
    currentRawMaterialSupplierFilter = supplierName ? String(supplierName).trim() : '';
    const supSelect = document.getElementById('rm-filter-supplier');
    if (supSelect) {
        if (currentRawMaterialSupplierFilter && !Array.from(supSelect.options).some(o => o.value === currentRawMaterialSupplierFilter)) {
            const opt = document.createElement('option');
            opt.value = currentRawMaterialSupplierFilter;
            opt.textContent = currentRawMaterialSupplierFilter;
            supSelect.appendChild(opt);
        }
        supSelect.value = currentRawMaterialSupplierFilter;
    }
    loadRawMaterials();
}

async function loadRawMaterials() {
    try {
        updateInventoryShortcutsBarVisibility();

        const catSelect = document.getElementById('rm-filter-category');
        const supSelect = document.getElementById('rm-filter-supplier');
        const sortSelect = document.getElementById('rm-sort-select');
        const searchInput = document.getElementById('rm-search-input');
        const category = catSelect ? catSelect.value : '';
        const supplier = supSelect ? supSelect.value : currentRawMaterialSupplierFilter;
        currentRawMaterialSupplierFilter = supplier || '';
        const sort = sortSelect ? sortSelect.value : 'PRIORITIZED';
        const search = searchInput ? searchInput.value.trim() : '';

        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (currentRawMaterialSupplierFilter) params.set('supplier', currentRawMaterialSupplierFilter);
        if (currentRawMaterialStatusFilter) params.set('status', currentRawMaterialStatusFilter);
        if (sort) params.set('sort', sort);
        if (search) params.set('search', search);

        const res = await NKB.api(`/api/raw-materials?${params.toString()}`);
        if (!res || !res.success) return;

        cachedRawMaterials = res.data || [];
        const s = res.summary || {};

        if (supSelect && Array.isArray(s.suppliers)) {
            const prevVal = currentRawMaterialSupplierFilter;
            supSelect.innerHTML = `<option value="">All Suppliers</option>` +
                s.suppliers.map(sup => `<option value="${sup.replace(/"/g, '&quot;')}" ${sup === prevVal ? 'selected' : ''}>${sup}</option>`).join('');
            supSelect.value = prevVal;
        }

        const supChip = document.getElementById('rm-active-supplier-chip');
        const supLabel = document.getElementById('rm-active-supplier-label');
        if (supChip) {
            if (currentRawMaterialSupplierFilter) {
                supChip.classList.remove('hidden');
                if (supLabel) supLabel.textContent = currentRawMaterialSupplierFilter;
            } else {
                supChip.classList.add('hidden');
            }
        }

        if (cachedRawMaterials.length > 0) {
            const existingIdx = selectedRawMaterialId
                ? cachedRawMaterials.findIndex(r => r.id === selectedRawMaterialId)
                : -1;
            if (existingIdx >= 0) {
                selectedRawMaterialIndex = existingIdx;
            } else {
                selectedRawMaterialIndex = Math.min(selectedRawMaterialIndex, cachedRawMaterials.length - 1);
                if (selectedRawMaterialIndex < 0) selectedRawMaterialIndex = 0;
                selectedRawMaterialId = cachedRawMaterials[selectedRawMaterialIndex].id;
            }
        } else {
            selectedRawMaterialIndex = -1;
            selectedRawMaterialId = null;
        }

        const setElText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setElText('rm-kpi-total', NKB.formatNumber(s.totalMaterials || cachedRawMaterials.length));
        setElText('rm-kpi-fastmoving', NKB.formatNumber(s.fastMovingCount || cachedRawMaterials.filter(i => Number(i.is_fast_moving) === 1).length));
        setElText('rm-kpi-instock', NKB.formatNumber(s.inStockCount || 0));
        setElText('rm-kpi-lowstock', NKB.formatNumber(s.lowStockCount || 0));
        setElText('rm-kpi-outofstock', NKB.formatNumber(s.outOfStockCount || 0));

        renderRawMaterialsTable();
        updateSelectedRawMaterialBanner();
    } catch (err) {
        console.error('Error loading raw materials:', err);
    }
}

function setRawMaterialStatusFilter(status) {
    currentRawMaterialStatusFilter = status || '';
    document.querySelectorAll('.rm-status-pill').forEach(pill => {
        if (pill.getAttribute('data-status') === currentRawMaterialStatusFilter) {
            pill.className = 'rm-status-pill px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white transition flex items-center gap-1.5';
        } else {
            pill.className = 'rm-status-pill px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition flex items-center gap-1.5';
        }
    });
    loadRawMaterials();
}

function selectRawMaterialRow(index, scrollIntoView = false) {
    if (!cachedRawMaterials || cachedRawMaterials.length === 0) return;
    const boundedIdx = Math.max(0, Math.min(index, cachedRawMaterials.length - 1));
    selectedRawMaterialIndex = boundedIdx;
    selectedRawMaterialId = cachedRawMaterials[boundedIdx].id;

    renderRawMaterialsTable();

    if (scrollIntoView) {
        const selectedTr = document.querySelector(`#table-raw-materials-body tr[data-rm-index="${selectedRawMaterialIndex}"]`);
        if (selectedTr && typeof selectedTr.scrollIntoView === 'function') {
            selectedTr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    updateSelectedRawMaterialBanner();
}

function getRawMaterialFefoInfo(expiryDateStr) {
    if (!expiryDateStr || expiryDateStr === 'None') return null;
    const exp = new Date(expiryDateStr);
    if (isNaN(exp.getTime())) return null;
    const now = new Date();
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
        return { isExpiring: true, isExpired: true, daysLeft: diffDays, label: `⚠️ EXPIRED LOT (${Math.abs(diffDays)}d ago)` };
    }
    if (diffDays <= 60) {
        return { isExpiring: true, isExpired: false, daysLeft: diffDays, label: `⏳ FEFO: Expiring in ${diffDays}d` };
    }
    return null;
}

function renderRawMaterialsTable() {
    const tbody = document.getElementById('table-raw-materials-body');
    if (!tbody) return;

    if (!cachedRawMaterials || cachedRawMaterials.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400">No raw materials matching filter criteria.</td></tr>`;
        return;
    }

    // Color-coded indicator only (no text status label), with optional FEFO purple ring when expiring within 60 days
    const getRowColorClasses = (st, fefoInfo) => {
        const fefoRing = fefoInfo
            ? ', 0 0 0 6px #9333ea'
            : '';
        const fefoTitleSuffix = fefoInfo ? ` · ${fefoInfo.label}` : '';
        if (st === 'OUT_OF_STOCK') {
            return {
                rowStyle: 'border-left: 4px solid #e11d48; background-color: rgba(255, 228, 230, 0.45);',
                dot: `<span class="rounded-full inline-block" style="width: 14px; height: 14px; background-color: #e11d48; box-shadow: 0 0 0 3px #ffe4e6${fefoRing};" title="Red Zone (Depleted)${fefoTitleSuffix}"></span>`,
                stockText: 'text-rose-600'
            };
        }
        if (st === 'LOW_STOCK') {
            return {
                rowStyle: 'border-left: 4px solid #f59e0b; background-color: rgba(254, 243, 199, 0.45);',
                dot: `<span class="rounded-full inline-block" style="width: 14px; height: 14px; background-color: #f59e0b; box-shadow: 0 0 0 3px #fef3c7${fefoRing};" title="Amber Zone (Below Minimum)${fefoTitleSuffix}"></span>`,
                stockText: 'text-amber-600'
            };
        }
        return {
            rowStyle: 'border-left: 4px solid #10b981; background-color: rgba(209, 250, 229, 0.22);',
            dot: `<span class="rounded-full inline-block" style="width: 14px; height: 14px; background-color: #10b981; box-shadow: 0 0 0 3px #d1fae5${fefoRing};" title="Green Zone (Sufficient)${fefoTitleSuffix}"></span>`,
            stockText: 'text-emerald-700'
        };
    };

    const isInvOfficer = isInventoryOfficerAccount();

    tbody.innerHTML = cachedRawMaterials.map((rm, idx) => {
        const fefoInfo = getRawMaterialFefoInfo(rm.expiry_date);
        const colorCfg = getRowColorClasses(rm.status, fefoInfo);
        const isSelected = idx === selectedRawMaterialIndex;
        const isFastMoving = Number(rm.is_fast_moving) === 1;
        const issuanceCount = Number(rm.issuance_count || 0);
        const suggestFastMoving = !isFastMoving && issuanceCount >= 3;
        const supplierName = rm.supplier ? String(rm.supplier).trim() : 'None';
        const escapedSupplier = supplierName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const isSupplierActive = currentRawMaterialSupplierFilter && currentRawMaterialSupplierFilter === supplierName;
        const selectedStyle = isSelected
            ? 'outline: 2px solid #0d9488; outline-offset: -2px; background-color: rgba(204, 251, 241, 0.65);'
            : '';

        return `
        <tr data-rm-index="${idx}" data-rm-id="${rm.id}" onclick="selectRawMaterialRow(${idx}, false)"
            class="transition cursor-pointer hover:bg-slate-50" style="${colorCfg.rowStyle} ${selectedStyle}">
            <td class="py-3 px-2 text-center align-middle">
                ${colorCfg.dot}
            </td>
            <td class="py-3 px-3 font-mono font-bold text-teal-800">
                <div>${rm.material_code || 'None'}</div>
                ${isSelected ? '<span class="text-[9px] font-black uppercase text-teal-700 tracking-wider">▶ Selected</span>' : ''}
            </td>
            <td class="py-3 px-3">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-slate-900">${rm.material_name || 'None'}</span>
                    ${isFastMoving ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black" style="background-color: #ffedd5; color: #9a3412; border: 1px solid #fdba74;">🔥 FAST MOVING</span>' : ''}
                    ${suggestFastMoving ? `<button type="button" onclick="event.stopPropagation(); toggleRawMaterialFastMoving('${rm.id}')" class="px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer" style="background-color: #f0fdf4; color: #166534; border: 1px dashed #4ade80;" title="Issued ${issuanceCount} times — Click to tag as Fast Moving">📈 Suggested Fast Moving (${issuanceCount}x)</button>` : ''}
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5">${rm.category || 'None'}</div>
            </td>
            <td class="py-3 px-3">
                <button type="button" onclick="event.stopPropagation(); filterRawMaterialsBySupplier('${escapedSupplier}')"
                    class="font-semibold text-left transition cursor-pointer inline-flex items-center gap-1 rounded px-1.5 py-0.5 -ml-1.5"
                    style="${isSupplierActive ? 'background-color: #ccfbf1; color: #115e59; border: 1px solid #5eead4;' : 'color: #0f766e; text-decoration: underline; text-decoration-style: dotted;'}"
                    title="Click to filter all raw materials from ${supplierName}">
                    <span>🏭 ${supplierName}</span>
                </button>
                <div class="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span>Brand/Lot: ${rm.batch_lot_number || 'None'}${rm.expiry_date && rm.expiry_date !== 'None' ? ` · Exp: ${rm.expiry_date}` : ''}</span>
                    ${fefoInfo ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-black" style="${fefoInfo.isExpired ? 'background-color: #ffe4e6; color: #9f1239; border: 1px solid #fda4af;' : 'background-color: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe;'}">${fefoInfo.label}</span>` : ''}
                </div>
            </td>
            <td class="py-3 px-3 text-slate-600 font-semibold">${rm.location || 'None'}</td>
            <td class="py-3 px-3 text-right font-black text-sm ${colorCfg.stockText}">
                ${NKB.formatNumber(rm.current_stock || 0)} <span class="text-xs font-bold text-slate-500">${rm.unit || 'kg'}</span>
            </td>
            <td class="py-3 px-3 text-right text-slate-500 font-semibold">
                ${NKB.formatNumber(rm.minimum_stock_level || 0)} ${rm.unit || 'kg'}
            </td>
            <td class="py-3 px-3 text-right whitespace-nowrap space-x-1" onclick="event.stopPropagation()">
                <button onclick="toggleRawMaterialFastMoving('${rm.id}')"
                    class="px-2 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer"
                    style="${isFastMoving ? 'background-color: #ea580c; color: #ffffff; border: 1px solid #c2410c;' : 'background-color: #ffffff; color: #475569; border: 1px solid #cbd5e1;'}"
                    title="${isFastMoving ? 'Remove Fast Moving Tag' : 'Tag as Fast Moving (Frequently Used)'}${isInvOfficer ? ' [Shortcut: F or T]' : ''}">
                    🔥 ${isFastMoving ? 'Fast' : 'Tag'}${isInvOfficer ? ' (F)' : ''}
                </button>
                <button onclick="openSupplyRequestModal(null, null, null, '${rm.id}')"
                    class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-black text-xs transition cursor-pointer"
                    title="Request Raw Material via Bill of Materials (BOM)${isInvOfficer ? ' [Shortcut: B or Q]' : ''}">
                    📋 BOM${isInvOfficer ? ' (B)' : ''}
                </button>
                <button onclick="openAdjustRawMaterialModal('${rm.id}', 'ADD')"
                    class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-xs transition cursor-pointer"
                    title="Receive / Restock Material${isInvOfficer ? ' [Shortcut: R]' : ''}">
                    + Restock${isInvOfficer ? ' (R)' : ''}
                </button>
                <button onclick="openAdjustRawMaterialModal('${rm.id}', 'DEDUCT')"
                    class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold text-xs transition cursor-pointer"
                    title="Issue Material to Production${isInvOfficer ? ' [Shortcut: I]' : ''}">
                    - Issue${isInvOfficer ? ' (I)' : ''}
                </button>
                <button onclick="openRawMaterialModal('${rm.id}')"
                    class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs transition cursor-pointer"
                    title="Edit Material${isInvOfficer ? ' [Shortcut: E or Enter]' : ''}">
                    ✏️${isInvOfficer ? ' (E)' : ''}
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

async function toggleRawMaterialFastMoving(rmId) {
    const rm = cachedRawMaterials.find(r => r.id === rmId);
    if (!rm) return;

    const nextState = Number(rm.is_fast_moving) === 1 ? 0 : 1;
    const res = await NKB.api(`/api/raw-materials/${rmId}/toggle-fast-moving`, {
        method: 'POST',
        body: { is_fast_moving: nextState }
    });

    if (res && res.success) {
        if (NKB.showToast) NKB.showToast(res.message, 'success');
        await loadRawMaterials();
    } else {
        alert((res && res.error) || 'Failed to update Fast Moving tag.');
    }
}

function triggerSelectedRawMaterialAction(actionType) {
    if (!isInventoryOfficerAccount()) {
        alert('Shortcut actions are exclusive to the Inventory Officer account.');
        return;
    }
    const rm = cachedRawMaterials[selectedRawMaterialIndex] || cachedRawMaterials.find(r => r.id === selectedRawMaterialId);
    if (actionType === 'BOM_REQUISITION') {
        openSupplyRequestModal(null, null, null, rm ? rm.id : null);
        return;
    }
    if (!rm) {
        if (NKB.showToast) NKB.showToast('Select a material row first using ↑ / ↓ arrows or clicking a row.', 'warning');
        return;
    }
    if (actionType === 'RESTOCK') {
        openAdjustRawMaterialModal(rm.id, 'ADD');
    } else if (actionType === 'ISSUE') {
        openAdjustRawMaterialModal(rm.id, 'DEDUCT');
    } else if (actionType === 'FAST_MOVING') {
        toggleRawMaterialFastMoving(rm.id);
    } else if (actionType === 'EDIT') {
        openRawMaterialModal(rm.id);
    }
}

function openRawMaterialModal(rmId = null) {
    const existing = rmId ? cachedRawMaterials.find(r => r.id === rmId) : null;
    const isEdit = !!existing;
    const isFastMoving = existing ? Number(existing.is_fast_moving) === 1 : false;

    const existingModal = document.getElementById('modal-raw-material');
    if (existingModal) existingModal.remove();

    const modalHtml = `
        <div id="modal-raw-material" class="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                    <h3 class="font-bold text-sm">${isEdit ? `Edit Raw Material: ${existing.material_code}` : '➕ Add New Warehouse Raw Material'}</h3>
                    <button type="button" onclick="document.getElementById('modal-raw-material').remove()" class="text-slate-400 hover:text-white">✕</button>
                </div>
                <form onsubmit="submitRawMaterialForm(event, '${rmId || ''}')" class="p-6 space-y-4 text-xs">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Material Code *</label>
                            <input type="text" id="rm-form-code" required value="${existing ? existing.material_code : ''}" placeholder="e.g. L015 or COOO223" class="w-full p-2 border border-slate-300 rounded-xl">
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Category / Section *</label>
                            <select id="rm-form-category" class="w-full p-2 border border-slate-300 rounded-xl">
                                ${['Cosmetics', 'Peeling Lotion', 'Active Ingredients', 'Base & Solvents', 'Humectants & Emollients', 'Emulsifiers & Waxes', 'UV Filters & Actives', 'Preservatives & Stabilizers', 'Fragrances & Essential Oils', 'Packaging & Containers'].map(c => `<option value="${c}" ${existing && existing.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">Material Name *</label>
                        <input type="text" id="rm-form-name" required value="${existing ? existing.material_name : ''}" placeholder="Material Name" class="w-full p-2 border border-slate-300 rounded-xl">
                    </div>
                    <div class="p-3 rounded-xl bg-orange-50 border border-orange-200">
                        <label class="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" id="rm-form-fast-moving" ${isFastMoving ? 'checked' : ''} class="w-4 h-4 accent-orange-600 rounded">
                            <span class="font-extrabold text-orange-950 text-xs">🔥 Tag as Fast Moving Material (Frequently Used in Production)</span>
                        </label>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Current Stock *</label>
                            <input type="number" step="0.01" id="rm-form-stock" required value="${existing ? existing.current_stock : 0}" class="w-full p-2 border border-slate-300 rounded-xl">
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Unit *</label>
                            <select id="rm-form-unit" class="w-full p-2 border border-slate-300 rounded-xl">
                                ${['kg', 'g', 'L', 'mL', 'pcs', 'drums', 'boxes'].map(u => `<option value="${u}" ${existing && existing.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Min Reorder Level *</label>
                            <input type="number" step="0.01" id="rm-form-min" required value="${existing ? existing.minimum_stock_level : 0}" class="w-full p-2 border border-slate-300 rounded-xl">
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Supplier</label>
                            <input type="text" id="rm-form-supplier" value="${existing ? (existing.supplier || 'None') : 'None'}" placeholder="None" class="w-full p-2 border border-slate-300 rounded-xl">
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Warehouse Rack / Location</label>
                            <input type="text" id="rm-form-location" value="${existing ? (existing.location || 'None') : 'None'}" placeholder="None" class="w-full p-2 border border-slate-300 rounded-xl">
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Brand / Lot Number</label>
                            <input type="text" id="rm-form-lot" value="${existing ? (existing.batch_lot_number || 'None') : 'None'}" placeholder="None" class="w-full p-2 border border-slate-300 rounded-xl">
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Expiry Date</label>
                            <input type="text" id="rm-form-expiry" value="${existing ? (existing.expiry_date || 'None') : 'None'}" placeholder="None" class="w-full p-2 border border-slate-300 rounded-xl">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
                        <button type="button" onclick="document.getElementById('modal-raw-material').remove()" class="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700">Cancel</button>
                        <button type="submit" class="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-md">${isEdit ? 'Save Changes' : 'Add Material'}</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function submitRawMaterialForm(e, rmId) {
    e.preventDefault();
    const fastMovingEl = document.getElementById('rm-form-fast-moving');
    const body = {
        material_code: document.getElementById('rm-form-code').value.trim(),
        category: document.getElementById('rm-form-category').value,
        material_name: document.getElementById('rm-form-name').value.trim(),
        is_fast_moving: fastMovingEl && fastMovingEl.checked ? 1 : 0,
        current_stock: Number(document.getElementById('rm-form-stock').value),
        unit: document.getElementById('rm-form-unit').value,
        minimum_stock_level: Number(document.getElementById('rm-form-min').value),
        supplier: document.getElementById('rm-form-supplier').value.trim(),
        location: document.getElementById('rm-form-location').value.trim(),
        batch_lot_number: document.getElementById('rm-form-lot').value.trim(),
        expiry_date: document.getElementById('rm-form-expiry').value.trim()
    };

    const res = await NKB.api(rmId ? `/api/raw-materials/${rmId}` : '/api/raw-materials', {
        method: rmId ? 'PUT' : 'POST',
        body
    });

    if (res && res.success) {
        const modal = document.getElementById('modal-raw-material');
        if (modal) modal.remove();
        if (NKB.showToast) NKB.showToast(res.message || 'Raw material saved!', 'success');
        loadRawMaterials();
    } else {
        alert((res && res.error) || 'Failed to save raw material.');
    }
}

function openAdjustRawMaterialModal(rmId, type = 'ADD') {
    const rm = cachedRawMaterials.find(r => r.id === rmId);
    if (!rm) return;

    const existingModal = document.getElementById('modal-adjust-raw-material');
    if (existingModal) existingModal.remove();

    const isRestock = type === 'ADD';
    const headerBg = isRestock ? 'bg-emerald-900' : 'bg-amber-900';
    const badgeText = isRestock ? '+ RESTOCK / RECEIVE MATERIAL' : '- ISSUE MATERIAL TO PRODUCTION';
    const defaultReason = isRestock ? 'Supplier Delivery / Restock' : 'Issued to Production Batch';

    const modalHtml = `
        <div id="modal-adjust-raw-material" class="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 ${headerBg} text-white flex items-center justify-between">
                    <div>
                        <span class="text-[10px] font-black uppercase tracking-widest opacity-80">${badgeText}</span>
                        <h3 class="font-black text-sm mt-0.5">${rm.material_name} (${rm.material_code})</h3>
                    </div>
                    <button type="button" onclick="document.getElementById('modal-adjust-raw-material').remove()" class="text-white/70 hover:text-white cursor-pointer">✕</button>
                </div>
                <form onsubmit="submitAdjustRawMaterialForm(event, '${rm.id}', '${type}')" class="p-6 space-y-4 text-xs">
                    <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                        <span class="font-bold text-slate-600">Current Warehouse Stock:</span>
                        <span class="text-base font-black text-slate-900">${NKB.formatNumber(rm.current_stock)} ${rm.unit}</span>
                    </div>

                    <div>
                        <label class="block font-extrabold text-slate-700 mb-1">Quantity (${rm.unit}) to ${isRestock ? 'Restock (+)' : 'Issue (-)'} *</label>
                        <div class="flex flex-wrap gap-1.5 mb-2">
                            ${[5, 10, 25, 50, 100].map(q => `
                                <button type="button" onclick="document.getElementById('rm-adj-qty').value='${q}'; document.getElementById('rm-adj-qty').focus();"
                                    class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] cursor-pointer">
                                    ${isRestock ? '+' : '-'}${q} ${rm.unit}
                                </button>
                            `).join('')}
                        </div>
                        <input type="number" step="0.01" min="0.01" id="rm-adj-qty" required placeholder="Enter quantity in ${rm.unit}"
                            class="w-full p-2.5 border border-slate-300 rounded-xl font-black text-sm bg-white focus:ring-2 focus:ring-teal-500">
                    </div>

                    <div>
                        <label class="block font-bold text-slate-700 mb-1">Reference / Batch / PO Note</label>
                        <input type="text" id="rm-adj-reason" value="${defaultReason}" placeholder="Reference note"
                            class="w-full p-2 border border-slate-300 rounded-xl">
                    </div>

                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
                        <button type="button" onclick="document.getElementById('modal-adjust-raw-material').remove()" class="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 cursor-pointer">Cancel (Esc)</button>
                        <button type="submit" class="px-5 py-2 ${isRestock ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'} text-white rounded-xl font-black shadow-md cursor-pointer">
                            ${isRestock ? '✅ Confirm Restock' : '📤 Confirm Issue'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setTimeout(() => {
        const qtyInput = document.getElementById('rm-adj-qty');
        if (qtyInput) qtyInput.focus();
    }, 30);
}

async function submitAdjustRawMaterialForm(e, rmId, type) {
    e.preventDefault();
    const qtyEl = document.getElementById('rm-adj-qty');
    const reasonEl = document.getElementById('rm-adj-reason');
    const quantity = qtyEl ? Number(qtyEl.value) : 0;
    const reason = reasonEl ? reasonEl.value.trim() : '';

    if (isNaN(quantity) || quantity <= 0) {
        alert('Please enter a valid positive quantity.');
        return;
    }

    const res = await NKB.api(`/api/raw-materials/${rmId}/adjust-stock`, {
        method: 'POST',
        body: { adjustment_type: type, quantity, reason }
    });
    if (res && res.success) {
        const modal = document.getElementById('modal-adjust-raw-material');
        if (modal) modal.remove();
        if (NKB.showToast) NKB.showToast(res.message, 'success');
        loadRawMaterials();
    } else {
        alert((res && res.error) || 'Failed to adjust stock.');
    }
}

// Keyboard navigation (ArrowUp / ArrowDown to scroll & choose) + Exclusive INVENTORY account shortcuts (B/Q = Request BOM, F/T = Tag Fast Moving, R = Restock, I = Issue, E = Edit, N = New, S = Cycle Sort, / = Search, 1-5 = Filter Zones, X = Reset, ? = Shortcut Guide)
function handleInventoryKeyboardNavigation(e) {
    const rawViewEl = document.getElementById('view-raw-materials');
    const purchViewEl = document.getElementById('view-purchasing');
    const isRawViewActive = rawViewEl && !rawViewEl.classList.contains('hidden');
    const isPurchViewActive = purchViewEl && !purchViewEl.classList.contains('hidden');

    if (!isRawViewActive && !isPurchViewActive) return;

    // Close adjust modal or BOM modal on Escape
    if (e.key === 'Escape') {
        const bomModal = document.getElementById('modal-supply-requisition-bom');
        if (bomModal) {
            closeModal();
            e.preventDefault();
            return;
        }
        const adjModal = document.getElementById('modal-adjust-raw-material');
        if (adjModal) {
            adjModal.remove();
            e.preventDefault();
            return;
        }
        const editModal = document.getElementById('modal-raw-material');
        if (editModal) {
            editModal.remove();
            e.preventDefault();
            return;
        }
        if (document.activeElement && document.activeElement.id === 'rm-search-input') {
            document.activeElement.blur();
            e.preventDefault();
            return;
        }
    }

    // Do not intercept keys when a modal is open or user is typing in an input/select/textarea
    if (document.getElementById('modal-adjust-raw-material') || document.getElementById('modal-raw-material') || document.getElementById('modal-supply-requisition-bom')) return;
    const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || (document.activeElement && document.activeElement.isContentEditable)) {
        return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const keyUpper = String(e.key).toUpperCase();

    // Universal Shortcut B or Q: Open Bill of Materials (BOM) Supply Requisition Form
    if (keyUpper === 'B' || keyUpper === 'Q') {
        e.preventDefault();
        const curRm = (cachedRawMaterials && cachedRawMaterials[selectedRawMaterialIndex]) || (cachedRawMaterials && cachedRawMaterials.find(r => r.id === selectedRawMaterialId));
        openSupplyRequestModal(null, null, null, curRm ? curRm.id : null);
        return;
    }

    if (!isRawViewActive) return;

    // ArrowUp / ArrowDown: Scroll and choose material row in Warehouse Inventory
    if (e.key === 'ArrowDown' && cachedRawMaterials && cachedRawMaterials.length > 0) {
        e.preventDefault();
        const nextIdx = selectedRawMaterialIndex < cachedRawMaterials.length - 1 ? selectedRawMaterialIndex + 1 : 0;
        selectRawMaterialRow(nextIdx, true);
        return;
    }

    if (e.key === 'ArrowUp' && cachedRawMaterials && cachedRawMaterials.length > 0) {
        e.preventDefault();
        const prevIdx = selectedRawMaterialIndex > 0 ? selectedRawMaterialIndex - 1 : cachedRawMaterials.length - 1;
        selectRawMaterialRow(prevIdx, true);
        return;
    }

    // Exclusive shortcut keys for the Inventory Officer account (role === 'INVENTORY' or ADMIN/IT_ADMIN)
    if (!isInventoryOfficerAccount()) return;

    // Global Inventory View Shortcuts (do not require a selected row)
    if (e.key === '?') {
        e.preventDefault();
        toggleInventoryShortcutSuggestions();
        return;
    }
    if (e.key === '/') {
        e.preventDefault();
        const searchEl = document.getElementById('rm-search-input');
        if (searchEl) searchEl.focus();
        return;
    }
    if (keyUpper === 'N') {
        e.preventDefault();
        openRawMaterialModal();
        return;
    }
    if (keyUpper === 'S') {
        e.preventDefault();
        cycleRawMaterialSortMode();
        return;
    }
    if (keyUpper === 'X') {
        e.preventDefault();
        filterRawMaterialsBySupplier('');
        setRawMaterialStatusFilter('');
        return;
    }
    if (e.key === '1') {
        e.preventDefault();
        setRawMaterialStatusFilter('');
        return;
    }
    if (e.key === '2') {
        e.preventDefault();
        setRawMaterialStatusFilter('FAST_MOVING');
        return;
    }
    if (e.key === '3') {
        e.preventDefault();
        setRawMaterialStatusFilter('IN_STOCK');
        return;
    }
    if (e.key === '4') {
        e.preventDefault();
        setRawMaterialStatusFilter('LOW_STOCK');
        return;
    }
    if (e.key === '5') {
        e.preventDefault();
        setRawMaterialStatusFilter('OUT_OF_STOCK');
        return;
    }

    if (!cachedRawMaterials || cachedRawMaterials.length === 0) return;
    const selectedRm = cachedRawMaterials[selectedRawMaterialIndex] || cachedRawMaterials.find(r => r.id === selectedRawMaterialId);
    if (!selectedRm) return;

    if (keyUpper === 'R' || e.key === '+') {
        e.preventDefault();
        openAdjustRawMaterialModal(selectedRm.id, 'ADD');
    } else if (keyUpper === 'I' || e.key === '-') {
        e.preventDefault();
        openAdjustRawMaterialModal(selectedRm.id, 'DEDUCT');
    } else if (keyUpper === 'F' || keyUpper === 'T') {
        e.preventDefault();
        toggleRawMaterialFastMoving(selectedRm.id);
    } else if (keyUpper === 'E' || e.key === 'Enter') {
        e.preventDefault();
        openRawMaterialModal(selectedRm.id);
    }
}

document.addEventListener('keydown', handleInventoryKeyboardNavigation);

window.loadRawMaterials = loadRawMaterials;
window.filterRawMaterialsBySupplier = filterRawMaterialsBySupplier;
window.setRawMaterialStatusFilter = setRawMaterialStatusFilter;
window.selectRawMaterialRow = selectRawMaterialRow;
window.toggleRawMaterialFastMoving = toggleRawMaterialFastMoving;
window.triggerSelectedRawMaterialAction = triggerSelectedRawMaterialAction;
window.toggleInventoryShortcutSuggestions = toggleInventoryShortcutSuggestions;
window.cycleRawMaterialSortMode = cycleRawMaterialSortMode;
window.openRawMaterialModal = openRawMaterialModal;
window.submitRawMaterialForm = submitRawMaterialForm;
window.openAdjustRawMaterialModal = openAdjustRawMaterialModal;
window.submitAdjustRawMaterialForm = submitAdjustRawMaterialForm;

/**
 * NKB Manufacturing & Trading - Admin & Operations Script
 */

let yieldChart = null;
let monthlySalesChart = null;
let cachedClients = [];
let cachedProducts = [];

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
        hideTab('dashboard');
        hideTab('orders');
        hideTab('invoices');
        hideTab('payments');
        hideTab('buffer');
        hideTab('clients');
        hideTab('products');
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        const mgmtHdr = document.getElementById('sidebar-mgmt-header');
        if (mgmtHdr) mgmtHdr.style.display = 'none';

        // Default to Job Orders view
        switchTab('job-orders');
    } else if (role === 'WAREHOUSE') {
        hideTab('dashboard');
        hideTab('orders');
        hideTab('job-orders');
        hideTab('production');
        hideTab('invoices');
        hideTab('payments');
        hideTab('clients');
        hideTab('products');
        hideTab('users');
        hideTab('reports');
        hideTab('audit');
        const mgmtHdr = document.getElementById('sidebar-mgmt-header');
        if (mgmtHdr) mgmtHdr.style.display = 'none';

        switchTab('deliveries');
    } else if (role === 'ACCOUNTING') {
        hideTab('job-orders');
        hideTab('production');
        hideTab('buffer');
        hideTab('users');
        hideTab('audit');
    } else if (role === 'ADMIN') {
        // Admin sees operational tools
    }
}

async function loadInitialData() {
    const [clientsRes, productsRes] = await Promise.all([
        NKB.api('/api/clients'),
        NKB.api('/api/products')
    ]);
    if (clientsRes.success) cachedClients = clientsRes.data;
    if (productsRes.success) cachedProducts = productsRes.data;
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
                <td class="py-3 px-4 text-slate-600">${dr.po_number}</td>
                <td class="py-3 px-4 font-extrabold text-emerald-700">${NKB.formatNumber(dr.total_accepted)} pcs</td>
                <td class="py-3 px-4 text-slate-500">${dr.signer_name || 'Authorized'}</td>
                <td class="py-3 px-4"><span class="badge ${dr.billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}">${dr.billing_policy}</span></td>
                <td class="py-3 px-4 text-right">
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
        tbody.innerHTML = res.data.map(po => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4">
                    <button onclick="openBacktrackModal('${po.po_number}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-mono text-xs">
                        <span>🔍</span><span>${po.po_number}</span>
                    </button>
                </td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(po.po_date)}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${po.company_name}</td>
                <td class="py-3 px-4"><span class="badge ${po.billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}">${po.billing_policy}</span></td>
                <td class="py-3 px-4 font-bold text-slate-700">${NKB.formatNumber(po.total_target_quantity)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-slate-900">${NKB.formatCurrency(po.grand_total)}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(po.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openBacktrackModal('${po.po_number}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1">
                        <span>🔍</span><span>Trace</span>
                    </button>
                    <a href="/print-po.html?id=${po.id}" target="_blank" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition inline-flex items-center gap-1">
                        <span>🖨️</span><span>Print PO</span>
                    </a>
                    ${po.status === 'PENDING_APPROVAL' ? `
                        <button onclick="approvePO('${po.id}', '${po.po_number}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">
                            Approve
                        </button>
                    ` : ''}
                    ${po.status === 'APPROVED' || po.status === 'IN_PRODUCTION' ? `
                        <button onclick="openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition">
                            + Job Order
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-slate-400">No purchase orders found.</td></tr>`;
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
async function loadJobOrders() {
    const res = await NKB.api('/api/job-orders');
    const tbody = document.getElementById('table-jos-body');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(jo => {
            const isDelivered = jo.status === 'COMPLETED' || (jo.delivered_quantity && jo.delivered_quantity >= jo.target_quantity) || jo.latest_dr_number;
            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="py-3 px-4 font-bold text-indigo-600">
                        <button onclick="openBacktrackModal('${jo.jo_number}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-mono text-xs">
                            <span>🔍</span><span>${jo.jo_number}</span>
                        </button>
                    </td>
                    <td class="py-3 px-4 text-slate-600 font-semibold">
                        <button onclick="openBacktrackModal('${jo.po_number}')" class="hover:underline hover:text-indigo-600 font-mono">
                            ${jo.po_number}
                        </button>
                    </td>
                    <td class="py-3 px-4 font-bold text-slate-800">${jo.company_name}</td>
                    <td class="py-3 px-4 font-semibold text-slate-800">${jo.product_name} <span class="text-xs text-slate-400">(${jo.sku})</span></td>
                    <td class="py-3 px-4 font-black text-slate-800">${NKB.formatNumber(jo.target_quantity)} pcs</td>
                    <td class="py-3 px-4">
                        <div class="font-bold text-slate-800">${NKB.formatNumber(jo.total_yield || 0)} <span class="text-[10px] text-slate-500 font-normal">produced</span></div>
                        <div class="text-[11px] ${jo.delivered_quantity > 0 ? 'text-emerald-600 font-bold' : 'text-slate-400'}">${NKB.formatNumber(jo.delivered_quantity || 0)} dispatched</div>
                    </td>
                    <td class="py-3 px-4">
                        ${jo.latest_dr_number ? `
                            <button onclick="openBacktrackModal('${jo.latest_dr_number}')" class="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md font-mono text-[11px] font-bold inline-flex items-center gap-1 transition">
                                <span>🚚</span><span>${jo.latest_dr_number}</span>
                            </button>
                        ` : `<span class="text-slate-400 italic text-[11px]">Pending Dispatch</span>`}
                    </td>
                    <td class="py-3 px-4">
                        ${isDelivered ? `
                            <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-black inline-flex items-center gap-1 shadow-sm">
                                <span>✅</span><span>DELIVERED / TAPOS NA</span>
                            </span>
                        ` : (jo.batch_count > 0 ? `
                            <span class="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold inline-flex items-center gap-1">
                                <span>🧪</span><span>IN PRODUCTION</span>
                            </span>
                        ` : `
                            <span class="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold inline-flex items-center gap-1">
                                <span>🟡</span><span>PENDING BATCH</span>
                            </span>
                        `)}
                    </td>
                    <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button onclick="openBacktrackModal('${jo.jo_number}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1">
                            <span>🔍</span><span>Trace</span>
                        </button>
                        <a href="/print-jo.html?id=${jo.id}" target="_blank" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition inline-flex items-center gap-1">
                            <span>🖨️</span><span>Print JO</span>
                        </a>
                        ${isDelivered ? `
                            <span class="px-2.5 py-1 bg-slate-100 text-slate-400 border border-slate-200 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-not-allowed select-none" title="Tapos na at na-deliver na itong Job Order.">
                                <span>🔒</span><span>Tapos Na</span>
                            </span>
                        ` : `
                            <button onclick="openCreateBatchModal('${jo.id}', '${jo.jo_number}', ${jo.target_quantity}, '${jo.product_name}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition">
                                + Start Batch
                            </button>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-400">No job orders found.</td></tr>`;
    }
}

// -------------------------------------------------------------
// 4. PRODUCTION BATCHES & YIELD LOGGER
// -------------------------------------------------------------
async function loadBatches() {
    const res = await NKB.api('/api/production/batches');
    const tbody = document.getElementById('table-batches-body');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(b => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">
                    <button onclick="openBacktrackModal('${b.batch_number}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-mono text-xs">
                        <span>🔍</span><span>${b.batch_number}</span>
                    </button>
                </td>
                <td class="py-3 px-4 text-slate-600">
                    <button onclick="openBacktrackModal('${b.jo_number}')" class="hover:underline hover:text-indigo-600 font-mono">${b.jo_number}</button> / 
                    <button onclick="openBacktrackModal('${b.po_number}')" class="hover:underline hover:text-indigo-600 font-mono">${b.po_number}</button>
                </td>
                <td class="py-3 px-4 font-semibold text-slate-800">${b.product_name}</td>
                <td class="py-3 px-4 font-bold text-slate-700">${NKB.formatNumber(b.target_quantity)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-indigo-700">${b.actual_yield > 0 ? NKB.formatNumber(b.actual_yield) + ' pcs' : '<span class="text-slate-400 italic">In progress</span>'}</td>
                <td class="py-3 px-4">${b.actual_yield > 0 ? NKB.renderVarianceBadge(b.variance_quantity, b.variance_percent) : '-'}</td>
                <td class="py-3 px-4 text-slate-500">${NKB.formatDate(b.expiry_date)}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(b.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openBacktrackModal('${b.batch_number}')" class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1">
                        <span>🔍</span><span>Trace</span>
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
                <td class="py-3 px-4 font-bold text-indigo-600">
                    <button onclick="openBacktrackModal('${dr.dr_number}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-mono text-xs">
                        <span>🔍</span><span>${dr.dr_number}</span>
                    </button>
                </td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(dr.delivery_date)}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${dr.company_name}</td>
                <td class="py-3 px-4 text-slate-600">
                    <button onclick="openBacktrackModal('${dr.po_number}')" class="hover:underline hover:text-indigo-600 font-mono">
                        ${dr.po_number}
                    </button>
                </td>
                <td class="py-3 px-4 font-bold text-slate-700">${NKB.formatNumber(dr.total_delivered)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-emerald-700">${dr.total_accepted > 0 ? NKB.formatNumber(dr.total_accepted) + ' pcs' : '-'}</td>
                <td class="py-3 px-4 font-bold text-rose-600">${dr.total_rejected > 0 ? NKB.formatNumber(dr.total_rejected) + ' pcs' : '0'}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(dr.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openBacktrackModal('${dr.dr_number}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1">
                        <span>🔍</span><span>Trace</span>
                    </button>
                    <a href="/print-dr.html?id=${dr.id}" target="_blank" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition inline-block">
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
                <td class="py-3 px-4 font-bold text-indigo-600">
                    <button onclick="openBacktrackModal('${si.invoice_number}')" class="font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-mono text-xs">
                        <span>🔍</span><span>${si.invoice_number}</span>
                    </button>
                </td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(si.invoice_date)} <br><span class="text-[10px] text-slate-400">Due: ${NKB.formatDate(si.due_date)}</span></td>
                <td class="py-3 px-4 font-bold text-slate-800">${si.company_name}</td>
                <td class="py-3 px-4 text-slate-600">
                    <button onclick="openBacktrackModal('${si.dr_number}')" class="hover:underline hover:text-indigo-600 font-mono">
                        ${si.dr_number}
                    </button>
                </td>
                <td class="py-3 px-4 font-extrabold text-slate-900">${NKB.formatCurrency(si.total_amount)}</td>
                <td class="py-3 px-4 font-bold text-emerald-700">${NKB.formatCurrency(si.paid_amount)}</td>
                <td class="py-3 px-4 font-extrabold text-rose-700">${NKB.formatCurrency(si.balance_due)}</td>
                <td class="py-3 px-4"><span class="badge ${si.agingCategory === 'Current' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-800 font-bold'}">${si.agingCategory}</span></td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(si.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button onclick="openBacktrackModal('${si.invoice_number}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1">
                        <span>🔍</span><span>Trace</span>
                    </button>
                    <a href="/print-invoice.html?id=${si.id}" target="_blank" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition inline-block">
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
// 7. PAYMENTS
// -------------------------------------------------------------
async function loadPayments() {
    const res = await NKB.api('/api/payments');
    const tbody = document.getElementById('table-payments-body');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(p => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">${p.payment_number}</td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(p.payment_date)}</td>
                <td class="py-3 px-4 font-semibold text-slate-800">${p.invoice_number}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${p.company_name}</td>
                <td class="py-3 px-4"><span class="badge bg-slate-100 text-slate-700">${p.payment_method.replace(/_/g, ' ')}</span></td>
                <td class="py-3 px-4 font-mono text-slate-600">${p.reference_number}</td>
                <td class="py-3 px-4 font-extrabold text-emerald-700">${NKB.formatCurrency(p.amount)}</td>
                <td class="py-3 px-4 text-slate-500">${p.recorded_by_name || 'Accounting Staff'}</td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-slate-400">No payments recorded.</td></tr>`;
    }
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
                <td class="py-3 px-4 text-slate-600">${bs.po_number} / ${bs.batch_number}</td>
                <td class="py-3 px-4 font-bold text-slate-700">${NKB.formatNumber(bs.initial_quantity)} pcs</td>
                <td class="py-3 px-4 font-semibold text-purple-700">${NKB.formatNumber(bs.quantity_released)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-emerald-700">${NKB.formatNumber(bs.quantity_remaining)} pcs</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(bs.status)}</td>
                <td class="py-3 px-4 text-right">
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
                        <button onclick="openClientPricingModal('${c.id}', '${c.company_name.replace(/'/g, "\\'")}')" class="px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1">
                            <span>📦</span><span>Catalog</span>
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
                <td class="py-3 px-4 font-mono text-slate-600">${p.formula_code || '-'}</td>
                <td class="py-3 px-4 font-extrabold text-slate-900">${NKB.formatCurrency(p.default_price)}</td>
                <td class="py-3 px-4 text-slate-600">${p.shelf_life_months} mos</td>
                <td class="py-3 px-4 font-bold text-emerald-700">${NKB.formatNumber(p.current_stock)} ${p.unit}</td>
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
        tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-400">No products found.</td></tr>`;
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
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3 flex-shrink-0">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-xl">📦</span>
                            <h3 class="text-lg font-black text-slate-900">Client Product Line & Pricing Management</h3>
                        </div>
                        <p class="text-xs text-slate-500">Client: <strong class="text-indigo-600 font-bold">${companyName}</strong></p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
                </div>

                <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-indigo-50/70 rounded-xl border border-indigo-200 text-xs flex-shrink-0">
                    <div class="text-indigo-950">
                        💡 <strong>Client Catalog:</strong> Only products listed below are visible and purchasable by this client.
                    </div>
                    <div class="flex gap-2 flex-shrink-0">
                        <button type="button" onclick="toggleAssignMasterProductForm()" class="px-3 py-1.5 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-300 rounded-lg font-bold whitespace-nowrap shadow-sm flex items-center gap-1">
                            <span>➕</span><span>Assign from Master Catalog</span>
                        </button>
                        <button type="button" onclick="toggleAddClientProductForm()" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold whitespace-nowrap shadow-sm shadow-indigo-600/30 flex items-center gap-1">
                            <span>✨</span><span>New Exclusive Product</span>
                        </button>
                    </div>
                </div>

                <!-- 1. Inline Form to Assign Existing Master Product -->
                <div id="box-assign-master-product" class="hidden p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-3 flex-shrink-0">
                    <div class="flex justify-between items-center border-b border-indigo-100 pb-2">
                        <h4 class="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                            <span>📦</span><span>Assign Existing Product from Master Catalog</span>
                        </h4>
                        <button type="button" onclick="toggleAssignMasterProductForm()" class="text-slate-400 hover:text-slate-600 text-xs">✕ Close</button>
                    </div>
                    <form onsubmit="submitAssignMasterProduct(event, '${clientId}')" class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-semibold">
                        <div class="sm:col-span-3">
                            <label class="block text-slate-700 mb-1">Select Master Product *</label>
                            <select id="assign-master-select" onchange="onSelectMasterProductToAssign()" required class="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg bg-white font-bold text-slate-800">
                                <option value="">-- Choose a product from catalog --</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Client Custom Brand Name</label>
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
                            <input type="number" step="0.01" min="0" id="assign-custom-price" required placeholder="120.00" class="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg bg-white font-bold text-indigo-900">
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
                            <select id="new-client-prod-category" class="w-full px-2.5 py-1.5 border rounded-lg bg-white font-bold text-slate-800">
                                <option value="Face Care">Face Care</option>
                                <option value="Body Care">Body Care</option>
                                <option value="Sun Care">Sun Care</option>
                                <option value="Bath & Body">Bath & Body</option>
                                <option value="Hair Care">Hair Care</option>
                                <option value="Cosmetics">Cosmetics</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Formula Code</label>
                            <input type="text" id="new-client-prod-formula" placeholder="e.g. FORM-GFW-V1" class="w-full px-2.5 py-1.5 border rounded-lg bg-white font-mono">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Contract Price (₱) *</label>
                            <input type="number" step="0.01" min="0" id="new-client-prod-price" required placeholder="150.00" class="w-full px-2.5 py-1.5 border rounded-lg bg-white font-bold text-indigo-900">
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
    if (priceInput) priceInput.value = price;
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
                    availableMaster.map(p => `<option value="${p.id}" data-sku="${p.sku}" data-name="${p.name}" data-formula="${p.formula_code || ''}" data-price="${p.default_price}">${p.name} (${p.sku}) - ₱${p.default_price.toFixed(2)}</option>`).join('');
            }
        }

        if (countEl) countEl.textContent = assigned.length;

        if (assigned.length > 0) {
            tbody.innerHTML = assigned.map(p => `
                <tr class="hover:bg-slate-50 transition" data-product-id="${p.product_id}" data-search="${(p.name + ' ' + p.sku + ' ' + (p.custom_name || '')).toLowerCase()}">
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${p.name}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${p.sku} • Base: ₱${p.default_price.toFixed(2)}</div>
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
                            <input type="number" step="0.01" min="0" 
                                   name="price-${p.product_id}" 
                                   value="${p.custom_price !== null && p.custom_price !== undefined ? p.custom_price : p.default_price}" 
                                   placeholder="${p.default_price.toFixed(2)}" 
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
                            <label class="block text-slate-600 mb-1">Phone</label>
                            <input type="text" id="edit-client-phone" required value="${client.phone}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">TIN</label>
                            <input type="text" id="edit-client-tin" value="${client.tin || ''}" placeholder="000-000-000-000" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Business Address</label>
                        <input type="text" id="edit-client-address" required value="${client.address}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
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
    const res = await NKB.api(`/api/products/${productId}`);
    if (!res.success || !res.data) return;
    const prod = res.data;

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
                            <input type="text" value="${prod.sku}" readonly class="w-full px-3 py-2 border rounded-xl bg-slate-100 font-mono">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Category</label>
                            <select id="edit-prod-category" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                                <option value="Body Care" ${prod.category === 'Body Care' ? 'selected' : ''}>Body Care</option>
                                <option value="Sun Care" ${prod.category === 'Sun Care' ? 'selected' : ''}>Sun Care</option>
                                <option value="Face Care" ${prod.category === 'Face Care' ? 'selected' : ''}>Face Care</option>
                                <option value="Bath & Body" ${prod.category === 'Bath & Body' ? 'selected' : ''}>Bath & Body</option>
                                <option value="Hair Care" ${prod.category === 'Hair Care' ? 'selected' : ''}>Hair Care</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Product Name</label>
                        <input type="text" id="edit-prod-name" required value="${prod.name}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Default Unit Price (₱)</label>
                            <input type="number" step="0.01" id="edit-prod-price" required value="${prod.default_price}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Formula Code</label>
                            <input type="text" id="edit-prod-formula" value="${prod.formula_code || ''}" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Unit</label>
                            <input type="text" id="edit-prod-unit" value="${prod.unit}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Shelf Life (Months)</label>
                            <input type="number" id="edit-prod-shelf-life" value="${prod.shelf_life_months}" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
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
    const default_price = parseFloat(document.getElementById('edit-prod-price').value);
    const formula_code = document.getElementById('edit-prod-formula').value;
    const unit = document.getElementById('edit-prod-unit').value;
    const shelf_life_months = parseInt(document.getElementById('edit-prod-shelf-life').value);

    const res = await NKB.api(`/api/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
            category,
            name,
            default_price,
            formula_code,
            unit,
            shelf_life_months
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
                                        <th class="py-2.5 px-3 w-28">Target Qty (pcs)</th>
                                        <th class="py-2.5 px-3 w-28">Unit Price (₱)</th>
                                        <th class="py-2.5 px-3 w-28">Subtotal (₱)</th>
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

    const res = await NKB.api(`/api/products?clientId=${clientId}`);
    if (res.success && res.data) {
        adminPOCatalog = res.data;
    }

    if (adminPOLineItems.length === 0 && adminPOCatalog.length > 0) {
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
        unit_price: defaultProd.default_price
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
            adminPOLineItems[index].unit_price = prod.default_price;
        }
    } else if (field === 'target_quantity') {
        adminPOLineItems[index].target_quantity = parseInt(value) || 0;
    } else if (field === 'unit_price') {
        adminPOLineItems[index].unit_price = parseFloat(value) || 0;
    }
    renderAdminPOLineItems();
}

function renderAdminPOLineItems() {
    const tbody = document.getElementById('admin-po-lines-body');
    if (!tbody) return;

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
                                ${p.name} (${p.effective_sku || p.sku}) - ₱${p.default_price.toFixed(2)}${p.has_custom_price ? ' [Custom]' : ''}
                            </option>
                        `).join('')}
                    </select>
                </td>
                <td class="py-2.5 px-3">
                    <input type="number" min="1" step="1" 
                           value="${item.target_quantity}" 
                           oninput="updateAdminPOLineItem(${idx}, 'target_quantity', this.value)" 
                           class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900">
                </td>
                <td class="py-2.5 px-3">
                    <input type="number" min="0" step="0.01" 
                           value="${item.unit_price}" 
                           oninput="updateAdminPOLineItem(${idx}, 'unit_price', this.value)" 
                           class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-indigo-900">
                </td>
                <td class="py-2.5 px-3 font-extrabold text-slate-900">
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
            billing_policy: policy,
            notes,
            items: adminPOLineItems.map(item => ({
                product_id: item.product_id,
                target_quantity: item.target_quantity,
                unit_price: item.unit_price
            }))
        })
    });

    if (res.success) {
        NKB.showToast(`Purchase Order ${res.data.po_number} created successfully!`, 'success');
        closeModal();
        loadOrders();
    } else {
        NKB.showToast(res.error || 'Failed to create PO.', 'error');
    }
}

// -------------------------------------------------------------
// 2. CREATE JOB ORDER MODAL
// -------------------------------------------------------------
async function openCreateJOModal(poId, poNumber, clientName) {
    const root = document.getElementById('modals-root');
    const orderRes = await NKB.api(`/api/orders/${poId}`);
    const poItems = (orderRes.success && orderRes.data && orderRes.data.items) ? orderRes.data.items : [];

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
                            ${poItems.length > 0 ? poItems.map(item => `
                                <option value="${item.product_id}" data-qty="${item.target_quantity}">
                                    ${item.product_name} (${item.sku}) — Target: ${NKB.formatNumber(item.target_quantity)} pcs
                                </option>
                            `).join('') : cachedProducts.map(p => `<option value="${p.id}" data-qty="1000">${p.name} (${p.sku})</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Target Production Qty (pcs) *</label>
                        <input type="number" id="jo-target-qty" value="${poItems.length > 0 ? poItems[0].target_quantity : 1000}" min="1" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-slate-900">
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Assigned Team</label>
                        <input type="text" id="jo-team" value="Formulation & Bottling Team Alpha" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
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
        switchTab('job-orders');
    } else {
        NKB.showToast(res.error || 'Failed to create Job Order.', 'error');
    }
}

// 3. Create Production Batch Modal
function openCreateBatchModal(joId, joNumber, targetQty, productName) {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 class="text-lg font-bold text-slate-900">Start Production Batch</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
                </div>
                <form onsubmit="submitCreateBatch(event, '${joId}')" class="space-y-4 text-xs font-semibold">
                    <div class="p-3 bg-slate-50 rounded-xl text-slate-600 space-y-1">
                        <div>JO Reference: <strong class="text-slate-900">${joNumber}</strong></div>
                        <div>Product: <strong class="text-slate-900">${productName}</strong></div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Target Batch Quantity (pcs)</label>
                        <input type="number" id="batch-target-qty" value="${targetQty}" min="1" required class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Start Batch</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitCreateBatch(e, joId) {
    e.preventDefault();
    const targetQty = parseInt(document.getElementById('batch-target-qty').value);

    const res = await NKB.api('/api/production/batches', {
        method: 'POST',
        body: JSON.stringify({
            jo_id: joId,
            target_quantity: targetQty
        })
    });

    if (res.success) {
        NKB.showToast(`Batch ${res.data.batch_number} started!`, 'success');
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
                        <input type="number" step="0.01" id="pay-amount" max="${balanceDue}" value="${balanceDue}" required class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold text-emerald-800">
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
                            <label class="block text-slate-600 mb-1">Phone *</label>
                            <input type="text" id="client-phone" required placeholder="+63 917 000 0000" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">TIN (Optional)</label>
                            <input type="text" id="client-tin" placeholder="000-000-000-000" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1">Business Address *</label>
                        <input type="text" id="client-address" required placeholder="Building, Street, City, Metro Manila" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
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

// 11. Create Product Modal
function openCreateProductModal() {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">✨</span>
                        <div>
                            <h3 class="text-lg font-black text-slate-900">Add Cosmetic Product</h3>
                            <p class="text-xs text-slate-500">Register new item in master formulation & pricing catalog</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
                </div>
                <form onsubmit="submitCreateProduct(event)" class="space-y-3.5 text-xs font-semibold">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">SKU / Item Code *</label>
                            <input type="text" id="prod-sku" required placeholder="e.g. VLC-300" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 font-mono uppercase focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Category *</label>
                            <select id="prod-category" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500">
                                <option value="Body Care">Body Care</option>
                                <option value="Face Care">Face Care</option>
                                <option value="Sun Care">Sun Care</option>
                                <option value="Bath & Body">Bath & Body</option>
                                <option value="Hair Care">Hair Care</option>
                                <option value="Cosmetics">Cosmetics</option>
                                <option value="Skincare Treatment">Skincare Treatment</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-slate-700 font-bold mb-1">Product Commercial Name *</label>
                        <input type="text" id="prod-name" required placeholder="e.g. Vitamin C Brightening Body Lotion 300ml" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Default Unit Price (₱) *</label>
                            <input type="number" step="0.01" min="0" id="prod-price" required placeholder="120.00" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-extrabold text-indigo-900 text-sm focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Formula Code</label>
                            <input type="text" id="prod-formula" placeholder="FORM-VLC-V1" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Unit of Measure</label>
                            <input type="text" id="prod-unit" value="pcs" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-slate-700 font-bold mb-1">Shelf Life (Months)</label>
                            <input type="number" id="prod-shelf-life" value="24" class="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500">
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
    const sku = document.getElementById('prod-sku').value;
    const category = document.getElementById('prod-category').value;
    const name = document.getElementById('prod-name').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    const formula = document.getElementById('prod-formula').value;
    const unit = document.getElementById('prod-unit').value;
    const shelfLife = parseInt(document.getElementById('prod-shelf-life').value);

    const res = await NKB.api('/api/products', {
        method: 'POST',
        body: JSON.stringify({
            sku,
            category,
            name,
            default_price: price,
            formula_code: formula,
            unit,
            shelf_life_months: shelfLife
        })
    });

    if (res.success) {
        NKB.showToast(`Product "${name}" added!`, 'success');
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

    tbody.innerHTML = res.data.map(u => `
        <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-4">
                <div class="font-bold text-slate-900">${u.name}</div>
                <div class="text-[11px] text-slate-400 font-mono">${u.email}</div>
            </td>
            <td class="py-3 px-4">
                <span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border ${roleBadges[u.role] || 'bg-slate-100 text-slate-800 border-slate-200'}">
                    ${u.role}
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
            <td class="py-3 px-4 text-right space-x-1">
                <button onclick="promptResetUserPassword('${u.id}', '${u.email}')" class="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition">
                    🔑 Reset Pwd
                </button>
                <button onclick="toggleUserStatus('${u.id}', ${u.is_active})" class="px-2.5 py-1 ${u.is_active ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'} border rounded-lg text-xs font-semibold transition">
                    ${u.is_active ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        </tr>
    `).join('');
}

function openCreateUserModal() {
    const root = document.getElementById('modals-root');
    const clientOptions = cachedClients.map(c => `<option value="${c.id}">${c.company_name} (${c.client_code})</option>`).join('');

    root.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div class="flex justify-between items-center border-b pb-3">
                    <h3 class="text-base font-extrabold text-slate-900">Add Staff Member / Portal User</h3>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
                </div>
                <form onsubmit="submitCreateUser(event)" class="space-y-3 text-xs">
                    <div>
                        <label class="block text-slate-600 mb-1 font-semibold">Full Name</label>
                        <input type="text" id="usr-name" placeholder="Juan dela Cruz" required class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1 font-semibold">Corporate / Login Email</label>
                        <input type="email" id="usr-email" placeholder="staff@nkbmanufacturing.com" required class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div>
                        <label class="block text-slate-600 mb-1 font-semibold">Initial Password (min 8 chars)</label>
                        <input type="password" id="usr-pwd" placeholder="••••••••" required minlength="8" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1 font-semibold">Assigned Enterprise Role</label>
                            <select id="usr-role" onchange="toggleClientDropdown(this.value)" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold">
                                <option value="PRODUCTION">🧪 Production Supervisor</option>
                                <option value="WAREHOUSE">🚚 Logistics & Warehouse</option>
                                <option value="ACCOUNTING">💰 Senior Accountant</option>
                                <option value="ADMIN">👑 Operations Manager</option>
                                <option value="CLIENT">🏢 B2B Client Portal</option>
                            </select>
                        </div>
                        <div id="client-select-container" style="display: none;">
                            <label class="block text-slate-600 mb-1 font-semibold">Link to Client Company</label>
                            <select id="usr-client-id" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                                ${clientOptions}
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
                        <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold">Create User Account</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function toggleClientDropdown(role) {
    const container = document.getElementById('client-select-container');
    if (container) {
        container.style.display = (role === 'CLIENT') ? 'block' : 'none';
    }
}

async function submitCreateUser(e) {
    e.preventDefault();
    const name = document.getElementById('usr-name').value;
    const email = document.getElementById('usr-email').value;
    const password = document.getElementById('usr-pwd').value;
    const role = document.getElementById('usr-role').value;
    const client_id = role === 'CLIENT' ? document.getElementById('usr-client-id')?.value : null;

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

// -------------------------------------------------------------
// 12. SUPER ADMIN FACTORY RESET (PRESERVE USERS & ROLES)
// -------------------------------------------------------------
function openResetSystemDataModal() {
    if (NKB.user?.role !== 'SUPER_ADMIN') {
        NKB.showToast('Access Denied: Only Super Admin can perform database resets.', 'error');
        return;
    }

    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-2 border-rose-300 space-y-4">
                <div class="flex justify-between items-center pb-2 border-b border-rose-100">
                    <div class="flex items-center gap-2">
                        <span class="p-2 bg-rose-100 text-rose-700 rounded-xl text-lg">⚠️</span>
                        <div>
                            <h3 class="text-base font-black text-rose-900">Database Factory Reset</h3>
                            <p class="text-[11px] text-rose-600 font-semibold">Clear transactions while preserving all accounts & roles</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>

                <div class="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-2 text-rose-800">
                    <p class="font-bold text-rose-900">This action will permanently delete:</p>
                    <ul class="list-disc pl-5 space-y-0.5 text-[11px]">
                        <li>All Purchase Orders (POs) and Line Items</li>
                        <li>All Job Orders (JOs) & Production Batches</li>
                        <li>All Delivery Receipts (DRs) & Client Signatures</li>
                        <li>All Sales Invoices & Payment Collections</li>
                        <li>All Warehouse Stock counts (reset to 0)</li>
                    </ul>
                    <div class="pt-2 border-t border-rose-200 text-emerald-800 font-bold text-[11px] flex items-center gap-1.5">
                        <span>🛡️</span>
                        <span>PRESERVED: All Users, Staff, RBAC Roles, Clients, and Products will NOT be deleted.</span>
                    </div>
                </div>

                <form onsubmit="submitResetSystemData(event)" class="space-y-3 text-xs font-semibold">
                    <div>
                        <label class="block text-slate-700 mb-1">
                            Type <strong class="text-rose-600 font-mono select-all">CONFIRM-RESET</strong> to verify:
                        </label>
                        <input type="text" id="reset-confirm-keyword" required placeholder="CONFIRM-RESET" class="w-full px-3 py-2 border-2 border-rose-200 rounded-xl bg-slate-50 font-mono text-sm uppercase text-slate-900 focus:border-rose-600 focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-slate-700 mb-1">Enter Super Admin Password:</label>
                        <input type="password" id="reset-admin-password" required placeholder="••••••••" class="w-full px-3 py-2 border rounded-xl bg-slate-50 text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none">
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">
                            Cancel
                        </button>
                        <button type="submit" id="btn-submit-reset" class="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5">
                            <span>🔴 Permanently Reset Database</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitResetSystemData(e) {
    e.preventDefault();
    const keyword = document.getElementById('reset-confirm-keyword').value.trim();
    const password = document.getElementById('reset-admin-password').value;
    const btn = document.getElementById('btn-submit-reset');

    if (keyword !== 'CONFIRM-RESET') {
        NKB.showToast('Please type CONFIRM-RESET exactly as shown.', 'error');
        return;
    }

    if (!password) {
        NKB.showToast('Please enter your Super Admin password.', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Resetting Database...</span>';

    const res = await NKB.api('/api/users/reset-system-data', {
        method: 'POST',
        body: JSON.stringify({
            confirmation_keyword: keyword,
            admin_password: password
        })
    });

    if (res.success) {
        closeModal();
        alert('🎉 ' + res.message);
        window.location.reload();
    } else {
        btn.disabled = false;
        btn.innerHTML = '<span>🔴 Permanently Reset Database</span>';
        NKB.showToast(res.message || res.error || 'Failed to reset database.', 'error');
    }
}

// -------------------------------------------------------------
// 13. UNIVERSAL 360° ORDER & DOCUMENT BACKTRACKING & TRACE
// -------------------------------------------------------------
async function globalBacktrackSearch() {
    const input = document.getElementById('global-backtrack-input');
    const term = input?.value?.trim();
    if (!term) {
        NKB.showToast('Please enter a PO, JO, Batch, DR, or Invoice number to backtrack.', 'warning');
        return;
    }
    openBacktrackModal(term);
}

async function openBacktrackModal(term) {
    if (!term) return;

    const root = document.getElementById('modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] flex flex-col">
                <div class="flex justify-between items-center pb-3 border-b border-slate-100">
                    <div class="flex items-center gap-2">
                        <span class="p-2 bg-indigo-50 text-indigo-700 rounded-xl text-lg">🔍</span>
                        <div>
                            <h3 class="text-base font-black text-slate-900">360° Order Traceability & Backtrack Trail</h3>
                            <p class="text-xs text-slate-500">Searching lineage for <strong class="text-indigo-600 font-mono">${term}</strong></p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
                </div>
                <div id="backtrack-modal-body" class="flex-1 overflow-y-auto pr-1 py-8 text-center text-slate-400">
                    <div class="animate-pulse space-y-3">
                        <div class="text-sm font-bold text-slate-600">Retrieving full document lifecycle...</div>
                        <div class="text-xs text-slate-400">Linking PO ➔ JO ➔ Batches ➔ DR ➔ Invoices ➔ Payments</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const res = await NKB.api(`/api/orders/backtrack/${encodeURIComponent(term)}`);
    const bodyEl = document.getElementById('backtrack-modal-body');
    if (!bodyEl) return;

    if (!res.success || !res.data) {
        bodyEl.innerHTML = `
            <div class="py-12 text-center space-y-3">
                <div class="text-4xl">❌</div>
                <div class="text-base font-bold text-slate-800">No Record Found</div>
                <div class="text-xs text-slate-500 max-w-md mx-auto">${res.message || 'No linked manufacturing record matches this search query.'}</div>
                <button onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">Close</button>
            </div>
        `;
        return;
    }

    const { po, items, jobOrders, batches, deliveries, invoices, payments, auditLogs } = res.data;

    bodyEl.innerHTML = `
        <div class="space-y-6 text-xs text-left text-slate-700">
            <!-- Header Summary Card -->
            <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 rounded font-mono text-[11px] font-bold">PO: ${po.po_number}</span>
                        <span class="text-xs text-slate-300 font-semibold">${NKB.formatDate(po.po_date)}</span>
                    </div>
                    <h2 class="text-lg font-black text-white mt-1">${po.company_name}</h2>
                    <p class="text-[11px] text-slate-300">Contact: ${po.contact_person} (${po.client_phone || 'No phone'}) | Policy: <strong>${po.billing_policy}</strong></p>
                </div>
                <div class="text-right sm:border-l sm:border-slate-700/60 sm:pl-6">
                    <div class="text-[10px] uppercase font-bold text-slate-400">Total PO Value</div>
                    <div class="text-xl font-black text-emerald-400">${NKB.formatCurrency(po.grand_total)}</div>
                    <div class="mt-1">${NKB.renderStatusBadge(po.status)}</div>
                </div>
            </div>

            <!-- Visual Stages Stepper -->
            <div class="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px] font-bold">
                <div class="p-2.5 rounded-xl border ${po ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-slate-50 border-slate-200 text-slate-400'}">
                    <div>🛒 1. PO</div>
                    <div class="text-[10px] font-normal text-slate-500 mt-0.5">${items.length} Products</div>
                </div>
                <div class="p-2.5 rounded-xl border ${jobOrders.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-400'}">
                    <div>⚙️ 2. JO (${jobOrders.length})</div>
                    <div class="text-[10px] font-normal text-slate-500 mt-0.5">${jobOrders.some(j => j.status === 'COMPLETED') ? 'Fulfilled' : 'Scheduled'}</div>
                </div>
                <div class="p-2.5 rounded-xl border ${batches.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-400'}">
                    <div>🧪 3. Batches (${batches.length})</div>
                    <div class="text-[10px] font-normal text-slate-500 mt-0.5">${batches.reduce((acc, b) => acc + (b.actual_yield || 0), 0)} pcs output</div>
                </div>
                <div class="p-2.5 rounded-xl border ${deliveries.length > 0 ? 'bg-purple-50 border-purple-200 text-purple-900' : 'bg-slate-50 border-slate-200 text-slate-400'}">
                    <div>🚚 4. DR (${deliveries.length})</div>
                    <div class="text-[10px] font-normal text-slate-500 mt-0.5">${deliveries.some(d => d.signer_name) ? 'Signed' : 'Dispatched'}</div>
                </div>
                <div class="p-2.5 rounded-xl border ${invoices.length > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-400'}">
                    <div>🧾 5. Invoice (${invoices.length})</div>
                    <div class="text-[10px] font-normal text-slate-500 mt-0.5">${invoices.map(i => i.invoice_number).join(', ') || 'Pending'}</div>
                </div>
                <div class="p-2.5 rounded-xl border ${payments.length > 0 ? 'bg-teal-50 border-teal-200 text-teal-900' : 'bg-slate-50 border-slate-200 text-slate-400'}">
                    <div>💰 6. Payments (${payments.length})</div>
                    <div class="text-[10px] font-normal text-slate-500 mt-0.5">${NKB.formatCurrency(payments.reduce((acc, p) => acc + p.amount, 0))}</div>
                </div>
            </div>

            <!-- Stage 1 & 2: PO Line Items & Job Orders -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- PO Ordered Products -->
                <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span class="font-bold text-slate-900 flex items-center gap-1.5"><span>🛒</span><span>Ordered Products (PO Items)</span></span>
                        <span class="text-[11px] font-bold text-indigo-600">${items.length} Lines</span>
                    </div>
                    <div class="space-y-2">
                        ${items.map(it => `
                            <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                                <div>
                                    <div class="font-bold text-slate-800">${it.product_name}</div>
                                    <div class="text-[10px] text-slate-400 font-mono">SKU: ${it.sku} | Formula: ${it.formula_code || 'Standard'}</div>
                                </div>
                                <div class="text-right">
                                    <div class="font-black text-slate-900">${NKB.formatNumber(it.target_quantity)} pcs</div>
                                    <div class="text-[10px] text-emerald-600 font-bold">${NKB.formatNumber(it.total_delivered_qty)} delivered</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Job Orders -->
                <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span class="font-bold text-slate-900 flex items-center gap-1.5"><span>⚙️</span><span>Linked Job Orders (JO)</span></span>
                        <span class="text-[11px] font-bold text-blue-600">${jobOrders.length} JOs</span>
                    </div>
                    ${jobOrders.length > 0 ? `
                        <div class="space-y-2">
                            ${jobOrders.map(jo => `
                                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                                    <div>
                                        <div class="font-bold text-blue-700 font-mono">${jo.jo_number}</div>
                                        <div class="text-[10px] text-slate-500">${jo.product_name} (${jo.assigned_team || 'Team Alpha'})</div>
                                    </div>
                                    <div class="text-right">
                                        <div class="font-black text-slate-900">${NKB.formatNumber(jo.target_quantity)} pcs</div>
                                        <div class="text-[10px]">${jo.status === 'COMPLETED' ? '<span class="text-emerald-700 font-bold">✅ Completed</span>' : '<span class="text-amber-700 font-bold">⏳ Active</span>'}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `<div class="py-4 text-center text-slate-400 italic">No job orders issued yet.</div>`}
                </div>
            </div>

            <!-- Stage 3 & 4: Batches & Delivery Receipts -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Batches -->
                <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span class="font-bold text-slate-900 flex items-center gap-1.5"><span>🧪</span><span>Production Batches & QC</span></span>
                        <span class="text-[11px] font-bold text-amber-600">${batches.length} Batches</span>
                    </div>
                    ${batches.length > 0 ? `
                        <div class="space-y-2">
                            ${batches.map(b => `
                                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                                    <div>
                                        <div class="font-bold text-amber-800 font-mono">${b.batch_number}</div>
                                        <div class="text-[10px] text-slate-500">Exp: ${NKB.formatDate(b.expiry_date)} | ${b.product_name}</div>
                                    </div>
                                    <div class="text-right">
                                        <div class="font-black text-indigo-700">${NKB.formatNumber(b.actual_yield || 0)} pcs</div>
                                        <div class="text-[10px] text-slate-500">${NKB.renderStatusBadge(b.status)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `<div class="py-4 text-center text-slate-400 italic">No batches brewed yet.</div>`}
                </div>

                <!-- Deliveries & Digital Sign-off -->
                <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span class="font-bold text-slate-900 flex items-center gap-1.5"><span>🚚</span><span>Delivery Receipts & Client Sign-Off</span></span>
                        <span class="text-[11px] font-bold text-purple-600">${deliveries.length} DRs</span>
                    </div>
                    ${deliveries.length > 0 ? `
                        <div class="space-y-2">
                            ${deliveries.map(dr => `
                                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                                    <div class="flex justify-between items-center">
                                        <span class="font-bold text-purple-800 font-mono">${dr.dr_number}</span>
                                        <span class="text-[10px] text-slate-500">${NKB.formatDate(dr.delivery_date)}</span>
                                    </div>
                                    <div class="flex justify-between items-center text-[11px]">
                                        <span class="text-slate-600">Dispatched: <strong>${NKB.formatNumber(dr.total_delivered_qty)} pcs</strong></span>
                                        <span class="text-emerald-700 font-bold">Accepted: ${NKB.formatNumber(dr.total_accepted_qty)} pcs</span>
                                    </div>
                                    ${dr.signer_name ? `
                                        <div class="pt-1.5 border-t border-slate-200/60 text-[10px] text-emerald-800 flex items-center justify-between">
                                            <span>✍️ Signed by: <strong>${dr.signer_name}</strong> (${dr.signer_title || 'Client Authorized'})</span>
                                            <span class="font-mono text-[9px] text-slate-400">${dr.client_signed_at ? NKB.formatDate(dr.client_signed_at) : ''}</span>
                                        </div>
                                    ` : `<div class="text-[10px] text-amber-600 italic">Pending client signature</div>`}
                                </div>
                            `).join('')}
                        </div>
                    ` : `<div class="py-4 text-center text-slate-400 italic">No delivery receipts created yet.</div>`}
                </div>
            </div>

            <!-- Stage 5 & 6: Invoices & Payments -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Sales Invoices -->
                <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span class="font-bold text-slate-900 flex items-center gap-1.5"><span>🧾</span><span>Sales Invoices (SI)</span></span>
                        <span class="text-[11px] font-bold text-emerald-600">${invoices.length} Invoices</span>
                    </div>
                    ${invoices.length > 0 ? `
                        <div class="space-y-2">
                            ${invoices.map(si => `
                                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                                    <div>
                                        <div class="font-bold text-emerald-800 font-mono">${si.invoice_number}</div>
                                        <div class="text-[10px] text-slate-500">Ref: ${si.dr_number || 'DR'} | Due: ${NKB.formatDate(si.due_date)}</div>
                                    </div>
                                    <div class="text-right">
                                        <div class="font-black text-slate-900">${NKB.formatCurrency(si.total_amount)}</div>
                                        <div class="text-[10px] text-rose-600 font-bold">Bal: ${NKB.formatCurrency(si.balance_due)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `<div class="py-4 text-center text-slate-400 italic">No sales invoices generated yet.</div>`}
                </div>

                <!-- Payments -->
                <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span class="font-bold text-slate-900 flex items-center gap-1.5"><span>💰</span><span>Payments & Collections</span></span>
                        <span class="text-[11px] font-bold text-teal-600">${payments.length} Payments</span>
                    </div>
                    ${payments.length > 0 ? `
                        <div class="space-y-2">
                            ${payments.map(pay => `
                                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                                    <div>
                                        <div class="font-bold text-teal-800 font-mono">${pay.payment_number}</div>
                                        <div class="text-[10px] text-slate-500">${pay.payment_method} | Ref: ${pay.reference_number}</div>
                                    </div>
                                    <div class="text-right">
                                        <div class="font-black text-emerald-700">${NKB.formatCurrency(pay.amount)}</div>
                                        <div class="text-[10px] text-slate-400">${NKB.formatDate(pay.payment_date)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `<div class="py-4 text-center text-slate-400 italic">No payments collected yet.</div>`}
                </div>
            </div>

            <!-- Stage 7: Chronological Audit Trail & Event Timeline -->
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span class="font-bold text-slate-900 flex items-center gap-1.5"><span>📜</span><span>Chronological Event History & Audit Trail</span></span>
                    <span class="text-[10px] text-slate-400">${auditLogs.length} Events Recorded</span>
                </div>
                ${auditLogs.length > 0 ? `
                    <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        ${auditLogs.map(log => `
                            <div class="p-2 bg-slate-50 rounded-lg text-[11px] flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span class="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded font-bold text-[9px]">${log.action}</span>
                                    <span class="text-slate-800 font-semibold">${log.user_name || 'System'} (${log.user_role || 'STAFF'})</span>
                                </div>
                                <span class="font-mono text-[10px] text-slate-400">${NKB.formatDate(log.created_at)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : `<div class="py-2 text-center text-slate-400 italic">No audit trail entries for this order.</div>`}
            </div>

            <div class="flex justify-end pt-2 border-t border-slate-100">
                <button onclick="closeModal()" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition">
                    Close Trace View
                </button>
            </div>
        </div>
    `;
}



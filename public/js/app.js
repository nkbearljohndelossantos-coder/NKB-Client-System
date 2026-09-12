/**
 * NKB Manufacturing & Trading - Web Application Core Client JS
 */

const NKB = {
    user: null,
    token: null,

    // Initialize Application
    init: async function() {
        this.token = localStorage.getItem('nkb_token');
        if (this.token) {
            try {
                const res = await this.api('/api/auth/me');
                if (res.success) {
                    this.user = res.user;
                    this.updateHeaderProfile();
                } else {
                    this.logout();
                }
            } catch (err) {
                this.logout();
            }
        }
    },

    // API Helper
    api: async function(url, options = {}) {
        options.headers = options.headers || {};
        options.credentials = options.credentials || 'same-origin';
        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }
        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.body instanceof URLSearchParams)) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        } else if (typeof options.body === 'string' && !(options.body instanceof FormData)) {
            const trimmed = options.body.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
            } else {
                options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/x-www-form-urlencoded';
            }
        }

        try {
            const res = await fetch(url, options);
            const contentType = res.headers.get('content-type') || '';
            const data = contentType.includes('application/json')
                ? await res.json()
                : { success: false, error: `Request failed (${res.status})` };
            if (res.status === 401 && !url.includes('/api/auth/login')) {
                NKB.logout();
                return { success: false, error: 'Session expired. Please log in again.' };
            }
            if (!data.success && !data.error && data.message) {
                data.error = data.message;
            }
            return data;
        } catch (err) {
            console.error('API Error:', err);
            return { success: false, error: err.message || 'Network connection failed.' };
        }
    },

    // Toast Notification System
    showToast: function(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="text-lg">${icons[type] || 'ℹ️'}</span>
            <div class="flex-1">${message}</div>
            <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 300);
            }
        }, 4000);
    },

    // Currency Formatter (PHP ₱)
    formatCurrency: function(val) {
        if (val === undefined || val === null || isNaN(val)) return '₱0.00';
        return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    // Number Formatter
    formatNumber: function(val) {
        if (val === undefined || val === null || isNaN(val)) return '0';
        return Number(val).toLocaleString('en-PH');
    },

    // Date Formatter
    formatDate: function(dateStr) {
        if (!dateStr) return '-';
        if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const parts = dateStr.split('-');
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        const cleanStr = typeof dateStr === 'string' && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
        const d = new Date(cleanStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    },

    // Format Time (e.g. 05:17:00 PM)
    formatTime: function(dateStr) {
        if (!dateStr) return '';
        const cleanStr = typeof dateStr === 'string' && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
        const d = new Date(cleanStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    },

    // Format Date and Time (e.g. Sep 11, 2026, 05:17:00 PM)
    formatDateTime: function(dateStr, includeSeconds = true) {
        if (!dateStr) return '-';
        const cleanStr = typeof dateStr === 'string' && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
        const d = new Date(cleanStr);
        if (isNaN(d.getTime())) return dateStr;
        const opts = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
        if (includeSeconds) opts.second = '2-digit';
        return d.toLocaleDateString('en-PH', opts);
    },

    // Status Badge Helper
    renderStatusBadge: function(status) {
        const map = {
            'DRAFT': 'bg-gray-100 text-gray-700 border border-gray-300',
            'PENDING_APPROVAL': 'bg-amber-50 text-amber-700 border border-amber-300',
            'APPROVED': 'bg-emerald-50 text-emerald-700 border border-emerald-300',
            'IN_PRODUCTION': 'bg-blue-50 text-blue-700 border border-blue-300',
            'PARTIALLY_DELIVERED': 'bg-purple-50 text-purple-700 border border-purple-300',
            'COMPLETED': 'bg-emerald-100 text-emerald-800 border border-emerald-400',
            'CANCELLED': 'bg-red-50 text-red-700 border border-red-300',
            'MIXING': 'bg-sky-50 text-sky-700 border border-sky-300',
            'BOTTLING': 'bg-indigo-50 text-indigo-700 border border-indigo-300',
            'QC_PASSED': 'bg-emerald-50 text-emerald-700 border border-emerald-300',
            'APPROVED_FOR_DISPATCH': 'bg-teal-50 text-teal-800 border border-teal-300',
            'EXCEPTION_REQUIRES_APPROVAL': 'badge-exception font-bold',
            'PENDING_CLIENT_ACCEPTANCE': 'bg-amber-100 text-amber-800 border border-amber-400',
            'ACCEPTED': 'bg-emerald-100 text-emerald-800 border border-emerald-400',
            'INVOICED': 'bg-cyan-100 text-cyan-800 border border-cyan-400',
            'UNPAID': 'bg-rose-50 text-rose-700 border border-rose-300',
            'PARTIALLY_PAID': 'bg-amber-50 text-amber-700 border border-amber-300',
            'PAID': 'bg-emerald-100 text-emerald-800 border border-emerald-400',
            'OVERDUE': 'bg-red-100 text-red-800 border border-red-400 font-bold',
            'AVAILABLE': 'bg-emerald-50 text-emerald-700 border border-emerald-300',
            'RESERVED': 'bg-blue-50 text-blue-700 border border-blue-300'
        };

        const css = map[status] || 'bg-gray-100 text-gray-700 border border-gray-300';
        return `<span class="badge ${css}">${status ? status.replace(/_/g, ' ') : '-'}</span>`;
    },

    // Yield Variance Badge
    renderVarianceBadge: function(varianceQty, variancePercent) {
        if (varianceQty > 0) {
            return `<span class="badge badge-overrun">OVER-RUN +${NKB.formatNumber(varianceQty)} (${variancePercent > 0 ? '+' : ''}${variancePercent}%)</span>`;
        } else if (varianceQty < 0) {
            return `<span class="badge badge-underrun">UNDER-RUN ${NKB.formatNumber(varianceQty)} (${variancePercent}%)</span>`;
        } else {
            return `<span class="badge badge-exact">EXACT 0 (0%)</span>`;
        }
    },

    // Update Profile In Top Navigation
    updateHeaderProfile: function() {
        const nameEl = document.getElementById('nav-user-name');
        const roleEl = document.getElementById('nav-user-role');
        const companyEl = document.getElementById('nav-company-name');

        if (nameEl && this.user) nameEl.textContent = this.user.name;
        if (roleEl && this.user) roleEl.textContent = this.user.role.replace(/_/g, ' ');
        if (companyEl && this.user && this.user.companyName) companyEl.textContent = this.user.companyName;
    },

    // Logout
    logout: async function() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {}
        localStorage.removeItem('nkb_token');
        localStorage.removeItem('nkb_user');
        window.location.href = '/index.html';
    }
};

async function openViewPOModal(poId) {
    const root = document.getElementById('modals-root') || document.getElementById('client-modals-root');
    if (!root) return;

    // Loading indicator
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl p-6 shadow-2xl flex items-center gap-3 text-slate-700 font-bold text-sm">
                <span class="animate-spin text-xl">⏳</span>
                <span>Loading Purchase Order details...</span>
            </div>
        </div>
    `;

    const res = await NKB.api(`/api/orders/${poId}`);
    if (!res.success || !res.data) {
        NKB.showToast(res.error || 'Failed to load purchase order details.', 'error');
        closeModal();
        return;
    }

    const po = res.data;
    const items = po.items || [];
    const jobOrders = po.jobOrders || [];
    const deliveries = po.deliveries || [];
    const invoices = po.invoices || [];

    let totalDelivered = 0;
    let totalTarget = 0;

    const isClient = NKB.user ? (NKB.user.role === 'CLIENT') : window.location.pathname.includes('client');
    const canStartJO = !isClient && (po.status === 'APPROVED' || po.status === 'IN_PRODUCTION');

    const itemsRows = items.map((item, idx) => {
        totalTarget += item.target_quantity;
        const delivered = item.actual_delivered_total || item.delivered_quantity || 0;
        totalDelivered += delivered;
        const prodId = item.product_id || item.id;

        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-3 text-center text-slate-400 font-bold">${idx + 1}</td>
                <td class="py-3 px-3">
                    <div class="font-bold text-slate-900">${item.product_name}</div>
                    <div class="text-[10px] text-slate-400 font-mono">SKU: ${item.sku}</div>
                </td>
                <td class="py-3 px-3 text-center"><span class="badge bg-slate-100 text-slate-700 font-mono text-[10px]">${item.formula_code || 'FORM-2026-V1'}</span></td>
                <td class="py-3 px-3 text-center text-slate-600">${item.shelf_life_months || 24} mos</td>
                <td class="py-3 px-3 text-center font-bold text-slate-900 font-mono">${NKB.formatNumber(item.target_quantity)} ${item.unit || 'pcs'}</td>
                <td class="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">${NKB.formatNumber(item.min_allowed_quantity)} – ${NKB.formatNumber(item.max_allowed_quantity)}</td>
                <td class="py-3 px-3 text-right font-bold text-indigo-900 font-mono">₱${Number(item.unit_price).toFixed(2)}</td>
                <td class="py-3 px-3 text-right font-extrabold text-slate-900 font-mono">${NKB.formatCurrency(item.subtotal)}</td>
                <td class="py-3 px-3 text-center font-semibold font-mono ${delivered >= item.target_quantity ? 'text-emerald-700' : (delivered > 0 ? 'text-indigo-700' : 'text-slate-400')}">
                    ${NKB.formatNumber(delivered)} / ${NKB.formatNumber(item.target_quantity)}
                </td>
                ${canStartJO ? `
                    <td class="py-3 px-3 text-center whitespace-nowrap">
                        <button onclick="if (typeof openCreateJOModal === 'function') { closeModal(); openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name.replace(/'/g, "\\'")}', '${prodId}', ${item.target_quantity}); } else { window.location.href = '/admin.html'; }" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold shadow-sm transition inline-flex items-center gap-1" title="Start Job Order for ${item.product_name}">
                            <span>🏭 Start JO</span>
                        </button>
                    </td>
                ` : ''}
            </tr>
        `;
    }).join('');

    const productCardsHtml = items.map((item, idx) => {
        const delivered = item.actual_delivered_total || item.delivered_quantity || 0;
        const lineSubtotal = item.subtotal || ((item.target_quantity || 0) * (item.unit_price || 0));
        const pctDelivered = item.target_quantity > 0 ? Math.min(100, Math.round((delivered / item.target_quantity) * 100)) : 0;
        const prodId = item.product_id || item.id;

        return `
            <div class="bg-white border-2 border-slate-200 hover:border-indigo-300 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3.5 transition">
                <!-- Top Header: Product Name, SKU, Category, Fixed Price, Subtotal -->
                <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2.5">
                        <span class="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-xs flex-shrink-0">
                            #${idx + 1}
                        </span>
                        <div>
                            <h4 class="font-extrabold text-slate-900 text-sm leading-tight">${item.product_name}</h4>
                            <div class="flex items-center gap-2 mt-0.5">
                                <span class="font-mono text-xs text-indigo-600 font-bold">SKU: ${item.sku}</span>
                                <span class="text-slate-300">•</span>
                                <span class="badge bg-slate-100 text-slate-700 text-[10px]">${item.category || 'Cosmetics'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                        <span class="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-900 flex items-center gap-1.5">
                            <span>₱${Number(item.unit_price).toFixed(2)}</span>
                            <span class="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Fixed Contract Price</span>
                        </span>
                        <span class="px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-mono font-black text-indigo-900">
                            Subtotal: ${NKB.formatCurrency(lineSubtotal)}
                        </span>
                        ${canStartJO ? `
                            <button onclick="if (typeof openCreateJOModal === 'function') { closeModal(); openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name.replace(/'/g, "\\'")}', '${prodId}', ${item.target_quantity}); } else { window.location.href = '/admin.html'; }" class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5" title="Start Job Order for ${item.product_name}">
                                <span>🏭 Start Job Order</span>
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- 4 Specifications Badges -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-0.5">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Formulation Code</span>
                        <div class="font-mono font-black text-slate-800 flex items-center gap-1.5">
                            <span>🧪</span><span>${item.formula_code || 'FORM-2026-V1'}</span>
                        </div>
                    </div>
                    <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-0.5">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Shelf Life</span>
                        <div class="font-bold text-slate-800 flex items-center gap-1.5">
                            <span>📅</span><span>${item.shelf_life_months || 24} Months</span>
                        </div>
                    </div>
                    <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-0.5">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Target Quantity</span>
                        <div class="font-mono font-black text-slate-900 flex items-center gap-1.5">
                            <span>📦</span><span>${NKB.formatNumber(item.target_quantity)} ${item.unit || 'pcs'}</span>
                        </div>
                    </div>
                    <div class="p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-0.5">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-500 block">Tolerance Bounds (±${po.tolerance_percent}%)</span>
                        <div class="font-mono font-extrabold text-indigo-950 text-[11px]">
                            ${NKB.formatNumber(item.min_allowed_quantity)} – ${NKB.formatNumber(item.max_allowed_quantity)} pcs
                        </div>
                    </div>
                </div>

                <!-- Cleanroom Production & Lineage Details -->
                <div class="p-3 bg-slate-50/80 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div class="flex flex-wrap justify-between items-center gap-1 text-[11px]">
                        <span class="font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                            <span>🏭</span><span>Cleanroom Production & Staff Assignment</span>
                        </span>
                        <div class="flex items-center gap-1.5">
                            ${item.jo_number ? `<span class="badge bg-indigo-100 text-indigo-800 font-mono font-bold">${item.jo_number} (${item.jo_status || 'SCHEDULED'})</span>` : '<span class="badge bg-slate-100 text-slate-500 font-medium">Pending JO</span>'}
                            ${item.batch_number ? `<span class="badge bg-purple-100 text-purple-800 font-mono font-bold">${item.batch_number}</span>` : ''}
                            ${canStartJO ? `
                                <button onclick="if (typeof openCreateJOModal === 'function') { closeModal(); openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name.replace(/'/g, "\\'")}', '${prodId}', ${item.target_quantity}); } else { window.location.href = '/admin.html'; }" class="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[10px] font-bold shadow-sm transition flex items-center gap-1" title="Start Job Order for this product">
                                    <span>🏭 Start JO</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5 text-[11px]">
                        <div class="bg-white p-2 rounded-lg border border-slate-200">
                            <span class="text-[9px] text-slate-400 uppercase font-bold block">Compounding Operator</span>
                            <div class="font-bold text-slate-800 mt-0.5 flex items-center gap-1 truncate" title="${item.compounding_operator || 'To be assigned in Cleanroom'}">
                                <span>👨‍🔬</span><span>${item.compounding_operator || 'Cleanroom Staff'}</span>
                            </div>
                            ${item.line_assignment ? `<div class="text-[10px] text-slate-500 mt-0.5">Line: ${item.line_assignment}</div>` : ''}
                        </div>
                        <div class="bg-white p-2 rounded-lg border border-slate-200">
                            <span class="text-[9px] text-slate-400 uppercase font-bold block">Bottling & Packaging Lead</span>
                            <div class="font-bold text-slate-800 mt-0.5 flex items-center gap-1 truncate" title="${item.bottling_lead || 'To be assigned in Packaging'}">
                                <span>🧴</span><span>${item.bottling_lead || 'Bottling Team'}</span>
                            </div>
                            ${item.assigned_team ? `<div class="text-[10px] text-slate-500 mt-0.5">Team: ${item.assigned_team}</div>` : ''}
                        </div>
                        <div class="bg-white p-2 rounded-lg border border-slate-200">
                            <span class="text-[9px] text-slate-400 uppercase font-bold block">QC & Release Inspector</span>
                            <div class="font-bold text-slate-800 mt-0.5 flex items-center gap-1 truncate" title="${item.qc_inspector || 'To be inspected by Quality Control'}">
                                <span>🔬</span><span>${item.qc_inspector || 'Quality Control Staff'}</span>
                            </div>
                            ${item.actual_yield ? `<div class="text-[10px] font-mono text-indigo-700 font-bold mt-0.5">Yield: ${NKB.formatNumber(item.actual_yield)} pcs (${item.variance_percent > 0 ? '+' : ''}${item.variance_percent}%)</div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Fulfillment Bar -->
                <div class="space-y-1 pt-0.5">
                    <div class="flex justify-between items-center text-[11px]">
                        <span class="text-slate-500 font-semibold">Delivery Fulfillment:</span>
                        <span class="font-mono font-bold ${delivered >= item.target_quantity ? 'text-emerald-700' : 'text-slate-700'}">
                            ${NKB.formatNumber(delivered)} / ${NKB.formatNumber(item.target_quantity)} ${item.unit || 'pcs'} (${pctDelivered}%)
                        </span>
                    </div>
                    <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div class="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" style="width: ${pctDelivered}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8 max-h-[92vh] flex flex-col">
                <!-- Header -->
                <div class="flex justify-between items-center border-b border-slate-100 pb-4 flex-shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">📋</span>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-xl font-black text-slate-900 font-mono">${po.po_number}</h3>
                                ${NKB.renderStatusBadge(po.status)}
                            </div>
                            <p class="text-xs text-slate-500">Purchase Order Details & Manufacturing Specifications</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <a href="/print-jo.html?po_id=${po.id}" target="_blank" class="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm" title="Print Job Order / Sales Order (2 copies on A4)">
                            <span>🖨️ Print SO/JO</span>
                        </a>
                        <a href="/print-po.html?id=${po.id}" target="_blank" class="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                            <span>🖨️ Print PO</span>
                        </a>
                        <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-xl px-2">&times;</button>
                    </div>
                </div>

                <!-- Scrollable Body -->
                <div class="space-y-6 overflow-y-auto flex-1 pr-1 text-xs">
                    <!-- General Specs Grid -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                        <div class="space-y-1">
                            <span class="text-[10px] uppercase font-bold text-slate-400">Buyer / Client</span>
                            <div class="font-extrabold text-sm text-slate-900">${po.company_name}</div>
                            <div class="text-slate-600 font-medium">${po.contact_person ? 'Attn: ' + po.contact_person : ''}</div>
                            <div class="text-slate-500 text-[11px] leading-relaxed">${po.client_address || ''}</div>
                            <div class="text-slate-500 text-[11px]">${po.client_email || ''} ${po.client_phone ? '• ' + po.client_phone : ''}</div>
                            ${po.client_tin ? `<div class="text-[11px] font-mono text-slate-500">TIN: ${po.client_tin}</div>` : ''}
                        </div>
                        <div class="space-y-1">
                            <span class="text-[10px] uppercase font-bold text-slate-400">Timeline & Personnel</span>
                            <div>Order Date: <strong class="text-slate-800">${NKB.formatDate(po.po_date || po.created_at)}</strong></div>
                            <div>Target Delivery: <strong class="text-slate-800">${po.expected_delivery_date ? NKB.formatDate(po.expected_delivery_date) : 'As Scheduled'}</strong></div>
                            <div>Created By: <strong class="text-slate-700">${po.creator_name || 'System'}</strong></div>
                            ${po.approver_name ? `<div>Approved By: <strong class="text-emerald-700">${po.approver_name}</strong></div>` : ''}
                            ${po.approved_at ? `<div class="text-[11px] text-slate-500">Approved Date: ${NKB.formatDate(po.approved_at)}</div>` : ''}
                        </div>
                        <div class="space-y-1">
                            <span class="text-[10px] uppercase font-bold text-slate-400">Contract & Tolerance Policy</span>
                            <div>Tolerance Limit: <strong class="text-indigo-700 font-bold">±${po.tolerance_percent}%</strong></div>
                            <div>Billing Policy: <span class="badge ${po.billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}">${po.billing_policy}</span></div>
                            <div class="text-[10px] text-slate-500 mt-1 leading-normal">
                                ${po.billing_policy === 'ACTUAL_DELIVERY' ? 'Over/under runs within tolerance are billed based on actual accepted units.' : 'Fixed PO quantity is billed; overruns reserved as buffer stock.'}
                            </div>
                        </div>
                    </div>

                    ${po.notes ? `
                        <div class="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl text-slate-700">
                            <strong class="text-amber-900 block text-xs mb-0.5">📝 Packaging & Formulation Notes:</strong>
                            <p class="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">${po.notes}</p>
                        </div>
                    ` : ''}

                    <!-- Separated Products Breakdown & Revealed Information -->
                    <div class="space-y-4">
                        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                            <div>
                                <h4 class="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                                    <span>📦</span><span>Individual Product Specifications & Lineage (${items.length})</span>
                                </h4>
                                <p class="text-[11px] text-slate-500">Every ordered cosmetic product with technical formulation, fixed price, and cleanroom assignments</p>
                            </div>
                            <span class="text-slate-500 text-xs">Delivered: <strong class="text-indigo-900 font-bold font-mono">${NKB.formatNumber(totalDelivered)}</strong> of <strong class="font-mono">${NKB.formatNumber(totalTarget)} pcs</strong> (${totalTarget > 0 ? Math.round((totalDelivered / totalTarget) * 100) : 0}%)</span>
                        </div>

                        <!-- Individual Separated Product Cards with Revealed Information -->
                        <div class="space-y-3.5">
                            ${productCardsHtml}
                        </div>

                        <!-- Consolidated Overview Summary Table -->
                        <div class="border border-slate-200 rounded-2xl overflow-x-auto bg-white shadow-sm mt-4">
                            <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center justify-between">
                                <span>📋 Consolidated Line Item Overview</span>
                                <span class="text-[11px] font-mono text-slate-500 font-normal">±${po.tolerance_percent}% Manufacturing Tolerance</span>
                            </div>
                            <table class="w-full text-left">
                                <thead class="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                                    <tr>
                                        <th class="py-2.5 px-3 text-center w-10">#</th>
                                        <th class="py-2.5 px-3">Product Name & SKU</th>
                                        <th class="py-2.5 px-3 text-center">Formula Code</th>
                                        <th class="py-2.5 px-3 text-center">Shelf Life</th>
                                        <th class="py-2.5 px-3 text-center">Target Qty</th>
                                        <th class="py-2.5 px-3 text-center">Tolerance Range</th>
                                        <th class="py-2.5 px-3 text-right">Fixed Price</th>
                                        <th class="py-2.5 px-3 text-right">Line Total</th>
                                        <th class="py-2.5 px-3 text-center">Delivered</th>
                                        ${canStartJO ? `<th class="py-2.5 px-3 text-center">Action</th>` : ''}
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 font-medium text-xs">
                                    ${itemsRows}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Financial Breakdown -->
                    <div class="flex justify-end">
                        <div class="w-72 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 font-semibold">
                            <div class="flex justify-between text-slate-600">
                                <span>Subtotal:</span>
                                <span class="font-bold text-slate-900 font-mono">${NKB.formatCurrency(po.subtotal)}</span>
                            </div>
                            <div class="flex justify-between text-slate-600">
                                <span>Tax (${po.tax_percent || 0}%):</span>
                                <span class="font-bold text-slate-900 font-mono">${NKB.formatCurrency(po.tax_amount || 0)}</span>
                            </div>
                            <div class="flex justify-between text-base font-extrabold text-indigo-950 pt-2 border-t border-slate-200">
                                <span>Grand Total:</span>
                                <span class="font-mono text-indigo-700 font-black">${NKB.formatCurrency(po.grand_total)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Traceability (Linked Job Orders, DRs, Invoices) -->
                    ${(jobOrders.length > 0 || deliveries.length > 0 || invoices.length > 0) ? `
                        <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                            <h4 class="font-bold text-slate-900 uppercase text-[11px] tracking-wider">🏭 Production, Delivery & Billing Pipeline</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                                <div>
                                    <span class="font-bold text-slate-700 block mb-1">Job Orders (${jobOrders.length}):</span>
                                    ${jobOrders.length > 0 ? `
                                        <ul class="space-y-1">
                                            ${jobOrders.map(j => `<li class="font-mono bg-white p-2 rounded-lg border border-slate-200 flex justify-between items-center"><div><strong>${j.jo_number}</strong><br><span class="text-[10px] text-slate-500">${NKB.formatNumber(j.target_quantity)} pcs • ${j.status}</span></div><a href="/print-jo.html?id=${j.id}" target="_blank" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold transition inline-flex items-center gap-1" title="Print this Job Order">🖨️ Print</a></li>`).join('')}
                                        </ul>
                                    ` : '<span class="text-slate-400">None yet</span>'}
                                </div>
                                <div>
                                    <span class="font-bold text-slate-700 block mb-1">Delivery Receipts (${deliveries.length}):</span>
                                    ${deliveries.length > 0 ? `
                                        <ul class="space-y-1">
                                            ${deliveries.map(d => `<li class="font-mono bg-white p-2 rounded-lg border border-slate-200"><strong>${d.dr_number}</strong><br><span class="text-[10px] text-slate-500">${NKB.formatNumber(d.total_delivered || 0)} pcs • ${d.status}</span></li>`).join('')}
                                        </ul>
                                    ` : '<span class="text-slate-400">None yet</span>'}
                                </div>
                                <div>
                                    <span class="font-bold text-slate-700 block mb-1">Sales Invoices (${invoices.length}):</span>
                                    ${invoices.length > 0 ? `
                                        <ul class="space-y-1">
                                            ${invoices.map(i => `<li class="font-mono bg-white p-2 rounded-lg border border-slate-200"><strong>${i.invoice_number}</strong><br><span class="text-[10px] text-slate-500">${NKB.formatCurrency(i.total_amount)} • ${i.payment_status}</span></li>`).join('')}
                                        </ul>
                                    ` : '<span class="text-slate-400">None yet</span>'}
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Footer Actions -->
                <div class="flex justify-between items-center pt-3 border-t border-slate-100 flex-shrink-0">
                    <div class="flex items-center gap-2">
                        ${(jobOrders.length === 0 && (!po.status || po.status === 'PENDING_APPROVAL' || po.status === 'APPROVED' || po.status === 'DRAFT')) ? `
                            <button onclick="closeModal(); openEditPOModal('${po.id}');" class="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 rounded-xl font-bold text-xs shadow-sm transition inline-flex items-center gap-1.5" title="Edit PO before entering JO">
                                <span>✏️ Edit PO</span>
                            </button>
                        ` : ''}
                        ${(NKB.user && (NKB.user.role === 'ADMIN' || NKB.user.role === 'SUPER_ADMIN') && po.status === 'PENDING_APPROVAL') ? `
                            <button onclick="approvePO('${po.id}', '${po.po_number}'); closeModal();" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-sm transition">
                                Approve Order
                            </button>
                        ` : ''}
                        ${(NKB.user && (NKB.user.role === 'ADMIN' || NKB.user.role === 'SUPER_ADMIN') && (po.status === 'APPROVED' || po.status === 'IN_PRODUCTION')) ? `
                            <button onclick="closeModal(); openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name.replace(/'/g, "\\'")}');" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-sm transition">
                                + Create Job Order
                            </button>
                        ` : ''}
                    </div>
                    <div class="flex items-center gap-2">
                        <a href="/print-po.html?id=${po.id}" target="_blank" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-600/30 transition flex items-center gap-1.5">
                            <span>🖨️ Print Purchase Order</span>
                        </a>
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function closeModal() {
    const root = document.getElementById('modals-root') || document.getElementById('client-modals-root');
    if (root) root.innerHTML = '';
}

// -------------------------------------------------------------
// EDIT PURCHASE ORDER (BEFORE ENTERING JO)
// -------------------------------------------------------------
let editPOLineItems = [];
let editPOCatalog = [];
let editingPOId = null;

async function openEditPOModal(poId) {
    const root = document.getElementById('modals-root') || document.getElementById('client-modals-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl p-6 shadow-2xl flex items-center gap-3 text-slate-700 font-bold text-sm">
                <span class="animate-spin text-xl">⏳</span>
                <span>Loading Purchase Order details for editing...</span>
            </div>
        </div>
    `;

    const res = await NKB.api(`/api/orders/${poId}`);
    if (!res.success || !res.data) {
        NKB.showToast(res.error || 'Failed to load order details.', 'error');
        closeModal();
        return;
    }

    const po = res.data;

    // Verify before entering JO
    if (po.jobOrders && po.jobOrders.length > 0) {
        NKB.showToast('Cannot edit Purchase Order: A Job Order (JO) has already been created for this order.', 'error');
        closeModal();
        return;
    }

    editingPOId = poId;

    // Fetch client product catalog
    const catRes = await NKB.api(`/api/products?clientId=${po.client_id}&assignedOnly=true`);
    editPOCatalog = (catRes.success && catRes.data) ? catRes.data.slice() : [];

    // Ensure all products currently on the PO exist in editPOCatalog
    if (po.items && po.items.length > 0) {
        po.items.forEach(it => {
            if (!editPOCatalog.some(p => p.id === it.product_id)) {
                editPOCatalog.push({
                    id: it.product_id,
                    name: it.product_name,
                    sku: it.sku,
                    effective_sku: it.sku,
                    default_price: it.unit_price,
                    has_custom_price: true,
                    unit: it.unit || 'pcs'
                });
            }
        });
    }

    editPOLineItems = (po.items || []).map(it => ({
        product_id: it.product_id,
        target_quantity: it.target_quantity,
        unit_price: Number(it.unit_price || 0)
    }));

    if (editPOLineItems.length === 0 && editPOCatalog.length > 0) {
        editPOLineItems.push({
            product_id: editPOCatalog[0].id,
            target_quantity: 1000,
            unit_price: Number(editPOCatalog[0].default_price || 0)
        });
    }

    const poDateFormatted = po.po_date ? (po.po_date.includes('T') ? po.po_date.split('T')[0] : po.po_date) : '';
    const deliveryDateFormatted = po.expected_delivery_date ? (po.expected_delivery_date.includes('T') ? po.expected_delivery_date.split('T')[0] : po.expected_delivery_date) : '';

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3 flex-shrink-0">
                    <div>
                        <div class="flex items-center gap-2">
                            <h3 class="text-lg font-bold text-slate-900">Edit Purchase Order</h3>
                            <span class="px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-bold text-xs">${po.po_number}</span>
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Pre-JO State</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">Modify line items, quantities, and delivery date before entering Job Order</p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>
                
                <form id="form-edit-po" onsubmit="submitEditPO(event)" class="space-y-4 text-xs font-semibold flex-1 overflow-y-auto pr-1">
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Client / Buyer</label>
                            <div class="px-3 py-2 border rounded-xl bg-slate-100 text-slate-800 font-bold">
                                ${po.company_name}
                            </div>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Order Date</label>
                            <input type="date" id="edit-po-date" value="${poDateFormatted}" class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Target Delivery Date</label>
                            <input type="date" id="edit-po-delivery-date" value="${deliveryDateFormatted}" class="w-full px-3 py-2 border rounded-xl bg-white font-medium text-slate-900">
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Agreed Tolerance</label>
                            <div class="px-3 py-2 border rounded-xl bg-slate-100 text-slate-800 font-bold">
                                ±${po.tolerance_percent}%
                            </div>
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Billing Policy</label>
                            <select id="edit-po-billing-policy" class="w-full px-3 py-2 border rounded-xl bg-slate-50 font-bold">
                                <option value="ACTUAL_DELIVERY" ${po.billing_policy === 'ACTUAL_DELIVERY' ? 'selected' : ''}>Option A: Bill Actual Delivered</option>
                                <option value="FIXED_PO_BUFFER" ${po.billing_policy === 'FIXED_PO_BUFFER' ? 'selected' : ''}>Option B: Fixed PO + Buffer Stock</option>
                            </select>
                        </div>
                    </div>

                    <!-- Line Items Section -->
                    <div class="space-y-2 pt-2 border-t border-slate-100">
                        <div class="flex justify-between items-center">
                            <span class="text-xs font-bold uppercase tracking-wider text-slate-700">Order Products (Line Items)</span>
                            <button type="button" onclick="addEditPOLineItem()" class="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition flex items-center gap-1">
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
                                <tbody id="edit-po-lines-body" class="divide-y divide-slate-100 font-medium">
                                    <!-- Dynamic Rows -->
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Summary & Totals -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <div>
                            <label class="block text-slate-600 mb-1">Packaging / Batch Notes</label>
                            <textarea id="edit-po-notes" rows="2" placeholder="Formulation variants, packaging specifics..." class="w-full px-3 py-2 border rounded-xl bg-white">${po.notes || ''}</textarea>
                        </div>
                        <div class="space-y-1.5 text-right flex flex-col justify-center">
                            <div class="text-slate-500">Total Items: <strong id="edit-po-total-items" class="text-slate-900">0</strong></div>
                            <div class="text-slate-500">Total Target Quantity: <strong id="edit-po-total-qty" class="text-slate-900">0 pcs</strong></div>
                            <div class="text-base font-extrabold text-indigo-900 pt-1 border-t border-slate-200">Grand Total: <span id="edit-po-grand-total">₱0.00</span></div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 flex-shrink-0">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
                        <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    renderEditPOLineItems();
}

function renderEditPOLineItems() {
    const tbody = document.getElementById('edit-po-lines-body');
    if (!tbody) return;

    if (editPOCatalog.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-amber-600 font-medium bg-amber-50/50 rounded-lg">⚠️ No products available in this client's catalog.</td></tr>`;
        const elTotalItems = document.getElementById('edit-po-total-items');
        if (elTotalItems) elTotalItems.textContent = '0';
        const elTotalQty = document.getElementById('edit-po-total-qty');
        if (elTotalQty) elTotalQty.textContent = '0 pcs';
        const elGrandTotal = document.getElementById('edit-po-grand-total');
        if (elGrandTotal) elGrandTotal.textContent = '₱0.00';
        return;
    }

    let totalQty = 0;
    let grandTotal = 0;

    tbody.innerHTML = editPOLineItems.map((item, idx) => {
        const lineSubtotal = (item.target_quantity || 0) * (item.unit_price || 0);
        totalQty += item.target_quantity || 0;
        grandTotal += lineSubtotal;

        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-2.5 px-3">
                    <select onchange="updateEditPOLineItem(${idx}, 'product_id', this.value)" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium">
                        ${editPOCatalog.map(p => `
                            <option value="${p.id}" ${p.id === item.product_id ? 'selected' : ''}>
                                ${p.name} (${p.effective_sku || p.sku}) - ₱${Number(p.default_price).toFixed(2)}${p.has_custom_price ? ' [Contract Rate]' : ''}
                            </option>
                        `).join('')}
                    </select>
                </td>
                <td class="py-2.5 px-3">
                    <input type="number" min="1" step="1" 
                           value="${item.target_quantity}" 
                           oninput="updateEditPOLineItem(${idx}, 'target_quantity', this.value)" 
                           class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                </td>
                <td class="py-2.5 px-3">
                    <div class="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 font-mono flex items-center justify-between">
                        <span>₱${Number(item.unit_price || 0).toFixed(2)}</span>
                        <span class="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Fixed</span>
                    </div>
                </td>
                <td id="edit-po-line-total-${idx}" class="py-2.5 px-3 font-extrabold text-slate-900 font-mono">
                    ${NKB.formatCurrency(lineSubtotal)}
                </td>
                <td class="py-2.5 px-2 text-center">
                    <button type="button" onclick="removeEditPOLineItem(${idx})" class="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition" title="Remove line">
                        ✖
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    const elTotalItems = document.getElementById('edit-po-total-items');
    if (elTotalItems) elTotalItems.textContent = editPOLineItems.length;
    const elTotalQty = document.getElementById('edit-po-total-qty');
    if (elTotalQty) elTotalQty.textContent = `${NKB.formatNumber(totalQty)} pcs`;
    const elGrandTotal = document.getElementById('edit-po-grand-total');
    if (elGrandTotal) elGrandTotal.textContent = NKB.formatCurrency(grandTotal);
}

function addEditPOLineItem() {
    if (editPOCatalog.length === 0) return;
    const defaultProd = editPOCatalog[0];
    editPOLineItems.push({
        product_id: defaultProd.id,
        target_quantity: 1000,
        unit_price: Number(defaultProd.default_price || 0)
    });
    renderEditPOLineItems();
}

function removeEditPOLineItem(index) {
    editPOLineItems.splice(index, 1);
    if (editPOLineItems.length === 0 && editPOCatalog.length > 0) {
        addEditPOLineItem();
    } else {
        renderEditPOLineItems();
    }
}

function updateEditPOLineItem(index, field, value) {
    if (!editPOLineItems[index]) return;
    if (field === 'product_id') {
        const prod = editPOCatalog.find(p => p.id === value);
        editPOLineItems[index].product_id = value;
        if (prod) {
            editPOLineItems[index].unit_price = Number(prod.default_price || 0);
        }
        renderEditPOLineItems();
        return;
    } else if (field === 'target_quantity') {
        editPOLineItems[index].target_quantity = parseInt(value, 10) || 0;
    }

    const lineSubtotal = (editPOLineItems[index].target_quantity || 0) * (editPOLineItems[index].unit_price || 0);
    const lineTotalEl = document.getElementById(`edit-po-line-total-${index}`);
    if (lineTotalEl) lineTotalEl.textContent = NKB.formatCurrency(lineSubtotal);

    let totalQty = 0;
    let grandTotal = 0;
    editPOLineItems.forEach(item => {
        totalQty += item.target_quantity || 0;
        grandTotal += (item.target_quantity || 0) * (item.unit_price || 0);
    });

    const elTotalItems = document.getElementById('edit-po-total-items');
    if (elTotalItems) elTotalItems.textContent = editPOLineItems.length;
    const elTotalQty = document.getElementById('edit-po-total-qty');
    if (elTotalQty) elTotalQty.textContent = `${NKB.formatNumber(totalQty)} pcs`;
    const elGrandTotal = document.getElementById('edit-po-grand-total');
    if (elGrandTotal) elGrandTotal.textContent = NKB.formatCurrency(grandTotal);
}

async function submitEditPO(e) {
    e.preventDefault();
    if (!editingPOId) return;

    if (!editPOLineItems || editPOLineItems.length === 0) {
        NKB.showToast('Please add at least one product line item to the order.', 'error');
        return;
    }

    for (const item of editPOLineItems) {
        if (!item.product_id || item.target_quantity <= 0) {
            NKB.showToast('All product lines must have valid quantity > 0.', 'error');
            return;
        }
    }

    const poDate = document.getElementById('edit-po-date').value;
    const deliveryDate = document.getElementById('edit-po-delivery-date').value;
    const policy = document.getElementById('edit-po-billing-policy').value;
    const notes = document.getElementById('edit-po-notes').value;

    const res = await NKB.api(`/api/orders/${editingPOId}`, {
        method: 'PUT',
        body: JSON.stringify({
            po_date: poDate || undefined,
            expected_delivery_date: deliveryDate || null,
            billing_policy: policy,
            notes,
            items: editPOLineItems.map(item => ({
                product_id: item.product_id,
                target_quantity: item.target_quantity
            }))
        })
    });

    if (res.success) {
        NKB.showToast(`Purchase Order ${res.data.po_number} updated successfully!`, 'success');
        const savedId = editingPOId;
        closeModal();
        if (typeof loadOrders === 'function') {
            loadOrders();
        }
        await openViewPOModal(savedId);
    } else {
        NKB.showToast(res.error || 'Failed to update PO.', 'error');
    }
}

window.openViewPOModal = openViewPOModal;
window.openEditPOModal = openEditPOModal;
window.closeModal = closeModal;
window.NKB = NKB;



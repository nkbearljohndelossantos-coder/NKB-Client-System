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

    // Date Formatter (Asia/Manila)
    formatDate: function(dateStr) {
        if (!dateStr) return '-';
        if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const parts = dateStr.split('-');
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            return d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' });
        }
        let cleanStr = typeof dateStr === 'string' && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
        if (typeof cleanStr === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(cleanStr)) {
            cleanStr += '+08:00';
        }
        const d = new Date(cleanStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' });
    },

    // Format Time (e.g. 05:17:00 PM) (Asia/Manila)
    formatTime: function(dateStr) {
        if (!dateStr) return '';
        let cleanStr = typeof dateStr === 'string' && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
        if (typeof cleanStr === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(cleanStr)) {
            cleanStr += '+08:00';
        }
        const d = new Date(cleanStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    },

    // Format Date and Time (e.g. Sep 11, 2026, 05:17:00 PM) (Asia/Manila)
    formatDateTime: function(dateStr, includeSeconds = true) {
        if (!dateStr) return '-';
        let cleanStr = typeof dateStr === 'string' && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
        if (typeof cleanStr === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(cleanStr)) {
            cleanStr += '+08:00';
        }
        const d = new Date(cleanStr);
        if (isNaN(d.getTime())) return dateStr;
        const opts = { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
        if (includeSeconds) opts.second = '2-digit';
        return d.toLocaleString('en-PH', opts);
    },

    // Get current calendar date in Asia/Manila (YYYY-MM-DD)
    getManilaDate: function(d = new Date()) {
        const dateObj = d instanceof Date ? d : new Date(d);
        if (isNaN(dateObj.getTime())) return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(dateObj);
    },

    // Get current date and time string in Asia/Manila
    getManilaDateTime: function(d = new Date()) {
        const dateObj = d instanceof Date ? d : new Date(d);
        return dateObj.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
    },

    // Delivery Progress Bar Helper
    // Renders visual progress bar indicating delivered quantity vs ordered quantity
    renderDeliveryProgressBar: function(delivered, target, options = {}) {
        const current = Number(delivered) || 0;
        const total = Number(target) || 0;
        const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : (current > 0 ? 100 : 0);
        const isCompleted = total > 0 && current >= total;
        const isPartial = current > 0 && current < total;
        const compact = options.compact || false;
        const showItemName = options.itemName || null;
        const batchNumber = options.batchNumber || null;
        const label = options.label || (isCompleted ? 'Fully Delivered' : (isPartial ? `Initial Delivery (${this.formatNumber(current)} pcs)` : 'Pending Delivery'));

        let barColor = 'bg-indigo-600';
        let badgeColor = 'text-indigo-700 bg-indigo-50 border-indigo-200';
        if (isCompleted) {
            barColor = 'bg-emerald-500';
            badgeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
        } else if (isPartial) {
            barColor = 'bg-amber-500';
            badgeColor = 'text-amber-800 bg-amber-50 border-amber-200';
        }

        if (compact) {
            return `
                <div class="w-full space-y-1">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="font-extrabold text-slate-900 font-mono">${this.formatNumber(current)} / ${this.formatNumber(total)} pcs</span>
                        <span class="font-mono font-bold text-[10px] ${isCompleted ? 'text-emerald-700' : 'text-amber-700'}">${pct}%</span>
                    </div>
                    <div class="w-full bg-slate-200/90 rounded-full h-2 overflow-hidden shadow-inner">
                        <div class="${barColor} h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                    </div>
                    <div class="text-[9.5px] ${isCompleted ? 'text-emerald-700 font-bold' : 'text-amber-700 font-semibold'}">
                        ${isCompleted ? '✓ Completed' : `⚡ Initial: ${this.formatNumber(current)} pcs`}
                    </div>
                </div>
            `;
        }

        return `
            <div class="w-full space-y-1.5 p-2 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                ${showItemName ? `
                    <div class="flex items-center justify-between gap-1.5 text-xs">
                        <span class="font-bold text-slate-900 truncate max-w-[150px]" title="${showItemName}">${showItemName}</span>
                        ${batchNumber ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">${batchNumber}</span>` : ''}
                    </div>
                ` : ''}
                <div class="flex items-center justify-between gap-2 text-xs">
                    <span class="font-extrabold font-mono text-slate-900">${this.formatNumber(current)} / ${this.formatNumber(total)} pcs</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold border ${badgeColor}">
                        ${pct}%
                    </span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-inner border border-slate-200/70">
                    <div class="${barColor} h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
                <div class="flex items-center justify-between text-[10px] font-semibold">
                    <span class="${isCompleted ? 'text-emerald-700' : 'text-amber-700'} flex items-center gap-1">
                        <span>${isCompleted ? '✓' : '⚡'}</span> ${label}
                    </span>
                </div>
            </div>
        `;
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
            'VOIDED': 'bg-rose-100 text-rose-800 border border-rose-400 font-extrabold',
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
    const userRole = NKB.user?.role;
    const canViewPrices = isClient || ['SUPER_ADMIN', 'IT_ADMIN', 'ADMIN', 'CEO', 'ACCOUNTING'].includes(userRole);
    const canEditOrder = isClient ? (po.status === 'PENDING_APPROVAL') : ['SUPER_ADMIN', 'IT_ADMIN', 'ADMIN', 'ACCOUNTING'].includes(userRole);
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
                    <div class="font-black text-slate-950 text-xs">${item.product_name}</div>
                    <div class="text-[10px] text-indigo-900 font-bold font-mono bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded inline-block mt-0.5">SKU: ${item.sku}</div>
                </td>
                <td class="py-3 px-3 text-center"><span class="badge bg-slate-100 text-slate-700 font-mono text-[10px]">${item.formula_code || 'FORM-2026-V1'}</span></td>
                <td class="py-3 px-3 text-center text-slate-600">${item.shelf_life_months || 24} mos</td>
                <td class="py-3 px-3 text-center font-black text-slate-950 font-mono">${NKB.formatNumber(item.target_quantity)} ${item.unit || 'pcs'}</td>
                <td class="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">${NKB.formatNumber(item.min_allowed_quantity)} – ${NKB.formatNumber(item.max_allowed_quantity)}</td>
                ${canViewPrices ? `
                    <td class="py-3 px-3 text-right font-bold text-indigo-900 font-mono">₱${Number(item.unit_price || 0).toFixed(2)}</td>
                    <td class="py-3 px-3 text-right font-extrabold text-slate-900 font-mono">${NKB.formatCurrency(item.subtotal)}</td>
                ` : ''}
                <td class="py-3 px-3 text-center font-semibold font-mono ${delivered >= item.target_quantity ? 'text-emerald-700' : (delivered > 0 ? 'text-indigo-700' : 'text-slate-400')}">
                    ${NKB.formatNumber(delivered)} / ${NKB.formatNumber(item.target_quantity)}
                </td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                    ${item.dr_number ? `
                        <span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono font-bold text-[10px]" title="Dispatched on DR ${item.dr_number}">🚚 ${item.dr_number}</span>
                    ` : item.batch_number ? `
                        <span class="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-mono font-bold text-[10px]" title="Batched and ready for delivery">✓ ${item.batch_number} (Batched)</span>
                    ` : item.jo_number ? `
                        <span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-mono font-bold text-[10px]" title="Job Order active (Product being made in factory)">🏭 ${item.jo_number} (Making)</span>
                    ` : `
                        <span class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-mono text-[10px]">Pending JO</span>
                    `}
                </td>
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
                            <h4 class="font-black text-slate-950 text-sm leading-tight">${item.product_name}</h4>
                            <div class="flex items-center gap-2 mt-0.5">
                                <span class="font-mono text-xs text-indigo-900 font-bold bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">SKU: ${item.sku}</span>
                                <span class="text-slate-300">•</span>
                                <span class="badge bg-slate-100 text-slate-700 text-[10px]">${item.category || 'Cosmetics'}</span>
                            </div>
                        </div>
                    </div>
                    ${canViewPrices ? `
                        <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                            <span class="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-900 flex items-center gap-1.5">
                                <span>₱${Number(item.unit_price || 0).toFixed(2)}</span>
                                <span class="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Fixed Contract Price</span>
                            </span>
                            <span class="px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-mono font-black text-indigo-900">
                                Subtotal: ${NKB.formatCurrency(lineSubtotal)}
                            </span>
                        </div>
                    ` : ''}
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

    const allJOsStarted = items.length > 0 && jobOrders.length >= items.length;
    const allBatchesStarted = items.length > 0 && items.every(it => it.batch_number);
    const allDispatched = items.length > 0 && items.every(it => it.dr_number);

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
                        <a href="/print-jo.html?po_id=${po.id}" class="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm" title="Print Job Order / Sales Order (2 Portrait Copies on A4 Landscape)">
                            <span>🖨️ Print JO / SO</span>
                        </a>
                        <a href="/print-po.html?id=${po.id}" class="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm" title="Print Purchase Order">
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
                            <div class="font-extrabold text-sm text-slate-900">${(po.is_vyuceutical_ops === 1 || (po.company_name && po.company_name.toLowerCase().includes('vyuceutical'))) ? `Vyuceutical OPC - ${po.contact_person || po.company_name}` : po.company_name}</div>
                            ${(po.is_vyuceutical_ops === 1 || (po.company_name && po.company_name.toLowerCase().includes('vyuceutical'))) ? `<div class="text-[11px] text-purple-700 font-bold">Vyuceutical OPC - ${po.contact_person || po.company_name} (${po.company_name})</div>` : ''}
                            <div class="text-slate-500 text-[11px] leading-relaxed">${(po.client_address || '').trim() || 'Phils.'}</div>
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
                            <span class="text-[10px] uppercase font-bold text-slate-400">Contract & Payment Terms</span>
                            <div>Tolerance Limit: <strong class="text-indigo-700 font-bold">±${po.tolerance_percent}%</strong></div>
                            <div>Term of Payment: <strong class="text-slate-800">${po.form_of_payment || po.terms || 'COD'}</strong></div>
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
                        <div class="space-y-3.5 max-h-96 overflow-y-auto pr-1 border border-slate-100 rounded-2xl p-2 bg-slate-50/50">
                            ${productCardsHtml}
                        </div>

                        <!-- Consolidated Overview Summary Table -->
                        <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-4">
                            <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center justify-between">
                                <span>📋 Consolidated Line Item Overview</span>
                                <span class="text-[11px] font-mono text-slate-500 font-normal">±${po.tolerance_percent}% Manufacturing Tolerance</span>
                            </div>
                            <div class="max-h-72 overflow-y-auto overflow-x-auto">
                                <table class="w-full text-left">
                                    <thead class="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th class="py-2.5 px-3 text-center w-10">#</th>
                                            <th class="py-2.5 px-3">Product Name & SKU</th>
                                            <th class="py-2.5 px-3 text-center">Formula Code</th>
                                            <th class="py-2.5 px-3 text-center">Shelf Life</th>
                                            <th class="py-2.5 px-3 text-center">Target Qty</th>
                                            <th class="py-2.5 px-3 text-center">Tolerance Range</th>
                                            ${canViewPrices ? `
                                                <th class="py-2.5 px-3 text-right">Fixed Price</th>
                                                <th class="py-2.5 px-3 text-right">Line Total</th>
                                            ` : ''}
                                            <th class="py-2.5 px-3 text-center">Delivered</th>
                                            <th class="py-2.5 px-3 text-center">JO Status</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-100 font-medium text-xs">
                                        ${itemsRows}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    ${canViewPrices ? `
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
                    ` : ''}

                    <!-- Traceability (Linked Job Orders, DRs, Invoices) -->
                    ${(jobOrders.length > 0 || deliveries.length > 0 || (canViewPrices && invoices.length > 0)) ? `
                        <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                            <h4 class="font-bold text-slate-900 uppercase text-[11px] tracking-wider">🏭 Production, Delivery & Billing Pipeline</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                                <div>
                                    <span class="font-bold text-slate-700 block mb-1">Job Orders (${jobOrders.length}):</span>
                                    ${jobOrders.length > 0 ? `
                                        <ul class="space-y-1 max-h-40 overflow-y-auto pr-1">
                                            ${jobOrders.map(j => `<li class="font-mono bg-white p-2 rounded-lg border border-slate-200 flex justify-between items-center"><div><strong>${j.jo_number}</strong><br><span class="text-[10px] text-slate-500">${NKB.formatNumber(j.target_quantity)} pcs • ${j.status}</span></div><a href="/print-jo.html?id=${j.id}" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold transition inline-flex items-center gap-1" title="Print this Job Order">🖨️ Print</a></li>`).join('')}
                                        </ul>
                                    ` : '<span class="text-slate-400">None yet</span>'}
                                </div>
                                <div>
                                    <span class="font-bold text-slate-700 block mb-1">Delivery Receipts (${deliveries.length}):</span>
                                    ${deliveries.length > 0 ? `
                                        <ul class="space-y-1 max-h-40 overflow-y-auto pr-1">
                                            ${deliveries.map(d => `<li class="font-mono bg-white p-2 rounded-lg border border-slate-200"><strong>${d.dr_number}</strong><br><span class="text-[10px] text-slate-500">${NKB.formatNumber(d.total_delivered || 0)} pcs • ${d.status}</span></li>`).join('')}
                                        </ul>
                                    ` : '<span class="text-slate-400">None yet</span>'}
                                </div>
                                ${canViewPrices ? `
                                    <div>
                                        <span class="font-bold text-slate-700 block mb-1">Sales Invoices (${invoices.length}):</span>
                                        ${invoices.length > 0 ? `
                                            <ul class="space-y-1 max-h-40 overflow-y-auto pr-1">
                                                ${invoices.map(i => `<li class="font-mono bg-white p-2 rounded-lg border border-slate-200"><strong>${i.invoice_number}</strong><br><span class="text-[10px] text-slate-500">${NKB.formatCurrency(i.total_amount)} • ${i.payment_status}</span></li>`).join('')}
                                            </ul>
                                        ` : '<span class="text-slate-400">None yet</span>'}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Footer Actions -->
                <div class="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-slate-100 flex-shrink-0">
                        ${(canEditOrder && po.status !== 'COMPLETED' && po.status !== 'CANCELLED' && po.status !== 'VOIDED' && (!po.deliveries || po.deliveries.length === 0)) ? `
                            <button onclick="closeModal(); openEditPOModal('${po.id}');" class="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 rounded-xl font-bold text-xs shadow-sm transition inline-flex items-center gap-1.5" title="Update products and details of this order">
                                <span>✏️ Update Order</span>
                            </button>
                        ` : ''}
                        ${(NKB.user && (NKB.user.role === 'ADMIN' || NKB.user.role === 'SUPER_ADMIN') && po.status === 'PENDING_APPROVAL') ? `
                            <button onclick="approvePO('${po.id}', '${po.po_number}'); closeModal();" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-sm transition">
                                Approve Order
                            </button>
                        ` : ''}
                        ${(NKB.user && (NKB.user.role === 'ADMIN' || NKB.user.role === 'SUPER_ADMIN' || NKB.user.role === 'PRODUCTION') && (po.status === 'APPROVED' || po.status === 'IN_PRODUCTION' || po.status === 'PARTIALLY_DELIVERED')) ? `
                            ${!allJOsStarted ? `
                                <button onclick="closeModal(); openCreateJOModal('${po.id}', '${po.po_number}', '${po.company_name.replace(/'/g, "\\'")}');" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-600/30 transition flex items-center gap-1.5" title="Start Job Orders for all products in this order">
                                    <span>🏭 Start Job Order (All Products)</span>
                                </button>
                            ` : !allBatchesStarted ? `
                                <button onclick="closeModal(); openCreateAllBatchesModal('${po.client_id}', '${po.id}', '${po.company_name.replace(/'/g, "\\'")}');" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs shadow-md shadow-purple-600/30 transition flex items-center gap-1.5" title="Products are made. Record batch numbers & actual yield before delivering.">
                                    <span>⚗️ Batch Products (Products Made)</span>
                                </button>
                            ` : !allDispatched ? `
                                <button onclick="closeModal(); openCreateAllDRModal('${po.client_id}', '${po.id}', '${po.company_name.replace(/'/g, "\\'")}');" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/30 transition flex items-center gap-1.5" title="Batches are ready. Create unified Delivery Receipt.">
                                    <span>🚚 Deliver All Products (Create DR)</span>
                                </button>
                            ` : `
                                <span class="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-xs font-mono inline-flex items-center gap-1.5">
                                    <span>✓ Dispatched</span>
                                </span>
                            `}
                        ` : ''}
                        ${(NKB.user && (NKB.user.role === 'ADMIN' || NKB.user.role === 'SUPER_ADMIN') && po.status !== 'VOIDED' && po.status !== 'CANCELLED' && po.status !== 'COMPLETED') ? `
                            <button onclick="voidPO('${po.id}', '${po.po_number}')" class="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl font-bold text-xs shadow-sm transition inline-flex items-center gap-1.5" title="Void this Purchase Order">
                                <span>🚫 Void Order</span>
                            </button>
                        ` : ''}
                    </div>
                    <div class="flex items-center gap-2">
                        ${(!isClient && (po.accounting_confirmed === 1 || po.formulation_converted === 1)) ? `
                            <a href="/print-formulation-receipt.html?id=${po.id}" target="_blank" class="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl font-bold text-xs shadow-sm transition flex items-center gap-1.5" title="Print Formulation & Raw Materials Breakdown Receipt">
                                <span>🧪 Formulation Receipt</span>
                            </a>
                        ` : ''}
                        <a href="/print-po.html?id=${po.id}" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-600/30 transition flex items-center gap-1.5">
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
window.KNOWN_PO_BRANDS = [
    'HER CHOICE PH',
    'HER CHOICE',
    'BELLA SKIN',
    'K BELLA SKIN',
    'SKEENCARE',
    'NATASHA',
    'HANAPAM',
    'GELIS PHARMA',
    'JGLOWW',
    'BRIGHTEST SKIN',
    'BRIGHTEST',
    'ROYCE B',
    'ELIXIA',
    'ADORN',
    'CUTIS ANO NE',
    'TARATITAT',
    'MAGNIFIQUE WHITE',
    'DREAM GIRL',
    'SABELA SKIN',
    'KKSKIN.PH',
    'KYLE SKIN',
    'RG LOVE',
    'CZAR',
    'MI.SKIN',
    'EIGHT',
    'BEAUTAIN',
    'BIOESSENCE',
    'INTIMATE WHITE',
    'JLS NO BRAND'
].sort((a, b) => b.length - a.length);

window.detectPOBrand = function(name) {
    if (!name) return null;
    const upper = name.toUpperCase().trim();
    if (upper.startsWith('SUS ') || upper.startsWith('SUS-') || upper === 'SUS') {
        return 'BELLA SKIN';
    }
    for (const b of window.KNOWN_PO_BRANDS) {
        if (upper.startsWith(b)) {
            return b;
        }
    }
    return null;
};

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

window.getBrandBadgeClass = function(brand) {
    if (!brand) return 'bg-slate-100 text-slate-700 border border-slate-200';
    const b = brand.toUpperCase();
    if (b.includes('BELLA')) return 'bg-purple-100 text-purple-800 border border-purple-200';
    if (b.includes('HER CHOICE')) return 'bg-pink-100 text-pink-800 border border-pink-200';
    if (b.includes('SKEENCARE')) return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    if (b.includes('NATASHA')) return 'bg-rose-100 text-rose-800 border border-rose-200';
    if (b.includes('HANAPAM')) return 'bg-amber-100 text-amber-800 border border-amber-200';
    if (b.includes('GELIS')) return 'bg-cyan-100 text-cyan-800 border border-cyan-200';
    if (b.includes('JGLOWW')) return 'bg-orange-100 text-orange-800 border border-orange-200';
    if (b.includes('BRIGHTEST')) return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
    if (b.includes('ROYCE')) return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
    if (b.includes('ELIXIA')) return 'bg-teal-100 text-teal-800 border border-teal-200';
    return 'bg-slate-100 text-slate-800 border border-slate-200';
};

window.renderProductOptionsGroupedByBrand = function(catalog, selectedId) {
    if (!catalog || catalog.length === 0) return '';
    const byBrand = {};
    catalog.forEach(p => {
        const b = p.brand || window.detectPOBrand(p.name) || 'OTHER';
        if (!byBrand[b]) byBrand[b] = [];
        byBrand[b].push(p);
    });
    const brands = Object.keys(byBrand).sort();
    return brands.map(b => `
        <optgroup label="🏷️ ${b} (${byBrand[b].length})">
            ${byBrand[b].map(p => `
                <option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>
                    ${p.display_name || p.clean_name || p.name} (${p.effective_sku || p.sku}) - ₱${Number(p.default_price || 0).toFixed(2)}${p.has_custom_price ? ' [Contract Rate]' : ''}
                </option>
            `).join('')}
        </optgroup>
    `).join('');
};

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

    // Verify order hasn't been delivered or dispatched
    const hasDeliveries = (po.deliveries && po.deliveries.length > 0) || (po.dr_count && po.dr_count > 0);
    if (po.status === 'COMPLETED' || hasDeliveries) {
        NKB.showToast('Cannot update Purchase Order: Order has already been delivered or delivery receipts have been created.', 'error');
        closeModal();
        return;
    }

    editingPOId = poId;

    // Fetch client product catalog (fallback to all company products if client has no custom products)
    let catRes = await NKB.api(`/api/products?clientId=${po.client_id}&assignedOnly=true`);
    if (!catRes.success || !catRes.data || catRes.data.length === 0) {
        catRes = await NKB.api('/api/products?activeOnly=true');
    }
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

    const isVyuceutical = po.is_vyuceutical_ops === 1 || (po.company_name && po.company_name.toLowerCase().includes('vyuceutical'));
    editPOCatalog = editPOCatalog.map(p => {
        const brand = window.detectPOBrand ? window.detectPOBrand(p.name) : null;
        const clean = isVyuceutical ? cleanPOBrandFromName(p.name) : p.name;
        return {
            ...p,
            brand: brand || 'OTHER',
            clean_name: clean,
            display_name: clean
        };
    });

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

    const rawTerm = (po.form_of_payment || po.terms || 'COD').trim();
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

    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-2xl max-w-4xl w-full p-6 sm:p-7 shadow-2xl space-y-4 max-h-[92vh] flex flex-col my-auto">
                <div class="flex justify-between items-center border-b border-slate-100 pb-3 flex-shrink-0">
                    <div>
                        <div class="flex items-center gap-2">
                            <h3 class="text-lg font-bold text-slate-900">Update Purchase Order</h3>
                            <span class="px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-bold text-xs">${po.po_number}</span>
                            <span class="px-2.5 py-0.5 rounded text-[10px] font-bold ${po.status === 'IN_PRODUCTION' ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-amber-50 text-amber-800 border border-amber-200'}">${po.status ? po.status.replace(/_/g, ' ') : 'ACTIVE'}</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5">Modify line items, quantities, pricing, delivery date, or special instructions</p>
                    </div>
                    <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>
                
                <form id="form-edit-po" onsubmit="submitEditPO(event)" class="space-y-4 text-xs font-semibold flex-1 overflow-y-auto pr-1">
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label class="block text-slate-600 mb-1">Client / Buyer</label>
                            <div class="px-3 py-2 border rounded-xl bg-slate-100 text-slate-800 font-bold">
                                ${(po.is_vyuceutical_ops === 1 || (po.company_name && po.company_name.toLowerCase().includes('vyuceutical'))) ? `Vyuceutical OPC - ${po.contact_person || po.company_name}` : po.company_name}
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

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                        <div>
                            <label class="block text-slate-600 mb-1 font-bold">Term of Payment *</label>
                            <select id="edit-po-form-of-payment" onchange="toggleCustomPOTerm('edit')" class="w-full px-3 py-2 border rounded-xl bg-white font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                                <option value="COD" ${selectedTerm === 'COD' ? 'selected' : ''}>COD (Cash on Delivery)</option>
                                <option value="7d" ${selectedTerm === '7d' ? 'selected' : ''}>7d (7 Days)</option>
                                <option value="15d" ${selectedTerm === '15d' ? 'selected' : ''}>15d (15 Days)</option>
                                <option value="30d" ${selectedTerm === '30d' ? 'selected' : ''}>30d (30 Days)</option>
                                <option value="CUSTOM" ${isCustom ? 'selected' : ''}>Custom Term...</option>
                            </select>
                            <input type="text" id="edit-po-form-of-payment-custom" value="${isCustom ? rawTerm.replace(/"/g, '&quot;') : ''}" placeholder="e.g. 50% DP, 50% upon delivery..." class="${isCustom ? '' : 'hidden'} mt-1.5 w-full px-3 py-1.5 border rounded-lg bg-white text-xs font-medium text-slate-900">
                        </div>
                    </div>

                    <!-- Multi-Brand Search with Suggestions (Edit Mode) -->
                    <div class="p-3 bg-slate-50 border border-slate-300 rounded-2xl space-y-2 relative shadow-sm" id="edit-po-search-wrapper">
                        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5">
                                <span class="text-sm">🔍</span>
                                <span class="text-xs font-bold text-slate-900">Search & Add Products</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-extrabold uppercase">Multi-Brand</span>
                            </div>
                            <div class="flex items-center gap-2 w-full sm:w-auto" id="edit-po-brand-filter-container">
                                <label for="edit-po-brand-select" class="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Filter Brand:</label>
                                <select id="edit-po-brand-select" onchange="onEditPOBrandFilterChanged()" class="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500">
                                    <option value="ALL">-- All Brands --</option>
                                </select>
                            </div>
                        </div>

                        <!-- Search input + Search button -->
                        <div class="relative">
                            <div class="flex items-stretch gap-2">
                                <div class="relative flex-1">
                                    <input type="text" 
                                           id="edit-po-product-search-input" 
                                           oninput="handleEditPOSearchInput(this.value)" 
                                           onkeydown="handleEditPOSearchKeydown(event)"
                                           onfocus="showEditPOSuggestions()"
                                           placeholder="Type product name, SKU, or brand (e.g. Amber Romance, Toner, Sunscreen)..." 
                                           autocomplete="off"
                                           class="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm">
                                    <span class="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                                    <button type="button" 
                                            id="edit-po-search-clear-btn" 
                                            onclick="clearEditPOSearch()" 
                                            class="hidden absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs px-1 font-bold">✕</button>
                                </div>
                                <button type="button" 
                                        id="edit-po-search-btn" 
                                        onclick="triggerEditPOSearchBtn()" 
                                        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 active:scale-95">
                                    <span>🔍</span>
                                    <span>Search Product</span>
                                </button>
                            </div>

                            <!-- Floating Suggestions Dropdown -->
                            <div id="edit-po-suggestions-container" 
                                 class="hidden absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto divide-y divide-slate-100">
                                <!-- Populated dynamically by renderEditPOSuggestions() -->
                            </div>
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
                                    <tbody id="edit-po-lines-body" class="divide-y divide-slate-100 font-medium">
                                        <!-- Dynamic Rows -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Summary & Totals -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <div>
                            <label class="block text-slate-600 mb-1">Special Notes / Description (Appears on Printed Order above payment)</label>
                            <textarea id="edit-po-notes" rows="2" placeholder="Special formulation notes, packaging variants, delivery instructions..." class="w-full px-3 py-2 border rounded-xl bg-white">${po.notes || ''}</textarea>
                        </div>
                        <div class="space-y-1.5 text-right flex flex-col justify-center">
                            <div class="text-slate-500">Total Items: <strong id="edit-po-total-items" class="text-slate-900">0</strong></div>
                            <div class="text-slate-500">Total Target Quantity: <strong id="edit-po-total-qty" class="text-slate-900">0 pcs</strong></div>
                            <div class="text-base font-extrabold text-indigo-900 pt-1 border-t border-slate-200">Grand Total: <span id="edit-po-grand-total">₱0.00</span></div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 flex-shrink-0">
                        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
                        <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30">Update Order</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Populate brand filter options
    const brandSelect = document.getElementById('edit-po-brand-select');
    if (brandSelect) {
        const brandSet = new Set();
        editPOCatalog.forEach(p => {
            if (p.brand) brandSet.add(p.brand);
        });
        const detectedList = Array.from(brandSet).sort();
        brandSelect.innerHTML = `<option value="ALL">-- All Brands (${editPOCatalog.length} Products) --</option>` +
            detectedList.map(b => `<option value="${b}">${b}</option>`).join('');
    }

    renderEditPOLineItems();
}

let editPOHighlightedSuggestionIdx = -1;

function onEditPOBrandFilterChanged() {
    const searchInput = document.getElementById('edit-po-product-search-input');
    renderEditPOSuggestions(searchInput ? searchInput.value : '');
}

function getFilteredEditPOSuggestions(query = '') {
    const brandSelect = document.getElementById('edit-po-brand-select');
    const chosenBrand = brandSelect ? brandSelect.value : 'ALL';
    let list = editPOCatalog.slice();

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

function showEditPOSuggestions() {
    const searchInput = document.getElementById('edit-po-product-search-input');
    renderEditPOSuggestions(searchInput ? searchInput.value : '');
}

function handleEditPOSearchInput(val) {
    const clearBtn = document.getElementById('edit-po-search-clear-btn');
    if (clearBtn) {
        if (val && val.length > 0) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
    editPOHighlightedSuggestionIdx = -1;
    renderEditPOSuggestions(val);
}

function clearEditPOSearch() {
    const searchInput = document.getElementById('edit-po-product-search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    const clearBtn = document.getElementById('edit-po-search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    renderEditPOSuggestions('');
}

function triggerEditPOSearchBtn() {
    const container = document.getElementById('edit-po-suggestions-container');
    const searchInput = document.getElementById('edit-po-product-search-input');
    if (container && !container.classList.contains('hidden')) {
        container.classList.add('hidden');
    } else {
        if (searchInput) searchInput.focus();
        renderEditPOSuggestions(searchInput ? searchInput.value : '');
    }
}

function renderEditPOSuggestions(query = '') {
    const container = document.getElementById('edit-po-suggestions-container');
    if (!container) return;

    const matches = getFilteredEditPOSuggestions(query);
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
                const isSelected = idx === editPOHighlightedSuggestionIdx;
                return `
                    <div id="edit-po-suggestion-item-${idx}" 
                         onclick="selectEditPOSuggestion('${p.id}')" 
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

function handleEditPOSearchKeydown(e) {
    const container = document.getElementById('edit-po-suggestions-container');
    if (!container || container.classList.contains('hidden')) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
            showEditPOSuggestions();
            e.preventDefault();
        }
        return;
    }

    const matches = getFilteredEditPOSuggestions(e.target.value).slice(0, 40);
    if (matches.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        editPOHighlightedSuggestionIdx = Math.min(editPOHighlightedSuggestionIdx + 1, matches.length - 1);
        renderEditPOSuggestions(e.target.value);
        const el = document.getElementById(`edit-po-suggestion-item-${editPOHighlightedSuggestionIdx}`);
        if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        editPOHighlightedSuggestionIdx = Math.max(editPOHighlightedSuggestionIdx - 1, 0);
        renderEditPOSuggestions(e.target.value);
        const el = document.getElementById(`edit-po-suggestion-item-${editPOHighlightedSuggestionIdx}`);
        if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (editPOHighlightedSuggestionIdx >= 0 && editPOHighlightedSuggestionIdx < matches.length) {
            selectEditPOSuggestion(matches[editPOHighlightedSuggestionIdx].id);
        } else if (matches.length > 0) {
            selectEditPOSuggestion(matches[0].id);
        }
    } else if (e.key === 'Escape') {
        container.classList.add('hidden');
    }
}

function selectEditPOSuggestion(productId) {
    const prod = editPOCatalog.find(p => p.id === productId);
    if (!prod) return;

    const existingIdx = editPOLineItems.findIndex(it => it.product_id === productId);
    if (existingIdx !== -1) {
        renderEditPOLineItems();
        const rowInput = document.querySelector(`#edit-po-lines-body tr:nth-child(${existingIdx + 1}) input[type="number"]`);
        if (rowInput) {
            rowInput.focus();
            rowInput.select();
        }
        NKB.showToast(`"${prod.display_name}" is already in order (Row #${existingIdx + 1}). Quantity focused.`, 'info');
    } else {
        editPOLineItems.push({
            product_id: prod.id,
            target_quantity: 1000,
            unit_price: Number(prod.default_price || 0)
        });
        renderEditPOLineItems();
        NKB.showToast(`Added ${prod.display_name} [${prod.brand}] to order!`, 'success');

        const lastIdx = editPOLineItems.length - 1;
        setTimeout(() => {
            const rowInput = document.querySelector(`#edit-po-lines-body tr:nth-child(${lastIdx + 1}) input[type="number"]`);
            if (rowInput) {
                rowInput.focus();
                rowInput.select();
            }
        }, 50);
    }

    const container = document.getElementById('edit-po-suggestions-container');
    if (container) container.classList.add('hidden');
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

        const currentProd = editPOCatalog.find(p => p.id === item.product_id);
        const brandBadge = currentProd ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${window.getBrandBadgeClass ? window.getBrandBadgeClass(currentProd.brand) : 'bg-slate-100 text-slate-700'} mr-1">${currentProd.brand || 'OTHER'}</span>` : '';

        return `
            <tr class="hover:bg-slate-50 transition" id="edit-po-row-${idx}">
                <td class="py-2.5 px-3">
                    <div class="flex items-center gap-1 mb-1">
                        ${brandBadge}
                        <span class="text-[10px] font-mono text-indigo-900 font-bold bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">${currentProd ? (currentProd.effective_sku || currentProd.sku) : ''}</span>
                    </div>
                    <select onchange="updateEditPOLineItem(${idx}, 'product_id', this.value)" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500">
                        ${window.renderProductOptionsGroupedByBrand ? window.renderProductOptionsGroupedByBrand(editPOCatalog, item.product_id) : editPOCatalog.map(p => `
                            <option value="${p.id}" ${p.id === item.product_id ? 'selected' : ''}>
                                ${p.display_name || p.clean_name || p.name} (${p.effective_sku || p.sku}) - ₱${Number(p.default_price).toFixed(2)}${p.has_custom_price ? ' [Contract Rate]' : ''}
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
    const formOfPaymentEl = document.getElementById('edit-po-form-of-payment');
    let formOfPayment = formOfPaymentEl ? formOfPaymentEl.value : undefined;
    if (formOfPayment === 'CUSTOM') {
        const customInput = document.getElementById('edit-po-form-of-payment-custom');
        formOfPayment = customInput ? (customInput.value.trim() || 'COD') : 'COD';
    }
    const notes = document.getElementById('edit-po-notes').value;

    const res = await NKB.api(`/api/orders/${editingPOId}`, {
        method: 'PUT',
        body: JSON.stringify({
            po_date: poDate || undefined,
            expected_delivery_date: deliveryDate || null,
            billing_policy: policy,
            form_of_payment: formOfPayment,
            notes,
            items: editPOLineItems.map(item => {
                const prod = editPOCatalog.find(p => p.id === item.product_id);
                return {
                    product_id: item.product_id,
                    item_name: prod ? (prod.clean_name || prod.display_name || prod.name) : undefined,
                    target_quantity: item.target_quantity
                };
            })
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

// Global click-away listener to dismiss Edit PO product suggestions
document.addEventListener('click', (e) => {
    const container = document.getElementById('edit-po-suggestions-container');
    const input = document.getElementById('edit-po-product-search-input');
    const btn = document.getElementById('edit-po-search-btn');
    if (container && !container.classList.contains('hidden')) {
        if (!container.contains(e.target) && e.target !== input && e.target !== btn && !btn?.contains(e.target)) {
            container.classList.add('hidden');
        }
    }
});

window.openViewPOModal = openViewPOModal;
window.openEditPOModal = openEditPOModal;
window.closeModal = closeModal;
window.NKB = NKB;

if (!window.voidPO) {
    window.voidPO = async function(id, poNumber) {
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
            const root = document.getElementById('modals-root') || document.getElementById('client-modals-root');
            if (root && root.innerHTML.includes(poNumber) && typeof openViewPOModal === 'function') {
                await openViewPOModal(id);
            }
            const newNo = (res.data && res.data.po_number) ? res.data.po_number : poNumber;
            if (confirm(`Purchase Order "${poNumber}" is now VOIDED.\n\nWould you like to permanently delete it from the database right now?`)) {
                if (typeof window.deletePO === 'function') {
                    await window.deletePO(id, newNo);
                }
            }
        } else {
            NKB.showToast(res.error || 'Failed to void Purchase Order.', 'error');
        }
    };
}

if (!window.deletePO) {
    window.deletePO = async function(id, poNumber) {
        if (!confirm(`Are you sure you want to PERMANENTLY delete Purchase Order "${poNumber}"?\n\nThis will completely remove this order and all its records from the database. This action cannot be undone.`)) {
            return;
        }
        const res = await NKB.api(`/api/orders/${id}`, { method: 'DELETE' });
        if (res.success) {
            NKB.showToast(res.message || `Purchase Order ${poNumber} permanently deleted.`, 'success');
            if (typeof loadOrders === 'function') loadOrders();
            if (typeof loadDashboard === 'function') loadDashboard();
            if (typeof loadClientOrders === 'function') loadClientOrders();
        } else {
            NKB.showToast(res.error || 'Failed to delete Purchase Order.', 'error');
        }
    };
}

function toggleCustomPOTerm(prefix = 'edit') {
    const selectEl = document.getElementById(`${prefix}-po-form-of-payment`);
    const customEl = document.getElementById(`${prefix}-po-form-of-payment-custom`);
    if (selectEl && customEl) {
        if (selectEl.value === 'CUSTOM') {
            customEl.classList.remove('hidden');
            customEl.focus();
        } else {
            customEl.classList.add('hidden');
        }
    }
}
window.toggleCustomPOTerm = toggleCustomPOTerm;

// -------------------------------------------------------------
// GLOBAL KEYBOARD SHORTCUTS & EVENT LISTENERS
// 1. Ctrl+K (or Cmd+K): Universal Command Palette & Search
// 2. Ctrl+O (or Cmd+O, Ctrl+Shift+O, Alt+P): Create / Place Purchase Order
// 3. Escape: Exit table menus, command palette, mini tabs, modals, docked chats, flyouts
// -------------------------------------------------------------

// Dismiss table action dropdown menus when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.table-action-menu') && !e.target.closest('button[onclick*="toggleTableActionMenu"]') && !e.target.closest('button[onclick*="togglePOActionMenu"]')) {
        document.querySelectorAll('.table-action-menu, [id^="po-menu-"]').forEach(m => m.classList.add('hidden'));
    }
});

document.addEventListener('keydown', function (e) {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // 1. ESCAPE KEY: Multi-tier dismissal
    if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
        let handled = false;

        // A. Table Action Dropdown Menus
        const openMenus = document.querySelectorAll('.table-action-menu:not(.hidden), [id^="po-menu-"]:not(.hidden)');
        if (openMenus.length > 0) {
            openMenus.forEach(m => m.classList.add('hidden'));
            handled = true;
        }

        // B. Command Palette Modal
        const cmdModal = document.getElementById('command-palette-modal');
        if (!handled && cmdModal && !cmdModal.classList.contains('hidden')) {
            closeCommandPalette();
            handled = true;
        }

        // C. Autocomplete / Search suggestions dropdowns
        const editSuggestions = document.getElementById('edit-po-suggestions-container');
        if (!handled && editSuggestions && !editSuggestions.classList.contains('hidden')) {
            editSuggestions.classList.add('hidden');
            handled = true;
        }
        const poSuggestions = document.getElementById('po-suggestions-container');
        if (!handled && poSuggestions && !poSuggestions.classList.contains('hidden')) {
            poSuggestions.classList.add('hidden');
            handled = true;
        }

        // D. Active Modals (#modals-root and #client-modals-root)
        const modalsRoot = document.getElementById('modals-root');
        if (!handled && modalsRoot && modalsRoot.children.length > 0 && modalsRoot.innerHTML.trim() !== '') {
            if (typeof closeModal === 'function') {
                closeModal();
            } else {
                modalsRoot.innerHTML = '';
            }
            handled = true;
        }

        const clientModalsRoot = document.getElementById('client-modals-root');
        if (!handled && clientModalsRoot && clientModalsRoot.children.length > 0 && clientModalsRoot.innerHTML.trim() !== '') {
            if (typeof closeClientModal === 'function') {
                closeClientModal();
            } else if (typeof closeModal === 'function') {
                closeModal();
            } else {
                clientModalsRoot.innerHTML = '';
            }
            handled = true;
        }

        // E. Notification & Messenger Flyouts
        const bellFlyout = document.getElementById('agent-bell-flyout');
        if (!handled && bellFlyout && !bellFlyout.classList.contains('hidden')) {
            bellFlyout.classList.add('hidden');
            handled = true;
        }

        const chatFlyout = document.getElementById('agent-chat-flyout');
        if (!handled && chatFlyout && !chatFlyout.classList.contains('hidden')) {
            chatFlyout.classList.add('hidden');
            handled = true;
        }

        // F. Messenger Docked Mini-Tabs / Chat Windows
        if (!handled && window.NKB_Agents && typeof window.NKB_Agents.closeTopDockedChat === 'function') {
            handled = window.NKB_Agents.closeTopDockedChat();
        }

        // G. Mobile Sidebars (if open on mobile)
        if (!handled) {
            const adminSidebar = document.getElementById('admin-sidebar') || document.getElementById('sidebar');
            if (adminSidebar && !adminSidebar.classList.contains('-translate-x-full') && typeof toggleMobileSidebar === 'function') {
                if (window.innerWidth < 1024) {
                    toggleMobileSidebar(false);
                    handled = true;
                }
            }
            const clientSidebar = document.getElementById('client-sidebar');
            if (clientSidebar && !clientSidebar.classList.contains('-translate-x-full') && typeof toggleClientMobileSidebar === 'function') {
                if (window.innerWidth < 1024) {
                    toggleClientMobileSidebar(false);
                    handled = true;
                }
            }
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    }

    // 2. CTRL+K / CMD+K: Universal Command Palette & Search
    const isKeyK = e.key && (e.key === 'k' || e.key === 'K');
    if (isCtrlOrCmd && isKeyK) {
        e.preventDefault();
        e.stopPropagation();
        openCommandPalette();
        return;
    }

    // 3. CTRL+O / CMD+O / ALT+P: Open / Create Purchase Order
    const isKeyO = e.key && (e.key === 'o' || e.key === 'O');
    const isAltP = e.altKey && (e.key === 'p' || e.key === 'P');

    if ((isCtrlOrCmd && isKeyO) || isAltP) {
        e.preventDefault();
        e.stopPropagation();

        // 1. Admin Portal: Open PO Creation Modal
        if (typeof window.openCreatePOModal === 'function' || typeof openCreatePOModal === 'function') {
            if (typeof switchTab === 'function') {
                const ordersSec = document.getElementById('view-orders');
                if (ordersSec && ordersSec.classList.contains('hidden')) {
                    switchTab('orders');
                }
            }
            const fn = window.openCreatePOModal || openCreatePOModal;
            fn();
            if (typeof NKB !== 'undefined' && NKB.showToast) {
                NKB.showToast('Purchase Order window opened (Ctrl+O)', 'info');
            }
            return;
        }

        // 2. Client Portal: Switch to Place Order Tab
        if (typeof window.switchClientTab === 'function' || typeof switchClientTab === 'function') {
            const fn = window.switchClientTab || switchClientTab;
            fn('place-order');
            if (typeof NKB !== 'undefined' && NKB.showToast) {
                NKB.showToast('Place Order tab opened (Ctrl+O)', 'info');
            }
            return;
        }
    }
});

// -------------------------------------------------------------
// UNIVERSAL COMMAND PALETTE (CTRL+K / CMD+K)
// -------------------------------------------------------------
let cmdPaletteActiveIndex = 0;
let cmdPaletteFilteredItems = [];

function ensureCommandPaletteModal() {
    let modal = document.getElementById('command-palette-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'command-palette-modal';
        modal.className = 'fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in hidden';
        modal.onclick = function(e) {
            if (e.target === modal) closeCommandPalette();
        };
        modal.innerHTML = `
            <div class="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[75vh]" onclick="event.stopPropagation()">
                <div class="relative flex items-center border-b border-slate-100 px-4 py-3 bg-slate-50/70">
                    <svg class="w-5 h-5 text-slate-400 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <input id="command-palette-input" type="text" autocomplete="off" spellcheck="false" placeholder="Type a command, tab, order #, or client..." class="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 font-medium focus:outline-none" />
                    <kbd class="px-2 py-0.5 text-[10px] bg-white border border-slate-200 text-slate-400 rounded-md font-mono shadow-xs">ESC</kbd>
                </div>
                <div id="command-palette-results" class="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-100/50">
                    <!-- Results dynamically generated -->
                </div>
                <div class="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium select-none">
                    <div class="flex items-center gap-3">
                        <span><kbd class="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] text-slate-600 shadow-xs">↑</kbd> <kbd class="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] text-slate-600 shadow-xs">↓</kbd> Navigate</span>
                        <span><kbd class="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] text-slate-600 shadow-xs">↵</kbd> Select</span>
                    </div>
                    <span><kbd class="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] text-slate-600 shadow-xs">esc</kbd> Dismiss</span>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const input = document.getElementById('command-palette-input');
        if (input) {
            input.addEventListener('input', function() {
                cmdPaletteActiveIndex = 0;
                renderCommandPaletteResults(this.value);
            });
            input.addEventListener('keydown', function(e) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (cmdPaletteFilteredItems.length > 0) {
                        cmdPaletteActiveIndex = (cmdPaletteActiveIndex + 1) % cmdPaletteFilteredItems.length;
                        highlightActiveCommandItem();
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (cmdPaletteFilteredItems.length > 0) {
                        cmdPaletteActiveIndex = (cmdPaletteActiveIndex - 1 + cmdPaletteFilteredItems.length) % cmdPaletteFilteredItems.length;
                        highlightActiveCommandItem();
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (cmdPaletteFilteredItems.length > 0 && cmdPaletteFilteredItems[cmdPaletteActiveIndex]) {
                        executeCommandItem(cmdPaletteActiveIndex);
                    }
                }
            });
        }
    }
    return modal;
}

function openCommandPalette() {
    const modal = ensureCommandPaletteModal();
    modal.classList.remove('hidden');
    const input = document.getElementById('command-palette-input');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 30);
    }
    cmdPaletteActiveIndex = 0;
    renderCommandPaletteResults('');
}
window.openCommandPalette = openCommandPalette;

function closeCommandPalette() {
    const modal = document.getElementById('command-palette-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}
window.closeCommandPalette = closeCommandPalette;

function getCommandPaletteData() {
    const isAdmin = !!document.getElementById('admin-sidebar') || typeof switchTab === 'function';
    const isClient = !!document.getElementById('client-sidebar') || typeof switchClientTab === 'function';

    const items = [];

    if (isAdmin) {
        // Actions
        items.push({
            group: 'Quick Actions',
            icon: '➕',
            title: 'Create Purchase Order',
            subtitle: 'New client order entry (Ctrl+O)',
            badge: 'Ctrl+O',
            action: () => {
                if (typeof switchTab === 'function') switchTab('orders');
                if (typeof openCreatePOModal === 'function') openCreatePOModal();
            }
        });
        items.push({
            group: 'Quick Actions',
            icon: '🏢',
            title: 'Add New B2B Client',
            subtitle: 'Register new client profile & pricing',
            action: () => {
                if (typeof openCreateClientModal === 'function') openCreateClientModal();
                else if (typeof switchTab === 'function') switchTab('clients');
            }
        });
        items.push({
            group: 'Quick Actions',
            icon: '🧴',
            title: 'Add New Product',
            subtitle: 'Register cosmetic SKU to catalog',
            action: () => {
                if (typeof openCreateProductModal === 'function') openCreateProductModal();
                else if (typeof switchTab === 'function') switchTab('products');
            }
        });
        items.push({
            group: 'Quick Actions',
            icon: '📋',
            title: 'Requisition Raw Materials',
            subtitle: 'Submit supply request to Purchasing',
            action: () => {
                if (typeof switchTab === 'function') switchTab('purchasing');
            }
        });
        items.push({
            group: 'Quick Actions',
            icon: '🔄',
            title: 'Refresh Dashboard Metrics',
            subtitle: 'Reload KPI overview and live data',
            action: () => {
                if (typeof loadDashboard === 'function') loadDashboard();
            }
        });

        // Navigation
        const tabs = [
            { id: 'dashboard', name: 'Dashboard', icon: '📊', desc: 'KPI overview & active summary' },
            { id: 'orders', name: 'Purchase Orders', icon: '📦', desc: 'Manage client POs & approvals' },
            { id: 'purchasing', name: 'Requisitions (Purchasing)', icon: '📋', desc: 'Materials ordering & delivery' },
            { id: 'job-orders', name: 'Job Orders', icon: '⚙️', desc: 'Factory manufacturing tickets' },
            { id: 'production', name: 'Batches & Yield', icon: '🏭', desc: 'Batch logging & QC clearance' },
            { id: 'deliveries', name: 'Deliveries / DR', icon: '🚚', desc: 'Delivery receipts & dispatch' },
            { id: 'invoices', name: 'Sales Invoices', icon: '🧾', desc: 'Billing & AR accounts' },
            { id: 'payments', name: 'Payments & Collections', icon: '💵', desc: 'Recorded payments & reconciliation' },
            { id: 'buffer', name: 'Buffer Inventory', icon: '📦', desc: 'Client reserved stock buffer' },
            { id: 'formulations', name: 'Lab & Formulations', icon: '🧪', desc: 'Chemical formulations & recipes' },
            { id: 'clients', name: 'B2B Clients Directory', icon: '🏢', desc: 'Customer accounts & special pricing' },
            { id: 'products', name: 'Products Catalog', icon: '🧴', desc: 'Cosmetic formulas & assigned products' },
            { id: 'users', name: 'User Management', icon: '👥', desc: 'Staff roles, access & credentials' },
            { id: 'reports', name: 'Analytics & Reports', icon: '📈', desc: 'Yield analysis & sales reports' },
            { id: 'audit', name: 'Audit Logs', icon: '📜', desc: 'System security & action trail' },
            { id: 'apikeys', name: 'Developer REST API', icon: '🔑', desc: 'API keys & integration docs' }
        ];

        tabs.forEach(t => {
            items.push({
                group: 'Navigation',
                icon: t.icon,
                title: t.name,
                subtitle: t.desc,
                action: () => {
                    if (typeof switchTab === 'function') switchTab(t.id);
                }
            });
        });

        // Live Orders
        if (window.cachedOrders && Array.isArray(window.cachedOrders)) {
            window.cachedOrders.slice(0, 15).forEach(po => {
                items.push({
                    group: 'Recent Purchase Orders',
                    icon: '📦',
                    title: `${po.po_number} — ${po.company_name || 'Client'}`,
                    subtitle: `Status: ${po.status} | Qty: ${po.total_target_quantity ? Number(po.total_target_quantity).toLocaleString() + ' pcs' : 'N/A'}`,
                    badge: po.status,
                    action: () => {
                        if (typeof switchTab === 'function') switchTab('orders');
                        if (typeof openViewPOModal === 'function') openViewPOModal(po.id);
                    }
                });
            });
        }

        // Live Clients
        if (window.cachedClients && Array.isArray(window.cachedClients)) {
            window.cachedClients.slice(0, 15).forEach(c => {
                items.push({
                    group: 'B2B Clients',
                    icon: '🏢',
                    title: c.company_name || c.name,
                    subtitle: `Contact: ${c.contact_person || 'N/A'} | Email: ${c.email || 'N/A'}`,
                    action: () => {
                        if (typeof switchTab === 'function') switchTab('clients');
                    }
                });
            });
        }
    } else if (isClient) {
        // Client Quick Actions
        items.push({
            group: 'Quick Actions',
            icon: '🛒',
            title: 'Place New Order',
            subtitle: 'Select cosmetic product & submit PO (Ctrl+O)',
            badge: 'Ctrl+O',
            action: () => {
                if (typeof switchClientTab === 'function') switchClientTab('place-order');
            }
        });
        items.push({
            group: 'Quick Actions',
            icon: '🔑',
            title: 'Change Password',
            subtitle: 'Update your client account credentials',
            action: () => {
                if (typeof openClientChangePasswordModal === 'function') openClientChangePasswordModal();
            }
        });

        // Client Navigation
        const clientTabs = [
            { id: 'dashboard', name: 'Overview Dashboard', icon: '📊', desc: 'Order tracking & stats' },
            { id: 'my-orders', name: 'My Orders', icon: '📦', desc: 'Live status of submitted POs' },
            { id: 'dr-acceptance', name: 'DR Acceptance', icon: '📥', desc: 'Accept & sign delivery receipts' },
            { id: 'invoices', name: 'Invoices & Statements', icon: '🧾', desc: 'Billing history & balance' },
            { id: 'buffer', name: 'Buffer Stock', icon: '📦', desc: 'View reserved factory inventory' },
            { id: 'place-order', name: 'Place Order', icon: '🛍️', desc: 'Catalog & ordering page' }
        ];

        clientTabs.forEach(t => {
            items.push({
                group: 'Navigation',
                icon: t.icon,
                title: t.name,
                subtitle: t.desc,
                action: () => {
                    if (typeof switchClientTab === 'function') switchClientTab(t.id);
                }
            });
        });
    }

    return items;
}

function renderCommandPaletteResults(query = '') {
    const resultsContainer = document.getElementById('command-palette-results');
    if (!resultsContainer) return;

    const allItems = getCommandPaletteData();
    const q = (query || '').toLowerCase().trim();

    if (!q) {
        cmdPaletteFilteredItems = allItems;
    } else {
        cmdPaletteFilteredItems = allItems.filter(item => {
            const titleMatch = (item.title || '').toLowerCase().includes(q);
            const subMatch = (item.subtitle || '').toLowerCase().includes(q);
            const groupMatch = (item.group || '').toLowerCase().includes(q);
            return titleMatch || subMatch || groupMatch;
        });
    }

    if (cmdPaletteFilteredItems.length === 0) {
        resultsContainer.innerHTML = `
            <div class="py-8 text-center text-slate-400">
                <div class="text-2xl mb-1">🔍</div>
                <div class="text-xs font-semibold">No results matching "${query}"</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Try searching for a tab name, order number, or client.</div>
            </div>
        `;
        return;
    }

    // Group items by category
    const groups = {};
    cmdPaletteFilteredItems.forEach((item, idx) => {
        const g = item.group || 'Actions';
        if (!groups[g]) groups[g] = [];
        groups[g].push({ ...item, globalIndex: idx });
    });

    let html = '';
    for (const [groupName, groupItems] of Object.entries(groups)) {
        html += `
            <div class="pt-2 pb-1 first:pt-1">
                <div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">${groupName}</div>
                <div class="space-y-0.5">
                    ${groupItems.map(item => `
                        <div id="cmd-item-${item.globalIndex}" onclick="executeCommandItem(${item.globalIndex})" class="cmd-item flex items-center justify-between px-3 py-2 rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 transition cursor-pointer select-none ${item.globalIndex === cmdPaletteActiveIndex ? 'bg-indigo-50 text-indigo-900 font-semibold ring-1 ring-indigo-200' : ''}">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <span class="text-base flex-shrink-0">${item.icon || '⚡'}</span>
                                <div class="truncate">
                                    <div class="text-xs text-slate-900 font-bold truncate leading-tight">${item.title}</div>
                                    ${item.subtitle ? `<div class="text-[10px] text-slate-500 truncate leading-tight mt-0.5">${item.subtitle}</div>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                ${item.badge ? `<span class="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9.5px] font-mono text-slate-600 shadow-xs">${item.badge}</span>` : ''}
                                <span class="text-slate-400 text-xs">↵</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    resultsContainer.innerHTML = html;
    highlightActiveCommandItem();
}

function highlightActiveCommandItem() {
    document.querySelectorAll('.cmd-item').forEach((el, idx) => {
        if (idx === cmdPaletteActiveIndex) {
            el.classList.add('bg-indigo-50', 'text-indigo-900', 'font-semibold', 'ring-1', 'ring-indigo-200');
            el.scrollIntoView({ block: 'nearest' });
        } else {
            el.classList.remove('bg-indigo-50', 'text-indigo-900', 'font-semibold', 'ring-1', 'ring-indigo-200');
        }
    });
}

function executeCommandItem(idx) {
    if (cmdPaletteFilteredItems[idx] && typeof cmdPaletteFilteredItems[idx].action === 'function') {
        const act = cmdPaletteFilteredItems[idx].action;
        closeCommandPalette();
        act();
    }
}
window.executeCommandItem = executeCommandItem;





/**
 * NKB Manufacturing & Trading - Client Portal Script
 */

let clientProducts = [];
let selectedProductId = null;
let signaturePad = null;

document.addEventListener('DOMContentLoaded', async () => {
    await NKB.init();
    if (!NKB.user) {
        window.location.href = '/index.html';
        return;
    }

    if (NKB.user.companyName) {
        const titleEl = document.getElementById('client-welcome-title');
        if (titleEl) titleEl.textContent = `Welcome, ${NKB.user.companyName}`;
    }

    await loadClientProducts();
    loadClientDashboard();
});

// Tab Switching
function switchClientTab(tabId) {
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.querySelectorAll('.client-sidebar-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'font-bold', 'shadow-md', 'shadow-indigo-600/30', 'bg-slate-800');
        btn.classList.add('text-slate-400');
    });

    const targetSec = document.getElementById(`client-view-${tabId}`);
    const targetBtn = document.getElementById(`tab-btn-${tabId}`);

    if (targetSec) targetSec.classList.remove('hidden');
    if (targetBtn) {
        targetBtn.classList.add('bg-indigo-600', 'text-white', 'font-bold', 'shadow-md', 'shadow-indigo-600/30');
        targetBtn.classList.remove('text-slate-400');
    }

    if (tabId === 'dashboard') loadClientDashboard();
    else if (tabId === 'place-order') renderProductCards();
    else if (tabId === 'my-orders') loadClientOrders();
    else if (tabId === 'tracking') loadClientTracking();
    else if (tabId === 'dr-acceptance') loadClientDeliveries();
    else if (tabId === 'invoices') loadClientInvoices();
    else if (tabId === 'buffer') loadClientBuffer();
}

// -------------------------------------------------------------
// 1. DASHBOARD
// -------------------------------------------------------------
async function loadClientDashboard() {
    const [kpiRes, ordersRes, drsRes] = await Promise.all([
        NKB.api('/api/reports/overview'),
        NKB.api('/api/orders'),
        NKB.api('/api/deliveries?status=PENDING_CLIENT_ACCEPTANCE')
    ]);

    if (kpiRes.success && kpiRes.data) {
        const d = kpiRes.data;
        const setElText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        setElText('client-kpi-open-pos', NKB.formatNumber(d.openPOs));
        setElText('client-kpi-pending-drs', NKB.formatNumber(d.pendingDRs));
        setElText('client-kpi-unpaid-invoices', NKB.formatCurrency(d.outstandingBalance));
        setElText('client-kpi-buffer-units', `${NKB.formatNumber(d.availableBufferUnits)} pcs`);
    }

    // Pending DR Banner
    const banner = document.getElementById('client-pending-dr-banner');
    if (drsRes.success && drsRes.data && drsRes.data.length > 0) {
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }

    // Recent POs
    const tbody = document.getElementById('client-table-recent-pos');
    if (ordersRes.success && ordersRes.data && ordersRes.data.length > 0) {
        tbody.innerHTML = ordersRes.data.slice(0, 5).map(po => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">${po.po_number}</td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(po.po_date)}</td>
                <td class="py-3 px-4"><span class="badge ${po.billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}">${po.billing_policy}</span></td>
                <td class="py-3 px-4 font-extrabold text-slate-900">${NKB.formatCurrency(po.grand_total)}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(po.status)}</td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400">No purchase orders placed yet.</td></tr>`;
    }
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// 2. PLACE MULTI-ITEM PURCHASE ORDER
// -------------------------------------------------------------
let clientCartItems = [];

async function loadClientProducts() {
    const res = await NKB.api('/api/products?activeOnly=true');
    if (res.success && res.data) {
        clientProducts = res.data;
    }
}

function renderProductCards() {
    const container = document.getElementById('client-product-cards-grid');
    if (!container) return;

    if (clientProducts.length === 0) {
        container.innerHTML = '<div class="p-6 text-center text-slate-400">No products available in your catalog.</div>';
        return;
    }

    container.innerHTML = clientProducts.map(p => `
        <div class="p-4 rounded-2xl border border-slate-200 hover:border-indigo-200 bg-white hover:bg-slate-50/50 shadow-sm transition flex flex-col justify-between space-y-3">
            <div>
                <div class="flex justify-between items-start">
                    <span class="font-mono text-xs text-indigo-600 font-bold">${p.effective_sku || p.sku}</span>
                    <div class="flex items-center gap-1.5">
                        ${p.has_custom_price ? '<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">Contract Rate</span>' : ''}
                        <span class="badge bg-slate-100 text-slate-700 text-[10px]">${p.category}</span>
                    </div>
                </div>
                <h4 class="font-bold text-slate-900 text-sm mt-1">${p.name}</h4>
                <p class="text-[11px] text-slate-500 line-clamp-2 mt-0.5">${p.description || ''}</p>
            </div>
            <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                <div>
                    <span class="text-[10px] text-slate-400 uppercase font-semibold">Your Price</span>
                    <div class="text-base font-extrabold text-indigo-950">₱${p.default_price.toFixed(2)}<span class="text-xs text-slate-400 font-normal"> / ${p.unit || 'pc'}</span></div>
                </div>
                <div class="flex items-center gap-2">
                    <input type="number" min="50" step="50" value="500" id="catalog-qty-${p.id}" class="w-20 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 text-center focus:ring-2 focus:ring-indigo-500">
                    <button type="button" onclick="addToClientCart('${p.id}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-sm shadow-indigo-600/30 transition flex items-center gap-1">
                        <span>➕</span><span>Add to PO</span>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    renderClientCart();
}

function addToClientCart(productId) {
    const prod = clientProducts.find(p => p.id === productId);
    if (!prod) return;

    const qtyInput = document.getElementById(`catalog-qty-${productId}`);
    const qty = qtyInput ? (parseInt(qtyInput.value) || 500) : 500;

    const existingIndex = clientCartItems.findIndex(i => i.product_id === productId);
    if (existingIndex >= 0) {
        clientCartItems[existingIndex].target_quantity += qty;
    } else {
        clientCartItems.push({
            product_id: prod.id,
            name: prod.name,
            sku: prod.effective_sku || prod.sku,
            unit_price: prod.default_price,
            target_quantity: qty
        });
    }

    NKB.showToast(`Added ${NKB.formatNumber(qty)} pcs of ${prod.name} to order!`, 'success');
    renderClientCart();
}

function removeFromClientCart(index) {
    clientCartItems.splice(index, 1);
    renderClientCart();
}

function updateClientCartQty(index, newQty) {
    const qty = parseInt(newQty) || 0;
    if (qty <= 0) {
        removeFromClientCart(index);
    } else {
        clientCartItems[index].target_quantity = qty;
        renderClientCart();
    }
}

function renderClientCart() {
    const tbody = document.getElementById('client-po-items-table-body');
    const countEl = document.getElementById('cart-item-count');
    const totalQtyEl = document.getElementById('client-summary-total-qty');
    const subtotalEl = document.getElementById('client-summary-subtotal');
    const grandTotalEl = document.getElementById('client-summary-grand-total');

    if (countEl) countEl.textContent = clientCartItems.length;

    let totalQty = 0;
    let grandTotal = 0;

    if (!tbody) return;

    if (clientCartItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 font-medium">No products added yet. Click "+ Add to PO" on any product to the left.</td></tr>`;
    } else {
        tbody.innerHTML = clientCartItems.map((item, idx) => {
            const lineSubtotal = (item.target_quantity || 0) * (item.unit_price || 0);
            totalQty += item.target_quantity || 0;
            grandTotal += lineSubtotal;

            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${item.name}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${item.sku}</div>
                    </td>
                    <td class="py-2.5 px-2">
                        <input type="number" min="1" step="1" 
                               value="${item.target_quantity}" 
                               onchange="updateClientCartQty(${idx}, this.value)" 
                               class="w-20 px-2 py-1 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 text-center focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="py-2.5 px-2 font-semibold text-slate-700">
                        ₱${item.unit_price.toFixed(2)}
                    </td>
                    <td class="py-2.5 px-2 font-extrabold text-indigo-900">
                        ${NKB.formatCurrency(lineSubtotal)}
                    </td>
                    <td class="py-2.5 px-2 text-center">
                        <button type="button" onclick="removeFromClientCart(${idx})" class="p-1 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded transition" title="Remove item">
                            ✖
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (totalQtyEl) totalQtyEl.textContent = `${NKB.formatNumber(totalQty)} pcs`;
    if (subtotalEl) subtotalEl.textContent = NKB.formatCurrency(grandTotal);
    if (grandTotalEl) grandTotalEl.textContent = NKB.formatCurrency(grandTotal);
}

let pendingClientPOPayload = null;

function submitClientPO(e) {
    e.preventDefault();
    if (clientCartItems.length === 0) {
        NKB.showToast('Please add at least one product to your order before submitting.', 'error');
        return;
    }

    for (const item of clientCartItems) {
        if (!item.product_id || item.target_quantity <= 0) {
            NKB.showToast('All items must have valid quantity > 0.', 'error');
            return;
        }
    }

    const policy = document.querySelector('input[name="client_billing_policy"]:checked')?.value || 'ACTUAL_DELIVERY';
    const notes = document.getElementById('client-order-notes')?.value || '';

    pendingClientPOPayload = {
        billing_policy: policy,
        notes,
        items: clientCartItems.map(it => ({ ...it, subtotal: (it.target_quantity || 0) * (it.unit_price || 0) }))
    };

    openClientPODoubleCheckModal();
}

function openClientPODoubleCheckModal() {
    if (!pendingClientPOPayload) return;
    const modalRoot = document.getElementById('client-modals-root');
    if (!modalRoot) return;

    const totalQty = pendingClientPOPayload.items.reduce((acc, it) => acc + (it.target_quantity || 0), 0);
    const grandTotal = pendingClientPOPayload.items.reduce((acc, it) => acc + (it.subtotal || 0), 0);

    modalRoot.innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border-2 border-indigo-200 space-y-4 max-h-[92vh] flex flex-col">
                <div class="flex justify-between items-center pb-3 border-b border-slate-100 flex-shrink-0">
                    <div class="flex items-center gap-2">
                        <span class="p-2 bg-amber-100 text-amber-800 rounded-2xl text-xl">🔍</span>
                        <div>
                            <h3 class="text-lg font-black text-slate-900">Purchase Order Verification & Review</h3>
                            <p class="text-xs text-indigo-600 font-bold">Please review order details and verify quantities before submission</p>
                        </div>
                    </div>
                    <button onclick="closeClientModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>

                <div class="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
                    <!-- Policy & Notes -->
                    <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <span class="text-slate-400 text-[10px] uppercase font-bold block">Billing Policy</span>
                            <span class="inline-block px-2 py-0.5 mt-0.5 rounded text-[11px] font-bold ${pendingClientPOPayload.billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-100 text-indigo-800' : 'bg-purple-100 text-purple-800'}">
                                ${pendingClientPOPayload.billing_policy === 'ACTUAL_DELIVERY' ? 'Option A: Bill Actual Delivered' : 'Option B: Fixed PO + Buffer Stock'}
                            </span>
                        </div>
                        ${pendingClientPOPayload.notes ? `
                            <div class="sm:col-span-2 pt-2 border-t border-slate-200">
                                <span class="text-slate-400 text-[10px] uppercase font-bold block">Order / Packaging Notes</span>
                                <span class="text-slate-700 italic">${pendingClientPOPayload.notes}</span>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Products Review Table -->
                    <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div class="p-2.5 bg-indigo-50/70 border-b border-indigo-100 flex justify-between items-center">
                            <span class="font-extrabold text-indigo-950 uppercase tracking-wider text-[11px]">Order Line Items (${pendingClientPOPayload.items.length} items)</span>
                            <span class="text-[11px] text-slate-500 font-semibold">Verify Quantities and Contract Rates</span>
                        </div>
                        <table class="w-full text-left text-xs">
                            <thead class="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                                <tr>
                                    <th class="py-2 px-3">Product</th>
                                    <th class="py-2 px-3 text-right">Target Qty</th>
                                    <th class="py-2 px-3 text-right">Unit Rate</th>
                                    <th class="py-2 px-3 text-right">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 font-medium">
                                ${pendingClientPOPayload.items.map(it => `
                                    <tr class="hover:bg-slate-50">
                                        <td class="py-2.5 px-3">
                                            <div class="font-bold text-slate-900">${it.name}</div>
                                            <div class="text-[10px] text-slate-400 font-mono">${it.sku}</div>
                                        </td>
                                        <td class="py-2.5 px-3 text-right font-black text-slate-800">
                                            ${NKB.formatNumber(it.target_quantity)} pcs
                                        </td>
                                        <td class="py-2.5 px-3 text-right font-semibold text-slate-700">
                                            ${NKB.formatCurrency(it.unit_price)}
                                        </td>
                                        <td class="py-2.5 px-3 text-right font-black text-indigo-900">
                                            ${NKB.formatCurrency(it.subtotal)}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Grand Summary Box -->
                    <div class="p-4 bg-indigo-950 text-white rounded-2xl shadow flex justify-between items-center">
                        <div>
                            <div class="text-[10px] uppercase tracking-wider text-indigo-300 font-bold">Total Order Output</div>
                            <div class="text-base font-black text-white">${NKB.formatNumber(totalQty)} pcs (${pendingClientPOPayload.items.length} Lines)</div>
                        </div>
                        <div class="text-right">
                            <div class="text-[10px] uppercase tracking-wider text-indigo-300 font-bold">Estimated Grand Total</div>
                            <div class="text-xl font-black text-emerald-400">${NKB.formatCurrency(grandTotal)}</div>
                        </div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-slate-100 flex-shrink-0">
                    <button type="button" onclick="closeClientModal()" class="w-full sm:w-auto px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border-2 border-amber-300 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 shadow-sm">
                        <span>✏️ Edit / Modify Cart</span>
                    </button>
                    <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button type="button" onclick="closeClientModal()" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition">
                            Cancel
                        </button>
                        <button type="button" id="btn-client-confirm-po" onclick="confirmAndExecuteClientPOSubmit()" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-1.5">
                            <span>✅ Confirm & Submit Purchase Order</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function closeClientModal() {
    const modalRoot = document.getElementById('client-modals-root');
    if (modalRoot) modalRoot.innerHTML = '';
}

async function confirmAndExecuteClientPOSubmit() {
    if (!pendingClientPOPayload) return;
    const btn = document.getElementById('btn-client-confirm-po');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Submitting...';
    }

    const res = await NKB.api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
            tolerance_percent: 10.0,
            billing_policy: pendingClientPOPayload.billing_policy,
            notes: pendingClientPOPayload.notes,
            items: pendingClientPOPayload.items.map(item => ({
                product_id: item.product_id,
                target_quantity: item.target_quantity,
                unit_price: item.unit_price
            }))
        })
    });

    if (res.success) {
        NKB.showToast(`🎉 Purchase Order ${res.data.po_number} submitted successfully!`, 'success');
        closeClientModal();
        pendingClientPOPayload = null;
        clientCartItems = [];
        renderClientCart();
        switchClientTab('my-orders');
    } else {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✅ Tama Lahat — Confirm & Submit P.O';
        }
        NKB.showToast(res.error || 'Failed to submit order.', 'error');
    }
}

// -------------------------------------------------------------
// 3. MY PURCHASE ORDERS
// -------------------------------------------------------------
async function loadClientOrders() {
    const res = await NKB.api('/api/orders');
    const tbody = document.getElementById('client-table-all-orders');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(po => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">${po.po_number}</td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(po.po_date)}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${NKB.formatNumber(po.total_target_quantity)} pcs</td>
                <td class="py-3 px-4"><span class="badge ${po.billing_policy === 'ACTUAL_DELIVERY' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}">${po.billing_policy}</span></td>
                <td class="py-3 px-4 font-extrabold text-slate-900">${NKB.formatCurrency(po.grand_total)}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(po.status)}</td>
                <td class="py-3 px-4 text-right">
                    <a href="/print-po.html?id=${po.id}" target="_blank" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition inline-flex items-center gap-1">
                        <span>🖨️</span><span>Print PO</span>
                    </a>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">No orders found.</td></tr>`;
    }
}

// -------------------------------------------------------------
// 4. PRODUCTION TRACKING TIMELINE
// -------------------------------------------------------------
async function loadClientTracking() {
    const [batchesRes, ordersRes] = await Promise.all([
        NKB.api('/api/production/batches'),
        NKB.api('/api/orders')
    ]);

    const container = document.getElementById('client-production-timeline-container');
    if (!container) return;

    if (batchesRes.success && batchesRes.data && batchesRes.data.length > 0) {
        container.innerHTML = batchesRes.data.map(b => {
            // Determine active step (0-5)
            let step = 1;
            if (b.status === 'MIXING') step = 2;
            else if (b.status === 'BOTTLING') step = 3;
            else if (b.status === 'QC_PASSED' || b.status === 'EXCEPTION_REQUIRES_APPROVAL') step = 4;
            else if (b.status === 'APPROVED_FOR_DISPATCH' || b.status === 'COMPLETED') step = 5;

            return `
                <div class="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-4">
                        <div>
                            <span class="text-xs font-mono text-indigo-600 font-bold">BATCH: ${b.batch_number}</span>
                            <h3 class="text-lg font-black text-slate-900">${b.product_name} <span class="text-xs font-normal text-slate-400">(${b.sku})</span></h3>
                            <div class="text-xs text-slate-500">PO Ref: <strong class="text-slate-700">${b.po_number}</strong> | SO Ref: <strong class="text-slate-700">${b.jo_number}</strong></div>
                        </div>
                        <div class="text-right">
                            ${NKB.renderStatusBadge(b.status)}
                            <div class="text-xs text-slate-400 mt-1">Target: ${NKB.formatNumber(b.target_quantity)} pcs</div>
                        </div>
                    </div>

                    <!-- Progress Stepper -->
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <div class="p-3 rounded-xl ${step >= 1 ? 'bg-indigo-50 border-2 border-indigo-500' : 'bg-slate-50 border border-slate-200'}">
                            <div class="text-xs font-bold ${step >= 1 ? 'text-indigo-900' : 'text-slate-400'}">1. Order Approved</div>
                            <div class="text-[10px] text-slate-500 mt-0.5">Formulation Assigned</div>
                        </div>
                        <div class="p-3 rounded-xl ${step >= 2 ? 'bg-indigo-50 border-2 border-indigo-500' : 'bg-slate-50 border border-slate-200'}">
                            <div class="text-xs font-bold ${step >= 2 ? 'text-indigo-900' : 'text-slate-400'}">2. Batch Mixing</div>
                            <div class="text-[10px] text-slate-500 mt-0.5">Bulk tank compounding</div>
                        </div>
                        <div class="p-3 rounded-xl ${step >= 3 ? 'bg-indigo-50 border-2 border-indigo-500' : 'bg-slate-50 border border-slate-200'}">
                            <div class="text-xs font-bold ${step >= 3 ? 'text-indigo-900' : 'text-slate-400'}">3. Bottling & Filling</div>
                            <div class="text-[10px] text-slate-500 mt-0.5">Capping & labeling</div>
                        </div>
                        <div class="p-3 rounded-xl ${step >= 4 ? 'bg-indigo-50 border-2 border-indigo-500' : 'bg-slate-50 border border-slate-200'}">
                            <div class="text-xs font-bold ${step >= 4 ? 'text-indigo-900' : 'text-slate-400'}">4. QC Lab Testing</div>
                            <div class="text-[10px] text-slate-500 mt-0.5">Micro & viscosity pass</div>
                        </div>
                        <div class="p-3 rounded-xl ${step >= 5 ? 'bg-emerald-50 border-2 border-emerald-500' : 'bg-slate-50 border border-slate-200'}">
                            <div class="text-xs font-bold ${step >= 5 ? 'text-emerald-900' : 'text-slate-400'}">5. Ready / Dispatched</div>
                            <div class="text-[10px] text-slate-500 mt-0.5">Dispatched to client</div>
                        </div>
                    </div>

                    ${b.actual_yield > 0 ? `
                        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                                <span class="text-xs text-slate-500 font-semibold">Production Yield Result:</span>
                                <div class="text-base font-extrabold text-slate-900">${NKB.formatNumber(b.actual_yield)} pcs finished</div>
                            </div>
                            <div>
                                ${NKB.renderVarianceBadge(b.variance_quantity, b.variance_percent)}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = `<div class="p-8 text-center bg-white rounded-3xl border text-slate-400 font-medium">No active production batches found.</div>`;
    }
}

// -------------------------------------------------------------
// 5. DELIVERIES & DIGITAL DR ACCEPTANCE
// -------------------------------------------------------------
async function loadClientDeliveries() {
    const res = await NKB.api('/api/deliveries');
    const tbody = document.getElementById('client-table-drs');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(dr => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">${dr.dr_number}</td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(dr.delivery_date)}</td>
                <td class="py-3 px-4 text-slate-600">${dr.po_number}</td>
                <td class="py-3 px-4 font-bold text-slate-700">${NKB.formatNumber(dr.total_delivered)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-emerald-700">${dr.total_accepted > 0 ? NKB.formatNumber(dr.total_accepted) + ' pcs' : '<span class="text-amber-600 italic">Pending sign-off</span>'}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(dr.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5">
                    <a href="/print-dr.html?id=${dr.id}" target="_blank" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block">
                        🖨️ View DR
                    </a>
                    ${dr.status === 'PENDING_CLIENT_ACCEPTANCE' ? `
                        <button onclick="openClientDRAcceptModal('${dr.id}')" class="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-xs font-extrabold shadow-sm transition animate-pulse">
                            ✍️ Inspect & Accept
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">No deliveries found.</td></tr>`;
    }
}

// Digital Signature Canvas Controller & Modal
async function openClientDRAcceptModal(drId) {
    const res = await NKB.api(`/api/deliveries/${drId}`);
    if (!res.success || !res.data) {
        NKB.showToast('Delivery record not found.', 'error');
        return;
    }
    const dr = res.data;

    const root = document.getElementById('client-modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div class="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8">
                <div class="flex justify-between items-center border-b border-slate-100 pb-4">
                    <div>
                        <span class="text-xs font-bold text-amber-600 uppercase">Physical Goods Inspection</span>
                        <h3 class="text-xl font-black text-slate-900">Accept Delivery Receipt: ${dr.dr_number}</h3>
                    </div>
                    <button onclick="closeClientModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>

                <div class="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 space-y-1.5">
                    <div class="font-bold">📋 Instructions for Receiving Personnel:</div>
                    <div>Inspect master cartons and bottle seals. Verify count against actual delivered quantity. Any accepted units will be officially billed under your agreed purchase order rate.</div>
                </div>

                <!-- Items Breakdown Inspection Table -->
                <div class="border rounded-2xl overflow-hidden text-xs">
                    <table class="w-full text-left">
                        <thead class="bg-slate-50 border-b text-slate-600 font-bold uppercase">
                            <tr>
                                <th class="p-3">Product & Batch</th>
                                <th class="p-3">Delivered</th>
                                <th class="p-3">Accepted Qty</th>
                                <th class="p-3">Rejected / Damaged</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 font-medium">
                            ${dr.items.map(item => `
                                <tr>
                                    <td class="p-3">
                                        <div class="font-bold text-slate-900">${item.product_name}</div>
                                        <div class="text-[10px] text-slate-400 font-mono">Batch: ${item.batch_number} (Exp: ${NKB.formatDate(item.expiry_date)})</div>
                                    </td>
                                    <td class="p-3 font-extrabold text-slate-900">${NKB.formatNumber(item.delivered_quantity)} pcs</td>
                                    <td class="p-3">
                                        <input type="number" id="accept-item-${item.id}" value="${item.delivered_quantity}" max="${item.delivered_quantity}" min="0" oninput="validateItemCounts('${item.id}', ${item.delivered_quantity})" class="w-24 px-2 py-1.5 border-2 border-emerald-300 rounded-lg font-bold text-emerald-900">
                                    </td>
                                    <td class="p-3">
                                        <input type="number" id="reject-item-${item.id}" value="0" max="${item.delivered_quantity}" min="0" oninput="validateRejectCounts('${item.id}', ${item.delivered_quantity})" class="w-20 px-2 py-1.5 border rounded-lg text-rose-700">
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Digital Signature Block -->
                <form id="form-digital-sign" onsubmit="submitDigitalDRAcceptance(event, '${dr.id}')" class="space-y-4 text-xs font-semibold">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-slate-600 mb-1">Authorized Receiver Full Name</label>
                            <input type="text" id="signer-name" value="${NKB.user ? NKB.user.name : ''}" required placeholder="e.g. Maria Santos" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                        <div>
                            <label class="block text-slate-600 mb-1">Title / Designation</label>
                            <input type="text" id="signer-title" value="Purchasing Manager" required placeholder="e.g. Warehouse Lead / Manager" class="w-full px-3 py-2 border rounded-xl bg-slate-50">
                        </div>
                    </div>

                    <!-- Signature Pad Canvas -->
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="block text-slate-600">Digital Signature (Draw or Sign below)</label>
                            <button type="button" onclick="clearSignatureCanvas()" class="text-indigo-600 hover:underline text-[11px]">Clear Canvas</button>
                        </div>
                        <canvas id="dr-signature-canvas" width="560" height="130" class="signature-canvas w-full"></canvas>
                    </div>

                    <div>
                        <label class="block text-slate-600 mb-1">Receiving Remarks / Notes</label>
                        <textarea id="dr-acceptance-remarks" rows="2" placeholder="Received in good condition and count verified..." class="w-full px-3 py-2 border rounded-xl bg-slate-50">Received in full and verified.</textarea>
                    </div>

                    <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button type="button" onclick="closeClientModal()" class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
                        <button type="submit" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl shadow-lg shadow-emerald-600/30 transition">
                            ✅ Complete Digital Acceptance & Authorize Billing
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    setupSignatureCanvas();
}

function closeClientModal() {
    const root = document.getElementById('client-modals-root');
    if (root) root.innerHTML = '';
}

function setupSignatureCanvas() {
    const canvas = document.getElementById('dr-signature-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let isDrawing = false;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });

    window.addEventListener('mouseup', () => { isDrawing = false; });

    // Touch events for mobile/tablet signature
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isDrawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!isDrawing) return;
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });

    canvas.addEventListener('touchend', () => { isDrawing = false; });
}

function clearSignatureCanvas() {
    const canvas = document.getElementById('dr-signature-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function validateItemCounts(itemId, deliveredQty) {
    const acceptInput = document.getElementById(`accept-item-${itemId}`);
    const rejectInput = document.getElementById(`reject-item-${itemId}`);
    const acceptVal = parseInt(acceptInput.value) || 0;
    rejectInput.value = Math.max(0, deliveredQty - acceptVal);
}

function validateRejectCounts(itemId, deliveredQty) {
    const acceptInput = document.getElementById(`accept-item-${itemId}`);
    const rejectInput = document.getElementById(`reject-item-${itemId}`);
    const rejectVal = parseInt(rejectInput.value) || 0;
    acceptInput.value = Math.max(0, deliveredQty - rejectVal);
}

async function submitDigitalDRAcceptance(e, drId) {
    e.preventDefault();
    const signerName = document.getElementById('signer-name').value;
    const signerTitle = document.getElementById('signer-title').value;
    const remarks = document.getElementById('dr-acceptance-remarks').value;

    const canvas = document.getElementById('dr-signature-canvas');
    const signatureData = canvas ? canvas.toDataURL('image/png') : `Signed by ${signerName}`;

    // Collect item accept/reject quantities
    const acceptInputs = document.querySelectorAll('[id^="accept-item-"]');
    const items = [];

    acceptInputs.forEach(input => {
        const itemId = input.id.replace('accept-item-', '');
        const rejectInput = document.getElementById(`reject-item-${itemId}`);
        items.push({
            id: itemId,
            accepted_quantity: parseInt(input.value) || 0,
            rejected_quantity: parseInt(rejectInput.value) || 0,
            reason: 'Quality / seal check during client receiving'
        });
    });

    const res = await NKB.api(`/api/deliveries/${drId}/accept`, {
        method: 'POST',
        body: JSON.stringify({
            signer_name: signerName,
            signer_title: signerTitle,
            signature_data: signatureData,
            signature_type: 'DRAWN',
            items,
            acceptance_notes: remarks
        })
    });

    if (res.success) {
        NKB.showToast(res.message, 'success');
        closeClientModal();
        loadClientDeliveries();
        loadClientDashboard();
    } else {
        NKB.showToast(res.error || 'Failed to accept DR.', 'error');
    }
}

// -------------------------------------------------------------
// 6. INVOICES & SOA
// -------------------------------------------------------------
async function loadClientInvoices() {
    const res = await NKB.api('/api/invoices');
    const tbody = document.getElementById('client-table-invoices');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(si => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-indigo-600">${si.invoice_number}</td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(si.invoice_date)}</td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(si.due_date)}</td>
                <td class="py-3 px-4 text-slate-600">${si.dr_number}</td>
                <td class="py-3 px-4 font-extrabold text-slate-900">${NKB.formatCurrency(si.total_amount)}</td>
                <td class="py-3 px-4 font-bold text-emerald-700">${NKB.formatCurrency(si.paid_amount)}</td>
                <td class="py-3 px-4 font-extrabold text-rose-700">${NKB.formatCurrency(si.balance_due)}</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(si.status)}</td>
                <td class="py-3 px-4 text-right space-x-1.5">
                    <a href="/print-invoice.html?id=${si.id}" target="_blank" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition inline-block">
                        🖨️ View SI
                    </a>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-400">No invoices issued yet.</td></tr>`;
    }
}

// -------------------------------------------------------------
// 7. MY RESERVED BUFFER
// -------------------------------------------------------------
async function loadClientBuffer() {
    const res = await NKB.api('/api/buffer-stock');
    const tbody = document.getElementById('client-table-buffer');

    if (res.success && res.data && res.data.length > 0) {
        tbody.innerHTML = res.data.map(bs => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-slate-800">${bs.product_name} <span class="text-xs text-slate-400">(${bs.sku})</span></td>
                <td class="py-3 px-4 text-slate-600">${bs.po_number} / ${bs.batch_number}</td>
                <td class="py-3 px-4 text-slate-600">${NKB.formatDate(bs.date_reserved)}</td>
                <td class="py-3 px-4 font-bold text-slate-700">${NKB.formatNumber(bs.initial_quantity)} pcs</td>
                <td class="py-3 px-4 font-semibold text-purple-700">${NKB.formatNumber(bs.quantity_released)} pcs</td>
                <td class="py-3 px-4 font-extrabold text-emerald-700">${NKB.formatNumber(bs.quantity_remaining)} pcs</td>
                <td class="py-3 px-4">${NKB.renderStatusBadge(bs.status)}</td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">No reserved buffer stock in warehouse.</td></tr>`;
    }
}

// -------------------------------------------------------------
// 8. CHANGE PASSWORD MODAL
// -------------------------------------------------------------
function openClientChangePasswordModal() {
    const root = document.getElementById('client-modals-root');
    root.innerHTML = `
        <div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
                <div class="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">🔒</span>
                        <h3 class="font-extrabold text-slate-900 text-lg">Change Portal Password</h3>
                    </div>
                    <button onclick="document.getElementById('client-modals-root').innerHTML=''" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
                </div>

                <form id="form-change-password" onsubmit="submitClientChangePassword(event)" class="mt-5 space-y-4 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">Current Password *</label>
                        <input type="password" id="cp-current" required placeholder="Enter current password" class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">New Password (Min. 8 characters) *</label>
                        <input type="password" id="cp-new" required minlength="8" placeholder="Enter new strong password" class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">Confirm New Password *</label>
                        <input type="password" id="cp-confirm" required minlength="8" placeholder="Re-type new password" class="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500">
                    </div>

                    <div id="cp-error" class="hidden p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-semibold"></div>

                    <div class="pt-3 flex gap-3">
                        <button type="button" onclick="document.getElementById('client-modals-root').innerHTML=''" class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition">
                            Cancel
                        </button>
                        <button type="submit" id="btn-cp-submit" class="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-extrabold rounded-xl shadow-lg transition">
                            Update Password
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function submitClientChangePassword(e) {
    e.preventDefault();
    const currentPass = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirmPass = document.getElementById('cp-confirm').value;
    const errEl = document.getElementById('cp-error');
    const btn = document.getElementById('btn-cp-submit');

    errEl.classList.add('hidden');

    if (newPass !== confirmPass) {
        errEl.textContent = 'New password and confirmation do not match.';
        errEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
        const res = await NKB.api('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({
                current_password: currentPass,
                new_password: newPass
            })
        });

        if (res.success) {
            NKB.showToast('✅ Password changed successfully!', 'success');
            document.getElementById('client-modals-root').innerHTML = '';
        } else {
            errEl.textContent = res.error || res.message || 'Failed to change password.';
            errEl.classList.remove('hidden');
        }
    } catch (err) {
        errEl.textContent = err.message || 'Error occurred while updating password.';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Update Password';
    }
}

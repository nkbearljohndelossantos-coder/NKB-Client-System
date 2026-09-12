const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sales Order / Job Order - NKB Manufacturing Corporation</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <style>
        /* Base Reset */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: Arial, Helvetica, sans-serif;
            color: #000000;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        /* -------------------------------------------------------------
           PRINT STYLING (Strictly 1 A4 Page with 2 Stacked Landscape Slips)
           ------------------------------------------------------------- */
        @page {
            size: A4 portrait;
            margin: 5mm 8mm;
        }

        @media print {
            html, body {
                width: 210mm;
                height: 297mm;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                overflow: hidden !important;
            }

            .no-print {
                display: none !important;
            }

            .page-container {
                width: 194mm !important; /* 210mm - 2*8mm margin */
                height: 287mm !important; /* 297mm - 2*5mm margin */
                margin: 0 auto !important;
                padding: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                box-shadow: none !important;
                border: none !important;
                page-break-after: avoid !important;
                break-after: avoid !important;
                overflow: hidden !important;
            }

            .slip-slip {
                height: 137mm !important;
                max-height: 137mm !important;
                overflow: hidden !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                padding: 1mm 2mm !important;
                box-sizing: border-box !important;
            }

            .cut-divider {
                height: 7mm !important;
                margin: 0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
        }

        /* -------------------------------------------------------------
           SCREEN PREVIEW STYLING
           ------------------------------------------------------------- */
        @media screen {
            body {
                background-color: #f1f5f9;
                padding: 24px 12px 60px 12px;
                display: flex;
                flex-direction: column;
                align-items: center;
                min-height: 100vh;
            }

            .no-print-toolbar {
                width: 210mm;
                max-width: 100%;
                margin-bottom: 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                background: #ffffff;
                padding: 12px 18px;
                border-radius: 12px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.06);
                border: 1px solid #e2e8f0;
            }

            .toolbar-btn {
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                border: 1px solid transparent;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: all 0.2s;
                text-decoration: none;
            }

            .toolbar-btn-back {
                background: #f8fafc;
                color: #334155;
                border-color: #cbd5e1;
            }
            .toolbar-btn-back:hover {
                background: #e2e8f0;
            }

            .toolbar-btn-print {
                background: #0f172a;
                color: #ffffff;
            }
            .toolbar-btn-print:hover {
                background: #1e293b;
            }

            .title-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                font-weight: 600;
                color: #475569;
                background: #f8fafc;
                padding: 4px 10px;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
            }

            .title-toggle select {
                font-weight: bold;
                padding: 4px 8px;
                border-radius: 6px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #0f172a;
                cursor: pointer;
            }

            .page-container {
                width: 210mm;
                height: 297mm;
                padding: 5mm 8mm;
                background: #ffffff;
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
                border: 1px solid #e2e8f0;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                box-sizing: border-box;
                position: relative;
            }

            .slip-slip {
                height: 137mm;
                max-height: 137mm;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 1mm 2mm;
                box-sizing: border-box;
            }
        }

        /* -------------------------------------------------------------
           SLIP CONTENT DESIGN (Matching User Image Layout Exactly)
           ------------------------------------------------------------- */
        .slip-content {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }

        /* Top Header */
        .company-header {
            text-align: center;
            margin-bottom: 2px;
        }

        .company-name {
            font-size: 13pt;
            font-weight: bold;
            letter-spacing: 0.2px;
            line-height: 1.2;
        }

        .company-address {
            font-size: 8pt;
            color: #000000;
            margin-top: 1px;
            line-height: 1.2;
        }

        .company-tin {
            font-size: 8pt;
            color: #000000;
            margin-top: 1px;
            line-height: 1.2;
        }

        /* Document Title */
        .doc-title-row {
            text-align: center;
            margin: 3px 0 5px 0;
        }

        .doc-title-text {
            font-size: 10.5pt;
            font-weight: bold;
            text-decoration: underline;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }

        /* Customer & Order Metadata Row */
        .meta-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            font-size: 8.5pt;
            line-height: 1.35;
            margin-bottom: 5px;
        }

        .meta-left {
            max-width: 65%;
        }

        .meta-right {
            text-align: right;
            min-width: 32%;
        }

        .meta-line {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .meta-lbl {
            font-weight: normal;
        }

        .meta-val {
            font-weight: normal;
        }

        .doc-no {
            font-weight: bold;
            font-size: 9pt;
            margin-bottom: 1px;
        }

        /* Line Items Table */
        .table-wrapper {
            flex: 1;
            min-height: 38mm;
            margin-bottom: 3px;
        }

        .items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5pt;
            table-layout: fixed;
        }

        .items-table thead th {
            font-weight: bold;
            text-align: left;
            padding-bottom: 4px;
            border-bottom: 0.5px solid transparent;
        }

        .items-table thead th.th-desc {
            width: 66%;
        }

        .items-table thead th.th-qty {
            width: 20%;
            text-align: right;
            padding-right: 18px;
        }

        .items-table thead th.th-uom {
            width: 14%;
            text-align: left;
            padding-left: 6px;
        }

        .items-table tbody td {
            padding: 2px 0;
            vertical-align: top;
            line-height: 1.25;
        }

        .items-table tbody td.td-desc {
            padding-right: 8px;
            word-break: break-word;
        }

        .items-table tbody td.td-qty {
            text-align: right;
            padding-right: 18px;
            font-variant-numeric: tabular-nums;
        }

        .items-table tbody td.td-uom {
            text-align: left;
            padding-left: 6px;
        }

        /* Remarks */
        .remarks-row {
            font-size: 8.5pt;
            margin-top: 2px;
            margin-bottom: 6px;
            line-height: 1.3;
        }

        .remarks-lbl {
            font-weight: normal;
        }

        .remarks-text {
            font-weight: normal;
        }

        /* Signatures Block */
        .signatures-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            column-gap: 20mm;
            margin-top: 2px;
            font-size: 8pt;
        }

        .sig-column {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .sig-item {
            display: flex;
            flex-direction: column;
        }

        .sig-label {
            font-weight: normal;
            font-size: 8pt;
            margin-bottom: 1px;
        }

        .sig-underline {
            width: 100%;
            height: 14px;
            border-bottom: 1px solid #000000;
        }

        /* Cut Line Divider */
        .cut-divider {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            font-size: 7pt;
            color: #64748b;
            user-select: none;
        }

        .cut-line-bar {
            flex: 1;
            border-bottom: 1px dashed #94a3b8;
            height: 1px;
        }

        .cut-badge {
            font-weight: bold;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
    </style>
</head>
<body>

    <!-- On-Screen Control Bar -->
    <div class="no-print-toolbar no-print">
        <div style="display: flex; align-items: center; gap: 10px;">
            <a href="javascript:window.history.back()" class="toolbar-btn toolbar-btn-back">
                ← Back
            </a>
            <div class="title-toggle">
                <span>Document Header:</span>
                <select id="doc-title-select" onchange="updateDocTitle()">
                    <option value="SALES ORDER" selected>SALES ORDER (as in photo)</option>
                    <option value="JOB ORDER">JOB ORDER</option>
                </select>
            </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
            <button onclick="window.print()" class="toolbar-btn toolbar-btn-print">
                <span>🖨️ Print 2 Copies (A4)</span>
            </button>
        </div>
    </div>

    <!-- 1 Sheet = Exactly 1 A4 Page Containing 2 Half-Landscape Copies -->
    <div class="page-container" id="printable-container">
        
        <!-- ================= COPY 1: TOP HALF (Landscape Half-A4) ================= -->
        <div class="slip-slip" id="copy-1">
            <div class="slip-content">
                <!-- Header -->
                <div>
                    <div class="company-header">
                        <div class="company-name">NKB Manufacturing Corporation</div>
                        <div class="company-address">B4 L5 Twig St., Sampaguita Village, Mambog II, Bacoor City, 4102 Cavite, Philippines</div>
                        <div class="company-tin">TIN: 686-950-421-00000</div>
                    </div>

                    <!-- Underlined Document Title -->
                    <div class="doc-title-row">
                        <span class="doc-title-text title-display">SALES ORDER</span>
                    </div>

                    <!-- Customer & Metadata -->
                    <div class="meta-row">
                        <div class="meta-left">
                            <div class="meta-line">Customer: <strong class="cust-name-display">-</strong></div>
                            <div class="meta-line">Address: <span class="cust-addr-display">-</span></div>
                        </div>
                        <div class="meta-right">
                            <div class="doc-no doc-no-display">SO-0000</div>
                            <div class="meta-line">Date: <span class="doc-date-display">-</span></div>
                            <div class="meta-line">Due Date: <span class="doc-duedate-display">-</span></div>
                        </div>
                    </div>
                </div>

                <!-- Products Table -->
                <div class="table-wrapper">
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th class="th-desc">Description</th>
                                <th class="th-qty">Quantity</th>
                                <th class="th-uom">UOM</th>
                            </tr>
                        </thead>
                        <tbody class="items-tbody">
                            <tr><td colspan="3" style="padding-top: 10px; color: #888;">Loading order items...</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- Footer (Remarks & Signatures) -->
                <div>
                    <div class="remarks-row">
                        <span class="remarks-lbl">Remarks:</span> <span class="remarks-display"></span>
                    </div>

                    <div class="signatures-container">
                        <div class="sig-column">
                            <div class="sig-item">
                                <div class="sig-label">Prepared by:</div>
                                <div class="sig-underline"></div>
                            </div>
                            <div class="sig-item">
                                <div class="sig-label">Checked by:</div>
                                <div class="sig-underline"></div>
                            </div>
                        </div>
                        <div class="sig-column">
                            <div class="sig-item">
                                <div class="sig-label">Processed by:</div>
                                <div class="sig-underline"></div>
                            </div>
                            <div class="sig-item">
                                <div class="sig-label">Released by:</div>
                                <div class="sig-underline"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ================= CUT GUIDE DIVIDER ================= -->
        <div class="cut-divider">
            <div class="cut-line-bar"></div>
            <div class="cut-badge">✂ CUT HERE (HALF OF A4 LANDSCAPE) ✂</div>
            <div class="cut-line-bar"></div>
        </div>

        <!-- ================= COPY 2: BOTTOM HALF (Landscape Half-A4 Duplicate) ================= -->
        <div class="slip-slip" id="copy-2">
            <div class="slip-content">
                <!-- Header -->
                <div>
                    <div class="company-header">
                        <div class="company-name">NKB Manufacturing Corporation</div>
                        <div class="company-address">B4 L5 Twig St., Sampaguita Village, Mambog II, Bacoor City, 4102 Cavite, Philippines</div>
                        <div class="company-tin">TIN: 686-950-421-00000</div>
                    </div>

                    <!-- Underlined Document Title -->
                    <div class="doc-title-row">
                        <span class="doc-title-text title-display">SALES ORDER</span>
                    </div>

                    <!-- Customer & Metadata -->
                    <div class="meta-row">
                        <div class="meta-left">
                            <div class="meta-line">Customer: <strong class="cust-name-display">-</strong></div>
                            <div class="meta-line">Address: <span class="cust-addr-display">-</span></div>
                        </div>
                        <div class="meta-right">
                            <div class="doc-no doc-no-display">SO-0000</div>
                            <div class="meta-line">Date: <span class="doc-date-display">-</span></div>
                            <div class="meta-line">Due Date: <span class="doc-duedate-display">-</span></div>
                        </div>
                    </div>
                </div>

                <!-- Products Table -->
                <div class="table-wrapper">
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th class="th-desc">Description</th>
                                <th class="th-qty">Quantity</th>
                                <th class="th-uom">UOM</th>
                            </tr>
                        </thead>
                        <tbody class="items-tbody">
                            <tr><td colspan="3" style="padding-top: 10px; color: #888;">Loading order items...</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- Footer (Remarks & Signatures) -->
                <div>
                    <div class="remarks-row">
                        <span class="remarks-lbl">Remarks:</span> <span class="remarks-display"></span>
                    </div>

                    <div class="signatures-container">
                        <div class="sig-column">
                            <div class="sig-item">
                                <div class="sig-label">Prepared by:</div>
                                <div class="sig-underline"></div>
                            </div>
                            <div class="sig-item">
                                <div class="sig-label">Checked by:</div>
                                <div class="sig-underline"></div>
                            </div>
                        </div>
                        <div class="sig-column">
                            <div class="sig-item">
                                <div class="sig-label">Processed by:</div>
                                <div class="sig-underline"></div>
                            </div>
                            <div class="sig-item">
                                <div class="sig-label">Released by:</div>
                                <div class="sig-underline"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    </div>

    <!-- Data Injection Script -->
    <script>
        let currentData = null;

        function formatDateMMDDYYYY(val) {
            if (!val) return '';
            if (/^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(val)) return val;
            const d = new Date(val);
            if (isNaN(d.getTime())) return val;
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const yyyy = d.getFullYear();
            return \`\${mm}/\${dd}/\${yyyy}\`;
        }

        function formatQty(val) {
            if (val === null || val === undefined || isNaN(val)) return '0.00';
            return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function updateDocTitle() {
            const select = document.getElementById('doc-title-select');
            const chosen = select ? select.value : 'SALES ORDER';
            
            document.querySelectorAll('.title-display').forEach(el => {
                el.textContent = chosen;
            });

            if (currentData) {
                applyDocNumber(chosen);
            }
        }

        function applyDocNumber(titleMode) {
            const rawNo = currentData.jo_number || currentData.po_number || '1279';
            let formattedNo = rawNo;

            if (titleMode === 'SALES ORDER') {
                if (formattedNo.startsWith('JO-')) {
                    formattedNo = formattedNo.replace(/^JO-/, 'SO-');
                } else if (formattedNo.startsWith('PO-')) {
                    formattedNo = formattedNo.replace(/^PO-/, 'SO-');
                } else if (!formattedNo.startsWith('SO-')) {
                    formattedNo = 'SO-' + formattedNo;
                }
            } else {
                if (formattedNo.startsWith('SO-')) {
                    formattedNo = formattedNo.replace(/^SO-/, 'JO-');
                } else if (formattedNo.startsWith('PO-')) {
                    formattedNo = formattedNo.replace(/^PO-/, 'JO-');
                } else if (!formattedNo.startsWith('JO-')) {
                    formattedNo = 'JO-' + formattedNo;
                }
            }

            document.querySelectorAll('.doc-no-display').forEach(el => {
                el.textContent = formattedNo;
            });
        }

        async function loadData() {
            const urlParams = new URLSearchParams(window.location.search);
            const id = urlParams.get('id');
            const poId = urlParams.get('po_id') || urlParams.get('poId');

            const token = localStorage.getItem('nkb_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = \`Bearer \${token}\`;
            }

            let endpoint = '';
            if (id) {
                endpoint = \`/api/job-orders/\${id}\`;
            } else if (poId) {
                endpoint = \`/api/job-orders/po/\${poId}\`;
            } else {
                endpoint = '/api/job-orders';
            }

            try {
                const res = await fetch(endpoint, { headers });
                const json = await res.json();

                if (!json.success || !json.data) {
                    if (poId || id) {
                        const fallbackRes = await fetch(\`/api/orders/\${poId || id}\`, { headers });
                        const fallbackJson = await fallbackRes.json();
                        if (fallbackJson.success && fallbackJson.data) {
                            renderPrintData(fallbackJson.data);
                            return;
                        }
                    }
                    throw new Error(json.error || 'Failed to load order data.');
                }

                if (Array.isArray(json.data)) {
                    if (json.data.length > 0) {
                        const firstRes = await fetch(\`/api/job-orders/\${json.data[0].id}\`, { headers });
                        const firstJson = await firstRes.json();
                        renderPrintData(firstJson.data || json.data[0]);
                    } else {
                        throw new Error('No job order found.');
                    }
                } else {
                    renderPrintData(json.data);
                }

            } catch (err) {
                console.error('Failed to load print data:', err);
                renderFallbackSample();
            }
        }

        function renderPrintData(data) {
            currentData = data;

            updateDocTitle();

            const customerName = data.company_name || data.client_name || 'JLS SKIN ESSENTIALS OPC';
            const customerAddress = data.client_address || data.address || '-';
            document.querySelectorAll('.cust-name-display').forEach(el => { el.textContent = customerName; });
            document.querySelectorAll('.cust-addr-display').forEach(el => { el.textContent = customerAddress; });

            const docDate = formatDateMMDDYYYY(data.po_date || data.scheduled_start_date || data.created_at || new Date());
            const dueDate = formatDateMMDDYYYY(data.expected_delivery_date || data.scheduled_end_date || data.po_date || data.created_at || new Date());
            document.querySelectorAll('.doc-date-display').forEach(el => { el.textContent = docDate; });
            document.querySelectorAll('.doc-duedate-display').forEach(el => { el.textContent = dueDate; });

            let items = data.items || [];
            if (items.length === 0 && data.product_name) {
                items = [{
                    product_name: data.product_name,
                    target_quantity: data.target_quantity,
                    unit: data.unit || 'PC'
                }];
            }

            const itemsHtml = items.map(item => {
                const desc = item.product_name || item.name || '-';
                const qty = formatQty(item.target_quantity || item.quantity || 0);
                const rawUom = (item.unit || 'PC').toUpperCase().trim();
                const uom = (rawUom === 'PCS' || rawUom === 'PIECE' || rawUom === 'PIECES') ? 'PC' : rawUom;

                return \`
                    <tr>
                        <td class="td-desc">\${escapeHtml(desc)}</td>
                        <td class="td-qty">\${qty}</td>
                        <td class="td-uom">\${escapeHtml(uom)}</td>
                    </tr>
                \`;
            }).join('');

            document.querySelectorAll('.items-tbody').forEach(el => {
                el.innerHTML = itemsHtml || \`<tr><td colspan="3" style="text-align: center; color: #888;">No items listed</td></tr>\`;
            });

            const remarks = data.notes || data.po_notes || '';
            document.querySelectorAll('.remarks-display').forEach(el => {
                el.textContent = remarks;
            });

            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('auto') === '1') {
                setTimeout(() => { window.print(); }, 500);
            }
        }

        function renderFallbackSample() {
            renderPrintData({
                jo_number: 'SO-1279',
                company_name: 'JLS SKIN ESSENTIALS OPC',
                client_address: '4614 Arellano Ave. Brgy. Palanan Makati City',
                po_date: '2026-09-01',
                expected_delivery_date: '2026-09-01',
                notes: '',
                items: [
                    { product_name: 'JLS NO BRAND - KATY PERRY MEOW', target_quantity: 1440, unit: 'PC' },
                    { product_name: 'JLS NO BRAND - INCANTO SHINE', target_quantity: 288, unit: 'PC' },
                    { product_name: 'JLS - PURE SEDUCTION', target_quantity: 288, unit: 'PC' },
                    { product_name: 'JLS - POLO RED', target_quantity: 144, unit: 'PC' }
                ]
            });
        }

        window.addEventListener('DOMContentLoaded', loadData);
    </script>
</body>
</html>`;

const outPath = path.join(__dirname, '..', 'public', 'print-jo.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Successfully written to:', outPath);

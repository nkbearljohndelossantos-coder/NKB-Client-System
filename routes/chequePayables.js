/**
 * NKB Manufacturing Corporation
 * Cheque Payables & COO Approval Integration Routes
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { getNextDocumentNumber } = require('../services/documentNumberService');
const { logAudit } = require('../services/auditService');
const { saveAttachment } = require('../services/attachmentService');
const { getManilaDate } = require('../helpers/timezone');

const LIVE_API_KEY = process.env.INVENTORY_API_KEY || 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b';

const DEFAULT_BANKS = [
    { id: 'ba-bdo-coop', name: 'BDO: Norvin Bella (COOP) - 0080-5801-0563', bank_name: 'BDO', account_name: 'Norvin Bella (COOP)', account_number: '0080-5801-0563', company: 'NKB Manufacturing Coorporation - COOP' },
    { id: 'ba-bdo-nkb-mfg', name: 'BDO: NKB Manufacturing Corporation - 0080-5801-0547', bank_name: 'BDO', account_name: 'NKB Manufacturing Corporation', account_number: '0080-5801-0547', company: 'NKB Manufacturing Corporation' },
    { id: 'ba-bdo-nkb-cosm', name: 'BDO: NKB Cosmetics Manufacturing - 0105-4800-4829', bank_name: 'BDO', account_name: 'NKB Cosmetics Manufacturing', account_number: '0105-4800-4829', company: 'NKB Cosmetics Manufacturing' },
    { id: 'ba-bdo-nkb-cpt', name: 'BDO: NKB Cosmetic Products Trading - 0105-4800-3245', bank_name: 'BDO', account_name: 'NKB Cosmetic Products Trading', account_number: '0105-4800-3245', company: 'NKB Cosmetic Products Trading' },
    { id: 'ba-bdo-new-yra', name: 'BDO: New Yra Enterprises - 0036-8801-3196', bank_name: 'BDO', account_name: 'New Yra Enterprises', account_number: '0036-8801-3196', company: 'New Yra Enterprises' },
    { id: 'ba-bdo-vyu', name: 'BDO: Vyuceutical - 0080-5801-0717', bank_name: 'BDO', account_name: 'Vyuceutical OPC', account_number: '0080-5801-0717', company: 'Vyuceutical OPC' },
    { id: 'ba-sec-nkb-mfg', name: 'Security Bank: NKB Manufacturing Corporation', bank_name: 'Security Bank', account_name: 'NKB Manufacturing Corporation', account_number: '3128-4902-1855', company: 'NKB Manufacturing Corporation' }
];

const DEFAULT_COMPANIES = [
    'NKB Manufacturing Corporation',
    'NKB Cosmetics Manufacturing',
    'Vyuceutical OPC',
    'NKB Manufacturing Coorporation - COOP',
    'New Yra Enterprises',
    'NKB Cosmetic Products Trading'
];

const DEFAULT_CATEGORIES = [
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

/**
 * Dispatch async webhook notification to external COO API if configured
 */
async function dispatchCooWebhook(payableRecord) {
    const webhookUrl = process.env.COO_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
        const payload = JSON.stringify({
            event: 'CHEQUE_PAYABLE_REQUESTED',
            apiKey: LIVE_API_KEY,
            timestamp: new Date().toISOString(),
            data: payableRecord
        });

        // Use global fetch
        if (typeof fetch === 'function') {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': LIVE_API_KEY
                },
                body: payload,
                signal: AbortSignal.timeout(6000)
            });
        }
    } catch (err) {
        console.warn('COO webhook dispatch notice (external site may be offline):', err.message);
    }
}

/**
 * GET /api/cheque-payables
 * List all cheque payable records with filtering, date range, and categories
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const { status, category, bank, date_from, date_to, search } = req.query;

        let query = `
            SELECT cp.*, u.name as requestor_name, u.role as requestor_role
            FROM cheque_payables cp
            LEFT JOIN users u ON cp.requested_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND cp.status = ?';
            params.push(status);
        }

        if (category) {
            query += ' AND cp.category = ?';
            params.push(category);
        }

        if (bank) {
            query += ' AND cp.bank_name LIKE ?';
            params.push(`%${bank}%`);
        }

        if (date_from) {
            query += ' AND cp.cheque_date >= ?';
            params.push(date_from);
        }

        if (date_to) {
            query += ' AND cp.cheque_date <= ?';
            params.push(date_to);
        }

        if (search) {
            query += ' AND (cp.payee_name LIKE ? OR cp.request_number LIKE ? OR cp.cheque_number LIKE ? OR cp.purpose LIKE ? OR cp.bank_name LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term, term);
        }

        query += ' ORDER BY cp.cheque_date DESC, cp.created_at DESC';

        const rows = db.prepare(query).all(...params);

        const todayStr = getManilaDate();
        const todayDate = new Date(todayStr + 'T00:00:00+08:00');

        function getPdcDetails(chequeDateStr, status) {
            if (status === 'CLEARED') {
                return { is_pdc: false, days_until_maturity: 0, maturity_status: 'CLEARED', maturity_label: 'Cleared' };
            }
            if (status === 'REJECTED' || status === 'VOIDED') {
                return { is_pdc: false, days_until_maturity: 0, maturity_status: status, maturity_label: status };
            }
            const chequeD = new Date(chequeDateStr + 'T00:00:00+08:00');
            const diffTime = chequeD.getTime() - todayDate.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                return { is_pdc: false, days_until_maturity: diffDays, maturity_status: 'OVERDUE', maturity_label: `Matured (${Math.abs(diffDays)}d ago)` };
            } else if (diffDays === 0) {
                return { is_pdc: true, days_until_maturity: 0, maturity_status: 'DUE_TODAY', maturity_label: 'Due Today' };
            } else if (diffDays <= 2) {
                return { is_pdc: true, days_until_maturity: diffDays, maturity_status: 'MATURING_48H', maturity_label: `Maturing in ${diffDays}d (≤48h)` };
            } else if (diffDays <= 7) {
                return { is_pdc: true, days_until_maturity: diffDays, maturity_status: 'MATURING_7D', maturity_label: `Maturing in ${diffDays}d` };
            } else {
                return { is_pdc: true, days_until_maturity: diffDays, maturity_status: 'FUTURE_PDC', maturity_label: `Post-Dated (${diffDays}d)` };
            }
        }

        // Enrich rows with PDC details
        const enrichedRows = rows.map(r => {
            const pdc = getPdcDetails(r.cheque_date, r.status);
            return {
                ...r,
                ...pdc
            };
        });

        // Calculate summary metrics across all records
        const allRecords = db.prepare('SELECT * FROM cheque_payables').all();

        const totalRequested = allRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        const pendingRecords = allRecords.filter(r => r.status === 'PENDING_COO_APPROVAL');
        const totalPending = pendingRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        const confirmedRecords = allRecords.filter(r => r.status === 'CONFIRMED');
        const totalConfirmed = confirmedRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        const disbursedRecords = allRecords.filter(r => ['ISSUED', 'CLEARED'].includes(r.status));
        const totalDisbursed = disbursedRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        const clearedRecords = allRecords.filter(r => r.status === 'CLEARED');
        const totalCleared = clearedRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

        // PDC Maturity counters (for uncleared, approved/pending cheques)
        let countMaturing48h = 0;
        let totalMaturing48h = 0;
        let countMaturing7d = 0;
        let totalMaturing7d = 0;

        allRecords.forEach(r => {
            if (!['CLEARED', 'REJECTED', 'VOIDED'].includes(r.status)) {
                const pdc = getPdcDetails(r.cheque_date, r.status);
                const amt = parseFloat(r.amount) || 0;
                if (pdc.maturity_status === 'MATURING_48H' || pdc.maturity_status === 'DUE_TODAY') {
                    countMaturing48h++;
                    totalMaturing48h += amt;
                }
                if (pdc.days_until_maturity >= 0 && pdc.days_until_maturity <= 7) {
                    countMaturing7d++;
                    totalMaturing7d += amt;
                }
            }
        });

        // Group by category
        const categoryCounts = {};
        allRecords.forEach(r => {
            const cat = r.category || 'Uncategorized';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + (parseFloat(r.amount) || 0);
        });

        // Group by bank
        const bankCounts = {};
        allRecords.forEach(r => {
            const b = r.bank_name || 'Unspecified';
            bankCounts[b] = (bankCounts[b] || 0) + (parseFloat(r.amount) || 0);
        });

        return res.json({
            success: true,
            data: enrichedRows,
            summary: {
                totalCount: allRecords.length,
                totalRequested,
                totalPending,
                countPending: pendingRecords.length,
                totalConfirmed,
                countConfirmed: confirmedRecords.length,
                totalDisbursed,
                countDisbursed: disbursedRecords.length,
                totalCleared,
                countCleared: clearedRecords.length,
                countMaturing48h,
                totalMaturing48h,
                countMaturing7d,
                totalMaturing7d,
                categoryBreakdown: categoryCounts,
                bankBreakdown: bankCounts
            },
            banks: DEFAULT_BANKS,
            categories: DEFAULT_CATEGORIES,
            apiKeyPrefix: `${LIVE_API_KEY.slice(0, 15)}...`
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/cheque-payables/companies
 * List all companies (built-in and user-added)
 */
router.get('/companies', authenticateToken, (req, res) => {
    try {
        let rows = [];
        try {
            rows = db.prepare('SELECT name FROM payable_companies ORDER BY name ASC').all();
        } catch (_) {}
        const dbNames = rows.map(r => r.name);
        const unique = Array.from(new Set([...DEFAULT_COMPANIES, ...dbNames]));
        return res.json({ success: true, data: unique });
    } catch (err) {
        return res.json({ success: true, data: DEFAULT_COMPANIES });
    }
});

/**
 * POST /api/cheque-payables/companies
 * Add a new custom company dynamically
 */
router.post('/companies', authenticateToken, requireRoles('ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'CEO'), (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, error: 'Company name is required.' });
        }
        const trimmed = String(name).trim();
        const id = 'comp-' + uuidv4().slice(0, 8);
        try {
            db.prepare('INSERT OR IGNORE INTO payable_companies (id, name) VALUES (?, ?)').run(id, trimmed);
        } catch (_) {}
        return res.status(201).json({ success: true, data: { id, name: trimmed } });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/cheque-payables/meta
 * Return standard banks, expense categories, and companies
 */
router.get('/meta', authenticateToken, (req, res) => {
    let companies = DEFAULT_COMPANIES;
    try {
        const rows = db.prepare('SELECT name FROM payable_companies ORDER BY name ASC').all();
        if (rows && rows.length > 0) {
            companies = Array.from(new Set([...DEFAULT_COMPANIES, ...rows.map(r => r.name)]));
        }
    } catch (_) {}

    return res.json({
        success: true,
        banks: DEFAULT_BANKS,
        categories: DEFAULT_CATEGORIES,
        companies: companies,
        apiKey: LIVE_API_KEY
    });
});

/**
 * GET /api/cheque-payables/export-csv
 * Export filtered cheque records to CSV
 */
router.get('/export-csv', authenticateToken, (req, res) => {
    try {
        const { status, category, bank, date_from, date_to, search } = req.query;

        let query = `
            SELECT cp.*, u.name as requestor_name
            FROM cheque_payables cp
            LEFT JOIN users u ON cp.requested_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (status) { query += ' AND cp.status = ?'; params.push(status); }
        if (category) { query += ' AND cp.category = ?'; params.push(category); }
        if (bank) { query += ' AND cp.bank_name LIKE ?'; params.push(`%${bank}%`); }
        if (date_from) { query += ' AND cp.cheque_date >= ?'; params.push(date_from); }
        if (date_to) { query += ' AND cp.cheque_date <= ?'; params.push(date_to); }
        if (search) {
            query += ' AND (cp.payee_name LIKE ? OR cp.request_number LIKE ? OR cp.cheque_number LIKE ? OR cp.purpose LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term);
        }

        query += ' ORDER BY cp.cheque_date DESC, cp.created_at DESC';
        const rows = db.prepare(query).all(...params);

        const escapeCsv = (val) => {
            if (val == null) return '""';
            return `"${String(val).replace(/"/g, '""')}"`;
        };

        const headers = [
            '#', 'Request Number', 'Cheque Date', 'Payee / Beneficiary', 'Amount (PHP)',
            'Bank Name', 'Bank Account', 'Cheque Number', 'Category',
            'Purpose / Usage', 'Invoice Ref', 'Status', 'Requested By',
            'COO Confirmed By', 'COO Confirmed At', 'COO Remarks', 'Created At'
        ];

        const csvLines = [headers.map(escapeCsv).join(',')];
        let totalAmount = 0;

        rows.forEach((r, idx) => {
            const amt = parseFloat(r.amount) || 0;
            totalAmount += amt;
            csvLines.push([
                idx + 1,
                escapeCsv(r.request_number),
                escapeCsv(r.cheque_date),
                escapeCsv(r.payee_name),
                amt.toFixed(2),
                escapeCsv(r.bank_name),
                escapeCsv(r.bank_account_number || ''),
                escapeCsv(r.cheque_number || '—'),
                escapeCsv(r.category),
                escapeCsv(r.purpose),
                escapeCsv(r.invoice_reference || ''),
                escapeCsv(r.status.replace(/_/g, ' ')),
                escapeCsv(r.requested_by_name || r.requestor_name || 'Accountant'),
                escapeCsv(r.coo_confirmed_by || ''),
                escapeCsv(r.coo_confirmed_at || ''),
                escapeCsv(r.coo_notes || ''),
                escapeCsv(r.created_at)
            ].join(','));
        });

        // Summary footer
        csvLines.push('');
        csvLines.push(['"TOTAL"', '""', '""', '"TOTAL REQUESTED:"', totalAmount.toFixed(2)].join(','));

        const csvContent = '\uFEFF' + csvLines.join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="NKB_Cheque_Payables_${getManilaDate()}.csv"`);
        return res.send(csvContent);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/cheque-payables
 * Create a new cheque payable request (Accountant)
 */
router.post('/', authenticateToken, requireRoles('ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'CEO'), async (req, res) => {
    try {
        const {
            payee_name,
            vendor,
            amount,
            cheque_date,
            bank_name,
            bank_account_number,
            cheque_number,
            category,
            purpose,
            description,
            invoice_reference,
            company_name,
            payable_category,
            invoice_number,
            invoice_date,
            terms,
            due_date,
            control_number,
            line_items,
            comments,
            attachment_url,
            attachment_data,
            notes
        } = req.body;

        const finalPayee = (payee_name || vendor || '').trim();
        if (!finalPayee) {
            return res.status(400).json({ success: false, error: 'Payee / Beneficiary / Vendor name is required.' });
        }

        // Process line items if provided
        let processedLineItems = null;
        let lineItemsTotal = 0;
        if (line_items) {
            const arr = Array.isArray(line_items) ? line_items : (typeof line_items === 'string' ? JSON.parse(line_items) : []);
            if (Array.isArray(arr) && arr.length > 0) {
                processedLineItems = arr.map(item => {
                    const qty = parseFloat(item.quantity) || 1;
                    const cost = parseFloat(item.cost) || 0;
                    const sub = parseFloat(item.subtotal) || (qty * cost);
                    lineItemsTotal += sub;
                    return {
                        description: item.description || '',
                        category: item.category || 'Raw Materials',
                        quantity: qty,
                        cost: cost,
                        subtotal: sub
                    };
                });
            }
        }

        const rawAmount = (lineItemsTotal > 0) ? lineItemsTotal : parseFloat(amount);
        const numAmount = parseFloat(rawAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Cheque amount must be greater than 0.' });
        }

        const finalDate = cheque_date || due_date || invoice_date || getManilaDate();
        if (!finalDate) {
            return res.status(400).json({ success: false, error: 'Cheque date / Date needed is required.' });
        }

        if (!bank_name || !String(bank_name).trim()) {
            return res.status(400).json({ success: false, error: 'Bank used for cheque is required.' });
        }

        const finalCategory = (category || (processedLineItems && processedLineItems[0]?.category) || 'Raw Materials').trim();
        const finalPurpose = (purpose || description || 'Payable Requisition').trim();

        const id = uuidv4();
        const requestNumber = getNextDocumentNumber('CHQ');
        const finalChequeNumber = (cheque_number && String(cheque_number).trim()) ? String(cheque_number).trim() : null;
        const finalAccountNum = (bank_account_number && String(bank_account_number).trim()) ? String(bank_account_number).trim() : null;
        const finalInvoiceRef = (invoice_reference || invoice_number) ? String(invoice_reference || invoice_number).trim() : null;

        // Process file attachment if supplied
        let savedAttachment = null;
        if (attachment_data || attachment_url) {
            savedAttachment = saveAttachment(attachment_data || attachment_url, 'payables');
        }

        const fullNotes = [
            notes ? String(notes).trim() : '',
            comments ? `Comments: ${String(comments).trim()}` : '',
            `Submitted for COO review via API Key: ${LIVE_API_KEY.slice(0, 15)}...`
        ].filter(Boolean).join(' | ');

        // Check available bank balance & link bank account ID
        let linkedBankId = null;
        let availableBankBalance = null;
        let isOverdrawnWarning = false;
        try {
            const bankAcc = db.prepare(`
                SELECT id, current_balance FROM bank_accounts 
                WHERE is_active = 1 AND (LOWER(bank_name) LIKE LOWER(?) OR LOWER(?) LIKE '%' || LOWER(bank_name) || '%')
                LIMIT 1
            `).get(`%${bank_name}%`, bank_name);
            if (bankAcc) {
                linkedBankId = bankAcc.id;
                availableBankBalance = bankAcc.current_balance;
                if (numAmount > bankAcc.current_balance) {
                    isOverdrawnWarning = true;
                }
            }
        } catch (_) {}

        const serializedItems = processedLineItems ? JSON.stringify(processedLineItems) : null;

        db.prepare(`
            INSERT INTO cheque_payables (
                id, request_number, payee_name, amount, cheque_date, bank_name,
                bank_account_number, bank_account_id, cheque_number, category, purpose,
                company_name, payable_category, invoice_number, invoice_date, terms, due_date,
                control_number, line_items, comments,
                invoice_reference, attachment_url, status, requested_by,
                requested_by_name, coo_notes, api_key_used, created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, 'PENDING_COO_APPROVAL', ?,
                ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
            )
        `).run(
            id,
            requestNumber,
            finalPayee,
            numAmount,
            finalDate,
            String(bank_name).trim(),
            finalAccountNum,
            linkedBankId,
            finalChequeNumber,
            finalCategory,
            finalPurpose,
            company_name ? String(company_name).trim() : null,
            payable_category ? String(payable_category).trim() : 'Trade payable',
            invoice_number ? String(invoice_number).trim() : null,
            invoice_date ? String(invoice_date).trim() : null,
            terms ? String(terms).trim() : 'Net 30',
            due_date ? String(due_date).trim() : null,
            control_number ? String(control_number).trim() : null,
            serializedItems,
            comments ? String(comments).trim() : null,
            finalInvoiceRef,
            savedAttachment,
            req.user.id,
            req.user.name || 'Accountant',
            fullNotes,
            LIVE_API_KEY
        );

        const createdRecord = db.prepare('SELECT * FROM cheque_payables WHERE id = ?').get(id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'REQUEST_CHEQUE_PAYABLE',
            entityType: 'PAYABLE',
            entityId: requestNumber,
            details: {
                requestNumber,
                payeeName: finalPayee,
                amount: numAmount,
                bankName: bank_name,
                category: finalCategory,
                purpose: finalPurpose,
                companyName: company_name,
                apiKeyUsed: LIVE_API_KEY,
                isOverdrawnWarning,
                availableBankBalance
            }
        });

        // Async notify external COO endpoint if configured
        dispatchCooWebhook(createdRecord).catch(() => {});

        return res.status(201).json({
            success: true,
            message: `Cheque payable request ${requestNumber} for ${finalPayee} (₱${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}) has been submitted and sent to the COO API for confirmation.${isOverdrawnWarning ? ` ⚠️ Note: Cheque amount exceeds available liquid balance in ${bank_name} (₱${Number(availableBankBalance).toFixed(2)}).` : ''}`,
            data: {
                ...createdRecord,
                available_balance: availableBankBalance,
                is_overdrawn_warning: isOverdrawnWarning
            }
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/cheque-payables/:id
 * Get single cheque payable by ID
 */
router.get('/:id', authenticateToken, (req, res) => {
    try {
        const item = db.prepare(`
            SELECT cp.*, u.name as requestor_name, u.email as requestor_email
            FROM cheque_payables cp
            LEFT JOIN users u ON cp.requested_by = u.id
            WHERE cp.id = ? OR cp.request_number = ?
        `).get(req.params.id, req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, error: 'Cheque payable record not found.' });
        }

        return res.json({ success: true, data: item });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/cheque-payables/:id
 * Update / Edit an existing cheque payable request
 */
router.put('/:id', authenticateToken, requireRoles('ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'CEO'), async (req, res) => {
    try {
        const item = db.prepare('SELECT * FROM cheque_payables WHERE id = ? OR request_number = ?').get(req.params.id, req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Cheque payable record not found.' });
        }

        const {
            payee_name,
            vendor,
            amount,
            cheque_date,
            bank_name,
            bank_account_number,
            cheque_number,
            category,
            purpose,
            description,
            company_name,
            payable_category,
            invoice_number,
            invoice_date,
            terms,
            due_date,
            control_number,
            line_items,
            comments,
            notes,
            attachment_data,
            attachment_url
        } = req.body;

        const finalPayee = (payee_name || vendor || item.payee_name || '').trim();

        // Process line items if provided
        let processedLineItems = null;
        let lineItemsTotal = 0;
        if (line_items) {
            const arr = Array.isArray(line_items) ? line_items : (typeof line_items === 'string' ? JSON.parse(line_items) : []);
            if (Array.isArray(arr) && arr.length > 0) {
                processedLineItems = arr.map(it => {
                    const qty = parseFloat(it.quantity) || 1;
                    const cost = parseFloat(it.cost) || 0;
                    const sub = parseFloat(it.subtotal) || (qty * cost);
                    lineItemsTotal += sub;
                    return {
                        description: it.description || '',
                        category: it.category || 'Raw Materials',
                        quantity: qty,
                        cost: cost,
                        subtotal: sub
                    };
                });
            }
        }

        const rawAmount = (lineItemsTotal > 0) ? lineItemsTotal : (amount != null ? parseFloat(amount) : item.amount);
        const numAmount = parseFloat(rawAmount);

        let savedAttachment = item.attachment_url;
        if (attachment_data) {
            savedAttachment = saveAttachment(attachment_data, 'payables');
        } else if (attachment_url) {
            savedAttachment = attachment_url;
        }

        const finalSerializedItems = processedLineItems ? JSON.stringify(processedLineItems) : (line_items ? (typeof line_items === 'string' ? line_items : JSON.stringify(line_items)) : item.line_items);
        const finalPurpose = (purpose || description || item.purpose || '').trim();
        const finalCategory = (category || (processedLineItems && processedLineItems[0]?.category) || item.category || 'Raw Materials').trim();

        db.prepare(`
            UPDATE cheque_payables
            SET payee_name = COALESCE(?, payee_name),
                amount = COALESCE(?, amount),
                cheque_date = COALESCE(?, cheque_date),
                bank_name = COALESCE(?, bank_name),
                bank_account_number = COALESCE(?, bank_account_number),
                cheque_number = COALESCE(?, cheque_number),
                category = COALESCE(?, category),
                purpose = COALESCE(?, purpose),
                company_name = COALESCE(?, company_name),
                payable_category = COALESCE(?, payable_category),
                invoice_number = COALESCE(?, invoice_number),
                invoice_date = COALESCE(?, invoice_date),
                terms = COALESCE(?, terms),
                due_date = COALESCE(?, due_date),
                control_number = COALESCE(?, control_number),
                line_items = COALESCE(?, line_items),
                comments = COALESCE(?, comments),
                attachment_url = COALESCE(?, attachment_url),
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(
            finalPayee || null,
            !isNaN(numAmount) ? numAmount : null,
            cheque_date || due_date || null,
            bank_name ? String(bank_name).trim() : null,
            bank_account_number ? String(bank_account_number).trim() : null,
            cheque_number ? String(cheque_number).trim() : null,
            finalCategory || null,
            finalPurpose || null,
            company_name ? String(company_name).trim() : null,
            payable_category ? String(payable_category).trim() : null,
            invoice_number ? String(invoice_number).trim() : null,
            invoice_date ? String(invoice_date).trim() : null,
            terms ? String(terms).trim() : null,
            due_date ? String(due_date).trim() : null,
            control_number ? String(control_number).trim() : null,
            finalSerializedItems,
            comments ? String(comments).trim() : null,
            savedAttachment,
            item.id
        );

        const updated = db.prepare('SELECT * FROM cheque_payables WHERE id = ?').get(item.id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE_CHEQUE_PAYABLE',
            entityType: 'PAYABLE',
            entityId: item.request_number,
            details: {
                requestNumber: item.request_number,
                payeeName: finalPayee,
                amount: numAmount
            }
        });

        return res.json({ success: true, message: 'Cheque payable record updated successfully.', data: updated });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/cheque-payables/:id/confirm
 * COO / CEO / Admin confirms or rejects cheque payable request directly from UI
 */
router.post('/:id/confirm', authenticateToken, requireRoles('CEO', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'ACCOUNTING'), (req, res) => {
    try {
        const { decision = 'CONFIRMED', cheque_number, notes } = req.body;
        const item = db.prepare('SELECT * FROM cheque_payables WHERE id = ? OR request_number = ?').get(req.params.id, req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, error: 'Cheque payable record not found.' });
        }

        const isApproved = decision.toUpperCase() === 'CONFIRMED' || decision.toUpperCase() === 'APPROVED';
        const newStatus = isApproved ? 'CONFIRMED' : 'REJECTED';
        const finalChequeNum = cheque_number ? String(cheque_number).trim() : item.cheque_number;
        const confirmedBy = req.user.name || `${req.user.role} Officer`;
        const confirmedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

        db.prepare(`
            UPDATE cheque_payables
            SET status = ?,
                coo_decision = ?,
                cheque_number = ?,
                coo_confirmed_by = ?,
                coo_confirmed_at = ?,
                coo_notes = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(
            newStatus,
            decision.toUpperCase(),
            finalChequeNum,
            confirmedBy,
            confirmedAt,
            notes ? String(notes).trim() : null,
            item.id
        );

        const updated = db.prepare('SELECT * FROM cheque_payables WHERE id = ?').get(item.id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: isApproved ? 'COO_CONFIRM_PAYABLE' : 'COO_REJECT_PAYABLE',
            entityType: 'PAYABLE',
            entityId: item.request_number,
            details: {
                requestNumber: item.request_number,
                payeeName: item.payee_name,
                amount: item.amount,
                chequeNumber: finalChequeNum,
                decision: newStatus,
                confirmedBy,
                notes
            }
        });

        return res.json({
            success: true,
            message: `Cheque payable ${item.request_number} has been ${isApproved ? 'CONFIRMED' : 'REJECTED'} by ${confirmedBy}.`,
            data: updated
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/cheque-payables/:id/status
 * Update status (e.g. mark as ISSUED, CLEARED, or VOIDED)
 */
router.patch('/:id/status', authenticateToken, requireRoles('ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'CEO'), (req, res) => {
    try {
        const { status, cheque_number, notes } = req.body;
        const allowedStatuses = ['PENDING_COO_APPROVAL', 'CONFIRMED', 'ISSUED', 'CLEARED', 'REJECTED', 'VOIDED'];

        if (!status || !allowedStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
        }

        const item = db.prepare('SELECT * FROM cheque_payables WHERE id = ? OR request_number = ?').get(req.params.id, req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Cheque payable record not found.' });
        }

        const finalChequeNum = cheque_number ? String(cheque_number).trim() : item.cheque_number;

        db.prepare(`
            UPDATE cheque_payables
            SET status = ?,
                cheque_number = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(status, finalChequeNum, item.id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE_PAYABLE_STATUS',
            entityType: 'PAYABLE',
            entityId: item.request_number,
            details: {
                requestNumber: item.request_number,
                previousStatus: item.status,
                newStatus: status,
                chequeNumber: finalChequeNum,
                notes
            }
        });

        const updated = db.prepare('SELECT * FROM cheque_payables WHERE id = ?').get(item.id);
        return res.json({
            success: true,
            message: `Cheque payable ${item.request_number} updated to ${status}.`,
            data: updated
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/cheque-payables/:id/clear
 * Mark cheque payable as CLEARED upon presentation/encashment and debit depository bank
 */
router.post('/:id/clear', authenticateToken, requireRoles('ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'CEO'), (req, res) => {
    try {
        const item = db.prepare('SELECT * FROM cheque_payables WHERE id = ? OR request_number = ?').get(req.params.id, req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Cheque payable record not found.' });
        }

        if (item.status === 'CLEARED') {
            return res.status(400).json({ success: false, error: 'Cheque has already been marked as cleared.' });
        }

        const clearedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // Debit the depository bank balance if bank is recognized
        let bankDeducted = false;
        try {
            const bankAcc = db.prepare(`
                SELECT id, current_balance FROM bank_accounts 
                WHERE is_active = 1 AND (LOWER(bank_name) LIKE LOWER(?) OR LOWER(?) LIKE '%' || LOWER(bank_name) || '%')
                LIMIT 1
            `).get(`%${item.bank_name}%`, item.bank_name);
            if (bankAcc) {
                db.prepare(`
                    UPDATE bank_accounts
                    SET current_balance = current_balance - ?, updated_at = datetime('now', 'localtime')
                    WHERE id = ?
                `).run(item.amount, bankAcc.id);
                bankDeducted = true;
            }
        } catch (_) {}

        db.prepare(`
            UPDATE cheque_payables
            SET status = 'CLEARED',
                cleared_at = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(clearedAt, item.id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CLEAR_CHEQUE_PAYABLE',
            entityType: 'PAYABLE',
            entityId: item.request_number,
            details: {
                requestNumber: item.request_number,
                amount: item.amount,
                bankName: item.bank_name,
                clearedAt,
                bankDeducted
            }
        });

        const updated = db.prepare('SELECT * FROM cheque_payables WHERE id = ?').get(item.id);
        return res.json({
            success: true,
            message: `Cheque ${item.request_number} (${item.cheque_number || 'N/A'}) has cleared bank presentation.`,
            data: updated
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;

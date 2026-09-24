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
    { id: 'bdo', name: 'BDO Unibank', account_name: 'NKB Manufacturing & Trading Corp.', account_number: '1029-3847-4821', branch: 'Quezon City Main' },
    { id: 'bpi', name: 'Bank of the Philippine Islands (BPI)', account_name: 'NKB Manufacturing Corp.', account_number: '0982-3712-9104', branch: 'Ortigas Center' },
    { id: 'metrobank', name: 'Metropolitan Bank & Trust Co. (Metrobank)', account_name: 'NKB Manufacturing Corp.', account_number: '4562-8901-3372', branch: 'San Juan' },
    { id: 'security_bank', name: 'Security Bank', account_name: 'NKB Manufacturing & Trading Corp.', account_number: '3128-4902-1855', branch: 'Greenhills' },
    { id: 'unionbank', name: 'UnionBank of the Philippines', account_name: 'NKB Manufacturing Corp.', account_number: '1094-8273-6290', branch: 'Pasig City' }
];

const DEFAULT_CATEGORIES = [
    'Raw Materials',
    'Packaging Supplies',
    'Factory Utilities & Power',
    'Facility Rent & Lease',
    'Payroll & Labor Advances',
    'Machine Maintenance & Repairs',
    'Logistics & Freight Delivery',
    'Government Taxes & Licensing',
    'Laboratory & Quality Testing',
    'Office Supplies & Administrative',
    'Miscellaneous & Contingency'
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

        // Calculate summary metrics across all records
        const allRecords = db.prepare('SELECT * FROM cheque_payables').all();

        const totalRequested = allRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        const pendingRecords = allRecords.filter(r => r.status === 'PENDING_COO_APPROVAL');
        const totalPending = pendingRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        const confirmedRecords = allRecords.filter(r => r.status === 'CONFIRMED');
        const totalConfirmed = confirmedRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        const disbursedRecords = allRecords.filter(r => ['ISSUED', 'CLEARED'].includes(r.status));
        const totalDisbursed = disbursedRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

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
            data: rows,
            summary: {
                totalCount: allRecords.length,
                totalRequested,
                totalPending,
                countPending: pendingRecords.length,
                totalConfirmed,
                countConfirmed: confirmedRecords.length,
                totalDisbursed,
                countDisbursed: disbursedRecords.length,
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
 * GET /api/cheque-payables/meta
 * Return standard banks and expense categories
 */
router.get('/meta', authenticateToken, (req, res) => {
    return res.json({
        success: true,
        banks: DEFAULT_BANKS,
        categories: DEFAULT_CATEGORIES,
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
            amount,
            cheque_date,
            bank_name,
            bank_account_number,
            cheque_number,
            category,
            purpose,
            invoice_reference,
            attachment_url,
            attachment_data,
            notes
        } = req.body;

        if (!payee_name || !String(payee_name).trim()) {
            return res.status(400).json({ success: false, error: 'Payee / Beneficiary name is required.' });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Cheque amount must be greater than 0.' });
        }

        if (!cheque_date) {
            return res.status(400).json({ success: false, error: 'Cheque date / Date needed is required.' });
        }

        if (!bank_name || !String(bank_name).trim()) {
            return res.status(400).json({ success: false, error: 'Bank used for cheque is required.' });
        }

        if (!category || !String(category).trim()) {
            return res.status(400).json({ success: false, error: 'Expense category is required.' });
        }

        if (!purpose || !String(purpose).trim()) {
            return res.status(400).json({ success: false, error: 'Purpose (where the money will be used) is required.' });
        }

        const id = uuidv4();
        const requestNumber = getNextDocumentNumber('CHQ');
        const finalChequeNumber = (cheque_number && String(cheque_number).trim()) ? String(cheque_number).trim() : null;
        const finalAccountNum = (bank_account_number && String(bank_account_number).trim()) ? String(bank_account_number).trim() : null;
        const finalInvoiceRef = (invoice_reference && String(invoice_reference).trim()) ? String(invoice_reference).trim() : null;

        // Process file attachment if supplied
        let savedAttachment = null;
        if (attachment_data || attachment_url) {
            savedAttachment = saveAttachment(attachment_data || attachment_url, 'payables');
        }

        const fullNotes = [
            notes ? String(notes).trim() : '',
            `Submitted for COO review via API Key: ${LIVE_API_KEY.slice(0, 15)}...`
        ].filter(Boolean).join(' | ');

        db.prepare(`
            INSERT INTO cheque_payables (
                id, request_number, payee_name, amount, cheque_date, bank_name,
                bank_account_number, cheque_number, category, purpose,
                invoice_reference, attachment_url, status, requested_by,
                requested_by_name, coo_notes, api_key_used, created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, 'PENDING_COO_APPROVAL', ?,
                ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
            )
        `).run(
            id,
            requestNumber,
            String(payee_name).trim(),
            numAmount,
            cheque_date,
            String(bank_name).trim(),
            finalAccountNum,
            finalChequeNumber,
            String(category).trim(),
            String(purpose).trim(),
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
                payeeName: payee_name,
                amount: numAmount,
                bankName: bank_name,
                category,
                purpose,
                apiKeyUsed: LIVE_API_KEY
            }
        });

        // Async notify external COO endpoint if configured
        dispatchCooWebhook(createdRecord).catch(() => {});

        return res.status(201).json({
            success: true,
            message: `Cheque payable request ${requestNumber} for ${payee_name} (₱${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}) has been submitted and sent to the COO API for confirmation.`,
            data: createdRecord
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

module.exports = router;

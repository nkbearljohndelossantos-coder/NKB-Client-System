const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRoles, enforceClientIsolation } = require('../middleware/auth');
const { createInvoiceFromDR } = require('../services/invoiceService');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/invoices
 */
router.get('/', authenticateToken, enforceClientIsolation, (req, res) => {
    const { status, clientId, search } = req.query;

    let query = `
        SELECT si.*, c.company_name, c.contact_person, c.email as client_email,
               po.po_number, dr.dr_number,
               CAST((julianday('now') - julianday(si.due_date)) AS INTEGER) as days_overdue
        FROM sales_invoices si
        JOIN clients c ON si.client_id = c.id
        JOIN purchase_orders po ON si.po_id = po.id
        JOIN delivery_receipts dr ON si.dr_id = dr.id
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND si.client_id = ?';
        params.push(req.clientId);
    } else if (clientId) {
        query += ' AND si.client_id = ?';
        params.push(clientId);
    }

    if (status) {
        query += ' AND si.status = ?';
        params.push(status);
    }

    if (search) {
        query += ' AND (si.invoice_number LIKE ? OR po.po_number LIKE ? OR dr.dr_number LIKE ? OR c.company_name LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term, term);
    }

    query += ' ORDER BY si.created_at DESC';
    const invoices = db.prepare(query).all(...params);

    // Compute dynamic aging bucket and overdue status
    const mapped = invoices.map(inv => {
        const daysOverdue = inv.days_overdue || 0;
        let agingCategory = 'Current';
        if (inv.balance_due > 0) {
            if (daysOverdue > 90) agingCategory = '90+ Days';
            else if (daysOverdue > 60) agingCategory = '61-90 Days';
            else if (daysOverdue > 30) agingCategory = '31-60 Days';
            else if (daysOverdue > 0) agingCategory = '1-30 Days';
            else agingCategory = 'Current';
        }
        return {
            ...inv,
            agingCategory,
            isOverdue: daysOverdue > 0 && inv.balance_due > 0
        };
    });

    return res.json({ success: true, data: mapped });
});

/**
 * GET /api/invoices/:id
 */
router.get('/:id', authenticateToken, enforceClientIsolation, (req, res) => {
    const { id } = req.params;

    const invoice = db.prepare(`
        SELECT si.*, c.company_name, c.contact_person, c.email as client_email, c.phone as client_phone, c.address as client_address, c.tin as client_tin,
               po.po_number, po.po_date, po.tolerance_percent,
               dr.dr_number, dr.delivery_date,
               u.name as creator_name
        FROM sales_invoices si
        JOIN clients c ON si.client_id = c.id
        JOIN purchase_orders po ON si.po_id = po.id
        JOIN delivery_receipts dr ON si.dr_id = dr.id
        LEFT JOIN users u ON si.created_by = u.id
        WHERE si.id = ?
    `).get(id);

    if (!invoice) {
        return res.status(404).json({ success: false, error: 'Sales Invoice not found.' });
    }

    if (req.user.role === 'CLIENT' && invoice.client_id !== req.clientId) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    const items = db.prepare(`
        SELECT ii.*, p.name as product_name, p.sku, p.unit, p.description as product_description,
               b.batch_number, b.production_date, b.expiry_date
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        LEFT JOIN production_batches b ON ii.batch_id = b.id
        WHERE ii.invoice_id = ?
    `).all(id);

    const payments = db.prepare(`
        SELECT p.*, u.name as recorded_by_name
        FROM payments p
        LEFT JOIN users u ON p.recorded_by = u.id
        WHERE p.invoice_id = ?
        ORDER BY p.payment_date DESC
    `).all(id);

    return res.json({
        success: true,
        data: {
            ...invoice,
            items,
            payments
        }
    });
});

/**
 * POST /api/invoices/from-dr/:drId
 * Generate Invoice from an Accepted DR
 */
router.post('/from-dr/:drId', authenticateToken, requireRoles('ADMIN', 'ACCOUNTING'), (req, res) => {
    const { drId } = req.params;
    const { due_date, notes } = req.body;

    try {
        const result = createInvoiceFromDR({
            drId,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            dueDate: due_date,
            notes
        });

        const created = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(result.invoiceId);
        return res.status(201).json({
            success: true,
            message: `Sales Invoice ${result.invoiceNumber} generated successfully based on accepted DR.`,
            data: created
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: err.message,
            code: err.code || 'INVOICE_GENERATION_FAILED'
        });
    }
});

/**
 * POST /api/invoices/:id/void
 * Audited Void/Cancellation Workflow for Issued Invoices
 */
router.post('/:id/void', authenticateToken, requireRoles('ADMIN', 'ACCOUNTING'), (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
        return res.status(400).json({
            success: false,
            error: 'A valid cancellation/void reason is required (minimum 5 characters).',
            code: 'MISSING_VOID_REASON'
        });
    }

    const invoice = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(id);
    if (!invoice) {
        return res.status(404).json({ success: false, error: 'Sales Invoice not found.' });
    }

    if (invoice.status === 'VOID') {
        return res.status(400).json({ success: false, error: 'Invoice is already voided.', code: 'ALREADY_VOID' });
    }

    if (invoice.paid_amount > 0) {
        return res.status(400).json({
            success: false,
            error: `Cannot void invoice with recorded payments (₱${invoice.paid_amount.toFixed(2)}). Please void or refund payments first.`,
            code: 'INVOICE_HAS_PAYMENTS'
        });
    }

    const voidTx = db.transaction(() => {
        // Set invoice status to VOID
        db.prepare("UPDATE sales_invoices SET status = 'VOID', notes = notes || ' [VOIDED: ' || ? || ']', updated_at = datetime('now') WHERE id = ?").run(reason.trim(), id);

        // Revert DR status to ACCEPTED so it can be re-processed if appropriate
        db.prepare("UPDATE delivery_receipts SET status = 'ACCEPTED', updated_at = datetime('now') WHERE id = ?").run(invoice.dr_id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'VOID_INVOICE',
            entityType: 'SALES_INVOICE',
            entityId: invoice.invoice_number,
            details: {
                invoiceId: id,
                invoiceNumber: invoice.invoice_number,
                totalAmount: invoice.total_amount,
                drId: invoice.dr_id,
                reason: reason.trim()
            },
            ipAddress: req.ip
        });
    });

    voidTx();
    const updated = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(id);
    return res.json({
        success: true,
        message: `Sales Invoice ${invoice.invoice_number} has been voided. Associated DR status reverted to ACCEPTED.`,
        data: updated
    });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles, enforceClientIsolation } = require('../middleware/auth');
const { getNextDocumentNumber } = require('../services/documentNumberService');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/payments
 */
router.get('/', authenticateToken, enforceClientIsolation, (req, res) => {
    const { invoiceId, clientId } = req.query;

    let query = `
        SELECT p.*, si.invoice_number, si.total_amount, c.company_name, u.name as recorded_by_name
        FROM payments p
        JOIN sales_invoices si ON p.invoice_id = si.id
        JOIN clients c ON p.client_id = c.id
        LEFT JOIN users u ON p.recorded_by = u.id
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND p.client_id = ?';
        params.push(req.clientId);
    } else if (clientId) {
        query += ' AND p.client_id = ?';
        params.push(clientId);
    }

    if (invoiceId) {
        query += ' AND p.invoice_id = ?';
        params.push(invoiceId);
    }

    query += ' ORDER BY p.payment_date DESC';
    const payments = db.prepare(query).all(...params);

    return res.json({ success: true, data: payments });
});

/**
 * POST /api/payments
 * Record payment for an invoice (Admin / Accounting, or Client submission)
 */
router.post('/', authenticateToken, enforceClientIsolation, (req, res) => {
    const { invoice_id, amount, payment_method, reference_number, notes, payment_date } = req.body;

    if (!invoice_id || !amount || !payment_method || !reference_number) {
        return res.status(400).json({ success: false, error: 'Invoice ID, amount, payment method, and reference number are required.' });
    }

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Payment amount must be greater than 0.' });
    }

    const invoice = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(invoice_id);
    if (!invoice) {
        return res.status(404).json({ success: false, error: 'Sales Invoice not found.' });
    }

    if (req.user.role === 'CLIENT' && invoice.client_id !== req.clientId) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    if (invoice.status === 'PAID') {
        return res.status(400).json({ success: false, error: 'This invoice has already been fully paid.' });
    }

    if (payAmount > invoice.balance_due + 0.01) { // 1 cent threshold
        return res.status(400).json({ success: false, error: `Payment amount (₱${payAmount.toFixed(2)}) exceeds balance due (₱${invoice.balance_due.toFixed(2)}).` });
    }

    const recordPaymentTx = db.transaction(() => {
        const paymentId = uuidv4();
        const paymentNumber = getNextDocumentNumber('PAY');

        const newPaidAmount = invoice.paid_amount + payAmount;
        const newBalanceDue = Math.max(0, invoice.total_amount - newPaidAmount);
        const newStatus = newBalanceDue <= 0.001 ? 'PAID' : 'PARTIALLY_PAID';

        // Insert payment record
        db.prepare(`
            INSERT INTO payments
            (id, payment_number, invoice_id, client_id, payment_date, amount, payment_method, reference_number, notes, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            paymentId,
            paymentNumber,
            invoice_id,
            invoice.client_id,
            payment_date || new Date().toISOString().split('T')[0],
            payAmount,
            payment_method,
            reference_number.trim(),
            notes || null,
            req.user.id
        );

        // Update Invoice
        db.prepare(`
            UPDATE sales_invoices
            SET paid_amount = ?, balance_due = ?, status = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(newPaidAmount, newBalanceDue, newStatus, invoice_id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'RECORD_PAYMENT',
            entityType: 'PAYMENT',
            entityId: paymentNumber,
            details: {
                paymentId,
                paymentNumber,
                invoiceNumber: invoice.invoice_number,
                amount: payAmount,
                newBalanceDue,
                newStatus
            }
        });

        return { paymentId, paymentNumber, newPaidAmount, newBalanceDue, newStatus };
    });

    try {
        const result = recordPaymentTx();
        const updatedInvoice = db.prepare('SELECT * FROM sales_invoices WHERE id = ?').get(invoice_id);
        return res.status(201).json({
            success: true,
            message: `Payment ${result.paymentNumber} of ₱${payAmount.toFixed(2)} recorded successfully. Invoice balance: ₱${result.newBalanceDue.toFixed(2)} (${result.newStatus}).`,
            data: {
                paymentNumber: result.paymentNumber,
                invoice: updatedInvoice
            }
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;

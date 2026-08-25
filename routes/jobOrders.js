const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { getNextDocumentNumber } = require('../services/documentNumberService');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/job-orders
 */
router.get('/', authenticateToken, (req, res) => {
    const { poId, status } = req.query;

    let query = `
        SELECT jo.*, po.po_number, c.company_name, p.name as product_name, p.sku, p.unit,
               (SELECT COUNT(*) FROM production_batches WHERE jo_id = jo.id) as batch_count,
               (SELECT SUM(actual_yield) FROM production_batches WHERE jo_id = jo.id) as total_yield
        FROM job_orders jo
        JOIN purchase_orders po ON jo.po_id = po.id
        JOIN clients c ON po.client_id = c.id
        JOIN products p ON jo.product_id = p.id
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND po.client_id = ?';
        params.push(req.user.client_id);
    }

    if (poId) {
        query += ' AND jo.po_id = ?';
        params.push(poId);
    }

    if (status) {
        query += ' AND jo.status = ?';
        params.push(status);
    }

    query += ' ORDER BY jo.created_at DESC';
    const jobOrders = db.prepare(query).all(...params);

    return res.json({ success: true, data: jobOrders });
});

/**
 * GET /api/job-orders/:id
 */
router.get('/:id', authenticateToken, (req, res) => {
    const jo = db.prepare(`
        SELECT jo.*, po.po_number, po.tolerance_percent, po.billing_policy, po.client_id,
               c.company_name, p.name as product_name, p.sku, p.formula_code, p.unit,
               u.name as creator_name
        FROM job_orders jo
        JOIN purchase_orders po ON jo.po_id = po.id
        JOIN clients c ON po.client_id = c.id
        JOIN products p ON jo.product_id = p.id
        LEFT JOIN users u ON jo.created_by = u.id
        WHERE jo.id = ?
    `).get(req.params.id);

    if (!jo) {
        return res.status(404).json({ success: false, error: 'Job Order not found.' });
    }

    if (req.user.role === 'CLIENT' && jo.client_id !== req.user.client_id) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    const batches = db.prepare(`
        SELECT * FROM production_batches WHERE jo_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    return res.json({
        success: true,
        data: {
            ...jo,
            batches
        }
    });
});

/**
 * POST /api/job-orders
 * Admin / Production creates Job Order from an approved PO
 */
router.post('/', authenticateToken, requireRoles('ADMIN', 'PRODUCTION'), (req, res) => {
    const { po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, notes } = req.body;

    if (!po_id || !product_id || !target_quantity) {
        return res.status(400).json({ success: false, error: 'PO ID, Product ID, and Target Quantity are required.' });
    }

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po_id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (po.status === 'DRAFT' || po.status === 'CANCELLED') {
        return res.status(400).json({ success: false, error: `Cannot create Job Order for PO in status "${po.status}".` });
    }

    const joId = uuidv4();
    const joNumber = getNextDocumentNumber('JO');

    const tx = db.transaction(() => {
        db.prepare(`
            INSERT INTO job_orders
            (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_PRODUCTION', ?, ?)
        `).run(
            joId,
            joNumber,
            po_id,
            product_id,
            parseInt(target_quantity),
            scheduled_start_date || new Date().toISOString().split('T')[0],
            scheduled_end_date || null,
            assigned_team || 'Formulation & Bottling Team Alpha',
            notes || null,
            req.user.id
        );

        // Update PO status to IN_PRODUCTION if not already
        db.prepare(`
            UPDATE purchase_orders
            SET status = 'IN_PRODUCTION', updated_at = datetime('now')
            WHERE id = ? AND status = 'APPROVED'
        `).run(po_id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_JO',
            entityType: 'JOB_ORDER',
            entityId: joNumber,
            details: { joId, joNumber, poId: po_id, target_quantity }
        });

        return joId;
    });

    const createdId = tx();
    const createdJO = db.prepare('SELECT * FROM job_orders WHERE id = ?').get(createdId);
    return res.status(201).json({ success: true, data: createdJO });
});

module.exports = router;

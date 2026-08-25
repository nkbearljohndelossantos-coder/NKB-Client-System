const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { getNextDocumentNumber } = require('../services/documentNumberService');
const { recordMovement } = require('../services/inventoryService');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/production/batches
 */
router.get('/batches', authenticateToken, (req, res) => {
    const { joId, status, search } = req.query;

    let query = `
        SELECT b.*, p.name as product_name, p.sku, p.unit,
               jo.jo_number, po.po_number, po.tolerance_percent, po.billing_policy,
               c.company_name, c.id as client_id
        FROM production_batches b
        JOIN job_orders jo ON b.jo_id = jo.id
        JOIN purchase_orders po ON jo.po_id = po.id
        JOIN clients c ON po.client_id = c.id
        JOIN products p ON b.product_id = p.id
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND po.client_id = ?';
        params.push(req.user.client_id);
    }

    if (joId) {
        query += ' AND b.jo_id = ?';
        params.push(joId);
    }

    if (status) {
        query += ' AND b.status = ?';
        params.push(status);
    }

    if (search) {
        query += ' AND (b.batch_number LIKE ? OR p.name LIKE ? OR jo.jo_number LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    query += ' ORDER BY b.created_at DESC';
    const batches = db.prepare(query).all(...params);

    return res.json({ success: true, data: batches });
});

/**
 * GET /api/production/batches/:id
 */
router.get('/batches/:id', authenticateToken, (req, res) => {
    const batch = db.prepare(`
        SELECT b.*, p.name as product_name, p.sku, p.unit, p.formula_code,
               jo.jo_number, po.id as po_id, po.po_number, po.tolerance_percent, po.billing_policy,
               c.company_name, c.id as client_id,
               u.name as creator_name
        FROM production_batches b
        JOIN job_orders jo ON b.jo_id = jo.id
        JOIN purchase_orders po ON jo.po_id = po.id
        JOIN clients c ON po.client_id = c.id
        JOIN products p ON b.product_id = p.id
        LEFT JOIN users u ON b.created_by = u.id
        WHERE b.id = ?
    `).get(req.params.id);

    if (!batch) {
        return res.status(404).json({ success: false, error: 'Production Batch not found.' });
    }

    if (req.user.role === 'CLIENT' && batch.client_id !== req.user.client_id) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    const yields = db.prepare(`
        SELECT y.*, u.name as logged_by_name
        FROM batch_yields y
        JOIN users u ON y.logged_by = u.id
        WHERE y.batch_id = ?
        ORDER BY y.recorded_at DESC
    `).all(req.params.id);

    const approvals = db.prepare(`
        SELECT a.*, u.name as approved_by_name
        FROM overrun_approvals a
        JOIN users u ON a.approved_by = u.id
        WHERE a.batch_id = ?
        ORDER BY a.created_at DESC
    `).all(req.params.id);

    return res.json({
        success: true,
        data: {
            ...batch,
            yields,
            approvals
        }
    });
});

/**
 * POST /api/production/batches
 * Create a new production batch
 */
router.post('/batches', authenticateToken, requireRoles('ADMIN', 'PRODUCTION'), (req, res) => {
    const { jo_id, target_quantity, formula_code, production_date, expiry_date } = req.body;

    if (!jo_id || !target_quantity) {
        return res.status(400).json({ success: false, error: 'Job Order ID and Target Quantity are required.' });
    }

    const jo = db.prepare(`
        SELECT jo.*, p.shelf_life_months, p.formula_code as default_formula
        FROM job_orders jo
        JOIN products p ON jo.product_id = p.id
        WHERE jo.id = ?
    `).get(jo_id);

    if (!jo) {
        return res.status(404).json({ success: false, error: 'Job Order not found.' });
    }

    const batchId = uuidv4();
    const batchNumber = getNextDocumentNumber('BAT');

    // Calculate expiry date if not provided
    let expDate = expiry_date;
    if (!expDate) {
        const prodDate = production_date ? new Date(production_date) : new Date();
        prodDate.setMonth(prodDate.getMonth() + (jo.shelf_life_months || 24));
        expDate = prodDate.toISOString().split('T')[0];
    }

    db.prepare(`
        INSERT INTO production_batches
        (id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date, target_quantity, actual_yield, variance_quantity, variance_percent, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0.0, 'MIXING', ?)
    `).run(
        batchId,
        batchNumber,
        jo_id,
        jo.product_id,
        formula_code || jo.default_formula || 'FORM-2026-V1',
        production_date || new Date().toISOString().split('T')[0],
        expDate,
        parseInt(target_quantity),
        req.user.id
    );

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE_BATCH',
        entityType: 'PRODUCTION_BATCH',
        entityId: batchNumber,
        details: { batchId, batchNumber, joId: jo_id, target_quantity }
    });

    const created = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(batchId);
    return res.status(201).json({ success: true, data: created });
});

/**
 * POST /api/production/batches/:id/yield
 * Log actual finished output & calculate Yield Variance
 */
router.post('/batches/:id/yield', authenticateToken, requireRoles('ADMIN', 'PRODUCTION'), (req, res) => {
    const { id } = req.params;
    const { actual_yield, qc_notes } = req.body;

    if (actual_yield === undefined || isNaN(parseInt(actual_yield)) || parseInt(actual_yield) < 0) {
        return res.status(400).json({ success: false, error: 'Valid actual yield quantity is required.' });
    }

    const batch = db.prepare(`
        SELECT b.*, po.id as po_id, po.po_number, po.tolerance_percent,
               poi.target_quantity as po_target_qty, poi.max_allowed_quantity
        FROM production_batches b
        JOIN job_orders jo ON b.jo_id = jo.id
        JOIN purchase_orders po ON jo.po_id = po.id
        LEFT JOIN purchase_order_items poi ON poi.po_id = po.id AND poi.product_id = b.product_id
        WHERE b.id = ?
    `).get(id);

    if (!batch) {
        return res.status(404).json({ success: false, error: 'Production Batch not found.' });
    }

    const actualQty = parseInt(actual_yield);
    const targetQty = batch.target_quantity;
    const varianceQty = actualQty - targetQty;
    const variancePercent = targetQty > 0 ? ((varianceQty / targetQty) * 100) : 0.0;

    // Tolerance limit evaluation
    const tolerancePercent = batch.tolerance_percent || 10.0;
    const maxAllowedQty = Math.ceil(targetQty * (1 + tolerancePercent / 100));

    let batchStatus = 'QC_PASSED';
    let isException = false;

    if (actualQty > maxAllowedQty) {
        // OVER-TOLERANCE EXCEPTION: Requires manual managerial approval
        batchStatus = 'EXCEPTION_REQUIRES_APPROVAL';
        isException = true;
    } else {
        batchStatus = 'APPROVED_FOR_DISPATCH';
    }

    const logYieldTx = db.transaction(() => {
        // Update batch record
        db.prepare(`
            UPDATE production_batches
            SET actual_yield = ?,
                variance_quantity = ?,
                variance_percent = ?,
                status = ?,
                qc_notes = ?,
                qc_passed_by = ?,
                qc_passed_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
        `).run(
            actualQty,
            varianceQty,
            parseFloat(variancePercent.toFixed(2)),
            batchStatus,
            qc_notes || null,
            req.user.id,
            id
        );

        // Record batch yield log
        db.prepare(`
            INSERT INTO batch_yields
            (id, batch_id, recorded_at, target_quantity, actual_yield, variance_quantity, variance_percent, logged_by, notes)
            VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
        `).run(
            uuidv4(),
            id,
            targetQty,
            actualQty,
            varianceQty,
            parseFloat(variancePercent.toFixed(2)),
            req.user.id,
            qc_notes || `Yield logged: ${actualQty} pcs (Variance: ${varianceQty > 0 ? '+' : ''}${varianceQty} pcs, ${variancePercent.toFixed(2)}%)`
        );

        // If approved for dispatch, update inventory
        if (batchStatus === 'APPROVED_FOR_DISPATCH') {
            recordMovement({
                productId: batch.product_id,
                batchId: id,
                movementType: 'PRODUCTION_OUTPUT',
                quantity: actualQty,
                referenceType: 'BATCH',
                referenceId: batch.batch_number,
                notes: `Production output logged for batch ${batch.batch_number}`,
                createdBy: req.user.id
            });
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'LOG_BATCH_YIELD',
            entityType: 'PRODUCTION_BATCH',
            entityId: batch.batch_number,
            details: {
                batchId: id,
                targetQuantity: targetQty,
                actualYield: actualQty,
                varianceQuantity: varianceQty,
                variancePercent: parseFloat(variancePercent.toFixed(2)),
                status: batchStatus,
                isException
            }
        });

        return { batchStatus, isException, varianceQty, variancePercent: parseFloat(variancePercent.toFixed(2)) };
    });

    const result = logYieldTx();
    const updated = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(id);

    return res.json({
        success: true,
        message: result.isException 
            ? `Actual yield (${actualQty} pcs) exceeds agreed +${tolerancePercent}% tolerance (Max: ${maxAllowedQty} pcs). Exception requires approval.`
            : `Yield logged successfully. Variance: ${result.varianceQty > 0 ? '+' : ''}${result.varianceQty} pcs (${result.variancePercent}%).`,
        data: updated,
        exceptionRequiresApproval: result.isException
    });
});

/**
 * POST /api/production/batches/:id/approve-overrun
 * Admin / Accounting approves an over-tolerance batch
 */
router.post('/batches/:id/approve-overrun', authenticateToken, requireRoles('ADMIN', 'ACCOUNTING'), (req, res) => {
    const { id } = req.params;
    const { approved_quantity, reason, notes } = req.body;

    const batch = db.prepare(`
        SELECT b.*, po.id as po_id, po.po_number, po.tolerance_percent
        FROM production_batches b
        JOIN job_orders jo ON b.jo_id = jo.id
        JOIN purchase_orders po ON jo.po_id = po.id
        WHERE b.id = ?
    `).get(id);

    if (!batch) {
        return res.status(404).json({ success: false, error: 'Production Batch not found.' });
    }

    if (batch.status !== 'EXCEPTION_REQUIRES_APPROVAL') {
        return res.status(400).json({ success: false, error: `Batch status is "${batch.status}". Only batches in EXCEPTION_REQUIRES_APPROVAL can be approved.` });
    }

    const targetQty = batch.target_quantity;
    const actualYield = batch.actual_yield;
    const maxToleranceQty = Math.ceil(targetQty * (1 + (batch.tolerance_percent || 10.0) / 100));
    const excessQty = actualYield - maxToleranceQty;
    const approvedQty = approved_quantity ? parseInt(approved_quantity) : actualYield;

    const approveTx = db.transaction(() => {
        // Record approval in overrun_approvals table
        const approvalId = uuidv4();
        db.prepare(`
            INSERT INTO overrun_approvals
            (id, batch_id, po_id, target_quantity, actual_yield, max_tolerance_quantity, excess_quantity, approved_quantity, reason, notes, status, approved_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)
        `).run(
            approvalId,
            id,
            batch.po_id,
            targetQty,
            actualYield,
            maxToleranceQty,
            excessQty,
            approvedQty,
            reason || 'Managerial override for production batch overrun.',
            notes || null,
            req.user.id
        );

        // Update batch status to APPROVED_FOR_DISPATCH
        db.prepare(`
            UPDATE production_batches
            SET status = 'APPROVED_FOR_DISPATCH', updated_at = datetime('now')
            WHERE id = ?
        `).run(id);

        // Record inventory movement
        recordMovement({
            productId: batch.product_id,
            batchId: id,
            movementType: 'PRODUCTION_OUTPUT',
            quantity: approvedQty,
            referenceType: 'BATCH',
            referenceId: batch.batch_number,
            notes: `Approved overrun output logged for batch ${batch.batch_number} (${approvedQty} pcs)`,
            createdBy: req.user.id
        });

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'APPROVE_OVERRUN',
            entityType: 'PRODUCTION_BATCH',
            entityId: batch.batch_number,
            details: {
                batchId: id,
                approvedQuantity: approvedQty,
                excessQuantity: excessQty,
                reason,
                approvedBy: req.user.name
            }
        });
    });

    approveTx();
    const updated = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(id);
    return res.json({ success: true, message: 'Overrun exception approved successfully. Batch is now approved for dispatch.', data: updated });
});

module.exports = router;

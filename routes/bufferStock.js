const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles, enforceClientIsolation } = require('../middleware/auth');
const { recordMovement } = require('../services/inventoryService');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/buffer-stock
 */
router.get('/', authenticateToken, enforceClientIsolation, (req, res) => {
    const { clientId, status } = req.query;

    let query = `
        SELECT bs.*, c.company_name, p.name as product_name, p.sku, p.unit, p.default_price,
               b.batch_number, po.po_number
        FROM client_buffer_stock bs
        JOIN clients c ON bs.client_id = c.id
        JOIN products p ON bs.product_id = p.id
        JOIN production_batches b ON bs.source_batch_id = b.id
        JOIN purchase_orders po ON bs.source_po_id = po.id
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND bs.client_id = ?';
        params.push(req.clientId);
    } else if (clientId) {
        query += ' AND bs.client_id = ?';
        params.push(clientId);
    }

    if (status) {
        query += ' AND bs.status = ?';
        params.push(status);
    }

    query += ' ORDER BY bs.created_at DESC';
    const bufferItems = db.prepare(query).all(...params);

    return res.json({ success: true, data: bufferItems });
});

/**
 * POST /api/buffer-stock/:id/release
 * Release buffer stock to dispatch or consume
 */
router.post('/:id/release', authenticateToken, requireRoles('ADMIN', 'WAREHOUSE', 'ACCOUNTING'), (req, res) => {
    const { id } = req.params;
    const { release_quantity, reason, notes } = req.body;

    const bufferRecord = db.prepare('SELECT * FROM client_buffer_stock WHERE id = ?').get(id);
    if (!bufferRecord) {
        return res.status(404).json({ success: false, error: 'Buffer stock record not found.' });
    }

    const relQty = parseInt(release_quantity);
    if (isNaN(relQty) || relQty <= 0) {
        return res.status(400).json({ success: false, error: 'Valid release quantity is required.' });
    }

    if (relQty > bufferRecord.quantity_remaining) {
        return res.status(400).json({ success: false, error: `Release quantity (${relQty}) exceeds available remaining buffer stock (${bufferRecord.quantity_remaining}).` });
    }

    const releaseTx = db.transaction(() => {
        const newReleased = bufferRecord.quantity_released + relQty;
        const newRemaining = bufferRecord.quantity_remaining - relQty;
        const newStatus = newRemaining === 0 ? 'RELEASED' : 'PARTIALLY_RELEASED';

        db.prepare(`
            UPDATE client_buffer_stock
            SET quantity_released = ?, quantity_remaining = ?, status = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(newReleased, newRemaining, newStatus, id);

        // Record inventory movement for buffer release
        recordMovement({
            productId: bufferRecord.product_id,
            batchId: bufferRecord.source_batch_id,
            movementType: 'BUFFER_RELEASE',
            quantity: relQty,
            referenceType: 'BUFFER',
            referenceId: id,
            notes: reason || `Released ${relQty} units of buffer stock to client.`,
            createdBy: req.user.id
        });

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'RELEASE_BUFFER_STOCK',
            entityType: 'BUFFER_STOCK',
            entityId: id,
            details: {
                bufferId: id,
                releaseQuantity: relQty,
                remaining: newRemaining,
                reason
            }
        });

        return { newReleased, newRemaining, newStatus };
    });

    const result = releaseTx();
    const updated = db.prepare('SELECT * FROM client_buffer_stock WHERE id = ?').get(id);
    return res.json({ success: true, message: `Successfully released ${relQty} pcs. Remaining: ${result.newRemaining} pcs.`, data: updated });
});

module.exports = router;

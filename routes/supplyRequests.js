const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRoles, ROLES } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/supply-requests
 * Retrieve all supply requisitions submitted by Inventory for Purchasing Department
 */
router.get('/', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING, ROLES.INVENTORY, ROLES.CEO), (req, res) => {
    try {
        const { status, urgency, search } = req.query;

        let sql = `
            SELECT sr.*, 
                   po.po_number, po.status as po_status, po.expected_delivery_date as po_delivery_date,
                   c.company_name as client_name,
                   u.name as requested_by_name, u.email as requested_by_email
            FROM supply_requests sr
            JOIN purchase_orders po ON sr.po_id = po.id
            JOIN clients c ON po.client_id = c.id
            JOIN users u ON sr.requested_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            sql += ' AND sr.status = ?';
            params.push(status.toUpperCase().trim());
        }

        if (urgency) {
            sql += ' AND sr.urgency = ?';
            params.push(urgency.toUpperCase().trim());
        }

        if (search) {
            sql += ' AND (po.po_number LIKE ? OR c.company_name LIKE ? OR sr.materials_needed LIKE ? OR u.name LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }

        sql += ' ORDER BY sr.created_at DESC';

        const requests = db.prepare(sql).all(...params);
        return res.json({ success: true, data: requests });
    } catch (err) {
        console.error('Error fetching supply requests:', err);
        return res.status(500).json({ success: false, error: 'FAILED_FETCH_REQUISITIONS', message: err.message });
    }
});

/**
 * GET /api/supply-requests/:id
 * Retrieve a single supply request by ID
 */
router.get('/:id', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING, ROLES.INVENTORY, ROLES.CEO), (req, res) => {
    const { id } = req.params;
    const reqItem = db.prepare(`
        SELECT sr.*, 
               po.po_number, po.status as po_status, po.expected_delivery_date as po_delivery_date,
               c.company_name as client_name,
               u.name as requested_by_name, u.email as requested_by_email
        FROM supply_requests sr
        JOIN purchase_orders po ON sr.po_id = po.id
        JOIN clients c ON po.client_id = c.id
        JOIN users u ON sr.requested_by = u.id
        WHERE sr.id = ?
    `).get(id);

    if (!reqItem) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Requisition not found.' });
    }

    return res.json({ success: true, data: reqItem });
});

/**
 * PUT /api/supply-requests/:id
 * Update status, notes, or procurement details of a supply request
 */
router.put('/:id', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING), (req, res) => {
    const { id } = req.params;
    const { status, notes, supplier_details, target_date } = req.body;

    const existing = db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Requisition not found.' });
    }

    const validStatuses = ['SUBMITTED', 'ORDERED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
    const updatedStatus = status ? status.toUpperCase().trim() : existing.status;
    if (status && !validStatuses.includes(updatedStatus)) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_STATUS',
            message: `Status must be one of: ${validStatuses.join(', ')}`
        });
    }

    let updatedNotes = existing.notes;
    if (notes !== undefined || supplier_details !== undefined) {
        const parts = [];
        if (existing.notes) parts.push(existing.notes);
        if (supplier_details) parts.push(`[Purchasing]: ${supplier_details.trim()}`);
        if (notes && notes !== existing.notes) parts.push(`[Note]: ${notes.trim()}`);
        updatedNotes = parts.join('\n');
    }

    const updatedTargetDate = target_date !== undefined ? target_date : existing.target_date;

    db.prepare(`
        UPDATE supply_requests
        SET status = ?, notes = ?, target_date = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
    `).run(updatedStatus, updatedNotes, updatedTargetDate, id);

    // If marked as DELIVERED, check if all requests for this PO are fulfilled
    let poRawMaterialsUpdated = false;
    if (updatedStatus === 'DELIVERED') {
        const remainingPending = db.prepare(`
            SELECT COUNT(*) as count 
            FROM supply_requests 
            WHERE po_id = ? AND status NOT IN ('DELIVERED', 'CANCELLED')
        `).get(existing.po_id);

        if (!remainingPending || remainingPending.count === 0) {
            db.prepare(`
                UPDATE purchase_orders
                SET raw_materials_status = 'SUFFICIENT',
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
            `).run(existing.po_id);
            poRawMaterialsUpdated = true;
        }
    }

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE_SUPPLY_REQUEST',
        entityType: 'SUPPLY_REQUEST',
        entityId: id,
        details: {
            poId: existing.po_id,
            previousStatus: existing.status,
            newStatus: updatedStatus,
            poRawMaterialsUpdated
        },
        ipAddress: req.ip
    });

    const updated = db.prepare(`
        SELECT sr.*, 
               po.po_number, po.status as po_status, po.expected_delivery_date as po_delivery_date,
               c.company_name as client_name,
               u.name as requested_by_name, u.email as requested_by_email
        FROM supply_requests sr
        JOIN purchase_orders po ON sr.po_id = po.id
        JOIN clients c ON po.client_id = c.id
        JOIN users u ON sr.requested_by = u.id
        WHERE sr.id = ?
    `).get(id);

    return res.json({
        success: true,
        message: `Requisition status updated to ${updatedStatus}.` + (poRawMaterialsUpdated ? ' Linked Purchase Order materials marked as SUFFICIENT.' : ''),
        data: updated
    });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles, enforceClientIsolation } = require('../middleware/auth');
const { getNextDocumentNumber } = require('../services/documentNumberService');
const { recordMovement } = require('../services/inventoryService');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/deliveries
 */
router.get('/', authenticateToken, enforceClientIsolation, (req, res) => {
    const { poId, status, search } = req.query;

    let query = `
        SELECT dr.*, po.po_number, po.billing_policy, po.tolerance_percent,
               c.company_name, c.contact_person, c.phone as client_phone, c.address as client_address,
               (SELECT COUNT(*) FROM delivery_items WHERE dr_id = dr.id) as items_count,
               (SELECT SUM(delivered_quantity) FROM delivery_items WHERE dr_id = dr.id) as total_delivered,
               (SELECT SUM(accepted_quantity) FROM delivery_items WHERE dr_id = dr.id) as total_accepted,
               (SELECT SUM(rejected_quantity) FROM delivery_items WHERE dr_id = dr.id) as total_rejected,
               si.id as invoice_id, si.invoice_number, si.total_amount as invoice_amount, si.status as invoice_status
        FROM delivery_receipts dr
        JOIN purchase_orders po ON dr.po_id = po.id
        JOIN clients c ON dr.client_id = c.id
        LEFT JOIN sales_invoices si ON si.dr_id = dr.id
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND dr.client_id = ?';
        params.push(req.clientId);
    }

    if (poId) {
        query += ' AND dr.po_id = ?';
        params.push(poId);
    }

    if (status) {
        query += ' AND dr.status = ?';
        params.push(status);
    }

    if (search) {
        query += ' AND (dr.dr_number LIKE ? OR po.po_number LIKE ? OR c.company_name LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    query += ' ORDER BY dr.created_at DESC';
    const deliveries = db.prepare(query).all(...params);

    return res.json({ success: true, data: deliveries });
});

/**
 * GET /api/deliveries/:id
 */
router.get('/:id', authenticateToken, enforceClientIsolation, (req, res) => {
    const { id } = req.params;

    const dr = db.prepare(`
        SELECT dr.*, po.po_number, po.po_date, po.billing_policy, po.tolerance_percent,
               c.company_name, c.contact_person, c.email as client_email, c.phone as client_phone, c.address as client_address, c.tin as client_tin,
               u.name as creator_name,
               si.id as invoice_id, si.invoice_number, si.total_amount as invoice_amount, si.status as invoice_status
        FROM delivery_receipts dr
        JOIN purchase_orders po ON dr.po_id = po.id
        JOIN clients c ON dr.client_id = c.id
        LEFT JOIN users u ON dr.created_by = u.id
        LEFT JOIN sales_invoices si ON si.dr_id = dr.id
        WHERE dr.id = ?
    `).get(id);

    if (!dr) {
        return res.status(404).json({ success: false, error: 'Delivery Receipt not found.' });
    }

    if (req.user.role === 'CLIENT' && dr.client_id !== req.clientId) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    const items = db.prepare(`
        SELECT di.*, p.name as product_name, p.sku, p.unit, p.description as product_description,
               b.batch_number, b.production_date, b.expiry_date,
               poi.target_quantity as po_target_quantity
        FROM delivery_items di
        JOIN products p ON di.product_id = p.id
        JOIN production_batches b ON di.batch_id = b.id
        LEFT JOIN purchase_order_items poi ON poi.po_id = ? AND poi.product_id = di.product_id
        WHERE di.dr_id = ?
    `).all(dr.po_id, id);

    const acceptance = db.prepare(`
        SELECT da.*, u.name as accepted_by_user_name, u.email as accepted_by_user_email
        FROM dr_acceptances da
        JOIN users u ON da.client_user_id = u.id
        WHERE da.dr_id = ?
    `).get(id);

    const returnsList = db.prepare(`
        SELECT r.*, p.name as product_name, b.batch_number
        FROM returns r
        JOIN products p ON r.product_id = p.id
        JOIN production_batches b ON r.batch_id = b.id
        WHERE r.dr_id = ?
    `).all(id);

    return res.json({
        success: true,
        data: {
            ...dr,
            items,
            acceptance,
            returns: returnsList
        }
    });
});

/**
 * POST /api/deliveries
 * Admin / Warehouse creates a new Delivery Receipt
 */
router.post('/', authenticateToken, requireRoles('ADMIN', 'WAREHOUSE'), (req, res) => {
    const { po_id, jo_id, delivery_date, driver_name, vehicle_plate, notes, items } = req.body;

    if (!po_id || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'PO ID and at least one delivery item are required.' });
    }

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po_id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (po.status === 'DRAFT' || po.status === 'CANCELLED') {
        return res.status(400).json({ success: false, error: `Cannot deliver for PO in status "${po.status}".` });
    }

    const createDrTx = db.transaction(() => {
        const drId = uuidv4();
        const drNumber = getNextDocumentNumber('DR');

        db.prepare(`
            INSERT INTO delivery_receipts
            (id, dr_number, client_id, po_id, jo_id, delivery_date, driver_name, vehicle_plate, status, notes, dispatched_by, dispatched_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_CLIENT_ACCEPTANCE', ?, ?, datetime('now'), ?)
        `).run(
            drId,
            drNumber,
            po.client_id,
            po_id,
            jo_id || null,
            delivery_date || new Date().toISOString().split('T')[0],
            driver_name || null,
            vehicle_plate || null,
            notes || null,
            req.user.id,
            req.user.id
        );

        const insertItemStmt = db.prepare(`
            INSERT INTO delivery_items
            (id, dr_id, product_id, batch_id, delivered_quantity, accepted_quantity, rejected_quantity, unit_price)
            VALUES (?, ?, ?, ?, ?, 0, 0, ?)
        `);

        for (const item of items) {
            const deliveredQty = parseInt(item.delivered_quantity);
            if (isNaN(deliveredQty) || deliveredQty <= 0) {
                throw new Error('Delivered quantity must be greater than 0.');
            }

            // Fetch PO item price
            const poItem = db.prepare('SELECT unit_price FROM purchase_order_items WHERE po_id = ? AND product_id = ?').get(po_id, item.product_id);
            const unitPrice = item.unit_price !== undefined ? parseFloat(item.unit_price) : (poItem ? poItem.unit_price : 0.0);

            insertItemStmt.run(
                uuidv4(),
                drId,
                item.product_id,
                item.batch_id,
                deliveredQty,
                unitPrice
            );

            // Mark production batch as COMPLETED / DISPATCHED
            if (item.batch_id) {
                db.prepare("UPDATE production_batches SET status = 'COMPLETED', updated_at = datetime('now') WHERE id = ?").run(item.batch_id);
                
                // Automatically mark parent Job Order as COMPLETED to prevent duplicate work
                db.prepare(`
                    UPDATE job_orders 
                    SET status = 'COMPLETED', updated_at = datetime('now') 
                    WHERE id = (SELECT jo_id FROM production_batches WHERE id = ?)
                `).run(item.batch_id);
            }

            // Deduct stock from finished goods inventory for this dispatch
            recordMovement({
                productId: item.product_id,
                batchId: item.batch_id,
                movementType: 'DELIVERY',
                quantity: -deliveredQty,
                referenceType: 'DR',
                referenceId: drNumber,
                notes: `Dispatched on ${drNumber} to client`,
                createdBy: req.user.id
            });
        }

        if (jo_id) {
            db.prepare("UPDATE job_orders SET status = 'COMPLETED', updated_at = datetime('now') WHERE id = ?").run(jo_id);
        }

        // Update PO status to PARTIALLY_DELIVERED or COMPLETED
        db.prepare(`
            UPDATE purchase_orders 
            SET status = 'COMPLETED', updated_at = datetime('now') 
            WHERE id = ?
        `).run(po_id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_DR',
            entityType: 'DELIVERY_RECEIPT',
            entityId: drNumber,
            details: { drId, drNumber, poId: po_id, itemsCount: items.length }
        });

        return { drId, drNumber };
    });

    try {
        const result = createDrTx();
        const createdDR = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(result.drId);
        return res.status(201).json({ success: true, data: createdDR });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/deliveries/:id/accept
 * Client Digital DR Acceptance
 */
router.post('/:id/accept', authenticateToken, enforceClientIsolation, (req, res) => {
    const { id } = req.params;
    const { signer_name, signer_title, signature_data, signature_type, items, acceptance_notes } = req.body;

    const dr = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(id);
    if (!dr) {
        return res.status(404).json({ success: false, error: 'Delivery Receipt not found.' });
    }

    if (req.user.role === 'CLIENT' && dr.client_id !== req.clientId) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    if (dr.status === 'ACCEPTED' || dr.status === 'INVOICED') {
        return res.status(400).json({ success: false, error: `Delivery Receipt is already ${dr.status}.` });
    }

    if (!signer_name) {
        return res.status(400).json({ success: false, error: 'Signer name is required for digital acceptance.' });
    }

    const currentItems = db.prepare('SELECT * FROM delivery_items WHERE dr_id = ?').all(id);

    const acceptTx = db.transaction(() => {
        let totalDelivered = 0;
        let totalAccepted = 0;
        let totalRejected = 0;

        for (const currentItem of currentItems) {
            totalDelivered += currentItem.delivered_quantity;

            // Check if specific accepted/rejected quantities were passed
            let acceptedQty = currentItem.delivered_quantity;
            let rejectedQty = 0;
            let rejectReason = '';

            if (items && Array.isArray(items)) {
                const passedItem = items.find(i => i.id === currentItem.id || i.product_id === currentItem.product_id);
                if (passedItem) {
                    acceptedQty = passedItem.accepted_quantity !== undefined ? parseInt(passedItem.accepted_quantity) : currentItem.delivered_quantity;
                    rejectedQty = passedItem.rejected_quantity !== undefined ? parseInt(passedItem.rejected_quantity) : 0;
                    rejectReason = passedItem.reason || 'Damaged or defective units reported by client';
                }
            }

            if (acceptedQty + rejectedQty > currentItem.delivered_quantity) {
                throw new Error(`Total accepted (${acceptedQty}) + rejected (${rejectedQty}) cannot exceed delivered quantity (${currentItem.delivered_quantity}).`);
            }

            totalAccepted += acceptedQty;
            totalRejected += rejectedQty;

            // Update item
            db.prepare(`
                UPDATE delivery_items
                SET accepted_quantity = ?, rejected_quantity = ?
                WHERE id = ?
            `).run(acceptedQty, rejectedQty, currentItem.id);

            // Log rejection / return if any
            if (rejectedQty > 0) {
                db.prepare(`
                    INSERT INTO returns
                    (id, dr_id, product_id, batch_id, rejected_quantity, reason, notes, status, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'LOGGED', ?)
                `).run(
                    uuidv4(),
                    id,
                    currentItem.product_id,
                    currentItem.batch_id,
                    rejectedQty,
                    rejectReason,
                    `Client rejected ${rejectedQty} units during DR acceptance.`,
                    req.user.id
                );
            }
        }

        // Insert DR Acceptance
        db.prepare(`
            INSERT INTO dr_acceptances
            (id, dr_id, client_user_id, signer_name, signer_title, signature_data, signature_type, total_delivered_quantity, total_accepted_quantity, total_rejected_quantity, acceptance_notes, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            uuidv4(),
            id,
            req.user.id,
            signer_name.trim(),
            signer_title ? signer_title.trim() : 'Authorized Signatory',
            signature_data || `Digitally Signed by ${signer_name}`,
            signature_type || 'DRAWN',
            totalDelivered,
            totalAccepted,
            totalRejected,
            acceptance_notes || null,
            req.ip,
            req.headers['user-agent'] || null
        );

        // Update DR Status to ACCEPTED
        db.prepare(`
            UPDATE delivery_receipts
            SET status = 'ACCEPTED', updated_at = datetime('now')
            WHERE id = ?
        `).run(id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'ACCEPT_DR',
            entityType: 'DELIVERY_RECEIPT',
            entityId: dr.dr_number,
            details: {
                drId: id,
                drNumber: dr.dr_number,
                totalDelivered,
                totalAccepted,
                totalRejected,
                signerName: signer_name
            },
            ipAddress: req.ip
        });

        return { totalDelivered, totalAccepted, totalRejected };
    });

    try {
        const result = acceptTx();
        const updated = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(id);
        return res.json({
            success: true,
            message: `Delivery Receipt accepted successfully (${result.totalAccepted} pcs accepted). Ready for invoicing.`,
            data: updated
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;

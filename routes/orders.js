const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles, enforceClientIsolation } = require('../middleware/auth');
const { getNextDocumentNumber } = require('../services/documentNumberService');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/orders
 * Supports filtering by client, status, search
 */
router.get('/', authenticateToken, enforceClientIsolation, (req, res) => {
    const { status, clientId, search } = req.query;

    let query = `
        SELECT po.*, c.company_name, c.contact_person, c.email as client_email,
               (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as items_count,
               (SELECT SUM(target_quantity) FROM purchase_order_items WHERE po_id = po.id) as total_target_quantity,
               (SELECT COUNT(*) FROM job_orders WHERE po_id = po.id) as jo_count,
               (SELECT COUNT(*) FROM delivery_receipts WHERE po_id = po.id) as dr_count,
               (SELECT COUNT(*) FROM sales_invoices WHERE po_id = po.id) as invoice_count
        FROM purchase_orders po
        JOIN clients c ON po.client_id = c.id
        WHERE 1=1
    `;
    const params = [];

    // Client isolation check
    if (req.user.role === 'CLIENT') {
        query += ' AND po.client_id = ?';
        params.push(req.clientId);
    } else if (clientId) {
        query += ' AND po.client_id = ?';
        params.push(clientId);
    }

    if (status) {
        query += ' AND po.status = ?';
        params.push(status);
    }

    if (search) {
        query += ' AND (po.po_number LIKE ? OR c.company_name LIKE ? OR po.notes LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    query += ' ORDER BY po.created_at DESC';
    const orders = db.prepare(query).all(...params);

    return res.json({ success: true, data: orders });
});

/**
 * GET /api/orders/:id
 * Retrieve PO details, line items, linked Job Orders, DRs, and Invoices
 */
router.get('/:id', authenticateToken, enforceClientIsolation, (req, res) => {
    const { id } = req.params;

    const po = db.prepare(`
        SELECT po.*, c.company_name, c.contact_person, c.email as client_email, c.phone as client_phone, c.address as client_address,
               u.name as creator_name
        FROM purchase_orders po
        JOIN clients c ON po.client_id = c.id
        LEFT JOIN users u ON po.created_by = u.id
        WHERE po.id = ?
    `).get(id);

    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (req.user.role === 'CLIENT' && po.client_id !== req.clientId) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    // Line items
    const items = db.prepare(`
        SELECT poi.*, p.name as product_name, p.sku, p.unit, p.category,
               (SELECT SUM(di.delivered_quantity) 
                FROM delivery_items di 
                JOIN delivery_receipts d ON di.dr_id = d.id 
                WHERE d.po_id = poi.po_id AND di.product_id = poi.product_id) as actual_delivered_total,
               (SELECT SUM(di.accepted_quantity) 
                FROM delivery_items di 
                JOIN delivery_receipts d ON di.dr_id = d.id 
                WHERE d.po_id = poi.po_id AND di.product_id = poi.product_id AND d.status IN ('ACCEPTED', 'INVOICED')) as actual_accepted_total
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        WHERE poi.po_id = ?
    `).all(id);

    // Job Orders
    const jobOrders = db.prepare(`
        SELECT jo.*, p.name as product_name, p.sku,
               (SELECT actual_yield FROM production_batches WHERE jo_id = jo.id ORDER BY created_at DESC LIMIT 1) as latest_yield
        FROM job_orders jo
        JOIN products p ON jo.product_id = p.id
        WHERE jo.po_id = ?
        ORDER BY jo.created_at ASC
    `).all(id);

    // Delivery Receipts
    const deliveries = db.prepare(`
        SELECT dr.*,
               (SELECT SUM(delivered_quantity) FROM delivery_items WHERE dr_id = dr.id) as total_delivered,
               (SELECT SUM(accepted_quantity) FROM delivery_items WHERE dr_id = dr.id) as total_accepted
        FROM delivery_receipts dr
        WHERE dr.po_id = ?
        ORDER BY dr.created_at ASC
    `).all(id);

    // Invoices
    const invoices = db.prepare(`
        SELECT * FROM sales_invoices WHERE po_id = ? ORDER BY created_at ASC
    `).all(id);

    return res.json({
        success: true,
        data: {
            ...po,
            items,
            jobOrders,
            deliveries,
            invoices
        }
    });
});

/**
 * POST /api/orders
 * Create a new Purchase Order
 */
router.post('/', authenticateToken, enforceClientIsolation, (req, res) => {
    let { client_id, expected_delivery_date, tolerance_percent, billing_policy, notes, items, tax_percent } = req.body;

    if (req.user.role === 'CLIENT') {
        client_id = req.clientId;
    }

    if (!client_id) {
        return res.status(400).json({ success: false, error: 'Client ID is required.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one order item is required.' });
    }

    // Get client details for default tolerance and billing policy if not provided
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
    if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    const tolerance = tolerance_percent !== undefined ? parseFloat(tolerance_percent) : (client.default_tolerance_percent || 10.0);
    const policy = billing_policy || client.default_billing_policy || 'ACTUAL_DELIVERY';
    const taxRate = tax_percent !== undefined ? parseFloat(tax_percent) : 0.0;

    const createOrderTx = db.transaction(() => {
        const poId = uuidv4();
        const poNumber = getNextDocumentNumber('PO');

        let subtotal = 0.0;
        const processedItems = [];

        for (const item of items) {
            const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
            if (!product) {
                throw new Error(`Invalid product ID: ${item.product_id}`);
            }

            const targetQty = parseInt(item.target_quantity);
            if (isNaN(targetQty) || targetQty <= 0) {
                throw new Error('Target quantity must be greater than 0.');
            }

            // Resolve client-specific assignment and price
            const assignment = db.prepare('SELECT custom_price, custom_name, is_active FROM client_product_prices WHERE client_id = ? AND product_id = ?').get(client_id, item.product_id);
            
            if (req.user.role === 'CLIENT' && (!assignment || assignment.is_active !== 1)) {
                throw new Error(`Product "${product.name}" (${product.sku}) is not assigned to your client account.`);
            }

            const expectedClientPrice = (assignment && assignment.custom_price !== null && assignment.custom_price !== undefined) ? assignment.custom_price : product.default_price;

            let unitPrice;
            if (req.user.role === 'CLIENT') {
                unitPrice = expectedClientPrice;
            } else {
                unitPrice = item.unit_price !== undefined && item.unit_price !== null ? parseFloat(item.unit_price) : expectedClientPrice;
            }

            const lineSubtotal = targetQty * unitPrice;
            subtotal += lineSubtotal;

            // Compute agreed tolerance bounds
            const minQty = Math.floor(targetQty * (1 - tolerance / 100));
            const maxQty = Math.ceil(targetQty * (1 + tolerance / 100));

            processedItems.push({
                id: uuidv4(),
                poId,
                productId: product.id,
                targetQuantity: targetQty,
                minAllowedQuantity: minQty,
                maxAllowedQuantity: maxQty,
                unitPrice,
                subtotal: lineSubtotal
            });
        }

        const taxAmount = (subtotal * taxRate) / 100;
        const grandTotal = subtotal + taxAmount;

        // Auto-approve if created by Admin/SuperAdmin, otherwise PENDING_APPROVAL
        const initialStatus = (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') ? 'APPROVED' : 'PENDING_APPROVAL';

        db.prepare(`
            INSERT INTO purchase_orders
            (id, po_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at)
            VALUES (?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            poId,
            poNumber,
            client_id,
            expected_delivery_date || null,
            tolerance,
            policy,
            initialStatus,
            notes || null,
            subtotal,
            taxRate,
            taxAmount,
            grandTotal,
            req.user.id,
            initialStatus === 'APPROVED' ? req.user.id : null,
            initialStatus === 'APPROVED' ? new Date().toISOString() : null
        );

        const insertItemStmt = db.prepare(`
            INSERT INTO purchase_order_items
            (id, po_id, product_id, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const it of processedItems) {
            insertItemStmt.run(
                it.id,
                it.poId,
                it.productId,
                it.targetQuantity,
                it.minAllowedQuantity,
                it.maxAllowedQuantity,
                it.unitPrice,
                it.subtotal
            );
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_PO',
            entityType: 'PURCHASE_ORDER',
            entityId: poNumber,
            details: {
                poId,
                poNumber,
                clientId: client_id,
                grandTotal,
                tolerance,
                policy
            }
        });

        return { poId, poNumber, grandTotal, status: initialStatus };
    });

    try {
        const result = createOrderTx();
        const createdPO = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(result.poId);
        const orderItems = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(result.poId);
        const totalTargetQty = orderItems.reduce((acc, it) => acc + (it.target_quantity || 0), 0);
        return res.status(201).json({ success: true, data: { ...createdPO, items: orderItems, total_target_quantity: totalTargetQty } });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/orders/:id/approve
 * Admin approves pending PO
 */
router.post('/:id/approve', authenticateToken, requireRoles('ADMIN'), (req, res) => {
    const { id } = req.params;

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (po.status !== 'PENDING_APPROVAL' && po.status !== 'DRAFT') {
        return res.status(400).json({ success: false, error: `Cannot approve order with status "${po.status}".` });
    }

    db.prepare(`
        UPDATE purchase_orders
        SET status = 'APPROVED', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
    `).run(req.user.id, id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'APPROVE_PO',
        entityType: 'PURCHASE_ORDER',
        entityId: po.po_number,
        details: { poId: id, approvedBy: req.user.name }
    });

    const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    return res.json({ success: true, message: 'Purchase Order approved successfully.', data: updated });
});

module.exports = router;

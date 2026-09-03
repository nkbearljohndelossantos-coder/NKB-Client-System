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
 * GET /api/orders/backtrack/:term
 * Universal 360-Degree Backtracking & Lineage Trace
 * Finds complete workflow lineage from ANY document number or ID: PO, JO, Batch, DR, Invoice, Payment!
 */
router.get('/backtrack/:term', authenticateToken, enforceClientIsolation, (req, res) => {
    const rawTerm = req.params.term.trim();
    
    // Resolve PO ID from any given document number or ID
    let poId = null;

    // 1. Direct PO check (id or po_number)
    const poMatch = db.prepare('SELECT id FROM purchase_orders WHERE id = ? OR po_number LIKE ?').get(rawTerm, rawTerm);
    if (poMatch) poId = poMatch.id;

    // 2. JO check (id or jo_number)
    if (!poId) {
        const joMatch = db.prepare('SELECT po_id FROM job_orders WHERE id = ? OR jo_number LIKE ?').get(rawTerm, rawTerm);
        if (joMatch) poId = joMatch.po_id;
    }

    // 3. Batch check (id or batch_number)
    if (!poId) {
        const batchMatch = db.prepare(`
            SELECT jo.po_id 
            FROM production_batches pb 
            JOIN job_orders jo ON pb.jo_id = jo.id 
            WHERE pb.id = ? OR pb.batch_number LIKE ?
        `).get(rawTerm, rawTerm);
        if (batchMatch) poId = batchMatch.po_id;
    }

    // 4. DR check (id or dr_number)
    if (!poId) {
        const drMatch = db.prepare('SELECT po_id FROM delivery_receipts WHERE id = ? OR dr_number LIKE ?').get(rawTerm, rawTerm);
        if (drMatch) poId = drMatch.po_id;
    }

    // 5. Invoice check (id or invoice_number)
    if (!poId) {
        const invMatch = db.prepare('SELECT po_id FROM sales_invoices WHERE id = ? OR invoice_number LIKE ?').get(rawTerm, rawTerm);
        if (invMatch) poId = invMatch.po_id;
    }

    // 6. Payment check (id, payment_number, reference_number)
    if (!poId) {
        const payMatch = db.prepare(`
            SELECT si.po_id 
            FROM payments p 
            JOIN sales_invoices si ON p.invoice_id = si.id 
            WHERE p.id = ? OR p.payment_number LIKE ? OR p.reference_number LIKE ?
        `).get(rawTerm, rawTerm, rawTerm);
        if (payMatch) poId = payMatch.po_id;
    }

    if (!poId) {
        return res.status(404).json({
            success: false,
            error: 'NOT_FOUND',
            message: `No record found matching "${rawTerm}". Please check PO, JO, Batch, DR, or Invoice number.`
        });
    }

    // Fetch Full PO Details
    const po = db.prepare(`
        SELECT po.*, c.company_name, c.contact_person, c.email as client_email, c.phone as client_phone, c.address as client_address,
               u.name as creator_name
        FROM purchase_orders po
        JOIN clients c ON po.client_id = c.id
        LEFT JOIN users u ON po.created_by = u.id
        WHERE po.id = ?
    `).get(poId);

    if (req.user.role === 'CLIENT' && po.client_id !== req.clientId) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied.' });
    }

    // Items
    const items = db.prepare(`
        SELECT poi.*, p.name as product_name, p.sku, p.unit, p.formula_code,
               (SELECT COALESCE(SUM(di.delivered_quantity), 0) FROM delivery_items di JOIN delivery_receipts dr ON di.dr_id = dr.id WHERE dr.po_id = poi.po_id AND di.product_id = poi.product_id) as total_delivered_qty
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        WHERE poi.po_id = ?
    `).all(poId);

    // Job Orders
    const jobOrders = db.prepare(`
        SELECT jo.*, p.name as product_name, p.sku,
               (SELECT COUNT(*) FROM production_batches WHERE jo_id = jo.id) as batch_count,
               (SELECT COALESCE(SUM(actual_yield), 0) FROM production_batches WHERE jo_id = jo.id) as total_yield
        FROM job_orders jo
        JOIN products p ON jo.product_id = p.id
        WHERE jo.po_id = ?
        ORDER BY jo.created_at ASC
    `).all(poId);

    // Production Batches
    const batches = db.prepare(`
        SELECT pb.*, jo.jo_number, p.name as product_name, p.sku, u.name as logged_by_name
        FROM production_batches pb
        JOIN job_orders jo ON pb.jo_id = jo.id
        JOIN products p ON pb.product_id = p.id
        LEFT JOIN users u ON pb.created_by = u.id
        WHERE jo.po_id = ?
        ORDER BY pb.created_at ASC
    `).all(poId);

    // Delivery Receipts + Signatures
    const deliveries = db.prepare(`
        SELECT dr.*,
               (SELECT COUNT(*) FROM delivery_items WHERE dr_id = dr.id) as items_count,
               (SELECT COALESCE(SUM(delivered_quantity), 0) FROM delivery_items WHERE dr_id = dr.id) as total_delivered_qty,
               (SELECT COALESCE(SUM(accepted_quantity), 0) FROM delivery_items WHERE dr_id = dr.id) as total_accepted_qty,
               da.signer_name, da.signer_title, da.signature_data, da.accepted_at as client_signed_at,
               u.name as dispatched_by_name
        FROM delivery_receipts dr
        LEFT JOIN dr_acceptances da ON da.dr_id = dr.id
        LEFT JOIN users u ON dr.dispatched_by = u.id
        WHERE dr.po_id = ?
        ORDER BY dr.created_at ASC
    `).all(poId);

    // Delivery Items detailed list
    const deliveryItems = db.prepare(`
        SELECT di.*, dr.dr_number, p.name as product_name, p.sku, pb.batch_number, pb.expiry_date
        FROM delivery_items di
        JOIN delivery_receipts dr ON di.dr_id = dr.id
        JOIN products p ON di.product_id = p.id
        LEFT JOIN production_batches pb ON di.batch_id = pb.id
        WHERE dr.po_id = ?
        ORDER BY dr.created_at ASC
    `).all(poId);

    // Sales Invoices
    const invoices = db.prepare(`
        SELECT si.*, dr.dr_number, u.name as creator_name
        FROM sales_invoices si
        LEFT JOIN delivery_receipts dr ON si.dr_id = dr.id
        LEFT JOIN users u ON si.created_by = u.id
        WHERE si.po_id = ?
        ORDER BY si.created_at ASC
    `).all(poId);

    // Payments
    const payments = db.prepare(`
        SELECT pay.*, si.invoice_number, u.name as recorded_by_name
        FROM payments pay
        JOIN sales_invoices si ON pay.invoice_id = si.id
        LEFT JOIN users u ON pay.recorded_by = u.id
        WHERE si.po_id = ?
        ORDER BY pay.payment_date ASC
    `).all(poId);

    // Audit Logs
    const auditLogs = db.prepare(`
        SELECT * FROM audit_logs 
        WHERE entity_id IN (?, ?, ?) 
           OR details LIKE ? 
           OR details LIKE ?
        ORDER BY timestamp DESC LIMIT 50
    `).all(poId, po.po_number, rawTerm, `%${po.po_number}%`, `%${rawTerm}%`);

    return res.json({
        success: true,
        data: {
            searchedTerm: rawTerm,
            po,
            items,
            jobOrders,
            batches,
            deliveries,
            deliveryItems,
            invoices,
            payments,
            auditLogs
        }
    });
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

/**
 * PUT /api/orders/:id
 * Edit/Update an existing Purchase Order
 */
router.put('/:id', authenticateToken, enforceClientIsolation, (req, res) => {
    const { id } = req.params;
    let { client_id, expected_delivery_date, tolerance_percent, billing_policy, notes, items, tax_percent } = req.body;

    const existingPO = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!existingPO) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (req.user.role === 'CLIENT' && existingPO.client_id !== req.clientId) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    if (existingPO.status === 'DELIVERED' || existingPO.status === 'CLOSED' || existingPO.status === 'CANCELLED') {
        return res.status(400).json({ success: false, error: `Cannot edit Purchase Order with status "${existingPO.status}".` });
    }

    if (req.user.role === 'CLIENT') {
        client_id = req.clientId;
    } else if (!client_id) {
        client_id = existingPO.client_id;
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one order item is required.' });
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
    if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    const tolerance = tolerance_percent !== undefined ? parseFloat(tolerance_percent) : existingPO.tolerance_percent;
    const policy = billing_policy || existingPO.billing_policy;
    const taxRate = tax_percent !== undefined ? parseFloat(tax_percent) : existingPO.tax_percent;

    const updateOrderTx = db.transaction(() => {
        let subtotal = 0.0;
        const processedItems = [];

        for (const item of items) {
            const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
            if (!product) {
                throw new Error(`Invalid product ID: ${item.product_id}`);
            }

            const targetQty = parseInt(item.target_quantity);
            if (isNaN(targetQty) || targetQty <= 0) {
                throw new Error(`Target quantity for "${product.name}" must be greater than 0.`);
            }

            const assignment = db.prepare('SELECT custom_price, custom_name, is_active FROM client_product_prices WHERE client_id = ? AND product_id = ?').get(client_id, item.product_id);
            const expectedClientPrice = (assignment && assignment.custom_price !== null && assignment.custom_price !== undefined) ? assignment.custom_price : product.default_price;

            let unitPrice;
            if (req.user.role === 'CLIENT') {
                unitPrice = expectedClientPrice;
            } else {
                unitPrice = item.unit_price !== undefined && item.unit_price !== null ? parseFloat(item.unit_price) : expectedClientPrice;
            }

            const lineSubtotal = targetQty * unitPrice;
            subtotal += lineSubtotal;

            const minQty = Math.floor(targetQty * (1 - tolerance / 100));
            const maxQty = Math.ceil(targetQty * (1 + tolerance / 100));

            processedItems.push({
                id: item.id || uuidv4(),
                poId: id,
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

        // Update purchase_orders record
        db.prepare(`
            UPDATE purchase_orders
            SET client_id = ?,
                expected_delivery_date = ?,
                tolerance_percent = ?,
                billing_policy = ?,
                notes = ?,
                subtotal = ?,
                tax_percent = ?,
                tax_amount = ?,
                grand_total = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `).run(
            client_id,
            expected_delivery_date || existingPO.expected_delivery_date,
            tolerance,
            policy,
            notes !== undefined ? notes : existingPO.notes,
            subtotal,
            taxRate,
            taxAmount,
            grandTotal,
            id
        );

        // Delete old items and insert updated items
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(id);

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
            action: 'UPDATE_PO',
            entityType: 'PURCHASE_ORDER',
            entityId: existingPO.po_number,
            details: {
                poId: id,
                poNumber: existingPO.po_number,
                clientId: client_id,
                grandTotal,
                itemCount: processedItems.length
            }
        });

        return { id, poNumber: existingPO.po_number, grandTotal };
    });

    try {
        const result = updateOrderTx();
        const updatedPO = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(result.id);
        const orderItems = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(result.id);
        return res.json({ success: true, message: `Purchase Order ${result.poNumber} updated successfully!`, data: { ...updatedPO, items: orderItems } });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;

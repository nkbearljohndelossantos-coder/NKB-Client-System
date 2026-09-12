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

    // Attach ordered products separately to each PO
    for (const po of orders) {
        po.items = db.prepare(`
            SELECT poi.*, p.name as product_name, p.sku, p.unit, p.category, p.formula_code, p.shelf_life_months,
                   (SELECT jo.jo_number FROM job_orders jo WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY jo.created_at DESC LIMIT 1) as jo_number,
                   (SELECT jo.status FROM job_orders jo WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY jo.created_at DESC LIMIT 1) as jo_status
            FROM purchase_order_items poi
            JOIN products p ON poi.product_id = p.id
            WHERE poi.po_id = ?
            ORDER BY poi.created_at ASC
        `).all(po.id);
    }

    return res.json({ success: true, data: orders });
});

/**
 * GET /api/orders/:id
 * Retrieve PO details, line items, linked Job Orders, DRs, and Invoices
 */
router.get('/:id', authenticateToken, enforceClientIsolation, (req, res) => {
    const { id } = req.params;

    const po = db.prepare(`
        SELECT po.*, c.company_name, c.contact_person, c.email as client_email, c.phone as client_phone, c.address as client_address, c.tin as client_tin,
               u.name as creator_name,
               u2.name as approver_name
        FROM purchase_orders po
        JOIN clients c ON po.client_id = c.id
        LEFT JOIN users u ON po.created_by = u.id
        LEFT JOIN users u2 ON po.approved_by = u2.id
        WHERE po.id = ?
    `).get(id);

    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (req.user.role === 'CLIENT' && po.client_id !== req.clientId) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    // Line items with detailed product specifications and manufacturing lineage
    const items = db.prepare(`
        SELECT poi.*, 
               COALESCE(cpp.custom_name, p.name) as product_name, 
               COALESCE(cpp.custom_sku, p.sku) as sku, 
               p.unit, 
               p.category, 
               COALESCE(cpp.custom_formula_code, p.formula_code) as formula_code, 
               p.shelf_life_months,
               (SELECT SUM(di.delivered_quantity) 
                FROM delivery_items di 
                JOIN delivery_receipts d ON di.dr_id = d.id 
                WHERE d.po_id = poi.po_id AND di.product_id = poi.product_id) as actual_delivered_total,
               (SELECT SUM(di.accepted_quantity) 
                FROM delivery_items di 
                JOIN delivery_receipts d ON di.dr_id = d.id 
                WHERE d.po_id = poi.po_id AND di.product_id = poi.product_id AND d.status IN ('ACCEPTED', 'INVOICED')) as actual_accepted_total,
               (SELECT jo.jo_number FROM job_orders jo WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY jo.created_at DESC LIMIT 1) as jo_number,
               (SELECT jo.status FROM job_orders jo WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY jo.created_at DESC LIMIT 1) as jo_status,
               (SELECT jo.assigned_team FROM job_orders jo WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY jo.created_at DESC LIMIT 1) as assigned_team,
               (SELECT pb.batch_number FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as batch_number,
               (SELECT pb.status FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as batch_status,
               (SELECT pb.actual_yield FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as actual_yield,
               (SELECT pb.variance_percent FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as variance_percent,
               (SELECT pb.compounding_operator FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as compounding_operator,
               (SELECT pb.bottling_lead FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as bottling_lead,
               (SELECT pb.qc_inspector FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as qc_inspector,
               (SELECT pb.line_assignment FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as line_assignment,
               (SELECT pb.qc_notes FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as qc_notes
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ?
        WHERE poi.po_id = ?
    `).all(po.client_id, id);

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

    const tolerance = (tolerance_percent !== undefined && tolerance_percent !== null && !isNaN(parseFloat(tolerance_percent))) 
        ? parseFloat(tolerance_percent) 
        : ((client && client.default_tolerance_percent) ? client.default_tolerance_percent : 10.0);
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

            // In PO, the unit price is strictly fixed to the contracted rate
            const unitPrice = Math.round((Number(expectedClientPrice) || 0) * 100) / 100;

            const lineSubtotal = Math.round(targetQty * unitPrice * 100) / 100;
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

        const taxAmount = Math.round(((subtotal * taxRate) / 100) * 100) / 100;
        const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;

        // Auto-approve if created by Admin/SuperAdmin, otherwise PENDING_APPROVAL
        const initialStatus = (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') ? 'APPROVED' : 'PENDING_APPROVAL';
        const soNumber = poNumber.replace('PO-', 'SO-');

        db.prepare(`
            INSERT INTO purchase_orders
            (id, po_number, so_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at)
            VALUES (?, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            poId,
            poNumber,
            soNumber,
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
 * PUT /api/orders/:id
 * Edit Purchase Order before entering Job Order (JO)
 */
router.put('/:id', authenticateToken, enforceClientIsolation, (req, res) => {
    const { id } = req.params;
    let { po_date, expected_delivery_date, tolerance_percent, billing_policy, notes, items, tax_percent } = req.body;

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (req.user.role === 'CLIENT') {
        if (po.client_id !== req.clientId) {
            return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
        }
        if (po.status !== 'PENDING_APPROVAL' && po.status !== 'DRAFT') {
            return res.status(400).json({ success: false, error: 'Clients can only edit pending orders.' });
        }
    }

    // Crucial rule: Check if a Job Order (JO) has already been created for this PO
    const joCheck = db.prepare('SELECT COUNT(*) as count FROM job_orders WHERE po_id = ?').get(id);
    if (joCheck && joCheck.count > 0) {
        return res.status(400).json({
            success: false,
            error: 'Cannot edit Purchase Order: A Job Order (JO) has already been created for this order.'
        });
    }

    if (po.status === 'IN_PRODUCTION' || po.status === 'COMPLETED' || po.status === 'CANCELLED') {
        return res.status(400).json({
            success: false,
            error: `Cannot edit Purchase Order with status "${po.status}".`
        });
    }

    const tolerance = (tolerance_percent !== undefined && tolerance_percent !== null && !isNaN(parseFloat(tolerance_percent)))
        ? parseFloat(tolerance_percent)
        : (po.tolerance_percent !== null ? po.tolerance_percent : 10.0);
    const policy = billing_policy || po.billing_policy || 'ACTUAL_DELIVERY';
    const taxRate = (tax_percent !== undefined && tax_percent !== null && !isNaN(parseFloat(tax_percent)))
        ? parseFloat(tax_percent)
        : (po.tax_percent !== null ? po.tax_percent : 0.0);

    const updateOrderTx = db.transaction(() => {
        let subtotal = 0.0;
        const processedItems = [];

        if (items && Array.isArray(items) && items.length > 0) {
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
                const assignment = db.prepare('SELECT custom_price, custom_name, is_active FROM client_product_prices WHERE client_id = ? AND product_id = ?').get(po.client_id, item.product_id);
                if (req.user.role === 'CLIENT' && (!assignment || assignment.is_active !== 1)) {
                    throw new Error(`Product "${product.name}" (${product.sku}) is not assigned to your client account.`);
                }

                const expectedClientPrice = (assignment && assignment.custom_price !== null && assignment.custom_price !== undefined) ? assignment.custom_price : product.default_price;
                const unitPrice = Math.round((Number(expectedClientPrice) || 0) * 100) / 100;
                const lineSubtotal = Math.round(targetQty * unitPrice * 100) / 100;
                subtotal += lineSubtotal;

                const minQty = Math.floor(targetQty * (1 - tolerance / 100));
                const maxQty = Math.ceil(targetQty * (1 + tolerance / 100));

                processedItems.push({
                    id: uuidv4(),
                    poId: id,
                    productId: product.id,
                    targetQuantity: targetQty,
                    minAllowedQuantity: minQty,
                    maxAllowedQuantity: maxQty,
                    unitPrice,
                    subtotal: lineSubtotal
                });
            }
        } else {
            // Keep existing items if items not supplied
            const existingItems = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(id);
            for (const it of existingItems) {
                subtotal += it.subtotal;
                processedItems.push(it);
            }
        }

        const taxAmount = Math.round(((subtotal * taxRate) / 100) * 100) / 100;
        const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;

        // If items were updated, delete old items and insert processed items
        if (items && Array.isArray(items) && items.length > 0) {
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
        }

        db.prepare(`
            UPDATE purchase_orders
            SET po_date = ?,
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
            po_date !== undefined && po_date ? po_date : po.po_date,
            expected_delivery_date !== undefined ? (expected_delivery_date || null) : po.expected_delivery_date,
            tolerance,
            policy,
            notes !== undefined ? (notes || null) : po.notes,
            subtotal,
            taxRate,
            taxAmount,
            grandTotal,
            id
        );

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE_PO',
            entityType: 'PURCHASE_ORDER',
            entityId: po.po_number,
            details: {
                poId: id,
                poNumber: po.po_number,
                clientId: po.client_id,
                grandTotal,
                tolerance,
                policy,
                itemCount: processedItems.length
            }
        });

        return { poId: id, poNumber: po.po_number, grandTotal };
    });

    try {
        const result = updateOrderTx();
        const updatedPO = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
        const orderItems = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(id);
        const totalTargetQty = orderItems.reduce((acc, it) => acc + (it.target_quantity || 0), 0);
        return res.json({
            success: true,
            message: `Purchase Order ${po.po_number} updated successfully.`,
            data: { ...updatedPO, items: orderItems, total_target_quantity: totalTargetQty }
        });
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

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles, enforceClientIsolation } = require('../middleware/auth');
const { canViewOrderPrices } = require('../middleware/rbac');
const { getNextDocumentNumber } = require('../services/documentNumberService');
const { logAudit } = require('../services/auditService');

const KNOWN_PO_BRANDS = [
    'HER CHOICE PH', 'HER CHOICE', 'BELLA SKIN', 'K BELLA SKIN', 'SKEENCARE',
    'NATASHA', 'HANAPAM', 'GELIS PHARMA', 'JGLOWW', 'BRIGHTEST SKIN',
    'BRIGHTEST', 'ROYCE B', 'ELIXIA', 'ADORN', 'CUTIS ANO NE',
    'TARATITAT', 'MAGNIFIQUE WHITE', 'DREAM GIRL', 'SABELA SKIN', 'KKSKIN.PH',
    'KYLE SKIN', 'RG LOVE', 'CZAR', 'MI.SKIN', 'EIGHT',
    'BEAUTAIN', 'BIOESSENCE', 'INTIMATE WHITE', 'JLS NO BRAND'
].sort((a, b) => b.length - a.length);

function cleanItemNameForVyuceutical(rawName) {
    if (!rawName) return null;
    let cleaned = rawName.trim();
    cleaned = cleaned.replace(/^SUS\s*[-:–—]?\s*/i, '');
    for (const b of KNOWN_PO_BRANDS) {
        const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleaned = cleaned.replace(new RegExp('^' + esc + '\\s*[-:–—]?\\s*', 'i'), '');
        cleaned = cleaned.replace(new RegExp('\\(' + esc + '\\s*[-:–—]?\\s*', 'gi'), '(');
        cleaned = cleaned.replace(/^SUS\s*[-:–—]?\s*/i, '');
    }
    return cleaned.trim() || rawName;
}

/**
 * GET /api/orders
 * Supports filtering by client, status, search
 */
router.get('/', authenticateToken, enforceClientIsolation, (req, res) => {
    const { status, clientId, search } = req.query;

    let query = `
        SELECT po.*, c.company_name, c.contact_person, c.email as client_email, c.is_vyuceutical_ops,
               (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as items_count,
               (SELECT SUM(target_quantity) FROM purchase_order_items WHERE po_id = po.id) as total_target_quantity,
               (SELECT COUNT(*) FROM job_orders WHERE po_id = po.id) as jo_count,
               (SELECT COUNT(*) FROM delivery_receipts WHERE po_id = po.id) as dr_count,
               (SELECT COUNT(*) FROM sales_invoices WHERE po_id = po.id) as invoice_count,
               (SELECT COUNT(*) FROM supply_requests WHERE po_id = po.id) as supply_requests_count,
               (SELECT name FROM users WHERE id = po.accounting_confirmed_by) as accounting_confirmed_by_name,
               (SELECT name FROM users WHERE id = po.inventory_confirmed_by) as inventory_confirmed_by_name
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
            SELECT poi.*, COALESCE(poi.item_name, p.name) as product_name, p.sku, p.unit, p.category, p.formula_code, p.shelf_life_months,
                   (SELECT jo.id FROM job_orders jo WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY jo.created_at DESC LIMIT 1) as jo_id,
                   (SELECT jo.jo_number FROM job_orders jo WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY jo.created_at DESC LIMIT 1) as jo_number,
                   (SELECT jo.status FROM job_orders jo WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY jo.created_at DESC LIMIT 1) as jo_status,
                   (SELECT pb.id FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as batch_id,
                   (SELECT pb.batch_number FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as batch_number,
                   (SELECT pb.status FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as batch_status,
                   (SELECT pb.actual_yield FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as actual_yield,
                   (SELECT dr.dr_number FROM delivery_items di JOIN delivery_receipts dr ON di.dr_id = dr.id WHERE di.batch_id = (SELECT pb2.id FROM production_batches pb2 JOIN job_orders jo2 ON pb2.jo_id = jo2.id WHERE jo2.po_id = poi.po_id AND jo2.product_id = poi.product_id ORDER BY pb2.created_at DESC LIMIT 1) LIMIT 1) as dr_number,
                   (SELECT dr.status FROM delivery_items di JOIN delivery_receipts dr ON di.dr_id = dr.id WHERE di.batch_id = (SELECT pb2.id FROM production_batches pb2 JOIN job_orders jo2 ON pb2.jo_id = jo2.id WHERE jo2.po_id = poi.po_id AND jo2.product_id = poi.product_id ORDER BY pb2.created_at DESC LIMIT 1) LIMIT 1) as dr_status
            FROM purchase_order_items poi
            JOIN products p ON poi.product_id = p.id
            WHERE poi.po_id = ?
            ORDER BY poi.created_at ASC
        `).all(po.id);
    }

    const canSeePrices = canViewOrderPrices(req.user.role);
    if (!canSeePrices) {
        for (const po of orders) {
            po.subtotal = null;
            po.tax_percent = null;
            po.tax_amount = null;
            po.grand_total = null;
            if (po.items && Array.isArray(po.items)) {
                for (const it of po.items) {
                    it.unit_price = null;
                    it.subtotal = null;
                }
            }
        }
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
        SELECT po.*, c.company_name, c.contact_person, c.email as client_email, c.phone as client_phone, c.address as client_address, c.tin as client_tin, c.is_vyuceutical_ops,
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
               COALESCE(poi.item_name, cpp.custom_name, p.name) as product_name, 
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
               (SELECT pb.qc_notes FROM production_batches pb JOIN job_orders jo ON pb.jo_id = jo.id WHERE jo.po_id = poi.po_id AND pb.product_id = poi.product_id ORDER BY pb.created_at DESC LIMIT 1) as qc_notes,
               (SELECT dr.dr_number FROM delivery_items di JOIN delivery_receipts dr ON di.dr_id = dr.id WHERE dr.po_id = poi.po_id AND di.product_id = poi.product_id ORDER BY dr.created_at DESC LIMIT 1) as dr_number,
               (SELECT dr.status FROM delivery_items di JOIN delivery_receipts dr ON di.dr_id = dr.id WHERE dr.po_id = poi.po_id AND di.product_id = poi.product_id ORDER BY dr.created_at DESC LIMIT 1) as dr_status
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ?
        WHERE poi.po_id = ?
    `).all(po.client_id, id);

    // Job Orders
    const jobOrders = db.prepare(`
        SELECT jo.*, 
               COALESCE((SELECT poi.item_name FROM purchase_order_items poi WHERE poi.po_id = jo.po_id AND poi.product_id = jo.product_id LIMIT 1), p.name) as product_name, 
               p.sku,
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

    const canSeePrices = canViewOrderPrices(req.user.role);
    if (!canSeePrices) {
        po.subtotal = null;
        po.tax_percent = null;
        po.tax_amount = null;
        po.grand_total = null;
        if (items && Array.isArray(items)) {
            for (const it of items) {
                it.unit_price = null;
                it.subtotal = null;
            }
        }
    }

    return res.json({
        success: true,
        data: {
            ...po,
            items,
            jobOrders,
            deliveries,
            invoices: canSeePrices ? invoices : []
        }
    });
});

/**
 * POST /api/orders
 * Create a new Purchase Order
 */
router.post('/', authenticateToken, enforceClientIsolation, (req, res) => {
    let { client_id, expected_delivery_date, tolerance_percent, billing_policy, notes, form_of_payment, items, tax_percent } = req.body;

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
            const hasAssigned = db.prepare('SELECT COUNT(*) as cnt FROM client_product_prices WHERE client_id = ? AND is_active = 1').get(client_id)?.cnt > 0;
            
            if (hasAssigned && req.user.role === 'CLIENT' && (!assignment || assignment.is_active !== 1)) {
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

            const isVyuceutical = client && (client.is_vyuceutical_ops === 1 || (client.company_name && client.company_name.toLowerCase().includes('vyuceutical')));
            let rawItemName = item.item_name ? item.item_name.trim() : (isVyuceutical ? product.name : null);
            let finalItemName = isVyuceutical ? cleanItemNameForVyuceutical(rawItemName) : rawItemName;

            processedItems.push({
                id: uuidv4(),
                poId,
                productId: product.id,
                itemName: finalItemName,
                targetQuantity: targetQty,
                minAllowedQuantity: minQty,
                maxAllowedQuantity: maxQty,
                unitPrice,
                subtotal: lineSubtotal
            });
        }

        const taxAmount = Math.round(((subtotal * taxRate) / 100) * 100) / 100;
        const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;

        // Auto-approve if created by Admin/SuperAdmin/ITAdmin, otherwise PENDING_APPROVAL
        const initialStatus = (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN' || req.user.role === 'IT_ADMIN') ? 'APPROVED' : 'PENDING_APPROVAL';
        const soNumber = poNumber.replace('PO-', 'SO-');

        db.prepare(`
            INSERT INTO purchase_orders
            (id, po_number, so_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, form_of_payment, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at)
            VALUES (?, ?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            form_of_payment || 'COD / Bank Transfer',
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
            (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const it of processedItems) {
            insertItemStmt.run(
                it.id,
                it.poId,
                it.productId,
                it.itemName,
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
    let { po_date, expected_delivery_date, tolerance_percent, billing_policy, notes, form_of_payment, items, tax_percent } = req.body;

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
    } else {
        const allowedStaffRoles = ['ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'ACCOUNTING'];
        if (!allowedStaffRoles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Access denied. You do not have permission to update purchase orders.', code: 'FORBIDDEN' });
        }
    }

    if (po.status === 'COMPLETED' || po.status === 'CANCELLED' || po.status === 'VOIDED') {
        return res.status(400).json({
            success: false,
            error: `Cannot update Purchase Order with status "${po.status}".`
        });
    }

    // Check if order has already been delivered or dispatched on active Delivery Receipts
    const activeDrCheck = db.prepare("SELECT COUNT(*) as count FROM delivery_receipts WHERE po_id = ? AND status NOT IN ('CANCELLED')").get(id);
    if (activeDrCheck && activeDrCheck.count > 0) {
        return res.status(400).json({
            success: false,
            error: 'Cannot update Purchase Order: Delivery Receipts have already been generated or dispatched for this order.'
        });
    }

    const tolerance = (tolerance_percent !== undefined && tolerance_percent !== null && !isNaN(parseFloat(tolerance_percent)))
        ? parseFloat(tolerance_percent)
        : (po.tolerance_percent !== null ? po.tolerance_percent : 10.0);
    const policy = billing_policy || po.billing_policy || 'ACTUAL_DELIVERY';
    const taxRate = (tax_percent !== undefined && tax_percent !== null && !isNaN(parseFloat(tax_percent)))
        ? parseFloat(tax_percent)
        : (po.tax_percent !== null ? po.tax_percent : 0.0);

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(po.client_id);
    const isVyuceutical = client && (client.is_vyuceutical_ops === 1 || (client.company_name && client.company_name.toLowerCase().includes('vyuceutical')));

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
                const hasAssigned = db.prepare('SELECT COUNT(*) as cnt FROM client_product_prices WHERE client_id = ? AND is_active = 1').get(po.client_id)?.cnt > 0;
                if (hasAssigned && req.user.role === 'CLIENT' && (!assignment || assignment.is_active !== 1)) {
                    throw new Error(`Product "${product.name}" (${product.sku}) is not assigned to your client account.`);
                }

                const expectedClientPrice = (assignment && assignment.custom_price !== null && assignment.custom_price !== undefined) ? assignment.custom_price : product.default_price;
                const unitPrice = Math.round((Number(expectedClientPrice) || 0) * 100) / 100;
                const lineSubtotal = Math.round(targetQty * unitPrice * 100) / 100;
                subtotal += lineSubtotal;

                const minQty = Math.floor(targetQty * (1 - tolerance / 100));
                const maxQty = Math.ceil(targetQty * (1 + tolerance / 100));

                let rawItemName = item.item_name ? item.item_name.trim() : (isVyuceutical ? product.name : null);
                let finalItemName = isVyuceutical ? cleanItemNameForVyuceutical(rawItemName) : rawItemName;

                processedItems.push({
                    id: uuidv4(),
                    poId: id,
                    productId: product.id,
                    itemName: finalItemName,
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
                (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const it of processedItems) {
                insertItemStmt.run(
                    it.id,
                    it.poId,
                    it.productId,
                    it.itemName || it.item_name || null,
                    it.targetQuantity || it.target_quantity,
                    it.minAllowedQuantity || it.min_allowed_quantity,
                    it.maxAllowedQuantity || it.max_allowed_quantity,
                    it.unitPrice || it.unit_price,
                    it.subtotal
                );

                // Synchronize existing Job Orders for this product if any exist
                const existingJO = db.prepare('SELECT id FROM job_orders WHERE po_id = ? AND product_id = ?').get(id, it.productId);
                if (existingJO) {
                    db.prepare(`
                        UPDATE job_orders
                        SET target_quantity = ?, updated_at = datetime('now')
                        WHERE id = ?
                    `).run(it.targetQuantity || it.target_quantity, existingJO.id);

                    // Sync target_quantity on active production batches
                    db.prepare(`
                        UPDATE production_batches
                        SET target_quantity = ?, updated_at = datetime('now')
                        WHERE jo_id = ? AND status IN ('PLANNED', 'MIXING')
                    `).run(it.targetQuantity || it.target_quantity, existingJO.id);
                }
            }

            // Clean up any job orders for products that were removed from the PO during update (if no DRs exist)
            const updatedProductIds = processedItems.map(p => p.productId);
            const orphanedJOs = db.prepare(`
                SELECT id FROM job_orders 
                WHERE po_id = ? AND product_id NOT IN (${updatedProductIds.map(() => '?').join(',')})
            `).all(id, ...updatedProductIds);

            for (const ojo of orphanedJOs) {
                db.prepare('DELETE FROM production_batches WHERE jo_id = ?').run(ojo.id);
                db.prepare('DELETE FROM job_orders WHERE id = ?').run(ojo.id);
            }
        }

        db.prepare(`
            UPDATE purchase_orders
            SET po_date = ?,
                expected_delivery_date = ?,
                tolerance_percent = ?,
                billing_policy = ?,
                notes = ?,
                form_of_payment = ?,
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
            form_of_payment !== undefined ? (form_of_payment || null) : (po.form_of_payment || 'COD / Bank Transfer'),
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
                formOfPayment: form_of_payment,
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

        const canSeePrices = canViewOrderPrices(req.user.role);
        if (!canSeePrices) {
            updatedPO.subtotal = null;
            updatedPO.tax_percent = null;
            updatedPO.tax_amount = null;
            updatedPO.grand_total = null;
            for (const it of orderItems) {
                it.unit_price = null;
                it.subtotal = null;
            }
        }

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

/**
 * POST /api/orders/:id/accounting-confirm
 * Accounting Department confirms the order (credit, pricing & payments check)
 */
router.post('/:id/accounting-confirm', authenticateToken, requireRoles('ACCOUNTING', 'ADMIN', 'IT_ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id } = req.params;

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (po.status === 'CANCELLED' || po.status === 'VOIDED') {
        return res.status(400).json({ success: false, error: `Cannot confirm an order with status "${po.status}".` });
    }

    db.prepare(`
        UPDATE purchase_orders
        SET accounting_confirmed = 1,
            accounting_confirmed_at = datetime('now'),
            accounting_confirmed_by = ?,
            updated_at = datetime('now')
        WHERE id = ?
    `).run(req.user.id, id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'ACCOUNTING_CONFIRM_PO',
        entityType: 'PURCHASE_ORDER',
        entityId: po.po_number,
        details: { poId: id, confirmedBy: req.user.name, confirmedRole: req.user.role }
    });

    const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    return res.json({ 
        success: true, 
        message: `Purchase Order ${po.po_number} successfully confirmed by Accounting Department.`, 
        data: updated 
    });
});

/**
 * POST /api/orders/:id/inventory-confirm
 * Inventory confirms sufficient raw materials for product production.
 * Crucial rule: Inventory confirms AFTER Accounting Department has confirmed.
 */
router.post('/:id/inventory-confirm', authenticateToken, requireRoles('INVENTORY', 'ADMIN', 'IT_ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id } = req.params;

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (po.status === 'CANCELLED' || po.status === 'VOIDED') {
        return res.status(400).json({ success: false, error: `Cannot confirm an order with status "${po.status}".` });
    }

    const isExecAdmin = ['ADMIN', 'SUPER_ADMIN', 'IT_ADMIN'].includes(req.user.role);
    if (po.accounting_confirmed !== 1 && !isExecAdmin) {
        return res.status(400).json({ 
            success: false, 
            error: 'ACCOUNTING_CONFIRMATION_REQUIRED',
            message: 'Cannot confirm raw materials: This order must first be confirmed by the Accounting Department.' 
        });
    }

    // Auto-approve PO if currently PENDING_APPROVAL or DRAFT
    const shouldApprove = po.status === 'PENDING_APPROVAL' || po.status === 'DRAFT';
    const newStatus = shouldApprove ? 'APPROVED' : po.status;

    db.prepare(`
        UPDATE purchase_orders
        SET inventory_confirmed = 1,
            inventory_confirmed_at = datetime('now'),
            inventory_confirmed_by = ?,
            raw_materials_status = 'SUFFICIENT',
            status = ?,
            approved_by = COALESCE(approved_by, ?),
            approved_at = COALESCE(approved_at, datetime('now')),
            updated_at = datetime('now')
        WHERE id = ?
    `).run(req.user.id, newStatus, req.user.id, id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'INVENTORY_CONFIRM_PO',
        entityType: 'PURCHASE_ORDER',
        entityId: po.po_number,
        details: { poId: id, confirmedBy: req.user.name, rawMaterialsStatus: 'SUFFICIENT', newStatus }
    });

    const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    return res.json({ 
        success: true, 
        message: `Raw materials confirmed for ${po.po_number}. Order is ready for production.`, 
        data: updated 
    });
});

/**
 * POST /api/orders/:id/request-supplies
 * Inventory submits supply request to Purchasing Department for missing raw materials
 */
router.post('/:id/request-supplies', authenticateToken, requireRoles('INVENTORY', 'ADMIN', 'IT_ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id } = req.params;
    const { materials_needed, urgency, target_date, notes, affected_products } = req.body || {};

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (!materials_needed || !materials_needed.trim()) {
        return res.status(400).json({ success: false, error: 'Please describe the raw materials/supplies needed for the Purchasing Department.' });
    }

    const reqId = uuidv4();
    const formattedNotes = [
        affected_products ? `Affected Products: ${affected_products}` : null,
        notes ? `Notes: ${notes}` : null
    ].filter(Boolean).join('\n');

    db.prepare(`
        INSERT INTO supply_requests
        (id, po_id, requested_by, department, materials_needed, urgency, target_date, notes, status, created_at, updated_at)
        VALUES (?, ?, ?, 'Purchasing Department', ?, ?, ?, ?, 'SUBMITTED', datetime('now'), datetime('now'))
    `).run(
        reqId,
        id,
        req.user.id,
        materials_needed.trim(),
        urgency || 'NORMAL',
        target_date || null,
        formattedNotes || null
    );

    // Update PO raw materials status
    db.prepare(`
        UPDATE purchase_orders
        SET raw_materials_status = 'SUPPLIES_REQUESTED',
            updated_at = datetime('now')
        WHERE id = ?
    `).run(id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE_SUPPLY_REQUEST',
        entityType: 'PURCHASE_ORDER',
        entityId: po.po_number,
        details: { poId: id, requestId: reqId, materials: materials_needed.trim(), urgency }
    });

    const createdReq = db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(reqId);
    return res.status(201).json({ 
        success: true, 
        message: 'Requisition for supplies submitted to Purchasing Department.', 
        data: createdReq 
    });
});

/**
 * GET /api/orders/:id/supply-requests
 * Retrieve all supply requests for a Purchase Order
 */
router.get('/:id/supply-requests', authenticateToken, (req, res) => {
    const { id } = req.params;
    const requests = db.prepare(`
        SELECT sr.*, u.name as requested_by_name, u.email as requested_by_email
        FROM supply_requests sr
        JOIN users u ON sr.requested_by = u.id
        WHERE sr.po_id = ?
        ORDER BY sr.created_at DESC
    `).all(id);

    return res.json({ success: true, data: requests });
});

/**
 * POST /api/orders/:id/void
 * Void a Purchase Order
 */
router.post('/:id/void', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (req.user.role === 'CLIENT') {
        if (po.client_id !== req.clientId) {
            return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
        }
        if (po.status !== 'PENDING_APPROVAL' && po.status !== 'DRAFT') {
            return res.status(400).json({ 
                success: false, 
                error: 'Clients can only void pending orders before they are approved.' 
            });
        }
    } else if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'IT_ADMIN') {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    if (po.status === 'VOIDED') {
        return res.status(400).json({ success: false, error: 'This Purchase Order is already voided.' });
    }

    if (po.status === 'COMPLETED') {
        return res.status(400).json({ 
            success: false, 
            error: 'Cannot void a completed Purchase Order with fulfilled deliveries.' 
        });
    }

    // Check if active Delivery Receipts exist
    const activeDeliveries = db.prepare(`
        SELECT COUNT(*) as count 
        FROM delivery_receipts 
        WHERE po_id = ? AND status NOT IN ('CANCELLED', 'REJECTED')
    `).get(id);

    if (activeDeliveries && activeDeliveries.count > 0) {
        return res.status(400).json({
            success: false,
            error: `Cannot void Purchase Order ${po.po_number}: It has ${activeDeliveries.count} active Delivery Receipt(s). Please cancel or reject the deliveries first.`
        });
    }

    // Check if active Sales Invoices exist
    const activeInvoices = db.prepare(`
        SELECT COUNT(*) as count 
        FROM sales_invoices 
        WHERE po_id = ? AND status != 'CANCELLED'
    `).get(id);

    if (activeInvoices && activeInvoices.count > 0) {
        return res.status(400).json({
            success: false,
            error: `Cannot void Purchase Order ${po.po_number}: It has ${activeInvoices.count} active Sales Invoice(s).`
        });
    }

    const voidOrderTx = db.transaction(() => {
        const voidStamp = `[VOIDED on ${new Date().toISOString().slice(0, 10)}${reason ? ': ' + reason.trim() : ''}]`;
        const updatedNotes = po.notes ? (po.notes + ' ' + voidStamp) : voidStamp;

        // Release the PO number so voids do not consume or block sequence numbering
        let newPoNumber = po.po_number;
        if (!newPoNumber.startsWith('VOID-')) {
            newPoNumber = 'VOID-' + po.po_number;
            const existingVoid = db.prepare('SELECT id FROM purchase_orders WHERE po_number = ?').get(newPoNumber);
            if (existingVoid) {
                newPoNumber = 'VOID-' + po.po_number + '-' + id.slice(0, 6);
            }
        }

        db.prepare(`
            UPDATE purchase_orders
            SET status = 'VOIDED',
                po_number = ?,
                notes = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `).run(newPoNumber, updatedNotes, id);

        // Cancel any linked non-completed Job Orders
        db.prepare(`
            UPDATE job_orders
            SET status = 'CANCELLED',
                notes = COALESCE(notes, '') || ' [Cancelled due to PO Void]'
            WHERE po_id = ? AND status != 'CANCELLED' AND status != 'COMPLETED'
        `).run(id);

        // Synchronize document_sequences so last_sequence reflects the highest active (non-voided) PO
        const year = new Date().getFullYear();
        const activeRows = db.prepare(`
            SELECT po_number FROM purchase_orders 
            WHERE status != 'VOIDED' AND po_number LIKE ?
        `).all(`PO-${year}-%`);
        
        let maxSeq = 0;
        for (const row of activeRows) {
            const parts = row.po_number.split('-');
            if (parts.length === 3) {
                const seq = parseInt(parts[2], 10);
                if (!isNaN(seq) && seq > maxSeq) {
                    maxSeq = seq;
                }
            }
        }
        
        const existingSeq = db.prepare('SELECT doc_type FROM document_sequences WHERE doc_type = ?').get('PO');
        if (existingSeq) {
            db.prepare('UPDATE document_sequences SET current_year = ?, last_sequence = ? WHERE doc_type = ?').run(year, maxSeq, 'PO');
        } else {
            db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, ?)').run('PO', year, maxSeq);
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'VOID_PO',
            entityType: 'PURCHASE_ORDER',
            entityId: po.po_number,
            details: {
                poId: id,
                poNumber: po.po_number,
                previousStatus: po.status,
                voidedBy: req.user.name,
                reason: reason || 'User voided order'
            }
        });

        return db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    });

    try {
        const updated = voidOrderTx();
        return res.json({
            success: true,
            message: `Purchase Order ${po.po_number} has been voided successfully.`,
            data: updated
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

// DELETE /api/orders/:id - Permanently delete a voided (or draft/cancelled) order
router.delete('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'IT_ADMIN') {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    // Allow deleting VOIDED, DRAFT, or CANCELLED orders
    if (po.status !== 'VOIDED' && po.status !== 'DRAFT' && po.status !== 'CANCELLED') {
        return res.status(400).json({
            success: false,
            error: `Cannot permanently delete order in '${po.status}' status. Please VOID the order first.`
        });
    }

    const deleteOrderTx = db.transaction(() => {
        // Find linked Job Orders
        const jos = db.prepare('SELECT id FROM job_orders WHERE po_id = ?').all(id);
        const joIds = jos.map(j => j.id);

        // Find linked Delivery Receipts
        const drs = db.prepare('SELECT id FROM delivery_receipts WHERE po_id = ?').all(id);
        const drIds = drs.map(d => d.id);

        // Find linked Sales Invoices
        const sis = db.prepare('SELECT id FROM sales_invoices WHERE po_id = ?').all(id);
        const siIds = sis.map(s => s.id);

        // 1. Delete payments
        if (siIds.length > 0) {
            db.prepare(`DELETE FROM payments WHERE invoice_id IN (${siIds.map(() => '?').join(',')})`).run(...siIds);
        }

        // 2. Delete sales invoices
        if (siIds.length > 0) {
            try {
                db.prepare(`DELETE FROM sales_invoice_items WHERE invoice_id IN (${siIds.map(() => '?').join(',')})`).run(...siIds);
            } catch (e) {}
            db.prepare(`DELETE FROM sales_invoices WHERE id IN (${siIds.map(() => '?').join(',')})`).run(...siIds);
        }

        // 3. Delete delivery receipts
        if (drIds.length > 0) {
            try {
                db.prepare(`DELETE FROM delivery_acceptances WHERE delivery_id IN (${drIds.map(() => '?').join(',')})`).run(...drIds);
            } catch (e) {}
            try {
                db.prepare(`DELETE FROM delivery_receipt_items WHERE dr_id IN (${drIds.map(() => '?').join(',')})`).run(...drIds);
            } catch (e) {}
            db.prepare(`DELETE FROM delivery_receipts WHERE id IN (${drIds.map(() => '?').join(',')})`).run(...drIds);
        }

        // 4. Delete production batches
        if (joIds.length > 0) {
            db.prepare(`DELETE FROM production_batches WHERE jo_id IN (${joIds.map(() => '?').join(',')})`).run(...joIds);
        }

        // 5. Delete job orders
        if (joIds.length > 0) {
            db.prepare(`DELETE FROM job_orders WHERE id IN (${joIds.map(() => '?').join(',')})`).run(...joIds);
        }

        // 6. Delete PO items
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(id);

        // 7. Delete PO
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(id);

        // Synchronize sequence numbers
        const year = new Date().getFullYear();
        const activeRows = db.prepare(`
            SELECT po_number FROM purchase_orders 
            WHERE status != 'VOIDED' AND po_number LIKE ?
        `).all(`PO-${year}-%`);
        
        let maxSeq = 0;
        for (const row of activeRows) {
            const parts = row.po_number.split('-');
            if (parts.length === 3) {
                const seq = parseInt(parts[2], 10);
                if (!isNaN(seq) && seq > maxSeq) {
                    maxSeq = seq;
                }
            }
        }
        
        const existingSeq = db.prepare('SELECT doc_type FROM document_sequences WHERE doc_type = ?').get('PO');
        if (existingSeq) {
            db.prepare('UPDATE document_sequences SET current_year = ?, last_sequence = ? WHERE doc_type = ?').run(year, maxSeq, 'PO');
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'DELETE_PO_PERMANENT',
            entityType: 'PURCHASE_ORDER',
            entityId: po.po_number,
            details: {
                poId: id,
                poNumber: po.po_number,
                deletedBy: req.user.name
            }
        });
    });

    try {
        deleteOrderTx();
        return res.json({
            success: true,
            message: `Purchase Order ${po.po_number} has been permanently deleted.`
        });
    } catch (err) {
        console.error('Error permanently deleting PO:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

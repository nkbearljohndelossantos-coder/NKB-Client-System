/**
 * NKB Manufacturing Corporation
 * Developer REST API Gateway (v1)
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../../database/db');
const { authenticateApiKey, requireScope } = require('../../middleware/apiKeyAuth');
const { getNextDocumentNumber } = require('../../services/documentNumberService');
const { getOrderMaterialBreakdown } = require('../../services/formulationService');
const { logAudit } = require('../../services/auditService');
const { saveAttachment } = require('../../services/attachmentService');

// All v1 endpoints (except openapi.json and ping) require a valid API key
router.use((req, res, next) => {
    if (req.path === '/openapi.json' || req.path === '/health') {
        return next();
    }
    return authenticateApiKey(req, res, next);
});

/**
 * GET /api/v1/ping
 * Health check & key metadata reflection
 */
router.get('/ping', (req, res) => {
    return res.json({
        status: 'ok',
        system: 'NKB Manufacturing Corporation Developer REST API v1',
        timestamp: new Date().toISOString(),
        key: {
            name: req.apiKey.name,
            keyPrefix: req.apiKey.keyPrefix,
            clientId: req.apiKey.clientId || null,
            clientName: req.apiKey.clientCompanyName || 'Global Admin Key',
            scopes: req.apiKey.scopes,
            rateLimitRpm: req.apiKey.rateLimitRpm
        }
    });
});

/**
 * GET /api/v1/health
 * Public health probe
 */
router.get('/health', (req, res) => {
    return res.json({
        status: 'ok',
        version: 'v1',
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/v1/products
 * List cosmetic products with pagination, search, and client pricing
 */
router.get('/products', requireScope('products:read'), (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;
        const search = (req.query.search || '').trim();
        const category = (req.query.category || '').trim();

        let whereClause = 'WHERE p.is_active = 1';
        const params = [];

        if (search) {
            whereClause += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        if (category) {
            whereClause += ' AND p.category = ?';
            params.push(category);
        }

        const countRow = db.prepare(`SELECT COUNT(*) as count FROM products p ${whereClause}`).get(...params);
        const total = countRow ? countRow.count : 0;

        // If API key is bound to a specific client, fetch custom catalog price
        let sql = '';
        if (req.clientId) {
            sql = `
                SELECT p.id, p.sku, p.name, p.category, p.description, p.unit,
                       COALESCE(cpp.custom_price, p.default_price) as price,
                       p.default_price, cpp.custom_price,
                       p.shelf_life_months, p.current_stock, p.formula_code,
                       p.created_at, p.updated_at
                FROM products p
                LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ? AND cpp.is_active = 1
                ${whereClause}
                ORDER BY p.name ASC
                LIMIT ? OFFSET ?
            `;
            params.unshift(req.clientId);
        } else {
            sql = `
                SELECT p.id, p.sku, p.name, p.category, p.description, p.unit,
                       p.default_price as price, p.default_price,
                       p.shelf_life_months, p.current_stock, p.formula_code,
                       p.created_at, p.updated_at
                FROM products p
                ${whereClause}
                ORDER BY p.name ASC
                LIMIT ? OFFSET ?
            `;
        }
        params.push(limit, offset);

        const products = db.prepare(sql).all(...params);

        return res.json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: products
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/products/:id
 * Retrieve specific product details
 */
router.get('/products/:id', requireScope('products:read'), (req, res) => {
    try {
        const { id } = req.params;
        let product;
        if (req.clientId) {
            product = db.prepare(`
                SELECT p.id, p.sku, p.name, p.category, p.description, p.unit,
                       COALESCE(cpp.custom_price, p.default_price) as price,
                       p.default_price, cpp.custom_price,
                       p.shelf_life_months, p.current_stock, p.formula_code,
                       p.created_at, p.updated_at
                FROM products p
                LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ? AND cpp.is_active = 1
                WHERE (p.id = ? OR p.sku = ?) AND p.is_active = 1
            `).get(req.clientId, id, id);
        } else {
            product = db.prepare(`
                SELECT p.id, p.sku, p.name, p.category, p.description, p.unit,
                       p.default_price as price, p.default_price,
                       p.shelf_life_months, p.current_stock, p.formula_code,
                       p.created_at, p.updated_at
                FROM products p
                WHERE (p.id = ? OR p.sku = ?) AND p.is_active = 1
            `).get(id, id);
        }

        if (!product) {
            return res.status(404).json({ success: false, error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
        }

        return res.json({ success: true, data: product });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/orders
 * List purchase orders with client isolation
 */
router.get('/orders', requireScope('orders:read'), (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;
        const status = (req.query.status || '').trim().toUpperCase();
        const search = (req.query.search || '').trim();

        let whereClause = 'WHERE 1=1';
        const params = [];

        // Client isolation
        if (req.clientId) {
            whereClause += ' AND po.client_id = ?';
            params.push(req.clientId);
        }

        if (status) {
            whereClause += ' AND po.status = ?';
            params.push(status);
        }

        if (search) {
            whereClause += ' AND (po.po_number LIKE ? OR po.so_number LIKE ? OR c.company_name LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        const countRow = db.prepare(`
            SELECT COUNT(*) as count 
            FROM purchase_orders po
            JOIN clients c ON po.client_id = c.id
            ${whereClause}
        `).get(...params);
        const total = countRow ? countRow.count : 0;

        const orders = db.prepare(`
            SELECT po.id, po.po_number, po.so_number, po.client_id, c.company_name,
                   po.po_date, po.expected_delivery_date, po.tolerance_percent,
                   po.billing_policy, po.status, po.form_of_payment, po.notes,
                   po.subtotal, po.tax_percent, po.tax_amount, po.grand_total,
                   po.accounting_confirmed, po.created_at, po.updated_at
            FROM purchase_orders po
            JOIN clients c ON po.client_id = c.id
            ${whereClause}
            ORDER BY po.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        // Fetch line item summaries for each order
        for (const order of orders) {
            order.items = db.prepare(`
                SELECT poi.id, poi.product_id, poi.item_name, poi.target_quantity,
                       poi.unit_price, poi.subtotal, p.sku as product_sku, p.name as standard_name
                FROM purchase_order_items poi
                JOIN products p ON poi.product_id = p.id
                WHERE poi.po_id = ?
            `).all(order.id);
        }

        return res.json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: orders
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/orders/:id
 * Retrieve single purchase order with complete details
 */
router.get('/orders/:id', requireScope('orders:read'), (req, res) => {
    try {
        const { id } = req.params;

        let sql = `
            SELECT po.*, c.company_name, c.contact_person, c.email as client_email,
                   c.phone as client_phone, c.address as client_address
            FROM purchase_orders po
            JOIN clients c ON po.client_id = c.id
            WHERE (po.id = ? OR po.po_number = ? OR po.so_number = ?)
        `;
        const params = [id, id, id];

        if (req.clientId) {
            sql += ' AND po.client_id = ?';
            params.push(req.clientId);
        }

        const order = db.prepare(sql).get(...params);
        if (!order) {
            return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'Order not found or unauthorized.' });
        }

        order.items = db.prepare(`
            SELECT poi.*, p.sku as product_sku, p.name as product_name, p.category as product_category
            FROM purchase_order_items poi
            JOIN products p ON poi.product_id = p.id
            WHERE poi.po_id = ?
        `).all(order.id);

        order.deliveries = db.prepare(`
            SELECT dr.id, dr.dr_number, dr.status, dr.delivery_date, dr.driver_name, dr.vehicle_plate,
                   dr.created_at
            FROM delivery_receipts dr
            WHERE dr.po_id = ?
        `).all(order.id);

        order.invoices = db.prepare(`
            SELECT si.id, si.invoice_number, si.status, si.invoice_date as issue_date, si.invoice_date, si.due_date,
                   si.total_amount, si.paid_amount, si.created_at
            FROM sales_invoices si
            WHERE si.po_id = ?
        `).all(order.id);

        return res.json({ success: true, data: order });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/v1/orders
 * Create a new purchase order programmatically
 */
router.post('/orders', requireScope('orders:write'), (req, res) => {
    try {
        const body = req.body || {};
        let clientId = req.clientId || body.client_id;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                error: 'CLIENT_REQUIRED',
                message: 'client_id is required when creating an order with a global API key.'
            });
        }

        // Verify client exists
        const client = db.prepare('SELECT * FROM clients WHERE id = ? AND is_active = 1').get(clientId);
        if (!client) {
            return res.status(400).json({ success: false, error: 'INVALID_CLIENT', message: 'Client not found or inactive.' });
        }

        const items = body.items;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'ITEMS_REQUIRED',
                message: 'At least one item is required in the items array.'
            });
        }

        const tolerance = body.tolerance_percent !== undefined ? parseFloat(body.tolerance_percent) : client.default_tolerance_percent;
        const billingPolicy = body.billing_policy || client.default_billing_policy || 'ACTUAL_DELIVERY';
        const formOfPayment = body.form_of_payment || '30 Days Net';
        const notes = body.notes || 'Order received via NKB Developer REST API v1';

        // Prepare line items and calculate pricing
        const preparedItems = [];
        let subtotal = 0;

        for (const item of items) {
            const targetQty = parseInt(item.target_quantity, 10);
            if (!targetQty || targetQty <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_QUANTITY',
                    message: `Invalid target_quantity for product ${item.product_id || item.sku}`
                });
            }

            // Look up product by id or sku
            const product = db.prepare('SELECT * FROM products WHERE (id = ? OR sku = ?) AND is_active = 1')
                .get(item.product_id || item.sku, item.product_id || item.sku);

            if (!product) {
                return res.status(400).json({
                    success: false,
                    error: 'PRODUCT_NOT_FOUND',
                    message: `Product not found: ${item.product_id || item.sku}`
                });
            }

            // Determine unit price
            let unitPrice = item.unit_price !== undefined ? parseFloat(item.unit_price) : null;
            if (unitPrice === null || isNaN(unitPrice)) {
                // Check client custom pricing
                const customPrice = db.prepare('SELECT custom_price FROM client_product_prices WHERE client_id = ? AND product_id = ? AND is_active = 1')
                    .get(client.id, product.id);
                unitPrice = customPrice ? customPrice.custom_price : product.default_price;
            }

            const lineSubtotal = Math.round(targetQty * unitPrice * 100) / 100;
            subtotal += lineSubtotal;

            const minAllowedQty = Math.floor(targetQty * (1 - tolerance / 100));
            const maxAllowedQty = Math.ceil(targetQty * (1 + tolerance / 100));

            preparedItems.push({
                product_id: product.id,
                item_name: item.item_name || product.name,
                target_quantity: targetQty,
                min_allowed_quantity: minAllowedQty,
                max_allowed_quantity: maxAllowedQty,
                unit_price: unitPrice,
                subtotal: lineSubtotal
            });
        }

        // Generate Document Sequences
        const poNumber = getNextDocumentNumber('PO');
        const soNumber = poNumber.replace('PO-', 'SO-');
        const orderId = uuidv4();
        const grandTotal = subtotal;
        const createdByUserId = req.apiKey.userId || (db.prepare("SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') LIMIT 1").get() || {}).id;

        // Transaction insert
        const createOrderTx = db.transaction(() => {
            db.prepare(`
                INSERT INTO purchase_orders (
                    id, po_number, so_number, client_id, po_date,
                    tolerance_percent, billing_policy, status, form_of_payment, notes,
                    subtotal, tax_percent, tax_amount, grand_total, created_by,
                    created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, date('now', 'localtime'),
                    ?, ?, 'PENDING_APPROVAL', ?, ?,
                    ?, 0.0, 0.0, ?, ?,
                    datetime('now', 'localtime'), datetime('now', 'localtime')
                )
            `).run(
                orderId, poNumber, soNumber, client.id,
                tolerance, billingPolicy, formOfPayment, notes,
                subtotal, grandTotal, createdByUserId
            );

            const itemStmt = db.prepare(`
                INSERT INTO purchase_order_items (
                    id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const pi of preparedItems) {
                itemStmt.run(uuidv4(), orderId, pi.product_id, pi.item_name, pi.target_quantity, pi.min_allowed_quantity, pi.max_allowed_quantity, pi.unit_price, pi.subtotal);
            }
        });

        createOrderTx();

        const createdOrder = db.prepare(`
            SELECT po.*, c.company_name
            FROM purchase_orders po
            JOIN clients c ON po.client_id = c.id
            WHERE po.id = ?
        `).get(orderId);

        createdOrder.items = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(orderId);

        return res.status(201).json({
            success: true,
            data: createdOrder,
            message: 'Purchase Order created successfully via Developer API v1.'
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/deliveries
 * List delivery receipts (DRs) with dispatch tracking
 */
router.get('/deliveries', requireScope('deliveries:read'), (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;
        const poId = req.query.po_id || req.query.poId;
        const status = (req.query.status || '').trim().toUpperCase();

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (req.clientId) {
            whereClause += ' AND po.client_id = ?';
            params.push(req.clientId);
        }

        if (poId) {
            whereClause += ' AND (dr.po_id = ? OR po.po_number = ?)';
            params.push(poId, poId);
        }

        if (status) {
            whereClause += ' AND dr.status = ?';
            params.push(status);
        }

        const countRow = db.prepare(`
            SELECT COUNT(*) as count
            FROM delivery_receipts dr
            JOIN purchase_orders po ON dr.po_id = po.id
            ${whereClause}
        `).get(...params);
        const total = countRow ? countRow.count : 0;

        const deliveries = db.prepare(`
            SELECT dr.id, dr.dr_number, dr.po_id, po.po_number, po.so_number,
                   c.company_name as client_name, dr.delivery_date, dr.status,
                   dr.driver_name, dr.vehicle_plate, dr.notes, dr.created_at, dr.updated_at
            FROM delivery_receipts dr
            JOIN purchase_orders po ON dr.po_id = po.id
            JOIN clients c ON po.client_id = c.id
            ${whereClause}
            ORDER BY dr.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        for (const dr of deliveries) {
            dr.items = db.prepare(`
                SELECT di.*, p.sku as product_sku, p.name as product_name
                FROM delivery_items di
                JOIN products p ON di.product_id = p.id
                WHERE di.dr_id = ?
            `).all(dr.id);
        }

        return res.json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: deliveries
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/deliveries/:id
 * Retrieve single Delivery Receipt details
 */
router.get('/deliveries/:id', requireScope('deliveries:read'), (req, res) => {
    try {
        const { id } = req.params;
        let sql = `
            SELECT dr.*, po.po_number, po.so_number, c.company_name as client_name
            FROM delivery_receipts dr
            JOIN purchase_orders po ON dr.po_id = po.id
            JOIN clients c ON po.client_id = c.id
            WHERE (dr.id = ? OR dr.dr_number = ?)
        `;
        const params = [id, id];

        if (req.clientId) {
            sql += ' AND po.client_id = ?';
            params.push(req.clientId);
        }

        const dr = db.prepare(sql).get(...params);
        if (!dr) {
            return res.status(404).json({ success: false, error: 'DELIVERY_NOT_FOUND', message: 'Delivery Receipt not found.' });
        }

        dr.items = db.prepare(`
            SELECT di.*, p.sku as product_sku, p.name as product_name, pb.batch_number
            FROM delivery_items di
            JOIN products p ON di.product_id = p.id
            LEFT JOIN production_batches pb ON di.batch_id = pb.id
            WHERE di.dr_id = ?
        `).all(dr.id);

        dr.acceptance = db.prepare('SELECT * FROM dr_acceptances WHERE dr_id = ?').get(dr.id) || null;

        return res.json({ success: true, data: dr });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/invoices
 * List Sales Invoices with payment and billing status
 */
router.get('/invoices', requireScope('invoices:read'), (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;
        const status = (req.query.status || '').trim().toUpperCase();

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (req.clientId) {
            whereClause += ' AND si.client_id = ?';
            params.push(req.clientId);
        }

        if (status) {
            whereClause += ' AND si.status = ?';
            params.push(status);
        }

        const countRow = db.prepare(`
            SELECT COUNT(*) as count
            FROM sales_invoices si
            JOIN clients c ON si.client_id = c.id
            ${whereClause}
        `).get(...params);
        const total = countRow ? countRow.count : 0;

        const invoices = db.prepare(`
            SELECT si.id, si.invoice_number, si.po_id, po.po_number, po.so_number,
                   si.client_id, c.company_name as client_name,
                   si.invoice_date as issue_date, si.invoice_date, si.due_date, si.status,
                   si.total_amount, si.paid_amount, (si.total_amount - si.paid_amount) as balance_due,
                   si.notes, si.created_at, si.updated_at
            FROM sales_invoices si
            JOIN clients c ON si.client_id = c.id
            JOIN purchase_orders po ON si.po_id = po.id
            ${whereClause}
            ORDER BY si.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        return res.json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: invoices
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/invoices/:id
 * Retrieve single invoice details and payment history
 */
router.get('/invoices/:id', requireScope('invoices:read'), (req, res) => {
    try {
        const { id } = req.params;
        let sql = `
            SELECT si.*, po.po_number, po.so_number, c.company_name as client_name,
                   c.contact_person, c.email as client_email, c.address as client_address
            FROM sales_invoices si
            JOIN clients c ON si.client_id = c.id
            JOIN purchase_orders po ON si.po_id = po.id
            WHERE (si.id = ? OR si.invoice_number = ?)
        `;
        const params = [id, id];

        if (req.clientId) {
            sql += ' AND si.client_id = ?';
            params.push(req.clientId);
        }

        const invoice = db.prepare(sql).get(...params);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' });
        }

        invoice.items = db.prepare(`
            SELECT ii.*, p.sku as product_sku, p.name as product_name
            FROM invoice_items ii
            JOIN products p ON ii.product_id = p.id
            WHERE ii.invoice_id = ?
        `).all(invoice.id);

        invoice.payments = db.prepare(`
            SELECT p.id, p.payment_number, p.amount, p.payment_method, p.reference_number,
                   p.payment_date, p.notes, p.created_at
            FROM payments p
            WHERE p.invoice_id = ?
            ORDER BY p.created_at DESC
        `).all(invoice.id);

        return res.json({ success: true, data: invoice });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/inventory
 * Real-time cosmetic stock levels and raw material pull sheets
 */
router.get('/inventory', requireScope('inventory:read'), (req, res) => {
    try {
        const { po_id, poId } = req.query;
        const targetPoId = po_id || poId;

        // If specific PO breakdown requested
        if (targetPoId) {
            const breakdown = getOrderMaterialBreakdown(db, targetPoId);
            if (!breakdown) {
                return res.status(404).json({ success: false, error: 'PO_NOT_FOUND', message: 'Order material breakdown not found.' });
            }
            return res.json({ success: true, data: breakdown });
        }

        // General stock availability
        const products = db.prepare(`
            SELECT id, sku, name, category, unit, current_stock,
                   shelf_life_months, updated_at
            FROM products
            WHERE is_active = 1
            ORDER BY category ASC, name ASC
        `).all();

        return res.json({
            success: true,
            totalProducts: products.length,
            products,
            data: products
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/payables
 * List cheque payables for external COO review & ERP synchronization
 */
router.get('/payables', (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;
        const status = (req.query.status || '').trim();
        const category = (req.query.category || '').trim();
        const bank = (req.query.bank || '').trim();
        const search = (req.query.search || '').trim();
        const dateFrom = (req.query.date_from || '').trim();
        const dateTo = (req.query.date_to || '').trim();

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (status) {
            whereClause += ' AND cp.status = ?';
            params.push(status);
        }
        if (category) {
            whereClause += ' AND cp.category = ?';
            params.push(category);
        }
        if (bank) {
            whereClause += ' AND cp.bank_name LIKE ?';
            params.push(`%${bank}%`);
        }
        if (dateFrom) {
            whereClause += ' AND cp.cheque_date >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            whereClause += ' AND cp.cheque_date <= ?';
            params.push(dateTo);
        }
        if (search) {
            whereClause += ' AND (cp.payee_name LIKE ? OR cp.request_number LIKE ? OR cp.cheque_number LIKE ? OR cp.purpose LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }

        const countRow = db.prepare(`SELECT COUNT(*) as count FROM cheque_payables cp ${whereClause}`).get(...params);
        const total = countRow ? countRow.count : 0;

        const sql = `
            SELECT cp.*, u.name as requestor_name, u.email as requestor_email
            FROM cheque_payables cp
            LEFT JOIN users u ON cp.requested_by = u.id
            ${whereClause}
            ORDER BY cp.cheque_date DESC, cp.created_at DESC
            LIMIT ? OFFSET ?
        `;
        params.push(limit, offset);

        const rows = db.prepare(sql).all(...params);

        return res.json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: rows
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/payables/:id
 * Get single cheque payable by ID or request number
 */
router.get('/payables/:id', (req, res) => {
    try {
        const item = db.prepare(`
            SELECT cp.*, u.name as requestor_name, u.email as requestor_email
            FROM cheque_payables cp
            LEFT JOIN users u ON cp.requested_by = u.id
            WHERE cp.id = ? OR cp.request_number = ?
        `).get(req.params.id, req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, error: 'Cheque payable record not found.' });
        }

        return res.json({ success: true, data: item });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/v1/payables/:id/confirm
 * COO confirmation from external website via API
 */
router.post('/payables/:id/confirm', (req, res) => {
    try {
        const { decision = 'CONFIRMED', cheque_number, notes, confirmed_by } = req.body;
        const item = db.prepare('SELECT * FROM cheque_payables WHERE id = ? OR request_number = ?').get(req.params.id, req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, error: 'Cheque payable record not found.' });
        }

        const isApproved = decision.toUpperCase() === 'CONFIRMED' || decision.toUpperCase() === 'APPROVED';
        const newStatus = isApproved ? 'CONFIRMED' : 'REJECTED';
        const finalChequeNum = cheque_number ? String(cheque_number).trim() : item.cheque_number;
        const approverName = confirmed_by ? String(confirmed_by).trim() : 'COO Executive Office (External Portal)';
        const confirmedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

        db.prepare(`
            UPDATE cheque_payables
            SET status = ?,
                coo_decision = ?,
                cheque_number = ?,
                coo_confirmed_by = ?,
                coo_confirmed_at = ?,
                coo_notes = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(
            newStatus,
            decision.toUpperCase(),
            finalChequeNum,
            approverName,
            confirmedAt,
            notes ? String(notes).trim() : null,
            item.id
        );

        const updated = db.prepare('SELECT * FROM cheque_payables WHERE id = ?').get(item.id);

        logAudit({
            userId: req.apiKey?.id || 'coo-external-api',
            userName: approverName,
            userRole: 'COO',
            action: isApproved ? 'COO_API_CONFIRM_PAYABLE' : 'COO_API_REJECT_PAYABLE',
            entityType: 'PAYABLE',
            entityId: item.request_number,
            details: {
                requestNumber: item.request_number,
                payeeName: item.payee_name,
                amount: item.amount,
                chequeNumber: finalChequeNum,
                decision: newStatus,
                confirmedBy: approverName,
                notes,
                apiKeyName: req.apiKey?.name
            }
        });

        // Insert notification for the accountant user
        try {
            const notifId = uuidv4();
            db.prepare(`
                INSERT INTO notifications (id, user_id, type, title, message, link, is_read, created_at)
                VALUES (?, ?, 'PAYABLE_CONFIRMED', ?, ?, '/admin#payables', 0, datetime('now', 'localtime'))
            `).run(
                notifId,
                item.requested_by,
                `Cheque Payable ${isApproved ? 'CONFIRMED' : 'REJECTED'} by COO`,
                `Request ${item.request_number} for ${item.payee_name} (₱${Number(item.amount).toLocaleString()}) was ${isApproved ? 'CONFIRMED' : 'REJECTED'} by COO.${finalChequeNum ? ` Cheque #: ${finalChequeNum}` : ''}`
            );
        } catch (_) {}

        return res.json({
            success: true,
            message: `Cheque payable ${item.request_number} has been ${isApproved ? 'CONFIRMED' : 'REJECTED'} successfully.`,
            data: updated
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/v1/payables
 * Create a new cheque payable request programmatically
 */
router.post('/payables', (req, res) => {
    try {
        const {
            payee_name,
            amount,
            cheque_date,
            bank_name,
            bank_account_number,
            cheque_number,
            category,
            purpose,
            invoice_reference,
            attachment_url,
            attachment_data,
            notes,
            requested_by_name
        } = req.body;

        if (!payee_name || !amount || !cheque_date || !bank_name || !category || !purpose) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_FIELDS',
                message: 'payee_name, amount, cheque_date, bank_name, category, and purpose are required.'
            });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, error: 'INVALID_AMOUNT', message: 'Amount must be greater than 0.' });
        }

        const id = uuidv4();
        const requestNumber = getNextDocumentNumber('CHQ');
        let savedAttachment = null;
        if (attachment_data || attachment_url) {
            savedAttachment = saveAttachment(attachment_data || attachment_url, 'payables');
        }

        const adminUser = db.prepare("SELECT id, name FROM users WHERE role = 'ACCOUNTING' OR role = 'ADMIN' LIMIT 1").get();
        const creatorId = adminUser ? adminUser.id : (req.apiKey.userId || 'system');
        const creatorName = requested_by_name || (adminUser ? adminUser.name : 'API Client');

        db.prepare(`
            INSERT INTO cheque_payables (
                id, request_number, payee_name, amount, cheque_date, bank_name,
                bank_account_number, cheque_number, category, purpose,
                invoice_reference, attachment_url, status, requested_by,
                requested_by_name, coo_notes, api_key_used, created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, 'PENDING_COO_APPROVAL', ?,
                ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
            )
        `).run(
            id,
            requestNumber,
            String(payee_name).trim(),
            numAmount,
            cheque_date,
            String(bank_name).trim(),
            bank_account_number || null,
            cheque_number || null,
            String(category).trim(),
            String(purpose).trim(),
            invoice_reference || null,
            savedAttachment,
            creatorId,
            creatorName,
            notes || 'Created via Developer REST API v1',
            req.apiKey.name || 'API Key'
        );

        const created = db.prepare('SELECT * FROM cheque_payables WHERE id = ?').get(id);

        return res.status(201).json({
            success: true,
            message: `Cheque payable request ${requestNumber} created successfully.`,
            data: created
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/v1/openapi.json
 * OpenAPI 3.0 API Specification
 */
router.get('/openapi.json', (req, res) => {
    const host = req.get('host') || 'my.nkbmanufacturing.com';
    const protocol = req.protocol || 'http';

    const spec = {
        openapi: '3.0.3',
        info: {
            title: 'NKB Manufacturing Corporation — Developer REST API',
            version: '1.0.0',
            description: 'Official programmatic API for external eCommerce platforms, ERPs, accounting systems, and warehouse logistics.'
        },
        servers: [
            { url: `${protocol}://${host}/api/v1`, description: 'Current Server Environment' }
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                    description: 'Enter your NKB API Key (e.g. nkb_live_...)'
                },
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'API_KEY'
                }
            }
        },
        security: [{ ApiKeyAuth: [] }],
        paths: {
            '/ping': {
                get: {
                    summary: 'Ping API & verify key metadata',
                    responses: { '200': { description: 'Successful pong with key scopes' } }
                }
            },
            '/products': {
                get: {
                    summary: 'List cosmetic products',
                    parameters: [
                        { name: 'search', in: 'query', schema: { type: 'string' } },
                        { name: 'category', in: 'query', schema: { type: 'string' } },
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
                    ],
                    responses: { '200': { description: 'List of products' } }
                }
            },
            '/orders': {
                get: {
                    summary: 'List purchase orders',
                    responses: { '200': { description: 'List of purchase orders' } }
                },
                post: {
                    summary: 'Create a purchase order programmatically',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['items'],
                                    properties: {
                                        client_id: { type: 'string' },
                                        tolerance_percent: { type: 'number', default: 10.0 },
                                        billing_policy: { type: 'string', enum: ['ACTUAL_DELIVERY', 'FIXED_PO_BUFFER'] },
                                        form_of_payment: { type: 'string' },
                                        notes: { type: 'string' },
                                        items: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                required: ['product_id', 'target_quantity'],
                                                properties: {
                                                    product_id: { type: 'string' },
                                                    target_quantity: { type: 'integer' },
                                                    unit_price: { type: 'number' }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '201': { description: 'Order created' } }
                }
            },
            '/deliveries': {
                get: {
                    summary: 'List delivery receipts and tracking',
                    responses: { '200': { description: 'Delivery receipts' } }
                }
            },
            '/invoices': {
                get: {
                    summary: 'List sales invoices and balances',
                    responses: { '200': { description: 'Sales invoices' } }
                }
            },
            '/inventory': {
                get: {
                    summary: 'Get finished cosmetic inventory and formula pull sheets',
                    responses: { '200': { description: 'Inventory availability' } }
                }
            },
            '/payables': {
                get: {
                    summary: 'List cheque payables for COO review & ERP synchronization',
                    parameters: [
                        { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING_COO_APPROVAL', 'CONFIRMED', 'ISSUED', 'CLEARED', 'REJECTED'] } },
                        { name: 'category', in: 'query', schema: { type: 'string' } },
                        { name: 'bank', in: 'query', schema: { type: 'string' } },
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } }
                    ],
                    responses: { '200': { description: 'List of cheque payables' } }
                },
                post: {
                    summary: 'Create a cheque payable request',
                    responses: { '201': { description: 'Cheque payable created' } }
                }
            },
            '/payables/{id}/confirm': {
                post: {
                    summary: 'Confirm or reject cheque payable by COO via API Key',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        decision: { type: 'string', enum: ['CONFIRMED', 'REJECTED'] },
                                        cheque_number: { type: 'string' },
                                        notes: { type: 'string' },
                                        confirmed_by: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Cheque payable confirmed or rejected' } }
                }
            }
        }
    };

    return res.json(spec);
});

module.exports = router;

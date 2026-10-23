/**
 * NKB Manufacturing & Trading
 * IT Management & Master Records Editor Route
 * 
 * Provides authorized IT Administrators and Super Admins universal inspection,
 * editing, override, and reassignment capabilities across all operational tables.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { ROLES } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');
const { getManilaDate } = require('../helpers/timezone');

// Whitelist of manageable tables and their field definitions
const TABLE_DEFINITIONS = {
    purchase_orders: {
        label: 'Purchase Orders & SOs',
        icon: '📋',
        tableName: 'purchase_orders',
        primaryKey: 'id',
        displayField: 'po_number',
        searchFields: ['po_number', 'so_number', 'notes', 'status', 'category'],
        editableColumns: [
            'client_id', 'po_number', 'so_number', 'status', 'po_date',
            'expected_delivery_date', 'tolerance_percent', 'billing_policy',
            'category', 'category_color',
            'subtotal', 'tax_percent', 'tax_amount', 'grand_total',
            'form_of_payment', 'payment_made', 'notes', 'accounting_confirmed', 'inventory_confirmed',
            'raw_materials_status', 'formulation_converted'
        ],
        joins: `
            LEFT JOIN clients c ON purchase_orders.client_id = c.id
        `,
        selectFields: 'purchase_orders.*, c.company_name as client_company_name, c.contact_person as client_contact'
    },
    purchase_order_items: {
        label: 'Order Line Items',
        icon: '📦',
        tableName: 'purchase_order_items',
        primaryKey: 'id',
        displayField: 'item_name',
        searchFields: ['item_name'],
        editableColumns: [
            'po_id', 'product_id', 'item_name', 'target_quantity',
            'min_allowed_quantity', 'max_allowed_quantity', 'unit_price',
            'subtotal', 'delivered_quantity'
        ],
        joins: `
            LEFT JOIN purchase_orders po ON purchase_order_items.po_id = po.id
            LEFT JOIN products p ON purchase_order_items.product_id = p.id
        `,
        selectFields: 'purchase_order_items.*, po.po_number, p.name as product_name, p.sku as product_sku'
    },
    job_orders: {
        label: 'Job Orders (JO)',
        icon: '⚙️',
        tableName: 'job_orders',
        primaryKey: 'id',
        displayField: 'jo_number',
        searchFields: ['jo_number', 'assigned_team', 'status', 'notes'],
        editableColumns: [
            'jo_number', 'po_id', 'product_id', 'target_quantity',
            'scheduled_start_date', 'scheduled_end_date', 'assigned_team',
            'status', 'notes'
        ],
        joins: `
            LEFT JOIN purchase_orders po ON job_orders.po_id = po.id
            LEFT JOIN products p ON job_orders.product_id = p.id
        `,
        selectFields: 'job_orders.*, po.po_number, p.name as product_name'
    },
    production_batches: {
        label: 'Production Batches & Yields',
        icon: '🧪',
        tableName: 'production_batches',
        primaryKey: 'id',
        displayField: 'batch_number',
        searchFields: ['batch_number', 'formula_code', 'status', 'compounding_operator', 'qc_notes'],
        editableColumns: [
            'batch_number', 'jo_id', 'product_id', 'formula_code',
            'production_date', 'expiry_date', 'target_quantity',
            'actual_yield', 'variance_quantity', 'variance_percent',
            'status', 'compounding_operator', 'bottling_lead',
            'qc_inspector', 'line_assignment', 'qc_notes'
        ],
        joins: `
            LEFT JOIN job_orders jo ON production_batches.jo_id = jo.id
            LEFT JOIN products p ON production_batches.product_id = p.id
        `,
        selectFields: 'production_batches.*, jo.jo_number, p.name as product_name'
    },
    delivery_receipts: {
        label: 'Delivery Receipts (DR)',
        icon: '🚚',
        tableName: 'delivery_receipts',
        primaryKey: 'id',
        displayField: 'dr_number',
        searchFields: ['dr_number', 'driver_name', 'vehicle_plate', 'status', 'notes'],
        editableColumns: [
            'dr_number', 'client_id', 'po_id', 'jo_id', 'delivery_date',
            'driver_name', 'vehicle_plate', 'status', 'notes'
        ],
        joins: `
            LEFT JOIN clients c ON delivery_receipts.client_id = c.id
            LEFT JOIN purchase_orders po ON delivery_receipts.po_id = po.id
        `,
        selectFields: 'delivery_receipts.*, c.company_name as client_company_name, po.po_number'
    },
    delivery_items: {
        label: 'Delivered Products (DR Items)',
        icon: '📦',
        tableName: 'delivery_items',
        primaryKey: 'id',
        displayField: 'id',
        searchFields: ['id', 'delivered_quantity', 'accepted_quantity', 'rejected_quantity', 'unit_price', 'dr.dr_number', 'po.po_number', 'p.name', 'p.sku', 'pb.batch_number'],
        editableColumns: [
            'dr_id', 'product_id', 'batch_id', 'delivered_quantity',
            'accepted_quantity', 'rejected_quantity', 'unit_price'
        ],
        joins: `
            LEFT JOIN delivery_receipts dr ON delivery_items.dr_id = dr.id
            LEFT JOIN products p ON delivery_items.product_id = p.id
            LEFT JOIN production_batches pb ON delivery_items.batch_id = pb.id
            LEFT JOIN purchase_orders po ON dr.po_id = po.id
        `,
        selectFields: 'delivery_items.*, dr.dr_number, dr.status as dr_status, p.name as product_name, p.sku as product_sku, pb.batch_number, po.po_number'
    },
    sales_invoices: {
        label: 'Sales Invoices',
        icon: '🧾',
        tableName: 'sales_invoices',
        primaryKey: 'id',
        displayField: 'invoice_number',
        searchFields: ['invoice_number', 'status', 'notes'],
        editableColumns: [
            'invoice_number', 'client_id', 'po_id', 'dr_id',
            'invoice_date', 'due_date', 'status', 'subtotal',
            'tax_amount', 'total_amount', 'notes'
        ],
        joins: `
            LEFT JOIN clients c ON sales_invoices.client_id = c.id
            LEFT JOIN purchase_orders po ON sales_invoices.po_id = po.id
            LEFT JOIN delivery_receipts dr ON sales_invoices.dr_id = dr.id
        `,
        selectFields: 'sales_invoices.*, c.company_name as client_company_name, po.po_number, dr.dr_number'
    },
    payments: {
        label: 'Payments & Collections',
        icon: '💳',
        tableName: 'payments',
        primaryKey: 'id',
        displayField: 'payment_number',
        searchFields: ['payment_number', 'payment_method', 'reference_number', 'notes', 'bank_name', 'check_number'],
        editableColumns: [
            'invoice_id', 'client_id', 'payment_number', 'amount', 'payment_method',
            'reference_number', 'notes', 'payment_date', 'check_number', 'bank_name'
        ],
        joins: `
            LEFT JOIN clients c ON payments.client_id = c.id
            LEFT JOIN sales_invoices si ON payments.invoice_id = si.id
        `,
        selectFields: 'payments.*, c.company_name as client_company_name, si.invoice_number'
    },
    cheque_payables: {
        label: 'Cheque Payables / Vouchers',
        icon: '💵',
        tableName: 'cheque_payables',
        primaryKey: 'id',
        displayField: 'request_number',
        searchFields: ['request_number', 'payee_name', 'company_name', 'cheque_number', 'status', 'category', 'purpose'],
        editableColumns: [
            'request_number', 'payee_name', 'company_name', 'amount',
            'bank_account_id', 'bank_name', 'cheque_number', 'cheque_date',
            'due_date', 'status', 'category', 'purpose', 'invoice_reference', 'coo_notes'
        ],
        joins: '',
        selectFields: 'cheque_payables.*'
    },
    clients: {
        label: 'Clients Directory',
        icon: '🏢',
        tableName: 'clients',
        primaryKey: 'id',
        displayField: 'company_name',
        searchFields: ['company_name', 'contact_person', 'email', 'phone', 'tin'],
        editableColumns: [
            'company_name', 'contact_person', 'email', 'phone',
            'address', 'tin', 'default_billing_policy',
            'default_tolerance_percent', 'credit_limit', 'is_active', 'is_vyuceutical_ops'
        ],
        joins: '',
        selectFields: 'clients.*'
    },
    products: {
        label: 'Cosmetic Products',
        icon: '🧴',
        tableName: 'products',
        primaryKey: 'id',
        displayField: 'name',
        searchFields: ['sku', 'name', 'category', 'description', 'formula_code'],
        editableColumns: [
            'sku', 'name', 'category', 'description', 'unit',
            'default_price', 'formula_code', 'shelf_life_months',
            'current_stock', 'is_active'
        ],
        joins: '',
        selectFields: 'products.*'
    },
    raw_materials: {
        label: 'Raw Materials & Stock',
        icon: '🌿',
        tableName: 'raw_materials_inventory',
        primaryKey: 'id',
        displayField: 'material_name',
        searchFields: ['material_code', 'material_name', 'category', 'supplier', 'location', 'batch_lot_number'],
        editableColumns: [
            'material_code', 'material_name', 'category', 'supplier',
            'batch_lot_number', 'expiry_date', 'current_stock', 'unit',
            'minimum_stock_level', 'unit_cost', 'location', 'status'
        ],
        joins: '',
        selectFields: 'raw_materials_inventory.*'
    },
    users: {
        label: 'Staff & System Accounts',
        icon: '👥',
        tableName: 'users',
        primaryKey: 'id',
        displayField: 'email',
        searchFields: ['name', 'email', 'role', 'phone'],
        editableColumns: [
            'name', 'email', 'role', 'client_id', 'phone',
            'is_active', 'plain_password', 'security_pin', 'auto_lock_minutes'
        ],
        joins: `
            LEFT JOIN clients c ON users.client_id = c.id
        `,
        selectFields: 'users.id, users.name, users.email, users.role, users.client_id, users.phone, users.is_active, users.plain_password, users.security_pin, users.auto_lock_minutes, users.created_at, users.updated_at, c.company_name as client_company_name'
    },
    api_keys: {
        label: 'Developer API Keys',
        icon: '🔑',
        tableName: 'api_keys',
        primaryKey: 'id',
        displayField: 'name',
        searchFields: ['name', 'status'],
        editableColumns: [
            'name', 'client_id', 'rate_limit_rpm', 'status', 'expires_at'
        ],
        joins: `
            LEFT JOIN clients c ON api_keys.client_id = c.id
            LEFT JOIN users u ON api_keys.user_id = u.id
        `,
        selectFields: `api_keys.id, api_keys.name, '••••••••••••••••' AS key_token, '••••••••••••••••' AS key_prefix, '••••••••••••••••' AS key_hash, api_keys.client_id, api_keys.user_id, api_keys.scopes, api_keys.rate_limit_rpm, api_keys.status, api_keys.expires_at, api_keys.created_at, api_keys.updated_at, c.company_name as client_company_name, u.name as created_by_name`
    },
    order_categories: {
        label: 'Order Categories & Colors',
        icon: '🏷️',
        tableName: 'order_categories',
        primaryKey: 'id',
        displayField: 'name',
        searchFields: ['name', 'description'],
        editableColumns: ['name', 'color', 'description'],
        joins: '',
        selectFields: 'order_categories.*, (SELECT COUNT(*) FROM purchase_orders WHERE LOWER(category) = LOWER(order_categories.name)) as order_count'
    }
};

// Mask sensitive security columns (API keys, hashes, secrets)
function maskSensitiveFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const masked = { ...obj };
    for (const key of Object.keys(masked)) {
        if (/^(key_hash|key_prefix|api_key|api_key_used|secret)$/i.test(key)) {
            masked[key] = '••••••••••••••••';
        }
    }
    return masked;
}

// Access Control: Super Admin and IT Admin (and Admin) only
const authorizeITAdmin = [authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN)];

/**
 * GET /api/it-management/tables
 * List registered tables and their editable fields
 */
router.get('/tables', ...authorizeITAdmin, (req, res) => {
    const list = Object.keys(TABLE_DEFINITIONS).map(key => ({
        key,
        label: TABLE_DEFINITIONS[key].label,
        icon: TABLE_DEFINITIONS[key].icon,
        tableName: TABLE_DEFINITIONS[key].tableName,
        primaryKey: TABLE_DEFINITIONS[key].primaryKey,
        displayField: TABLE_DEFINITIONS[key].displayField,
        editableColumns: TABLE_DEFINITIONS[key].editableColumns
    }));
    return res.json({ success: true, data: list });
});

/**
 * GET /api/it-management/lookups
 * Pre-load foreign key lookups for form dropdowns
 */
router.get('/lookups', ...authorizeITAdmin, (req, res) => {
    try {
        const clients = db.prepare('SELECT id, company_name, contact_person, email FROM clients ORDER BY company_name ASC').all();
        const products = db.prepare('SELECT id, name, sku, default_price FROM products ORDER BY name ASC').all();
        const orders = db.prepare('SELECT id, po_number, so_number, client_id, status FROM purchase_orders ORDER BY po_number DESC LIMIT 200').all();
        const jobOrders = db.prepare('SELECT id, jo_number, po_id, status FROM job_orders ORDER BY jo_number DESC LIMIT 200').all();
        const batches = db.prepare('SELECT id, batch_number, status FROM production_batches ORDER BY batch_number DESC LIMIT 200').all();
        const deliveryReceipts = db.prepare(`
            SELECT dr.id, dr.dr_number, dr.po_id, dr.status, dr.delivery_date,
                   c.company_name, po.po_number,
                   (SELECT COUNT(*) FROM delivery_items WHERE dr_id = dr.id) as item_count,
                   (SELECT COALESCE(SUM(delivered_quantity), 0) FROM delivery_items WHERE dr_id = dr.id) as total_delivered_qty
            FROM delivery_receipts dr
            LEFT JOIN clients c ON dr.client_id = c.id
            LEFT JOIN purchase_orders po ON dr.po_id = po.id
            ORDER BY dr.dr_number DESC
            LIMIT 500
        `).all();
        const users = db.prepare('SELECT id, name, email, role FROM users ORDER BY name ASC').all();
        const orderCategories = db.prepare('SELECT id, name, color, description FROM order_categories ORDER BY name ASC').all();

        return res.json({
            success: true,
            data: {
                clients,
                products,
                orders,
                jobOrders,
                batches,
                deliveryReceipts,
                users,
                orderCategories,
                statuses: {
                    purchase_orders: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED', 'COMPLETED', 'CANCELLED', 'VOIDED'],
                    job_orders: ['PENDING', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED'],
                    production_batches: ['PLANNED', 'MIXING', 'BOTTLING', 'QC_PASSED', 'EXCEPTION_REQUIRES_APPROVAL', 'APPROVED_FOR_DISPATCH', 'COMPLETED', 'REJECTED'],
                    delivery_receipts: ['DRAFT', 'DISPATCHED', 'PENDING_CLIENT_ACCEPTANCE', 'ACCEPTED', 'INVOICED', 'REJECTED', 'CANCELLED'],
                    sales_invoices: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
                    payments: ['PENDING', 'VERIFIED', 'REJECTED', 'CANCELLED'],
                    cheque_payables: ['PENDING_COO_APPROVAL', 'CONFIRMED', 'ISSUED', 'CLEARED', 'REJECTED', 'VOIDED'],
                    users: ['SUPER_ADMIN', 'IT_ADMIN', 'ADMIN', 'CEO', 'QC', 'PURCHASING', 'PRODUCTION', 'WAREHOUSE', 'ACCOUNTING', 'INVENTORY', 'COMPOUNDING', 'CLIENT'],
                    api_keys: ['ACTIVE', 'REVOKED', 'EXPIRED']
                }
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/it-management/records/:table
 * Fetch records for a table with pagination and search
 */
router.get('/records/:table', ...authorizeITAdmin, (req, res) => {
    const { table } = req.params;
    const def = TABLE_DEFINITIONS[table];
    if (!def) {
        return res.status(400).json({ success: false, error: `Table '${table}' is not registered in IT Management.` });
    }

    const { search, limit = 50, page = 1, sortBy, sortOrder = 'DESC' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    try {
        let whereClauses = ['1=1'];
        const params = [];

        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            const orConditions = def.searchFields.map(field => field.includes('.') ? `${field} LIKE ?` : `${def.tableName}.${field} LIKE ?`);
            orConditions.push(`${def.tableName}.${def.primaryKey} LIKE ?`);
            whereClauses.push(`(${orConditions.join(' OR ')})`);
            for (let i = 0; i < orConditions.length; i++) {
                params.push(term);
            }
        }

        const whereSql = whereClauses.join(' AND ');

        // Total count
        const countRow = db.prepare(`
            SELECT COUNT(*) as total 
            FROM ${def.tableName} 
            ${def.joins} 
            WHERE ${whereSql}
        `).get(...params);

        const totalRecords = countRow ? countRow.total : 0;

        // Order by
        const orderCol = sortBy && def.editableColumns.includes(sortBy) 
            ? `${def.tableName}.${sortBy}` 
            : `${def.tableName}.${def.primaryKey}`;
        const orderDir = (sortOrder.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

        const rows = db.prepare(`
            SELECT ${def.selectFields}
            FROM ${def.tableName}
            ${def.joins}
            WHERE ${whereSql}
            ORDER BY ${orderCol} ${orderDir}
            LIMIT ? OFFSET ?
        `).all(...params, limitNum, offset);

        const sanitizedRows = rows.map(maskSensitiveFields);

        return res.json({
            success: true,
            table,
            data: sanitizedRows,
            pagination: {
                total: totalRecords,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(totalRecords / limitNum) || 1
            },
            definition: {
                label: def.label,
                icon: def.icon,
                primaryKey: def.primaryKey,
                displayField: def.displayField,
                editableColumns: def.editableColumns
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/it-management/records/:table/:id
 * Retrieve a single record with all raw fields
 */
router.get('/records/:table/:id', ...authorizeITAdmin, (req, res) => {
    const { table, id } = req.params;
    const def = TABLE_DEFINITIONS[table];
    if (!def) {
        return res.status(400).json({ success: false, error: `Table '${table}' is not registered.` });
    }

    try {
        const row = db.prepare(`
            SELECT ${def.selectFields}
            FROM ${def.tableName}
            ${def.joins}
            WHERE ${def.tableName}.${def.primaryKey} = ?
        `).get(id);

        if (!row) {
            return res.status(404).json({ success: false, error: `Record not found in ${def.label}.` });
        }

        return res.json({
            success: true,
            data: maskSensitiveFields(row),
            definition: def
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/it-management/records/:table/:id
 * Universal edit for any record in the system
 */
router.put('/records/:table/:id', ...authorizeITAdmin, (req, res) => {
    const { table, id } = req.params;
    const def = TABLE_DEFINITIONS[table];
    if (!def) {
        return res.status(400).json({ success: false, error: `Table '${table}' is not registered.` });
    }

    const payload = req.body || {};
    const updates = {};
    const previousValues = {};

    // Validate and whitelist fields, strictly rejecting any sensitive keys
    for (const key of Object.keys(payload)) {
        if (def.editableColumns.includes(key) && !/^(key_hash|key_prefix|api_key|api_key_used|secret)$/i.test(key)) {
            updates[key] = payload[key];
        }
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No valid editable fields provided in update payload.' });
    }

    const currentRecord = db.prepare(`SELECT * FROM ${def.tableName} WHERE ${def.primaryKey} = ?`).get(id);
    if (!currentRecord) {
        return res.status(404).json({ success: false, error: `Record not found in ${def.label}.` });
    }

    for (const key of Object.keys(updates)) {
        previousValues[key] = currentRecord[key];
    }

    const updateTx = db.transaction(() => {
        const setClauses = [];
        const setParams = [];

        for (const [col, val] of Object.entries(updates)) {
            setClauses.push(`${col} = ?`);
            setParams.push(val);
        }

        // If table has updated_at column, update it
        try {
            const tableCols = db.prepare(`PRAGMA table_info(${def.tableName})`).all();
            const hasUpdatedAt = tableCols.some(c => c.name === 'updated_at');
            if (hasUpdatedAt && !updates.updated_at) {
                setClauses.push("updated_at = datetime('now', 'localtime')");
            }
        } catch (_) {}

        setParams.push(id);

        const sql = `UPDATE ${def.tableName} SET ${setClauses.join(', ')} WHERE ${def.primaryKey} = ?`;
        db.prepare(sql).run(...setParams);

        // Special handling: if purchase_orders.client_id changed, cascade to DRs, Invoices, and Payments
        if (table === 'purchase_orders' && updates.client_id && updates.client_id !== currentRecord.client_id) {
            db.prepare('UPDATE delivery_receipts SET client_id = ? WHERE po_id = ?').run(updates.client_id, id);
            db.prepare('UPDATE sales_invoices SET client_id = ? WHERE po_id = ?').run(updates.client_id, id);
            db.prepare('UPDATE payments SET client_id = ? WHERE invoice_id IN (SELECT id FROM sales_invoices WHERE po_id = ?)').run(updates.client_id, id);
        }

        // Special handling: if delivery_items changed, sync purchase_order_items.delivered_quantity
        if (table === 'delivery_items') {
            const drId = updates.dr_id || currentRecord.dr_id;
            const dr = db.prepare('SELECT po_id FROM delivery_receipts WHERE id = ?').get(drId);
            if (dr && dr.po_id) {
                db.prepare(`
                    UPDATE purchase_order_items
                    SET delivered_quantity = (
                        SELECT COALESCE(SUM(di.delivered_quantity), 0)
                        FROM delivery_items di
                        JOIN delivery_receipts dr2 ON di.dr_id = dr2.id
                        WHERE dr2.po_id = ? AND di.product_id = purchase_order_items.product_id
                    )
                    WHERE po_id = ?
                `).run(dr.po_id, dr.po_id);
            }
        }

        // Audit Trail Logging
        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'IT_MANAGEMENT_OVERRIDE_RECORD',
            entityType: table.toUpperCase(),
            entityId: id,
            details: {
                table,
                id,
                displayField: currentRecord[def.displayField] || id,
                updatedFields: Object.keys(updates),
                previousValues,
                newValues: updates,
                modifiedBy: req.user.name,
                ip: req.ip
            }
        });

        return db.prepare(`SELECT * FROM ${def.tableName} WHERE ${def.primaryKey} = ?`).get(id);
    });

    try {
        const updated = updateTx();
        return res.json({
            success: true,
            message: `Record ${id} in ${def.label} updated successfully.`,
            data: maskSensitiveFields(updated)
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/it-management/quick-actions/reassign-po-client
 * Reassign any PO to a new client with cascade
 */
router.post('/quick-actions/reassign-po-client', ...authorizeITAdmin, (req, res) => {
    const { poId, poNumber, newClientId, cascade = true } = req.body || {};

    let po = null;
    if (poId) {
        po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
    } else if (poNumber) {
        po = db.prepare('SELECT * FROM purchase_orders WHERE po_number = ?').get(poNumber);
    }

    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    const newClient = db.prepare('SELECT * FROM clients WHERE id = ? OR company_name LIKE ?').get(newClientId, `%${newClientId}%`);
    if (!newClient) {
        return res.status(404).json({ success: false, error: 'Target Client not found.' });
    }

    const oldClient = db.prepare('SELECT company_name FROM clients WHERE id = ?').get(po.client_id);
    const oldClientName = oldClient ? oldClient.company_name : po.client_id;

    const reassignTx = db.transaction(() => {
        db.prepare("UPDATE purchase_orders SET client_id = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(newClient.id, po.id);

        let drsCount = 0;
        let invoicesCount = 0;
        let paymentsCount = 0;

        if (cascade) {
            const drResult = db.prepare('UPDATE delivery_receipts SET client_id = ? WHERE po_id = ?').run(newClient.id, po.id);
            drsCount = drResult.changes;

            const invResult = db.prepare('UPDATE sales_invoices SET client_id = ? WHERE po_id = ?').run(newClient.id, po.id);
            invoicesCount = invResult.changes;

            const payResult = db.prepare(`
                UPDATE payments 
                SET client_id = ? 
                WHERE invoice_id IN (SELECT id FROM sales_invoices WHERE po_id = ?)
            `).run(newClient.id, po.id);
            paymentsCount = payResult.changes;
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'IT_MANAGEMENT_REASSIGN_PO_CLIENT',
            entityType: 'PURCHASE_ORDER',
            entityId: po.po_number,
            details: {
                poId: po.id,
                poNumber: po.po_number,
                previousClientId: po.client_id,
                previousClientName: oldClientName,
                newClientId: newClient.id,
                newClientName: newClient.company_name,
                cascadedDeliveries: drsCount,
                cascadedInvoices: invoicesCount,
                cascadedPayments: paymentsCount,
                reassignedBy: req.user.name
            }
        });

        return {
            poId: po.id,
            poNumber: po.po_number,
            newClientId: newClient.id,
            newClientName: newClient.company_name,
            cascadedDeliveries: drsCount,
            cascadedInvoices: invoicesCount,
            cascadedPayments: paymentsCount
        };
    });

    try {
        const result = reassignTx();
        return res.json({
            success: true,
            message: `Purchase Order ${po.po_number} successfully reassigned to ${newClient.company_name}.`,
            data: result
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/it-management/quick-actions/override-status
 * Override status of any document
 */
router.post('/quick-actions/override-status', ...authorizeITAdmin, (req, res) => {
    const { table, id, newStatus, reason } = req.body || {};
    const def = TABLE_DEFINITIONS[table];
    if (!def) {
        return res.status(400).json({ success: false, error: `Table '${table}' is not registered.` });
    }

    if (!newStatus || !newStatus.trim()) {
        return res.status(400).json({ success: false, error: 'New status is required.' });
    }

    const currentRecord = db.prepare(`SELECT * FROM ${def.tableName} WHERE ${def.primaryKey} = ?`).get(id);
    if (!currentRecord) {
        return res.status(404).json({ success: false, error: 'Record not found.' });
    }

    const oldStatus = currentRecord.status;

    try {
        db.prepare(`UPDATE ${def.tableName} SET status = ?, updated_at = datetime('now', 'localtime') WHERE ${def.primaryKey} = ?`).run(newStatus.trim(), id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'IT_MANAGEMENT_OVERRIDE_STATUS',
            entityType: table.toUpperCase(),
            entityId: id,
            details: {
                table,
                id,
                identifier: currentRecord[def.displayField] || id,
                oldStatus,
                newStatus: newStatus.trim(),
                reason: reason || 'IT Management Status Override',
                modifiedBy: req.user.name
            }
        });

        return res.json({
            success: true,
            message: `Status updated from "${oldStatus}" to "${newStatus.trim()}".`,
            data: { id, oldStatus, newStatus: newStatus.trim() }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/it-management/records/:table/:id
 * Delete record with safety checks and audit logging
 */
router.delete('/records/:table/:id', ...authorizeITAdmin, (req, res) => {
    const { table, id } = req.params;
    const def = TABLE_DEFINITIONS[table];
    if (!def) {
        return res.status(400).json({ success: false, error: `Table '${table}' is not registered.` });
    }

    const currentRecord = db.prepare(`SELECT * FROM ${def.tableName} WHERE ${def.primaryKey} = ?`).get(id);
    if (!currentRecord) {
        return res.status(404).json({ success: false, error: 'Record not found.' });
    }

    try {
        let poIdToSync = null;
        if (table === 'delivery_items' && currentRecord.dr_id) {
            const dr = db.prepare('SELECT po_id FROM delivery_receipts WHERE id = ?').get(currentRecord.dr_id);
            if (dr) poIdToSync = dr.po_id;
        }

        db.prepare(`DELETE FROM ${def.tableName} WHERE ${def.primaryKey} = ?`).run(id);

        if (poIdToSync) {
            db.prepare(`
                UPDATE purchase_order_items
                SET delivered_quantity = (
                    SELECT COALESCE(SUM(di.delivered_quantity), 0)
                    FROM delivery_items di
                    JOIN delivery_receipts dr2 ON di.dr_id = dr2.id
                    WHERE dr2.po_id = ? AND di.product_id = purchase_order_items.product_id
                )
                WHERE po_id = ?
            `).run(poIdToSync, poIdToSync);
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'IT_MANAGEMENT_DELETE_RECORD',
            entityType: table.toUpperCase(),
            entityId: id,
            details: {
                table,
                id,
                deletedRecord: currentRecord,
                deletedBy: req.user.name
            }
        });

        return res.json({
            success: true,
            message: `Record ${id} deleted from ${def.label}.`
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: `Cannot delete record: It may be referenced by other records (${err.message})`
        });
    }
});

/**
 * GET /api/it-management/delivered-products/drs
 * List all delivery receipts with their delivered product statistics for quick selection
 */
router.get('/delivered-products/drs', ...authorizeITAdmin, (req, res) => {
    try {
        const drs = db.prepare(`
            SELECT dr.id, dr.dr_number, dr.client_id, dr.po_id, dr.delivery_date, dr.driver_name,
                   dr.vehicle_plate, dr.status, dr.notes,
                   c.company_name, po.po_number,
                   (SELECT COUNT(*) FROM delivery_items WHERE dr_id = dr.id) as items_count,
                   (SELECT COUNT(*) FROM delivery_items WHERE dr_id = dr.id) as item_count,
                   (SELECT COALESCE(SUM(delivered_quantity), 0) FROM delivery_items WHERE dr_id = dr.id) as total_delivered,
                   (SELECT COALESCE(SUM(delivered_quantity), 0) FROM delivery_items WHERE dr_id = dr.id) as total_delivered_qty,
                   (SELECT COALESCE(SUM(accepted_quantity), 0) FROM delivery_items WHERE dr_id = dr.id) as total_accepted,
                   (SELECT COALESCE(SUM(rejected_quantity), 0) FROM delivery_items WHERE dr_id = dr.id) as total_rejected
            FROM delivery_receipts dr
            LEFT JOIN clients c ON dr.client_id = c.id
            LEFT JOIN purchase_orders po ON dr.po_id = po.id
            ORDER BY dr.dr_number DESC
            LIMIT 500
        `).all();
        return res.json({ success: true, data: drs });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/it-management/delivered-products/drs/:drId
 * Get a specific Delivery Receipt and all its delivered products
 */
router.get('/delivered-products/drs/:drId', ...authorizeITAdmin, (req, res) => {
    const { drId } = req.params;
    try {
        const dr = db.prepare(`
            SELECT dr.*, c.company_name, po.po_number
            FROM delivery_receipts dr
            LEFT JOIN clients c ON dr.client_id = c.id
            LEFT JOIN purchase_orders po ON dr.po_id = po.id
            WHERE dr.id = ? OR dr.dr_number = ?
        `).get(drId, drId);

        if (!dr) {
            return res.status(404).json({ success: false, error: 'Delivery Receipt not found.' });
        }

        const items = db.prepare(`
            SELECT di.*, p.name as product_name, p.sku as product_sku, pb.batch_number
            FROM delivery_items di
            LEFT JOIN products p ON di.product_id = p.id
            LEFT JOIN production_batches pb ON di.batch_id = pb.id
            WHERE di.dr_id = ?
            ORDER BY di.created_at ASC
        `).all(dr.id);

        return res.json({
            success: true,
            data: {
                dr,
                items
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/it-management/delivered-products/drs/:drId
 * Update delivered products for a Delivery Receipt
 */
router.put('/delivered-products/drs/:drId', ...authorizeITAdmin, (req, res) => {
    const { drId } = req.params;
    const { items, reason } = req.body || {};

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ success: false, error: 'Items array is required.' });
    }

    const dr = db.prepare('SELECT * FROM delivery_receipts WHERE id = ? OR dr_number = ?').get(drId, drId);
    if (!dr) {
        return res.status(404).json({ success: false, error: 'Delivery Receipt not found.' });
    }

    try {
        const previousItems = db.prepare('SELECT * FROM delivery_items WHERE dr_id = ?').all(dr.id);

        const updateTx = db.transaction(() => {
            const incomingIds = items.filter(it => it.id && !it.id.startsWith('new_')).map(it => it.id);

            // Delete removed items
            const toDelete = previousItems.filter(p => !incomingIds.includes(p.id));
            for (const del of toDelete) {
                db.prepare('DELETE FROM delivery_items WHERE id = ?').run(del.id);
            }

            // Update or insert items
            for (const item of items) {
                const deliveredQty = parseInt(item.delivered_quantity, 10) || 0;
                const acceptedQty = parseInt(item.accepted_quantity !== undefined ? item.accepted_quantity : deliveredQty, 10) || 0;
                const rejectedQty = parseInt(item.rejected_quantity || 0, 10) || 0;
                const unitPrice = parseFloat(item.unit_price) || 0.0;

                if (!item.product_id) {
                    throw new Error('Product is required for each delivered item.');
                }
                if (deliveredQty <= 0) {
                    throw new Error('Delivered quantity must be greater than 0.');
                }

                // Resolve valid batch_id if not provided to satisfy database constraints
                let resolvedBatchId = item.batch_id;
                if (!resolvedBatchId) {
                    const existingBatch = db.prepare(`
                        SELECT pb.id FROM production_batches pb
                        LEFT JOIN job_orders jo ON pb.jo_id = jo.id
                        WHERE (jo.po_id = ? AND pb.product_id = ?) OR pb.product_id = ?
                        LIMIT 1
                    `).get(dr.po_id, item.product_id, item.product_id) || db.prepare("SELECT id FROM production_batches LIMIT 1").get();

                    if (existingBatch) {
                        resolvedBatchId = existingBatch.id;
                    } else {
                        resolvedBatchId = uuidv4();
                        try {
                            db.prepare(`
                                INSERT INTO production_batches (id, batch_number, product_id, status, created_at, updated_at)
                                VALUES (?, ?, ?, 'COMPLETED', datetime('now', 'localtime'), datetime('now', 'localtime'))
                            `).run(resolvedBatchId, 'BATCH-AUTO-' + Date.now(), item.product_id);
                        } catch (_) {}
                    }
                }

                if (item.id && !item.id.startsWith('new_') && previousItems.some(p => p.id === item.id)) {
                    // Update existing
                    db.prepare(`
                        UPDATE delivery_items
                        SET product_id = ?, batch_id = ?, delivered_quantity = ?, accepted_quantity = ?, rejected_quantity = ?, unit_price = ?
                        WHERE id = ? AND dr_id = ?
                    `).run(item.product_id, resolvedBatchId, deliveredQty, acceptedQty, rejectedQty, unitPrice, item.id, dr.id);
                } else {
                    // Insert new
                    const newId = uuidv4();
                    db.prepare(`
                        INSERT INTO delivery_items (id, dr_id, product_id, batch_id, delivered_quantity, accepted_quantity, rejected_quantity, unit_price)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(newId, dr.id, item.product_id, resolvedBatchId, deliveredQty, acceptedQty, rejectedQty, unitPrice);
                }
            }

            // Synchronize delivered_quantity in purchase_order_items for the linked PO
            if (dr.po_id) {
                db.prepare(`
                    UPDATE purchase_order_items
                    SET delivered_quantity = (
                        SELECT COALESCE(SUM(di.delivered_quantity), 0)
                        FROM delivery_items di
                        JOIN delivery_receipts dr2 ON di.dr_id = dr2.id
                        WHERE dr2.po_id = ? AND di.product_id = purchase_order_items.product_id
                    )
                    WHERE po_id = ?
                `).run(dr.po_id, dr.po_id);
            }

            // Update DR notes if reason provided
            if (reason) {
                const appendNote = `[IT EDIT ${getManilaDate()} by ${req.user.name}: ${reason}]`;
                const newNotes = dr.notes ? `${dr.notes}\n${appendNote}` : appendNote;
                db.prepare("UPDATE delivery_receipts SET notes = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(newNotes, dr.id);
            }

            logAudit({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: 'IT_MANAGEMENT_EDIT_DELIVERED_PRODUCTS',
                entityType: 'DELIVERY_RECEIPT',
                entityId: dr.dr_number,
                details: {
                    drId: dr.id,
                    drNumber: dr.dr_number,
                    poId: dr.po_id,
                    previousItemsCount: previousItems.length,
                    newItemsCount: items.length,
                    reason: reason || 'Administrative correction of delivered products'
                }
            });
        });

        updateTx();

        const updatedItems = db.prepare(`
            SELECT di.*, p.name as product_name, p.sku as product_sku, pb.batch_number
            FROM delivery_items di
            LEFT JOIN products p ON di.product_id = p.id
            LEFT JOIN production_batches pb ON di.batch_id = pb.id
            WHERE di.dr_id = ?
            ORDER BY di.created_at ASC
        `).all(dr.id);

        return res.json({
            success: true,
            message: `Delivered products for DR ${dr.dr_number} successfully updated.`,
            data: updatedItems
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/it-management/delivered-items/:id
 * Directly update a single delivered product item
 */
router.put('/delivered-items/:id', ...authorizeITAdmin, (req, res) => {
    const { id } = req.params;
    const { product_id, batch_id, delivered_quantity, accepted_quantity, rejected_quantity, unit_price, reason } = req.body || {};

    const item = db.prepare('SELECT * FROM delivery_items WHERE id = ?').get(id);
    if (!item) {
        return res.status(404).json({ success: false, error: 'Delivered product item not found.' });
    }

    const dr = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(item.dr_id);

    try {
        const newProduct = product_id || item.product_id;
        const newBatch = batch_id !== undefined ? batch_id : item.batch_id;
        const newDelivered = delivered_quantity !== undefined ? parseInt(delivered_quantity, 10) : item.delivered_quantity;
        const newAccepted = accepted_quantity !== undefined ? parseInt(accepted_quantity, 10) : item.accepted_quantity;
        const newRejected = rejected_quantity !== undefined ? parseInt(rejected_quantity, 10) : item.rejected_quantity;
        const newPrice = unit_price !== undefined ? parseFloat(unit_price) : item.unit_price;

        if (newDelivered <= 0) {
            return res.status(400).json({ success: false, error: 'Delivered quantity must be greater than 0.' });
        }

        db.prepare(`
            UPDATE delivery_items
            SET product_id = ?, batch_id = ?, delivered_quantity = ?, accepted_quantity = ?, rejected_quantity = ?, unit_price = ?
            WHERE id = ?
        `).run(newProduct, newBatch, newDelivered, newAccepted, newRejected, newPrice, id);

        if (dr && dr.po_id) {
            db.prepare(`
                UPDATE purchase_order_items
                SET delivered_quantity = (
                    SELECT COALESCE(SUM(di.delivered_quantity), 0)
                    FROM delivery_items di
                    JOIN delivery_receipts dr2 ON di.dr_id = dr2.id
                    WHERE dr2.po_id = ? AND di.product_id = purchase_order_items.product_id
                )
                WHERE po_id = ?
            `).run(dr.po_id, dr.po_id);
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'IT_MANAGEMENT_EDIT_DELIVERED_ITEM',
            entityType: 'DELIVERY_ITEM',
            entityId: id,
            details: {
                itemId: id,
                drId: item.dr_id,
                drNumber: dr ? dr.dr_number : null,
                previousValues: item,
                newValues: {
                    product_id: newProduct,
                    batch_id: newBatch,
                    delivered_quantity: newDelivered,
                    accepted_quantity: newAccepted,
                    rejected_quantity: newRejected,
                    unit_price: newPrice
                },
                reason: reason || 'Individual delivered item modification'
            }
        });

        const updated = db.prepare(`
            SELECT di.*, p.name as product_name, p.sku as product_sku, pb.batch_number
            FROM delivery_items di
            LEFT JOIN products p ON di.product_id = p.id
            LEFT JOIN production_batches pb ON di.batch_id = pb.id
            WHERE di.id = ?
        `).get(id);

        return res.json({
            success: true,
            message: 'Delivered item updated successfully.',
            data: updated
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

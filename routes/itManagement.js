/**
 * NKB Manufacturing & Trading
 * IT Management & Master Records Editor Route
 * 
 * Provides authorized IT Administrators and Super Admins universal inspection,
 * editing, override, and reassignment capabilities across all operational tables.
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { ROLES } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');

// Whitelist of manageable tables and their field definitions
const TABLE_DEFINITIONS = {
    purchase_orders: {
        label: 'Purchase Orders & SOs',
        icon: '📋',
        tableName: 'purchase_orders',
        primaryKey: 'id',
        displayField: 'po_number',
        searchFields: ['po_number', 'so_number', 'notes', 'status'],
        editableColumns: [
            'client_id', 'po_number', 'so_number', 'status', 'po_date',
            'expected_delivery_date', 'tolerance_percent', 'billing_policy',
            'subtotal', 'tax_percent', 'tax_amount', 'grand_total',
            'form_of_payment', 'notes', 'accounting_confirmed', 'inventory_confirmed',
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
        displayField: 'payment_reference',
        searchFields: ['payment_reference', 'payment_method', 'status', 'notes'],
        editableColumns: [
            'invoice_id', 'client_id', 'amount', 'payment_method',
            'payment_reference', 'status', 'notes', 'payment_date'
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
        displayField: 'voucher_number',
        searchFields: ['voucher_number', 'payee_name', 'company', 'cheque_number', 'status', 'expense_category'],
        editableColumns: [
            'voucher_number', 'payee_name', 'company', 'amount',
            'bank_id', 'bank_name', 'cheque_number', 'issue_date',
            'due_date', 'status', 'expense_category', 'description'
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
        tableName: 'raw_materials',
        primaryKey: 'id',
        displayField: 'material_name',
        searchFields: ['material_code', 'material_name', 'category'],
        editableColumns: [
            'material_code', 'material_name', 'category', 'current_stock',
            'unit', 'minimum_stock_level', 'unit_cost'
        ],
        joins: '',
        selectFields: 'raw_materials.*'
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
    }
};

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
        const users = db.prepare('SELECT id, name, email, role FROM users ORDER BY name ASC').all();

        return res.json({
            success: true,
            data: {
                clients,
                products,
                orders,
                jobOrders,
                batches,
                users,
                statuses: {
                    purchase_orders: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED', 'COMPLETED', 'CANCELLED', 'VOIDED'],
                    job_orders: ['PENDING', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED'],
                    production_batches: ['PLANNED', 'MIXING', 'BOTTLING', 'QC_PASSED', 'EXCEPTION_REQUIRES_APPROVAL', 'APPROVED_FOR_DISPATCH', 'COMPLETED', 'REJECTED'],
                    delivery_receipts: ['DRAFT', 'DISPATCHED', 'PENDING_CLIENT_ACCEPTANCE', 'ACCEPTED', 'INVOICED', 'REJECTED', 'CANCELLED'],
                    sales_invoices: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
                    payments: ['PENDING', 'VERIFIED', 'REJECTED', 'CANCELLED'],
                    cheque_payables: ['PENDING_COO', 'CONFIRMED_COO', 'RELEASED', 'CLEARED', 'CANCELLED', 'REJECTED'],
                    users: ['SUPER_ADMIN', 'IT_ADMIN', 'ADMIN', 'CEO', 'QC', 'PURCHASING', 'PRODUCTION', 'WAREHOUSE', 'ACCOUNTING', 'INVENTORY', 'CLIENT']
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
            const orConditions = def.searchFields.map(field => `${def.tableName}.${field} LIKE ?`);
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

        return res.json({
            success: true,
            table,
            data: rows,
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
            data: row,
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

    // Validate and whitelist fields
    for (const key of Object.keys(payload)) {
        if (def.editableColumns.includes(key)) {
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
            data: updated
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
        db.prepare(`DELETE FROM ${def.tableName} WHERE ${def.primaryKey} = ?`).run(id);

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

module.exports = router;

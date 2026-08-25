const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles, enforceClientIsolation } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/clients
 * Admin: all clients. Client: only their own client profile.
 */
router.get('/', authenticateToken, enforceClientIsolation, (req, res) => {
    if (req.user.role === 'CLIENT') {
        const client = db.prepare(`
            SELECT c.*, u.id as user_id, u.email as user_email, u.is_active as user_active
            FROM clients c
            LEFT JOIN users u ON u.client_id = c.id
            WHERE c.id = ?
        `).get(req.clientId);
        return res.json({ success: true, data: client ? [client] : [] });
    }

    const { search } = req.query;
    let query = `
        SELECT c.*, u.id as user_id, u.email as user_email, u.is_active as user_active
        FROM clients c
        LEFT JOIN users u ON u.client_id = c.id
        WHERE 1=1
    `;
    const params = [];

    if (search) {
        query += ' AND (c.company_name LIKE ? OR c.contact_person LIKE ? OR c.email LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    query += ' ORDER BY c.company_name ASC';
    const clients = db.prepare(query).all(...params);

    return res.json({ success: true, data: clients });
});

/**
 * GET /api/clients/:id
 */
router.get('/:id', authenticateToken, enforceClientIsolation, (req, res) => {
    const { id } = req.params;

    if (req.user.role === 'CLIENT' && req.clientId !== id) {
        return res.status(403).json({ success: false, error: 'Access denied to other client records.', code: 'FORBIDDEN' });
    }

    const client = db.prepare(`
        SELECT c.*, u.id as user_id, u.email as user_email, u.is_active as user_active
        FROM clients c
        LEFT JOIN users u ON u.client_id = c.id
        WHERE c.id = ?
    `).get(id);
    if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    return res.json({ success: true, data: client });
});

/**
 * POST /api/clients
 * Admin only (Creates client + Optional/Default Client Portal Login Account)
 */
router.post('/', authenticateToken, requireRoles('ADMIN', 'ACCOUNTING', 'SUPER_ADMIN'), (req, res) => {
    const { 
        company_name, 
        contact_person, 
        email, 
        phone, 
        address, 
        tin, 
        default_billing_policy, 
        default_tolerance_percent, 
        credit_limit,
        create_portal_account = true,
        default_password = 'Client123!'
    } = req.body;

    if (!company_name || !contact_person || !email || !phone || !address) {
        return res.status(400).json({ success: false, error: 'Company name, contact person, email, phone, and address are required.' });
    }

    const clientId = uuidv4();
    const cleanEmail = email.trim().toLowerCase();

    try {
        db.prepare(`
            INSERT INTO clients (id, company_name, contact_person, email, phone, address, tin, default_billing_policy, default_tolerance_percent, credit_limit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            clientId,
            company_name.trim(),
            contact_person.trim(),
            cleanEmail,
            phone.trim(),
            address.trim(),
            tin ? tin.trim() : null,
            default_billing_policy || 'ACTUAL_DELIVERY',
            default_tolerance_percent !== undefined ? parseFloat(default_tolerance_percent) : 10.0,
            credit_limit !== undefined ? parseFloat(credit_limit) : 500000.0
        );

        let createdUser = null;
        if (create_portal_account) {
            const userId = uuidv4();
            const passwordToHash = default_password || 'Client123!';
            const passwordHash = bcrypt.hashSync(passwordToHash, 10);

            const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
            if (!existingUser) {
                db.prepare(`
                    INSERT INTO users (id, name, email, password_hash, role, client_id, phone, is_active)
                    VALUES (?, ?, ?, ?, 'CLIENT', ?, ?, 1)
                `).run(
                    userId,
                    `${contact_person.trim()} (${company_name.trim()})`,
                    cleanEmail,
                    passwordHash,
                    clientId,
                    phone.trim()
                );
                createdUser = {
                    id: userId,
                    email: cleanEmail,
                    role: 'CLIENT',
                    default_password: passwordToHash
                };
            }
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_CLIENT',
            entityType: 'CLIENT',
            entityId: clientId,
            details: { company_name, email: cleanEmail, portalAccountCreated: !!createdUser }
        });

        const newClient = db.prepare(`
            SELECT c.*, u.id as user_id, u.email as user_email, u.is_active as user_active
            FROM clients c
            LEFT JOIN users u ON u.client_id = c.id
            WHERE c.id = ?
        `).get(clientId);

        return res.status(201).json({ 
            success: true, 
            data: newClient,
            credentials: createdUser ? {
                email: cleanEmail,
                password: default_password || 'Client123!',
                note: 'Client can log in using these default credentials and change password upon login.'
            } : null
        });
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed: clients.email')) {
            return res.status(400).json({ success: false, error: `A client with email "${email}" already exists.` });
        }
        throw err;
    }
});

/**
 * POST /api/clients/:id/credentials/reset
 * Admin: Reset or create client portal login credentials
 */
router.post('/:id/credentials/reset', authenticateToken, requireRoles('ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id } = req.params;
    const { new_password = 'Client123!' } = req.body;

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    const passwordHash = bcrypt.hashSync(new_password, 10);
    const existingUser = db.prepare('SELECT * FROM users WHERE client_id = ? OR LOWER(email) = LOWER(?)').get(id, client.email);

    if (existingUser) {
        db.prepare("UPDATE users SET password_hash = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?").run(passwordHash, existingUser.id);
        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'RESET_CLIENT_PASSWORD',
            entityType: 'CLIENT',
            entityId: id,
            details: { email: existingUser.email }
        });

        return res.json({
            success: true,
            message: `Password reset successfully for ${client.company_name}.`,
            credentials: {
                email: existingUser.email,
                password: new_password
            }
        });
    } else {
        const newUserId = uuidv4();
        db.prepare(`
            INSERT INTO users (id, name, email, password_hash, role, client_id, phone, is_active)
            VALUES (?, ?, ?, ?, 'CLIENT', ?, ?, 1)
        `).run(
            newUserId,
            `${client.contact_person} (${client.company_name})`,
            client.email.toLowerCase(),
            passwordHash,
            client.id,
            client.phone
        );

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_CLIENT_LOGIN',
            entityType: 'CLIENT',
            entityId: id,
            details: { email: client.email }
        });

        return res.json({
            success: true,
            message: `Portal login account created for ${client.company_name}.`,
            credentials: {
                email: client.email,
                password: new_password
            }
        });
    }
});

/**
 * PUT /api/clients/:id
 * Update Client details (Admin only)
 */
router.put('/:id', authenticateToken, requireRoles('ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id } = req.params;
    const { company_name, contact_person, email, phone, address, tin, default_billing_policy, default_tolerance_percent, credit_limit, is_active } = req.body;

    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    try {
        db.prepare(`
            UPDATE clients
            SET company_name = COALESCE(?, company_name),
                contact_person = COALESCE(?, contact_person),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                address = COALESCE(?, address),
                tin = COALESCE(?, tin),
                default_billing_policy = COALESCE(?, default_billing_policy),
                default_tolerance_percent = COALESCE(?, default_tolerance_percent),
                credit_limit = COALESCE(?, credit_limit),
                is_active = COALESCE(?, is_active),
                updated_at = datetime('now')
            WHERE id = ?
        `).run(
            company_name ? company_name.trim() : null,
            contact_person ? contact_person.trim() : null,
            email ? email.trim().toLowerCase() : null,
            phone ? phone.trim() : null,
            address ? address.trim() : null,
            tin !== undefined ? tin : null,
            default_billing_policy || null,
            default_tolerance_percent !== undefined ? parseFloat(default_tolerance_percent) : null,
            credit_limit !== undefined ? parseFloat(credit_limit) : null,
            is_active !== undefined ? (is_active ? 1 : 0) : null,
            id
        );

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE_CLIENT',
            entityType: 'CLIENT',
            entityId: id,
            details: { company_name: company_name || existing.company_name }
        });

        const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
        return res.json({ success: true, data: updated });
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed: clients.email')) {
            return res.status(400).json({ success: false, error: `A client with email "${email}" already exists.` });
        }
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/clients/:id
 * Delete Client account and cascading relations (Admin only)
 */
router.delete('/:id', authenticateToken, requireRoles('ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id } = req.params;

    const client = db.prepare('SELECT id, company_name FROM clients WHERE id = ?').get(id);
    if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    const deleteClientTx = db.transaction(() => {
        // 1. Clean up POs and child records
        const pos = db.prepare('SELECT id FROM purchase_orders WHERE client_id = ?').all(id);
        for (const po of pos) {
            db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(po.id);
            const drs = db.prepare('SELECT id FROM delivery_receipts WHERE po_id = ?').all(po.id);
            for (const dr of drs) {
                db.prepare('DELETE FROM delivery_items WHERE dr_id = ?').run(dr.id);
                db.prepare('DELETE FROM dr_acceptances WHERE dr_id = ?').run(dr.id);
                db.prepare('DELETE FROM returns WHERE dr_id = ?').run(dr.id);
            }
            db.prepare('DELETE FROM delivery_receipts WHERE po_id = ?').run(po.id);
            
            const jos = db.prepare('SELECT id FROM job_orders WHERE po_id = ?').all(po.id);
            for (const jo of jos) {
                db.prepare('DELETE FROM production_batches WHERE jo_id = ?').run(jo.id);
            }
            db.prepare('DELETE FROM job_orders WHERE po_id = ?').run(po.id);
        }
        
        // 2. Clean up Invoices & Payments
        const invoices = db.prepare('SELECT id FROM sales_invoices WHERE client_id = ?').all(id);
        for (const inv of invoices) {
            db.prepare('DELETE FROM payments WHERE invoice_id = ?').run(inv.id);
            db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(inv.id);
        }
        db.prepare('DELETE FROM payments WHERE client_id = ?').run(id);
        db.prepare('DELETE FROM sales_invoices WHERE client_id = ?').run(id);
        db.prepare('DELETE FROM client_buffer_stock WHERE client_id = ?').run(id);
        db.prepare('DELETE FROM purchase_orders WHERE client_id = ?').run(id);
        db.prepare('DELETE FROM client_product_prices WHERE client_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE client_id = ?').run(id);
        db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    });

    deleteClientTx();

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'DELETE_CLIENT',
        entityType: 'CLIENT',
        entityId: id,
        details: { company_name: client.company_name }
    });

    return res.json({
        success: true,
        message: `Client "${client.company_name}" has been deleted.`
    });
});

/**
 * GET /api/clients/:id/pricing
 * Retrieve custom product pricing catalog for a specific client
 */
router.get('/:id/pricing', authenticateToken, enforceClientIsolation, (req, res) => {
    const { id } = req.params;

    if (req.user.role === 'CLIENT' && req.clientId !== id) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    const client = db.prepare('SELECT id, company_name, default_billing_policy, default_tolerance_percent FROM clients WHERE id = ?').get(id);
    if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    // All active master products
    const masterProducts = db.prepare('SELECT id, sku, name, category, unit, default_price, description, formula_code FROM products WHERE is_active = 1 ORDER BY name ASC').all();

    // Assigned products specifically for this client
    const assignedProducts = db.prepare(`
        SELECT p.id as product_id, p.sku, p.name, p.category, p.unit, p.default_price, p.description, p.formula_code,
               cpp.id as pricing_id, cpp.custom_name, cpp.custom_price, cpp.custom_sku, cpp.custom_formula_code,
               COALESCE(cpp.custom_name, p.name) as effective_name,
               COALESCE(cpp.custom_sku, p.sku) as effective_sku,
               COALESCE(cpp.custom_price, p.default_price) as effective_price,
               1 as is_assigned,
               CASE WHEN cpp.custom_price IS NOT NULL THEN 1 ELSE 0 END as has_custom_price,
               cpp.is_active as is_available
        FROM client_product_prices cpp
        JOIN products p ON p.id = cpp.product_id
        WHERE cpp.client_id = ? AND cpp.is_active = 1 AND p.is_active = 1
        ORDER BY COALESCE(cpp.custom_name, p.name) ASC
    `).all(id);

    // Full joined products (for tests and backwards compatibility)
    const allProducts = db.prepare(`
        SELECT p.id as product_id, p.sku, p.name, p.category, p.unit, p.default_price, p.description, p.formula_code,
               cpp.id as pricing_id, cpp.custom_name, cpp.custom_price, cpp.custom_sku, cpp.custom_formula_code,
               COALESCE(cpp.custom_name, p.name) as effective_name,
               COALESCE(cpp.custom_sku, p.sku) as effective_sku,
               COALESCE(cpp.custom_price, p.default_price) as effective_price,
               CASE WHEN cpp.id IS NOT NULL AND cpp.is_active = 1 THEN 1 ELSE 0 END as is_assigned,
               CASE WHEN cpp.custom_price IS NOT NULL THEN 1 ELSE 0 END as has_custom_price,
               COALESCE(cpp.is_active, 0) as is_available
        FROM products p
        LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ?
        WHERE p.is_active = 1
        ORDER BY is_assigned DESC, p.name ASC
    `).all(id);

    return res.json({
        success: true,
        data: {
            client,
            assigned_products: assignedProducts,
            master_products: masterProducts,
            products: allProducts
        }
    });
});

/**
 * POST /api/clients/:id/pricing
 * Set or update product assignment, custom name, SKU, price, and formula for a client (Admin only)
 */
router.post('/:id/pricing', authenticateToken, requireRoles('ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id: clientId } = req.params;
    const { product_id, custom_name, custom_price, custom_sku, custom_formula_code, is_active, is_assigned } = req.body;

    if (!product_id) {
        return res.status(400).json({ success: false, error: 'Product ID is required.' });
    }

    const client = db.prepare('SELECT id, company_name FROM clients WHERE id = ?').get(clientId);
    if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    const product = db.prepare('SELECT id, name, default_price FROM products WHERE id = ?').get(product_id);
    if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
    }

    let parsedPrice = custom_price !== undefined && custom_price !== null && custom_price !== '' ? parseFloat(custom_price) : product.default_price;
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        parsedPrice = product.default_price;
    }

    const activeFlag = is_assigned !== undefined ? (is_assigned ? 1 : 0) : (is_active !== undefined ? (is_active ? 1 : 0) : 1);

    const existing = db.prepare('SELECT id FROM client_product_prices WHERE client_id = ? AND product_id = ?').get(clientId, product_id);

    if (existing) {
        db.prepare(`
            UPDATE client_product_prices
            SET custom_name = ?, custom_price = ?, custom_sku = ?, custom_formula_code = ?, is_active = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(custom_name || null, parsedPrice, custom_sku || null, custom_formula_code || null, activeFlag, existing.id);
    } else {
        const pricingId = uuidv4();
        db.prepare(`
            INSERT INTO client_product_prices (id, client_id, product_id, custom_name, custom_price, custom_sku, custom_formula_code, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(pricingId, clientId, product_id, custom_name || null, parsedPrice, custom_sku || null, custom_formula_code || null, activeFlag);
    }

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE_CLIENT_PRICING',
        entityType: 'CLIENT_PRICING',
        entityId: clientId,
        details: { client_name: client.company_name, product_name: product.name, custom_name, custom_price: parsedPrice, is_assigned: activeFlag }
    });

    return res.json({
        success: true,
        message: `Product configuration updated for ${product.name} (${client.company_name}).`
    });
});

/**
 * POST /api/clients/:id/pricing/batch
 * Bulk save product assignments, custom names, SKUs, and pricing for a client
 */
router.post('/:id/pricing/batch', authenticateToken, requireRoles('ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id: clientId } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ success: false, error: 'Items array is required.' });
    }

    const client = db.prepare('SELECT id, company_name FROM clients WHERE id = ?').get(clientId);
    if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    const saveBatchTx = db.transaction(() => {
        for (const item of items) {
            if (!item.product_id) continue;
            
            const product = db.prepare('SELECT id, default_price FROM products WHERE id = ?').get(item.product_id);
            if (!product) continue;

            const isAssigned = item.is_assigned !== undefined ? (item.is_assigned ? 1 : 0) : (item.is_active !== undefined ? (item.is_active ? 1 : 0) : 1);
            
            let parsedPrice = item.custom_price !== undefined && item.custom_price !== null && item.custom_price !== '' ? parseFloat(item.custom_price) : product.default_price;
            if (isNaN(parsedPrice) || parsedPrice < 0) {
                parsedPrice = product.default_price;
            }

            const existing = db.prepare('SELECT id FROM client_product_prices WHERE client_id = ? AND product_id = ?').get(clientId, item.product_id);
            if (existing) {
                db.prepare(`
                    UPDATE client_product_prices
                    SET custom_name = ?, custom_price = ?, custom_sku = ?, custom_formula_code = ?, is_active = ?, updated_at = datetime('now')
                    WHERE id = ?
                `).run(item.custom_name || null, parsedPrice, item.custom_sku || null, item.custom_formula_code || null, isAssigned, existing.id);
            } else {
                db.prepare(`
                    INSERT INTO client_product_prices (id, client_id, product_id, custom_name, custom_price, custom_sku, custom_formula_code, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(uuidv4(), clientId, item.product_id, item.custom_name || null, parsedPrice, item.custom_sku || null, item.custom_formula_code || null, isAssigned);
            }
        }
    });

    saveBatchTx();

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'BATCH_UPDATE_CLIENT_PRICING',
        entityType: 'CLIENT_PRICING',
        entityId: clientId,
        details: { client_name: client.company_name, items_count: items.length }
    });

    return res.json({
        success: true,
        message: `Client catalog and pricing updated for ${client.company_name}.`
    });
});

/**
 * POST /api/clients/:id/products
 * Create a new product and directly assign it to this client
 */
router.post('/:id/products', authenticateToken, requireRoles('ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id: clientId } = req.params;
    const { name, sku, category, description, unit, default_price, formula_code, shelf_life_months } = req.body;

    if (!name || !sku || default_price === undefined || default_price === null) {
        return res.status(400).json({ success: false, error: 'Product name, SKU, and price are required.' });
    }

    const client = db.prepare('SELECT id, company_name FROM clients WHERE id = ?').get(clientId);
    if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    const parsedPrice = parseFloat(default_price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ success: false, error: 'Price must be a positive number.' });
    }

    const existingProduct = db.prepare('SELECT id FROM products WHERE LOWER(sku) = LOWER(?)').get(sku.trim());
    if (existingProduct) {
        return res.status(400).json({ success: false, error: 'A product with this SKU already exists in catalog.' });
    }

    const productId = uuidv4();
    const pricingId = uuidv4();

    const createAndAssignTx = db.transaction(() => {
        db.prepare(`
            INSERT INTO products (id, sku, name, category, description, unit, default_price, formula_code, shelf_life_months, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
            productId,
            sku.trim().toUpperCase(),
            name.trim(),
            category || 'Cosmetics',
            description || '',
            unit || 'pcs',
            parsedPrice,
            formula_code || null,
            shelf_life_months ? parseInt(shelf_life_months) : 24
        );

        db.prepare(`
            INSERT INTO client_product_prices (id, client_id, product_id, custom_name, custom_price, custom_sku, custom_formula_code, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(pricingId, clientId, productId, name.trim(), parsedPrice, sku.trim().toUpperCase(), formula_code || null);
    });

    createAndAssignTx();

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE_CLIENT_PRODUCT',
        entityType: 'PRODUCT',
        entityId: productId,
        details: { client_id: clientId, client_name: client.company_name, name, sku, price: parsedPrice }
    });

    return res.status(201).json({
        success: true,
        message: `Product "${name}" successfully created and assigned to ${client.company_name}.`,
        data: { id: productId, sku, name, price: parsedPrice }
    });
});

/**
 * DELETE /api/clients/:id/pricing/:productId
 * Remove custom pricing for a product (reverts to default product price)
 */
router.delete('/:id/pricing/:productId', authenticateToken, requireRoles('ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id: clientId, productId } = req.params;

    db.prepare('DELETE FROM client_product_prices WHERE client_id = ? AND product_id = ?').run(clientId, productId);

    return res.json({
        success: true,
        message: 'Custom pricing removed. Product reverted to standard default price.'
    });
});

module.exports = router;

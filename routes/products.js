const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/products
 * Accessible by all authenticated users (Client & Admin)
 * When requested with ?clientId=... or forPO=true, automatically applies client custom pricing and filters by designated client
 */
router.get('/', authenticateToken, (req, res) => {
    const { search, activeOnly, clientId, assignedOnly, forPO } = req.query;
    
    // Determine if client context applies
    const targetClientId = req.user.role === 'CLIENT' ? (req.clientId || req.user.client_id) : (clientId || null);

    let query = '';
    const params = [];

    if (targetClientId) {
        if (assignedOnly === 'true' || forPO === 'true' || req.user.role === 'CLIENT') {
            // Strict filtering: Return products assigned to this client (or custom priced for this client)
            query = `
                SELECT p.id,
                       p.client_id,
                       c.company_name as client_name,
                       c.company_name as client_company_name,
                       COALESCE(cpp.custom_sku, p.sku) as sku,
                       COALESCE(cpp.custom_sku, p.sku) as effective_sku,
                       p.sku as master_sku,
                       COALESCE(cpp.custom_name, p.name) as name,
                       COALESCE(cpp.custom_name, p.name) as effective_name,
                       p.name as master_name,
                       p.category, p.description, p.unit,
                       COALESCE(cpp.custom_price, p.default_price) as default_price,
                       p.default_price as base_default_price,
                       cpp.custom_price,
                       cpp.custom_sku,
                       cpp.custom_name,
                       COALESCE(cpp.custom_formula_code, p.formula_code) as formula_code,
                       COALESCE(cpp.batch_code_template, p.batch_code_template) as batch_code_template,
                       CASE WHEN cpp.custom_price IS NOT NULL THEN 1 ELSE 0 END as has_custom_price,
                       1 as is_assigned,
                       p.shelf_life_months, p.current_stock, p.is_active, p.created_at, p.updated_at
                FROM products p
                LEFT JOIN clients c ON p.client_id = c.id
                LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ?
                WHERE p.is_active = 1 AND (p.client_id = ? OR cpp.client_id = ?)
            `;
            params.push(targetClientId, targetClientId, targetClientId);
        } else {
            // For general catalog view with client context
            query = `
                SELECT p.id,
                       p.client_id,
                       c.company_name as client_name,
                       c.company_name as client_company_name,
                       COALESCE(cpp.custom_sku, p.sku) as sku,
                       COALESCE(cpp.custom_sku, p.sku) as effective_sku,
                       p.sku as master_sku,
                       COALESCE(cpp.custom_name, p.name) as name,
                       COALESCE(cpp.custom_name, p.name) as effective_name,
                       p.name as master_name,
                       p.category, p.description, p.unit,
                       COALESCE(cpp.custom_price, p.default_price) as default_price,
                       p.default_price as base_default_price,
                       cpp.custom_price,
                       cpp.custom_sku,
                       cpp.custom_name,
                       COALESCE(cpp.custom_formula_code, p.formula_code) as formula_code,
                       COALESCE(cpp.batch_code_template, p.batch_code_template) as batch_code_template,
                       CASE WHEN cpp.custom_price IS NOT NULL THEN 1 ELSE 0 END as has_custom_price,
                       CASE WHEN (p.client_id = ? OR cpp.id IS NOT NULL) THEN 1 ELSE 0 END as is_assigned,
                       p.shelf_life_months, p.current_stock, p.is_active, p.created_at, p.updated_at
                FROM products p
                LEFT JOIN clients c ON p.client_id = c.id
                LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ?
                WHERE 1=1
            `;
            params.push(targetClientId, targetClientId);
        }
    } else {
        query = `
            SELECT p.*,
                   c.company_name as client_name,
                   c.company_name as client_company_name,
                   p.default_price as base_default_price,
                   0 as has_custom_price
            FROM products p
            LEFT JOIN clients c ON p.client_id = c.id
            WHERE 1=1
        `;
    }

    if (activeOnly === 'true' && req.user.role !== 'CLIENT') {
        query += ' AND p.is_active = 1';
    }

    if (search) {
        query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    query += ' ORDER BY p.name ASC';
    let products = db.prepare(query).all(...params);

    // Fallback: If client has 0 assigned products and it's for PO, show all active products so the user is not completely blocked
    if (forPO === 'true' && targetClientId && products.length === 0) {
        products = db.prepare(`
            SELECT p.*,
                   c.company_name as client_name,
                   p.default_price as base_default_price,
                   0 as has_custom_price
            FROM products p
            LEFT JOIN clients c ON p.client_id = c.id
            WHERE p.is_active = 1
            ORDER BY p.name ASC
        `).all();
    }

    return res.json({
        success: true,
        data: products
    });
});

/**
 * GET /api/products/:id
 */
router.get('/:id', authenticateToken, (req, res) => {
    const targetClientId = req.user.role === 'CLIENT' ? (req.clientId || req.user.client_id) : (req.query.clientId || null);

    let product;
    if (targetClientId) {
        product = db.prepare(`
            SELECT p.*,
                   c.company_name as client_name,
                   COALESCE(cpp.custom_price, p.default_price) as default_price,
                   p.default_price as base_default_price,
                   cpp.custom_price,
                   COALESCE(cpp.custom_sku, p.sku) as effective_sku,
                   CASE WHEN cpp.custom_price IS NOT NULL THEN 1 ELSE 0 END as has_custom_price
            FROM products p
            LEFT JOIN clients c ON p.client_id = c.id
            LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ?
            WHERE p.id = ?
        `).get(targetClientId, req.params.id);
    } else {
        product = db.prepare(`
            SELECT p.*, c.company_name as client_name, p.default_price as base_default_price, 0 as has_custom_price 
            FROM products p 
            LEFT JOIN clients c ON p.client_id = c.id 
            WHERE p.id = ?
        `).get(req.params.id);
    }

    if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
    }
    return res.json({ success: true, data: product });
});

/**
 * POST /api/products
 * Admin/Production only
 */
router.post('/', authenticateToken, requireRoles('ADMIN', 'PRODUCTION', 'SUPER_ADMIN'), (req, res) => {
    const { sku, name, category, description, unit, default_price, formula_code, batch_code_template, client_id, shelf_life_months } = req.body;

    if (!sku || !name || default_price === undefined || default_price === null || default_price === '') {
        return res.status(400).json({ success: false, error: 'SKU, Name, and Default Price are required.' });
    }

    const parsedPrice = parseFloat(default_price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ success: false, error: 'Default price must be a valid positive number.' });
    }

    const parsedShelfLife = parseInt(shelf_life_months || 24, 10);
    if (Number.isNaN(parsedShelfLife) || parsedShelfLife < 1) {
        return res.status(400).json({ success: false, error: 'Shelf life must be at least 1 month.' });
    }

    const id = uuidv4();
    try {
        const insertResult = db.prepare(`
            INSERT INTO products (id, sku, name, category, description, unit, default_price, formula_code, batch_code_template, client_id, shelf_life_months)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            sku.trim().toUpperCase(),
            name.trim(),
            category || 'Cosmetics',
            description || '',
            unit || 'pcs',
            parsedPrice,
            formula_code || null,
            batch_code_template || null,
            client_id || null,
            parsedShelfLife
        );

        if (!insertResult.changes) {
            throw new Error('Product insert did not affect any rows.');
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_PRODUCT',
            entityType: 'PRODUCT',
            entityId: id,
            details: { sku, name, default_price, client_id }
        });

        const newProduct = db.prepare(`
            SELECT p.*, c.company_name as client_name 
            FROM products p 
            LEFT JOIN clients c ON p.client_id = c.id 
            WHERE p.id = ?
        `).get(id);
        return res.status(201).json({ success: true, data: newProduct });
    } catch (err) {
        const duplicateSku = err.code === 'ER_DUP_ENTRY'
            || (err.message && (
                err.message.includes('UNIQUE constraint failed: products.sku')
                || err.message.includes('Duplicate entry')
            ));
        if (duplicateSku) {
            return res.status(400).json({ success: false, error: `Product SKU "${sku}" already exists.` });
        }
        console.error('Create product failed:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to save product. Please try again.' });
    }
});

/**
 * PUT /api/products/:id
 */
router.put('/:id', authenticateToken, requireRoles('ADMIN', 'PRODUCTION', 'SUPER_ADMIN'), (req, res) => {
    const { sku, name, category, description, unit, default_price, formula_code, batch_code_template, client_id, shelf_life_months, is_active } = req.body;
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
    }

    db.prepare(`
        UPDATE products 
        SET sku = COALESCE(?, sku),
            name = COALESCE(?, name),
            category = COALESCE(?, category),
            description = COALESCE(?, description),
            unit = COALESCE(?, unit),
            default_price = COALESCE(?, default_price),
            formula_code = COALESCE(?, formula_code),
            batch_code_template = COALESCE(?, batch_code_template),
            client_id = ?,
            shelf_life_months = COALESCE(?, shelf_life_months),
            is_active = COALESCE(?, is_active),
            updated_at = datetime('now')
        WHERE id = ?
    `).run(
        sku !== undefined ? sku.trim().toUpperCase() : null,
        name !== undefined ? name.trim() : null,
        category !== undefined ? category : null,
        description !== undefined ? description : null,
        unit !== undefined ? unit : null,
        default_price !== undefined ? parseFloat(default_price) : null,
        formula_code !== undefined ? formula_code : null,
        batch_code_template !== undefined ? batch_code_template : null,
        client_id !== undefined ? (client_id || null) : existing.client_id,
        shelf_life_months !== undefined ? parseInt(shelf_life_months) : null,
        is_active !== undefined ? parseInt(is_active) : null,
        id
    );

    const updated = db.prepare(`
        SELECT p.*, c.company_name as client_name 
        FROM products p 
        LEFT JOIN clients c ON p.client_id = c.id 
        WHERE p.id = ?
    `).get(id);
    return res.json({ success: true, data: updated });
});

/**
 * DELETE /api/products/:id
 * Delete Product from Catalog (Admin only)
 */
router.delete('/:id', authenticateToken, requireRoles('ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { id } = req.params;

    const product = db.prepare('SELECT id, name, sku FROM products WHERE id = ?').get(id);
    if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
    }

    const deleteProductTx = db.transaction(() => {
        db.prepare('DELETE FROM inventory_movements WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM client_buffer_stock WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM client_product_prices WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM delivery_items WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM invoice_items WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM returns WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM purchase_order_items WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM production_batches WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM job_orders WHERE product_id = ?').run(id);
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
    });

    deleteProductTx();

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'DELETE_PRODUCT',
        entityType: 'PRODUCT',
        entityId: id,
        details: { name: product.name, sku: product.sku }
    });

    return res.json({
        success: true,
        message: `Product "${product.name}" (${product.sku}) has been deleted.`
    });
});

module.exports = router;

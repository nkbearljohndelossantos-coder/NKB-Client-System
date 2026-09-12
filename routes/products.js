const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

/**
 * Generate Product SKU based on present coding rules:
 * 2-5 uppercase letters from brand/product initials + 3-digit number (e.g. HCPI-199, BSPT-341, SOS-459)
 */
function generateProductSKU(productName, clientName, existingSkusSet = new Set()) {
    const stopWords = new Set(['WITH', 'FOR', 'AND', '&', 'THE', 'IN', 'OF', 'AT', 'TO', 'A', 'AN', 'SPF50', 'SPF50+', 'PA++++', 'PA+++', 'PA++']);

    const clientWords = (clientName || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0 && !stopWords.has(w) && w !== 'INC' && w !== 'CORP' && w !== 'ENTERPRISE' && w !== 'LTD' && w !== 'CO' && w !== 'AESTHETICS' && w !== 'WELLNESS');

    const productWords = (productName || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0 && !stopWords.has(w));

    if (productWords.length === 0) {
        const rnd = Math.floor(100 + Math.random() * 900);
        return `PRD-${rnd}`;
    }

    // Check if product name already contains the brand / first client word
    const alreadyHasBrand = clientWords.length > 0 && productWords[0] === clientWords[0];

    let letters = [];
    if (!alreadyHasBrand && clientWords.length > 0) {
        if (clientWords.length === 1) {
            letters.push(clientWords[0].slice(0, 2));
        } else {
            letters.push(clientWords[0][0], clientWords[1][0]);
        }
        for (const w of productWords) {
            if (letters.length >= 4) break;
            letters.push(w[0]);
        }
    } else {
        for (const w of productWords) {
            if (letters.length >= 4) break;
            letters.push(w[0]);
        }
    }

    let baseCode = letters.join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (baseCode.length < 2) {
        baseCode = (productName.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase()) || 'PRD';
    }
    if (baseCode.length > 5) {
        baseCode = baseCode.slice(0, 5);
    }

    let candidate = '';
    let attempts = 0;
    while (attempts < 200) {
        attempts++;
        const num = Math.floor(100 + Math.random() * 900);
        candidate = `${baseCode}-${num}`;
        if (!existingSkusSet.has(candidate)) break;
    }
    return candidate;
}

/**
 * GET /api/products/generate-sku
 * Preview auto-generated SKU based on product name and client
 */
router.get('/generate-sku', authenticateToken, (req, res) => {
    const { name, clientId } = req.query;
    let clientName = '';
    if (clientId) {
        const client = db.prepare('SELECT company_name FROM clients WHERE id = ?').get(clientId);
        if (client) clientName = client.company_name;
    }
    const existingRows = db.prepare('SELECT sku FROM products').all();
    const existingSkusSet = new Set(existingRows.map(r => r.sku.toUpperCase()));
    const sku = generateProductSKU(name || '', clientName, existingSkusSet);
    return res.json({ success: true, data: { sku }, sku });
});

/**
 * GET /api/products
 * Accessible by all authenticated users (Client & Admin)
 * When requested by a client (or with ?clientId=...), automatically applies client custom pricing
 */
router.get('/', authenticateToken, (req, res) => {
    const { search, activeOnly, clientId } = req.query;
    
    // Determine if client context applies
    const targetClientId = req.user.role === 'CLIENT' ? (req.clientId || req.user.client_id) : (clientId || null);

    let query = '';
    const params = [];

    if (targetClientId) {
        // Auto-provision client catalog if not yet mapped
        const checkAssigned = db.prepare('SELECT COUNT(*) as cnt FROM client_product_prices WHERE client_id = ? AND is_active = 1').get(targetClientId);
        if (!checkAssigned || checkAssigned.cnt === 0) {
            try {
                const { seedClientCatalogs } = require('../database/seed-client-catalogs');
                seedClientCatalogs();
            } catch (e) {}
        }

        // If client has assigned products, return those assigned products
        // If client doesn't have products yet (assignedCount === 0), show all company products!
        if (checkAssigned && checkAssigned.cnt > 0 && (req.query.assignedOnly === 'true' || req.user.role === 'CLIENT' || req.query.allMasterCatalog !== 'true')) {
            query = `
                SELECT p.id,
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
                       CASE WHEN cpp.custom_price IS NOT NULL THEN 1 ELSE 0 END as has_custom_price,
                       1 as is_assigned,
                       p.shelf_life_months, p.current_stock, p.is_active, p.created_at, p.updated_at
                FROM products p
                JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ?
                WHERE p.is_active = 1 AND cpp.is_active = 1
            `;
            params.push(targetClientId);
        } else {
            // Client doesn't have products yet (or allMasterCatalog requested): Return all company products
            query = `
                SELECT p.id,
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
                       CASE WHEN cpp.custom_price IS NOT NULL THEN 1 ELSE 0 END as has_custom_price,
                       CASE WHEN cpp.id IS NOT NULL AND cpp.is_active = 1 THEN 1 ELSE 0 END as is_assigned,
                       p.shelf_life_months, p.current_stock, p.is_active, p.created_at, p.updated_at
                FROM products p
                LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ?
                WHERE p.is_active = 1
            `;
            params.push(targetClientId);
        }
    } else {
        query = `
            SELECT p.*,
                   p.default_price as base_default_price,
                   (SELECT c.company_name FROM client_product_prices cpp JOIN clients c ON cpp.client_id = c.id WHERE cpp.product_id = p.id AND cpp.is_active = 1 LIMIT 1) as client_name,
                   (SELECT cpp.client_id FROM client_product_prices cpp WHERE cpp.product_id = p.id AND cpp.is_active = 1 LIMIT 1) as client_id,
                   0 as has_custom_price
            FROM products p
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
    const products = db.prepare(query).all(...params);

    return res.json({
        success: true,
        data: products
    });
});

/**
 * GET /api/products/categories
 * List all available product categories
 */
router.get('/categories', authenticateToken, (req, res) => {
    try {
        const categories = db.prepare('SELECT * FROM product_categories ORDER BY name ASC').all();
        return res.json({ success: true, data: categories });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/products/categories
 * Add a new product category
 */
router.post('/categories', authenticateToken, requireRoles('ADMIN', 'PRODUCTION', 'SUPER_ADMIN'), (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Category name is required.' });
    }
    const cleanName = name.trim();
    try {
        const existing = db.prepare('SELECT * FROM product_categories WHERE LOWER(name) = LOWER(?)').get(cleanName);
        if (existing) {
            return res.json({ success: true, data: existing, message: 'Category already exists.' });
        }
        const id = uuidv4();
        db.prepare('INSERT INTO product_categories (id, name) VALUES (?, ?)').run(id, cleanName);
        const created = db.prepare('SELECT * FROM product_categories WHERE id = ?').get(id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_CATEGORY',
            entityType: 'PRODUCT_CATEGORY',
            entityId: cleanName,
            details: { id, name: cleanName }
        });

        return res.status(201).json({ success: true, data: created });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
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
                   COALESCE(cpp.custom_price, p.default_price) as default_price,
                   p.default_price as base_default_price,
                   cpp.custom_price,
                   COALESCE(cpp.custom_sku, p.sku) as effective_sku,
                   cpp.client_id,
                   (SELECT company_name FROM clients WHERE id = cpp.client_id) as client_name,
                   CASE WHEN cpp.custom_price IS NOT NULL THEN 1 ELSE 0 END as has_custom_price
            FROM products p
            LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = ?
            WHERE p.id = ?
        `).get(targetClientId, req.params.id);
    } else {
        product = db.prepare(`
            SELECT p.*,
                   p.default_price as base_default_price,
                   (SELECT cpp.client_id FROM client_product_prices cpp WHERE cpp.product_id = p.id AND cpp.is_active = 1 LIMIT 1) as client_id,
                   (SELECT c.company_name FROM client_product_prices cpp JOIN clients c ON cpp.client_id = c.id WHERE cpp.product_id = p.id AND cpp.is_active = 1 LIMIT 1) as client_name,
                   0 as has_custom_price
            FROM products p
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
    let { sku, name, category, description, unit, default_price, formula_code, shelf_life_months, client_id } = req.body;

    if (!name || default_price === undefined || default_price === null || default_price === '') {
        return res.status(400).json({ success: false, error: 'Product Name and Default Price are required.' });
    }

    const parsedPrice = Math.round(parseFloat(default_price) * 100) / 100;
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ success: false, error: 'Default price must be a valid positive number.' });
    }

    let clientName = '';
    if (client_id) {
        const client = db.prepare('SELECT company_name FROM clients WHERE id = ?').get(client_id);
        if (client) clientName = client.company_name;
    }

    // Auto-generate SKU if not provided or empty
    if (!sku || !sku.trim()) {
        const existingRows = db.prepare('SELECT sku FROM products').all();
        const existingSkusSet = new Set(existingRows.map(r => r.sku.toUpperCase()));
        sku = generateProductSKU(name, clientName, existingSkusSet);
    } else {
        sku = sku.trim().toUpperCase();
    }

    const parsedShelfLife = shelf_life_months ? parseInt(shelf_life_months, 10) : 24;
    const id = uuidv4();

    try {
        const insertTx = db.transaction(() => {
            db.prepare(`
                INSERT INTO products (id, sku, name, category, description, unit, default_price, formula_code, shelf_life_months)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                id,
                sku,
                name.trim(),
                category || 'Cosmetics',
                description || '',
                unit || 'pcs',
                parsedPrice,
                formula_code || null,
                parsedShelfLife || 24
            );

            if (client_id) {
                db.prepare(`
                    INSERT INTO client_product_prices (id, client_id, product_id, custom_name, custom_price, custom_sku, custom_formula_code, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                `).run(
                    uuidv4(),
                    client_id,
                    id,
                    name.trim(),
                    parsedPrice,
                    sku,
                    formula_code || null
                );
            }
        });

        insertTx();

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
            SELECT p.*,
                   (SELECT c.company_name FROM client_product_prices cpp JOIN clients c ON cpp.client_id = c.id WHERE cpp.product_id = p.id AND cpp.is_active = 1 LIMIT 1) as client_name,
                   (SELECT cpp.client_id FROM client_product_prices cpp WHERE cpp.product_id = p.id AND cpp.is_active = 1 LIMIT 1) as client_id
            FROM products p WHERE p.id = ?
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
    const { name, category, description, unit, default_price, formula_code, shelf_life_months, is_active, client_id } = req.body;
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
    }

    const updateTx = db.transaction(() => {
        db.prepare(`
            UPDATE products 
            SET name = COALESCE(?, name),
                category = COALESCE(?, category),
                description = COALESCE(?, description),
                unit = COALESCE(?, unit),
                default_price = COALESCE(?, default_price),
                formula_code = COALESCE(?, formula_code),
                shelf_life_months = COALESCE(?, shelf_life_months),
                is_active = COALESCE(?, is_active),
                updated_at = datetime('now')
            WHERE id = ?
        `).run(
            name !== undefined ? name.trim() : null,
            category !== undefined ? category : null,
            description !== undefined ? description : null,
            unit !== undefined ? unit : null,
            default_price !== undefined ? Math.round(parseFloat(default_price) * 100) / 100 : null,
            formula_code !== undefined ? formula_code : null,
            shelf_life_months !== undefined ? parseInt(shelf_life_months) : null,
            is_active !== undefined ? parseInt(is_active) : null,
            id
        );

        if (client_id !== undefined) {
            if (client_id) {
                const existingAssoc = db.prepare('SELECT id FROM client_product_prices WHERE product_id = ?').get(id);
                if (existingAssoc) {
                    db.prepare('UPDATE client_product_prices SET client_id = ?, custom_name = ?, custom_price = ? WHERE product_id = ?').run(
                        client_id,
                        name ? name.trim() : existing.name,
                        default_price !== undefined ? Math.round(parseFloat(default_price) * 100) / 100 : existing.default_price,
                        id
                    );
                } else {
                    db.prepare(`
                        INSERT INTO client_product_prices (id, client_id, product_id, custom_name, custom_price, custom_sku, custom_formula_code, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, NULL, 1)
                    `).run(
                        uuidv4(),
                        client_id,
                        id,
                        name ? name.trim() : existing.name,
                        default_price !== undefined ? Math.round(parseFloat(default_price) * 100) / 100 : existing.default_price,
                        existing.sku
                    );
                }
            } else {
                db.prepare('DELETE FROM client_product_prices WHERE product_id = ?').run(id);
            }
        }
    });

    updateTx();

    const updated = db.prepare(`
        SELECT p.*,
               (SELECT c.company_name FROM client_product_prices cpp JOIN clients c ON cpp.client_id = c.id WHERE cpp.product_id = p.id AND cpp.is_active = 1 LIMIT 1) as client_name,
               (SELECT cpp.client_id FROM client_product_prices cpp WHERE cpp.product_id = p.id AND cpp.is_active = 1 LIMIT 1) as client_id
        FROM products p WHERE p.id = ?
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

router.generateProductSKU = generateProductSKU;

module.exports = router;

/**
 * NKB Manufacturing & Trading
 * Order Categories & Color Coding Route
 * 
 * Provides IT Administrators and System Admins customized and suggested color-coded
 * category management for classifying client orders (e.g. Fragrance, Perfume, Soap, Lotions).
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { ROLES } = require('../middleware/rbac');
const { logAudit } = require('../services/auditService');

// Suggested color palette curated for manufacturing categories
const SUGGESTED_COLORS = [
    { name: 'Royal Violet', hex: '#8b5cf6', defaultFor: 'Perfume' },
    { name: 'Rose Pink', hex: '#ec4899', defaultFor: 'Fragrance' },
    { name: 'Warm Amber', hex: '#f59e0b', defaultFor: 'Lotions' },
    { name: 'Emerald Green', hex: '#10b981', defaultFor: 'Soap' },
    { name: 'Sky Blue', hex: '#0ea5e9', defaultFor: 'Serums' },
    { name: 'Indigo Blue', hex: '#6366f1', defaultFor: 'Cosmetics' },
    { name: 'Teal', hex: '#14b8a6', defaultFor: 'Cleansers' },
    { name: 'Vibrant Orange', hex: '#f97316', defaultFor: 'Packaging' },
    { name: 'Cyan Aqua', hex: '#06b6d4', defaultFor: 'Toners' },
    { name: 'Lime Green', hex: '#84cc16', defaultFor: 'Organic / Botanicals' },
    { name: 'Fuchsia', hex: '#d946ef', defaultFor: 'Specialty Scent' },
    { name: 'Slate Gray', hex: '#64748b', defaultFor: 'General' }
];

const authorizeITAdmin = [authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN)];

/**
 * GET /api/order-categories
 * List all categories with assigned orders count and suggested colors palette
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const categories = db.prepare(`
            SELECT oc.*, 
                   (SELECT COUNT(*) FROM purchase_orders po WHERE LOWER(po.category) = LOWER(oc.name)) as assigned_orders_count
            FROM order_categories oc
            ORDER BY oc.name ASC
        `).all();

        return res.json({
            success: true,
            data: {
                categories,
                suggested_colors: SUGGESTED_COLORS
            },
            categories,
            suggestedColors: SUGGESTED_COLORS
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/order-categories/suggested-colors
 */
router.get('/suggested-colors', authenticateToken, (req, res) => {
    return res.json({ success: true, data: SUGGESTED_COLORS });
});

/**
 * POST /api/order-categories
 * Add new order category with custom or suggested color
 */
router.post('/', ...authorizeITAdmin, (req, res) => {
    try {
        const { name, color, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Category name is required.' });
        }

        const trimmedName = name.trim();
        const hexColor = (color && /^#[0-9A-Fa-f]{6}$/i.test(color.trim())) ? color.trim() : '#8b5cf6';

        // Check uniqueness
        const existing = db.prepare('SELECT id FROM order_categories WHERE LOWER(name) = LOWER(?)').get(trimmedName);
        if (existing) {
            return res.status(400).json({ success: false, error: `Category '${trimmedName}' already exists.` });
        }

        const id = 'cat-' + uuidv4().slice(0, 8);
        db.prepare(`
            INSERT INTO order_categories (id, name, color, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(id, trimmedName, hexColor, description ? description.trim() : null);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_ORDER_CATEGORY',
            entityType: 'ORDER_CATEGORY',
            entityId: id,
            details: { id, name: trimmedName, color: hexColor }
        });

        const created = db.prepare('SELECT * FROM order_categories WHERE id = ?').get(id);
        return res.status(201).json({ success: true, data: created, message: `Category '${trimmedName}' created successfully.` });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/order-categories/:id
 * Update category name, color, and description; cascade color/name updates to assigned orders
 */
router.put('/:id', ...authorizeITAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { name, color, description } = req.body;

        const current = db.prepare('SELECT * FROM order_categories WHERE id = ?').get(id);
        if (!current) {
            return res.status(404).json({ success: false, error: 'Category not found.' });
        }

        const newName = (name && name.trim()) ? name.trim() : current.name;
        const newColor = (color && /^#[0-9A-Fa-f]{6}$/i.test(color.trim())) ? color.trim() : current.color;
        const newDesc = description !== undefined ? (description ? description.trim() : null) : current.description;

        // Check uniqueness if name changed
        if (newName.toLowerCase() !== current.name.toLowerCase()) {
            const dup = db.prepare('SELECT id FROM order_categories WHERE LOWER(name) = LOWER(?) AND id != ?').get(newName, id);
            if (dup) {
                return res.status(400).json({ success: false, error: `Category '${newName}' already exists.` });
            }
        }

        db.prepare(`
            UPDATE order_categories 
            SET name = ?, color = ?, description = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(newName, newColor, newDesc, id);

        // Cascade update to purchase orders previously assigned to this category
        db.prepare(`
            UPDATE purchase_orders 
            SET category = ?, category_color = ?
            WHERE LOWER(category) = LOWER(?)
        `).run(newName, newColor, current.name);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE_ORDER_CATEGORY',
            entityType: 'ORDER_CATEGORY',
            entityId: id,
            details: { id, oldName: current.name, newName, oldColor: current.color, newColor }
        });

        const updated = db.prepare('SELECT * FROM order_categories WHERE id = ?').get(id);
        return res.json({ success: true, data: updated, message: `Category '${newName}' updated successfully.` });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/order-categories/:id
 * Delete category and remove category tag from assigned orders
 */
router.delete('/:id', ...authorizeITAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const current = db.prepare('SELECT * FROM order_categories WHERE id = ?').get(id);
        if (!current) {
            return res.status(404).json({ success: false, error: 'Category not found.' });
        }

        // Unlink from orders
        db.prepare(`
            UPDATE purchase_orders 
            SET category = NULL, category_color = NULL
            WHERE LOWER(category) = LOWER(?)
        `).run(current.name);

        db.prepare('DELETE FROM order_categories WHERE id = ?').run(id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'DELETE_ORDER_CATEGORY',
            entityType: 'ORDER_CATEGORY',
            entityId: id,
            details: { id, name: current.name }
        });

        return res.json({ success: true, message: `Category '${current.name}' deleted successfully.` });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/order-categories/assign
 * Assign an order or multiple orders to a category
 */
router.post('/assign', ...authorizeITAdmin, (req, res) => {
    try {
        const { order_id, order_ids, po_id, po_ids, category, category_name } = req.body;
        const targetIds = Array.isArray(order_ids) ? order_ids : (Array.isArray(po_ids) ? po_ids : (order_id ? [order_id] : (po_id ? [po_id] : [])));

        if (targetIds.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one order ID is required.' });
        }

        let assignedCat = null;
        let assignedColor = null;

        const catNameInput = category || category_name;
        if (catNameInput && catNameInput.trim()) {
            const catRow = db.prepare('SELECT * FROM order_categories WHERE LOWER(name) = LOWER(?)').get(catNameInput.trim());
            if (!catRow) {
                return res.status(400).json({ success: false, error: `Category '${catNameInput}' not found.` });
            }
            assignedCat = catRow.name;
            assignedColor = catRow.color;
        }

        const updateStmt = db.prepare(`
            UPDATE purchase_orders 
            SET category = ?, category_color = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `);

        let count = 0;
        for (const oId of targetIds) {
            const info = updateStmt.run(assignedCat, assignedColor, oId);
            if (info.changes > 0) count++;
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'ASSIGN_ORDER_CATEGORY',
            entityType: 'PURCHASE_ORDER',
            entityId: targetIds[0] || 'MULTI',
            details: { count, category: assignedCat, category_color: assignedColor, targetIds }
        });

        return res.json({
            success: true,
            updatedCount: count,
            category: assignedCat,
            category_color: assignedColor,
            message: `Successfully assigned '${assignedCat || 'None'}' to ${count} order(s).`
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/order-categories/auto-assign
 * Automatically scans all orders in system and assigns matching categories
 */
router.post('/auto-assign', ...authorizeITAdmin, (req, res) => {
    try {
        const allCategories = db.prepare('SELECT * FROM order_categories').all();
        const catMap = {};
        allCategories.forEach(c => { catMap[c.name.toLowerCase()] = c; });

        // Retrieve all orders and their items
        const orders = db.prepare(`
            SELECT po.id, po.po_number, po.category,
                   (
                       SELECT GROUP_CONCAT(LOWER(COALESCE(poi.item_name, p.name) || ' ' || COALESCE(p.category, '')), ' ')
                       FROM purchase_order_items poi
                       JOIN products p ON poi.product_id = p.id
                       WHERE poi.po_id = po.id
                   ) as combined_text
            FROM purchase_orders po
        `).all();

        const updateStmt = db.prepare(`
            UPDATE purchase_orders 
            SET category = ?, category_color = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `);

        let updatedCount = 0;
        const assignmentSummary = [];

        for (const po of orders) {
            const text = (po.combined_text || '').toLowerCase();
            let targetCat = null;

            if (text.includes('perfume') && catMap['perfume']) {
                targetCat = catMap['perfume'];
            } else if (text.includes('fragrance') && catMap['fragrance']) {
                targetCat = catMap['fragrance'];
            } else if (text.includes('soap') && catMap['soap']) {
                targetCat = catMap['soap'];
            } else if (text.includes('lotion') && catMap['lotions']) {
                targetCat = catMap['lotions'];
            } else if (text.includes('lotion') && catMap['lotion']) {
                targetCat = catMap['lotion'];
            }

            if (targetCat && po.category !== targetCat.name) {
                updateStmt.run(targetCat.name, targetCat.color, po.id);
                updatedCount++;
                assignmentSummary.push(`${po.po_number} -> ${targetCat.name}`);
            }
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'AUTO_ASSIGN_ORDER_CATEGORIES',
            entityType: 'PURCHASE_ORDER',
            entityId: 'ALL',
            details: { updatedCount, assignmentSummary }
        });

        return res.json({
            success: true,
            data: {
                assigned_count: updatedCount,
                summary: assignmentSummary
            },
            assigned_count: updatedCount,
            updatedCount,
            summary: assignmentSummary,
            message: `Auto-assigned categories for ${updatedCount} order(s).`
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

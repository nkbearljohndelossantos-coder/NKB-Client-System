const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const { getManilaDateTime } = require('../helpers/timezone');

const ALLOWED_VIEW_ROLES = ['INVENTORY', 'PURCHASING', 'PRODUCTION', 'QC', 'WAREHOUSE', 'SUPER_ADMIN', 'ADMIN', 'CEO', 'COO', 'IT_ADMIN'];
const ALLOWED_EDIT_ROLES = ['INVENTORY', 'PURCHASING', 'SUPER_ADMIN', 'ADMIN', 'CEO', 'COO', 'IT_ADMIN'];

function computeStockStatus(currentStock, minLevel) {
    const stock = Number(currentStock) || 0;
    const min = Number(minLevel) || 0;
    if (stock <= 0) return 'OUT_OF_STOCK';
    if (stock <= min) return 'LOW_STOCK';
    return 'IN_STOCK';
}

/**
 * GET /api/raw-materials
 * List all warehouse raw materials with summary metrics and optional filtering
 */
router.get('/', authenticateToken, (req, res) => {
    if (!ALLOWED_VIEW_ROLES.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Access denied to Warehouse Raw Materials Inventory.' });
    }

    const { category, supplier, status, search, fast_moving, sort = 'PRIORITIZED' } = req.query;
    let query = 'SELECT * FROM raw_materials_inventory WHERE 1=1';
    const params = [];

    if (category) {
        query += ' AND category = ?';
        params.push(category);
    }

    if (supplier) {
        query += ' AND supplier = ?';
        params.push(supplier);
    }

    if (status === 'FAST_MOVING') {
        query += ' AND is_fast_moving = 1';
    } else if (status) {
        query += ' AND status = ?';
        params.push(status);
    }

    if (fast_moving === '1' || fast_moving === 'true') {
        query += ' AND is_fast_moving = 1';
    }

    if (search) {
        query += ' AND (material_code LIKE ? OR material_name LIKE ? OR supplier LIKE ? OR location LIKE ? OR batch_lot_number LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term, term, term);
    }

    const sortMode = String(sort || 'PRIORITIZED').toUpperCase();
    if (sortMode === 'PRIORITIZED') {
        query += ` ORDER BY COALESCE(is_fast_moving, 0) DESC, CASE status WHEN 'OUT_OF_STOCK' THEN 1 WHEN 'LOW_STOCK' THEN 2 ELSE 3 END, material_name ASC`;
    } else if (sortMode === 'MOST_CRITICAL') {
        query += ` ORDER BY CASE status WHEN 'OUT_OF_STOCK' THEN 1 WHEN 'LOW_STOCK' THEN 2 ELSE 3 END, (CAST(current_stock AS REAL) / CASE WHEN COALESCE(minimum_stock_level, 0) <= 0 THEN 1 ELSE minimum_stock_level END) ASC, COALESCE(is_fast_moving, 0) DESC, material_name ASC`;
    } else if (sortMode === 'ALPHABETICAL_ASC' || sortMode === 'ALPHABETICAL') {
        query += ` ORDER BY material_name COLLATE NOCASE ASC, material_code ASC`;
    } else if (sortMode === 'ALPHABETICAL_DESC') {
        query += ` ORDER BY material_name COLLATE NOCASE DESC, material_code ASC`;
    } else if (sortMode === 'CODE_ASC') {
        query += ` ORDER BY material_code ASC`;
    } else if (sortMode === 'STOCK_LOW') {
        query += ` ORDER BY current_stock ASC, material_name ASC`;
    } else if (sortMode === 'STOCK_HIGH') {
        query += ` ORDER BY current_stock DESC, material_name ASC`;
    } else {
        query += ` ORDER BY COALESCE(is_fast_moving, 0) DESC, CASE status WHEN 'OUT_OF_STOCK' THEN 1 WHEN 'LOW_STOCK' THEN 2 ELSE 3 END, material_code ASC`;
    }

    const items = db.prepare(query).all(...params);

    const allItems = db.prepare('SELECT * FROM raw_materials_inventory').all();
    const summary = {
        totalMaterials: allItems.length,
        inStockCount: allItems.filter(i => i.status === 'IN_STOCK').length,
        lowStockCount: allItems.filter(i => i.status === 'LOW_STOCK').length,
        outOfStockCount: allItems.filter(i => i.status === 'OUT_OF_STOCK').length,
        fastMovingCount: allItems.filter(i => Number(i.is_fast_moving) === 1).length,
        totalValuation: allItems.reduce((acc, i) => acc + ((Number(i.current_stock) || 0) * (Number(i.unit_cost) || 0)), 0),
        categories: Array.from(new Set(allItems.map(i => i.category).filter(Boolean))).sort(),
        suppliers: Array.from(new Set(allItems.map(i => i.supplier).filter(Boolean))).sort()
    };

    return res.json({
        success: true,
        summary,
        data: items
    });
});

/**
 * POST /api/raw-materials
 * Add a new raw material to warehouse inventory
 */
router.post('/', authenticateToken, (req, res) => {
    if (!ALLOWED_EDIT_ROLES.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Only Inventory Officer, Purchasing, or Executives can add raw materials.' });
    }

    const {
        material_code,
        material_name,
        category = 'Active Ingredients',
        supplier = '',
        current_stock = 0,
        unit = 'kg',
        minimum_stock_level = 10,
        unit_cost = 0,
        location = 'Warehouse Zone A',
        batch_lot_number = '',
        expiry_date = '',
        is_fast_moving = 0,
        notes = ''
    } = req.body || {};

    if (!material_code || !material_name) {
        return res.status(400).json({ success: false, error: 'Material Code and Material Name are required.' });
    }

    const codeClean = String(material_code).trim().toUpperCase();
    const existing = db.prepare('SELECT id FROM raw_materials_inventory WHERE UPPER(material_code) = ?').get(codeClean);
    if (existing) {
        return res.status(400).json({ success: false, error: `Material code '${codeClean}' already exists in warehouse inventory.` });
    }

    const id = uuidv4();
    const stockNum = Number(current_stock) || 0;
    const minNum = Number(minimum_stock_level) || 0;
    const costNum = Number(unit_cost) || 0;
    const fastMovingNum = (is_fast_moving === true || Number(is_fast_moving) === 1) ? 1 : 0;
    const status = computeStockStatus(stockNum, minNum);
    const now = getManilaDateTime();

    db.prepare(`
        INSERT INTO raw_materials_inventory (
            id, material_code, material_name, category, supplier,
            current_stock, unit, minimum_stock_level, unit_cost,
            location, batch_lot_number, expiry_date, status, is_fast_moving, notes,
            updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, codeClean, String(material_name).trim(), String(category).trim(), String(supplier || '').trim(),
        stockNum, String(unit || 'kg').trim(), minNum, costNum,
        String(location || 'Warehouse Zone A').trim(), String(batch_lot_number || '').trim(), String(expiry_date || '').trim(),
        status, fastMovingNum, String(notes || '').trim(), req.user.name, now, now
    );

    const created = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE_RAW_MATERIAL',
        entityType: 'RAW_MATERIAL',
        entityId: codeClean,
        details: { material_code: codeClean, material_name, current_stock: stockNum, unit, status, is_fast_moving: fastMovingNum },
        ipAddress: req.ip
    });

    return res.status(201).json({
        success: true,
        message: `Raw material ${codeClean} added to warehouse inventory.`,
        data: created
    });
});

/**
 * PUT /api/raw-materials/:id
 * Update raw material details or stock levels
 */
router.put('/:id', authenticateToken, (req, res) => {
    if (!ALLOWED_EDIT_ROLES.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Only Inventory Officer, Purchasing, or Executives can update raw materials.' });
    }

    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'Raw material item not found.' });
    }

    const {
        material_code,
        material_name,
        category,
        supplier,
        current_stock,
        unit,
        minimum_stock_level,
        unit_cost,
        location,
        batch_lot_number,
        expiry_date,
        is_fast_moving,
        notes
    } = req.body || {};

    const newCode = material_code !== undefined ? String(material_code).trim().toUpperCase() : existing.material_code;
    const newName = material_name !== undefined ? String(material_name).trim() : existing.material_name;
    const newCategory = category !== undefined ? String(category).trim() : existing.category;
    const newSupplier = supplier !== undefined ? String(supplier).trim() : existing.supplier;
    const newStock = current_stock !== undefined ? Number(current_stock) : Number(existing.current_stock);
    const newUnit = unit !== undefined ? String(unit).trim() : existing.unit;
    const newMin = minimum_stock_level !== undefined ? Number(minimum_stock_level) : Number(existing.minimum_stock_level);
    const newCost = unit_cost !== undefined ? Number(unit_cost) : Number(existing.unit_cost);
    const newLoc = location !== undefined ? String(location).trim() : existing.location;
    const newLot = batch_lot_number !== undefined ? String(batch_lot_number).trim() : existing.batch_lot_number;
    const newExp = expiry_date !== undefined ? String(expiry_date).trim() : existing.expiry_date;
    const newFastMoving = is_fast_moving !== undefined
        ? ((is_fast_moving === true || Number(is_fast_moving) === 1) ? 1 : 0)
        : (Number(existing.is_fast_moving) === 1 ? 1 : 0);
    const newNotes = notes !== undefined ? String(notes).trim() : existing.notes;
    const newStatus = computeStockStatus(newStock, newMin);
    const now = getManilaDateTime();

    db.prepare(`
        UPDATE raw_materials_inventory
        SET material_code = ?, material_name = ?, category = ?, supplier = ?,
            current_stock = ?, unit = ?, minimum_stock_level = ?, unit_cost = ?,
            location = ?, batch_lot_number = ?, expiry_date = ?, status = ?,
            is_fast_moving = ?, notes = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
    `).run(
        newCode, newName, newCategory, newSupplier,
        newStock, newUnit, newMin, newCost,
        newLoc, newLot, newExp, newStatus,
        newFastMoving, newNotes, req.user.name, now, id
    );

    const updated = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE_RAW_MATERIAL',
        entityType: 'RAW_MATERIAL',
        entityId: newCode,
        details: {
            previous_stock: existing.current_stock,
            new_stock: newStock,
            status: newStatus,
            is_fast_moving: newFastMoving
        },
        ipAddress: req.ip
    });

    return res.json({
        success: true,
        message: `Raw material ${newCode} updated.`,
        data: updated
    });
});

/**
 * POST /api/raw-materials/:id/toggle-fast-moving
 * Assign or remove the Fast Moving (Frequently Used) tag on a raw material
 */
router.post('/:id/toggle-fast-moving', authenticateToken, (req, res) => {
    if (!ALLOWED_EDIT_ROLES.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Only Inventory Officer or authorized roles can assign Fast Moving tags.' });
    }

    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'Raw material not found.' });
    }

    const requestedState = req.body && req.body.is_fast_moving !== undefined
        ? ((req.body.is_fast_moving === true || Number(req.body.is_fast_moving) === 1) ? 1 : 0)
        : (Number(existing.is_fast_moving) === 1 ? 0 : 1);

    const now = getManilaDateTime();
    db.prepare(`
        UPDATE raw_materials_inventory
        SET is_fast_moving = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
    `).run(requestedState, req.user.name, now, id);

    const updated = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'TOGGLE_RAW_MATERIAL_FAST_MOVING',
        entityType: 'RAW_MATERIAL',
        entityId: existing.material_code,
        details: {
            material_code: existing.material_code,
            material_name: existing.material_name,
            is_fast_moving: requestedState
        },
        ipAddress: req.ip
    });

    return res.json({
        success: true,
        message: requestedState === 1
            ? `${existing.material_name} tagged as Fast Moving (Frequently Used).`
            : `Fast Moving tag removed from ${existing.material_name}.`,
        data: updated
    });
});

/**
 * POST /api/raw-materials/:id/adjust-stock
 * Quick stock adjustment (+ Restock / - Issue to Production / Set Exact Count)
 */
router.post('/:id/adjust-stock', authenticateToken, (req, res) => {
    if (!ALLOWED_EDIT_ROLES.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Access denied to adjust warehouse raw material stock.' });
    }

    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'Raw material not found.' });
    }

    const { adjustment_type = 'ADD', quantity = 0, reason = '', batch_lot_number } = req.body || {};
    const qtyNum = Number(quantity);
    if (isNaN(qtyNum) || qtyNum < 0) {
        return res.status(400).json({ success: false, error: 'Valid positive quantity is required.' });
    }

    let newStock = Number(existing.current_stock) || 0;
    let newIssuanceCount = Number(existing.issuance_count) || 0;
    const typeUpper = String(adjustment_type).toUpperCase();
    if (typeUpper === 'ADD' || typeUpper === 'RESTOCK') {
        newStock = Number((newStock + qtyNum).toFixed(4));
    } else if (typeUpper === 'DEDUCT' || typeUpper === 'ISSUE' || typeUpper === 'CONSUME') {
        newStock = Math.max(0, Number((newStock - qtyNum).toFixed(4)));
        newIssuanceCount += 1;
    } else if (typeUpper === 'SET') {
        newStock = Number(qtyNum.toFixed(4));
    } else {
        return res.status(400).json({ success: false, error: 'Invalid adjustment_type. Use ADD, DEDUCT, or SET.' });
    }

    const newStatus = computeStockStatus(newStock, existing.minimum_stock_level);
    const newLot = batch_lot_number !== undefined && batch_lot_number !== '' ? String(batch_lot_number).trim() : existing.batch_lot_number;
    const newNotes = reason ? `${existing.notes ? existing.notes + ' | ' : ''}[${typeUpper} ${qtyNum}${existing.unit}: ${reason}]` : existing.notes;
    const now = getManilaDateTime();

    db.prepare(`
        UPDATE raw_materials_inventory
        SET current_stock = ?, status = ?, batch_lot_number = ?, issuance_count = ?, notes = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
    `).run(newStock, newStatus, newLot, newIssuanceCount, newNotes, req.user.name, now, id);

    const updated = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'ADJUST_RAW_MATERIAL_STOCK',
        entityType: 'RAW_MATERIAL',
        entityId: existing.material_code,
        details: {
            material_code: existing.material_code,
            adjustment_type: typeUpper,
            quantity: qtyNum,
            previous_stock: existing.current_stock,
            new_stock: newStock,
            status: newStatus,
            reason
        },
        ipAddress: req.ip
    });

    return res.json({
        success: true,
        message: `Stock for ${existing.material_name} adjusted to ${newStock} ${existing.unit}.`,
        data: updated
    });
});

/**
 * DELETE /api/raw-materials/:id
 */
router.delete('/:id', authenticateToken, (req, res) => {
    if (!['INVENTORY', 'SUPER_ADMIN', 'ADMIN', 'CEO', 'COO', 'IT_ADMIN'].includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'Raw material not found.' });
    }

    db.prepare('DELETE FROM raw_materials_inventory WHERE id = ?').run(id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'DELETE_RAW_MATERIAL',
        entityType: 'RAW_MATERIAL',
        entityId: existing.material_code,
        details: { deleted: existing.material_name },
        ipAddress: req.ip
    });

    return res.json({
        success: true,
        message: `Raw material ${existing.material_code} deleted from warehouse inventory.`
    });
});

module.exports = router;

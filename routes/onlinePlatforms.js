const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { getNextDocumentNumber } = require('../services/documentNumberService');
const { logAudit } = require('../services/auditService');

/**
 * -------------------------------------------------------------
 * ONLINE PLATFORM INVENTORY ENDPOINTS
 * -------------------------------------------------------------
 */

// GET /api/online-platforms/inventory
router.get('/inventory', authenticateToken, (req, res) => {
    try {
        const { platform, status, search } = req.query;
        let query = 'SELECT * FROM online_platform_inventory WHERE 1=1';
        const params = [];

        if (platform && platform !== 'ALL') {
            query += ' AND platform = ?';
            params.push(platform);
        }

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        if (search) {
            query += ' AND (sku LIKE ? OR product_name LIKE ? OR notes LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        query += ' ORDER BY product_name ASC';
        const items = db.prepare(query).all(...params);

        // Calculate summary metrics
        const stats = {
            totalSkus: items.length,
            totalUnits: items.reduce((sum, it) => sum + (Number(it.stock_quantity) || 0), 0),
            lowStockCount: items.filter(it => it.status === 'LOW_STOCK').length,
            outOfStockCount: items.filter(it => it.status === 'OUT_OF_STOCK').length
        };

        res.json({
            success: true,
            data: items,
            stats
        });
    } catch (err) {
        console.error('Error fetching online platform inventory:', err);
        res.status(500).json({ success: false, error: 'Failed to retrieve online inventory.' });
    }
});

// POST /api/online-platforms/inventory
router.post('/inventory', authenticateToken, (req, res) => {
    try {
        const {
            product_id,
            sku,
            product_name,
            platform = 'TIKTOK',
            stock_quantity = 0,
            unit = 'PCS',
            reorder_point = 50,
            notes
        } = req.body;

        if (!product_name || !String(product_name).trim()) {
            return res.status(400).json({ success: false, error: 'Product name is required.' });
        }

        const cleanSku = (sku && String(sku).trim()) || ('VYU-' + product_name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase());
        const stock = parseFloat(stock_quantity) || 0;
        const reorder = parseFloat(reorder_point) || 50;
        const status = stock <= 0 ? 'OUT_OF_STOCK' : (stock <= reorder ? 'LOW_STOCK' : 'IN_STOCK');
        const id = uuidv4();

        db.prepare(`
            INSERT INTO online_platform_inventory (
                id, product_id, sku, product_name, platform, stock_quantity, reserved_quantity,
                unit, reorder_point, status, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(id, product_id || null, cleanSku, product_name.trim(), platform, stock, unit, reorder, status, notes || null);

        if (stock > 0) {
            db.prepare(`
                INSERT INTO online_inventory_movements (
                    id, inventory_id, movement_type, quantity, reference_no, platform,
                    performed_by, performed_by_name, notes, created_at
                ) VALUES (?, ?, 'INITIAL_STOCK', ?, 'INIT', ?, ?, ?, 'Initial inventory count', datetime('now', 'localtime'))
            `).run(uuidv4(), id, stock, platform, req.user.id, req.user.name);
        }

        const created = db.prepare('SELECT * FROM online_platform_inventory WHERE id = ?').get(id);

        try {
            logAudit({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: 'CREATE_ONLINE_INVENTORY',
                entityType: 'online_platform_inventory',
                entityId: id,
                details: created
            });
        } catch (_) {}

        res.status(201).json({
            success: true,
            message: 'Online inventory item created successfully.',
            data: created
        });
    } catch (err) {
        console.error('Error creating online platform inventory item:', err);
        res.status(500).json({ success: false, error: 'Failed to create inventory item.' });
    }
});

// PUT /api/online-platforms/inventory/:id
router.put('/inventory/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const existing = db.prepare('SELECT * FROM online_platform_inventory WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Inventory item not found.' });
        }

        const {
            sku = existing.sku,
            product_name = existing.product_name,
            platform = existing.platform,
            stock_quantity = existing.stock_quantity,
            unit = existing.unit,
            reorder_point = existing.reorder_point,
            notes = existing.notes
        } = req.body;

        const stock = parseFloat(stock_quantity) || 0;
        const reorder = parseFloat(reorder_point) || 50;
        const status = stock <= 0 ? 'OUT_OF_STOCK' : (stock <= reorder ? 'LOW_STOCK' : 'IN_STOCK');

        db.prepare(`
            UPDATE online_platform_inventory
            SET sku = ?, product_name = ?, platform = ?, stock_quantity = ?,
                unit = ?, reorder_point = ?, status = ?, notes = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(sku, product_name.trim(), platform, stock, unit, reorder, status, notes || null, id);

        const updated = db.prepare('SELECT * FROM online_platform_inventory WHERE id = ?').get(id);

        try {
            logAudit({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: 'UPDATE_ONLINE_INVENTORY',
                entityType: 'online_platform_inventory',
                entityId: id,
                details: { previous: existing, updated }
            });
        } catch (_) {}

        res.json({
            success: true,
            message: 'Online inventory item updated successfully.',
            data: updated
        });
    } catch (err) {
        console.error('Error updating online platform inventory item:', err);
        res.status(500).json({ success: false, error: 'Failed to update inventory item.' });
    }
});

// POST /api/online-platforms/inventory/:id/movement
router.post('/inventory/:id/movement', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const existing = db.prepare('SELECT * FROM online_platform_inventory WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Inventory item not found.' });
        }

        const { movement_type, quantity, reference_no, notes } = req.body;
        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) {
            return res.status(400).json({ success: false, error: 'Quantity must be greater than zero.' });
        }

        let newStock = Number(existing.stock_quantity);
        if (['STOCK_IN', 'REQUISITION_REPLENISHMENT', 'RETURN'].includes(movement_type)) {
            newStock += qty;
        } else if (['STOCK_OUT', 'ONLINE_SALE', 'DISPATCH'].includes(movement_type)) {
            if (newStock < qty) {
                return res.status(400).json({ success: false, error: `Insufficient stock on hand (${newStock} available, ${qty} requested).` });
            }
            newStock -= qty;
        } else if (movement_type === 'ADJUSTMENT') {
            // Direct override of quantity
            newStock = qty;
        } else {
            return res.status(400).json({ success: false, error: 'Invalid movement type.' });
        }

        const reorder = Number(existing.reorder_point) || 50;
        const status = newStock <= 0 ? 'OUT_OF_STOCK' : (newStock <= reorder ? 'LOW_STOCK' : 'IN_STOCK');

        db.prepare(`
            UPDATE online_platform_inventory
            SET stock_quantity = ?, status = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(newStock, status, id);

        const movementId = uuidv4();
        db.prepare(`
            INSERT INTO online_inventory_movements (
                id, inventory_id, movement_type, quantity, reference_no, platform,
                performed_by, performed_by_name, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `).run(
            movementId,
            id,
            movement_type,
            qty,
            reference_no || null,
            existing.platform,
            req.user.id,
            req.user.name,
            notes || null
        );

        const updated = db.prepare('SELECT * FROM online_platform_inventory WHERE id = ?').get(id);

        res.json({
            success: true,
            message: `Movement recorded successfully. New stock: ${newStock} ${existing.unit}.`,
            data: updated
        });
    } catch (err) {
        console.error('Error recording inventory movement:', err);
        res.status(500).json({ success: false, error: 'Failed to record movement.' });
    }
});

// GET /api/online-platforms/inventory/:id/movements
router.get('/inventory/:id/movements', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const movements = db.prepare(`
            SELECT * FROM online_inventory_movements
            WHERE inventory_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `).all(id);

        res.json({ success: true, data: movements });
    } catch (err) {
        console.error('Error fetching inventory movements:', err);
        res.status(500).json({ success: false, error: 'Failed to load movements history.' });
    }
});

/**
 * -------------------------------------------------------------
 * FINISHED PRODUCT REQUISITIONS ENDPOINTS
 * -------------------------------------------------------------
 */

// GET /api/online-platforms/requisitions
router.get('/requisitions', authenticateToken, (req, res) => {
    try {
        const { status, department, search, limit = 100 } = req.query;
        let query = `
            SELECT fpr.*,
                   (SELECT COUNT(*) FROM finished_product_requisition_items WHERE requisition_id = fpr.id) as items_count,
                   (SELECT SUM(required_qty) FROM finished_product_requisition_items WHERE requisition_id = fpr.id) as total_required_qty,
                   (SELECT SUM(qty_issued) FROM finished_product_requisition_items WHERE requisition_id = fpr.id) as total_issued_qty
            FROM finished_product_requisitions fpr
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND fpr.status = ?';
            params.push(status);
        }

        if (department && department !== 'ALL') {
            query += ' AND fpr.department = ?';
            params.push(department);
        }

        if (search) {
            query += ' AND (fpr.request_number LIKE ? OR fpr.document_code LIKE ? OR fpr.requested_by_name LIKE ? OR fpr.purpose LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term);
        }

        query += ' ORDER BY fpr.request_date DESC, fpr.request_number DESC LIMIT ?';
        params.push(parseInt(limit, 10));

        const requisitions = db.prepare(query).all(...params);

        const mapped = requisitions.map(fpr => ({
            ...fpr,
            requisition_number: fpr.request_number,
            requisition_date: fpr.request_date,
            requested_by: fpr.requested_by_name,
            item_count: fpr.items_count,
            total_quantity_requested: fpr.total_required_qty,
            total_quantity_issued: fpr.total_issued_qty
        }));

        res.json({
            success: true,
            data: mapped
        });
    } catch (err) {
        console.error('Error fetching finished product requisitions:', err);
        res.status(500).json({ success: false, error: 'Failed to retrieve requisitions.' });
    }
});

// GET /api/online-platforms/requisitions/:id
router.get('/requisitions/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const requisition = db.prepare(`
            SELECT * FROM finished_product_requisitions
            WHERE id = ? OR request_number = ?
        `).get(id, id);

        if (!requisition) {
            return res.status(404).json({ success: false, error: 'Requisition not found.' });
        }

        const items = db.prepare(`
            SELECT * FROM finished_product_requisition_items
            WHERE requisition_id = ?
            ORDER BY item_no ASC
        `).all(requisition.id);

        const mappedItems = items.map(it => ({
            ...it,
            item_name: it.material_name,
            quantity_requested: it.required_qty,
            quantity_issued: it.qty_issued,
            unit: it.unit_of_measure,
            remarks: it.purpose_remarks
        }));

        res.json({
            success: true,
            data: {
                ...requisition,
                requisition_number: requisition.request_number,
                requisition_date: requisition.request_date,
                requested_by: requisition.requested_by_name,
                items: mappedItems
            }
        });
    } catch (err) {
        console.error('Error fetching requisition details:', err);
        res.status(500).json({ success: false, error: 'Failed to retrieve requisition details.' });
    }
});

// POST /api/online-platforms/requisitions
router.post('/requisitions', authenticateToken, (req, res) => {
    try {
        const department = req.body.department || 'TIKTOK';
        const requested_by_name = req.body.requested_by_name || req.body.requested_by || req.user.name || 'ANGELICA TAMANO';
        const designation = req.body.designation || 'OFFICER';
        const request_date = req.body.request_date || req.body.requisition_date || new Date().toISOString().split('T')[0];
        const effective_date = req.body.effective_date || request_date;
        const urgency = req.body.urgency || 'REGULAR';
        const purpose = req.body.purpose || 'ONLINE PLATFORM SALES';
        const items = req.body.items || [];

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one item is required in the requisition.' });
        }

        // Generate next requisition number (e.g. FPR -FORM 032)
        const request_number = getNextDocumentNumber('FPR');
        const document_code = req.body.document_code || 'PRO-FM-003';
        const reqId = uuidv4();

        const insertReq = db.prepare(`
            INSERT INTO finished_product_requisitions (
                id, request_number, document_code, revision_no, effective_date, request_date,
                category_type, department, requested_by, requested_by_name, designation,
                status, urgency, purpose, checked_by, issuance_prepared_by, issuance_verified_by,
                issuance_date, receiving_reviewed_by, receiving_verified_by, receiving_date,
                created_at, updated_at
            ) VALUES (?, ?, ?, '00', ?, ?, 'FINISHED PRODUCT', ?, ?, ?, ?, 'PENDING', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `);

        const insertItem = db.prepare(`
            INSERT INTO finished_product_requisition_items (
                id, requisition_id, item_no, product_id, material_name, batch_lot_no,
                required_qty, qty_issued, remaining_stock, remaining_stock_notes, unit_of_measure,
                urgency, purpose_remarks, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, ?, datetime('now', 'localtime'))
        `);

        const createTx = db.transaction(() => {
            insertReq.run(
                reqId,
                request_number,
                document_code,
                effective_date,
                request_date,
                department,
                req.user.id,
                requested_by_name,
                designation,
                urgency,
                purpose
            );

            items.forEach((it, idx) => {
                const name = it.material_name || it.item_name || '';
                const qty = parseFloat(it.required_qty != null ? it.required_qty : it.quantity_requested) || 0;
                const unit = (it.unit_of_measure || it.unit || 'PCS').toUpperCase();
                const itemRemarks = it.purpose_remarks || it.remarks || purpose;
                insertItem.run(
                    uuidv4(),
                    reqId,
                    idx + 1,
                    it.product_id || it.online_inventory_id || null,
                    String(name).trim(),
                    it.batch_lot_no || it.item_code || null,
                    qty,
                    unit,
                    it.urgency ? String(it.urgency).trim().toUpperCase() : urgency,
                    itemRemarks
                );
            });
        });

        createTx();

        const created = db.prepare('SELECT * FROM finished_product_requisitions WHERE id = ?').get(reqId);
        const createdItems = db.prepare('SELECT * FROM finished_product_requisition_items WHERE requisition_id = ? ORDER BY item_no ASC').all(reqId);

        try {
            logAudit({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: 'CREATE_PRODUCT_REQUISITION',
                entityType: 'finished_product_requisitions',
                entityId: reqId,
                details: { ...created, items_count: items.length }
            });
        } catch (_) {}

        const mappedItems = createdItems.map(it => ({
            ...it,
            item_name: it.material_name,
            quantity_requested: it.required_qty,
            quantity_issued: it.qty_issued,
            unit: it.unit_of_measure,
            remarks: it.purpose_remarks
        }));

        res.status(201).json({
            success: true,
            message: `Product requisition ${request_number} created successfully.`,
            data: {
                ...created,
                requisition_number: created.request_number,
                requisition_date: created.request_date,
                requested_by: created.requested_by_name,
                items: mappedItems
            }
        });
    } catch (err) {
        console.error('Error creating product requisition:', err);
        res.status(500).json({ success: false, error: 'Failed to create finished product requisition.' });
    }
});

// Common handler for warehouse issuance
function handleWarehouseIssuance(req, res) {
    try {
        const { id } = req.params;
        const requisition = db.prepare('SELECT * FROM finished_product_requisitions WHERE id = ? OR request_number = ?').get(id, id);
        if (!requisition) {
            return res.status(404).json({ success: false, error: 'Requisition not found.' });
        }
        const reqPk = requisition.id;

        const {
            issuance_prepared_by = req.user.name || 'MARK DALANON',
            issuance_verified_by = 'RODELLO LUY',
            issuance_date = new Date().toISOString().split('T')[0],
            items = []
        } = req.body;

        const updateItem = db.prepare(`
            UPDATE finished_product_requisition_items
            SET qty_issued = ?, remaining_stock = ?, remaining_stock_notes = ?, batch_lot_no = COALESCE(?, batch_lot_no)
            WHERE id = ? AND requisition_id = ?
        `);

        const tx = db.transaction(() => {
            if (Array.isArray(items) && items.length > 0) {
                for (const it of items) {
                    if (it.id) {
                        updateItem.run(
                            parseFloat(it.qty_issued) || 0,
                            parseFloat(it.remaining_stock) || 0,
                            it.remaining_stock_notes || null,
                            it.batch_lot_no || null,
                            it.id,
                            reqPk
                        );
                    }
                }
            } else {
                // Default: mark all items as fully issued with their requested qty
                db.prepare(`
                    UPDATE finished_product_requisition_items
                    SET qty_issued = required_qty
                    WHERE requisition_id = ?
                `).run(reqPk);
            }

            db.prepare(`
                UPDATE finished_product_requisitions
                SET issuance_prepared_by = ?, issuance_verified_by = ?, issuance_date = ?,
                    status = 'ISSUED', updated_at = datetime('now', 'localtime')
                WHERE id = ?
            `).run(issuance_prepared_by, issuance_verified_by, issuance_date, reqPk);
        });

        tx();

        res.json({
            success: true,
            message: `Warehouse issuance recorded for requisition ${requisition.request_number}.`
        });
    } catch (err) {
        console.error('Error recording warehouse issuance:', err);
        res.status(500).json({ success: false, error: 'Failed to record issuance.' });
    }
}

// Warehouse Records Issuance (PUT and POST supported)
router.put('/requisitions/:id/issuance', authenticateToken, handleWarehouseIssuance);
router.post('/requisitions/:id/issue', authenticateToken, handleWarehouseIssuance);

// Common handler for operator receiving
function handleOperatorReceiving(req, res) {
    try {
        const { id } = req.params;
        const requisition = db.prepare('SELECT * FROM finished_product_requisitions WHERE id = ? OR request_number = ?').get(id, id);
        if (!requisition) {
            return res.status(404).json({ success: false, error: 'Requisition not found.' });
        }
        const reqPk = requisition.id;

        const {
            receiving_reviewed_by = req.user.name || 'ANGELICA TAMANO',
            receiving_verified_by = 'SHARMAINE SANTOS',
            receiving_date = new Date().toISOString().split('T')[0],
            auto_restock = true
        } = req.body;

        const items = db.prepare('SELECT * FROM finished_product_requisition_items WHERE requisition_id = ?').all(reqPk);

        const tx = db.transaction(() => {
            db.prepare(`
                UPDATE finished_product_requisitions
                SET receiving_reviewed_by = ?, receiving_verified_by = ?, receiving_date = ?,
                    status = 'RECEIVED', updated_at = datetime('now', 'localtime')
                WHERE id = ?
            `).run(receiving_reviewed_by, receiving_verified_by, receiving_date, reqPk);

            // If auto_restock is enabled, increment the online inventory stock
            if (auto_restock && items.length > 0) {
                for (const it of items) {
                    const issuedQty = Number(it.qty_issued) > 0 ? Number(it.qty_issued) : Number(it.required_qty);
                    if (issuedQty <= 0) continue;

                    // Match inventory row
                    let inv = db.prepare('SELECT * FROM online_platform_inventory WHERE product_name = ? AND platform = ?')
                        .get(it.material_name, requisition.department);

                    if (!inv) {
                        inv = db.prepare('SELECT * FROM online_platform_inventory WHERE product_name = ? LIMIT 1')
                            .get(it.material_name);
                    }

                    if (inv) {
                        const newStock = Number(inv.stock_quantity) + issuedQty;
                        const reorder = Number(inv.reorder_point) || 50;
                        const status = newStock <= 0 ? 'OUT_OF_STOCK' : (newStock <= reorder ? 'LOW_STOCK' : 'IN_STOCK');

                        db.prepare(`
                            UPDATE online_platform_inventory
                            SET stock_quantity = ?, status = ?, updated_at = datetime('now', 'localtime')
                            WHERE id = ?
                        `).run(newStock, status, inv.id);

                        db.prepare(`
                            INSERT INTO online_inventory_movements (
                                id, inventory_id, movement_type, quantity, reference_no, platform,
                                performed_by, performed_by_name, notes, created_at
                            ) VALUES (?, ?, 'REQUISITION_REPLENISHMENT', ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
                        `).run(
                            uuidv4(),
                            inv.id,
                            issuedQty,
                            requisition.request_number,
                            requisition.department,
                            req.user.id,
                            req.user.name,
                            `Replenished via Requisition ${requisition.request_number}`
                        );
                    }
                }
            }
        });

        tx();

        res.json({
            success: true,
            message: `Receipt confirmed for requisition ${requisition.request_number}. Online inventory restocked.`
        });
    } catch (err) {
        console.error('Error confirming receipt:', err);
        res.status(500).json({ success: false, error: 'Failed to confirm receipt.' });
    }
}

// Operator Confirms Receipt (PUT and POST supported)
router.put('/requisitions/:id/receiving', authenticateToken, handleOperatorReceiving);
router.post('/requisitions/:id/receive', authenticateToken, handleOperatorReceiving);

module.exports = router;

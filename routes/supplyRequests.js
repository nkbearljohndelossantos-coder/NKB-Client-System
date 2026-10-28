const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles, ROLES } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const { getNextDocumentNumber } = require('../services/documentNumberService');

function getEnrichedSupplyRequest(id) {
    return db.prepare(`
        SELECT sr.*, 
               COALESCE(po.po_number, 'WH-STOCK-BOM') as po_number,
               COALESCE(po.status, 'STOCK_REPLENISHMENT') as po_status,
               po.expected_delivery_date as po_delivery_date,
               COALESCE(c.company_name, 'Warehouse Raw Materials') as client_name,
               COALESCE(u.name, 'Inventory Officer') as requested_by_name,
               u.email as requested_by_email,
               u.phone as requested_by_phone,
               u.whatsapp_number as requested_by_whatsapp,
               qcu.name as qc_inspector_name,
               qcu.phone as qc_inspector_phone,
               qcu.whatsapp_number as qc_inspector_whatsapp,
               rec_u.name as received_by_name
        FROM supply_requests sr
        LEFT JOIN purchase_orders po ON sr.po_id = po.id
        LEFT JOIN clients c ON po.client_id = c.id
        LEFT JOIN users u ON sr.requested_by = u.id
        LEFT JOIN users qcu ON sr.qc_inspected_by = qcu.id
        LEFT JOIN users rec_u ON sr.received_by = rec_u.id
        WHERE sr.id = ?
    `).get(id);
}

function checkAndFulfillPoRawMaterials(poId) {
    if (!poId || poId === 'WAREHOUSE-STOCK') return false;
    const remainingPending = db.prepare(`
        SELECT COUNT(*) as count 
        FROM supply_requests 
        WHERE po_id = ? AND status NOT IN ('DELIVERED', 'QC_APPROVED', 'QC_BYPASSED', 'CANCELLED')
    `).get(poId);

    if (!remainingPending || remainingPending.count === 0) {
        db.prepare(`
            UPDATE purchase_orders
            SET raw_materials_status = 'SUFFICIENT',
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(poId);
        return true;
    }
    return false;
}

function restockBomMaterialsIfPresent(bomItemsJson, notesPrefix = '') {
    if (!bomItemsJson) return;
    try {
        const items = typeof bomItemsJson === 'string' ? JSON.parse(bomItemsJson) : bomItemsJson;
        if (!Array.isArray(items)) return;
        for (const item of items) {
            const rawMatId = item.raw_material_id;
            const code = item.material_code;
            const qty = Number(item.needed_qty || item.quantity || 0);
            if (qty > 0) {
                let target = null;
                if (rawMatId) target = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(rawMatId);
                if (!target && code) target = db.prepare('SELECT * FROM raw_materials_inventory WHERE UPPER(material_code) = UPPER(?)').get(code);
                if (target) {
                    const newStock = Number((Number(target.current_stock || 0) + qty).toFixed(4));
                    const newStatus = (newStock <= 0) ? 'OUT_OF_STOCK' : ((target.minimum_stock_level > 0 && newStock <= target.minimum_stock_level) ? 'LOW_STOCK' : 'IN_STOCK');
                    const noteAdd = notesPrefix ? `[${notesPrefix} +${qty} ${target.unit || 'kg'}]` : `[Restocked +${qty} ${target.unit || 'kg'}]`;
                    const updatedNotes = target.notes ? `${target.notes} | ${noteAdd}` : noteAdd;
                    db.prepare(`
                        UPDATE raw_materials_inventory
                        SET current_stock = ?, status = ?, notes = ?, updated_at = datetime('now', 'localtime')
                        WHERE id = ?
                    `).run(newStock, newStatus, updatedNotes, target.id);
                }
            }
        }
    } catch (e) {
        console.warn('restockBomMaterials error:', e.message);
    }
}

/**
 * GET /api/supply-requests/fund-limit
 * Retrieve global purchasing fund limit
 */
router.get('/fund-limit', authenticateToken, (req, res) => {
    try {
        const row = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'default_purchasing_fund_limit'").get();
        const limit = row ? parseFloat(row.setting_value) || 500000.0 : 500000.0;
        return res.json({ success: true, data: { fund_limit: limit }, fund_limit: limit });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/supply-requests/fund-limit
 * Update default purchasing fund limit (budget ceiling)
 */
router.put('/fund-limit', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING, ROLES.CEO), (req, res) => {
    try {
        const { fund_limit } = req.body || {};
        const val = parseFloat(fund_limit);
        if (isNaN(val) || val < 0) {
            return res.status(400).json({ success: false, error: 'Fund limit must be a positive number.' });
        }
        db.prepare(`
            INSERT INTO system_settings (setting_key, setting_value, updated_at) 
            VALUES ('default_purchasing_fund_limit', ?, datetime('now', 'localtime'))
            ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
        `).run(String(val));

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE_PURCHASING_FUND_LIMIT',
            entityType: 'SYSTEM_SETTINGS',
            entityId: 'default_purchasing_fund_limit',
            details: { newFundLimit: val },
            ipAddress: req.ip
        });

        return res.json({
            success: true,
            message: `Purchasing fund limit updated to ₱${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
            data: { fund_limit: val },
            fund_limit: val
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/supply-requests
 * Retrieve all supply requisitions submitted by Inventory for Purchasing Department
 */
router.get('/', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING, ROLES.INVENTORY, ROLES.QC, ROLES.COMPOUNDING, ROLES.CEO), (req, res) => {
    try {
        const { status, urgency, search } = req.query;

        let sql = `
            SELECT sr.*, 
                   COALESCE(po.po_number, 'WH-STOCK-BOM') as po_number,
                   COALESCE(po.status, 'STOCK_REPLENISHMENT') as po_status,
                   po.expected_delivery_date as po_delivery_date,
                   COALESCE(c.company_name, 'Warehouse Raw Materials') as client_name,
                   COALESCE(u.name, 'Inventory Officer') as requested_by_name,
                   u.email as requested_by_email,
                   u.phone as requested_by_phone,
                   u.whatsapp_number as requested_by_whatsapp,
                   qcu.name as qc_inspector_name,
                   qcu.phone as qc_inspector_phone,
                   qcu.whatsapp_number as qc_inspector_whatsapp
            FROM supply_requests sr
            LEFT JOIN purchase_orders po ON sr.po_id = po.id
            LEFT JOIN clients c ON po.client_id = c.id
            LEFT JOIN users u ON sr.requested_by = u.id
            LEFT JOIN users qcu ON sr.qc_inspected_by = qcu.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            sql += ' AND sr.status = ?';
            params.push(status.toUpperCase().trim());
        }

        if (urgency) {
            sql += ' AND sr.urgency = ?';
            params.push(urgency.toUpperCase().trim());
        }

        if (search) {
            sql += ' AND (COALESCE(po.po_number, \'WH-STOCK-BOM\') LIKE ? OR COALESCE(c.company_name, \'Warehouse Raw Materials\') LIKE ? OR sr.materials_needed LIKE ? OR COALESCE(u.name, \'\') LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }

        sql += ' ORDER BY sr.created_at DESC';

        const requests = db.prepare(sql).all(...params);
        return res.json({ success: true, data: requests });
    } catch (err) {
        console.error('Error fetching supply requests:', err);
        return res.status(500).json({ success: false, error: 'FAILED_FETCH_REQUISITIONS', message: err.message });
    }
});

/**
 * POST /api/supply-requests
 * Create a Bill of Materials (BOM) raw material requisition directly from Warehouse Inventory or Requisitions view
 */
router.post('/', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING, ROLES.INVENTORY, ROLES.COMPOUNDING), (req, res) => {
    try {
        const { po_id, materials_needed, urgency = 'NORMAL', target_date, notes, affected_products, bom_items, fund_limit } = req.body || {};

        const rawBom = Array.isArray(bom_items)
            ? bom_items.filter(it => it && (it.material_name || it.material_code) && Number(it.requested_qty) > 0)
            : [];

        // Enrich items with catalog costs if not specified
        let totalCost = 0.0;
        const parsedBomItems = rawBom.map(it => {
            let cost = parseFloat(it.unit_cost);
            let supplier = it.supplier;
            if (isNaN(cost) || cost <= 0) {
                if (it.raw_material_id) {
                    const rm = db.prepare('SELECT unit_cost, supplier FROM raw_materials_inventory WHERE id = ?').get(it.raw_material_id);
                    if (rm) {
                        cost = parseFloat(rm.unit_cost) || 0.0;
                        if (!supplier || supplier === 'None') supplier = rm.supplier || 'None';
                    }
                } else if (it.material_code) {
                    const rm = db.prepare('SELECT unit_cost, supplier FROM raw_materials_inventory WHERE UPPER(material_code) = UPPER(?)').get(it.material_code);
                    if (rm) {
                        cost = parseFloat(rm.unit_cost) || 0.0;
                        if (!supplier || supplier === 'None') supplier = rm.supplier || 'None';
                    }
                }
            }
            if (isNaN(cost)) cost = 0.0;
            const qty = parseFloat(it.requested_qty) || 0.0;
            const lineTotal = Math.round(qty * cost * 100) / 100;
            totalCost += lineTotal;
            return {
                ...it,
                unit_cost: cost,
                total_cost: lineTotal,
                supplier: supplier || 'None'
            };
        });
        totalCost = Math.round(totalCost * 100) / 100;

        let finalMaterialsNeeded = (materials_needed || '').trim();
        if (!finalMaterialsNeeded && parsedBomItems.length > 0) {
            finalMaterialsNeeded = parsedBomItems.map(it => {
                const codePart = it.material_code && it.material_code !== 'None' ? `[${it.material_code}] ` : '';
                const supPart = it.supplier && it.supplier !== 'None' ? ` (Supplier: ${it.supplier})` : '';
                const costPart = it.unit_cost > 0 ? ` @ ₱${it.unit_cost.toFixed(2)}` : '';
                return `• ${codePart}${it.material_name || 'Raw Material'}: ${it.requested_qty} ${it.unit || 'kg'}${costPart}${supPart}`;
            }).join('\n');
        }

        if (!finalMaterialsNeeded) {
            return res.status(400).json({
                success: false,
                error: 'Please add at least one raw material to the Bill of Materials (BOM) or describe the materials needed.'
            });
        }

        let targetPoId = po_id && String(po_id).trim() ? String(po_id).trim() : 'WAREHOUSE-STOCK';
        let linkedPo = null;
        if (targetPoId !== 'WAREHOUSE-STOCK') {
            linkedPo = db.prepare('SELECT id, po_number FROM purchase_orders WHERE id = ?').get(targetPoId);
            if (!linkedPo) targetPoId = 'WAREHOUSE-STOCK';
        }

        // Resolve active fund limit
        let activeFundLimit = parseFloat(fund_limit);
        if (isNaN(activeFundLimit) || activeFundLimit <= 0) {
            try {
                const sysLim = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'default_purchasing_fund_limit'").get();
                activeFundLimit = sysLim ? (parseFloat(sysLim.setting_value) || 500000.0) : 500000.0;
            } catch (_) {
                activeFundLimit = 500000.0;
            }
        }

        const reqId = uuidv4();
        const formattedNotes = [
            affected_products ? `Formula / Affected Products: ${affected_products}` : null,
            notes ? `Notes: ${notes}` : null
        ].filter(Boolean).join('\n');
        const bomJson = parsedBomItems.length > 0 ? JSON.stringify(parsedBomItems) : null;

        db.prepare(`
            INSERT INTO supply_requests
            (id, po_id, requested_by, department, materials_needed, urgency, target_date, notes, bom_items, fund_limit, total_cost, status, created_at, updated_at)
            VALUES (?, ?, ?, 'Purchasing Department', ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(
            reqId,
            targetPoId,
            req.user.id,
            finalMaterialsNeeded,
            urgency || 'NORMAL',
            target_date || null,
            formattedNotes || null,
            bomJson,
            activeFundLimit,
            totalCost
        );

        if (linkedPo) {
            db.prepare(`
                UPDATE purchase_orders
                SET raw_materials_status = 'SUPPLIES_REQUESTED',
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
            `).run(linkedPo.id);
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_BOM_SUPPLY_REQUEST',
            entityType: 'SUPPLY_REQUEST',
            entityId: linkedPo ? linkedPo.po_number : reqId,
            details: { poId: targetPoId, requestId: reqId, bomCount: parsedBomItems.length, urgency },
            ipAddress: req.ip
        });

        const createdReq = getEnrichedSupplyRequest(reqId);
        return res.status(201).json({
            success: true,
            message: 'Bill of Materials (BOM) raw material requisition submitted to Purchasing Department.',
            data: createdReq
        });
    } catch (err) {
        console.error('Error creating BOM supply request:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/supply-requests/:id
 * Retrieve a single supply request by ID
 */
router.get('/:id', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING, ROLES.INVENTORY, ROLES.QC, ROLES.COMPOUNDING, ROLES.CEO), (req, res) => {
    const { id } = req.params;
    const reqItem = getEnrichedSupplyRequest(id);

    if (!reqItem) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Requisition not found.' });
    }

    return res.json({ success: true, data: reqItem });
});

/**
 * PUT /api/supply-requests/:id
 * Update status, notes, or procurement details of a supply request
 */
router.put('/:id', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING), (req, res) => {
    const { id } = req.params;
    const { status, notes, supplier_details, target_date } = req.body;

    const existing = db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Requisition not found.' });
    }

    const validStatuses = [
        'SUBMITTED', 'ORDERED', 'IN_TRANSIT', 'PENDING_QC',
        'QC_APPROVED', 'QC_DECLINED', 'REJECTED', 'REORDERED',
        'RETURNED_TO_SUPPLIER', 'QC_BYPASSED', 'DELIVERED', 'CANCELLED'
    ];
    const updatedStatus = status ? status.toUpperCase().trim() : existing.status;
    if (status && !validStatuses.includes(updatedStatus)) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_STATUS',
            message: `Status must be one of: ${validStatuses.join(', ')}`
        });
    }

    let updatedNotes = existing.notes;
    if (notes !== undefined || supplier_details !== undefined) {
        const parts = [];
        if (existing.notes) parts.push(existing.notes);
        if (supplier_details) parts.push(`[Purchasing]: ${supplier_details.trim()}`);
        if (notes && notes !== existing.notes) parts.push(`[Note]: ${notes.trim()}`);
        updatedNotes = parts.join('\n');
    }

    const updatedTargetDate = target_date !== undefined ? target_date : existing.target_date;

    let qcStatus = existing.qc_status;
    if (updatedStatus === 'PENDING_QC' && !qcStatus) {
        qcStatus = 'PENDING';
    } else if (updatedStatus === 'DELIVERED' && !qcStatus) {
        qcStatus = 'PASSED';
    }

    db.prepare(`
        UPDATE supply_requests
        SET status = ?, notes = ?, target_date = ?, qc_status = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
    `).run(updatedStatus, updatedNotes, updatedTargetDate, qcStatus, id);

    let poRawMaterialsUpdated = false;
    if (updatedStatus === 'DELIVERED' || updatedStatus === 'QC_APPROVED' || updatedStatus === 'QC_BYPASSED') {
        poRawMaterialsUpdated = checkAndFulfillPoRawMaterials(existing.po_id);
        restockBomMaterialsIfPresent(existing.bom_items, 'Delivered');
    }

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE_SUPPLY_REQUEST',
        entityType: 'SUPPLY_REQUEST',
        entityId: id,
        details: {
            poId: existing.po_id,
            previousStatus: existing.status,
            newStatus: updatedStatus,
            poRawMaterialsUpdated
        },
        ipAddress: req.ip
    });

    const updated = getEnrichedSupplyRequest(id);

    return res.json({
        success: true,
        message: `Requisition status updated to ${updatedStatus}.` + (poRawMaterialsUpdated ? ' Linked Purchase Order materials marked as SUFFICIENT.' : ''),
        data: updated
    });
});

/**
 * POST /api/supply-requests/:id/qc-decision
 * QC Inspector approves or declines the incoming raw material shipment
 */
router.post('/:id/qc-decision', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.QC, ROLES.CEO), (req, res) => {
    try {
        const { id } = req.params;
        const { decision, qc_notes } = req.body;

        const existing = db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Requisition not found.' });
        }

        const cleanDecision = (decision || '').toUpperCase().trim();
        if (cleanDecision !== 'APPROVE' && cleanDecision !== 'DECLINE') {
            return res.status(400).json({
                success: false,
                error: 'INVALID_DECISION',
                message: "Decision must be 'APPROVE' or 'DECLINE'."
            });
        }

        if (cleanDecision === 'DECLINE' && (!qc_notes || !qc_notes.trim())) {
            return res.status(400).json({
                success: false,
                error: 'QC_NOTES_REQUIRED',
                message: 'QC inspection defect notes are required when declining raw materials so Purchasing can take action.'
            });
        }

        const now = db.prepare("SELECT datetime('now', 'localtime') as now").get().now;
        let newStatus = existing.status;
        let newQcStatus = '';
        let poRawMaterialsUpdated = false;

        if (cleanDecision === 'APPROVE') {
            newStatus = 'DELIVERED';
            newQcStatus = 'PASSED';
            const finalNotes = qc_notes ? `[QC PASSED]: ${qc_notes.trim()}` : '[QC PASSED]: Raw material approved for production.';
            const combinedNotes = existing.notes ? `${existing.notes}\n${finalNotes}` : finalNotes;

            db.prepare(`
                UPDATE supply_requests
                SET status = ?, qc_status = ?, qc_notes = ?, qc_inspected_by = ?, qc_inspected_at = ?, notes = ?, updated_at = ?
                WHERE id = ?
            `).run(newStatus, newQcStatus, qc_notes || 'QC Approved', req.user.id, now, combinedNotes, now, id);

            poRawMaterialsUpdated = checkAndFulfillPoRawMaterials(existing.po_id);
            restockBomMaterialsIfPresent(existing.bom_items, 'QC Approved');

            logAudit({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: 'QC_APPROVE_RAW_MATERIAL',
                entityType: 'SUPPLY_REQUEST',
                entityId: id,
                details: { poId: existing.po_id, qcNotes: qc_notes, poRawMaterialsUpdated },
                ipAddress: req.ip
            });

            const updated = getEnrichedSupplyRequest(id);
            return res.json({
                success: true,
                message: 'Raw material QC Approved! Materials verified and released into inventory.' + (poRawMaterialsUpdated ? ' Linked Purchase Order materials marked as SUFFICIENT.' : ''),
                data: updated
            });
        } else {
            // DECLINE
            newStatus = 'QC_DECLINED';
            newQcStatus = 'DECLINED';
            const finalNotes = `[QC DECLINED]: ${qc_notes.trim()}`;
            const combinedNotes = existing.notes ? `${existing.notes}\n${finalNotes}` : finalNotes;

            db.prepare(`
                UPDATE supply_requests
                SET status = ?, qc_status = ?, qc_notes = ?, qc_inspected_by = ?, qc_inspected_at = ?, notes = ?, updated_at = ?
                WHERE id = ?
            `).run(newStatus, newQcStatus, qc_notes.trim(), req.user.id, now, combinedNotes, now, id);

            logAudit({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: 'QC_DECLINE_RAW_MATERIAL',
                entityType: 'SUPPLY_REQUEST',
                entityId: id,
                details: { poId: existing.po_id, qcNotes: qc_notes.trim() },
                ipAddress: req.ip
            });

            const updated = getEnrichedSupplyRequest(id);
            return res.json({
                success: true,
                message: 'Raw material QC Declined. Inspection report sent to Purchasing Department for response (Reject, Re-order, Return to Supplier, or Bypass QC Check).',
                data: updated
            });
        }
    } catch (err) {
        console.error('Error recording QC decision:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/supply-requests/:id/purchasing-response
 * Purchasing Department responds to a QC Declined raw material report:
 * 1. REJECT: permanently reject the lot
 * 2. REORDER: re-order replacement from supplier
 * 3. RETURN_TO_SUPPLIER: return defective items back to supplier
 * 4. BYPASS_QC: decline QC report and bypass QC check (force accept into inventory)
 */
router.post('/:id/purchasing-response', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING, ROLES.CEO), (req, res) => {
    try {
        const { id } = req.params;
        const { action, notes } = req.body;

        const existing = db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Requisition not found.' });
        }

        const cleanAction = (action || '').toUpperCase().trim();
        const validActions = ['REJECT', 'REORDER', 'RETURN_TO_SUPPLIER', 'BYPASS_QC'];
        if (!validActions.includes(cleanAction)) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_ACTION',
                message: `Action must be one of: ${validActions.join(', ')}`
            });
        }

        const now = db.prepare("SELECT datetime('now', 'localtime') as now").get().now;
        let newStatus = '';
        let newQcStatus = existing.qc_status;
        let responseMsg = '';
        let poRawMaterialsUpdated = false;

        const responseNoteText = (notes || '').trim();

        if (cleanAction === 'REJECT') {
            newStatus = 'REJECTED';
            const logText = `[Purchasing Response - REJECTED]: ${responseNoteText || 'Lot rejected.'}`;
            const combinedNotes = existing.notes ? `${existing.notes}\n${logText}` : logText;

            db.prepare(`
                UPDATE supply_requests
                SET status = ?, purchasing_response = 'REJECT', purchasing_response_notes = ?, purchasing_responded_at = ?, notes = ?, updated_at = ?
                WHERE id = ?
            `).run(newStatus, responseNoteText, now, combinedNotes, now, id);

            responseMsg = 'Raw material requisition marked as REJECTED.';
        } else if (cleanAction === 'REORDER') {
            newStatus = 'ORDERED';
            newQcStatus = 'PENDING';
            const logText = `[Purchasing Response - RE-ORDERED]: ${responseNoteText || 'Re-ordered replacement lot from supplier.'}`;
            const combinedNotes = existing.notes ? `${existing.notes}\n${logText}` : logText;

            db.prepare(`
                UPDATE supply_requests
                SET status = ?, qc_status = ?, purchasing_response = 'REORDER', purchasing_response_notes = ?, purchasing_responded_at = ?, notes = ?, updated_at = ?
                WHERE id = ?
            `).run(newStatus, newQcStatus, responseNoteText, now, combinedNotes, now, id);

            responseMsg = 'Purchasing placed a RE-ORDER for replacement materials from supplier.';
        } else if (cleanAction === 'RETURN_TO_SUPPLIER') {
            newStatus = 'RETURNED_TO_SUPPLIER';
            const logText = `[Purchasing Response - RETURN TO SUPPLIER]: ${responseNoteText || 'Item scheduled for return back to supplier.'}`;
            const combinedNotes = existing.notes ? `${existing.notes}\n${logText}` : logText;

            db.prepare(`
                UPDATE supply_requests
                SET status = ?, purchasing_response = 'RETURN_TO_SUPPLIER', purchasing_response_notes = ?, purchasing_responded_at = ?, notes = ?, updated_at = ?
                WHERE id = ?
            `).run(newStatus, responseNoteText, now, combinedNotes, now, id);

            responseMsg = 'Raw material lot marked as RETURNED TO SUPPLIER.';
        } else if (cleanAction === 'BYPASS_QC') {
            newStatus = 'DELIVERED';
            newQcStatus = 'BYPASSED';
            const logText = `[Purchasing Response - DECLINED QC REPORT & BYPASSED QC CHECK]: ${responseNoteText || 'Authorized concession / bypass QC check.'}`;
            const combinedNotes = existing.notes ? `${existing.notes}\n${logText}` : logText;

            db.prepare(`
                UPDATE supply_requests
                SET status = ?, qc_status = ?, purchasing_response = 'BYPASS_QC', purchasing_response_notes = ?, purchasing_responded_at = ?, notes = ?, updated_at = ?
                WHERE id = ?
            `).run(newStatus, newQcStatus, responseNoteText, now, combinedNotes, now, id);

            poRawMaterialsUpdated = checkAndFulfillPoRawMaterials(existing.po_id);
            restockBomMaterialsIfPresent(existing.bom_items, 'Purchasing Bypassed QC');

            responseMsg = 'Purchasing declined the QC report and bypassed QC check. Materials accepted into inventory.' + (poRawMaterialsUpdated ? ' Linked Purchase Order materials marked as SUFFICIENT.' : '');
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: `PURCHASING_RESPONSE_${cleanAction}`,
            entityType: 'SUPPLY_REQUEST',
            entityId: id,
            details: { poId: existing.po_id, action: cleanAction, notes: responseNoteText, poRawMaterialsUpdated },
            ipAddress: req.ip
        });

        const updated = getEnrichedSupplyRequest(id);
        return res.json({
            success: true,
            message: responseMsg,
            data: updated
        });
    } catch (err) {
        console.error('Error recording purchasing response:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/supply-requests/:id/budget-bom
 * Purchasing manages and edits BOM quantities and unit costs based on the Fund Limit,
 * and issues/generates the Supplier Purchase Order (SPO).
 */
router.put('/:id/budget-bom', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.PURCHASING), (req, res) => {
    try {
        const { id } = req.params;
        const {
            bom_items,
            fund_limit,
            supplier_name,
            supplier_address,
            supplier_contact,
            payment_terms,
            target_date,
            notes,
            generate_spo = false
        } = req.body || {};

        const existing = db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Requisition not found.' });
        }

        const items = Array.isArray(bom_items) ? bom_items : [];
        let totalCost = 0.0;
        const processedBom = items.map(it => {
            const qty = parseFloat(it.requested_qty !== undefined ? it.requested_qty : (it.order_qty || it.quantity || 0)) || 0;
            const unitCost = parseFloat(it.unit_cost || 0) || 0;
            const lineTotal = Math.round(qty * unitCost * 100) / 100;
            totalCost += lineTotal;
            return {
                raw_material_id: it.raw_material_id || null,
                material_code: it.material_code || '',
                material_name: it.material_name || '',
                category: it.category || 'General',
                current_stock: parseFloat(it.current_stock || 0),
                requested_qty: qty,
                unit: it.unit || 'kg',
                unit_cost: unitCost,
                total_cost: lineTotal,
                supplier: it.supplier || supplier_name || 'None'
            };
        });

        totalCost = Math.round(totalCost * 100) / 100;
        const effectiveFundLimit = fund_limit !== undefined && !isNaN(parseFloat(fund_limit))
            ? parseFloat(fund_limit)
            : (existing.fund_limit || 500000.0);

        let supplierPoNumber = existing.supplier_po_number;
        let newStatus = existing.status;
        if (generate_spo) {
            if (!supplierPoNumber || supplierPoNumber.trim() === '') {
                supplierPoNumber = getNextDocumentNumber('SPO');
            }
            if (newStatus === 'SUBMITTED') {
                newStatus = 'ORDERED';
            }
        }

        // Summary text of materials
        const materialsSummary = processedBom.map(it => {
            const codePart = it.material_code && it.material_code !== 'None' ? `[${it.material_code}] ` : '';
            return `• ${codePart}${it.material_name}: ${it.requested_qty} ${it.unit} @ ₱${it.unit_cost.toFixed(2)} = ₱${it.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        }).join('\n');

        db.prepare(`
            UPDATE supply_requests
            SET bom_items = ?,
                fund_limit = ?,
                total_cost = ?,
                supplier_po_number = ?,
                supplier_name = ?,
                supplier_address = ?,
                supplier_contact = ?,
                payment_terms = ?,
                target_date = ?,
                notes = ?,
                materials_needed = ?,
                status = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(
            JSON.stringify(processedBom),
            effectiveFundLimit,
            totalCost,
            supplierPoNumber || null,
            supplier_name !== undefined ? supplier_name : existing.supplier_name,
            supplier_address !== undefined ? supplier_address : existing.supplier_address,
            supplier_contact !== undefined ? supplier_contact : existing.supplier_contact,
            payment_terms !== undefined ? payment_terms : (existing.payment_terms || 'Net 30'),
            target_date !== undefined ? target_date : existing.target_date,
            notes !== undefined ? notes : existing.notes,
            materialsSummary || existing.materials_needed,
            newStatus,
            id
        );

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: generate_spo ? 'GENERATE_SUPPLIER_PO' : 'UPDATE_BOM_BUDGET',
            entityType: 'SUPPLY_REQUEST',
            entityId: supplierPoNumber || id,
            details: {
                requestId: id,
                supplierPoNumber,
                totalCost,
                fundLimit: effectiveFundLimit,
                exceedsFundLimit: totalCost > effectiveFundLimit,
                itemCount: processedBom.length
            },
            ipAddress: req.ip
        });

        const updated = getEnrichedSupplyRequest(id);
        const exceeds = totalCost > effectiveFundLimit;
        return res.json({
            success: true,
            message: generate_spo
                ? `Supplier PO ${supplierPoNumber} issued successfully! Total: ₱${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                : `BOM numbers and budget updated. Total: ₱${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            data: updated,
            is_within_budget: !exceeds,
            exceeds_fund_limit: exceeds,
            over_amount: exceeds ? Math.round((totalCost - effectiveFundLimit) * 100) / 100 : 0
        });
    } catch (err) {
        console.error('Error updating BOM budget:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/supply-requests/:id/receive-delivery
 * Inventory Officer confirms received shipment quantities.
 * Automatically stocks items into raw_materials_inventory list and marks request DELIVERED.
 */
router.post('/:id/receive-delivery', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.IT_ADMIN, ROLES.ADMIN, ROLES.INVENTORY, ROLES.PURCHASING), (req, res) => {
    try {
        const { id } = req.params;
        const { received_items, receiving_notes } = req.body || {};

        const existing = db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Requisition not found.' });
        }

        const itemsToProcess = Array.isArray(received_items) && received_items.length > 0
            ? received_items
            : (existing.bom_items ? JSON.parse(existing.bom_items) : []);

        if (itemsToProcess.length === 0) {
            return res.status(400).json({ success: false, error: 'No items to receive in this requisition.' });
        }

        const confirmedItems = [];

        const receiveTx = db.transaction(() => {
            for (const item of itemsToProcess) {
                const receivedQty = parseFloat(item.received_qty !== undefined ? item.received_qty : item.requested_qty) || 0;
                const rawMatId = item.raw_material_id;
                const code = (item.material_code || '').trim();
                const name = (item.material_name || '').trim();
                const unit = item.unit || 'kg';
                const unitCost = parseFloat(item.unit_cost) || 0;
                const batchLot = item.batch_lot_number || null;
                const expiry = item.expiry_date || null;

                if (receivedQty > 0) {
                    let target = null;
                    if (rawMatId) target = db.prepare('SELECT * FROM raw_materials_inventory WHERE id = ?').get(rawMatId);
                    if (!target && code && code !== 'None' && code !== 'PO-BOM') {
                        target = db.prepare('SELECT * FROM raw_materials_inventory WHERE UPPER(material_code) = UPPER(?)').get(code);
                    }
                    if (!target && name) {
                        target = db.prepare('SELECT * FROM raw_materials_inventory WHERE LOWER(material_name) = LOWER(?)').get(name);
                    }

                    if (target) {
                        const newStock = Number((Number(target.current_stock || 0) + receivedQty).toFixed(4));
                        const newStatus = (newStock <= 0) ? 'OUT_OF_STOCK' : ((target.minimum_stock_level > 0 && newStock <= target.minimum_stock_level) ? 'LOW_STOCK' : 'IN_STOCK');
                        const noteAdd = `[Stocked via ${existing.supplier_po_number || 'SPO'} +${receivedQty} ${target.unit || unit}]`;
                        const updatedNotes = target.notes ? `${target.notes} | ${noteAdd}` : noteAdd;

                        db.prepare(`
                            UPDATE raw_materials_inventory
                            SET current_stock = ?,
                                status = ?,
                                unit_cost = CASE WHEN ? > 0 THEN ? ELSE unit_cost END,
                                batch_lot_number = COALESCE(?, batch_lot_number),
                                expiry_date = COALESCE(?, expiry_date),
                                notes = ?,
                                updated_by = ?,
                                updated_at = datetime('now', 'localtime')
                            WHERE id = ?
                        `).run(newStock, newStatus, unitCost, unitCost, batchLot, expiry, updatedNotes, req.user.name, target.id);
                    } else if (name) {
                        // Brand new raw material requested in BOM: auto-register in inventory list
                        const newId = uuidv4();
                        const genCode = code && code !== 'None' && code !== 'PO-BOM' ? code : `RM-${Date.now().toString().slice(-6)}`;
                        const newStatus = receivedQty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
                        db.prepare(`
                            INSERT INTO raw_materials_inventory
                            (id, material_code, material_name, category, supplier, current_stock, unit, minimum_stock_level, unit_cost, batch_lot_number, expiry_date, status, notes, updated_by, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 10.0, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
                        `).run(
                            newId,
                            genCode,
                            name,
                            item.category || 'Active Ingredients',
                            item.supplier || existing.supplier_name || 'Vendor',
                            receivedQty,
                            unit,
                            unitCost,
                            batchLot,
                            expiry,
                            newStatus,
                            `[Initial Stock from Supplier PO ${existing.supplier_po_number || 'SPO'}]`,
                            req.user.name
                        );
                    }
                }

                confirmedItems.push({
                    raw_material_id: rawMatId,
                    material_code: code,
                    material_name: name,
                    ordered_qty: parseFloat(item.requested_qty || item.order_qty || 0),
                    received_qty: receivedQty,
                    unit,
                    unit_cost: unitCost,
                    batch_lot_number: batchLot,
                    expiry_date: expiry
                });
            }

            const now = db.prepare("SELECT datetime('now', 'localtime') as now").get().now;
            const finalNotes = receiving_notes
                ? (existing.notes ? `${existing.notes}\n[Received by ${req.user.name}]: ${receiving_notes}` : `[Received by ${req.user.name}]: ${receiving_notes}`)
                : existing.notes;

            db.prepare(`
                UPDATE supply_requests
                SET status = 'DELIVERED',
                    received_items = ?,
                    received_by = ?,
                    received_at = ?,
                    notes = ?,
                    updated_at = ?
                WHERE id = ?
            `).run(
                JSON.stringify(confirmedItems),
                req.user.id,
                now,
                finalNotes,
                now,
                id
            );

            // If linked to active customer PO, check and fulfill materials status
            checkAndFulfillPoRawMaterials(existing.po_id);
        });

        receiveTx();

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'INVENTORY_CONFIRM_BOM_RECEIPT',
            entityType: 'SUPPLY_REQUEST',
            entityId: existing.supplier_po_number || id,
            details: {
                requestId: id,
                supplierPoNumber: existing.supplier_po_number,
                itemCount: confirmedItems.length,
                stockedItems: confirmedItems.map(c => `${c.material_name} (+${c.received_qty} ${c.unit})`)
            },
            ipAddress: req.ip
        });

        const updated = getEnrichedSupplyRequest(id);
        return res.json({
            success: true,
            message: `Shipment received and confirmed by Inventory! Raw materials have been stocked into warehouse inventory.`,
            data: updated
        });
    } catch (err) {
        console.error('Error confirming BOM delivery:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/supply-requests/:id/printable-spo
 * Retrieve full printable Supplier Purchase Order payload
 */
router.get('/:id/printable-spo', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const sr = getEnrichedSupplyRequest(id);
        if (!sr) {
            return res.status(404).json({ success: false, error: 'Supplier PO not found.' });
        }
        let items = [];
        try {
            items = sr.bom_items ? JSON.parse(sr.bom_items) : [];
        } catch (_) {}

        let received = [];
        try {
            received = sr.received_items ? JSON.parse(sr.received_items) : [];
        } catch (_) {}

        return res.json({
            success: true,
            data: {
                ...sr,
                items,
                bom_items: items,
                received_items: received
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

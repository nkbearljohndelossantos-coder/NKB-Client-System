const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { getNextDocumentNumber } = require('../services/documentNumberService');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/job-orders
 */
router.get('/', authenticateToken, (req, res) => {
    const { poId, status } = req.query;

    let query = `
        SELECT jo.*, po.po_number, po.client_id, c.company_name, p.name as product_name, p.sku, p.unit,
               (SELECT COUNT(*) FROM production_batches WHERE jo_id = jo.id) as batch_count,
               (SELECT batch_number FROM production_batches WHERE jo_id = jo.id ORDER BY created_at DESC LIMIT 1) as latest_batch_number,
               (SELECT status FROM production_batches WHERE jo_id = jo.id ORDER BY created_at DESC LIMIT 1) as latest_batch_status,
               (SELECT SUM(actual_yield) FROM production_batches WHERE jo_id = jo.id) as total_yield
        FROM job_orders jo
        JOIN purchase_orders po ON jo.po_id = po.id
        JOIN clients c ON po.client_id = c.id
        JOIN products p ON jo.product_id = p.id
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND po.client_id = ?';
        params.push(req.user.client_id);
    }

    if (poId) {
        query += ' AND jo.po_id = ?';
        params.push(poId);
    }

    if (status) {
        query += ' AND jo.status = ?';
        params.push(status);
    }

    query += ' ORDER BY jo.created_at DESC';
    const jobOrders = db.prepare(query).all(...params);

    return res.json({ success: true, data: jobOrders });
});

/**
 * Helper: Consolidate all products ordered / in production for a client
 */
function getClientConsolidatedJOData(clientId, specificPoId = null, specificJoId = null) {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) return null;

    // 1. All job orders for this client
    let joQuery = `
        SELECT jo.*, po.po_number, po.po_date, po.expected_delivery_date, po.notes as po_notes,
               p.name as product_name, p.sku, p.unit,
               COALESCE(cpp.custom_name, p.name) as display_product_name,
               COALESCE(cpp.custom_sku, p.sku) as display_sku
        FROM job_orders jo
        JOIN purchase_orders po ON jo.po_id = po.id
        JOIN products p ON jo.product_id = p.id
        LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = po.client_id
        WHERE po.client_id = ?
    `;
    const joParams = [clientId];
    if (specificPoId) {
        joQuery += ' AND jo.po_id = ?';
        joParams.push(specificPoId);
    }
    joQuery += ' ORDER BY jo.created_at ASC';
    const jos = db.prepare(joQuery).all(...joParams);

    // 2. Active purchase orders for this client
    let poQuery = `
        SELECT * FROM purchase_orders 
        WHERE client_id = ? AND status IN ('APPROVED', 'IN_PRODUCTION', 'COMPLETED')
    `;
    const poParams = [clientId];
    if (specificPoId) {
        poQuery += ' AND id = ?';
        poParams.push(specificPoId);
    }
    poQuery += ' ORDER BY created_at DESC';
    let pos = db.prepare(poQuery).all(...poParams);
    if (pos.length === 0 && specificPoId) {
        pos = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').all(specificPoId);
    }

    // 3. All ordered products across active POs for this client
    let poItemQuery = `
        SELECT poi.*, po.po_number, po.po_date, po.expected_delivery_date, po.notes as po_notes,
               p.name as product_name, p.sku, p.unit,
               COALESCE(cpp.custom_name, p.name) as display_product_name,
               COALESCE(cpp.custom_sku, p.sku) as display_sku
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.id
        JOIN products p ON poi.product_id = p.id
        LEFT JOIN client_product_prices cpp ON cpp.product_id = p.id AND cpp.client_id = po.client_id
        WHERE po.client_id = ?
    `;
    const poItemParams = [clientId];
    if (specificPoId) {
        poItemQuery += ' AND po.id = ?';
        poItemParams.push(specificPoId);
    } else {
        poItemQuery += " AND po.status IN ('APPROVED', 'IN_PRODUCTION', 'COMPLETED')";
    }
    poItemQuery += ' ORDER BY poi.created_at ASC';
    const poItems = db.prepare(poItemQuery).all(...poItemParams);

    // 4. Consolidate into unique items list: all products for this client
    const itemsMap = new Map();

    for (const item of poItems) {
        itemsMap.set(item.product_id, {
            product_id: item.product_id,
            product_name: item.display_product_name || item.product_name,
            sku: item.display_sku || item.sku,
            target_quantity: item.target_quantity,
            unit: item.unit || 'PC',
            po_number: item.po_number
        });
    }

    for (const jo of jos) {
        if (itemsMap.has(jo.product_id)) {
            const existing = itemsMap.get(jo.product_id);
            existing.jo_number = jo.jo_number;
            existing.target_quantity = jo.target_quantity || existing.target_quantity;
        } else {
            itemsMap.set(jo.product_id, {
                product_id: jo.product_id,
                product_name: jo.display_product_name || jo.product_name,
                sku: jo.display_sku || jo.sku,
                target_quantity: jo.target_quantity,
                unit: jo.unit || 'PC',
                jo_number: jo.jo_number,
                po_number: jo.po_number
            });
        }
    }

    const items = Array.from(itemsMap.values());
    const targetJO = specificJoId ? (jos.find(j => j.id === specificJoId) || jos[0]) : (jos.length > 0 ? jos[0] : null);
    const primaryPO = pos.length > 0 ? pos[0] : null;
    const uniquePONumbers = Array.from(new Set(pos.map(p => p.po_number).filter(Boolean)));

    // Client-level SO number and JO number (strictly per client, never per individual product!)
    const clientSO = (primaryPO && primaryPO.so_number)
        ? primaryPO.so_number
        : (primaryPO ? primaryPO.po_number.replace('PO-', 'SO-') : (jos.length > 0 ? jos[0].jo_number.replace('JO-', 'SO-') : `SO-2026-${String(client.id).slice(-6)}`));
    const clientJO = (primaryPO && primaryPO.po_number)
        ? primaryPO.po_number.replace('PO-', 'JO-')
        : (jos.length > 0 ? jos[0].jo_number : `JO-2026-${String(client.id).slice(-6)}`);

    return {
        id: targetJO ? targetJO.id : (primaryPO ? primaryPO.id : client.id),
        client_id: client.id,
        company_name: client.company_name,
        client_address: client.address || '-',
        client_phone: client.phone || '',
        client_email: client.email || '',
        client_tin: client.tin || '',
        so_number: clientSO,
        jo_number: clientJO,
        po_number: uniquePONumbers.length > 0 ? uniquePONumbers.join(', ') : (primaryPO ? primaryPO.po_number : ''),
        po_date: (primaryPO && primaryPO.po_date) ? primaryPO.po_date : (targetJO ? targetJO.scheduled_start_date : new Date().toISOString().split('T')[0]),
        expected_delivery_date: primaryPO ? primaryPO.expected_delivery_date : null,
        notes: (primaryPO && primaryPO.notes) || (targetJO && targetJO.notes) || '',
        items: items
    };
}

/**
 * GET /api/job-orders/print/all
 * Fetch print data for all clients with active job orders or approved POs
 */
router.get('/print/all', authenticateToken, (req, res) => {
    let clients = [];
    if (req.user.role === 'CLIENT') {
        clients = db.prepare('SELECT id, company_name FROM clients WHERE id = ?').all(req.user.client_id);
    } else {
        clients = db.prepare(`
            SELECT DISTINCT c.id, c.company_name 
            FROM clients c
            WHERE c.id IN (
                SELECT po.client_id FROM job_orders jo JOIN purchase_orders po ON jo.po_id = po.id
                UNION
                SELECT client_id FROM purchase_orders WHERE status IN ('APPROVED', 'IN_PRODUCTION')
            )
            ORDER BY c.company_name ASC
        `).all();
    }

    const results = clients
        .map(c => getClientConsolidatedJOData(c.id))
        .filter(d => d && d.items && d.items.length > 0);

    return res.json({ success: true, data: results });
});

/**
 * GET /api/job-orders/client/:clientId
 * Fetch all products in job orders per client for printing
 */
router.get('/client/:clientId', authenticateToken, (req, res) => {
    if (req.user.role === 'CLIENT' && req.params.clientId !== req.user.client_id) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    const data = getClientConsolidatedJOData(req.params.clientId);
    if (!data) {
        return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    return res.json({ success: true, data });
});

/**
 * GET /api/job-orders/po/:poId
 * Fetch print data directly by PO ID (consolidates all products for that client's PO)
 */
router.get('/po/:poId', authenticateToken, (req, res) => {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.poId);

    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (req.user.role === 'CLIENT' && po.client_id !== req.user.client_id) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    const data = getClientConsolidatedJOData(po.client_id, po.id);
    return res.json({ success: true, data: data || po });
});

/**
 * GET /api/job-orders/:id
 * Retrieve Job Order details with all products for that client
 */
router.get('/:id', authenticateToken, (req, res) => {
    const jo = db.prepare(`
        SELECT jo.*, po.po_number, po.po_date, po.expected_delivery_date, po.notes as po_notes,
               po.tolerance_percent, po.billing_policy, po.client_id,
               c.company_name, c.address as client_address, c.phone as client_phone, c.email as client_email, c.tin as client_tin,
               p.name as product_name, p.sku, p.formula_code, p.unit,
               u.name as creator_name
        FROM job_orders jo
        JOIN purchase_orders po ON jo.po_id = po.id
        JOIN clients c ON po.client_id = c.id
        JOIN products p ON jo.product_id = p.id
        LEFT JOIN users u ON jo.created_by = u.id
        WHERE jo.id = ?
    `).get(req.params.id);

    if (!jo) {
        return res.status(404).json({ success: false, error: 'Job Order not found.' });
    }

    if (req.user.role === 'CLIENT' && jo.client_id !== req.user.client_id) {
        return res.status(403).json({ success: false, error: 'Access denied.', code: 'FORBIDDEN' });
    }

    const clientData = getClientConsolidatedJOData(jo.client_id, jo.po_id, jo.id);

    const batches = db.prepare(`
        SELECT * FROM production_batches WHERE jo_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    return res.json({
        success: true,
        data: {
            ...jo,
            so_number: clientData ? clientData.so_number : (jo.po_number ? jo.po_number.replace('PO-', 'SO-') : 'SO-2026-000001'),
            jo_number: clientData ? clientData.jo_number : (jo.po_number ? jo.po_number.replace('PO-', 'JO-') : jo.jo_number),
            company_name: clientData ? clientData.company_name : jo.company_name,
            client_address: clientData ? clientData.client_address : jo.client_address,
            client_phone: clientData ? clientData.client_phone : jo.client_phone,
            client_email: clientData ? clientData.client_email : jo.client_email,
            client_tin: clientData ? clientData.client_tin : jo.client_tin,
            po_number: (clientData && clientData.po_number) ? clientData.po_number : jo.po_number,
            items: (clientData && clientData.items && clientData.items.length > 0) ? clientData.items : [{
                product_name: jo.product_name,
                sku: jo.sku,
                target_quantity: jo.target_quantity,
                unit: jo.unit || 'PC'
            }],
            batches
        }
    });
});

/**
 * POST /api/job-orders
 * Admin / Production creates Job Order from an approved PO
 */
router.post('/', authenticateToken, requireRoles('ADMIN', 'PRODUCTION'), (req, res) => {
    const { po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, notes, create_all } = req.body;

    if (!po_id) {
        return res.status(400).json({ success: false, error: 'Purchase Order ID (po_id) is required.' });
    }

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po_id);
    if (!po) {
        return res.status(404).json({ success: false, error: 'Purchase Order not found.' });
    }

    if (po.status === 'DRAFT' || po.status === 'CANCELLED') {
        return res.status(400).json({ success: false, error: `Cannot create Job Order for PO in status "${po.status}".` });
    }

    // CASE 1: Batch / Start All Products for this Client PO
    if (create_all || !product_id) {
        const poItems = db.prepare(`
            SELECT poi.*, p.name as product_name, p.sku
            FROM purchase_order_items poi
            JOIN products p ON poi.product_id = p.id
            WHERE poi.po_id = ?
            ORDER BY poi.created_at ASC
        `).all(po_id);

        if (!poItems || poItems.length === 0) {
            return res.status(400).json({ success: false, error: 'No products found in this Purchase Order.' });
        }

        // Check which items already have an active JO for this PO
        const existingJOs = db.prepare("SELECT product_id, jo_number FROM job_orders WHERE po_id = ? AND status != 'CANCELLED'").all(po_id);
        const existingProductIds = new Set(existingJOs.map(j => j.product_id));

        const itemsToCreate = poItems.filter(item => !existingProductIds.has(item.product_id));

        if (itemsToCreate.length === 0) {
            return res.json({
                success: true,
                count: 0,
                already_existed: true,
                message: 'All products in this Purchase Order already have active Job Orders.',
                data: existingJOs
            });
        }

        const createdJOs = [];
        const tx = db.transaction(() => {
            for (const item of itemsToCreate) {
                const joId = uuidv4();
                const joNumber = getNextDocumentNumber('JO');

                db.prepare(`
                    INSERT INTO job_orders
                    (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_PRODUCTION', ?, ?)
                `).run(
                    joId,
                    joNumber,
                    po_id,
                    item.product_id,
                    item.target_quantity,
                    scheduled_start_date || new Date().toISOString().split('T')[0],
                    scheduled_end_date || null,
                    assigned_team || 'Formulation & Bottling Team Alpha',
                    notes || null,
                    req.user.id
                );

                createdJOs.push({
                    id: joId,
                    jo_number: joNumber,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    sku: item.sku,
                    target_quantity: item.target_quantity
                });
            }

            // Update PO status to IN_PRODUCTION if not already
            db.prepare(`
                UPDATE purchase_orders
                SET status = 'IN_PRODUCTION', updated_at = datetime('now')
                WHERE id = ? AND status = 'APPROVED'
            `).run(po_id);

            logAudit({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: 'CREATE_JO_BATCH',
                entityType: 'JOB_ORDER',
                entityId: po.po_number,
                details: {
                    poId: po_id,
                    poNumber: po.po_number,
                    createdCount: createdJOs.length,
                    totalItems: poItems.length,
                    createdJOs: createdJOs.map(j => j.jo_number)
                }
            });
        });

        tx();

        return res.status(201).json({
            success: true,
            count: createdJOs.length,
            data: createdJOs,
            message: `Successfully created Job Orders for all ${createdJOs.length} product(s)!`
        });
    }

    // CASE 2: Single Product Job Order Creation
    if (!target_quantity) {
        return res.status(400).json({ success: false, error: 'Target Quantity is required.' });
    }

    const joId = uuidv4();
    const joNumber = getNextDocumentNumber('JO');

    const tx = db.transaction(() => {
        db.prepare(`
            INSERT INTO job_orders
            (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_PRODUCTION', ?, ?)
        `).run(
            joId,
            joNumber,
            po_id,
            product_id,
            parseInt(target_quantity),
            scheduled_start_date || new Date().toISOString().split('T')[0],
            scheduled_end_date || null,
            assigned_team || 'Formulation & Bottling Team Alpha',
            notes || null,
            req.user.id
        );

        // Update PO status to IN_PRODUCTION if not already
        db.prepare(`
            UPDATE purchase_orders
            SET status = 'IN_PRODUCTION', updated_at = datetime('now')
            WHERE id = ? AND status = 'APPROVED'
        `).run(po_id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_JO',
            entityType: 'JOB_ORDER',
            entityId: joNumber,
            details: { joId, joNumber, poId: po_id, target_quantity }
        });

        return joId;
    });

    const createdId = tx();
    const createdJO = db.prepare('SELECT * FROM job_orders WHERE id = ?').get(createdId);
    return res.status(201).json({ success: true, data: createdJO });
});

module.exports = router;

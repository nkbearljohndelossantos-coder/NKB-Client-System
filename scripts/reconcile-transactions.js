/**
 * NKB Manufacturing & Trading
 * Master Transaction Reconciliation Utility
 *
 * Synchronizes:
 * 1. purchase_order_items.delivered_quantity with active Delivery Receipts
 * 2. purchase_order_items.item_name with products catalog if null
 * 3. job_orders.status based on batch yields and target quantities
 * 4. purchase_orders.status enforcing strict full production & continuous partial delivery rules
 */

const path = require('path');
let db;
try {
    db = require(path.join(__dirname, '..', 'database', 'db.js'));
} catch (e) {
    db = require('./database/db.js');
}

function reconcileTransactions() {
    console.log('🔄 Starting Transaction Reconciliation & Alignment...\n');

    const auditLog = {
        poItemsUpdated: 0,
        jobOrdersUpdated: 0,
        purchaseOrdersUpdated: 0,
        details: []
    };

    const runTx = db.transaction(() => {
        // STEP 1: Sync purchase_order_items item_name
        const nullItemNames = db.prepare(`
            SELECT poi.id, poi.product_id, p.name as product_name
            FROM purchase_order_items poi
            JOIN products p ON poi.product_id = p.id
            WHERE poi.item_name IS NULL OR TRIM(poi.item_name) = ''
        `).all();

        if (nullItemNames.length > 0) {
            console.log(`📦 Updating ${nullItemNames.length} line items with missing item names from products catalog...`);
            const updateNameStmt = db.prepare('UPDATE purchase_order_items SET item_name = ? WHERE id = ?');
            for (const it of nullItemNames) {
                updateNameStmt.run(it.product_name, it.id);
            }
        }

        // STEP 2: Sync purchase_order_items delivered_quantity
        console.log('🚚 Recalibrating purchase_order_items.delivered_quantity from active delivery receipts...');
        const allPoItems = db.prepare(`
            SELECT poi.id, poi.po_id, poi.product_id, poi.item_name, poi.delivered_quantity as stored_delivered,
                   (
                       SELECT COALESCE(SUM(di.delivered_quantity), 0)
                       FROM delivery_items di
                       JOIN delivery_receipts dr ON di.dr_id = dr.id
                       WHERE dr.po_id = poi.po_id AND di.product_id = poi.product_id AND dr.status != 'CANCELLED'
                   ) as actual_delivered
            FROM purchase_order_items poi
        `).all();

        const updateDeliveredStmt = db.prepare('UPDATE purchase_order_items SET delivered_quantity = ? WHERE id = ?');
        for (const item of allPoItems) {
            if (Number(item.stored_delivered) !== Number(item.actual_delivered)) {
                updateDeliveredStmt.run(item.actual_delivered, item.id);
                auditLog.poItemsUpdated++;
                auditLog.details.push(`[PO Item Delivered Qty] Item "${item.item_name}" (${item.id}): ${item.stored_delivered} -> ${item.actual_delivered}`);
            }
        }

        // STEP 3: Sync Job Orders status
        console.log('🏭 Reconciling Job Orders status based on batch yields and target quantities...');
        const allJOs = db.prepare(`
            SELECT jo.id, jo.jo_number, jo.target_quantity, jo.status,
                   (
                       SELECT COALESCE(SUM(COALESCE(by.actual_yield, pb.actual_yield, 0)), 0)
                       FROM production_batches pb
                       LEFT JOIN batch_yields by ON by.batch_id = pb.id
                       WHERE pb.jo_id = jo.id AND pb.status IN ('QC_PASSED', 'APPROVED_FOR_DISPATCH', 'COMPLETED')
                   ) as total_yield,
                   (
                       SELECT COUNT(*)
                       FROM production_batches pb
                       WHERE pb.jo_id = jo.id AND pb.status NOT IN ('REJECTED')
                   ) as active_batch_count
            FROM job_orders jo
            WHERE jo.status != 'CANCELLED'
        `).all();

        const updateJoStatusStmt = db.prepare(`
            UPDATE job_orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
        `);

        for (const jo of allJOs) {
            let targetStatus = jo.status;
            if (Number(jo.total_yield) >= Number(jo.target_quantity)) {
                targetStatus = 'COMPLETED';
            } else if (Number(jo.active_batch_count) > 0) {
                targetStatus = 'IN_PRODUCTION';
            }

            if (targetStatus !== jo.status) {
                updateJoStatusStmt.run(targetStatus, jo.id);
                auditLog.jobOrdersUpdated++;
                auditLog.details.push(`[Job Order Status] JO ${jo.jo_number}: ${jo.status} -> ${targetStatus} (Yield: ${jo.total_yield}/${jo.target_quantity})`);
            }
        }

        // STEP 4: Sync Purchase Orders status under strict completion & continuous delivery rules
        console.log('📋 Recalibrating Purchase Orders statuses with new strict order completion rule...');
        const allPOs = db.prepare(`
            SELECT po.id, po.po_number, po.so_number, po.status
            FROM purchase_orders po
            WHERE po.status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
            ORDER BY po.po_number ASC
        `).all();

        const updatePoStatusStmt = db.prepare(`
            UPDATE purchase_orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
        `);

        for (const po of allPOs) {
            const items = db.prepare(`
                SELECT poi.id, poi.item_name, poi.target_quantity, poi.delivered_quantity,
                       COALESCE(poi.min_allowed_quantity, poi.target_quantity) as min_qty,
                       (
                           SELECT COALESCE(SUM(COALESCE(by.actual_yield, pb.actual_yield, 0)), 0)
                           FROM job_orders jo
                           JOIN production_batches pb ON pb.jo_id = jo.id AND pb.status IN ('QC_PASSED', 'APPROVED_FOR_DISPATCH', 'COMPLETED')
                           LEFT JOIN batch_yields by ON by.batch_id = pb.id
                           WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id
                       ) as total_produced
                FROM purchase_order_items poi
                WHERE poi.po_id = ?
            `).all(po.id);

            const hasActiveJOs = db.prepare(`
                SELECT COUNT(*) as count FROM job_orders WHERE po_id = ? AND status IN ('IN_PRODUCTION', 'COMPLETED')
            `).get(po.id).count > 0;

            const totalDelivered = items.reduce((sum, it) => sum + Number(it.delivered_quantity || 0), 0);
            const totalProduced = items.reduce((sum, it) => sum + Number(it.total_produced || 0), 0);

            const allItemsProduced = items.length > 0 && items.every(it => Number(it.total_produced) >= Number(it.min_qty));
            const allItemsDelivered = items.length > 0 && items.every(it => Number(it.delivered_quantity) >= Number(it.min_qty));

            let calibratedStatus = po.status;

            if (po.status === 'COMPLETED') {
                // If previously marked COMPLETED but items are not fully delivered or not fully produced, REVERT
                if (!allItemsProduced || !allItemsDelivered) {
                    if (totalDelivered > 0) {
                        calibratedStatus = 'PARTIALLY_DELIVERED';
                    } else if (totalProduced > 0 || hasActiveJOs) {
                        calibratedStatus = 'IN_PRODUCTION';
                    } else {
                        calibratedStatus = 'APPROVED';
                    }
                }
            } else {
                // If in APPROVED, IN_PRODUCTION, or PARTIALLY_DELIVERED:
                if (allItemsProduced && allItemsDelivered) {
                    // Fully produced AND fully delivered
                    calibratedStatus = 'COMPLETED';
                } else if (totalDelivered > 0) {
                    // Partial delivery made: Delivering won't stop until declared done / all delivered
                    calibratedStatus = 'PARTIALLY_DELIVERED';
                } else if (totalProduced > 0 || hasActiveJOs) {
                    calibratedStatus = 'IN_PRODUCTION';
                }
            }

            if (calibratedStatus !== po.status) {
                updatePoStatusStmt.run(calibratedStatus, po.id);
                auditLog.purchaseOrdersUpdated++;
                auditLog.details.push(`[Purchase Order Status] PO ${po.po_number}: ${po.status} -> ${calibratedStatus} (AllProduced=${allItemsProduced}, AllDelivered=${allItemsDelivered}, TotalDelivered=${totalDelivered})`);
            }
        }
    });

    runTx();

    console.log('\n========================================');
    console.log('✅ TRANSACTION SYNCHRONIZATION COMPLETE');
    console.log('========================================');
    console.log(`• PO Items Delivered Qty Updated: ${auditLog.poItemsUpdated}`);
    console.log(`• Job Orders Status Updated:     ${auditLog.jobOrdersUpdated}`);
    console.log(`• Purchase Orders Status Updated: ${auditLog.purchaseOrdersUpdated}`);

    if (auditLog.details.length > 0) {
        console.log('\nDetailed Log of Changes:');
        auditLog.details.forEach(d => console.log(`  - ${d}`));
    } else {
        console.log('\nAll transactions were already perfectly synchronized!');
    }

    return auditLog;
}

if (require.main === module) {
    reconcileTransactions();
}

module.exports = reconcileTransactions;

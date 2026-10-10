const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const { getNextDocumentNumber } = require('./documentNumberService');
const { logAudit } = require('./auditService');
const { recordMovement } = require('./inventoryService');
const { getManilaDate } = require('../helpers/timezone');

/**
 * Generate Sales Invoice from an ACCEPTED Delivery Receipt
 */
function createInvoiceFromDR({ drId, createdBy, userId, userRole, userName, notes = '', dueDate = null, invoiceDate = null }) {
    // 1. Fetch DR and associated PO, Client, and Items
    const dr = db.prepare(`
        SELECT dr.*, 
               po.po_number, po.billing_policy, po.tolerance_percent, po.is_buffer_stock,
               c.company_name, c.email as client_email, c.address as client_address
        FROM delivery_receipts dr
        JOIN purchase_orders po ON dr.po_id = po.id
        JOIN clients c ON dr.client_id = c.id
        WHERE dr.id = ?
    `).get(drId);

    if (!dr) {
        const err = new Error('Delivery Receipt not found.');
        err.code = 'DR_NOT_FOUND';
        throw err;
    }

    if (dr.status === 'INVOICED') {
        const err = new Error('This Delivery Receipt has already been invoiced.');
        err.code = 'DR_ALREADY_INVOICED';
        throw err;
    }

    if (dr.status !== 'ACCEPTED') {
        const err = new Error(`Cannot invoice DR in status "${dr.status}". Only ACCEPTED DRs can be invoiced.`);
        err.code = 'DR_NOT_ACCEPTED';
        throw err;
    }

    // Double check if an invoice already exists for this dr_id
    const existingInvoice = db.prepare('SELECT id, invoice_number FROM sales_invoices WHERE dr_id = ?').get(drId);
    if (existingInvoice) {
        const err = new Error(`Invoice already exists for this DR (${existingInvoice.invoice_number}).`);
        err.code = 'DR_ALREADY_INVOICED';
        throw err;
    }

    // 2. Fetch DR Items
    const drItems = db.prepare(`
        SELECT di.*, p.name as product_name, p.sku, p.unit,
               poi.target_quantity as po_target_quantity,
               b.batch_number, b.expiry_date
        FROM delivery_items di
        JOIN products p ON di.product_id = p.id
        LEFT JOIN purchase_order_items poi ON poi.po_id = ? AND poi.product_id = di.product_id
        LEFT JOIN production_batches b ON di.batch_id = b.id
        WHERE di.dr_id = ?
    `).all(dr.po_id, drId);

    if (!drItems || drItems.length === 0) {
        const err = new Error('Delivery Receipt has no line items to invoice.');
        err.code = 'NO_DR_ITEMS';
        throw err;
    }

    // Perform inside transaction
    const executeTransaction = db.transaction(() => {
        const invoiceId = uuidv4();
        const invoiceNumber = getNextDocumentNumber('SI');
        
        // Invoice Date: support late encoding
        const finalInvoiceDate = (invoiceDate && typeof invoiceDate === 'string' && invoiceDate.trim())
            ? invoiceDate.trim()
            : getManilaDate();

        // Due date: default 30 days from invoice date if not provided
        let invoiceDueDate = dueDate;
        if (!invoiceDueDate) {
            const d = new Date(finalInvoiceDate);
            d.setDate(d.getDate() + 30);
            invoiceDueDate = getManilaDate(d);
        }

        let totalSubtotal = 0.0;
        const invoiceLines = [];

        for (const item of drItems) {
            const deliveredQty = item.delivered_quantity;
            const acceptedQty = item.accepted_quantity > 0 ? item.accepted_quantity : deliveredQty;
            const poQty = item.po_target_quantity || deliveredQty;
            const unitPrice = item.unit_price;

            let billableQty = 0;
            let isOverrun = 0;
            let overrunQty = 0;

            if (dr.is_buffer_stock === 1) {
                // Dedicated Buffer Stock PO: Bill and reserve into Client Buffer Stock
                billableQty = acceptedQty;
                const bufferId = uuidv4();
                db.prepare(`
                    INSERT INTO client_buffer_stock
                    (id, client_id, product_id, source_batch_id, source_po_id, source_dr_id, initial_quantity, quantity_remaining, expiry_date, status, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?)
                `).run(
                    bufferId,
                    dr.client_id,
                    item.product_id,
                    item.batch_id,
                    dr.po_id,
                    dr.id,
                    acceptedQty,
                    acceptedQty,
                    item.expiry_date || null,
                    `Stocked from Dedicated Buffer Stock PO ${dr.po_number}, DR ${dr.dr_number}.`
                );

                recordMovement({
                    productId: item.product_id,
                    batchId: item.batch_id,
                    movementType: 'BUFFER_RESERVATION',
                    quantity: -acceptedQty,
                    referenceType: 'BUFFER',
                    referenceId: bufferId,
                    notes: `Buffer stock reserved for client ${dr.company_name} (${acceptedQty} pcs)`,
                    createdBy: userId
                });
            } else if (dr.billing_policy === 'ACTUAL_DELIVERY') {
                // CORE BUSINESS RULE: Bill actual accepted delivery
                billableQty = acceptedQty;
                if (acceptedQty > poQty) {
                    isOverrun = 1;
                    overrunQty = acceptedQty - poQty;
                }
            } else if (dr.billing_policy === 'FIXED_PO_BUFFER') {
                // Fixed PO billing: bill only up to PO Target Qty
                if (acceptedQty > poQty) {
                    billableQty = poQty;
                    isOverrun = 1;
                    overrunQty = acceptedQty - poQty;

                    // Reserve the excess quantity as Client Buffer Stock
                    const bufferId = uuidv4();
                    db.prepare(`
                        INSERT INTO client_buffer_stock
                        (id, client_id, product_id, source_batch_id, source_po_id, source_dr_id, initial_quantity, quantity_remaining, expiry_date, status, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?)
                    `).run(
                        bufferId,
                        dr.client_id,
                        item.product_id,
                        item.batch_id,
                        dr.po_id,
                        dr.id,
                        overrunQty,
                        overrunQty,
                        item.expiry_date || null,
                        `Reserved from PO ${dr.po_number}, DR ${dr.dr_number} under FIXED_PO_BUFFER policy.`
                    );

                    // Record inventory movement for buffer reservation
                    recordMovement({
                        productId: item.product_id,
                        batchId: item.batch_id,
                        movementType: 'BUFFER_RESERVATION',
                        quantity: -overrunQty,
                        referenceType: 'BUFFER',
                        referenceId: bufferId,
                        notes: `Buffer stock reserved for client ${dr.company_name} (${overrunQty} pcs)`,
                        createdBy: userId
                    });
                } else {
                    billableQty = acceptedQty;
                }
            }

            const lineTotal = billableQty * unitPrice;
            totalSubtotal += lineTotal;

            invoiceLines.push({
                id: uuidv4(),
                invoiceId,
                productId: item.product_id,
                batchId: item.batch_id,
                poQuantity: poQty,
                deliveredQuantity: deliveredQty,
                acceptedQuantity: acceptedQty,
                billableQuantity: billableQty,
                unitPrice,
                lineTotal,
                isOverrun,
                overrunQuantity: overrunQty
            });
        }

        const totalAmount = totalSubtotal; // taxes / discounts can be adjusted if configured
        const balanceDue = totalAmount;

        // Insert Sales Invoice with custom / late encoded invoice_date
        db.prepare(`
            INSERT INTO sales_invoices
            (id, invoice_number, client_id, dr_id, po_id, invoice_date, due_date, billing_policy, subtotal, tax_percent, tax_amount, discount_amount, total_amount, paid_amount, balance_due, status, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, 0.0, ?, 0.0, ?, 'UNPAID', ?, ?)
        `).run(
            invoiceId,
            invoiceNumber,
            dr.client_id,
            drId,
            dr.po_id,
            finalInvoiceDate,
            invoiceDueDate,
            dr.billing_policy,
            totalSubtotal,
            totalAmount,
            balanceDue,
            notes || `Generated from DR ${dr.dr_number} (PO: ${dr.po_number})`,
            userId
        );

        // Insert Invoice Items
        const insertItemStmt = db.prepare(`
            INSERT INTO invoice_items
            (id, invoice_id, product_id, batch_id, po_quantity, delivered_quantity, accepted_quantity, billable_quantity, unit_price, line_total, is_overrun, overrun_quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const line of invoiceLines) {
            insertItemStmt.run(
                line.id,
                line.invoiceId,
                line.productId,
                line.batchId,
                line.poQuantity,
                line.deliveredQuantity,
                line.acceptedQuantity,
                line.billableQuantity,
                line.unitPrice,
                line.lineTotal,
                line.isOverrun,
                line.overrunQuantity
            );
        }

        // Update DR status to INVOICED
        db.prepare(`
            UPDATE delivery_receipts 
            SET status = 'INVOICED', updated_at = datetime('now', 'localtime') 
            WHERE id = ?
        `).run(drId);

        // Check if all PO items are delivered & fully produced before completing PO
        const poItems = db.prepare(`
            SELECT poi.id, poi.product_id, poi.target_quantity, COALESCE(poi.min_allowed_quantity, poi.target_quantity) as min_qty,
                   (
                       SELECT COALESCE(SUM(di.accepted_quantity), 0)
                       FROM delivery_items di
                       JOIN delivery_receipts d ON di.dr_id = d.id
                       WHERE d.po_id = poi.po_id AND di.product_id = poi.product_id AND d.status IN ('ACCEPTED', 'INVOICED')
                   ) as total_accepted,
                   (
                       SELECT COALESCE(SUM(COALESCE(by.actual_yield, pb.actual_yield, 0)), 0)
                       FROM job_orders jo
                       JOIN production_batches pb ON pb.jo_id = jo.id AND pb.status IN ('QC_PASSED', 'APPROVED_FOR_DISPATCH', 'COMPLETED')
                       LEFT JOIN batch_yields by ON by.batch_id = pb.id
                       WHERE jo.po_id = poi.po_id AND jo.product_id = poi.product_id
                   ) as total_produced
            FROM purchase_order_items poi
            WHERE poi.po_id = ?
        `).all(dr.po_id);

        const allItemsCompleted = poItems.length > 0 && poItems.every(item => {
            const deliveredEnough = item.total_accepted >= item.min_qty;
            const producedEnough = item.total_produced >= item.min_qty;
            return deliveredEnough && producedEnough;
        });

        if (allItemsCompleted) {
            db.prepare(`
                UPDATE purchase_orders
                SET status = 'COMPLETED', updated_at = datetime('now', 'localtime')
                WHERE id = ?
            `).run(dr.po_id);
        } else {
            db.prepare(`
                UPDATE purchase_orders
                SET status = 'PARTIALLY_DELIVERED', updated_at = datetime('now', 'localtime')
                WHERE id = ? AND status NOT IN ('COMPLETED', 'CANCELLED', 'VOIDED')
            `).run(dr.po_id);
        }

        // Log audit
        logAudit({
            userId,
            userName,
            userRole,
            action: 'CREATE_INVOICE',
            entityType: 'SALES_INVOICE',
            entityId: invoiceNumber,
            details: {
                invoiceId,
                invoiceNumber,
                drId,
                drNumber: dr.dr_number,
                totalAmount,
                billingPolicy: dr.billing_policy,
                itemsCount: invoiceLines.length
            }
        });

        return {
            invoiceId,
            invoiceNumber,
            totalAmount,
            billingPolicy: dr.billing_policy,
            lines: invoiceLines
        };
    });

    return executeTransaction();
}

module.exports = {
    createInvoiceFromDR
};

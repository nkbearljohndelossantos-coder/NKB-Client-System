const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, normalizeRole, ROLES } = require('../middleware/auth');

/**
 * GET /api/notifications/pending
 * Dynamic calculation of pending confirmations, tasks, and actionable work tailored to the authenticated role
 */
router.get('/pending', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const role = normalizeRole(user.role);
        const clientId = user.client_id;
        const items = [];

        // 1. POs pending Administrative / Executive Approval
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.CEO) {
            const pendingApprovalPOs = db.prepare(`
                SELECT po.id, po.po_number, po.grand_total as total_amount, c.company_name
                FROM purchase_orders po
                JOIN clients c ON po.client_id = c.id
                WHERE po.status = 'PENDING_APPROVAL'
                ORDER BY po.created_at DESC
            `).all();

            for (const po of pendingApprovalPOs) {
                items.push({
                    id: `po-appr-${po.id}`,
                    category: 'APPROVAL',
                    title: `PO ${po.po_number} Needs Approval`,
                    description: `Submitted by ${po.company_name} (Total: ₱${Number(po.total_amount || 0).toLocaleString()}).`,
                    urgency: 'HIGH',
                    icon: '📝',
                    target: {
                        tab: 'orders',
                        subTab: 'all',
                        poId: po.id,
                        poNumber: po.po_number,
                        action: 'APPROVE_PO'
                    }
                });
            }

            // Online Inquiries pending IT / Admin response
            try {
                const pendingInquiries = db.prepare(`
                    SELECT id, name, email, subject, message, created_at
                    FROM support_inquiries
                    WHERE status = 'NEW'
                    ORDER BY created_at DESC
                    LIMIT 5
                `).all();

                for (const inq of pendingInquiries) {
                    items.push({
                        id: `inq-${inq.id}`,
                        category: 'SUPPORT',
                        title: `Online Inquiry from ${inq.name}`,
                        description: `Subject: ${inq.subject || 'General'} • "${inq.message.substring(0, 50)}${inq.message.length > 50 ? '...' : ''}"`,
                        urgency: 'HIGH',
                        icon: '💬',
                        target: {
                            tab: 'chat',
                            channel: 'support',
                            inquiryId: inq.id
                        }
                    });
                }
            } catch (e) {
                // Table may not exist yet in certain test mocks
            }
        }

        // 2. Orders pending Accounting Confirmation (Downpayment / Credit terms check)
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.ACCOUNTING) {
            const pendingAccPOs = db.prepare(`
                SELECT po.id, po.po_number, po.grand_total as total_amount, c.company_name
                FROM purchase_orders po
                JOIN clients c ON po.client_id = c.id
                WHERE po.status IN ('APPROVED', 'PENDING_APPROVAL')
                  AND po.accounting_confirmed = 0
                ORDER BY po.created_at DESC
            `).all();

            for (const po of pendingAccPOs) {
                items.push({
                    id: `po-acc-${po.id}`,
                    category: 'ACCOUNTING',
                    title: `PO ${po.po_number}: Accounting Confirmation`,
                    description: `${po.company_name} - Verify payment deposit or credit limit before manufacturing.`,
                    urgency: 'HIGH',
                    icon: '💰',
                    target: {
                        tab: 'orders',
                        subTab: 'all',
                        poId: po.id,
                        poNumber: po.po_number,
                        action: 'CONFIRM_ACCOUNTING'
                    }
                });
            }
        }

        // 3. Orders pending Inventory Confirmation / Raw Materials Check
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.INVENTORY) {
            const pendingInvPOs = db.prepare(`
                SELECT po.id, po.po_number, po.raw_materials_status, c.company_name
                FROM purchase_orders po
                JOIN clients c ON po.client_id = c.id
                WHERE po.status IN ('APPROVED', 'PENDING_APPROVAL')
                  AND po.inventory_confirmed = 0
                ORDER BY po.created_at DESC
            `).all();

            for (const po of pendingInvPOs) {
                items.push({
                    id: `po-inv-${po.id}`,
                    category: 'INVENTORY',
                    title: `PO ${po.po_number}: Inventory Materials Check`,
                    description: `${po.company_name} - Confirm raw chemical and packaging availability.`,
                    urgency: 'HIGH',
                    icon: '📦',
                    target: {
                        tab: 'orders',
                        subTab: 'all',
                        poId: po.id,
                        poNumber: po.po_number,
                        action: 'CONFIRM_INVENTORY'
                    }
                });
            }
        }

        // 4. Purchasing Department: Raw Materials Supply Requisitions
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.PURCHASING) {
            const pendingRequisitions = db.prepare(`
                SELECT sr.id, sr.materials_needed, sr.urgency, sr.target_date, po.po_number, c.company_name
                FROM supply_requests sr
                JOIN purchase_orders po ON sr.po_id = po.id
                JOIN clients c ON po.client_id = c.id
                WHERE sr.status = 'SUBMITTED'
                ORDER BY sr.created_at DESC
            `).all();

            for (const sr of pendingRequisitions) {
                items.push({
                    id: `sr-sub-${sr.id}`,
                    category: 'PURCHASING',
                    title: `Requisition for PO ${sr.po_number}`,
                    description: `Procure: ${sr.materials_needed.slice(0, 70)}${sr.materials_needed.length > 70 ? '...' : ''}`,
                    urgency: sr.urgency === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
                    icon: '🛒',
                    target: {
                        tab: 'purchasing',
                        reqId: sr.id,
                        poNumber: sr.po_number,
                        action: 'ORDER_SUPPLIES'
                    }
                });
            }
        }

        // 5. Production Department: Ready for Job Order / Compounding Batches
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.PRODUCTION) {
            const readyPOs = db.prepare(`
                SELECT po.id, po.po_number, c.company_name,
                       (SELECT COUNT(*) FROM job_orders WHERE po_id = po.id) as jo_count
                FROM purchase_orders po
                JOIN clients c ON po.client_id = c.id
                WHERE po.status = 'APPROVED'
                  AND po.accounting_confirmed = 1
                  AND po.inventory_confirmed = 1
                ORDER BY po.created_at DESC
            `).all();

            for (const po of readyPOs) {
                if (po.jo_count === 0) {
                    items.push({
                        id: `prod-jo-${po.id}`,
                        category: 'PRODUCTION',
                        title: `Create Job Order for PO ${po.po_number}`,
                        description: `All clearances approved for ${po.company_name}. Generate compounding batch recipe.`,
                        urgency: 'MEDIUM',
                        icon: '🧪',
                        target: {
                            tab: 'job-orders',
                            poId: po.id,
                            poNumber: po.po_number,
                            action: 'CREATE_JO'
                        }
                    });
                }
            }

            // Production Batches Overruns pending authorization
            const pendingOverruns = db.prepare(`
                SELECT pb.id, pb.batch_number, pb.variance_quantity as overrun_quantity, jo.jo_number
                FROM production_batches pb
                JOIN job_orders jo ON pb.jo_id = jo.id
                WHERE pb.status = 'EXCEPTION_REQUIRES_APPROVAL'
                ORDER BY pb.created_at DESC
            `).all();

            for (const ov of pendingOverruns) {
                items.push({
                    id: `prod-ovr-${ov.id}`,
                    category: 'PRODUCTION',
                    title: `Batch ${ov.batch_number} Overrun Approval`,
                    description: `Excess yield (+${ov.overrun_quantity} units) awaiting allocation authorization.`,
                    urgency: 'HIGH',
                    icon: '⚠️',
                    target: {
                        tab: 'compounding',
                        batchId: ov.id,
                        batchNumber: ov.batch_number,
                        action: 'APPROVE_OVERRUN'
                    }
                });
            }
        }

        // 5b. Quality Control (QC) Inspector Queue: Batches awaiting QC Inspection / Yield Clearance
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.QC) {
            const batchesForInspection = db.prepare(`
                SELECT pb.id, pb.batch_number, pb.target_quantity, pb.status, p.name as product_name, c.company_name
                FROM production_batches pb
                JOIN job_orders jo ON pb.jo_id = jo.id
                JOIN purchase_orders po ON jo.po_id = po.id
                JOIN clients c ON po.client_id = c.id
                JOIN products p ON pb.product_id = p.id
                WHERE pb.status IN ('PLANNED', 'MIXING', 'BOTTLING')
                ORDER BY pb.created_at DESC
                LIMIT 8
            `).all();

            for (const b of batchesForInspection) {
                items.push({
                    id: `qc-batch-${b.id}`,
                    category: 'QUALITY_CONTROL',
                    title: `QC Inspection: ${b.batch_number}`,
                    description: `${b.product_name} (${b.company_name}) - Stage: ${b.status}. Awaiting yield logging & CoA clearance.`,
                    urgency: 'HIGH',
                    icon: '🔬',
                    target: {
                        tab: 'production',
                        batchId: b.id,
                        batchNumber: b.batch_number,
                        action: 'LOG_YIELD'
                    }
                });
            }
        }

        // 5c. CEO Executive Oversight Queue: Unbilled Completed Deliveries & Global Alerts
        if (role === ROLES.CEO) {
            const unbilledCount = db.prepare(`
                SELECT COUNT(*) as count
                FROM delivery_receipts dr
                WHERE dr.status = 'ACCEPTED'
                  AND dr.id NOT IN (SELECT dr_id FROM sales_invoices WHERE dr_id IS NOT NULL)
            `).get().count;

            if (unbilledCount > 0) {
                items.push({
                    id: 'ceo-unbilled-drs',
                    category: 'EXECUTIVE',
                    title: `${unbilledCount} Accepted Delivery Receipts Unbilled`,
                    description: 'Client accepted shipments awaiting Sales Invoice generation.',
                    urgency: 'MEDIUM',
                    icon: '👑',
                    target: {
                        tab: 'invoices',
                        action: 'VIEW_UNBILLED'
                    }
                });
            }
        }

        // 6. Logistics, Warehouse & Production: Batches Ready for Dispatch / Delivery Receipt
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.WAREHOUSE || role === ROLES.PRODUCTION) {
            const readyBatches = db.prepare(`
                SELECT pb.id, pb.batch_number, pb.actual_yield, c.company_name, po.po_number
                FROM production_batches pb
                JOIN job_orders jo ON pb.jo_id = jo.id
                JOIN purchase_orders po ON jo.po_id = po.id
                JOIN clients c ON po.client_id = c.id
                WHERE pb.status IN ('COMPLETED', 'APPROVED_FOR_DISPATCH', 'QC_PASSED')
                  AND pb.id NOT IN (SELECT batch_id FROM delivery_items WHERE batch_id IS NOT NULL)
                ORDER BY pb.created_at DESC
                LIMIT 5
            `).all();

            for (const rb of readyBatches) {
                items.push({
                    id: `dr-ready-${rb.id}`,
                    category: role === ROLES.PRODUCTION ? 'PRODUCTION' : 'WAREHOUSE',
                    title: `Batch ${rb.batch_number} Ready for DR`,
                    description: `Finished goods cleared. Generate Delivery Receipt for ${rb.company_name}.`,
                    urgency: 'MEDIUM',
                    icon: '🚚',
                    target: {
                        tab: 'deliveries',
                        batchId: rb.id,
                        batchNumber: rb.batch_number,
                        action: 'CREATE_DR'
                    }
                });
            }
        }

        // 7. Client Portal Pending Items: Dispatched DRs awaiting Signature / Invoices
        if (role === ROLES.CLIENT && clientId) {
            const pendingSignDRs = db.prepare(`
                SELECT dr.id, dr.dr_number, dr.dispatched_at, dr.vehicle_plate
                FROM delivery_receipts dr
                WHERE dr.client_id = ?
                  AND dr.status IN ('DISPATCHED', 'PENDING_CLIENT_ACCEPTANCE')
                ORDER BY dr.created_at DESC
            `).all(clientId);

            for (const dr of pendingSignDRs) {
                items.push({
                    id: `cli-dr-${dr.id}`,
                    category: 'DELIVERY',
                    title: `Delivery ${dr.dr_number} Awaiting Acceptance`,
                    description: `Goods in transit / delivered. Please inspect and sign digital acceptance.`,
                    urgency: 'CRITICAL',
                    icon: '✍️',
                    target: {
                        tab: 'deliveries',
                        drId: dr.id,
                        drNumber: dr.dr_number,
                        action: 'ACCEPT_DR'
                    }
                });
            }

            // Unpaid Invoices
            const unpaidInvoices = db.prepare(`
                SELECT id, invoice_number, total_amount, balance_due, due_date
                FROM sales_invoices
                WHERE client_id = ?
                  AND status IN ('UNPAID', 'PARTIALLY_PAID')
                ORDER BY due_date ASC
            `).all(clientId);

            for (const inv of unpaidInvoices) {
                items.push({
                    id: `cli-inv-${inv.id}`,
                    category: 'INVOICE',
                    title: `Invoice ${inv.invoice_number} Payment Due`,
                    description: `Outstanding balance: ₱${Number(inv.balance_due || 0).toLocaleString()}. Due: ${inv.due_date || 'Prompt'}.`,
                    urgency: 'HIGH',
                    icon: '💳',
                    target: {
                        tab: 'invoices',
                        invoiceId: inv.id,
                        invoiceNumber: inv.invoice_number,
                        action: 'PAY_INVOICE'
                    }
                });
            }
        }

        return res.json({
            success: true,
            totalPending: items.length,
            role,
            items
        });
    } catch (err) {
        console.error('Error in notifications/pending:', err);
        return res.status(500).json({ success: false, error: 'FAILED_NOTIFICATIONS', message: err.message });
    }
});

module.exports = router;

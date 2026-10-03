const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, normalizeRole, ROLES } = require('../middleware/auth');
const { cleanPhoneNumber, getWhatsAppUrl, getSmsUrl } = require('../services/dispatchNotificationService');
const { logAudit } = require('../services/auditService');

/**
 * Format structured Action Required WhatsApp alert message
 */
function generateActionAlertMessage({ title, urgency, description, reference, targetTab, recipientName, roleLabel, poNumber }) {
    const baseUrl = 'http://my.nkbmanufacturing.com';
    let link = `${baseUrl}/admin.html`;
    if (targetTab) {
        link += `?tab=${targetTab}`;
        if (poNumber) link += `&po=${encodeURIComponent(poNumber)}`;
    }

    const urgencyEmoji = urgency === 'CRITICAL' ? '🚨' : (urgency === 'HIGH' ? '⚠️' : '📌');

    let msg = `${urgencyEmoji} *NKB ACTION REQUIRED*

📌 *Task:* ${title}
⚠️ *Urgency:* ${urgency}`;

    if (reference) {
        msg += `\n📋 *Reference:* ${reference}`;
    }
    if (recipientName) {
        msg += `\n👤 *Target Assignee:* ${recipientName}${roleLabel ? ` (${roleLabel})` : ''}`;
    }
    msg += `\n\n📝 *Action Details:*\n${description}`;
    msg += `\n\n👉 *Take Action in Portal:*\n${link}`;
    msg += `\n\nPlease review and take action promptly.`;

    return msg;
}

/**
 * Format concise Action Required SMS message
 */
function generateActionSmsMessage({ title, urgency, description, reference }) {
    const refText = reference ? ` [${reference}]` : '';
    const cleanDesc = description ? description.replace(/[\n\r]+/g, ' ').substring(0, 90) : '';
    return `NKB ACTION REQUIRED (${urgency}): ${title}${refText}. ${cleanDesc}. http://my.nkbmanufacturing.com`;
}

/**
 * Helper to construct an action item with WhatsApp and SMS attributes
 */
function createActionItem({
    id,
    category,
    title,
    description,
    urgency = 'MEDIUM',
    icon = '📌',
    target = {},
    recipient_name = null,
    recipient_phone = null,
    recipient_role = null
}) {
    const phone = recipient_phone || '';
    const cleaned = cleanPhoneNumber(phone);
    const whatsappMsg = generateActionAlertMessage({
        title,
        urgency,
        description,
        reference: target?.poNumber || target?.drNumber || target?.batchNumber || '',
        targetTab: target?.tab,
        recipientName: recipient_name,
        roleLabel: recipient_role,
        poNumber: target?.poNumber
    });
    const smsMsg = generateActionSmsMessage({
        title,
        urgency,
        description,
        reference: target?.poNumber || target?.drNumber || target?.batchNumber || ''
    });

    return {
        id,
        category,
        title,
        description,
        urgency,
        icon,
        recipient_name: recipient_name || null,
        recipient_phone: phone || null,
        recipient_role: recipient_role || null,
        whatsapp_message: whatsappMsg,
        sms_message: smsMsg,
        whatsapp_url: getWhatsAppUrl(cleaned, whatsappMsg),
        sms_url: getSmsUrl(cleaned, smsMsg),
        target
    };
}

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.IT_ADMIN];

/**
 * Resolve the primary Admin contact who receives a copy of every notification.
 * Preference: SUPER_ADMIN -> ADMIN -> IT_ADMIN, favouring accounts with a registered WhatsApp/phone.
 */
function resolveAdminContact() {
    try {
        const rows = db.prepare(`
            SELECT id, role, name, phone, whatsapp_number, email
            FROM users
            WHERE is_active = 1 AND role IN ('SUPER_ADMIN', 'ADMIN', 'IT_ADMIN')
            ORDER BY created_at ASC
        `).all();
        const rank = (r) => ADMIN_ROLES.indexOf(r.role);
        rows.sort((a, b) => {
            const aHas = (a.whatsapp_number || a.phone) ? 0 : 1;
            const bHas = (b.whatsapp_number || b.phone) ? 0 : 1;
            return aHas - bHas || rank(a) - rank(b);
        });
        const a = rows[0];
        if (!a) return null;
        return {
            id: a.id,
            name: a.name || 'System Admin',
            role: a.role,
            phone: a.whatsapp_number || a.phone || null
        };
    } catch (_) {
        return null;
    }
}

/**
 * Attach an Admin copy (CC) of the WhatsApp / SMS alert to an action item.
 */
function attachAdminCopy(item, admin) {
    const adminPhone = admin?.phone || '';
    const cleaned = cleanPhoneNumber(adminPhone);
    const adminWhatsapp = `👑 *ADMIN COPY*\n\n${item.whatsapp_message}`;
    const adminSms = `[ADMIN COPY] ${item.sms_message}`;
    item.admin_name = admin?.name || 'System Admin';
    item.admin_phone = adminPhone || null;
    item.admin_whatsapp_message = adminWhatsapp;
    item.admin_sms_message = adminSms;
    item.admin_whatsapp_url = getWhatsAppUrl(cleaned, adminWhatsapp);
    item.admin_sms_url = getSmsUrl(cleaned, adminSms);
    return item;
}

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

        // Lookup active staff directory for role-to-phone mappings
        const staffDirectory = {};
        try {
            const rows = db.prepare(`
                SELECT role, name, phone, whatsapp_number, email
                FROM users
                WHERE is_active = 1
                ORDER BY created_at ASC
            `).all();
            for (const r of rows) {
                if (!staffDirectory[r.role]) {
                    staffDirectory[r.role] = r;
                }
            }
        } catch (_) {}

        // 1. POs pending Administrative / Executive Approval
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.CEO) {
            const pendingApprovalPOs = db.prepare(`
                SELECT po.id, po.po_number, po.grand_total as total_amount, c.company_name, c.phone as client_phone, c.contact_person
                FROM purchase_orders po
                JOIN clients c ON po.client_id = c.id
                WHERE po.status = 'PENDING_APPROVAL'
                ORDER BY po.created_at DESC
            `).all();

            for (const po of pendingApprovalPOs) {
                items.push(createActionItem({
                    id: `po-appr-${po.id}`,
                    category: 'APPROVAL',
                    title: `PO ${po.po_number} Needs Approval`,
                    description: `Submitted by ${po.company_name} (Total: ₱${Number(po.total_amount || 0).toLocaleString()}).`,
                    urgency: 'HIGH',
                    icon: '📝',
                    recipient_name: po.contact_person || po.company_name,
                    recipient_phone: po.client_phone || staffDirectory[ROLES.SUPER_ADMIN]?.whatsapp_number || staffDirectory[ROLES.SUPER_ADMIN]?.phone,
                    recipient_role: 'Client / Executive Admin',
                    target: {
                        tab: 'orders',
                        subTab: 'all',
                        poId: po.id,
                        poNumber: po.po_number,
                        action: 'APPROVE_PO'
                    }
                }));
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
                    items.push(createActionItem({
                        id: `inq-${inq.id}`,
                        category: 'SUPPORT',
                        title: `Online Inquiry from ${inq.name}`,
                        description: `Subject: ${inq.subject || 'General'} • "${inq.message.substring(0, 50)}${inq.message.length > 50 ? '...' : ''}"`,
                        urgency: 'HIGH',
                        icon: '💬',
                        recipient_name: inq.name,
                        recipient_phone: staffDirectory[ROLES.IT_ADMIN]?.whatsapp_number || staffDirectory[ROLES.IT_ADMIN]?.phone,
                        recipient_role: 'IT Support Admin',
                        target: {
                            tab: 'chat',
                            channel: 'support',
                            inquiryId: inq.id
                        }
                    }));
                }
            } catch (e) {
                // Table may not exist yet in certain test mocks
            }
        }

        // 2. Orders pending Accounting Confirmation (Downpayment / Credit terms check)
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.ACCOUNTING) {
            const pendingAccPOs = db.prepare(`
                SELECT po.id, po.po_number, po.grand_total as total_amount, c.company_name, c.phone as client_phone
                FROM purchase_orders po
                JOIN clients c ON po.client_id = c.id
                WHERE po.status IN ('APPROVED', 'PENDING_APPROVAL')
                  AND po.accounting_confirmed = 0
                ORDER BY po.created_at DESC
            `).all();

            for (const po of pendingAccPOs) {
                items.push(createActionItem({
                    id: `po-acc-${po.id}`,
                    category: 'ACCOUNTING',
                    title: `PO ${po.po_number}: Accounting Confirmation`,
                    description: `${po.company_name} - Verify payment deposit or credit limit before manufacturing.`,
                    urgency: 'HIGH',
                    icon: '💰',
                    recipient_name: staffDirectory[ROLES.ACCOUNTING]?.name || 'Senior Accountant',
                    recipient_phone: staffDirectory[ROLES.ACCOUNTING]?.whatsapp_number || staffDirectory[ROLES.ACCOUNTING]?.phone || po.client_phone,
                    recipient_role: 'Accounting Officer',
                    target: {
                        tab: 'orders',
                        subTab: 'all',
                        poId: po.id,
                        poNumber: po.po_number,
                        action: 'CONFIRM_ACCOUNTING'
                    }
                }));
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
                items.push(createActionItem({
                    id: `po-inv-${po.id}`,
                    category: 'INVENTORY',
                    title: `PO ${po.po_number}: Inventory Materials Check`,
                    description: `${po.company_name} - Confirm raw chemical and packaging availability.`,
                    urgency: 'HIGH',
                    icon: '📦',
                    recipient_name: staffDirectory[ROLES.INVENTORY]?.name || 'Inventory Officer',
                    recipient_phone: staffDirectory[ROLES.INVENTORY]?.whatsapp_number || staffDirectory[ROLES.INVENTORY]?.phone,
                    recipient_role: 'Inventory Officer',
                    target: {
                        tab: 'orders',
                        subTab: 'all',
                        poId: po.id,
                        poNumber: po.po_number,
                        action: 'CONFIRM_INVENTORY'
                    }
                }));
            }
        }

        // 4. Purchasing Department: Raw Materials Supply Requisitions
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.PURCHASING) {
            const pendingRequisitions = db.prepare(`
                SELECT sr.id, sr.materials_needed, sr.urgency, sr.target_date, po.po_number, c.company_name,
                       u.name as requester_name, u.phone as requester_phone, u.whatsapp_number as requester_whatsapp
                FROM supply_requests sr
                JOIN purchase_orders po ON sr.po_id = po.id
                JOIN clients c ON po.client_id = c.id
                LEFT JOIN users u ON sr.requested_by = u.id
                WHERE sr.status = 'SUBMITTED'
                ORDER BY sr.created_at DESC
            `).all();

            for (const sr of pendingRequisitions) {
                items.push(createActionItem({
                    id: `sr-sub-${sr.id}`,
                    category: 'PURCHASING',
                    title: `Requisition for PO ${sr.po_number}`,
                    description: `Procure: ${sr.materials_needed.slice(0, 70)}${sr.materials_needed.length > 70 ? '...' : ''}`,
                    urgency: sr.urgency === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
                    icon: '🛒',
                    recipient_name: staffDirectory[ROLES.PURCHASING]?.name || 'Purchasing Officer',
                    recipient_phone: staffDirectory[ROLES.PURCHASING]?.whatsapp_number || staffDirectory[ROLES.PURCHASING]?.phone || sr.requester_whatsapp || sr.requester_phone,
                    recipient_role: 'Purchasing Officer',
                    target: {
                        tab: 'purchasing',
                        reqId: sr.id,
                        poNumber: sr.po_number,
                        action: 'ORDER_SUPPLIES'
                    }
                }));
            }

            // QC Declined Requisitions awaiting Purchasing Response
            const qcDeclinedRequisitions = db.prepare(`
                SELECT sr.id, sr.materials_needed, sr.qc_notes, po.po_number, c.company_name,
                       qcu.name as qc_inspector_name, qcu.phone as qc_inspector_phone, qcu.whatsapp_number as qc_inspector_whatsapp
                FROM supply_requests sr
                LEFT JOIN purchase_orders po ON sr.po_id = po.id
                LEFT JOIN clients c ON po.client_id = c.id
                LEFT JOIN users qcu ON sr.qc_inspected_by = qcu.id
                WHERE sr.status = 'QC_DECLINED'
                ORDER BY sr.updated_at DESC
            `).all();

            for (const sr of qcDeclinedRequisitions) {
                const poRef = sr.po_number || 'WH-STOCK-BOM';
                items.push(createActionItem({
                    id: `sr-qc-declined-${sr.id}`,
                    category: 'PURCHASING',
                    title: `QC Declined: ${poRef}`,
                    description: `Defects: "${sr.qc_notes || 'Declined by QC'}". Action required: Reject, Re-order, Return to Supplier, or Bypass QC Check.`,
                    urgency: 'CRITICAL',
                    icon: '⚠️',
                    recipient_name: staffDirectory[ROLES.PURCHASING]?.name || 'Purchasing Officer',
                    recipient_phone: staffDirectory[ROLES.PURCHASING]?.whatsapp_number || staffDirectory[ROLES.PURCHASING]?.phone || sr.qc_inspector_whatsapp || sr.qc_inspector_phone,
                    recipient_role: 'Purchasing Officer',
                    target: {
                        tab: 'purchasing',
                        reqId: sr.id,
                        poNumber: poRef,
                        action: 'PURCHASING_RESPONSE'
                    }
                }));
            }
        }

        // 4b. Quality Control (QC) Department: Incoming Raw Materials Pending Quality Checking
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.QC || role === ROLES.CEO) {
            const pendingQcRequisitions = db.prepare(`
                SELECT sr.id, sr.materials_needed, sr.urgency, po.po_number, c.company_name,
                       u.name as requester_name, u.phone as requester_phone, u.whatsapp_number as requester_whatsapp
                FROM supply_requests sr
                LEFT JOIN purchase_orders po ON sr.po_id = po.id
                LEFT JOIN clients c ON po.client_id = c.id
                LEFT JOIN users u ON sr.requested_by = u.id
                WHERE sr.status = 'PENDING_QC'
                ORDER BY sr.updated_at DESC
            `).all();

            for (const sr of pendingQcRequisitions) {
                const poRef = sr.po_number || 'WH-STOCK-BOM';
                items.push(createActionItem({
                    id: `sr-qc-pending-${sr.id}`,
                    category: 'QC',
                    title: `QC Inspection Needed: ${poRef}`,
                    description: `Verify raw chemical quality & COA: ${sr.materials_needed.slice(0, 65)}${sr.materials_needed.length > 65 ? '...' : ''}`,
                    urgency: sr.urgency === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
                    icon: '🔬',
                    recipient_name: staffDirectory[ROLES.QC]?.name || 'Quality Control Inspector',
                    recipient_phone: staffDirectory[ROLES.QC]?.whatsapp_number || staffDirectory[ROLES.QC]?.phone,
                    recipient_role: 'QC Inspector',
                    target: {
                        tab: 'purchasing',
                        reqId: sr.id,
                        poNumber: poRef,
                        action: 'QC_INSPECT'
                    }
                }));
            }
        }

        // 5. Production Department: Ready for Job Order / Compounding Batches & SO Queue Reminders
        if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN || role === ROLES.ADMIN || role === ROLES.PRODUCTION) {
            try {
                const ordersRouter = require('./orders');
                if (ordersRouter && typeof ordersRouter.evaluateOrderRemindersAndAutoPrioritize === 'function') {
                    ordersRouter.evaluateOrderRemindersAndAutoPrioritize(db);
                }
                const { getManilaDate, getManilaDateTime } = require('../helpers/timezone');
                const today = getManilaDate();
                const now = getManilaDateTime();

                const highPrioCount = db.prepare(`
                    SELECT COUNT(*) as cnt
                    FROM purchase_orders
                    WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'VOIDED')
                      AND (priority_status IN ('RUSH', 'PRIORITIZED') OR is_active_today = 1)
                `).get()?.cnt || 0;

                const reminderPOs = db.prepare(`
                    SELECT po.id, po.po_number, po.so_number, po.priority_status, po.is_active_today,
                           po.reminder_at, po.auto_priority_target, po.reminder_note, po.reminder_triggered,
                           c.company_name
                    FROM purchase_orders po
                    JOIN clients c ON po.client_id = c.id
                    WHERE po.status NOT IN ('COMPLETED', 'CANCELLED', 'VOIDED')
                      AND po.reminder_at IS NOT NULL
                      AND po.reminder_at != ''
                      AND COALESCE(po.reminder_dismissed, 0) = 0
                    ORDER BY po.reminder_at ASC
                `).all();

                for (const rpo of reminderPOs) {
                    const normRem = String(rpo.reminder_at).replace('T', ' ');
                    const isDueNowOrToday = normRem <= now || normRem.startsWith(today) || Number(rpo.reminder_triggered) === 1;
                    if (isDueNowOrToday) {
                        const soLabel = rpo.so_number || rpo.po_number.replace('PO-', 'SO-');
                        const otherPrioCount = Math.max(0, highPrioCount - 1);
                        const moreWorkNote = otherPrioCount > 0
                            ? ` ⚠️ Supervisor Advisory: You also have ${otherPrioCount} other Rush/Prioritized order(s) in the factory queue.`
                            : '';
                        items.unshift(createActionItem({
                            id: `so-rem-${rpo.id}`,
                            category: 'PRODUCTION_REMINDER',
                            title: `⏰ SO Reminder: ${soLabel} Needs To Be Done Today`,
                            description: `${rpo.company_name} — Auto-prioritized to ${rpo.priority_status || 'RUSH'}${rpo.reminder_note ? ` ("${rpo.reminder_note}")` : ''}.${moreWorkNote}`,
                            urgency: 'CRITICAL',
                            icon: '⏰',
                            recipient_name: staffDirectory[ROLES.PRODUCTION]?.name || 'Production Supervisor',
                            recipient_phone: staffDirectory[ROLES.PRODUCTION]?.whatsapp_number || staffDirectory[ROLES.PRODUCTION]?.phone,
                            recipient_role: 'Production Supervisor',
                            target: {
                                tab: 'overview',
                                poId: rpo.id,
                                poNumber: rpo.po_number,
                                action: 'VIEW_SO_REMINDER'
                            }
                        }));
                    }
                }
            } catch (remErr) {
                console.warn('Notification SO reminder check note:', remErr.message);
            }

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
                    items.push(createActionItem({
                        id: `prod-jo-${po.id}`,
                        category: 'PRODUCTION',
                        title: `Create Job Order for PO ${po.po_number}`,
                        description: `All clearances approved for ${po.company_name}. Generate compounding batch recipe.`,
                        urgency: 'MEDIUM',
                        icon: '🧪',
                        recipient_name: staffDirectory[ROLES.PRODUCTION]?.name || 'Production Supervisor',
                        recipient_phone: staffDirectory[ROLES.PRODUCTION]?.whatsapp_number || staffDirectory[ROLES.PRODUCTION]?.phone,
                        recipient_role: 'Production Supervisor',
                        target: {
                            tab: 'job-orders',
                            poId: po.id,
                            poNumber: po.po_number,
                            action: 'CREATE_JO'
                        }
                    }));
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
                items.push(createActionItem({
                    id: `prod-ovr-${ov.id}`,
                    category: 'PRODUCTION',
                    title: `Batch ${ov.batch_number} Overrun Approval`,
                    description: `Excess yield (+${ov.overrun_quantity} units) awaiting allocation authorization.`,
                    urgency: 'HIGH',
                    icon: '⚠️',
                    recipient_name: staffDirectory[ROLES.PRODUCTION]?.name || 'Production Supervisor',
                    recipient_phone: staffDirectory[ROLES.PRODUCTION]?.whatsapp_number || staffDirectory[ROLES.PRODUCTION]?.phone || staffDirectory[ROLES.SUPER_ADMIN]?.phone,
                    recipient_role: 'Production Supervisor',
                    target: {
                        tab: 'compounding',
                        batchId: ov.id,
                        batchNumber: ov.batch_number,
                        action: 'APPROVE_OVERRUN'
                    }
                }));
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
                items.push(createActionItem({
                    id: `qc-batch-${b.id}`,
                    category: 'QUALITY_CONTROL',
                    title: `QC Inspection: ${b.batch_number}`,
                    description: `${b.product_name} (${b.company_name}) - Stage: ${b.status}. Awaiting yield logging & CoA clearance.`,
                    urgency: 'HIGH',
                    icon: '🔬',
                    recipient_name: staffDirectory[ROLES.QC]?.name || 'Quality Control Inspector',
                    recipient_phone: staffDirectory[ROLES.QC]?.whatsapp_number || staffDirectory[ROLES.QC]?.phone,
                    recipient_role: 'QC Inspector',
                    target: {
                        tab: 'production',
                        batchId: b.id,
                        batchNumber: b.batch_number,
                        action: 'LOG_YIELD'
                    }
                }));
            }
        }

        // 5c. CEO Executive Oversight Queue: Unbilled Completed Deliveries & Global Alerts
        if (role === ROLES.CEO || ADMIN_ROLES.includes(role)) {
            const unbilledCount = db.prepare(`
                SELECT COUNT(*) as count
                FROM delivery_receipts dr
                WHERE dr.status = 'ACCEPTED'
                  AND dr.id NOT IN (SELECT dr_id FROM sales_invoices WHERE dr_id IS NOT NULL)
            `).get().count;

            if (unbilledCount > 0) {
                items.push(createActionItem({
                    id: 'ceo-unbilled-drs',
                    category: 'EXECUTIVE',
                    title: `${unbilledCount} Accepted Delivery Receipts Unbilled`,
                    description: 'Client accepted shipments awaiting Sales Invoice generation.',
                    urgency: 'MEDIUM',
                    icon: '👑',
                    recipient_name: staffDirectory[ROLES.ACCOUNTING]?.name || 'Senior Accountant',
                    recipient_phone: staffDirectory[ROLES.ACCOUNTING]?.whatsapp_number || staffDirectory[ROLES.ACCOUNTING]?.phone || staffDirectory[ROLES.CEO]?.phone,
                    recipient_role: 'Senior Accountant / CEO',
                    target: {
                        tab: 'invoices',
                        action: 'VIEW_UNBILLED'
                    }
                }));
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
                items.push(createActionItem({
                    id: `dr-ready-${rb.id}`,
                    category: role === ROLES.PRODUCTION ? 'PRODUCTION' : 'WAREHOUSE',
                    title: `Batch ${rb.batch_number} Ready for DR`,
                    description: `Finished goods cleared. Generate Delivery Receipt for ${rb.company_name}.`,
                    urgency: 'MEDIUM',
                    icon: '🚚',
                    recipient_name: staffDirectory[ROLES.WAREHOUSE]?.name || 'Logistics & Warehouse Officer',
                    recipient_phone: staffDirectory[ROLES.WAREHOUSE]?.whatsapp_number || staffDirectory[ROLES.WAREHOUSE]?.phone,
                    recipient_role: 'Logistics & Warehouse',
                    target: {
                        tab: 'deliveries',
                        batchId: rb.id,
                        batchNumber: rb.batch_number,
                        action: 'CREATE_DR'
                    }
                }));
            }
        }

        // 7. Client Portal Pending Items: Dispatched DRs awaiting Signature / Invoices
        if (role === ROLES.CLIENT && clientId) {
            const pendingSignDRs = db.prepare(`
                SELECT dr.id, dr.dr_number, dr.dispatched_at, dr.vehicle_plate, c.phone as client_phone, c.contact_person, c.company_name
                FROM delivery_receipts dr
                JOIN clients c ON dr.client_id = c.id
                WHERE dr.client_id = ?
                  AND dr.status IN ('DISPATCHED', 'PENDING_CLIENT_ACCEPTANCE')
                ORDER BY dr.created_at DESC
            `).all(clientId);

            for (const dr of pendingSignDRs) {
                items.push(createActionItem({
                    id: `cli-dr-${dr.id}`,
                    category: 'DELIVERY',
                    title: `Delivery ${dr.dr_number} Awaiting Acceptance`,
                    description: `Goods in transit / delivered. Please inspect and sign digital acceptance.`,
                    urgency: 'CRITICAL',
                    icon: '✍️',
                    recipient_name: dr.contact_person || dr.company_name,
                    recipient_phone: dr.client_phone,
                    recipient_role: 'Client Signatory',
                    target: {
                        tab: 'deliveries',
                        drId: dr.id,
                        drNumber: dr.dr_number,
                        action: 'ACCEPT_DR'
                    }
                }));
            }

            // Unpaid Invoices
            const unpaidInvoices = db.prepare(`
                SELECT inv.id, inv.invoice_number, inv.total_amount, inv.balance_due, inv.due_date,
                       c.phone as client_phone, c.contact_person, c.company_name
                FROM sales_invoices inv
                JOIN clients c ON inv.client_id = c.id
                WHERE inv.client_id = ?
                  AND inv.status IN ('UNPAID', 'PARTIALLY_PAID')
                ORDER BY inv.due_date ASC
            `).all(clientId);

            for (const inv of unpaidInvoices) {
                items.push(createActionItem({
                    id: `cli-inv-${inv.id}`,
                    category: 'INVOICE',
                    title: `Invoice ${inv.invoice_number} Payment Due`,
                    description: `Outstanding balance: ₱${Number(inv.balance_due || 0).toLocaleString()}. Due: ${inv.due_date || 'Prompt'}.`,
                    urgency: 'HIGH',
                    icon: '💳',
                    recipient_name: inv.contact_person || inv.company_name,
                    recipient_phone: inv.client_phone,
                    recipient_role: 'Client Accounts Payable',
                    target: {
                        tab: 'invoices',
                        invoiceId: inv.id,
                        invoiceNumber: inv.invoice_number,
                        action: 'PAY_INVOICE'
                    }
                }));
            }
        }

        // 8. Admin Oversight: Client-side pending items across ALL clients (follow-up alerts)
        if (ADMIN_ROLES.includes(role)) {
            try {
                const allPendingDRs = db.prepare(`
                    SELECT dr.id, dr.dr_number, c.phone as client_phone, c.contact_person, c.company_name
                    FROM delivery_receipts dr
                    JOIN clients c ON dr.client_id = c.id
                    WHERE dr.status IN ('DISPATCHED', 'PENDING_CLIENT_ACCEPTANCE')
                    ORDER BY dr.created_at DESC
                    LIMIT 10
                `).all();
                for (const dr of allPendingDRs) {
                    items.push(createActionItem({
                        id: `adm-cli-dr-${dr.id}`,
                        category: 'DELIVERY',
                        title: `Client Acceptance Pending: ${dr.dr_number}`,
                        description: `${dr.company_name} has not yet signed the digital acceptance for this delivery. Follow up with the client.`,
                        urgency: 'HIGH',
                        icon: '✍️',
                        recipient_name: dr.contact_person || dr.company_name,
                        recipient_phone: dr.client_phone,
                        recipient_role: 'Client Signatory',
                        target: { tab: 'deliveries', drId: dr.id, drNumber: dr.dr_number, action: 'VIEW_DR' }
                    }));
                }

                const allUnpaid = db.prepare(`
                    SELECT inv.id, inv.invoice_number, inv.balance_due, inv.due_date,
                           c.phone as client_phone, c.contact_person, c.company_name
                    FROM sales_invoices inv
                    JOIN clients c ON inv.client_id = c.id
                    WHERE inv.status IN ('UNPAID', 'PARTIALLY_PAID')
                    ORDER BY inv.due_date ASC
                    LIMIT 10
                `).all();
                for (const inv of allUnpaid) {
                    items.push(createActionItem({
                        id: `adm-cli-inv-${inv.id}`,
                        category: 'INVOICE',
                        title: `Unpaid Invoice ${inv.invoice_number} (${inv.company_name})`,
                        description: `Outstanding balance: ₱${Number(inv.balance_due || 0).toLocaleString()}. Due: ${inv.due_date || 'Prompt'}.`,
                        urgency: 'MEDIUM',
                        icon: '💳',
                        recipient_name: inv.contact_person || inv.company_name,
                        recipient_phone: inv.client_phone,
                        recipient_role: 'Client Accounts Payable',
                        target: { tab: 'invoices', invoiceId: inv.id, invoiceNumber: inv.invoice_number, action: 'VIEW_INVOICE' }
                    }));
                }
            } catch (admErr) {
                console.warn('Admin client follow-up notification note:', admErr.message);
            }
        }

        // Every notification is also copied to the Admin (WhatsApp / SMS CC)
        const adminContact = resolveAdminContact();
        for (const it of items) attachAdminCopy(it, adminContact);

        return res.json({
            success: true,
            totalPending: items.length,
            role,
            admin_contact: adminContact ? { name: adminContact.name, role: adminContact.role, phone: adminContact.phone } : null,
            items
        });
    } catch (err) {
        console.error('Error in notifications/pending:', err);
        return res.status(500).json({ success: false, error: 'FAILED_NOTIFICATIONS', message: err.message });
    }
});

/**
 * POST /api/notifications/log-action-alert
 * Log that an action required alert was sent via WhatsApp or SMS for audit and tracking
 */
router.post('/log-action-alert', authenticateToken, (req, res) => {
    try {
        const { notification_id, channel, recipient_phone, title } = req.body;
        const user = req.user;

        logAudit({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: 'DISPATCH_ACTION_ALERT',
            entityType: 'NOTIFICATION',
            entityId: notification_id || 'GENERAL',
            details: { channel: channel || 'WHATSAPP', recipient_phone, title },
            ipAddress: req.ip
        });

        return res.json({ success: true, message: 'Action alert milestone recorded.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/notifications/summary-message
 * Generate multi-item WhatsApp and SMS summary text for all pending action required tasks
 */
router.get('/summary-message', authenticateToken, (req, res) => {
    try {
        const baseUrl = 'http://my.nkbmanufacturing.com';
        const user = req.user;
        const role = normalizeRole(user.role);

        // Fetch pending items using the internal logic
        const items = [];
        // Helper to format summary
        const summaryText = `📋 *NKB ACTION REQUIRED SUMMARY (${role})*\nTotal Pending: Check portal for live details.\n👉 Portal: ${baseUrl}/admin.html`;

        const whatsappUrl = getWhatsAppUrl('', summaryText);
        const smsUrl = getSmsUrl('', summaryText);

        return res.json({
            success: true,
            role,
            whatsappUrl,
            smsUrl,
            summaryText
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;


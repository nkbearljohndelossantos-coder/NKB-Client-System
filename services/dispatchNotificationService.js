/**
 * Dispatch Notification Service
 * Manages automated WhatsApp & SMS milestone notifications when deliveries are dispatched.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { logAudit } = require('./auditService');

/**
 * Clean and format Philippine phone number for international messaging
 * Examples: '0917-123-4567' -> '639171234567', '+63 917 123 4567' -> '639171234567'
 */
function cleanPhoneNumber(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) digits = digits.substring(1);
    if (digits.startsWith('09') && digits.length === 11) {
        digits = '63' + digits.substring(1);
    } else if (digits.startsWith('9') && digits.length === 10) {
        digits = '63' + digits;
    }
    return digits;
}

/**
 * Generate formatted WhatsApp / SMS dispatch notice
 */
function generateDispatchAlertMessage({ client, po, dr, items = [], baseUrl = 'http://my.nkbmanufacturing.com' }) {
    const contactPerson = client?.contact_person || client?.company_name || 'Valued Client';
    const companyName = client?.company_name || 'Your Company';
    const drNumber = dr?.dr_number || 'DR-Pending';
    const poNumber = po?.po_number || 'PO-Pending';
    const deliveryDate = dr?.delivery_date || 'Today';
    const vehiclePlate = dr?.vehicle_plate || 'Company Delivery Vehicle';
    const driverName = dr?.driver_name || 'NKB Logistics Officer';

    let itemsList = '';
    if (items && items.length > 0) {
        itemsList = items.map(it => {
            const name = it.product_name || it.item_name || it.name || 'Cosmetic Item';
            const qty = Number(it.delivered_quantity || it.quantity || 0).toLocaleString();
            return `• ${qty} pcs - ${name}`;
        }).join('\n');
    } else {
        itemsList = '• Finished cosmetics & personal care batch';
    }

    const portalUrl = `${baseUrl}/client.html?tab=dr-acceptance`;

    const message = 
`🚚 *NKB MANUFACTURING DISPATCH NOTICE*

Hello *${contactPerson}*!
Great news: Your manufacturing order for *${companyName}* is now *OUT FOR DELIVERY*!

📋 *Delivery Receipt:* ${drNumber}
📝 *Purchase Order:* ${poNumber}
📅 *Delivery Date:* ${deliveryDate}
🚛 *Vehicle Plate:* ${vehiclePlate}
👤 *Driver:* ${driverName}

📦 *Items Dispatched:*
${itemsList}

👉 *Track & Sign Digital Acceptance:*
${portalUrl}

Thank you for partnering with NKB Manufacturing Corporation!`;

    return message;
}

/**
 * Construct WhatsApp click-to-chat web / mobile URL
 */
function getWhatsAppUrl(phone, text) {
    const cleaned = cleanPhoneNumber(phone);
    const encoded = encodeURIComponent(text);
    return `https://api.whatsapp.com/send?phone=${encodeURIComponent(cleaned)}&text=${encoded}`;
}

/**
 * Construct native SMS link for mobile devices
 */
function getSmsUrl(phone, text) {
    const cleaned = cleanPhoneNumber(phone);
    const encoded = encodeURIComponent(text);
    return `sms:${encodeURIComponent(cleaned)}?body=${encoded}`;
}

/**
 * Send / Record Automated Dispatch Notification Milestone
 */
function sendAutomatedDispatchAlert({ drId, trigger = 'AUTOMATED', sentBy = null, channel = 'ALL' }) {
    const dr = db.prepare(`
        SELECT dr.*, po.po_number, c.id as client_id, c.company_name, c.contact_person, c.phone as client_phone
        FROM delivery_receipts dr
        JOIN purchase_orders po ON dr.po_id = po.id
        JOIN clients c ON dr.client_id = c.id
        WHERE dr.id = ?
    `).get(drId);

    if (!dr) {
        throw new Error('Delivery Receipt not found.');
    }

    const items = db.prepare(`
        SELECT di.*, COALESCE(poi.item_name, p.name) as product_name
        FROM delivery_items di
        JOIN products p ON di.product_id = p.id
        LEFT JOIN purchase_order_items poi ON poi.po_id = ? AND poi.product_id = di.product_id
        WHERE di.dr_id = ?
    `).all(dr.po_id, drId);

    const client = {
        company_name: dr.company_name,
        contact_person: dr.contact_person,
        phone: dr.client_phone
    };

    const message = generateDispatchAlertMessage({
        client,
        po: { po_number: dr.po_number },
        dr,
        items
    });

    const cleanedPhone = cleanPhoneNumber(dr.client_phone);
    const whatsappUrl = getWhatsAppUrl(cleanedPhone, message);
    const smsUrl = getSmsUrl(cleanedPhone, message);

    const now = new Date().toISOString();

    // Insert record in dispatch_notifications
    const notifId = uuidv4();
    try {
        db.prepare(`
            INSERT INTO dispatch_notifications
            (id, dr_id, po_id, client_id, channel, recipient_phone, recipient_name, message, status, sent_by, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SENT', ?, datetime('now', 'localtime'))
        `).run(
            notifId,
            dr.id,
            dr.po_id,
            dr.client_id,
            channel,
            cleanedPhone || dr.client_phone || 'None',
            dr.contact_person || dr.company_name,
            message,
            sentBy
        );
    } catch (insertErr) {
        console.warn('dispatch_notifications insert notice:', insertErr.message);
    }

    // Update delivery_receipts notification flags
    try {
        db.prepare(`
            UPDATE delivery_receipts
            SET whatsapp_notified_at = datetime('now', 'localtime'),
                sms_notified_at = datetime('now', 'localtime'),
                dispatch_message = ?
            WHERE id = ?
        `).run(message, dr.id);
    } catch (updErr) {
        console.warn('delivery_receipts update note:', updErr.message);
    }

    // Outbound Webhook Integration (if configured in environment)
    if (process.env.SMS_WEBHOOK_URL) {
        try {
            fetch(process.env.SMS_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: cleanedPhone,
                    drNumber: dr.dr_number,
                    poNumber: dr.po_number,
                    message
                })
            }).catch(e => console.warn('SMS Webhook call error:', e.message));
        } catch (_) {}
    }

    return {
        success: true,
        notificationId: notifId,
        drId: dr.id,
        drNumber: dr.dr_number,
        poNumber: dr.po_number,
        recipientName: dr.contact_person || dr.company_name,
        recipientPhone: cleanedPhone || dr.client_phone || '',
        channel,
        message,
        whatsappUrl,
        smsUrl,
        trigger
    };
}

/**
 * Retrieve dispatch notifications history for a DR
 */
function getDispatchNotificationsForDR(drId) {
    try {
        return db.prepare(`
            SELECT * FROM dispatch_notifications
            WHERE dr_id = ?
            ORDER BY sent_at DESC
        `).all(drId);
    } catch (_) {
        return [];
    }
}

module.exports = {
    cleanPhoneNumber,
    generateDispatchAlertMessage,
    getWhatsAppUrl,
    getSmsUrl,
    sendAutomatedDispatchAlert,
    getDispatchNotificationsForDR
};

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

function mergeOnlinePlatforms(dbPath) {
    console.log(`\nMerging Online Platforms in: ${dbPath}`);
    const db = new DatabaseSync(dbPath);

    const primaryClientId = '0d68514b-2b7f-42d2-a211-cfbdc0855d3a';
    const primaryUserId = 'i0000000-0000-0000-0000-000000000001';

    // 1. Ensure primary client exists
    let primaryClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(primaryClientId);
    if (!primaryClient) {
        db.prepare(`
            INSERT INTO clients (id, company_name, contact_person, email, phone, address, is_vyuceutical_ops, default_billing_policy, default_tolerance_percent, credit_limit, is_active, created_at, updated_at)
            VALUES (?, 'Vyuceutical OPC', 'Online Platforms', 'online.operator@vyuceutical.com', '+63 917 000 0011', 'Phils.', 1, 'ACTUAL_DELIVERY', 10.0, 500000.0, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(primaryClientId);
        console.log('Created canonical primary client row.');
    } else {
        db.prepare(`
            UPDATE clients
            SET company_name = 'Vyuceutical OPC',
                contact_person = 'Online Platforms',
                email = 'online.operator@vyuceutical.com',
                is_vyuceutical_ops = 1
            WHERE id = ?
        `).run(primaryClientId);
    }

    // 2. Find any other client rows representing Online Platforms
    const otherClients = db.prepare(`
        SELECT id, company_name, contact_person, email 
        FROM clients 
        WHERE id != ? 
          AND (
            LOWER(contact_person) LIKE '%online platform%'
            OR LOWER(company_name) LIKE '%online platform%'
            OR (LOWER(company_name) LIKE '%vyuceutical%' AND LOWER(contact_person) LIKE '%online%')
          )
    `).all(primaryClientId);

    console.log(`Found ${otherClients.length} duplicate client rows:`, otherClients);

    for (const dup of otherClients) {
        db.prepare('UPDATE purchase_orders SET client_id = ? WHERE client_id = ?').run(primaryClientId, dup.id);
        db.prepare('UPDATE delivery_receipts SET client_id = ? WHERE client_id = ?').run(primaryClientId, dup.id);
        db.prepare('UPDATE sales_invoices SET client_id = ? WHERE client_id = ?').run(primaryClientId, dup.id);
        db.prepare('UPDATE payments SET client_id = ? WHERE client_id = ?').run(primaryClientId, dup.id);
        db.prepare('UPDATE client_buffer_stock SET client_id = ? WHERE client_id = ?').run(primaryClientId, dup.id);
        try {
            db.prepare('UPDATE client_product_prices SET client_id = ? WHERE client_id = ?').run(primaryClientId, dup.id);
        } catch (_) {}
        db.prepare('DELETE FROM client_product_prices WHERE client_id = ?').run(dup.id);
        db.prepare('DELETE FROM clients WHERE id = ?').run(dup.id);
        console.log(`Merged and deleted duplicate client: ${dup.id} (${dup.contact_person} - ${dup.email})`);
    }

    // 3. Ensure primary user exists
    let primaryUser = db.prepare('SELECT * FROM users WHERE id = ?').get(primaryUserId);
    if (primaryUser) {
        db.prepare(`
            UPDATE users 
            SET client_id = ?, 
                role = 'VYUCEUTICAL_OPERATOR',
                is_active = 1,
                name = 'Angelica Tamano (Online Platform Operator)',
                email = 'online.operator@vyuceutical.com'
            WHERE id = ?
        `).run(primaryClientId, primaryUserId);
    }

    // 4. Find the other 2 online platform user accounts
    const duplicateUsers = db.prepare(`
        SELECT id, name, email, role, client_id 
        FROM users 
        WHERE id != ? 
          AND (
            LOWER(email) IN ('online@vyuceutical.com', 'angelica@opc.com')
            OR (client_id = ? AND LOWER(name) LIKE '%online%')
          )
    `).all(primaryUserId, primaryClientId);

    console.log(`Found ${duplicateUsers.length} duplicate user accounts to merge:`, duplicateUsers);

    for (const u of duplicateUsers) {
        // Reassign any foreign keys pointing to this user
        db.prepare('UPDATE purchase_orders SET created_by = ? WHERE created_by = ?').run(primaryUserId, u.id);
        try { db.prepare('UPDATE finished_product_requisitions SET requested_by = ? WHERE requested_by = ?').run(primaryUserId, u.id); } catch (_) {}
        try { db.prepare('UPDATE po_operator_notes SET user_id = ? WHERE user_id = ?').run(primaryUserId, u.id); } catch (_) {}
        try { db.prepare('UPDATE audit_logs SET user_id = ? WHERE user_id = ?').run(primaryUserId, u.id); } catch (_) {}
        db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
        console.log(`Merged and deleted user: ${u.email} (${u.id})`);
    }

    console.log('✅ Merge and deletion complete for:', dbPath);
}

// Run for both databases
const mainDb = path.join(__dirname, '../database/nkb.sqlite');
const testDb = 'C:/Users/Glen Nobleza/Documents/NKB projects/Local tester/NKB Client V2/database/nkb.sqlite';

mergeOnlinePlatforms(mainDb);
if (require('fs').existsSync(testDb)) {
    mergeOnlinePlatforms(testDb);
}

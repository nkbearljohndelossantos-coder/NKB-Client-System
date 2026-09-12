require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const dbDriver = (process.env.DB_DRIVER || '').toLowerCase();
const hasMysqlConfig = Boolean(
    process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME
);
const useMysql = dbDriver === 'mysql'
    || (dbDriver !== 'sqlite' && hasMysqlConfig && process.env.NODE_ENV === 'production');

async function setupSingleBatch() {
    console.log('🚀 Configuring Single Batch Transaction (BAT-2026-000001)...');
    console.log('Mode:', useMysql ? 'MySQL' : 'SQLite');

    if (useMysql) {
        const mysql = require('mysql2/promise');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });

        try {
            await connection.query('SET FOREIGN_KEY_CHECKS = 0');

            const tables = [
                'payments',
                'invoice_items',
                'sales_invoices',
                'returns',
                'dr_acceptances',
                'delivery_items',
                'delivery_receipts',
                'overrun_approvals',
                'batch_yields',
                'production_batches',
                'job_orders',
                'purchase_order_items',
                'purchase_orders',
                'client_buffer_stock',
                'inventory_movements',
                'audit_logs'
            ];

            for (const table of tables) {
                await connection.query(`DELETE FROM ${table}`);
            }
            console.log('   ✓ Cleared previous transactions');

            // Find client, product, and user IDs
            const [clients] = await connection.query("SELECT id, company_name FROM clients WHERE company_name LIKE '%SKEENCARE%' LIMIT 1");
            const clientId = clients[0] ? clients[0].id : (await connection.query("SELECT id FROM clients LIMIT 1"))[0][0].id;

            const [products] = await connection.query("SELECT id, name, sku FROM products WHERE name LIKE '%Sunscreen%' LIMIT 1");
            const productId = products[0] ? products[0].id : (await connection.query("SELECT id FROM products LIMIT 1"))[0][0].id;

            const [adminUsers] = await connection.query("SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') LIMIT 1");
            const adminId = adminUsers[0].id;

            const [prodUsers] = await connection.query("SELECT id FROM users WHERE role = 'PRODUCTION' LIMIT 1");
            const prodUserId = prodUsers[0] ? prodUsers[0].id : adminId;

            const [clientUsers] = await connection.query("SELECT id FROM users WHERE role = 'CLIENT' LIMIT 1");
            const clientUserId = clientUsers[0] ? clientUsers[0].id : adminId;

            const [whUsers] = await connection.query("SELECT id FROM users WHERE role = 'WAREHOUSE' LIMIT 1");
            const whUserId = whUsers[0] ? whUsers[0].id : adminId;

            const [acctUsers] = await connection.query("SELECT id FROM users WHERE role = 'ACCOUNTING' LIMIT 1");
            const acctUserId = acctUsers[0] ? acctUsers[0].id : adminId;

            // Generate UUIDs
            const poId = uuidv4();
            const joId = uuidv4();
            const batchId = uuidv4();
            const drId = uuidv4();
            const siId = uuidv4();
            const payId = uuidv4();

            const poNumber = 'PO-2026-000001';
            const joNumber = 'JO-2026-000001';
            const batchNumber = 'BAT-2026-000001';
            const drNumber = 'DR-2026-000001';
            const siNumber = 'SI-2026-000001';
            const payNumber = 'PAY-2026-000001';

            // Insert PO
            await connection.query(`
                INSERT INTO purchase_orders
                (id, po_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at, created_at, updated_at)
                VALUES (?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 15 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 10.0, 'ACTUAL_DELIVERY', 'COMPLETED', 'Original BAT-2026-000002 Sunscreen production run.', 90000.0, 0.0, 0.0, 90000.0, ?, ?, NOW(), NOW(), NOW())
            `, [poId, poNumber, clientId, clientUserId, adminId]);

            // Insert PO Item
            await connection.query(`
                INSERT INTO purchase_order_items
                (id, po_id, product_id, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
                VALUES (?, ?, ?, 500, 450, 550, 180.0, 90000.0)
            `, [uuidv4(), poId, productId]);

            // Insert JO
            await connection.query(`
                INSERT INTO job_orders
                (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, 500, DATE_SUB(CURDATE(), INTERVAL 14 DAY), DATE_SUB(CURDATE(), INTERVAL 11 DAY), 'Formulation Team Beta', 'COMPLETED', 'Sunscreen gel-cream production run.', ?, NOW(), NOW())
            `, [joId, joNumber, poId, productId, prodUserId]);

            // Insert Batch (BAT-2026-000001)
            await connection.query(`
                INSERT INTO production_batches
                (id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date, target_quantity, actual_yield, variance_quantity, variance_percent, status, compounding_operator, bottling_lead, qc_inspector, line_assignment, qc_notes, qc_passed_by, qc_passed_at, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'FORM-SGC-V1', DATE_SUB(CURDATE(), INTERVAL 12 DAY), DATE_ADD(CURDATE(), INTERVAL 2 YEAR), 500, 550, 50, 10.0, 'COMPLETED', 'Catindig, Renar A.', 'Alonzo, Merry Jean I.', 'Fabio, Marilou', 'Cleanroom Line 1 (Alpha)', 'Passed all micro and SPF stability tests.', ?, DATE_SUB(CURDATE(), INTERVAL 12 DAY), ?, NOW(), NOW())
            `, [batchId, batchNumber, joId, productId, prodUserId, prodUserId]);

            // Insert Batch Yield
            await connection.query(`
                INSERT INTO batch_yields
                (id, batch_id, recorded_at, target_quantity, actual_yield, variance_quantity, variance_percent, logged_by, notes)
                VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 12 DAY), 500, 550, 50, 10.0, ?, 'Production batch yielded 550 pcs (+50 overrun within 10% tolerance).')
            `, [uuidv4(), batchId, prodUserId]);

            // Insert DR
            await connection.query(`
                INSERT INTO delivery_receipts
                (id, dr_number, client_id, po_id, jo_id, delivery_date, driver_name, vehicle_plate, status, notes, dispatched_by, dispatched_at, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'Danilo Gomez', 'NKB-8899', 'INVOICED', 'Complete delivery of 550 pcs sunscreen.', ?, DATE_SUB(CURDATE(), INTERVAL 10 DAY), ?, NOW(), NOW())
            `, [drId, drNumber, clientId, poId, joId, whUserId, whUserId]);

            // Insert Delivery Item
            await connection.query(`
                INSERT INTO delivery_items
                (id, dr_id, product_id, batch_id, delivered_quantity, accepted_quantity, rejected_quantity, unit_price)
                VALUES (?, ?, ?, ?, 550, 550, 0, 180.0)
            `, [uuidv4(), drId, productId, batchId]);

            // Insert DR Acceptance
            await connection.query(`
                INSERT INTO dr_acceptances
                (id, dr_id, client_user_id, signer_name, signer_title, signature_data, signature_type, total_delivered_quantity, total_accepted_quantity, total_rejected_quantity, acceptance_notes, ip_address, user_agent, accepted_at)
                VALUES (?, ?, ?, 'Maria Santos', 'Purchasing Manager', 'Digitally Approved by Maria Santos', 'TYPED', 550, 550, 0, 'Received in excellent condition.', '127.0.0.1', 'Mozilla/5.0', DATE_SUB(CURDATE(), INTERVAL 10 DAY))
            `, [uuidv4(), drId, clientUserId]);

            // Insert Sales Invoice
            await connection.query(`
                INSERT INTO sales_invoices
                (id, invoice_number, client_id, dr_id, po_id, invoice_date, due_date, billing_policy, subtotal, tax_percent, tax_amount, discount_amount, total_amount, paid_amount, balance_due, status, notes, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 9 DAY), DATE_ADD(CURDATE(), INTERVAL 21 DAY), 'ACTUAL_DELIVERY', 99000.0, 0.0, 0.0, 0.0, 99000.0, 50000.0, 49000.0, 'PARTIALLY_PAID', 'Generated from DR-2026-000001 for BAT-2026-000001 (550 pcs)', ?, NOW(), NOW())
            `, [siId, siNumber, clientId, drId, poId, acctUserId]);

            // Insert Invoice Item
            await connection.query(`
                INSERT INTO invoice_items
                (id, invoice_id, product_id, batch_id, po_quantity, delivered_quantity, accepted_quantity, billable_quantity, unit_price, line_total, is_overrun, overrun_quantity)
                VALUES (?, ?, ?, ?, 500, 550, 550, 550, 180.0, 99000.0, 1, 50)
            `, [uuidv4(), siId, productId, batchId]);

            // Insert Payment
            await connection.query(`
                INSERT INTO payments
                (id, payment_number, invoice_id, client_id, payment_date, amount, payment_method, reference_number, notes, recorded_by, created_at)
                VALUES (?, ?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 50000.0, 'BANK_TRANSFER', 'BDO-REF-9928172', 'Partial 50% downpayment', ?, NOW())
            `, [payId, payNumber, siId, clientId, acctUserId]);

            // Reset Document Sequences so next begins at 2
            const year = new Date().getFullYear();
            await connection.query('DELETE FROM document_sequences');
            const docTypes = ['PO', 'JO', 'BAT', 'DR', 'SI', 'PAY'];
            for (const type of docTypes) {
                await connection.query(
                    'INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, 1)',
                    [type, year]
                );
            }
            console.log('   ✓ Set document sequences (PO, JO, BAT, DR, SI, PAY) to last_sequence = 1 (next is 000002)');
            console.log('✅ MySQL setup complete for BAT-2026-000001.');
        } finally {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            await connection.end();
        }
    } else {
        const db = require('./db');
        db.exec('PRAGMA foreign_keys = OFF;');

        const setupTx = db.transaction(() => {
            db.exec(`
                DELETE FROM payments;
                DELETE FROM invoice_items;
                DELETE FROM sales_invoices;
                DELETE FROM returns;
                DELETE FROM dr_acceptances;
                DELETE FROM delivery_items;
                DELETE FROM delivery_receipts;
                DELETE FROM overrun_approvals;
                DELETE FROM batch_yields;
                DELETE FROM production_batches;
                DELETE FROM job_orders;
                DELETE FROM purchase_order_items;
                DELETE FROM purchase_orders;
                DELETE FROM client_buffer_stock;
                DELETE FROM inventory_movements;
                DELETE FROM audit_logs;
            `);

            // Find client, product, users
            const client = db.prepare("SELECT id, company_name FROM clients WHERE company_name LIKE '%SKEENCARE%' LIMIT 1").get()
                || db.prepare("SELECT id FROM clients LIMIT 1").get();
            const clientId = client.id;

            const prod = db.prepare("SELECT id, name, sku FROM products WHERE name LIKE '%Sunscreen%' LIMIT 1").get()
                || db.prepare("SELECT id FROM products LIMIT 1").get();
            const productId = prod.id;

            const admin = db.prepare("SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') LIMIT 1").get();
            const adminId = admin.id;

            const prodUser = db.prepare("SELECT id FROM users WHERE role = 'PRODUCTION' LIMIT 1").get();
            const prodUserId = prodUser ? prodUser.id : adminId;

            const clientUser = db.prepare("SELECT id FROM users WHERE role = 'CLIENT' LIMIT 1").get();
            const clientUserId = clientUser ? clientUser.id : adminId;

            const whUser = db.prepare("SELECT id FROM users WHERE role = 'WAREHOUSE' LIMIT 1").get();
            const whUserId = whUser ? whUser.id : adminId;

            const acctUser = db.prepare("SELECT id FROM users WHERE role = 'ACCOUNTING' LIMIT 1").get();
            const acctUserId = acctUser ? acctUser.id : adminId;

            // Generate UUIDs
            const poId = uuidv4();
            const joId = uuidv4();
            const batchId = uuidv4();
            const drId = uuidv4();
            const siId = uuidv4();
            const payId = uuidv4();

            const poNumber = 'PO-2026-000001';
            const joNumber = 'JO-2026-000001';
            const batchNumber = 'BAT-2026-000001';
            const drNumber = 'DR-2026-000001';
            const siNumber = 'SI-2026-000001';
            const payNumber = 'PAY-2026-000001';

            // Insert PO
            db.prepare(`
                INSERT INTO purchase_orders
                (id, po_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at, created_at, updated_at)
                VALUES (?, ?, ?, date('now', '-15 days'), date('now', '-10 days'), 10.0, 'ACTUAL_DELIVERY', 'COMPLETED', 'Original BAT-2026-000002 Sunscreen production run.', 90000.0, 0.0, 0.0, 90000.0, ?, ?, datetime('now'), datetime('now'), datetime('now'))
            `).run(poId, poNumber, clientId, clientUserId, adminId);

            // Insert PO Item
            db.prepare(`
                INSERT INTO purchase_order_items
                (id, po_id, product_id, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
                VALUES (?, ?, ?, 500, 450, 550, 180.0, 90000.0)
            `).run(uuidv4(), poId, productId);

            // Insert JO
            db.prepare(`
                INSERT INTO job_orders
                (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, 500, date('now', '-14 days'), date('now', '-11 days'), 'Formulation Team Beta', 'COMPLETED', 'Sunscreen gel-cream production run.', ?, datetime('now'), datetime('now'))
            `).run(joId, joNumber, poId, productId, prodUserId);

            // Insert Batch
            db.prepare(`
                INSERT INTO production_batches
                (id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date, target_quantity, actual_yield, variance_quantity, variance_percent, status, compounding_operator, bottling_lead, qc_inspector, line_assignment, qc_notes, qc_passed_by, qc_passed_at, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'FORM-SGC-V1', date('now', '-12 days'), date('now', '+2 years'), 500, 550, 50, 10.0, 'COMPLETED', 'Catindig, Renar A.', 'Alonzo, Merry Jean I.', 'Fabio, Marilou', 'Cleanroom Line 1 (Alpha)', 'Passed all micro and SPF stability tests.', ?, datetime('now', '-12 days'), ?, datetime('now'), datetime('now'))
            `).run(batchId, batchNumber, joId, productId, prodUserId, prodUserId);

            // Insert Batch Yield
            db.prepare(`
                INSERT INTO batch_yields
                (id, batch_id, recorded_at, target_quantity, actual_yield, variance_quantity, variance_percent, logged_by, notes)
                VALUES (?, ?, datetime('now', '-12 days'), 500, 550, 50, 10.0, ?, 'Production batch yielded 550 pcs (+50 overrun within 10% tolerance).')
            `).run(uuidv4(), batchId, prodUserId);

            // Insert DR
            db.prepare(`
                INSERT INTO delivery_receipts
                (id, dr_number, client_id, po_id, jo_id, delivery_date, driver_name, vehicle_plate, status, notes, dispatched_by, dispatched_at, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, date('now', '-10 days'), 'Danilo Gomez', 'NKB-8899', 'INVOICED', 'Complete delivery of 550 pcs sunscreen.', ?, date('now', '-10 days'), ?, datetime('now'), datetime('now'))
            `).run(drId, drNumber, clientId, poId, joId, whUserId, whUserId);

            // Insert Delivery Item
            db.prepare(`
                INSERT INTO delivery_items
                (id, dr_id, product_id, batch_id, delivered_quantity, accepted_quantity, rejected_quantity, unit_price)
                VALUES (?, ?, ?, ?, 550, 550, 0, 180.0)
            `).run(uuidv4(), drId, productId, batchId);

            // Insert DR Acceptance
            db.prepare(`
                INSERT INTO dr_acceptances
                (id, dr_id, client_user_id, signer_name, signer_title, signature_data, signature_type, total_delivered_quantity, total_accepted_quantity, total_rejected_quantity, acceptance_notes, ip_address, user_agent, accepted_at)
                VALUES (?, ?, ?, 'Maria Santos', 'Purchasing Manager', 'Digitally Approved by Maria Santos', 'TYPED', 550, 550, 0, 'Received in excellent condition.', '127.0.0.1', 'Mozilla/5.0', datetime('now', '-10 days'))
            `).run(uuidv4(), drId, clientUserId);

            // Insert Sales Invoice
            db.prepare(`
                INSERT INTO sales_invoices
                (id, invoice_number, client_id, dr_id, po_id, invoice_date, due_date, billing_policy, subtotal, tax_percent, tax_amount, discount_amount, total_amount, paid_amount, balance_due, status, notes, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, date('now', '-9 days'), date('now', '+21 days'), 'ACTUAL_DELIVERY', 99000.0, 0.0, 0.0, 0.0, 99000.0, 50000.0, 49000.0, 'PARTIALLY_PAID', 'Generated from DR-2026-000001 for BAT-2026-000001 (550 pcs)', ?, datetime('now'), datetime('now'))
            `).run(siId, siNumber, clientId, drId, poId, acctUserId);

            // Insert Invoice Item
            db.prepare(`
                INSERT INTO invoice_items
                (id, invoice_id, product_id, batch_id, po_quantity, delivered_quantity, accepted_quantity, billable_quantity, unit_price, line_total, is_overrun, overrun_quantity)
                VALUES (?, ?, ?, ?, 500, 550, 550, 550, 180.0, 99000.0, 1, 50)
            `).run(uuidv4(), siId, productId, batchId);

            // Insert Payment
            db.prepare(`
                INSERT INTO payments
                (id, payment_number, invoice_id, client_id, payment_date, amount, payment_method, reference_number, notes, recorded_by, created_at)
                VALUES (?, ?, ?, ?, date('now', '-5 days'), 50000.0, 'BANK_TRANSFER', 'BDO-REF-9928172', 'Partial 50% downpayment', ?, datetime('now'))
            `).run(payId, payNumber, siId, clientId, acctUserId);

            // Reset Document Sequences so next begins at 2
            const year = new Date().getFullYear();
            db.exec('DELETE FROM document_sequences;');
            const insertSeq = db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, 1)');
            const docTypes = ['PO', 'JO', 'BAT', 'DR', 'SI', 'PAY'];
            for (const type of docTypes) {
                insertSeq.run(type, year);
            }
        });

        try {
            setupTx();
            db.exec('PRAGMA foreign_keys = ON;');
            console.log('   ✓ Set document sequences (PO, JO, BAT, DR, SI, PAY) to last_sequence = 1 (next is 000002)');
            console.log('✅ SQLite setup complete for BAT-2026-000001.');
        } catch (err) {
            db.exec('PRAGMA foreign_keys = ON;');
            console.error('❌ Error configuring SQLite:', err);
            throw err;
        }
    }
}

if (require.main === module) {
    setupSingleBatch().then(() => {
        console.log('Done.');
        process.exit(0);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { setupSingleBatch };

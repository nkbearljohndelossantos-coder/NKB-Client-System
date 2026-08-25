const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

function seedDatabase() {
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ Refusing to seed demo data in production. Use npm run wipe:mysql for a clean database.');
        process.exit(1);
    }

    console.log('🌱 Starting Database Seeding (development only)...');

    const salt = bcrypt.genSaltSync(10);
    const adminPasswordHash = bcrypt.hashSync('Admin123!', salt);
    const clientPasswordHash = bcrypt.hashSync('Client123!', salt);
    const staffPasswordHash = bcrypt.hashSync('Staff123!', salt);

    // Disable FKs before transaction
    db.exec('PRAGMA foreign_keys = OFF;');

    const seedTx = db.transaction(() => {
        // Clear existing demo data in strict child-to-parent order
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
            DELETE FROM client_product_prices;
            DELETE FROM users;
            DELETE FROM clients;
            DELETE FROM products;
            DELETE FROM document_sequences;
        `);

        // 1. Insert Document Sequences
        const year = new Date().getFullYear();
        const insertSeq = db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, ?)');
        insertSeq.run('PO', year, 2);
        insertSeq.run('JO', year, 2);
        insertSeq.run('BAT', year, 2);
        insertSeq.run('DR', year, 2);
        insertSeq.run('SI', year, 1);
        insertSeq.run('PAY', year, 1);

        // 2. Insert Clients
        const clientId = uuidv4();
        const client2Id = uuidv4();

        db.prepare(`
            INSERT INTO clients (id, company_name, contact_person, email, phone, address, tin, default_billing_policy, default_tolerance_percent, credit_limit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            clientId,
            'ABC Cosmetics Trading',
            'Maria Santos',
            'client@example.com',
            '+63 917 123 4567',
            'Unit 802, Prestige Tower, F. Ortigas Jr. Rd, Ortigas Center, Pasig City, Metro Manila',
            '123-456-789-000',
            'ACTUAL_DELIVERY',
            10.0,
            500000.0
        );

        db.prepare(`
            INSERT INTO clients (id, company_name, contact_person, email, phone, address, tin, default_billing_policy, default_tolerance_percent, credit_limit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            client2Id,
            'Glow Essence Beauty Corp.',
            'John Michael Reyes',
            'glow@example.com',
            '+63 918 987 6543',
            'Building 4, Subic Bay Industrial Park, Olongapo, Zambales',
            '987-654-321-000',
            'FIXED_PO_BUFFER',
            10.0,
            750000.0
        );

        // 3. Insert Users
        const adminId = uuidv4();
        const clientUserId = uuidv4();
        const client2UserId = uuidv4();
        const prodUserId = uuidv4();
        const whUserId = uuidv4();
        const acctUserId = uuidv4();

        const insertUser = db.prepare(`
            INSERT INTO users (id, name, email, password_hash, role, client_id, phone)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertUser.run(adminId, 'Executive Admin', 'admin@nkbmanufacturing.com', adminPasswordHash, 'SUPER_ADMIN', null, '+63 917 000 0001');
        insertUser.run(prodUserId, 'Production Supervisor', 'production@nkbmanufacturing.com', staffPasswordHash, 'PRODUCTION', null, '+63 917 000 0002');
        insertUser.run(whUserId, 'Warehouse Officer', 'warehouse@nkbmanufacturing.com', staffPasswordHash, 'WAREHOUSE', null, '+63 917 000 0003');
        insertUser.run(acctUserId, 'Senior Accountant', 'accounting@nkbmanufacturing.com', staffPasswordHash, 'ACCOUNTING', null, '+63 917 000 0004');
        insertUser.run(clientUserId, 'Maria Santos (ABC Cosmetics)', 'client@example.com', clientPasswordHash, 'CLIENT', clientId, '+63 917 123 4567');
        insertUser.run(client2UserId, 'John Michael Reyes (Glow Essence)', 'glow@example.com', clientPasswordHash, 'CLIENT', client2Id, '+63 918 987 6543');

        // 4. Insert Products
        const prodLotionId = uuidv4();
        const prodSunscreenId = uuidv4();
        const prodSerumId = uuidv4();
        const prodSoapId = uuidv4();

        const insertProd = db.prepare(`
            INSERT INTO products (id, sku, name, category, description, unit, default_price, formula_code, shelf_life_months, current_stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertProd.run(prodLotionId, 'KLC-250', 'Kojic Lotion 250ml', 'Body Care', 'Intensive whitening lotion formulated with active Kojic Acid and Vitamin C.', 'pcs', 120.0, 'FORM-KLC-V2', 24, 1500);
        insertProd.run(prodSunscreenId, 'SGC-050', 'Sunscreen Gel-Cream 50g', 'Sun Care', 'Broad Spectrum SPF 50+ PA++++ with lightweight, zero white-cast gel formulation.', 'pcs', 180.0, 'FORM-SGC-V1', 24, 800);
        insertProd.run(prodSerumId, 'NCS-030', 'Niacinamide Serum 30ml', 'Face Care', '10% Niacinamide + 1% Zinc PCA Pore Refining & Brightening Facial Serum.', 'pcs', 250.0, 'FORM-NCS-V3', 18, 500);
        insertProd.run(prodSoapId, 'GPW-135', 'Gluta-Papaya Whitening Soap 135g', 'Bath & Body', 'Dual whitening formulation with Glutathione and active Papaya enzymes.', 'pcs', 45.0, 'FORM-GPW-V1', 36, 2000);

        // 4.1. Insert Client-Specific Custom Product Assignments & Pricing
        const insertPricing = db.prepare(`
            INSERT INTO client_product_prices (id, client_id, product_id, custom_name, custom_price, custom_sku, custom_formula_code, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        // ABC Cosmetics: Kojic Lotion @ ₱120, Serum @ ₱230, Soap @ ₱40
        insertPricing.run(uuidv4(), clientId, prodLotionId, 'ABC Intensive Whitening Lotion 250ml', 120.0, 'ABC-KL250', 'FORM-KLC-V2', 1);
        insertPricing.run(uuidv4(), clientId, prodSerumId, 'ABC 10% Niacinamide Pore Serum', 230.0, 'ABC-SER30', 'FORM-NCS-V3', 1);
        insertPricing.run(uuidv4(), clientId, prodSoapId, 'ABC Gluta-Papaya Bar Soap 135g', 40.0, 'ABC-SOAP135', 'FORM-GPW-V1', 1);

        // Glow Essence: Sunscreen @ ₱165, Lotion @ ₱120
        insertPricing.run(uuidv4(), client2Id, prodSunscreenId, 'Glow Essence UV Gel-Cream SPF 50+', 165.0, 'GLOW-SUN50', 'FORM-SGC-V1', 1);
        insertPricing.run(uuidv4(), client2Id, prodLotionId, 'Glow Essence Body Milk Lotion', 120.0, 'GLOW-LOT250', 'FORM-KLC-V2', 1);

        // 5. Insert Demo PO #1 (Active Demo: 1,000 pcs Kojic Lotion -> 1,100 pcs Yield -> 1,100 pcs DR Pending Acceptance)
        const po1Id = uuidv4();
        const po1Number = 'PO-2026-000001';

        db.prepare(`
            INSERT INTO purchase_orders 
            (id, po_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at)
            VALUES (?, ?, ?, date('now', '-3 days'), date('now', '+7 days'), 10.0, 'ACTUAL_DELIVERY', 'IN_PRODUCTION', 'Rush production for summer campaign launch.', 120000.0, 0.0, 0.0, 120000.0, ?, ?, datetime('now', '-3 days'))
        `).run(po1Id, po1Number, clientId, clientUserId, adminId);

        db.prepare(`
            INSERT INTO purchase_order_items
            (id, po_id, product_id, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
            VALUES (?, ?, ?, 1000, 900, 1100, 120.0, 120000.0)
        `).run(uuidv4(), po1Id, prodLotionId);

        // 6. Job Order for PO #1
        const jo1Id = uuidv4();
        const jo1Number = 'JO-2026-000001';
        db.prepare(`
            INSERT INTO job_orders
            (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by)
            VALUES (?, ?, ?, ?, 1000, date('now', '-2 days'), date('now'), 'Formulation Team Alpha', 'IN_PRODUCTION', 'Batch mix tank #2', ?)
        `).run(jo1Id, jo1Number, po1Id, prodLotionId, prodUserId);

        // 7. Production Batch with Over-run (Target: 1,000, Actual: 1,100, Variance: +100 pcs / +10%)
        const batch1Id = uuidv4();
        const batch1Number = 'BAT-2026-000001';
        db.prepare(`
            INSERT INTO production_batches
            (id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date, target_quantity, actual_yield, variance_quantity, variance_percent, status, qc_notes, qc_passed_by, qc_passed_at, created_by)
            VALUES (?, ?, ?, ?, 'FORM-KLC-V2', date('now', '-1 day'), date('now', '+2 years'), 1000, 1100, 100, 10.0, 'APPROVED_FOR_DISPATCH', 'QC Passed: Viscosity, pH 5.5, and microbial testing cleared.', ?, datetime('now', '-1 day'), ?)
        `).run(batch1Id, batch1Number, jo1Id, prodLotionId, prodUserId, prodUserId);

        db.prepare(`
            INSERT INTO batch_yields
            (id, batch_id, recorded_at, target_quantity, actual_yield, variance_quantity, variance_percent, logged_by, notes)
            VALUES (?, ?, datetime('now', '-1 day'), 1000, 1100, 100, 10.0, ?, 'Production batch yielded 1,100 pcs (+100 overrun within tolerance).')
        `).run(uuidv4(), batch1Id, prodUserId);

        // 8. Delivery Receipt (DR) for 1,100 pcs pending client acceptance
        const dr1Id = uuidv4();
        const dr1Number = 'DR-2026-000001';
        db.prepare(`
            INSERT INTO delivery_receipts
            (id, dr_number, client_id, po_id, jo_id, delivery_date, driver_name, vehicle_plate, status, notes, dispatched_by, dispatched_at, created_by)
            VALUES (?, ?, ?, ?, ?, date('now'), 'Danilo Gomez', 'NKB-8899', 'PENDING_CLIENT_ACCEPTANCE', 'Dispatched 1,100 bottles in 22 master boxes.', ?, datetime('now'), ?)
        `).run(dr1Id, dr1Number, clientId, po1Id, jo1Id, whUserId, whUserId);

        db.prepare(`
            INSERT INTO delivery_items
            (id, dr_id, product_id, batch_id, delivered_quantity, accepted_quantity, rejected_quantity, unit_price)
            VALUES (?, ?, ?, ?, 1100, 0, 0, 120.0)
        `).run(uuidv4(), dr1Id, prodLotionId, batch1Id);

        // 9. Historical Demo Order (Completed & Invoiced: Sunscreen 500 pcs -> Actual 550 pcs -> Invoiced ₱99,000, Paid ₱50,000)
        const po2Id = uuidv4();
        const po2Number = 'PO-2026-000002';
        db.prepare(`
            INSERT INTO purchase_orders
            (id, po_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at)
            VALUES (?, ?, ?, date('now', '-15 days'), date('now', '-10 days'), 10.0, 'ACTUAL_DELIVERY', 'COMPLETED', 'Previous delivered order.', 90000.0, 0.0, 0.0, 90000.0, ?, ?, datetime('now', '-15 days'))
        `).run(po2Id, po2Number, clientId, clientUserId, adminId);

        db.prepare(`
            INSERT INTO purchase_order_items
            (id, po_id, product_id, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
            VALUES (?, ?, ?, 500, 450, 550, 180.0, 90000.0)
        `).run(uuidv4(), po2Id, prodSunscreenId);

        const jo2Id = uuidv4();
        const jo2Number = 'JO-2026-000002';
        db.prepare(`
            INSERT INTO job_orders
            (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by)
            VALUES (?, ?, ?, ?, 500, date('now', '-14 days'), date('now', '-11 days'), 'Formulation Team Beta', 'COMPLETED', 'Completed', ?)
        `).run(jo2Id, jo2Number, po2Id, prodSunscreenId, prodUserId);

        const batch2Id = uuidv4();
        const batch2Number = 'BAT-2026-000002';
        db.prepare(`
            INSERT INTO production_batches
            (id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date, target_quantity, actual_yield, variance_quantity, variance_percent, status, qc_notes, qc_passed_by, qc_passed_at, created_by)
            VALUES (?, ?, ?, ?, 'FORM-SGC-V1', date('now', '-12 days'), date('now', '+2 years'), 500, 550, 50, 10.0, 'COMPLETED', 'Passed all micro and SPF stability tests.', ?, datetime('now', '-12 days'), ?)
        `).run(batch2Id, batch2Number, jo2Id, prodSunscreenId, prodUserId, prodUserId);

        const dr2Id = uuidv4();
        const dr2Number = 'DR-2026-000002';
        db.prepare(`
            INSERT INTO delivery_receipts
            (id, dr_number, client_id, po_id, jo_id, delivery_date, driver_name, vehicle_plate, status, notes, dispatched_by, dispatched_at, created_by)
            VALUES (?, ?, ?, ?, ?, date('now', '-10 days'), 'Danilo Gomez', 'NKB-8899', 'INVOICED', 'Complete delivery.', ?, datetime('now', '-10 days'), ?)
        `).run(dr2Id, dr2Number, clientId, po2Id, jo2Id, whUserId, whUserId);

        db.prepare(`
            INSERT INTO delivery_items
            (id, dr_id, product_id, batch_id, delivered_quantity, accepted_quantity, rejected_quantity, unit_price)
            VALUES (?, ?, ?, ?, 550, 550, 0, 180.0)
        `).run(uuidv4(), dr2Id, prodSunscreenId, batch2Id);

        db.prepare(`
            INSERT INTO dr_acceptances
            (id, dr_id, client_user_id, signer_name, signer_title, signature_data, signature_type, total_delivered_quantity, total_accepted_quantity, total_rejected_quantity, acceptance_notes, ip_address, user_agent)
            VALUES (?, ?, ?, 'Maria Santos', 'Purchasing Manager', 'Digitally Approved by Maria Santos', 'TYPED', 550, 550, 0, 'Received in excellent condition.', '127.0.0.1', 'Mozilla/5.0')
        `).run(uuidv4(), dr2Id, clientUserId);

        // Sales Invoice #1 for DR-2026-000002 (550 pcs x ₱180 = ₱99,000)
        const si1Id = uuidv4();
        const si1Number = 'SI-2026-000001';
        db.prepare(`
            INSERT INTO sales_invoices
            (id, invoice_number, client_id, dr_id, po_id, invoice_date, due_date, billing_policy, subtotal, tax_percent, tax_amount, discount_amount, total_amount, paid_amount, balance_due, status, notes, created_by)
            VALUES (?, ?, ?, ?, ?, date('now', '-9 days'), date('now', '+21 days'), 'ACTUAL_DELIVERY', 99000.0, 0.0, 0.0, 0.0, 99000.0, 50000.0, 49000.0, 'PARTIALLY_PAID', 'Generated from DR-2026-000002 (PO: PO-2026-000002)', ?)
        `).run(si1Id, si1Number, clientId, dr2Id, po2Id, acctUserId);

        db.prepare(`
            INSERT INTO invoice_items
            (id, invoice_id, product_id, batch_id, po_quantity, delivered_quantity, accepted_quantity, billable_quantity, unit_price, line_total, is_overrun, overrun_quantity)
            VALUES (?, ?, ?, ?, 500, 550, 550, 550, 180.0, 99000.0, 1, 50)
        `).run(uuidv4(), si1Id, prodSunscreenId, batch2Id);

        // Payment for Invoice #1
        const pay1Id = uuidv4();
        const pay1Number = 'PAY-2026-000001';
        db.prepare(`
            INSERT INTO payments
            (id, payment_number, invoice_id, client_id, payment_date, amount, payment_method, reference_number, notes, recorded_by)
            VALUES (?, ?, ?, ?, date('now', '-5 days'), 50000.0, 'BANK_TRANSFER', 'BDO-REF-9928172', 'Partial 50% downpayment', ?)
        `).run(pay1Id, pay1Number, si1Id, clientId, acctUserId);

        // 10. Demo Buffer Stock for Client #2 (Glow Essence)
        const buffer1Id = uuidv4();
        db.prepare(`
            INSERT INTO client_buffer_stock
            (id, client_id, product_id, source_batch_id, source_po_id, initial_quantity, quantity_released, quantity_remaining, date_reserved, expiry_date, status, notes)
            VALUES (?, ?, ?, ?, ?, 100, 0, 100, date('now', '-8 days'), date('now', '+2 years'), 'AVAILABLE', '100 pcs buffer reserved from previous Fixed PO batch.')
        `).run(buffer1Id, client2Id, prodSerumId, batch2Id, po2Id);

        console.log('✅ Seed transaction completed successfully.');
    });

    seedTx();
    db.exec('PRAGMA foreign_keys = ON;');
    console.log('🎉 Database seeding finished!');
    console.log('-------------------------------------------------------');
    console.log('Demo Credentials:');
    console.log('  Admin User:   admin@nkbmanufacturing.com / Admin123!');
    console.log('  Client User:  client@example.com / Client123!');
    console.log('-------------------------------------------------------');
}

if (require.main === module) {
    seedDatabase();
}

module.exports = seedDatabase;

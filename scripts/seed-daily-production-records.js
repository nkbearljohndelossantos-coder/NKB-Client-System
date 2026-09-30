/**
 * Seed Authentic Factory Daily Production Batch Records
 * Source: Operational Production Sheets for SKEEN CARE & HER CHOICE
 */

const { v4: uuidv4 } = require('uuid');

function seedDailyProductionRecords(db) {
    if (!db) throw new Error('Database instance is required.');
    const { getNextDocumentNumber } = require('../services/documentNumberService');

    // Find or Auto-provision Clients
    let skeencare = db.prepare("SELECT * FROM clients WHERE company_name LIKE '%SKEEN%' LIMIT 1").get();
    if (!skeencare) {
        const scId = '2fdb72bb-12fa-4909-8967-c19b130db4bb';
        db.prepare(`
            INSERT OR IGNORE INTO clients (id, company_name, contact_person, email, phone, address, tin, default_billing_policy, default_tolerance_percent, credit_limit, is_active)
            VALUES (?, 'SKEENCARE Enterprise', 'Earl John Delos Santos', 'skeencare@nkbmanufacturing.com', '0917-123-4567', 'Cavite, Philippines', '123-456-789-000', 'ACTUAL_DELIVERY', 10.0, 1000000.0, 1)
        `).run(scId);
        skeencare = db.prepare("SELECT * FROM clients WHERE id = ?").get(scId);
    }

    let herChoice = db.prepare("SELECT * FROM clients WHERE company_name LIKE '%Her Choice%' LIMIT 1").get();
    if (!herChoice) {
        const hcId = 'c0000000-0000-0000-0000-000000000003';
        db.prepare(`
            INSERT OR IGNORE INTO clients (id, company_name, contact_person, email, phone, address, tin, default_billing_policy, default_tolerance_percent, credit_limit, is_active)
            VALUES (?, 'Her Choice PH', 'Rhea Anicoche-Tan', 'herchoice@nkbmanufacturing.com', '0918-987-6543', 'Quezon City, Philippines', '987-654-321-000', 'ACTUAL_DELIVERY', 10.0, 1000000.0, 1)
        `).run(hcId);
        herChoice = db.prepare("SELECT * FROM clients WHERE id = ?").get(hcId);
    }

    const adminUser = db.prepare("SELECT * FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') LIMIT 1").get();

    if (!skeencare || !herChoice || !adminUser) {
        console.warn('⚠️ Cannot seed daily production records: missing clients or admin user.');
        return { success: false, message: 'Missing clients or admin' };
    }

    const adminId = adminUser.id;

    // Check if records already seeded
    const existingRef = db.prepare("SELECT id FROM purchase_orders WHERE notes LIKE '%0004%' OR notes LIKE '%HCI_063_2026%' LIMIT 1").get();
    if (existingRef) {
        return { success: true, alreadyExists: true, message: 'Daily production records already exist.' };
    }

    function ensureProduct(name, sku, unit, price) {
        let p = db.prepare("SELECT * FROM products WHERE name LIKE ? OR sku = ?").get(`%${name}%`, sku);
        if (!p) {
            const id = uuidv4();
            db.prepare(`
                INSERT OR IGNORE INTO products (id, sku, name, category, description, unit, default_price, shelf_life_months, is_active)
                VALUES (?, ?, ?, 'Cosmetics & Skincare', ?, ?, ?, 24, 1)
            `).run(id, sku, name, name, unit, price);
            p = db.prepare("SELECT * FROM products WHERE id = ? OR sku = ?").get(id, sku);
        }
        return p;
    }

    // Helper to calculate expiry date (24 months)
    function calcExpiry(dateStr) {
        const d = new Date(dateStr);
        d.setMonth(d.getMonth() + 24);
        return d.toISOString().split('T')[0];
    }

    const insertedOrders = [];
    const insertedBatches = [];

    const executeSeeding = () => {
        // -------------------------------------------------------------
        // ORDER 1: SKEEN CARE (PO Ref: 0004) - CLOSED P.O.
        // -------------------------------------------------------------
        const peelingProduct = ensureProduct('PEELING LOTION', 'SKC-2026002', 'kg', 150.00);

        const po1Id = uuidv4();
        const po1Number = getNextDocumentNumber('PO', db);
        const so1Number = po1Number.replace('PO-', 'SO-');
        const po1Total = 3000 * (peelingProduct.default_price || 150.00);

        db.prepare(`
            INSERT INTO purchase_orders (
                id, po_number, so_number, client_id, po_date, expected_delivery_date,
                tolerance_percent, billing_policy, status, notes, form_of_payment,
                subtotal, tax_percent, tax_amount, grand_total,
                accounting_confirmed, accounting_confirmed_at, accounting_confirmed_by,
                inventory_confirmed, inventory_confirmed_at, inventory_confirmed_by,
                raw_materials_status, formulation_converted, created_by, created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, '2026-09-09', '2026-09-28',
                10.0, 'ACTUAL_DELIVERY', 'COMPLETED', 'Client PO Ref: 0004. Daily batch production completed (3,000 KG total yield). Closed P.O.',
                'COD / Bank Transfer', ?, 0.0, 0.0, ?,
                1, '2026-09-09 10:00:00', ?,
                1, '2026-09-09 10:30:00', ?,
                'SUFFICIENT', 1, ?, '2026-09-28 09:30:00', '2026-09-26 18:00:00'
            )
        `).run(po1Id, po1Number, so1Number, skeencare.id, po1Total, po1Total, adminId, adminId, adminId);

        db.prepare(`
            INSERT INTO purchase_order_items (
                id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal, delivered_quantity, created_at
            ) VALUES (?, ?, ?, ?, 3000, 2700, 3300, ?, ?, 3000, '2026-09-09 09:30:00')
        `).run(uuidv4(), po1Id, peelingProduct.id, peelingProduct.name, peelingProduct.default_price || 150.00, po1Total);

        const jo1Id = uuidv4();
        const jo1Number = getNextDocumentNumber('JO', db);
        db.prepare(`
            INSERT INTO job_orders (
                id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 3000, '2026-09-24', '2026-09-26', 'Compounding & Cleanroom Team Alpha', 'COMPLETED', 'Daily multi-batch production runs completed.', ?, '2026-09-09 11:00:00', '2026-09-26 18:00:00')
        `).run(jo1Id, jo1Number, po1Id, peelingProduct.id, adminId);

        const skeencareBatches = [
            { date: '2026-09-24', qty: 600 },
            { date: '2026-09-25', qty: 840 },
            { date: '2026-09-26', qty: 1560 }
        ];

        for (const b of skeencareBatches) {
            const batchId = uuidv4();
            const batchNumber = getNextDocumentNumber('BAT', db);
            db.prepare(`
                INSERT INTO production_batches (
                    id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date,
                    target_quantity, actual_yield, variance_quantity, variance_percent, status,
                    compounding_operator, bottling_lead, qc_inspector, line_assignment,
                    qc_passed_by, qc_passed_at, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'FORM-SKC-PL', ?, ?, ?, ?, 0, 0.0, 'COMPLETED',
                    'Norvin Bella', 'Danilo Gomez', 'Jessica Santos', 'Cleanroom Line 1 (Alpha)',
                    ?, ? || ' 17:00:00', ?, ? || ' 08:00:00', ? || ' 17:30:00')
            `).run(batchId, batchNumber, jo1Id, peelingProduct.id, b.date, calcExpiry(b.date), b.qty, b.qty, adminId, b.date, adminId, b.date, b.date);
            insertedBatches.push(batchNumber);
        }

        insertedOrders.push(po1Number);

        // -------------------------------------------------------------
        // ORDER 2: HER CHOICE (PO Ref: HCI_063_2026) - IN_PRODUCTION
        // -------------------------------------------------------------
        const lotionProduct = ensureProduct('INSTANT WHITENING LOTION', 'HCI-IWL-01', 'PC', 180.00);
        const oilProduct = ensureProduct('SUNFLOWER BEAUTY OIL', 'HCI-SBO-01', 'PC', 120.00);
        const sunshieldProduct = ensureProduct('SUNSHIELD', 'HCI-SSH-01', 'PC', 160.00);

        const po2Id = uuidv4();
        const po2Number = getNextDocumentNumber('PO', db);
        const so2Number = po2Number.replace('PO-', 'SO-');

        const item1Subtotal = 30000 * (lotionProduct.default_price || 180.00);
        const item2Subtotal = 15000 * (oilProduct.default_price || 120.00);
        const item3Subtotal = 14000 * (sunshieldProduct.default_price || 160.00);
        const po2Total = item1Subtotal + item2Subtotal + item3Subtotal;

        db.prepare(`
            INSERT INTO purchase_orders (
                id, po_number, so_number, client_id, po_date, expected_delivery_date,
                tolerance_percent, billing_policy, status, notes, form_of_payment,
                subtotal, tax_percent, tax_amount, grand_total,
                accounting_confirmed, accounting_confirmed_at, accounting_confirmed_by,
                inventory_confirmed, inventory_confirmed_at, inventory_confirmed_by,
                raw_materials_status, formulation_converted, created_by, created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, '2026-09-14', '2026-10-05',
                10.0, 'ACTUAL_DELIVERY', 'IN_PRODUCTION', 'Client PO Ref: HCI_063_2026. Daily batch production tracking across 3 product lines.',
                'COD / Bank Transfer', ?, 0.0, 0.0, ?,
                1, '2026-09-14 10:00:00', ?,
                1, '2026-09-14 10:30:00', ?,
                'SUFFICIENT', 1, ?, '2026-09-28 09:45:00', '2026-09-26 18:00:00'
            )
        `).run(po2Id, po2Number, so2Number, herChoice.id, po2Total, po2Total, adminId, adminId, adminId);

        // Add 3 Items and 3 JOs
        const joLotionId = uuidv4();
        const joLotionNumber = getNextDocumentNumber('JO', db);
        db.prepare(`INSERT INTO purchase_order_items (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal, delivered_quantity, created_at) VALUES (?, ?, ?, ?, 30000, 27000, 33000, ?, ?, 22747, '2026-09-14 09:30:00')`)
            .run(uuidv4(), po2Id, lotionProduct.id, lotionProduct.name, lotionProduct.default_price || 180.00, item1Subtotal);
        db.prepare(`INSERT INTO job_orders (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 30000, '2026-09-17', '2026-09-30', 'Compounding & Bottling Alpha', 'IN_PRODUCTION', 'Daily multi-date batching underway', ?, '2026-09-14 11:00:00', '2026-09-26 18:00:00')`)
            .run(joLotionId, joLotionNumber, po2Id, lotionProduct.id, adminId);

        const joOilId = uuidv4();
        const joOilNumber = getNextDocumentNumber('JO', db);
        db.prepare(`INSERT INTO purchase_order_items (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal, delivered_quantity, created_at) VALUES (?, ?, ?, ?, 15000, 13500, 16500, ?, ?, 3780, '2026-09-14 09:30:00')`)
            .run(uuidv4(), po2Id, oilProduct.id, oilProduct.name, oilProduct.default_price || 120.00, item2Subtotal);
        db.prepare(`INSERT INTO job_orders (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 15000, '2026-09-21', '2026-10-02', 'Packaging Team Beta', 'IN_PRODUCTION', 'Daily multi-date batching underway', ?, '2026-09-14 11:00:00', '2026-09-26 18:00:00')`)
            .run(joOilId, joOilNumber, po2Id, oilProduct.id, adminId);

        const joSunshieldId = uuidv4();
        const joSunshieldNumber = getNextDocumentNumber('JO', db);
        db.prepare(`INSERT INTO purchase_order_items (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal, delivered_quantity, created_at) VALUES (?, ?, ?, ?, 14000, 12600, 15400, ?, ?, 3520, '2026-09-14 09:30:00')`)
            .run(uuidv4(), po2Id, sunshieldProduct.id, sunshieldProduct.name, sunshieldProduct.default_price || 160.00, item3Subtotal);
        db.prepare(`INSERT INTO job_orders (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 14000, '2026-09-25', '2026-10-05', 'High-Speed Bottling Line 3', 'IN_PRODUCTION', 'Daily multi-date batching underway', ?, '2026-09-14 11:00:00', '2026-09-26 18:00:00')`)
            .run(joSunshieldId, joSunshieldNumber, po2Id, sunshieldProduct.id, adminId);

        // Batches for Instant Whitening Lotion: 8 dates
        const lotionBatches = [
            { date: '2026-09-17', qty: 1032 },
            { date: '2026-09-19', qty: 2064 },
            { date: '2026-09-21', qty: 1548 },
            { date: '2026-09-22', qty: 3311 },
            { date: '2026-09-23', qty: 2451 },
            { date: '2026-09-24', qty: 1935 },
            { date: '2026-09-25', qty: 2924 },
            { date: '2026-09-26', qty: 7482 }
        ];
        for (const b of lotionBatches) {
            const batchId = uuidv4();
            const batchNumber = getNextDocumentNumber('BAT', db);
            db.prepare(`
                INSERT INTO production_batches (
                    id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date,
                    target_quantity, actual_yield, variance_quantity, variance_percent, status,
                    compounding_operator, bottling_lead, qc_inspector, line_assignment,
                    qc_passed_by, qc_passed_at, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'CP-0581', ?, ?, ?, ?, 0, 0.0, 'APPROVED_FOR_DISPATCH',
                    'Maria Santos', 'Danilo Gomez', 'Jessica Santos', 'Cleanroom Line 1 (Alpha)',
                    ?, ? || ' 17:00:00', ?, ? || ' 08:00:00', ? || ' 17:30:00')
            `).run(batchId, batchNumber, joLotionId, lotionProduct.id, b.date, calcExpiry(b.date), b.qty, b.qty, adminId, b.date, adminId, b.date, b.date);
            insertedBatches.push(batchNumber);
        }

        // Batches for Sunflower Beauty Oil: 3 dates
        const oilBatches = [
            { date: '2026-09-21', qty: 1440 },
            { date: '2026-09-23', qty: 1260 },
            { date: '2026-09-26', qty: 1080 }
        ];
        for (const b of oilBatches) {
            const batchId = uuidv4();
            const batchNumber = getNextDocumentNumber('BAT', db);
            db.prepare(`
                INSERT INTO production_batches (
                    id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date,
                    target_quantity, actual_yield, variance_quantity, variance_percent, status,
                    compounding_operator, bottling_lead, qc_inspector, line_assignment,
                    qc_passed_by, qc_passed_at, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'FORM-HCSB', ?, ?, ?, ?, 0, 0.0, 'APPROVED_FOR_DISPATCH',
                    'Norvin Bella', 'Danilo Gomez', 'Jessica Santos', 'Packaging Team Beta',
                    ?, ? || ' 17:00:00', ?, ? || ' 08:00:00', ? || ' 17:30:00')
            `).run(batchId, batchNumber, joOilId, oilProduct.id, b.date, calcExpiry(b.date), b.qty, b.qty, adminId, b.date, adminId, b.date, b.date);
            insertedBatches.push(batchNumber);
        }

        // Batches for Sunshield: 2 dates
        const sunshieldBatches = [
            { date: '2026-09-25', qty: 2240 },
            { date: '2026-09-26', qty: 1280 }
        ];
        for (const b of sunshieldBatches) {
            const batchId = uuidv4();
            const batchNumber = getNextDocumentNumber('BAT', db);
            db.prepare(`
                INSERT INTO production_batches (
                    id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date,
                    target_quantity, actual_yield, variance_quantity, variance_percent, status,
                    compounding_operator, bottling_lead, qc_inspector, line_assignment,
                    qc_passed_by, qc_passed_at, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'FORM-HCPP', ?, ?, ?, ?, 0, 0.0, 'APPROVED_FOR_DISPATCH',
                    'Maria Santos', 'Danilo Gomez', 'Jessica Santos', 'High-Speed Bottling Line 3',
                    ?, ? || ' 17:00:00', ?, ? || ' 08:00:00', ? || ' 17:30:00')
            `).run(batchId, batchNumber, joSunshieldId, sunshieldProduct.id, b.date, calcExpiry(b.date), b.qty, b.qty, adminId, b.date, adminId, b.date, b.date);
            insertedBatches.push(batchNumber);
        }

        insertedOrders.push(po2Number);

        // -------------------------------------------------------------
        // ORDER 3: HER CHOICE (PO Ref: HCI_065_2026) - IN_PRODUCTION
        // -------------------------------------------------------------
        const soapProduct = ensureProduct('KOJIC PAPAYA SOAP', 'HCI-KPS-01', 'PC', 45.00);
        const pekasProduct = ensureProduct('PEKAS CREAM', 'HCI-PKC-01', 'PC', 110.00);
        const sunscreenProduct = ensureProduct('PREMIUM TINTED SUNSCREEN', 'HCI-PTS-01', 'PC', 160.00);

        const po3Id = uuidv4();
        const po3Number = getNextDocumentNumber('PO', db);
        const so3Number = po3Number.replace('PO-', 'SO-');

        const item31Subtotal = 5000 * (soapProduct.default_price || 45.00);
        const item32Subtotal = 2000 * (pekasProduct.default_price || 110.00);
        const item33Subtotal = 5000 * (sunscreenProduct.default_price || 160.00);
        const po3Total = item31Subtotal + item32Subtotal + item33Subtotal;

        db.prepare(`
            INSERT INTO purchase_orders (
                id, po_number, so_number, client_id, po_date, expected_delivery_date,
                tolerance_percent, billing_policy, status, notes, form_of_payment,
                subtotal, tax_percent, tax_amount, grand_total,
                accounting_confirmed, accounting_confirmed_at, accounting_confirmed_by,
                inventory_confirmed, inventory_confirmed_at, inventory_confirmed_by,
                raw_materials_status, formulation_converted, created_by, created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, '2026-09-19', '2026-10-10',
                10.0, 'ACTUAL_DELIVERY', 'IN_PRODUCTION', 'Client PO Ref: HCI_065_2026. Daily batch production tracking across soap, cream, and sunscreen.',
                'COD / Bank Transfer', ?, 0.0, 0.0, ?,
                1, '2026-09-19 10:00:00', ?,
                1, '2026-09-19 10:30:00', ?,
                'SUFFICIENT', 1, ?, '2026-09-28 10:00:00', '2026-09-26 18:00:00'
            )
        `).run(po3Id, po3Number, so3Number, herChoice.id, po3Total, po3Total, adminId, adminId, adminId);

        // JOs
        const joSoapId = uuidv4();
        const joSoapNumber = getNextDocumentNumber('JO', db);
        db.prepare(`INSERT INTO purchase_order_items (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal, delivered_quantity, created_at) VALUES (?, ?, ?, ?, 5000, 4500, 5500, ?, ?, 5280, '2026-09-19 09:30:00')`)
            .run(uuidv4(), po3Id, soapProduct.id, soapProduct.name, soapProduct.default_price || 45.00, item31Subtotal);
        db.prepare(`INSERT INTO job_orders (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 5000, '2026-09-19', '2026-09-28', 'Soap Molding & Cutting Team', 'COMPLETED', 'Soap batches produced with allowable overrun', ?, '2026-09-19 11:00:00', '2026-09-26 18:00:00')`)
            .run(joSoapId, joSoapNumber, po3Id, soapProduct.id, adminId);

        const joPekasId = uuidv4();
        const joPekasNumber = getNextDocumentNumber('JO', db);
        db.prepare(`INSERT INTO purchase_order_items (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal, delivered_quantity, created_at) VALUES (?, ?, ?, ?, 2000, 1800, 2200, ?, ?, 0, '2026-09-19 09:30:00')`)
            .run(uuidv4(), po3Id, pekasProduct.id, pekasProduct.name, pekasProduct.default_price || 110.00, item32Subtotal);
        db.prepare(`INSERT INTO job_orders (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 2000, '2026-09-28', '2026-10-05', 'Cleanroom Line 2 (Beta)', 'PENDING', 'Pending batch production start', ?, '2026-09-19 11:00:00', '2026-09-26 18:00:00')`)
            .run(joPekasId, joPekasNumber, po3Id, pekasProduct.id, adminId);

        const joSunscreenId = uuidv4();
        const joSunscreenNumber = getNextDocumentNumber('JO', db);
        db.prepare(`INSERT INTO purchase_order_items (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal, delivered_quantity, created_at) VALUES (?, ?, ?, ?, 5000, 4500, 5500, ?, ?, 5021, '2026-09-19 09:30:00')`)
            .run(uuidv4(), po3Id, sunscreenProduct.id, sunscreenProduct.name, sunscreenProduct.default_price || 160.00, item33Subtotal);
        db.prepare(`INSERT INTO job_orders (id, jo_number, po_id, product_id, target_quantity, scheduled_start_date, scheduled_end_date, assigned_team, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 5000, '2026-09-23', '2026-09-28', 'High-Speed Bottling Line 3', 'COMPLETED', 'Sunscreen batches completed', ?, '2026-09-19 11:00:00', '2026-09-26 18:00:00')`)
            .run(joSunscreenId, joSunscreenNumber, po3Id, sunscreenProduct.id, adminId);

        // Batches for Kojic Papaya Soap: 2 dates
        const soapBatches = [
            { date: '2026-09-19', qty: 3120 },
            { date: '2026-09-25', qty: 2160 }
        ];
        for (const b of soapBatches) {
            const batchId = uuidv4();
            const batchNumber = getNextDocumentNumber('BAT', db);
            db.prepare(`
                INSERT INTO production_batches (
                    id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date,
                    target_quantity, actual_yield, variance_quantity, variance_percent, status,
                    compounding_operator, bottling_lead, qc_inspector, line_assignment,
                    qc_passed_by, qc_passed_at, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'FORM-HCPK', ?, ?, ?, ?, 0, 0.0, 'APPROVED_FOR_DISPATCH',
                    'Norvin Bella', 'Danilo Gomez', 'Jessica Santos', 'Soap Molding & Cutting Team',
                    ?, ? || ' 17:00:00', ?, ? || ' 08:00:00', ? || ' 17:30:00')
            `).run(batchId, batchNumber, joSoapId, soapProduct.id, b.date, calcExpiry(b.date), b.qty, b.qty, adminId, b.date, adminId, b.date, b.date);
            insertedBatches.push(batchNumber);
        }

        // Batches for Premium Tinted Sunscreen: 4 dates
        const sunscreenBatches = [
            { date: '2026-09-23', qty: 800 },
            { date: '2026-09-24', qty: 960 },
            { date: '2026-09-25', qty: 3040 },
            { date: '2026-09-26', qty: 221 }
        ];
        for (const b of sunscreenBatches) {
            const batchId = uuidv4();
            const batchNumber = getNextDocumentNumber('BAT', db);
            db.prepare(`
                INSERT INTO production_batches (
                    id, batch_number, jo_id, product_id, formula_code, production_date, expiry_date,
                    target_quantity, actual_yield, variance_quantity, variance_percent, status,
                    compounding_operator, bottling_lead, qc_inspector, line_assignment,
                    qc_passed_by, qc_passed_at, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'FORM-HCPP', ?, ?, ?, ?, 0, 0.0, 'APPROVED_FOR_DISPATCH',
                    'Maria Santos', 'Danilo Gomez', 'Jessica Santos', 'High-Speed Bottling Line 3',
                    ?, ? || ' 17:00:00', ?, ? || ' 08:00:00', ? || ' 17:30:00')
            `).run(batchId, batchNumber, joSunscreenId, sunscreenProduct.id, b.date, calcExpiry(b.date), b.qty, b.qty, adminId, b.date, adminId, b.date, b.date);
            insertedBatches.push(batchNumber);
        }

        insertedOrders.push(po3Number);
    };

    if (typeof db.transaction === 'function') {
        const tx = db.transaction(executeSeeding);
        tx();
    } else {
        executeSeeding();
    }

    console.log(`✅ Seeded ${insertedOrders.length} authentic factory orders with ${insertedBatches.length} daily production batches.`);
    return {
        success: true,
        orders: insertedOrders,
        batchesCount: insertedBatches.length,
        message: `Successfully seeded ${insertedOrders.length} orders and ${insertedBatches.length} production batches.`
    };
}

if (require.main === module) {
    const db = require('../database/db');
    const result = seedDailyProductionRecords(db);
    console.log('Result:', result);
}

module.exports = { seedDailyProductionRecords };

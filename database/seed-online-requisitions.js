/**
 * Seed script for Online Platform Inventory & Finished Product Requisitions
 * Imports data from FINISIHED PRODUCT REQUISITION FORM (14).xlsx
 */

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const excelPath = 'C:/Users/Glen Nobleza/Downloads/FINISIHED PRODUCT REQUISITION FORM (14).xlsx';

async function seedOnlineRequisitions() {
    console.log('📦 Starting Online Platforms & Finished Product Requisition Seeding...');

    if (!fs.existsSync(excelPath)) {
        console.warn('⚠️ Excel file not found at:', excelPath);
        return;
    }

    const XLSX = require('C:/Users/Glen Nobleza/Documents/NKB projects/Tiktok monitoring/node_modules/xlsx');
    const wb = XLSX.readFile(excelPath);

    const checkReq = db.prepare('SELECT id FROM finished_product_requisitions WHERE request_number = ?');
    const insertReq = db.prepare(`
        INSERT INTO finished_product_requisitions (
            id, request_number, document_code, revision_no, effective_date, request_date,
            category_type, department, requested_by, requested_by_name, designation,
            status, urgency, purpose, checked_by, issuance_prepared_by, issuance_verified_by,
            issuance_date, receiving_reviewed_by, receiving_verified_by, receiving_date,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertItem = db.prepare(`
        INSERT INTO finished_product_requisition_items (
            id, requisition_id, item_no, product_id, material_name, batch_lot_no,
            required_qty, qty_issued, remaining_stock, remaining_stock_notes, unit_of_measure,
            urgency, purpose_remarks, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let importedCount = 0;
    const inventoryMap = new Map(); // material_name -> { remainingStock, unit, platform }

    for (const sheetName of wb.SheetNames) {
        if (sheetName.toLowerCase().includes('sheet2')) continue;
        const ws = wb.Sheets[sheetName];
        if (!ws || !ws['!ref']) continue;

        const getVal = (cellCoord) => {
            const c = ws[cellCoord];
            return c ? c.v : '';
        };

        const docCode = getVal('C7') || getVal('B7') || sheetName;
        const revisionNo = getVal('C8') || getVal('B8') || '00';
        let effectiveDate = getVal('C9') || getVal('B9') || '';
        if (typeof effectiveDate === 'number') {
            effectiveDate = new Date(Math.round((effectiveDate - 25569) * 86400 * 1000)).toISOString().split('T')[0];
        }
        let requestNo = getVal('C13') || getVal('B13') || docCode;
        if (!requestNo || !String(requestNo).trim()) {
            requestNo = sheetName;
        }
        requestNo = String(requestNo).trim();

        let requestDate = getVal('C14') || getVal('B14') || effectiveDate || '2026-10-15';
        if (typeof requestDate === 'number') {
            requestDate = new Date(Math.round((requestDate - 25569) * 86400 * 1000)).toISOString().split('T')[0];
        }
        const department = getVal('C15') || getVal('B15') || 'TIKTOK';
        const requestedBy = getVal('C16') || getVal('B16') || 'ANGELICA TAMANO';
        const designation = getVal('C17') || getVal('B17') || 'OFFICER';

        // Check if already seeded
        const existing = checkReq.get(requestNo);
        if (existing) continue;

        const reqId = uuidv4();

        // Parse items starting at row 21 down to section 4
        const items = [];
        let r = 21;
        while (r <= 26) {
            const itemNo = getVal('A' + r);
            const matName = getVal('B' + r);
            const batchLot = getVal('D' + r) || getVal('C' + r);
            const qty = getVal('E' + r);
            const uom = getVal('F' + r);
            const urgency = getVal('G' + r);
            const remarks = getVal('H' + r);

            if (matName && typeof matName === 'string' && matName.trim()) {
                items.push({
                    itemNo: parseInt(itemNo, 10) || (items.length + 1),
                    materialName: matName.trim(),
                    batchLotNo: batchLot ? String(batchLot).trim() : '',
                    requiredQty: parseFloat(qty) || 0,
                    unitOfMeasure: uom ? String(uom).trim().toUpperCase() : 'PCS',
                    urgency: urgency ? String(urgency).trim().toUpperCase() : 'REGULAR',
                    purposeRemarks: remarks ? String(remarks).trim() : ''
                });
            }
            r++;
        }

        // Find Section 4: Issuance
        let issuanceStartRow = -1;
        for (let checkR = 24; checkR <= 32; checkR++) {
            const text = String(getVal('A' + checkR) || getVal('B' + checkR) || '');
            if (text.includes('SECTION 4') || text.includes('ISSUANCE')) {
                issuanceStartRow = checkR + 2;
                break;
            }
        }

        const issuance = [];
        if (issuanceStartRow > 0) {
            for (let ir = issuanceStartRow; ir < issuanceStartRow + items.length + 3; ir++) {
                const matName = getVal('B' + ir);
                const qtyIssued = getVal('E' + ir);
                const uom = getVal('F' + ir);
                const remaining = getVal('G' + ir);
                const remainingUom = getVal('H' + ir);
                if (matName && typeof matName === 'string' && matName.trim() && !matName.includes('Prepared by') && !matName.includes('SECTION')) {
                    issuance.push({
                        materialName: matName.trim(),
                        qtyIssued: parseFloat(qtyIssued) || 0,
                        unitOfMeasure: uom ? String(uom).trim().toUpperCase() : 'PCS',
                        remainingStock: parseFloat(remaining) || 0,
                        remainingStockNotes: (typeof remaining === 'string' ? remaining : '') + (remainingUom ? ' ' + remainingUom : '')
                    });
                }
            }
        }

        // Signatures from sheet
        let prepBy = 'MARK DALANON';
        let verBy = 'RODELLO LUY';
        let revBy = requestedBy;
        let recVerBy = 'SHARMAINE SANTOS';

        insertReq.run(
            reqId,
            requestNo,
            String(docCode).trim(),
            String(revisionNo).trim(),
            effectiveDate ? String(effectiveDate).trim() : null,
            String(requestDate).trim(),
            'FINISHED PRODUCT',
            String(department).trim(),
            'i0000000-0000-0000-0000-000000000001',
            String(requestedBy).trim(),
            String(designation).trim(),
            'RECEIVED',
            items.some(it => it.urgency.includes('RUSH')) ? 'RUSH' : 'REGULAR',
            items[0]?.purposeRemarks || 'ONLINE PLATFORM SALES',
            'RODELLO LUY',
            prepBy,
            verBy,
            String(requestDate).trim(),
            revBy,
            recVerBy,
            String(requestDate).trim(),
            new Date().toISOString().replace('T', ' ').substring(0, 19),
            new Date().toISOString().replace('T', ' ').substring(0, 19)
        );

        items.forEach((it, idx) => {
            const iss = issuance[idx] || {};
            const qtyIssued = iss.qtyIssued !== undefined ? iss.qtyIssued : it.requiredQty;
            const remaining = iss.remainingStock !== undefined ? iss.remainingStock : 0;
            const remNotes = iss.remainingStockNotes || '';

            insertItem.run(
                uuidv4(),
                reqId,
                it.itemNo,
                null,
                it.materialName,
                it.batchLotNo,
                it.requiredQty,
                qtyIssued,
                remaining,
                remNotes,
                it.unitOfMeasure,
                it.urgency,
                it.purposeRemarks,
                new Date().toISOString().replace('T', ' ').substring(0, 19)
            );

            // Record to inventory map for the most recent sheets (e.g. FPR 027 - FPR 031)
            inventoryMap.set(it.materialName, {
                productName: it.materialName,
                unit: it.unitOfMeasure || 'PCS',
                remaining: remaining,
                platform: String(department).trim() || 'TIKTOK'
            });
        });

        importedCount++;
    }

    console.log(`✅ Imported ${importedCount} Finished Product Requisitions from Excel.`);

    if (inventoryMap.size === 0) {
        const dbItems = db.prepare(`
            SELECT DISTINCT fpri.material_name, fpri.unit_of_measure, fpri.remaining_stock, fpr.department
            FROM finished_product_requisition_items fpri
            JOIN finished_product_requisitions fpr ON fpri.requisition_id = fpr.id
            ORDER BY fpr.request_number DESC
        `).all();
        for (const item of dbItems) {
            if (!inventoryMap.has(item.material_name)) {
                inventoryMap.set(item.material_name, {
                    productName: item.material_name,
                    unit: item.unit_of_measure || 'PCS',
                    remaining: item.remaining_stock || 0,
                    platform: item.department || 'TIKTOK'
                });
            }
        }
    }

    // Seed Online Platform Inventory
    const checkInv = db.prepare('SELECT id FROM online_platform_inventory WHERE product_name = ? AND platform = ?');
    const insertInv = db.prepare(`
        INSERT INTO online_platform_inventory (
            id, product_id, sku, product_name, platform, stock_quantity, reserved_quantity,
            unit, reorder_point, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    let invCount = 0;
    for (const [name, info] of inventoryMap.entries()) {
        const platform = info.platform || 'TIKTOK';
        const existing = checkInv.get(name, platform);
        if (!existing) {
            // Find matched SKU if in products table
            const allProducts = db.prepare('SELECT id, sku, name FROM products').all();
            const matchedProd = allProducts.find(p => 
                p.name.toLowerCase().includes(name.toLowerCase().slice(0, 10)) ||
                name.toLowerCase().includes(p.name.toLowerCase().slice(0, 10))
            );

            const sku = matchedProd ? matchedProd.sku : 'VYU-' + name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
            const stock = info.remaining >= 0 ? info.remaining : 100;
            const status = stock <= 0 ? 'OUT_OF_STOCK' : (stock <= 50 ? 'LOW_STOCK' : 'IN_STOCK');

            insertInv.run(
                uuidv4(),
                matchedProd ? matchedProd.id : null,
                sku,
                name,
                platform,
                stock,
                0,
                info.unit || 'PCS',
                50,
                status,
                'Official Vyuceutical product for online platform selling'
            );
            invCount++;
        }
    }

    console.log(`✅ Seeded ${invCount} Online Platform Inventory items.`);
}

seedOnlineRequisitions().catch(console.error);

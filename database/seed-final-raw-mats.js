const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function parseNumeric(val) {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (val === null || val === undefined) return 0;
    const str = String(val).replace(/,/g, '').trim();
    if (!str) return 0;
    const match = str.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
}

function computeStockStatus(currentStock, minLevel) {
    const stock = Number(currentStock) || 0;
    const min = Number(minLevel) || 0;
    if (stock <= 0) return 'OUT_OF_STOCK';
    if (stock <= min) return 'LOW_STOCK';
    return 'IN_STOCK';
}

function loadFinalRawMatsFromExcel() {
    const excelPath = path.resolve(__dirname, '../FINAL RAW MATS FOR RE-INVENTORY.xlsx');
    if (!fs.existsSync(excelPath)) {
        console.warn('⚠️ FINAL RAW MATS FOR RE-INVENTORY.xlsx not found at:', excelPath);
        return [];
    }

    const XLSX = require('../public/js/xlsx.full.min.js');
    const buf = fs.readFileSync(excelPath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    const items = [];
    const seenCodes = new Map();

    const getUniqueCode = (rawCode, fallbackPrefix) => {
        let base = String(rawCode || '').trim().toUpperCase();
        if (!base) base = `${fallbackPrefix}-${items.length + 1}`;
        const count = seenCodes.get(base) || 0;
        seenCodes.set(base, count + 1);
        return count === 0 ? base : `${base}-${count + 1}`;
    };

    // 1. PEELING LOTION section (Sheet: 'PEELING LOTION', rows from index 4)
    const plSheet = wb.Sheets['PEELING LOTION'];
    if (plSheet) {
        const plRows = XLSX.utils.sheet_to_json(plSheet, { header: 1, defval: '' });
        for (let i = 4; i < plRows.length; i++) {
            const row = plRows[i];
            const rawCode = String(row[0] || '').trim();
            const rawName = String(row[1] || '').trim();
            if (!rawCode && !rawName) continue;

            const code = getUniqueCode(rawCode, 'PL');
            const brand = String(row[2] || '').trim();
            const supplier = String(row[3] || '').trim();
            const storage = String(row[4] || 'Warehouse').trim() || 'Warehouse';
            const unitCost = Math.max(0, parseNumeric(row[5]));
            const usage2026 = Math.max(0, parseNumeric(row[11]));
            const rawStockCell = row[12];
            const rawStockStr = String(rawStockCell ?? '').trim();

            let unit = 'kg';
            let currentStock = 0;
            if (/box/i.test(rawStockStr)) {
                unit = 'boxes';
                currentStock = Math.max(0, parseNumeric(rawStockStr));
            } else {
                currentStock = Math.max(0, Number(parseNumeric(rawStockCell).toFixed(4)));
            }

            const minLevel = unit === 'boxes' ? 1 : 10;
            const status = computeStockStatus(currentStock, minLevel);
            const isFastMoving = usage2026 >= 500 ? 1 : 0;

            const notesParts = ['Section: PEELING LOTION'];
            if (brand) notesParts.push(`Brand: ${brand}`);
            if (usage2026 > 0) notesParts.push(`2026 Usage: ${usage2026} ${unit}`);

            items.push({
                material_code: code,
                material_name: rawName || code,
                category: 'Peeling Lotion',
                supplier: supplier || 'Standard Supplier',
                current_stock: currentStock,
                unit,
                minimum_stock_level: minLevel,
                unit_cost: unitCost,
                location: storage,
                batch_lot_number: brand || 'PEELING-LOTION',
                expiry_date: '',
                status,
                is_fast_moving: isFastMoving,
                notes: notesParts.join(' | ')
            });
        }
    }

    // 2. COSMETICS section (Sheet: 'COSMETICS ', rows from index 2)
    const cosSheet = wb.Sheets['COSMETICS '] || wb.Sheets['COSMETICS'];
    if (cosSheet) {
        const cosRows = XLSX.utils.sheet_to_json(cosSheet, { header: 1, defval: '' });
        for (let i = 2; i < cosRows.length; i++) {
            const row = cosRows[i];
            const rawCode = String(row[0] || '').trim();
            const rawName = String(row[1] || '').trim();
            if (!rawCode && !rawName) continue;

            const code = getUniqueCode(rawCode, 'COS');
            const brandOrExp = String(row[2] || '').trim();
            const supplier = String(row[3] || '').trim();
            const application = String(row[4] || '').trim();
            const sheetCat = String(row[5] || '').trim();
            const storage = String(row[6] || 'Warehouse').trim() || 'Warehouse';
            const unitCost = Math.max(0, parseNumeric(row[7]));
            const usage2026 = Math.max(0, parseNumeric(row[13]));
            const rawStockCell = row[14];
            const rawStockStr = String(rawStockCell ?? '').trim();

            let currentStock = 0;
            if (typeof rawStockCell === 'number' && !isNaN(rawStockCell)) {
                currentStock = Math.max(0, Number(rawStockCell.toFixed(4)));
            } else if (rawStockStr && !/sample/i.test(rawStockStr)) {
                currentStock = Math.max(0, Number(parseNumeric(rawStockStr).toFixed(4)));
            }

            const minLevel = 5;
            const status = computeStockStatus(currentStock, minLevel);
            const isFastMoving = usage2026 >= 50 ? 1 : 0;

            const notesParts = ['Section: COSMETICS'];
            if (application) notesParts.push(`Application: ${application}`);
            if (sheetCat && sheetCat !== 'COSMETICS') notesParts.push(`Type: ${sheetCat}`);
            if (brandOrExp) notesParts.push(`Brand/Note: ${brandOrExp}`);
            if (/sample/i.test(rawStockStr)) notesParts.push('Stock Note: SAMPLE');
            if (usage2026 > 0) notesParts.push(`2026 Usage: ${usage2026} kg`);

            items.push({
                material_code: code,
                material_name: rawName || code,
                category: 'Cosmetics',
                supplier: supplier || 'Standard Supplier',
                current_stock: currentStock,
                unit: 'kg',
                minimum_stock_level: minLevel,
                unit_cost: unitCost,
                location: storage,
                batch_lot_number: application || brandOrExp || 'COSMETICS',
                expiry_date: '',
                status,
                is_fast_moving: isFastMoving,
                notes: notesParts.join(' | ')
            });
        }
    }

    return items;
}

function seedFinalRawMaterialsInventory(dbInstance) {
    try {
        dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS _meta_migrations (
                key VARCHAR(100) PRIMARY KEY,
                applied_at VARCHAR(100)
            );
        `);
    } catch (_) {}

    const migrationKey = 'raw_materials_excel_peeling_cosmetics_v1';
    let alreadyApplied = false;
    try {
        const row = dbInstance.prepare('SELECT key FROM _meta_migrations WHERE key = ?').get(migrationKey);
        alreadyApplied = Boolean(row);
    } catch (_) {}

    // Also check if legacy demo codes (RM-WTR-01, RM-GLY-01) are still present or table is empty
    let hasLegacyDemo = false;
    let totalCount = 0;
    try {
        totalCount = dbInstance.prepare('SELECT COUNT(*) as count FROM raw_materials_inventory').get()?.count || 0;
        const legacyRow = dbInstance.prepare("SELECT id FROM raw_materials_inventory WHERE material_code IN ('RM-WTR-01', 'RM-GLY-01', 'RM-NIA-01', 'PK-BOT-100') LIMIT 1").get();
        hasLegacyDemo = Boolean(legacyRow);
    } catch (_) {}

    if (alreadyApplied && !hasLegacyDemo && totalCount > 0) {
        return { skipped: true, count: totalCount };
    }

    const items = loadFinalRawMatsFromExcel();
    if (!items || items.length === 0) {
        return { skipped: true, count: totalCount };
    }

    // Remove previously recorded inventory and replace with Peeling Lotion + Cosmetics sections from Excel
    dbInstance.prepare('DELETE FROM raw_materials_inventory').run();

    const insRm = dbInstance.prepare(`
        INSERT INTO raw_materials_inventory (
            id, material_code, material_name, category, supplier,
            current_stock, unit, minimum_stock_level, unit_cost,
            location, batch_lot_number, expiry_date, status,
            is_fast_moving, issuance_count, notes, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'FINAL RAW MATS EXCEL')
    `);

    for (const item of items) {
        insRm.run(
            uuidv4(),
            item.material_code,
            item.material_name,
            item.category,
            item.supplier,
            item.current_stock,
            item.unit,
            item.minimum_stock_level,
            item.unit_cost,
            item.location,
            item.batch_lot_number,
            item.expiry_date,
            item.status,
            item.is_fast_moving,
            item.notes
        );
    }

    try {
        dbInstance.prepare('INSERT OR REPLACE INTO _meta_migrations (key, applied_at) VALUES (?, ?)').run(
            migrationKey,
            new Date().toISOString()
        );
    } catch (_) {
        try {
            dbInstance.prepare('INSERT IGNORE INTO _meta_migrations (key, applied_at) VALUES (?, ?)').run(
                migrationKey,
                new Date().toISOString()
            );
        } catch (__) {}
    }

    console.log(`✅ Imported ${items.length} raw materials from FINAL RAW MATS FOR RE-INVENTORY.xlsx (Peeling Lotion & Cosmetics only).`);
    return { skipped: false, count: items.length };
}

module.exports = {
    loadFinalRawMatsFromExcel,
    seedFinalRawMaterialsInventory
};

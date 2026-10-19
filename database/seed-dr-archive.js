const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function seedDeliveryReceiptsArchive(dbInstance) {
    if (!dbInstance) return;

    const isMysql = Boolean(dbInstance.isMysql);
    const textType = isMysql ? 'TEXT' : 'TEXT';
    const intType = isMysql ? 'INT' : 'INTEGER';
    const realType = isMysql ? 'DECIMAL(14,2)' : 'REAL';

    try {
        dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS delivery_receipts_archive (
                id TEXT PRIMARY KEY,
                dr_number_int ${intType} DEFAULT 0,
                dr_number TEXT NOT NULL,
                sheet_name TEXT,
                po_number TEXT,
                so_number TEXT,
                delivery_date TEXT,
                bill_to TEXT,
                total_quantity ${realType} DEFAULT 0,
                note TEXT,
                prepared_by TEXT,
                qc_approved TEXT,
                delivered_by TEXT,
                received_by TEXT,
                line_items ${textType},
                status TEXT DEFAULT 'COMPLETED',
                source TEXT DEFAULT 'EXCEL_AUGUST_2026',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_dra_dr_num_int ON delivery_receipts_archive(dr_number_int DESC);
            CREATE INDEX IF NOT EXISTS idx_dra_date ON delivery_receipts_archive(delivery_date DESC);
            CREATE INDEX IF NOT EXISTS idx_dra_bill_to ON delivery_receipts_archive(bill_to);
        `);
    } catch (e) {
        console.warn('delivery_receipts_archive table check:', e.message);
    }

    const migrationKey = 'delivery_receipts_archive_august_2026_v1';
    let alreadyApplied = false;
    try {
        const row = dbInstance.prepare('SELECT key FROM _meta_migrations WHERE key = ?').get(migrationKey);
        alreadyApplied = Boolean(row);
    } catch (_) {}

    let currentCount = 0;
    try {
        currentCount = dbInstance.prepare('SELECT COUNT(*) as c FROM delivery_receipts_archive').get()?.c || 0;
    } catch (_) {}

    if (alreadyApplied && currentCount > 0) {
        return { count: currentCount, skipped: true };
    }

    const jsonPath = path.resolve(__dirname, 'parsed_delivery_receipts.json');
    if (!fs.existsSync(jsonPath)) {
        console.warn('⚠️ parsed_delivery_receipts.json not found at:', jsonPath);
        return { count: 0, skipped: true };
    }

    const records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(records) || records.length === 0) {
        return { count: 0, skipped: true };
    }

    dbInstance.prepare('DELETE FROM delivery_receipts_archive').run();

    const insertStmt = dbInstance.prepare(`
        INSERT INTO delivery_receipts_archive (
            id, dr_number_int, dr_number, sheet_name, po_number, so_number,
            delivery_date, bill_to, total_quantity, note,
            prepared_by, qc_approved, delivered_by, received_by,
            line_items, status, source, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, 'COMPLETED', 'EXCEL_AUGUST_2026', datetime('now', 'localtime'), datetime('now', 'localtime')
        )
    `);

    for (const r of records) {
        const id = r.id || uuidv4();
        const drInt = r.drNumberInt || 0;
        const drNum = r.drNo || `DR${drInt}`;
        const sheetName = r.sheetName || '';
        const poNum = r.poNo || '';
        let soNum = '';
        if (poNum.toUpperCase().startsWith('SO#') || poNum.toUpperCase().startsWith('SO-')) {
            soNum = poNum;
        } else if (drNum.includes('SO#')) {
            const m = drNum.match(/SO#\s*[\d\w-]+/i);
            if (m) soNum = m[0];
        }
        const delDate = r.date || '';
        const billTo = r.billTo || 'Client';
        const totalQty = Number(r.totalQty) || 0;
        const note = r.note || '';
        const prep = r.preparedBy || 'Ronaldo Prudencio';
        const qc = r.qcApproved || 'Quality Assurance';
        const driver = r.deliveredBy || "Driver's Name";
        const recv = r.receivedBy || 'Customer';
        const itemsJson = JSON.stringify(r.items || []);

        insertStmt.run(
            id, drInt, drNum, sheetName, poNum, soNum,
            delDate, billTo, totalQty, note,
            prep, qc, driver, recv,
            itemsJson
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

    console.log(`✅ Loaded ${records.length} delivery receipts into delivery_receipts_archive (DR457 to DR1).`);
    return { count: records.length, skipped: false };
}

module.exports = { seedDeliveryReceiptsArchive };

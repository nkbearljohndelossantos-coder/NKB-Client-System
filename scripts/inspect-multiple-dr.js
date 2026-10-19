const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../public/js/xlsx.full.min.js'));

const filePath = 'C:\\Users\\Glen Nobleza\\Documents\\Production\\DELIVERY RECEIPTS AS OF August 2026 Updated.xlsx';
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer' });

// Check sheets with names like DR457, DR01, DR1, DR100, DR304
const sampleSheets = ['DR01 CICA CREAM', 'DR100 IBB', 'DR200 KALUCA SOAP', 'DR300 KOJIC SOAP', 'DR450 CICA FOAM', 'DR457 Intimate Serum'];

for (const name of sampleSheets) {
    if (!wb.Sheets[name]) {
        const found = wb.SheetNames.find(s => s.startsWith(name.split(' ')[0]));
        if (found) {
            printSheet(found);
        }
    } else {
        printSheet(name);
    }
}

function printSheet(sheetName) {
    const s = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(s, { header: 1, defval: '' });
    console.log(`\n================== SHEET: ${sheetName} (Rows: ${rows.length}) ==================`);
    for (let i = 0; i < Math.min(35, rows.length); i++) {
        const r = rows[i];
        if (r.some(c => c !== '')) {
            console.log(`[R${i.toString().padStart(2, '0')}]`, JSON.stringify(r));
        }
    }
}

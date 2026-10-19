const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../public/js/xlsx.full.min.js'));

const filePath = 'C:\\Users\\Glen Nobleza\\Documents\\Production\\DELIVERY RECEIPTS AS OF August 2026 Updated.xlsx';

if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer' });

console.log('=== SHEETS ===');
console.log(wb.SheetNames);

for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    console.log(`\n================ Sheet: ${name} (Rows: ${rows.length}) ================`);
    for (let i = 0; i < Math.min(35, rows.length); i++) {
        const row = rows[i];
        if (row.some(c => c !== '')) {
            console.log(`Row ${i}:`, JSON.stringify(row));
        }
    }
}

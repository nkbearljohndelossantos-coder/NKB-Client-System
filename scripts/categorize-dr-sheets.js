const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../public/js/xlsx.full.min.js'));

const filePath = 'C:\\Users\\Glen Nobleza\\Documents\\Production\\DELIVERY RECEIPTS AS OF August 2026 Updated.xlsx';
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer' });

console.log('Total sheet count:', wb.SheetNames.length);

const summarySheets = [];
const drSheets = [];
const otherSheets = [];

for (const name of wb.SheetNames) {
    if (name.toLowerCase().includes('summary') || name.toLowerCase().includes('overall') || name.toLowerCase().includes('report') || name.toLowerCase().includes('monitoring') || name.toLowerCase().includes('dr summary') || name.toLowerCase().includes('dr list') || name.toLowerCase().includes('list')) {
        summarySheets.push(name);
    } else if (name.toUpperCase().startsWith('DR')) {
        drSheets.push(name);
    } else {
        otherSheets.push(name);
    }
}

console.log('Summary / Report Sheets:', summarySheets);
console.log('DR Sheets count:', drSheets.length);
console.log('First 5 DR sheets:', drSheets.slice(0, 5));
console.log('Last 5 DR sheets:', drSheets.slice(-5));
console.log('Other Sheets:', otherSheets);

// Print all sheet names
console.log('\nAll sheet names:');
console.log(wb.SheetNames);

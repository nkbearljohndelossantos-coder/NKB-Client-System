const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../public/js/xlsx.full.min.js'));

const filePath = 'C:\\Users\\Glen Nobleza\\Documents\\Production\\DELIVERY RECEIPTS AS OF August 2026 Updated.xlsx';
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer' });

function parseExcelDate(serial) {
    if (!serial) return '';
    if (typeof serial === 'string') return serial.trim();
    if (typeof serial === 'number') {
        const utc_days = Math.floor(serial - 25569);
        const utc_value = utc_days * 86400;
        const date_info = new Date(utc_value * 1000);
        return date_info.toISOString().split('T')[0];
    }
    return String(serial);
}

function parseSheet(sheetName) {
    const s = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(s, { header: 1, defval: '' });
    if (!rows || rows.length === 0) return null;

    let billTo = '';
    let dateRaw = '';
    let poNo = '';
    let drNo = '';
    let preparedBy = '';
    let qcApproved = '';
    let deliveredBy = '';
    let receivedBy = '';
    let headerRowIdx = -1;
    let colMap = {};

    for (let r = 0; r < Math.min(20, rows.length); r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').trim();
            const valUpper = val.toUpperCase();
            
            if (valUpper === 'BILL TO:' || valUpper.startsWith('BILL TO:')) {
                billTo = String(row[c + 1] || row[c + 2] || '').trim();
                if (!billTo && valUpper.length > 8) billTo = val.substring(8).trim();
            }
            if (valUpper === 'DATE:' || valUpper.startsWith('DATE:')) {
                dateRaw = row[c + 1] || row[c + 2] || '';
                if (!dateRaw && valUpper.length > 5) dateRaw = val.substring(5).trim();
            }
            if (valUpper === 'PO NO.:' || valUpper === 'PO NO:' || valUpper.startsWith('PO NO')) {
                poNo = String(row[c + 1] || row[c + 2] || '').trim();
                if (!poNo && valUpper.length > 7) poNo = val.substring(7).trim();
            }
            if (valUpper === 'DR NO.:' || valUpper === 'DR NO:' || valUpper.startsWith('DR NO')) {
                drNo = String(row[c + 1] || row[c + 2] || '').trim();
                if (!drNo && valUpper.length > 7) drNo = val.substring(7).trim();
            }

            if (valUpper === 'DESCRIPTION' && headerRowIdx === -1) {
                headerRowIdx = r;
            }
        }
    }

    if (headerRowIdx !== -1) {
        const hRow = rows[headerRowIdx];
        for (let c = 0; c < hRow.length; c++) {
            const h = String(hRow[c] || '').trim().toUpperCase();
            if (h === 'CODE') colMap.code = c;
            if (h === 'DESCRIPTION') colMap.description = c;
            if (h === 'UNIT') colMap.unit = c;
            if (h === 'QTY') colMap.qty = c;
            if (h === 'PRICE') colMap.price = c;
            if (h === 'TOTAL') colMap.total = c;
            if (h === 'REMARKS') colMap.remarks = c;
        }
    }

    const items = [];
    let note = '';
    let totalQty = 0;
    let totalPo = 0;

    if (headerRowIdx !== -1) {
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
            const row = rows[r];
            const desc = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';
            const code = colMap.code !== undefined ? String(row[colMap.code] || '').trim() : '';
            const unit = colMap.unit !== undefined ? String(row[colMap.unit] || '').trim() : '';
            const qty = colMap.qty !== undefined ? row[colMap.qty] : '';
            const price = colMap.price !== undefined ? row[colMap.price] : '';
            const total = colMap.total !== undefined ? row[colMap.total] : '';
            const remarks = colMap.remarks !== undefined ? String(row[colMap.remarks] || '').trim() : '';

            // Check if this row is summary / footer
            const rowStr = row.map(cell => String(cell || '').trim().toUpperCase()).join(' ');
            if (rowStr.includes('TOTAL QTY')) {
                const qtyIdx = row.findIndex(c => String(c || '').toUpperCase().includes('TOTAL QTY'));
                totalQty = row[qtyIdx + 1] || row[qtyIdx + 2] || totalQty;
            }
            if (rowStr.includes('TOTAL PO:')) {
                const poIdx = row.findIndex(c => String(c || '').toUpperCase().includes('TOTAL PO:'));
                totalPo = row[poIdx + 1] || row[poIdx + 2] || totalPo;
            }
            if (rowStr.includes('NOTE:')) {
                note = row.find(c => String(c || '').toUpperCase().includes('NOTE:')) || '';
            }

            if (rowStr.includes('PREPARED BY:')) {
                const nextRow = rows[r + 1] || [];
                const nextRow2 = rows[r + 2] || [];
                preparedBy = nextRow.find(c => c && String(c).trim() !== '') || nextRow2.find(c => c && String(c).trim() !== '') || '';
            }

            // Normal item row
            if (desc && !desc.toUpperCase().startsWith('TOTAL') && !desc.toUpperCase().startsWith('NOTE') && !desc.toUpperCase().startsWith('PREPARED')) {
                const numQty = typeof qty === 'number' ? qty : parseFloat(String(qty).replace(/,/g, '')) || 0;
                items.push({
                    code,
                    description: desc,
                    unit: unit || 'PC',
                    qty: numQty,
                    price: price === 'N/A' || price === '' ? 'N/A' : price,
                    total: total === 'N/A' || total === '' ? 'N/A' : total,
                    remarks
                });
            }
        }
    }

    return {
        sheetName,
        drNo: drNo || sheetName,
        poNo,
        billTo,
        date: parseExcelDate(dateRaw),
        items,
        itemCount: items.length,
        totalQty: typeof totalQty === 'number' ? totalQty : parseFloat(String(totalQty).replace(/,/g, '')) || items.reduce((s, it) => s + (it.qty || 0), 0),
        note: String(note).trim(),
        preparedBy: String(preparedBy).trim()
    };
}

let parsedCount = 0;
let emptyCount = 0;
const results = [];

for (const name of wb.SheetNames) {
    const res = parseSheet(name);
    if (!res || res.items.length === 0) {
        emptyCount++;
    } else {
        parsedCount++;
        results.push(res);
    }
}

console.log(`Total sheets: ${wb.SheetNames.length}, Parsed with items: ${parsedCount}, Empty/no items: ${emptyCount}`);
console.log('Sample parsed DR 457:', JSON.stringify(results.find(r => r.sheetName.includes('457')), null, 2));
console.log('Sample parsed DR 01:', JSON.stringify(results.find(r => r.sheetName.includes('DR01')), null, 2));
console.log('Sample parsed DR 300:', JSON.stringify(results.find(r => r.sheetName.includes('DR300')), null, 2));

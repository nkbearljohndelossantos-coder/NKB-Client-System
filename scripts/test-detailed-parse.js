const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '../public/js/xlsx.full.min.js'));

const filePath = 'C:\\Users\\Glen Nobleza\\Documents\\Production\\DELIVERY RECEIPTS AS OF August 2026 Updated.xlsx';
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer' });

function parseSheetDetails(sheetName) {
    const s = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(s, { header: 1, defval: '' });
    if (!rows || rows.length === 0) return null;

    let billTo = '';
    let dateRaw = '';
    let poNo = '';
    let drNo = '';
    let headerRowIdx = -1;
    let colMap = {};

    // Search header area
    for (let r = 0; r < Math.min(20, rows.length); r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || '').trim();
            const valUpper = cellVal.toUpperCase();
            
            if (valUpper === 'BILL TO:' || valUpper.startsWith('BILL TO:')) {
                billTo = String(row[c + 1] || row[c + 2] || '').trim();
                if (!billTo && valUpper.length > 8) billTo = cellVal.substring(8).trim();
            }
            if (valUpper === 'DATE:' || valUpper.startsWith('DATE:')) {
                dateRaw = row[c + 1] || row[c + 2] || '';
                if (!dateRaw && valUpper.length > 5) dateRaw = cellVal.substring(5).trim();
            }
            if (valUpper === 'PO NO.:' || valUpper === 'PO NO:' || valUpper.startsWith('PO NO')) {
                poNo = String(row[c + 1] || row[c + 2] || '').trim();
                if (!poNo && valUpper.length > 7) poNo = cellVal.substring(7).trim();
            }
            if (valUpper === 'DR NO.:' || valUpper === 'DR NO:' || valUpper.startsWith('DR NO')) {
                drNo = String(row[c + 1] || row[c + 2] || '').trim();
                if (!drNo && valUpper.length > 7) drNo = cellVal.substring(7).trim();
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

    let note = '';
    let preparedBy = '';
    let qcApproved = '';
    let deliveredBy = '';
    let receivedBy = '';
    let totalQty = 0;
    const items = [];

    // Search footer and items
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const rowStr = row.map(cell => String(cell || '').trim().toUpperCase()).join(' | ');

        // Check for signatories
        if (rowStr.includes('PREPARED BY:') || rowStr.includes('QC APPROVED') || rowStr.includes('DELIVERED BY:')) {
            // Find signature values in next few rows
            for (let subR = r + 1; subR <= Math.min(rows.length - 1, r + 5); subR++) {
                const sRow = rows[subR];
                for (let c = 0; c < sRow.length; c++) {
                    const text = String(sRow[c] || '').trim();
                    if (!text || text.toUpperCase() === 'NAME' || text.toUpperCase() === "DRIVER'S NAME" || text.toUpperCase() === 'CUSTOMER') continue;
                    
                    // Match column positions
                    const hText = String(row[c] || row[c - 1] || row[c + 1] || '').toUpperCase();
                    if (hText.includes('PREPARED') && !preparedBy) preparedBy = text;
                    else if (hText.includes('QC') && !qcApproved) qcApproved = text;
                    else if (hText.includes('DELIVERED') && !deliveredBy) deliveredBy = text;
                    else if (hText.includes('RECEIVED') && !receivedBy) receivedBy = text;
                }
            }
        }

        // Check for note
        for (let c = 0; c < row.length; c++) {
            const cell = String(row[c] || '').trim();
            if (cell.toUpperCase().startsWith('NOTE:')) {
                note = cell;
                const nextCell = String(row[c + 1] || '').trim();
                if (nextCell && !nextCell.toUpperCase().startsWith('TOTAL')) {
                    note += ' ' + nextCell;
                }
            }
        }

        // Check total qty
        if (rowStr.includes('TOTAL QTY')) {
            for (let c = 0; c < row.length; c++) {
                if (String(row[c] || '').toUpperCase().includes('TOTAL QTY')) {
                    const candidate = row[c + 1] || row[c + 2];
                    if (candidate !== undefined && candidate !== '') {
                        totalQty = typeof candidate === 'number' ? candidate : parseFloat(String(candidate).replace(/,/g, '')) || 0;
                    }
                }
            }
        }

        // Parse items if in item range
        if (headerRowIdx !== -1 && r > headerRowIdx) {
            const desc = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';
            const code = colMap.code !== undefined ? String(row[colMap.code] || '').trim() : '';
            const unit = colMap.unit !== undefined ? String(row[colMap.unit] || '').trim() : '';
            const qty = colMap.qty !== undefined ? row[colMap.qty] : '';
            const price = colMap.price !== undefined ? row[colMap.price] : '';
            const total = colMap.total !== undefined ? row[colMap.total] : '';
            const remarks = colMap.remarks !== undefined ? String(row[colMap.remarks] || '').trim() : '';

            const descUpper = desc.toUpperCase();
            if (desc && !descUpper.startsWith('TOTAL') && !descUpper.startsWith('NOTE') && !descUpper.startsWith('PREPARED') && !descUpper.startsWith('GRAND TOTAL') && !rowStr.includes('PREPARED BY:') && !rowStr.includes('NOTE:')) {
                const numQty = typeof qty === 'number' ? qty : parseFloat(String(qty).replace(/,/g, '')) || 0;
                items.push({
                    code,
                    description: desc,
                    unit: unit || 'PC',
                    qty: numQty,
                    price: price === '' ? 'N/A' : price,
                    total: total === '' ? 'N/A' : total,
                    remarks
                });
            }
        }
    }

    // Extract DR integer number for sorting
    // SheetName might be 'DR457 Intimate Serum', 'DR01 CICA CREAM', 'DR304 JLS  (2)'
    let drNumberInt = 0;
    const match = sheetName.match(/DR\s*0*(\d+)/i) || (drNo && drNo.match(/DR\s*0*(\d+)/i));
    if (match) {
        drNumberInt = parseInt(match[1], 10);
    }

    const calculatedTotalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);

    return {
        sheetName,
        drNumberInt,
        drNo: drNo || sheetName,
        poNo,
        billTo,
        date: parseExcelDate(dateRaw),
        preparedBy,
        qcApproved,
        deliveredBy,
        receivedBy,
        note,
        totalQty: totalQty || calculatedTotalQty,
        items
    };
}

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

const allDrs = [];
for (const name of wb.SheetNames) {
    const parsed = parseSheetDetails(name);
    if (parsed) {
        allDrs.push(parsed);
    }
}

// Sort from latest to oldest DR (DR457 to DR1)
allDrs.sort((a, b) => {
    if (b.drNumberInt !== a.drNumberInt) {
        return b.drNumberInt - a.drNumberInt;
    }
    return b.sheetName.localeCompare(a.sheetName);
});

console.log('Total extracted DRs:', allDrs.length);
console.log('Highest 5 DRs:');
allDrs.slice(0, 5).forEach(d => console.log(`DR #${d.drNumberInt} | Sheet: "${d.sheetName}" | DR No: "${d.drNo}" | PO: "${d.poNo}" | Bill To: "${d.billTo}" | Date: ${d.date} | Items: ${d.items.length} | TotalQty: ${d.totalQty}`));

console.log('\nLowest 5 DRs:');
allDrs.slice(-5).forEach(d => console.log(`DR #${d.drNumberInt} | Sheet: "${d.sheetName}" | DR No: "${d.drNo}" | PO: "${d.poNo}" | Bill To: "${d.billTo}" | Date: ${d.date} | Items: ${d.items.length} | TotalQty: ${d.totalQty}`));

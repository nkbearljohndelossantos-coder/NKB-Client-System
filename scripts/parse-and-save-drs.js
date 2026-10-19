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

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const rowStr = row.map(cell => String(cell || '').trim().toUpperCase()).join(' | ');

        if (rowStr.includes('PREPARED BY:') || rowStr.includes('QC APPROVED') || rowStr.includes('DELIVERED BY:') || rowStr.includes('RECEIVED BY:')) {
            for (let subR = r + 1; subR <= Math.min(rows.length - 1, r + 5); subR++) {
                const sRow = rows[subR];
                for (let c = 0; c < sRow.length; c++) {
                    const text = String(sRow[c] || '').trim();
                    if (!text || text.toUpperCase() === 'NAME' || text.toUpperCase() === "DRIVER'S NAME" || text.toUpperCase() === 'CUSTOMER') continue;
                    
                    const hText = String(row[c] || row[c - 1] || row[c + 1] || '').toUpperCase();
                    if (hText.includes('PREPARED') && !preparedBy) preparedBy = text;
                    else if (hText.includes('QC') && !qcApproved) qcApproved = text;
                    else if (hText.includes('DELIVERED') && !deliveredBy) deliveredBy = text;
                    else if (hText.includes('RECEIVED') && !receivedBy) receivedBy = text;
                }
            }
        }

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

        if (headerRowIdx !== -1 && r > headerRowIdx) {
            const desc = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';
            const code = colMap.code !== undefined ? String(row[colMap.code] || '').trim() : '';
            const unit = colMap.unit !== undefined ? String(row[colMap.unit] || '').trim() : '';
            const qty = colMap.qty !== undefined ? row[colMap.qty] : '';
            const price = colMap.price !== undefined ? row[colMap.price] : '';
            const total = colMap.total !== undefined ? row[colMap.total] : '';
            const remarks = colMap.remarks !== undefined ? String(row[colMap.remarks] || '').trim() : '';

            const descUpper = desc.toUpperCase();
            const priceUpper = String(price || '').toUpperCase();
            const totalUpper = String(total || '').toUpperCase();

            // Ignore footer / summary / note rows that got caught in the description column
            const isFooterRow = rowStr.includes('TOTAL QTY') || 
                                rowStr.includes('TOTAL PO') || 
                                rowStr.includes('TOTAL PAYMENT') || 
                                rowStr.includes('PREPARED BY:') || 
                                rowStr.includes('QC APPROVED') || 
                                priceUpper.includes('TOTAL') || 
                                totalUpper.includes('TOTAL') || 
                                descUpper.startsWith('TOTAL') || 
                                descUpper.startsWith('NOTE:') || 
                                (descUpper.includes('BOXES') && (qty === '' || qty === 0)) ||
                                (descUpper.includes('REMAINING QTY') && (qty === '' || qty === 0)) ||
                                (descUpper.includes('RETURNED ITEMS') && (qty === '' || qty === 0)) ||
                                (descUpper.includes('NOT YET PICK UP') && (qty === '' || qty === 0)) ||
                                (descUpper.includes('SALES INVOICE AND DELIVERY') && (qty === '' || qty === 0));

            if (desc && !isFooterRow) {
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
            } else if (desc && (descUpper.includes('BOXES') || descUpper.includes('NOTE') || descUpper.includes('REMAINING') || descUpper.includes('RETURNED')) && !note) {
                note = desc;
            }
        }
    }

    let drNumberInt = 0;
    const match = sheetName.match(/DR\s*0*(\d+)/i) || (drNo && drNo.match(/DR\s*0*(\d+)/i));
    if (match) {
        drNumberInt = parseInt(match[1], 10);
    }

    const calculatedTotalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);

    return {
        id: `dr-aug26-${drNumberInt}-${sheetName.replace(/[^a-zA-Z0-9]/g, '_')}`,
        sheetName,
        drNumberInt,
        drNo: drNo || sheetName,
        poNo,
        billTo,
        date: parseExcelDate(dateRaw),
        preparedBy: preparedBy || 'Ronaldo Prudencio',
        qcApproved: qcApproved || 'Quality Assurance',
        deliveredBy: deliveredBy || "Driver's Name",
        receivedBy: receivedBy || 'Customer',
        note: note || '',
        totalQty: totalQty || calculatedTotalQty,
        items
    };
}

const list = [];
for (const name of wb.SheetNames) {
    const item = parseSheetDetails(name);
    if (item && item.items.length > 0) list.push(item);
}

// Sort from latest to oldest DR (DR457 to DR1)
list.sort((a, b) => {
    if (b.drNumberInt !== a.drNumberInt) {
        return b.drNumberInt - a.drNumberInt;
    }
    if (b.date && a.date && b.date !== a.date) {
        return b.date.localeCompare(a.date);
    }
    return b.sheetName.localeCompare(a.sheetName);
});

console.log('Total valid parsed DR records:', list.length);
const outputPath = path.resolve(__dirname, '../database/parsed_delivery_receipts.json');
fs.writeFileSync(outputPath, JSON.stringify(list, null, 2));
console.log('Cleaned and saved to', outputPath, '(size:', fs.statSync(outputPath).size, 'bytes)');

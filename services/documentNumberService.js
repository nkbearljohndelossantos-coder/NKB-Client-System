const defaultDb = require('../database/db');
const { getManilaYear } = require('../helpers/timezone');

/**
 * Generate a sequential, human-readable document number
 * e.g., PO-2026-000001, JO-2026-000001, DR-2026-000001, SI-2026-000001, BAT-2026-000001
 * 
 * @param {string} docType - 'PO', 'SPO', 'JO', 'BATCH', 'DR', 'SI', 'PAY'
 * @param {object} [customDb] - Optional database instance override
 * @returns {string} The next formatted document number
 */
function getNextDocumentNumber(docType, customDb) {
    const db = customDb || defaultDb;
    const year = getManilaYear();
    
    if (docType === 'PO') {
        // Voided POs must not affect PO numbering. Sequence is determined by the highest active (non-voided) PO for the year.
        const activeRows = db.prepare(`
            SELECT po_number FROM purchase_orders 
            WHERE status != 'VOIDED' AND po_number LIKE ?
        `).all(`PO-${year}-%`);
        
        let maxSeq = 0;
        for (const row of activeRows) {
            const parts = row.po_number.split('-');
            if (parts.length === 3) {
                const seq = parseInt(parts[2], 10);
                if (!isNaN(seq) && seq > maxSeq) {
                    maxSeq = seq;
                }
            }
        }
        
        const nextSeq = maxSeq + 1;
        
        const existingSeq = db.prepare('SELECT doc_type FROM document_sequences WHERE doc_type = ?').get('PO');
        if (existingSeq) {
            db.prepare('UPDATE document_sequences SET current_year = ?, last_sequence = ? WHERE doc_type = ?').run(year, nextSeq, 'PO');
        } else {
            db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, ?)').run('PO', year, nextSeq);
        }
        
        const formattedSeq = String(nextSeq).padStart(6, '0');
        return `PO-${year}-${formattedSeq}`;
    }

    if (docType === 'FPR') {
        const getSeq = db.prepare('SELECT current_year, last_sequence FROM document_sequences WHERE doc_type = ?');
        const row = getSeq.get('FPR');
        let nextSeq = 1;
        if (row) {
            nextSeq = (row.last_sequence || 0) + 1;
            db.prepare('UPDATE document_sequences SET last_sequence = ? WHERE doc_type = ?').run(nextSeq, 'FPR');
        } else {
            db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, ?)').run('FPR', year, 1);
            nextSeq = 1;
        }
        return `FPR -FORM ${String(nextSeq).padStart(3, '0')}`;
    }

    const getSeq = db.prepare('SELECT current_year, last_sequence FROM document_sequences WHERE doc_type = ?');
    const row = getSeq.get(docType);
    
    let nextSeq = 1;
    if (row) {
        if (row.current_year === year) {
            nextSeq = row.last_sequence + 1;
            db.prepare('UPDATE document_sequences SET last_sequence = ? WHERE doc_type = ?').run(nextSeq, docType);
        } else {
            nextSeq = 1;
            db.prepare('UPDATE document_sequences SET current_year = ?, last_sequence = ? WHERE doc_type = ?').run(year, nextSeq, docType);
        }
    } else {
        db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, ?)').run(docType, year, 1);
        nextSeq = 1;
    }
    
    const formattedSeq = String(nextSeq).padStart(6, '0');
    return `${docType}-${year}-${formattedSeq}`;
}

/**
 * Preview the next sequential document number without updating the database sequence
 */
function previewNextDocumentNumber(docType, customDb) {
    const db = customDb || defaultDb;
    const year = getManilaYear();
    
    if (docType === 'PO') {
        const activeRows = db.prepare(`
            SELECT po_number FROM purchase_orders 
            WHERE status != 'VOIDED' AND po_number LIKE ?
        `).all(`PO-${year}-%`);
        
        let maxSeq = 0;
        for (const row of activeRows) {
            const parts = row.po_number.split('-');
            if (parts.length === 3) {
                const seq = parseInt(parts[2], 10);
                if (!isNaN(seq) && seq > maxSeq) {
                    maxSeq = seq;
                }
            }
        }
        
        const nextSeq = maxSeq + 1;
        const formattedSeq = String(nextSeq).padStart(6, '0');
        return `PO-${year}-${formattedSeq}`;
    }

    if (docType === 'FPR') {
        const row = db.prepare('SELECT last_sequence FROM document_sequences WHERE doc_type = ?').get('FPR');
        const nextSeq = ((row && row.last_sequence) || 0) + 1;
        return `FPR -FORM ${String(nextSeq).padStart(3, '0')}`;
    }

    const row = db.prepare('SELECT current_year, last_sequence FROM document_sequences WHERE doc_type = ?').get(docType);
    let nextSeq = 1;
    if (row) {
        if (row.current_year === year) {
            nextSeq = row.last_sequence + 1;
        } else {
            nextSeq = 1;
        }
    }
    const formattedSeq = String(nextSeq).padStart(6, '0');
    return `${docType}-${year}-${formattedSeq}`;
}

module.exports = {
    getNextDocumentNumber,
    previewNextDocumentNumber
};

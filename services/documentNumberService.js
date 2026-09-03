function getDb() {
    return require('../database/db');
}

/**
 * Generate a sequential, human-readable document number
 * e.g., PO-2026-000001, JO-2026-000001, DR-2026-000001, SI-2026-000001, BAT-2026-000001
 * 
 * @param {string} docType - 'PO', 'JO', 'BATCH', 'DR', 'SI', 'PAY'
 * @returns {string} The next formatted document number
 */
function getNextDocumentNumber(docType) {
    const db = getDb();
    const year = new Date().getFullYear();
    
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

module.exports = {
    getNextDocumentNumber
};

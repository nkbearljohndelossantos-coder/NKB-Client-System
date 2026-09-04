function getDb() {
    return require('../database/db');
}

/**
 * Generate a sequential, human-readable document number
 * e.g., PO-2026-000001, SO-2026-000001, DR-2026-000001, SI-2026-000001, BAT-2026-000001
 * 
 * @param {string} docType - 'PO', 'SO', 'JO', 'BATCH', 'DR', 'SI', 'PAY'
 * @returns {string} The next formatted document number
 */
function getNextDocumentNumber(docType) {
    const db = getDb();
    const year = new Date().getFullYear();
    
    // Normalize JO to SO for document sequences
    const seqKey = docType === 'JO' ? 'SO' : docType;

    const getSeq = db.prepare('SELECT current_year, last_sequence FROM document_sequences WHERE doc_type = ?');
    let row = getSeq.get(seqKey);
    
    // If SO doesn't exist yet, check if JO had an active sequence
    if (!row && seqKey === 'SO') {
        const joRow = getSeq.get('JO');
        if (joRow) {
            row = joRow;
        }
    }
    
    let nextSeq = 1;
    if (row) {
        if (row.current_year === year) {
            nextSeq = row.last_sequence + 1;
            db.prepare('INSERT OR REPLACE INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, ?)').run(seqKey, year, nextSeq);
        } else {
            nextSeq = 1;
            db.prepare('INSERT OR REPLACE INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, ?)').run(seqKey, year, nextSeq);
        }
    } else {
        db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, ?)').run(seqKey, year, 1);
        nextSeq = 1;
    }
    
    const formattedSeq = String(nextSeq).padStart(6, '0');
    return `${docType}-${year}-${formattedSeq}`;
}

module.exports = {
    getNextDocumentNumber
};

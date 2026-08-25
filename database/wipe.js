const db = require('./db');

function wipeTransactions() {
    console.log('🧹 Wiping all transaction records from database...');

    db.exec('PRAGMA foreign_keys = OFF;');

    const wipeTx = db.transaction(() => {
        db.exec(`
            DELETE FROM payments;
            DELETE FROM invoice_items;
            DELETE FROM sales_invoices;
            DELETE FROM returns;
            DELETE FROM dr_acceptances;
            DELETE FROM delivery_items;
            DELETE FROM delivery_receipts;
            DELETE FROM overrun_approvals;
            DELETE FROM batch_yields;
            DELETE FROM production_batches;
            DELETE FROM job_orders;
            DELETE FROM purchase_order_items;
            DELETE FROM purchase_orders;
            DELETE FROM client_buffer_stock;
            DELETE FROM inventory_movements;
            DELETE FROM audit_logs;
        `);

        // Reset document sequences
        const year = new Date().getFullYear();
        db.exec('DELETE FROM document_sequences;');
        const insertSeq = db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, 0)');
        const docTypes = ['PO', 'JO', 'BAT', 'DR', 'SI', 'PAY'];
        for (const type of docTypes) {
            insertSeq.run(type, year);
        }
    });

    try {
        wipeTx();
        console.log('✅ All transaction records successfully wiped.');
        console.log('✨ Master accounts (Clients, Products, Users, Client Pricing) are preserved.');
    } finally {
        db.exec('PRAGMA foreign_keys = ON;');
    }
}

if (require.main === module) {
    wipeTransactions();
}

module.exports = wipeTransactions;

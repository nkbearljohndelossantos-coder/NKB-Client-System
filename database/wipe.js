const db = require('./db');

function wipeDatabase() {
    console.log('🧹 Wiping all demo records (Transactions, Products, Clients, Pricing, and Demo Staff)...');

    db.exec('PRAGMA foreign_keys = OFF;');

    const wipeTx = db.transaction(() => {
        // 1. Wipe all transaction tables
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
            DELETE FROM client_product_prices;
            DELETE FROM products;
            DELETE FROM clients;
        `);

        // 2. Remove all demo non-admin accounts, preserve only Super Admin
        db.exec(`
            DELETE FROM users WHERE role != 'SUPER_ADMIN';
        `);

        // 3. Reset document sequences
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
        console.log('✅ Database is now 100% CLEAN: 0 Products, 0 Clients, 0 Transactions.');
        console.log('👤 Only the Executive Super Admin account is retained for your initial setup.');
    } finally {
        db.exec('PRAGMA foreign_keys = ON;');
    }
}

if (require.main === module) {
    wipeDatabase();
}

module.exports = wipeDatabase;

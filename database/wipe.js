require('dotenv').config();

const dbDriver = (process.env.DB_DRIVER || '').toLowerCase();
const hasMysqlConfig = Boolean(
    process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME
);
const useMysql = dbDriver === 'mysql'
    || (dbDriver !== 'sqlite' && hasMysqlConfig && process.env.NODE_ENV === 'production');

if (useMysql) {
    module.exports = require('./wipe-mysql');
    if (require.main === module) {
        require('./wipe-mysql')()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    }
} else {
    const db = require('./db');

    function wipeDatabase() {
        console.log('🧹 Wiping all records (Transactions, Products, Clients, Pricing, and non-admin Staff)...');

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
                DELETE FROM client_product_prices;
                DELETE FROM products;
                DELETE FROM clients;
            `);

            db.exec("DELETE FROM users WHERE role != 'SUPER_ADMIN';");

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
            console.log('✅ Database is now clean: 0 Products, 0 Clients, 0 Transactions.');
            console.log('👤 Only the Executive Super Admin account is retained.');
        } finally {
            db.exec('PRAGMA foreign_keys = ON;');
        }
    }

    module.exports = wipeDatabase;

    if (require.main === module) {
        wipeDatabase();
    }
}

require('dotenv').config();

const dbDriver = (process.env.DB_DRIVER || '').toLowerCase();
const hasMysqlConfig = Boolean(
    process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME
);
const useMysql = dbDriver === 'mysql'
    || (dbDriver !== 'sqlite' && hasMysqlConfig && process.env.NODE_ENV === 'production');

async function wipeTransactions() {
    console.log('🧹 Wiping all transaction records (Orders, Batches, Deliveries, Invoices, Payments, Buffer)...');
    console.log('🛡️  PRESERVING: Products, Clients, Contract Prices, Users, and Employees.');

    if (useMysql) {
        const mysql = require('mysql2/promise');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });

        try {
            await connection.query('SET FOREIGN_KEY_CHECKS = 0');

            const tables = [
                'payments',
                'invoice_items',
                'sales_invoices',
                'returns',
                'dr_acceptances',
                'delivery_items',
                'delivery_receipts',
                'overrun_approvals',
                'batch_yields',
                'production_batches',
                'job_orders',
                'purchase_order_items',
                'purchase_orders',
                'client_buffer_stock',
                'inventory_movements',
                'audit_logs'
            ];

            for (const table of tables) {
                await connection.query(`DELETE FROM ${table}`);
                console.log(`   ✓ Cleared ${table}`);
            }

            const year = new Date().getFullYear();
            await connection.query('DELETE FROM document_sequences');
            const docTypes = ['PO', 'JO', 'BAT', 'DR', 'SI', 'PAY'];
            for (const type of docTypes) {
                await connection.query(
                    'INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, 0)',
                    [type, year]
                );
            }
            console.log('   ✓ Reset document sequences (PO, JO, BAT, DR, SI, PAY) to 0');
            console.log('✅ Production MySQL transaction wipe complete.');
        } finally {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            await connection.end();
        }
    } else {
        const db = require('./db');
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
            console.log('✅ SQLite transaction wipe complete.');
            console.log('   ✓ Reset document sequences to 0');
        } finally {
            db.exec('PRAGMA foreign_keys = ON;');
        }
    }
}

module.exports = wipeTransactions;

if (require.main === module) {
    wipeTransactions()
        .then(() => {
            console.log('🚀 Wipe transactions script completed successfully.');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Wipe transactions script failed:', err);
            process.exit(1);
        });
}

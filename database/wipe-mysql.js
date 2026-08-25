require('dotenv').config();
const mysql = require('mysql2/promise');

async function wipeProductionDatabase() {
    if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️  Running production wipe outside NODE_ENV=production');
    }

    console.log('🧹 Wiping production MySQL database (keeping Super Admin only)...');

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
            'audit_logs',
            'client_product_prices',
            'products',
            'clients'
        ];

        for (const table of tables) {
            await connection.query(`DELETE FROM ${table}`);
            console.log(`   ✓ Cleared ${table}`);
        }

        await connection.query("DELETE FROM users WHERE role != 'SUPER_ADMIN'");

        const year = new Date().getFullYear();
        await connection.query('DELETE FROM document_sequences');
        const docTypes = ['PO', 'JO', 'BAT', 'DR', 'SI', 'PAY'];
        for (const type of docTypes) {
            await connection.query(
                'INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, 0)',
                [type, year]
            );
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        const [[clientCount]] = await connection.query('SELECT COUNT(*) AS total FROM clients');
        const [[productCount]] = await connection.query('SELECT COUNT(*) AS total FROM products');
        const [[adminCount]] = await connection.query("SELECT COUNT(*) AS total FROM users WHERE role = 'SUPER_ADMIN'");

        console.log('=======================================================');
        console.log('✅ Production database wiped clean.');
        console.log(`   Clients:  ${clientCount.total}`);
        console.log(`   Products: ${productCount.total}`);
        console.log(`   Admins:   ${adminCount.total}`);
        console.log('=======================================================');
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    wipeProductionDatabase()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('❌ Wipe failed:', error.message);
            process.exit(1);
        });
}

module.exports = wipeProductionDatabase;

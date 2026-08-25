require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
    console.log('🔌 Testing MySQL / phpMyAdmin connection...');
    console.log(`   Host:     ${process.env.DB_HOST}`);
    console.log(`   Database: ${process.env.DB_NAME}`);
    console.log(`   User:     ${process.env.DB_USER}`);

    let connection;

    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [rows] = await connection.query('SELECT DATABASE() AS db_name, NOW() AS server_time');
        const [tables] = await connection.query('SHOW TABLES');

        console.log('✅ Connection successful!');
        console.log(`   Active database: ${rows[0].db_name}`);
        console.log(`   Server time:     ${rows[0].server_time}`);
        console.log(`   Tables found:    ${tables.length}`);

        if (tables.length === 0) {
            console.log('\n⚠️  No tables yet. Run: npm run migrate:mysql');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('\n💡 Tip: Hostinger MySQL only accepts connections from localhost on the server.');
            console.error('   Deploy to my.nkbmanufacturing.com and run this test there via SSH/Terminal.');
        }
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

testConnection();

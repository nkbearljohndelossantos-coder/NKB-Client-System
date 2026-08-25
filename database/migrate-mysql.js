require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function runMysqlMigration() {
    console.log('🔄 Connecting to MySQL Database...');
    console.log(`🌐 Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`📂 Database: ${process.env.DB_NAME}`);
    console.log(`👤 User: ${process.env.DB_USER}`);

    if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
        throw new Error('Missing DB_USER, DB_PASSWORD, or DB_NAME in .env');
    }

    const connectionConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    };

    let connection;
    try {
        connection = await mysql.createConnection(connectionConfig);
        console.log('✅ Connected successfully to MySQL / phpMyAdmin database.');

        const schemaFile = path.join(__dirname, 'schema.mysql.sql');
        if (!fs.existsSync(schemaFile)) {
            throw new Error(`Schema file not found at ${schemaFile}`);
        }

        const schemaSql = fs.readFileSync(schemaFile, 'utf8');
        console.log('📜 Executing MySQL database table creation & indexing...');
        await connection.query(schemaSql);

        // Ensure Super Admin has exact bcrypt hash
        const salt = bcrypt.genSaltSync(10);
        const adminPassHash = bcrypt.hashSync('Admin123!', salt);
        await connection.query(`
            INSERT INTO users (id, name, email, password_hash, role, is_active) 
            VALUES ('a0000000-0000-0000-0000-000000000001', 'Executive Admin', 'admin@nkbmanufacturing.com', ?, 'SUPER_ADMIN', 1)
            ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);
        `, [adminPassHash]);

        console.log('=======================================================');
        console.log('🎉 MYSQL MIGRATION SUCCESSFUL!');
        console.log('✨ All 21 Tables, Indexes, and Constraints created.');
        console.log('👤 Initial Admin Account: admin@nkbmanufacturing.com / Admin123!');
        console.log('=======================================================');
    } catch (err) {
        console.error('❌ Migration Error:', err.message);
        throw err;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    runMysqlMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = runMysqlMigration;

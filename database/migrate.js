const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

function runMigrations() {
    console.log('🔄 Running Database Migrations...');

    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
        throw new Error(`Schema file not found at ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);

    // Safe column migrations for client_product_prices
    try {
        db.exec('ALTER TABLE client_product_prices ADD COLUMN custom_name TEXT;');
    } catch (e) { /* column exists */ }
    try {
        db.exec('ALTER TABLE client_product_prices ADD COLUMN custom_formula_code TEXT;');
    } catch (e) { /* column exists */ }

    // Initialize document sequences if empty
    const year = new Date().getFullYear();
    const docTypes = ['PO', 'JO', 'BAT', 'DR', 'SI', 'PAY'];
    const checkSeq = db.prepare('SELECT doc_type FROM document_sequences WHERE doc_type = ?');
    const insertSeq = db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, 0)');

    for (const type of docTypes) {
        if (!checkSeq.get(type)) {
            insertSeq.run(type, year);
        }
    }

    // If initial admin credentials are provided via environment variables in production
    const initAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
    const initAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;

    if (initAdminEmail && initAdminPassword) {
        const existingAdmin = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(initAdminEmail.trim());
        if (!existingAdmin) {
            const passwordHash = bcrypt.hashSync(initAdminPassword, 12);
            db.prepare(`
                INSERT INTO users (id, name, email, password_hash, role, is_active)
                VALUES (?, 'System Administrator', ?, ?, 'SUPER_ADMIN', 1)
            `).run(uuidv4(), initAdminEmail.trim().toLowerCase(), passwordHash);
            console.log(`👤 Initial Production Super Admin created for: ${initAdminEmail}`);
        }
    }

    console.log('✅ Database schema and sequence migrations completed successfully.');
}

if (require.main === module) {
    runMigrations();
}

module.exports = runMigrations;

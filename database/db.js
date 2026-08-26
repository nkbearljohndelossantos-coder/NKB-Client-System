require('dotenv').config();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbDriver = (process.env.DB_DRIVER || '').toLowerCase();
const hasMysqlConfig = Boolean(
    process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME
);
const useMysql = dbDriver === 'mysql' || (dbDriver !== 'sqlite' && hasMysqlConfig);

if (useMysql) {
    console.log(`🗄️  Connected to MySQL Database: ${process.env.DB_NAME || 'u335953510_client_db'}`);
} else {
    console.log('📦 Database driver: SQLite (local fallback)');
}

let db;

if (useMysql) {
    db = require('./mysql-adapter')();
} else {
    const { DatabaseSync } = require('node:sqlite');

    const projectRoot = path.resolve(__dirname, '..');
    const dbPath = process.env.DATABASE_PATH
        ? path.resolve(projectRoot, process.env.DATABASE_PATH)
        : path.join(__dirname, 'nkb.sqlite');

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    db = new DatabaseSync(dbPath);
    try {
        db.exec('PRAGMA foreign_keys = ON;');
        db.exec('PRAGMA journal_mode = DELETE;');
        db.exec('PRAGMA synchronous = NORMAL;');
        db.exec('PRAGMA busy_timeout = 5000;');
        db.exec('PRAGMA temp_store = MEMORY;');
    } catch (pragmaErr) {
        console.warn('SQLite PRAGMA warning:', pragmaErr.message);
    }

    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        try {
            db.exec(fs.readFileSync(schemaPath, 'utf8'));
        } catch (schemaErr) {
            console.error('Schema initialization warning:', schemaErr.message);
        }
    }

    db.transaction = function (fn) {
        return function (...args) {
            db.exec('BEGIN TRANSACTION;');
            try {
                const result = fn(...args);
                db.exec('COMMIT;');
                return result;
            } catch (error) {
                try {
                    db.exec('ROLLBACK;');
                } catch (rollbackError) {
                    console.error('Transaction rollback failed:', rollbackError.message);
                }
                throw error;
            }
        };
    };

    try {
        const adminUser = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get();
        if (!adminUser) {
            const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@nkbmanufacturing.com').trim().toLowerCase();
            const adminPass = process.env.INITIAL_ADMIN_PASSWORD || 'Admin123!';
            const hash = bcrypt.hashSync(adminPass, bcrypt.genSaltSync(10));
            db.prepare(`
                INSERT INTO users (id, name, email, password_hash, role, is_active)
                VALUES (?, 'Executive Admin', ?, ?, 'SUPER_ADMIN', 1)
            `).run(uuidv4(), adminEmail, hash);
            console.log(`👤 Auto-provisioned Super Admin: ${adminEmail}`);
        }
    } catch (err) {
        console.error('Admin provision error:', err.message);
    }

    try {
        const year = new Date().getFullYear();
        const docTypes = ['PO', 'JO', 'BAT', 'DR', 'SI', 'PAY'];
        const checkSeq = db.prepare('SELECT doc_type FROM document_sequences WHERE doc_type = ?');
        const insertSeq = db.prepare('INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES (?, ?, 0)');
        for (const type of docTypes) {
            if (!checkSeq.get(type)) {
                insertSeq.run(type, year);
            }
        }
    } catch (err) {}
}

module.exports = db;

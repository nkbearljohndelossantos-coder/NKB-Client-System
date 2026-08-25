const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'nkb.sqlite');

// Ensure directory exists
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

// Enable foreign keys and WAL mode for reliability
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Initialize schema
const schemaPath = path.join(__dirname, 'schema.sql');
if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
}

// Auto-provision Super Admin on startup if none exists
try {
    const adminUser = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get();
    if (!adminUser) {
        const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@nkbmanufacturing.com').trim().toLowerCase();
        const adminPass = process.env.INITIAL_ADMIN_PASSWORD || 'Admin123!';
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(adminPass, salt);
        db.prepare(`
            INSERT INTO users (id, name, email, password_hash, role, is_active)
            VALUES (?, 'Executive Admin', ?, ?, 'SUPER_ADMIN', 1)
        `).run(uuidv4(), adminEmail, hash);
        console.log(`👤 Auto-provisioned Super Admin: ${adminEmail}`);
    }
} catch (err) {
    console.error('Admin provision error:', err.message);
}

// Initialize Document Sequences if empty
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

// Transaction wrapper helper
db.transaction = function (fn) {
    return function (...args) {
        db.exec('BEGIN TRANSACTION;');
        try {
            const result = fn(...args);
            db.exec('COMMIT;');
            return result;
        } catch (error) {
            db.exec('ROLLBACK;');
            throw error;
        }
    };
};

module.exports = db;

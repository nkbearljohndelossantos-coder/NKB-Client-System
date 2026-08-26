require('dotenv').config();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbDriver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
const useMysql = dbDriver === 'mysql';

let db;

if (useMysql) {
    console.log(`🗄️  Connecting to MySQL Database: ${process.env.DB_NAME || 'u335953510_client_db'}`);
    db = require('./mysql-adapter')();
} else {
    console.log('⚡ High-Performance Embedded Engine: SQLite Active');
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

    // Auto-provision Super Admin on startup
    try {
        const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@nkbmanufacturing.com').trim().toLowerCase();
        const adminUser = db.prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1").get(adminEmail);
        const adminPassHash = '$2b$10$jny3GQXy8GwL8vkYVtV4EeTH2QDo8tfg6hJO/vbpG3Xrwakfqgx2G'; // bcrypt for Admin123!
        
        if (!adminUser) {
            db.prepare(`
                INSERT INTO users (id, name, email, password_hash, role, is_active)
                VALUES ('a0000000-0000-0000-0000-000000000001', 'Executive Admin', ?, ?, 'SUPER_ADMIN', 1)
            `).run(adminEmail, adminPassHash);
            console.log(`👤 Auto-provisioned Super Admin: ${adminEmail}`);
        } else {
            // Ensure hash is valid
            db.prepare("UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?").run(adminPassHash, adminUser.id);
        }
    } catch (err) {
        console.error('Admin provision error:', err.message);
    }

    // Auto-provision Client User: Earl John Delos Santos (SKEENCARE)
    try {
        const clientEmail = 'nkb.earljohndelossantos@gmail.com';
        const clientUser = db.prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1").get(clientEmail);
        const clientPassHash = '$2b$10$lYsCvkUY9pnq.Q2DcYscNO9wee1A.ACu1WsrSmVA0a6NLIjx2Z/b2'; // bcrypt for Client123!

        // Create client profile if missing
        let clientId = '2fdb72bb-12fa-4909-8967-c19b130db4bb';
        const existingClient = db.prepare("SELECT id FROM clients WHERE id = ? OR email = ? LIMIT 1").get(clientId, clientEmail);
        if (!existingClient) {
            db.prepare(`
                INSERT INTO clients (id, company_name, contact_person, email, phone, address, default_billing_policy, default_tolerance_percent, credit_limit, is_active)
                VALUES (?, 'SKEENCARE Enterprise', 'Earl John Delos Santos', ?, '+63 917 000 0000', 'Metro Manila, Philippines', 'ACTUAL_DELIVERY', 10.0, 500000, 1)
            `).run(clientId, clientEmail);
        } else {
            clientId = existingClient.id;
        }

        if (!clientUser) {
            db.prepare(`
                INSERT INTO users (id, name, email, password_hash, role, client_id, is_active)
                VALUES ('d0396511-4874-4241-9956-694b938ac506', 'Earl John Delos Santos (SKEENCARE)', ?, ?, 'CLIENT', ?, 1)
            `).run(clientEmail, clientPassHash, clientId);
            console.log(`🏢 Auto-provisioned Client Account: ${clientEmail}`);
        } else {
            db.prepare("UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?").run(clientPassHash, clientUser.id);
        }
    } catch (err) {
        console.error('Client provision error:', err.message);
    }

    // Auto-initialize Document Sequences
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

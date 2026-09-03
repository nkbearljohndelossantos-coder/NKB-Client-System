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

    // Migration: ensure batch_code_template exists
    try {
        db.exec('ALTER TABLE products ADD COLUMN batch_code_template TEXT;');
    } catch (e) {}
    try {
        db.exec('ALTER TABLE client_product_prices ADD COLUMN batch_code_template TEXT;');
    } catch (e) {}
    try {
        db.exec('ALTER TABLE products ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE SET NULL;');
    } catch (e) {}

    // Auto-update and clean batch_code_template for all products
    try {
        const { findBatchTemplate } = require('../services/batchCodingService');
        const prods = db.prepare('SELECT id, name, sku, batch_code_template FROM products').all();
        for (const p of prods) {
            const tmpl = findBatchTemplate(p.name, p.sku);
            db.prepare('UPDATE products SET batch_code_template = ? WHERE id = ?').run(tmpl, p.id);
        }
    } catch (err) {
        console.warn('Batch template update warning:', err.message);
    }

    // Auto-provision standard brand clients if missing
    try {
        const brandClients = [
            { id: '2fdb72bb-12fa-4909-8967-c19b130db4bb', name: 'SKEENCARE Enterprise', email: 'nkb.earljohndelossantos@gmail.com', contact: 'Earl John Delos Santos' },
            { id: 'c0000000-0000-0000-0000-000000000002', name: 'Bella Skin Essentials', email: 'orders@bellaskin.ph', contact: 'Bella Skin Purchasing' },
            { id: 'c0000000-0000-0000-0000-000000000003', name: 'Her Choice PH', email: 'orders@herchoiceph.com', contact: 'Her Choice PH Admin' },
            { id: 'c0000000-0000-0000-0000-000000000004', name: 'Natasha Philippines', email: 'procurement@natasha.ph', contact: 'Natasha Purchasing' },
            { id: 'c0000000-0000-0000-0000-000000000005', name: 'Hanapam Cosmetics', email: 'orders@hanapam.com', contact: 'Hanapam Operations' },
            { id: 'c0000000-0000-0000-0000-000000000006', name: 'Gelis Pharma Inc.', email: 'orders@gelispharma.com', contact: 'Gelis Pharma Admin' },
            { id: 'c0000000-0000-0000-0000-000000000007', name: 'Jgloww Aesthetics', email: 'orders@jgloww.com', contact: 'Jgloww Procurement' },
            { id: 'c0000000-0000-0000-0000-000000000008', name: 'Brightest Skin Essentials', email: 'orders@brightestskin.ph', contact: 'Brightest Skin Admin' },
            { id: 'c0000000-0000-0000-0000-000000000009', name: 'Royce B Skincare', email: 'orders@royceb.ph', contact: 'Royce B Operations' },
            { id: 'c0000000-0000-0000-0000-000000000010', name: 'Elixia Wellness', email: 'orders@elixia.ph', contact: 'Elixia Admin' }
        ];

        for (const bc of brandClients) {
            const exists = db.prepare('SELECT id FROM clients WHERE id = ? OR UPPER(company_name) = UPPER(?)').get(bc.id, bc.name);
            if (!exists) {
                db.prepare(`
                    INSERT INTO clients (id, company_name, contact_person, email, phone, address, default_billing_policy, default_tolerance_percent, credit_limit, is_active)
                    VALUES (?, ?, ?, ?, '+63 917 000 0000', 'Metro Manila, Philippines', 'ACTUAL_DELIVERY', 10.0, 500000, 1)
                `).run(bc.id, bc.name, bc.contact, bc.email);
            }
        }

        // Auto-assign products to their respective brand clients if currently null
        const allClients = db.prepare('SELECT id, company_name FROM clients').all();
        for (const cl of allClients) {
            const cName = cl.company_name.toUpperCase();
            if (cName.includes('SKEENCARE')) {
                db.prepare("UPDATE products SET client_id = ? WHERE (UPPER(name) LIKE '%SKEENCARE%' OR UPPER(name) LIKE '%CUTIS%') AND client_id IS NULL").run(cl.id);
            } else if (cName.includes('BELLA SKIN')) {
                db.prepare("UPDATE products SET client_id = ? WHERE UPPER(name) LIKE '%BELLA SKIN%' AND client_id IS NULL").run(cl.id);
            } else if (cName.includes('HER CHOICE')) {
                db.prepare("UPDATE products SET client_id = ? WHERE UPPER(name) LIKE '%HER CHOICE%' AND client_id IS NULL").run(cl.id);
            } else if (cName.includes('NATASHA')) {
                db.prepare("UPDATE products SET client_id = ? WHERE UPPER(name) LIKE '%NATASHA%' AND client_id IS NULL").run(cl.id);
            } else if (cName.includes('HANAPAM')) {
                db.prepare("UPDATE products SET client_id = ? WHERE UPPER(name) LIKE '%HANAPAM%' AND client_id IS NULL").run(cl.id);
            } else if (cName.includes('GELIS')) {
                db.prepare("UPDATE products SET client_id = ? WHERE UPPER(name) LIKE '%GELIS%' AND client_id IS NULL").run(cl.id);
            } else if (cName.includes('JGLOWW')) {
                db.prepare("UPDATE products SET client_id = ? WHERE UPPER(name) LIKE '%JGLOWW%' AND client_id IS NULL").run(cl.id);
            } else if (cName.includes('BRIGHTEST')) {
                db.prepare("UPDATE products SET client_id = ? WHERE UPPER(name) LIKE '%BRIGHTEST%' AND client_id IS NULL").run(cl.id);
            } else if (cName.includes('ROYCE')) {
                db.prepare("UPDATE products SET client_id = ? WHERE UPPER(name) LIKE '%ROYCE%' AND client_id IS NULL").run(cl.id);
            } else if (cName.includes('ELIXIA')) {
                db.prepare("UPDATE products SET client_id = ? WHERE UPPER(name) LIKE '%ELIXIA%' AND client_id IS NULL").run(cl.id);
            }
        }
    } catch (err) {
        console.warn('Brand clients auto-linking warning:', err.message);
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

    // Auto-provision Operational Staff Users
    try {
        const staffList = [
            { id: 'b0000000-0000-0000-0000-000000000001', name: 'Maria Elena Reyes', email: 'production@nkbmanufacturing.com', role: 'PRODUCTION' },
            { id: 'b0000000-0000-0000-0000-000000000002', name: 'Carlos Mendoza', email: 'warehouse@nkbmanufacturing.com', role: 'WAREHOUSE' },
            { id: 'b0000000-0000-0000-0000-000000000003', name: 'Angela Bautista', email: 'accounting@nkbmanufacturing.com', role: 'ACCOUNTING' },
            { id: 'b0000000-0000-0000-0000-000000000004', name: 'Roberto Tan', email: 'operations@nkbmanufacturing.com', role: 'ADMIN' }
        ];
        const staffPassHash = '$2b$10$JA4OfbHf9/X8FDSzKZIDCurQTAtDvKhjrS8QHaUSInuZ6iwCf1/GO'; // Staff123!

        for (const staff of staffList) {
            const existing = db.prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1").get(staff.email);
            if (!existing) {
                db.prepare(`
                    INSERT INTO users (id, name, email, password_hash, role, is_active)
                    VALUES (?, ?, ?, ?, ?, 1)
                `).run(staff.id, staff.name, staff.email, staffPassHash, staff.role);
                console.log(`👤 Auto-provisioned Staff: ${staff.name} (${staff.role})`);
            }
        }
    } catch (err) {
        console.error('Staff auto-provision error:', err.message);
    }

    // Auto-provision Product from phpMyAdmin screenshot: OXYGENATED SUNSCREEN (SKC-2026001)
    try {
        const prodId = '8b0747ec-ad8b-4b95-9c95-1c6c70844661';
        const existingProd = db.prepare('SELECT id FROM products WHERE id = ? OR sku = ?').get(prodId, 'SKC-2026001');
        if (!existingProd) {
            db.prepare(`
                INSERT INTO products (id, sku, name, category, description, unit, default_price, formula_code, shelf_life_months, current_stock, is_active)
                VALUES (?, 'SKC-2026001', 'OXYGENATED SUNSCREEN', 'Sun Care', 'Broad spectrum oxygenated protection sunscreen', 'KG', 350.00, 'SKC-0001', 24, 0, 1)
            `).run(prodId);
            console.log('🧴 Auto-provisioned product: OXYGENATED SUNSCREEN (SKC-2026001)');
        }

        // Link product to SKEENCARE Enterprise client catalog
        const clientId = '2fdb72bb-12fa-4909-8967-c19b130db4bb';
        const existingLink = db.prepare('SELECT id FROM client_product_prices WHERE client_id = ? AND product_id = ?').get(clientId, prodId);
        if (!existingLink) {
            db.prepare(`
                INSERT INTO client_product_prices (id, client_id, product_id, custom_sku, custom_name, custom_price, custom_formula_code, is_active)
                VALUES (?, ?, ?, 'SKC-2026001', 'OXYGENATED SUNSCREEN', 350.00, 'SKC-0001', 1)
            `).run(uuidv4(), clientId, prodId);
            console.log('🔗 Linked OXYGENATED SUNSCREEN to SKEENCARE Enterprise catalog');
        }
    } catch (err) {
        console.error('Product auto-provision error:', err.message);
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

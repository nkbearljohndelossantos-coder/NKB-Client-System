process.env.TZ = 'Asia/Manila';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbDriver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
const useMysql = dbDriver === 'mysql';

let db;

function runMigrations(dbInstance, isMysql) {
    try {
        const textType = isMysql ? 'VARCHAR(255)' : 'TEXT';
        const intType = isMysql ? 'TINYINT(1)' : 'INTEGER';
        const realType = isMysql ? 'DECIMAL(14,4)' : 'REAL';
        const batchCols = ['compounding_operator', 'bottling_lead', 'qc_inspector', 'line_assignment'];
        for (const col of batchCols) {
            try {
                dbInstance.exec(`ALTER TABLE production_batches ADD COLUMN ${col} ${textType};`);
            } catch (_) {}
        }
        try {
            dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN so_number ${textType};`);
        } catch (_) {}
        try {
            dbInstance.exec("UPDATE purchase_orders SET so_number = REPLACE(po_number, 'PO-', 'SO-') WHERE so_number IS NULL OR so_number = '';");
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE clients ADD COLUMN is_vyuceutical_ops ${intType} DEFAULT 0;`);
        } catch (_) {}
        try {
            dbInstance.exec("UPDATE clients SET is_vyuceutical_ops = 1 WHERE LOWER(company_name) LIKE '%vyuceutical%';");
        } catch (_) {}
        try {
            dbInstance.exec("UPDATE clients SET address = 'Phils.' WHERE address IS NULL OR TRIM(address) = '' OR address = '-' OR LOWER(TRIM(address)) = 'n/a';");
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE purchase_order_items ADD COLUMN item_name ${textType};`);
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN form_of_payment ${textType} DEFAULT 'COD / Bank Transfer';`);
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE users ADD COLUMN google_id ${textType};`);
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE users ADD COLUMN auth_provider ${textType} DEFAULT 'local';`);
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE users ADD COLUMN avatar_url ${textType};`);
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE payments ADD COLUMN attachment_url ${textType};`);
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE payments ADD COLUMN check_number ${textType};`);
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE payments ADD COLUMN bank_name ${textType};`);
        } catch (_) {}

        // Cheque Payables & COO Integration table
        if (isMysql) {
            try {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS cheque_payables (
                        id VARCHAR(36) PRIMARY KEY,
                        request_number VARCHAR(50) UNIQUE NOT NULL,
                        payee_name VARCHAR(255) NOT NULL,
                        amount DECIMAL(14,4) NOT NULL,
                        cheque_date VARCHAR(50) NOT NULL,
                        bank_name VARCHAR(100) NOT NULL,
                        bank_account_number VARCHAR(100) NULL,
                        cheque_number VARCHAR(100) NULL,
                        category VARCHAR(100) NOT NULL,
                        purpose TEXT NOT NULL,
                        invoice_reference VARCHAR(100) NULL,
                        attachment_url TEXT NULL,
                        status ENUM('PENDING_COO_APPROVAL', 'CONFIRMED', 'ISSUED', 'CLEARED', 'REJECTED', 'VOIDED') NOT NULL DEFAULT 'PENDING_COO_APPROVAL',
                        requested_by VARCHAR(36) NOT NULL,
                        requested_by_name VARCHAR(255) NOT NULL,
                        coo_decision VARCHAR(50) NULL,
                        coo_confirmed_by VARCHAR(255) NULL,
                        coo_confirmed_at VARCHAR(50) NULL,
                        coo_notes TEXT NULL,
                        api_key_used VARCHAR(100) DEFAULT 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_payables_status (status),
                        INDEX idx_payables_category (category),
                        INDEX idx_payables_date (cheque_date)
                    );
                `);
            } catch (_) {}
        } else {
            try {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS cheque_payables (
                        id TEXT PRIMARY KEY,
                        request_number TEXT UNIQUE NOT NULL,
                        payee_name TEXT NOT NULL,
                        amount REAL NOT NULL CHECK (amount > 0),
                        cheque_date TEXT NOT NULL,
                        bank_name TEXT NOT NULL,
                        bank_account_number TEXT,
                        cheque_number TEXT,
                        category TEXT NOT NULL,
                        purpose TEXT NOT NULL,
                        invoice_reference TEXT,
                        attachment_url TEXT,
                        status TEXT NOT NULL DEFAULT 'PENDING_COO_APPROVAL' CHECK (status IN ('PENDING_COO_APPROVAL', 'CONFIRMED', 'ISSUED', 'CLEARED', 'REJECTED', 'VOIDED')),
                        requested_by TEXT NOT NULL,
                        requested_by_name TEXT NOT NULL,
                        coo_decision TEXT,
                        coo_confirmed_by TEXT,
                        coo_confirmed_at TEXT,
                        coo_notes TEXT,
                        api_key_used TEXT DEFAULT 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b',
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        FOREIGN KEY (requested_by) REFERENCES users(id)
                    );
                    CREATE INDEX IF NOT EXISTS idx_payables_status ON cheque_payables(status);
                    CREATE INDEX IF NOT EXISTS idx_payables_category ON cheque_payables(category);
                    CREATE INDEX IF NOT EXISTS idx_payables_date ON cheque_payables(cheque_date);
                `);
            } catch (payablesErr) {
                console.warn('cheque_payables migration notice:', payablesErr.message);
            }
        }

        // Columns for cheque_payables
        try {
            dbInstance.exec(`ALTER TABLE cheque_payables ADD COLUMN cleared_at ${textType};`);
        } catch (_) {}
        try {
            dbInstance.exec(`ALTER TABLE cheque_payables ADD COLUMN bank_account_id ${textType};`);
        } catch (_) {}
        const newPayableCols = [
            'company_name',
            'payable_category',
            'invoice_number',
            'invoice_date',
            'terms',
            'due_date',
            'control_number',
            'line_items',
            'comments'
        ];
        for (const col of newPayableCols) {
            try {
                dbInstance.exec(`ALTER TABLE cheque_payables ADD COLUMN ${col} ${textType};`);
            } catch (_) {}
        }

        // Bank Accounts table
        if (isMysql) {
            try {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS bank_accounts (
                        id VARCHAR(36) PRIMARY KEY,
                        bank_name VARCHAR(100) NOT NULL,
                        account_number VARCHAR(100) NOT NULL,
                        account_name VARCHAR(255) NOT NULL,
                        account_type VARCHAR(50) DEFAULT 'Checking',
                        current_balance DECIMAL(14,4) NOT NULL DEFAULT 0.00,
                        is_active TINYINT(1) NOT NULL DEFAULT 1,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_ba_bank (bank_name)
                    );
                `);
            } catch (_) {}
        } else {
            try {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS bank_accounts (
                        id TEXT PRIMARY KEY,
                        bank_name TEXT NOT NULL,
                        account_number TEXT NOT NULL,
                        account_name TEXT NOT NULL,
                        account_type TEXT NOT NULL DEFAULT 'Checking',
                        current_balance REAL NOT NULL DEFAULT 0.0,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                    );
                    CREATE INDEX IF NOT EXISTS idx_ba_bank ON bank_accounts(bank_name);
                `);
            } catch (_) {}
        }

        // Seed Initial Bank Accounts if empty
        try {
            const count = dbInstance.prepare("SELECT COUNT(*) as count FROM bank_accounts").get()?.count || 0;
            if (count === 0) {
                const initialBanks = [
                    { id: 'ba-bdo-01', bank_name: 'BDO Unibank', account_number: '1029-3847-4821', account_name: 'NKB Manufacturing & Trading Corp.', account_type: 'Checking (Disbursement)', balance: 1850000.00 },
                    { id: 'ba-bpi-02', bank_name: 'Bank of the Philippine Islands (BPI)', account_number: '0982-3712-9104', account_name: 'NKB Manufacturing Corp.', account_type: 'Checking (Collections)', balance: 1420000.00 },
                    { id: 'ba-mb-03', bank_name: 'Metropolitan Bank & Trust Co. (Metrobank - Bacoor)', account_number: '788-7-78803245-1', account_name: 'NKB MANUFACTURING CORPORATION', account_type: 'Checking', balance: 980000.00 },
                    { id: 'ba-sec-04', bank_name: 'Security Bank (Imus Branch)', account_number: '0000079720871', account_name: 'NKB Manufacturing Corporation', account_type: 'Checking', balance: 750000.00 },
                    { id: 'ba-ub-05', bank_name: 'UnionBank of the Philippines', account_number: '1094-8273-6290', account_name: 'NKB Manufacturing Corp.', account_type: 'Digital / Checking', balance: 520000.00 }
                ];
                const insertStmt = dbInstance.prepare(`
                    INSERT INTO bank_accounts (id, bank_name, account_number, account_name, account_type, current_balance, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `);
                for (const b of initialBanks) {
                    insertStmt.run(b.id, b.bank_name, b.account_number, b.account_name, b.account_type, b.balance);
                }
            }
        } catch (_) {}

        // Ensure designated cheque disbursement bank accounts exist
        try {
            const requestedBanks = [
                { id: 'ba-bdo-coop', bank_name: 'BDO: Norvin Bella (COOP) - 0080-5801-0563', account_number: '0080-5801-0563', account_name: 'Norvin Bella (COOP)', account_type: 'Checking', balance: 650000.00 },
                { id: 'ba-bdo-nkb-mfg', bank_name: 'BDO: NKB Manufacturing Corporation - 0080-5801-0547', account_number: '0080-5801-0547', account_name: 'NKB Manufacturing Corporation', account_type: 'Checking', balance: 950000.00 },
                { id: 'ba-bdo-nkb-cosm', bank_name: 'BDO: NKB Cosmetics Manufacturing - 0105-4800-4829', account_number: '0105-4800-4829', account_name: 'NKB Cosmetics Manufacturing', account_type: 'Checking', balance: 800000.00 },
                { id: 'ba-bdo-nkb-cpt', bank_name: 'BDO: NKB Cosmetic Products Trading - 0105-4800-3245', account_number: '0105-4800-3245', account_name: 'NKB Cosmetic Products Trading', account_type: 'Checking', balance: 700000.00 },
                { id: 'ba-bdo-new-yra', bank_name: 'BDO: New Yra Enterprises - 0036-8801-3196', account_number: '0036-8801-3196', account_name: 'New Yra Enterprises', account_type: 'Checking', balance: 600000.00 },
                { id: 'ba-bdo-vyu', bank_name: 'BDO: Vyuceutical - 0080-5801-0717', account_number: '0080-5801-0717', account_name: 'Vyuceutical OPC', account_type: 'Checking', balance: 550000.00 },
                { id: 'ba-sec-nkb-mfg', bank_name: 'Security Bank: NKB Manufacturing Corporation - 0000079720871', account_number: '0000079720871', account_name: 'NKB Manufacturing Corporation', account_type: 'Checking', balance: 500000.00 },
                { id: 'ba-mb-nkb-mfg', bank_name: 'Metrobank: NKB Manufacturing Corporation - 788-7-78803245-1', account_number: '788-7-78803245-1', account_name: 'NKB MANUFACTURING CORPORATION', account_type: 'Checking', balance: 750000.00 }
            ];

            // Update legacy placeholder account numbers if present
            try {
                dbInstance.prepare("UPDATE bank_accounts SET account_number = '0000079720871', bank_name = 'Security Bank: NKB Manufacturing Corporation - 0000079720871' WHERE account_number = '3128-4902-1855' OR id = 'ba-sec-nkb-mfg'").run();
                dbInstance.prepare("UPDATE bank_accounts SET account_number = '788-7-78803245-1', bank_name = 'Metrobank: NKB Manufacturing Corporation - 788-7-78803245-1' WHERE account_number = '4562-8901-3372' OR id = 'ba-mb-03'").run();
            } catch (_) {}

            const checkStmt = dbInstance.prepare("SELECT id FROM bank_accounts WHERE account_number = ? OR bank_name = ?");
            const insertStmt = dbInstance.prepare(`
                INSERT INTO bank_accounts (id, bank_name, account_number, account_name, account_type, current_balance, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
            `);

            for (const b of requestedBanks) {
                const row = checkStmt.get(b.account_number, b.bank_name);
                if (!row) {
                    insertStmt.run(b.id, b.bank_name, b.account_number, b.account_name, b.account_type, b.balance);
                }
            }
        } catch (_) {}

        // Payable Companies Table
        if (isMysql) {
            try {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS payable_companies (
                        id VARCHAR(36) PRIMARY KEY,
                        name VARCHAR(255) UNIQUE NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );
                `);
            } catch (_) {}
        } else {
            try {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS payable_companies (
                        id TEXT PRIMARY KEY,
                        name TEXT UNIQUE NOT NULL,
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                    );
                `);
            } catch (_) {}
        }

        // Seed Default Payable Companies
        try {
            const defaultCompanies = [
                'NKB Manufacturing Corporation',
                'NKB Cosmetics Manufacturing',
                'Vyuceutical OPC',
                'NKB Manufacturing Coorporation - COOP',
                'New Yra Enterprises',
                'NKB Cosmetic Products Trading'
            ];
            for (const comp of defaultCompanies) {
                const id = 'comp-' + uuidv4().slice(0, 8);
                if (isMysql) {
                    dbInstance.exec(`INSERT IGNORE INTO payable_companies (id, name) VALUES ('${id}', '${comp.replace(/'/g, "\\'")}');`);
                } else {
                    dbInstance.prepare(`INSERT OR IGNORE INTO payable_companies (id, name) VALUES (?, ?)`).run(id, comp);
                }
            }
        } catch (_) {}

        // Client Payment Submissions (Payment Proofs uploaded by Clients)
        if (isMysql) {
            try {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS client_payment_submissions (
                        id VARCHAR(36) PRIMARY KEY,
                        submission_number VARCHAR(50) UNIQUE NOT NULL,
                        invoice_id VARCHAR(36) NOT NULL,
                        client_id VARCHAR(36) NOT NULL,
                        amount DECIMAL(14,4) NOT NULL,
                        payment_method VARCHAR(50) NOT NULL,
                        bank_name VARCHAR(100) NULL,
                        check_number VARCHAR(100) NULL,
                        check_date VARCHAR(50) NULL,
                        reference_number VARCHAR(100) NULL,
                        attachment_url TEXT NULL,
                        notes TEXT NULL,
                        status ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
                        reviewed_by VARCHAR(36) NULL,
                        reviewed_at VARCHAR(50) NULL,
                        rejection_reason TEXT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_cps_status (status),
                        INDEX idx_cps_invoice (invoice_id),
                        INDEX idx_cps_client (client_id)
                    );
                `);
            } catch (_) {}
        } else {
            try {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS client_payment_submissions (
                        id TEXT PRIMARY KEY,
                        submission_number TEXT UNIQUE NOT NULL,
                        invoice_id TEXT NOT NULL,
                        client_id TEXT NOT NULL,
                        amount REAL NOT NULL CHECK (amount > 0),
                        payment_method TEXT NOT NULL,
                        bank_name TEXT,
                        check_number TEXT,
                        check_date TEXT,
                        reference_number TEXT,
                        attachment_url TEXT,
                        notes TEXT,
                        status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
                        reviewed_by TEXT,
                        reviewed_at TEXT,
                        rejection_reason TEXT,
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id),
                        FOREIGN KEY (client_id) REFERENCES clients(id),
                        FOREIGN KEY (reviewed_by) REFERENCES users(id)
                    );
                    CREATE INDEX IF NOT EXISTS idx_cps_status ON client_payment_submissions(status);
                    CREATE INDEX IF NOT EXISTS idx_cps_invoice ON client_payment_submissions(invoice_id);
                    CREATE INDEX IF NOT EXISTS idx_cps_client ON client_payment_submissions(client_id);
                `);
            } catch (_) {}
        }
        if (isMysql) {
            try {
                dbInstance.exec("ALTER TABLE purchase_orders MODIFY COLUMN status ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED', 'COMPLETED', 'CANCELLED', 'VOIDED') NOT NULL DEFAULT 'PENDING_APPROVAL';");
            } catch (_) {}
        } else {
            try {
                const tableSql = dbInstance.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'purchase_orders'").get()?.sql || '';
                if (tableSql && !tableSql.includes('VOIDED')) {
                    dbInstance.exec(`
                        PRAGMA foreign_keys = OFF;
                        CREATE TABLE purchase_orders_new (
                            id TEXT PRIMARY KEY,
                            po_number TEXT UNIQUE NOT NULL,
                            so_number TEXT,
                            client_id TEXT NOT NULL,
                            po_date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
                            expected_delivery_date TEXT,
                            tolerance_percent REAL NOT NULL DEFAULT 10.0,
                            billing_policy TEXT NOT NULL DEFAULT 'ACTUAL_DELIVERY' CHECK (billing_policy IN ('ACTUAL_DELIVERY', 'FIXED_PO_BUFFER')),
                            status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED', 'COMPLETED', 'CANCELLED', 'VOIDED')),
                            notes TEXT,
                            subtotal REAL NOT NULL DEFAULT 0.0,
                            tax_percent REAL NOT NULL DEFAULT 0.0,
                            tax_amount REAL NOT NULL DEFAULT 0.0,
                            grand_total REAL NOT NULL DEFAULT 0.0,
                            created_by TEXT NOT NULL,
                            approved_by TEXT,
                            approved_at TEXT,
                            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
                            FOREIGN KEY (created_by) REFERENCES users(id)
                        );
                        INSERT INTO purchase_orders_new (id, po_number, so_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at, created_at, updated_at)
                        SELECT id, po_number, so_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at, created_at, updated_at FROM purchase_orders;
                        DROP TABLE purchase_orders;
                        ALTER TABLE purchase_orders_new RENAME TO purchase_orders;
                        CREATE INDEX IF NOT EXISTS idx_po_client ON purchase_orders(client_id);
                        CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
                        PRAGMA foreign_keys = ON;
                    `);
                }
            } catch (sqliteMigErr) {
                console.warn('SQLite purchase_orders status migration note:', sqliteMigErr.message);
            }
        }

        // Migrate users table to support IT_ADMIN and INVENTORY roles
        // Migrate users table to support PURCHASING role and plain_password
        if (isMysql) {
            try {
                dbInstance.exec("ALTER TABLE users MODIFY COLUMN role ENUM('SUPER_ADMIN', 'IT_ADMIN', 'ADMIN', 'CEO', 'QC', 'PURCHASING', 'PRODUCTION', 'WAREHOUSE', 'ACCOUNTING', 'INVENTORY', 'CLIENT') NOT NULL;");
            } catch (_) {}
            try {
                dbInstance.exec("ALTER TABLE users ADD COLUMN plain_password VARCHAR(255) NULL;");
            } catch (_) {}
        } else {
            try {
                // Ensure plain_password column exists in SQLite
                const colInfo = dbInstance.prepare("PRAGMA table_info(users)").all();
                const hasPlainPassword = colInfo.some(c => c.name === 'plain_password');
                if (!hasPlainPassword) {
                    try { dbInstance.exec("ALTER TABLE users ADD COLUMN plain_password TEXT;"); } catch (_) {}
                }

                const userSql = dbInstance.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || '';
                if (userSql && (!userSql.includes('CEO') || !userSql.includes('QC') || !userSql.includes('PURCHASING') || !userSql.includes('IT_ADMIN') || !userSql.includes('INVENTORY'))) {
                    dbInstance.exec(`
                        PRAGMA foreign_keys = OFF;
                        CREATE TABLE users_new (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            email TEXT UNIQUE NOT NULL,
                            password_hash TEXT NOT NULL,
                            plain_password TEXT,
                            role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'IT_ADMIN', 'ADMIN', 'CEO', 'QC', 'PURCHASING', 'PRODUCTION', 'WAREHOUSE', 'ACCOUNTING', 'INVENTORY', 'CLIENT')),
                            client_id TEXT,
                            phone TEXT,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
                        );
                        INSERT INTO users_new (id, name, email, password_hash, plain_password, role, client_id, phone, is_active, created_at, updated_at)
                        SELECT id, name, email, password_hash, plain_password, role, client_id, phone, is_active, created_at, updated_at FROM users;
                        DROP TABLE users;
                        ALTER TABLE users_new RENAME TO users;
                        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                        CREATE INDEX IF NOT EXISTS idx_users_client ON users(client_id);
                        PRAGMA foreign_keys = ON;
                    `);
                    console.log('✅ SQLite users table upgraded with CEO, QC, PURCHASING roles and plain_password');
                }
            } catch (uMigErr) {
                console.warn('SQLite users table migration note:', uMigErr.message);
            }
        }

        // Ensure voided POs are prefixed with VOID- so they do not block sequence numbering
        try {
            const voidedWithoutPrefix = dbInstance.prepare("SELECT id, po_number FROM purchase_orders WHERE status = 'VOIDED' AND po_number NOT LIKE 'VOID-%'").all();
            for (const vpo of voidedWithoutPrefix) {
                const targetPoNum = `VOID-${vpo.po_number}`;
                const exists = dbInstance.prepare("SELECT id FROM purchase_orders WHERE po_number = ?").get(targetPoNum);
                const finalPoNum = exists ? `VOID-${vpo.po_number}-${vpo.id.slice(0, 6)}` : targetPoNum;
                dbInstance.prepare("UPDATE purchase_orders SET po_number = ? WHERE id = ?").run(finalPoNum, vpo.id);
            }
        } catch (_) {}

        // User explicit correction: PO number 18 should be number 5
        try {
            const po18 = dbInstance.prepare("SELECT id FROM purchase_orders WHERE po_number = 'PO-2026-000018'").get();
            const po5Exists = dbInstance.prepare("SELECT id FROM purchase_orders WHERE po_number = 'PO-2026-000005'").get();
            if (po18 && !po5Exists) {
                dbInstance.prepare("UPDATE purchase_orders SET po_number = 'PO-2026-000005' WHERE id = ?").run(po18.id);
                try {
                    dbInstance.prepare("UPDATE audit_logs SET details = REPLACE(details, 'PO-2026-000018', 'PO-2026-000005') WHERE details LIKE '%PO-2026-000018%'").run();
                } catch (_) {}
            }
        } catch (_) {}

        // Tally SO numbers with PO numbers (specifically ensuring PO-5 has SO-5, not 18)
        try {
            dbInstance.prepare(`
                UPDATE purchase_orders 
                SET so_number = REPLACE(po_number, 'PO-', 'SO-') 
                WHERE po_number LIKE 'PO-%' AND (so_number IS NULL OR so_number != REPLACE(po_number, 'PO-', 'SO-'));
            `).run();
            try {
                dbInstance.prepare("UPDATE audit_logs SET details = REPLACE(details, 'SO-2026-000018', 'SO-2026-000005') WHERE details LIKE '%SO-2026-000018%'").run();
            } catch (_) {}
        } catch (_) {}

        // Keep document_sequences aligned with max active (non-voided) PO
        try {
            const year = new Date().getFullYear();
            const activeRows = dbInstance.prepare("SELECT po_number FROM purchase_orders WHERE status != 'VOIDED' AND po_number LIKE ?").all(`PO-${year}-%`);
            let maxSeq = 0;
            for (const row of activeRows) {
                const parts = row.po_number.split('-');
                if (parts.length === 3) {
                    const seq = parseInt(parts[2], 10);
                    if (!isNaN(seq) && seq > maxSeq) {
                        maxSeq = seq;
                    }
                }
            }
            if (maxSeq > 0) {
                const existingSeq = dbInstance.prepare("SELECT doc_type FROM document_sequences WHERE doc_type = 'PO'").get();
                if (existingSeq) {
                    dbInstance.prepare("UPDATE document_sequences SET current_year = ?, last_sequence = ? WHERE doc_type = 'PO'").run(year, maxSeq);
                } else {
                    dbInstance.prepare("INSERT INTO document_sequences (doc_type, current_year, last_sequence) VALUES ('PO', ?, ?)").run(year, maxSeq);
                }
            }
        } catch (_) {}
        // Ensure PO-2026-000004 is under Vyuceutical OPC (Janice Sandoval I)
        try {
            if (isMysql) {
                dbInstance.exec(`
                    UPDATE purchase_orders po 
                    JOIN clients c ON c.contact_person LIKE '%Janice Sandoval%' 
                    SET po.client_id = c.id 
                    WHERE po.po_number = 'PO-2026-000004';
                `);
            } else {
                dbInstance.exec(`
                    UPDATE purchase_orders 
                    SET client_id = (SELECT id FROM clients WHERE contact_person LIKE '%Janice Sandoval%' LIMIT 1) 
                    WHERE po_number = 'PO-2026-000004' 
                      AND EXISTS (SELECT 1 FROM clients WHERE contact_person LIKE '%Janice Sandoval%');
                `);
            }
        } catch (_) {}
        // Ensure all references to Vyuceutical OPS in clients, purchase_orders, and audit_logs are updated to Vyuceutical OPC
        try {
            dbInstance.exec(`
                UPDATE clients SET company_name = REPLACE(company_name, 'Vyuceutical OPS', 'Vyuceutical OPC') WHERE company_name LIKE '%Vyuceutical OPS%';
                UPDATE clients SET company_name = REPLACE(company_name, 'VYUCEUTICAL OPS', 'VYUCEUTICAL OPC') WHERE company_name LIKE '%VYUCEUTICAL OPS%';
                UPDATE clients SET company_name = REPLACE(company_name, 'OPS', 'OPC') WHERE company_name LIKE '%Vyuceutical%OPS%';
                UPDATE purchase_orders SET notes = REPLACE(notes, 'Vyuceutical OPS', 'Vyuceutical OPC') WHERE notes LIKE '%Vyuceutical OPS%';
                UPDATE purchase_orders SET notes = REPLACE(notes, 'VYUCEUTICAL OPS', 'VYUCEUTICAL OPC') WHERE notes LIKE '%VYUCEUTICAL OPS%';
                UPDATE audit_logs SET details = REPLACE(details, 'Vyuceutical OPS', 'Vyuceutical OPC') WHERE details LIKE '%Vyuceutical OPS%';
                UPDATE audit_logs SET details = REPLACE(details, 'VYUCEUTICAL OPS', 'VYUCEUTICAL OPC') WHERE details LIKE '%VYUCEUTICAL OPS%';
            `);
        } catch (_) {}
        // Clean item_name for all Vyuceutical PO items
        try {
            const brandList = [
                'HER CHOICE PH', 'HER CHOICE', 'BELLA SKIN', 'K BELLA SKIN', 'SKEENCARE',
                'NATASHA', 'HANAPAM', 'GELIS PHARMA', 'JGLOWW', 'BRIGHTEST SKIN',
                'BRIGHTEST', 'ROYCE B', 'ELIXIA', 'ADORN', 'CUTIS ANO NE',
                'TARATITAT', 'MAGNIFIQUE WHITE', 'DREAM GIRL', 'SABELA SKIN', 'KKSKIN.PH',
                'KYLE SKIN', 'RG LOVE', 'CZAR', 'MI.SKIN', 'EIGHT',
                'BEAUTAIN', 'BIOESSENCE', 'INTIMATE WHITE', 'JLS NO BRAND'
            ].sort((a, b) => b.length - a.length);

            const itemsToClean = dbInstance.prepare(`
                SELECT poi.id, poi.item_name, p.name as product_name
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.po_id = po.id
                JOIN clients c ON po.client_id = c.id
                JOIN products p ON poi.product_id = p.id
                WHERE (c.is_vyuceutical_ops = 1 OR LOWER(c.company_name) LIKE '%vyuceutical%')
            `).all();

            for (const it of itemsToClean) {
                const current = (it.item_name || it.product_name || '').trim();
                let cleaned = current;
                cleaned = cleaned.replace(/^SUS\s*[-:–—]?\s*/i, '');
                for (const b of brandList) {
                    const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const reg = new RegExp('^' + esc + '\\s*[-:–—]?\\s*', 'i');
                    if (reg.test(cleaned)) {
                        cleaned = cleaned.replace(reg, '');
                        cleaned = cleaned.replace(new RegExp('\\(' + esc + '\\s*[-:–—]?\\s*', 'gi'), '(');
                        cleaned = cleaned.replace(/^SUS\s*[-:–—]?\s*/i, '');
                        break;
                    }
                }
                cleaned = cleaned.trim() || current;
                if (cleaned !== it.item_name) {
                    dbInstance.prepare('UPDATE purchase_order_items SET item_name = ? WHERE id = ?').run(cleaned, it.id);
                }
            }
        } catch (cleanErr) {
            console.warn('Item name cleaning note:', cleanErr.message);
        }

        // Schema Upgrades: Purchase Orders Confirmation & Raw Materials Management
        const poCols = [
            { name: 'accounting_confirmed', type: `${intType} DEFAULT 0` },
            { name: 'accounting_confirmed_at', type: textType },
            { name: 'accounting_confirmed_by', type: textType },
            { name: 'inventory_confirmed', type: `${intType} DEFAULT 0` },
            { name: 'inventory_confirmed_at', type: textType },
            { name: 'inventory_confirmed_by', type: textType },
            { name: 'raw_materials_status', type: `${textType} DEFAULT 'PENDING_CHECK'` },
            { name: 'formulation_converted', type: `${intType} DEFAULT 0` },
            { name: 'formulation_converted_at', type: textType }
        ];
        for (const col of poCols) {
            try {
                dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN ${col.name} ${col.type};`);
            } catch (_) {}
        }

        // Schema Upgrades: Users Table for AFK Sleep Timer & PIN Screen Lock
        const userCols = [
            { name: 'security_pin', type: textType },
            { name: 'auto_lock_minutes', type: `${intType} DEFAULT 5` }
        ];
        for (const col of userCols) {
            try {
                dbInstance.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type};`);
            } catch (_) {}
        }

        // Create product_formulations, formulation_ingredients, and order_material_conversions tables
        try {
            if (isMysql) {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS product_formulations (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        product_id VARCHAR(36) NOT NULL,
                        formula_code VARCHAR(100) NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        base_dose_qty DECIMAL(10,2) NOT NULL DEFAULT 1.00,
                        base_unit VARCHAR(50) NOT NULL DEFAULT 'pcs',
                        instructions TEXT NULL,
                        is_confidential TINYINT(1) NOT NULL DEFAULT 1,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_pf_product (product_id),
                        INDEX idx_pf_formula_code (formula_code)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                    CREATE TABLE IF NOT EXISTS formulation_ingredients (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        formulation_id VARCHAR(36) NOT NULL,
                        material_code VARCHAR(100) NOT NULL,
                        material_name VARCHAR(255) NOT NULL,
                        phase VARCHAR(50) NOT NULL DEFAULT 'Phase A',
                        percentage DECIMAL(6,3) NOT NULL DEFAULT 0.000,
                        quantity_per_unit DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
                        unit VARCHAR(50) NOT NULL DEFAULT 'g',
                        unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
                        notes TEXT NULL,
                        sort_order INT DEFAULT 0,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_fi_formulation (formulation_id),
                        INDEX idx_fi_material_code (material_code)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                    CREATE TABLE IF NOT EXISTS order_material_conversions (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        po_id VARCHAR(36) NOT NULL,
                        po_item_id VARCHAR(36) NULL,
                        product_id VARCHAR(36) NOT NULL,
                        formula_code VARCHAR(100) NULL,
                        material_code VARCHAR(100) NOT NULL,
                        material_name VARCHAR(255) NOT NULL,
                        phase VARCHAR(50) NULL DEFAULT 'Phase A',
                        percentage DECIMAL(6,3) NULL DEFAULT 0.000,
                        unit_quantity DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
                        total_quantity DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
                        unit VARCHAR(50) NOT NULL DEFAULT 'g',
                        unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
                        total_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
                        status VARCHAR(50) NOT NULL DEFAULT 'ALLOCATED',
                        converted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_omc_po (po_id),
                        INDEX idx_omc_product (product_id),
                        INDEX idx_omc_material (material_code)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `);
            } else {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS product_formulations (
                        id TEXT PRIMARY KEY,
                        product_id TEXT NOT NULL,
                        formula_code TEXT NOT NULL,
                        name TEXT NOT NULL,
                        base_dose_qty REAL NOT NULL DEFAULT 1.0,
                        base_unit TEXT NOT NULL DEFAULT 'pcs',
                        instructions TEXT,
                        is_confidential INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_pf_product ON product_formulations(product_id);
                    CREATE INDEX IF NOT EXISTS idx_pf_formula_code ON product_formulations(formula_code);

                    CREATE TABLE IF NOT EXISTS formulation_ingredients (
                        id TEXT PRIMARY KEY,
                        formulation_id TEXT NOT NULL,
                        material_code TEXT NOT NULL,
                        material_name TEXT NOT NULL,
                        phase TEXT NOT NULL DEFAULT 'Phase A',
                        percentage REAL NOT NULL DEFAULT 0.0,
                        quantity_per_unit REAL NOT NULL DEFAULT 0.0,
                        unit TEXT NOT NULL DEFAULT 'g',
                        unit_cost REAL NOT NULL DEFAULT 0.0,
                        notes TEXT,
                        sort_order INTEGER DEFAULT 0,
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        FOREIGN KEY (formulation_id) REFERENCES product_formulations(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_fi_formulation ON formulation_ingredients(formulation_id);
                    CREATE INDEX IF NOT EXISTS idx_fi_material_code ON formulation_ingredients(material_code);

                    CREATE TABLE IF NOT EXISTS order_material_conversions (
                        id TEXT PRIMARY KEY,
                        po_id TEXT NOT NULL,
                        po_item_id TEXT,
                        product_id TEXT NOT NULL,
                        formula_code TEXT,
                        material_code TEXT NOT NULL,
                        material_name TEXT NOT NULL,
                        phase TEXT DEFAULT 'Phase A',
                        percentage REAL DEFAULT 0.0,
                        unit_quantity REAL NOT NULL DEFAULT 0.0,
                        total_quantity REAL NOT NULL DEFAULT 0.0,
                        unit TEXT NOT NULL DEFAULT 'g',
                        unit_cost REAL NOT NULL DEFAULT 0.0,
                        total_cost REAL NOT NULL DEFAULT 0.0,
                        status TEXT NOT NULL DEFAULT 'ALLOCATED',
                        converted_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
                        FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id) ON DELETE CASCADE,
                        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
                    );
                    CREATE INDEX IF NOT EXISTS idx_omc_po ON order_material_conversions(po_id);
                    CREATE INDEX IF NOT EXISTS idx_omc_product ON order_material_conversions(product_id);
                    CREATE INDEX IF NOT EXISTS idx_omc_material ON order_material_conversions(material_code);
                `);
            }

            // Schema Upgrades: User Online Presence & Formulation Material Pricing
            if (!isMysql) {
                try {
                    const userCols = dbInstance.prepare("PRAGMA table_info(users)").all().map(c => c.name);
                    if (!userCols.includes('last_active_at')) {
                        dbInstance.exec("ALTER TABLE users ADD COLUMN last_active_at TEXT;");
                    }
                } catch (_) {}

                try {
                    const pfCols = dbInstance.prepare("PRAGMA table_info(product_formulations)").all().map(c => c.name);
                    if (pfCols.length > 0) {
                        if (!pfCols.includes('compounding_code')) dbInstance.exec("ALTER TABLE product_formulations ADD COLUMN compounding_code TEXT;");
                        if (!pfCols.includes('active_version')) dbInstance.exec("ALTER TABLE product_formulations ADD COLUMN active_version TEXT DEFAULT 'V1.0';");
                        if (!pfCols.includes('version_status')) dbInstance.exec("ALTER TABLE product_formulations ADD COLUMN version_status TEXT DEFAULT 'APPROVED';");
                        if (!pfCols.includes('fms_formula_id')) dbInstance.exec("ALTER TABLE product_formulations ADD COLUMN fms_formula_id INTEGER;");
                    }
                } catch (_) {}

                try {
                    const fiCols = dbInstance.prepare("PRAGMA table_info(formulation_ingredients)").all().map(c => c.name);
                    if (fiCols.length > 0) {
                        if (!fiCols.includes('unit_cost')) {
                            dbInstance.exec("ALTER TABLE formulation_ingredients ADD COLUMN unit_cost REAL DEFAULT 0.0;");
                        }
                        if (!fiCols.includes('supplier')) {
                            dbInstance.exec("ALTER TABLE formulation_ingredients ADD COLUMN supplier TEXT;");
                        }
                    }
                } catch (_) {}

                try {
                    const omcCols = dbInstance.prepare("PRAGMA table_info(order_material_conversions)").all().map(c => c.name);
                    if (omcCols.length > 0) {
                        if (!omcCols.includes('unit_cost')) {
                            dbInstance.exec("ALTER TABLE order_material_conversions ADD COLUMN unit_cost REAL DEFAULT 0.0;");
                        }
                        if (!omcCols.includes('total_cost')) {
                            dbInstance.exec("ALTER TABLE order_material_conversions ADD COLUMN total_cost REAL DEFAULT 0.0;");
                        }
                    }
                } catch (_) {}
            } else {
                try { dbInstance.exec("ALTER TABLE users ADD COLUMN last_active_at VARCHAR(255) NULL;"); } catch (_) {}
                try { dbInstance.exec("ALTER TABLE product_formulations ADD COLUMN compounding_code VARCHAR(100) NULL;"); } catch (_) {}
                try { dbInstance.exec("ALTER TABLE product_formulations ADD COLUMN active_version VARCHAR(50) DEFAULT 'V1.0';"); } catch (_) {}
                try { dbInstance.exec("ALTER TABLE product_formulations ADD COLUMN version_status VARCHAR(50) DEFAULT 'APPROVED';"); } catch (_) {}
                try { dbInstance.exec("ALTER TABLE product_formulations ADD COLUMN fms_formula_id INT NULL;"); } catch (_) {}
                try { dbInstance.exec("ALTER TABLE formulation_ingredients ADD COLUMN unit_cost DECIMAL(12,4) DEFAULT 0.0000;"); } catch (_) {}
                try { dbInstance.exec("ALTER TABLE formulation_ingredients ADD COLUMN supplier VARCHAR(100) NULL;"); } catch (_) {}
                try { dbInstance.exec("ALTER TABLE order_material_conversions ADD COLUMN unit_cost DECIMAL(12,4) DEFAULT 0.0000;"); } catch (_) {}
                try { dbInstance.exec("ALTER TABLE order_material_conversions ADD COLUMN total_cost DECIMAL(14,4) DEFAULT 0.0000;"); } catch (_) {}
            }

            // Auto-seed default product formulations
            try {
                const { seedDefaultFormulations } = require('../services/formulationService');
                seedDefaultFormulations(dbInstance);
            } catch (seedErr) {
                console.warn('Formulation seeding note:', seedErr.message);
            }
        } catch (formErr) {
            console.warn('Formulation tables init note:', formErr.message);
        }

        // Create supply_requests table for Purchasing Department requisitions
        try {
            if (isMysql) {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS supply_requests (
                        id VARCHAR(36) PRIMARY KEY,
                        po_id VARCHAR(36) NOT NULL,
                        requested_by VARCHAR(36) NOT NULL,
                        department VARCHAR(100) NOT NULL DEFAULT 'Purchasing Department',
                        materials_needed TEXT NOT NULL,
                        urgency VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
                        target_date VARCHAR(50),
                        notes TEXT,
                        status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_sr_po (po_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `);
            } else {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS supply_requests (
                        id TEXT PRIMARY KEY,
                        po_id TEXT NOT NULL,
                        requested_by TEXT NOT NULL,
                        department TEXT NOT NULL DEFAULT 'Purchasing Department',
                        materials_needed TEXT NOT NULL,
                        urgency TEXT NOT NULL DEFAULT 'NORMAL',
                        target_date TEXT,
                        notes TEXT,
                        status TEXT NOT NULL DEFAULT 'SUBMITTED',
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                    );
                `);
            }
        } catch (srErr) {
            console.warn('Supply requests table init note:', srErr.message);
        }

        // Existing active orders are marked as confirmed
        try {
            dbInstance.exec(`
                UPDATE purchase_orders 
                SET accounting_confirmed = 1, inventory_confirmed = 1, raw_materials_status = 'SUFFICIENT' 
                WHERE status IN ('APPROVED', 'IN_PRODUCTION', 'COMPLETED') 
                AND (accounting_confirmed = 0 OR accounting_confirmed IS NULL);
            `);
        } catch (_) {}

        // Create chat_messages table for Enterprise Chat System
        try {
            if (isMysql) {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS chat_messages (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        sender_id VARCHAR(36) NOT NULL,
                        receiver_id VARCHAR(36) NULL,
                        channel_type VARCHAR(50) NOT NULL DEFAULT 'DIRECT',
                        target_role VARCHAR(50) NULL,
                        message TEXT NOT NULL,
                        is_support TINYINT(1) NOT NULL DEFAULT 0,
                        is_read TINYINT(1) NOT NULL DEFAULT 0,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_cm_sender (sender_id),
                        INDEX idx_cm_receiver (receiver_id),
                        INDEX idx_cm_channel (channel_type),
                        INDEX idx_cm_created (created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `);
            } else {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS chat_messages (
                        id TEXT PRIMARY KEY,
                        sender_id TEXT NOT NULL,
                        receiver_id TEXT,
                        channel_type TEXT NOT NULL DEFAULT 'DIRECT',
                        target_role TEXT,
                        message TEXT NOT NULL,
                        is_support INTEGER NOT NULL DEFAULT 0,
                        is_read INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_cm_sender ON chat_messages(sender_id);
                    CREATE INDEX IF NOT EXISTS idx_cm_receiver ON chat_messages(receiver_id);
                    CREATE INDEX IF NOT EXISTS idx_cm_channel ON chat_messages(channel_type);
                `);
            }
        } catch (cmErr) {
            console.warn('Chat messages table init note:', cmErr.message);
        }

        // Create support_inquiries table for Online Inquiries & IT Support
        try {
            if (isMysql) {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS support_inquiries (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        email VARCHAR(255) NOT NULL,
                        phone VARCHAR(50) NULL,
                        company_name VARCHAR(255) NULL,
                        subject VARCHAR(255) NULL,
                        message TEXT NOT NULL,
                        status VARCHAR(50) NOT NULL DEFAULT 'NEW',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        resolved_at DATETIME NULL,
                        notes TEXT NULL,
                        INDEX idx_inq_email (email),
                        INDEX idx_inq_status (status),
                        INDEX idx_inq_created (created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `);
            } else {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS support_inquiries (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        email TEXT NOT NULL,
                        phone TEXT,
                        company_name TEXT,
                        subject TEXT,
                        message TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'NEW',
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        resolved_at TEXT,
                        notes TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_inq_email ON support_inquiries(email);
                    CREATE INDEX IF NOT EXISTS idx_inq_status ON support_inquiries(status);
                    CREATE INDEX IF NOT EXISTS idx_inq_created ON support_inquiries(created_at);
                `);
            }
        } catch (inqErr) {
            console.warn('Support inquiries table init note:', inqErr.message);
        }

        // Dispatch Notifications (WhatsApp / SMS milestones)
        try {
            if (isMysql) {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS dispatch_notifications (
                        id VARCHAR(36) PRIMARY KEY,
                        dr_id VARCHAR(36) NOT NULL,
                        po_id VARCHAR(36) NOT NULL,
                        client_id VARCHAR(36) NOT NULL,
                        channel VARCHAR(50) NOT NULL,
                        recipient_phone VARCHAR(50) NULL,
                        recipient_name VARCHAR(255) NULL,
                        message TEXT NOT NULL,
                        status VARCHAR(50) NOT NULL DEFAULT 'SENT',
                        sent_by VARCHAR(36) NULL,
                        sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_dn_dr (dr_id),
                        INDEX idx_dn_po (po_id),
                        INDEX idx_dn_client (client_id),
                        INDEX idx_dn_sent (sent_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `);
            } else {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS dispatch_notifications (
                        id TEXT PRIMARY KEY,
                        dr_id TEXT NOT NULL,
                        po_id TEXT NOT NULL,
                        client_id TEXT NOT NULL,
                        channel TEXT NOT NULL,
                        recipient_phone TEXT,
                        recipient_name TEXT,
                        message TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'SENT',
                        sent_by TEXT,
                        sent_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        FOREIGN KEY (dr_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE,
                        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_dn_dr ON dispatch_notifications(dr_id);
                    CREATE INDEX IF NOT EXISTS idx_dn_po ON dispatch_notifications(po_id);
                    CREATE INDEX IF NOT EXISTS idx_dn_client ON dispatch_notifications(client_id);
                    CREATE INDEX IF NOT EXISTS idx_dn_sent ON dispatch_notifications(sent_at);
                `);
            }
        } catch (dnErr) {
            console.warn('dispatch_notifications table init note:', dnErr.message);
        }

        // Add self-healing columns to delivery_receipts
        try { dbInstance.exec(`ALTER TABLE delivery_receipts ADD COLUMN whatsapp_notified_at ${textType};`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE delivery_receipts ADD COLUMN sms_notified_at ${textType};`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE delivery_receipts ADD COLUMN dispatch_message ${textType};`); } catch (_) {}

        // Seed IT Admin, Inventory & Purchasing users if not already present
        try {
            const itAdminEmail = 'itadmin@nkbmanufacturing.com';
            const existingIT = dbInstance.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(itAdminEmail);
            if (!existingIT) {
                const salt = bcrypt.genSaltSync(10);
                const itHash = bcrypt.hashSync('ITAdminPassword@2026!', salt);
                dbInstance.prepare(`
                    INSERT INTO users (id, name, email, password_hash, plain_password, role, is_active, created_at, updated_at)
                    VALUES (?, 'IT Administrator', ?, ?, 'ITAdminPassword@2026!', 'IT_ADMIN', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(uuidv4(), itAdminEmail, itHash);
                console.log('✅ Created IT Admin user: itadmin@nkbmanufacturing.com');
            }

            const invEmail = 'inventory@nkbmanufacturing.com';
            const existingInv = dbInstance.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(invEmail);
            if (!existingInv) {
                const salt = bcrypt.genSaltSync(10);
                const invHash = bcrypt.hashSync('Inventory123!', salt);
                dbInstance.prepare(`
                    INSERT INTO users (id, name, email, password_hash, plain_password, role, is_active, created_at, updated_at)
                    VALUES (?, 'Inventory Officer', ?, ?, 'Staff123!', 'INVENTORY', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(uuidv4(), invEmail, invHash);
                console.log('✅ Created Inventory user: inventory@nkbmanufacturing.com');
            }

            const purchEmail = 'purchasing@nkbmanufacturing.com';
            const existingPurch = dbInstance.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(purchEmail);
            if (!existingPurch) {
                const salt = bcrypt.genSaltSync(10);
                const purchHash = bcrypt.hashSync('Staff123!', salt);
                dbInstance.prepare(`
                    INSERT INTO users (id, name, email, password_hash, plain_password, role, is_active, created_at, updated_at)
                    VALUES (?, 'Purchasing Officer', ?, ?, 'Staff123!', 'PURCHASING', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(uuidv4(), purchEmail, purchHash);
                console.log('✅ Created Purchasing user: purchasing@nkbmanufacturing.com');
            }

            const ceoEmail = 'ceo@nkbmanufacturing.com';
            const existingCeo = dbInstance.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(ceoEmail);
            if (!existingCeo) {
                const salt = bcrypt.genSaltSync(10);
                const ceoHash = bcrypt.hashSync('Executive123!', salt);
                dbInstance.prepare(`
                    INSERT INTO users (id, name, email, password_hash, plain_password, role, is_active, created_at, updated_at)
                    VALUES (?, 'Chief Executive Officer', ?, ?, 'Executive123!', 'CEO', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(uuidv4(), ceoEmail, ceoHash);
                console.log('✅ Created CEO user: ceo@nkbmanufacturing.com');
            }

            const qcEmail = 'qc@nkbmanufacturing.com';
            const existingQc = dbInstance.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(qcEmail);
            if (!existingQc) {
                const salt = bcrypt.genSaltSync(10);
                const qcHash = bcrypt.hashSync('Staff123!', salt);
                dbInstance.prepare(`
                    INSERT INTO users (id, name, email, password_hash, plain_password, role, is_active, created_at, updated_at)
                    VALUES (?, 'Quality Control Inspector', ?, ?, 'Staff123!', 'QC', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(uuidv4(), qcEmail, qcHash);
                console.log('✅ Created QC user: qc@nkbmanufacturing.com');
            }
        } catch (userSeedErr) {
            console.warn('User seed note:', userSeedErr.message);
        }

        // Create api_keys and webhooks tables for Developer REST API v1
        try {
            if (isMysql) {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS api_keys (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        key_prefix VARCHAR(32) NOT NULL,
                        key_hash VARCHAR(64) NOT NULL UNIQUE,
                        client_id VARCHAR(36) NULL,
                        user_id VARCHAR(36) NOT NULL,
                        scopes TEXT NOT NULL,
                        rate_limit_rpm INT NOT NULL DEFAULT 120,
                        status ENUM('ACTIVE', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
                        last_used_at DATETIME NULL,
                        expires_at DATETIME NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_api_keys_hash (key_hash),
                        INDEX idx_api_keys_client (client_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                    CREATE TABLE IF NOT EXISTS webhooks (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        api_key_id VARCHAR(36) NULL,
                        url VARCHAR(500) NOT NULL,
                        events TEXT NOT NULL,
                        secret VARCHAR(255) NULL,
                        is_active TINYINT(1) NOT NULL DEFAULT 1,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_webhooks_key (api_key_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `);
            } else {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS api_keys (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        key_prefix TEXT NOT NULL,
                        key_hash TEXT NOT NULL UNIQUE,
                        client_id TEXT,
                        user_id TEXT NOT NULL,
                        scopes TEXT NOT NULL DEFAULT '["orders:read","products:read"]',
                        rate_limit_rpm INTEGER NOT NULL DEFAULT 120,
                        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
                        last_used_at TEXT,
                        expires_at TEXT,
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
                    CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys(client_id);

                    CREATE TABLE IF NOT EXISTS webhooks (
                        id TEXT PRIMARY KEY,
                        api_key_id TEXT,
                        url TEXT NOT NULL,
                        events TEXT NOT NULL DEFAULT '["*"]',
                        secret TEXT,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_webhooks_key ON webhooks(api_key_id);
                `);
            }
        } catch (apiKeysErr) {
            console.warn('API keys table init note:', apiKeysErr.message);
        }

        // Production Supervisor Priority, Active Today & Reminder Auto-Prioritization Columns on purchase_orders
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN priority_status ${textType} DEFAULT 'NORMAL';`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN priority_order ${intType} DEFAULT 100;`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN is_active_today ${intType} DEFAULT 0;`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN production_notes ${textType};`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN reminder_at ${textType};`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN auto_priority_target ${textType} DEFAULT 'PRIORITIZED';`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN auto_active_today ${intType} DEFAULT 1;`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN reminder_note ${textType};`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN reminder_triggered ${intType} DEFAULT 0;`); } catch (_) {}
        try { dbInstance.exec(`ALTER TABLE purchase_orders ADD COLUMN reminder_dismissed ${intType} DEFAULT 0;`); } catch (_) {}

        // Warehouse Raw Materials Inventory Table
        try {
            if (isMysql) {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS raw_materials_inventory (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        material_code VARCHAR(100) UNIQUE NOT NULL,
                        material_name VARCHAR(255) NOT NULL,
                        category VARCHAR(100) NOT NULL DEFAULT 'Active Ingredients',
                        supplier VARCHAR(255) NULL,
                        current_stock DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
                        unit VARCHAR(50) NOT NULL DEFAULT 'kg',
                        minimum_stock_level DECIMAL(14,4) NOT NULL DEFAULT 10.0000,
                        unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
                        location VARCHAR(100) DEFAULT 'Warehouse Zone A',
                        batch_lot_number VARCHAR(100) NULL,
                        expiry_date VARCHAR(50) NULL,
                        status VARCHAR(50) NOT NULL DEFAULT 'IN_STOCK',
                        notes TEXT NULL,
                        updated_by VARCHAR(255) NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_rmi_code (material_code),
                        INDEX idx_rmi_category (category),
                        INDEX idx_rmi_status (status)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `);
            } else {
                dbInstance.exec(`
                    CREATE TABLE IF NOT EXISTS raw_materials_inventory (
                        id TEXT PRIMARY KEY,
                        material_code TEXT UNIQUE NOT NULL,
                        material_name TEXT NOT NULL,
                        category TEXT NOT NULL DEFAULT 'Active Ingredients',
                        supplier TEXT,
                        current_stock REAL NOT NULL DEFAULT 0.0,
                        unit TEXT NOT NULL DEFAULT 'kg',
                        minimum_stock_level REAL NOT NULL DEFAULT 10.0,
                        unit_cost REAL NOT NULL DEFAULT 0.0,
                        location TEXT DEFAULT 'Warehouse Zone A',
                        batch_lot_number TEXT,
                        expiry_date TEXT,
                        status TEXT NOT NULL DEFAULT 'IN_STOCK',
                        notes TEXT,
                        updated_by TEXT,
                        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                    );
                    CREATE INDEX IF NOT EXISTS idx_rmi_code ON raw_materials_inventory(material_code);
                    CREATE INDEX IF NOT EXISTS idx_rmi_category ON raw_materials_inventory(category);
                    CREATE INDEX IF NOT EXISTS idx_rmi_status ON raw_materials_inventory(status);
                `);
            }

            try { dbInstance.exec(`ALTER TABLE raw_materials_inventory ADD COLUMN is_fast_moving ${intType} DEFAULT 0;`); } catch (_) {}

            // Seed initial warehouse raw materials if table is empty
            const rmCount = dbInstance.prepare('SELECT COUNT(*) as count FROM raw_materials_inventory').get()?.count || 0;
            if (rmCount === 0) {
                const defaultMaterials = [
                    { code: 'RM-WTR-01', name: 'Deionized Water (Aqua USP)', category: 'Base & Solvents', supplier: 'NKB PureWater Plant', stock: 2500.0, unit: 'L', min: 500.0, cost: 20.0, loc: 'Tank Farm A-1', lot: 'LOT-AQ-202609', exp: '2027-09-30', fast: 1 },
                    { code: 'RM-GLY-01', name: 'Vegetable Glycerin 99.7% USP', category: 'Humectants & Emollients', supplier: 'Chemrez Technologies', stock: 450.0, unit: 'kg', min: 100.0, cost: 180.0, loc: 'Rack A-02', lot: 'LOT-GLY-8821', exp: '2028-03-15', fast: 1 },
                    { code: 'RM-NIA-01', name: 'Niacinamide USP (Vitamin B3)', category: 'Active Ingredients', supplier: 'DSM Nutritional Products', stock: 85.0, unit: 'kg', min: 25.0, cost: 1800.0, loc: 'Cold Room B-01', lot: 'LOT-NIA-4410', exp: '2027-12-01', fast: 1 },
                    { code: 'RM-KJC-01', name: 'Kojic Acid Dipalmitate Pure', category: 'Active Ingredients', supplier: 'SinoLion Cosmetics', stock: 18.5, unit: 'kg', min: 25.0, cost: 4200.0, loc: 'Cold Room B-02', lot: 'LOT-KJC-9012', exp: '2027-08-20', fast: 1 },
                    { code: 'RM-ARB-01', name: 'Alpha Arbutin Crystalline Powder', category: 'Active Ingredients', supplier: 'Pentapharm / DSM', stock: 12.0, unit: 'kg', min: 10.0, cost: 6500.0, loc: 'Cold Room B-03', lot: 'LOT-ARB-3319', exp: '2027-11-10', fast: 0 },
                    { code: 'RM-HYA-01', name: 'Sodium Hyaluronate (Multi-Molecular HA)', category: 'Active Ingredients', supplier: 'Bloomage Freda Biopharm', stock: 8.0, unit: 'kg', min: 5.0, cost: 12000.0, loc: 'Cold Room B-04', lot: 'LOT-HYA-7741', exp: '2027-10-05', fast: 0 },
                    { code: 'RM-CTA-01', name: 'Cetostearyl Alcohol 30/70 NF', category: 'Emulsifiers & Waxes', supplier: 'Kao Chemicals Global', stock: 320.0, unit: 'kg', min: 75.0, cost: 450.0, loc: 'Rack C-01', lot: 'LOT-CTA-5520', exp: '2028-05-01', fast: 1 },
                    { code: 'RM-STA-01', name: 'Triple Pressed Stearic Acid', category: 'Emulsifiers & Waxes', supplier: 'Wilmar Oleochemicals', stock: 210.0, unit: 'kg', min: 50.0, cost: 350.0, loc: 'Rack C-02', lot: 'LOT-STA-6612', exp: '2028-06-15', fast: 0 },
                    { code: 'RM-OMC-01', name: 'Octyl Methoxycinnamate (UVB Filter)', category: 'UV Filters & Actives', supplier: 'BASF Care Creations', stock: 65.0, unit: 'kg', min: 30.0, cost: 2200.0, loc: 'Rack D-01', lot: 'LOT-OMC-1190', exp: '2027-07-30', fast: 0 },
                    { code: 'RM-TIO-01', name: 'Micronized Titanium Dioxide (SPF Grade)', category: 'UV Filters & Actives', supplier: 'Tayca Corporation', stock: 40.0, unit: 'kg', min: 20.0, cost: 1500.0, loc: 'Rack D-02', lot: 'LOT-TIO-2284', exp: '2028-09-01', fast: 0 },
                    { code: 'RM-PHX-01', name: 'Phenoxyethanol & Ethylhexylglycerin', category: 'Preservatives & Stabilizers', supplier: 'Schülke & Mayr (Euxyl)', stock: 95.0, unit: 'kg', min: 20.0, cost: 950.0, loc: 'Rack E-01', lot: 'LOT-PHX-3091', exp: '2028-01-20', fast: 1 },
                    { code: 'RM-FRG-01', name: 'Signature Floral & Dewdrop Fragrance Oil', category: 'Fragrances & Essential Oils', supplier: 'Givaudan Fragrances', stock: 14.0, unit: 'kg', min: 15.0, cost: 2500.0, loc: 'Aroma Vault F-01', lot: 'LOT-FRG-7102', exp: '2027-06-30', fast: 0 },
                    { code: 'PK-BOT-100', name: '100mL Frosted Airless Pump Bottle (White/Gold)', category: 'Packaging & Containers', supplier: 'Manila Packaging Corp.', stock: 18500, unit: 'pcs', min: 5000, cost: 18.50, loc: 'Packaging Bay P-01', lot: 'LOT-PK-2026A', exp: 'N/A', fast: 1 },
                    { code: 'PK-TUB-50', name: '50g Soft-Touch Cosmetic Squeeze Tube', category: 'Packaging & Containers', supplier: 'AsiaPlast Packaging', stock: 3200, unit: 'pcs', min: 5000, cost: 12.00, loc: 'Packaging Bay P-02', lot: 'LOT-PK-2026B', exp: 'N/A', fast: 1 }
                ];
                const insRm = dbInstance.prepare(`
                    INSERT INTO raw_materials_inventory
                    (id, material_code, material_name, category, supplier, current_stock, unit, minimum_stock_level, unit_cost, location, batch_lot_number, expiry_date, status, is_fast_moving, notes, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'System Seed')
                `);
                for (const m of defaultMaterials) {
                    const st = m.stock <= 0 ? 'OUT_OF_STOCK' : (m.stock <= m.min ? 'LOW_STOCK' : 'IN_STOCK');
                    insRm.run(uuidv4(), m.code, m.name, m.category, m.supplier, m.stock, m.unit, m.min, m.cost, m.loc, m.lot, m.exp, st, m.fast ? 1 : 0, 'Initial warehouse raw material inventory');
                }
            } else {
                const fastSetCount = dbInstance.prepare('SELECT COUNT(*) as count FROM raw_materials_inventory WHERE is_fast_moving = 1').get()?.count || 0;
                if (fastSetCount === 0) {
                    dbInstance.prepare("UPDATE raw_materials_inventory SET is_fast_moving = 1 WHERE material_code IN ('RM-WTR-01', 'RM-GLY-01', 'RM-NIA-01', 'RM-KJC-01', 'RM-CTA-01', 'RM-PHX-01', 'PK-BOT-100', 'PK-TUB-50')").run();
                }
            }
        } catch (rmErr) {
            console.warn('Raw materials inventory init note:', rmErr.message);
        }

        // Idempotent migration: Shift historical UTC timestamps in SQLite to Philippine Time (Asia/Manila, UTC+8)
        if (!isMysql) {
            try {
                dbInstance.exec("CREATE TABLE IF NOT EXISTS _meta_migrations (key TEXT PRIMARY KEY, applied_at TEXT);");
                const alreadyMigrated = dbInstance.prepare("SELECT key FROM _meta_migrations WHERE key = 'tz_manila_utc8_v1'").get();
                if (!alreadyMigrated) {
                    console.log('🔄 Migrating historical SQLite timestamps to Asia/Manila (UTC+8)...');
                    const tablesToShift = [
                        { table: 'audit_logs', cols: ['timestamp'] },
                        { table: 'purchase_orders', cols: ['created_at', 'updated_at', 'approved_at', 'accounting_confirmed_at', 'inventory_confirmed_at'] },
                        { table: 'job_orders', cols: ['created_at', 'updated_at'] },
                        { table: 'production_batches', cols: ['created_at', 'updated_at', 'qc_passed_at'] },
                        { table: 'delivery_receipts', cols: ['created_at', 'updated_at'] },
                        { table: 'sales_invoices', cols: ['created_at', 'updated_at'] },
                        { table: 'payments', cols: ['created_at'] },
                        { table: 'users', cols: ['created_at', 'updated_at'] },
                        { table: 'chat_messages', cols: ['created_at'] },
                        { table: 'supply_requests', cols: ['created_at', 'updated_at'] },
                        { table: 'client_buffer_stock', cols: ['created_at', 'updated_at'] },
                        { table: 'inventory_movements', cols: ['created_at'] }
                    ];

                    for (const item of tablesToShift) {
                        try {
                            const tblInfo = dbInstance.prepare(`PRAGMA table_info(${item.table})`).all();
                            const existingColNames = new Set(tblInfo.map(c => c.name));
                            for (const col of item.cols) {
                                if (existingColNames.has(col)) {
                                    dbInstance.exec(`UPDATE ${item.table} SET ${col} = datetime(${col}, '+8 hours') WHERE ${col} IS NOT NULL AND ${col} != '' AND ${col} NOT LIKE '%+%';`);
                                }
                            }
                        } catch (tblErr) {
                            console.warn(`Timezone shift note for ${item.table}:`, tblErr.message);
                        }
                    }

                    dbInstance.prepare("INSERT INTO _meta_migrations (key, applied_at) VALUES ('tz_manila_utc8_v1', datetime('now', 'localtime'))").run();
                    console.log('✅ Historical timestamps successfully adjusted to Philippine Time (+8h).');
                }
            } catch (tzErr) {
                console.warn('Timezone historical migration note:', tzErr.message);
            }
        }
    } catch (migErr) {
        console.warn('Migration note:', migErr.message);
    }
}

if (useMysql) {
    console.log(`🗄️  Connecting to MySQL Database: ${process.env.DB_NAME || 'u335953510_client_db'}`);
    db = require('./mysql-adapter')();
    runMigrations(db, true);
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

    // Auto-migrate schema upgrades for existing database
    runMigrations(db, false);

    // Auto-initialize and seed product_categories
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS product_categories (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
        `);
        const catCount = db.prepare('SELECT COUNT(*) as count FROM product_categories').get().count;
        if (catCount === 0) {
            const defaultCats = [
                'Body Care',
                'Face Care',
                'Sun Care',
                'Bath & Body',
                'Hair Care',
                'Cosmetics',
                'Skincare Treatment',
                'Cosmetics & Skincare',
                'Fragrance & Perfume',
                'Personal Care'
            ];
            let existingInProducts = [];
            try {
                existingInProducts = db.prepare('SELECT DISTINCT category FROM products WHERE category IS NOT NULL').all().map(r => (r.category || '').trim());
            } catch (_) {}
            const allToSeed = Array.from(new Set([...defaultCats, ...existingInProducts])).filter(Boolean);
            const ins = db.prepare('INSERT OR IGNORE INTO product_categories (id, name) VALUES (?, ?)');
            for (const c of allToSeed) {
                ins.run(uuidv4(), c);
            }
        }
    } catch (catErr) {
        console.warn('Categories init note:', catErr.message);
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
                INSERT INTO users (id, name, email, password_hash, plain_password, role, is_active)
                VALUES ('a0000000-0000-0000-0000-000000000001', 'Executive Admin', ?, ?, 'Admin123!', 'SUPER_ADMIN', 1)
            `).run(adminEmail, adminPassHash);
            console.log(`👤 Auto-provisioned Super Admin: ${adminEmail}`);
        } else {
            // Ensure hash is valid
            db.prepare("UPDATE users SET password_hash = ?, plain_password = 'Admin123!', is_active = 1 WHERE id = ?").run(adminPassHash, adminUser.id);
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
                INSERT INTO users (id, name, email, password_hash, plain_password, role, client_id, is_active)
                VALUES ('d0396511-4874-4241-9956-694b938ac506', 'Earl John Delos Santos (SKEENCARE)', ?, ?, 'Client123!', 'CLIENT', ?, 1)
            `).run(clientEmail, clientPassHash, clientId);
            console.log(`🏢 Auto-provisioned Client Account: ${clientEmail}`);
        } else {
            db.prepare("UPDATE users SET password_hash = ?, plain_password = 'Client123!', is_active = 1 WHERE id = ?").run(clientPassHash, clientUser.id);
        }
    } catch (err) {
        console.error('Client provision error:', err.message);
    }

    // Auto-provision IT Admin on startup (Identical authority as Super Admin)
    try {
        const itAdminEmail = (process.env.INITIAL_IT_ADMIN_EMAIL || 'itadmin@nkbmanufacturing.com').trim().toLowerCase();
        const itAdminUser = db.prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1").get(itAdminEmail);
        const itAdminPassHash = '$2b$10$TO5/qyzLQrL4QjoA7wclpOmWIzUDesoSlAsGXIvL4yQo505sW0cZm'; // bcrypt for ITAdminPassword@2026!
        
        if (!itAdminUser) {
            db.prepare(`
                INSERT INTO users (id, name, email, password_hash, plain_password, role, is_active)
                VALUES ('a0000000-0000-0000-0000-000000000002', 'IT Administrator', ?, ?, 'ITAdminPassword@2026!', 'IT_ADMIN', 1)
            `).run(itAdminEmail, itAdminPassHash);
            console.log(`💻 Auto-provisioned IT Admin: ${itAdminEmail}`);
        } else {
            db.prepare("UPDATE users SET password_hash = ?, plain_password = 'ITAdminPassword@2026!', role = 'IT_ADMIN', is_active = 1 WHERE id = ?").run(itAdminPassHash, itAdminUser.id);
        }
    } catch (err) {
        console.error('IT Admin provision error:', err.message);
    }

    // Auto-provision Operational Staff Accounts if missing
    try {
        const staffPassHash = '$2b$10$kl1WcRCmVd96aR4ozG/Qk.pkgDmHagy7Kz2ec2rVi9e2xjn338bh.'; // bcrypt for Staff123!
        const defaultStaff = [
            { id: 'b0000000-0000-0000-0000-000000000001', name: 'Production Supervisor', email: 'production@nkbmanufacturing.com', role: 'PRODUCTION', hash: staffPassHash, plain: 'Staff123!' },
            { id: 'c0000000-0000-0000-0000-000000000001', name: 'Logistics & Warehouse Officer', email: 'warehouse@nkbmanufacturing.com', role: 'WAREHOUSE', hash: staffPassHash, plain: 'Staff123!' },
            { id: 'd0000000-0000-0000-0000-000000000001', name: 'Senior Accountant', email: 'accounting@nkbmanufacturing.com', role: 'ACCOUNTING', hash: staffPassHash, plain: 'Staff123!' },
            { id: 'e0000000-0000-0000-0000-000000000001', name: 'Inventory Officer', email: 'inventory@nkbmanufacturing.com', role: 'INVENTORY', hash: '$2b$10$4sevv4zs6rfH/jwtBabcPeAFyGSkvf/1tJ5DGlAfVnZkrQsftdKvC', plain: 'Staff123!' },
            { id: 'f0000000-0000-0000-0000-000000000001', name: 'Purchasing Officer', email: 'purchasing@nkbmanufacturing.com', role: 'PURCHASING', hash: staffPassHash, plain: 'Staff123!' }
        ];

        for (const staff of defaultStaff) {
            const existing = db.prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1").get(staff.email);
            const useHash = staff.hash || staffPassHash;
            if (!existing) {
                db.prepare(`
                    INSERT INTO users (id, name, email, password_hash, plain_password, role, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                `).run(staff.id, staff.name, staff.email, useHash, staff.plain || 'Staff123!', staff.role);
                console.log(`👷 Auto-provisioned Staff: ${staff.name} (${staff.email})`);
            } else {
                db.prepare("UPDATE users SET password_hash = ?, plain_password = COALESCE(plain_password, ?), role = ?, is_active = 1 WHERE id = ?").run(useHash, staff.plain || 'Staff123!', staff.role, existing.id);
            }
        }

        // Backfill plain_password for any remaining accounts without one
        try {
            db.prepare("UPDATE users SET plain_password = 'Admin123!' WHERE role = 'SUPER_ADMIN' AND (plain_password IS NULL OR plain_password = '')").run();
            db.prepare("UPDATE users SET plain_password = 'ITAdminPassword@2026!' WHERE role = 'IT_ADMIN' AND (plain_password IS NULL OR plain_password = '')").run();
            db.prepare("UPDATE users SET plain_password = 'Client123!' WHERE role = 'CLIENT' AND (plain_password IS NULL OR plain_password = '')").run();
            db.prepare("UPDATE users SET plain_password = 'Staff123!' WHERE role NOT IN ('SUPER_ADMIN', 'IT_ADMIN', 'CLIENT') AND (plain_password IS NULL OR plain_password = '')").run();
        } catch (_) {}
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

    // Auto-provision client: GEMS Incorporated
    try {
        const gemsId = '885fdb11-8fb8-4f37-8a45-94f9053caf6f';
        const existingGems = db.prepare('SELECT id FROM clients WHERE id = ? OR company_name LIKE ?').get(gemsId, '%GEMS%');
        if (!existingGems) {
            db.prepare(`
                INSERT INTO clients (id, company_name, contact_person, email, phone, address, tin, default_billing_policy, default_tolerance_percent, credit_limit, is_active, created_at, updated_at, is_vyuceutical_ops)
                VALUES (?, 'GEMS Incorporated', 'Lorgie M. Villaricao', 'lorgie@gems.com', '0917-111-2233', 'Blk 1, Lot 20 & 21, Hilton St., Cefels Park III Subdivision, Brgy. 14', NULL, 'ACTUAL_DELIVERY', 10.0, 500000.0, 1, datetime('now', 'localtime'), datetime('now', 'localtime'), 0)
            `).run(gemsId);
            console.log('💎 Auto-provisioned client: GEMS Incorporated');
        }
    } catch (err) {
        console.error('GEMS client auto-provision error:', err.message);
    }

    // Migration: Ensure PO-2026-000021 is assigned to client GEMS
    try {
        const gems = db.prepare("SELECT id FROM clients WHERE company_name LIKE '%GEMS%' LIMIT 1").get();
        if (gems) {
            const po21 = db.prepare("SELECT id, client_id FROM purchase_orders WHERE po_number = 'PO-2026-000021'").get();
            if (po21 && po21.client_id !== gems.id) {
                db.prepare("UPDATE purchase_orders SET client_id = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(gems.id, po21.id);
                db.prepare("UPDATE delivery_receipts SET client_id = ? WHERE po_id = ?").run(gems.id, po21.id);
                db.prepare("UPDATE sales_invoices SET client_id = ? WHERE po_id = ?").run(gems.id, po21.id);
                console.log(`✅ Reassigned PO-2026-000021 to client GEMS (${gems.id})`);
            } else if (!po21) {
                // Seed PO-2026-000021 with GEMS for local parity
                const adminUser = db.prepare("SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') LIMIT 1").get();
                const adminId = adminUser ? adminUser.id : 'a0000000-0000-0000-0000-000000000001';
                const poId = 'b4c06a02-bb9c-4080-bba3-c11da3038c85';
                db.prepare(`
                    INSERT OR IGNORE INTO purchase_orders 
                    (id, po_number, so_number, client_id, po_date, expected_delivery_date, tolerance_percent, billing_policy, status, notes, subtotal, tax_percent, tax_amount, grand_total, created_by, approved_by, approved_at, accounting_confirmed, accounting_confirmed_at, accounting_confirmed_by, form_of_payment, formulation_converted, formulation_converted_at, created_at, updated_at)
                    VALUES (?, 'PO-2026-000021', 'SO-2026-000021', ?, '2026-09-28', NULL, 10.0, 'ACTUAL_DELIVERY', 'APPROVED', 'PDRN approved formula: 060226-00-00\n*Others- same formula as Bella Skin', 382960.0, 0.0, 0.0, 382960.0, ?, ?, datetime('now', 'localtime'), 1, datetime('now', 'localtime'), ?, 'COD', 1, datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(poId, gems.id, adminId, adminId, adminId);
                
                const itemCheck = db.prepare("SELECT COUNT(*) as count FROM purchase_order_items WHERE po_id = ?").get(poId);
                if (itemCheck && itemCheck.count === 0) {
                    const sampleProducts = [
                        { id: 'f72d4c6e-6825-4bb7-a52f-bfe82dfa4efd', sku: 'GEMS-001', name: 'ALOE NIACINAMIDE', qty: 1000, price: 76.25, sub: 76250 },
                        { id: '2282d3d8-6ffa-4157-90b2-03e4c896ae36', sku: 'GEMS-002', name: 'PDRM + ROSE EXTRACT', qty: 1000, price: 101.85, sub: 101850 },
                        { id: '6315665e-f7b9-4d49-92e2-95b82269ac05', sku: 'GEMS-003', name: 'TINTED SUNBLOCK', qty: 1000, price: 103.86, sub: 103860 },
                        { id: '99cbfb00-6c9c-4096-8c17-e905067ba171', sku: 'GEMS-004', name: 'PEKAS CREAM', qty: 1000, price: 101.00, sub: 101000 }
                    ];
                    for (const p of sampleProducts) {
                        db.prepare(`
                            INSERT OR IGNORE INTO products (id, sku, name, category, default_price, is_active)
                            VALUES (?, ?, ?, 'Skincare', ?, 1)
                        `).run(p.id, p.sku, p.name, p.price);
                        db.prepare(`
                            INSERT INTO purchase_order_items (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(uuidv4(), poId, p.id, p.name, p.qty, Math.floor(p.qty * 0.9), Math.ceil(p.qty * 1.1), p.price, p.sub);
                    }
                }
                console.log(`✅ Provisioned PO-2026-000021 with client GEMS (${gems.id}) for local parity`);
            }
        }
    } catch (err) {
        console.error('PO-2026-000021 GEMS migration error:', err.message);
    }

    // Migration: Cleanup error POs (0004, HCI_063, HCI_065), renumber Bella Skin to PO-2026-000024, and reset document sequences
    try {
        const errorPOs = db.prepare("SELECT id FROM purchase_orders WHERE notes LIKE '%0004%' OR notes LIKE '%HCI_063_2026%' OR notes LIKE '%HCI_065_2026%'").all();
        if (errorPOs.length > 0) {
            const errorPoIds = errorPOs.map(p => p.id);
            const errorJOs = db.prepare(`SELECT id FROM job_orders WHERE po_id IN (${errorPoIds.map(() => '?').join(',')})`).all(...errorPoIds);
            const errorJoIds = errorJOs.map(j => j.id);
            if (errorJoIds.length > 0) {
                db.prepare(`DELETE FROM production_batches WHERE jo_id IN (${errorJoIds.map(() => '?').join(',')})`).run(...errorJoIds);
            }
            db.prepare(`DELETE FROM job_orders WHERE po_id IN (${errorPoIds.map(() => '?').join(',')})`).run(...errorPoIds);
            db.prepare(`DELETE FROM purchase_order_items WHERE po_id IN (${errorPoIds.map(() => '?').join(',')})`).run(...errorPoIds);
            db.prepare(`DELETE FROM purchase_orders WHERE id IN (${errorPoIds.map(() => '?').join(',')})`).run(...errorPoIds);
            console.log(`🧹 Cleaned up ${errorPoIds.length} error POs and their associated records`);
        }

        // Renumber Bella Skin to PO-2026-000024
        const bellaPO = db.prepare("SELECT id, po_number FROM purchase_orders WHERE client_id = 'c0000000-0000-0000-0000-000000000002' AND po_date = '2026-09-28'").get();
        if (bellaPO && bellaPO.po_number !== 'PO-2026-000024') {
            db.prepare("UPDATE purchase_orders SET po_number = 'PO-2026-000024', so_number = 'SO-2026-000024' WHERE id = ?").run(bellaPO.id);
            console.log('🔄 Renumbered Bella Skin to PO-2026-000024');
        }

        // Reset document_sequences
        const maxPo = db.prepare("SELECT MAX(CAST(SUBSTR(po_number, 9) AS INTEGER)) as m FROM purchase_orders WHERE po_number LIKE 'PO-2026-%'").get();
        const poSeqVal = (maxPo && maxPo.m) ? maxPo.m : 24;
        db.prepare("UPDATE document_sequences SET last_sequence = ? WHERE doc_type = 'PO'").run(poSeqVal);

        const maxJo = db.prepare("SELECT MAX(CAST(SUBSTR(jo_number, 9) AS INTEGER)) as m FROM job_orders WHERE jo_number LIKE 'JO-2026-%'").get();
        const joSeqVal = (maxJo && maxJo.m) ? maxJo.m : 46;
        db.prepare("UPDATE document_sequences SET last_sequence = ? WHERE doc_type = 'JO'").run(joSeqVal);

        const maxBat = db.prepare("SELECT MAX(CAST(SUBSTR(batch_number, 10) AS INTEGER)) as m FROM production_batches WHERE batch_number LIKE 'BAT-2026-%'").get();
        const batSeqVal = (maxBat && maxBat.m) ? maxBat.m : 13;
        db.prepare("UPDATE document_sequences SET last_sequence = ? WHERE doc_type = 'BAT'").run(batSeqVal);
    } catch (cleanErr) {
        console.error('Error PO cleanup migration error:', cleanErr.message);
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

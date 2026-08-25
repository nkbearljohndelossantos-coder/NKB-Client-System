const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

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

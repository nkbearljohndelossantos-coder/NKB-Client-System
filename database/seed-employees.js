require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function parseCSV(content) {
    const lines = content.split(/\r?\n/);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Simple CSV parser handling quotes
        const tokens = [];
        let insideQuote = false;
        let currentToken = '';

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
                tokens.push(currentToken.trim());
                currentToken = '';
            } else {
                currentToken += char;
            }
        }
        tokens.push(currentToken.trim());

        // Header: employee_id, name, department, credit_limit, current_balance, status, barcode_number
        if (tokens.length >= 2) {
            rows.push({
                employee_id: tokens[0],
                name: tokens[1].replace(/^"|"$/g, '').trim(),
                department: tokens[2] || 'Unassigned',
                credit_limit: parseFloat(tokens[3]) || 0.0,
                current_balance: parseFloat(tokens[4]) || 0.0,
                status: tokens[5] || 'active',
                barcode_number: tokens[6] || tokens[0]
            });
        }
    }
    return rows;
}

async function seedEmployees() {
    console.log('👥 Seeding Employee Roster for Product Batching...');

    const localCsvPath = path.join(__dirname, 'employees.csv');
    const downloadsCsvPath = 'C:\\Users\\Glen Nobleza\\Downloads\\employee_members_backup_2026-09-11.csv';
    
    let csvPath = null;
    if (fs.existsSync(localCsvPath)) {
        csvPath = localCsvPath;
    } else if (fs.existsSync(downloadsCsvPath)) {
        csvPath = downloadsCsvPath;
    } else {
        throw new Error('Employee CSV file not found in database/employees.csv or Downloads folder.');
    }

    console.log(`📄 Reading CSV from: ${csvPath}`);
    const content = fs.readFileSync(csvPath, 'utf8');
    const employees = parseCSV(content);
    console.log(`📊 Parsed ${employees.length} employee records.`);

    const db = require('./db');

    // Ensure employees table exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            employee_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            department TEXT,
            credit_limit REAL DEFAULT 0,
            current_balance REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            barcode_number TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);

    const stmt = db.prepare(`
        INSERT INTO employees (id, employee_id, name, department, credit_limit, current_balance, status, barcode_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(employee_id) DO UPDATE SET
            name = excluded.name,
            department = excluded.department,
            credit_limit = excluded.credit_limit,
            current_balance = excluded.current_balance,
            status = excluded.status,
            barcode_number = excluded.barcode_number,
            updated_at = datetime('now')
    `);

    const deptCounts = {};
    let inserted = 0;

    const tx = db.transaction(() => {
        for (const emp of employees) {
            stmt.run(
                uuidv4(),
                emp.employee_id,
                emp.name,
                emp.department,
                emp.credit_limit,
                emp.current_balance,
                emp.status,
                emp.barcode_number
            );
            inserted++;
            deptCounts[emp.department] = (deptCounts[emp.department] || 0) + 1;
        }
    });

    tx();

    console.log(`✅ Successfully loaded ${inserted} employees into database.`);
    console.log('📌 Operational Staff Breakdown:');
    console.log(`   - Production: ${deptCounts['Production'] || 0}`);
    console.log(`   - Compounding / Formulation: ${deptCounts['Compounding'] || 0}`);
    console.log(`   - Quality Control (QC): ${deptCounts['QC'] || 0}`);
    console.log(`   - Inventory / Warehouse: ${deptCounts['Inventory / Warehouse'] || 0}`);
    console.log(`   - Silkscreen: ${deptCounts['Silkscreen'] || 0}`);
    console.log(`   - Logistics: ${deptCounts['Logistics'] || 0}`);
    console.log(`   - Other Departments: ${Object.keys(deptCounts).length - 6} other depts`);

    return { total: inserted, deptCounts };
}

module.exports = seedEmployees;

if (require.main === module) {
    seedEmployees()
        .then(() => {
            console.log('🚀 Employee seeding script completed successfully.');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Employee seeding failed:', err);
            process.exit(1);
        });
}

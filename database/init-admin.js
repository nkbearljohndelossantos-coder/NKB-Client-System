const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

/**
 * CLI utility to create or reset the production Super Administrator
 */
function createAdminUser(email, password, name = 'Production Administrator') {
    if (!email || !password) {
        console.error('Usage: node database/init-admin.js <email> <password> [name]');
        process.exit(1);
    }

    if (password.length < 8) {
        console.error('❌ Password must be at least 8 characters long.');
        process.exit(1);
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    const passwordHash = bcrypt.hashSync(password, 12);

    if (existing) {
        db.prepare(`
            UPDATE users 
            SET password_hash = ?, is_active = 1, role = 'SUPER_ADMIN', updated_at = datetime('now')
            WHERE id = ?
        `).run(passwordHash, existing.id);
        console.log(`✅ Super Admin password updated for: ${cleanEmail}`);
    } else {
        const id = uuidv4();
        db.prepare(`
            INSERT INTO users (id, name, email, password_hash, role, is_active)
            VALUES (?, ?, ?, ?, 'SUPER_ADMIN', 1)
        `).run(id, name, cleanEmail, passwordHash);
        console.log(`✅ Super Admin created successfully: ${cleanEmail} (${id})`);
    }
}

if (require.main === module) {
    const email = process.argv[2];
    const password = process.argv[3];
    const name = process.argv[4];
    createAdminUser(email, password, name);
}

module.exports = createAdminUser;

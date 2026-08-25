const fs = require('fs');
const path = require('path');
const db = require('./db');

/**
 * Perform a safe, point-in-time backup of the SQLite database
 */
function createBackup(customDestPath = null) {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `nkb-backup-${timestamp}.sqlite`;
    const targetPath = customDestPath || path.join(backupDir, backupFileName);

    console.log(`📦 Starting online safe database backup to: ${targetPath}`);

    try {
        // SQLite safe online vacuum backup
        const escapedPath = targetPath.replace(/'/g, "''");
        db.exec(`VACUUM INTO '${escapedPath}';`);

        const stats = fs.statSync(targetPath);
        console.log(`✅ Database backup created successfully! Size: ${(stats.size / 1024).toFixed(2)} KB`);
        return targetPath;
    } catch (err) {
        console.error('❌ Database backup failed:', err);
        throw err;
    }
}

if (require.main === module) {
    createBackup();
}

module.exports = createBackup;

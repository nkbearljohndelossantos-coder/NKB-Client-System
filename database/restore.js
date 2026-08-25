const fs = require('fs');
const path = require('path');

/**
 * Restore database from a backup file
 * Note: Node process should be stopped before running restore, or targeted at setup time
 */
function restoreBackup(backupFilePath) {
    if (!backupFilePath || !fs.existsSync(backupFilePath)) {
        console.error(`❌ Backup file not found at: ${backupFilePath}`);
        process.exit(1);
    }

    const currentDbPath = process.env.DATABASE_PATH || path.join(__dirname, 'nkb.sqlite');
    const emergencySnapshot = path.join(__dirname, `nkb-pre-restore-${Date.now()}.sqlite`);

    console.log(`⚠️ Restoring database from: ${backupFilePath}`);

    // Create an emergency snapshot of the current DB if it exists
    if (fs.existsSync(currentDbPath)) {
        fs.copyFileSync(currentDbPath, emergencySnapshot);
        console.log(`🛡️ Emergency snapshot saved to: ${emergencySnapshot}`);
    }

    // Copy backup to database path
    fs.copyFileSync(backupFilePath, currentDbPath);
    console.log(`✅ Database successfully restored to: ${currentDbPath}`);
}

if (require.main === module) {
    const backupArg = process.argv[2];
    if (!backupArg) {
        console.log('Usage: node database/restore.js <path-to-backup-file>');
        process.exit(1);
    }
    restoreBackup(backupArg);
}

module.exports = restoreBackup;

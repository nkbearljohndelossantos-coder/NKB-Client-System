const fs = require('fs');
const path = require('path');

const dbDir = path.resolve(__dirname, '../database');

if (fs.existsSync(dbDir)) {
    const allFiles = fs.readdirSync(dbDir);
    allFiles.forEach(f => {
        if (f.startsWith('test_') || f.includes('test')) {
            if (f.endsWith('.sqlite') || f.endsWith('.sqlite-wal') || f.endsWith('.sqlite-shm')) {
                const target = path.join(dbDir, f);
                try {
                    fs.unlinkSync(target);
                    console.log('🧹 Cleaned test db artifact:', f);
                } catch (e) {
                    console.warn('Could not remove test artifact:', f, e.message);
                }
            }
        }
    });
}

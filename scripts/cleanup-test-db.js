const fs = require('fs');
const path = require('path');

const files = [
    path.resolve(__dirname, '../database/nkb_test.sqlite'),
    path.resolve(__dirname, '../database/nkb_test.sqlite-wal'),
    path.resolve(__dirname, '../database/nkb_test.sqlite-shm')
];

files.forEach(f => {
    if (fs.existsSync(f)) {
        try {
            fs.unlinkSync(f);
            console.log('🧹 Deleted decoy test file:', path.basename(f));
        } catch (err) {
            console.warn('Could not delete', path.basename(f), err.message);
        }
    }
});

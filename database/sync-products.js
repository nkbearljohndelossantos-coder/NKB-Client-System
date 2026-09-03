const db = require('./db');
const { BATCH_CODE_CATALOG } = require('../services/batchCodingService');
const { v4: uuidv4 } = require('uuid');

console.log('🔄 Syncing products from BATCH_CODE_CATALOG (Count:', BATCH_CODE_CATALOG.length, ')...');

let inserted = 0;
let updated = 0;

for (const item of BATCH_CODE_CATALOG) {
    const existing = db.prepare('SELECT id, batch_code_template FROM products WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))').get(item.name);
    if (existing) {
        if (existing.batch_code_template !== item.template) {
            db.prepare('UPDATE products SET batch_code_template = ? WHERE id = ?').run(item.template, existing.id);
            updated++;
        }
    } else {
        const words = item.name.split(' ').filter(Boolean);
        const skuPrefix = words.map(w => w[0].toUpperCase()).slice(0, 4).join('');
        const sku = skuPrefix + '-' + Math.floor(100 + Math.random() * 900);
        db.prepare(`
            INSERT INTO products (id, sku, name, category, description, unit, default_price, formula_code, batch_code_template, shelf_life_months, current_stock, is_active)
            VALUES (?, ?, ?, 'Cosmetics & Skincare', ?, 'pcs', 150.00, ?, ?, 24, 1000, 1)
        `).run(uuidv4(), sku, item.name, item.name + ' formulation and manufacturing specifications.', 'FORM-' + skuPrefix + '-V1', item.template);
        inserted++;
    }
}

console.log(`✅ Sync completed: ${inserted} inserted, ${updated} updated.`);
const total = db.prepare('SELECT count(*) as count FROM products').get();
console.log('📦 Total Products in Database:', total.count);
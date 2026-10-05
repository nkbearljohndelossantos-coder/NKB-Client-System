/**
 * NKB Manufacturing & Invoicing System
 * Seeder and Migration Helper: JLS Skin Essentials OPC Perfume Products Catalog
 * 
 * Category: Fragrance & Perfume
 * Unit Price: ₱79.00
 */

const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const JLS_CLIENT_ID = '8a0e6388-bc7c-4892-a68b-1811c89fd07e';
const JLS_CLIENT_NAME = 'JLS Skin Essentials OPC';
const CATEGORY = 'Fragrance & Perfume';
const PRICE = 79.00;

const JLS_PERFUMES = [
  "JLS Perfume (Paris Hilton) Paris",
  "JLS Perfume (Women) Inlove",
  "JLS Perfume 1Million Paco Rabanne (Men) ONE",
  "JLS Perfume Angels Breath (Women) HEAVENLY",
  "JLS Perfume Ariana Grande (Women) CLOUD",
  "JLS Perfume Armani Aqua De Gio (Men) CLASSIC",
  "JLS Perfume B&B Cucumber Melon (Women) MELONIA",
  "JLS Perfume B&B Gingham (Women) AFFECTION",
  "JLS Perfume B&B Japanese Cherry Blossom (Women) SAKURA",
  "JLS Perfume B&B Pink Chiffon (Women) CHEERS",
  "JLS Perfume B&B Sugar Plum (Women) PASSION",
  "JLS Perfume B&B Sweet Pea (Women) SWEET",
  "JLS Perfume B&B Warm Vanilla Sugar (Women) RUSTIC",
  "JLS Perfume Baccarat (Women) AMOUR",
  "JLS Perfume Burberry Weekend (Women) WEEKEND",
  "JLS Perfume BVLGARI Amethyste (Women) WICKED",
  "JLS Perfume BVLGARI Aqua (Men) AQUA",
  "JLS Perfume BVLGARI Black (Men) BOLD",
  "JLS Perfume BVLGARI Extrem (Men) EXTREME",
  "JLS Perfume Chanel Chance (Women) CHANCE",
  "JLS Perfume Chanel Coco Mademoiselle (Women) ADORE",
  "JLS Perfume Chanel NO.5 (Women) CHIC",
  "JLS Perfume CK Eternity (Men) BRIGHT",
  "JLS Perfume CK One Platinum (Men) EASY",
  "JLS Perfume CK Shock (Men) SHOCK",
  "JLS Perfume Clinque Happy (Women) JOLLY",
  "JLS Perfume D&G Light Blue (Women) UNWIND",
  "JLS Perfume David Off Cool Water (Men) FRESH",
  "JLS Perfume DIOR Fahrenheit (Men) CHERISH",
  "JLS Perfume Dunhill Desire (Men) FEVER",
  "JLS Perfume Elizabeth Arden Green Tea (Women) GARDEN",
  "JLS Perfume Estee Lauder Pleasure (Women) LUXURY",
  "JLS Perfume Forecer Sexy (Women) SEXY",
  "JLS Perfume Gucci Rush (Women) RUSH",
  "JLS Perfume Hugo boss (Leader)",
  "JLS Perfume Incanto Shine (Women) EXCITE",
  "JLS Perfume Invictus Paco Robanne (Men) POWER",
  "JLS Perfume Issey Miyake (Men) ABSOLUTE",
  "JLS Perfume Issey Miyake (Women) ABSOLUTELY",
  "JLS Perfume Jo Malone Blackberry & Bay (Women) BERRY LOVE",
  "JLS Perfume Jo Malone English Pear & Freeshia (Women) CHARM",
  "JLS Perfume Jo Malone Nectarine Blossom (Women) FANCY",
  "JLS Perfume Jo Malone Woodsage & Sea Salt (Women) BLISS",
  "JLS Perfume Katty Perry Meow (Women) WITTY",
  "JLS Perfume Lacoste Black (Men) BLACK",
  "JLS Perfume Lacoste Blue (Men) BLUE",
  "JLS Perfume Lacoste Pink (Women) FLIRT",
  "JLS Perfume Lacoste Red (Men) RED",
  "JLS Perfume Lacoste White (Men) WHITE",
  "JLS Perfume Lanvin Eclat D'Apege (Women) GODDESS",
  "JLS Perfume Lanvin Eclat D'Arpege (Men) SEDUCE",
  "JLS Perfume Le Labo Santa 33 (Women) LAVISH",
  "JLS Perfume Louie Vuitton Spell On You (Women) MAGIC SPELL",
  "JLS Perfume Miss DIOR (Women) ROSES",
  "JLS Perfume Mont Blanc Legend (Men) FEARLESS",
  "JLS Perfume One Direction Our Moment (Women) ALLURE",
  "JLS Perfume Polo Black (Men) GENT",
  "JLS Perfume Polo Blue (Men) MACHO",
  "JLS Perfume Polo Red (Men) BRAVE",
  "JLS Perfume Polo Sport (Men) FORWARD",
  "JLS Perfume Rihanna RiRi (Women) ADMIRE",
  "JLS Perfume Saint Laurent Black Opium (Women) NIGHTFALL",
  "JLS Perfume Sauvage DIOR (Men) SAVAGE",
  "JLS Perfume Selena Gomez (Women) TRUE LOVE",
  "JLS Perfume Signorina Misteriosa (Women) FOXY",
  "JLS Perfume Strawberries & Champagne (Women) PARTY",
  "JLS Perfume Swiss Army (Men) ENERGY",
  "JLS Perfume Tommy Hilfiger Boy (Men) BOY",
  "JLS Perfume Tommy Hilfiger Girl (Women) GIRL",
  "JLS Perfume Vanilla Lace (Women) SENSES",
  "JLS Perfume Versace Eros (Men) Smart",
  "JLS Perfume VS Amber Romance (Women) AMBER",
  "JLS Perfume VS Bombshell (Women) SPICE",
  "JLS Perfume VS Choco Vanilla (Women) MILKY WAY",
  "JLS Perfume VS Endless Love (Women) FOREVER",
  "JLS Perfume VS Love Spell (Women) POTION",
  "JLS Perfume VS Pure Seduction (Women) KISSES",
  "JLS Perfume VS Scandalous (Women) TORRID",
  "JLS Perfume VS Sweet Temptation (Women) TEMPT",
  "JLS Perfume Wild Secret (Women) PROVOKE",
  "JLS Perfume Wild Bluebell (women) FIERCE",
  "JLS Perfume Valaya (Sun Kissed)"
];

function generateProductSKU(productName, clientName, existingSkusSet = new Set()) {
    const stopWords = new Set(['WITH', 'FOR', 'AND', '&', 'THE', 'IN', 'OF', 'AT', 'TO', 'A', 'AN', 'MEN', 'WOMEN', 'WOMAN', 'MAN']);

    const productWords = (productName || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0 && !stopWords.has(w));

    let letters = [];
    if (productWords[0] === 'JLS' && productWords[1] === 'PERFUME') {
        letters.push('J', 'P');
        for (let i = 2; i < productWords.length; i++) {
            if (letters.length >= 4) break;
            letters.push(productWords[i][0]);
        }
    } else {
        for (const w of productWords) {
            if (letters.length >= 4) break;
            letters.push(w[0]);
        }
    }

    let baseCode = letters.join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (baseCode.length < 2) baseCode = 'JLP';
    if (baseCode.length > 5) baseCode = baseCode.slice(0, 5);

    let candidate = '';
    let attempts = 0;
    while (attempts < 500) {
        attempts++;
        const num = Math.floor(100 + Math.random() * 900);
        candidate = baseCode + '-' + num;
        if (!existingSkusSet.has(candidate)) break;
    }
    return candidate;
}

function seedJlsPerfumes(dbInstance) {
    try {
        if (!dbInstance) return;

        let client = dbInstance.prepare(`
            SELECT id, company_name FROM clients 
            WHERE id = ? OR LOWER(company_name) LIKE '%jls skin essentials%'
            LIMIT 1
        `).get(JLS_CLIENT_ID);

        if (!client) {
            try {
                dbInstance.prepare(`
                    INSERT INTO clients (id, company_name, email, phone, contact_person, address, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(
                    JLS_CLIENT_ID,
                    JLS_CLIENT_NAME,
                    'jls@skinessentials.com',
                    '0917-000-0000',
                    'Karen Vilar',
                    'Phils.'
                );
                client = { id: JLS_CLIENT_ID, company_name: JLS_CLIENT_NAME };
            } catch (cErr) {
                console.warn('JLS client auto-provision note:', cErr.message);
            }
        }

        const clientId = client ? client.id : JLS_CLIENT_ID;

        try {
            dbInstance.prepare(`
                INSERT OR IGNORE INTO product_categories (id, name) VALUES (?, ?)
            `).run(uuidv4(), CATEGORY);
        } catch (_) {}

        const existingProducts = dbInstance.prepare(`SELECT * FROM products`).all();
        const existingSkusSet = new Set(existingProducts.map(p => (p.sku || '').toUpperCase()));

        let hasClientId = false;
        try {
            const tblInfo = dbInstance.prepare(`PRAGMA table_info(products)`).all();
            hasClientId = tblInfo.some(c => c.name === 'client_id');
        } catch (_) {}

        for (const rawName of JLS_PERFUMES) {
            const name = rawName.trim();
            const norm = name.toLowerCase().replace(/\s+/g, ' ');

            let product = existingProducts.find(p => (p.name || '').toLowerCase().replace(/\s+/g, ' ') === norm);

            let productId;
            let sku;

            if (product) {
                productId = product.id;
                sku = product.sku;

                dbInstance.prepare(`
                    UPDATE products
                    SET category = ?, default_price = ?, is_active = 1, updated_at = datetime('now', 'localtime')
                    WHERE id = ?
                `).run(CATEGORY, PRICE, productId);
            } else {
                productId = uuidv4();
                sku = generateProductSKU(name, JLS_CLIENT_NAME, existingSkusSet);
                existingSkusSet.add(sku);

                if (hasClientId) {
                    dbInstance.prepare(`
                        INSERT INTO products (
                            id, sku, name, category, description, unit, default_price,
                            shelf_life_months, is_active, created_at, updated_at, client_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'), ?)
                    `).run(
                        productId,
                        sku,
                        name,
                        CATEGORY,
                        'JLS Premium Eau de Parfum - ' + name,
                        'pcs',
                        PRICE,
                        24,
                        clientId
                    );
                } else {
                    dbInstance.prepare(`
                        INSERT INTO products (
                            id, sku, name, category, description, unit, default_price,
                            shelf_life_months, is_active, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                    `).run(
                        productId,
                        sku,
                        name,
                        CATEGORY,
                        'JLS Premium Eau de Parfum - ' + name,
                        'pcs',
                        PRICE,
                        24
                    );
                }
            }

            const existingPricing = dbInstance.prepare(`
                SELECT id FROM client_product_prices
                WHERE client_id = ? AND product_id = ?
            `).get(clientId, productId);

            if (existingPricing) {
                dbInstance.prepare(`
                    UPDATE client_product_prices
                    SET custom_price = ?, custom_name = ?, custom_sku = ?, is_active = 1, updated_at = datetime('now', 'localtime')
                    WHERE id = ?
                `).run(PRICE, name, sku, existingPricing.id);
            } else {
                const pricingId = uuidv4();
                dbInstance.prepare(`
                    INSERT INTO client_product_prices (
                        id, client_id, product_id, custom_name, custom_price, custom_sku, is_active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(pricingId, clientId, productId, name, PRICE, sku);
            }
        }
    } catch (err) {
        console.warn('seedJlsPerfumes note:', err.message);
    }
}

module.exports = {
    seedJlsPerfumes,
    JLS_PERFUMES,
    JLS_CLIENT_ID,
    JLS_CLIENT_NAME,
    CATEGORY,
    PRICE
};

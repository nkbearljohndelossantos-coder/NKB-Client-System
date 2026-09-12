require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const dbDriver = (process.env.DB_DRIVER || '').toLowerCase();
const hasMysqlConfig = Boolean(
    process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME
);
const useMysql = dbDriver === 'mysql'
    || (dbDriver !== 'sqlite' && hasMysqlConfig && process.env.NODE_ENV === 'production');

const rules = [
    { clientPattern: /Her Choice/i, prodPattern: /HER CHOICE|HC/i, excludePattern: null },
    { clientPattern: /Bella Skin/i, prodPattern: /BELLA SKIN|K BELLA|BSPT|BSPP|BSFS|BST|BSDS|BS3S|BSNJ|BSRS|BSML|BSLT|BS7A|BSTS|BSPL|BSMS|BSRC|BSPF|BSFF|BSFY|BSKH|BSPW|BSNC|BSLC|BSMG|BSU|BSCB|BSRP|KBSS/i, excludePattern: /BRIGHTEST/i },
    { clientPattern: /SKEENCARE/i, prodPattern: /SKEENCARE|SKC|STSC|SRT|SNBS|SMC|SKPS|SOS|SBNS|S4I1|SSNS|CANM|SPC|ADORN/i, excludePattern: null },
    { clientPattern: /Natasha/i, prodPattern: /NATASHA|NTSS|NBLS/i, excludePattern: null },
    { clientPattern: /Hanapam/i, prodPattern: /HANAPAM|HLS|HBB|HL-/i, excludePattern: null },
    { clientPattern: /Gelis Pharma/i, prodPattern: /GELIS PHARMA|GIDERM|GPG/i, excludePattern: null },
    { clientPattern: /Jgloww/i, prodPattern: /JGLOWW|JB&M|JVC|JGBB|JLS/i, excludePattern: null },
    { clientPattern: /Brightest Skin/i, prodPattern: /BRIGHTEST/i, excludePattern: /BELLA/i },
    { clientPattern: /Royce B/i, prodPattern: /ROYCE B|RBKT|RBP|RBPL/i, excludePattern: null },
    { clientPattern: /Elixia/i, prodPattern: /ELIXIA|ENBL|EOSR|EISV/i, excludePattern: null }
];

async function seedClientCatalogs() {
    console.log('📦 Seeding Client Product Catalogs...');
    console.log('Mode:', useMysql ? 'MySQL' : 'SQLite');

    if (useMysql) {
        const mysql = require('mysql2/promise');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });

        try {
            const [clients] = await connection.query('SELECT id, company_name FROM clients');
            const [products] = await connection.query('SELECT * FROM products');

            console.log(`Found ${clients.length} clients and ${products.length} products.`);

            // Clean up any cross-brand overlap entries
            await connection.query(`
                DELETE FROM client_product_prices 
                WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '%Brightest%')
                  AND product_id IN (SELECT id FROM products WHERE name LIKE '%BELLA%')
            `);
            await connection.query(`
                DELETE FROM client_product_prices 
                WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '%Bella%')
                  AND product_id IN (SELECT id FROM products WHERE name LIKE '%BRIGHTEST%')
            `);

            let mappedCount = 0;
            for (const rule of rules) {
                const client = clients.find(c => rule.clientPattern.test(c.company_name));
                if (!client) continue;

                const matchedProducts = products.filter(p => {
                    const matches = rule.prodPattern.test(p.name) || rule.prodPattern.test(p.sku);
                    if (!matches) return false;
                    if (rule.excludePattern && (rule.excludePattern.test(p.name) || rule.excludePattern.test(p.sku))) return false;
                    return true;
                });
                console.log(`Linking ${matchedProducts.length} products to ${client.company_name}...`);

                for (const p of matchedProducts) {
                    const [existing] = await connection.query(
                        'SELECT id FROM client_product_prices WHERE client_id = ? AND product_id = ?',
                        [client.id, p.id]
                    );

                    if (existing.length === 0) {
                        await connection.query(`
                            INSERT INTO client_product_prices 
                            (id, client_id, product_id, custom_sku, custom_name, custom_price, custom_formula_code, is_active, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
                        `, [uuidv4(), client.id, p.id, p.sku, p.name, p.default_price, p.formula_code || 'FORM-2026-V1']);
                        mappedCount++;
                    }
                }
            }
            console.log(`✅ MySQL client catalog mapping complete: ${mappedCount} new assignments added.`);
        } finally {
            await connection.end();
        }
    } else {
        const db = require('./db');
        const clients = db.prepare('SELECT id, company_name FROM clients').all();
        const products = db.prepare('SELECT * FROM products').all();

        console.log(`Found ${clients.length} clients and ${products.length} products.`);

        // Clean up any cross-brand overlap entries
        db.prepare(`
            DELETE FROM client_product_prices 
            WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '%Brightest%')
              AND product_id IN (SELECT id FROM products WHERE name LIKE '%BELLA%')
        `).run();
        db.prepare(`
            DELETE FROM client_product_prices 
            WHERE client_id IN (SELECT id FROM clients WHERE company_name LIKE '%Bella%')
              AND product_id IN (SELECT id FROM products WHERE name LIKE '%BRIGHTEST%')
        `).run();

        let mappedCount = 0;
        const checkExisting = db.prepare('SELECT id FROM client_product_prices WHERE client_id = ? AND product_id = ?');
        const insertPrice = db.prepare(`
            INSERT INTO client_product_prices 
            (id, client_id, product_id, custom_sku, custom_name, custom_price, custom_formula_code, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `);

        db.transaction(() => {
            for (const rule of rules) {
                const client = clients.find(c => rule.clientPattern.test(c.company_name));
                if (!client) continue;

                const matchedProducts = products.filter(p => {
                    const matches = rule.prodPattern.test(p.name) || rule.prodPattern.test(p.sku);
                    if (!matches) return false;
                    if (rule.excludePattern && (rule.excludePattern.test(p.name) || rule.excludePattern.test(p.sku))) return false;
                    return true;
                });
                console.log(`Linking ${matchedProducts.length} products to ${client.company_name}...`);

                for (const p of matchedProducts) {
                    const existing = checkExisting.get(client.id, p.id);
                    if (!existing) {
                        insertPrice.run(uuidv4(), client.id, p.id, p.sku, p.name, p.default_price, p.formula_code || 'FORM-2026-V1');
                        mappedCount++;
                    }
                }
            }
        })();

        console.log(`✅ SQLite client catalog mapping complete: ${mappedCount} new assignments added.`);
    }
}

if (require.main === module) {
    seedClientCatalogs().then(() => {
        console.log('Done.');
        process.exit(0);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { seedClientCatalogs };

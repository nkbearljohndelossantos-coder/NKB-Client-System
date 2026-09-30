/**
 * NKB Manufacturing & Trading
 * Live FMS (Formulation Management System) API Integration Service
 * 
 * Directly synchronizes authentic approved chemical formulations, compounding codes,
 * active versions, and raw materials from https://fms.nkbmanufacturing.com
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const FMS_API_URL = process.env.FMS_API_URL || 'https://fms.nkbmanufacturing.com/api/v1/external/inventory/formulations';
const FMS_API_KEY = process.env.FMS_API_KEY || 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b';

// Local cached fallback for offline / test environments
const FALLBACK_CACHE_PATH = path.join(__dirname, '../database/fms_formulas_cache.json');

/**
 * Fetch all approved formulations from live FMS API
 */
async function fetchFmsFormulations(timeoutMs = 8000) {
    return new Promise((resolve) => {
        try {
            const urlObj = new URL(FMS_API_URL);
            const client = urlObj.protocol === 'https:' ? https : http;

            const req = client.get(urlObj.toString(), {
                headers: {
                    'x-api-key': FMS_API_KEY,
                    'User-Agent': 'NKB-Client-System-Sync/2.0'
                },
                timeout: timeoutMs
            }, (res) => {
                let rawData = '';
                res.on('data', chunk => rawData += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            const parsed = JSON.parse(rawData);
                            if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
                                // Cache locally for resilience
                                try {
                                    fs.writeFileSync(FALLBACK_CACHE_PATH, JSON.stringify(parsed, null, 2));
                                } catch (_) {}
                                return resolve({ success: true, source: 'LIVE_API', data: parsed.data, count: parsed.data.length });
                            }
                        }
                        // If error status code, fallback to local cache
                        const cached = loadFallbackCache();
                        resolve(cached);
                    } catch (parseErr) {
                        const cached = loadFallbackCache();
                        resolve(cached);
                    }
                });
            });

            req.on('error', () => {
                const cached = loadFallbackCache();
                resolve(cached);
            });

            req.on('timeout', () => {
                req.destroy();
                const cached = loadFallbackCache();
                resolve(cached);
            });
        } catch (_) {
            const cached = loadFallbackCache();
            resolve(cached);
        }
    });
}

/**
 * Load fallback snapshot cache
 */
function loadFallbackCache() {
    try {
        if (fs.existsSync(FALLBACK_CACHE_PATH)) {
            const data = JSON.parse(fs.readFileSync(FALLBACK_CACHE_PATH, 'utf8'));
            if (data && Array.isArray(data.data)) {
                return { success: true, source: 'LOCAL_CACHE', data: data.data, count: data.data.length };
            }
        }
    } catch (_) {}
    return { success: false, source: 'NONE', data: [], count: 0 };
}

/**
 * Smart string normalizer for brand matching
 */
function normalizeName(str) {
    return (str || '')
        .toUpperCase()
        .replace(/BELLASKIN/g, 'BELLA SKIN')
        .replace(/HERCHOICE/g, 'HER CHOICE')
        .replace(/DR\s+VANESSA/g, 'DOC VANESSA')
        .replace(/[^A-Z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Synchronize formulation array directly into database
 */
function syncFmsFormulasToDb(db, fmsFormulas, source = 'LIVE_API') {
    if (!db) throw new Error('Database instance is required for FMS sync.');
    if (!fmsFormulas || !Array.isArray(fmsFormulas) || fmsFormulas.length === 0) {
        return { success: false, message: 'No formulations to synchronize.', count: 0 };
    }

    const existingProducts = db.prepare('SELECT id, name, sku, category, formula_code FROM products').all();

    let matchedCount = 0;
    let createdProductsCount = 0;
    let syncedFormulasCount = 0;

    const insertProductStmt = db.prepare(`
        INSERT INTO products (id, name, sku, category, default_price, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const updateProductCodeStmt = db.prepare(`
        UPDATE products SET formula_code = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
    `);

    const insertFormulationStmt = db.prepare(`
        INSERT INTO product_formulations (
            id, product_id, formula_code, name, compounding_code,
            active_version, version_status, fms_formula_id,
            base_dose_qty, base_unit, instructions, is_confidential,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const updateFormulationStmt = db.prepare(`
        UPDATE product_formulations SET
            product_id = ?,
            formula_code = ?,
            name = ?,
            compounding_code = ?,
            active_version = ?,
            version_status = ?,
            fms_formula_id = ?,
            base_dose_qty = ?,
            base_unit = ?,
            instructions = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
    `);

    const deleteIngredientsStmt = db.prepare(`
        DELETE FROM formulation_ingredients WHERE formulation_id = ?
    `);

    const insertIngredientStmt = db.prepare(`
        INSERT INTO formulation_ingredients (
            id, formulation_id, material_code, material_name, phase,
            percentage, quantity_per_unit, unit, unit_cost, supplier,
            notes, sort_order, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `);

    const checkSkuStmt = db.prepare('SELECT id FROM products WHERE sku = ?');

    const executeSync = () => {
        for (let i = 0; i < fmsFormulas.length; i++) {
            const f = fmsFormulas[i];
            const normFms = normalizeName(f.formula_name);
            const words = normFms.split(' ').filter(w => w.length > 2 && !['V1','V2','V3','100G','50G','250G','30G','100ML','50ML','120ML','PRODUCTION','RND','APPROVED'].includes(w));

            let bestProduct = null;
            let bestScore = 0;

            // 1. Direct formula_code match
            bestProduct = existingProducts.find(p => p.formula_code === f.formula_code);

            // 2. Direct SKU match for FMS compounding code
            const expectedSku = 'FMS-' + (f.compounding_code ? f.compounding_code.replace(/[^A-Z0-9]/gi, '') : f.formula_code.slice(-4));
            if (!bestProduct) {
                bestProduct = existingProducts.find(p => p.sku === expectedSku) || checkSkuStmt.get(expectedSku);
            }

            // 3. Token / brand scoring match
            if (!bestProduct) {
                existingProducts.forEach(p => {
                    const normP = normalizeName(p.name);
                    let score = 0;
                    words.forEach(w => {
                        if (normP.includes(w)) score++;
                    });
                    const ratio = words.length > 0 ? score / words.length : 0;
                    if (ratio > bestScore && score >= 2) {
                        bestScore = ratio;
                        bestProduct = p;
                    }
                });
            }

            let productId = bestProduct ? bestProduct.id : null;

            // 4. If still unmatched, auto-provision master product in catalog
            if (!bestProduct) {
                productId = uuidv4();
                const cleanName = f.formula_name.replace(/\s+\d+(\.\d+)?(\s*(G|KG|ML))?$/i, '').trim();
                let skuCode = expectedSku;
                let counter = 1;
                while (checkSkuStmt.get(skuCode)) {
                    skuCode = `${expectedSku}-${f.formula_id || counter}`;
                    counter++;
                }
                insertProductStmt.run(
                    productId,
                    cleanName,
                    skuCode,
                    f.product_category || 'Cosmetics & Skincare',
                    150.00
                );
                existingProducts.push({ id: productId, name: cleanName, sku: skuCode, category: f.product_category, formula_code: f.formula_code });
                createdProductsCount++;
            } else {
                matchedCount++;
                updateProductCodeStmt.run(f.formula_code, productId);
            }

            // Find existing formulation entry by unique formula_code, or existing unlinked formulation for product
            let existingForm = db.prepare('SELECT id FROM product_formulations WHERE formula_code = ?').get(f.formula_code);
            if (!existingForm && productId) {
                existingForm = db.prepare('SELECT id FROM product_formulations WHERE product_id = ? AND (formula_code IS NULL OR formula_code = ?)').get(productId, f.formula_code);
            }
            const formId = existingForm ? existingForm.id : uuidv4();

            const batchSize = Number(f.batch_size) || 100;
            const batchUom = f.batch_uom || 'kg';
            const instructions = `Official FMS Recipe (${f.formula_code}). Compounding Code: ${f.compounding_code || 'N/A'}. Approved Version: ${f.active_version || 'V1.0'} (${f.version_status || 'APPROVED'}). Batch Size: ${batchSize} ${batchUom}.`;

            if (existingForm) {
                updateFormulationStmt.run(
                    productId,
                    f.formula_code,
                    f.formula_name,
                    f.compounding_code || null,
                    f.active_version || 'V1.0',
                    f.version_status || 'APPROVED',
                    f.formula_id || null,
                    batchSize,
                    batchUom,
                    instructions,
                    formId
                );
            } else {
                insertFormulationStmt.run(
                    formId,
                    productId,
                    f.formula_code,
                    f.formula_name,
                    f.compounding_code || null,
                    f.active_version || 'V1.0',
                    f.version_status || 'APPROVED',
                    f.formula_id || null,
                    batchSize,
                    batchUom,
                    instructions
                );
            }

            // Replace ingredients with authentic FMS raw materials
            deleteIngredientsStmt.run(formId);

            const rawMaterials = Array.isArray(f.raw_materials_needed) ? f.raw_materials_needed : [];
            rawMaterials.forEach((rm, idx) => {
                const reqQty = Number(rm.required_quantity) || 0;
                const percentage = batchSize > 0 ? (reqQty / batchSize) * 100 : 0;
                insertIngredientStmt.run(
                    uuidv4(),
                    formId,
                    rm.material_code || `RM-${idx + 1}`,
                    rm.material_name || 'Raw Material',
                    rm.category || 'Phase A',
                    percentage,
                    reqQty,
                    rm.uom || 'kg',
                    0.50, // default unit cost baseline
                    rm.supplier || 'Standard Approved Supplier',
                    `Supplier: ${rm.supplier || 'Standard'}`,
                    idx + 1
                );
            });

            syncedFormulasCount++;
        }
    };

    if (typeof db.transaction === 'function') {
        const syncTx = db.transaction(executeSync);
        syncTx();
    } else {
        executeSync();
    }

    return {
        success: true,
        source,
        totalFmsFormulas: fmsFormulas.length,
        syncedFormulas: syncedFormulasCount,
        matchedExistingProducts: matchedCount,
        createdCatalogProducts: createdProductsCount,
        message: `Successfully synchronized ${syncedFormulasCount} authentic formulas from FMS API.`
    };
}

/**
 * Synchronous local cache sync for startup & testing
 */
function syncFmsCacheToDatabase(db) {
    const cached = loadFallbackCache();
    if (cached.success && Array.isArray(cached.data) && cached.data.length > 0) {
        return syncFmsFormulasToDb(db, cached.data, 'LOCAL_CACHE');
    }
    return { success: false, message: 'No local cache available', count: 0 };
}

/**
 * Synchronize FMS formulations directly from live API (with cache update)
 */
async function syncFmsToDatabase(db) {
    if (!db) throw new Error('Database instance is required for FMS sync.');

    const fmsResult = await fetchFmsFormulations();
    if (!fmsResult.success || !fmsResult.data || fmsResult.data.length === 0) {
        return {
            success: false,
            message: 'Unable to connect to FMS API and no local cache was available.',
            count: 0
        };
    }

    return syncFmsFormulasToDb(db, fmsResult.data, fmsResult.source);
}

module.exports = {
    fetchFmsFormulations,
    syncFmsToDatabase,
    syncFmsCacheToDatabase,
    syncFmsFormulasToDb,
    FMS_API_URL,
    FMS_API_KEY
};

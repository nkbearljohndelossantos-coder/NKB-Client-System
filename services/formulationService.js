/**
 * NKB Manufacturing & Trading
 * Formulation Service (Confidential Bill of Materials & Order Conversion)
 *
 * Provides proprietary cosmetic recipe management and converts ordered
 * products into required raw materials upon Accounting confirmation.
 */

const { v4: uuidv4 } = require('uuid');

const DEFAULT_RECIPE_TEMPLATES = {
    SUNSCREEN: {
        code: 'FORM-SGC-V1',
        name: 'Broad Spectrum SPF 50+ Gel-Cream Formulation',
        baseDose: 50,
        unit: 'g',
        instructions: 'Mix Phase A at 75°C. Disperse Phase B at 75°C. Emulsify Phase B into Phase A. Cool down to 45°C before adding Phase C actives and Phase D aroma/preservatives.',
        ingredients: [
            { material_code: 'RM-WTR-01', material_name: 'Deionized Water (Aqua)', phase: 'Phase A - Water Base', percentage: 65.5, qty: 32.75, unit: 'g', notes: 'Purified USP Grade' },
            { material_code: 'RM-GLY-01', material_name: 'Vegetable Glycerin 99.5%', phase: 'Phase A - Water Base', percentage: 5.0, qty: 2.50, unit: 'g', notes: 'Humectant' },
            { material_code: 'RM-CAR-01', material_name: 'Carbomer 940 Polymer', phase: 'Phase A - Water Base', percentage: 0.5, qty: 0.25, unit: 'g', notes: 'Thickening Agent' },
            { material_code: 'RM-OMC-01', material_name: 'Octyl Methoxycinnamate (OMC)', phase: 'Phase B - UV Filters', percentage: 7.5, qty: 3.75, unit: 'g', notes: 'UVB Organic Absorber' },
            { material_code: 'RM-AVO-01', material_name: 'Avobenzone (Butyl Methoxydibenzoylmethane)', phase: 'Phase B - UV Filters', percentage: 3.0, qty: 1.50, unit: 'g', notes: 'UVA Organic Absorber' },
            { material_code: 'RM-TIO-01', material_name: 'Micronized Titanium Dioxide', phase: 'Phase B - UV Filters', percentage: 2.0, qty: 1.00, unit: 'g', notes: 'Physical Mineral Filter' },
            { material_code: 'RM-CTA-01', material_name: 'Cetearyl Alcohol 30/70', phase: 'Phase B - UV Filters', percentage: 3.5, qty: 1.75, unit: 'g', notes: 'Emulsifying Co-wax' },
            { material_code: 'RM-NIA-01', material_name: 'Niacinamide USP (Vitamin B3)', phase: 'Phase C - Actives', percentage: 5.0, qty: 2.50, unit: 'g', notes: 'Brightening & Barrier Repair' },
            { material_code: 'RM-CEN-01', material_name: 'Centella Asiatica (Cica) Leaf Extract', phase: 'Phase C - Actives', percentage: 3.0, qty: 1.50, unit: 'g', notes: 'Soothing Botanical' },
            { material_code: 'RM-HYA-01', material_name: 'Sodium Hyaluronate (Hyaluronic Acid)', phase: 'Phase C - Actives', percentage: 1.0, qty: 0.50, unit: 'g', notes: 'Multi-depth Hydration' },
            { material_code: 'RM-TEA-01', material_name: 'Triethanolamine 99% (TEA)', phase: 'Phase D - Finishing', percentage: 2.0, qty: 1.00, unit: 'g', notes: 'pH Neutralizer' },
            { material_code: 'RM-PHX-01', material_name: 'Phenoxyethanol & Ethylhexylglycerin', phase: 'Phase D - Finishing', percentage: 1.0, qty: 0.50, unit: 'g', notes: 'Broad-Spectrum Preservative' },
            { material_code: 'RM-FRG-01', material_name: 'Fresh Dewdrop Fragrance Oil (Hypoallergenic)', phase: 'Phase D - Finishing', percentage: 1.0, qty: 0.50, unit: 'g', notes: 'Cosmetic Grade Scent' }
        ]
    },
    SOAP: {
        code: 'FORM-BLS-V1',
        name: 'Triple Whitening Bleaching Cold-Process Soap Formula',
        baseDose: 135,
        unit: 'g',
        instructions: 'Saponify oils in Phase A with lye solution at 40°C. Blend to light trace. Incorporate Phase B whitening powders and Phase C essential oils.',
        ingredients: [
            { material_code: 'RM-CNO-01', material_name: 'Refined Coconut Oil (Cocos Nucifera)', phase: 'Phase A - Saponified Base', percentage: 48.0, qty: 64.80, unit: 'g', notes: 'Cleansing Lather Base' },
            { material_code: 'RM-PKO-01', material_name: 'Palm Kernel Oil', phase: 'Phase A - Saponified Base', percentage: 20.0, qty: 27.00, unit: 'g', notes: 'Hardness & Conditioning' },
            { material_code: 'RM-WTR-01', material_name: 'Deionized Water (Aqua)', phase: 'Phase A - Saponified Base', percentage: 16.0, qty: 21.60, unit: 'g', notes: 'Lye Solvent' },
            { material_code: 'RM-NAOH-01', material_name: 'Sodium Hydroxide Flakes 99% (Lye)', phase: 'Phase A - Saponified Base', percentage: 8.0, qty: 10.80, unit: 'g', notes: 'Saponification Agent' },
            { material_code: 'RM-KJC-01', material_name: 'Kojic Acid Dipalmitate Pure', phase: 'Phase B - Whitening Actives', percentage: 2.5, qty: 3.375, unit: 'g', notes: 'Tyrosinase Inhibitor' },
            { material_code: 'RM-GLU-01', material_name: 'Reduced L-Glutathione Powder 98%', phase: 'Phase B - Whitening Actives', percentage: 1.5, qty: 2.025, unit: 'g', notes: 'Master Antioxidant' },
            { material_code: 'RM-PAP-01', material_name: 'Papain Enzyme Extract (Carica Papaya)', phase: 'Phase B - Whitening Actives', percentage: 1.5, qty: 2.025, unit: 'g', notes: 'Enzymatic Exfoliant' },
            { material_code: 'RM-BHT-01', material_name: 'Butylated Hydroxytoluene (BHT)', phase: 'Phase C - Aroma & Stabilization', percentage: 0.5, qty: 0.675, unit: 'g', notes: 'Antioxidant Stabilizer' },
            { material_code: 'RM-FRG-02', material_name: 'Sweet Citrus Blossom Fragrance Oil', phase: 'Phase C - Aroma & Stabilization', percentage: 2.0, qty: 2.70, unit: 'g', notes: 'Aromatic Fragrance' }
        ]
    },
    LOTION: {
        code: 'FORM-KLC-V2',
        name: 'Intensive Kojic Body Lotion Formulation',
        baseDose: 250,
        unit: 'g',
        instructions: 'Heat water phase A to 80°C. Melt oil phase B to 80°C. Homogenize for 10 minutes. Cool to 40°C before adding Phase C actives.',
        ingredients: [
            { material_code: 'RM-WTR-01', material_name: 'Deionized Water (Aqua)', phase: 'Phase A - Water Phase', percentage: 70.0, qty: 175.0, unit: 'g', notes: 'Base Vehicle' },
            { material_code: 'RM-GLY-01', material_name: 'Vegetable Glycerin 99.5%', phase: 'Phase A - Water Base', percentage: 4.0, qty: 10.0, unit: 'g', notes: 'Hydrating Humectant' },
            { material_code: 'RM-EDTA-01', material_name: 'Disodium EDTA', phase: 'Phase A - Water Phase', percentage: 0.2, qty: 0.5, unit: 'g', notes: 'Chelating Agent' },
            { material_code: 'RM-CTA-01', material_name: 'Cetyl Alcohol NF', phase: 'Phase B - Oil Phase', percentage: 4.0, qty: 10.0, unit: 'g', notes: 'Emollient & Viscosity Builder' },
            { material_code: 'RM-STA-01', material_name: 'Triple Pressed Stearic Acid', phase: 'Phase B - Oil Phase', percentage: 3.0, qty: 7.5, unit: 'g', notes: 'Thickener & Emulsifier' },
            { material_code: 'RM-MNO-01', material_name: 'White Mineral Oil USP', phase: 'Phase B - Oil Phase', percentage: 6.0, qty: 15.0, unit: 'g', notes: 'Occlusive Moisturizer' },
            { material_code: 'RM-DMT-01', material_name: 'Dimethicone 350 cSt', phase: 'Phase B - Oil Phase', percentage: 2.0, qty: 5.0, unit: 'g', notes: 'Slip & Velvet Feel' },
            { material_code: 'RM-KJC-01', material_name: 'Kojic Acid Dipalmitate', phase: 'Phase C - Actives', percentage: 2.5, qty: 6.25, unit: 'g', notes: 'Skin Brightener' },
            { material_code: 'RM-ARB-01', material_name: 'Alpha Arbutin Powder', phase: 'Phase C - Actives', percentage: 1.5, qty: 3.75, unit: 'g', notes: 'Dark Spot Correction' },
            { material_code: 'RM-ASC-01', material_name: 'Sodium Ascorbyl Phosphate (Vitamin C)', phase: 'Phase C - Actives', percentage: 2.0, qty: 5.0, unit: 'g', notes: 'Stable Vitamin C Active' },
            { material_code: 'RM-PHX-01', material_name: 'Phenoxyethanol & Ethylhexylglycerin', phase: 'Phase D - Preservation', percentage: 1.8, qty: 4.5, unit: 'g', notes: 'Microbial Preservative' },
            { material_code: 'RM-FRG-03', material_name: 'Silk Blossom Premium Perfume Essence', phase: 'Phase D - Preservation', percentage: 3.0, qty: 7.5, unit: 'g', notes: 'Body Fragrance' }
        ]
    },
    SERUM: {
        code: 'FORM-NCS-V3',
        name: 'Pore Refining 10% Niacinamide Facial Serum',
        baseDose: 30,
        unit: 'g',
        instructions: 'Hydrate hyaluronic acid in Phase A water. Dissolve Niacinamide and Zinc PCA until crystal clear. Preserve with Phase C.',
        ingredients: [
            { material_code: 'RM-WTR-01', material_name: 'Deionized Water (Aqua)', phase: 'Phase A - Hydration Base', percentage: 76.5, qty: 22.95, unit: 'g', notes: 'Ultra-Pure Deionized' },
            { material_code: 'RM-GLY-01', material_name: 'Vegetable Glycerin 99.5%', phase: 'Phase A - Hydration Base', percentage: 5.0, qty: 1.50, unit: 'g', notes: 'Hydrating Humectant' },
            { material_code: 'RM-HYA-01', material_name: 'Sodium Hyaluronate (Multi-molecular)', phase: 'Phase A - Hydration Base', percentage: 2.0, qty: 0.60, unit: 'g', notes: 'Deep Moisture Film' },
            { material_code: 'RM-NIA-01', material_name: 'Niacinamide USP (Vitamin B3 99.8%)', phase: 'Phase B - Active Complex', percentage: 10.0, qty: 3.00, unit: 'g', notes: 'Pore Reducer & Sebum Regulator' },
            { material_code: 'RM-ZNC-01', material_name: 'Zinc PCA (Zinc L-Pyrrolidone Carboxylate)', phase: 'Phase B - Active Complex', percentage: 1.5, qty: 0.45, unit: 'g', notes: 'Anti-blemish Mineral' },
            { material_code: 'RM-ALN-01', material_name: 'Allantoin USP', phase: 'Phase B - Active Complex', percentage: 0.5, qty: 0.15, unit: 'g', notes: 'Anti-irritant' },
            { material_code: 'RM-PHX-01', material_name: 'Phenoxyethanol & Ethylhexylglycerin', phase: 'Phase C - Finishing', percentage: 1.5, qty: 0.45, unit: 'g', notes: 'Broad Preservative' },
            { material_code: 'RM-EDTA-01', material_name: 'Disodium EDTA', phase: 'Phase C - Finishing', percentage: 0.2, qty: 0.06, unit: 'g', notes: 'Stabilizer' },
            { material_code: 'RM-BOT-01', material_name: 'Witch Hazel Distillate (Alcohol Free)', phase: 'Phase C - Finishing', percentage: 2.8, qty: 0.84, unit: 'g', notes: 'Pore Astringent' }
        ]
    },
    GENERAL: {
        code: 'FORM-GEN-V1',
        name: 'Standard Botanical Cosmetic Formulation',
        baseDose: 100,
        unit: 'g',
        instructions: 'Compound Phase A water base and Phase B emulsifiers. Blend at 70°C. Cool to 45°C before incorporating botanical active ingredients.',
        ingredients: [
            { material_code: 'RM-WTR-01', material_name: 'Deionized Water (Aqua)', phase: 'Phase A - Water Phase', percentage: 70.0, qty: 70.0, unit: 'g', notes: 'Base Liquid' },
            { material_code: 'RM-GLY-01', material_name: 'Vegetable Glycerin 99.5%', phase: 'Phase A - Water Phase', percentage: 6.0, qty: 6.0, unit: 'g', notes: 'Humectant' },
            { material_code: 'RM-EWX-01', material_name: 'Polawax Self-Emulsifying Wax', phase: 'Phase B - Lipid Phase', percentage: 8.0, qty: 8.0, unit: 'g', notes: 'Emulsion Base' },
            { material_code: 'RM-MNO-01', material_name: 'White Mineral Oil USP', phase: 'Phase B - Lipid Phase', percentage: 8.0, qty: 8.0, unit: 'g', notes: 'Emollient Vehicle' },
            { material_code: 'RM-BOT-01', material_name: 'Botanical Brightening Extract Complex', phase: 'Phase C - Actives', percentage: 5.0, qty: 5.0, unit: 'g', notes: 'Active Botanical' },
            { material_code: 'RM-PHX-01', material_name: 'Phenoxyethanol & Ethylhexylglycerin', phase: 'Phase D - Preservation', percentage: 1.5, qty: 1.5, unit: 'g', notes: 'Preservative' },
            { material_code: 'RM-FRG-01', material_name: 'Signature Floral Fragrance Essence', phase: 'Phase D - Preservation', percentage: 1.5, qty: 1.5, unit: 'g', notes: 'Scent' }
        ]
    }
};

/**
 * Detect suitable recipe template based on product name or category
 */
function matchTemplateForProduct(productName = '', category = '') {
    const text = `${productName} ${category}`.toUpperCase();
    if (text.includes('SUN') || text.includes('SPF') || text.includes('UV') || text.includes('GEL-CREAM')) {
        return DEFAULT_RECIPE_TEMPLATES.SUNSCREEN;
    }
    if (text.includes('SOAP') || text.includes('BAR') || text.includes('BLEACH') || text.includes('GLUTA')) {
        return DEFAULT_RECIPE_TEMPLATES.SOAP;
    }
    if (text.includes('LOTION') || text.includes('BODY') || text.includes('MILK') || text.includes('CREAM')) {
        return DEFAULT_RECIPE_TEMPLATES.LOTION;
    }
    if (text.includes('SERUM') || text.includes('PORE') || text.includes('AMPOULE') || text.includes('ESSENCE')) {
        return DEFAULT_RECIPE_TEMPLATES.SERUM;
    }
    return DEFAULT_RECIPE_TEMPLATES.GENERAL;
}

/**
 * Auto-seed realistic formulations for existing catalog products that don't have one
 */
function seedDefaultFormulations(db) {
    if (!db) return;
    try {
        const products = db.prepare(`
            SELECT p.id, p.name, p.category, p.sku, p.formula_code,
                   pf.id as formulation_id
            FROM products p
            LEFT JOIN product_formulations pf ON pf.product_id = p.id
            WHERE pf.id IS NULL
        `).all();

        if (!products || products.length === 0) return;

        const insertFormulation = db.prepare(`
            INSERT INTO product_formulations 
            (id, product_id, formula_code, name, base_dose_qty, base_unit, instructions, is_confidential, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `);

        const insertIngredient = db.prepare(`
            INSERT INTO formulation_ingredients 
            (id, formulation_id, material_code, material_name, phase, percentage, quantity_per_unit, unit, notes, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `);

        for (const prod of products) {
            const template = matchTemplateForProduct(prod.name, prod.category);
            const formId = uuidv4();
            const formulaCode = prod.formula_code || template.code;
            const formulaName = `${prod.name} - Proprietary Formulation (${formulaCode})`;

            insertFormulation.run(
                formId,
                prod.id,
                formulaCode,
                formulaName,
                template.baseDose,
                template.unit,
                template.instructions
            );

            template.ingredients.forEach((ing, idx) => {
                insertIngredient.run(
                    uuidv4(),
                    formId,
                    ing.material_code,
                    ing.material_name,
                    ing.phase,
                    ing.percentage,
                    ing.qty,
                    ing.unit,
                    ing.notes,
                    idx + 1
                );
            });
        }
    } catch (err) {
        console.warn('Seed default formulations note:', err.message);
    }
}

/**
 * Get all formulations with ingredient counts and confidentiality status
 */
function getFormulations(db, options = {}) {
    seedDefaultFormulations(db);

    let query = `
        SELECT pf.*,
               p.name as product_name,
               p.sku as product_sku,
               p.category as product_category,
               p.default_price,
               COUNT(fi.id) as ingredient_count,
               COALESCE(SUM(fi.quantity_per_unit), 0) as total_formulation_mass
        FROM product_formulations pf
        JOIN products p ON p.id = pf.product_id
        LEFT JOIN formulation_ingredients fi ON fi.formulation_id = pf.id
    `;
    const params = [];

    if (options.search) {
        query += ` WHERE (p.name LIKE ? OR pf.formula_code LIKE ? OR pf.name LIKE ? OR p.sku LIKE ?)`;
        const term = `%${options.search}%`;
        params.push(term, term, term, term);
    }

    query += ` GROUP BY pf.id ORDER BY p.name ASC`;

    return db.prepare(query).all(...params);
}

/**
 * Get single formulation with full ingredients and phases
 */
function getFormulationByProductId(db, productId) {
    seedDefaultFormulations(db);

    let formulation = db.prepare(`
        SELECT pf.*,
               p.name as product_name,
               p.sku as product_sku,
               p.category as product_category,
               p.default_price,
               p.description as product_description
        FROM product_formulations pf
        JOIN products p ON p.id = pf.product_id
        WHERE pf.product_id = ?
    `).get(productId);

    if (!formulation) {
        // Fallback: If product exists without formulation, create it now!
        const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
        if (prod) {
            seedDefaultFormulations(db);
            formulation = db.prepare(`
                SELECT pf.*,
                       p.name as product_name,
                       p.sku as product_sku,
                       p.category as product_category,
                       p.default_price,
                       p.description as product_description
                FROM product_formulations pf
                JOIN products p ON p.id = pf.product_id
                WHERE pf.product_id = ?
            `).get(productId);
        }
    }

    if (!formulation) return null;

    const ingredients = db.prepare(`
        SELECT * FROM formulation_ingredients 
        WHERE formulation_id = ? 
        ORDER BY phase ASC, sort_order ASC, material_name ASC
    `).all(formulation.id);

    // Group ingredients by Phase for professional pharmaceutical / compounding layout
    const phases = {};
    ingredients.forEach(ing => {
        const ph = ing.phase || 'Phase A - Base';
        if (!phases[ph]) phases[ph] = [];
        phases[ph].push(ing);
    });

    return {
        ...formulation,
        ingredients,
        phases
    };
}

/**
 * Create or update product formulation and its ingredients
 */
function saveFormulation(db, data, userId = null) {
    const { productId, formulaCode, name, baseDoseQty, baseUnit, instructions, isConfidential, ingredients } = data;

    if (!productId) throw new Error('Product ID is required.');
    if (!name || !name.trim()) throw new Error('Formulation name is required.');

    let existing = db.prepare('SELECT id FROM product_formulations WHERE product_id = ?').get(productId);
    let formId = existing ? existing.id : uuidv4();

    if (existing) {
        db.prepare(`
            UPDATE product_formulations
            SET formula_code = ?,
                name = ?,
                base_dose_qty = ?,
                base_unit = ?,
                instructions = ?,
                is_confidential = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(
            formulaCode || 'FORM-CUSTOM',
            name.trim(),
            Number(baseDoseQty) || 1.0,
            baseUnit || 'pcs',
            instructions || '',
            isConfidential !== undefined ? (isConfidential ? 1 : 0) : 1,
            formId
        );
    } else {
        db.prepare(`
            INSERT INTO product_formulations
            (id, product_id, formula_code, name, base_dose_qty, base_unit, instructions, is_confidential, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(
            formId,
            productId,
            formulaCode || 'FORM-CUSTOM',
            name.trim(),
            Number(baseDoseQty) || 1.0,
            baseUnit || 'pcs',
            instructions || '',
            isConfidential !== undefined ? (isConfidential ? 1 : 0) : 1
        );
    }

    // Update product formula_code
    if (formulaCode) {
        db.prepare(`UPDATE products SET formula_code = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(formulaCode, productId);
    }

    // Replace ingredients if provided
    if (Array.isArray(ingredients)) {
        db.prepare('DELETE FROM formulation_ingredients WHERE formulation_id = ?').run(formId);
        const insertIng = db.prepare(`
            INSERT INTO formulation_ingredients
            (id, formulation_id, material_code, material_name, phase, percentage, quantity_per_unit, unit, notes, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `);

        ingredients.forEach((ing, idx) => {
            insertIng.run(
                uuidv4(),
                formId,
                ing.material_code || `RM-${idx + 1}`,
                ing.material_name || 'Raw Material',
                ing.phase || 'Phase A',
                Number(ing.percentage) || 0.0,
                Number(ing.quantity_per_unit || ing.qty) || 0.0,
                ing.unit || 'g',
                ing.notes || '',
                idx + 1
            );
        });
    }

    return getFormulationByProductId(db, productId);
}

/**
 * CONVERT ORDER TO RAW MATERIALS
 * Core requested logic: Every time a product order is confirmed by Accounting,
 * converts all items into required raw materials using their formulations.
 */
function convertOrderToRawMaterials(db, poId, userId = null) {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
    if (!po) throw new Error('Purchase Order not found.');

    const items = db.prepare(`
        SELECT poi.*, p.name as product_name, p.sku as product_sku, p.category as product_category
        FROM purchase_order_items poi
        JOIN products p ON p.id = poi.product_id
        WHERE poi.po_id = ?
    `).all(poId);

    if (!items || items.length === 0) {
        throw new Error('No items found in this Purchase Order to convert.');
    }

    // Remove existing conversion records for this PO to ensure clean idempotency
    db.prepare('DELETE FROM order_material_conversions WHERE po_id = ?').run(poId);

    const insertConversion = db.prepare(`
        INSERT INTO order_material_conversions
        (id, po_id, po_item_id, product_id, formula_code, material_code, material_name, phase, percentage, unit_quantity, total_quantity, unit, status, converted_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ALLOCATED', datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const convertedRecords = [];

    for (const it of items) {
        let formulation = getFormulationByProductId(db, it.product_id);
        if (!formulation || !formulation.ingredients || formulation.ingredients.length === 0) {
            seedDefaultFormulations(db);
            formulation = getFormulationByProductId(db, it.product_id);
        }

        const ingredients = (formulation && formulation.ingredients) ? formulation.ingredients : [];
        const targetQty = Number(it.target_quantity) || 1;

        for (const ing of ingredients) {
            const unitQty = Number(ing.quantity_per_unit) || 0;
            const totalQty = targetQty * unitQty;
            const conversionId = uuidv4();

            insertConversion.run(
                conversionId,
                poId,
                it.id,
                it.product_id,
                formulation.formula_code || 'FORM-STD',
                ing.material_code,
                ing.material_name,
                ing.phase || 'Phase A',
                ing.percentage || 0,
                unitQty,
                totalQty,
                ing.unit || 'g'
            );

            convertedRecords.push({
                id: conversionId,
                po_id: poId,
                po_item_id: it.id,
                product_id: it.product_id,
                product_name: it.product_name,
                product_sku: it.product_sku,
                formula_code: formulation.formula_code,
                material_code: ing.material_code,
                material_name: ing.material_name,
                phase: ing.phase,
                percentage: ing.percentage,
                unit_quantity: unitQty,
                total_quantity: totalQty,
                unit: ing.unit
            });
        }
    }

    // Update purchase_orders with formulation converted status
    db.prepare(`
        UPDATE purchase_orders
        SET formulation_converted = 1,
            formulation_converted_at = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
    `).run(poId);

    return getOrderMaterialBreakdown(db, poId);
}

/**
 * Retrieve raw material breakdown for an order:
 * Grouped per ordered product + Consolidated pull sheet across all products
 */
function getOrderMaterialBreakdown(db, poId) {
    const po = db.prepare(`
        SELECT po.*,
               c.company_name as client_name,
               c.contact_person as client_contact,
               c.email as client_email,
               c.phone as client_phone,
               c.address as client_address
        FROM purchase_orders po
        JOIN clients c ON c.id = po.client_id
        WHERE po.id = ?
    `).get(poId);

    if (!po) return null;

    // Check if conversion already exists
    let rawList = db.prepare(`
        SELECT omc.*,
               p.name as product_name,
               p.sku as product_sku,
               poi.target_quantity as po_item_target_qty,
               poi.unit_price as po_item_unit_price,
               poi.subtotal as po_item_subtotal
        FROM order_material_conversions omc
        JOIN products p ON p.id = omc.product_id
        LEFT JOIN purchase_order_items poi ON poi.id = omc.po_item_id
        WHERE omc.po_id = ?
        ORDER BY p.name ASC, omc.phase ASC, omc.material_name ASC
    `).all(poId);

    // If order was accounting confirmed but not yet converted, trigger conversion now
    if (rawList.length === 0 && (po.accounting_confirmed === 1 || po.status === 'APPROVED' || po.status === 'IN_PRODUCTION' || po.status === 'COMPLETED')) {
        return convertOrderToRawMaterials(db, poId);
    }

    // Group by Product
    const perProduct = {};
    rawList.forEach(row => {
        if (!perProduct[row.product_id]) {
            perProduct[row.product_id] = {
                product_id: row.product_id,
                product_name: row.product_name,
                product_sku: row.product_sku,
                formula_code: row.formula_code,
                target_quantity: row.po_item_target_qty,
                unit_price: row.po_item_unit_price,
                subtotal: row.po_item_subtotal,
                materials: []
            };
        }
        perProduct[row.product_id].materials.push(row);
    });

    // Consolidated compounding pull sheet (aggregated total quantities across all products)
    const consolidatedMap = {};
    rawList.forEach(row => {
        const key = `${row.material_code}_${row.unit}`;
        if (!consolidatedMap[key]) {
            consolidatedMap[key] = {
                material_code: row.material_code,
                material_name: row.material_name,
                phase: row.phase,
                total_quantity: 0,
                unit: row.unit,
                used_in_products: new Set()
            };
        }
        consolidatedMap[key].total_quantity += Number(row.total_quantity) || 0;
        consolidatedMap[key].used_in_products.add(row.product_name);
    });

    const consolidated = Object.values(consolidatedMap).map(c => {
        const totalNum = c.total_quantity;
        let formattedKg = '';
        if (c.unit.toLowerCase() === 'g' && totalNum >= 1000) {
            formattedKg = ` (${(totalNum / 1000).toFixed(3)} kg)`;
        } else if (c.unit.toLowerCase() === 'ml' && totalNum >= 1000) {
            formattedKg = ` (${(totalNum / 1000).toFixed(3)} L)`;
        }
        return {
            ...c,
            used_in_products: Array.from(c.used_in_products),
            formatted_quantity: `${totalNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${c.unit}${formattedKg}`
        };
    }).sort((a, b) => a.material_name.localeCompare(b.material_name));

    return {
        order: po,
        perProduct: Object.values(perProduct),
        consolidated,
        totalRawMaterialItems: rawList.length,
        totalUniqueRawMaterials: consolidated.length
    };
}

module.exports = {
    seedDefaultFormulations,
    getFormulations,
    getFormulationByProductId,
    saveFormulation,
    convertOrderToRawMaterials,
    getOrderMaterialBreakdown
};

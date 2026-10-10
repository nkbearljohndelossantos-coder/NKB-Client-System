const db = require('../database/db');

/**
 * Julian Calendar Day (day of year 1..366)
 */
function getJulianDay(dateInput = new Date()) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 1;
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = d - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay) + 1;
}

/**
 * Derive product abbreviation based on template or product name.
 * Handles explicit manufacturer rules (e.g., HCL Pekas Cream -> HCP).
 */
function deriveProductAbbreviation(productOrName = '', template = '') {
    let name = '';
    let batchTemplate = template;

    if (typeof productOrName === 'object' && productOrName !== null) {
        name = productOrName.name || '';
        batchTemplate = productOrName.batch_code_template || template || '';
    } else {
        name = String(productOrName || '');
    }

    if (batchTemplate && typeof batchTemplate === 'string') {
        const m = batchTemplate.match(/^([A-Za-z0-9]+?)(?:XX-XXX|-XX-XXX|[0-9]{2}-|$)/i);
        if (m && m[1] && m[1].length >= 2) {
            return m[1].toUpperCase();
        }
    }

    let clean = name.replace(/\([^)]*\)/g, ' ').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
    const upper = clean.toUpperCase();

    // Specific user rule & industry catalog matches
    if (upper.includes('PEKAS') && (upper.includes('HCL') || upper.includes('HCI') || upper.includes('HER CHOICE'))) {
        return 'HCP';
    }
    if (upper.includes('KOJIC') && upper.includes('PAPAYA') && (upper.includes('HCL') || upper.includes('HCI') || upper.includes('HER CHOICE'))) {
        return 'HCKPBS';
    }
    if (upper.includes('WHITENING') && upper.includes('LOTION') && (upper.includes('HCL') || upper.includes('HCI') || upper.includes('HER CHOICE'))) {
        return 'HCIWL';
    }

    const stopWords = new Set([
        'SPF50', 'PA', '120ML', '50G', '100ML', '250ML', '500ML', '1L', '2L', 'SET',
        'THE', 'AND', 'WITH', 'FOR', 'OF', 'IN', 'BY', 'PLUS', 'DAILY'
    ]);

    const words = clean.split(/\s+/).filter(w => w.length > 0 && !stopWords.has(w.toUpperCase()));
    if (words.length === 0) return 'PRD';
    if (words.length === 1) return words[0].slice(0, 4).toUpperCase();

    return words.map(w => w[0]).join('').toUpperCase().slice(0, 7);
}

/**
 * Generate next Julian batch code for a product and date:
 * Pattern: [Abbr][YY]-[JulianDay] (for 1st batch)
 *          [Abbr][YY]-[JulianDay]-[Index] (if excess/subsequent from batch 1)
 *
 * Example:
 * Product: HCL Pekas Cream -> HCP26-255 (batch 1), HCP26-255-1 (excess)
 */
function generateJulianBatchCode(productIdOrObj, productionDate = new Date()) {
    let product = null;
    if (typeof productIdOrObj === 'object' && productIdOrObj !== null) {
        product = productIdOrObj;
    } else if (productIdOrObj) {
        product = db.prepare('SELECT id, name, sku, batch_code_template FROM products WHERE id = ?').get(productIdOrObj);
    }

    const d = productionDate ? new Date(productionDate) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;

    const abbr = deriveProductAbbreviation(product);
    const yy = String(validDate.getFullYear()).slice(-2);
    const julianDay = getJulianDay(validDate);

    // Format: HCP26-255
    const baseCode = `${abbr}${yy}-${julianDay}`;

    // Check existing batches for this baseCode
    const existing = db.prepare(`
        SELECT batch_number FROM production_batches
        WHERE batch_number = ? OR batch_number LIKE ?
    `).all(baseCode, `${baseCode}-%`);

    if (!existing || existing.length === 0) {
        return baseCode;
    }

    const existingSet = new Set(existing.map(b => b.batch_number.toUpperCase()));

    // If baseCode itself is not taken (e.g. only -1 or -2 existed somehow), return baseCode
    if (!existingSet.has(baseCode.toUpperCase())) {
        return baseCode;
    }

    // Base code exists, determine next excess index (-1, -2, ...)
    let nextIndex = 1;
    while (existingSet.has(`${baseCode.toUpperCase()}-${nextIndex}`)) {
        nextIndex++;
    }

    return `${baseCode}-${nextIndex}`;
}

module.exports = {
    getJulianDay,
    deriveProductAbbreviation,
    generateJulianBatchCode
};

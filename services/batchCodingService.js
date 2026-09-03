/**
 * Automatic Batch Coding Service
 * Formula: BRAND INITIALS + 2-Digit Year (XX) - 3-Digit Julian Day (XXX) [+ Suffix]
 * Example: BSPTS26-247
 */

const BATCH_CODE_CATALOG = [
    // BELLA SKIN
    { name: "BELLA SKIN PERFECT TINT SUNSCREEN SPF50 PA++++", template: "BSPTSXX-XXX" },
    { name: "BELLA SKIN PERFECT PLUS MIRACLE BAR", template: "BSMBXX-XXX" },
    { name: "BELLA SKIN FACIAL SET (BELLA SKIN OVERNIGHT SKIN RENEWAL NIGHT CREAM)", template: "BSFSNCXX-XXX" },
    { name: "BELLA SKIN FACIAL SET (BELLA SKIN DAILY SUN PROTECTION SUNBLOCK SPF50)", template: "BSFSSBXX-XXX" },
    { name: "BELLA SKIN FACIAL SET (BELLA SKIN TONER)", template: "BSFSTXX-XXX" },
    { name: "BELLA SKIN FACIAL SET (BELLA SKIN PREMIUM FACIAL WASH)", template: "BSFSFWXX-XXX" },
    { name: "BELLA SKIN TONER", template: "BSTXX-XXX" },
    { name: "BELLA SKIN DAILY SUN PROTECTION SUNBLOCK SPF 50", template: "BSDSPXX-XXX" },
    { name: "BELLA SKIN 3ACTIVE SPF50 PA++++ HAND & BODY LOTION", template: "BSTHBXX-XXX" },
    { name: "BELLA SKIN NIACINAMIDE JEJU ALOE SOOTHING SERUM", template: "BSNJSXX-XXX" },
    { name: "BELLA SKIN RETINOL SERUM 2.0 WITH RETINOL MULTIBOOST TECHNOLOGY", template: "BSRSXX-XXX" },
    { name: "BELLA SKIN MAGIC LIP SERUM", template: "BSLSXX-XXX" },
    { name: "BELLA SKIN LIP TINT-A-DARK PLUM", template: "BSLTADXX-XXX" },
    { name: "BELLA SKIN LIP TINT-B-BURGUNDY", template: "BSLTBBXX-XXX" },
    { name: "BELLA SKIN LIP TINT-C-CARMINE", template: "BSLTCCXX-XXX" },
    { name: "BELLA SKIN LIP TINT-D-CARDINAL", template: "BSLTDCXX-XXX" },
    { name: "BELLA SKIN LIP TINT-E-BRICK RED", template: "BSLTEBXX-XXX" },
    { name: "BELLA SKIN 72H ANTIPERSPIRANT BRIGHTENING DEO SPRAY", template: "BSADSXX-XXX" },
    { name: "BELLA SKIN THE SKIN VITAMIN 24K GOLD SERUM", template: "BSGSXX-XXX" },
    { name: "BELLA SKIN PURE LIGHT BRIGHTENING LOTION SPF50", template: "BSPLXX-XXX" },
    { name: "BELLA SKIN MAINTENANCE SET (BELLA SKIN RETINOL NIGHT CREAM)", template: "BSMSNCXX-XXX" },
    { name: "BELLA SKIN MAINTENANCE SET (BELLA SKIN DAILY SUN PROTECTION SUNBLOCK SPF 50 PA++++)", template: "BSMSSBXX-XXX" },
    { name: "BELLA SKIN MAINTENANCE SET (BELLA SKIN MAINTENANCE TONER)", template: "BSMSTXX-XXX" },
    { name: "BELLA SKIN RETINOL CREAM", template: "BSRCXX-XXX" },
    { name: "BELLA SKIN PREMIUM FACIAL WASH", template: "BSFWXX-XXX" },
    { name: "BELLA SKIN FUKEIKO FEMININE WASH", template: "BSFFWXX-XXX" },
    { name: "BELLA SKIN FUKEIKO YUMMY FEMININE INTIMATE SPRAY", template: "BSFFSXX-XXX" },
    { name: "BELLA SKIN KOJIC HYA-C BAR SOAP", template: "BSKHBXX-XXX" },
    { name: "BELLA SKIN PEKAS WIPEOUT & PORE MINIMIZING CREAM", template: "BSPWPCXX-XXX" },
    { name: "BELLA SKIN NIGHT CREAM (SOLO)", template: "BSNCXX-XXX" },
    { name: "BELLA SKIN PERFECT PAIR VITA + HYA SKINTENSIFYING TONER", template: "BSCHTXX-XXX" },
    { name: "TARATITAT GLUTA PAPAYA SOAP", template: "TGPSXX-XXX" },
    { name: "BELLA SKIN LIP CREAM S7 NUDE", template: "BSLC7NXX-XXX" },
    { name: "BELLA SKIN RETINAL CREAM", template: "BSRACXX-XXX" },
    { name: "BELLA SKIN MILKY GLOW BLEACHING CREAM", template: "BSMGBCXX-XXX" },
    { name: "BELLA SKIN UNDERARM & INTIMATE AREA DARK SPOT CORRECTOR CREAM", template: "BSUAICCXX-XXX" },
    { name: "BELLA SKIN CLAY BLUSH- TERRACOTA", template: "BSCBTXX-XXX" },
    { name: "BELLA SKIN CLAY BLUSH- FUCHSIA", template: "BSCBFXX-XXX" },
    { name: "BELLA SKIN LIP CREAM S5 PLUM", template: "BSLC5PXX-XXX" },
    { name: "BELLA SKIN LIP CREAM S6 PEACH", template: "BSLC6PHXX-XXX" },
    { name: "BELLA SKIN CLAY BLUSH- APRICOT", template: "BSCBAXX-XXX" },
    { name: "BELLA SKIN ROSE PDRN CREAM", template: "BSRPCXX-XXX" },
    { name: "BELLA SKIN THE SKIN VITAMIN 24K GOLD + PDRN SERUM", template: "BS24PSXX-XXX" },
    { name: "BELLA SKIN NIACINAMIDE JEJU ALOE + PDRN SOOTHING SERUM", template: "BSNJSPXX-XXX" },
    { name: "K BELLA SKIN SUNSCREEN ROSE PDRN", template: "KBSSRPXX-XXX" },
    
    // NATASHA
    { name: "NATASHA TINTED SUNSCREEN SPF50 PA++++", template: "NTSSXX-XXX" },
    { name: "NATASHA BLOOM LIP SERUM", template: "NBLSXX-XXX" },
    
    // HANAPAM
    { name: "HANAPAM LIP SERUM", template: "HPLSXX-XXX" },
    { name: "HANAPAM BRIGHTENING BAR", template: "HPBSXX-XXX" },
    { name: "HANAPAM LOTION", template: "HPLXX-XXX" },
    
    // GELIS PHARMA
    { name: "GELIS PHARMA GIDERM DAILY SUN PROTECTION", template: "GDDSPXX-XXX" },
    { name: "GELIS PHARMA GIDERM STRETCH MARK CREAM", template: "GDSMCXX-XXX" },
    { name: "GELIS PHARMA GIDERM FACIAL MOSTURIZER", template: "GDFMXX-XXX" },
    
    // SKEENCARE
    { name: "SKEENCARE TINTED SUNSCREEN CREAM", template: "SCTSCXX-XXX" },
    { name: "SKEENCARE REJUVENATING TONER", template: "SCRTXX-XXX" },
    { name: "SKEENCARE NIACINAMIDE BAR SOAP", template: "SCNBSXX-XXX" },
    { name: "SKEENCARE MOISTURIZING CREAM", template: "SCMCXX-XXX" },
    { name: "SKEENCARE KOJIC PAPAYA SOAP REMOLD", template: "SCKPSRemXX-XXX" },
    { name: "SKEENCARE OXYGENATED SUNSCREEN", template: "SCOSSXX-XXX" },
    { name: "SKEENCARE BAKUCHIOL NIACINAMIDE SERUM", template: "SCBNSXX-XXX" },
    { name: "SKEENCARE 4 IN 1 ALCOHOL FREE TONER", template: "SCAFTXX-XXX" },
    { name: "SKEENCARE SPRAY N' SLAY FEMININE SPRAY BANANA SPLIT", template: "SCFSBXX-XXX" },
    { name: "SKEENCARE SPRAY N' SLAY FEMININE SPRAY STRAWBERRY FLAVOR", template: "SCFSSXX-XXX" },
    { name: "CUTIS ANO NE MILK POWER LIGHTENING LOTION", template: "CAMPLXX-XXX" },
    { name: "CUTIS ANO NE MILK WHITE GLUTATHIONE LOTION", template: "CAWGLXX-XXX" },
    { name: "SKEENCARE PEKAS CREAM", template: "SCPCXX-XXX" },
    
    // ADORN
    { name: "ADORN SUNBLOCK CREAM", template: "ASBCXX-XXX" },
    
    // HER CHOICE PH
    { name: "HER CHOICE PH INTENSIVE BLEACHING CREAM", template: "HCIBCXX-XXX" },
    { name: "HER CHOICE PH WHITE SECRET RENEWAL SERUM", template: "HCRSXX-XXX" },
    { name: "HER CHOICE PH WHITE SECRET INTIMATE SERUM", template: "HCISXX-XXX" },
    { name: "HER CHOICE PH KOJIC PAPAYA BAR SOAP", template: "HCKPBSXX-XXX" },
    { name: "HER CHOICE PH CENTELLA ASIATICA SOOTHING & CALMING SERUM WITH ALOE VERA AND AHA", template: "HCCASXX-XXX" },
    { name: "HER CHOICE PH CENTELLA ASIATICA HYDRATING & CALMING TONER WITH NIACINAMIDE", template: "HCCATXX-XXX" },
    { name: "HER CHOICE PH CENTELLA ASIATICA HYDRATING & CALMING FACIAL FOAM WASH", template: "HCCAFWXX-XXX" },
    { name: "HER CHOICE PH CENTELLA ASIATICA MOISTURIZING AND NOURISHING CREAM WITH CAMELLIA OIL & HYALURONIC ACID", template: "HCCANCXX-XXX" },
    { name: "HER CHOICE PH INTENSIVE BLEACHING BAR SOAP", template: "HCIBBSXX-XXX" },
    { name: "HER CHOICE PH PEKAS CREAM", template: "HCPCXX-XXX" },
    { name: "HER CHOICE PH INSTANT WHITENING LOTION SPF50 WITH SUNFLOWER EXTRACT", template: "HCIWLXX-XXX" },
    { name: "HER CHOICE PH SUN SHIELD SPF50 PA++++", template: "HCSSXX-XXX" },
    { name: "HER CHOICE PH PREMIUM TINTED SUNSHIELD SPF50 PA+++", template: "HCPTSSXX-XXX" },
    { name: "HER CHOICE SUNFLOWER BEAUTY OIL WITH KOJIC ACID", template: "HCSBOKXX-XXX" },
    
    // JGLOWW
    { name: "JGLOWW BRIGHTENING & MOISTURIZING SOAP", template: "JGBMSXX-XXX" },
    { name: "JGLOWW VITAMIN C & E SERUM", template: "JGCESXX-XXX" },
    { name: "JGLOWW GLOW BOOST BRIGHTENING SOAP", template: "JGGBBSXX-XXX" },
    { name: "JGLOWW LIP SERUM", template: "JGLSXX-XXX" },
    
    // BRIGHTEST
    { name: "BRIGHTEST PERFECT TINT (PAID SAMPLE)", template: "BPTXX-XXX" },
    { name: "BRIGHTEST SET SUNBLOCK (PAID SAMPLE)", template: "PSBSSXX-XXX" },
    { name: "BRIGHTEST SET NIGHT CREAM (PAID SAMPLE)", template: "PSBSNCXX-XXX" },
    { name: "BRIGHTEST SET TONER (PAID SAMPLE)", template: "PSBSTXX-XXX" },
    { name: "BRIGHTEST UNDERARM CREAM (PAID SAMPLE) GREEN TEA", template: "PSUACXX-XXX" },
    { name: "BRIGHTEST UNDERARM CREAM (PAID SAMPLE) BABY POWDER", template: "PSUACXX-XXX" },
    
    // MAGNIFIQUE / INTIMATE WHITE
    { name: "MAGNIFIQUE WHITE KOJIC ACID WITH VITAMIN E HAND & BODY LOTION", template: "MWKAEXX-XXX" },
    { name: "MAGNIFIQUE WHITE GLUTA INTENSE WHITENING WITH VITAMIN C HAND AND BODY LOTION", template: "MWGICXX-XXX" },
    { name: "INTIMATE WHITE NIACINAMIDE WITH ARBUTIN ABSOLUTE RADIANCE BRIGHTENING SERUM", template: "IWNASXX-XXX" },
    
    // BIOESSENCE
    { name: "BIOESSENCE SLIMMING OIL", template: "BESGOXX-XXX" },
    
    // DREAM GIRL
    { name: "DREAM GIRL LIP CREAM RED WINE", template: "DGLCRWXX-XXX" },
    { name: "DREAM GIRL LIP CREAM JAM 02", template: "DGLCJXX-XXX" },
    { name: "DREAM GIRL LIP CREAM MAGENTA 03", template: "DGLCMXX-XXX" },
    { name: "DREAM GIRL LIP CREAM FIRE 04", template: "DGLCFXX-XXX" },
    
    // SABELA SKIN
    { name: "SABELA SKIN TINTED SUNSCREEN SPF50 PA++++", template: "SSTSSXX-XXX" },
    
    // ROYCE B
    { name: "ROYCE B KIME TSUYA BLEACHING SOAP", template: "RBBSXX-XXX" },
    { name: "ROYCE B PROTECT & GLOW SUNCARE", template: "RBPGSXX-XXX" },
    { name: "ROYCE B PLUMP & GLOW POWER SERUM", template: "RBPPSXX-XXX" },
    { name: "ROYCE B PEPTIDE LIP SERUM", template: "RBPLSXX-XXX" },
    
    // BRIGHTEST SKIN ESSENTIALS
    { name: "BRIGHTEST SKIN ESSENTIALS ADVANCED TINTED SUNSCREEN INFRARED PROTECTION", template: "BSETSSXX-XXX" },
    
    // KKSKIN.PH
    { name: "KKSKIN.PH SUN DEFENSE SUNSCREEN WITH BOTANICAL EXTRACTS SPF50 PA++++", template: "KKSSBEXX-XXX" },
    
    // KYLE SKIN
    { name: "KYLE SKIN RICE GLOW BAR SOAP", template: "KSRGBSXX-XXX" },
    { name: "KYLE SKIN RICE GLOW LOTION", template: "KSRGLXX-XXX" },
    
    // RG LOVE
    { name: "RG LOVE- RESTORE RETINAL CREAM 30G", template: "RGLRCXX-XXX" },
    { name: "RG LOVE- REFINE SERUM RETINAL NIGHT BOOSTER 30ML", template: "RGLRSXX-XXX" },
    { name: "RG LOVE- CLEANSE TONE GLOW REFINING BEAUTY SOAP", template: "RGLKBSXX-XXX" },
    { name: "RG LOVE- TINTED SUNSCREEN WITH SPF50 PA++++", template: "RGLTSXX-XXX" },
    { name: "RG LOVE- SKIN DAILY SUN PROTECTION SPF50 PA++++", template: "RGLDSPXX-XXX" },
    
    // CZAR
    { name: "CZAR SUNSCREEN AND MOISTURIZING CREAM", template: "CSMCXX-XXX" },
    { name: "CZAR BRIGHTENING AND ANTI-ANE REJUVA CREAM", template: "CBARCXX-XXX" },
    { name: "CZAR REJUVENATING FACIAL TONER", template: "CRFTXX-XXX" },
    
    // MI.SKIN
    { name: "MI.SKIN INNER GLOW UNDERARM & INGUINAL WHITENING CREAM", template: "MSUIWCXX-XXX" },
    { name: "MI.SKIN LIP LUXE HYDRATING LIP SERUM", template: "MSLHLSXX-XXX" },
    
    // EIGHT
    { name: "EIGHT SUNSCREEN SPF50 PA++++", template: "ESRSXX-XXX" },
    { name: "EIGHT NIGHT CREAM", template: "ESRSNCXX-XXX" },
    { name: "EIGHT KOJIC + EXFOLIATING CLEANSER", template: "ESRSKCXX-XXX" },
    { name: "EIGHT TONER", template: "ESRSTXX-XXX" },
    
    // ELIXIA
    { name: "ELIXIA NOURISHING BODY LOTION SPF50 PA++++", template: "ENBLXX-XXX" },
    { name: "ELIXIA OVERNIGHT SKIN RENEWAL NIGHT CREAM", template: "EOSNCXX-XXX" },
    { name: "ELIXIA INVISIBLE SUN VEIL SPF 50 PA ++++", template: "EISVXX-XXX" },
    
    // BEAUTAIN
    { name: "BEAUTAIN REJUVENATING TONER", template: "BRJXX-XXX" },
    { name: "BEAUTAIN SUNBLOCK MIST", template: "BSMXX-XXX" }
];

/**
 * Compute 3-digit Julian Day (Day of Year: 001 to 366)
 * @param {Date|string} date
 * @returns {string} e.g. "247"
 */
function getJulianDay(date = new Date()) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return getJulianDay(new Date());
    
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = (d - start) + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000);
    const oneDay = 1000 * 60 * 60 * 24;
    const day = Math.floor(diff / oneDay);
    return String(day).padStart(3, '0');
}

/**
 * Compute 2-digit Year (e.g. 2026 -> "26")
 * @param {Date|string} date
 * @returns {string} e.g. "26"
 */
function get2DigitYear(date = new Date()) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(new Date().getFullYear()).slice(-2);
    return String(d.getFullYear()).slice(-2);
}

/**
 * Normalize string for matching
 */
function normalizeName(str) {
    if (!str) return '';
    return str
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .trim();
}

/**
 * Find the matching batch coding template for a product
 * @param {string} productName
 * @param {string} sku
 * @param {string} customTemplate
 * @returns {string} Batch template like "BSPTSXX-XXX"
 */
function findBatchTemplate(productName = '', sku = '', customTemplate = '') {
    if (customTemplate && customTemplate.trim()) {
        return customTemplate.trim();
    }

    const rawUpper = (productName || '').toUpperCase().trim();
    const normName = normalizeName(productName);
    const normSku = normalizeName(sku);

    // 1. Exact string match first
    for (const item of BATCH_CODE_CATALOG) {
        if (item.name.toUpperCase().trim() === rawUpper) {
            return item.template;
        }
    }

    // 2. Exact normalized match
    for (const item of BATCH_CODE_CATALOG) {
        const itemNorm = normalizeName(item.name);
        if (itemNorm === normName) {
            return item.template;
        }
    }

    // 3. Substring match (longest match first)
    const sortedCatalog = [...BATCH_CODE_CATALOG].sort((a, b) => b.name.length - a.name.length);
    for (const item of sortedCatalog) {
        const itemNorm = normalizeName(item.name);
        if (normName.includes(itemNorm) || (itemNorm.length >= 8 && itemNorm.includes(normName))) {
            return item.template;
        }
    }

    // 4. SKEENCARE / BELLA SKIN / HER CHOICE keyword fallbacks
    if (normName.includes('BELLASKIN')) {
        if (normName.includes('SUNSCREEN') || normName.includes('TINT')) return 'BSPTSXX-XXX';
        if (normName.includes('MIRACLEBAR') || normName.includes('SOAP')) return 'BSMBXX-XXX';
        if (normName.includes('TONER')) return 'BSTXX-XXX';
        if (normName.includes('RETINOL') && normName.includes('SERUM')) return 'BSRSXX-XXX';
        if (normName.includes('RETINOL') && normName.includes('CREAM')) return 'BSRCXX-XXX';
        if (normName.includes('FACIALWASH')) return 'BSFWXX-XXX';
        if (normName.includes('LIPSERUM')) return 'BSLSXX-XXX';
        return 'BSXX-XXX';
    }

    if (normName.includes('SKEENCARE')) {
        if (normName.includes('TONER')) return 'SCRTXX-XXX';
        if (normName.includes('SUNSCREEN')) return 'SCTSCXX-XXX';
        if (normName.includes('NIACINAMIDE')) return 'SCNBSXX-XXX';
        if (normName.includes('MOISTURIZING')) return 'SCMCXX-XXX';
        if (normName.includes('PEKAS')) return 'SCPCXX-XXX';
        return 'SCXX-XXX';
    }

    if (normName.includes('HERCHOICE')) {
        if (normName.includes('BLEACHING')) return 'HCIBCXX-XXX';
        if (normName.includes('SUNSHIELD') || normName.includes('SUNSCREEN')) return 'HCSSXX-XXX';
        if (normName.includes('RENEWAL')) return 'HCRSXX-XXX';
        return 'HCXX-XXX';
    }

    // 5. Fallback Dynamic Generator from initials
    const words = productName.trim().split(/\s+/).filter(Boolean);
    const initials = words.map(w => w[0].toUpperCase()).slice(0, 5).join('');
    return `${initials || 'BAT'}XX-XXX`;
}

/**
 * Generate Batch Code from product & production date
 * @param {Object} options - { productName, sku, customTemplate, productionDate }
 * @returns {string} Formatted batch code like "BSPTS26-247"
 */
function generateBatchCode({ productName = '', sku = '', customTemplate = '', productionDate = new Date() } = {}) {
    let template = findBatchTemplate(productName, sku, customTemplate);
    // Strip any legacy trailing -001, -00X, etc.
    template = template.replace(/-00[0-9X]/g, '').replace(/-0[0-9]/g, '');

    const yy = get2DigitYear(productionDate);
    const julian = getJulianDay(productionDate);

    // CRITICAL: Replace XXX (Julian day) first before XX (2-digit year)
    let batchCode = template
        .replace(/XXX/g, julian)
        .replace(/XX/g, yy);

    return batchCode;
}

module.exports = {
    BATCH_CODE_CATALOG,
    getJulianDay,
    get2DigitYear,
    findBatchTemplate,
    generateBatchCode
};
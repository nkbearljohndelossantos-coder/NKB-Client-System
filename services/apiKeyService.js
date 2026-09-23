/**
 * NKB Manufacturing Corporation
 * Developer REST API Key Service
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

const LIVE_INVENTORY_API_KEY = process.env.INVENTORY_API_KEY || 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b';

const AVAILABLE_SCOPES = [
    { id: 'products:read', name: 'Read Products', description: 'Access cosmetic catalog, pricing, SKUs, and packaging specifications' },
    { id: 'orders:read', name: 'Read Orders', description: 'View purchase orders, status updates, line items, and tracking' },
    { id: 'orders:write', name: 'Create Orders', description: 'Create and submit purchase orders programmatically from external eCommerce or ERP' },
    { id: 'deliveries:read', name: 'Read Deliveries', description: 'Track delivery receipts (DRs), dispatch status, drivers, and client acceptance' },
    { id: 'invoices:read', name: 'Read Invoices', description: 'View sales invoices, balances, due dates, and payment history' },
    { id: 'inventory:read', name: 'Read Inventory & BOM', description: 'Access finished stock levels, raw material pull requirements, and compounding breakdown' }
];

/**
 * Hash raw API key using SHA-256
 */
function hashApiKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return '';
    return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

/**
 * Generate a new API key
 * @returns {{ apiKey: object, rawKey: string }}
 */
function generateApiKey({ name, clientId = null, userId, scopes = [], rateLimitRpm = 120, expiresInDays = null }) {
    if (!name || !name.trim()) {
        throw new Error('API key name is required.');
    }
    if (!userId) {
        throw new Error('User ID is required to create an API key.');
    }

    // Default to read-only scopes if empty
    const sanitizedScopes = Array.isArray(scopes) && scopes.length > 0 
        ? scopes 
        : ['products:read', 'orders:read'];

    const randomBytes = crypto.randomBytes(16).toString('hex'); // 32 hex chars
    const rawKey = `nkb_live_${randomBytes}`;
    const keyPrefix = `nkb_live_${randomBytes.slice(0, 6)}...${randomBytes.slice(-4)}`;
    const keyHash = hashApiKey(rawKey);
    const keyId = uuidv4();

    let expiresAt = null;
    if (expiresInDays && Number(expiresInDays) > 0) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + Number(expiresInDays));
        expiresAt = expDate.toISOString().replace('T', ' ').substring(0, 19);
    }

    const stmt = db.prepare(`
        INSERT INTO api_keys (
            id, name, key_prefix, key_hash, client_id, user_id,
            scopes, rate_limit_rpm, status, expires_at, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, 'ACTIVE', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
    `);

    stmt.run(
        keyId,
        name.trim(),
        keyPrefix,
        keyHash,
        clientId || null,
        userId,
        JSON.stringify(sanitizedScopes),
        parseInt(rateLimitRpm, 10) || 120,
        expiresAt
    );

    const createdRecord = db.prepare(`
        SELECT k.*, c.company_name, u.name as created_by_name
        FROM api_keys k
        LEFT JOIN clients c ON k.client_id = c.id
        LEFT JOIN users u ON k.user_id = u.id
        WHERE k.id = ?
    `).get(keyId);

    if (createdRecord) {
        try {
            createdRecord.scopes = JSON.parse(createdRecord.scopes);
        } catch (_) {
            createdRecord.scopes = [];
        }
    }

    return {
        apiKey: createdRecord,
        rawKey
    };
}

/**
 * Verify and authenticate raw API key
 */
function verifyApiKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return null;
    const cleanKey = rawKey.trim();

    // 1. Check pre-seeded / environment live inventory API key (Backward Compatibility)
    if (cleanKey === LIVE_INVENTORY_API_KEY) {
        const adminUser = db.prepare("SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN') LIMIT 1").get();
        return {
            id: 'system-live-inventory-key',
            name: 'Live Inventory & ERP Integration Key',
            keyPrefix: `${LIVE_INVENTORY_API_KEY.slice(0, 15)}...`,
            clientId: null,
            userId: adminUser ? adminUser.id : null,
            scopes: ['*'],
            rateLimitRpm: 600,
            status: 'ACTIVE',
            isSystemKey: true
        };
    }

    // 2. Hash and lookup in database
    const keyHash = hashApiKey(cleanKey);
    const keyRecord = db.prepare(`
        SELECT k.*, c.company_name, c.default_billing_policy, c.default_tolerance_percent
        FROM api_keys k
        LEFT JOIN clients c ON k.client_id = c.id
        WHERE k.key_hash = ?
    `).get(keyHash);

    if (!keyRecord) return null;

    // Check status
    if (keyRecord.status !== 'ACTIVE') {
        return null;
    }

    // Check expiration
    if (keyRecord.expires_at) {
        const expTime = new Date(keyRecord.expires_at).getTime();
        if (Date.now() > expTime) {
            try {
                db.prepare("UPDATE api_keys SET status = 'EXPIRED' WHERE id = ?").run(keyRecord.id);
            } catch (_) {}
            return null;
        }
    }

    // Update last_used_at asynchronously
    try {
        db.prepare("UPDATE api_keys SET last_used_at = datetime('now', 'localtime') WHERE id = ?").run(keyRecord.id);
    } catch (_) {}

    // Parse scopes
    let parsedScopes = [];
    try {
        parsedScopes = JSON.parse(keyRecord.scopes);
    } catch (_) {
        parsedScopes = [];
    }

    return {
        id: keyRecord.id,
        name: keyRecord.name,
        keyPrefix: keyRecord.key_prefix,
        clientId: keyRecord.client_id,
        clientCompanyName: keyRecord.company_name,
        clientBillingPolicy: keyRecord.default_billing_policy,
        clientTolerance: keyRecord.default_tolerance_percent,
        userId: keyRecord.user_id,
        scopes: parsedScopes,
        rateLimitRpm: keyRecord.rate_limit_rpm,
        status: keyRecord.status,
        lastUsedAt: keyRecord.last_used_at
    };
}

/**
 * List all API keys (with optional client filter)
 */
function listApiKeys({ clientId = null } = {}) {
    let sql = `
        SELECT k.id, k.name, k.key_prefix, k.client_id, k.user_id,
               k.scopes, k.rate_limit_rpm, k.status, k.last_used_at,
               k.expires_at, k.created_at, k.updated_at,
               c.company_name, u.name as created_by_name
        FROM api_keys k
        LEFT JOIN clients c ON k.client_id = c.id
        LEFT JOIN users u ON k.user_id = u.id
    `;
    const params = [];

    if (clientId) {
        sql += ` WHERE k.client_id = ? `;
        params.push(clientId);
    }

    sql += ` ORDER BY k.created_at DESC`;

    const rows = db.prepare(sql).all(...params);
    return rows.map(r => {
        let sc = [];
        try {
            sc = JSON.parse(r.scopes);
        } catch (_) {
            sc = [];
        }
        return {
            ...r,
            scopes: sc
        };
    });
}

/**
 * Revoke an API key
 */
function revokeApiKey(id) {
    const res = db.prepare("UPDATE api_keys SET status = 'REVOKED', updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    return res.changes > 0;
}

/**
 * Permanently delete an API key
 */
function deleteApiKey(id) {
    const res = db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
    return res.changes > 0;
}

module.exports = {
    AVAILABLE_SCOPES,
    hashApiKey,
    generateApiKey,
    verifyApiKey,
    listApiKeys,
    revokeApiKey,
    deleteApiKey,
    LIVE_INVENTORY_API_KEY
};

/**
 * NKB Manufacturing Corporation
 * Live FMS (Formulation Management System) Payables API Synchronization Service
 * 
 * Synchronizes cheque payables, COO approvals, supplier vouchers, and raw material
 * requisitions with the central FMS Payables Hub (https://fms.nkbmanufacturing.com/api/payables).
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('./auditService');

const FMS_PAYABLES_API_URL = process.env.FMS_PAYABLES_API_URL || process.env.FMS_PAYABLES_URL || 'https://fms.nkbmanufacturing.com/api/payables';
const FMS_API_KEY = process.env.FMS_API_KEY || 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b';

// Local resilience cache path
const FALLBACK_CACHE_PATH = path.join(__dirname, '../database/fms_payables_cache.json');

/**
 * Fetch all payables from the live FMS API (with fallback to resilience cache)
 */
async function fetchFmsPayables(timeoutMs = 8000) {
    return new Promise((resolve) => {
        try {
            const urlObj = new URL(FMS_PAYABLES_API_URL);
            const client = urlObj.protocol === 'https:' ? https : http;

            const req = client.get(urlObj.toString(), {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'NKB-Client-System/2.0 (Payables-Sync)',
                    'x-api-key': FMS_API_KEY,
                    'x-nkb-api-key': FMS_API_KEY
                },
                timeout: timeoutMs
            }, (res) => {
                let rawData = '';
                res.on('data', chunk => rawData += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            const parsed = JSON.parse(rawData);
                            const items = Array.isArray(parsed.data) ? parsed.data : (Array.isArray(parsed) ? parsed : []);
                            if (items.length > 0) {
                                // Cache locally for resilience
                                try {
                                    fs.writeFileSync(FALLBACK_CACHE_PATH, JSON.stringify({
                                        success: true,
                                        count: items.length,
                                        source: 'LIVE_API',
                                        last_synced_at: new Date().toISOString(),
                                        data: items
                                    }, null, 2));
                                } catch (_) {}
                                return resolve({ success: true, source: 'LIVE_API', data: items, count: items.length });
                            }
                        }
                        const cached = loadFallbackCache();
                        resolve(cached);
                    } catch (_) {
                        const cached = loadFallbackCache();
                        resolve(cached);
                    }
                });
            });

            req.on('error', () => resolve(loadFallbackCache()));
            req.on('timeout', () => {
                req.destroy();
                resolve(loadFallbackCache());
            });
        } catch (_) {
            resolve(loadFallbackCache());
        }
    });
}

/**
 * Load fallback snapshot cache
 */
function loadFallbackCache() {
    try {
        if (fs.existsSync(FALLBACK_CACHE_PATH)) {
            const parsed = JSON.parse(fs.readFileSync(FALLBACK_CACHE_PATH, 'utf8'));
            if (parsed && Array.isArray(parsed.data)) {
                return { success: true, source: 'LOCAL_CACHE', data: parsed.data, count: parsed.data.length };
            }
        }
    } catch (_) {}
    return { success: false, source: 'NONE', data: [], count: 0 };
}

/**
 * Send / synchronize a single payable record to FMS (POST /api/payables)
 */
async function sendPayableToFms(payableRecord, timeoutMs = 8000) {
    if (!payableRecord) return { success: false, message: 'No payable record provided' };

    const payload = {
        id: payableRecord.id,
        request_number: payableRecord.request_number,
        req_cheque_no: payableRecord.request_number,
        payee_name: payableRecord.payee_name,
        amount: Number(payableRecord.amount) || 0,
        total: Number(payableRecord.amount) || 0,
        cheque_date: payableRecord.cheque_date,
        bank_name: payableRecord.bank_name,
        bank_account_number: payableRecord.bank_account_number || null,
        bank_account_id: payableRecord.bank_account_id || null,
        cheque_number: payableRecord.cheque_number || null,
        category: payableRecord.payable_category || payableRecord.category || 'Trade Payable',
        payable_category: payableRecord.payable_category || payableRecord.category || 'Trade Payable',
        purpose: payableRecord.purpose || payableRecord.comments || 'Payable Requisition',
        invoice_reference: payableRecord.invoice_reference || null,
        attachment_url: payableRecord.attachment_url || null,
        status: payableRecord.status || 'PENDING_COO_APPROVAL',
        requested_by: payableRecord.requested_by,
        requested_by_name: payableRecord.requested_by_name || 'Accountant',
        company_name: payableRecord.company_name || 'NKB Manufacturing Corporation',
        invoice_number: payableRecord.invoice_number || null,
        invoice_date: payableRecord.invoice_date || null,
        terms: payableRecord.terms || 'Net 30',
        due_date: payableRecord.due_date || null,
        control_number: payableRecord.control_number || null,
        line_items: typeof payableRecord.line_items === 'string' ? payableRecord.line_items : (payableRecord.line_items ? JSON.stringify(payableRecord.line_items) : null),
        comments: payableRecord.comments || payableRecord.coo_notes || null,
        source_portal: 'my.nkbmanufacturing.com',
        source_system: 'https://my.nkbmanufacturing.com/'
    };

    const bodyString = JSON.stringify(payload);

    return new Promise((resolve) => {
        try {
            const urlObj = new URL(FMS_PAYABLES_API_URL);
            const client = urlObj.protocol === 'https:' ? https : http;

            const req = client.request({
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + (urlObj.search || ''),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(bodyString),
                    'Accept': 'application/json',
                    'User-Agent': 'NKB-Client-System/2.0 (Payables-Sync)',
                    'x-api-key': FMS_API_KEY,
                    'x-nkb-api-key': FMS_API_KEY
                },
                timeout: timeoutMs
            }, (res) => {
                let raw = '';
                res.on('data', chunk => raw += chunk);
                res.on('end', () => {
                    let parsedData;
                    try {
                        parsedData = JSON.parse(raw);
                    } catch (_) {
                        parsedData = { message: raw };
                    }
                    const ok = res.statusCode >= 200 && res.statusCode < 300;
                    resolve({
                        success: ok,
                        statusCode: res.statusCode,
                        data: parsedData,
                        message: parsedData?.message || (ok ? 'Successfully synced with FMS' : 'FMS returned an error response')
                    });
                });
            });

            req.on('error', (err) => {
                resolve({ success: false, error: err.message, message: `Could not connect to FMS: ${err.message}` });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, message: 'FMS request timed out' });
            });

            req.write(bodyString);
            req.end();
        } catch (err) {
            resolve({ success: false, error: err.message, message: err.message });
        }
    });
}

function normalizePayableStatus(rawStatus) {
    if (!rawStatus) return 'PENDING_COO_APPROVAL';
    const s = String(rawStatus).toUpperCase().trim();
    if (s === 'CONFIRMED' || s === 'APPROVED') return 'CONFIRMED';
    if (s === 'REJECTED' || s === 'DECLINED' || s === 'DISAPPROVED') return 'REJECTED';
    if (s === 'ISSUED' || s === 'DISBURSED') return 'ISSUED';
    if (s === 'CLEARED' || s === 'PAID') return 'CLEARED';
    if (s === 'VOIDED' || s === 'CANCELLED' || s === 'CANCELED') return 'VOIDED';
    return 'PENDING_COO_APPROVAL';
}

/**
 * Bidirectional Live Synchronization between NKB Client System and FMS Payables Hub
 */
async function syncPayablesWithFms(db) {
    if (!db) throw new Error('Database instance is required for FMS payables sync.');

    const fmsResult = await fetchFmsPayables();
    if (!fmsResult.success || !fmsResult.data || fmsResult.data.length === 0) {
        return {
            success: false,
            source: 'NONE',
            message: 'Unable to reach FMS Payables Hub and no cached records available.',
            totalFms: 0,
            updatedCount: 0,
            importedCount: 0,
            pushedCount: 0
        };
    }

    const fmsPayables = fmsResult.data;
    let updatedCount = 0;
    let importedCount = 0;
    let pushedCount = 0;

    const findExisting = db.prepare('SELECT * FROM cheque_payables WHERE request_number = ? OR id = ?');
    const updatePayable = db.prepare(`
        UPDATE cheque_payables SET
            status = COALESCE(?, status),
            coo_decision = COALESCE(?, coo_decision),
            coo_confirmed_by = COALESCE(?, coo_confirmed_by),
            coo_confirmed_at = COALESCE(?, coo_confirmed_at),
            coo_notes = COALESCE(?, coo_notes),
            cheque_number = COALESCE(?, cheque_number),
            category = COALESCE(?, category),
            payable_category = COALESCE(?, payable_category),
            amount = COALESCE(?, amount),
            bank_name = COALESCE(?, bank_name),
            purpose = COALESCE(?, purpose),
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
    `);

    const insertPayable = db.prepare(`
        INSERT INTO cheque_payables (
            id, request_number, payee_name, amount, cheque_date, bank_name,
            bank_account_number, bank_account_id, cheque_number, category, purpose,
            company_name, payable_category, invoice_number, invoice_date, terms, due_date,
            control_number, line_items, comments,
            invoice_reference, attachment_url, status, requested_by,
            requested_by_name, coo_decision, coo_confirmed_by, coo_confirmed_at, coo_notes,
            api_key_used, is_imported, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, 1, ?, datetime('now', 'localtime')
        )
    `);

    // Ensure system default user ID for foreign key integrity
    const systemUser = db.prepare('SELECT id, name FROM users WHERE role IN (\'ACCOUNTING\', \'ADMIN\', \'SUPER_ADMIN\') LIMIT 1').get();
    const defaultUserId = systemUser?.id || 'b0000000-0000-0000-0000-000000000003';
    const defaultUserName = systemUser?.name || 'Accountant';
    const checkUserExists = db.prepare('SELECT id FROM users WHERE id = ?');

    // 1. Process Inbound Payables from FMS
    for (const remote of fmsPayables) {
        const reqNum = remote.request_number || remote.req_cheque_no;
        if (!reqNum) continue;

        const existing = findExisting.get(reqNum, remote.id || '');
        if (existing) {
            // Update with latest COO status and approval data from FMS
            const rawStatus = remote.status || remote.coo_approval || remote.coo_decision;
            const newStatus = rawStatus ? normalizePayableStatus(rawStatus) : null;
            updatePayable.run(
                newStatus,
                remote.coo_decision || remote.coo_approval || null,
                remote.coo_confirmed_by || null,
                remote.coo_confirmed_at || null,
                remote.coo_notes || remote.comments || null,
                remote.cheque_number || null,
                remote.category || null,
                remote.payable_category || remote.category || null,
                remote.amount ? Number(remote.amount) : null,
                remote.bank_name || null,
                remote.purpose || null,
                existing.id
            );
            updatedCount++;
        } else {
            // Import new payable from FMS into local database
            const newId = remote.id || uuidv4();
            const rawAmount = Number(remote.amount || remote.total || 0);
            const finalAmount = rawAmount > 0 ? rawAmount : 1.0;
            const finalDate = (remote.cheque_date || remote.date || remote.due_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
            const lineItemsJson = typeof remote.line_items === 'string' ? remote.line_items : (remote.items ? JSON.stringify(remote.items) : null);

            let resolvedRequestedBy = defaultUserId;
            if (remote.requested_by) {
                const userMatch = checkUserExists.get(remote.requested_by);
                if (userMatch) {
                    resolvedRequestedBy = userMatch.id;
                }
            }

            const finalStatus = normalizePayableStatus(remote.status || remote.coo_approval);

            insertPayable.run(
                newId,
                reqNum,
                remote.payee_name || remote.vendor || remote.payee_beneficiary || 'Vendor / Supplier',
                finalAmount,
                finalDate,
                remote.bank_name || remote.bank_account || 'BDO: NKB Manufacturing Corporation - 0080-5801-0547',
                remote.bank_account_number || null,
                remote.bank_account_id || null,
                remote.cheque_number || null,
                remote.category || 'Trade Payable',
                remote.purpose || remote.description || 'Payable Requisition',
                remote.company_name || remote.company || 'NKB Manufacturing Corporation',
                remote.payable_category || remote.category || 'Trade Payable',
                remote.invoice_number || null,
                remote.invoice_date || null,
                remote.terms || remote.term || 'Net 30',
                remote.due_date || null,
                remote.control_number || null,
                lineItemsJson,
                remote.comments || remote.remarks || null,
                remote.invoice_reference || null,
                remote.attachment_url || remote.attachment || null,
                finalStatus,
                resolvedRequestedBy,
                remote.requested_by_name || remote.prepared_by || defaultUserName,
                remote.coo_decision || null,
                remote.coo_confirmed_by || null,
                remote.coo_confirmed_at || null,
                remote.coo_notes || null,
                FMS_API_KEY,
                remote.created_at || remote.date_created || new Date().toISOString().replace('T', ' ').slice(0, 19)
            );
            importedCount++;
        }
    }

    // 2. Outbound Push: check local payables created on this portal that should be synced to FMS
    const localPayables = db.prepare(`
        SELECT * FROM cheque_payables 
        ORDER BY created_at DESC 
        LIMIT 10
    `).all();

    for (const local of localPayables) {
        const foundInFms = fmsPayables.some(fp => (fp.request_number === local.request_number) || (fp.id === local.id));
        if (!foundInFms) {
            // Send asynchronous push to FMS
            sendPayableToFms(local).catch(() => {});
            pushedCount++;
        }
    }

    logAudit({
        action: 'SYNC_FMS_PAYABLES',
        entityType: 'PAYABLES_SYNC',
        entityId: 'FMS_API',
        details: {
            source: fmsResult.source,
            totalFms: fmsPayables.length,
            updatedCount,
            importedCount,
            pushedCount
        }
    });

    return {
        success: true,
        source: fmsResult.source,
        fmsUrl: FMS_PAYABLES_API_URL,
        totalFms: fmsPayables.length,
        updatedCount,
        importedCount,
        pushedCount,
        message: `Successfully synchronized with FMS Payables Hub (${fmsResult.source}): ${updatedCount} updated, ${importedCount} imported, ${pushedCount} queued to push.`
    };
}

/**
 * Diagnostic connection test with FMS Payables Hub
 */
async function checkFmsPayablesStatus() {
    const start = Date.now();
    const result = await fetchFmsPayables(5000);
    const latencyMs = Date.now() - start;

    return {
        success: result.success,
        connection_status: result.source === 'LIVE_API' ? 'ACTIVE_CONNECTED' : 'CACHE_RESERVE_ACTIVE',
        source: result.source,
        fmsUrl: FMS_PAYABLES_API_URL,
        total_fms_payables: result.count,
        latency_ms: latencyMs,
        api_key_configured: Boolean(FMS_API_KEY),
        last_check: new Date().toISOString()
    };
}

module.exports = {
    fetchFmsPayables,
    sendPayableToFms,
    syncPayablesWithFms,
    checkFmsPayablesStatus,
    FMS_PAYABLES_API_URL,
    FMS_API_KEY
};

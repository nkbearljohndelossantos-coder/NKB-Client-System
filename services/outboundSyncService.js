/**
 * NKB Manufacturing Corporation
 * Outbound Data Transmission & External Dispatch Service
 * 
 * Handles sending and streaming data out to external endpoints,
 * webhooks, client ERP systems, and third-party APIs.
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { logAudit } = require('./auditService');

/**
 * Send an outbound data payload to an external URL
 * @param {object} params
 * @param {string} params.targetUrl - The destination HTTP/HTTPS endpoint
 * @param {string} [params.event='DATA_DISPATCH'] - Event name or category
 * @param {string} [params.entity='GENERIC'] - Entity type (e.g. 'PAYABLE', 'ORDER', 'INVENTORY')
 * @param {object|Array} params.data - The data payload to send
 * @param {object} [params.headers={}] - Custom headers (e.g. auth tokens, API keys)
 * @param {string} [params.secret=null] - Optional shared secret for HMAC-SHA256 signature
 * @param {number} [params.timeoutMs=8000] - Request timeout in milliseconds
 * @returns {Promise<{success: boolean, statusCode: number, responseData: any, durationMs: number}>}
 */
async function sendOutboundPayload({
    targetUrl,
    event = 'DATA_DISPATCH',
    entity = 'GENERIC',
    data,
    headers = {},
    secret = null,
    timeoutMs = 8000
}) {
    if (!targetUrl || typeof targetUrl !== 'string') {
        throw new Error('targetUrl is required for outbound transmission.');
    }

    const startTime = Date.now();
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const payloadString = JSON.stringify({
        event,
        entity,
        timestamp: new Date().toISOString(),
        payload: data
    });

    const requestHeaders = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadString),
        'User-Agent': 'NKB-Manufacturing-Outbound-Gateway/2.0',
        ...headers
    };

    if (secret) {
        const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
        requestHeaders['x-nkb-signature'] = signature;
    }

    return new Promise((resolve, reject) => {
        const req = client.request(urlObj, {
            method: 'POST',
            headers: requestHeaders,
            timeout: timeoutMs
        }, (res) => {
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { responseBody += chunk; });
            res.on('end', () => {
                const durationMs = Date.now() - startTime;
                let parsedResponse;
                try {
                    parsedResponse = JSON.parse(responseBody);
                } catch (_) {
                    parsedResponse = responseBody;
                }

                const isSuccess = res.statusCode >= 200 && res.statusCode < 300;

                try {
                    logAudit({
                        action: 'OUTBOUND_DATA_SENT',
                        entityType: entity,
                        entityId: targetUrl,
                        details: {
                            event,
                            targetUrl,
                            statusCode: res.statusCode,
                            durationMs,
                            success: isSuccess
                        }
                    });
                } catch (_) {}

                resolve({
                    success: isSuccess,
                    statusCode: res.statusCode,
                    responseData: parsedResponse,
                    durationMs
                });
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error(`Outbound transmission to ${targetUrl} timed out after ${timeoutMs}ms`));
        });

        req.on('error', (err) => {
            const durationMs = Date.now() - startTime;
            try {
                logAudit({
                    action: 'OUTBOUND_DATA_FAILED',
                    entityType: entity,
                    entityId: targetUrl,
                    details: {
                        event,
                        targetUrl,
                        error: err.message,
                        durationMs
                    }
                });
            } catch (_) {}

            resolve({
                success: false,
                statusCode: 0,
                error: err.message,
                durationMs
            });
        });

        req.write(payloadString);
        req.end();
    });
}

/**
 * Dispatch an outbound event to configured environment webhook if present
 */
async function dispatchOutboundEvent(event, entity, data) {
    const defaultUrl = process.env.OUTBOUND_SYNC_URL || process.env.COO_WEBHOOK_URL;
    if (!defaultUrl) return null;

    try {
        return await sendOutboundPayload({
            targetUrl: defaultUrl,
            event,
            entity,
            data,
            secret: process.env.OUTBOUND_SYNC_SECRET || null
        });
    } catch (err) {
        console.warn(`[OutboundSync] Notice: dispatch to ${defaultUrl} failed:`, err.message);
        return null;
    }
}

module.exports = {
    sendOutboundPayload,
    dispatchOutboundEvent
};

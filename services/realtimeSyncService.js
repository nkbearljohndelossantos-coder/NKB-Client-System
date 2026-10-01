/**
 * NKB Manufacturing & Trading - Real-Time Synchronization Service
 * 
 * Manages Server-Sent Events (SSE) connections across all active operator workstations,
 * dashboards, and portals. Broadcasts live transaction updates and administrative edits
 * instantaneously so all operators stay synchronized without manual reloading.
 */

const { getManilaDateTime } = require('../helpers/timezone');

// Set of active client records: { res, user, connectedAt, timer }
const activeClients = new Set();

/**
 * Send a formatted SSE event to a specific response stream
 */
function sendEvent(res, eventName, data) {
    try {
        const payload = typeof data === 'object' ? JSON.stringify(data) : String(data);
        res.write(`event: ${eventName}\ndata: ${payload}\n\n`);
    } catch (err) {
        // Socket may have closed abruptly
    }
}

/**
 * Register a new operator/client for Server-Sent Events
 */
function registerClient(req, res, user = null) {
    // Configure SSE headers with reverse proxy optimization (disable Nginx chunk buffering)
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*'
    });

    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    const clientInfo = {
        res,
        user: user || { id: 'anonymous', name: 'Operator', role: 'OPERATOR' },
        connectedAt: new Date().toISOString(),
        timer: null
    };

    activeClients.add(clientInfo);

    // Initial handshake
    sendEvent(res, 'connected', {
        success: true,
        message: 'Live Real-Time Sync Connected',
        userId: clientInfo.user.id,
        userName: clientInfo.user.name,
        userRole: clientInfo.user.role,
        serverTime: getManilaDateTime ? getManilaDateTime() : new Date().toISOString(),
        onlineOperators: activeClients.size
    });

    // Notify other connected clients of updated operator count
    broadcastOperatorCount();

    // Heartbeat ping every 25 seconds to keep proxies (Nginx/Cloudflare) alive
    clientInfo.timer = setInterval(() => {
        try {
            res.write(': ping\n\n');
        } catch (_) {
            clearInterval(clientInfo.timer);
            activeClients.delete(clientInfo);
        }
    }, 25000);
    if (typeof clientInfo.timer.unref === 'function') {
        clientInfo.timer.unref();
    }

    // Handle disconnection
    req.on('close', () => {
        if (clientInfo.timer) clearInterval(clientInfo.timer);
        activeClients.delete(clientInfo);
        broadcastOperatorCount();
    });

    req.on('error', () => {
        if (clientInfo.timer) clearInterval(clientInfo.timer);
        activeClients.delete(clientInfo);
        broadcastOperatorCount();
    });
}

/**
 * Close and clean up all active client streams (for shutdowns or testing)
 */
function closeAllClients() {
    for (const client of activeClients) {
        if (client.timer) clearInterval(client.timer);
        try { client.res.end(); } catch (_) {}
    }
    activeClients.clear();
}

/**
 * Broadcast current online operator count to all connected clients
 */
function broadcastOperatorCount() {
    const data = {
        count: activeClients.size,
        timestamp: getManilaDateTime ? getManilaDateTime() : new Date().toISOString()
    };
    for (const client of activeClients) {
        sendEvent(client.res, 'presence', data);
    }
}

/**
 * Broadcast a real-time sync event to all connected operators
 * 
 * @param {Object} event
 * @param {string} event.entityType - e.g. 'PURCHASE_ORDERS', 'JOB_ORDERS', 'PRODUCTION_BATCHES', 'DELIVERY_RECEIPTS', 'SALES_INVOICES', 'CHEQUE_PAYABLES', 'RAW_MATERIALS', 'IT_MANAGEMENT'
 * @param {string} event.action - e.g. 'CREATE', 'UPDATE', 'DELETE', 'PRIORITY', 'ACTIVE_TODAY', 'FINISHED', 'CONFIRM'
 * @param {string} [event.entityId] - ID or Document Number affected
 * @param {string} [event.userName] - Actor who made the change
 * @param {string} [event.userRole] - Actor role
 * @param {string} [event.userId] - Actor user ID
 * @param {any} [event.details] - Extra metadata or modified fields
 */
function broadcastSync(event = {}) {
    if (activeClients.size === 0) return;

    const payload = {
        type: (event.entityType || event.type || 'SYSTEM').toUpperCase(),
        action: (event.action || 'UPDATE').toUpperCase(),
        entityId: event.entityId || event.targetId || null,
        userName: event.userName || 'System',
        userRole: event.userRole || 'SYSTEM',
        userId: event.userId || null,
        details: event.details || null,
        timestamp: event.timestamp || (getManilaDateTime ? getManilaDateTime() : new Date().toISOString())
    };

    const message = `event: sync\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const client of activeClients) {
        try {
            client.res.write(message);
        } catch (err) {
            if (client.timer) clearInterval(client.timer);
            activeClients.delete(client);
        }
    }
}

/**
 * Get active connection stats
 */
function getActiveStats() {
    const roles = {};
    for (const c of activeClients) {
        const r = c.user?.role || 'UNKNOWN';
        roles[r] = (roles[r] || 0) + 1;
    }
    return {
        totalConnected: activeClients.size,
        rolesBreakdown: roles
    };
}

module.exports = {
    registerClient,
    broadcastSync,
    broadcastOperatorCount,
    getActiveStats,
    closeAllClients
};

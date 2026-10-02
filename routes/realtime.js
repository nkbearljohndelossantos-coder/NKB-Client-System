/**
 * NKB Manufacturing & Trading - Real-Time API Routes
 * 
 * Provides Server-Sent Events (SSE) streaming for live synchronization,
 * connection status checks, and broadcast triggers.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { registerClient, broadcastSync, getActiveStats } = require('../services/realtimeSyncService');

/**
 * Helper to authenticate user for SSE stream.
 * EventSource does not send custom headers, so token can arrive via:
 * 1. Query parameter: ?token=...
 * 2. Cookie: nkb_token
 * 3. Header: Authorization Bearer ...
 */
function resolveUserFromRequest(req) {
    let token = null;

    if (req.query && req.query.token) {
        token = req.query.token;
    } else if (req.cookies && req.cookies.nkb_token) {
        token = req.cookies.nkb_token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return null;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare(`
            SELECT u.id, u.name, u.email, u.role, u.client_id, u.is_active,
                   c.company_name
            FROM users u
            LEFT JOIN clients c ON u.client_id = c.id
            WHERE u.id = ?
        `).get(decoded.id);

        const isActive = user && (user.is_active === 1 || user.is_active === true || user.is_active === '1');
        return isActive ? user : null;
    } catch (err) {
        return null;
    }
}

/**
 * GET /api/realtime/stream
 * Connects client to live Server-Sent Events stream
 */
router.get('/stream', (req, res) => {
    const user = resolveUserFromRequest(req);
    registerClient(req, res, user);
});

/**
 * GET /api/realtime/status
 * Returns live synchronization health and active operator count
 */
router.get('/status', (req, res) => {
    const stats = getActiveStats();
    res.json({
        success: true,
        status: 'online',
        ...stats,
        timestamp: new Date().toISOString()
    });
});

/**
 * POST /api/realtime/broadcast
 * Allows authorized staff to emit an explicit sync pulse (e.g. manual queue drag-and-drop)
 */
router.post('/broadcast', authenticateToken, (req, res) => {
    const { entityType, action, entityId, details } = req.body || {};

    broadcastSync({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        entityType: entityType || 'SYSTEM',
        action: action || 'UPDATE',
        entityId: entityId || null,
        details: details || null
    });

    res.json({
        success: true,
        message: 'Sync event broadcasted successfully.'
    });
});

module.exports = router;

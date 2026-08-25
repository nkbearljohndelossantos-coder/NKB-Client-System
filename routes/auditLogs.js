const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');

/**
 * GET /api/audit-logs
 * Admin only
 */
router.get('/', authenticateToken, requireRoles('ADMIN', 'SUPER_ADMIN'), (req, res) => {
    const { action, entityType, search, limit } = req.query;

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (action) {
        query += ' AND action = ?';
        params.push(action);
    }

    if (entityType) {
        query += ' AND entity_type = ?';
        params.push(entityType);
    }

    if (search) {
        query += ' AND (user_name LIKE ? OR entity_id LIKE ? OR details LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit || 100));

    const logs = db.prepare(query).all(...params);

    return res.json({ success: true, data: logs });
});

module.exports = router;

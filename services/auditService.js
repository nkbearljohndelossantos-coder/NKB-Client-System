const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const { broadcastSync } = require('./realtimeSyncService');

/**
 * Log an audit event and broadcast real-time sync event to all connected operators
 */
function logAudit({ userId, userName, userRole, action, entityType, targetType, entityId, targetId, details, ipAddress }) {
    try {
        const stmt = db.prepare(`
            INSERT INTO audit_logs (id, user_id, user_name, user_role, action, entity_type, entity_id, details, ip_address, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `);
        stmt.run(
            uuidv4(),
            userId || null,
            userName || 'System',
            userRole || 'SYSTEM',
            action,
            entityType || targetType || 'SYSTEM',
            entityId || targetId || null,
            typeof details === 'object' ? JSON.stringify(details) : (details || ''),
            ipAddress || null
        );
    } catch (err) {
        console.error('Failed to write audit log:', err);
    }

    // Trigger real-time broadcast to all connected operators & workstations
    try {
        broadcastSync({
            userId,
            userName,
            userRole,
            action,
            entityType: entityType || targetType,
            entityId: entityId || targetId,
            details
        });
    } catch (broadcastErr) {
        console.error('Real-time sync broadcast warning:', broadcastErr.message);
    }
}

module.exports = {
    logAudit
};


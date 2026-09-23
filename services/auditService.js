const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Log an audit event
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
}

module.exports = {
    logAudit
};

const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'nkb-manufacturing-secure-jwt-key-2026';

/**
 * Authenticate incoming request using JWT from Authorization header or cookie
 */
function authenticateToken(req, res, next) {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.nkb_token) {
        token = req.cookies.nkb_token;
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required. No active session or token provided.',
            code: 'UNAUTHORIZED'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Fetch fresh user record
        const user = db.prepare(`
            SELECT u.id, u.name, u.email, u.role, u.client_id, u.is_active,
                   c.company_name, c.default_billing_policy, c.default_tolerance_percent
            FROM users u
            LEFT JOIN clients c ON u.client_id = c.id
            WHERE u.id = ?
        `).get(decoded.id);

        const active = user && (user.is_active === 1 || user.is_active === true || user.is_active === '1');
        if (!user || !active) {
            return res.status(401).json({
                success: false,
                error: 'User account not found or disabled.',
                code: 'USER_INACTIVE'
            });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token. Please log in again.',
            code: 'INVALID_TOKEN'
        });
    }
}

const { requireRoles, requirePermission, ROLES, normalizeRole } = require('./rbac');

/**
 * Enforce client data isolation
 */
function enforceClientIsolation(req, res, next) {
    if (normalizeRole(req.user.role) === ROLES.CLIENT) {
        if (!req.user.client_id) {
            return res.status(403).json({
                success: false,
                error: 'CLIENT_PROFILE_MISSING',
                message: 'Client profile not linked to user account.'
            });
        }
        // Force query or body client_id to the authenticated client's id
        req.clientId = req.user.client_id;
    }
    next();
}

module.exports = {
    JWT_SECRET,
    authenticateToken,
    requireRoles,
    requirePermission,
    enforceClientIsolation,
    ROLES,
    normalizeRole
};

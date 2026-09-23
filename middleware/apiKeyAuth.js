/**
 * NKB Manufacturing Corporation
 * Developer API Authentication & Scopes Middleware
 */

const { verifyApiKey } = require('../services/apiKeyService');

/**
 * Authenticate incoming request via API Key
 */
function authenticateApiKey(req, res, next) {
    let rawKey = null;

    if (req.headers['x-api-key']) {
        rawKey = req.headers['x-api-key'];
    } else if (req.headers['authorization']) {
        const authHeader = req.headers['authorization'].trim();
        if (authHeader.startsWith('Bearer ')) {
            rawKey = authHeader.substring(7).trim();
        } else {
            rawKey = authHeader;
        }
    } else if (req.query.api_key || req.query.apiKey) {
        rawKey = req.query.api_key || req.query.apiKey;
    }

    if (!rawKey) {
        return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED_API_KEY',
            message: 'API Key missing. Provide a valid API key in the x-api-key header or as Bearer token.'
        });
    }

    const keyData = verifyApiKey(rawKey);
    if (!keyData) {
        return res.status(401).json({
            success: false,
            error: 'INVALID_API_KEY',
            message: 'The provided API Key is invalid, expired, or has been revoked.'
        });
    }

    req.apiKey = keyData;
    if (keyData.clientId) {
        req.clientId = keyData.clientId;
    }

    next();
}

/**
 * Require specific permission scope on authenticated API Key
 * @param {string} scopeName - Required permission (e.g. 'orders:read')
 */
function requireScope(scopeName) {
    return (req, res, next) => {
        if (!req.apiKey) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED_API_KEY',
                message: 'API Key authentication required.'
            });
        }

        const scopes = req.apiKey.scopes || [];
        const hasScope = scopes.includes('*') || 
                         scopes.includes('admin:all') || 
                         scopes.includes(scopeName);

        if (!hasScope) {
            return res.status(403).json({
                success: false,
                error: 'INSUFFICIENT_SCOPE',
                message: `This API endpoint requires the '${scopeName}' permission scope.`,
                assignedScopes: scopes
            });
        }

        next();
    };
}

module.exports = {
    authenticateApiKey,
    requireScope
};

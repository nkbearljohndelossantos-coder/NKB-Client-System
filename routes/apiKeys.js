/**
 * NKB Manufacturing Corporation
 * Internal API Key Management Routes
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, requireRoles, normalizeRole, ROLES } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const {
    AVAILABLE_SCOPES,
    generateApiKey,
    listApiKeys,
    revokeApiKey,
    deleteApiKey
} = require('../services/apiKeyService');

/**
 * GET /api/api-keys/scopes
 * Return available API permission scopes
 */
router.get('/scopes', authenticateToken, (req, res) => {
    return res.json({
        success: true,
        scopes: AVAILABLE_SCOPES
    });
});

/**
 * GET /api/api-keys
 * List active API keys
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const role = normalizeRole(user.role);

        let clientId = null;
        if (role === ROLES.CLIENT) {
            clientId = user.client_id;
        }

        const keys = listApiKeys({ clientId });
        return res.json({
            success: true,
            data: keys
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/api-keys
 * Generate a new API key (Returns rawKey ONCE)
 */
router.post('/', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const role = normalizeRole(user.role);
        const { name, clientId, scopes, rateLimitRpm, expiresInDays } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'API key name is required.' });
        }

        // If client user, force client_id
        let targetClientId = clientId || null;
        if (role === ROLES.CLIENT) {
            targetClientId = user.client_id;
        }

        const result = generateApiKey({
            name,
            clientId: targetClientId,
            userId: user.id,
            scopes,
            rateLimitRpm,
            expiresInDays
        });

        logAudit({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: 'CREATE_API_KEY',
            entityType: 'API_KEY',
            entityId: result.apiKey.id,
            details: `Generated API key '${name}' with scopes: ${(result.apiKey.scopes || []).join(', ')}`
        });

        return res.status(201).json({
            success: true,
            apiKey: result.apiKey,
            rawKey: result.rawKey,
            message: 'API key created successfully. Save your raw key now; it will not be shown again.'
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/api-keys/:id/revoke
 * Revoke an API key
 */
router.post('/:id/revoke', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const success = revokeApiKey(id);
        if (!success) {
            return res.status(404).json({ success: false, error: 'API key not found.' });
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'REVOKE_API_KEY',
            entityType: 'API_KEY',
            entityId: id,
            details: `Revoked API key with ID: ${id}`
        });

        return res.json({ success: true, message: 'API key revoked successfully.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/api-keys/:id
 * Permanently delete an API key
 */
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const success = deleteApiKey(id);
        if (!success) {
            return res.status(404).json({ success: false, error: 'API key not found.' });
        }

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'DELETE_API_KEY',
            entityType: 'API_KEY',
            entityId: id,
            details: `Deleted API key with ID: ${id}`
        });

        return res.json({ success: true, message: 'API key deleted successfully.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

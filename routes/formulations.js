const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const {
    getFormulations,
    getFormulationByProductId,
    saveFormulation,
    convertOrderToRawMaterials,
    getOrderMaterialBreakdown
} = require('../services/formulationService');

const LIVE_INVENTORY_API_KEY = process.env.INVENTORY_API_KEY || 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b';

/**
 * Middleware: Authenticate External Live Inventory API Key
 */
function authenticateInventoryApiKey(req, res, next) {
    const headerKey = req.headers['x-api-key'];
    const bearerKey = req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '').trim() : null;
    const queryKey = req.query.apiKey || req.query.api_key;
    const providedKey = headerKey || bearerKey || queryKey;

    if (!providedKey || providedKey !== LIVE_INVENTORY_API_KEY) {
        return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED_INVENTORY_API',
            message: 'Invalid or missing Live Inventory API Key. Please provide a valid x-api-key header.'
        });
    }
    next();
}

/**
 * GET /api/formulations
 * List all product formulations with confidentiality tags
 * Strictly restricted to authorized staff (Clients FORBIDDEN)
 */
router.get('/', authenticateToken, requireRoles('SUPER_ADMIN', 'ADMIN', 'IT_ADMIN', 'CEO', 'PRODUCTION', 'INVENTORY'), (req, res) => {
    try {
        const { search } = req.query;
        const list = getFormulations(db, { search });
        return res.json({
            success: true,
            apiKeyActive: true,
            apiKeyHint: `${LIVE_INVENTORY_API_KEY.slice(0, 15)}...`,
            data: list
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/formulations/:productId
 * Get detailed formulation with phase ingredients
 */
router.get('/:productId', authenticateToken, requireRoles('SUPER_ADMIN', 'ADMIN', 'IT_ADMIN', 'CEO', 'PRODUCTION', 'INVENTORY'), (req, res) => {
    try {
        const { productId } = req.params;
        const formulation = getFormulationByProductId(db, productId);
        if (!formulation) {
            return res.status(404).json({ success: false, error: 'Formulation not found for this product.' });
        }
        return res.json({ success: true, data: formulation });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/formulations
 * Create or update product formulation and its ingredients
 */
router.post('/', authenticateToken, requireRoles('SUPER_ADMIN', 'ADMIN', 'IT_ADMIN', 'CEO'), (req, res) => {
    try {
        const updated = saveFormulation(db, req.body, req.user.id);
        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'UPDATE_PRODUCT_FORMULATION',
            entityType: 'FORMULATION',
            entityId: updated.formula_code,
            details: {
                productId: updated.product_id,
                formulaName: updated.name,
                ingredientCount: updated.ingredients.length
            }
        });
        return res.json({ success: true, message: 'Product formulation saved successfully.', data: updated });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/formulations/orders/:poId/breakdown
 * Retrieve calculated raw material requirements for a Purchase Order
 * Modeled for Sales Order & Material Requisition Receipt
 */
router.get('/orders/:poId/breakdown', authenticateToken, (req, res) => {
    try {
        const { poId } = req.params;

        // Check user access
        if (req.user.role === 'CLIENT') {
            return res.status(403).json({ success: false, error: 'Clients are not authorized to view internal raw material formulations.' });
        }

        const breakdown = getOrderMaterialBreakdown(db, poId);
        if (!breakdown) {
            return res.status(404).json({ success: false, error: 'Purchase Order not found or not yet converted.' });
        }

        return res.json({
            success: true,
            apiKeyActive: true,
            apiKeyMasked: `${LIVE_INVENTORY_API_KEY.slice(0, 16)}...${LIVE_INVENTORY_API_KEY.slice(-6)}`,
            data: breakdown
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/formulations/orders/:poId/convert
 * Trigger manual conversion or recalculation of raw materials for an order
 */
router.post('/orders/:poId/convert', authenticateToken, requireRoles('ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'IT_ADMIN', 'CEO', 'INVENTORY'), (req, res) => {
    try {
        const { poId } = req.params;
        const result = convertOrderToRawMaterials(db, poId, req.user.id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CONVERT_PO_FORMULATION_MATERIALS',
            entityType: 'PURCHASE_ORDER',
            entityId: poId,
            details: {
                totalRawMaterials: result.totalRawMaterialItems,
                uniqueMaterials: result.totalUniqueRawMaterials
            }
        });

        return res.json({
            success: true,
            message: `Order successfully converted into raw materials using product formulations.`,
            data: result
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * ========================================================================
 * LIVE INVENTORY API INTEGRATION (Authenticated via LIVE API KEY)
 * Key: nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b
 * ========================================================================
 */

/**
 * GET /api/formulations/external/status
 * Test & verify live inventory API key
 */
router.get('/external/status', authenticateInventoryApiKey, (req, res) => {
    return res.json({
        success: true,
        apiLive: true,
        status: 'CONNECTED',
        system: 'NKB Manufacturing & Inventory Synchronizer',
        timestamp: new Date().toISOString(),
        apiKey: `${LIVE_INVENTORY_API_KEY.slice(0, 16)}...`,
        message: 'Live Inventory API key successfully verified and authorized.'
    });
});

/**
 * GET /api/formulations/external/orders/:poId/materials
 * External endpoint for Inventory system to pull order raw materials
 */
router.get('/external/orders/:poId/materials', authenticateInventoryApiKey, (req, res) => {
    try {
        const { poId } = req.params;
        const breakdown = getOrderMaterialBreakdown(db, poId);
        if (!breakdown) {
            return res.status(404).json({ success: false, error: 'Order not found or no raw materials converted.' });
        }
        return res.json({
            success: true,
            orderNumber: breakdown.order.po_number,
            soNumber: breakdown.order.so_number,
            accountingConfirmed: breakdown.order.accounting_confirmed === 1,
            consolidatedMaterials: breakdown.consolidated,
            perProductMaterials: breakdown.perProduct
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

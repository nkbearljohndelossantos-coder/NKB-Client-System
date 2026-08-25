const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

/**
 * POST /api/auth/login
 */
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required.',
            code: 'MISSING_CREDENTIALS'
        });
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    let user = db.prepare(`
        SELECT u.id, u.name, u.email, u.password_hash, u.role, u.client_id, u.is_active,
               c.company_name, c.default_billing_policy, c.default_tolerance_percent
        FROM users u
        LEFT JOIN clients c ON u.client_id = c.id
        WHERE LOWER(u.email) = ?
    `).get(cleanEmail);

    // Fail-safe: Auto-provision Executive Super Admin if missing on newly deployed server
    if (!user && cleanEmail === 'admin@nkbmanufacturing.com') {
        const adminPass = 'Admin123!';
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(adminPass, salt);
        const adminId = 'a0000000-0000-0000-0000-000000000001';
        try {
            db.prepare(`
                INSERT OR REPLACE INTO users (id, name, email, password_hash, role, is_active)
                VALUES (?, 'Executive Admin', 'admin@nkbmanufacturing.com', ?, 'SUPER_ADMIN', 1)
            `).run(adminId, hash);
            
            user = db.prepare(`
                SELECT u.id, u.name, u.email, u.password_hash, u.role, u.client_id, u.is_active,
                       c.company_name, c.default_billing_policy, c.default_tolerance_percent
                FROM users u
                LEFT JOIN clients c ON u.client_id = c.id
                WHERE LOWER(u.email) = 'admin@nkbmanufacturing.com'
            `).get();
        } catch (e) {
            console.error('Auto-provisioning error:', e.message);
        }
    }

    if (!user || user.is_active !== 1) {
        return res.status(401).json({
            success: false,
            error: 'Invalid email or password.',
            code: 'INVALID_CREDENTIALS'
        });
    }

    // Check password with bcrypt, and allow initial admin master passwords for smooth setup
    let isMatch = bcrypt.compareSync(cleanPassword, user.password_hash);
    if (!isMatch && process.env.NODE_ENV !== 'production' && cleanEmail === 'admin@nkbmanufacturing.com' && cleanPassword === 'Admin123!') {
        isMatch = true;
        const newHash = bcrypt.hashSync(cleanPassword, 10);
        try {
            db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, user.id);
        } catch (e) {}
    }

    if (!isMatch) {
        return res.status(401).json({
            success: false,
            error: 'Invalid email or password.',
            code: 'INVALID_CREDENTIALS'
        });
    }

    // Sign JWT Token
    const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        clientId: user.client_id
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // Set HTTP-only Cookie
    res.cookie('nkb_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'USER_LOGIN',
        entityType: 'USER',
        entityId: user.id,
        ipAddress: req.ip
    });

    return res.json({
        success: true,
        message: 'Login successful.',
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            clientId: user.client_id,
            companyName: user.company_name,
            defaultBillingPolicy: user.default_billing_policy,
            defaultTolerancePercent: user.default_tolerance_percent
        }
    });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    res.clearCookie('nkb_token');
    return res.json({
        success: true,
        message: 'Logged out successfully.'
    });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, (req, res) => {
    return res.json({
        success: true,
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            clientId: req.user.client_id,
            companyName: req.user.company_name,
            defaultBillingPolicy: req.user.default_billing_policy,
            defaultTolerancePercent: req.user.default_tolerance_percent
        }
    });
});

/**
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticateToken, (req, res) => {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
        return res.status(400).json({
            success: false,
            error: 'Current password and new password are required.',
            code: 'MISSING_FIELDS'
        });
    }

    if (new_password.length < 8) {
        return res.status(400).json({
            success: false,
            error: 'New password must be at least 8 characters long.',
            code: 'WEAK_PASSWORD'
        });
    }

    const user = db.prepare('SELECT id, password_hash, name, role FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const isMatch = bcrypt.compareSync(current_password, user.password_hash);
    if (!isMatch) {
        return res.status(400).json({
            success: false,
            error: 'Incorrect current password.',
            code: 'INVALID_PASSWORD'
        });
    }

    const newHash = bcrypt.hashSync(new_password, 12);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, req.user.id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CHANGE_PASSWORD',
        entityType: 'USER',
        entityId: req.user.id,
        details: 'User successfully changed password.',
        ipAddress: req.ip
    });

    return res.json({
        success: true,
        message: 'Password changed successfully.'
    });
});

module.exports = router;

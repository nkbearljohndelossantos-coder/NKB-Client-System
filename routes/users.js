const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles, requirePermission, ROLES } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/users
 * List all users with their roles, client mapping, and status
 */
router.get('/', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), (req, res) => {
    const { role, status, search } = req.query;

    let query = `
        SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.updated_at,
               c.id as client_id, c.company_name
        FROM users u
        LEFT JOIN clients c ON u.client_id = c.id
        WHERE 1=1
    `;
    const params = [];

    if (role) {
        query += ' AND u.role = ?';
        params.push(role.toUpperCase());
    }

    if (status !== undefined && status !== '') {
        query += ' AND u.is_active = ?';
        params.push(parseInt(status));
    }

    if (search) {
        query += ' AND (u.name LIKE ? OR u.email LIKE ? OR c.company_name LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    query += ' ORDER BY u.created_at DESC';
    const users = db.prepare(query).all(...params);

    return res.json({ success: true, data: users });
});

/**
 * GET /api/users/:id
 */
router.get('/:id', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), (req, res) => {
    const user = db.prepare(`
        SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.updated_at,
               c.id as client_id, c.company_name
        FROM users u
        LEFT JOIN clients c ON u.client_id = c.id
        WHERE u.id = ?
    `).get(req.params.id);

    if (!user) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'User not found.' });
    }

    return res.json({ success: true, data: user });
});

/**
 * POST /api/users
 * Create new staff or client user
 */
router.post('/', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), (req, res) => {
    const { name, email, password, role, client_id } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({
            success: false,
            error: 'MISSING_FIELDS',
            message: 'Name, email, password, and role are required.'
        });
    }

    const cleanRole = role.toUpperCase().trim();
    if (!Object.values(ROLES).includes(cleanRole)) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_ROLE',
            message: `Role must be one of: ${Object.values(ROLES).join(', ')}`
        });
    }

    // Only SUPER_ADMIN can create another SUPER_ADMIN or ADMIN
    if ((cleanRole === ROLES.SUPER_ADMIN || cleanRole === ROLES.ADMIN) && req.user.role !== ROLES.SUPER_ADMIN) {
        return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: 'Only Super Administrators can create Admin accounts.'
        });
    }

    if (cleanRole === ROLES.CLIENT && !client_id) {
        return res.status(400).json({
            success: false,
            error: 'CLIENT_ID_REQUIRED',
            message: 'Client users must be linked to an existing Client company ID.'
        });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
        return res.status(400).json({
            success: false,
            error: 'DUPLICATE_EMAIL',
            message: 'A user with this email address already exists.'
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            error: 'WEAK_PASSWORD',
            message: 'Password must be at least 8 characters long.'
        });
    }

    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 12);

    db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, client_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, name.trim(), cleanEmail, passwordHash, cleanRole, cleanRole === ROLES.CLIENT ? client_id : null);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CREATE_USER',
        entityType: 'USER',
        entityId: id,
        details: { name: name.trim(), email: cleanEmail, role: cleanRole, clientId: client_id || null },
        ipAddress: req.ip
    });

    const created = db.prepare(`
        SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, c.company_name
        FROM users u
        LEFT JOIN clients c ON u.client_id = c.id
        WHERE u.id = ?
    `).get(id);

    return res.status(201).json({
        success: true,
        message: `User account for ${name} (${cleanRole}) created successfully.`,
        data: created
    });
});

/**
 * PUT /api/users/:id
 * Update user details, role, or active status
 */
router.put('/:id', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), (req, res) => {
    const { id } = req.params;
    const { name, role, is_active, client_id } = req.body;

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!targetUser) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'User not found.' });
    }

    // Protect Super Admin accounts from being modified by ordinary Admin
    if (targetUser.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
        return res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: 'Only Super Administrators can modify Super Admin accounts.'
        });
    }

    let updatedRole = targetUser.role;
    if (role) {
        const cleanRole = role.toUpperCase().trim();
        if (!Object.values(ROLES).includes(cleanRole)) {
            return res.status(400).json({ success: false, error: 'INVALID_ROLE', message: 'Invalid role.' });
        }
        if (cleanRole === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
            return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Cannot promote to Super Admin.' });
        }
        updatedRole = cleanRole;
    }

    const updatedName = name ? name.trim() : targetUser.name;
    const updatedStatus = is_active !== undefined ? (is_active ? 1 : 0) : targetUser.is_active;
    const updatedClientId = updatedRole === ROLES.CLIENT ? (client_id || targetUser.client_id) : null;

    db.prepare(`
        UPDATE users
        SET name = ?, role = ?, is_active = ?, client_id = ?, updated_at = datetime('now')
        WHERE id = ?
    `).run(updatedName, updatedRole, updatedStatus, updatedClientId, id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UPDATE_USER',
        entityType: 'USER',
        entityId: id,
        details: {
            old: { name: targetUser.name, role: targetUser.role, isActive: targetUser.is_active },
            new: { name: updatedName, role: updatedRole, isActive: updatedStatus }
        },
        ipAddress: req.ip
    });

    const updated = db.prepare('SELECT id, name, email, role, is_active, updated_at FROM users WHERE id = ?').get(id);
    return res.json({
        success: true,
        message: 'User profile updated successfully.',
        data: updated
    });
});

/**
 * POST /api/users/:id/reset-password
 * Admin reset user password
 */
router.post('/:id/reset-password', authenticateToken, requireRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), (req, res) => {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 8) {
        return res.status(400).json({
            success: false,
            error: 'WEAK_PASSWORD',
            message: 'New password must be at least 8 characters long.'
        });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!targetUser) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'User not found.' });
    }

    if (targetUser.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Cannot reset Super Admin password.' });
    }

    const passwordHash = bcrypt.hashSync(new_password, 12);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(passwordHash, id);

    logAudit({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'ADMIN_RESET_PASSWORD',
        entityType: 'USER',
        entityId: id,
        details: { targetEmail: targetUser.email, targetRole: targetUser.role },
        ipAddress: req.ip
    });

    return res.json({
        success: true,
        message: `Password reset successfully for ${targetUser.email}.`
    });
});

module.exports = router;

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

/**
 * POST /api/users/reset-system-data
 * Super Admin Reset: Wipes all transaction records (POs, JOs, Batches, DRs, Invoices, Payments, Buffer Stocks)
 * STRICTLY PRESERVING Users, Staff, RBAC Roles, Clients, and Products.
 */
router.post('/reset-system-data', authenticateToken, requireRoles(ROLES.SUPER_ADMIN), (req, res) => {
    const { confirmation_keyword, admin_password } = req.body;

    if (confirmation_keyword !== 'CONFIRM-RESET') {
        return res.status(400).json({
            success: false,
            error: 'INVALID_CONFIRMATION',
            message: 'Please type CONFIRM-RESET to authorize database wipe.'
        });
    }

    // Verify Super Admin Password
    const adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!adminUser || !bcrypt.compareSync(admin_password || '', adminUser.password_hash)) {
        return res.status(401).json({
            success: false,
            error: 'INVALID_PASSWORD',
            message: 'Incorrect Super Admin password.'
        });
    }

    try {
        const resetTx = db.transaction(() => {
            // Delete child and transactional tables in safe order
            db.prepare('DELETE FROM payments').run();
            db.prepare('DELETE FROM invoice_items').run();
            db.prepare('DELETE FROM sales_invoices').run();
            db.prepare('DELETE FROM dr_acceptances').run();
            db.prepare('DELETE FROM returns').run();
            db.prepare('DELETE FROM delivery_items').run();
            db.prepare('DELETE FROM delivery_receipts').run();
            db.prepare('DELETE FROM overrun_approvals').run();
            db.prepare('DELETE FROM batch_yields').run();
            db.prepare('DELETE FROM production_batches').run();
            db.prepare('DELETE FROM job_orders').run();
            db.prepare('DELETE FROM purchase_order_items').run();
            db.prepare('DELETE FROM purchase_orders').run();
            db.prepare('DELETE FROM client_buffer_stock').run();

            // Reset stock count to 0 in products
            db.prepare('UPDATE products SET current_stock = 0').run();

            // Reset sequence counters back to 0
            db.prepare('UPDATE document_sequences SET last_sequence = 0').run();

            // Log the system reset in audit logs
            logAudit({
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                action: 'SYSTEM_DATABASE_RESET',
                entityType: 'SYSTEM',
                entityId: 'SYSTEM_RESET',
                details: {
                    status: 'SUCCESS',
                    preserved: 'users, roles, staff, clients, products',
                    cleared: 'orders, job_orders, batches, deliveries, invoices, payments, buffer'
                },
                ipAddress: req.ip
            });
        });

        resetTx();

        return res.json({
            success: true,
            message: 'Database successfully reset! All transactions cleared. Users, Staff, and Roles remain intact.'
        });
    } catch (err) {
        console.error('System reset error:', err);
        return res.status(500).json({
            success: false,
            error: 'RESET_FAILED',
            message: 'Failed to reset database: ' + err.message
        });
    }
});

module.exports = router;


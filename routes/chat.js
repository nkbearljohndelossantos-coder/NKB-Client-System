const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, normalizeRole, ROLES } = require('../middleware/auth');

/**
 * GET /api/chat/contacts
 * Retrieve available conversation channels and contacts based on role permissions
 */
router.get('/contacts', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const role = normalizeRole(user.role);
        const contacts = [];

        // 1. Pinned Contact Support (Accessible to Everyone, direct to IT & Super Admin)
        contacts.push({
            id: 'channel-support',
            name: 'Contact Support (IT & Super Admin)',
            channelType: 'SUPPORT',
            targetRole: 'IT_ADMIN',
            isSupport: true,
            avatar: '🆘',
            description: 'Direct priority channel for IT assistance, bug reports & urgent escalation.',
            pinned: true
        });

        // 2. Client Isolation: Clients can ONLY chat with Accounting (and Support)
        if (role === ROLES.CLIENT) {
            contacts.push({
                id: 'role-accounting',
                name: 'Accounting Department',
                channelType: 'ROLE',
                targetRole: 'ACCOUNTING',
                avatar: '💰',
                description: 'Invoices, billing inquiries, statement of account, and payment receipts.'
            });

            return res.json({ success: true, role, contacts });
        }

        // 3. For Internal Staff: Department Role Broadcast Channels
        const internalRoles = [
            { id: 'role-accounting', name: 'Accounting Department', role: 'ACCOUNTING', avatar: '💰', desc: 'Invoices, credit limits & payment approvals' },
            { id: 'role-purchasing', name: 'Purchasing Department', role: 'PURCHASING', avatar: '🛒', desc: 'Raw material procurement & supplier management' },
            { id: 'role-inventory', name: 'Inventory & Materials', role: 'INVENTORY', avatar: '📦', desc: 'Stock availability & warehouse chemicals' },
            { id: 'role-production', name: 'Production & Compounding', role: 'PRODUCTION', avatar: '🧪', desc: 'Batches, job orders & formula mixing' },
            { id: 'role-warehouse', name: 'Logistics & Warehouse', role: 'WAREHOUSE', avatar: '🚚', desc: 'Delivery receipts, dispatching & dispatch fleets' },
            { id: 'role-admin', name: 'Executive Administration', role: 'ADMIN', avatar: '👑', desc: 'Executive oversight & operational directives' }
        ];

        for (const r of internalRoles) {
            contacts.push({
                id: r.id,
                name: r.name,
                channelType: 'ROLE',
                targetRole: r.role,
                avatar: r.avatar,
                description: r.desc
            });
        }

        // 4. Individual Internal Staff Members (Direct 1-on-1 Messages)
        const staffUsers = db.prepare(`
            SELECT id, name, email, role 
            FROM users 
            WHERE id != ? AND role != 'CLIENT' AND is_active = 1 
            ORDER BY name ASC
        `).all(user.id);

        for (const s of staffUsers) {
            contacts.push({
                id: `user-${s.id}`,
                userId: s.id,
                name: s.name,
                email: s.email,
                channelType: 'DIRECT',
                targetRole: s.role,
                avatar: '👤',
                description: `${s.role} • ${s.email}`
            });
        }

        // 5. Client Contacts (Staff can review and reply to clients)
        const clientUsers = db.prepare(`
            SELECT u.id, u.name, u.email, c.company_name
            FROM users u
            JOIN clients c ON u.client_id = c.id
            WHERE u.role = 'CLIENT' AND u.is_active = 1
            ORDER BY c.company_name ASC
        `).all();

        for (const c of clientUsers) {
            contacts.push({
                id: `client-${c.id}`,
                userId: c.id,
                name: `${c.company_name} (${c.name})`,
                email: c.email,
                channelType: 'DIRECT',
                targetRole: 'CLIENT',
                avatar: '🏢',
                description: `Client Account • ${c.email}`
            });
        }

        return res.json({ success: true, role, contacts });
    } catch (err) {
        console.error('Error fetching chat contacts:', err);
        return res.status(500).json({ success: false, error: 'FAILED_FETCH_CONTACTS', message: err.message });
    }
});

/**
 * GET /api/chat/messages
 * Retrieve conversation messages for a selected channel or contact
 */
router.get('/messages', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const role = normalizeRole(user.role);
        const { contactId, channelType, targetRole, userId } = req.query;

        let sql = '';
        const params = [];

        if (channelType === 'SUPPORT' || contactId === 'channel-support') {
            if (role === ROLES.CLIENT) {
                // Client only sees their own support dialogue with IT/Admin
                sql = `
                    SELECT m.*, u.name as sender_name, u.role as sender_role
                    FROM chat_messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.is_support = 1 
                      AND (m.sender_id = ? OR m.receiver_id = ?)
                    ORDER BY m.created_at ASC
                    LIMIT 100
                `;
                params.push(user.id, user.id);
            } else {
                // Support staff (IT / Admin / Staff)
                if (userId) {
                    // Staff viewing specific client/user support thread
                    sql = `
                        SELECT m.*, u.name as sender_name, u.role as sender_role
                        FROM chat_messages m
                        JOIN users u ON m.sender_id = u.id
                        WHERE m.is_support = 1 
                          AND (m.sender_id = ? OR m.receiver_id = ?)
                        ORDER BY m.created_at ASC
                        LIMIT 100
                    `;
                    params.push(userId, userId);
                } else {
                    // All support messages stream
                    sql = `
                        SELECT m.*, u.name as sender_name, u.role as sender_role
                        FROM chat_messages m
                        JOIN users u ON m.sender_id = u.id
                        WHERE m.is_support = 1
                        ORDER BY m.created_at ASC
                        LIMIT 100
                    `;
                }
            }
        } else if (channelType === 'ROLE') {
            const roleCode = (targetRole || '').toUpperCase();
            if (role === ROLES.CLIENT) {
                // Client messaging Accounting: sees messages sent by self to Accounting or sent by Accounting to this client
                sql = `
                    SELECT m.*, u.name as sender_name, u.role as sender_role
                    FROM chat_messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.target_role = ? 
                      AND (m.sender_id = ? OR m.receiver_id = ?)
                    ORDER BY m.created_at ASC
                    LIMIT 100
                `;
                params.push(roleCode, user.id, user.id);
            } else {
                // Internal staff department channel
                sql = `
                    SELECT m.*, u.name as sender_name, u.role as sender_role
                    FROM chat_messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.target_role = ? AND m.channel_type = 'ROLE'
                    ORDER BY m.created_at ASC
                    LIMIT 100
                `;
                params.push(roleCode);
            }
        } else {
            // DIRECT 1-on-1 messaging
            const otherUserId = userId || (contactId && contactId.replace('user-', '').replace('client-', ''));
            if (!otherUserId) {
                return res.json({ success: true, data: [] });
            }

            // Client boundary check: Clients cannot direct-message anyone except Accounting or Support
            if (role === ROLES.CLIENT) {
                const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(otherUserId);
                if (!targetUser || (targetUser.role !== 'ACCOUNTING' && targetUser.role !== 'IT_ADMIN' && targetUser.role !== 'SUPER_ADMIN')) {
                    return res.status(403).json({
                        success: false,
                        error: 'FORBIDDEN',
                        message: 'Client accounts may only message the Accounting Department or Technical Support.'
                    });
                }
            }

            sql = `
                SELECT m.*, u.name as sender_name, u.role as sender_role
                FROM chat_messages m
                JOIN users u ON m.sender_id = u.id
                WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
                ORDER BY m.created_at ASC
                LIMIT 100
            `;
            params.push(user.id, otherUserId, otherUserId, user.id);
        }

        const messages = db.prepare(sql).all(...params);
        return res.json({ success: true, data: messages });
    } catch (err) {
        console.error('Error fetching chat messages:', err);
        return res.status(500).json({ success: false, error: 'FAILED_FETCH_MESSAGES', message: err.message });
    }
});

/**
 * POST /api/chat/messages
 * Send a message across a direct, role, or support channel
 */
router.post('/messages', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const role = normalizeRole(user.role);
        const { message, contactId, channelType, targetRole, userId } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, error: 'EMPTY_MESSAGE', message: 'Message content cannot be blank.' });
        }

        const cleanMessage = message.trim();
        const msgId = uuidv4();
        let finalChannelType = channelType || 'DIRECT';
        let finalTargetRole = targetRole || null;
        let finalReceiverId = userId || null;
        let isSupport = 0;

        if (channelType === 'SUPPORT' || contactId === 'channel-support') {
            finalChannelType = 'SUPPORT';
            isSupport = 1;
            finalTargetRole = 'IT_ADMIN';
            if (role !== ROLES.CLIENT && userId) {
                finalReceiverId = userId;
            }
        } else if (channelType === 'ROLE') {
            finalChannelType = 'ROLE';
            finalTargetRole = (targetRole || '').toUpperCase();
            if (role === ROLES.CLIENT) {
                // Client must only target Accounting
                if (finalTargetRole !== 'ACCOUNTING') {
                    return res.status(403).json({
                        success: false,
                        error: 'FORBIDDEN',
                        message: 'Client accounts are only permitted to message the Accounting Department.'
                    });
                }
            }
        } else {
            // DIRECT messaging
            finalChannelType = 'DIRECT';
            if (!finalReceiverId && contactId) {
                finalReceiverId = contactId.replace('user-', '').replace('client-', '');
            }

            if (role === ROLES.CLIENT) {
                const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(finalReceiverId);
                if (!targetUser || (targetUser.role !== 'ACCOUNTING' && targetUser.role !== 'IT_ADMIN' && targetUser.role !== 'SUPER_ADMIN')) {
                    return res.status(403).json({
                        success: false,
                        error: 'FORBIDDEN',
                        message: 'Clients may only chat with Accounting or Technical Support.'
                    });
                }
            }
        }

        db.prepare(`
            INSERT INTO chat_messages (id, sender_id, receiver_id, channel_type, target_role, message, is_support, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
        `).run(msgId, user.id, finalReceiverId, finalChannelType, finalTargetRole, cleanMessage, isSupport);

        const createdMessage = db.prepare(`
            SELECT m.*, u.name as sender_name, u.role as sender_role
            FROM chat_messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.id = ?
        `).get(msgId);

        return res.status(201).json({ success: true, data: createdMessage });
    } catch (err) {
        console.error('Error sending message:', err);
        return res.status(500).json({ success: false, error: 'FAILED_SEND_MESSAGE', message: err.message });
    }
});

/**
 * POST /api/chat/read
 * Mark messages in an active conversation as read
 */
router.post('/read', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const { contactId, channelType, targetRole, userId } = req.body;

        if (channelType === 'SUPPORT') {
            db.prepare("UPDATE chat_messages SET is_read = 1 WHERE is_support = 1 AND sender_id != ?").run(user.id);
        } else if (channelType === 'ROLE' && targetRole) {
            db.prepare("UPDATE chat_messages SET is_read = 1 WHERE channel_type = 'ROLE' AND target_role = ? AND sender_id != ?").run(targetRole.toUpperCase(), user.id);
        } else if (userId) {
            db.prepare("UPDATE chat_messages SET is_read = 1 WHERE channel_type = 'DIRECT' AND sender_id = ? AND receiver_id = ?").run(userId, user.id);
        }

        return res.json({ success: true });
    } catch (err) {
        return res.json({ success: false, error: err.message });
    }
});

/**
 * GET /api/chat/unread-count
 * Returns total unread messages count for the floating badge
 */
router.get('/unread-count', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const role = normalizeRole(user.role);

        let unread = 0;
        if (role === ROLES.CLIENT) {
            const count = db.prepare(`
                SELECT COUNT(*) as cnt 
                FROM chat_messages 
                WHERE receiver_id = ? AND is_read = 0
            `).get(user.id);
            unread = count ? count.cnt : 0;
        } else if (role === ROLES.SUPER_ADMIN || role === ROLES.IT_ADMIN) {
            const count = db.prepare(`
                SELECT COUNT(*) as cnt 
                FROM chat_messages 
                WHERE (receiver_id = ? OR is_support = 1 OR target_role = ?) AND sender_id != ? AND is_read = 0
            `).get(user.id, role, user.id);
            unread = count ? count.cnt : 0;
        } else {
            const count = db.prepare(`
                SELECT COUNT(*) as cnt 
                FROM chat_messages 
                WHERE (receiver_id = ? OR target_role = ?) AND sender_id != ? AND is_read = 0
            `).get(user.id, role, user.id);
            unread = count ? count.cnt : 0;
        }

        return res.json({ success: true, unreadCount: unread });
    } catch (err) {
        return res.json({ success: true, unreadCount: 0 });
    }
});

module.exports = router;

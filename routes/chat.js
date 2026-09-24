const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { authenticateToken, optionalAuthenticateToken, normalizeRole, ROLES } = require('../middleware/auth');

const activeTypingTracker = new Map();

/**
 * Helper: Calculate user's active status from last_active_at timestamp
 */
function computeActiveStatus(lastActiveAt) {
    if (!lastActiveAt) return { isOnline: false, activeStatus: 'Offline' };
    const dateStr = lastActiveAt.includes('T') ? lastActiveAt : lastActiveAt.replace(' ', 'T') + '+08:00';
    const lastActiveTime = new Date(dateStr).getTime();
    if (isNaN(lastActiveTime)) return { isOnline: false, activeStatus: 'Offline' };
    const diffMinutes = Math.floor((Date.now() - lastActiveTime) / 60000);
    if (diffMinutes <= 3) return { isOnline: true, activeStatus: 'Active now' };
    if (diffMinutes < 60) return { isOnline: false, activeStatus: `Active ${diffMinutes}m ago` };
    if (diffMinutes < 1440) return { isOnline: false, activeStatus: `Active ${Math.floor(diffMinutes / 60)}h ago` };
    return { isOnline: false, activeStatus: 'Offline' };
}

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
        const supportOnline = db.prepare(`
            SELECT COUNT(*) as cnt FROM users 
            WHERE (role = 'IT_ADMIN' OR role = 'SUPER_ADMIN') AND is_active = 1 
              AND (strftime('%s', 'now', 'localtime') - strftime('%s', last_active_at)) <= 300
        `).get();
        const isSupportOnline = Boolean(supportOnline && supportOnline.cnt > 0);

        contacts.push({
            id: 'channel-support',
            name: 'Contact Support (IT & Super Admin)',
            channelType: 'SUPPORT',
            targetRole: 'IT_ADMIN',
            isSupport: true,
            avatar: '🆘',
            description: 'Direct priority channel for IT assistance, bug reports & urgent escalation.',
            pinned: true,
            isOnline: isSupportOnline,
            activeStatus: isSupportOnline ? 'Active now' : 'Helpdesk Available'
        });

        // 2. Client Isolation: Clients can ONLY chat with Accounting (and Support)
        if (role === ROLES.CLIENT) {
            const acctOnline = db.prepare(`
                SELECT COUNT(*) as cnt FROM users 
                WHERE role = 'ACCOUNTING' AND is_active = 1 
                  AND (strftime('%s', 'now', 'localtime') - strftime('%s', last_active_at)) <= 300
            `).get();
            const isAcctOnline = Boolean(acctOnline && acctOnline.cnt > 0);

            contacts.push({
                id: 'role-accounting',
                name: 'Accounting Department',
                channelType: 'ROLE',
                targetRole: 'ACCOUNTING',
                avatar: '💰',
                description: 'Invoices, billing inquiries, statement of account, and payment receipts.',
                isOnline: isAcctOnline,
                activeStatus: isAcctOnline ? 'Active now' : 'Staff Available'
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
            const rOnline = db.prepare(`
                SELECT COUNT(*) as cnt FROM users 
                WHERE role = ? AND is_active = 1 
                  AND (strftime('%s', 'now', 'localtime') - strftime('%s', last_active_at)) <= 300
            `).get(r.role);
            const isDeptOnline = Boolean(rOnline && rOnline.cnt > 0);

            contacts.push({
                id: r.id,
                name: r.name,
                channelType: 'ROLE',
                targetRole: r.role,
                avatar: r.avatar,
                description: r.desc,
                isOnline: isDeptOnline,
                activeStatus: isDeptOnline ? 'Active now' : 'Staff Available'
            });
        }

        // 4. Individual Internal Staff Members (Direct 1-on-1 Messages)
        const staffUsers = db.prepare(`
            SELECT id, name, email, role, last_active_at 
            FROM users 
            WHERE id != ? AND role != 'CLIENT' AND is_active = 1 
            ORDER BY name ASC
        `).all(user.id);

        for (const s of staffUsers) {
            const statusInfo = computeActiveStatus(s.last_active_at);
            contacts.push({
                id: `user-${s.id}`,
                userId: s.id,
                name: s.name,
                email: s.email,
                channelType: 'DIRECT',
                targetRole: s.role,
                avatar: '👤',
                description: `${s.role} • ${s.email}`,
                isOnline: statusInfo.isOnline,
                activeStatus: statusInfo.activeStatus
            });
        }

        // 5. Client Contacts (Staff can review and reply to clients)
        const clientUsers = db.prepare(`
            SELECT u.id, u.name, u.email, u.last_active_at, c.company_name
            FROM users u
            JOIN clients c ON u.client_id = c.id
            WHERE u.role = 'CLIENT' AND u.is_active = 1
            ORDER BY c.company_name ASC
        `).all();

        for (const c of clientUsers) {
            const statusInfo = computeActiveStatus(c.last_active_at);
            contacts.push({
                id: `client-${c.id}`,
                userId: c.id,
                name: `${c.company_name} (${c.name})`,
                email: c.email,
                channelType: 'DIRECT',
                targetRole: 'CLIENT',
                avatar: '🏢',
                description: `Client Account • ${c.email}`,
                isOnline: statusInfo.isOnline,
                activeStatus: statusInfo.activeStatus
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
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now', 'localtime'))
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

/**
 * POST /api/chat/heartbeat
 * Keep-alive ping from active browser window to maintain online presence
 */
router.post('/heartbeat', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        db.prepare("UPDATE users SET last_active_at = datetime('now', 'localtime') WHERE id = ?").run(userId);
        return res.json({ success: true, timestamp: new Date().toISOString(), isOnline: true });
    } catch (err) {
        return res.json({ success: false, error: err.message });
    }
});

/**
 * POST /api/chat/typing
 * Broadcast live typing indicators to other conversation participants
 */
router.post('/typing', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const { contactId, channelType, targetRole, userId, recipientId, targetId, isTyping } = req.body;
        
        let convKey;
        const otherId = userId || recipientId || targetId || (contactId && (contactId.startsWith('user-') || contactId.startsWith('client-')) ? contactId.replace('user-', '').replace('client-', '') : null);
        if (channelType === 'DIRECT' || otherId) {
            const pair = [String(user.id), String(otherId)].sort().join(':');
            convKey = `DIRECT:${pair}`;
        } else {
            convKey = `${channelType || 'ROLE'}:${targetRole || contactId || 'general'}`;
        }
        const trackerKey = `${convKey}:${user.id}`;

        if (isTyping) {
            activeTypingTracker.set(trackerKey, {
                convKey,
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                expiresAt: Date.now() + 4000
            });
        } else {
            activeTypingTracker.delete(trackerKey);
        }
        return res.json({ success: true });
    } catch (err) {
        return res.json({ success: false, error: err.message });
    }
});

/**
 * GET /api/chat/status
 * Return active status and live typing state for a conversation channel
 */
router.get('/status', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const { contactId, channelType, targetRole, userId, targetId, recipientId } = req.query;
        const now = Date.now();

        // 1. Check live typing state for this conversation
        let convKey;
        const otherId = userId || targetId || recipientId || (contactId && (contactId.startsWith('user-') || contactId.startsWith('client-')) ? contactId.replace('user-', '').replace('client-', '') : null);
        if (channelType === 'DIRECT' || otherId) {
            const pair = [String(user.id), String(otherId)].sort().join(':');
            convKey = `DIRECT:${pair}`;
        } else {
            convKey = `${channelType || 'ROLE'}:${targetRole || contactId || 'general'}`;
        }
        const typingUsers = [];

        for (const [key, item] of activeTypingTracker.entries()) {
            if (item.expiresAt < now) {
                activeTypingTracker.delete(key);
                continue;
            }
            if (item.convKey === convKey && item.userId !== user.id) {
                typingUsers.push({ id: item.userId, name: item.userName, role: item.userRole });
            }
        }

        // 2. Compute active presence status for target user or role
        let isOnline = false;
        let activeText = 'Offline';

        if (otherId) {
            const targetUser = db.prepare('SELECT last_active_at FROM users WHERE id = ?').get(otherId);
            if (targetUser && targetUser.last_active_at) {
                const statusInfo = computeActiveStatus(targetUser.last_active_at);
                isOnline = statusInfo.isOnline;
                activeText = statusInfo.activeStatus;
            }
        } else if (targetRole) {
            const activeStaff = db.prepare(`
                SELECT id FROM users 
                WHERE role = ? AND is_active = 1 
                  AND (strftime('%s', 'now', 'localtime') - strftime('%s', last_active_at)) <= 180
                LIMIT 1
            `).get(targetRole.toUpperCase());
            if (activeStaff) {
                isOnline = true;
                activeText = 'Active now';
            } else {
                activeText = 'Department Available';
            }
        }

        return res.json({
            success: true,
            isOnline,
            activeText,
            isTyping: typingUsers.length > 0,
            typingUsers
        });
    } catch (err) {
        return res.json({ success: false, error: err.message });
    }
});

/**
 * POST /api/chat/inquiry
 * Submit an online inquiry / support message from Client Portal (works for guests and clients)
 * Dispatches to IT Administrator (and Super Admin) chat thread & saves in support_inquiries
 */
router.post('/inquiry', optionalAuthenticateToken, (req, res) => {
    try {
        const { name, email, phone, company_name, subject, message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, error: 'EMPTY_MESSAGE', message: 'Inquiry message cannot be blank.' });
        }

        const cleanName = (name || req.user?.name || 'Guest Visitor').trim();
        const cleanEmail = (email || req.user?.email || '').trim().toLowerCase();
        const cleanPhone = (phone || req.user?.phone || '').trim();
        const cleanCompany = (company_name || req.user?.companyName || '').trim();
        const cleanSubject = (subject || 'Online General Inquiry').trim();
        const cleanMessage = message.trim();

        if (!cleanEmail) {
            return res.status(400).json({ success: false, error: 'EMAIL_REQUIRED', message: 'Email address is required so support can respond to you.' });
        }

        const inquiryId = uuidv4();
        db.prepare(`
            INSERT INTO support_inquiries (id, name, email, phone, company_name, subject, message, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', datetime('now', 'localtime'))
        `).run(inquiryId, cleanName, cleanEmail, cleanPhone || null, cleanCompany || null, cleanSubject, cleanMessage);

        // Find or create sender user for chat_messages table (to satisfy sender_id FK)
        let senderId = req.user ? req.user.id : null;
        if (!senderId) {
            const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
            if (existingUser) {
                senderId = existingUser.id;
            } else {
                // Auto-create guest client & user account so IT Admin can chat directly with them
                const newUserId = uuidv4();
                const newClientId = uuidv4();
                db.prepare(`
                    INSERT INTO clients (id, company_name, contact_person, email, phone, address, default_billing_policy, default_tolerance_percent, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'Online Guest Inquiry', 'ACTUAL_DELIVERY', 10.0, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(newClientId, cleanCompany || `${cleanName}'s Brand`, cleanName, cleanEmail, cleanPhone || 'N/A');

                const salt = bcrypt.genSaltSync(10);
                const randomPassHash = bcrypt.hashSync(uuidv4(), salt);
                db.prepare(`
                    INSERT INTO users (id, name, email, password_hash, plain_password, role, client_id, phone, auth_provider, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'Client123!', 'CLIENT', ?, ?, 'inquiry', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
                `).run(newUserId, cleanName, cleanEmail, randomPassHash, newClientId, cleanPhone);

                senderId = newUserId;
            }
        }

        // Find IT Admin
        const itAdmin = db.prepare(`
            SELECT id FROM users 
            WHERE role = 'IT_ADMIN' OR LOWER(email) = 'itadmin@nkbmanufacturing.com' 
            ORDER BY CASE WHEN role = 'IT_ADMIN' THEN 0 ELSE 1 END LIMIT 1
        `).get();
        const itAdminId = itAdmin ? itAdmin.id : null;

        // Dispatch into chat_messages
        const msgId = uuidv4();
        const formattedChat = `📋 [ONLINE INQUIRY: ${cleanSubject}]\n👤 From: ${cleanName} (${cleanEmail}${cleanPhone ? `, ${cleanPhone}` : ''})${cleanCompany ? `\n🏢 Company: ${cleanCompany}` : ''}\n\n💬 Message:\n${cleanMessage}`;

        db.prepare(`
            INSERT INTO chat_messages (id, sender_id, receiver_id, channel_type, target_role, message, is_support, is_read, created_at)
            VALUES (?, ?, ?, 'SUPPORT', 'IT_ADMIN', ?, 1, 0, datetime('now', 'localtime'))
        `).run(msgId, senderId, itAdminId, formattedChat);

        return res.status(201).json({
            success: true,
            inquiryId,
            message: 'Your inquiry has been sent directly to the IT Administrator and Support Team. We will contact you shortly!'
        });
    } catch (err) {
        console.error('Error submitting support inquiry:', err);
        return res.status(500).json({ success: false, error: 'FAILED_INQUIRY', message: err.message });
    }
});

/**
 * GET /api/chat/inquiries
 * View list of online inquiries (IT Admin / Super Admin only)
 */
router.get('/inquiries', authenticateToken, (req, res) => {
    try {
        const role = normalizeRole(req.user.role);
        if (role !== ROLES.IT_ADMIN && role !== ROLES.SUPER_ADMIN && role !== ROLES.ADMIN) {
            return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access restricted to IT and Executive Administration.' });
        }
        const inquiries = db.prepare('SELECT * FROM support_inquiries ORDER BY created_at DESC LIMIT 100').all();
        return res.json({ success: true, data: inquiries });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'FAILED_FETCH_INQUIRIES', message: err.message });
    }
});

/**
 * PATCH /api/chat/inquiries/:id
 * Update status of an inquiry (e.g. RESOLVED, IN_PROGRESS)
 */
router.patch('/inquiries/:id', authenticateToken, (req, res) => {
    try {
        const role = normalizeRole(req.user.role);
        if (role !== ROLES.IT_ADMIN && role !== ROLES.SUPER_ADMIN && role !== ROLES.ADMIN) {
            return res.status(403).json({ success: false, error: 'FORBIDDEN' });
        }
        const { status, notes } = req.body;
        const inquiry = db.prepare('SELECT * FROM support_inquiries WHERE id = ?').get(req.params.id);
        if (!inquiry) {
            return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Inquiry not found.' });
        }

        const newStatus = status || inquiry.status;
        const resolvedAt = (newStatus === 'RESOLVED' && !inquiry.resolved_at) ? new Date().toISOString() : inquiry.resolved_at;

        db.prepare(`
            UPDATE support_inquiries 
            SET status = ?, notes = COALESCE(?, notes), resolved_at = ?
            WHERE id = ?
        `).run(newStatus, notes, resolvedAt, req.params.id);

        return res.json({ success: true, message: 'Inquiry updated successfully.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

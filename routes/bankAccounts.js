/**
 * NKB Manufacturing Corporation
 * Depository Bank Accounts & Liquid Balances API Routes
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/bank-accounts
 * List all active bank accounts with liquid balance and running stats
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const accounts = db.prepare(`
            SELECT * FROM bank_accounts
            WHERE is_active = 1
            ORDER BY current_balance DESC, bank_name ASC
        `).all();

        const totalLiquidBalance = accounts.reduce((sum, acc) => sum + (parseFloat(acc.current_balance) || 0), 0);

        // Fetch recent payments and cheques for each account
        const enrichedAccounts = accounts.map(acc => {
            const payments = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total_inflows, COUNT(*) as inflow_count
                FROM payments
                WHERE LOWER(bank_name) LIKE LOWER(?) OR LOWER(?) LIKE '%' || LOWER(bank_name) || '%'
            `).get(`%${acc.bank_name}%`, acc.bank_name);

            const cheques = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total_outflows, COUNT(*) as outflow_count
                FROM cheque_payables
                WHERE (LOWER(bank_name) LIKE LOWER(?) OR LOWER(?) LIKE '%' || LOWER(bank_name) || '%')
                  AND status IN ('CONFIRMED', 'ISSUED', 'CLEARED')
            `).get(`%${acc.bank_name}%`, acc.bank_name);

            const pendingCheques = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as pending_outflows, COUNT(*) as pending_count
                FROM cheque_payables
                WHERE (LOWER(bank_name) LIKE LOWER(?) OR LOWER(?) LIKE '%' || LOWER(bank_name) || '%')
                  AND status = 'PENDING_COO_APPROVAL'
            `).get(`%${acc.bank_name}%`, acc.bank_name);

            return {
                ...acc,
                total_inflows: payments ? payments.total_inflows : 0,
                inflow_count: payments ? payments.inflow_count : 0,
                total_outflows: cheques ? cheques.total_outflows : 0,
                outflow_count: cheques ? cheques.outflow_count : 0,
                pending_outflows: pendingCheques ? pendingCheques.pending_outflows : 0,
                pending_count: pendingCheques ? pendingCheques.pending_count : 0,
                projected_balance: acc.current_balance - (pendingCheques ? pendingCheques.pending_outflows : 0)
            };
        });

        return res.json({
            success: true,
            data: enrichedAccounts,
            summary: {
                totalAccounts: accounts.length,
                totalLiquidBalance,
                totalInflows: enrichedAccounts.reduce((sum, a) => sum + a.total_inflows, 0),
                totalOutflows: enrichedAccounts.reduce((sum, a) => sum + a.total_outflows, 0),
                totalPendingOutflows: enrichedAccounts.reduce((sum, a) => sum + a.pending_outflows, 0)
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/bank-accounts/:id/ledger
 * Return itemized transaction ledger for a bank account (payments credited & cheques drawn)
 */
router.get('/:id/ledger', authenticateToken, (req, res) => {
    try {
        const account = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(req.params.id);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Bank account not found.' });
        }

        const payments = db.prepare(`
            SELECT 
                p.id,
                p.payment_number as reference_no,
                p.payment_date as txn_date,
                'CREDIT' as txn_type,
                'Payment Received' as description,
                c.company_name as party_name,
                p.amount,
                p.payment_method,
                p.check_number,
                p.created_at
            FROM payments p
            JOIN clients c ON p.client_id = c.id
            WHERE LOWER(p.bank_name) LIKE LOWER(?) OR LOWER(?) LIKE '%' || LOWER(p.bank_name) || '%'
        `).all(`%${account.bank_name}%`, account.bank_name);

        const cheques = db.prepare(`
            SELECT 
                cp.id,
                cp.request_number as reference_no,
                cp.cheque_date as txn_date,
                'DEBIT' as txn_type,
                cp.purpose as description,
                cp.payee_name as party_name,
                cp.amount,
                'CHEQUE' as payment_method,
                cp.cheque_number,
                cp.created_at,
                cp.status
            FROM cheque_payables cp
            WHERE (LOWER(cp.bank_name) LIKE LOWER(?) OR LOWER(?) LIKE '%' || LOWER(cp.bank_name) || '%')
              AND cp.status IN ('CONFIRMED', 'ISSUED', 'CLEARED')
        `).all(`%${account.bank_name}%`, account.bank_name);

        // Combine and sort chronologically descending
        const ledger = [...payments, ...cheques].sort((a, b) => {
            const dateA = a.txn_date || a.created_at;
            const dateB = b.txn_date || b.created_at;
            return dateB.localeCompare(dateA);
        });

        return res.json({
            success: true,
            account,
            data: ledger
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/bank-accounts
 * Create a new company bank account
 */
router.post('/', authenticateToken, requireRoles('ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'CEO'), (req, res) => {
    try {
        const { bank_name, account_number, account_name, account_type = 'Checking', initial_balance = 0 } = req.body;

        if (!bank_name || !account_number || !account_name) {
            return res.status(400).json({ success: false, error: 'Bank name, account number, and account name are required.' });
        }

        const id = uuidv4();
        const startBalance = parseFloat(initial_balance) || 0;

        db.prepare(`
            INSERT INTO bank_accounts (id, bank_name, account_number, account_name, account_type, current_balance, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(id, String(bank_name).trim(), String(account_number).trim(), String(account_name).trim(), String(account_type).trim(), startBalance);

        const created = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'CREATE_BANK_ACCOUNT',
            entityType: 'BANK_ACCOUNT',
            entityId: id,
            details: { bank_name, account_number, startBalance }
        });

        return res.status(201).json({
            success: true,
            message: `Bank account for ${bank_name} registered successfully.`,
            data: created
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/bank-accounts/:id/adjust
 * Adjust bank account balance (e.g. initial balance calibration or bank reconciliation)
 */
router.put('/:id/adjust', authenticateToken, requireRoles('ACCOUNTING', 'ADMIN', 'SUPER_ADMIN', 'CEO'), (req, res) => {
    try {
        const { new_balance, reason } = req.body;
        const account = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(req.params.id);

        if (!account) {
            return res.status(404).json({ success: false, error: 'Bank account not found.' });
        }

        const balanceNum = parseFloat(new_balance);
        if (isNaN(balanceNum)) {
            return res.status(400).json({ success: false, error: 'Valid balance number is required.' });
        }

        const oldBalance = account.current_balance;
        db.prepare(`
            UPDATE bank_accounts
            SET current_balance = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `).run(balanceNum, account.id);

        logAudit({
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'ADJUST_BANK_BALANCE',
            entityType: 'BANK_ACCOUNT',
            entityId: account.id,
            details: {
                bank_name: account.bank_name,
                oldBalance,
                newBalance: balanceNum,
                difference: balanceNum - oldBalance,
                reason: reason || 'Manual calibration'
            }
        });

        const updated = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(account.id);
        return res.json({
            success: true,
            message: `Bank balance for ${account.bank_name} adjusted from ₱${oldBalance.toFixed(2)} to ₱${balanceNum.toFixed(2)}.`,
            data: updated
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;

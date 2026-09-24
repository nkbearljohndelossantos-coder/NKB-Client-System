const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRoles, enforceClientIsolation } = require('../middleware/auth');
const { getManilaDate } = require('../helpers/timezone');

/**
 * GET /api/reports/overview
 * KPI metrics for Admin / Client dashboards
 */
router.get('/overview', authenticateToken, enforceClientIsolation, (req, res) => {
    const now = new Date();
    const currentMonth = getManilaDate(now).slice(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = getManilaDate(prevDate).slice(0, 7);

    if (req.user.role === 'CLIENT') {
        const clientId = req.clientId;

        const openPOs = db.prepare(`
            SELECT COUNT(*) as count, COALESCE(SUM(grand_total), 0) as total_val
            FROM purchase_orders 
            WHERE client_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED', 'VOIDED')
        `).get(clientId);

        const pendingAcceptanceDRs = db.prepare(`
            SELECT COUNT(*) as count
            FROM delivery_receipts
            WHERE client_id = ? AND status = 'PENDING_CLIENT_ACCEPTANCE'
        `).get(clientId);

        const unpaidInvoices = db.prepare(`
            SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total_balance
            FROM sales_invoices
            WHERE client_id = ? AND status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
        `).get(clientId);

        const availableBuffer = db.prepare(`
            SELECT COALESCE(SUM(quantity_remaining), 0) as total_units
            FROM client_buffer_stock
            WHERE client_id = ? AND status IN ('AVAILABLE', 'PARTIALLY_RELEASED', 'RESERVED')
        `).get(clientId);

        const activeProduction = db.prepare(`
            SELECT COUNT(*) as count
            FROM job_orders jo
            JOIN purchase_orders po ON jo.po_id = po.id
            WHERE po.client_id = ? AND jo.status = 'IN_PRODUCTION'
        `).get(clientId);

        const ongoingDeliveries = db.prepare(`
            SELECT COUNT(*) as count
            FROM delivery_receipts
            WHERE client_id = ? AND status IN ('DISPATCHED', 'PENDING_CLIENT_ACCEPTANCE')
        `).get(clientId).count;

        const clientMonthPurchases = db.prepare(`
            SELECT 
                COALESCE(SUM(total_amount), 0) as total_purchased,
                COALESCE(SUM(paid_amount), 0) as total_paid,
                COUNT(*) as invoice_count
            FROM sales_invoices
            WHERE client_id = ? AND SUBSTR(invoice_date, 1, 7) = ? AND status != 'VOID'
        `).get(clientId, currentMonth);

        return res.json({
            success: true,
            data: {
                openPOs: openPOs.count,
                openPOsValue: openPOs.total_val,
                pendingDRs: pendingAcceptanceDRs.count,
                ongoingDeliveries,
                unpaidInvoices: unpaidInvoices.count,
                outstandingBalance: unpaidInvoices.total_balance,
                availableBufferUnits: availableBuffer.total_units,
                activeProduction: activeProduction.count,
                purchasedThisMonth: clientMonthPurchases.total_purchased,
                purchasedPaidThisMonth: clientMonthPurchases.total_paid
            }
        });
    }

    // Admin Dashboard KPI
    const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients WHERE is_active = 1').get().count;
    const openPOs = db.prepare("SELECT COUNT(*) as count FROM purchase_orders WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'VOIDED')").get().count;
    const activeBatches = db.prepare("SELECT COUNT(*) as count FROM production_batches WHERE status IN ('MIXING', 'BOTTLING', 'QC_PASSED', 'EXCEPTION_REQUIRES_APPROVAL')").get().count;
    const pendingApprovalBatches = db.prepare("SELECT COUNT(*) as count FROM production_batches WHERE status = 'EXCEPTION_REQUIRES_APPROVAL'").get().count;
    const pendingAcceptanceDRs = db.prepare("SELECT COUNT(*) as count FROM delivery_receipts WHERE status = 'PENDING_CLIENT_ACCEPTANCE'").get().count;
    const ongoingDeliveries = db.prepare("SELECT COUNT(*) as count FROM delivery_receipts WHERE status IN ('DISPATCHED', 'PENDING_CLIENT_ACCEPTANCE')").get().count;
    const unbilledAcceptedDRs = db.prepare("SELECT COUNT(*) as count FROM delivery_receipts WHERE status = 'ACCEPTED'").get().count;

    const arTotal = db.prepare("SELECT COALESCE(SUM(balance_due), 0) as total FROM sales_invoices WHERE status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')").get().total;
    const overdueAR = db.prepare(`
        SELECT COALESCE(SUM(balance_due), 0) as total 
        FROM sales_invoices 
        WHERE status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE') AND date(due_date) < date('now', 'localtime')
    `).get().total;

    const totalBufferUnits = db.prepare("SELECT COALESCE(SUM(quantity_remaining), 0) as total FROM client_buffer_stock WHERE status IN ('AVAILABLE', 'PARTIALLY_RELEASED', 'RESERVED')").get().total;

    // Monthly Sales & Revenue Statistics
    const monthSales = db.prepare(`
        SELECT 
            COALESCE(SUM(total_amount), 0) as total_sold,
            COALESCE(SUM(paid_amount), 0) as total_collected,
            COALESCE(SUM(balance_due), 0) as total_balance,
            COUNT(*) as invoice_count
        FROM sales_invoices
        WHERE SUBSTR(invoice_date, 1, 7) = ? AND status != 'VOID'
    `).get(currentMonth);

    const lastMonthSales = db.prepare(`
        SELECT 
            COALESCE(SUM(total_amount), 0) as total_sold,
            COUNT(*) as invoice_count
        FROM sales_invoices
        WHERE SUBSTR(invoice_date, 1, 7) = ? AND status != 'VOID'
    `).get(lastMonth);

    let momGrowthPercent = 0.0;
    if (lastMonthSales && lastMonthSales.total_sold > 0) {
        momGrowthPercent = parseFloat((((monthSales.total_sold - lastMonthSales.total_sold) / lastMonthSales.total_sold) * 100).toFixed(1));
    } else if (monthSales.total_sold > 0) {
        momGrowthPercent = 100.0;
    }

    const monthUnits = db.prepare(`
        SELECT COALESCE(SUM(ii.billable_quantity), 0) as total_units
        FROM invoice_items ii
        JOIN sales_invoices si ON ii.invoice_id = si.id
        WHERE SUBSTR(si.invoice_date, 1, 7) = ? AND si.status != 'VOID'
    `).get(currentMonth);

    const topProducts = db.prepare(`
        SELECT p.name, p.sku, 
               COALESCE(SUM(ii.billable_quantity), 0) as total_qty, 
               COALESCE(SUM(ii.line_total), 0) as total_amount
        FROM invoice_items ii
        JOIN sales_invoices si ON ii.invoice_id = si.id
        JOIN products p ON ii.product_id = p.id
        WHERE SUBSTR(si.invoice_date, 1, 7) = ? AND si.status != 'VOID'
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_amount DESC
        LIMIT 5
    `).all(currentMonth);

    // Generate last 6 continuous calendar months
    const trendMap = {};
    const trendList = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${y}-${m}`;
        trendMap[key] = { month: key, totalSold: 0, totalCollected: 0 };
        trendList.push(key);
    }

    const rawTrend = db.prepare(`
        SELECT SUBSTR(invoice_date, 1, 7) as month,
               COALESCE(SUM(total_amount), 0) as total_invoiced,
               COALESCE(SUM(paid_amount), 0) as total_collected
        FROM sales_invoices
        WHERE status != 'VOID'
        GROUP BY SUBSTR(invoice_date, 1, 7)
    `).all();

    rawTrend.forEach(r => {
        if (trendMap[r.month]) {
            trendMap[r.month].totalSold = Number(r.total_invoiced || 0);
            trendMap[r.month].totalCollected = Number(r.total_collected || 0);
        }
    });

    const salesTrend = trendList.map(k => trendMap[k]);

    return res.json({
        success: true,
        data: {
            totalClients,
            openPOs,
            activeBatches,
            pendingApprovalBatches,
            pendingAcceptanceDRs,
            ongoingDeliveries,
            unbilledAcceptedDRs,
            arTotal,
            overdueAR,
            totalBufferUnits,
            salesThisMonth: {
                month: currentMonth,
                totalSold: monthSales.total_sold,
                totalCollected: monthSales.total_collected,
                totalBalance: monthSales.total_balance,
                invoiceCount: monthSales.invoice_count,
                totalUnitsSold: monthUnits.total_units,
                lastMonthSold: lastMonthSales ? lastMonthSales.total_sold : 0,
                lastMonthInvoiceCount: lastMonthSales ? lastMonthSales.invoice_count : 0,
                momGrowthPercent,
                topProducts,
                salesTrend
            }
        }
    });
});

/**
 * GET /api/reports/yield
 * Production Yield & Variance Metrics
 */
router.get('/yield', authenticateToken, (req, res) => {
    let query = `
        SELECT b.id, b.batch_number, b.production_date, b.target_quantity, b.actual_yield,
               b.variance_quantity, b.variance_percent, b.status,
               p.name as product_name, p.sku,
               po.po_number, po.tolerance_percent,
               c.company_name
        FROM production_batches b
        JOIN job_orders jo ON b.jo_id = jo.id
        JOIN purchase_orders po ON jo.po_id = po.id
        JOIN clients c ON po.client_id = c.id
        JOIN products p ON b.product_id = p.id
        WHERE b.actual_yield > 0
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND po.client_id = ?';
        params.push(req.user.client_id);
    }

    query += ' ORDER BY b.production_date DESC LIMIT 50';
    const batchList = db.prepare(query).all(...params);

    let totalTarget = 0;
    let totalActual = 0;
    let overrunCount = 0;
    let underRunCount = 0;
    let exactCount = 0;

    batchList.forEach(b => {
        totalTarget += b.target_quantity;
        totalActual += b.actual_yield;
        if (b.variance_quantity > 0) overrunCount++;
        else if (b.variance_quantity < 0) underRunCount++;
        else exactCount++;
    });

    const netVariance = totalActual - totalTarget;
    const avgVariancePercent = totalTarget > 0 ? ((netVariance / totalTarget) * 100) : 0.0;

    return res.json({
        success: true,
        data: {
            summary: {
                totalBatches: batchList.length,
                totalTarget,
                totalActual,
                netVariance,
                avgVariancePercent: parseFloat(avgVariancePercent.toFixed(2)),
                overrunCount,
                underRunCount,
                exactCount
            },
            batches: batchList
        }
    });
});

/**
 * GET /api/reports/ar
 * Accounts Receivable Aging Report
 */
router.get('/ar', authenticateToken, (req, res) => {
    let query = `
        SELECT si.id, si.invoice_number, si.invoice_date, si.due_date, si.total_amount, si.paid_amount, si.balance_due, si.status,
               c.id as client_id, c.company_name, c.contact_person,
               po.po_number, dr.dr_number,
               CAST((julianday('now') - julianday(si.due_date)) AS INTEGER) as days_overdue
        FROM sales_invoices si
        JOIN clients c ON si.client_id = c.id
        JOIN purchase_orders po ON si.po_id = po.id
        JOIN delivery_receipts dr ON si.dr_id = dr.id
        WHERE si.status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND si.client_id = ?';
        params.push(req.user.client_id);
    }

    query += ' ORDER BY si.due_date ASC';
    const unpaidInvoices = db.prepare(query).all(...params);

    let current = 0.0;
    let days1to30 = 0.0;
    let days31to60 = 0.0;
    let days61to90 = 0.0;
    let days90plus = 0.0;
    let totalAR = 0.0;

    const categorizedInvoices = unpaidInvoices.map(inv => {
        const days = inv.days_overdue || 0;
        const balance = inv.balance_due;
        totalAR += balance;

        let bucket = 'Current';
        if (days <= 0) {
            current += balance;
            bucket = 'Current';
        } else if (days <= 30) {
            days1to30 += balance;
            bucket = '1–30 Days';
        } else if (days <= 60) {
            days31to60 += balance;
            bucket = '31–60 Days';
        } else if (days <= 90) {
            days61to90 += balance;
            bucket = '61–90 Days';
        } else {
            days90plus += balance;
            bucket = '90+ Days';
        }

        return {
            ...inv,
            agingBucket: bucket
        };
    });

    return res.json({
        success: true,
        data: {
            summary: {
                totalAR,
                current,
                days1to30,
                days31to60,
                days61to90,
                days90plus
            },
            invoices: categorizedInvoices
        }
    });
});

/**
 * GET /api/reports/unbilled-drs
 * List of Accepted DRs ready to be invoiced
 */
router.get('/unbilled-drs', authenticateToken, requireRoles('ADMIN', 'ACCOUNTING', 'CEO'), (req, res) => {
    const unbilled = db.prepare(`
        SELECT dr.*, c.company_name, po.po_number, po.billing_policy,
               (SELECT SUM(delivered_quantity) FROM delivery_items WHERE dr_id = dr.id) as total_delivered,
               (SELECT SUM(accepted_quantity) FROM delivery_items WHERE dr_id = dr.id) as total_accepted,
               da.accepted_at, da.signer_name
        FROM delivery_receipts dr
        JOIN clients c ON dr.client_id = c.id
        JOIN purchase_orders po ON dr.po_id = po.id
        LEFT JOIN dr_acceptances da ON da.dr_id = dr.id
        WHERE dr.status = 'ACCEPTED'
        ORDER BY dr.delivery_date ASC
    `).all();

    return res.json({ success: true, data: unbilled });
});

/**
 * GET /api/reports/monthly-sales
 * Monthly trend data for charts
 */
router.get('/monthly-sales', authenticateToken, (req, res) => {
    let query = `
        SELECT strftime('%Y-%m', invoice_date) as month,
               SUM(total_amount) as total_invoiced,
               SUM(paid_amount) as total_collected
        FROM sales_invoices
        WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CLIENT') {
        query += ' AND client_id = ?';
        params.push(req.user.client_id);
    }

    query += ` GROUP BY strftime('%Y-%m', invoice_date) ORDER BY month ASC LIMIT 12`;
    const sales = db.prepare(query).all(...params);

    return res.json({ success: true, data: sales });
});

module.exports = router;

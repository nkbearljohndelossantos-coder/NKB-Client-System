const path = require('path');
const fs = require('fs');
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(__dirname, '../database/nkb_test.sqlite');

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../database/db');
const seedDatabase = require('../database/seed');
const { JWT_SECRET } = require('../middleware/auth');
const realtimeSyncService = require('../services/realtimeSyncService');
const { logAudit } = require('../services/auditService');

function getAuthToken(role, clientId = null, email = null) {
    let user = null;
    if (email) {
        user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    } else if (clientId) {
        user = db.prepare('SELECT * FROM users WHERE client_id = ?').get(clientId);
    } else {
        user = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get(role);
    }

    if (!user) throw new Error(`User not found for role ${role}`);
    return jwt.sign({ id: user.id, email: user.email, role: user.role, clientId: user.client_id }, JWT_SECRET, { expiresIn: '1h' });
}

describe('NKB Manufacturing & Invoicing Workflow Tests', () => {
    let adminToken = '';
    let clientToken = '';
    let otherClientToken = '';
    let lotionProduct = null;
    let demoClient = null;
    let otherClient = null;

    before(() => {
        process.env.NODE_ENV = 'test';
        seedDatabase();

        adminToken = getAuthToken('SUPER_ADMIN');
        demoClient = db.prepare("SELECT * FROM clients WHERE email = 'client@example.com'").get();
        otherClient = db.prepare("SELECT * FROM clients WHERE email = 'glow@example.com'").get();
        clientToken = getAuthToken('CLIENT', demoClient.id);
        otherClientToken = getAuthToken('CLIENT', otherClient.id);
        lotionProduct = db.prepare("SELECT * FROM products WHERE sku = 'KLC-250'").get();
    });

    test('1. Core Business Rule: 1,000 PO -> 1,100 Actual Yield -> 1,100 DR Accepted -> ₱132,000 Invoiced', async () => {
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [{ product_id: lotionProduct.id, target_quantity: 1000, unit_price: 120.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const po = poRes.body.data;
        assert.strictEqual(po.grand_total, 120000);

        await request(app).post(`/api/orders/${po.id}/approve`).set('Authorization', `Bearer ${adminToken}`);

        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 1000 });
        assert.strictEqual(joRes.status, 201);
        const jo = joRes.body.data;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jo_id: jo.id, target_quantity: 1000 });
        const batch = batchRes.body.data;

        const yieldRes = await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ actual_yield: 1100, qc_notes: 'Yield +100 pcs within +10% tolerance' });
        assert.strictEqual(yieldRes.status, 200);
        assert.strictEqual(yieldRes.body.data.variance_quantity, 100);
        assert.strictEqual(yieldRes.body.data.variance_percent, 10);
        assert.strictEqual(yieldRes.body.data.status, 'APPROVED_FOR_DISPATCH');

        const drRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                po_id: po.id,
                jo_id: jo.id,
                items: [{ product_id: lotionProduct.id, batch_id: batch.id, delivered_quantity: 1100, unit_price: 120.0 }]
            });
        assert.strictEqual(drRes.status, 201);
        const dr = drRes.body.data;

        const acceptRes = await request(app)
            .post(`/api/deliveries/${dr.id}/accept`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                signer_name: 'Maria Santos',
                signer_title: 'Purchasing Manager',
                signature_data: 'Digitally Approved - Maria Santos'
            });
        assert.strictEqual(acceptRes.status, 200);

        const invRes = await request(app)
            .post(`/api/invoices/from-dr/${dr.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        assert.strictEqual(invRes.status, 201);
        const invoice = invRes.body.data;

        // CRITICAL ASSERTION:
        assert.strictEqual(invoice.total_amount, 132000, 'Invoice total must be ₱132,000 for 1,100 pcs');
        assert.strictEqual(invoice.balance_due, 132000);
    });

    test('2. Under-run: 1,000 PO -> 950 Actual Yield -> 950 DR Accepted -> ₱114,000 Invoiced', async () => {
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [{ product_id: lotionProduct.id, target_quantity: 1000, unit_price: 120.0 }]
            });
        const po = poRes.body.data;

        await request(app).post(`/api/orders/${po.id}/approve`).set('Authorization', `Bearer ${adminToken}`);

        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 1000 });
        const jo = joRes.body.data;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jo_id: jo.id, target_quantity: 1000 });
        const batch = batchRes.body.data;

        const yieldRes = await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ actual_yield: 950 });
        
        assert.strictEqual(yieldRes.body.data.variance_quantity, -50);
        assert.strictEqual(yieldRes.body.data.variance_percent, -5);

        const drRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                po_id: po.id,
                items: [{ product_id: lotionProduct.id, batch_id: batch.id, delivered_quantity: 950, unit_price: 120.0 }]
            });
        const dr = drRes.body.data;

        await request(app)
            .post(`/api/deliveries/${dr.id}/accept`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({ signer_name: 'Maria Santos' });

        const invRes = await request(app)
            .post(`/api/invoices/from-dr/${dr.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        assert.strictEqual(invRes.status, 201);
        assert.strictEqual(invRes.body.data.total_amount, 114000, 'Invoice total must be ₱114,000 for 950 pcs');
    });

    test('3. Over-Tolerance Exception: 1,000 PO with ±10% -> 1,250 Yield requires approval', async () => {
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                items: [{ product_id: lotionProduct.id, target_quantity: 1000, unit_price: 120.0 }]
            });
        const po = poRes.body.data;

        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 1000 });
        const jo = joRes.body.data;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jo_id: jo.id, target_quantity: 1000 });
        const batch = batchRes.body.data;

        // Log 1,250 pcs (+25% > 10% tolerance limit)
        const yieldRes = await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ actual_yield: 1250 });

        assert.strictEqual(yieldRes.body.exceptionRequiresApproval, true);
        assert.strictEqual(yieldRes.body.data.status, 'EXCEPTION_REQUIRES_APPROVAL');

        // Client cannot approve overrun
        const clientFailApprove = await request(app)
            .post(`/api/production/batches/${batch.id}/approve-overrun`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({ approved_quantity: 1250 });
        assert.strictEqual(clientFailApprove.status, 403);

        // Admin approves overrun exception
        const approveOverrunRes = await request(app)
            .post(`/api/production/batches/${batch.id}/approve-overrun`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                approved_quantity: 1250,
                reason: 'Client agreed to absorb extra batch output.'
            });

        assert.strictEqual(approveOverrunRes.status, 200);
        assert.strictEqual(approveOverrunRes.body.data.status, 'APPROVED_FOR_DISPATCH');
    });

    test('4. Duplicate Invoice Prevention & Unaccepted DR invoice block', async () => {
        // Attempting to invoice a non-accepted DR must fail
        const demoDR = db.prepare("SELECT id FROM delivery_receipts WHERE status = 'PENDING_CLIENT_ACCEPTANCE' LIMIT 1").get();
        if (demoDR) {
            const failRes = await request(app)
                .post(`/api/invoices/from-dr/${demoDR.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});
            assert.strictEqual(failRes.status, 400);
            assert.strictEqual(failRes.body.code, 'DR_NOT_ACCEPTED');
        }

        // Attempting to invoice an already invoiced DR must fail
        const invoicedDR = db.prepare("SELECT id FROM delivery_receipts WHERE status = 'INVOICED' LIMIT 1").get();
        if (invoicedDR) {
            const dupRes = await request(app)
                .post(`/api/invoices/from-dr/${invoicedDR.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});
            assert.strictEqual(dupRes.status, 400);
            assert.strictEqual(dupRes.body.code, 'DR_ALREADY_INVOICED');
        }
    });

    test('5. Option B: Fixed PO Billing + Client Buffer Stock Reservation', async () => {
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'FIXED_PO_BUFFER',
                items: [{ product_id: lotionProduct.id, target_quantity: 1000, unit_price: 120.0 }]
            });
        const po = poRes.body.data;

        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 1000 });
        const jo = joRes.body.data;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jo_id: jo.id, target_quantity: 1000 });
        const batch = batchRes.body.data;

        await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ actual_yield: 1100 });

        const drRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                po_id: po.id,
                items: [{ product_id: lotionProduct.id, batch_id: batch.id, delivered_quantity: 1100, unit_price: 120.0 }]
            });
        const dr = drRes.body.data;

        await request(app)
            .post(`/api/deliveries/${dr.id}/accept`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({ signer_name: 'Maria Santos' });

        const invRes = await request(app)
            .post(`/api/invoices/from-dr/${dr.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        assert.strictEqual(invRes.status, 201);
        assert.strictEqual(invRes.body.data.total_amount, 120000);

        const buffer = db.prepare('SELECT * FROM client_buffer_stock WHERE source_po_id = ?').get(po.id);
        assert.ok(buffer, 'Buffer stock must be created for +100 extra pcs');
        assert.strictEqual(buffer.quantity_remaining, 100);
    });

    test('6. Return & Rejection: Delivered 1,000 -> Accepted 980, Rejected 20 -> Invoice ₱117,600', async () => {
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                client_id: demoClient.id,
                items: [{ product_id: lotionProduct.id, target_quantity: 1000, unit_price: 120.0 }]
            });
        const po = poRes.body.data;

        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 1000 });
        const jo = joRes.body.data;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jo_id: jo.id, target_quantity: 1000 });
        const batch = batchRes.body.data;

        await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ actual_yield: 1000 });

        const drRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                po_id: po.id,
                items: [{ product_id: lotionProduct.id, batch_id: batch.id, delivered_quantity: 1000, unit_price: 120.0 }]
            });
        const dr = drRes.body.data;

        const acceptRes = await request(app)
            .post(`/api/deliveries/${dr.id}/accept`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                signer_name: 'Maria Santos',
                items: [
                    { product_id: lotionProduct.id, accepted_quantity: 980, rejected_quantity: 20, reason: 'Damaged caps' }
                ]
            });
        assert.strictEqual(acceptRes.status, 200);

        const invRes = await request(app)
            .post(`/api/invoices/from-dr/${dr.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        assert.strictEqual(invRes.body.data.total_amount, 117600);

        const ret = db.prepare('SELECT * FROM returns WHERE dr_id = ?').get(dr.id);
        assert.ok(ret);
        assert.strictEqual(ret.rejected_quantity, 20);
    });

    test('7. Client Isolation: Client A cannot access Client B data on all endpoints', async () => {
        const otherClientPO = db.prepare("SELECT * FROM purchase_orders WHERE client_id = ? LIMIT 1").get(otherClient.id);
        const otherClientDR = db.prepare("SELECT * FROM delivery_receipts WHERE client_id = ? LIMIT 1").get(otherClient.id);
        const otherClientSI = db.prepare("SELECT * FROM sales_invoices WHERE client_id = ? LIMIT 1").get(otherClient.id);

        if (otherClientPO) {
            const forbiddenPO = await request(app).get(`/api/orders/${otherClientPO.id}`).set('Authorization', `Bearer ${clientToken}`);
            assert.strictEqual(forbiddenPO.status, 403);
        }
        if (otherClientDR) {
            const forbiddenDR = await request(app).get(`/api/deliveries/${otherClientDR.id}`).set('Authorization', `Bearer ${clientToken}`);
            assert.strictEqual(forbiddenDR.status, 403);
        }
        if (otherClientSI) {
            const forbiddenSI = await request(app).get(`/api/invoices/${otherClientSI.id}`).set('Authorization', `Bearer ${clientToken}`);
            assert.strictEqual(forbiddenSI.status, 403);
        }
    });

    test('8. Invoice Immutability & Void Workflow', async () => {
        const si = db.prepare("SELECT * FROM sales_invoices WHERE invoice_number = 'SI-2026-000001'").get();
        if (si) {
            db.prepare("UPDATE sales_invoices SET paid_amount = 0 WHERE id = ?").run(si.id);

            const voidRes = await request(app)
                .post(`/api/invoices/${si.id}/void`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Re-issuing with updated PO terms' });

            assert.strictEqual(voidRes.status, 200);
            assert.strictEqual(voidRes.body.data.status, 'VOID');

            const dr = db.prepare("SELECT status FROM delivery_receipts WHERE id = ?").get(si.dr_id);
            assert.strictEqual(dr.status, 'ACCEPTED');
        }
    });

    test('9. Password Change Verification', async () => {
        const changeRes = await request(app)
            .post('/api/auth/change-password')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                current_password: 'Client123!',
                new_password: 'NewStrongPassword2026!'
            });
        assert.strictEqual(changeRes.status, 200);

        const newLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'client@example.com', password: 'NewStrongPassword2026!' });
        assert.strictEqual(newLogin.status, 200);

        // Revert password back to default demo password
        await request(app)
            .post('/api/auth/change-password')
            .set('Authorization', `Bearer ${newLogin.body.token}`)
            .send({
                current_password: 'NewStrongPassword2026!',
                new_password: 'Client123!'
            });
    });

    test('10. Health Check Endpoint', async () => {
        const healthRes = await request(app).get('/api/health');
        assert.strictEqual(healthRes.status, 200);
        assert.strictEqual(healthRes.body.status, 'ok');
    });

    test('11. Enterprise RBAC: Role Segregation & User Management Tests', async () => {
        const prodToken = getAuthToken('PRODUCTION');
        const warehouseToken = getAuthToken('WAREHOUSE');
        const accountingToken = getAuthToken('ACCOUNTING');

        // A. Staff listing is restricted from Client
        const clientFailUsers = await request(app).get('/api/users').set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientFailUsers.status, 403);

        // B. Admin can list users
        const adminGetUsers = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(adminGetUsers.status, 200);
        assert.ok(Array.isArray(adminGetUsers.body.data));

        // C. Production Supervisor cannot generate invoices (Accountant/Admin only)
        const unbilledDR = db.prepare("SELECT id FROM delivery_receipts WHERE status = 'ACCEPTED' LIMIT 1").get();
        if (unbilledDR) {
            const prodFailInv = await request(app)
                .post(`/api/invoices/from-dr/${unbilledDR.id}`)
                .set('Authorization', `Bearer ${prodToken}`)
                .send({});
            assert.strictEqual(prodFailInv.status, 403);
        }

        // D. Warehouse Officer cannot log batch yields (Production/Admin only)
        const batch = db.prepare("SELECT id FROM production_batches WHERE status = 'IN_PRODUCTION' LIMIT 1").get();
        if (batch) {
            const whFailYield = await request(app)
                .post(`/api/production/batches/${batch.id}/yield`)
                .set('Authorization', `Bearer ${warehouseToken}`)
                .send({ actual_yield: 1000 });
            assert.strictEqual(whFailYield.status, 403);
        }

        // E. Accountant cannot create production batches
        const jo = db.prepare("SELECT id FROM job_orders LIMIT 1").get();
        if (jo) {
            const acctFailBatch = await request(app)
                .post('/api/production/batches')
                .set('Authorization', `Bearer ${accountingToken}`)
                .send({ jo_id: jo.id, target_quantity: 1000 });
            assert.strictEqual(acctFailBatch.status, 403);
        }
    });

    test('12. Per-Client Custom Product Assignment, Branding & Pricing Tests', async () => {
        // A. Admin sets custom price and custom brand name for Demo Client on Kojic Lotion & Serum
        const serumProduct = db.prepare("SELECT * FROM products WHERE sku = 'NCS-030'").get();
        const setPricingRes = await request(app)
            .post(`/api/clients/${demoClient.id}/pricing/batch`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                items: [
                    { product_id: lotionProduct.id, custom_name: 'ABC Ultimate Whitening Cream 250ml', custom_price: 105.0, custom_sku: 'ABC-LOTION-V2', custom_formula_code: 'FORM-ABC-LOT-V2', is_assigned: 1 },
                    { product_id: serumProduct.id, custom_name: 'ABC 10% Niacinamide Glow Serum', custom_price: 225.0, custom_sku: 'ABC-SERUM-V2', custom_formula_code: 'FORM-ABC-SER-V2', is_assigned: 1 }
                ]
            });
        assert.strictEqual(setPricingRes.status, 200);
        assert.strictEqual(setPricingRes.body.success, true);

        // B. Admin gets client pricing
        const getPricingRes = await request(app)
            .get(`/api/clients/${demoClient.id}/pricing`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(getPricingRes.status, 200);
        const lotionPricing = getPricingRes.body.data.products.find(p => p.product_id === lotionProduct.id);
        assert.ok(lotionPricing);
        assert.strictEqual(lotionPricing.custom_price, 105.0);
        assert.strictEqual(lotionPricing.custom_sku, 'ABC-LOTION-V2');
        assert.strictEqual(lotionPricing.custom_name, 'ABC Ultimate Whitening Cream 250ml');
        assert.strictEqual(lotionPricing.is_assigned, 1);

        // C. Demo Client fetches products: gets their custom branded name, custom SKU, and contract rate
        const clientProdsRes = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientProdsRes.status, 200);
        const clientLotion = clientProdsRes.body.data.find(p => p.id === lotionProduct.id);
        assert.ok(clientLotion);
        assert.strictEqual(clientLotion.name, 'ABC Ultimate Whitening Cream 250ml');
        assert.strictEqual(clientLotion.sku, 'ABC-LOTION-V2');
        assert.strictEqual(clientLotion.default_price, 105.0);
        assert.strictEqual(clientLotion.has_custom_price, 1);

        // D. Other Client fetches products: does NOT see Demo Client's custom branding or price
        const otherProdsRes = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${otherClientToken}`);
        assert.strictEqual(otherProdsRes.status, 200);
        const otherLotion = otherProdsRes.body.data.find(p => p.id === lotionProduct.id);
        assert.strictEqual(otherLotion.name, 'Glow Essence Body Milk Lotion');
        assert.strictEqual(otherLotion.sku, 'GLOW-LOT250');
        assert.strictEqual(otherLotion.default_price, 120.0);
    });

    test('13. Multi-Product Purchase Order (Multi-Item PO) Workflow Test', async () => {
        const serumProduct = db.prepare("SELECT * FROM products WHERE sku = 'NCS-030'").get();
        const soapProduct = db.prepare("SELECT * FROM products WHERE sku = 'GPW-135'").get();

        // Client orders 3 assigned products in a single PO:
        // - Kojic Lotion: 500 pcs @ ₱105.00 (custom price) = ₱52,500
        // - Niacinamide Serum: 100 pcs @ ₱225.00 (custom price) = ₱22,500
        // - Gluta-Papaya Soap: 300 pcs @ ₱40.00 (custom price) = ₱12,000
        // Grand Total = ₱87,000.00
        const multiPoRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                notes: 'Multi-item cosmetic assortment package',
                items: [
                    { product_id: lotionProduct.id, target_quantity: 500, unit_price: 105.0 },
                    { product_id: serumProduct.id, target_quantity: 100, unit_price: 225.0 },
                    { product_id: soapProduct.id, target_quantity: 300, unit_price: 40.0 }
                ]
            });

        assert.strictEqual(multiPoRes.status, 201);
        const po = multiPoRes.body.data;
        assert.strictEqual(po.items.length, 3);
        assert.strictEqual(po.total_target_quantity, 900);
        assert.strictEqual(po.grand_total, 87000.0);

        // Verify items stored in database
        const dbItems = db.prepare("SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY target_quantity DESC").all(po.id);
        assert.strictEqual(dbItems.length, 3);
        assert.strictEqual(dbItems[0].target_quantity, 500);
        assert.strictEqual(dbItems[0].unit_price, 105.0);
        assert.strictEqual(dbItems[0].subtotal, 52500.0);
    });

    test('14. Client Catalog Isolation & Unassigned Product PO Block', async () => {
        const sunscreenProduct = db.prepare("SELECT * FROM products WHERE sku = 'SGC-050'").get();

        // A. Demo Client (ABC Cosmetics) fetches catalog: Sunscreen must NOT be returned (not assigned)
        const clientProdsRes = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientProdsRes.status, 200);
        const foundSunscreen = clientProdsRes.body.data.find(p => p.id === sunscreenProduct.id);
        assert.strictEqual(foundSunscreen, undefined);

        // B. Demo Client tries to submit a PO with unassigned Sunscreen: MUST be rejected with 400
        const failPoRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [
                    { product_id: sunscreenProduct.id, target_quantity: 200, unit_price: 180.0 }
                ]
            });
        assert.strictEqual(failPoRes.status, 400);
        assert.ok(failPoRes.body.error.includes('not assigned to your client account'));

        // C. Admin assigns Sunscreen to Demo Client
        const assignRes = await request(app)
            .post(`/api/clients/${demoClient.id}/pricing`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                product_id: sunscreenProduct.id,
                custom_name: 'ABC Day Shield Sunscreen SPF50',
                custom_sku: 'ABC-SUN50',
                custom_price: 170.0,
                is_assigned: 1
            });
        assert.strictEqual(assignRes.status, 200);

        // D. Demo Client now sees Sunscreen in catalog and can order it
        const clientProdsAfter = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${clientToken}`);
        const nowHasSunscreen = clientProdsAfter.body.data.find(p => p.id === sunscreenProduct.id);
        assert.ok(nowHasSunscreen);
        assert.strictEqual(nowHasSunscreen.name, 'ABC Day Shield Sunscreen SPF50');
        assert.strictEqual(nowHasSunscreen.default_price, 170.0);
    });

    test('15. Admin Direct Client Product Creation Workflow', async () => {
        // Admin creates a brand new bespoke product directly for Glow Essence
        const createRes = await request(app)
            .post(`/api/clients/${otherClient.id}/products`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Glow Essence 24K Gold Luxury Ampoule 50ml',
                sku: 'GLOW-GOLD50',
                category: 'Face Care',
                formula_code: 'FORM-GLOW-GOLD-V1',
                default_price: 350.0,
                unit: 'pcs',
                shelf_life_months: 24
            });
        assert.strictEqual(createRes.status, 201);
        assert.strictEqual(createRes.body.success, true);
        const newProdId = createRes.body.data.id;

        // Glow Essence fetches catalog: sees the new luxury product
        const glowProds = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${otherClientToken}`);
        const foundNewProd = glowProds.body.data.find(p => p.id === newProdId);
        assert.ok(foundNewProd);
        assert.strictEqual(foundNewProd.name, 'Glow Essence 24K Gold Luxury Ampoule 50ml');
        assert.strictEqual(foundNewProd.sku, 'GLOW-GOLD50');
        assert.strictEqual(foundNewProd.default_price, 350.0);

        // ABC Cosmetics does NOT see Glow Essence exclusive product
        const abcProds = await request(app)
            .get('/api/products')
            .set('Authorization', `Bearer ${clientToken}`);
        const abcFound = abcProds.body.data.find(p => p.id === newProdId);
        assert.strictEqual(abcFound, undefined);
    });

    test('16. Client & Product Update and Deletion Lifecycle Tests', async () => {
        // A. Admin creates a temporary client
        const createClientRes = await request(app)
            .post('/api/clients')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                company_name: 'Temporary Client Aesthetics',
                contact_person: 'Jane Tester',
                email: 'tempclient@test.com',
                phone: '+63 999 111 2222',
                address: 'Makati City',
                default_billing_policy: 'ACTUAL_DELIVERY',
                default_tolerance_percent: 10.0,
                credit_limit: 300000.0
            });
        assert.strictEqual(createClientRes.status, 201);
        const tempClientId = createClientRes.body.data.id;

        // B. Admin updates client details
        const updateClientRes = await request(app)
            .put(`/api/clients/${tempClientId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                company_name: 'Updated Temp Client Corp.',
                contact_person: 'Jane Updated',
                credit_limit: 450000.0
            });
        assert.strictEqual(updateClientRes.status, 200);
        assert.strictEqual(updateClientRes.body.data.company_name, 'Updated Temp Client Corp.');
        assert.strictEqual(updateClientRes.body.data.credit_limit, 450000.0);

        // C. Admin creates a temporary product
        const createProdRes = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                sku: 'TEMP-SKU-99',
                name: 'Temporary Sample Serum',
                category: 'Face Care',
                default_price: 199.0,
                unit: 'pcs'
            });
        assert.strictEqual(createProdRes.status, 201);
        const tempProdId = createProdRes.body.data.id;

        // D. Admin updates the product
        const updateProdRes = await request(app)
            .put(`/api/products/${tempProdId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Updated Sample Serum 50ml',
                default_price: 219.0
            });
        assert.strictEqual(updateProdRes.status, 200);
        assert.strictEqual(updateProdRes.body.data.name, 'Updated Sample Serum 50ml');
        assert.strictEqual(updateProdRes.body.data.default_price, 219.0);

        // E. Admin unassigns product from client
        const unassignRes = await request(app)
            .delete(`/api/clients/${demoClient.id}/pricing/${lotionProduct.id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(unassignRes.status, 200);

        // F. Admin deletes the temporary product
        const deleteProdRes = await request(app)
            .delete(`/api/products/${tempProdId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(deleteProdRes.status, 200);
        assert.strictEqual(deleteProdRes.body.success, true);
        const checkProd = db.prepare('SELECT * FROM products WHERE id = ?').get(tempProdId);
        assert.strictEqual(checkProd, undefined);

        // G. Admin deletes the temporary client
        const deleteClientRes = await request(app)
            .delete(`/api/clients/${tempClientId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(deleteClientRes.status, 200);
        assert.strictEqual(deleteClientRes.body.success, true);
        const checkClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(tempClientId);
        assert.strictEqual(checkClient, undefined);
    });

    test('17. Undelivered Order Update Workflow: Admin updates order products and notes even with active Job Orders', async () => {
        // Ensure product is assigned to client
        await request(app)
            .post(`/api/clients/${demoClient.id}/pricing`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ product_id: lotionProduct.id, custom_price: 120.0 });

        // A. Create PO with 500 pcs
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                notes: 'Initial production run notes',
                items: [{ product_id: lotionProduct.id, target_quantity: 500, unit_price: 120.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const testPO = poRes.body.data;

        // B. Approve PO
        const approveRes = await request(app)
            .post(`/api/orders/${testPO.id}/approve`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(approveRes.status, 200);

        // C. Start Job Order for this PO
        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                po_id: testPO.id,
                product_id: lotionProduct.id,
                target_quantity: 500,
                assigned_team: 'Formulation Team Beta',
                notes: 'Start compounding'
            });
        assert.strictEqual(joRes.status, 201);
        const createdJO = joRes.body.data;
        assert.strictEqual(createdJO.target_quantity, 500);

        // D. Admin updates the undelivered order to 800 pcs with updated notes
        const updateRes = await request(app)
            .put(`/api/orders/${testPO.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                notes: 'Updated: Rush order - Shrink wrap packaging',
                items: [{ product_id: lotionProduct.id, target_quantity: 800 }]
            });
        assert.strictEqual(updateRes.status, 200);
        assert.strictEqual(updateRes.body.success, true);
        assert.strictEqual(updateRes.body.data.notes, 'Updated: Rush order - Shrink wrap packaging');
        assert.strictEqual(updateRes.body.data.total_target_quantity, 800);

        // E. Verify the linked Job Order's target_quantity was synchronized to 800
        const updatedJO = db.prepare('SELECT * FROM job_orders WHERE id = ?').get(createdJO.id);
        assert.strictEqual(updatedJO.target_quantity, 800);

        // F. Clean up test order
        db.prepare('DELETE FROM job_orders WHERE id = ?').run(createdJO.id);
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(testPO.id);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(testPO.id);
    });

    test('18. Purchasing Department: Supply Requisition Lifecycle (SUBMITTED -> DELIVERED -> PO Materials SUFFICIENT)', async () => {
        const purchToken = getAuthToken('PURCHASING');
        assert.ok(purchToken, 'Purchasing token generated successfully');

        // Create a test PO requiring supplies
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [{ product_id: lotionProduct.id, target_quantity: 400, unit_price: 120.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const poId = poRes.body.data.id;

        // Inventory submits a supply requisition
        const reqRes = await request(app)
            .post(`/api/orders/${poId}/request-supplies`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                materials_needed: '50kg Cetearyl Alcohol, 20kg Glycerin, 500 HDPE Bottles',
                urgency: 'HIGH',
                target_date: '2026-10-01'
            });
        assert.strictEqual(reqRes.status, 201);
        const reqId = reqRes.body.data.id;

        // Check PO status is SUPPLIES_REQUESTED
        let poCheck = db.prepare('SELECT raw_materials_status FROM purchase_orders WHERE id = ?').get(poId);
        assert.strictEqual(poCheck.raw_materials_status, 'SUPPLIES_REQUESTED');

        // Purchasing Officer views all supply requests
        const listRes = await request(app)
            .get('/api/supply-requests')
            .set('Authorization', `Bearer ${purchToken}`);
        assert.strictEqual(listRes.status, 200);
        assert.ok(listRes.body.data.some(r => r.id === reqId));

        // Purchasing marks as ORDERED
        const orderRes = await request(app)
            .put(`/api/supply-requests/${reqId}`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                status: 'ORDERED',
                supplier_details: 'Purchased from ChemSupply Inc. PO# 99482'
            });
        assert.strictEqual(orderRes.status, 200);
        assert.strictEqual(orderRes.body.data.status, 'ORDERED');

        // Purchasing marks as DELIVERED
        const delivRes = await request(app)
            .put(`/api/supply-requests/${reqId}`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({ status: 'DELIVERED' });
        assert.strictEqual(delivRes.status, 200);
        assert.strictEqual(delivRes.body.data.status, 'DELIVERED');

        // PO raw_materials_status should now automatically be SUFFICIENT
        poCheck = db.prepare('SELECT raw_materials_status FROM purchase_orders WHERE id = ?').get(poId);
        assert.strictEqual(poCheck.raw_materials_status, 'SUFFICIENT');

        // Clean up
        db.prepare('DELETE FROM supply_requests WHERE id = ?').run(reqId);
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(poId);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(poId);
    });

    test('19. Admin Password Visibility & User Management', async () => {
        // Admin gets all users including plain_password
        const res = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.body.data));
        const adminUser = res.body.data.find(u => u.role === 'SUPER_ADMIN');
        assert.ok(adminUser);
        assert.strictEqual(adminUser.plain_password, 'Admin123!');

        // Create a new staff user
        const createRes = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Test Purchasing Assistant',
                email: 'assistant.purchasing@nkbmanufacturing.com',
                password: 'TestingPassword123!',
                role: 'PURCHASING'
            });
        assert.strictEqual(createRes.status, 201);
        const newUserId = createRes.body.data.id;
        assert.strictEqual(createRes.body.data.plain_password, 'TestingPassword123!');

        // Reset password
        const resetRes = await request(app)
            .post(`/api/users/${newUserId}/reset-password`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ new_password: 'UpdatedPassword2026!' });
        assert.strictEqual(resetRes.status, 200);

        // Verify updated plain_password
        const checkUser = db.prepare('SELECT plain_password FROM users WHERE id = ?').get(newUserId);
        assert.strictEqual(checkUser.plain_password, 'UpdatedPassword2026!');

        // Clean up test user
        db.prepare('DELETE FROM users WHERE id = ?').run(newUserId);
    });

    test('20. Action Notification Agent API (Pending Confirmation & Tasks)', async () => {
        // Accounting role gets pending notifications
        const acctToken = getAuthToken('ACCOUNTING');
        const acctRes = await request(app)
            .get('/api/notifications/pending')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(acctRes.status, 200);
        assert.strictEqual(acctRes.body.success, true);
        assert.strictEqual(acctRes.body.role, 'ACCOUNTING');
        assert.ok(Array.isArray(acctRes.body.items));

        // Client role gets pending notifications
        const cliRes = await request(app)
            .get('/api/notifications/pending')
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(cliRes.status, 200);
        assert.strictEqual(cliRes.body.role, 'CLIENT');
        assert.ok(Array.isArray(cliRes.body.items));
    });

    test('21. Enterprise Chat System: Client Restrictions & Staff Inter-Communication', async () => {
        // Client can message Contact Support
        const supportMsg = await request(app)
            .post('/api/chat/messages')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                message: 'Hello IT, I need assistance with portal access.',
                channelType: 'SUPPORT'
            });
        assert.strictEqual(supportMsg.status, 201);
        assert.strictEqual(supportMsg.body.data.is_support, 1);

        // Client can message Accounting
        const acctMsg = await request(app)
            .post('/api/chat/messages')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                message: 'Inquiring regarding payment verification for my recent order.',
                channelType: 'ROLE',
                targetRole: 'ACCOUNTING'
            });
        assert.strictEqual(acctMsg.status, 201);
        assert.strictEqual(acctMsg.body.data.target_role, 'ACCOUNTING');

        // Client is BLOCKED from messaging Production
        const blockedMsg = await request(app)
            .post('/api/chat/messages')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                message: 'Can you speed up production?',
                channelType: 'ROLE',
                targetRole: 'PRODUCTION'
            });
        assert.strictEqual(blockedMsg.status, 403);
        assert.strictEqual(blockedMsg.body.error, 'FORBIDDEN');

        // Staff can message any role freely
        const staffMsg = await request(app)
            .post('/api/chat/messages')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                message: 'Production team: please prioritize rush formulas.',
                channelType: 'ROLE',
                targetRole: 'PRODUCTION'
            });
        assert.strictEqual(staffMsg.status, 201);

        // Check contacts list for client: must ONLY contain Support and Accounting
        const clientContactsRes = await request(app)
            .get('/api/chat/contacts')
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientContactsRes.status, 200);
        const contactRoles = clientContactsRes.body.contacts.map(c => c.channelType === 'SUPPORT' ? 'SUPPORT' : c.targetRole);
        assert.ok(contactRoles.includes('SUPPORT') || contactRoles.includes('IT_ADMIN'));
        assert.ok(contactRoles.includes('ACCOUNTING'));
        assert.strictEqual(contactRoles.includes('PRODUCTION'), false);
        assert.strictEqual(contactRoles.includes('WAREHOUSE'), false);

        // Clean up chat messages created during test
        db.prepare('DELETE FROM chat_messages WHERE id IN (?, ?, ?)').run(
            supportMsg.body.data.id,
            acctMsg.body.data.id,
            staffMsg.body.data.id
        );
    });

    test('22. CEO Omniscient Oversight & View-Only Integrity Test', async () => {
        const ceoToken = getAuthToken('CEO');
        assert.ok(ceoToken);

        // A. CEO can view Orders
        const ordersRes = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${ceoToken}`);
        assert.strictEqual(ordersRes.status, 200);
        assert.strictEqual(ordersRes.body.success, true);

        // B. CEO can view Batches
        const batchesRes = await request(app)
            .get('/api/production/batches')
            .set('Authorization', `Bearer ${ceoToken}`);
        assert.strictEqual(batchesRes.status, 200);

        // C. CEO can view Deliveries
        const deliveriesRes = await request(app)
            .get('/api/deliveries')
            .set('Authorization', `Bearer ${ceoToken}`);
        assert.strictEqual(deliveriesRes.status, 200);

        // D. CEO can view Invoices
        const invoicesRes = await request(app)
            .get('/api/invoices')
            .set('Authorization', `Bearer ${ceoToken}`);
        assert.strictEqual(invoicesRes.status, 200);

        // E. CEO can view Reports & Executive Overview
        const overviewRes = await request(app)
            .get('/api/reports/overview')
            .set('Authorization', `Bearer ${ceoToken}`);
        assert.strictEqual(overviewRes.status, 200);

        const unbilledRes = await request(app)
            .get('/api/reports/unbilled-drs')
            .set('Authorization', `Bearer ${ceoToken}`);
        assert.strictEqual(unbilledRes.status, 200);

        // F. CEO can view Audit Logs
        const auditRes = await request(app)
            .get('/api/audit-logs')
            .set('Authorization', `Bearer ${ceoToken}`);
        assert.strictEqual(auditRes.status, 200);

        // G. CEO can view Staff & User Directory
        const usersRes = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${ceoToken}`);
        assert.strictEqual(usersRes.status, 200);

        // H. CEO is blocked from destructive admin operations (e.g. creating users, voiding)
        const blockCreateUser = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${ceoToken}`)
            .send({
                name: 'Unauthorized User',
                email: 'unauth@example.com',
                password: 'Password123!',
                role: 'STAFF'
            });
        assert.strictEqual(blockCreateUser.status, 403);
    });

    test('23. Quality Control (QC) Inspector Yield Clearance & Isolation Test', async () => {
        const qcToken = getAuthToken('QC');
        assert.ok(qcToken);

        // Create a test batch for QC inspection
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [{ product_id: lotionProduct.id, target_quantity: 500, unit_price: 120.0 }]
            });
        const po = poRes.body.data;
        await request(app).post(`/api/orders/${po.id}/approve`).set('Authorization', `Bearer ${adminToken}`);

        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 500 });
        const jo = joRes.body.data;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jo_id: jo.id, target_quantity: 500 });
        const batch = batchRes.body.data;

        // A. QC Inspector logs batch yield and certificate of analysis (COA)
        const qcYieldRes = await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${qcToken}`)
            .send({
                actual_yield: 520,
                qc_notes: 'QC-PASSED: Viscosity, pH 5.5, and microbial testing cleared.'
            });
        assert.strictEqual(qcYieldRes.status, 200);
        assert.strictEqual(qcYieldRes.body.data.actual_yield, 520);
        assert.strictEqual(qcYieldRes.body.data.variance_quantity, 20);
        assert.strictEqual(qcYieldRes.body.data.status, 'APPROVED_FOR_DISPATCH');

        // B. QC Inspector can inspect pending notifications
        const qcNotifRes = await request(app)
            .get('/api/notifications/pending')
            .set('Authorization', `Bearer ${qcToken}`);
        assert.strictEqual(qcNotifRes.status, 200);
        assert.strictEqual(qcNotifRes.body.role, 'QC');

        // C. QC Inspector is blocked from accounting invoicing
        const blockInvoice = await request(app)
            .post('/api/invoices/from-dr/dummy-id')
            .set('Authorization', `Bearer ${qcToken}`);
        assert.strictEqual(blockInvoice.status, 403);

        // Clean up test records
        db.prepare('DELETE FROM production_batches WHERE id = ?').run(batch.id);
        db.prepare('DELETE FROM job_orders WHERE id = ?').run(jo.id);
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(po.id);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(po.id);
    });

    test('24. Dashboard Ongoing Deliveries KPI & Production DR Handling Workflow Test', async () => {
        const prodToken = getAuthToken('PRODUCTION');
        assert.ok(prodToken);

        // A. Overview KPI returns ongoingDeliveries metric
        const overviewRes = await request(app)
            .get('/api/reports/overview')
            .set('Authorization', `Bearer ${prodToken}`);
        assert.strictEqual(overviewRes.status, 200);
        assert.strictEqual(typeof overviewRes.body.data.ongoingDeliveries, 'number');

        // B. Setup a fresh test order & batch
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [{ product_id: lotionProduct.id, target_quantity: 400, unit_price: 120.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const po = poRes.body.data;
        await request(app).post(`/api/orders/${po.id}/approve`).set('Authorization', `Bearer ${adminToken}`);

        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${prodToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 400 });
        assert.strictEqual(joRes.status, 201);
        const jo = joRes.body.data;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${prodToken}`)
            .send({ jo_id: jo.id, target_quantity: 400 });
        assert.strictEqual(batchRes.status, 201);
        const batch = batchRes.body.data;

        await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${prodToken}`)
            .send({ actual_yield: 410, qc_notes: 'Yield cleared by Production supervisor' });

        // C. Production receives notification for batch ready for DR dispatch
        const prodNotifRes = await request(app)
            .get('/api/notifications/pending')
            .set('Authorization', `Bearer ${prodToken}`);
        assert.strictEqual(prodNotifRes.status, 200);
        const hasDrReadyNotif = prodNotifRes.body.items.some(it => it.target && it.target.batchId === batch.id);
        assert.strictEqual(hasDrReadyNotif, true);

        // D. Production handles DR creation
        const initialOngoing = overviewRes.body.data.ongoingDeliveries;
        const createDrRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${prodToken}`)
            .send({
                po_id: po.id,
                jo_id: jo.id,
                delivery_date: '2026-09-16',
                driver_name: 'Danilo Gomez',
                vehicle_plate: 'NKB-8899',
                notes: 'Cleanroom packed and shrinkwrapped',
                items: [
                    { product_id: lotionProduct.id, batch_id: batch.id, delivered_quantity: 410 }
                ]
            });
        assert.strictEqual(createDrRes.status, 201);
        const createdDr = createDrRes.body.data;
        assert.strictEqual(createdDr.status, 'PENDING_CLIENT_ACCEPTANCE');
        assert.strictEqual(createdDr.driver_name, 'Danilo Gomez');

        // E. Ongoing deliveries count increments on Dashboard
        const afterOverviewRes = await request(app)
            .get('/api/reports/overview')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(afterOverviewRes.status, 200);
        assert.strictEqual(afterOverviewRes.body.data.ongoingDeliveries, initialOngoing + 1);

        // F. Production updates DR details (driver, vehicle, notes) via PUT /api/deliveries/:id
        const updateDrRes = await request(app)
            .put(`/api/deliveries/${createdDr.id}`)
            .set('Authorization', `Bearer ${prodToken}`)
            .send({
                driver_name: 'Ramon Bautista',
                vehicle_plate: 'NKB-7711',
                delivery_date: '2026-09-17',
                notes: 'Updated dispatch schedule per Production Supervisor instructions.'
            });
        assert.strictEqual(updateDrRes.status, 200);
        assert.strictEqual(updateDrRes.body.data.driver_name, 'Ramon Bautista');
        assert.strictEqual(updateDrRes.body.data.vehicle_plate, 'NKB-7711');
        assert.strictEqual(updateDrRes.body.data.notes, 'Updated dispatch schedule per Production Supervisor instructions.');

        // Clean up test records
        db.prepare('DELETE FROM delivery_items WHERE dr_id = ?').run(createdDr.id);
        db.prepare('DELETE FROM delivery_receipts WHERE id = ?').run(createdDr.id);
        db.prepare('DELETE FROM production_batches WHERE id = ?').run(batch.id);
        db.prepare('DELETE FROM job_orders WHERE id = ?').run(jo.id);
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(po.id);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(po.id);
    });

    test('25. PO Receipt Bank Details, Form of Payment Section, Accountant Edit, & Order Price Privacy Test', async () => {
        const acctToken = getAuthToken('ACCOUNTING');
        const ceoToken = getAuthToken('CEO');
        const prodToken = getAuthToken('PRODUCTION');
        const whToken = getAuthToken('WAREHOUSE');
        const purchToken = getAuthToken('PURCHASING');
        const qcToken = getAuthToken('QC');

        assert.ok(acctToken);
        assert.ok(ceoToken);
        assert.ok(prodToken);
        assert.ok(whToken);
        assert.ok(purchToken);
        assert.ok(qcToken);

        // A. Create a test PO with form_of_payment
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                form_of_payment: '30 Days Net / BDO Check',
                notes: 'Initial client order terms',
                items: [{ product_id: lotionProduct.id, target_quantity: 500, unit_price: 150.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const po = poRes.body.data;
        assert.strictEqual(po.form_of_payment, '30 Days Net / BDO Check');
        assert.strictEqual(po.grand_total, 60000);

        // B. Accountant & CEO & Admin can see prices on GET /api/orders/:id
        const acctPoRes = await request(app)
            .get(`/api/orders/${po.id}`)
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(acctPoRes.status, 200);
        assert.strictEqual(acctPoRes.body.data.grand_total, 60000);
        assert.strictEqual(acctPoRes.body.data.subtotal, 60000);
        assert.strictEqual(acctPoRes.body.data.items[0].unit_price, 120);
        assert.strictEqual(acctPoRes.body.data.form_of_payment, '30 Days Net / BDO Check');

        const ceoPoRes = await request(app)
            .get(`/api/orders/${po.id}`)
            .set('Authorization', `Bearer ${ceoToken}`);
        assert.strictEqual(ceoPoRes.status, 200);
        assert.strictEqual(ceoPoRes.body.data.grand_total, 60000);
        assert.strictEqual(ceoPoRes.body.data.items[0].unit_price, 120);

        const adminPoRes = await request(app)
            .get(`/api/orders/${po.id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(adminPoRes.status, 200);
        assert.strictEqual(adminPoRes.body.data.grand_total, 60000);

        // C. Accountant can edit the PO (Form of Payment and below section notes)
        const updateRes = await request(app)
            .put(`/api/orders/${po.id}`)
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                form_of_payment: '50% Downpayment, 50% upon DR delivery',
                notes: 'Accountant verified terms: 50/50 split via BDO Bank Transfer',
                items: [{ product_id: lotionProduct.id, target_quantity: 500 }]
            });
        assert.strictEqual(updateRes.status, 200);
        assert.strictEqual(updateRes.body.data.form_of_payment, '50% Downpayment, 50% upon DR delivery');
        assert.strictEqual(updateRes.body.data.notes, 'Accountant verified terms: 50/50 split via BDO Bank Transfer');

        // D. Strict Order Price Privacy: Production, Warehouse, Purchasing, and QC MUST NOT see order amounts/prices
        const opRoles = [
            { name: 'PRODUCTION', token: prodToken },
            { name: 'WAREHOUSE', token: whToken },
            { name: 'PURCHASING', token: purchToken },
            { name: 'QC', token: qcToken }
        ];

        for (const op of opRoles) {
            // GET /api/orders/:id
            const resSingle = await request(app)
                .get(`/api/orders/${po.id}`)
                .set('Authorization', `Bearer ${op.token}`);
            assert.strictEqual(resSingle.status, 200);
            assert.strictEqual(resSingle.body.data.subtotal, null, `${op.name} must receive null subtotal`);
            assert.strictEqual(resSingle.body.data.tax_amount, null, `${op.name} must receive null tax_amount`);
            assert.strictEqual(resSingle.body.data.grand_total, null, `${op.name} must receive null grand_total`);
            assert.strictEqual(resSingle.body.data.items[0].unit_price, null, `${op.name} must receive null unit_price`);
            assert.strictEqual(resSingle.body.data.items[0].subtotal, null, `${op.name} must receive null line subtotal`);
            assert.deepStrictEqual(resSingle.body.data.invoices, [], `${op.name} must not receive invoices`);

            // GET /api/orders list
            const resList = await request(app)
                .get('/api/orders')
                .set('Authorization', `Bearer ${op.token}`);
            assert.strictEqual(resList.status, 200);
            const foundInList = resList.body.data.find(o => o.id === po.id);
            assert.ok(foundInList, `Order must be in list for ${op.name}`);
            assert.strictEqual(foundInList.subtotal, null, `${op.name} list subtotal must be null`);
            assert.strictEqual(foundInList.grand_total, null, `${op.name} list grand_total must be null`);
            assert.strictEqual(foundInList.items[0].unit_price, null, `${op.name} list item unit_price must be null`);
            assert.strictEqual(foundInList.items[0].subtotal, null, `${op.name} list item subtotal must be null`);

            // Blocked from updating order
            const blockEdit = await request(app)
                .put(`/api/orders/${po.id}`)
                .set('Authorization', `Bearer ${op.token}`)
                .send({ notes: 'Attempted unauthorized edit' });
            assert.strictEqual(blockEdit.status, 403, `${op.name} must be forbidden from updating orders`);
        }

        // E. Verify receipt template contents: Bank details, Twig St. casing, FDA removal, contact person removal, and print header suppression
        const printPoHtml = fs.readFileSync(path.join(__dirname, '../public/print-po.html'), 'utf8');
        const printJoHtml = fs.readFileSync(path.join(__dirname, '../public/print-jo.html'), 'utf8');
        const printDrHtml = fs.readFileSync(path.join(__dirname, '../public/print-dr.html'), 'utf8');
        const printInvoiceHtml = fs.readFileSync(path.join(__dirname, '../public/print-invoice.html'), 'utf8');

        assert.ok(printPoHtml.includes('BDO UNIBANK, INC.<br>NKB MANUFACTURING CORPORATION<br>0080-5801-0547'), 'print-po.html must include NKB MANUFACTURING CORPORATION under BDO UNIBANK, INC.');
        assert.ok(printPoHtml.includes('0000079720871'), 'print-po.html must include Security Bank account 0000079720871');
        assert.ok(printPoHtml.includes('788-7-78803245-1'), 'print-po.html must include Metrobank account 788-7-78803245-1');
        assert.ok(printPoHtml.includes('SECURITY BANK'), 'print-po.html must include SECURITY BANK');
        assert.ok(printPoHtml.includes('METROBANK'), 'print-po.html must include METROBANK');
        assert.strictEqual(printPoHtml.includes('id="po-payment-section"'), false, 'print-po.html must NOT have #po-payment-section');
        assert.strictEqual(printPoHtml.includes('id="disp-po-payment"'), false, 'print-po.html must NOT have #disp-po-payment');
        assert.strictEqual(printPoHtml.includes('Form of Payment:'), false, 'print-po.html must NOT have "Form of Payment:" in receipt');
        assert.strictEqual(printPoHtml.includes('FDA'), false, 'print-po.html must NOT have FDA reference in receipt');
        assert.ok(printPoHtml.includes('Twig St.'), 'print-po.html must use capitalized Twig St.');
        assert.strictEqual(printPoHtml.includes('Twig st.'), false, 'print-po.html must NOT have lowercase Twig st.');
        assert.ok(printJoHtml.includes('Twig St.'), 'print-jo.html must use capitalized Twig St.');
        assert.ok(printPoHtml.includes('body.hide-prices'), 'print-po.html must contain hide-prices style for non-price viewers');
        assert.ok(printPoHtml.includes('Payment Made'), 'print-po.html must include Payment Made');
        assert.ok(printPoHtml.includes('Total Balance'), 'print-po.html must include Total Balance');
        assert.ok(printPoHtml.includes('id="disp-payment-made"'), 'print-po.html must include disp-payment-made');
        assert.ok(printPoHtml.includes('id="disp-total-balance"'), 'print-po.html must include disp-total-balance');
        const discountPos = printPoHtml.indexOf('id="disp-discount"');
        const paymentMadePos = printPoHtml.indexOf('id="disp-payment-made"');
        const totalBalancePos = printPoHtml.indexOf('id="disp-total-balance"');
        assert.ok(discountPos !== -1 && paymentMadePos !== -1 && discountPos < paymentMadePos, 'Payment Made must be under Discount in totals table');
        assert.ok(paymentMadePos < totalBalancePos, 'Total Balance must be after Payment Made in totals table');

        // Print header & footer suppression (@page margin: 0 and beforeprint title clearing)
        assert.ok(printPoHtml.includes('margin: 0'), 'print-po.html must have margin: 0 on @page to suppress browser headers');
        assert.ok(printJoHtml.includes('margin: 0'), 'print-jo.html must have margin: 0 on @page to suppress browser headers');
        assert.ok(printDrHtml.includes('margin: 0'), 'print-dr.html must have margin: 0 on @page to suppress browser headers');
        assert.ok(printInvoiceHtml.includes('margin: 0'), 'print-invoice.html must have margin: 0 on @page to suppress browser headers');
        assert.ok(printPoHtml.includes('beforeprint'), 'print-po.html must have beforeprint event listener');
        assert.ok(printJoHtml.includes('beforeprint'), 'print-jo.html must have beforeprint event listener');
        assert.ok(printDrHtml.includes('beforeprint'), 'print-dr.html must have beforeprint event listener');
        assert.ok(printInvoiceHtml.includes('beforeprint'), 'print-invoice.html must have beforeprint event listener');

        // Clean up test records
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(po.id);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(po.id);
    });

    test('26. Flexible Payment Reference, Payment Notes, & Delivery Invoicing & Client Receiving Assigned to Accountant', async () => {
        const acctToken = getAuthToken('ACCOUNTING');
        const prodToken = getAuthToken('PRODUCTION');
        const whToken = getAuthToken('WAREHOUSE');

        assert.ok(acctToken, 'Accountant token must be generated');
        assert.ok(prodToken, 'Production token must be generated');
        assert.ok(whToken, 'Warehouse token must be generated');

        // --- PART 1: DELIVERY RECEIVING & INVOICING ASSIGNED TO ACCOUNTANT ---
        // A. Setup test PO, JO, Batch, and DR
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                notes: 'Delivery & Accountant Workflow Test',
                items: [{ product_id: lotionProduct.id, target_quantity: 300, unit_price: 120.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const po = poRes.body.data;

        // Admin confirms/approves order
        await request(app).post(`/api/orders/${po.id}/approve`).set('Authorization', `Bearer ${adminToken}`);

        // Create Job Order
        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 300 });
        assert.strictEqual(joRes.status, 201);
        const jo = joRes.body.data;

        // Create Production Batch
        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${prodToken}`)
            .send({
                jo_id: jo.id,
                target_quantity: 300
            });
        assert.strictEqual(batchRes.status, 201);
        const batch = batchRes.body.data;

        // Yield clearance
        const yieldRes = await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${prodToken}`)
            .send({ actual_yield: 300, qc_notes: 'Clear for dispatch' });
        assert.strictEqual(yieldRes.status, 200);

        // Create Delivery Receipt dispatched by Production
        const drRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${prodToken}`)
            .send({
                po_id: po.id,
                jo_id: jo.id,
                delivery_date: '2026-09-16',
                driver_name: 'Fast Logistics Driver',
                vehicle_plate: 'NKB-2026',
                notes: 'Dispatched for client receiving test',
                items: [{ product_id: lotionProduct.id, batch_id: batch.id, delivered_quantity: 300, unit_price: 120.0 }]
            });
        assert.strictEqual(drRes.status, 201);
        const dr = drRes.body.data;
        assert.strictEqual(dr.status, 'PENDING_CLIENT_ACCEPTANCE');

        // B. Operational staff (Production / Warehouse) cannot record client receiving
        const prodAccept = await request(app)
            .post(`/api/deliveries/${dr.id}/accept`)
            .set('Authorization', `Bearer ${prodToken}`)
            .send({
                signer_name: 'Production Worker',
                signer_title: 'Shopfloor',
                items: [{ product_id: lotionProduct.id, accepted_quantity: 300, rejected_quantity: 0 }]
            });
        assert.strictEqual(prodAccept.status, 403, 'Production must be forbidden from accepting client deliveries');
        assert.ok(prodAccept.body.error.includes('assigned to Accounting and Administration'));

        const whAccept = await request(app)
            .post(`/api/deliveries/${dr.id}/accept`)
            .set('Authorization', `Bearer ${whToken}`)
            .send({
                signer_name: 'Warehouse Guy',
                signer_title: 'Loader',
                items: [{ product_id: lotionProduct.id, accepted_quantity: 300, rejected_quantity: 0 }]
            });
        assert.strictEqual(whAccept.status, 403, 'Warehouse must be forbidden from accepting client deliveries');

        // C. Accountant records client product receiving (e.g. from signed physical DR)
        const acctAccept = await request(app)
            .post(`/api/deliveries/${dr.id}/accept`)
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                signer_name: 'Maria Santos',
                signer_title: 'Receiving Store Custodian',
                acceptance_notes: 'Goods received in good order per physical DR stamp',
                items: [{ product_id: lotionProduct.id, accepted_quantity: 295, rejected_quantity: 5, reason: '5 dented boxes' }]
            });
        assert.strictEqual(acctAccept.status, 200, 'Accountant must be permitted to record client receiving');
        assert.strictEqual(acctAccept.body.data.status, 'ACCEPTED');

        // Verify dr_acceptances record
        const savedAcceptance = db.prepare('SELECT * FROM dr_acceptances WHERE dr_id = ?').get(dr.id);
        assert.ok(savedAcceptance);
        assert.strictEqual(savedAcceptance.signer_name, 'Maria Santos');
        assert.strictEqual(savedAcceptance.total_accepted_quantity, 295);
        assert.strictEqual(savedAcceptance.total_rejected_quantity, 5);
        assert.strictEqual(savedAcceptance.acceptance_notes, 'Goods received in good order per physical DR stamp');

        // D. Operational staff (Production / Warehouse) cannot generate invoice from DR
        const prodInv = await request(app)
            .post(`/api/invoices/from-dr/${dr.id}`)
            .set('Authorization', `Bearer ${prodToken}`)
            .send({ due_date: '2026-10-16' });
        assert.strictEqual(prodInv.status, 403, 'Production must be forbidden from generating invoices');

        // E. Accountant generates official Sales Invoice
        const acctInv = await request(app)
            .post(`/api/invoices/from-dr/${dr.id}`)
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                due_date: '2026-10-16',
                notes: 'Official invoice issued by Accounting from accepted DR'
            });
        assert.strictEqual(acctInv.status, 201, 'Accountant must be able to generate invoice from accepted DR');
        const invoice = acctInv.body.data;
        assert.strictEqual(invoice.status, 'UNPAID');
        assert.strictEqual(invoice.total_amount, 295 * 120); // 295 accepted @ 120 = 35,400

        // --- PART 2: FLEXIBLE PAYMENT REFERENCE & PAYMENT NOTES ---
        // A. Record payment with freeform reference (check/branch/deposit details) and multi-line notes
        const payRes1 = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                invoice_id: invoice.id,
                amount: 20000.0,
                payment_method: 'CHECK',
                reference_number: 'BDO CHECK #00984712 / CLEARED @ ALABANG BR',
                notes: 'Check deposited to BDO 0080-5801-0547. Cleared within 24 hours without chargeback.'
            });
        assert.strictEqual(payRes1.status, 201, 'Freeform reference and notes payment must succeed');
        assert.strictEqual(payRes1.body.data.invoice.status, 'PARTIALLY_PAID');

        // B. Record remaining balance with blank reference_number (must default to 'N/A') and notes
        const payRes2 = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                invoice_id: invoice.id,
                amount: 15400.0,
                payment_method: 'CASH',
                reference_number: '',
                notes: 'Paid in cash at accounting office, receipt issued'
            });
        assert.strictEqual(payRes2.status, 201, 'Blank reference number must succeed and default to N/A');
        assert.strictEqual(payRes2.body.data.invoice.status, 'PAID');

        // C. Verify GET /api/payments returns reference_number and notes accurately
        const listPaymentsRes = await request(app)
            .get(`/api/payments?invoiceId=${invoice.id}`)
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(listPaymentsRes.status, 200);
        assert.strictEqual(listPaymentsRes.body.data.length, 2);

        const checkPay = listPaymentsRes.body.data.find(p => p.payment_method === 'CHECK');
        assert.ok(checkPay);
        assert.strictEqual(checkPay.reference_number, 'BDO CHECK #00984712 / CLEARED @ ALABANG BR');
        assert.strictEqual(checkPay.notes, 'Check deposited to BDO 0080-5801-0547. Cleared within 24 hours without chargeback.');

        const cashPay = listPaymentsRes.body.data.find(p => p.payment_method === 'CASH');
        assert.ok(cashPay);
        assert.strictEqual(cashPay.reference_number, 'N/A');
        assert.strictEqual(cashPay.notes, 'Paid in cash at accounting office, receipt issued');

        // --- PART 3: FRONTEND VERIFICATIONS (admin.js) ---
        const adminJs = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');

        // Verify Deliveries tab is visible to Accounting (no hideTab('deliveries') under ACCOUNTING)
        const acctBlock = adminJs.substring(adminJs.indexOf("role === 'ACCOUNTING'"), adminJs.indexOf("role === 'CEO'"));
        assert.strictEqual(acctBlock.includes("hideTab('deliveries')"), false, 'Deliveries tab must NOT be hidden for ACCOUNTING role');

        // Verify openClientReceivingModal function exists in admin.js
        assert.ok(adminJs.includes('function openClientReceivingModal('), 'admin.js must declare openClientReceivingModal');
        assert.ok(adminJs.includes('submitClientReceiving'), 'admin.js must declare submitClientReceiving');

        // Verify loadDeliveries shows Receive Product and Invoice buttons according to role
        assert.ok(adminJs.includes("openClientReceivingModal('${dr.id}')"), 'loadDeliveries must call openClientReceivingModal');
        assert.ok(adminJs.includes('Awaiting Accounting Invoice'), 'loadDeliveries must show Awaiting Accounting Invoice for non-accounting roles');

        // Verify Record Payment modal has pay-amount id, flexible ref placeholder, and pay-notes
        assert.ok(adminJs.includes('id="pay-amount"'), 'Record payment modal must have id="pay-amount"');
        assert.ok(adminJs.includes('id="pay-notes"'), 'Record payment modal must have id="pay-notes"');
        assert.ok(adminJs.includes('Ref # / Check # / OR # / Txn ID (Optional/Freeform)'), 'Record payment modal must allow freeform reference');

        // Clean up test records
        db.prepare('DELETE FROM payments WHERE invoice_id = ?').run(invoice.id);
        db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoice.id);
        db.prepare('DELETE FROM sales_invoices WHERE id = ?').run(invoice.id);
        db.prepare('DELETE FROM returns WHERE dr_id = ?').run(dr.id);
        db.prepare('DELETE FROM dr_acceptances WHERE dr_id = ?').run(dr.id);
        db.prepare('DELETE FROM delivery_items WHERE dr_id = ?').run(dr.id);
        db.prepare('DELETE FROM delivery_receipts WHERE id = ?').run(dr.id);
        db.prepare('DELETE FROM production_batches WHERE id = ?').run(batch.id);
        db.prepare('DELETE FROM job_orders WHERE id = ?').run(jo.id);
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(po.id);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(po.id);
    });

    test('27. Delivery Progress Bar, Initial Delivery Tracking & PO/SO Numbering Synchronization', async () => {
        // 1. Create PO with 5,040 target quantity
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [{ product_id: lotionProduct.id, target_quantity: 5040, unit_price: 100.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const po = poRes.body.data;
        const expectedSoNumber = po.po_number.replace('PO-', 'SO-');
        assert.strictEqual(po.so_number, expectedSoNumber, 'SO number must match PO number pattern');

        // Approve PO
        await request(app).post(`/api/orders/${po.id}/approve`).set('Authorization', `Bearer ${adminToken}`);

        // 2. Create Job Order & Production Batch with unique batch number
        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 5040 });
        assert.strictEqual(joRes.status, 201);
        const jo = joRes.body.data;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jo_id: jo.id, target_quantity: 5040 });
        assert.strictEqual(batchRes.status, 201);
        const batch = batchRes.body.data;

        const yieldRes = await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ actual_yield: 5040, qc_notes: 'All 5040 units passed inspection' });
        assert.strictEqual(yieldRes.status, 200);
        const originalBatchNumber = batch.batch_number;

        // 3. Create initial Delivery Receipt for 720 out of 5,040
        const drRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                po_id: po.id,
                jo_id: jo.id,
                driver_name: 'Logistics Courier',
                vehicle_plate: 'NKB-720',
                items: [{ product_id: lotionProduct.id, batch_id: batch.id, delivered_quantity: 720 }]
            });
        assert.strictEqual(drRes.status, 201);
        const dr = drRes.body.data;
        assert.ok(dr.id, 'DR id must be present');
        assert.ok(dr.dr_number, 'DR number must be present');

        // 4. Verify PO status transitioned to PARTIALLY_DELIVERED
        const checkPo = db.prepare('SELECT status FROM purchase_orders WHERE id = ?').get(po.id);
        assert.strictEqual(checkPo.status, 'PARTIALLY_DELIVERED', 'PO status must transition to PARTIALLY_DELIVERED');

        // 5. Test GET /api/deliveries
        const listRes = await request(app)
            .get('/api/deliveries?poId=' + po.id)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(listRes.status, 200);
        assert.strictEqual(listRes.body.success, true);
        const fetchedDr = listRes.body.data.find(d => d.id === dr.id);
        assert.ok(fetchedDr, 'DR must exist in deliveries list');
        assert.strictEqual(fetchedDr.so_number, expectedSoNumber, 'SO number must be synchronized with PO');
        assert.strictEqual(fetchedDr.po_total_target, 5040, 'PO total target must be 5040');
        assert.strictEqual(fetchedDr.po_delivered_total, 720, 'PO delivered total must reflect initial delivery 720');

        assert.strictEqual(fetchedDr.items.length, 1);
        const drItem = fetchedDr.items[0];
        assert.strictEqual(drItem.batch_number, originalBatchNumber, 'Batch number must not be changed');
        assert.strictEqual(drItem.delivered_quantity, 720, 'Initial delivery must be 720');
        assert.strictEqual(drItem.po_target_quantity, 5040, 'Target quantity must be 5040');
        assert.strictEqual(drItem.cumulative_delivered_quantity, 720, 'Cumulative delivered must be 720');

        // 6. Test GET /api/deliveries/:id
        const detailRes = await request(app)
            .get(`/api/deliveries/${dr.id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(detailRes.status, 200);
        assert.strictEqual(detailRes.body.data.so_number, expectedSoNumber);
        assert.strictEqual(detailRes.body.data.items[0].batch_number, originalBatchNumber);
        assert.strictEqual(detailRes.body.data.items[0].po_target_quantity, 5040);
        assert.strictEqual(detailRes.body.data.items[0].cumulative_delivered_quantity, 720);

        // 7. Verify frontend renderDeliveryProgressBar output
        const appJsPath = path.join(__dirname, '../public/js/app.js');
        const appJs = fs.readFileSync(appJsPath, 'utf8');
        assert.ok(appJs.includes('renderDeliveryProgressBar'), 'app.js must provide renderDeliveryProgressBar');
        assert.ok(appJs.includes('Initial:'), 'app.js must render initial delivery indicator');

        // Clean up
        db.prepare('DELETE FROM delivery_items WHERE dr_id = ?').run(dr.id);
        db.prepare('DELETE FROM delivery_receipts WHERE id = ?').run(dr.id);
        db.prepare('DELETE FROM production_batches WHERE id = ?').run(batch.id);
        db.prepare('DELETE FROM job_orders WHERE id = ?').run(jo.id);
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(po.id);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(po.id);
    });

    test('28. Formulation Tab, Accounting Order Confirmation -> Raw Materials Conversion, and Live Inventory API Test', async () => {
        const accountingToken = getAuthToken('ACCOUNTING');
        const INVENTORY_API_KEY = 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b';

        // 1. Create a Purchase Order with 2 products (Sunscreen and Lotion)
        const sunscreenProduct = db.prepare("SELECT * FROM products WHERE sku = 'SKC-2026001' OR name LIKE '%Sunscreen%' LIMIT 1").get() || lotionProduct;
        const existingAssign = db.prepare('SELECT id FROM client_product_prices WHERE client_id = ? AND product_id = ?').get(demoClient.id, sunscreenProduct.id);
        if (!existingAssign) {
            db.prepare('INSERT INTO client_product_prices (id, client_id, product_id, custom_name, custom_price, custom_sku, custom_formula_code, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
                .run(require('uuid').v4(), demoClient.id, sunscreenProduct.id, sunscreenProduct.name, 150.0, sunscreenProduct.sku, sunscreenProduct.formula_code || 'FORM-SGC-V1');
        }

        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [
                    { product_id: lotionProduct.id, target_quantity: 500, unit_price: 120.0 },
                    { product_id: sunscreenProduct.id, target_quantity: 1000, unit_price: 150.0 }
                ]
            });
        assert.strictEqual(poRes.status, 201);
        const po = poRes.body.data;

        // Verify initially formulation_converted is 0 or unconfirmed
        const initialPo = db.prepare('SELECT accounting_confirmed, formulation_converted FROM purchase_orders WHERE id = ?').get(po.id);
        assert.strictEqual(initialPo.accounting_confirmed, 0);

        // 2. Accounting confirms the order
        const confirmRes = await request(app)
            .post(`/api/orders/${po.id}/accounting-confirm`)
            .set('Authorization', `Bearer ${accountingToken}`)
            .send({ form_of_payment: '30d' });
        assert.strictEqual(confirmRes.status, 200);
        assert.strictEqual(confirmRes.body.success, true);

        // 3. Verify order status in DB: accounting_confirmed = 1, formulation_converted = 1
        const updatedPo = db.prepare('SELECT accounting_confirmed, formulation_converted, form_of_payment FROM purchase_orders WHERE id = ?').get(po.id);
        assert.strictEqual(updatedPo.accounting_confirmed, 1);
        assert.strictEqual(updatedPo.formulation_converted, 1);
        assert.strictEqual(updatedPo.form_of_payment, '30d');

        // 4. Verify order_material_conversions table has converted raw materials
        const convertedMaterials = db.prepare('SELECT * FROM order_material_conversions WHERE po_id = ?').all(po.id);
        assert.ok(convertedMaterials.length > 0, 'Raw materials must be generated for all order items');

        // Verify conversion quantities are calculated (target_quantity * unit_quantity)
        for (const mat of convertedMaterials) {
            assert.ok(mat.total_quantity > 0, `Total quantity for ${mat.material_name} must be > 0`);
            assert.strictEqual(mat.status, 'ALLOCATED');
            assert.ok(mat.material_code, 'Material code must be populated');
        }

        // 5. Verify Internal Role-Protected Breakdown API
        const breakdownRes = await request(app)
            .get(`/api/formulations/orders/${po.id}/breakdown`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(breakdownRes.status, 200);
        assert.strictEqual(breakdownRes.body.success, true);
        assert.ok(breakdownRes.body.data.perProduct.length >= 2, 'Breakdown must contain items for both ordered products');
        assert.ok(breakdownRes.body.data.consolidated.length > 0, 'Consolidated pull sheet must contain aggregated raw materials');

        // 6. Verify Confidentiality Rule: CLIENT role is strictly FORBIDDEN (403) from accessing formulations
        const clientListRes = await request(app)
            .get('/api/formulations')
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientListRes.status, 403, 'Client must be forbidden from listing formulations');

        const clientDetailRes = await request(app)
            .get(`/api/formulations/${lotionProduct.id}`)
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientDetailRes.status, 403, 'Client must be forbidden from accessing chemical formulation');

        const clientBreakdownRes = await request(app)
            .get(`/api/formulations/orders/${po.id}/breakdown`)
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientBreakdownRes.status, 403, 'Client must be forbidden from accessing material breakdown');

        // 7. Verify External Live Inventory API Key Authentication
        // 7a. External Status Check with Valid API Key
        const extStatusValid = await request(app)
            .get('/api/formulations/external/status')
            .set('x-api-key', INVENTORY_API_KEY);
        assert.strictEqual(extStatusValid.status, 200);
        assert.strictEqual(extStatusValid.body.success, true);
        assert.strictEqual(extStatusValid.body.apiLive, true);

        // 7b. External Status Check without API Key -> 401
        const extStatusNoKey = await request(app)
            .get('/api/formulations/external/status');
        assert.strictEqual(extStatusNoKey.status, 401);
        assert.strictEqual(extStatusNoKey.body.error, 'UNAUTHORIZED_INVENTORY_API');

        // 7c. External Status Check with Wrong Key -> 401
        const extStatusWrongKey = await request(app)
            .get('/api/formulations/external/status')
            .set('x-api-key', 'wrong_api_key_12345');
        assert.strictEqual(extStatusWrongKey.status, 401);

        // 7d. External Materials Pull by PO with Valid API Key
        const extMaterialsRes = await request(app)
            .get(`/api/formulations/external/orders/${po.id}/materials`)
            .set('x-api-key', INVENTORY_API_KEY);
        assert.strictEqual(extMaterialsRes.status, 200);
        assert.strictEqual(extMaterialsRes.body.success, true);
        assert.strictEqual(extMaterialsRes.body.orderNumber, po.po_number);
        assert.strictEqual(extMaterialsRes.body.accountingConfirmed, true);
        assert.ok(extMaterialsRes.body.consolidatedMaterials.length > 0);

        // 8. Verify Printable Formulation Receipt Document exists
        const printReceiptPath = path.join(__dirname, '../public/print-formulation-receipt.html');
        assert.ok(fs.existsSync(printReceiptPath), 'print-formulation-receipt.html must exist in public folder');
        const printReceiptHtml = fs.readFileSync(printReceiptPath, 'utf8');
        assert.ok(printReceiptHtml.includes('FORMULATION MATERIAL REQUISITION RECEIPT'), 'Must contain receipt header');
        assert.ok(printReceiptHtml.includes('CONFIDENTIAL & PROPRIETARY TRADE SECRET'), 'Must contain confidential trade secret notice');
        assert.ok(printReceiptHtml.includes('Formulation Chemist'), 'Must contain sign-off block for Chemist');

        // Clean up
        db.prepare('DELETE FROM order_material_conversions WHERE po_id = ?').run(po.id);
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(po.id);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(po.id);
    });

    test('29. Meta Messenger Chat Features (Heartbeat, Typing Indicator, Presence Tracking) & Formulation Receipt Pricing Test', async () => {
        const acctToken = getAuthToken('ACCOUNTING');
        const acctUser = db.prepare("SELECT * FROM users WHERE role = 'ACCOUNTING'").get();
        const clientUser = db.prepare("SELECT * FROM users WHERE client_id = ?").get(demoClient.id);

        // 1. POST /api/chat/heartbeat updates last_active_at and returns isOnline
        const heartbeatRes = await request(app)
            .post('/api/chat/heartbeat')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(heartbeatRes.status, 200);
        assert.strictEqual(heartbeatRes.body.success, true);
        assert.strictEqual(heartbeatRes.body.isOnline, true);
        assert.ok(heartbeatRes.body.timestamp);

        const updatedAcctUser = db.prepare('SELECT last_active_at FROM users WHERE id = ?').get(acctUser.id);
        assert.ok(updatedAcctUser.last_active_at);

        // 2. GET /api/chat/contacts includes isOnline and activeStatus
        const contactsRes = await request(app)
            .get('/api/chat/contacts')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(contactsRes.status, 200);
        assert.strictEqual(contactsRes.body.success, true);
        assert.ok(Array.isArray(contactsRes.body.contacts));
        // Accountant was recently active via heartbeat, so activeStatus must be 'Active now'
        const acctContact = contactsRes.body.contacts.find(s => s.userId === acctUser.id || s.id === `user-${acctUser.id}`);
        assert.ok(acctContact, 'Accountant contact must be found in contacts list');
        assert.strictEqual(acctContact.isOnline, true);
        assert.strictEqual(acctContact.activeStatus, 'Active now');

        // 3. POST /api/chat/typing records typing state
        const typingRes = await request(app)
            .post('/api/chat/typing')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                channelType: 'DIRECT',
                recipientId: clientUser.id,
                isTyping: true
            });
        assert.strictEqual(typingRes.status, 200);
        assert.strictEqual(typingRes.body.success, true);

        // 4. GET /api/chat/status shows typing indication to recipient
        const statusRes = await request(app)
            .get(`/api/chat/status?channelType=DIRECT&targetId=${acctUser.id}`)
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(statusRes.status, 200);
        assert.strictEqual(statusRes.body.success, true);
        assert.strictEqual(statusRes.body.isOnline, true);
        assert.strictEqual(statusRes.body.isTyping, true);
        assert.ok(statusRes.body.typingUsers.length > 0);
        assert.strictEqual(statusRes.body.typingUsers[0].name, acctUser.name);

        // 5. Formulation breakdown returns ingredient pricing (unit_cost, total_cost, grandTotalRawMaterialCost)
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [{ product_id: lotionProduct.id, target_quantity: 400, unit_price: 120.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const po = poRes.body.data;

        // Confirm by accounting to trigger conversion
        await request(app)
            .post(`/api/orders/${po.id}/accounting-confirm`)
            .set('Authorization', `Bearer ${acctToken}`)
            .send({ form_of_payment: '30d' });

        const breakdownRes = await request(app)
            .get(`/api/formulations/orders/${po.id}/breakdown`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(breakdownRes.status, 200);
        const breakdown = breakdownRes.body.data;
        assert.ok(breakdown.perProduct.length > 0);
        const firstProd = breakdown.perProduct[0];
        assert.ok(firstProd.total_material_cost > 0, 'Product material total cost must be > 0');
        assert.ok(firstProd.ingredients.length > 0);
        const firstIng = firstProd.ingredients[0];
        assert.ok(firstIng.unit_cost > 0, 'Ingredient unit_cost must be > 0');
        assert.ok(firstIng.total_cost > 0, 'Ingredient total_cost must be > 0');
        assert.ok(breakdown.grandTotalRawMaterialCost > 0, 'Order grandTotalRawMaterialCost must be > 0');

        // 6. Recipe viewer and Receipt Verification
        const printReceiptPath = path.join(__dirname, '../public/print-formulation-receipt.html');
        const printReceiptHtml = fs.readFileSync(printReceiptPath, 'utf8');
        assert.ok(printReceiptHtml.includes('Unit Price (₱)'), 'Receipt must contain Unit Price header');
        assert.ok(printReceiptHtml.includes('Total Price (₱)'), 'Receipt must contain Total Price header');
        assert.ok(printReceiptHtml.includes('Product Raw Material Total:'), 'Receipt must contain per-product total');
        assert.ok(printReceiptHtml.includes('Grand Total Raw Material Cost:'), 'Receipt must contain consolidated total');
        // Steps, % w/w, unit dosage removed
        assert.strictEqual(printReceiptHtml.includes('Compounding / Mixing Steps'), false, 'Receipt must NOT contain Compounding steps');
        assert.strictEqual(printReceiptHtml.includes('% w/w'), false, 'Receipt must NOT contain % w/w');
        assert.strictEqual(printReceiptHtml.includes('Unit Dosage'), false, 'Receipt must NOT contain Unit Dosage');

        // Clean up
        db.prepare('DELETE FROM order_material_conversions WHERE po_id = ?').run(po.id);
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(po.id);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(po.id);
    });

    test('30. Developer REST API (v1), Scopes, Key Management, OpenAPI & Interactive Docs', async () => {
        // 1. Scopes endpoint returns available scopes
        const scopesRes = await request(app)
            .get('/api/api-keys/scopes')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(scopesRes.status, 200);
        assert.strictEqual(scopesRes.body.success, true);
        assert.ok(Array.isArray(scopesRes.body.scopes));
        assert.ok(scopesRes.body.scopes.some(s => s.id === 'orders:read'));

        // 2. Generate Global Admin API key with full scopes
        const createKeyRes = await request(app)
            .post('/api/api-keys')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'External ERP Test Key',
                scopes: ['products:read', 'orders:read', 'orders:write', 'deliveries:read', 'invoices:read', 'inventory:read'],
                rateLimitRpm: 120
            });
        assert.strictEqual(createKeyRes.status, 201);
        assert.strictEqual(createKeyRes.body.success, true);
        assert.ok(createKeyRes.body.rawKey.startsWith('nkb_live_'));
        const globalApiKey = createKeyRes.body.rawKey;
        const globalKeyId = createKeyRes.body.apiKey.id;

        // Verify key hash is stored and raw key is NOT stored in DB
        const dbKeyRow = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(globalKeyId);
        assert.ok(dbKeyRow);
        assert.ok(dbKeyRow.key_hash);
        assert.strictEqual(dbKeyRow.key_prefix.startsWith('nkb_live_'), true);
        assert.strictEqual(dbKeyRow.key_hash.includes('nkb_live_'), false); // raw key is not stored

        // 3. Ping API v1 with Global API Key
        const pingRes = await request(app)
            .get('/api/v1/ping')
            .set('x-api-key', globalApiKey);
        assert.strictEqual(pingRes.status, 200);
        assert.strictEqual(pingRes.body.status, 'ok');
        assert.strictEqual(pingRes.body.key.name, 'External ERP Test Key');
        assert.ok(pingRes.body.key.scopes.includes('orders:read'));

        // 4. Ping with invalid key -> 401
        const pingBadRes = await request(app)
            .get('/api/v1/ping')
            .set('x-api-key', 'nkb_live_invalidkey12345');
        assert.strictEqual(pingBadRes.status, 401);
        assert.strictEqual(pingBadRes.body.error, 'INVALID_API_KEY');

        // 5. Query Products via GET /api/v1/products
        const prodRes = await request(app)
            .get('/api/v1/products?limit=10')
            .set('x-api-key', globalApiKey);
        assert.strictEqual(prodRes.status, 200);
        assert.strictEqual(prodRes.body.success, true);
        assert.ok(Array.isArray(prodRes.body.data));
        assert.ok(prodRes.body.total > 0);

        // 6. Create Purchase Order via POST /api/v1/orders
        const createOrderRes = await request(app)
            .post('/api/v1/orders')
            .set('x-api-key', globalApiKey)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 5.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [
                    { product_id: lotionProduct.id, target_quantity: 150 }
                ]
            });
        assert.strictEqual(createOrderRes.status, 201);
        assert.strictEqual(createOrderRes.body.success, true);
        const createdOrder = createOrderRes.body.data;
        assert.ok(createdOrder.id);
        assert.ok(createdOrder.po_number.startsWith('PO-'));
        assert.ok(createdOrder.so_number.startsWith('SO-'));
        assert.strictEqual(createdOrder.items.length, 1);

        // 7. Retrieve the Order via GET /api/v1/orders/:id
        const getOrderRes = await request(app)
            .get(`/api/v1/orders/${createdOrder.id}`)
            .set('x-api-key', globalApiKey);
        assert.strictEqual(getOrderRes.status, 200);
        assert.strictEqual(getOrderRes.body.success, true);
        assert.strictEqual(getOrderRes.body.data.id, createdOrder.id);

        // 8. Client Data Isolation: Create client-scoped key for otherClient
        const clientKeyRes = await request(app)
            .post('/api/api-keys')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Glow Essentials Client App Key',
                clientId: otherClient.id,
                scopes: ['orders:read', 'orders:write', 'products:read']
            });
        assert.strictEqual(clientKeyRes.status, 201);
        const otherClientKey = clientKeyRes.body.rawKey;
        const otherClientKeyId = clientKeyRes.body.apiKey.id;

        // Trying to access demoClient's order with otherClient's key must return 404 (isolated)
        const isolatedGetRes = await request(app)
            .get(`/api/v1/orders/${createdOrder.id}`)
            .set('x-api-key', otherClientKey);
        assert.strictEqual(isolatedGetRes.status, 404);
        assert.strictEqual(isolatedGetRes.body.error, 'ORDER_NOT_FOUND');

        // 9. Scope Enforcement: Create key with ONLY products:read scope
        const readOnlyKeyRes = await request(app)
            .post('/api/api-keys')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Catalog Only Key',
                scopes: ['products:read']
            });
        assert.strictEqual(readOnlyKeyRes.status, 201);
        const readOnlyKey = readOnlyKeyRes.body.rawKey;
        const readOnlyKeyId = readOnlyKeyRes.body.apiKey.id;

        // Attempting to access /api/v1/orders without orders:read must return 403
        const forbiddenRes = await request(app)
            .get('/api/v1/orders')
            .set('x-api-key', readOnlyKey);
        assert.strictEqual(forbiddenRes.status, 403);
        assert.strictEqual(forbiddenRes.body.error, 'INSUFFICIENT_SCOPE');

        // 10. Backward Compatibility: Live Inventory Key works on /api/v1/inventory
        const invRes = await request(app)
            .get('/api/v1/inventory')
            .set('x-api-key', 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b');
        assert.strictEqual(invRes.status, 200);
        assert.strictEqual(invRes.body.success, true);
        assert.ok(Array.isArray(invRes.body.products));

        // 11. OpenAPI 3.0 Specification endpoint
        const openApiRes = await request(app)
            .get('/api/v1/openapi.json');
        assert.strictEqual(openApiRes.status, 200);
        assert.strictEqual(openApiRes.body.openapi.startsWith('3.0'), true);
        assert.ok(openApiRes.body.info.title.includes('NKB Manufacturing Corporation'));
        assert.ok(openApiRes.body.paths['/products']);
        assert.ok(openApiRes.body.paths['/orders']);

        // 12. Developer Documentation HTML portal
        const docsRes = await request(app)
            .get('/api/docs');
        assert.strictEqual(docsRes.status, 200);
        assert.ok(docsRes.text.includes('NKB Developer API'));

        // 13. Key Revocation: Revoke global key
        const revokeRes = await request(app)
            .post(`/api/api-keys/${globalKeyId}/revoke`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(revokeRes.status, 200);
        assert.strictEqual(revokeRes.body.success, true);

        // Ping with revoked key must return 401 (INVALID_API_KEY)
        const revokedPing = await request(app)
            .get('/api/v1/ping')
            .set('x-api-key', globalApiKey);
        assert.strictEqual(revokedPing.status, 401);
        assert.strictEqual(revokedPing.body.error, 'INVALID_API_KEY');

        // 14. Key Deletion
        const delRes = await request(app)
            .delete(`/api/api-keys/${globalKeyId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(delRes.status, 200);

        // Clean up created orders & test keys
        db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(createdOrder.id);
        db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(createdOrder.id);
        db.prepare('DELETE FROM api_keys WHERE id IN (?, ?)').run(otherClientKeyId, readOnlyKeyId);
    });

    test('31. Client Portal First Routing, Staff Login Redirection, and Online Inquiry to IT Admin', async () => {
        // 1. Root route '/' serves client.html with Guest Cosmetics Catalog
        const rootRes = await request(app).get('/');
        assert.strictEqual(rootRes.status, 200);
        assert.ok(rootRes.text.includes('Client Portal'));
        assert.ok(rootRes.text.includes('Place New Order'));
        assert.ok(rootRes.text.includes('Log In as Staff'));
        assert.ok(rootRes.text.includes('Contact Support'));

        // 2. Staff routes (/login, /staff, /staff-login) serve index.html
        const loginRes = await request(app).get('/login');
        assert.strictEqual(loginRes.status, 200);
        assert.ok(loginRes.text.includes('Portal Login'));

        const staffRes = await request(app).get('/staff');
        assert.strictEqual(staffRes.status, 200);
        assert.ok(staffRes.text.includes('Portal Login'));

        // 3. Guest Online Inquiry submission to IT Admin
        const guestInquiryRes = await request(app)
            .post('/api/chat/inquiry')
            .send({
                name: 'Maria Clarisse',
                email: 'maria.clarisse@testbrand.ph',
                phone: '+63 917 555 1234',
                company_name: 'Clarisse Skincare Co.',
                subject: 'Product Formulation & Ingredients',
                message: 'Inquiring about SPF 50 sunscreen formulation MOQ and batch testing.'
            });

        assert.strictEqual(guestInquiryRes.status, 201);
        assert.strictEqual(guestInquiryRes.body.success, true);
        assert.ok(guestInquiryRes.body.inquiryId);

        // 4. Verify in database: support_inquiries & chat_messages
        const savedInquiry = db.prepare('SELECT * FROM support_inquiries WHERE id = ?').get(guestInquiryRes.body.inquiryId);
        assert.ok(savedInquiry);
        assert.strictEqual(savedInquiry.email, 'maria.clarisse@testbrand.ph');
        assert.strictEqual(savedInquiry.status, 'NEW');

        const chatMsg = db.prepare(`
            SELECT * FROM chat_messages 
            WHERE is_support = 1 AND target_role = 'IT_ADMIN' AND message LIKE ?
        `).get('%maria.clarisse@testbrand.ph%');
        assert.ok(chatMsg, 'Chat message must be dispatched to IT Admin');
        assert.strictEqual(chatMsg.channel_type, 'SUPPORT');

        // 5. IT Admin can view inquiries
        const itAdminToken = getAuthToken('IT_ADMIN');
        const listInquiriesRes = await request(app)
            .get('/api/chat/inquiries')
            .set('Authorization', `Bearer ${itAdminToken}`);
        assert.strictEqual(listInquiriesRes.status, 200);
        assert.strictEqual(listInquiriesRes.body.success, true);
        assert.ok(listInquiriesRes.body.data.some(i => i.id === guestInquiryRes.body.inquiryId));

        // 6. IT Admin receives notification for pending inquiries
        const notifRes = await request(app)
            .get('/api/notifications/pending')
            .set('Authorization', `Bearer ${itAdminToken}`);
        assert.strictEqual(notifRes.status, 200);
        assert.strictEqual(notifRes.body.success, true);
        const inquiryNotif = notifRes.body.items.find(n => n.category === 'SUPPORT');
        assert.ok(inquiryNotif, 'IT Admin must have SUPPORT inquiry notification');

        // Clean up test inquiry records
        db.prepare('DELETE FROM chat_messages WHERE id = ?').run(chatMsg.id);
        db.prepare('DELETE FROM support_inquiries WHERE id = ?').run(guestInquiryRes.body.inquiryId);
    });

    test('32. Late Encoding Invoice Date, Date Adjustment & Dashboard Monthly Sales Statistics', async () => {
        // 1. Create a PO, Batch, DR, and Accept it to test late-encoding invoice generation
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 5.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [{ product_id: lotionProduct.id, target_quantity: 200, unit_price: 150.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const poId = poRes.body.data.id;

        await request(app).post(`/api/orders/${poId}/approve`).set('Authorization', `Bearer ${adminToken}`);

        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: poId, product_id: lotionProduct.id, target_quantity: 200 });
        const joId = joRes.body.data.id;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jo_id: joId, target_quantity: 200 });
        const batchId = batchRes.body.data.id;

        await request(app)
            .post(`/api/production/batches/${batchId}/yield`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ actual_yield: 200 });

        const drRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                po_id: poId,
                jo_id: joId,
                items: [{ product_id: lotionProduct.id, batch_id: batchId, delivered_quantity: 200, unit_price: 150.0 }]
            });
        const drId = drRes.body.data.id;

        const acceptRes = await request(app)
            .post(`/api/deliveries/${drId}/accept`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                signer_name: 'Late Encoding Tester',
                signer_title: 'Finance Manager',
                signature_data: 'Digitally Approved - Late Encoding Tester'
            });
        assert.strictEqual(acceptRes.status, 200);

        // 2. Generate Invoice with Late Encoding Date (Backdated to 2026-09-05)
        const customDate = '2026-09-05';
        const invRes = await request(app)
            .post(`/api/invoices/from-dr/${drId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ invoice_date: customDate });
        assert.strictEqual(invRes.status, 201);
        assert.strictEqual(invRes.body.success, true);
        const invoice = invRes.body.data;
        assert.strictEqual(invoice.invoice_date, customDate, 'Invoice must respect late-encoding date');

        // 3. Edit Invoice Date via PATCH /api/invoices/:id/dates
        const editedDate = '2026-09-08';
        const editedDueDate = '2026-10-08';
        const patchRes = await request(app)
            .patch(`/api/invoices/${invoice.id}/dates`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                invoice_date: editedDate,
                due_date: editedDueDate,
                reason: 'Accounting late encoding correction'
            });
        assert.strictEqual(patchRes.status, 200);
        assert.strictEqual(patchRes.body.success, true);
        assert.strictEqual(patchRes.body.data.invoice_date, editedDate);
        assert.strictEqual(patchRes.body.data.due_date, editedDueDate);

        // 4. Verify Dashboard Overview API returns Monthly Sales Statistics
        const overviewRes = await request(app)
            .get('/api/reports/overview')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(overviewRes.status, 200);
        assert.strictEqual(overviewRes.body.success, true);
        const overview = overviewRes.body.data;

        assert.ok(overview.salesThisMonth, 'Must contain salesThisMonth statistics');
        assert.ok(typeof overview.salesThisMonth.totalSold === 'number', 'totalSold must be a number');
        assert.ok(typeof overview.salesThisMonth.totalCollected === 'number', 'totalCollected must be a number');
        assert.ok(typeof overview.salesThisMonth.totalBalance === 'number', 'totalBalance must be a number');
        assert.ok(typeof overview.salesThisMonth.invoiceCount === 'number', 'invoiceCount must be a number');
        assert.ok(typeof overview.salesThisMonth.totalUnitsSold === 'number', 'totalUnitsSold must be a number');
        assert.ok(Array.isArray(overview.salesThisMonth.salesTrend), 'salesTrend must be an array');
        assert.strictEqual(overview.salesThisMonth.salesTrend.length, 6, 'salesTrend must have 6 months');
        assert.ok(Array.isArray(overview.salesThisMonth.topProducts), 'topProducts must be an array');
        assert.ok(typeof overview.expectedDeliveryAmount === 'number', 'expectedDeliveryAmount must be a number');
        assert.ok(typeof overview.remainingDeliveryAmount === 'number', 'remainingDeliveryAmount must be a number');
        assert.ok(typeof overview.totalOrderedUnits === 'number', 'totalOrderedUnits must be a number');
        assert.ok(overview.expectedDeliveryAmount >= 0, 'expectedDeliveryAmount must be non-negative');

        // 5. Verify Client Overview API returns Monthly Purchases
        const clientOverviewRes = await request(app)
            .get('/api/reports/overview')
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientOverviewRes.status, 200);
        assert.strictEqual(clientOverviewRes.body.success, true);
        assert.ok(typeof clientOverviewRes.body.data.purchasedThisMonth === 'number', 'purchasedThisMonth must be a number');
        assert.ok(typeof clientOverviewRes.body.data.purchasedPaidThisMonth === 'number', 'purchasedPaidThisMonth must be a number');
    });

    test('33. Payment Check Attachments, Accountant Cheque Payables & External COO Approval API Workflow', async () => {
        const acctToken = getAuthToken('ACCOUNTING');
        assert.ok(acctToken, 'Accounting token must be available');

        // --- PART 1: PAYMENT CHECK ATTACHMENTS & BANK DETAILS ---
        // 1. Create a test PO, JO, Batch, DR, and Invoice
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                notes: 'Check Attachment Payment Workflow Test',
                items: [{ product_id: lotionProduct.id, target_quantity: 200, unit_price: 150.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const po = poRes.body.data;

        await request(app).post(`/api/orders/${po.id}/approve`).set('Authorization', `Bearer ${adminToken}`);
        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 200 });
        const jo = joRes.body.data;

        const prodToken = getAuthToken('PRODUCTION');
        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${prodToken}`)
            .send({ jo_id: jo.id, target_quantity: 200 });
        const batch = batchRes.body.data;

        await request(app)
            .post(`/api/production/batches/${batch.id}/record-output`)
            .set('Authorization', `Bearer ${prodToken}`)
            .send({ actual_yield: 200, notes: 'Completed for check payment test' });

        const drRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                po_id: po.id,
                jo_id: jo.id,
                items: [{ product_id: lotionProduct.id, batch_id: batch.id, delivered_quantity: 200, unit_price: 150.0 }]
            });
        assert.strictEqual(drRes.status, 201);
        const dr = drRes.body.data;

        await request(app)
            .post(`/api/deliveries/${dr.id}/accept`)
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                signer_name: 'Payment Check Signer',
                signer_title: 'Finance Supervisor',
                signature_data: 'Digitally Approved - Payment Check Signer'
            });

        const invRes = await request(app)
            .post(`/api/invoices/from-dr/${dr.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});
        assert.strictEqual(invRes.status, 201);
        const invoice = invRes.body.data;

        // 2. Record Payment with Bank Name, Check Number, and Base64 Attachment
        const sampleCheckBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const payRes = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                invoice_id: invoice.id,
                amount: 15000.0,
                payment_method: 'CHECK',
                bank_name: 'BDO Unibank',
                check_number: 'BDO-CHQ-998877',
                reference_number: 'DEP-883921',
                attachment_data: sampleCheckBase64,
                notes: 'Partial payment via physical check'
            });
        assert.strictEqual(payRes.status, 201);
        assert.strictEqual(payRes.body.success, true);
        const payment = payRes.body.data;
        assert.ok(payment.attachment_url, 'Payment must store attachment URL');
        assert.strictEqual(payment.bank_name, 'BDO Unibank');
        assert.strictEqual(payment.check_number, 'BDO-CHQ-998877');

        // 3. Update Check Attachment via POST /api/payments/:id/attachment
        const sampleUpdatedCheckBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mN8//8/AwAI/AL+X8F7AAAAAElFTkSuQmCC';
        const updateAttRes = await request(app)
            .post(`/api/payments/${payment.id}/attachment`)
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                check_number: 'BDO-CHQ-998877-REVISED',
                bank_name: 'BDO Unibank Main Branch',
                attachment_data: sampleUpdatedCheckBase64
            });
        assert.strictEqual(updateAttRes.status, 200);
        assert.strictEqual(updateAttRes.body.success, true);
        assert.strictEqual(updateAttRes.body.data.check_number, 'BDO-CHQ-998877-REVISED');
        assert.strictEqual(updateAttRes.body.data.bank_name, 'BDO Unibank Main Branch');

        // --- PART 2: ACCOUNTANT CHEQUE PAYABLE REQUISITION ---
        const sampleVoucherBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const payableRes = await request(app)
            .post('/api/cheque-payables')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                payee_name: 'Supreme Packaging Corp.',
                amount: 75000.0,
                cheque_date: '2026-09-30',
                category: 'Packaging Supplies',
                bank_name: 'Security Bank',
                bank_account_number: '3128-4902-1855',
                purpose: 'Payment for 10,000 customized cosmetic pump bottles and caps',
                invoice_reference: 'SUP-INV-2026-554',
                attachment_data: sampleVoucherBase64,
                internal_notes: 'Urgent packaging shipment for sunscreen production run'
            });
        assert.strictEqual(payableRes.status, 201);
        assert.strictEqual(payableRes.body.success, true);
        const payable = payableRes.body.data;
        assert.ok(payable.request_number.startsWith('CHQ-'), 'Must have sequential CHQ request number');
        assert.strictEqual(payable.status, 'PENDING_COO_APPROVAL');
        assert.strictEqual(payable.category, 'Packaging Supplies');
        assert.strictEqual(payable.bank_name, 'Security Bank');
        assert.ok(payable.attachment_url, 'Must store voucher attachment URL');

        // Verify Accountant can query and filter cheque payables
        const listPayablesRes = await request(app)
            .get('/api/cheque-payables?status=PENDING_COO_APPROVAL&category=Packaging+Supplies')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(listPayablesRes.status, 200);
        assert.strictEqual(listPayablesRes.body.success, true);
        assert.ok(listPayablesRes.body.data.length >= 1);
        assert.ok(listPayablesRes.body.summary.totalPending >= 75000.0);

        // --- PART 3: EXTERNAL COO APPROVAL INTEGRATION (API KEY: nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b) ---
        const COO_KEY = 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b';

        // A. COO queries payables from external system
        const cooGetRes = await request(app)
            .get('/api/v1/payables?status=PENDING_COO_APPROVAL')
            .set('x-api-key', COO_KEY);
        assert.strictEqual(cooGetRes.status, 200);
        assert.strictEqual(cooGetRes.body.success, true);
        assert.ok(Array.isArray(cooGetRes.body.data));
        const foundPending = cooGetRes.body.data.find(p => p.id === payable.id);
        assert.ok(foundPending, 'COO external GET API must find the newly requested cheque payable');

        // B. COO confirms the cheque payable request
        const cooConfirmRes = await request(app)
            .post(`/api/v1/payables/${payable.id}/confirm`)
            .set('x-api-key', COO_KEY)
            .send({
                action: 'CONFIRMED',
                confirmed_by: 'Engr. Glen Nobleza (COO)',
                cheque_number: 'SEC-2026-004812',
                coo_notes: 'Approved for disbursement. Ensure delivery receipt matches PO specifications.'
            });
        assert.strictEqual(cooConfirmRes.status, 200);
        assert.strictEqual(cooConfirmRes.body.success, true);
        assert.strictEqual(cooConfirmRes.body.data.status, 'CONFIRMED');
        assert.strictEqual(cooConfirmRes.body.data.coo_confirmed_by, 'Engr. Glen Nobleza (COO)');
        assert.strictEqual(cooConfirmRes.body.data.cheque_number, 'SEC-2026-004812');

        // C. Verified records flow back to the Accountant's ledger
        const acctVerifyRes = await request(app)
            .get(`/api/cheque-payables/${payable.id}`)
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(acctVerifyRes.status, 200);
        assert.strictEqual(acctVerifyRes.body.success, true);
        assert.strictEqual(acctVerifyRes.body.data.status, 'CONFIRMED');
        assert.strictEqual(acctVerifyRes.body.data.coo_confirmed_by, 'Engr. Glen Nobleza (COO)');
        assert.ok(acctVerifyRes.body.data.coo_confirmed_at, 'Must have COO confirmation timestamp');

        // Clean up test records
        db.prepare('DELETE FROM cheque_payables WHERE id = ?').run(payable.id);
    });

    test('34. Live Bank Accounts, Overdraft Warning, PDC Maturity, Cheque Clearance & Client Payment Submission Workflow', async () => {
        const acctToken = getAuthToken('ACCOUNTING');
        const COO_KEY = 'nkb_inv_live_6ae6965c1ca61aef54939d6b1ecfac1b';

        // 1. Live Bank Accounts endpoint
        const banksRes = await request(app)
            .get('/api/bank-accounts')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(banksRes.status, 200);
        assert.strictEqual(banksRes.body.success, true);
        assert.ok(Array.isArray(banksRes.body.data));
        assert.ok(banksRes.body.data.length >= 5);
        assert.ok(banksRes.body.summary.totalLiquidBalance > 0);

        const bdoAccount = banksRes.body.data.find(b => b.id === 'ba-bdo-01' || (b.bank_name && b.bank_name.includes('BDO')));
        assert.ok(bdoAccount, 'BDO bank account must exist');
        const initialBdoBalance = parseFloat(bdoAccount.current_balance);

        // 2. Cheque payable with overdraft warning test
        const hugeAmount = initialBdoBalance + 1000000; // exceeding balance
        const overdrawnReqRes = await request(app)
            .post('/api/cheque-payables')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                payee_name: 'Overdraft Supplier Corp.',
                amount: hugeAmount,
                cheque_date: '2026-10-15',
                bank_name: 'BDO Unibank',
                category: 'Raw Materials',
                purpose: 'Emergency bulk stock acquisition'
            });
        assert.strictEqual(overdrawnReqRes.status, 201);
        assert.strictEqual(overdrawnReqRes.body.success, true);
        assert.strictEqual(overdrawnReqRes.body.data.is_overdrawn_warning, true);
        assert.strictEqual(overdrawnReqRes.body.data.bank_account_id, bdoAccount.id);

        const overdrawnId = overdrawnReqRes.body.data.id;

        // 3. Normal Cheque payable creation with PDC check & clearing test
        const chequeAmt = 25000;
        const reqRes = await request(app)
            .post('/api/cheque-payables')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                payee_name: 'Pacific Chemical Logistics Inc.',
                amount: chequeAmt,
                cheque_date: '2026-09-26', // near-term PDC
                bank_name: 'BDO Unibank',
                category: 'Logistics & Freight Delivery',
                purpose: 'Freight and port clearance for imported silicone oils'
            });
        assert.strictEqual(reqRes.status, 201);
        const payable = reqRes.body.data;
        assert.strictEqual(payable.is_overdrawn_warning, false);

        // Verify PDC list calculations
        const listRes = await request(app)
            .get('/api/cheque-payables')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(listRes.status, 200);
        const foundPayable = listRes.body.data.find(p => p.id === payable.id);
        assert.ok(foundPayable);
        assert.ok(foundPayable.maturity_status !== undefined);

        // 4. COO confirms the cheque
        const cooRes = await request(app)
            .post(`/api/v1/payables/${payable.id}/confirm`)
            .set('x-api-key', COO_KEY)
            .send({
                action: 'CONFIRMED',
                confirmed_by: 'COO Mobile Portal',
                notes: 'Approved via executive mobile view'
            });
        assert.strictEqual(cooRes.status, 200);
        assert.strictEqual(cooRes.body.data.status, 'CONFIRMED');

        // 5. Accounting marks the cheque as CLEARED -> Debits bank balance
        const clearRes = await request(app)
            .post(`/api/cheque-payables/${payable.id}/clear`)
            .set('Authorization', `Bearer ${acctToken}`)
            .send({ notes: 'Cleared at BDO bank branch' });
        assert.strictEqual(clearRes.status, 200);
        assert.strictEqual(clearRes.body.success, true);
        assert.strictEqual(clearRes.body.data.status, 'CLEARED');
        assert.ok(clearRes.body.data.cleared_at);

        // Verify bank balance debited
        const updatedBdo = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = ?').get(bdoAccount.id);
        assert.strictEqual(parseFloat(updatedBdo.current_balance), initialBdoBalance - chequeAmt);

        // 6. Client submits payment proof for an invoice
        let invoice = db.prepare("SELECT * FROM sales_invoices WHERE client_id = ? AND status != 'PAID' LIMIT 1").get(demoClient.id);
        if (!invoice) {
            invoice = db.prepare("SELECT * FROM sales_invoices WHERE client_id = ? LIMIT 1").get(demoClient.id);
            if (invoice) {
                db.prepare("UPDATE sales_invoices SET status = 'UNPAID', balance_due = 50000 WHERE id = ?").run(invoice.id);
                invoice = db.prepare("SELECT * FROM sales_invoices WHERE id = ?").get(invoice.id);
            }
        }
        if (invoice) {
            const submitRes = await request(app)
                .post('/api/payments/client-submit')
                .set('Authorization', `Bearer ${clientToken}`)
                .send({
                    invoice_id: invoice.id,
                    amount: 15000,
                    payment_date: '2026-09-25',
                    payment_method: 'CHECK',
                    check_number: 'CHK-991204',
                    bank_name: 'BDO Unibank',
                    reference_number: 'BDO-REF-4821',
                    client_notes: 'Cheque issued for partial billing'
                });
            assert.strictEqual(submitRes.status, 201);
            assert.strictEqual(submitRes.body.success, true);
            const submission = submitRes.body.data;
            assert.strictEqual(submission.status, 'PENDING_REVIEW');

            // Admin / Accountant reviews and approves payment submission
            const reviewRes = await request(app)
                .post(`/api/payments/client-submissions/${submission.id}/review`)
                .set('Authorization', `Bearer ${acctToken}`)
                .send({
                    action: 'APPROVE',
                    reviewer_notes: 'Payment verified with bank online credit'
                });
            assert.strictEqual(reviewRes.status, 200);
            assert.strictEqual(reviewRes.body.success, true);
            assert.strictEqual(reviewRes.body.data.submission.status, 'APPROVED');
            assert.ok(reviewRes.body.data.payment_id);

            // 7. Verify Official Receipt (OR) endpoint
            const orRes = await request(app)
                .get(`/api/payments/${reviewRes.body.data.payment_id}`)
                .set('Authorization', `Bearer ${acctToken}`);
            assert.strictEqual(orRes.status, 200);
            assert.strictEqual(orRes.body.success, true);
            assert.ok(orRes.body.data.amount_in_words, 'Receipt must have amount in words');
            assert.ok(orRes.body.data.client_name, 'Receipt must have client name');
        }

        // Clean up test payables
        db.prepare('DELETE FROM cheque_payables WHERE id IN (?, ?)').run(overdrawnId, payable.id);
    });

    test('35. Streamlined Payable Request Form: Company Management, 21 Expense Categories, Bank Defaults, Line Items & Editing Lifecycle', async () => {
        const acctToken = getAuthToken('ACCOUNTING');

        // 1. Companies endpoint
        const compRes = await request(app)
            .get('/api/cheque-payables/companies')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(compRes.status, 200);
        assert.strictEqual(compRes.body.success, true);
        assert.ok(Array.isArray(compRes.body.data));
        assert.ok(compRes.body.data.includes('NKB Manufacturing Corporation'));
        assert.ok(compRes.body.data.includes('NKB Cosmetics Manufacturing'));
        assert.ok(compRes.body.data.includes('Vyuceutical OPC'));
        assert.ok(compRes.body.data.includes('New Yra Enterprises'));

        // 2. Add dynamic company
        const addCompRes = await request(app)
            .post('/api/cheque-payables/companies')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({ name: 'Alpha Bio Labs Philippines' });
        assert.strictEqual(addCompRes.status, 201);
        assert.strictEqual(addCompRes.body.success, true);
        assert.strictEqual(addCompRes.body.data.name, 'Alpha Bio Labs Philippines');

        // 3. Meta endpoint contains 23 categories and 7 designated banks and 3 payable_categories
        const metaRes = await request(app)
            .get('/api/cheque-payables/meta')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(metaRes.status, 200);
        assert.strictEqual(metaRes.body.categories.length, 23);
        assert.ok(metaRes.body.categories.includes('Office Encashment'));
        assert.ok(metaRes.body.categories.includes('Credit Card'));
        assert.ok(metaRes.body.categories.includes('Contribution - SSS'));
        assert.ok(metaRes.body.categories.includes('Contribution - PhilHealth'));
        assert.ok(metaRes.body.categories.includes('Contribution - Pag-ibig'));
        assert.ok(metaRes.body.categories.includes('BIR Tax Payment'));
        assert.ok(metaRes.body.categories.includes('City Hall Tax Payment'));
        assert.ok(metaRes.body.categories.includes('City Hall Expenses'));
        assert.ok(metaRes.body.banks.length >= 7);
        assert.deepStrictEqual(metaRes.body.payable_categories, ['Trade Payable', 'Personal Expenses', 'Accrued Expenses']);

        // 3b. Add dynamic expense category
        const addCatRes = await request(app)
            .post('/api/cheque-payables/categories')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({ name: 'Equipment Maintenance' });
        assert.strictEqual(addCatRes.status, 201);
        assert.strictEqual(addCatRes.body.success, true);
        assert.strictEqual(addCatRes.body.data.name, 'Equipment Maintenance');

        // Verify dynamic category is returned in /meta
        const metaUpdatedRes = await request(app)
            .get('/api/cheque-payables/meta')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.ok(metaUpdatedRes.body.categories.includes('Equipment Maintenance'));

        // 4. Create payable request matching reference image fields with editable date_created
        const createRes = await request(app)
            .post('/api/cheque-payables')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                company_name: 'NKB Cosmetics Manufacturing',
                vendor: 'MARK JOSEPH Q. REALUYO',
                invoice_number: '239683',
                invoice_date: '2026-09-25',
                date_created: '2026-08-15',
                control_number: '1993',
                terms: 'Net 30',
                due_date: '2026-10-25',
                payable_category: 'Personal Expenses',
                description: 'RAW MATERIALS',
                bank_name: 'BDO: NKB Cosmetics Manufacturing - 0105-4800-4829',
                bank_account_number: '0105-4800-4829',
                line_items: [
                    { description: 'PERFUME BOTTLES', category: 'Petty Cash', quantity: 1, cost: 54000, subtotal: 54000 }
                ],
                comments: 'NKB COSMETICS MANUFACTURING CHECK DETAILS'
            });
        assert.strictEqual(createRes.status, 201);
        assert.strictEqual(createRes.body.success, true);
        const payableId = createRes.body.data.id;
        assert.strictEqual(parseFloat(createRes.body.data.amount), 54000);
        assert.strictEqual(createRes.body.data.company_name, 'NKB Cosmetics Manufacturing');
        assert.strictEqual(createRes.body.data.invoice_number, '239683');
        assert.strictEqual(createRes.body.data.control_number, '1993');
        assert.strictEqual(createRes.body.data.payable_category, 'Personal Expenses');
        assert.ok(createRes.body.data.created_at.startsWith('2026-08-15'));

        // 5. Update / Edit payable request (Editing Payable mode with editable date_created)
        const updateRes = await request(app)
            .put(`/api/cheque-payables/${payableId}`)
            .set('Authorization', `Bearer ${acctToken}`)
            .send({
                date_created: '2026-08-20',
                payable_category: 'Accrued Expenses',
                line_items: [
                    { description: 'PERFUME BOTTLES 50ML', category: 'Raw Materials', quantity: 2, cost: 30000, subtotal: 60000 }
                ],
                comments: 'Updated check particulars with batch code'
            });
        assert.strictEqual(updateRes.status, 200);
        assert.strictEqual(updateRes.body.success, true);
        assert.strictEqual(parseFloat(updateRes.body.data.amount), 60000);
        assert.strictEqual(updateRes.body.data.payable_category, 'Accrued Expenses');
        assert.ok(updateRes.body.data.created_at.startsWith('2026-08-20'));
        assert.strictEqual(updateRes.body.data.comments, 'Updated check particulars with batch code');

        // Clean up
        db.prepare('DELETE FROM cheque_payables WHERE id = ?').run(payableId);
    });

    test('36. Automated WhatsApp / SMS Milestone Notice on DR Dispatch & Click-to-Chat Scheme', async () => {
        // 1. Create a PO
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                tolerance_percent: 10.0,
                billing_policy: 'ACTUAL_DELIVERY',
                items: [{ product_id: lotionProduct.id, target_quantity: 500, unit_price: 120.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const po = poRes.body.data;

        // 2. Approve PO
        await request(app).post(`/api/orders/${po.id}/approve`).set('Authorization', `Bearer ${adminToken}`);

        // 3. Create Job Order and Batch
        const joRes = await request(app)
            .post('/api/job-orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ po_id: po.id, product_id: lotionProduct.id, target_quantity: 500 });
        assert.strictEqual(joRes.status, 201);
        const jo = joRes.body.data;

        const batchRes = await request(app)
            .post('/api/production/batches')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jo_id: jo.id, target_quantity: 500 });
        assert.strictEqual(batchRes.status, 201);
        const batch = batchRes.body.data;

        // 4. Record Yield
        const yieldRes = await request(app)
            .post(`/api/production/batches/${batch.id}/yield`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ actual_yield: 500, qc_notes: 'All 500 units passed QC release testing' });
        assert.strictEqual(yieldRes.status, 200);

        // 5. Create Delivery Receipt (DR) -> Automated dispatch alert triggered!
        const drRes = await request(app)
            .post('/api/deliveries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                po_id: po.id,
                driver_name: 'Kuya Eddie Ramos',
                vehicle_plate: 'NBC-2026',
                notes: 'Handle with extra care - fragranced lotion bottles',
                items: [{ product_id: lotionProduct.id, batch_id: batch.id, delivered_quantity: 500, unit_price: 120.0 }]
            });
        assert.strictEqual(drRes.status, 201);
        assert.strictEqual(drRes.body.success, true);
        const dr = drRes.body.data;
        assert.ok(dr.id);

        // Verify dispatchAlert returned in creation response
        const dispatchAlert = drRes.body.dispatchAlert;
        assert.ok(dispatchAlert);
        assert.strictEqual(dispatchAlert.recipientPhone, '639171234567');
        assert.ok(dispatchAlert.whatsappUrl.includes('https://api.whatsapp.com/send?phone=639171234567'));
        assert.ok(dispatchAlert.smsUrl.includes('sms:639171234567'));
        assert.ok(dispatchAlert.message.includes('NKB MANUFACTURING'));
        assert.ok(dispatchAlert.message.includes(dr.dr_number));
        assert.ok(dispatchAlert.message.includes('Kuya Eddie Ramos'));
        assert.ok(dispatchAlert.message.includes('NBC-2026'));

        // 6. Test GET /api/deliveries/:id/dispatch-alert
        const alertRes = await request(app)
            .get(`/api/deliveries/${dr.id}/dispatch-alert`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(alertRes.status, 200);
        assert.strictEqual(alertRes.body.success, true);
        const alertData = alertRes.body.data;
        assert.strictEqual(alertData.drId, dr.id);
        assert.strictEqual(alertData.drNumber, dr.dr_number);
        assert.strictEqual(alertData.poNumber, po.po_number);
        assert.strictEqual(alertData.recipientPhone, '639171234567');
        assert.ok(alertData.whatsappUrl.startsWith('https://api.whatsapp.com/send?phone=639171234567'));
        assert.ok(alertData.smsUrl.startsWith('sms:639171234567'));
        assert.ok(Array.isArray(alertData.history));
        assert.ok(alertData.history.length >= 1);
        assert.strictEqual(alertData.history[0].channel, 'ALL');

        // 7. Test POST /api/deliveries/:id/send-dispatch-alert (Manual Resend / Trigger)
        const sendRes = await request(app)
            .post(`/api/deliveries/${dr.id}/send-dispatch-alert`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ channel: 'WHATSAPP' });
        assert.strictEqual(sendRes.status, 200);
        assert.strictEqual(sendRes.body.success, true);
        assert.strictEqual(sendRes.body.data.drId, dr.id);
        assert.strictEqual(sendRes.body.data.channel, 'WHATSAPP');

        // 8. Test GET /api/deliveries/:id/dispatch-notifications (History)
        const notifRes = await request(app)
            .get(`/api/deliveries/${dr.id}/dispatch-notifications`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(notifRes.status, 200);
        assert.strictEqual(notifRes.body.success, true);
        assert.ok(Array.isArray(notifRes.body.data));
        assert.strictEqual(notifRes.body.data.length, 2); // Initial automated + 1 manual resend

        // 9. Client isolation on dispatch alert
        const otherClientAlertRes = await request(app)
            .get(`/api/deliveries/${dr.id}/dispatch-alert`)
            .set('Authorization', `Bearer ${otherClientToken}`);
        assert.strictEqual(otherClientAlertRes.status, 403);
    });

    test('37. AFK Sleep Timer & Workstation PIN Security Verification', async () => {
        // 1. Initial auth state check - check hasPin and default autoLockMinutes
        const meRes1 = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(meRes1.status, 200);
        assert.strictEqual(typeof meRes1.body.data.hasPin, 'boolean');
        assert.ok(typeof meRes1.body.data.autoLockMinutes === 'number' || meRes1.body.data.autoLockMinutes === null);

        // 2. Reject invalid PIN configurations (letters, too short, too long)
        const badPin1 = await request(app)
            .post('/api/auth/set-pin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ pin: 'abc' });
        assert.strictEqual(badPin1.status, 400);

        const badPin2 = await request(app)
            .post('/api/auth/set-pin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ pin: '12' });
        assert.strictEqual(badPin2.status, 400);

        // 3. Set valid 4-digit PIN and customized auto_lock_minutes
        const setPinRes = await request(app)
            .post('/api/auth/set-pin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ pin: '2026', auto_lock_minutes: 10 });
        assert.strictEqual(setPinRes.status, 200);
        assert.strictEqual(setPinRes.body.success, true);
        assert.strictEqual(setPinRes.body.autoLockMinutes, 10);
        assert.strictEqual(setPinRes.body.hasPin, true);

        // 4. Verify auth profile reflects hasPin=true and updated minutes
        const meRes2 = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(meRes2.status, 200);
        assert.strictEqual(meRes2.body.data.hasPin, true);
        assert.strictEqual(meRes2.body.data.autoLockMinutes, 10);

        // 5. Test PIN verification endpoint: wrong PIN rejected
        const verifyWrong = await request(app)
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ pin: '9999' });
        assert.strictEqual(verifyWrong.status, 401);
        assert.strictEqual(verifyWrong.body.success, false);

        // 6. Test PIN verification endpoint: correct PIN succeeds
        const verifyCorrect = await request(app)
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ pin: '2026' });
        assert.strictEqual(verifyCorrect.status, 200);
        assert.strictEqual(verifyCorrect.body.success, true);

        // 7. Test Password fallback verification: incorrect password fails
        const verifyWrongPwd = await request(app)
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ password: 'WrongPassword999!' });
        assert.strictEqual(verifyWrongPwd.status, 401);
        assert.strictEqual(verifyWrongPwd.body.success, false);

        // 8. Test Password fallback verification: correct password unlocks session
        const verifyCorrectPwd = await request(app)
            .post('/api/auth/verify-pin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ password: 'Admin123!' });
        assert.strictEqual(verifyCorrectPwd.status, 200);
        assert.strictEqual(verifyCorrectPwd.body.success, true);
    });

    test('38. Formulation Management System (FMS API) Live Integration, Compounding Codes, Versioning & Verified Suppliers Test', async () => {
        // 1. Role-check: Client is forbidden from syncing or viewing FMS status
        const clientSync = await request(app)
            .post('/api/formulations/sync-fms')
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientSync.status, 403, 'Client must be forbidden from syncing FMS formulations');

        const clientStatus = await request(app)
            .get('/api/formulations/fms-status')
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(clientStatus.status, 403, 'Client must be forbidden from checking FMS status');

        // 2. Admin checks FMS Status endpoint
        const fmsStatusRes = await request(app)
            .get('/api/formulations/fms-status')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(fmsStatusRes.status, 200);
        assert.strictEqual(fmsStatusRes.body.success, true);
        assert.ok(fmsStatusRes.body.data.total_approved_fms_formulas >= 50, 'FMS must report authentic approved formulas');
        assert.strictEqual(fmsStatusRes.body.data.connection_status, 'ACTIVE_CONNECTED');

        // 3. Admin triggers sync from FMS API
        const fmsSyncRes = await request(app)
            .post('/api/formulations/sync-fms')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(fmsSyncRes.status, 200);
        assert.strictEqual(fmsSyncRes.body.success, true);
        assert.ok(fmsSyncRes.body.data.syncedFormulas >= 50, 'Must synchronize at least 50 authentic approved formulas');

        // 4. Verify authentic compounding codes and versions in DB
        const fmsRows = db.prepare(`
            SELECT pf.*, fi.supplier, fi.material_name 
            FROM product_formulations pf
            JOIN formulation_ingredients fi ON fi.formulation_id = pf.id
            WHERE pf.compounding_code IS NOT NULL
        `).all();
        assert.ok(fmsRows.length > 0, 'Database must contain authentic compounding codes');

        // Verify specific authentic FMS Compounding Code exists (e.g., CP-0308 or CP-0581)
        const cp0308 = db.prepare("SELECT * FROM product_formulations WHERE compounding_code = 'CP-0308'").get();
        assert.ok(cp0308, 'Compounding Code CP-0308 (SKEENCARE OXYGENATED SUNBLOCK CREAM) must exist');
        assert.strictEqual(cp0308.version_status, 'APPROVED');

        // Verify verified supplier exists in formulation_ingredients
        const suppliers = db.prepare("SELECT DISTINCT supplier FROM formulation_ingredients WHERE supplier IS NOT NULL").all().map(s => s.supplier);
        assert.ok(suppliers.length > 0, 'Must have authentic chemical suppliers');
        const hasVerifiedSupplier = suppliers.some(s => ['CHEMICO', 'QUAD', 'HACHIMORI', 'LOGERCE', 'TRANSWORLD', 'REDOLENCE', 'MAYNILAD', 'CHEMREZ', 'LOYAL FAMILY'].includes(s));
        assert.ok(hasVerifiedSupplier, 'Must contain authentic chemical supplier');
    });

    test('39. Factory Daily Production Batches, Date Filtering & 1-Click Sales Order Shortcut Test', async () => {
        // 0. Ensure daily production records are seeded in test db
        const { seedDailyProductionRecords } = require('../scripts/seed-daily-production-records');
        seedDailyProductionRecords(db);

        // 1. Query batches filtered by Production Date (2026-09-26)
        const dateRes = await request(app)
            .get('/api/production/batches?productionDate=2026-09-26')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(dateRes.status, 200);
        assert.strictEqual(dateRes.body.success, true);
        assert.ok(Array.isArray(dateRes.body.data));
        assert.ok(dateRes.body.data.length >= 4, 'Must return multiple batches produced on 2026-09-26');
        assert.ok(dateRes.body.data.every(b => b.production_date === '2026-09-26'), 'All returned batches must match production date 2026-09-26');

        // 2. Verify authentic factory transaction records in DB
        // SKEEN CARE Order (ref: 0004)
        const skeencarePO = db.prepare("SELECT * FROM purchase_orders WHERE notes LIKE '%0004%'").get();
        assert.ok(skeencarePO, 'SKEEN CARE PO (Ref 0004) must exist in transaction records');
        assert.strictEqual(skeencarePO.status, 'COMPLETED', 'SKEEN CARE PO must be COMPLETED (Closed P.O.)');
        assert.ok(skeencarePO.po_number.startsWith('PO-2026-'), 'Must use sequential system PO numbering');
        assert.ok(skeencarePO.so_number.startsWith('SO-2026-'), 'Must use sequential system SO numbering');

        // SKEEN CARE Batches: 600 (Sep 24), 840 (Sep 25), 1560 (Sep 26) = 3000 Total
        const scBatches = db.prepare(`
            SELECT pb.* FROM production_batches pb
            JOIN job_orders jo ON pb.jo_id = jo.id
            WHERE jo.po_id = ? ORDER BY pb.production_date ASC
        `).all(skeencarePO.id);
        assert.strictEqual(scBatches.length, 3, 'SKEEN CARE must have exactly 3 daily production batches');
        const scTotalYield = scBatches.reduce((sum, b) => sum + b.actual_yield, 0);
        assert.strictEqual(scTotalYield, 3000, 'SKEEN CARE total yield must equal exactly 3,000 KG');

        // HER CHOICE Order 1 (ref: HCI_063_2026)
        const hcPO1 = db.prepare("SELECT * FROM purchase_orders WHERE notes LIKE '%HCI_063_2026%'").get();
        assert.ok(hcPO1, 'HER CHOICE PO (Ref HCI_063_2026) must exist in transaction records');
        assert.strictEqual(hcPO1.status, 'IN_PRODUCTION');

        // Verify Instant Whitening Lotion has 8 daily batches
        const lotionBatches = db.prepare(`
            SELECT pb.* FROM production_batches pb
            JOIN job_orders jo ON pb.jo_id = jo.id
            JOIN products p ON pb.product_id = p.id
            WHERE jo.po_id = ? AND p.name LIKE '%WHITENING LOTION%'
        `).all(hcPO1.id);
        assert.strictEqual(lotionBatches.length, 8, 'Instant Whitening Lotion must have 8 daily batches');
        const lotionYield = lotionBatches.reduce((sum, b) => sum + b.actual_yield, 0);
        assert.strictEqual(lotionYield, 22747, 'Whitening Lotion cumulative yield must be 22,747 pcs');

        // HER CHOICE Order 2 (ref: HCI_065_2026)
        const hcPO2 = db.prepare("SELECT * FROM purchase_orders WHERE notes LIKE '%HCI_065_2026%'").get();
        assert.ok(hcPO2, 'HER CHOICE PO (Ref HCI_065_2026) must exist in transaction records');

        // 3. Verify HTML and JS templates contain the 1-click shortcut and date filter
        const adminHtml = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
        assert.ok(adminHtml.includes('id="filter-batch-date"'), 'admin.html must contain filter-batch-date');
        assert.ok(adminHtml.includes('setBatchDateFilter'), 'admin.html must contain setBatchDateFilter shortcut');

        const adminJs = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');
        assert.ok(adminJs.includes('title=SALES%20ORDER'), 'admin.js must include 1-click Sales Order shortcut URL');
        assert.ok(adminJs.includes('filterBatches'), 'admin.js must implement filterBatches function');
    });

    test('40. IT Management & Master Records Editor: PO Client Reassignment (PO-2026-000021 to GEMS), Universal Table Inspector & Data Override API', async () => {
        // 1. Verify PO-2026-000021 exists and is assigned to GEMS Incorporated
        const gemsClient = db.prepare("SELECT * FROM clients WHERE company_name LIKE '%GEMS%' LIMIT 1").get();
        assert.ok(gemsClient, 'GEMS Incorporated client must exist in the database');
        assert.strictEqual(gemsClient.id, '885fdb11-8fb8-4f37-8a45-94f9053caf6f');

        const po21 = db.prepare("SELECT * FROM purchase_orders WHERE po_number = 'PO-2026-000021'").get();
        assert.ok(po21, 'PO-2026-000021 must exist in the database');
        assert.strictEqual(po21.client_id, gemsClient.id, 'PO-2026-000021 client_id must equal GEMS Incorporated id');

        // 2. Test IT Management metadata endpoint (/api/it-management/tables)
        const tablesRes = await request(app)
            .get('/api/it-management/tables')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(tablesRes.status, 200);
        assert.strictEqual(tablesRes.body.success, true);
        const tableKeys = tablesRes.body.data.map(t => t.tableName);
        assert.ok(tableKeys.includes('purchase_orders'), 'IT Management must include purchase_orders');
        assert.ok(tableKeys.includes('delivery_receipts'), 'IT Management must include delivery_receipts');
        assert.ok(tableKeys.includes('clients'), 'IT Management must include clients');
        assert.ok(tableKeys.includes('products'), 'IT Management must include products');

        // 3. Test IT Management lookups endpoint (/api/it-management/lookups)
        const lookupsRes = await request(app)
            .get('/api/it-management/lookups')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(lookupsRes.status, 200);
        assert.strictEqual(lookupsRes.body.success, true);
        assert.ok(lookupsRes.body.data.clients.length > 0);
        assert.ok(lookupsRes.body.data.statuses.purchase_orders.includes('APPROVED'));

        // 4. Test IT Management records listing with pagination
        const recordsRes = await request(app)
            .get('/api/it-management/records/purchase_orders?search=PO-2026-000021')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(recordsRes.status, 200);
        assert.strictEqual(recordsRes.body.success, true);
        assert.ok(recordsRes.body.data.length >= 1);
        const foundPo = recordsRes.body.data.find(p => p.po_number === 'PO-2026-000021');
        assert.ok(foundPo, 'PO-2026-000021 must be found in IT Management records');
        assert.strictEqual(foundPo.client_company_name, 'GEMS Incorporated');

        // 5. Test Quick PO Client Reassignment endpoint
        const reassignRes = await request(app)
            .post('/api/it-management/quick-actions/reassign-po-client')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                poNumber: 'PO-2026-000021',
                newClientId: gemsClient.id,
                cascade: true
            });
        assert.strictEqual(reassignRes.status, 200);
        assert.strictEqual(reassignRes.body.success, true);
        assert.strictEqual(reassignRes.body.data.newClientId, gemsClient.id);

        // 6. Test Universal Record Edit API (PUT /api/it-management/records/:table/:id)
        const updateRes = await request(app)
            .put(`/api/it-management/records/purchase_orders/${po21.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                notes: 'PDRN approved formula: 060226-00-00 [Verified by IT Management]'
            });
        assert.strictEqual(updateRes.status, 200);
        assert.strictEqual(updateRes.body.success, true);
        assert.ok(updateRes.body.data.notes.includes('[Verified by IT Management]'));

        // 7. Test Quick Status Override endpoint
        const overrideRes = await request(app)
            .post('/api/it-management/quick-actions/override-status')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                table: 'purchase_orders',
                id: po21.id,
                newStatus: 'APPROVED',
                reason: 'Workflow state confirmation'
            });
        assert.strictEqual(overrideRes.status, 200);
        assert.strictEqual(overrideRes.body.success, true);

        // 8. Test RBAC protection: non-admins must be rejected with 403
        const forbiddenRes = await request(app)
            .get('/api/it-management/records/purchase_orders')
            .set('Authorization', `Bearer ${clientToken}`);
        assert.strictEqual(forbiddenRes.status, 403, 'Client role must be blocked from IT Management with 403');

        // 9. Verify UI templates have IT Management tab and modal
        const adminHtml = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
        assert.ok(adminHtml.includes('id="tab-btn-it-management"'), 'admin.html must contain tab-btn-it-management');
        assert.ok(adminHtml.includes('id="view-it-management"'), 'admin.html must contain view-it-management');
        assert.ok(adminHtml.includes('id="modal-it-edit-record"'), 'admin.html must contain modal-it-edit-record');

        const adminJs = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');
        assert.ok(adminJs.includes('loadITManagement'), 'admin.js must implement loadITManagement');
        assert.ok(adminJs.includes('openITEditModal'), 'admin.js must implement openITEditModal');
        assert.ok(adminJs.includes('executeQuickPOReassignment'), 'admin.js must implement executeQuickPOReassignment');

        // 10. IT Management API Key Security & Masking
        assert.ok(tableKeys.includes('api_keys'), 'IT Management tables must include api_keys');
        const apiKeysRes = await request(app)
            .get('/api/it-management/records/api_keys')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(apiKeysRes.status, 200);
        assert.strictEqual(apiKeysRes.body.success, true);
        if (apiKeysRes.body.data && apiKeysRes.body.data.length > 0) {
            for (const keyRow of apiKeysRes.body.data) {
                assert.ok(!keyRow.key_token || keyRow.key_token.includes('••••'), 'Key token must be masked');
                assert.ok(!keyRow.key_prefix || keyRow.key_prefix.includes('••••'), 'Key prefix must be masked');
                assert.ok(!keyRow.key_hash || keyRow.key_hash.includes('••••'), 'Key hash must be masked');
            }
        }

        // Verify cheque_payables masks api_key_used
        const payablesRecordsRes = await request(app)
            .get('/api/it-management/records/cheque_payables')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(payablesRecordsRes.status, 200);
        if (payablesRecordsRes.body.data && payablesRecordsRes.body.data.length > 0) {
            for (const pRow of payablesRecordsRes.body.data) {
                if (pRow.api_key_used) {
                    assert.ok(pRow.api_key_used.includes('••••'), 'Payables api_key_used must be masked in IT management');
                }
            }
        }

        // Verify UI files mask API keys
        assert.ok(adminHtml.includes('••••••••••••••••'), 'admin.html must contain masked API keys');
        assert.ok(adminJs.includes('toggleApiKeyVisibility'), 'admin.js must implement toggleApiKeyVisibility');
        assert.ok(adminJs.includes('toggleHeaderApiKey'), 'admin.js must implement toggleHeaderApiKey');
    });

    test('41. Role-Based Navigation Restrictions, Production Supervisor Interactive Dashboard & Warehouse Raw Materials Inventory', async () => {
        const prodToken = getAuthToken('PRODUCTION');
        const invToken = getAuthToken('INVENTORY');
        const acctToken = getAuthToken('ACCOUNTING');
        const purchToken = getAuthToken('PURCHASING');
        const qcToken = getAuthToken('QC');

        // 1. Verify UI HTML & JS contain all role-based sidebar groups, Production Supervisor Dashboard, and Raw Materials Inventory
        const adminHtml = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
        assert.ok(adminHtml.includes('id="sidebar-group-lab"'), 'admin.html must have sidebar-group-lab');
        assert.ok(adminHtml.includes('id="sidebar-group-management"'), 'admin.html must have sidebar-group-management');
        assert.ok(adminHtml.includes('id="sidebar-group-finance"'), 'admin.html must have sidebar-group-finance');
        assert.ok(adminHtml.includes('id="production-supervisor-dashboard"'), 'admin.html must have production-supervisor-dashboard');
        assert.ok(adminHtml.includes('id="prod-kpi-total-pos"'), 'admin.html must have prod-kpi-total-pos');
        assert.ok(adminHtml.includes('id="prod-kpi-active-batches"'), 'admin.html must have prod-kpi-active-batches');
        assert.ok(adminHtml.includes('id="prod-kpi-active-today"'), 'admin.html must have prod-kpi-active-today');
        assert.ok(adminHtml.includes('id="prod-kpi-ongoing-deliveries"'), 'admin.html must have prod-kpi-ongoing-deliveries');
        assert.ok(adminHtml.includes('id="view-raw-materials"'), 'admin.html must have view-raw-materials');
        assert.ok(adminHtml.includes('id="tab-btn-raw-materials"'), 'admin.html must have tab-btn-raw-materials');

        const adminJs = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');
        assert.ok(adminJs.includes('isSuperOrExecutive'), 'admin.js must enforce Lab & Formulations and Management restriction to Super Admin & Executives');
        assert.ok(adminJs.includes('loadProductionSupervisorDashboard'), 'admin.js must implement loadProductionSupervisorDashboard');
        assert.ok(adminJs.includes('updateOrderProductionSchedule'), 'admin.js must implement updateOrderProductionSchedule');
        assert.ok(adminJs.includes('loadRawMaterials'), 'admin.js must implement loadRawMaterials');
        const acctRoleBlock = adminJs.substring(adminJs.indexOf("role === 'ACCOUNTING'"), adminJs.indexOf("role === 'CEO'"));
        assert.ok(acctRoleBlock.includes("showTab('clients')"), 'Senior Accountant must have Clients tab visible');
        assert.ok(acctRoleBlock.includes("showTab('products')"), 'Senior Accountant must have Cosmetic Products tab visible');

        // 2. Test Production Supervisor Interactive Sales Order Priority, Reminder Auto-Prioritizing & "Active Today in Factory" API
        const samplePo = db.prepare("SELECT id, po_number FROM purchase_orders WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'VOIDED') LIMIT 1").get();
        assert.ok(samplePo, 'Sample PO must exist for Production Supervisor priority testing');

        // First set to NORMAL and not active today
        await request(app)
            .put(`/api/orders/${samplePo.id}/production-priority`)
            .set('Authorization', `Bearer ${prodToken}`)
            .send({
                priority_status: 'NORMAL',
                is_active_today: 0,
                clear_reminder: true
            });

        // Now set a due reminder with automatic prioritizing to RUSH + Active Today
        const prioRes = await request(app)
            .put(`/api/orders/${samplePo.id}/production-priority`)
            .set('Authorization', `Bearer ${prodToken}`)
            .send({
                reminder_at: '2026-01-01T08:00',
                auto_priority_target: 'RUSH',
                auto_active_today: 1,
                reminder_note: 'Must finish compounding today before 4 PM dispatch',
                production_notes: 'Assigned to Line 1 compounding today'
            });
        assert.strictEqual(prioRes.status, 200);
        assert.strictEqual(prioRes.body.success, true);
        assert.strictEqual(prioRes.body.data.priority_status, 'RUSH', 'Reminder due timestamp must automatically escalate priority_status to RUSH');
        assert.strictEqual(Number(prioRes.body.data.is_active_today), 1, 'Reminder due timestamp must automatically set is_active_today = 1');
        assert.strictEqual(Number(prioRes.body.data.reminder_triggered), 1, 'Reminder must be marked as triggered');
        assert.strictEqual(prioRes.body.data.reminder_note, 'Must finish compounding today before 4 PM dispatch');

        // Verify /api/orders/supervisor-reminders returns due reminders and workload advisory
        const supRemRes = await request(app)
            .get('/api/orders/supervisor-reminders')
            .set('Authorization', `Bearer ${prodToken}`);
        assert.strictEqual(supRemRes.status, 200);
        assert.strictEqual(supRemRes.body.success, true);
        assert.ok(supRemRes.body.data.dueTodayOrTriggered.some(o => o.id === samplePo.id), 'Supervisor reminders endpoint must list due SO');
        assert.ok(supRemRes.body.data.advisoryMessage.includes('need to be done today'), 'Supervisor advisory message must notify that SO needs to be done today');

        // Verify Bell Notification Agent (/api/notifications/pending) alerts the Production Supervisor
        const notifRes = await request(app)
            .get('/api/notifications/pending')
            .set('Authorization', `Bearer ${prodToken}`);
        assert.strictEqual(notifRes.status, 200);
        assert.ok(notifRes.body.items.some(i => i.category === 'PRODUCTION_REMINDER' && i.id === `so-rem-${samplePo.id}`), 'Bell Notification Agent must notify supervisor of due SO reminder');

        // Verify Overview KPI returns totalPOs and activeTodayPOs
        const kpiRes = await request(app)
            .get('/api/reports/overview')
            .set('Authorization', `Bearer ${prodToken}`);
        assert.strictEqual(kpiRes.status, 200);
        assert.ok(kpiRes.body.data.totalPOs >= 1, 'Overview API must return totalPOs');
        assert.ok(kpiRes.body.data.activeTodayPOs >= 1, 'Overview API must return activeTodayPOs');

        // Verify Accounting role is blocked from changing factory floor priority
        const acctBlockPrio = await request(app)
            .put(`/api/orders/${samplePo.id}/production-priority`)
            .set('Authorization', `Bearer ${acctToken}`)
            .send({ priority_status: 'ON_HOLD' });
        assert.strictEqual(acctBlockPrio.status, 403);

        // 3. Test Inventory Officer Warehouse Raw Materials Inventory API (Color-Coded Status, Fast Moving Tag, Multi-Sort & Exclusive Shortcuts)
        assert.ok(adminHtml.includes('id="rm-sort-select"'), 'admin.html must include raw material sort dropdown');
        assert.ok(adminHtml.includes('id="rm-inventory-shortcuts-bar"'), 'admin.html must include exclusive Inventory shortcut bar');
        assert.ok(adminJs.includes('isInventoryOfficerAccount'), 'admin.js must enforce exclusive Inventory Officer shortcut check');
        assert.ok(adminJs.includes('handleInventoryKeyboardNavigation'), 'admin.js must implement ArrowUp/ArrowDown and R/I/F shortcut handler');

        const listRmRes = await request(app)
            .get('/api/raw-materials?sort=PRIORITIZED')
            .set('Authorization', `Bearer ${invToken}`);
        assert.strictEqual(listRmRes.status, 200);
        assert.strictEqual(listRmRes.body.success, true);
        assert.strictEqual(listRmRes.body.data.length, 388, 'Must contain all 388 raw materials from Peeling Lotion (14) and Cosmetics (374) Excel sections');
        assert.strictEqual(listRmRes.body.summary.totalMaterials, 388, 'Summary totalMaterials must equal 388');
        assert.deepStrictEqual(listRmRes.body.summary.categories, ['Cosmetics', 'Peeling Lotion'], 'Only Peeling Lotion and Cosmetics sections must be imported');
        assert.ok(!listRmRes.body.data.some(r => r.material_code === 'RM-WTR-01'), 'Old recorded demo inventory must be removed');
        const l001 = listRmRes.body.data.find(r => r.material_code === 'L001' && r.category === 'Peeling Lotion');
        assert.ok(l001, 'Peeling Lotion L001 must be present');
        assert.strictEqual(l001.batch_lot_number, 'None', 'Missing brand/lot in Excel must be None');
        assert.strictEqual(Number(l001.minimum_stock_level), 0, 'Missing min stock level in Excel must be 0');
        assert.ok(listRmRes.body.data.some(r => r.material_code === 'COOO1A' && r.category === 'Cosmetics'), 'Cosmetics COOO1A must be present');
        assert.strictEqual(listRmRes.body.summary.fastMovingCount, 0, 'No items should be pre-tagged as Fast Moving unless tagged by user');

        // Verify ALPHABETICAL_ASC sort
        const alphaAscRes = await request(app)
            .get('/api/raw-materials?sort=ALPHABETICAL_ASC')
            .set('Authorization', `Bearer ${invToken}`);
        assert.strictEqual(alphaAscRes.status, 200);
        assert.ok(
            alphaAscRes.body.data[0].material_name.localeCompare(alphaAscRes.body.data[alphaAscRes.body.data.length - 1].material_name) <= 0,
            'ALPHABETICAL_ASC sort must order materials A -> Z'
        );

        // Verify MOST_CRITICAL sort places critical stock (OUT_OF_STOCK / LOW_STOCK) ahead of IN_STOCK
        const critSortRes = await request(app)
            .get('/api/raw-materials?sort=MOST_CRITICAL')
            .set('Authorization', `Bearer ${invToken}`);
        assert.strictEqual(critSortRes.status, 200);
        assert.ok(
            ['OUT_OF_STOCK', 'LOW_STOCK'].includes(critSortRes.body.data[0].status),
            'MOST_CRITICAL sort must place critical (OUT_OF_STOCK or LOW_STOCK) items first'
        );
        assert.strictEqual(
            critSortRes.body.data[critSortRes.body.data.length - 1].status,
            'IN_STOCK',
            'MOST_CRITICAL sort must place healthy IN_STOCK items last'
        );

        // Create a new raw material as Inventory Officer
        const createRmRes = await request(app)
            .post('/api/raw-materials')
            .set('Authorization', `Bearer ${invToken}`)
            .send({
                material_code: 'RM-TEST-PDRN-99',
                material_name: 'Sodium DNA (Salmon PDRN Extract 99%)',
                category: 'Active Ingredients',
                supplier: 'Korea BioActives Co.',
                current_stock: 15.5,
                unit: 'kg',
                minimum_stock_level: 5.0,
                unit_cost: 9500.0,
                location: 'Cold Room B-05',
                batch_lot_number: 'LOT-PDRN-2026',
                is_fast_moving: 0
            });
        assert.strictEqual(createRmRes.status, 201);
        assert.strictEqual(createRmRes.body.data.status, 'IN_STOCK');
        assert.strictEqual(Number(createRmRes.body.data.is_fast_moving), 0);
        const createdRmId = createRmRes.body.data.id;

        // Toggle Fast Moving tag ON as Inventory Officer
        const toggleFastRes = await request(app)
            .post(`/api/raw-materials/${createdRmId}/toggle-fast-moving`)
            .set('Authorization', `Bearer ${invToken}`)
            .send({});
        assert.strictEqual(toggleFastRes.status, 200);
        assert.strictEqual(Number(toggleFastRes.body.data.is_fast_moving), 1, 'Inventory Officer must be able to tag material as Fast Moving');

        const prioAfterTagRes = await request(app)
            .get('/api/raw-materials?sort=PRIORITIZED')
            .set('Authorization', `Bearer ${invToken}`);
        assert.strictEqual(Number(prioAfterTagRes.body.data[0].is_fast_moving), 1, 'PRIORITIZED sort must place Fast Moving materials first');

        // Adjust stock (DEDUCT 12 kg -> leaves 3.5 kg which is <= 5.0 min -> LOW_STOCK, and increments issuance_count)
        const adjustRmRes = await request(app)
            .post(`/api/raw-materials/${createdRmId}/adjust-stock`)
            .set('Authorization', `Bearer ${invToken}`)
            .send({
                adjustment_type: 'DEDUCT',
                quantity: 12.0,
                reason: 'Issued for GEMS PDRN Batch'
            });
        assert.strictEqual(adjustRmRes.status, 200);
        assert.strictEqual(Number(adjustRmRes.body.data.current_stock), 3.5);
        assert.strictEqual(adjustRmRes.body.data.status, 'LOW_STOCK');
        assert.strictEqual(Number(adjustRmRes.body.data.issuance_count), 1, 'DEDUCT adjustment must increment issuance_count');

        // Verify Supplier filter query & summary.suppliers array
        const supFilterRes = await request(app)
            .get('/api/raw-materials?supplier=Korea%20BioActives%20Co.')
            .set('Authorization', `Bearer ${invToken}`);
        assert.strictEqual(supFilterRes.status, 200);
        assert.strictEqual(supFilterRes.body.data.length, 1, 'Supplier filter must return only materials from that supplier');
        assert.strictEqual(supFilterRes.body.data[0].id, createdRmId);
        assert.ok(Array.isArray(supFilterRes.body.summary.suppliers), 'Summary must include distinct suppliers list');
        assert.ok(supFilterRes.body.summary.suppliers.includes('Korea BioActives Co.'), 'Suppliers list must include created supplier');

        // Verify Inventory Officer can submit a Bill of Materials (BOM) raw material requisition directly
        const bomReqRes = await request(app)
            .post('/api/supply-requests')
            .set('Authorization', `Bearer ${invToken}`)
            .send({
                po_id: 'WAREHOUSE-STOCK',
                urgency: 'HIGH',
                target_date: '2026-10-15',
                notes: 'Urgent replenishment for Peeling Lotion & Cosmetics raw materials',
                bom_items: [
                    {
                        raw_material_id: createdRmId,
                        material_code: 'RM-TEST-PDRN-99',
                        material_name: 'Sodium DNA (Salmon PDRN Extract 99%)',
                        category: 'Active Ingredients',
                        current_stock: 3.5,
                        requested_qty: 25,
                        unit: 'kg',
                        supplier: 'Korea BioActives Co.'
                    },
                    {
                        raw_material_id: 'rm-final-peel-1',
                        material_code: 'L001',
                        material_name: 'ETHYL ALCOHOL',
                        category: 'Peeling Lotion',
                        current_stock: 0,
                        requested_qty: 50,
                        unit: 'kg',
                        supplier: 'None'
                    }
                ]
            });
        assert.strictEqual(bomReqRes.status, 201);
        assert.strictEqual(bomReqRes.body.success, true);
        assert.ok(bomReqRes.body.data.id, 'BOM supply requisition must return an ID');

        // Verify GET /api/supply-requests returns the structured bom_items JSON and WH-STOCK-BOM reference
        const getReqsRes = await request(app)
            .get(`/api/supply-requests/${bomReqRes.body.data.id}`)
            .set('Authorization', `Bearer ${invToken}`);
        assert.strictEqual(getReqsRes.status, 200);
        assert.strictEqual(getReqsRes.body.data.po_number, 'WH-STOCK-BOM');
        const storedBom = JSON.parse(getReqsRes.body.data.bom_items || '[]');
        assert.strictEqual(storedBom.length, 2, 'Stored BOM must contain 2 raw material items');
        assert.strictEqual(storedBom[1].material_code, 'L001');

        db.prepare('DELETE FROM supply_requests WHERE id = ?').run(bomReqRes.body.data.id);

        // Clean up test raw material
        const delRmRes = await request(app)
            .delete(`/api/raw-materials/${createdRmId}`)
            .set('Authorization', `Bearer ${invToken}`);
        assert.strictEqual(delRmRes.status, 200);
    });

    test('42. Strict Order Completion Rule, Unproduced / Incomplete Delivery Completion Lock (PO-2026-000007) & Continuous Partial Delivery', async () => {
        const admin = db.prepare("SELECT * FROM users WHERE role = 'SUPER_ADMIN' OR role = 'ADMIN'").get();

        // 1. Check or seed PO-2026-000007 with 0 produced batches
        let po7 = db.prepare("SELECT * FROM purchase_orders WHERE po_number = 'PO-2026-000007'").get();
        let seededPo7 = false;
        if (!po7) {
            seededPo7 = true;
            const testPo7Id = 'test-po-7-id';
            db.prepare(`
                INSERT INTO purchase_orders (id, po_number, so_number, client_id, status, subtotal, grand_total, created_by)
                VALUES (?, 'PO-2026-000007', 'SO-2026-000007', ?, 'IN_PRODUCTION', 300000, 300000, ?)
            `).run(testPo7Id, demoClient.id, admin.id);
            const p1 = db.prepare("SELECT * FROM products LIMIT 1").get();
            const p2 = db.prepare("SELECT * FROM products WHERE id != ? LIMIT 1").get(p1.id);
            db.prepare(`
                INSERT INTO purchase_order_items (id, po_id, product_id, item_name, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
                VALUES ('item-po-7-1', ?, ?, 'HER CHOICE PH INTENSIVE BLEACHING BAR SOAP 120g', 5000, 4500, 5500, 30, 150000),
                       ('item-po-7-2', ?, ?, 'HER CHOICE PH KOJIC PAPAYA BAR SOAP 120g', 5000, 4500, 5500, 30, 150000)
            `).run(testPo7Id, p1.id, testPo7Id, p2.id);
            po7 = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(testPo7Id);
        }

        assert.ok(po7, 'PO-2026-000007 must exist in database');
        assert.strictEqual(po7.status, 'IN_PRODUCTION');

        // 2. Attempting to declare PO-2026-000007 finished MUST fail because products are not fully produced
        const finishRes = await request(app)
            .post(`/api/orders/${po7.id}/declare-finished`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});
        assert.strictEqual(finishRes.status, 400);
        assert.strictEqual(finishRes.body.success, false);
        assert.strictEqual(finishRes.body.code, 'UNPRODUCED_ITEMS');
        assert.ok(finishRes.body.error.includes('HER CHOICE PH INTENSIVE BLEACHING BAR SOAP'));
        assert.ok(finishRes.body.error.includes('Delivering cannot stop until all products needed are produced and delivered'));

        if (seededPo7) {
            db.prepare("DELETE FROM purchase_order_items WHERE po_id = ?").run(po7.id);
            db.prepare("DELETE FROM purchase_orders WHERE id = ?").run(po7.id);
        }

        // 3. Verify invoiceService item-by-item check: create a multi-item PO where item 1 is delivered and item 2 is undelivered
        const multiPoId = 'test-multi-po-completion';
        const multiPoNum = 'PO-2026-999990';
        db.prepare(`
            INSERT INTO purchase_orders (id, po_number, client_id, status, subtotal, grand_total, created_by)
            VALUES (?, ?, ?, 'IN_PRODUCTION', 20000, 20000, ?)
        `).run(multiPoId, multiPoNum, demoClient.id, admin.id);

        const prod1 = db.prepare("SELECT * FROM products LIMIT 1").get();
        const prod2 = db.prepare("SELECT * FROM products WHERE id != ? LIMIT 1").get(prod1.id);

        db.prepare(`
            INSERT INTO purchase_order_items (id, po_id, product_id, target_quantity, min_allowed_quantity, max_allowed_quantity, unit_price, subtotal)
            VALUES ('item-po-comp-1', ?, ?, 100, 100, 110, 100, 10000),
                   ('item-po-comp-2', ?, ?, 100, 100, 110, 100, 10000)
        `).run(multiPoId, prod1.id, multiPoId, prod2.id);

        // JO for item 1 with completed batch & yield
        const jo1Id = 'jo-comp-1';
        db.prepare(`
            INSERT INTO job_orders (id, jo_number, po_id, product_id, target_quantity, status, created_by)
            VALUES (?, 'JO-TEST-COMP-1', ?, ?, 100, 'COMPLETED', ?)
        `).run(jo1Id, multiPoId, prod1.id, admin.id);

        const batch1Id = 'batch-comp-1';
        db.prepare(`
            INSERT INTO production_batches (id, batch_number, jo_id, product_id, status, actual_yield, target_quantity, production_date, expiry_date, created_by)
            VALUES (?, 'BAT-COMP-01', ?, ?, 'QC_PASSED', 100, 100, '2026-09-30', '2028-09-30', ?)
        `).run(batch1Id, jo1Id, prod1.id, admin.id);

        // Deliver item 1 only
        const drId = 'dr-comp-1';
        db.prepare(`
            INSERT INTO delivery_receipts (id, dr_number, client_id, po_id, jo_id, status, created_by)
            VALUES (?, 'DR-2026-999990', ?, ?, ?, 'ACCEPTED', ?)
        `).run(drId, demoClient.id, multiPoId, jo1Id, admin.id);

        db.prepare(`
            INSERT INTO delivery_items (id, dr_id, product_id, batch_id, delivered_quantity, accepted_quantity, unit_price)
            VALUES ('di-comp-1', ?, ?, ?, 100, 100, 100)
        `).run(drId, prod1.id, batch1Id);

        // Calling invoiceService on drId: PO must become PARTIALLY_DELIVERED, NOT COMPLETED!
        const { createInvoiceFromDR } = require('../services/invoiceService');
        const invoiceRes = createInvoiceFromDR({ drId, userId: admin.id, userName: admin.name, userRole: admin.role, createdBy: admin.id });
        assert.ok(invoiceRes.invoiceId);

        const postInvoicePO = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(multiPoId);
        assert.strictEqual(postInvoicePO.status, 'PARTIALLY_DELIVERED', 'PO must NOT be marked COMPLETED when item 2 is undelivered and unproduced');

        // Cleanup test PO
        db.prepare("DELETE FROM sales_invoices WHERE dr_id = ?").run(drId);
        db.prepare("DELETE FROM delivery_items WHERE dr_id = ?").run(drId);
        db.prepare("DELETE FROM delivery_receipts WHERE id = ?").run(drId);
        db.prepare("DELETE FROM production_batches WHERE id = ?").run(batch1Id);
        db.prepare("DELETE FROM job_orders WHERE id = ?").run(jo1Id);
        db.prepare("DELETE FROM purchase_order_items WHERE po_id = ?").run(multiPoId);
        db.prepare("DELETE FROM purchase_orders WHERE id = ?").run(multiPoId);
    });

    test('43. Generate API for Cheque Payables Only: Scope Isolation, Query, Requisition & COO Confirmation', async () => {
        // 1. Generate an API Key for Cheque Payables Only
        const generateRes = await request(app)
            .post('/api/api-keys')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'COO Cheque Payables Portal Key',
                scopes: ['payables:read', 'payables:confirm', 'payables:write']
            });
        assert.strictEqual(generateRes.status, 201);
        assert.strictEqual(generateRes.body.success, true);
        const payablesApiKey = generateRes.body.rawKey;
        assert.ok(payablesApiKey.startsWith('nkb_live_'));
        assert.deepStrictEqual(generateRes.body.apiKey.scopes, ['payables:read', 'payables:confirm', 'payables:write']);

        // 2. Query Cheque Payables via GET /api/v1/payables -> Success
        const listRes = await request(app)
            .get('/api/v1/payables')
            .set('x-api-key', payablesApiKey);
        assert.strictEqual(listRes.status, 200);
        assert.strictEqual(listRes.body.success, true);
        assert.ok(Array.isArray(listRes.body.data));

        // 3. Create a new Cheque Payable Requisition via POST /api/v1/payables -> Success
        const createPayableRes = await request(app)
            .post('/api/v1/payables')
            .set('x-api-key', payablesApiKey)
            .send({
                payee_name: 'Apex Chemical Solvents Inc.',
                amount: 88500.0,
                cheque_date: '2026-10-15',
                bank_name: 'Security Bank',
                bank_account_number: '0000079720871',
                category: 'Raw Materials',
                purpose: 'Bulk isopropyl alcohol and solvent containers',
                invoice_reference: 'APX-2026-9901'
            });
        assert.strictEqual(createPayableRes.status, 201);
        assert.strictEqual(createPayableRes.body.success, true);
        const createdPayable = createPayableRes.body.data;
        assert.ok(createdPayable.id);
        assert.ok(createdPayable.request_number.startsWith('CHQ-'));

        // 4. Confirm Cheque Payable via POST /api/v1/payables/:id/confirm -> Success
        const confirmRes = await request(app)
            .post(`/api/v1/payables/${createdPayable.id}/confirm`)
            .set('x-api-key', payablesApiKey)
            .send({
                action: 'CONFIRMED',
                cheque_number: 'SEC-2026-889900',
                confirmed_by: 'COO External Portal API'
            });
        assert.strictEqual(confirmRes.status, 200);
        assert.strictEqual(confirmRes.body.success, true);
        assert.strictEqual(confirmRes.body.data.status, 'CONFIRMED');
        assert.strictEqual(confirmRes.body.data.cheque_number, 'SEC-2026-889900');

        // 5. Verify Scope Isolation: Key MUST be blocked from non-payables endpoints
        // A. Blocked from orders
        const ordersRes = await request(app)
            .get('/api/v1/orders')
            .set('x-api-key', payablesApiKey);
        assert.strictEqual(ordersRes.status, 403);
        assert.strictEqual(ordersRes.body.error, 'INSUFFICIENT_SCOPE');

        // B. Blocked from products
        const productsRes = await request(app)
            .get('/api/v1/products')
            .set('x-api-key', payablesApiKey);
        assert.strictEqual(productsRes.status, 403);
        assert.strictEqual(productsRes.body.error, 'INSUFFICIENT_SCOPE');

        // C. Blocked from invoices
        const invoicesRes = await request(app)
            .get('/api/v1/invoices')
            .set('x-api-key', payablesApiKey);
        assert.strictEqual(invoicesRes.status, 403);
        assert.strictEqual(invoicesRes.body.error, 'INSUFFICIENT_SCOPE');

        // 6. Verify non-payables key CANNOT access payables
        const nonPayablesKeyRes = await request(app)
            .post('/api/api-keys')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Orders Only Key',
                scopes: ['orders:read']
            });
        const ordersOnlyKey = nonPayablesKeyRes.body.rawKey;

        const unauthorizedPayablesRes = await request(app)
            .get('/api/v1/payables')
            .set('x-api-key', ordersOnlyKey);
        assert.strictEqual(unauthorizedPayablesRes.status, 403);
        assert.strictEqual(unauthorizedPayablesRes.body.error, 'INSUFFICIENT_SCOPE');
    });

    test('44. Real-Time Live Synchronization Engine (SSE Stream, Broadcast & Audit Log Pulse)', async () => {
        // 1. Check live status and online operator count
        const statusRes = await request(app).get('/api/realtime/status');
        assert.strictEqual(statusRes.status, 200);
        assert.strictEqual(statusRes.body.success, true);
        assert.strictEqual(statusRes.body.status, 'online');
        assert.strictEqual(typeof statusRes.body.totalConnected, 'number');

        // 2. Establish SSE stream and verify event headers & handshake
        let receivedData = '';
        await new Promise((resolve) => {
            const req = request(app)
                .get(`/api/realtime/stream?token=${encodeURIComponent(adminToken)}`)
                .buffer(false)
                .parse((res, callback) => {
                    assert.strictEqual(res.statusCode, 200);
                    assert.match(res.headers['content-type'], /text\/event-stream/i);
                    assert.strictEqual(res.headers['connection'], 'keep-alive');
                    assert.strictEqual(res.headers['x-accel-buffering'], 'no');

                    res.on('data', (chunk) => {
                        receivedData += chunk.toString();
                        if (receivedData.includes('event: connected')) {
                            realtimeSyncService.closeAllClients();
                            resolve();
                        }
                    });
                });

            req.on('error', () => {});
            req.end();
        });

        assert.ok(receivedData.includes('event: connected'));
        assert.ok(receivedData.includes('Live Real-Time Sync Connected'));

        // 3. Test POST /api/realtime/broadcast
        const broadcastRes = await request(app)
            .post('/api/realtime/broadcast')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                entityType: 'PURCHASE_ORDERS',
                action: 'QUEUE_REORDER',
                entityId: 'PO-2026-000007',
                details: { rank: 1, active_today: 1 }
            });
        assert.strictEqual(broadcastRes.status, 200);
        assert.strictEqual(broadcastRes.body.success, true);

        // 4. Test logAudit auto-triggering broadcastSync to active operator stream
        let streamedPayload = '';
        const mockRes = {
            writeHead: () => {},
            flushHeaders: () => {},
            write: (msg) => { streamedPayload += msg; }
        };
        const mockReq = {
            on: () => {}
        };

        realtimeSyncService.registerClient(mockReq, mockRes, {
            id: 'mock-operator-44',
            name: 'Supervisor Floor',
            role: 'PRODUCTION'
        });

        logAudit({
            userId: 'a0000000-0000-0000-0000-000000000001',
            userName: 'Executive Admin',
            userRole: 'SUPER_ADMIN',
            action: 'UPDATE_PRODUCTION_PRIORITY',
            entityType: 'PURCHASE_ORDERS',
            entityId: 'PO-2026-000007',
            details: { priority: 'RUSH', is_active_today: 1 }
        });

        assert.ok(streamedPayload.includes('event: sync'));
        assert.ok(streamedPayload.includes('PO-2026-000007'));
        assert.ok(streamedPayload.includes('PURCHASE_ORDERS'));
        assert.ok(streamedPayload.includes('Executive Admin'));

        realtimeSyncService.closeAllClients();
    });

    test('86. Raw Material Quality Control (QC) Inspection Workflow & Staff Profile Contact Notification System', async () => {
        const purchToken = getAuthToken('PURCHASING');
        const qcToken = getAuthToken('QC');

        // Part 1: Staff Profile & WhatsApp Contact Updating
        const profileUpdateRes = await request(app)
            .put('/api/auth/profile')
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                name: 'Lead Purchasing Specialist',
                whatsapp_number: '+639178889999',
                phone: '+639178889999'
            });
        assert.strictEqual(profileUpdateRes.status, 200);
        assert.strictEqual(profileUpdateRes.body.user.whatsapp_number, '+639178889999');

        const getProfileRes = await request(app)
            .get('/api/auth/profile')
            .set('Authorization', `Bearer ${purchToken}`);
        assert.strictEqual(getProfileRes.status, 200);
        assert.strictEqual(getProfileRes.body.user.name, 'Lead Purchasing Specialist');
        assert.strictEqual(getProfileRes.body.user.whatsapp_number, '+639178889999');

        const usersListRes = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(usersListRes.status, 200);
        const purchUserInList = usersListRes.body.data.find(u => u.email === 'purchasing@nkbmanufacturing.com');
        assert.ok(purchUserInList);
        assert.strictEqual(purchUserInList.whatsapp_number, '+639178889999');

        // Part 2: Create a PO to link supply requests
        const poRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                client_id: demoClient.id,
                items: [{ product_id: lotionProduct.id, target_quantity: 500, unit_price: 120.0 }]
            });
        assert.strictEqual(poRes.status, 201);
        const poId = poRes.body.data.id;

        // Part 3: Create Raw Material Requisition
        const createReqRes = await request(app)
            .post('/api/supply-requests')
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                po_id: poId,
                materials_needed: 'Kojic Acid Dipalmitate (50kg Drum) & Niacinamide USP Grade (25kg)',
                urgency: 'HIGH',
                target_date: '2026-10-15',
                notes: 'Batch production starting soon'
            });
        assert.strictEqual(createReqRes.status, 201);
        const reqId = createReqRes.body.data.id;
        assert.strictEqual(createReqRes.body.data.status, 'SUBMITTED');

        // Part 4: Purchasing updates status to PENDING_QC upon receiving arrival
        const movePendingQcRes = await request(app)
            .put(`/api/supply-requests/${reqId}`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                status: 'PENDING_QC',
                supplier_details: 'Croda Chemicals / PO# CR-90812'
            });
        assert.strictEqual(movePendingQcRes.status, 200);
        assert.strictEqual(movePendingQcRes.body.data.status, 'PENDING_QC');

        // Part 5: QC Inspector DECLINES defective raw material
        // Validation: qc_notes required when declining
        const failDeclineRes = await request(app)
            .post(`/api/supply-requests/${reqId}/qc-decision`)
            .set('Authorization', `Bearer ${qcToken}`)
            .send({ decision: 'DECLINE', qc_notes: '' });
        assert.strictEqual(failDeclineRes.status, 400);

        const declineRes = await request(app)
            .post(`/api/supply-requests/${reqId}/qc-decision`)
            .set('Authorization', `Bearer ${qcToken}`)
            .send({
                decision: 'DECLINE',
                qc_notes: 'Failed HPLC purity assay: 84% active concentration vs 99% minimum specification.'
            });
        assert.strictEqual(declineRes.status, 200);
        assert.strictEqual(declineRes.body.data.status, 'QC_DECLINED');
        assert.strictEqual(declineRes.body.data.qc_status, 'DECLINED');
        assert.ok(declineRes.body.data.qc_notes.includes('Failed HPLC purity assay'));

        // Part 6: Purchasing responds to QC Declined report with REORDER
        const reorderRes = await request(app)
            .post(`/api/supply-requests/${reqId}/purchasing-response`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                action: 'REORDER',
                notes: 'Contacted vendor rep. Rush replacement batch dispatched.'
            });
        assert.strictEqual(reorderRes.status, 200);
        assert.strictEqual(reorderRes.body.data.status, 'ORDERED');
        assert.strictEqual(reorderRes.body.data.purchasing_response, 'REORDER');

        // Part 7: Purchasing updates back to PENDING_QC upon replacement delivery
        await request(app)
            .put(`/api/supply-requests/${reqId}`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({ status: 'PENDING_QC', supplier_details: 'Replacement Lot #RL-4410' });

        // QC declines again for damaged containers
        await request(app)
            .post(`/api/supply-requests/${reqId}/qc-decision`)
            .set('Authorization', `Bearer ${qcToken}`)
            .send({ decision: 'DECLINE', qc_notes: 'Drums punctured during transit, contaminated seal.' });

        // Purchasing responds with RETURN_TO_SUPPLIER
        const returnRes = await request(app)
            .post(`/api/supply-requests/${reqId}/purchasing-response`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                action: 'RETURN_TO_SUPPLIER',
                notes: 'RMA #4492 authorized by Croda logistics for courier pickup.'
            });
        assert.strictEqual(returnRes.status, 200);
        assert.strictEqual(returnRes.body.data.status, 'RETURNED_TO_SUPPLIER');
        assert.strictEqual(returnRes.body.data.purchasing_response, 'RETURN_TO_SUPPLIER');

        // Part 8: Test REJECT resolution on a fresh lot
        const req2Res = await request(app)
            .post('/api/supply-requests')
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                po_id: poId,
                materials_needed: 'Decyl Glucoside 200L',
                urgency: 'NORMAL'
            });
        const req2Id = req2Res.body.data.id;
        await request(app)
            .put(`/api/supply-requests/${req2Id}`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({ status: 'PENDING_QC' });

        await request(app)
            .post(`/api/supply-requests/${req2Id}/qc-decision`)
            .set('Authorization', `Bearer ${qcToken}`)
            .send({ decision: 'DECLINE', qc_notes: 'Foreign debris observed in drum.' });

        const rejectRes = await request(app)
            .post(`/api/supply-requests/${req2Id}/purchasing-response`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                action: 'REJECT',
                notes: 'Lot scrapped permanently.'
            });
        assert.strictEqual(rejectRes.status, 200);
        assert.strictEqual(rejectRes.body.data.status, 'REJECTED');
        assert.strictEqual(rejectRes.body.data.purchasing_response, 'REJECT');

        // Part 9: Test BYPASS_QC resolution
        const req3Res = await request(app)
            .post('/api/supply-requests')
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                po_id: poId,
                materials_needed: 'Fragrance Compound Vanilla 10kg',
                urgency: 'CRITICAL'
            });
        const req3Id = req3Res.body.data.id;
        await request(app)
            .put(`/api/supply-requests/${req3Id}`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({ status: 'PENDING_QC' });

        await request(app)
            .post(`/api/supply-requests/${req3Id}/qc-decision`)
            .set('Authorization', `Bearer ${qcToken}`)
            .send({ decision: 'DECLINE', qc_notes: 'Slight odor deviation from standard reference.' });

        const bypassRes = await request(app)
            .post(`/api/supply-requests/${req3Id}/purchasing-response`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                action: 'BYPASS_QC',
                notes: 'Management concession: approved for secondary body wash line.'
            });
        assert.strictEqual(bypassRes.status, 200);
        assert.strictEqual(bypassRes.body.data.status, 'DELIVERED');
        assert.strictEqual(bypassRes.body.data.qc_status, 'BYPASSED');
        assert.strictEqual(bypassRes.body.data.purchasing_response, 'BYPASS_QC');

        // Part 10: Direct QC Approval Flow
        const req4Res = await request(app)
            .post('/api/supply-requests')
            .set('Authorization', `Bearer ${purchToken}`)
            .send({
                po_id: poId,
                materials_needed: 'Cetyl Alcohol Flakes 100kg',
                urgency: 'HIGH'
            });
        const req4Id = req4Res.body.data.id;
        await request(app)
            .put(`/api/supply-requests/${req4Id}`)
            .set('Authorization', `Bearer ${purchToken}`)
            .send({ status: 'PENDING_QC' });

        const qcApproveRes = await request(app)
            .post(`/api/supply-requests/${req4Id}/qc-decision`)
            .set('Authorization', `Bearer ${qcToken}`)
            .send({
                decision: 'APPROVE',
                qc_notes: 'Certificate of Analysis verified, melting point within 48-52C spec.'
            });
        assert.strictEqual(qcApproveRes.status, 200);
        assert.strictEqual(qcApproveRes.body.data.status, 'DELIVERED');
        assert.strictEqual(qcApproveRes.body.data.qc_status, 'PASSED');
        assert.ok(qcApproveRes.body.data.qc_notes.includes('Certificate of Analysis verified'));
    });

    test('87. Action Required Notifications WhatsApp & SMS Integration', async () => {
        const admToken = getAuthToken('SUPER_ADMIN');
        const purchToken = getAuthToken('PURCHASING');

        // Part 1: Check GET /api/notifications/pending returns WhatsApp & SMS attributes
        const res = await request(app)
            .get('/api/notifications/pending')
            .set('Authorization', `Bearer ${admToken}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(Array.isArray(res.body.items));

        if (res.body.items.length > 0) {
            const first = res.body.items[0];
            assert.ok(first.whatsapp_url, 'Must include whatsapp_url');
            assert.ok(first.sms_url, 'Must include sms_url');
            assert.ok(first.whatsapp_message, 'Must include whatsapp_message');
            assert.ok(first.sms_message, 'Must include sms_message');
            assert.ok(first.whatsapp_url.includes('whatsapp') || first.whatsapp_url.includes('wa.me'));
            assert.ok(first.sms_url.startsWith('sms:'));
            assert.ok(first.whatsapp_message.includes('ACTION REQUIRED'));
        }

        // Part 2: Purchasing user notifications have WhatsApp & SMS for all items
        const purchNotifRes = await request(app)
            .get('/api/notifications/pending')
            .set('Authorization', `Bearer ${purchToken}`);
        assert.strictEqual(purchNotifRes.status, 200);
        purchNotifRes.body.items.forEach(it => {
            assert.ok(it.whatsapp_url, `Item ${it.id} must have whatsapp_url`);
            assert.ok(it.sms_url, `Item ${it.id} must have sms_url`);
            assert.ok(it.whatsapp_message, `Item ${it.id} must have whatsapp_message`);
            assert.ok(it.sms_message, `Item ${it.id} must have sms_message`);
            // Every notification must also be copied to Admin
            assert.ok(it.admin_whatsapp_url, `Item ${it.id} must have admin_whatsapp_url`);
            assert.ok(it.admin_sms_url && it.admin_sms_url.startsWith('sms:'), `Item ${it.id} must have admin_sms_url`);
            assert.ok(it.admin_whatsapp_message.includes('ADMIN COPY'));
            assert.ok(it.admin_sms_message.startsWith('[ADMIN COPY]'));
        });
        res.body.items.forEach(it => {
            assert.ok(it.admin_whatsapp_url, `Admin view item ${it.id} must have admin_whatsapp_url`);
        });
        assert.ok('admin_contact' in purchNotifRes.body, 'Response must expose admin_contact');

        // Part 3: Test POST /api/notifications/log-action-alert
        const logRes = await request(app)
            .post('/api/notifications/log-action-alert')
            .set('Authorization', `Bearer ${admToken}`)
            .send({
                notification_id: 'test-action-1',
                channel: 'WHATSAPP',
                recipient_phone: '+639170000005',
                title: 'Urgent Requisition Sourcing'
            });
        assert.strictEqual(logRes.status, 200);
        assert.strictEqual(logRes.body.success, true);

        // Part 4: Test GET /api/notifications/summary-message
        const summaryRes = await request(app)
            .get('/api/notifications/summary-message')
            .set('Authorization', `Bearer ${admToken}`);
        assert.strictEqual(summaryRes.status, 200);
        assert.strictEqual(summaryRes.body.success, true);
        assert.ok(summaryRes.body.whatsappUrl);
        assert.ok(summaryRes.body.smsUrl);
        assert.ok(summaryRes.body.summaryText);
        assert.ok(summaryRes.body.summaryText.includes('NKB ACTION REQUIRED SUMMARY'));
    });

    test('88. Two-Way Integration APIs: Inbound Data Receiving & Editing API and Outbound Data Sending & Export API', async () => {
        const http = require('http');

        // Step 1: Create an API key with data:receive and data:send scopes
        const keyRes = await request(app)
            .post('/api/api-keys')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Two-Way Integration Sync Key',
                scopes: ['data:receive', 'data:send', 'payables:read', 'payables:write'],
                rateLimitRpm: 100
            });
        assert.strictEqual(keyRes.status, 201);
        const apiKey = keyRes.body.rawKey;

        // Step 2: Test API 1 - Inbound Receiving (POST /api/v1/data/receive) for raw materials
        const receiveMatRes = await request(app)
            .post('/api/v1/data/receive')
            .set('x-api-key', apiKey)
            .send({
                entity: 'materials',
                mode: 'CREATE',
                data: [{
                    material_code: 'RM-INT-TEST-001',
                    material_name: 'Organic Aloe Vera Extract',
                    category: 'Botanical Extracts',
                    current_stock: 150.5,
                    unit_cost: 45.0,
                    unit: 'kg',
                    location: 'Warehouse Bay 3'
                }]
            });
        assert.strictEqual(receiveMatRes.status, 200);
        assert.strictEqual(receiveMatRes.body.success, true);
        assert.strictEqual(receiveMatRes.body.processedCount, 1);
        assert.strictEqual(receiveMatRes.body.data[0].material_code, 'RM-INT-TEST-001');

        // Step 3: Test API 1 - Inbound Editing (PUT /api/v1/data/edit/materials/:id)
        const editMatRes = await request(app)
            .put('/api/v1/data/edit/materials/RM-INT-TEST-001')
            .set('x-api-key', apiKey)
            .send({
                material_name: 'Organic Aloe Vera Extract (Ultra Pure)',
                current_stock: 200.0,
                unit_cost: 48.5
            });
        assert.strictEqual(editMatRes.status, 200);
        assert.strictEqual(editMatRes.body.success, true);
        assert.strictEqual(editMatRes.body.data.current_stock, 200.0);
        assert.strictEqual(editMatRes.body.data.material_name, 'Organic Aloe Vera Extract (Ultra Pure)');

        // Step 4: Test API 1 - Inbound Receiving for Payables (POST /api/v1/data/receive)
        const receivePayableRes = await request(app)
            .post('/api/v1/data/receive')
            .set('x-api-key', apiKey)
            .send({
                entity: 'payables',
                mode: 'CREATE',
                data: {
                    payee_name: 'Apex Packaging Supplies Co.',
                    amount: 35000.0,
                    cheque_date: '2026-10-15',
                    bank_name: 'BDO Unibank',
                    category: 'Packaging Materials',
                    purpose: 'Custom Cosmetic Bottles Batch 88'
                }
            });
        assert.strictEqual(receivePayableRes.status, 200);
        assert.strictEqual(receivePayableRes.body.success, true);
        const createdPayable = receivePayableRes.body.data[0];
        assert.ok(createdPayable.id);
        assert.strictEqual(createdPayable.payee_name, 'Apex Packaging Supplies Co.');

        // Step 5: Test API 1 - Inbound Editing for Payables (PUT /api/v1/payables/:id)
        const editPayableRes = await request(app)
            .put(`/api/v1/payables/${createdPayable.id}`)
            .set('x-api-key', apiKey)
            .send({
                amount: 38500.0,
                notes: 'Adjusted for additional expedited freight fee'
            });
        assert.strictEqual(editPayableRes.status, 200);
        assert.strictEqual(editPayableRes.body.success, true);
        assert.strictEqual(editPayableRes.body.data.amount, 38500.0);

        // Step 6: Test API 2 - Outbound Export / Stream (GET /api/v1/data/export/:entity)
        const exportRes = await request(app)
            .get('/api/v1/data/export/payables?limit=10')
            .set('x-api-key', apiKey);
        assert.strictEqual(exportRes.status, 200);
        assert.strictEqual(exportRes.body.success, true);
        assert.ok(Array.isArray(exportRes.body.data));
        assert.ok(exportRes.body.count > 0);
        assert.ok(exportRes.body.data.some(p => p.payee_name === 'Apex Packaging Supplies Co.'));

        // Step 7: Test API 2 - Outbound Dispatch (POST /api/v1/data/send)
        // Missing targetUrl -> 400
        const badSendRes = await request(app)
            .post('/api/v1/data/send')
            .set('x-api-key', apiKey)
            .send({ data: { message: 'hello' } });
        assert.strictEqual(badSendRes.status, 400);
        assert.strictEqual(badSendRes.body.error, 'MISSING_TARGET_URL');

        // Missing data -> 400
        const badDataSendRes = await request(app)
            .post('/api/v1/data/send')
            .set('x-api-key', apiKey)
            .send({ targetUrl: 'http://localhost:9999/webhook' });
        assert.strictEqual(badDataSendRes.status, 400);
        assert.strictEqual(badDataSendRes.body.error, 'MISSING_DATA');

        // Spin up a mock external webhook destination
        let receivedWebhook = null;
        let receivedSig = null;
        const mockServer = http.createServer((req, res) => {
            receivedSig = req.headers['x-nkb-signature'];
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    receivedWebhook = JSON.parse(body);
                } catch (_) {
                    receivedWebhook = body;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ack: true, receivedAt: Date.now() }));
            });
        });

        await new Promise(resolve => mockServer.listen(0, resolve));
        const mockPort = mockServer.address().port;
        const mockUrl = `http://127.0.0.1:${mockPort}/erp/webhook`;

        try {
            const sendRes = await request(app)
                .post('/api/v1/data/send')
                .set('x-api-key', apiKey)
                .send({
                    targetUrl: mockUrl,
                    event: 'PAYABLE_SYNC',
                    entity: 'PAYABLE',
                    secret: 'super-secret-sync-key',
                    data: {
                        request_number: createdPayable.request_number,
                        amount: 38500.0,
                        status: 'PENDING_COO_APPROVAL'
                    }
                });

            assert.strictEqual(sendRes.status, 200);
            assert.strictEqual(sendRes.body.success, true);
            assert.strictEqual(sendRes.body.transmitted, true);
            assert.ok(sendRes.body.durationMs >= 0);
            assert.strictEqual(sendRes.body.responseData.ack, true);

            // Assert webhook received payload and signature
            assert.ok(receivedWebhook);
            assert.strictEqual(receivedWebhook.event, 'PAYABLE_SYNC');
            assert.strictEqual(receivedWebhook.payload.amount, 38500.0);
            assert.ok(receivedSig, 'x-nkb-signature header must be present on HMAC signed dispatch');
        } finally {
            await new Promise(resolve => mockServer.close(resolve));
        }
    });

    test('89. Cheque Payables Dedicated Import, Edit & Export APIs with Imported Data Export Verification', async () => {
        // Step 1: Internal Import via POST /api/cheque-payables/import
        const importPayload = [
            {
                payee_name: 'ZETA RAW CHEMICALS INC',
                amount: 42000.0,
                cheque_date: '2026-10-20',
                bank_name: 'BDO Unibank',
                category: 'Chemical Ingredients',
                company_name: 'NKB MANUFACTURING CORPORATION',
                purpose: 'Bulk Emulsifiers Initial',
                line_items: [
                    { description: 'Stearic Acid 25kg', category: 'Chemical Ingredients', quantity: 10, cost: 2500, subtotal: 25000 },
                    { description: 'Cetyl Alcohol 25kg', category: 'Chemical Ingredients', quantity: 5, cost: 3400, subtotal: 17000 }
                ]
            },
            {
                payee_name: 'BETA PACKAGING CORPORATION',
                amount: 18500.0,
                cheque_date: '2026-10-22',
                bank_name: 'Security Bank',
                category: 'Packaging Materials',
                company_name: 'NKB MANUFACTURING CORPORATION',
                purpose: 'Pump Dispensers 5000pcs'
            }
        ];

        const importRes = await request(app)
            .post('/api/cheque-payables/import')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(importPayload);

        assert.strictEqual(importRes.status, 200);
        assert.strictEqual(importRes.body.success, true);
        assert.strictEqual(importRes.body.importedCount, 2);
        assert.ok(importRes.body.batchId);
        assert.ok(Array.isArray(importRes.body.data));
        assert.strictEqual(importRes.body.data.length, 2);

        const importedRecord1 = importRes.body.data[0];
        const importedRecord2 = importRes.body.data[1];
        assert.strictEqual(importedRecord1.payee_name, 'ZETA RAW CHEMICALS INC');
        assert.strictEqual(importedRecord1.is_imported, 1);
        assert.strictEqual(importedRecord1.import_batch_id, importRes.body.batchId);

        // Verify suggestive entities were auto-learned
        const catRow = db.prepare("SELECT * FROM payable_categories WHERE name = 'Chemical Ingredients'").get();
        assert.ok(catRow, 'Imported category must be auto-persisted to payable_categories for suggestions');
        const vdrRow = db.prepare("SELECT * FROM payable_vendors WHERE name = 'ZETA RAW CHEMICALS INC'").get();
        assert.ok(vdrRow, 'Imported vendor must be auto-persisted to payable_vendors for suggestions');

        // Step 2: Edit the imported record via PUT /api/cheque-payables/edit/:id
        const editRes = await request(app)
            .put(`/api/cheque-payables/edit/${importedRecord1.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                amount: 45000.0,
                purpose: 'Bulk Emulsifiers & Surfactants (Revised)'
            });

        assert.strictEqual(editRes.status, 200);
        assert.strictEqual(editRes.body.success, true);
        assert.strictEqual(editRes.body.data.amount, 45000.0);
        assert.strictEqual(editRes.body.data.purpose, 'Bulk Emulsifiers & Surfactants (Revised)');

        // Step 3: Outbound Export of Imported Data via GET /api/cheque-payables/export
        // A) Verify JSON export includes the imported & edited record
        const exportJsonRes = await request(app)
            .get('/api/cheque-payables/export?only_imported=true')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.strictEqual(exportJsonRes.status, 200);
        assert.strictEqual(exportJsonRes.body.success, true);
        assert.ok(Array.isArray(exportJsonRes.body.data));
        assert.ok(exportJsonRes.body.count >= 2);

        const foundEdited = exportJsonRes.body.data.find(r => r.id === importedRecord1.id);
        assert.ok(foundEdited, 'Export must include the imported record');
        assert.strictEqual(foundEdited.is_imported, true);
        assert.strictEqual(foundEdited.amount, 45000.0);
        assert.strictEqual(foundEdited.purpose, 'Bulk Emulsifiers & Surfactants (Revised)');
        assert.strictEqual(foundEdited.payee_name, 'ZETA RAW CHEMICALS INC');

        // B) Verify CSV export
        const exportCsvRes = await request(app)
            .get('/api/cheque-payables/export?format=csv&only_imported=true')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.strictEqual(exportCsvRes.status, 200);
        assert.ok(exportCsvRes.headers['content-type'].includes('text/csv'));
        assert.ok(exportCsvRes.text.includes('ZETA RAW CHEMICALS INC'));
        assert.ok(exportCsvRes.text.includes('45000.00'));
        assert.ok(exportCsvRes.text.includes('YES'), 'CSV must show YES for Is Imported column');

        // Step 4: External V1 API Verification with API Key
        const apiKeyRes = await request(app)
            .post('/api/api-keys')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'External Payables Sync Integration',
                scopes: ['payables:write', 'payables:read'],
                rateLimitRpm: 120
            });
        assert.strictEqual(apiKeyRes.status, 201);
        const externalApiKey = apiKeyRes.body.rawKey;

        // V1 Import
        const v1ImportRes = await request(app)
            .post('/api/v1/payables/import')
            .set('x-api-key', externalApiKey)
            .send({
                payee_name: 'OMEGA PLASTICS PHILIPPINES',
                amount: 62000.0,
                category: 'Packaging Materials',
                bank_name: 'Metrobank',
                purpose: 'Custom Cosmetic Jars 10,000pcs'
            });

        assert.strictEqual(v1ImportRes.status, 200);
        assert.strictEqual(v1ImportRes.body.success, true);
        assert.strictEqual(v1ImportRes.body.importedCount, 1);
        const v1ImportedItem = v1ImportRes.body.data[0];
        assert.strictEqual(v1ImportedItem.payee_name, 'OMEGA PLASTICS PHILIPPINES');

        // V1 Edit
        const v1EditRes = await request(app)
            .put(`/api/v1/payables/edit/${v1ImportedItem.id}`)
            .set('x-api-key', externalApiKey)
            .send({
                amount: 65000.0,
                purpose: 'Custom Cosmetic Jars 10,000pcs + Cap Seal'
            });

        assert.strictEqual(v1EditRes.status, 200);
        assert.strictEqual(v1EditRes.body.success, true);
        assert.strictEqual(v1EditRes.body.data.amount, 65000.0);

        // V1 Export: Ensure imported data can be exported
        const v1ExportRes = await request(app)
            .get('/api/v1/payables/export?only_imported=true')
            .set('x-api-key', externalApiKey);

        assert.strictEqual(v1ExportRes.status, 200);
        assert.strictEqual(v1ExportRes.body.success, true);
        const foundV1 = v1ExportRes.body.data.find(r => r.id === v1ImportedItem.id);
        assert.ok(foundV1, 'V1 Export must cleanly export imported record');
        assert.strictEqual(foundV1.amount, 65000.0);
        assert.strictEqual(foundV1.is_imported, true);
        assert.strictEqual(foundV1.payee_name, 'OMEGA PLASTICS PHILIPPINES');
    });

    after(() => {
        try {
            realtimeSyncService.closeAllClients();
        } catch (_) {}
        // Automatically delete all test decoys and temporary test database
        try {
            db.close();
        } catch (_) {}
        const testDbPath = path.join(__dirname, '../database/nkb_test.sqlite');
        const walPath = path.join(__dirname, '../database/nkb_test.sqlite-wal');
        const shmPath = path.join(__dirname, '../database/nkb_test.sqlite-shm');
        [testDbPath, walPath, shmPath].forEach(f => {
            if (fs.existsSync(f)) {
                try { fs.unlinkSync(f); } catch (_) {}
            }
        });
        console.log('🧹 Cleaned up test database and decoys successfully');
    });
});





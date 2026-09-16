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
        assert.strictEqual(printPoHtml.includes('id="po-payment-section"'), false, 'print-po.html must NOT have #po-payment-section');
        assert.strictEqual(printPoHtml.includes('id="disp-po-payment"'), false, 'print-po.html must NOT have #disp-po-payment');
        assert.strictEqual(printPoHtml.includes('Form of Payment:'), false, 'print-po.html must NOT have "Form of Payment:" in receipt');
        assert.strictEqual(printPoHtml.includes('FDA'), false, 'print-po.html must NOT have FDA reference in receipt');
        assert.ok(printPoHtml.includes('Twig St.'), 'print-po.html must use capitalized Twig St.');
        assert.strictEqual(printPoHtml.includes('Twig st.'), false, 'print-po.html must NOT have lowercase Twig st.');
        assert.ok(printJoHtml.includes('Twig St.'), 'print-jo.html must use capitalized Twig St.');
        assert.strictEqual(printJoHtml.includes('Twig st.'), false, 'print-jo.html must NOT have lowercase Twig st.');
        assert.ok(printPoHtml.includes('body.hide-prices'), 'print-po.html must contain hide-prices style for non-price viewers');

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

    after(() => {
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




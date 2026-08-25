const path = require('path');
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(__dirname, '../database/nkb_test.sqlite');

const { test, describe, before } = require('node:test');
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
});




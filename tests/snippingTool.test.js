const path = require('path');
const fs = require('fs');
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(__dirname, '../database/nkb_test.sqlite');

const { test, describe } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

describe('Snipping Tool for SO and PO Printing', () => {
    const dummyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    test('1. POST /api/orders/save-snip saves SO as SOPO1.png in folder SO', async () => {
        const res = await request(app)
            .post('/api/orders/save-snip')
            .send({
                docType: 'SALES ORDER',
                poNumber: 'PO-2026-000001',
                imageData: dummyImage
            })
            .expect(200);

        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.folder, 'SO');
        assert.strictEqual(res.body.filename, 'SOPO1.png');
        assert.strictEqual(res.body.url, '/uploads/SO/SOPO1.png');

        const filePath = path.join(__dirname, '../uploads/SO/SOPO1.png');
        assert.strictEqual(fs.existsSync(filePath), true, 'File should exist on disk in uploads/SO/');
    });

    test('2. POST /api/orders/save-snip saves PO as PO1.png in folder PO', async () => {
        const res = await request(app)
            .post('/api/orders/save-snip')
            .send({
                docType: 'PURCHASE ORDER',
                poNumber: 'PO-2026-000001',
                imageData: dummyImage
            })
            .expect(200);

        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.folder, 'PO');
        assert.strictEqual(res.body.filename, 'PO1.png');
        assert.strictEqual(res.body.url, '/uploads/PO/PO1.png');

        const filePath = path.join(__dirname, '../uploads/PO/PO1.png');
        assert.strictEqual(fs.existsSync(filePath), true, 'File should exist on disk in uploads/PO/');
    });

    test('3. POST /api/orders/save-snip handles two-digit and multi-digit PO numbers', async () => {
        const resSO = await request(app)
            .post('/api/orders/save-snip')
            .send({
                docType: 'SO',
                poNumber: 'PO-2026-000021',
                imageData: dummyImage
            })
            .expect(200);

        assert.strictEqual(resSO.body.filename, 'SOPO21.png');
        assert.strictEqual(resSO.body.folder, 'SO');

        const resPO = await request(app)
            .post('/api/orders/save-snip')
            .send({
                docType: 'PO',
                poNumber: 'PO-5',
                imageData: dummyImage
            })
            .expect(200);

        assert.strictEqual(resPO.body.filename, 'PO5.png');
        assert.strictEqual(resPO.body.folder, 'PO');
    });

    test('4. POST /api/orders/save-snip validates presence of image data', async () => {
        const res = await request(app)
            .post('/api/orders/save-snip')
            .send({
                docType: 'SO',
                poNumber: 'PO-1'
            })
            .expect(400);

        assert.strictEqual(res.body.success, false);
        assert.ok(res.body.error);
    });

    test('5. Static files /vendor/html2canvas.min.js and /js/snipping-tool.js exist and are served', async () => {
        const resVendor = await request(app).get('/vendor/html2canvas.min.js').expect(200);
        assert.ok(resVendor.text.length > 50000);

        const resSnip = await request(app).get('/js/snipping-tool.js').expect(200);
        assert.ok(resSnip.text.includes('NKBSnippingTool'));
    });
});

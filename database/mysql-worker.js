const { parentPort, workerData } = require('worker_threads');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

let pool;
let isInitialized = false;
const transactions = new Map();
let transactionCounter = 0;

function serializeValue(value) {
    if (Buffer.isBuffer(value)) {
        return value.toString('utf8');
    }
    if (typeof value === 'bigint') {
        return Number(value);
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return value;
}

function serializeRows(result) {
    if (!Array.isArray(result)) {
        return result;
    }
    return result.map((row) => {
        const out = {};
        for (const [key, value] of Object.entries(row)) {
            out[key] = serializeValue(value);
        }
        return out;
    });
}

async function createPoolWithFallback() {
    const hostsToTry = [workerData.host || 'localhost', '127.0.0.1', 'localhost'].filter(
        (val, idx, self) => self.indexOf(val) === idx
    );

    let lastError;
    for (const host of hostsToTry) {
        try {
            const testPool = mysql.createPool({
                host,
                port: workerData.port || 3306,
                user: workerData.user,
                password: workerData.password,
                database: workerData.database,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                timezone: '+00:00',
                connectTimeout: 10000,
                multipleStatements: true
            });
            const conn = await testPool.getConnection();
            conn.release();
            return testPool;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('Could not connect to MySQL database');
}

async function ensureSchema(dbPool) {
    if (isInitialized) return;
    try {
        const [tables] = await dbPool.query("SHOW TABLES LIKE 'users'");
        if (!tables || tables.length === 0) {
            const schemaFile = path.join(__dirname, 'schema.mysql.sql');
            if (fs.existsSync(schemaFile)) {
                const schemaSql = fs.readFileSync(schemaFile, 'utf8');
                await dbPool.query(schemaSql);
                console.log('✅ MySQL schema auto-initialized successfully.');
            }
        }

        // Check if super admin exists
        const [users] = await dbPool.query("SELECT id FROM users WHERE email = 'admin@nkbmanufacturing.com' LIMIT 1");
        if (!users || users.length === 0) {
            const hash = bcrypt.hashSync('Admin123!', 10);
            await dbPool.query(
                "INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES ('a0000000-0000-0000-0000-000000000001', 'Executive Admin', 'admin@nkbmanufacturing.com', ?, 'SUPER_ADMIN', 1)",
                [hash]
            );
            console.log('👤 MySQL Super Admin auto-provisioned: admin@nkbmanufacturing.com');
        }

        isInitialized = true;
    } catch (err) {
        console.error('MySQL schema auto-check notice:', err.message);
    }
}

async function getPool() {
    if (!pool) {
        pool = await createPoolWithFallback();
        await ensureSchema(pool);
    }
    return pool;
}

parentPort.on('message', async (message) => {
    const { id, type, sql, params, mode, transactionId } = message;

    try {
        const dbPool = await getPool();

        if (type === 'query') {
            const executor = transactionId ? transactions.get(transactionId) : dbPool;
            if (transactionId && !executor) {
                throw new Error('Transaction connection not found');
            }

            const [result] = await executor.query(sql, params || []);

            if (mode === 'get' || mode === 'all') {
                parentPort.postMessage({ id, rows: serializeRows(result) });
                return;
            }

            parentPort.postMessage({
                id,
                rows: result,
                affectedRows: result.affectedRows || 0,
                insertId: result.insertId || 0
            });
            return;
        }

        if (type === 'exec') {
            const executor = transactionId ? transactions.get(transactionId) : dbPool;
            if (transactionId && !executor) {
                throw new Error('Transaction connection not found');
            }
            await executor.query(sql);
            parentPort.postMessage({ id, ok: true });
            return;
        }

        if (type === 'begin') {
            const txId = ++transactionCounter;
            const connection = await dbPool.getConnection();
            await connection.beginTransaction();
            transactions.set(txId, connection);
            parentPort.postMessage({ id, transactionId: txId });
            return;
        }

        if (type === 'commit') {
            const connection = transactions.get(transactionId);
            if (connection) {
                await connection.commit();
                connection.release();
                transactions.delete(transactionId);
            }
            parentPort.postMessage({ id, ok: true });
            return;
        }

        if (type === 'rollback') {
            const connection = transactions.get(transactionId);
            if (connection) {
                try {
                    await connection.rollback();
                } finally {
                    connection.release();
                    transactions.delete(transactionId);
                }
            }
            parentPort.postMessage({ id, ok: true });
            return;
        }

        throw new Error(`Unknown message type: ${type}`);
    } catch (error) {
        parentPort.postMessage({
            id,
            error: error.message,
            code: error.code || undefined
        });
    }
});

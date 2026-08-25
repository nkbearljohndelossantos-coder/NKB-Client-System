const { parentPort, workerData } = require('worker_threads');
const mysql = require('mysql2/promise');

let pool;
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

async function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: workerData.host,
            port: workerData.port,
            user: workerData.user,
            password: workerData.password,
            database: workerData.database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            timezone: '+00:00',
            connectTimeout: 10000
        });
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
            if (!connection) {
                throw new Error('Transaction not found');
            }
            await connection.commit();
            connection.release();
            transactions.delete(transactionId);
            parentPort.postMessage({ id, ok: true });
            return;
        }

        if (type === 'rollback') {
            const connection = transactions.get(transactionId);
            if (!connection) {
                throw new Error('Transaction not found');
            }
            await connection.rollback();
            connection.release();
            transactions.delete(transactionId);
            parentPort.postMessage({ id, ok: true });
        }
    } catch (error) {
        parentPort.postMessage({ id, error: error.message, code: error.code || null });
    }
});

const { Worker } = require('worker_threads');
const path = require('path');

function translateSql(sql) {
    if (/^\s*PRAGMA/i.test(sql)) {
        return null;
    }

    let translated = sql;

    translated = translated.replace(
        /CAST\s*\(\s*\(\s*julianday\s*\(\s*'now'\s*\)\s*-\s*julianday\s*\(\s*([a-zA-Z_][\w.]*)\s*\)\s*\)\s*AS\s*INTEGER\s*\)/gi,
        'DATEDIFF(CURDATE(), $1)'
    );
    translated = translated.replace(/datetime\s*\(\s*'now'\s*(?:,\s*'[^']*')?\s*\)/gi, 'NOW()');
    translated = translated.replace(/date\s*\(\s*'now'\s*(?:,\s*'[^']*')?\s*\)/gi, 'CURDATE()');
    translated = translated.replace(/date\s*\(\s*([a-zA-Z_][\w.]*)\s*\)/gi, 'DATE($1)');
    translated = translated.replace(
        /strftime\s*\(\s*'%Y-%m'\s*,\s*([a-zA-Z_][\w.]*)\s*\)/gi,
        "DATE_FORMAT($1, '%Y-%m')"
    );
    translated = translated.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT IGNORE INTO');

    if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(translated)) {
        translated = translated.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO');
        const columnMatch = translated.match(/INSERT\s+INTO\s+[\w.]+\s*\(([^)]+)\)/i);
        if (columnMatch) {
            const columns = columnMatch[1].split(',').map((column) => column.trim());
            const updates = columns
                .filter((column) => column.toLowerCase() !== 'id')
                .map((column) => `${column}=VALUES(${column})`)
                .join(', ');
            if (updates) {
                translated += ` ON DUPLICATE KEY UPDATE ${updates}`;
            }
        }
    }

    translated = translated.replace(
        /(\w+)\s*=\s*(\w+)\s*\|\|\s*'([^']*)'\s*\|\|\s*\?\s*\|\|\s*'([^']*)'/gi,
        "$1 = CONCAT($2, '$3', ?, '$4')"
    );

    return translated;
}

function isDuplicateKeyError(err) {
    return err?.code === 'ER_DUP_ENTRY'
        || (err?.message && err.message.includes('Duplicate entry'));
}

function createWorkerBridge(config) {
    const shared = new Int32Array(new SharedArrayBuffer(4));
    let nextId = 0;
    const results = new Map();

    const worker = new Worker(path.join(__dirname, 'mysql-worker.js'), {
        workerData: config
    });

    worker.on('message', (message) => {
        if (!message.id) {
            return;
        }
        results.set(message.id, message);
        Atomics.store(shared, 0, 1);
        Atomics.notify(shared, 0);
    });

    worker.on('error', (error) => {
        results.set(-1, { error: error.message });
        Atomics.store(shared, 0, 1);
        Atomics.notify(shared, 0);
    });

    function callWorker(payload, timeoutMs = 20000) {
        const id = ++nextId;
        Atomics.store(shared, 0, 0);

        const timeout = setTimeout(() => {
            if (results.has(id)) {
                return;
            }
            results.set(id, { error: `Database query timed out after ${timeoutMs}ms` });
            Atomics.store(shared, 0, 1);
            Atomics.notify(shared, 0);
        }, timeoutMs);

        worker.postMessage({ ...payload, id });
        Atomics.wait(shared, 0, 0);
        clearTimeout(timeout);

        const response = results.get(id);
        results.delete(id);

        if (!response) {
            throw new Error('Database worker returned no response');
        }
        if (response.error) {
            const error = new Error(response.error);
            error.code = response.code || undefined;
            throw error;
        }
        return response;
    }

    return { callWorker, worker };
}

function createMysqlAdapter() {
    if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
        throw new Error('Missing DB_USER, DB_PASSWORD, or DB_NAME environment variables');
    }

    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    };

    const { callWorker } = createWorkerBridge(config);
    let activeTransactionId = null;

    console.log(`🗄️  MySQL adapter ready: ${config.database} @ ${config.host}`);

    function exec(sql) {
        const statements = sql
            .split(';')
            .map((statement) => statement.trim())
            .filter(Boolean);

        for (const statement of statements) {
            const translated = translateSql(statement);
            if (!translated) {
                continue;
            }
            callWorker({
                type: 'exec',
                sql: translated,
                transactionId: activeTransactionId
            });
        }
    }

    function prepare(sql) {
        const translatedSql = translateSql(sql);
        if (!translatedSql) {
            return {
                get() { return undefined; },
                all() { return []; },
                run() { return { changes: 0 }; }
            };
        }

        return {
            get(...params) {
                const response = callWorker({
                    type: 'query',
                    sql: translatedSql,
                    params,
                    mode: 'get',
                    transactionId: activeTransactionId
                });
                const rows = response.rows;
                return Array.isArray(rows) ? rows[0] : rows;
            },
            all(...params) {
                const response = callWorker({
                    type: 'query',
                    sql: translatedSql,
                    params,
                    mode: 'all',
                    transactionId: activeTransactionId
                });
                return response.rows || [];
            },
            run(...params) {
                const response = callWorker({
                    type: 'query',
                    sql: translatedSql,
                    params,
                    mode: 'run',
                    transactionId: activeTransactionId
                });
                return {
                    changes: response.affectedRows || 0,
                    lastInsertRowid: response.insertId || 0
                };
            }
        };
    }

    function transaction(fn) {
        return function transactionWrapper(...args) {
            if (activeTransactionId) {
                return fn(...args);
            }

            const beginResponse = callWorker({ type: 'begin' });
            activeTransactionId = beginResponse.transactionId;

            try {
                const result = fn(...args);
                callWorker({ type: 'commit', transactionId: activeTransactionId });
                return result;
            } catch (error) {
                try {
                    callWorker({ type: 'rollback', transactionId: activeTransactionId });
                } catch (rollbackError) {
                    console.error('Transaction rollback failed:', rollbackError.message);
                }
                throw error;
            } finally {
                activeTransactionId = null;
            }
        };
    }

    return { exec, prepare, transaction };
}

module.exports = createMysqlAdapter;
module.exports.translateSql = translateSql;
module.exports.isDuplicateKeyError = isDuplicateKeyError;

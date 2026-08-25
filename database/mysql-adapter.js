require('dotenv').config();
const mysql = require('mysql2/promise');

let deasync;
try {
    deasync = require('deasync');
} catch (error) {
    console.warn('deasync not available; MySQL sync adapter requires it on the server.');
}

function wait(promise) {
    if (!deasync) {
        throw new Error('MySQL adapter requires deasync. Run: npm install');
    }

    let done = false;
    let result;
    let error;

    promise
        .then((value) => {
            result = value;
            done = true;
        })
        .catch((err) => {
            error = err;
            done = true;
        });

    deasync.loopWhile(() => !done);

    if (error) {
        throw error;
    }

    return result;
}

function translateSql(sql) {
    if (/^\s*PRAGMA/i.test(sql)) {
        return null;
    }

    let translated = sql;

    translated = translated.replace(/datetime\s*\(\s*'now'\s*(?:,\s*'[^']*')?\s*\)/gi, 'NOW()');
    translated = translated.replace(/date\s*\(\s*'now'\s*(?:,\s*'[^']*')?\s*\)/gi, 'CURDATE()');
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

function createMysqlAdapter() {
    if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
        throw new Error('Missing DB_USER, DB_PASSWORD, or DB_NAME environment variables');
    }

    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        timezone: '+00:00',
        connectTimeout: 10000
    });

    let transactionConnection = null;
    let connectionVerified = false;

    function getExecutor() {
        return transactionConnection || pool;
    }

    function runQuery(sql, params = []) {
        return wait(getExecutor().query(sql, params));
    }

    function verifyConnection() {
        if (connectionVerified) {
            return;
        }

        try {
            runQuery('SELECT 1');
            connectionVerified = true;
            console.log(`✅ Connected to MySQL: ${process.env.DB_NAME} @ ${process.env.DB_HOST || 'localhost'}`);
        } catch (error) {
            console.error(`❌ MySQL connection failed (${process.env.DB_HOST}/${process.env.DB_NAME}): ${error.message}`);
            throw error;
        }
    }

    function exec(sql) {
        verifyConnection();

        const statements = sql
            .split(';')
            .map((statement) => statement.trim())
            .filter(Boolean);

        for (const statement of statements) {
            const translated = translateSql(statement);
            if (!translated) {
                continue;
            }
            runQuery(translated);
        }
    }

    function prepare(sql) {
        const translatedSql = translateSql(sql);
        if (!translatedSql) {
            return {
                get() {
                    return undefined;
                },
                all() {
                    return [];
                },
                run() {
                    return { changes: 0 };
                }
            };
        }

        return {
            get(...params) {
                verifyConnection();
                const [rows] = runQuery(translatedSql, params);
                return Array.isArray(rows) ? rows[0] : rows;
            },
            all(...params) {
                verifyConnection();
                const [rows] = runQuery(translatedSql, params);
                return rows;
            },
            run(...params) {
                verifyConnection();
                const [result] = runQuery(translatedSql, params);
                return {
                    changes: result.affectedRows || 0,
                    lastInsertRowid: result.insertId || 0
                };
            }
        };
    }

    function transaction(fn) {
        return function transactionWrapper(...args) {
            if (transactionConnection) {
                return fn(...args);
            }

            const connection = wait(pool.getConnection());

            try {
                wait(connection.beginTransaction());
                transactionConnection = connection;
                const result = fn(...args);
                wait(connection.commit());
                return result;
            } catch (error) {
                try {
                    wait(connection.rollback());
                } catch (rollbackError) {
                    console.error('Transaction rollback failed:', rollbackError.message);
                }
                throw error;
            } finally {
                transactionConnection = null;
                connection.release();
            }
        };
    }

    return {
        exec,
        prepare,
        transaction
    };
}

module.exports = createMysqlAdapter;

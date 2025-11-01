/**
 * High-level SQLite API wrapper for WASM module
 */

const SQLITE_OK = 0;
const SQLITE_ROW = 100;
const SQLITE_DONE = 101;

class SQLiteDatabase {
    constructor(module, dbPtr) {
        this.module = module;
        this.dbPtr = dbPtr;
        this.closed = false;
    }

    /**
     * Set encryption key for the database (must be called right after opening)
     * @param {string} key - Encryption passphrase
     */
    setKey(key) {
        if (this.closed) throw new Error('Database is closed');
        try {
            // Set the encryption key
            // Our crypto provider uses sensible defaults (AES-256-CTR, PBKDF2-HMAC-SHA512, 256000 iterations)
            this.exec(`PRAGMA key = '${key.replace(/'/g, "''")}'`);
        } catch (e) {
            throw new Error(`Failed to set encryption key: ${e.message}`);
        }
    }

    /**
     * Re-key the database with a new encryption key
     * @param {string} newKey - New encryption passphrase
     */
    rekey(newKey) {
        if (this.closed) throw new Error('Database is closed');
        this.exec(`PRAGMA rekey = '${newKey.replace(/'/g, "''")}'`);
    }

    /**
     * Execute a SQL statement without returning results
     */
    exec(sql) {
        if (this.closed) throw new Error('Database is closed');

        const sqlPtr = this.module.allocateUTF8(sql);
        try {
            const errMsgPtr = this.module._malloc(4);

            const result = this.module._sqlite3_exec(
                this.dbPtr,
                sqlPtr,
                0, // no callback
                0, // no callback arg
                errMsgPtr
            );

            if (result !== SQLITE_OK) {
                const errPtr = this.module.getValue(errMsgPtr, 'i32');
                const errMsg = errPtr ? this.module.UTF8ToString(errPtr) : 'Unknown error';
                this.module._free(errMsgPtr);
                throw new Error(`SQLite error: ${errMsg}`);
            }

            this.module._free(errMsgPtr);
        } finally {
            this.module._free(sqlPtr);
        }
    }

    /**
     * Execute a SQL query and return results as array of objects
     */
    query(sql, params = []) {
        if (this.closed) throw new Error('Database is closed');

        const sqlPtr = this.module.allocateUTF8(sql);
        const stmtPtr = this.module._malloc(4);

        try {
            // Prepare statement
            const result = this.module._sqlite3_prepare_v2(
                this.dbPtr,
                sqlPtr,
                -1,
                stmtPtr,
                0
            );

            if (result !== SQLITE_OK) {
                const errMsg = this.getErrorMessage();
                throw new Error(`Failed to prepare statement: ${errMsg}`);
            }

            const stmt = this.module.getValue(stmtPtr, 'i32');
            if (!stmt) {
                throw new Error('Failed to prepare statement: null statement');
            }

            try {
                // Bind parameters if any
                this.bindParameters(stmt, params);

                // Get column names
                const columnCount = this.module._sqlite3_column_count(stmt);
                const columns = [];
                for (let i = 0; i < columnCount; i++) {
                    const namePtr = this.module._sqlite3_column_name(stmt, i);
                    columns.push(this.module.UTF8ToString(namePtr));
                }

                // Fetch rows
                const rows = [];
                while (true) {
                    const stepResult = this.module._sqlite3_step(stmt);

                    if (stepResult === SQLITE_DONE) {
                        break;
                    }

                    if (stepResult !== SQLITE_ROW) {
                        const errMsg = this.getErrorMessage();
                        throw new Error(`Step failed: ${errMsg}`);
                    }

                    const row = {};
                    for (let i = 0; i < columnCount; i++) {
                        const valuePtr = this.module._sqlite3_column_text(stmt, i);
                        row[columns[i]] = valuePtr ? this.module.UTF8ToString(valuePtr) : null;
                    }
                    rows.push(row);
                }

                return rows;
            } finally {
                this.module._sqlite3_finalize(stmt);
            }
        } finally {
            this.module._free(stmtPtr);
            this.module._free(sqlPtr);
        }
    }

    /**
     * Bind parameters to a prepared statement
     */
    bindParameters(stmt, params) {
        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            const index = i + 1; // SQLite indices are 1-based

            if (param === null || param === undefined) {
                // SQLite will bind as NULL by default
                continue;
            } else if (typeof param === 'number') {
                if (Number.isInteger(param)) {
                    this.module._sqlite3_bind_int(stmt, index, param);
                } else {
                    this.module._sqlite3_bind_double(stmt, index, param);
                }
            } else if (typeof param === 'string') {
                const strPtr = this.module.allocateUTF8(param);
                this.module._sqlite3_bind_text(stmt, index, strPtr, -1, 0);
                // Note: we're leaking strPtr here for simplicity
                // In production, you'd need better memory management
            } else {
                throw new Error(`Unsupported parameter type: ${typeof param}`);
            }
        }
    }

    /**
     * Get the last error message
     */
    getErrorMessage() {
        const errPtr = this.module._sqlite3_errmsg(this.dbPtr);
        return errPtr ? this.module.UTF8ToString(errPtr) : 'Unknown error';
    }

    /**
     * Get the number of rows affected by the last INSERT, UPDATE, or DELETE
     */
    getChanges() {
        return this.module._sqlite3_changes(this.dbPtr);
    }

    /**
     * Close the database
     */
    close() {
        if (this.closed) return;

        this.module._sqlite3_close(this.dbPtr);
        this.closed = true;
    }
}

class SQLiteAPI {
    constructor(module) {
        this.module = module;
    }

    /**
     * Open a database
     * @param {string} filename - Database filename (or ':memory:' for in-memory)
     * @param {string} [key] - Optional encryption key for SQLCipher
     */
    open(filename = ':memory:', key = null) {
        const filenamePtr = this.module.allocateUTF8(filename);
        const dbPtrPtr = this.module._malloc(4);

        try {
            const result = this.module._sqlite3_open(filenamePtr, dbPtrPtr);

            if (result !== SQLITE_OK) {
                throw new Error(`Failed to open database: ${result}`);
            }

            const dbPtr = this.module.getValue(dbPtrPtr, 'i32');
            if (!dbPtr) {
                throw new Error('Failed to open database: null pointer');
            }

            const db = new SQLiteDatabase(this.module, dbPtr);

            // Set encryption key if provided
            if (key) {
                db.setKey(key);
            }

            return db;
        } finally {
            this.module._free(dbPtrPtr);
            this.module._free(filenamePtr);
        }
    }
}

/**
 * Initialize the SQLite API from a WASM module
 */
async function initSQLite(modulePath) {
    const wasmModule = require(modulePath);

    return new Promise((resolve, reject) => {
        const initialize = () => {
            // OpenSSL is initialized automatically by SQLCipher
            resolve(new SQLiteAPI(wasmModule));
        };

        if (wasmModule.calledRun) {
            initialize();
        } else {
            wasmModule.onRuntimeInitialized = initialize;
        }
    });
}

module.exports = { initSQLite, SQLiteAPI, SQLiteDatabase };

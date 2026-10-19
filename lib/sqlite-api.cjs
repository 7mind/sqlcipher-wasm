/**
 * High-level SQLite API wrapper for WASM module
 */

const SQLITE_OK = 0;
const SQLITE_ROW = 100;
const SQLITE_DONE = 101;
const SQLITE_INTEGER = 1;
const SQLITE_FLOAT = 2;
const SQLITE_TEXT = 3;
const SQLITE_BLOB = 4;
const SQLITE_NULL = 5;
const SQLITE_TRANSIENT = -1;
const MIN_SAFE_INTEGER = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

class SQLiteDatabase {
    constructor(module, dbPtr) {
        this.module = module;
        this.dbPtr = dbPtr;
        this.closed = false;
        this.textDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
    }

    /**
     * Set encryption key for the database (must be called right after opening)
     * @param {string} key - Encryption passphrase
     */
    setKey(key) {
        if (this.closed) throw new Error('Database is closed');
        try {
            // Set the encryption key
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
        return this.executeQuery(sql, params, (stmt, columns) => {
            const row = {};
            for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
                const valuePtr = this.module._sqlite3_column_text(stmt, columnIndex);
                row[columns[columnIndex]] = valuePtr ? this.module.UTF8ToString(valuePtr) : null;
            }
            return row;
        });
    }

    queryTyped(sql, params = []) {
        return this.executeQuery(sql, params, (stmt, columns) =>
            Object.fromEntries(columns.map((name, columnIndex) =>
                [name, this.readTypedValue(stmt, columnIndex)])));
    }

    readTypedValue(stmt, columnIndex) {
        const storageClass = this.module._sqlite3_column_type(stmt, columnIndex);
        switch (storageClass) {
            case SQLITE_INTEGER: {
                const value = this.module._sqlite3_column_int64(stmt, columnIndex);
                return value >= MIN_SAFE_INTEGER && value <= MAX_SAFE_INTEGER
                    ? { type: 'number', value: Number(value) } : { type: 'bigint', value };
            }
            case SQLITE_FLOAT:
                return { type: 'number', value: this.module._sqlite3_column_double(stmt, columnIndex) };
            case SQLITE_TEXT:
            case SQLITE_BLOB: {
                const pointer = storageClass === SQLITE_TEXT
                    ? this.module._sqlite3_column_text(stmt, columnIndex)
                    : this.module._sqlite3_column_blob(stmt, columnIndex);
                const length = this.module._sqlite3_column_bytes(stmt, columnIndex);
                const bytes = new Uint8Array(length);
                for (let byteIndex = 0; byteIndex < length; byteIndex++) {
                    bytes[byteIndex] = this.module.getValue(pointer + byteIndex, 'i8');
                }
                return storageClass === SQLITE_TEXT
                    ? { type: 'string', value: this.textDecoder.decode(bytes) } : { type: 'blob', value: bytes };
            }
            case SQLITE_NULL:
                return { type: 'null', value: null };
            default:
                throw new Error(`Unsupported SQLite storage class: ${storageClass}`);
        }
    }

    executeQuery(sql, params, readRow) {
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
                for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
                    const namePtr = this.module._sqlite3_column_name(stmt, columnIndex);
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

                    rows.push(readRow(stmt, columns));
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
        for (let parameterIndex = 0; parameterIndex < params.length; parameterIndex++) {
            const param = params[parameterIndex];
            const index = parameterIndex + 1; // SQLite indices are 1-based

            let result;
            if (param === null || param === undefined) {
                result = this.module._sqlite3_bind_null(stmt, index);
            } else if (typeof param === 'number') {
                if (Number.isSafeInteger(param)) {
                    result = this.module._sqlite3_bind_int64(stmt, index, BigInt(param));
                } else {
                    result = this.module._sqlite3_bind_double(stmt, index, param);
                }
            } else if (typeof param === 'string') {
                const strPtr = this.module.allocateUTF8(param);
                try {
                    result = this.module._sqlite3_bind_text(
                        stmt, index, strPtr, this.module.lengthBytesUTF8(param), SQLITE_TRANSIENT
                    );
                } finally {
                    this.module._free(strPtr);
                }
            } else {
                throw new Error(`Unsupported parameter type: ${typeof param}`);
            }
            if (result !== SQLITE_OK) {
                throw new Error(`Failed to bind parameter ${index}: ${this.getErrorMessage()}`);
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

    getModule() {
        return this.module;
    }
}

/**
 * Initialize the SQLite API from a WASM module
 */
async function initSQLite() {
    const wasmModule = require('../dist/sqlcipher.cjs');
    return new Promise((resolve) => {
        const initialize = () => {
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

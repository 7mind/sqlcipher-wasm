
import initSqlcipher from '../dist/sqlcipher.mjs';

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

export class SQLiteDatabase {
    constructor(module, dbPtr) {
        this.module = module;
        this.dbPtr = dbPtr;
        this.closed = false;
        this.textDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
    }

    setKey(key) {
        if (this.closed) throw new Error('Database is closed');
        try {
            this.exec(`PRAGMA key = '${key.replace(/'/g, "''")}'`);
        } catch (e) {
            throw new Error(`Failed to set encryption key: ${e.message}`);
        }
    }

    rekey(newKey) {
        if (this.closed) throw new Error('Database is closed');
        this.exec(`PRAGMA rekey = '${newKey.replace(/'/g, "''")}'`);
    }

    exec(sql) {
        if (this.closed) throw new Error('Database is closed');

        const sqlPtr = this.module.allocateUTF8(sql);
        try {
            const errMsgPtr = this.module._malloc(4);

            const result = this.module._sqlite3_exec(
                this.dbPtr,
                sqlPtr,
                0, 
                0, 
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
                this.bindParameters(stmt, params);

                const columnCount = this.module._sqlite3_column_count(stmt);
                const columns = [];
                for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
                    const namePtr = this.module._sqlite3_column_name(stmt, columnIndex);
                    columns.push(this.module.UTF8ToString(namePtr));
                }

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

    bindParameters(stmt, params) {
        for (let parameterIndex = 0; parameterIndex < params.length; parameterIndex++) {
            const param = params[parameterIndex];
            const index = parameterIndex + 1;

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

    getErrorMessage() {
        const errPtr = this.module._sqlite3_errmsg(this.dbPtr);
        return errPtr ? this.module.UTF8ToString(errPtr) : 'Unknown error';
    }

    getChanges() {
        return this.module._sqlite3_changes(this.dbPtr);
    }

    close() {
        if (this.closed) return;

        this.module._sqlite3_close(this.dbPtr);
        this.closed = true;
    }
}

export class SQLiteAPI {
    constructor(module) {
        this.module = module;
    }

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

export async function init() {
    const wasmModule = await initSqlcipher();
    return new SQLiteAPI(wasmModule);
}

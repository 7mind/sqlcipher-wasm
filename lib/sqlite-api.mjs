
import initSqlcipher from '../dist/sqlcipher.mjs';

const SQLITE_OK = 0;
const SQLITE_ROW = 100;
const SQLITE_DONE = 101;

export class SQLiteDatabase {
    constructor(module, dbPtr) {
        this.module = module;
        this.dbPtr = dbPtr;
        this.closed = false;
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
                for (let i = 0; i < columnCount; i++) {
                    const namePtr = this.module._sqlite3_column_name(stmt, i);
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

    bindParameters(stmt, params) {
        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            const index = i + 1;

            if (param === null || param === undefined) {
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
            } else {
                throw new Error(`Unsupported parameter type: ${typeof param}`);
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

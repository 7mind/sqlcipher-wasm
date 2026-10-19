export interface EmscriptenModule {
    FS: {
        readFile(path: string): Uint8Array;
        writeFile(path: string, data: Uint8Array | string): void;
    };
    allocateUTF8(value: string): number;
    lengthBytesUTF8(value: string): number;
    UTF8ToString(pointer: number): string;
    getValue(pointer: number, type: string): number;
    _malloc(size: number): number;
    _free(pointer: number): void;
    _sqlite3_open(filename: number, database: number): number;
    _sqlite3_close(database: number): number;
    _sqlite3_exec(database: number, sql: number, callback: number, argument: number, error: number): number;
    _sqlite3_prepare_v2(database: number, sql: number, length: number, statement: number, tail: number): number;
    _sqlite3_step(statement: number): number;
    _sqlite3_finalize(statement: number): number;
    _sqlite3_column_count(statement: number): number;
    _sqlite3_column_name(statement: number, column: number): number;
    _sqlite3_column_text(statement: number, column: number): number;
    _sqlite3_column_type(statement: number, column: number): number;
    _sqlite3_column_int64(statement: number, column: number): bigint;
    _sqlite3_column_double(statement: number, column: number): number;
    _sqlite3_column_blob(statement: number, column: number): number;
    _sqlite3_column_bytes(statement: number, column: number): number;
    _sqlite3_bind_int(statement: number, index: number, value: number): number;
    _sqlite3_bind_int64(statement: number, index: number, value: bigint): number;
    _sqlite3_bind_null(statement: number, index: number): number;
    _sqlite3_bind_double(statement: number, index: number, value: number): number;
    _sqlite3_bind_text(statement: number, index: number, value: number, length: number, destructor: number): number;
    _sqlite3_errmsg(database: number): number;
    _sqlite3_changes(database: number): number;
}

export type SQLiteRow = Record<string, string | null>;
export type SQLiteTypedValue =
    | { type: 'number'; value: number }
    | { type: 'bigint'; value: bigint }
    | { type: 'string'; value: string }
    | { type: 'blob'; value: Uint8Array }
    | { type: 'null'; value: null };
export type SQLiteTypedRow = Record<string, SQLiteTypedValue>;

export class SQLiteDatabase {
    constructor(module: EmscriptenModule, dbPtr: number);
    module: EmscriptenModule;
    dbPtr: number;
    closed: boolean;
    setKey(key: string): void;
    rekey(newKey: string): void;
    exec(sql: string): void;
    query(sql: string, params?: (string | number | null)[]): SQLiteRow[];
    queryTyped(sql: string, params?: (string | number | null)[]): SQLiteTypedRow[];
    bindParameters(stmt: number, params: (string | number | null)[]): void;
    getErrorMessage(): string;
    getChanges(): number;
    close(): void;
}

export class SQLiteAPI {
    constructor(module: EmscriptenModule);
    module: EmscriptenModule;
    open(filename?: string, key?: string): SQLiteDatabase;
    getModule(): EmscriptenModule;
}

export function initSQLite(): Promise<SQLiteAPI>;


declare module '@7mind.io/sqlcipher-wasm' {
    export class SQLiteDatabase {
        constructor(module: any, dbPtr: number);
        setKey(key: string): void;
        rekey(newKey: string): void;
        exec(sql: string): void;
        query(sql: string, params?: (string | number | null)[]): any[];
        bindParameters(stmt: number, params: (string | number | null)[]): void;
        getErrorMessage(): string;
        getChanges(): number;
        close(): void;
    }

    export class SQLiteAPI {
        constructor(module: any);
        open(filename?: string, key?: string): SQLiteDatabase;
    }

    export function init(): Promise<SQLiteAPI>;
}

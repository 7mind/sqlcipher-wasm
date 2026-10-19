
import type { EmscriptenModule, SQLiteDatabase } from './sqlite-api.cjs';

export { SQLiteDatabase } from './sqlite-api.cjs';
export type { EmscriptenModule, SQLiteRow, SQLiteTypedValue, SQLiteTypedRow } from './sqlite-api.cjs';

export class SQLiteAPI {
    constructor(module: EmscriptenModule);
    module: EmscriptenModule;
    open(filename?: string, key?: string): SQLiteDatabase;
}

export function init(): Promise<SQLiteAPI>;

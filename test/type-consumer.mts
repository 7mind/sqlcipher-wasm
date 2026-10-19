import { init } from '@7mind.io/sqlcipher-wasm';
import type { EmscriptenModule, SQLiteRow, SQLiteTypedRow, SQLiteTypedValue } from '@7mind.io/sqlcipher-wasm';

function formatValue(value: SQLiteTypedValue): string {
    switch (value.type) {
        case 'number': return value.value.toFixed(2);
        case 'bigint': return (value.value + 1n).toString();
        case 'string': return value.value;
        case 'blob': return value.value.join(',');
        case 'null': return String(value.value);
    }
    const unreachable: never = value;
    return unreachable;
}

type Rejects<Value extends false> = Value;
type MissingHeap = Rejects<Omit<EmscriptenModule, 'HEAPU8'> extends EmscriptenModule ? true : false>;
type InvalidNumber = Rejects<{ type: 'number'; value: string } extends SQLiteTypedValue ? true : false>;
type InvalidBigint = Rejects<{ type: 'bigint'; value: number } extends SQLiteTypedValue ? true : false>;
type InvalidString = Rejects<{ type: 'string'; value: null } extends SQLiteTypedValue ? true : false>;
type InvalidBlob = Rejects<{ type: 'blob'; value: string } extends SQLiteTypedValue ? true : false>;
type InvalidNull = Rejects<{ type: 'null'; value: number } extends SQLiteTypedValue ? true : false>;
type MissingNullPayload = Rejects<{ type: 'null' } extends SQLiteTypedValue ? true : false>;
type InvalidTag = Rejects<{ type: 'integer'; value: number } extends SQLiteTypedValue ? true : false>;

async function main(): Promise<void> {
    const sqlite = await init();
    const heap: Uint8Array = sqlite.module.HEAPU8;
    console.log(heap.byteLength);
    const db = sqlite.open();
    const legacy: SQLiteRow[] = db.query('SELECT 42 AS value');
    const typed: SQLiteTypedRow[] = db.queryTyped('SELECT ? AS value', [42]);
    const inferred: SQLiteTypedValue = db.queryTyped('SELECT 9223372036854775807 AS value')[0].value;
    const text: string | null = legacy[0].value;
    const payload: number | bigint | string | Uint8Array | null = inferred.value;
    console.log(text, formatValue(typed[0].value), formatValue(inferred), payload);
    db.close();
}

main().catch(console.error);

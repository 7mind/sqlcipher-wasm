#!/usr/bin/env node

const assert = require('node:assert/strict');
const { initSQLite } = require('../lib/sqlite-api.cjs');

function checkTypedQueries(sqlite) {
    const db = sqlite.open();
    assert.equal(typeof db.queryTyped, 'function');
    try {
        const integers = [
            '-9223372036854775808', '-9007199254740993', '-9007199254740992', '-9007199254740991',
            '-9007199254740990', '-2147483649', '0', '2147483648',
            '9007199254740990', '9007199254740991', '9007199254740992',
            '9007199254740993', '9223372036854775807'
        ];
        for (const integer of integers) {
            const exact = BigInt(integer);
            const expected = exact >= BigInt(Number.MIN_SAFE_INTEGER) && exact <= BigInt(Number.MAX_SAFE_INTEGER)
                ? Number(exact) : exact;
            assert.deepEqual(db.queryTyped(`SELECT ${integer} AS value`), [{ value: { type: typeof expected, value: expected } }]);
            assert.deepEqual(db.query(`SELECT ${integer} AS value`), [{ value: integer }]);
        }

        assert.deepEqual(db.queryTyped('SELECT 1.0 AS integral_real, ? AS real, ? AS text, ? AS missing',
            [1.25, 'Привіт 🌍', null]), [{ integral_real: { type: 'number', value: 1 }, real: { type: 'number', value: 1.25 },
                text: { type: 'string', value: 'Привіт 🌍' }, missing: { type: 'null', value: null } }]);
        assert.deepEqual(db.queryTyped('SELECT ? AS value', [Number.MAX_SAFE_INTEGER]), [{ value: { type: 'number', value: Number.MAX_SAFE_INTEGER } }]);
        assert.deepEqual(db.queryTyped('SELECT ? AS value', [Number.MIN_SAFE_INTEGER]), [{ value: { type: 'number', value: Number.MIN_SAFE_INTEGER } }]);
        assert.deepEqual(db.queryTyped('SELECT ? AS value', [Number.MAX_VALUE]), [{ value: { type: 'number', value: Number.MAX_VALUE } }]);

        const mixedSql = `SELECT 42 AS value UNION ALL SELECT 1.5 UNION ALL SELECT '0042'
            UNION ALL SELECT x'00ff' UNION ALL SELECT NULL`;
        assert.deepEqual(db.queryTyped(mixedSql), [
            { value: { type: 'number', value: 42 } }, { value: { type: 'number', value: 1.5 } },
            { value: { type: 'string', value: '0042' } }, { value: { type: 'blob', value: new Uint8Array([0, 255]) } },
            { value: { type: 'null', value: null } }
        ]);
        assert.deepEqual(db.queryTyped(`SELECT 'true' AS boolean_text, '{"id":1}' AS json_text,
            '2026-10-19' AS date_text, TRUE AS boolean_integer`), [
            { boolean_text: { type: 'string', value: 'true' }, json_text: { type: 'string', value: '{"id":1}' },
                date_text: { type: 'string', value: '2026-10-19' }, boolean_integer: { type: 'number', value: 1 } }
        ]);

        const text = '\uFEFFПривіт\0🌍\0end';
        const hex = Buffer.from(text).toString('hex');
        assert.deepEqual(db.queryTyped(`SELECT CAST(x'${hex}' AS TEXT) AS value, '' AS empty`), [
            { value: { type: 'string', value: text }, empty: { type: 'string', value: '' } }
        ]);
        assert.deepEqual(db.queryTyped('SELECT ? AS value', [text]), [{ value: { type: 'string', value: text } }]);
        assert.deepEqual(db.query(`SELECT CAST(x'610062' AS TEXT) AS value`), [{ value: 'a' }]);

        const blobs = db.queryTyped(`SELECT x'00ff0180' AS first, x'00ff0180' AS second,
            x'' AS empty, NULL AS missing`)[0];
        assert.deepEqual(blobs, {
            first: { type: 'blob', value: new Uint8Array([0, 255, 1, 128]) },
            second: { type: 'blob', value: new Uint8Array([0, 255, 1, 128]) },
            empty: { type: 'blob', value: new Uint8Array(0) }, missing: { type: 'null', value: null }
        });
        assert.equal(Object.hasOwn(blobs.missing, 'value'), true);
        assert.notEqual(blobs.first.value.buffer, blobs.second.value.buffer);
        blobs.first.value[0] = 123;
        for (let queryIndex = 0; queryIndex < 20; queryIndex++) {
            db.queryTyped('SELECT randomblob(65536) AS value');
        }
        assert.deepEqual(blobs.first.value, new Uint8Array([123, 255, 1, 128]));
        assert.deepEqual(blobs.second.value, new Uint8Array([0, 255, 1, 128]));

        const names = db.queryTyped(`SELECT 7 AS "__proto__", 'own' AS "constructor", 1.5 AS "toString",
            NULL AS "", x'01' AS "space name", 8 AS "Привіт", 1 AS duplicate, 2 AS duplicate`)[0];
        assert.equal(Object.getPrototypeOf(names), Object.prototype);
        assert.equal(Object.hasOwn(names, '__proto__'), true);
        assert.deepEqual(names.__proto__, { type: 'number', value: 7 });
        assert.deepEqual(names.constructor, { type: 'string', value: 'own' });
        assert.deepEqual(names.toString, { type: 'number', value: 1.5 });
        assert.deepEqual(names[''], { type: 'null', value: null });
        assert.deepEqual(names['space name'], { type: 'blob', value: new Uint8Array([1]) });
        assert.deepEqual(names['Привіт'], { type: 'number', value: 8 });
        assert.deepEqual(names.duplicate, { type: 'number', value: 2 });
        assert.deepEqual(Object.keys(names), ['__proto__', 'constructor', 'toString', '', 'space name', 'Привіт', 'duplicate']);

        assert.deepEqual(db.queryTyped('SELECT 1 AS value WHERE 0'), []);
        assert.deepEqual(db.queryTyped('CREATE TABLE typed_values (value UNIQUE)'), []);
        assert.deepEqual(db.queryTyped('INSERT INTO typed_values VALUES (?)', [3]), []);
        assert.throws(() => db.queryTyped('INSERT INTO typed_values VALUES (?)', [3]), /Step failed:.*UNIQUE/);
        assert.throws(() => db.queryTyped('SELECT FROM'), /Failed to prepare statement/);
        assert.throws(() => db.queryTyped(''), /null statement/);
        assert.throws(() => db.queryTyped('SELECT ?', [{}]), /Unsupported parameter type: object/);
        assert.deepEqual(db.queryTyped('SELECT value FROM typed_values'), [{ value: { type: 'number', value: 3 } }]);
        assert.deepEqual(db.query('SELECT 42 AS integer_value, 1.5 AS real_value, NULL AS missing, x\'6162\' AS blob_value'), [
            { integer_value: '42', real_value: '1.5', missing: null, blob_value: 'ab' }
        ]);
        const parityRows = db.queryTyped(mixedSql);
        db.close();
        assert.deepEqual(blobs.first.value, new Uint8Array([123, 255, 1, 128]));
        assert.deepEqual(blobs.second.value, new Uint8Array([0, 255, 1, 128]));
        return parityRows;
    } finally {
        db.close();
        assert.throws(() => db.queryTyped('SELECT 1'), /Database is closed/);
        assert.throws(() => db.query('SELECT 1'), /Database is closed/);
    }
}

function checkBindings(sqlite) {
    const db = sqlite.open();
    try {
        assert.deepEqual(db.query('SELECT ? AS value', [2147483648]), [{ value: '2147483648' }]);
        assert.deepEqual(db.query("SELECT hex(?) AS value", ['a\0b']), [{ value: '610062' }]);
        const module = sqlite.module;
        const allocateUTF8 = module.allocateUTF8;
        const free = module._free;
        const allocations = [];
        const releases = [];
        module.allocateUTF8 = value => {
            const pointer = allocateUTF8(value);
            allocations.push(pointer);
            return pointer;
        };
        module._free = pointer => {
            releases.push(pointer);
            free(pointer);
        };
        try {
            db.query('SELECT ? AS value', ['owned']);
            assert.equal(allocations.length, 2);
            for (const pointer of allocations) assert(releases.includes(pointer), 'SQL and bound text buffers must be freed');
            assert.throws(() => db.query('SELECT 1', ['extra']), /Failed to bind parameter 1/);
            assert.throws(() => db.query('SELECT ?, ?', ['owned before failure', {}]), /Unsupported parameter type/);
            for (const pointer of allocations) assert(releases.includes(pointer), 'Temporary buffers must be freed after binding errors');
        } finally {
            module.allocateUTF8 = allocateUTF8;
            module._free = free;
        }
    } finally {
        db.close();
    }
}

function checkNullBindings(sqlite) {
    const db = sqlite.open();
    try {
        db.exec('CREATE TABLE null_binding_writes (value)');
        for (const method of ['query', 'queryTyped']) {
            const missing = method === 'queryTyped' ? { type: 'null', value: null } : null;
            for (const param of [null, undefined]) {
                assert.deepEqual(db[method]('SELECT ? AS value', [param]), [{ value: missing }]);
                assert.throws(() => db[method]('INSERT INTO null_binding_writes VALUES (99)', [param]),
                    /Failed to bind parameter 1/);
                assert.deepEqual(db.queryTyped('SELECT count(*) AS count FROM null_binding_writes'), [{ count: { type: 'number', value: 0 } }]);
                assert.throws(() => db[method]('INSERT INTO null_binding_writes VALUES (?)', ['not inserted', param]),
                    /Failed to bind parameter 2/);
                assert.deepEqual(db.queryTyped('SELECT count(*) AS count FROM null_binding_writes'), [{ count: { type: 'number', value: 0 } }]);
            }
            assert.deepEqual(db[method]('SELECT ? AS value'), [{ value: missing }]);
        }
    } finally {
        db.close();
    }
}

async function main() {
    const commonjs = await initSQLite();
    const { init } = await import('../lib/sqlite-api.mjs');
    const esm = await init();
    let failures = 0;
    const results = [];
    for (const [name, sqlite] of [['CommonJS', commonjs], ['ESM', esm]]) {
        for (const [label, check] of [['typed results', checkTypedQueries], ['parameter binding/lifetime', checkBindings],
            ['NULL parameter binding', checkNullBindings]]) {
            try {
                const result = check(sqlite);
                if (label === 'typed results') results.push(result);
                console.log(`PASS ${name} ${label}`);
            } catch (error) {
                failures++;
                console.error(`FAIL ${name} ${label}:`, error);
            }
        }
    }
    if (failures) throw new Error(`${failures} typed-query checks failed`);
    assert.deepEqual(results[0], results[1]);
    console.log('PASS CommonJS/ESM result parity');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

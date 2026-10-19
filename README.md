# SQLCipher WebAssembly

[![npm version](https://badge.fury.io/js/%407mind.io%2Fsqlcipher-wasm.svg)](https://www.npmjs.com/package/@7mind.io/sqlcipher-wasm)
[![CI/CD](https://github.com/7mind/sqlcipher-wasm/workflows/CI%2FCD/badge.svg)](https://github.com/7mind/sqlcipher-wasm/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Builds [SQLCipher](https://www.zetetic.net/sqlcipher/) for Node.js, browsers, and Unity WebGL. Standalone WASM and prebuilt Unity libraries use OpenSSL; the Unity source bundle uses libtomcrypt and compiles with Unity's own toolchain.

## Features

- **Encryption**: SQLCipher v4.9.0 with OpenSSL 3.3.2 or libtomcrypt 1.18.2
- **JavaScript API**: CommonJS initialization for Node.js and ES module initialization for browsers
- **Database Portability**: Import and export database bytes through the Emscripten virtual filesystem
- **Tests**: 6 Node.js test suites covering SQL operations, virtual files, encryption, and native-to-WASM compatibility
- **Nix Flake Environment**: Reproducible development environment
- **Benchmarks**: Allocation, JavaScript string and buffer operations, and C function call overhead

## Security

Both crypto providers use SQLCipher v4 defaults unless configured through SQLCipher PRAGMAs:

- **AES-256-CBC** encryption
- **PBKDF2-HMAC-SHA512** key derivation (256,000 iterations by default)
- **HMAC-SHA512** for page authentication
- **4,096-byte** database pages

Native and WASM databases require matching SQLCipher format parameters, including page size, key derivation, and HMAC settings. See [Cross-Platform Compatibility](#cross-platform-compatibility) for file transfer and validation.

## Prerequisites

- [Nix](https://nixos.org/download.html) with flakes enabled
- [direnv](https://direnv.net/) (optional but recommended)

### Enable Nix Flakes

Add to your `~/.config/nix/nix.conf` (or `/etc/nix/nix.conf`):

```
experimental-features = nix-command flakes
```

## Build Variants

Three build targets are available, all using SQLCipher v4.9.0:

| Target | Script(s) | Shell | Emscripten | Crypto | Output |
|--------|-----------|-------|------------|--------|--------|
| **WASM** (Node.js/Browser) | `build-openssl.sh` → `build-wasm.sh` | `nix develop` | 4.0.12 (pinned) | OpenSSL 3.3.2 | `dist/` + `target/results/sqlcipher-wasm.zip` |
| **WebGL** (Unity 2022.3.22f) | `build-openssl.sh` → `build-webgl.sh` | `nix develop .#webgl` | 3.1.10 (pinned) | OpenSSL 3.3.2 | `target/results/sqlcipher-webgl.zip` |
| **Amalgamation** (non-pthread Unity WebGL) | `build-libtomcrypt.sh` → `build-amalgamation.sh` | `nix develop` | consumer toolchain (source bundle) | libtomcrypt 1.18.2 | `target/results/sqlcipher-amalgamation.zip` |

The Unity builds enable additional SQLite features, including `SQLITE_ENABLE_SNAPSHOT` and `SQLITE_ENABLE_COLUMN_METADATA`.

### Choosing a Unity build

The **WebGL** target emits `libsqlcipher.a` and OpenSSL static libraries built with emcc 3.1.10 for Unity 2022.3.22f. The consuming Unity toolchain must match the libraries' ABI.

The **Amalgamation** target ships C source (`sqlite3.c`, `libtomcrypt.c`, and headers) for Unity's bundled emcc to compile. Maintained source-bundle validation covers non-pthread consumers only. The repository does not pin the consumer's emcc; validate the resulting application with your actual Unity version and toolchain rather than assuming cross-version compatibility.

The source bundle uses a curated libtomcrypt amalgamation containing AES, SHA1/2, HMAC, CBC/ECB, PBKDF2, PRNGs, and registration helpers. Compile-time configuration and quoted sibling includes are included in the bundle, so Unity does not need an OpenSSL configuration step or custom include paths.

### Source bundle threading limitation

The tested pthread-enabled source consumers fail to complete SQLCipher initialization: with emcc 4.0.12 and `-pthread`, an initialization probe times out after 8 seconds. The same probe without `-pthread` and a separate pthread create/join control complete successfully. This tested pthread configuration has not passed initialization. These results do not establish that other Unity configurations fail; validate each consuming application and toolchain.

The baked `SQLITE_THREADSAFE=1` configures SQLite mutex support; it does not enable Emscripten pthreads or establish working pthread-enabled initialization. For a non-pthread application, validate initialization, encrypted reads/writes, rekeying, and incorrect-key rejection with the exact consuming toolchain. The Node.js wrapper suites do not validate a Unity application.

## Quick Start

### WASM (Node.js / Browser)

Interactive:

```bash
nix develop
./build-openssl.sh
./build-wasm.sh
./tools/prepare-cross-platform-test.sh
npm test
```

One-liner:

```bash
nix develop --command bash -c './build-openssl.sh && ./build-wasm.sh'
```

### WebGL (Unity 2022.3.22f, prebuilt .a)

Interactive:

```bash
nix develop .#webgl
./build-openssl.sh
./build-webgl.sh
```

One-liner:

```bash
nix develop .#webgl --command bash -c './build-openssl.sh && ./build-webgl.sh'
```

### Amalgamation (non-pthread Unity WebGL — source bundle)

Interactive:

```bash
nix develop
./build-libtomcrypt.sh
./build-amalgamation.sh
```

One-liner:

```bash
nix develop --command bash -c './build-libtomcrypt.sh && ./build-amalgamation.sh'
```

The output `target/results/sqlcipher-amalgamation/` is a flat drop-in directory:

```
sqlite3.c              SQLCipher amalgamation (compile flags baked in at top)
sqlite3.h              SQLCipher public header
libtomcrypt.c          curated libtomcrypt amalgamation
tomcrypt*.h            13 libtomcrypt headers (angled includes rewritten to quoted)
LICENSE_libtomcrypt    libtomcrypt license
README.txt             Unity integration notes
```

Copy the entire directory into `Assets/Plugins/WebGL/sqlcipher/` for a non-pthread WebGL build. SQLCipher/SQLite defines are prepended to the C sources, and headers use quoted sibling includes; no additional SQLCipher defines, include paths, or force-includes are required. This does not configure Unity's threading settings. Build and test the actual Unity application after integration; see [Source bundle threading limitation](#source-bundle-threading-limitation).

## Project Structure

```
.
├── flake.nix                       # Nix flake (default + webgl shells)
├── .envrc                          # direnv configuration
├── lib.sh                          # Shared build utilities (includes patch_amalgamation)
├── build-openssl.sh                # OpenSSL WASM build script
├── build-wasm.sh                   # SQLCipher WASM build (CJS/ESM)
├── build-webgl.sh                  # SQLCipher static lib build (Unity WebGL, emcc-pinned)
├── build-libtomcrypt.sh            # libtomcrypt curated-amalgamation stage (no emcc)
├── build-amalgamation.sh           # SQLCipher + libtomcrypt source bundle (non-pthread Unity WebGL)
├── package.json                    # NPM package configuration
├── target/
│   ├── build/                      # Intermediate build artifacts
│   │   ├── openssl-3.3.2.tar.gz    # OpenSSL source archive (shared)
│   │   ├── libtomcrypt-1.18.2/     # libtomcrypt source (shared)
│   │   ├── libtomcrypt-amalg/      # Curated libtomcrypt amalgamation output
│   │   ├── amalgamation/           # SQLCipher amalgamation working dir
│   │   └── emcc-<version>/         # Per-emscripten-version builds
│   │       ├── openssl-wasm/       # Compiled OpenSSL
│   │       ├── openssl-3.3.2/      # OpenSSL source configured for this emcc
│   │       ├── sqlcipher-wasm/     # WASM build working dir
│   │       └── sqlcipher-webgl/    # WebGL build working dir
│   └── results/                    # Final build outputs
│       ├── sqlcipher-wasm/         # WASM artifacts (unpacked)
│       ├── sqlcipher-wasm.zip      # WASM archive
│       ├── sqlcipher-webgl/        # WebGL artifacts (unpacked)
│       │   ├── libsqlcipher.a
│       │   └── openssl/
│       │       ├── libcrypto.a
│       │       └── libssl.a
│       ├── sqlcipher-webgl.zip     # WebGL archive
│       ├── sqlcipher-amalgamation/ # Source bundle (unpacked)
│       └── sqlcipher-amalgamation.zip # Source bundle archive
├── dist/                           # NPM package output
│   ├── sqlcipher.cjs               # CommonJS module (Node.js)
│   ├── sqlcipher.mjs               # ES module (browser)
│   └── sqlcipher.wasm              # WebAssembly binary
├── lib/
│   ├── sqlite-api.cjs              # Node.js CommonJS API
│   ├── sqlite-api.mjs              # Browser ES module API
│   ├── sqlite-api.d.ts             # Browser TypeScript declarations
│   └── sqlite-api.d.cts            # CommonJS TypeScript declarations
├── test/
│   ├── run-all-tests.cjs           # Test suite runner
│   ├── test.cjs                    # Core functionality tests
│   ├── e2e-test.cjs                # End-to-end tests
│   ├── file-db-test.cjs            # File persistence tests
│   ├── encryption-test.cjs         # Encryption tests
│   └── cross-platform-db-test.cjs  # C++ <-> WASM compatibility (generated)
├── bench/
│   └── benchmark.cjs               # Performance benchmarks
├── examples/
│   └── example.cjs                 # Usage examples
└── tools/
    ├── create-test-db.cpp          # Native encrypted database generator
    └── prepare-cross-platform-test.sh
```

## Build Process

All build scripts source `lib.sh` for paths, assertions, and crypto-provider patching. The WASM, WebGL, and OpenSSL scripts call `setup_emscripten` to detect the emcc version and select versioned build/cache directories. The libtomcrypt and source-bundle scripts do not invoke emcc.

### 1. OpenSSL Build (`build-openssl.sh`)

Downloads and compiles OpenSSL 3.3.2 to WebAssembly:

- Configured for WASM target (`linux-generic32`)
- Optimized build (`-O3 -flto`)
- Disabled features: ASM, threads, engines, hardware acceleration
- Static library output to `target/build/emcc-<version>/openssl-wasm/`
- OpenSSL source tarball is shared across emscripten versions

### 2. SQLCipher WASM Build (`build-wasm.sh`)

Compiles SQLCipher with OpenSSL into CJS/ESM modules:

1. Copies SQLCipher v4.9.0 source from Nix store
2. Configures and creates amalgamation (`sqlite3.c`)
3. Patches amalgamation to use OpenSSL crypto provider
4. Compiles and links with OpenSSL static libraries
5. Outputs to `dist/` (for npm) and `target/results/sqlcipher-wasm/`
6. Creates `target/results/sqlcipher-wasm.zip`

### 3. SQLCipher WebGL Build (`build-webgl.sh`)

Compiles SQLCipher into a static library for Unity 2022.3.22f WebGL:

1. Same amalgamation process as WASM build
2. Compiles with emscripten 3.1.10 (ABI-compatible with Unity's bundled emscripten)
3. Outputs `libsqlcipher.a` + OpenSSL libs to `target/results/sqlcipher-webgl/`
4. Creates `target/results/sqlcipher-webgl.zip`

### 4. libtomcrypt Amalgamation Stage (`build-libtomcrypt.sh`)

Prepares a curated libtomcrypt amalgamation consumed by `build-amalgamation.sh`. This is a source-transform stage — no emcc is invoked.

1. Downloads libtomcrypt 1.18.2 tarball (shared across runs)
2. Enumerates the subset SQLCipher calls: AES, SHA1/2 family, HMAC, CBC/ECB modes, PBKDF2 (PKCS#5 alg2), PRNGs, registration/argchk helpers
3. Inlines `aes_tab.c` into `aes.c` so the amalgamation has no side-file dependency
4. Concatenates the subset into `target/build/libtomcrypt-amalg/libtomcrypt.c`
5. Copies the 13 upstream headers to `target/build/libtomcrypt-amalg/headers/`
6. Smoke-tests the result compiles cleanly with host `cc`

Unrelated algorithms (Blowfish, Camellia, Khazad, MDx, RIPEMD, etc.) are intentionally omitted — they collide on static symbols (T-tables, per-algo `F`/`G` macros) when amalgamated, and SQLCipher never touches them.

### 5. Unity Source Bundle (`build-amalgamation.sh`)

Assembles the SQLCipher + libtomcrypt **source** bundle for non-pthread consumers using Unity's own emcc. Compiling source avoids a prebuilt archive's ABI dependency, but does not guarantee compatibility with a Unity version or toolchain; validate the resulting application.

1. Asserts `build-libtomcrypt.sh` has been run (its output is in `target/build/libtomcrypt-amalg/`)
2. Builds the SQLCipher amalgamation (`sqlite3.c` + `sqlite3.h`) via the standard `./configure && make sqlite3.c` flow — still no emcc
3. Patches `sqlite3.c` to activate the libtomcrypt provider and disable OpenSSL/NSS/CC
4. Copies the prebuilt `libtomcrypt.c` and headers alongside
5. Prepends the SQLCipher/SQLite `#define` block directly to the top of the bundled `sqlite3.c` so no `-D` flags are ever needed at compile time
6. Rewrites `#include <tomcrypt.h>` (in sqlite3.c's crypto_libtomcrypt section) to `"tomcrypt.h"` so it resolves from the plugin's own directory without an `-I` path
7. Flattens all libtomcrypt headers alongside `libtomcrypt.c` in the bundle root so quote-include lookups succeed out of the box
8. Creates `target/results/sqlcipher-amalgamation.zip`

**Compilation Flags** (shared by WASM and WebGL builds):

- `SQLITE_HAS_CODEC` - Enable encryption
- `SQLCIPHER_CRYPTO_OPENSSL` - Use OpenSSL crypto provider
- `SQLITE_TEMP_STORE=2` - Use memory for temporary storage
- `SQLITE_THREADSAFE=1` - SQLite mutex configuration; does not enable consumer pthreads or establish pthread-enabled source support
- `SQLITE_ENABLE_FTS5` - Full-text search
- `SQLITE_ENABLE_RTREE` - Spatial indexing
- `SQLITE_ENABLE_JSON1` - JSON support

WebGL build adds:
- `SQLITE_ENABLE_SNAPSHOT` - Database snapshot support
- `SQLITE_ENABLE_COLUMN_METADATA` - Column metadata API

Amalgamation bundle substitutes the OpenSSL provider with libtomcrypt:
- `SQLCIPHER_CRYPTO_LIBTOMCRYPT` replaces `SQLCIPHER_CRYPTO_OPENSSL`
- `LTC_SOURCE` enables libtomcrypt internal symbols
- every flag is prepended directly into `sqlite3.c` / `libtomcrypt.c` at bundle assembly time — no external `-D` or force-include header needed

## Usage

### Basic Example

```javascript
const { initSQLite } = require('@7mind.io/sqlcipher-wasm');

async function main() {
    const sqlite = await initSQLite();

    const db = sqlite.open('/mydb.db', 'my-secret-password');

    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)');

    db.query(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['Alice', 'alice@example.com']
    );

    const users = db.query('SELECT * FROM users WHERE name = ?', ['Alice']);
    console.log(users);
    // => [{ id: '1', name: 'Alice', email: 'alice@example.com' }]

    db.close();
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
```

From a source checkout, use `require('./lib/sqlite-api.cjs')` instead. Database paths refer to the module's in-memory filesystem, not the host filesystem.

### Typed Results

Use `queryTyped` for numeric calculations, exact large integers, or binary data without parsing `query` strings:

```javascript
const rows = db.queryTyped(`
    SELECT ? AS score, 9223372036854775807 AS id,
           'Привіт' AS label, x'00ff' AS bytes, NULL AS missing
`, [4.5]);
console.log(rows[0].score.value.toFixed(1));
console.log(rows[0].id.value === 9223372036854775807n);
console.log(rows[0].bytes.value);
console.log(rows[0].missing.type, rows[0].missing.value);
```

Here `db` is an open connection from the basic example. Every column contains a `{ type, value }` cell: `{ type: 'number', value: 4.5 }`, `{ type: 'bigint', value: 9223372036854775807n }`, a `'string'` cell, a `'blob'` cell with an owned `Uint8Array([0, 255])`, and `{ type: 'null', value: null }`. The `value` property always exists, including for NULL. CommonJS and ES modules provide the same method.

### Encryption Examples

```javascript
// Open with password
const db = sqlite.open('/encrypted.db', 'password123');

// Change password (re-key)
db.rekey('new-password');

// Multiple databases with different passwords
const db1 = sqlite.open('/db1.db', 'password1');
const db2 = sqlite.open('/db2.db', 'password2');

// Check encryption worked
db1.exec('SELECT count(*) FROM sqlite_master'); // OK
db2.exec('SELECT count(*) FROM sqlite_master'); // OK
```

### Browser Usage

```html
<script type="module">
  import { init } from './lib/sqlite-api.mjs';

  const sqlite = await init();

  const db = sqlite.open('/mydb.db', 'secret');
  console.log('SQLCipher ready!');
  db.close();
</script>
```

Serve the files over HTTP(S). The browser wrapper imports `dist/sqlcipher.mjs`, whose WASM binary is embedded by `SINGLE_FILE=1`. The CommonJS loader instead reads the adjacent `dist/sqlcipher.wasm` file.

## API Reference

### Initialization

- Node.js: `require('@7mind.io/sqlcipher-wasm').initSQLite()` returns a `Promise<SQLiteAPI>`.
- Browser: `import { init } from './lib/sqlite-api.mjs'`, then `await init()`.
- Both wrappers export `SQLiteAPI` and `SQLiteDatabase` for use with an initialized low-level module.

Initialization is asynchronous; database methods are synchronous. The two entry points use different initialization function names.

TypeScript consumers using NodeNext resolution receive declarations for the selected entry point: `initSQLite` for CommonJS and `init` for ES modules. `query` rows contain `string | null` values. `queryTyped` returns `SQLiteTypedRow[]`, mapping column names to `SQLiteTypedValue` cells. This correlated discriminated union pairs each literal `type` with its corresponding `value` payload; switching on `type` narrows the payload. Both entry points export these named types. Use an ES2020 or newer TypeScript target for bigint literals. For a CommonJS `.cts` consumer:

```typescript
import { initSQLite } from '@7mind.io/sqlcipher-wasm';
import type { SQLiteTypedValue } from '@7mind.io/sqlcipher-wasm';

function formatCell(cell: SQLiteTypedValue): string {
    switch (cell.type) {
        case 'number': return cell.value.toFixed(2);
        case 'bigint': return cell.value.toString();
        case 'string': return cell.value;
        case 'blob': return cell.value.join(',');
        case 'null': return String(cell.value);
    }
    const unreachable: never = cell;
    return unreachable;
}

async function main() {
    const sqlite = await initSQLite();
    const db = sqlite.open();
    const rows = db.queryTyped('SELECT ? AS value', [42]);
    console.log(formatCell(rows[0].value));
    db.close();
}

main().catch(console.error);
```

### `SQLiteAPI`

High-level JavaScript API for SQLCipher.

#### `open(filename?, key?)`

Open or create a database.

- `filename` - Virtual file path (e.g., `/mydb.db`); defaults to `:memory:`
- `key` - Optional encryption passphrase, applied immediately after opening
- Returns: `SQLiteDatabase` instance

Opening does not verify an encrypted file's key. Read the schema or execute a query to verify that the file can be decrypted.

#### `SQLiteDatabase` Methods

##### `exec(sql)`

Execute one or more SQL statements through `sqlite3_exec`, without returning rows or binding parameters.

- `sql` - SQL statement
- Returns: `void`

##### `query(sql, params?)`

Prepare one SQL statement, bind parameters, step through results, and finalize the statement. Use this method for parameterized writes as well as SELECT queries.

- `sql` - SQL query
- `params` - Optional positional array of strings, numbers, or `null`
- Returns: Array of result objects; column values are strings or `null`, including numeric SQL columns

Writes without a `RETURNING` clause return an empty array. Safe integer parameters use `sqlite3_bind_int64`; other numbers use `sqlite3_bind_double`. Text parameters preserve embedded NUL characters. These binding rules apply to both query methods; the `query` result formatting remains unchanged, including its NUL-terminated text decoding.

##### `queryTyped(sql, params?)`

Prepare, bind, execute, and finalize one statement, returning plain row objects mapping column names to `{ type, value }` cells. Accepts the same SQL and positional string, number, or `null` parameters as `query`; bigint and BLOB parameters are not supported.

Each cell uses its current row's SQLite runtime storage class, not the column's declared type:

| SQLite storage class | Cell `type` | Cell `value` |
| --- | --- | --- |
| INTEGER | `'number'` or `'bigint'` | `number` from `Number.MIN_SAFE_INTEGER` through `Number.MAX_SAFE_INTEGER`, otherwise exact `bigint` |
| REAL | `'number'` | `number`, including integral REAL values |
| TEXT | `'string'` | UTF-8 `string`, preserving Unicode, leading BOM, and embedded NUL characters |
| BLOB | `'blob'` | Independent `Uint8Array`; an empty BLOB returns a zero-length array |
| NULL | `'null'` | `null`; the `value` property is present |

A single result column may contain different cell types across rows. Safe INTEGER and REAL values both use `'number'`; no separate integer/real tag exists. No boolean, JSON, or date inference occurs. BLOB payloads remain valid after statement finalization, subsequent queries, and database closure. Column names become own enumerable properties, including `__proto__`; duplicate names retain the last cell.

As with `query`, writes without `RETURNING` and empty result sets return `[]`. Invalid SQL, binding or execution errors, and calls after database closure throw an error. The wrapper does not expose reusable prepared statements.

##### `setKey(key)` and `rekey(newKey)`

`setKey` applies an encryption passphrase before accessing the database. `open` calls it when a key is supplied. `rekey` changes the key of an open encrypted database.

##### `close()`

Close the database connection.

##### `getChanges()`

Get number of rows changed by last statement.

- Returns: `number`

### Low-Level Module Access

The CommonJS wrapper provides `sqlite.getModule()` for access to Emscripten `FS` and exported SQLite C functions. Use it to import or export database bytes, or to manage prepared statements directly. The browser wrapper exposes the initialized module through `sqlite.module` instead.

Within each wrapper, both query methods share the prepare/bind/step/finalize path and differ only in row decoding. The typed reader inspects `sqlite3_column_type` for every cell, reads integers through `sqlite3_column_int64`, and copies text/BLOB bytes using `sqlite3_column_bytes` and `getValue`; it does not require an exported `HEAPU8`. Statement and temporary SQL buffers are released on success or failure. Bound text uses SQLite's transient-copy binding, and its temporary buffer is freed immediately.

### Filesystem Lifetime

The current build uses MEMFS. Closing and reopening a virtual path preserves its contents within the same initialized module, but does not persist it across process exits or page reloads. No IDBFS or NODEFS persistence is configured by the build.

## Test Suite

The runner executes these 6 suites through CommonJS entry points in Node.js, including ESM wrapper checks; it does not run browser or Unity application tests:

### 1. Unit Tests (`test/test.cjs`)
- Module loading and initialization
- Runtime method and filesystem availability
- Memory allocation/free
- C string round trips

### 2. End-to-End Tests (`test/e2e-test.cjs`)
- CREATE, INSERT, SELECT, UPDATE, and DELETE workflows
- Transactions and multiple database connections
- JOINs, aggregates, indexes, and LIKE queries

### 3. File Database Tests (`test/file-db-test.cjs`)
- Virtual database creation and SQL operations
- Close/reopen within the same MEMFS instance
- Queries and updates after reopening

### 4. Encryption Tests (`test/encryption-test.cjs`)
- PRAGMA key interface
- Password verification
- Multiple databases with different passwords
- Database re-keying
- Wrong password handling
- API key vs PRAGMA key equivalence

### 5. Cross-Platform Tests (`test/cross-platform-db-test.cjs`)
- Native SQLCipher C++ → WASM database import
- Schema and sample data assertions
- JOIN and aggregate queries
- Index inspection

### 6. Typed Query Tests (`test/typed-query-test.cjs`)
- Safe integer boundaries, adjacent integers, and signed 64-bit extremes
- REAL values, mixed storage classes, Unicode/BOM/NUL text, BLOBs, and NULL
- BLOB ownership after finalization and later queries
- Unusual column names, binding errors, closed databases, and legacy query results
- CommonJS/ESM initialization and result parity

TypeScript consumers in `test/type-consumer.cts` and `test/type-consumer.mts` check the package declarations with ES2020 and NodeNext resolution:

```bash
tsc --strict --noEmit --target ES2020 --module NodeNext --moduleResolution NodeNext test/type-consumer.cts test/type-consumer.mts
```

Prepare the generated cross-platform test, then run all tests from the default Nix shell:
```bash
./tools/prepare-cross-platform-test.sh
npm test
```

The preparation script compiles `tools/create-test-db.cpp` with the native SQLCipher package, creates `/tmp/test-from-cpp.db`, and embeds its bytes in the ignored `test/cross-platform-db-test.cjs`. Regenerate the fixture when changing the native library or its database settings.

Run tests in watch mode:
```bash
npm run test:watch
```

## Benchmarks

Run performance benchmarks:

```bash
npm run bench
```

The current benchmarks measure:
- WASM memory allocation/free for 1 KB and 1 MB blocks
- JavaScript `TextEncoder`/`TextDecoder` operations
- Direct heap reads/writes when heap arrays are available
- C function dispatch overhead, including the exception path when the requested function is not exported
- JavaScript `ArrayBuffer` and typed-array operations

They do not measure SQL queries, encryption overhead, or module initialization time.

## Cross-Platform Compatibility

Database transfer requires matching SQLCipher format parameters and the encryption passphrase. The generated test exercises native C++ → WASM import for its fixture; it does not establish compatibility for every SQLCipher version or configuration.

### Testing Cross-Platform Compatibility

Generate and run the cross-platform test:

```bash
./tools/prepare-cross-platform-test.sh
node test/cross-platform-db-test.cjs
```

This creates a database with native SQLCipher (C++), encodes it, and verifies WASM can read it.

### Migrating from Native SQLCipher

Read the host file and explicitly copy its bytes into MEMFS before opening it:

```javascript
const fs = require('node:fs');
const { initSQLite } = require('@7mind.io/sqlcipher-wasm');

async function main() {
    const sqlite = await initSQLite();
    const module = sqlite.getModule();
    module.FS.writeFile('/imported.db', fs.readFileSync('./existing.db'));

    const db = sqlite.open('/imported.db', 'same-password');
    console.log(db.query('SELECT name FROM sqlite_master'));
    db.close();

    fs.writeFileSync('./exported.db', module.FS.readFile('/imported.db'));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
```

If the file uses non-default settings, configure the open connection before its first database read. The wrapper does not detect or migrate the file format automatically.

### Using WASM Databases in Native Apps

Close the WASM database and export its virtual file with `FS.readFile`, as above. Open the exported file in native SQLCipher with matching settings. Native readback is not covered by the current cross-platform test.

## Development

### Rebuilding

Clean rebuild (WASM):

```bash
rm -rf target/ dist/
./build-openssl.sh && ./build-wasm.sh
```

Clean rebuild (WebGL):

```bash
rm -rf target/
./build-openssl.sh && ./build-webgl.sh
```

Full clean:

```bash
rm -rf target/ dist/
```

### Adding Tests

Extend the appropriate suite in `test/` using its existing assertions. The runner lists suite files explicitly in `test/run-all-tests.cjs`; register any new suite there. Change the native fixture generator and preparation script rather than editing the generated cross-platform test.

## CI/CD

GitHub Actions workflows:

- **CI/CD** (`.github/workflows/ci.yml`) - Build and test on configured branches, pull requests, tags, and releases; publish on `v*` tag pushes
- **PR Checks** (`.github/workflows/pr-check.yml`) - Shell syntax checks, builds, tests, and artifact size checks on pull requests

CI pipeline:
1. Build OpenSSL + SQLCipher WASM (`nix develop`)
2. Build OpenSSL + SQLCipher WebGL (`nix develop .#webgl`)
3. Build the SQLCipher + libtomcrypt source bundle
4. Generate the native database fixture, then run tests and benchmarks
5. Upload `sqlcipher-wasm.zip`, `sqlcipher-webgl.zip`, and `sqlcipher-amalgamation.zip` as artifacts
6. Publish to npm and create a GitHub Release on `v*` tag pushes

## Troubleshooting

### Build fails with "SQLCIPHER_SRC not set"

Enter the Nix environment:
```bash
nix develop
```

### Build fails with OpenSSL errors

Rebuild OpenSSL:
```bash
rm -rf target/build/
./build-openssl.sh
```

### Tests fail with "Cannot find module"

Build first:
```bash
./build-openssl.sh && ./build-wasm.sh
```

### "file is encrypted or is not a database"

Wrong password or corrupted database. Verify password:
```javascript
try {
    const db = sqlite.open('/test.db', 'password');
    db.query('SELECT * FROM sqlite_master'); // Will fail if wrong password
} catch (err) {
    console.log('Wrong password or corrupted database');
}
```

### Out of memory during build

Increase Node.js memory:
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
./build-wasm.sh
```

### Cross-platform test fails

Make sure native SQLCipher is available (provided by Nix environment):
```bash
nix develop --command bash -c "which sqlcipher"
```

## Performance Tips

1. **Batch operations** - Use transactions for multiple inserts
2. **Parameter binding** - Use `query(sql, params)` for bound values; the wrapper prepares and finalizes each call
3. **Appropriate memory settings** - Adjust `PRAGMA cache_size`
4. **Index wisely** - Create indexes for frequently queried columns
5. **Use the benchmarks** - Profile before optimizing

Example batch insert:

```javascript
db.exec('BEGIN TRANSACTION');
for (let i = 0; i < 1000; i++) {
    db.exec('INSERT INTO users (name) VALUES (?)', [`User ${i}`]);
}
db.exec('COMMIT');
```

## Contributing

Keep changes scoped to the affected build or wrapper, add assertions to the corresponding test suite, and validate with `npm test` after preparing the native fixture. For Unity changes, also build and run the consuming Unity application; the Node.js suites do not cover it.

## Publishing

The package is configured for NPM publishing:

```bash
npm version patch  # or minor, major
git push --tags
```

Pushing a `v*` tag triggers npm publication with provenance and creates a GitHub Release containing all three build archives. `prepublishOnly` runs the WASM build, so the publishing environment must have its OpenSSL WASM dependency available. The workflow does not publish to GitHub Packages.

## Environment Variables

In the Nix environment:

- `SQLCIPHER_SRC` - Path to SQLCipher source (set by flake.nix)
- `EM_CACHE` - Emscripten cache directory (set by lib.sh per emcc version)
- `NODE_PATH` - Node.js module search path

## Resources

- [SQLCipher Documentation](https://www.zetetic.net/sqlcipher/documentation/)
- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [Emscripten Documentation](https://emscripten.org/docs/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [WebAssembly MDN](https://developer.mozilla.org/en-US/docs/WebAssembly)

## License

MIT License - See LICENSE file for details

Dependencies:
- SQLCipher - BSD-style license
- SQLite - Public domain
- OpenSSL - Apache License 2.0
- libtomcrypt - See `LICENSE_libtomcrypt` in the source bundle
- Emscripten - MIT/NCSA License

## Acknowledgments

- [SQLCipher team](https://www.zetetic.net/) for the encrypted SQLite fork
- [OpenSSL team](https://www.openssl.org/) for the cryptographic library
- [Emscripten team](https://emscripten.org/) for the WASM toolchain
- [SQLite team](https://www.sqlite.org/) for the amazing database engine
- [Nix community](https://nixos.org/) for reproducible builds

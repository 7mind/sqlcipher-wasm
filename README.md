# SQLCipher WebAssembly

[![npm version](https://badge.fury.io/js/%407mind.io%2Fsqlcipher-wasm.svg)](https://www.npmjs.com/package/@7mind.io/sqlcipher-wasm)
[![CI/CD](https://github.com/7mind/sqlcipher-wasm/workflows/CI%2FCD/badge.svg)](https://github.com/7mind/sqlcipher-wasm/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-ready WebAssembly build of [SQLCipher](https://www.zetetic.net/sqlcipher/) with **real OpenSSL-based encryption**, high-level JavaScript API, and comprehensive test coverage.

## Features

- **Real Encryption**: Full SQLCipher encryption using OpenSSL 3.3.2 compiled to WebAssembly
- **High-Level API**: Easy-to-use JavaScript wrapper with automatic memory management
- **Cross-Platform**: Works in Node.js and browsers, compatible with native SQLCipher databases
- **Comprehensive Tests**: 5 test suites covering all functionality including cross-platform compatibility
- **Nix Flake Environment**: Reproducible development environment
- **Type Definitions**: TypeScript definitions included
- **Benchmarked**: Performance benchmarks for critical operations

## Security

This build uses **real cryptographic primitives** from OpenSSL 3.3.2, providing:

- **AES-256-CBC** encryption
- **PBKDF2-HMAC-SHA1** key derivation (64,000 iterations by default)
- **HMAC-SHA1** for authentication
- **Cryptographically secure** random number generation

Databases created with this library are **fully compatible** with native SQLCipher (C++ version).

## Prerequisites

- [Nix](https://nixos.org/download.html) with flakes enabled
- [direnv](https://direnv.net/) (optional but recommended)

### Enable Nix Flakes

Add to your `~/.config/nix/nix.conf` (or `/etc/nix/nix.conf`):

```
experimental-features = nix-command flakes
```

## Quick Start

1. **Clone the repository**

2. **Enter the Nix environment**:

   ```bash
   nix develop
   ```

   Or with direnv:
   ```bash
   direnv allow
   ```

3. **Build OpenSSL for WebAssembly** (first time only):

   ```bash
   ./build-openssl.sh
   ```

4. **Build SQLCipher WASM**:

   ```bash
   ./build.sh
   ```

5. **Run all tests**:

   ```bash
   npm test
   ```

6. **Run benchmarks**:

   ```bash
   npm run bench
   ```

## Project Structure

```
.
├── flake.nix                       # Nix flake configuration
├── .envrc                          # direnv configuration
├── build-openssl.sh                # OpenSSL build script
├── build.sh                        # SQLCipher WASM build script
├── package.json                    # NPM package configuration
├── dist/                           # Output directory
│   ├── sqlcipher.js                # JavaScript loader
│   └── sqlcipher.wasm              # WebAssembly binary
├── lib/
│   └── sqlite-api.cjs              # High-level JavaScript API
├── test/
│   ├── run-all-tests.cjs           # Test suite runner
│   ├── test.cjs                    # Core functionality tests
│   ├── e2e-test.cjs                # End-to-end tests
│   ├── file-db-test.cjs            # File persistence tests
│   ├── encryption-test.cjs         # Encryption tests
│   └── cross-platform-db-test.cjs  # C++ ↔ WASM compatibility (generated)
├── bench/
│   └── benchmark.cjs               # Performance benchmarks
├── examples/
│   └── example.cjs                 # Usage examples
├── tools/
│   └── prepare-cross-platform-test.sh  # Generate cross-platform test
└── docs/
    └── archive/                    # Historical documentation
```

## Build Process

### 1. OpenSSL Build (`build-openssl.sh`)

Downloads and compiles OpenSSL 3.3.2 to WebAssembly:

- Configured for WASM target (`linux-generic32`)
- Optimized build (`-O3`)
- Disabled features: ASM, threads, engines, hardware acceleration
- Static library output

### 2. SQLCipher Build (`build.sh`)

Compiles SQLCipher with OpenSSL:

1. Copies SQLCipher source from Nix store
2. Configures and creates amalgamation (`sqlite3.c`)
3. Compiles with OpenSSL crypto provider
4. Links with OpenSSL static libraries
5. Outputs `sqlcipher.js` and `sqlcipher.wasm`

**Key Compilation Flags**:

SQLCipher flags:
- `SQLITE_HAS_CODEC` - Enable encryption
- `SQLCIPHER_CRYPTO_OPENSSL` - Use OpenSSL crypto provider
- `SQLITE_TEMP_STORE=2` - Use memory for temporary storage
- `SQLITE_THREADSAFE=0` - Disable threading (not needed in WASM)
- `SQLITE_ENABLE_FTS5` - Full-text search
- `SQLITE_ENABLE_RTREE` - Spatial indexing
- `SQLITE_ENABLE_JSON1` - JSON support

Emscripten flags:
- `INITIAL_MEMORY=16MB` - Starting memory
- `MAXIMUM_MEMORY=2GB` - Maximum allowed memory
- `ALLOW_MEMORY_GROWTH=1` - Dynamic memory growth
- `ENVIRONMENT=node,web` - Node.js and browser support

## Usage

### Basic Example

```javascript
const { SQLiteAPI } = require('./lib/sqlite-api.cjs');
const initSqlcipher = require('./dist/sqlcipher.js');

async function main() {
    // Initialize the WASM module
    const Module = await initSqlcipher();
    const sqlite = new SQLiteAPI(Module);

    // Create an encrypted database
    const db = sqlite.open('/mydb.db', 'my-secret-password');

    // Create a table
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)');

    // Insert data
    db.exec(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['Alice', 'alice@example.com']
    );

    // Query data
    const users = db.query('SELECT * FROM users WHERE name = ?', ['Alice']);
    console.log(users);
    // => [{ id: 1, name: 'Alice', email: 'alice@example.com' }]

    // Close database
    db.close();
}

main();
```

### Encryption Examples

```javascript
// Open with password
const db = sqlite.open('/encrypted.db', 'password123');

// Change password (re-key)
db.exec("PRAGMA rekey = 'new-password'");

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
  import initSqlcipher from './dist/sqlcipher.js';
  import { SQLiteAPI } from './lib/sqlite-api.js';

  const Module = await initSqlcipher();
  const sqlite = new SQLiteAPI(Module);

  const db = sqlite.open('/mydb.db', 'secret');
  console.log('SQLCipher ready!');
</script>
```

## API Reference

### `SQLiteAPI`

High-level JavaScript API for SQLCipher.

#### `open(path, password?)`

Open or create a database.

- `path` - Database file path (e.g., `/mydb.db`)
- `password` - Encryption password (optional for unencrypted databases)
- Returns: `Database` instance

#### `Database` Methods

##### `exec(sql, params?)`

Execute SQL statement.

- `sql` - SQL statement
- `params` - Optional array of parameters for `?` placeholders
- Returns: `void`

##### `query(sql, params?)`

Execute query and return results.

- `sql` - SQL query
- `params` - Optional array of parameters
- Returns: Array of result objects

##### `close()`

Close the database connection.

##### `getChanges()`

Get number of rows changed by last statement.

- Returns: `number`

## Test Suite

The test suite includes 5 comprehensive test suites:

### 1. Unit Tests (`test/test.cjs`)
- Module loading and initialization
- Basic SQL operations
- Memory management
- API correctness

### 2. End-to-End Tests (`test/e2e-test.cjs`)
- Complete workflows
- Multi-step operations
- Error handling
- Edge cases

### 3. File Database Tests (`test/file-db-test.cjs`)
- File persistence
- VFS (Virtual File System)
- Database reopening
- File operations

### 4. Encryption Tests (`test/encryption-test.cjs`)
- PRAGMA key interface
- Password verification
- Multiple databases with different passwords
- Database re-keying
- Wrong password handling
- API key vs PRAGMA key equivalence

### 5. Cross-Platform Tests (`test/cross-platform-db-test.cjs`)
- C++ (native SQLCipher) → WASM compatibility
- Database created with native SQLCipher, read by WASM
- Binary compatibility verification
- Real-world migration scenarios

Run all tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

### Test Output

```
╔════════════════════════════════════════════════════════════╗
║          SQLCipher WASM Test Suite                         ║
╚════════════════════════════════════════════════════════════╝

Running 5 test suites...

▶ Running Unit Tests...
  Core SQLCipher functionality tests

✓ Unit Tests completed in 542ms

▶ Running End-to-End Tests...
  Complete workflow tests

✓ End-to-End Tests completed in 498ms

...

╔════════════════════════════════════════════════════════════╗
║                    Test Summary                            ║
╚════════════════════════════════════════════════════════════╝

  ✓ PASS  Unit Tests               542ms
  ✓ PASS  End-to-End Tests         498ms
  ✓ PASS  File Database Tests      523ms
  ✓ PASS  Encryption Tests         445ms
  ✓ PASS  Cross-Platform Tests     389ms

─────────────────────────────────────────────────────────────
  ALL TESTS PASSED
  Total: 5  Passed: 5  Failed: 0
  Time: 2.40s
```

## Benchmarks

Run performance benchmarks:

```bash
npm run bench
```

Benchmarks measure:
- Module initialization time
- Memory allocation performance
- Database operations (INSERT, SELECT, UPDATE, DELETE)
- Query performance
- Encryption overhead
- Memory usage patterns

## Cross-Platform Compatibility

Databases created with this WASM build are **100% compatible** with native SQLCipher.

### Testing Cross-Platform Compatibility

Generate and run the cross-platform test:

```bash
./tools/prepare-cross-platform-test.sh
node test/cross-platform-db-test.cjs
```

This creates a database with native SQLCipher (C++), encodes it, and verifies WASM can read it.

### Migrating from Native SQLCipher

Just copy your `.db` file and open it with the same password:

```javascript
const db = sqlite.open('/path/to/existing.db', 'same-password');
const data = db.query('SELECT * FROM your_table');
```

### Using WASM Databases in Native Apps

The reverse also works - databases created in WASM can be used in native applications.

## Development

### Rebuilding

After changing build scripts:

```bash
./build.sh
```

Clean rebuild:

```bash
rm -rf build/ dist/
./build.sh
```

Rebuild OpenSSL (rarely needed):

```bash
rm -rf openssl-wasm/ openssl-3.3.2/
./build-openssl.sh
```

### Adding Tests

Add to appropriate test file in `test/`:

```javascript
test('Your test name', () => {
    const db = sqlite.open('/test.db', 'password');
    db.exec('CREATE TABLE test (id INTEGER)');
    const result = db.query('SELECT * FROM test');
    assert.strictEqual(result.length, 0);
    db.close();
});
```

Tests are automatically picked up by `npm test`.

## CI/CD

GitHub Actions workflows:

- **CI/CD** (`.github/workflows/ci.yml`) - Build, test, and publish on releases
- **PR Checks** (`.github/workflows/pr-check.yml`) - Quick validation on pull requests

Both workflows:
1. Cache OpenSSL and Emscripten for faster builds
2. Build OpenSSL if not cached
3. Build SQLCipher WASM
4. Generate cross-platform test
5. Run all test suites
6. Run benchmarks (CI only)

## Troubleshooting

### Build fails with "SQLCIPHER_SRC not set"

Enter the Nix environment:
```bash
nix develop
```

### Build fails with OpenSSL errors

Rebuild OpenSSL:
```bash
rm -rf openssl-wasm/ openssl-3.3.2/
./build-openssl.sh
```

### Tests fail with "Cannot find module"

Build first:
```bash
./build.sh
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
./build.sh
```

### Cross-platform test fails

Make sure native SQLCipher is available (provided by Nix environment):
```bash
nix develop --command bash -c "which sqlcipher"
```

## Performance Tips

1. **Batch operations** - Use transactions for multiple inserts
2. **Prepare statements** - Reuse prepared statements for repeated queries
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

Contributions welcome! Areas for improvement:

- [ ] Browser-based test runner
- [ ] More comprehensive benchmarks
- [ ] IndexedDB persistence examples
- [ ] Worker thread examples
- [ ] React/Vue/Svelte integration examples
- [ ] Performance optimization guides

## Publishing

The package is configured for NPM publishing:

```bash
npm version patch  # or minor, major
git push --tags
```

Create a GitHub release to trigger automatic publishing to:
- NPM registry
- GitHub Packages

## Environment Variables

In the Nix environment:

- `SQLCIPHER_SRC` - Path to SQLCipher source
- `EM_CACHE` - Emscripten cache directory
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
- Emscripten - MIT/NCSA License

## Acknowledgments

- [SQLCipher team](https://www.zetetic.net/) for the encrypted SQLite fork
- [OpenSSL team](https://www.openssl.org/) for the cryptographic library
- [Emscripten team](https://emscripten.org/) for the WASM toolchain
- [SQLite team](https://www.sqlite.org/) for the amazing database engine
- [Nix community](https://nixos.org/) for reproducible builds

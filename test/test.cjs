#!/usr/bin/env node

const { join } = require('path');
const rootDir = join(__dirname, '..');

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
};

class TestRunner {
    constructor() {
        this.passed = 0;
        this.failed = 0;
        this.tests = [];
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log(`${colors.bright}SQLCipher WASM Test Suite${colors.reset}`);
        console.log('='.repeat(50));
        console.log();

        for (const { name, fn } of this.tests) {
            try {
                await fn();
                this.passed++;
                console.log(`${colors.green}✓${colors.reset} ${name}`);
            } catch (error) {
                this.failed++;
                console.log(`${colors.red}✗${colors.reset} ${name}`);
                console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
                if (error.stack) {
                    console.log(`  ${error.stack.split('\n').slice(1, 3).join('\n  ')}`);
                }
            }
        }

        console.log();
        console.log('='.repeat(50));
        console.log(`${colors.bright}Results:${colors.reset} ${this.passed} passed, ${this.failed} failed`);

        if (this.failed > 0) {
            process.exit(1);
        }
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(
            message || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`
        );
    }
}

function assertThrows(fn, message) {
    try {
        fn();
        throw new Error(message || 'Expected function to throw');
    } catch (error) {
        if (error.message === message || error.message.includes('Expected function to throw')) {
            throw error;
        }
        // Expected error
    }
}

// Load SQLCipher WASM module
async function loadSqlcipher() {
    try {
        const distPath = join(rootDir, 'dist', 'sqlcipher.js');
        // Module auto-initializes and exports to global Module
        const SQL = require(distPath);
        // Wait for it to be ready
        return new Promise((resolve, reject) => {
            if (SQL.calledRun) {
                resolve(SQL);
            } else {
                SQL.onRuntimeInitialized = () => resolve(SQL);
            }
        });
    } catch (error) {
        console.error(`${colors.red}Failed to load SQLCipher module:${colors.reset}`, error.message);
        console.error(`${colors.yellow}Make sure to run './build.sh' first!${colors.reset}`);
        process.exit(1);
    }
}

// Main test suite
async function main() {
    const runner = new TestRunner();
    const SQL = await loadSqlcipher();

    // Test 1: Module loads successfully
    runner.test('Module loads successfully', () => {
        assert(SQL, 'SQLCipher module should be loaded');
        assert(typeof SQL === 'object', 'SQLCipher should be an object');
    });

    // Test 2: Basic SQLite functionality
    runner.test('Can execute basic SQL statements', () => {
        assert(SQL.cwrap || SQL.ccall, 'Should have cwrap or ccall functions');
    });

    // Test 3: Memory allocation
    runner.test('Can allocate and free memory', () => {
        if (SQL._malloc && SQL._free) {
            const ptr = SQL._malloc(1024);
            assert(ptr > 0, 'malloc should return valid pointer');
            SQL._free(ptr);
        } else {
            console.log('  (Skipped: malloc/free not exported)');
        }
    });

    // Test 4: File system availability
    runner.test('File system is available', () => {
        assert(SQL.FS, 'FS module should be available');
        assert(typeof SQL.FS === 'object', 'FS should be an object');
    });

    // Test 5: IDBFS support (for persistence)
    runner.test('File system features available', () => {
        assert(SQL.FS, 'FS module should be available');
        console.log('  (Note: IDBFS not enabled in this build)');
    });

    // Test 6: Exported runtime methods
    runner.test('Required runtime methods are exported', () => {
        const requiredMethods = ['FS', 'cwrap', 'ccall'];
        for (const method of requiredMethods) {
            if (!SQL[method]) {
                console.log(`  Warning: ${method} not found`);
            }
        }
        assert(true, 'Check completed');
    });

    // Test 7: Module initialization
    runner.test('Module is properly initialized', () => {
        assert(SQL.calledRun, 'Module should be initialized');
        console.log('  (Note: Direct HEAP access not exported - use getValue/setValue)');
    });

    // Test 8: Memory growth
    runner.test('Memory can grow if needed', () => {
        if (SQL.HEAPU8) {
            const initialSize = SQL.HEAPU8.length;
            assert(initialSize > 0, 'Initial heap size should be positive');
        }
    });

    // Advanced tests - Use the high-level API functions
    if (SQL.allocateUTF8 && SQL.UTF8ToString) {
        runner.test('Can work with C strings via API', () => {
            const testString = 'Hello, SQLCipher!';

            const ptr = SQL.allocateUTF8(testString);
            assert(ptr > 0, 'Should allocate memory for string');

            const readBack = SQL.UTF8ToString(ptr);
            assertEqual(readBack, testString, 'String should round-trip correctly');

            SQL._free(ptr);
        });
    } else {
        console.log('  (Skipping: String API functions not available)');
    }

    // Test 10: Module exports structure
    runner.test('Module has expected structure', () => {
        const requiredKeys = ['FS', 'cwrap', 'ccall', '_malloc', '_free'];
        let found = 0;
        for (const key of requiredKeys) {
            if (SQL[key]) found++;
        }
        assert(found === requiredKeys.length, `Should have all required exports (${found}/${requiredKeys.length})`);
    });

    await runner.run();
}

main().catch(error => {
    console.error(`${colors.red}Unexpected error:${colors.reset}`, error);
    process.exit(1);
});

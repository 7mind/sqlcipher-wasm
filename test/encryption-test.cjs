#!/usr/bin/env node

/**
 * Encryption Test Suite
 * Tests various encryption scenarios
 */

const { initSQLite } = require('../lib/sqlite-api.cjs');
const { join } = require('path');
const assert = require('assert');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        testsPassed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        testsFailed++;
    }
}

async function runTests() {
    console.log('Encryption Test Suite');
    console.log('====================\n');

    const sqlite = await initSQLite(join(__dirname, '../dist/sqlcipher.js'));

    // Test 1: PRAGMA key interface
    console.log('Test 1: PRAGMA key interface');
    {
        const db1 = sqlite.open('/test-pragma.db');
        db1.exec("PRAGMA key = 'test-password'");
        db1.exec('CREATE TABLE test (id INTEGER, name TEXT)');
        db1.exec("INSERT INTO test VALUES (1, 'Alice')");
        const rows1 = db1.query('SELECT * FROM test');
        test('Set key via PRAGMA', () => {
            assert.strictEqual(rows1.length, 1);
            assert.strictEqual(rows1[0].name, 'Alice');
        });
        db1.close();

        // Reopen with PRAGMA key
        const db2 = sqlite.open('/test-pragma.db');
        db2.exec("PRAGMA key = 'test-password'");
        const rows2 = db2.query('SELECT * FROM test');
        test('Reopen with PRAGMA key', () => {
            assert.strictEqual(rows2.length, 1);
            assert.strictEqual(rows2[0].name, 'Alice');
        });
        db2.close();
    }

    // Test 2: Multiple databases with different passwords
    console.log('\nTest 2: Multiple databases with different passwords');
    {
        const db1 = sqlite.open('/test-db1.db', 'password1');
        db1.exec('CREATE TABLE users (id INTEGER, name TEXT)');
        db1.exec("INSERT INTO users VALUES (1, 'User1')");
        db1.close();

        const db2 = sqlite.open('/test-db2.db', 'password2');
        db2.exec('CREATE TABLE products (id INTEGER, name TEXT)');
        db2.exec("INSERT INTO products VALUES (1, 'Product1')");
        db2.close();

        // Reopen both with correct passwords
        const db1_reopen = sqlite.open('/test-db1.db', 'password1');
        const users = db1_reopen.query('SELECT * FROM users');
        test('Database 1 with password1', () => {
            assert.strictEqual(users[0].name, 'User1');
        });
        db1_reopen.close();

        const db2_reopen = sqlite.open('/test-db2.db', 'password2');
        const products = db2_reopen.query('SELECT * FROM products');
        test('Database 2 with password2', () => {
            assert.strictEqual(products[0].name, 'Product1');
        });
        db2_reopen.close();

        // Try opening db1 with wrong password (should fail)
        test('Wrong password fails gracefully', () => {
            try {
                const db_wrong = sqlite.open('/test-db1.db', 'wrong-password');
                // If we can query, the password was accepted (shouldn't happen)
                db_wrong.query('SELECT * FROM users');
                db_wrong.close();
                throw new Error('Should have failed with wrong password');
            } catch (error) {
                // Expected to fail
                assert.ok(error.message.includes('file is not a database') ||
                         error.message.includes('encrypted') ||
                         error.message.includes('SQLite error'));
            }
        });
    }

    // Test 3: API key vs PRAGMA key equivalence
    console.log('\nTest 3: API key vs PRAGMA key equivalence');
    {
        // Create with API
        const db1 = sqlite.open('/test-api.db', 'shared-password');
        db1.exec('CREATE TABLE data (value TEXT)');
        db1.exec("INSERT INTO data VALUES ('test-data')");
        db1.close();

        // Open with PRAGMA
        const db2 = sqlite.open('/test-api.db');
        db2.exec("PRAGMA key = 'shared-password'");
        const rows = db2.query('SELECT * FROM data');
        test('API key and PRAGMA key are equivalent', () => {
            assert.strictEqual(rows[0].value, 'test-data');
        });
        db2.close();
    }

    // Test 4: Re-keying database
    console.log('\nTest 4: Re-keying database');
    {
        const db1 = sqlite.open('/test-rekey.db', 'old-password');
        db1.exec('CREATE TABLE secrets (value TEXT)');
        db1.exec("INSERT INTO secrets VALUES ('secret-data')");

        // Re-key to new password
        db1.rekey('new-password');
        db1.close();

        // Should NOT open with old password
        test('Old password no longer works after rekey', () => {
            try {
                const db_old = sqlite.open('/test-rekey.db', 'old-password');
                db_old.query('SELECT * FROM secrets');
                db_old.close();
                throw new Error('Should not work with old password');
            } catch (error) {
                assert.ok(error.message.includes('file is not a database') ||
                         error.message.includes('encrypted') ||
                         error.message.includes('SQLite error'));
            }
        });

        // Should open with new password
        const db_new = sqlite.open('/test-rekey.db', 'new-password');
        const rows = db_new.query('SELECT * FROM secrets');
        test('New password works after rekey', () => {
            assert.strictEqual(rows[0].value, 'secret-data');
        });
        db_new.close();
    }

    // Summary
    console.log('\n====================');
    console.log(`Tests passed: ${testsPassed}`);
    console.log(`Tests failed: ${testsFailed}`);

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});

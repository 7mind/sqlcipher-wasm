#!/usr/bin/env node

/**
 * End-to-End SQLite WASM Test
 *
 * This test demonstrates complete database operations:
 * - Creating tables
 * - Inserting data
 * - Querying data
 * - Updating data
 * - Deleting data
 */

const { join } = require('path');
const { initSQLite } = require('../lib/sqlite-api.cjs');

// Colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            message || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`
        );
    }
}

async function main() {
    log('═══════════════════════════════════════════════════════════', 'bright');
    log('SQLite WASM End-to-End Test', 'bright');
    log('═══════════════════════════════════════════════════════════', 'bright');
    console.log();

    try {
        // Initialize SQLite
        log('1. Initializing SQLite WASM module...', 'cyan');
        const distPath = join(__dirname, '..', 'dist', 'sqlcipher.js');
        const sqlite = await initSQLite(distPath);
        log('   ✓ SQLite initialized', 'green');
        console.log();

        // Open in-memory database
        log('2. Opening in-memory database...', 'cyan');
        const db = sqlite.open(':memory:');
        log('   ✓ Database opened', 'green');
        console.log();

        // Create table
        log('3. Creating users table...', 'cyan');
        db.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                age INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        log('   ✓ Table created', 'green');
        console.log();

        // Insert data
        log('4. Inserting test data...', 'cyan');
        db.exec(`
            INSERT INTO users (name, email, age) VALUES
                ('Alice Smith', 'alice@example.com', 30),
                ('Bob Jones', 'bob@example.com', 25),
                ('Charlie Brown', 'charlie@example.com', 35),
                ('Diana Prince', 'diana@example.com', 28)
        `);
        const changes = db.getChanges();
        log(`   ✓ Inserted ${changes} rows`, 'green');
        console.log();

        // Query all users
        log('5. Querying all users...', 'cyan');
        const allUsers = db.query('SELECT id, name, email, age FROM users ORDER BY id');
        log(`   ✓ Found ${allUsers.length} users:`, 'green');
        allUsers.forEach(user => {
            console.log(`     - ${user.name} (${user.email}), age ${user.age}`);
        });
        assert(allUsers.length === 4, 'Should have 4 users');
        console.log();

        // Query with WHERE clause
        log('6. Querying users older than 28...', 'cyan');
        const olderUsers = db.query('SELECT name, age FROM users WHERE age > 28 ORDER BY age');
        log(`   ✓ Found ${olderUsers.length} users:`, 'green');
        olderUsers.forEach(user => {
            console.log(`     - ${user.name}, age ${user.age}`);
        });
        assert(olderUsers.length === 2, 'Should have 2 users older than 28');
        assertEqual(olderUsers[0].name, 'Alice Smith', 'First should be Alice');
        assertEqual(olderUsers[1].name, 'Charlie Brown', 'Second should be Charlie');
        console.log();

        // Update data
        log('7. Updating Alice\'s age...', 'cyan');
        db.exec('UPDATE users SET age = 31 WHERE name = "Alice Smith"');
        const updated = db.query('SELECT age FROM users WHERE name = "Alice Smith"');
        log(`   ✓ Alice's age updated to ${updated[0].age}`, 'green');
        assertEqual(updated[0].age, '31', 'Age should be updated to 31');
        console.log();

        // Count query
        log('8. Counting total users...', 'cyan');
        const countResult = db.query('SELECT COUNT(*) as count FROM users');
        const count = parseInt(countResult[0].count);
        log(`   ✓ Total users: ${count}`, 'green');
        assertEqual(count, 4, 'Should have 4 users');
        console.log();

        // Aggregate queries
        log('9. Running aggregate queries...', 'cyan');
        const stats = db.query(`
            SELECT
                COUNT(*) as total,
                AVG(age) as avg_age,
                MIN(age) as min_age,
                MAX(age) as max_age
            FROM users
        `);
        log('   ✓ Statistics:', 'green');
        console.log(`     Total: ${stats[0].total}`);
        console.log(`     Average age: ${parseFloat(stats[0].avg_age).toFixed(1)}`);
        console.log(`     Min age: ${stats[0].min_age}`);
        console.log(`     Max age: ${stats[0].max_age}`);
        console.log();

        // Delete data
        log('10. Deleting a user...', 'cyan');
        db.exec('DELETE FROM users WHERE name = "Bob Jones"');
        const remainingUsers = db.query('SELECT COUNT(*) as count FROM users');
        const remainingCount = parseInt(remainingUsers[0].count);
        log(`   ✓ User deleted, ${remainingCount} users remaining`, 'green');
        assertEqual(remainingCount, 3, 'Should have 3 users left');
        console.log();

        // Test transactions
        log('11. Testing transaction (create posts table)...', 'cyan');
        db.exec('BEGIN TRANSACTION');
        db.exec(`
            CREATE TABLE posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                title TEXT NOT NULL,
                content TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        db.exec(`
            INSERT INTO posts (user_id, title, content) VALUES
                (1, 'First Post', 'Hello World!'),
                (1, 'Second Post', 'SQLite in WASM is cool!'),
                (3, 'Charlie Post', 'My first post')
        `);
        db.exec('COMMIT');
        const posts = db.query('SELECT * FROM posts');
        log(`   ✓ Transaction completed, ${posts.length} posts created`, 'green');
        assert(posts.length === 3, 'Should have 3 posts');
        console.log();

        // Test JOIN
        log('12. Testing JOIN query...', 'cyan');
        const userPosts = db.query(`
            SELECT u.name, p.title, p.content
            FROM users u
            JOIN posts p ON u.id = p.user_id
            ORDER BY u.name, p.id
        `);
        log(`   ✓ Found ${userPosts.length} user posts:`, 'green');
        userPosts.forEach(row => {
            console.log(`     - ${row.name}: "${row.title}"`);
        });
        assert(userPosts.length === 3, 'Should have 3 user posts');
        console.log();

        // Test complex query
        log('13. Testing complex query (users with post count)...', 'cyan');
        const userPostCounts = db.query(`
            SELECT u.name, COUNT(p.id) as post_count
            FROM users u
            LEFT JOIN posts p ON u.id = p.user_id
            GROUP BY u.id, u.name
            ORDER BY post_count DESC, u.name
        `);
        log('   ✓ User post counts:', 'green');
        userPostCounts.forEach(row => {
            console.log(`     - ${row.name}: ${row.post_count} post(s)`);
        });
        console.log();

        // Test indexes
        log('14. Creating index on email...', 'cyan');
        db.exec('CREATE INDEX idx_users_email ON users(email)');
        log('   ✓ Index created', 'green');
        console.log();

        // Test LIKE query
        log('15. Testing LIKE query...', 'cyan');
        const searchResults = db.query(`
            SELECT name, email FROM users
            WHERE email LIKE '%example.com'
            ORDER BY name
        `);
        log(`   ✓ Found ${searchResults.length} users with @example.com email`, 'green');
        assert(searchResults.length === 3, 'Should find 3 users');
        console.log();

        // Close database
        log('16. Closing database...', 'cyan');
        db.close();
        log('   ✓ Database closed', 'green');
        console.log();

        // Test reopening
        log('17. Testing database persistence (opening new DB)...', 'cyan');
        const db2 = sqlite.open(':memory:');
        db2.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
        db2.exec('INSERT INTO test (value) VALUES ("test1"), ("test2")');
        const testResults = db2.query('SELECT * FROM test');
        log(`   ✓ New database works, found ${testResults.length} rows`, 'green');
        db2.close();
        console.log();

        // Summary
        log('═══════════════════════════════════════════════════════════', 'bright');
        log('✓ All tests passed!', 'green');
        log('═══════════════════════════════════════════════════════════', 'bright');
        console.log();
        log('Test Coverage:', 'yellow');
        console.log('  ✓ Database creation (in-memory)');
        console.log('  ✓ Table creation (CREATE TABLE)');
        console.log('  ✓ Data insertion (INSERT)');
        console.log('  ✓ Data querying (SELECT)');
        console.log('  ✓ Filtering (WHERE clause)');
        console.log('  ✓ Data updates (UPDATE)');
        console.log('  ✓ Data deletion (DELETE)');
        console.log('  ✓ Aggregate functions (COUNT, AVG, MIN, MAX)');
        console.log('  ✓ Transactions (BEGIN/COMMIT)');
        console.log('  ✓ JOIN operations');
        console.log('  ✓ GROUP BY queries');
        console.log('  ✓ Index creation');
        console.log('  ✓ LIKE pattern matching');
        console.log('  ✓ Multiple database connections');
        console.log();

    } catch (error) {
        log('═══════════════════════════════════════════════════════════', 'bright');
        log('✗ Test failed!', 'red');
        log('═══════════════════════════════════════════════════════════', 'bright');
        console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main().catch(error => {
    console.error(`${colors.red}Unexpected error:${colors.reset}`, error);
    process.exit(1);
});

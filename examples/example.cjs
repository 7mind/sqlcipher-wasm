#!/usr/bin/env node

/**
 * Simple example of using SQLite WASM
 *
 * Run: node example.cjs
 */

const { join } = require('path');
const { initSQLite } = require('./lib/sqlite-api.cjs');

async function main() {
    console.log('SQLite WASM Example\n');

    // Initialize SQLite
    console.log('1. Initializing SQLite...');
    const sqlite = await initSQLite(join(__dirname, 'dist', 'sqlcipher.js'));
    console.log('   ✓ Done\n');

    // Open database
    console.log('2. Opening in-memory database...');
    const db = sqlite.open(':memory:');
    console.log('   ✓ Done\n');

    // Create table
    console.log('3. Creating table...');
    db.exec(`
        CREATE TABLE books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            year INTEGER,
            rating REAL
        )
    `);
    console.log('   ✓ Done\n');

    // Insert data
    console.log('4. Inserting books...');
    db.exec(`
        INSERT INTO books (title, author, year, rating) VALUES
            ('1984', 'George Orwell', 1949, 4.5),
            ('To Kill a Mockingbird', 'Harper Lee', 1960, 4.8),
            ('The Great Gatsby', 'F. Scott Fitzgerald', 1925, 4.2),
            ('Pride and Prejudice', 'Jane Austen', 1813, 4.6)
    `);
    console.log(`   ✓ Inserted ${db.getChanges()} books\n`);

    // Query all books
    console.log('5. Querying all books...');
    const allBooks = db.query('SELECT * FROM books ORDER BY year');
    console.log('   Results:');
    allBooks.forEach(book => {
        console.log(`   - "${book.title}" by ${book.author} (${book.year}) - Rating: ${book.rating}/5`);
    });
    console.log();

    // Query highly rated books
    console.log('6. Finding highly rated books (rating >= 4.5)...');
    const topBooks = db.query('SELECT title, author, rating FROM books WHERE rating >= 4.5 ORDER BY rating DESC');
    console.log('   Results:');
    topBooks.forEach(book => {
        console.log(`   - "${book.title}" by ${book.author} - ${book.rating}/5`);
    });
    console.log();

    // Get statistics
    console.log('7. Calculating statistics...');
    const stats = db.query(`
        SELECT
            COUNT(*) as total_books,
            AVG(rating) as avg_rating,
            MAX(year) as newest_year,
            MIN(year) as oldest_year
        FROM books
    `);
    const s = stats[0];
    console.log('   Results:');
    console.log(`   Total books: ${s.total_books}`);
    console.log(`   Average rating: ${parseFloat(s.avg_rating).toFixed(2)}/5`);
    console.log(`   Date range: ${s.oldest_year} - ${s.newest_year}`);
    console.log();

    // Close database
    console.log('8. Closing database...');
    db.close();
    console.log('   ✓ Done\n');

    console.log('✓ Example completed successfully!');
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});

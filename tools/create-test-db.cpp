/**
 * Create a test SQLite database using C++
 * This simulates a "real" application creating a database
 * that we will then read from WebAssembly
 */

#include <sqlite3.h>
#include <iostream>
#include <cstring>

static int callback(void* data, int argc, char** argv, char** azColName) {
    for (int i = 0; i < argc; i++) {
        std::cout << azColName[i] << " = " << (argv[i] ? argv[i] : "NULL") << std::endl;
    }
    std::cout << std::endl;
    return 0;
}

int main() {
    sqlite3* db;
    char* errMsg = 0;
    int rc;

    const char* dbPath = "/tmp/test-from-cpp.db";
    const char* encryptionKey = "test-encryption-key-123";

    std::cout << "Creating ENCRYPTED SQLCipher database: " << dbPath << std::endl;

    // Remove existing database
    remove(dbPath);

    // Open database
    rc = sqlite3_open(dbPath, &db);
    if (rc) {
        std::cerr << "Can't open database: " << sqlite3_errmsg(db) << std::endl;
        return 1;
    }
    std::cout << "✓ Database opened successfully" << std::endl;

    // Set encryption key (SQLCipher)
    // Using native SQLCipher v3 defaults (SHA1, 64000 iterations)
    rc = sqlite3_exec(db, ("PRAGMA key = '" + std::string(encryptionKey) + "'").c_str(), nullptr, nullptr, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "Failed to set encryption key: " << errMsg << std::endl;
        sqlite3_free(errMsg);
        return 1;
    }
    std::cout << "✓ Encryption key set (using SQLCipher v3 defaults)" << std::endl;

    // Create table
    const char* createTableSQL = R"(
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            department TEXT NOT NULL,
            salary REAL,
            hire_date TEXT
        );
    )";

    rc = sqlite3_exec(db, createTableSQL, callback, 0, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
        return 1;
    }
    std::cout << "✓ Table created" << std::endl;

    // Insert sample data
    const char* insertDataSQL = R"(
        INSERT INTO employees (name, department, salary, hire_date) VALUES
            ('Alice Johnson', 'Engineering', 95000.00, '2020-01-15'),
            ('Bob Smith', 'Sales', 75000.00, '2019-06-01'),
            ('Charlie Brown', 'Engineering', 105000.00, '2018-03-20'),
            ('Diana Prince', 'HR', 85000.00, '2021-09-10'),
            ('Eve Davis', 'Engineering', 98000.00, '2020-11-05'),
            ('Frank Miller', 'Sales', 82000.00, '2019-12-15');
    )";

    rc = sqlite3_exec(db, insertDataSQL, callback, 0, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
        return 1;
    }
    std::cout << "✓ Data inserted (6 employees)" << std::endl;

    // Create an index
    const char* createIndexSQL = "CREATE INDEX idx_department ON employees(department);";
    rc = sqlite3_exec(db, createIndexSQL, callback, 0, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
        return 1;
    }
    std::cout << "✓ Index created" << std::endl;

    // Create a second table to test multi-table operations
    const char* createProjectsTableSQL = R"(
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            employee_id INTEGER,
            status TEXT,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );
    )";

    rc = sqlite3_exec(db, createProjectsTableSQL, callback, 0, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
        return 1;
    }
    std::cout << "✓ Projects table created" << std::endl;

    // Insert projects
    const char* insertProjectsSQL = R"(
        INSERT INTO projects (name, employee_id, status) VALUES
            ('Website Redesign', 1, 'In Progress'),
            ('Mobile App', 3, 'In Progress'),
            ('Database Migration', 5, 'Completed'),
            ('Q4 Sales Campaign', 2, 'Planning'),
            ('Backend Refactor', 1, 'Completed');
    )";

    rc = sqlite3_exec(db, insertProjectsSQL, callback, 0, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
        return 1;
    }
    std::cout << "✓ Projects inserted (5 projects)" << std::endl;

    // Verify data with a query
    std::cout << "\nVerifying data..." << std::endl;
    const char* verifySQL = R"(
        SELECT
            e.name,
            e.department,
            e.salary,
            COUNT(p.id) as project_count
        FROM employees e
        LEFT JOIN projects p ON e.id = p.employee_id
        GROUP BY e.id, e.name, e.department, e.salary
        ORDER BY e.name;
    )";

    rc = sqlite3_exec(db, verifySQL, callback, 0, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
        return 1;
    }

    // Add some statistics
    const char* statsSQL = R"(
        SELECT
            department,
            COUNT(*) as emp_count,
            AVG(salary) as avg_salary,
            MAX(salary) as max_salary
        FROM employees
        GROUP BY department
        ORDER BY department;
    )";

    std::cout << "\nDepartment statistics:" << std::endl;
    rc = sqlite3_exec(db, statsSQL, callback, 0, &errMsg);
    if (rc != SQLITE_OK) {
        std::cerr << "SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
        return 1;
    }

    // Close database
    sqlite3_close(db);
    std::cout << "\n✓ Database closed successfully" << std::endl;
    std::cout << "✓ Database file created at: " << dbPath << std::endl;

    return 0;
}

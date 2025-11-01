#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * Runs all test suites and provides a summary
 */

const { spawn } = require('child_process');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

// Test suites to run
const testSuites = [
    {
        name: 'Unit Tests',
        file: 'test/test.cjs',
        description: 'Core SQLCipher functionality tests'
    },
    {
        name: 'End-to-End Tests',
        file: 'test/e2e-test.cjs',
        description: 'Complete workflow tests'
    },
    {
        name: 'File Database Tests',
        file: 'test/file-db-test.cjs',
        description: 'File persistence and VFS tests'
    },
    {
        name: 'Encryption Tests',
        file: 'test/encryption-test.cjs',
        description: 'Encryption, re-keying, and multi-db tests'
    },
    {
        name: 'Cross-Platform Tests',
        file: 'test/cross-platform-db-test.cjs',
        description: 'C++ → WASM encrypted database compatibility'
    }
];

// Test results
const results = [];
let totalTime = 0;

function formatTime(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
}

function printHeader() {
    console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}          ${colors.blue}SQLCipher WASM Test Suite${colors.reset}                    ${colors.cyan}║${colors.reset}`);
    console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();
}

function printSummary() {
    console.log();
    console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}                    ${colors.blue}Test Summary${colors.reset}                        ${colors.cyan}║${colors.reset}`);
    console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const total = results.length;

    results.forEach(result => {
        const status = result.success
            ? `${colors.green}✓ PASS${colors.reset}`
            : `${colors.red}✗ FAIL${colors.reset}`;
        const time = colors.gray + formatTime(result.time) + colors.reset;

        console.log(`  ${status}  ${result.name.padEnd(25)} ${time}`);
        if (result.description) {
            console.log(`         ${colors.gray}${result.description}${colors.reset}`);
        }
    });

    console.log();
    console.log(`${colors.cyan}─────────────────────────────────────────────────────────────${colors.reset}`);

    const statusColor = failed === 0 ? colors.green : colors.red;
    const statusText = failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED';

    console.log(`  ${statusColor}${statusText}${colors.reset}`);
    console.log(`  Total: ${total}  Passed: ${colors.green}${passed}${colors.reset}  Failed: ${failed > 0 ? colors.red : colors.gray}${failed}${colors.reset}`);
    console.log(`  Time: ${formatTime(totalTime)}`);
    console.log();
}

function runTest(suite) {
    return new Promise((resolve) => {
        const startTime = Date.now();

        console.log(`${colors.blue}▶${colors.reset} Running ${colors.yellow}${suite.name}${colors.reset}...`);
        if (suite.description) {
            console.log(`  ${colors.gray}${suite.description}${colors.reset}`);
        }
        console.log();

        const testProcess = spawn('node', [suite.file], {
            stdio: 'inherit',
            cwd: path.resolve(__dirname, '..')
        });

        testProcess.on('close', (code) => {
            const endTime = Date.now();
            const duration = endTime - startTime;
            const success = code === 0;

            results.push({
                name: suite.name,
                description: suite.description,
                success,
                time: duration,
                exitCode: code
            });

            totalTime += duration;

            if (success) {
                console.log(`${colors.green}✓${colors.reset} ${suite.name} completed in ${formatTime(duration)}`);
            } else {
                console.log(`${colors.red}✗${colors.reset} ${suite.name} failed with exit code ${code}`);
            }
            console.log();

            resolve();
        });

        testProcess.on('error', (error) => {
            const endTime = Date.now();
            const duration = endTime - startTime;

            results.push({
                name: suite.name,
                description: suite.description,
                success: false,
                time: duration,
                error: error.message
            });

            totalTime += duration;

            console.log(`${colors.red}✗${colors.reset} ${suite.name} failed: ${error.message}`);
            console.log();

            resolve();
        });
    });
}

async function runAllTests() {
    printHeader();

    console.log(`Running ${colors.yellow}${testSuites.length}${colors.reset} test suites...`);
    console.log();

    // Run tests sequentially
    for (const suite of testSuites) {
        await runTest(suite);
    }

    printSummary();

    // Exit with error code if any tests failed
    const failed = results.filter(r => !r.success).length;
    if (failed > 0) {
        process.exit(1);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log();
    console.log(`${colors.yellow}Tests interrupted${colors.reset}`);
    process.exit(130);
});

runAllTests().catch(error => {
    console.error(`${colors.red}Test runner failed:${colors.reset}`, error);
    process.exit(1);
});

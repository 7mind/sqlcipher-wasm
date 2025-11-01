#!/usr/bin/env node

const { join } = require('path');
const { performance } = require('perf_hooks');
const rootDir = join(__dirname, '..');

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

class Benchmark {
    constructor(name) {
        this.name = name;
        this.results = [];
    }

    measure(iterations, fn) {
        const times = [];

        // Warmup
        for (let i = 0; i < Math.min(5, iterations); i++) {
            fn();
        }

        // Actual measurements
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            fn();
            const end = performance.now();
            times.push(end - start);
        }

        this.results = times;
        return this.getStats();
    }

    getStats() {
        const sorted = [...this.results].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        const mean = sum / sorted.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        const min = sorted[0];
        const max = sorted[sorted.length - 1];

        // Standard deviation
        const squareDiffs = sorted.map(value => Math.pow(value - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / sorted.length;
        const stdDev = Math.sqrt(avgSquareDiff);

        // Percentiles
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];

        return {
            mean,
            median,
            min,
            max,
            stdDev,
            p95,
            p99,
            iterations: sorted.length,
            opsPerSecond: 1000 / mean,
        };
    }

    printResults() {
        const stats = this.getStats();

        console.log(`\n${colors.bright}${colors.cyan}${this.name}${colors.reset}`);
        console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);

        console.log(`  Operations:  ${stats.iterations.toLocaleString()}`);
        console.log(`  Mean:        ${formatTime(stats.mean)}`);
        console.log(`  Median:      ${formatTime(stats.median)}`);
        console.log(`  Min:         ${formatTime(stats.min)}`);
        console.log(`  Max:         ${formatTime(stats.max)}`);
        console.log(`  Std Dev:     ${formatTime(stats.stdDev)}`);
        console.log(`  95th %ile:   ${formatTime(stats.p95)}`);
        console.log(`  99th %ile:   ${formatTime(stats.p99)}`);
        console.log(`  ${colors.green}Throughput:  ${stats.opsPerSecond.toLocaleString('en-US', { maximumFractionDigits: 0 })} ops/sec${colors.reset}`);
    }
}

function formatTime(ms) {
    if (ms < 1) {
        return `${(ms * 1000).toFixed(2)} µs`;
    } else if (ms < 1000) {
        return `${ms.toFixed(2)} ms`;
    } else {
        return `${(ms / 1000).toFixed(2)} s`;
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

// Benchmark suite
async function main() {
    console.log(`${colors.bright}SQLCipher WASM Benchmark Suite${colors.reset}`);
    console.log('='.repeat(60));

    const SQL = await loadSqlcipher();
    console.log(`${colors.green}✓${colors.reset} Module loaded successfully\n`);

    // Benchmark 1: Memory allocation
    if (SQL._malloc && SQL._free) {
        const bench = new Benchmark('Memory Allocation (1KB blocks)');
        console.log(`${colors.yellow}Running: ${bench.name}...${colors.reset}`);

        bench.measure(10000, () => {
            const ptr = SQL._malloc(1024);
            SQL._free(ptr);
        });

        bench.printResults();
    }

    // Benchmark 3: Large memory allocation
    if (SQL._malloc && SQL._free) {
        const bench = new Benchmark('Memory Allocation (1MB blocks)');
        console.log(`${colors.yellow}Running: ${bench.name}...${colors.reset}`);

        bench.measure(1000, () => {
            const ptr = SQL._malloc(1024 * 1024);
            SQL._free(ptr);
        });

        bench.printResults();
    }

    // Benchmark 4: String encoding/decoding
    {
        const bench = new Benchmark('String Encoding/Decoding');
        console.log(`${colors.yellow}Running: ${bench.name}...${colors.reset}`);

        const testString = 'The quick brown fox jumps over the lazy dog';
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        bench.measure(10000, () => {
            const encoded = encoder.encode(testString);
            const decoded = decoder.decode(encoded);
        });

        bench.printResults();
    }

    // Benchmark 5: Heap access
    if (SQL.HEAPU8) {
        const bench = new Benchmark('Heap Memory Access (sequential read)');
        console.log(`${colors.yellow}Running: ${bench.name}...${colors.reset}`);

        const size = 1024;
        const ptr = SQL._malloc ? SQL._malloc(size) : 1024;

        bench.measure(10000, () => {
            let sum = 0;
            for (let i = 0; i < size; i++) {
                sum += SQL.HEAPU8[ptr + i];
            }
        });

        if (SQL._free) SQL._free(ptr);
        bench.printResults();
    } else {
        console.log(`${colors.dim}Skipping: Heap Memory Access (HEAPU8 not available)${colors.reset}`);
    }

    // Benchmark 6: Heap write
    if (SQL.HEAPU8) {
        const bench = new Benchmark('Heap Memory Access (sequential write)');
        console.log(`${colors.yellow}Running: ${bench.name}...${colors.reset}`);

        const size = 1024;
        const ptr = SQL._malloc ? SQL._malloc(size) : 1024;

        bench.measure(10000, () => {
            for (let i = 0; i < size; i++) {
                SQL.HEAPU8[ptr + i] = i & 0xFF;
            }
        });

        if (SQL._free) SQL._free(ptr);
        bench.printResults();
    } else {
        console.log(`${colors.dim}Skipping: Heap Memory Access write (HEAPU8 not available)${colors.reset}`);
    }

    // Benchmark 7: Random heap access
    if (SQL.HEAPU8) {
        const bench = new Benchmark('Heap Memory Access (random access)');
        console.log(`${colors.yellow}Running: ${bench.name}...${colors.reset}`);

        const size = 1024;
        const ptr = SQL._malloc ? SQL._malloc(size) : 1024;
        const indices = Array.from({ length: 100 }, () => Math.floor(Math.random() * size));

        bench.measure(10000, () => {
            let sum = 0;
            for (const idx of indices) {
                sum += SQL.HEAPU8[ptr + idx];
            }
        });

        if (SQL._free) SQL._free(ptr);
        bench.printResults();
    } else {
        console.log(`${colors.dim}Skipping: Random heap access (HEAPU8 not available)${colors.reset}`);
    }

    // Benchmark 8: C function call overhead (if available)
    if (SQL.ccall) {
        const bench = new Benchmark('C Function Call Overhead');
        console.log(`${colors.yellow}Running: ${bench.name}...${colors.reset}`);

        // This will fail if the function doesn't exist, but measures overhead
        bench.measure(1000, () => {
            try {
                SQL.ccall('sqlite3_libversion', 'string', [], []);
            } catch (e) {
                // Expected if function not exported
            }
        });

        bench.printResults();
    }

    // Benchmark 9: ArrayBuffer operations
    {
        const bench = new Benchmark('ArrayBuffer Creation and Copy');
        console.log(`${colors.yellow}Running: ${bench.name}...${colors.reset}`);

        const size = 1024 * 10; // 10KB

        bench.measure(5000, () => {
            const buffer = new ArrayBuffer(size);
            const view = new Uint8Array(buffer);
            view.set(new Uint8Array(size));
        });

        bench.printResults();
    }

    // Benchmark 10: TypedArray operations
    {
        const bench = new Benchmark('TypedArray Operations');
        console.log(`${colors.yellow}Running: ${bench.name}...${colors.reset}`);

        const size = 1000;
        const arr = new Uint32Array(size);

        bench.measure(5000, () => {
            for (let i = 0; i < size; i++) {
                arr[i] = i * 2;
            }
        });

        bench.printResults();
    }

    console.log(`\n${colors.bright}${colors.green}Benchmark suite completed!${colors.reset}\n`);
}

main().catch(error => {
    console.error(`${colors.red}Unexpected error:${colors.reset}`, error);
    process.exit(1);
});

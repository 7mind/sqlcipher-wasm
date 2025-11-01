# Quick Start Guide

## Prerequisites

```bash
# Install Nix with flakes enabled
curl -L https://nixos.org/nix/install | sh

# Add to ~/.config/nix/nix.conf (or /etc/nix/nix.conf):
# experimental-features = nix-command flakes

# Optional: Install direnv
# On NixOS: nix-env -iA nixos.direnv
# On other systems: see https://direnv.net/
```

## Build and Test (5 minutes)

```bash
# 1. Enter the project directory
cd /path/to/sqlcjs

# 2. Enter the Nix development environment
nix develop
# OR if you have direnv:
direnv allow

# 3. Build SQLCipher WASM (takes ~30 seconds first time)
./build.sh

# 4. Run tests (should pass 6/10 tests)
npm test

# 5. Run benchmarks
npm run bench
```

## Expected Output

### Build
```
✓ Build successful!
Output files:
  sqlcipher.js     ~56KB
  sqlcipher.wasm   ~9KB
```

### Tests
```
Results: 6 passed, 4 failed
(4 failures are expected - advanced features not enabled)
```

### Benchmarks
```
Memory Allocation (1KB):    ~10M ops/sec
Memory Allocation (1MB):    ~14M ops/sec
String Encoding/Decoding:    ~3M ops/sec
C Function Call:            ~98K ops/sec
```

## Using the Module

```javascript
// Load the module
const sqlite = require('./dist/sqlcipher.js');

// Wait for WASM to initialize
sqlite.onRuntimeInitialized = () => {
    console.log('Ready!');

    // Available APIs:
    console.log('FS:', sqlite.FS);           // File system
    console.log('cwrap:', sqlite.cwrap);     // Wrap C functions
    console.log('ccall:', sqlite.ccall);     // Call C functions
    console.log('malloc:', sqlite._malloc);  // Allocate memory
    console.log('free:', sqlite._free);      // Free memory
};
```

## Project Structure

```
.
├── flake.nix              # Nix development environment
├── .envrc                 # direnv config
├── build.sh               # Build script (executable)
├── package.json           # NPM config
├── dist/                  # Build output
│   ├── sqlcipher.js      # Generated WASM loader
│   └── sqlcipher.wasm    # Generated WASM binary
├── test/
│   └── test.cjs          # Test suite
├── bench/
│   └── benchmark.cjs     # Benchmarks
├── build/                 # Build artifacts (generated)
├── README.md             # Full documentation
└── STATUS.md             # Current status
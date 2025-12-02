#!/usr/bin/env bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building SQLCipher for WebAssembly${NC}"
echo "========================================"

# Create build directory
BUILD_DIR="build"
DIST_DIR="dist"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

# Check if sqlcipher source is available
if [ -z "$SQLCIPHER_SRC" ]; then
    echo -e "${RED}Error: SQLCIPHER_SRC not set. Make sure you're in the nix environment.${NC}"
    exit 1
fi

# Copy sqlcipher source to build directory
echo -e "${YELLOW}Copying SQLCipher source...${NC}"
rsync -a --exclude='.git' "$SQLCIPHER_SRC/" "$BUILD_DIR/sqlcipher/"

# Make the build directory writable
chmod -R u+w "$BUILD_DIR/sqlcipher"

cd "$BUILD_DIR/sqlcipher"

# OpenSSL paths
OPENSSL_ROOT="$(cd ../.. && pwd)/openssl-wasm"
OPENSSL_INCLUDE="$OPENSSL_ROOT/include"
OPENSSL_LIB="$OPENSSL_ROOT/lib"

# SQLCipher compile flags
SQLITE_CFLAGS=(
    # Core SQLCipher flags - NOW ENABLED with OpenSSL!
    "-DSQLITE_HAS_CODEC"
    "-DSQLCIPHER_CRYPTO_OPENSSL"
    "-DSQLITE_TEMP_STORE=2"

    # OpenSSL include path
    "-I$OPENSSL_INCLUDE"

    # Performance optimizations
    "-DSQLITE_THREADSAFE=0"
    "-DSQLITE_OMIT_LOAD_EXTENSION"
    "-DSQLITE_ENABLE_FTS5"
    "-DSQLITE_ENABLE_RTREE"
    "-DSQLITE_ENABLE_EXPLAIN_COMMENTS"
    "-DSQLITE_ENABLE_JSON1"

    # Disable features not available in WASM
    "-DSQLCIPHER_OMIT_LOG_DEVICE"

    # Memory management
    "-DSQLITE_ENABLE_MEMORY_MANAGEMENT"
    "-DSQLITE_DEFAULT_MEMSTATUS=0"

    # Optimizations
    "-O3"
    "-flto"
)

# Emscripten flags
EMCC_FLAGS_COMMON=(
    # Memory settings
    "-s INITIAL_MEMORY=16777216"      # 16MB initial
    "-s MAXIMUM_MEMORY=2147483648"    # 2GB max
    "-s ALLOW_MEMORY_GROWTH=1"
    "-s STACK_SIZE=512KB"

    # Export settings
    "-sEXPORTED_RUNTIME_METHODS=FS,cwrap,ccall,setValue,getValue,UTF8ToString,stringToUTF8,lengthBytesUTF8,allocateUTF8"
    "-sEXPORTED_FUNCTIONS=_malloc,_free,_sqlite3_open,_sqlite3_open_v2,_sqlite3_close,_sqlite3_exec,_sqlite3_prepare_v2,_sqlite3_step,_sqlite3_finalize,_sqlite3_reset,_sqlite3_clear_bindings,_sqlite3_column_count,_sqlite3_column_name,_sqlite3_column_type,_sqlite3_column_blob,_sqlite3_column_bytes,_sqlite3_column_text,_sqlite3_column_int,_sqlite3_column_int64,_sqlite3_column_double,_sqlite3_bind_blob,_sqlite3_bind_text,_sqlite3_bind_int,_sqlite3_bind_int64,_sqlite3_bind_double,_sqlite3_bind_null,_sqlite3_bind_parameter_count,_sqlite3_bind_parameter_name,_sqlite3_bind_parameter_index,_sqlite3_errmsg,_sqlite3_errcode,_sqlite3_extended_errcode,_sqlite3_changes,_sqlite3_total_changes,_sqlite3_last_insert_rowid,_sqlite3_db_filename,_sqlite3_get_autocommit,_sqlite3_busy_timeout"

    # Optimizations
    "-O3"
    "-flto"
    "--closure 0"
)

EMCC_FLAGS_CJS=(
    "${EMCC_FLAGS_COMMON[@]}"
    "-s ENVIRONMENT=node"
)

EMCC_FLAGS_ESM=(
    "${EMCC_FLAGS_COMMON[@]}"
    "-s ENVIRONMENT=web"
    "-s MODULARIZE=1"
    "-s EXPORT_ES6=1"
    "-s EXPORT_NAME='initSqlcipher'"
    "-s SINGLE_FILE=1"
)

echo -e "${YELLOW}Configuring SQLCipher...${NC}"
./configure --with-crypto-lib=none 2>&1 | tail -5

echo -e "${YELLOW}Creating amalgamation...${NC}"
rm -f sqlite3.c sqlite3.h
make sqlite3.c 2>&1 | tail -10

if [ ! -f sqlite3.c ]; then
    echo -e "${RED}Failed to create sqlite3.c amalgamation${NC}"
    exit 1
fi

echo -e "${YELLOW}Patching amalgamation...${NC}"
bash ../../patch-amalgamation.sh sqlite3.c

echo -e "${YELLOW}Compiling SQLCipher core...${NC}"
emcc "${SQLITE_CFLAGS[@]}" -I. -c sqlite3.c -o sqlite3.o

# Build CJS version for Node.js
echo -e "${YELLOW}Building CJS version for Node.js...${NC}"
emcc "${SQLITE_CFLAGS[@]}" "${EMCC_FLAGS_CJS[@]}" \
    sqlite3.o \
    "$OPENSSL_LIB/libcrypto.a" \
    -o "../../$DIST_DIR/sqlcipher.cjs"

# Build ESM version for web
echo -e "${YELLOW}Building ESM version for web...${NC}"
emcc "${SQLITE_CFLAGS[@]}" "${EMCC_FLAGS_ESM[@]}" \
    sqlite3.o \
    "$OPENSSL_LIB/libcrypto.a" \
    -o "../../$DIST_DIR/sqlcipher.mjs"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful!${NC}"
    echo -e "${GREEN}Output files:${NC}"
    ls -lh "../../$DIST_DIR/"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

# Return to root directory
cd ../..

echo -e "${GREEN}Build complete!${NC}"

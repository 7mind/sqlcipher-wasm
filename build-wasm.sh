#!/usr/bin/env bash

set -e
source "$(dirname "$0")/lib.sh"

setup_emscripten
assert_set "$SQLCIPHER_SRC" "SQLCIPHER_SRC not set. Make sure you're in the nix environment."

echo -e "${GREEN}Building SQLCipher for WebAssembly (emcc ${EMCC_VERSION})${NC}"
echo "========================================"

BUILD_DIR="${EMCC_BUILD_DIR}/sqlcipher-wasm"
DIST_DIR="${ROOT_DIR}/dist"
WASM_RESULTS_DIR="${RESULTS_DIR}/sqlcipher-wasm"
rm -rf "$BUILD_DIR" "$DIST_DIR" "$WASM_RESULTS_DIR" "${RESULTS_DIR}/sqlcipher-wasm.zip"
mkdir -p "$BUILD_DIR" "$DIST_DIR" "$WASM_RESULTS_DIR"

# OpenSSL paths
OPENSSL_ROOT="${EMCC_BUILD_DIR}/openssl-wasm"
OPENSSL_INCLUDE="$OPENSSL_ROOT/include"
OPENSSL_LIB="$OPENSSL_ROOT/lib"

# Copy sqlcipher source to build directory
echo -e "${YELLOW}Copying SQLCipher source...${NC}"
rsync -a --no-owner --no-group --exclude='.git' "$SQLCIPHER_SRC/" "$BUILD_DIR/"

# Make the build directory writable
chmod -R u+w "$BUILD_DIR"

pushd "$BUILD_DIR" > /dev/null

# SQLCipher compile flags
SQLITE_CFLAGS=(
    # Core SQLCipher flags
    "-DSQLITE_HAS_CODEC"
    "-DSQLCIPHER_CRYPTO_OPENSSL"
    "-DSQLITE_TEMP_STORE=2"
    "-DSQLITE_EXTRA_INIT=sqlcipher_extra_init"
    "-DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown"

    # OpenSSL include path
    "-I$OPENSSL_INCLUDE"

    # Performance optimizations
    "-DSQLITE_THREADSAFE=1"
    "-DSQLITE_OMIT_LOAD_EXTENSION"
    "-DSQLITE_ENABLE_FTS5"
    "-DSQLITE_ENABLE_RTREE"
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
    "-sINITIAL_MEMORY=16777216"      # 16MB initial
    "-sMAXIMUM_MEMORY=2147483648"    # 2GB max
    "-sALLOW_MEMORY_GROWTH=1"
    "-sSTACK_SIZE=512KB"

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
    "-sENVIRONMENT=node"
)

EMCC_FLAGS_ESM=(
    "${EMCC_FLAGS_COMMON[@]}"
    "-sENVIRONMENT=web"
    "-sEXPORT_NAME='initSqlcipher'"
    "-sSINGLE_FILE=1"
    "-sMODULARIZE=1"
)

echo -e "${YELLOW}Configuring SQLCipher...${NC}"
./configure 2>&1 | tail -5

echo -e "${YELLOW}Creating amalgamation...${NC}"
rm -f sqlite3.c sqlite3.h
make sqlite3.c 2>&1 | tail -10

if [ ! -f sqlite3.c ]; then
    echo -e "${RED}Failed to create sqlite3.c amalgamation${NC}"
    exit 1
fi

patch_amalgamation sqlite3.c

echo -e "${YELLOW}Compiling SQLCipher core...${NC}"
emcc "${SQLITE_CFLAGS[@]}" -I. -c sqlite3.c -o sqlite3.o

# Build CJS version for Node.js
echo -e "${YELLOW}Building CJS version for Node.js...${NC}"
emcc "${SQLITE_CFLAGS[@]}" "${EMCC_FLAGS_CJS[@]}" \
    sqlite3.o \
    "$OPENSSL_LIB/libcrypto.a" \
    -o "$DIST_DIR/sqlcipher.cjs"

# Build ESM version for web
echo -e "${YELLOW}Building ESM version for web...${NC}"
emcc "${SQLITE_CFLAGS[@]}" "${EMCC_FLAGS_ESM[@]}" \
    sqlite3.o \
    "$OPENSSL_LIB/libcrypto.a" \
    -o "$DIST_DIR/sqlcipher.mjs"

popd > /dev/null

# Copy to results directory and create archive
cp "$DIST_DIR"/* "$WASM_RESULTS_DIR/"
(cd "$WASM_RESULTS_DIR" && zip -r "${RESULTS_DIR}/sqlcipher-wasm.zip" .)

echo -e "${GREEN}Build successful!${NC}"
echo -e "${GREEN}Output:${NC}"
ls -lh "$WASM_RESULTS_DIR/"
ls -lh "${RESULTS_DIR}/sqlcipher-wasm.zip"

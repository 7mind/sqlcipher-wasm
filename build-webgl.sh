#!/usr/bin/env bash

set -e
source "$(dirname "$0")/lib.sh"

setup_emscripten
assert_set "$SQLCIPHER_SRC" "SQLCIPHER_SRC not set. Make sure you're in the nix environment (nix develop .#webgl)."

echo -e "${GREEN}Building SQLCipher .a for Unity WebGL (emcc ${EMCC_VERSION})${NC}"
echo "========================================"

BUILD_DIR="${EMCC_BUILD_DIR}/sqlcipher-webgl"
WEBGL_RESULTS_DIR="${RESULTS_DIR}/sqlcipher-webgl"
rm -rf "$BUILD_DIR" "$WEBGL_RESULTS_DIR" "${RESULTS_DIR}/sqlcipher-webgl.zip"
mkdir -p "$BUILD_DIR" "$WEBGL_RESULTS_DIR"

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

# SQLCipher compile flags for Unity WebGL
SQLITE_CFLAGS=(
    # Core SQLCipher flags
    "-DSQLITE_ENABLE_SNAPSHOT"
    "-DSQLITE_ENABLE_COLUMN_METADATA"
    "-DSQLITE_ENABLE_LOAD_EXTENSION"
    "-DSQLITE_ENABLE_API_ARMOR"
    "-DSQLITE_ENABLE_FTS3"
    "-DSQLITE_ENABLE_FTS3_PARENTHESIS"
    "-DSQLITE_ENABLE_FTS4"
    "-DSQLITE_ENABLE_FTS5"
    "-DSQLITE_ENABLE_MATH_FUNCTIONS"
    "-DSQLITE_ENABLE_PREUPDATE_HOOK"
    "-DSQLITE_ENABLE_SESSION"
    "-DSQLITE_ENABLE_STAT4"
    "-DSQLITE_ENABLE_UNLOCK_NOTIFY"
    "-DSQLITE_ENABLE_BYTECODE_VTAB"
    "-DSQLITE_ENABLE_DBPAGE_VTAB"
    "-DSQLITE_ENABLE_DBSTAT_VTAB"
    "-DSQLITE_ENABLE_STMTVTAB"
    "-DSQLITE_ENABLE_EXPLAIN_COMMENTS"
    "-DSQLITE_SOUNDEX"
    "-DSQLITE_SYSTEM_MALLOC"
    "-DSQLITE_MAX_WORKER_THREADS=8"
    "-DSQLITE_THREADSAFE=1"
    "-DSQLITE_TEMP_STORE=2"
    "-DSQLITE_EXTRA_INIT=sqlcipher_extra_init"
    "-DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown"

    # OpenSSL include path
    "-DSQLITE_HAS_CODEC"
    "-DSQLCIPHER_CRYPTO_OPENSSL"
    "-I$OPENSSL_INCLUDE"

    # Performance optimizations
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
emcc "${SQLITE_CFLAGS[@]}" -c sqlite3.c -o libsqlcipher.o

echo -e "${YELLOW}Archiving SQLCipher core...${NC}"
emar rcs libsqlcipher.a libsqlcipher.o

popd > /dev/null

# Copy results: SQLCipher + OpenSSL static libs
cp "$BUILD_DIR/libsqlcipher.a" "$WEBGL_RESULTS_DIR/"
mkdir -p "$WEBGL_RESULTS_DIR/openssl"
cp "$OPENSSL_LIB/libcrypto.a" "$OPENSSL_LIB/libssl.a" "$WEBGL_RESULTS_DIR/openssl/"
(cd "$WEBGL_RESULTS_DIR" && zip -r "${RESULTS_DIR}/sqlcipher-webgl.zip" .)

echo -e "${GREEN}Build successful!${NC}"
echo -e "${GREEN}Output:${NC}"
ls -lh "$WEBGL_RESULTS_DIR/"
ls -lh "${RESULTS_DIR}/sqlcipher-webgl.zip"

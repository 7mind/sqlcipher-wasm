#!/usr/bin/env bash
set -e
source "$(dirname "$0")/lib.sh"

# Build OpenSSL for WebAssembly using Emscripten
# This script downloads and compiles OpenSSL 3.x for use with SQLCipher

OPENSSL_VERSION="3.3.2"
OPENSSL_TAR="openssl-${OPENSSL_VERSION}.tar.gz"

setup_emscripten

SRC_DIR="${EMCC_BUILD_DIR}/openssl-${OPENSSL_VERSION}"
INSTALL_DIR="${EMCC_BUILD_DIR}/openssl-wasm"

echo "Building OpenSSL ${OPENSSL_VERSION} for WASM (emcc ${EMCC_VERSION})..."

# Clean previous builds (versioned output only, shared source is reused)
echo "Cleaning previous builds..."
rm -rf "$INSTALL_DIR"

# Download OpenSSL source (shared across emcc versions)
if [ ! -f "${BUILD_BASE}/$OPENSSL_TAR" ]; then
    echo "Downloading OpenSSL..."
    wget -P "$BUILD_BASE" "https://www.openssl.org/source/${OPENSSL_TAR}"
fi

# Extract fresh source (configure/make pollute the tree)
rm -rf "$SRC_DIR"
echo "Extracting OpenSSL..."
tar xzf "${BUILD_BASE}/$OPENSSL_TAR" -C "$EMCC_BUILD_DIR"

pushd "$SRC_DIR" > /dev/null

# Configure for WASM
echo "Configuring OpenSSL for WASM..."
./Configure \
    linux-generic32 \
    no-asm \
    no-threads \
    no-engine \
    no-hw \
    no-weak-ssl-ciphers \
    no-dtls \
    no-shared \
    no-dso \
    no-tests \
    --prefix="$INSTALL_DIR" \
    --openssldir="$INSTALL_DIR" \
    CC="emcc" \
    AR="emar" \
    RANLIB="emranlib" \
    CFLAGS="-O3 -flto" \
    2>&1 | tail -20

# Build only libraries (skip CLI apps which fail to link under wasm-ld)
echo "Building OpenSSL..."
emmake make -j$(nproc) build_libs 2>&1 | tail -20

# Install headers and libraries
echo "Installing OpenSSL to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR/lib" "$INSTALL_DIR/include"
cp libcrypto.a libssl.a "$INSTALL_DIR/lib/"
cp -r include/openssl "$INSTALL_DIR/include/"

popd > /dev/null

echo ""
echo "OpenSSL built successfully!"
echo "  Install directory: $INSTALL_DIR"

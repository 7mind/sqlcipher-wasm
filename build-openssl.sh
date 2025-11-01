#!/usr/bin/env bash
set -e

# Build OpenSSL for WebAssembly using Emscripten
# This script downloads and compiles OpenSSL 3.x for use with SQLCipher

OPENSSL_VERSION="3.3.2"
OPENSSL_DIR="openssl-${OPENSSL_VERSION}"
OPENSSL_TAR="openssl-${OPENSSL_VERSION}.tar.gz"
INSTALL_DIR="$(pwd)/openssl-wasm"

echo "Building OpenSSL ${OPENSSL_VERSION} for WASM..."

# Download OpenSSL if not already present
if [ ! -d "$OPENSSL_DIR" ]; then
    if [ ! -f "$OPENSSL_TAR" ]; then
        echo "Downloading OpenSSL..."
        wget "https://www.openssl.org/source/${OPENSSL_TAR}"
    fi

    echo "Extracting OpenSSL..."
    tar xzf "$OPENSSL_TAR"
fi

cd "$OPENSSL_DIR"

# Clean previous build
make clean 2>/dev/null || true

# Configure for WASM
# We need to set CC and other variables for Emscripten
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
    CFLAGS="-O3"

# Build
echo "Building OpenSSL..."
emmake make -j$(nproc)

# Install to our prefix
echo "Installing OpenSSL to $INSTALL_DIR..."
make install_sw

cd ..

echo ""
echo "✓ OpenSSL built successfully!"
echo "  Install directory: $INSTALL_DIR"
echo "  Headers: $INSTALL_DIR/include"
echo "  Libraries: $INSTALL_DIR/lib"

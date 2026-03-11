#!/usr/bin/env bash

# Shared utilities for sqlcipher-wasm build scripts

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_BASE="${ROOT_DIR}/target/build"
RESULTS_DIR="${ROOT_DIR}/target/results"

assert_set() {
    if [ -z "$1" ]; then
        echo -e "${RED}Error: $2${NC}" >&2
        exit 1
    fi
}

# Detect emscripten version and set up versioned paths:
#   EM_CACHE       -> .emscripten-cache/<version>/
#   EMCC_VERSION   -> e.g. "4.0.12"
#   EMCC_BUILD_DIR -> target/build/emcc-<version>
setup_emscripten() {
    EMCC_VERSION="$(emcc --version | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
    assert_set "$EMCC_VERSION" "Failed to detect emscripten version"

    export EM_CACHE="${ROOT_DIR}/.emscripten-cache/${EMCC_VERSION}"
    export EMCC_BUILD_DIR="${BUILD_BASE}/emcc-${EMCC_VERSION}"

    mkdir -p "$EM_CACHE" "$EMCC_BUILD_DIR" "$RESULTS_DIR"
}

# Patch SQLCipher amalgamation to use OpenSSL provider.
# Disables libtomcrypt/NSS/CommonCrypto providers and removes
# .fini_array usage (unsupported in WASM).
# Usage: patch_amalgamation <path-to-sqlite3.c>
patch_amalgamation() {
    local sqlite_c="$1"
    assert_set "$sqlite_c" "patch_amalgamation: path to sqlite3.c required"
    test -f "$sqlite_c" || { echo -e "${RED}Error: $sqlite_c not found${NC}" >&2; exit 1; }

    echo -e "${YELLOW}Patching $sqlite_c for OpenSSL...${NC}"

    # Disable each crypto provider (except OpenSSL) by wrapping in #if 0
    for section in "LIBTOMCRYPT" "NSS" "CC"; do
        local label
        case "$section" in
            LIBTOMCRYPT) label="crypto_libtomcrypt.c" ;;
            NSS)         label="crypto_nss.c" ;;
            CC)          label="crypto_cc.c" ;;
        esac

        local start end
        start=$(grep -n "Begin file $label" "$sqlite_c" | head -1 | cut -d: -f1)
        end=$(grep -n "End of $label" "$sqlite_c" | head -1 | cut -d: -f1)

        if [ -n "$start" ] && [ -n "$end" ]; then
            echo "  Disabling $section provider (lines $start-$end)"
            sed "${start}i\\
#if 0 /* DISABLED - using OpenSSL */
" "$sqlite_c" > "$sqlite_c.tmp" && mv "$sqlite_c.tmp" "$sqlite_c"
            end=$((end + 1))
            sed "${end}a\\
#endif /* SQLCIPHER_CRYPTO_$section disabled */
" "$sqlite_c" > "$sqlite_c.tmp" && mv "$sqlite_c.tmp" "$sqlite_c"
        fi
    done

    # Remove .fini_array usage (unsupported in WASM, crashes LLVM wasm backend)
    # Added in SQLCipher 4.9.0 for library cleanup on process exit
    echo "  Removing .fini_array section attribute (unsupported in WASM)..."
    sed 's/__attribute__((used, section(".fini_array")))//' "$sqlite_c" > "$sqlite_c.tmp" && mv "$sqlite_c.tmp" "$sqlite_c"

    echo -e "${GREEN}Patching complete!${NC}"
}

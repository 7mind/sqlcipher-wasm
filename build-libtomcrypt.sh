#!/usr/bin/env bash
set -e
source "$(dirname "$0")/lib.sh"

# Produce a curated libtomcrypt amalgamation for the SQLCipher source bundle.
#
# Unlike build-openssl.sh, this script does NOT invoke emcc: it emits portable
# C source (one libtomcrypt.c + upstream headers) that downstream consumers
# compile themselves (Unity's bundled emcc, in the amalgamation bundle case).
# Mirrors build-openssl.sh in structure — this is the "prepare libtomcrypt"
# stage that build-amalgamation.sh later consumes.

LIBTOMCRYPT_VERSION="1.18.2"
LIBTOMCRYPT_TARBALL="crypt-${LIBTOMCRYPT_VERSION}.tar.xz"
LIBTOMCRYPT_URL="https://github.com/libtom/libtomcrypt/releases/download/v${LIBTOMCRYPT_VERSION}/${LIBTOMCRYPT_TARBALL}"

SRC_DIR="${BUILD_BASE}/libtomcrypt-${LIBTOMCRYPT_VERSION}"
INSTALL_DIR="${BUILD_BASE}/libtomcrypt-amalg"

echo "Building libtomcrypt ${LIBTOMCRYPT_VERSION} amalgamation (curated subset)..."

mkdir -p "$BUILD_BASE"

# Clean previous amalgamation output (shared source is reused if present)
echo "Cleaning previous output..."
rm -rf "$INSTALL_DIR"

# Download tarball (shared across runs)
if [ ! -f "${BUILD_BASE}/$LIBTOMCRYPT_TARBALL" ]; then
    echo "Downloading libtomcrypt..."
    wget -P "$BUILD_BASE" "$LIBTOMCRYPT_URL"
fi

# Extract fresh source
rm -rf "$SRC_DIR"
echo "Extracting libtomcrypt..."
tar xf "${BUILD_BASE}/$LIBTOMCRYPT_TARBALL" -C "$BUILD_BASE"
test -d "$SRC_DIR" || { echo -e "${RED}Extracted dir not found: $SRC_DIR${NC}"; exit 1; }

mkdir -p "$INSTALL_DIR/headers"

pushd "$SRC_DIR" > /dev/null

# Curate the subset SQLCipher's crypto_libtomcrypt.c actually calls:
#   AES cipher, SHA1 + SHA2 family, HMAC, CBC/ECB modes, PBKDF2 (PKCS#5 alg2),
#   PRNGs, and the misc/crypt registration + argchk helpers.
# Unrelated algorithms (Blowfish, Camellia, Khazad, Kseed, MDx, RIPEMD, etc.)
# are excluded — they collide on static symbols (T-tables, per-algo `F`/`G`
# macros) when amalgamated, and SQLCipher never touches them.
echo "Enumerating curated source subset..."
LTC_SUBSET_FILES=$({
    echo src/ciphers/aes/aes.c
    echo src/hashes/sha1.c
    find src/hashes/sha2      -name '*.c'
    find src/hashes/helper    -name '*.c'
    find src/mac/hmac         -name '*.c'
    find src/modes/cbc        -name '*.c'
    find src/modes/ecb        -name '*.c'
    find src/misc/pkcs5       -name '*.c'
    find src/misc/crypt       -name '*.c'
    find src/misc -maxdepth 1 -name '*.c'
    find src/prngs            -name '*.c'
} | sort -u)

# Macro names that libtomcrypt's sha2 / md / ripemd family files #define at
# file scope with *different* values. When amalgamated these cause redefinition
# warnings and — worse — silently change semantics for later-included files
# that rely on their own macro variants. We #undef them between each file so
# every included .c starts from a clean slate for these symbols.
LTC_UNDEF_MACROS=(S R F G H I FF GG HH II Ch Maj Sigma0 Sigma1 Gamma0 Gamma1 RND ROUND K k)

LTC_AMALG="$INSTALL_DIR/libtomcrypt.c"
echo "Writing amalgamation to $LTC_AMALG..."
{
    echo "/* libtomcrypt ${LIBTOMCRYPT_VERSION} — curated amalgamation for SQLCipher."
    echo " * Contents: AES, SHA1/224/256/384/512, HMAC, CBC/ECB modes,"
    echo " * PBKDF2 (PKCS#5 alg2), PRNGs, and misc registration/argchk helpers."
    echo " * Other libtomcrypt algorithms (Blowfish, Camellia, Khazad, MDx, etc)"
    echo " * are intentionally omitted — SQLCipher's crypto_libtomcrypt.c does"
    echo " * not reference them, and their static symbols collide across files."
    echo " */"
    echo "#define LTC_SOURCE"
    echo '#include "tomcrypt.h"'
    for f in $LTC_SUBSET_FILES; do
        echo ""
        echo "/* ===== $f ===== */"
        if [[ "$f" == "src/ciphers/aes/aes.c" ]]; then
            # aes.c has `#include "aes_tab.c"` — inline the tab content
            # so the amalgamation has no side-file dependency.
            awk '
                /^#include "aes_tab\.c"/ {
                    while ((getline line < "src/ciphers/aes/aes_tab.c") > 0) print line
                    next
                }
                { print }
            ' "$f"
        else
            cat "$f"
        fi
        # Reset short macros that commonly collide between sha/md variants.
        for m in "${LTC_UNDEF_MACROS[@]}"; do echo "#undef $m"; done
    done
} > "$LTC_AMALG"

echo "Copying libtomcrypt headers..."
cp src/headers/*.h "$INSTALL_DIR/headers/"

# Patch headers: upstream uses #include <tomcrypt_*.h> (angle-bracket), which
# only resolves through -I search paths. Unity's emcc wrapper doesn't add the
# plugin directory to the angle search path, only the quote-include path, so
# angled sibling-header lookups fail even though the files sit next to each
# other. Rewriting every internal tomcrypt_* include to use quotes makes the
# bundle self-locating: clang's quote-include always searches the current
# file's directory first, which is exactly where the sibling header lives.
echo "Patching header includes to quoted form (self-locating for drop-in use)..."
sed -i 's|#include <\(tomcrypt[A-Za-z0-9_]*\.h\)>|#include "\1"|g' "$INSTALL_DIR/headers/"*.h

test -f LICENSE && cp LICENSE "$INSTALL_DIR/"

popd > /dev/null

# Smoke test: the curated amalgamation must compile cleanly as a host TU.
# If this fails the bundle would break too — catch it here, not in Unity.
echo "Smoke-testing amalgamation compiles cleanly..."
if ! cc -c -I"$INSTALL_DIR/headers" -o /dev/null "$LTC_AMALG" 2>"$INSTALL_DIR/compile.log"; then
    echo -e "${RED}libtomcrypt amalgamation failed to compile:${NC}"
    head -40 "$INSTALL_DIR/compile.log"
    exit 1
fi
rm -f "$INSTALL_DIR/compile.log"

echo ""
echo "libtomcrypt amalgamation built successfully!"
echo "  Install directory: $INSTALL_DIR"
echo "    $(ls -lh "$LTC_AMALG" | awk '{print $5}')  libtomcrypt.c"
echo "    $(find "$INSTALL_DIR/headers" -name '*.h' | wc -l | tr -d ' ') headers in headers/"

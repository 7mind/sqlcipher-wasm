#!/usr/bin/env bash

# Build a Unity-agnostic C source amalgamation of SQLCipher + libtomcrypt.
#
# Unlike build-webgl.sh, this script does NOT invoke emcc. It emits plain C
# sources that Unity compiles in-tree with whichever emcc its editor version
# happens to ship. That sidesteps the ABI problem we hit when linking a .a
# built against emcc 3.1.10 into Unity 6000.4 (emcc 3.1.38) — which shows up
# at runtime as `signature_mismatch:time` traps from libc signature drift.
#
# libtomcrypt is used instead of OpenSSL because OpenSSL has no usable
# source-drop story (perl-driven Configure, generated opensslconf.h, hundreds
# of per-file -D flags), whereas libtomcrypt amalgamates cleanly (for the
# curated subset SQLCipher actually uses) into a single .c file.
#
# Depends on the libtomcrypt amalgamation already being staged at
# ${BUILD_BASE}/libtomcrypt-amalg — run build-libtomcrypt.sh first.
#
# Usage:
#   nix develop
#   ./build-libtomcrypt.sh
#   ./build-amalgamation.sh

set -e
source "$(dirname "$0")/lib.sh"

assert_set "$SQLCIPHER_SRC" "SQLCIPHER_SRC not set. Make sure you're in the nix environment (nix develop)."

LTC_INSTALL="${BUILD_BASE}/libtomcrypt-amalg"
test -f "$LTC_INSTALL/libtomcrypt.c" || {
    echo -e "${RED}Missing $LTC_INSTALL/libtomcrypt.c — run ./build-libtomcrypt.sh first.${NC}" >&2
    exit 1
}

BUILD_DIR="${BUILD_BASE}/amalgamation"
BUNDLE_DIR="${RESULTS_DIR}/sqlcipher-amalgamation"
BUNDLE_ZIP="${RESULTS_DIR}/sqlcipher-amalgamation.zip"

echo -e "${GREEN}Building SQLCipher source amalgamation (Unity-agnostic, no emcc pin needed)${NC}"
echo "========================================"

rm -rf "$BUILD_DIR" "$BUNDLE_DIR" "$BUNDLE_ZIP"
mkdir -p "$BUILD_DIR" "$BUNDLE_DIR" "$BUILD_BASE" "$RESULTS_DIR"

# --- 1. Produce SQLCipher amalgamation (no emcc involvement — pure C output) ---
SQLCIPHER_BUILD="$BUILD_DIR/sqlcipher"
echo -e "${YELLOW}Copying SQLCipher source...${NC}"
rsync -a --no-owner --no-group --exclude='.git' "$SQLCIPHER_SRC/" "$SQLCIPHER_BUILD/"
chmod -R u+w "$SQLCIPHER_BUILD"

pushd "$SQLCIPHER_BUILD" > /dev/null

echo -e "${YELLOW}Configuring SQLCipher...${NC}"
./configure 2>&1 | tail -5

echo -e "${YELLOW}Creating amalgamation...${NC}"
rm -f sqlite3.c sqlite3.h
make sqlite3.c 2>&1 | tail -10

test -f sqlite3.c || { echo -e "${RED}Failed to create sqlite3.c${NC}"; exit 1; }
test -f sqlite3.h || { echo -e "${RED}Failed to create sqlite3.h${NC}"; exit 1; }

# Keep libtomcrypt provider, disable OpenSSL/NSS/CC, strip .fini_array
patch_amalgamation sqlite3.c LIBTOMCRYPT

popd > /dev/null

# --- 2. Assemble flat drop-in bundle ---
# Design goal: the bundle works in Unity with zero compile flags. To get
# there:
#   (a) All compile defines that sqlite3.c needs (provider selection,
#       SQLITE_ENABLE_* feature flags, etc.) are prepended directly into
#       sqlite3.c itself, so no -D flags or force-include header are needed.
#   (b) All libtomcrypt headers sit next to libtomcrypt.c at bundle root,
#       and upstream's <angled> sibling includes were rewritten to "quoted"
#       form in build-libtomcrypt.sh, so clang's current-file-directory
#       quote-include lookup finds every header without any -I path.
# The user drops the bundle directory into Assets/Plugins/WebGL/ and Unity's
# own emcc compiles it with no plugin importer customisation.
echo -e "${YELLOW}Assembling bundle (flat, drop-in layout)...${NC}"

# SQLite amalgamation — bake the SQLCipher/SQLite compile flags into the TU.
# Same define set as build-webgl.sh passes via -D, but captured in-source so
# Unity integrators don't have to mirror 30 flags in the plugin importer.
{
    cat <<'EOF'
/* Compile-time configuration baked in so this bundle needs no -D flags.
 * Edit here if you want to toggle features; these defines only affect
 * sqlite3.c's TU (libtomcrypt.c has its own LTC_SOURCE baked in).
 * All boolean flags use `1` (not empty) because some SQLite internal
 * code uses `#if`, not `#ifdef`, so empty defines would fail to compile. */
#define SQLITE_HAS_CODEC 1
#define SQLCIPHER_CRYPTO_LIBTOMCRYPT 1
#define SQLITE_ENABLE_SNAPSHOT 1
#define SQLITE_ENABLE_COLUMN_METADATA 1
#define SQLITE_ENABLE_LOAD_EXTENSION 1
#define SQLITE_ENABLE_API_ARMOR 1
#define SQLITE_ENABLE_FTS3 1
#define SQLITE_ENABLE_FTS3_PARENTHESIS 1
#define SQLITE_ENABLE_FTS4 1
#define SQLITE_ENABLE_FTS5 1
#define SQLITE_ENABLE_MATH_FUNCTIONS 1
#define SQLITE_ENABLE_PREUPDATE_HOOK 1
#define SQLITE_ENABLE_SESSION 1
#define SQLITE_ENABLE_STAT4 1
#define SQLITE_ENABLE_UNLOCK_NOTIFY 1
#define SQLITE_ENABLE_BYTECODE_VTAB 1
#define SQLITE_ENABLE_DBPAGE_VTAB 1
#define SQLITE_ENABLE_DBSTAT_VTAB 1
#define SQLITE_ENABLE_STMTVTAB 1
#define SQLITE_ENABLE_EXPLAIN_COMMENTS 1
#define SQLITE_ENABLE_RTREE 1
#define SQLITE_ENABLE_JSON1 1
#define SQLITE_ENABLE_MEMORY_MANAGEMENT 1
#define SQLITE_SOUNDEX 1
#define SQLITE_SYSTEM_MALLOC 1
#define SQLITE_THREADSAFE 1
#define SQLITE_TEMP_STORE 2
#define SQLITE_MAX_WORKER_THREADS 8
#define SQLITE_DEFAULT_MEMSTATUS 0
#define SQLITE_EXTRA_INIT sqlcipher_extra_init
#define SQLITE_EXTRA_SHUTDOWN sqlcipher_extra_shutdown
#define SQLCIPHER_OMIT_LOG_DEVICE 1

EOF
    # SQLCipher's crypto_libtomcrypt.c uses `#include <tomcrypt.h>` inside
    # the amalgamation. Unity's emcc only adds the plugin dir to the
    # quote-include path (not the angle path), so rewrite this to a quoted
    # include. Same reasoning as the libtomcrypt header patch.
    sed 's|#include <tomcrypt\.h>|#include "tomcrypt.h"|g' "$SQLCIPHER_BUILD/sqlite3.c"
} > "$BUNDLE_DIR/sqlite3.c"
cp "$SQLCIPHER_BUILD/sqlite3.h" "$BUNDLE_DIR/"

# libtomcrypt: prebuilt curated amalgamation from build-libtomcrypt.sh.
# All headers flat at bundle root so libtomcrypt.c's `#include "tomcrypt.h"`
# resolves via quote-include's current-file-directory search — no -I needed.
cp "$LTC_INSTALL/libtomcrypt.c" "$BUNDLE_DIR/"
cp "$LTC_INSTALL/headers/"*.h "$BUNDLE_DIR/"
test -f "$LTC_INSTALL/LICENSE" && cp "$LTC_INSTALL/LICENSE" "$BUNDLE_DIR/LICENSE_libtomcrypt"

cat > "$BUNDLE_DIR/README.txt" <<EOF
SQLCipher Source Bundle (Unity WebGL, any emcc)
===============================================

Ships C sources instead of a prebuilt .a so Unity's bundled emcc compiles
everything itself. Works across Unity versions (2022.3, 6000.x, future) with
no toolchain pin, avoiding runtime "signature_mismatch:time" traps caused
by libc ABI drift between emscripten versions.

All compile flags and include paths are baked in — drop the directory into
Unity and the WebGL build compiles it with no plugin importer configuration.

Contents (flat layout — all files in one directory)
---------------------------------------------------
  sqlite3.c              SQLCipher amalgamation (defines baked in at top)
  sqlite3.h              SQLCipher public header
  libtomcrypt.c          libtomcrypt curated amalgamation (AES+SHA+HMAC+PBKDF2+PRNG)
  tomcrypt*.h            13 libtomcrypt headers (angled includes rewritten to quoted)
  LICENSE_libtomcrypt    libtomcrypt license
  README.txt             this file

Unity integration
-----------------
  1. Copy this whole directory to Assets/Plugins/WebGL/sqlcipher/
  2. That's it. No compile flags, no include paths, no force-includes.
     Unity's plugin importer picks up both .c files; at WebGL build time
     emcc compiles them with every needed define already in the source.

If you need to toggle SQLCipher/SQLite features, edit the #define block at
the top of sqlite3.c (search for "Compile-time configuration").
EOF

# --- 3. Zip it ---
echo -e "${YELLOW}Zipping bundle...${NC}"
(cd "$RESULTS_DIR" && zip -rq "$BUNDLE_ZIP" "sqlcipher-amalgamation")

echo -e "${GREEN}Bundle build successful!${NC}"
echo -e "${GREEN}Output:${NC}"
echo "  $BUNDLE_DIR/"
ls -lh "$BUNDLE_DIR" | tail -n +2
echo ""
echo "  file counts (flat layout):"
echo "    $(find "$BUNDLE_DIR" -maxdepth 1 -name '*.c' | wc -l) .c files"
echo "    $(find "$BUNDLE_DIR" -maxdepth 1 -name '*.h' | wc -l) .h files"
echo ""
ls -lh "$BUNDLE_ZIP"

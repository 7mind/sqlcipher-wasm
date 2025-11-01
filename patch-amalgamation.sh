#!/usr/bin/env bash
#
# Patch SQLCipher amalgamation to use OpenSSL provider
#

set -e

SQLITE_C="$1"

if [ ! -f "$SQLITE_C" ]; then
    echo "Error: $SQLITE_C not found"
    exit 1
fi

echo "Patching $SQLITE_C for OpenSSL..."

# SQLCipher already defaults to OPENSSL, so we just need to disable the other providers
# This prevents compilation errors from unused provider code

# Find line numbers for each crypto provider section (except OpenSSL)
LIBTOMCRYPT_START=$(grep -n 'Begin file crypto_libtomcrypt.c' "$SQLITE_C" | head -1 | cut -d: -f1)
LIBTOMCRYPT_END=$(grep -n 'End of crypto_libtomcrypt.c' "$SQLITE_C" | head -1 | cut -d: -f1)

NSS_START=$(grep -n 'Begin file crypto_nss.c' "$SQLITE_C" | head -1 | cut -d: -f1)
NSS_END=$(grep -n 'End of crypto_nss.c' "$SQLITE_C" | head -1 | cut -d: -f1)

CC_START=$(grep -n 'Begin file crypto_cc.c' "$SQLITE_C" | head -1 | cut -d: -f1)
CC_END=$(grep -n 'End of crypto_cc.c' "$SQLITE_C" | head -1 | cut -d: -f1)

# Disable each provider (except OpenSSL) by adding #if 0 and #endif
for section in "LIBTOMCRYPT" "NSS" "CC"; do
    start_var="${section}_START"
    end_var="${section}_END"
    start=${!start_var}
    end=${!end_var}

    if [ -n "$start" ] && [ -n "$end" ]; then
        echo "Disabling $section provider (lines $start-$end)"
        # Insert #if 0 before the Begin comment
        sed -i "${start}i #if 0 /* DISABLED - using OpenSSL */" "$SQLITE_C"
        # Insert #endif after the End comment (add 1 because we just inserted a line)
        sed -i "$((end + 1))a #endif /* SQLCIPHER_CRYPTO_$section disabled */" "$SQLITE_C"
    fi
done

echo "Patching complete!"

{
  description = "SQLCipher WebAssembly Build";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # SQLCipher source
        sqlcipherSrc = pkgs.fetchFromGitHub {
          owner = "sqlcipher";
          repo = "sqlcipher";
          rev = "v4.6.1";
          sha256 = "sha256-VcD3NwVrC75kLOJiIgrnzVpkBPhjxTmEFyKg/87wHGc=";
        };

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Emscripten for WASM compilation
            emscripten

            # Build tools
            gnumake
            cmake
            gcc
            pkg-config

            # SQLCipher for C++ test program (encrypted SQLite)
            sqlcipher

            # OpenSSL and crypto libraries (required by sqlcipher)
            openssl

            # Node.js for testing and benchmarking
            nodejs_24

            # TCL for SQLite configuration
            tcl

            # Git for fetching sources
            git

            # General utilities
            which
            file
            coreutils
          ];

          shellHook = ''
            echo "SQLCipher WASM Build Environment"
            echo "=================================="
            echo "Emscripten version: $(emcc --version | head -n1)"
            echo "Node.js version: $(node --version)"
            echo ""
            echo "Available commands:"
            echo "  ./build.sh       - Build sqlcipher.wasm"
            echo "  npm test         - Run tests"
            echo "  npm run bench    - Run benchmarks"
            echo ""

            # Set up environment variables
            export SQLCIPHER_SRC="${sqlcipherSrc}"
            export EM_CACHE="$PWD/.emscripten-cache"
            export NODE_PATH="$PWD/node_modules:$NODE_PATH"

            # Create directories if they don't exist
            mkdir -p build dist test bench
          '';
        };

        packages.sqlcipher-wasm = pkgs.stdenv.mkDerivation {
          name = "sqlcipher-wasm";
          src = sqlcipherSrc;

          nativeBuildInputs = with pkgs; [
            emscripten
            openssl
            tcl
          ];

          buildPhase = ''
            # Configure for WASM build
            emconfigure ./configure \
              --enable-tempstore=yes \
              CFLAGS="-DSQLITE_HAS_CODEC -DSQLITE_TEMP_STORE=2" \
              LDFLAGS="-lcrypto"

            # Build with Emscripten
            emmake make
          '';

          installPhase = ''
            mkdir -p $out
            cp sqlite3.wasm $out/ || true
            cp .libs/libsqlcipher.a $out/ || true
          '';
        };
      }
    );
}

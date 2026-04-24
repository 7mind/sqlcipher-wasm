{
  description = "SQLCipher WebAssembly Build";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/25.11";
    flake-utils.url = "github:numtide/flake-utils";

    # Pinned nixpkgs for emscripten 4.0.12 (working LLVM/wasm-ld with LTO)
    nixpkgs-emcc-default.url = "github:NixOS/nixpkgs/2fb006b87f04c4d3bdf08cfdbc7fab9c13d94a15";

    # Pinned nixpkgs for emscripten 3.1.10 (Unity 2022.3.22f compatible)
    nixpkgs-emcc-unity.url = "github:NixOS/nixpkgs/9a17f325397d137ac4d219ecbd5c7f15154422f4";
  };

  outputs = { self, nixpkgs, nixpkgs-emcc-default, nixpkgs-emcc-unity, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        pkgsDefaultEmcc = nixpkgs-emcc-default.legacyPackages.${system};
        pkgsUnityEmcc = nixpkgs-emcc-unity.legacyPackages.${system};

        # SQLCipher v4.9.0 source (shared by both shells)
        sqlcipherSrc = pkgs.fetchFromGitHub {
          owner = "sqlcipher";
          repo = "sqlcipher";
          rev = "v4.9.0";
          sha256 = "sha256-FQlTz4iEU4AMzLZNvfYh8IGJHzP3cIXD2NFw8eNMmBU=";
        };

        commonBuildInputs = with pkgs; [
          gnumake
          cmake
          gcc
          pkg-config
          sqlcipher
          openssl
          nodejs_24
          tcl
          git
          which
          file
          coreutils
          zip
          wget
        ];

        commonShellHook = ''
          export SQLCIPHER_SRC="${sqlcipherSrc}"
          export NODE_PATH="$PWD/node_modules:$NODE_PATH"
          mkdir -p dist target test bench
        '';

      in
      {
        devShells = {
          # Default shell: latest emscripten for standalone WASM builds
          default = pkgs.mkShell {
            buildInputs = [ pkgsDefaultEmcc.emscripten ] ++ commonBuildInputs;

            shellHook = ''
              ${commonShellHook}
              echo "SQLCipher WASM Build Environment"
              echo "=================================="
              echo "Emscripten version: $(emcc --version | head -n1)"
              echo "Node.js version: $(node --version)"
              echo ""
              echo "Available commands:"
              echo "  ./build-openssl.sh      - Build OpenSSL for WASM"
              echo "  ./build-wasm.sh         - Build sqlcipher CJS/ESM"
              echo "  ./build-libtomcrypt.sh  - Stage libtomcrypt amalgamation (Unity source bundle)"
              echo "  ./build-amalgamation.sh - Assemble SQLCipher + libtomcrypt source bundle"
              echo "  npm test                - Run tests"
              echo "  npm run bench           - Run benchmarks"
              echo ""
            '';
          };

          # WebGL shell: emscripten 3.1.10 pinned for Unity 2022.3.22f
          webgl = pkgs.mkShell {
            buildInputs = [ pkgsUnityEmcc.emscripten ] ++ commonBuildInputs;

            shellHook = ''
              ${commonShellHook}
              echo "SQLCipher WebGL Build Environment"
              echo "========================================="
              echo "Emscripten version: $(emcc --version | head -n1)"
              echo "  (pinned for Unity 2022.3.22f compatibility)"
              echo ""
              echo "Available commands:"
              echo "  ./build-openssl.sh  - Build OpenSSL for WASM"
              echo "  ./build-webgl.sh    - Build libsqlcipher.a for Unity WebGL"
              echo ""
            '';
          };
        };
      }
    );
}

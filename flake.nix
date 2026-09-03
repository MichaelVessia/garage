{
  description = "Bare Effect v4 monorepo";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    bun2nix,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };
      bun2nix' = bun2nix.packages.${system}.default;
      bunDeps = bun2nix'.fetchBunDeps {
        bunNix = ./bun.nix;
      };
      bunInstallFlags =
        if pkgs.stdenv.hostPlatform.isDarwin
        then ["--linker=hoisted" "--backend=copyfile"]
        else ["--linker=hoisted"];
      mkBunExecutable = {
        name,
        workspace,
        entrypoint,
      }: let
        packageJson = builtins.fromJSON (builtins.readFile (./. + "/apps/${workspace}/package.json"));
      in
        pkgs.stdenv.mkDerivation {
          pname = name;
          version = packageJson.version;
          src = ./.;

          nativeBuildInputs = [
            bun2nix'.hook
            pkgs.bun
          ];

          inherit bunDeps bunInstallFlags;

          dontUseBunBuild = true;
          dontUseBunCheck = true;
          dontUseBunInstall = true;
          dontRunLifecycleScripts = true;
          # Bun --compile appends the JS bundle to the executable; stripping it
          # leaves a plain Bun runtime that cannot dispatch the compiled program.
          dontStrip = true;

          buildPhase = ''
            runHook preBuild

            bun build ${entrypoint} --compile --outfile ${name}

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            install -Dm755 ${name} "$out/bin/${name}"

            runHook postInstall
          '';
        };
      garageMcp = mkBunExecutable {
        name = "garage-mcp";
        workspace = "garage-mcp";
        entrypoint = "apps/garage-mcp/src/main.ts";
      };
      garageMcpImage = pkgs.dockerTools.buildLayeredImage {
        name = "garage-mcp";
        tag = garageMcp.version;
        contents = [
          garageMcp
          pkgs.busybox
          pkgs.cacert
        ];
        config = {
          Cmd = ["${garageMcp}/bin/garage-mcp"];
          User = "65532:65532";
          Env = [
            "GARAGE_MCP_PORT=3000"
            "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
          ];
          ExposedPorts = {"3000/tcp" = {};};
          Healthcheck = {
            Test = ["CMD" "${pkgs.busybox}/bin/wget" "--quiet" "--spider" "http://127.0.0.1:3000/health"];
            Interval = 30000000000;
            Timeout = 5000000000;
            Retries = 3;
            StartPeriod = 5000000000;
          };
        };
      };
      piExtensionsPackageJson = builtins.fromJSON (builtins.readFile ./packages/pi-extensions/package.json);
      piExtensions = pkgs.stdenv.mkDerivation {
        pname = "garage-pi-extensions";
        version = piExtensionsPackageJson.version;
        src = ./.;

        nativeBuildInputs = [
          bun2nix'.hook
          pkgs.bun
        ];

        inherit bunDeps;
        bunInstallFlags = bunInstallFlags ++ ["--filter" "@garage/pi-extensions"];

        dontUseBunBuild = true;
        dontUseBunCheck = true;
        dontUseBunInstall = true;
        dontRunLifecycleScripts = true;

        buildPhase = ''
          runHook preBuild

          bun build \
            packages/pi-extensions/extensions/gpt-fast-mode.ts \
            packages/pi-extensions/extensions/session-model-default.ts \
            --outdir dist/pi-extensions/extensions \
            --target node \
            --external @earendil-works/pi-coding-agent \
            --external @earendil-works/pi-tui

          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall

          install -Dm644 packages/pi-extensions/package.json "$out/package.json"
          mkdir -p "$out/extensions"
          cp dist/pi-extensions/extensions/*.js "$out/extensions/"

          runHook postInstall
        '';
      };
    in {
      packages = rec {
        garage-mcp = garageMcp;
        garage-mcp-image = garageMcpImage;

        pi-extensions = piExtensions;

        default = garage-mcp;
      };

      devShells.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          ast-grep
          bun
          git
          jq
          lefthook
          typescript
          bun2nix'
        ];
      };
    });
}

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
      framePackageJson = builtins.fromJSON (builtins.readFile ./apps/frame/package.json);
      garageFrame = mkBunExecutable {
        name = "garage-frame";
        workspace = "frame";
        entrypoint = "apps/frame/src/main.ts";
      };
      # The frame's SPA, built and checked against Android WebView 106 from source.
      garageFrameWeb = pkgs.stdenv.mkDerivation {
        pname = "garage-frame-web";
        version = framePackageJson.version;
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

        buildPhase = ''
          runHook preBuild

          cd apps/frame
          bun --bun run build

          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall

          cp -r web/dist "$out"

          runHook postInstall
        '';
      };
      # Headless Chromium matching the frame's Android System WebView 106, for the deploy preflight.
      # Playwright's archived Linux build; Chromium dlopens udev and GL, so the wrapper exposes them.
      chromiumWebview106 = pkgs.stdenv.mkDerivation {
        pname = "chromium-webview-106";
        version = "106.0.5249.30";
        src = pkgs.fetchurl {
          url = "https://playwright.azureedge.net/builds/chromium/1024/chromium-linux.zip";
          hash = "sha256-NN0lOVd/HWFxa72ccKzEkrNk6OdCwAI+Njvi1VrcoyQ=";
        };
        nativeBuildInputs = with pkgs; [autoPatchelfHook makeWrapper unzip];
        buildInputs = with pkgs; [
          alsa-lib
          at-spi2-atk
          at-spi2-core
          atk
          cairo
          cups
          dbus
          expat
          glib
          gtk3
          libdrm
          libgbm
          libGL
          libxkbcommon
          mesa
          nspr
          nss
          pango
          systemd
          xorg.libX11
          xorg.libXcomposite
          xorg.libXdamage
          xorg.libXext
          xorg.libXfixes
          xorg.libXrandr
          xorg.libxcb
          xorg.libxshmfence
        ];
        # Optional Qt shims for the system print dialog; headless runs never load them.
        autoPatchelfIgnoreMissingDeps = ["libQt5Core.so.5" "libQt5Gui.so.5" "libQt5Widgets.so.5" "libQt6Core.so.6" "libQt6Gui.so.6" "libQt6Widgets.so.6"];
        unpackPhase = "unzip -q $src";
        installPhase = ''
          runHook preInstall
          mkdir -p $out/libexec $out/bin
          cp -r chrome-linux $out/libexec/
          makeWrapper $out/libexec/chrome-linux/chrome $out/bin/chromium-webview-106 \
            --prefix LD_LIBRARY_PATH : ${pkgs.lib.makeLibraryPath [pkgs.systemd pkgs.libGL]} \
            --set FONTCONFIG_FILE ${pkgs.makeFontsConf {fontDirectories = [pkgs.dejavu_fonts];}}
          runHook postInstall
        '';
      };
      # Names one server + SPA build: the image tag, and the version /health reports so the frame reloads.
      garageFrameBuildId = builtins.substring 0 16 (builtins.hashString "sha256"
        (builtins.unsafeDiscardStringContext "${garageFrame}${garageFrameWeb}"));
      garageFrameImage = pkgs.dockerTools.buildLayeredImage {
        name = "garage-frame";
        tag = garageFrameBuildId;
        contents = [
          garageFrame
          pkgs.busybox
          pkgs.cacert
        ];
        config = {
          Cmd = ["${garageFrame}/bin/garage-frame"];
          User = "65532:65532";
          Env = [
            "FRAME_BUILD_ID=${garageFrameBuildId}"
            "FRAME_PORT=8080"
            "FRAME_WEB_ROOT=${garageFrameWeb}"
            "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
          ];
          ExposedPorts = {"8080/tcp" = {};};
          Healthcheck = {
            Test = ["CMD" "${pkgs.busybox}/bin/wget" "--quiet" "--spider" "http://127.0.0.1:8080/health"];
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

        garage-frame = garageFrame;
        garage-frame-web = garageFrameWeb;
        garage-frame-image = garageFrameImage;

        pi-extensions = piExtensions;

        default = garage-mcp;
      }
      // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
        chromium-webview-106 = chromiumWebview106;
      };

      devShells.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          ast-grep
          bun
          git
          jq
          lefthook
          sops
          typescript
          bun2nix'
        ];
      };
    });
}

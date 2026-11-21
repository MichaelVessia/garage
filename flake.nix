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
        src ? ./.,
        deps ? bunDeps,
      }: let
        packageJson = builtins.fromJSON (builtins.readFile (./. + "/apps/${workspace}/package.json"));
      in
        pkgs.stdenv.mkDerivation {
          pname = name;
          # readFile on the flake source carries the whole repo as string context; drop it so the
          # version string does not make the derivation depend on every file.
          version = builtins.unsafeDiscardStringContext packageJson.version;
          inherit src;

          nativeBuildInputs = [
            bun2nix'.hook
            pkgs.bun
          ];

          inherit bunInstallFlags;
          bunDeps = deps;

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
    in {
      packages = rec {
        garage-mcp = garageMcp;
        garage-mcp-image = garageMcpImage;

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

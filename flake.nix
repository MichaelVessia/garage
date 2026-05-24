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
      mkBunCli = {
        name,
        entrypoint,
      }: let
        packageJson = builtins.fromJSON (builtins.readFile (./. + "/apps/${name}-cli/package.json"));
      in
        pkgs.stdenv.mkDerivation {
          pname = name;
          version = packageJson.version;
          src = ./.;

          nativeBuildInputs = [
            bun2nix'.hook
            pkgs.bun
          ];

          bunDeps = bun2nix'.fetchBunDeps {
            bunNix = ./bun.nix;
          };

          dontUseBunBuild = true;
          dontUseBunCheck = true;
          dontUseBunInstall = true;
          dontRunLifecycleScripts = true;
          # Bun --compile appends the JS bundle to the executable; stripping it
          # leaves a plain Bun runtime that cannot dispatch CLI subcommands.
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
    in {
      packages = rec {
        sonarr = mkBunCli {
          name = "sonarr";
          entrypoint = "apps/sonarr-cli/src/main.ts";
        };

        radarr = mkBunCli {
          name = "radarr";
          entrypoint = "apps/radarr-cli/src/main.ts";
        };

        prowlarr = mkBunCli {
          name = "prowlarr";
          entrypoint = "apps/prowlarr-cli/src/main.ts";
        };

        sabnzbd = mkBunCli {
          name = "sabnzbd";
          entrypoint = "apps/sabnzbd-cli/src/main.ts";
        };

        jellyseerr = mkBunCli {
          name = "jellyseerr";
          entrypoint = "apps/jellyseerr-cli/src/main.ts";
        };

        jellyfin = mkBunCli {
          name = "jellyfin";
          entrypoint = "apps/jellyfin-cli/src/main.ts";
        };

        immich = mkBunCli {
          name = "immich";
          entrypoint = "apps/immich-cli/src/main.ts";
        };

        adguard = mkBunCli {
          name = "adguard";
          entrypoint = "apps/adguard-cli/src/main.ts";
        };

        caddy = mkBunCli {
          name = "caddy";
          entrypoint = "apps/caddy-cli/src/main.ts";
        };

        booklore = mkBunCli {
          name = "booklore";
          entrypoint = "apps/booklore-cli/src/main.ts";
        };

        autocaliweb = mkBunCli {
          name = "autocaliweb";
          entrypoint = "apps/autocaliweb-cli/src/main.ts";
        };

        tubearchivist = mkBunCli {
          name = "tubearchivist";
          entrypoint = "apps/tubearchivist-cli/src/main.ts";
        };

        tailscale = mkBunCli {
          name = "tailscale";
          entrypoint = "apps/tailscale-cli/src/main.ts";
        };

        default = sonarr;
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

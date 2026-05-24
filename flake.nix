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
        version ? "0.0.0",
      }:
        pkgs.stdenv.mkDerivation {
          pname = name;
          inherit version;
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

{
  description = "Baedeker action";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.nixpkgs.url = "github:nixos/nixpkgs";
  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
      };
    in {
      devShell = (pkgs.mkShell.override {stdenv = pkgs.clangStdenv;}) {
        nativeBuildInputs = with pkgs; [
          alejandra
          nodejs
          (yarn.override {nodejs = nodejs;})
          just
        ];
      };
    });
}

#!/usr/bin/env bash
# Cross-compiles release binaries with the runtime pinned in .bun-version.
# Canary builds can't download cross-compile runtimes themselves, so they come from npm.
set -euo pipefail

cd "$(dirname "$0")/.."
version=$(cat .bun-version)
runtimes=$(mktemp -d)
trap 'rm -rf "$runtimes"' EXIT

build() {
  local target=$1 package=$2 exe=$3 outfile=$4
  (cd "$runtimes" && npm pack --silent "@oven/bun-$package@$version" >/dev/null)
  mkdir -p "$runtimes/$package"
  tar -xzf "$runtimes"/oven-bun-"$package"-*.tgz -C "$runtimes/$package"
  bun build src/index.ts --compile --target="bun-$target" \
    --compile-executable-path="$runtimes/$package/package/bin/$exe" \
    --outfile "dist/$outfile"
}

build darwin-x64 darwin-x64 bun datadog-migrator-macos-x64
build darwin-arm64 darwin-aarch64 bun datadog-migrator-macos-arm64
build linux-x64 linux-x64 bun datadog-migrator-linux-x64
build windows-x64 windows-x64 bun.exe datadog-migrator-win-x64.exe

# Cross-compiled darwin binaries are unsigned, and macOS kills unsigned arm64 binaries
if command -v codesign >/dev/null; then
  codesign --force -s - dist/datadog-migrator-macos-x64 dist/datadog-migrator-macos-arm64
fi

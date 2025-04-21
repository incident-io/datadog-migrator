#!/bin/bash
set -e

# Ensure directory exists
mkdir -p dist

# Build TypeScript
echo "Building TypeScript..."
yarn build

# Check if pkg is installed
if ! command -v pkg &> /dev/null; then
  echo "Installing pkg..."
  npm install -g pkg
fi

# Determine platform and architecture
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

if [[ "$PLATFORM" == "darwin" ]]; then
  # macOS
  if [[ "$ARCH" == "arm64" ]]; then
    TARGET="node18-darwin-arm64"
  else
    TARGET="node18-darwin-x64"
  fi
elif [[ "$PLATFORM" == "linux" ]]; then
  # Linux
  if [[ "$ARCH" == "aarch64" ]]; then
    TARGET="node18-linux-arm64"
  else
    TARGET="node18-linux-x64"
  fi
else
  # Default to Windows
  TARGET="node18-win-x64"
fi

echo "Building binary for $TARGET..."
pkg -t $TARGET --output "dist/datadog-migrator-$TARGET" ./dist/index.js

echo "Binary built successfully at: dist/datadog-migrator-$TARGET"
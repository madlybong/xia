#!/usr/bin/env bash
set -e

echo "Building XIA binaries..."

ENTRY="cli/main.ts"
OUT_DIR="platform"

# Output directories
mkdir -p $OUT_DIR/xia-linux-x64/bin
mkdir -p $OUT_DIR/xia-linux-arm64/bin
mkdir -p $OUT_DIR/xia-darwin-x64/bin
mkdir -p $OUT_DIR/xia-darwin-arm64/bin
mkdir -p $OUT_DIR/xia-win32-x64/bin

# Build web dashboard
# Build web dashboard
echo "Building web dashboard..."
bun run --cwd apps/web build

# Compile binaries
echo "Compiling linux-x64..."
bun build $ENTRY --compile --target=bun-linux-x64 --outfile $OUT_DIR/xia-linux-x64/bin/xia

echo "Compiling linux-arm64..."
bun build $ENTRY --compile --target=bun-linux-arm64 --outfile $OUT_DIR/xia-linux-arm64/bin/xia

echo "Compiling darwin-x64..."
bun build $ENTRY --compile --target=bun-darwin-x64 --outfile $OUT_DIR/xia-darwin-x64/bin/xia

echo "Compiling darwin-arm64..."
bun build $ENTRY --compile --target=bun-darwin-arm64 --outfile $OUT_DIR/xia-darwin-arm64/bin/xia

echo "Compiling win32-x64..."
bun build $ENTRY --compile --target=bun-windows-x64 --outfile $OUT_DIR/xia-win32-x64/bin/xia.exe

echo "Build complete!"

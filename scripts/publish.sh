#!/usr/bin/env bash
set -e

echo "Publishing platform packages..."
for pkg in packages/platform/*; do
  if [ -d "$pkg" ]; then
    echo "Publishing $pkg"
    (cd "$pkg" && npm publish --access public)
  fi
done

echo "Publishing main package..."
npm publish --access public

echo "Publish complete!"

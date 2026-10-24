#!/usr/bin/env bash
# Copies only the files the panel needs at runtime into a clean folder.
# Every installer (Windows .exe, macOS .pkg, portable .zip) is built from this one folder.
# Usage: installer/stage.sh <destination-folder>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:?usage: stage.sh <destination-folder>}"

rm -rf "$DEST"
mkdir -p "$DEST/brand/dist"

cd "$ROOT"
cp -R CSXS css icons js jsx "$DEST/"
cp index.html LICENSE THIRD_PARTY.md "$DEST/"
cp brand/dist/favicon.svg "$DEST/brand/dist/"

echo "Staged $(find "$DEST" -type f | wc -l | tr -d ' ') files into $DEST"

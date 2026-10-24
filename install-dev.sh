#!/usr/bin/env bash
# Dev installer (macOS): enables unsigned panels and links this folder into Premiere's extensions folder.
# Experimental: please report what you find at https://github.com/naeem5877/vibe-plugin/issues
set -e

for v in 9 10 11 12; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

SRC="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$EXT_DIR/com.vibeplugin"

mkdir -p "$EXT_DIR"
rm -f "$DEST"
ln -s "$SRC" "$DEST"

echo
echo "Done. Restart Premiere Pro, then open: Window > Extensions > Vibe Plugin"
echo "FFmpeg-based features (convert, cut, merge, MP3/WAV) need an ffmpeg binary in:"
echo "  ~/Library/Application Support/VibePlugin/bin/"
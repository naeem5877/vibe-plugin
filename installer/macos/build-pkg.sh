#!/usr/bin/env bash
# Builds the macOS installer:  installer/macos/build-pkg.sh <version>
# Output: dist-installer/vibe-plugin-v<version>-macos.pkg   (run on macOS: needs pkgbuild + productbuild)
set -euo pipefail

VERSION="${1:?usage: build-pkg.sh <version>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="$ROOT/build/pkg"
OUT="$ROOT/dist-installer"
EXT="Library/Application Support/Adobe/CEP/extensions/com.vibeplugin"

rm -rf "$WORK"
mkdir -p "$WORK/payload/$(dirname "$EXT")" "$WORK/resources" "$OUT"

bash "$ROOT/installer/stage.sh" "$WORK/payload/$EXT"
find "$WORK/payload" -type d -exec chmod 755 {} +
find "$WORK/payload" -type f -exec chmod 644 {} +
chmod +x "$HERE/scripts/postinstall"

# Component package: the files plus the postinstall script.
pkgbuild \
  --root "$WORK/payload" \
  --identifier me.vibedownloader.vibeplugin \
  --version "$VERSION" \
  --install-location / \
  --scripts "$HERE/scripts" \
  "$WORK/vibe-plugin.pkg"

# Installer UI: welcome, licence, conclusion and a branded background.
cp "$HERE/resources/"* "$WORK/resources/"
cp "$ROOT/LICENSE" "$WORK/resources/LICENSE"
sed "s/__VERSION__/$VERSION/g" "$HERE/distribution.xml" > "$WORK/distribution.xml"

productbuild \
  --distribution "$WORK/distribution.xml" \
  --resources "$WORK/resources" \
  --package-path "$WORK" \
  "$OUT/vibe-plugin-v$VERSION-macos.pkg"

echo "Built $OUT/vibe-plugin-v$VERSION-macos.pkg"

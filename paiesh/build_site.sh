#!/usr/bin/env bash
# Builds the installable web app into a target folder (used for the neutral-name site).
# Usage: paiesh/build_site.sh <output-dir>
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"
out="${1:?output dir}"
mkdir -p "$out"
cat "$src/pwa/head.html" "$src/index.html" \
  | sed 's#https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js#vendor/xlsx.full.min.js#' > "$out/index.html"
grep -q 'src="vendor/xlsx.full.min.js"' "$out/index.html" || { echo "local xlsx not substituted"; exit 1; }
if grep -qE '09[0-9]{9}' "$out/index.html"; then echo "phone numbers found in build; refusing"; exit 1; fi
cp "$src/pwa/manifest.json" "$src/pwa/sw.js" "$out/"
rm -rf "$out/icons" "$out/vendor" "$out/fonts"
cp -r "$src/pwa/icons" "$src/pwa/vendor" "$src/pwa/fonts" "$out/"
touch "$out/.nojekyll"
echo "built into $out"

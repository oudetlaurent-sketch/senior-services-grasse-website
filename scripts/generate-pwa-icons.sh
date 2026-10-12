#!/usr/bin/env bash
# Generate the PWA App_Icon set from a Grasse photograph (design §PWA, task 43,
# Requirements 17.4/17.10).
#
# Source photo: public/grasse/img-grasse-ville.jpg — the Grasse town view
# (Fragonard "Visite de l'Usine" parfumerie, the cathedral tower, and the GRASSE
# letters). Center-cropping square keeps the orange Fragonard house and the GR
# letters, a recognizable Grasse landmark at icon size.
#
# Tooling: macOS `sips` (the project's established image tool; no ImageMagick /
# sharp / Pillow is available). `sips -c H W` center-crops to a square and
# `-s format png` re-encodes as an OPAQUE PNG (hasAlpha: no) — exactly what the
# iOS apple-touch-icon requires. The source JPEG already has its EXIF/GPS stripped
# (scripts/strip-jpeg-metadata.py) and the PNG re-encode carries no EXIF/GPS.
#
# Idempotent: re-running regenerates public/icons/ from the source photo. Run from
# the Astro project root:  bash scripts/generate-pwa-icons.sh
set -euo pipefail

SRC="public/grasse/img-grasse-ville.jpg"
OUT_DIR="public/icons"
TMP_SQUARE="$(mktemp -t pwa-sq-XXXXXX).jpg"
trap 'rm -f "$TMP_SQUARE"' EXIT

mkdir -p "$OUT_DIR"

# 1. Center-crop the 1687x1264 source to a 1264x1264 square (sips -c H W centers).
sips -c 1264 1264 "$SRC" --out "$TMP_SQUARE" >/dev/null

# 2. Resample to each target as an opaque PNG.
sips -z 180 180 -s format png "$TMP_SQUARE" --out "$OUT_DIR/apple-touch-icon.png" >/dev/null
sips -z 192 192 -s format png "$TMP_SQUARE" --out "$OUT_DIR/icon-192.png" >/dev/null
sips -z 512 512 -s format png "$TMP_SQUARE" --out "$OUT_DIR/icon-512.png" >/dev/null
# Maskable variant: same opaque crop; the manifest declares purpose "maskable".
sips -z 512 512 -s format png "$TMP_SQUARE" --out "$OUT_DIR/icon-maskable-512.png" >/dev/null

echo "Generated PWA icons in $OUT_DIR from $SRC"

#!/usr/bin/env bash
# Generate the PWA App_Icon set from a Grasse photograph (design §PWA, task 43,
# Requirements 17.4/17.10).
#
# Source photo: public/grasse/img-9773.jpg (IMG_9773, the lavender field) — the
# most icon-friendly of the four Grasse photos: large, simple color regions that
# stay legible when center-cropped square and shrunk to 180px.
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

SRC="public/grasse/img-9773.jpg"
OUT_DIR="public/icons"
TMP_SQUARE="$(mktemp -t pwa-sq-XXXXXX).jpg"
trap 'rm -f "$TMP_SQUARE"' EXIT

mkdir -p "$OUT_DIR"

# 1. Center-crop the 1600x1200 source to a 1200x1200 square.
sips -c 1200 1200 "$SRC" --out "$TMP_SQUARE" >/dev/null

# 2. Resample to each target as an opaque PNG.
sips -z 180 180 -s format png "$TMP_SQUARE" --out "$OUT_DIR/apple-touch-icon.png" >/dev/null
sips -z 192 192 -s format png "$TMP_SQUARE" --out "$OUT_DIR/icon-192.png" >/dev/null
sips -z 512 512 -s format png "$TMP_SQUARE" --out "$OUT_DIR/icon-512.png" >/dev/null
# Maskable variant: same opaque crop; the manifest declares purpose "maskable".
sips -z 512 512 -s format png "$TMP_SQUARE" --out "$OUT_DIR/icon-maskable-512.png" >/dev/null

echo "Generated PWA icons in $OUT_DIR from $SRC"

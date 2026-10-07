#!/usr/bin/env python3
"""Strip EXIF/GPS (and all APPn) metadata from JPEG files, stdlib only.

Privacy follow-up for the committed Grasse decorative-background photos
(task 24.2, design §9, Requirement 9.6/9.7): the images ship publicly, so any
camera/GPS EXIF carried from the originals is removed. macOS `sips` re-encodes
but regenerates camera tags and can leave the Exif/GPS APP1 segment, so we strip
at the JPEG-marker level instead.

A JPEG is a sequence of marker segments. Metadata (Exif, JFIF, XMP, ICC, etc.)
lives in the APP0..APP15 (0xFFE0..0xFFEF) and COM (0xFFFE) segments between the
SOI (0xFFD8) and the first non-APP marker. We copy SOI then drop every APPn/COM
segment, keeping all image-defining segments (quantization/Huffman tables, frame
header, scan + entropy-coded data) byte-for-byte. The pixels are untouched; only
metadata is removed.
"""
from __future__ import annotations

import sys

SOI = b"\xff\xd8"
# Markers whose segment payloads carry only metadata and are safe to drop.
STRIP_MARKERS = set(range(0xE0, 0xF0))  # APP0..APP15
STRIP_MARKERS.add(0xFE)  # COM (comment)


def strip(data: bytes) -> bytes:
    if data[:2] != SOI:
        raise ValueError("not a JPEG (missing SOI)")
    out = bytearray(SOI)
    i = 2
    n = len(data)
    while i < n:
        if data[i] != 0xFF:
            # Shouldn't happen between segments in a well-formed JPEG; copy the rest.
            out.extend(data[i:])
            break
        marker = data[i + 1]
        # Start of scan: copy it and everything after (entropy-coded image data).
        if marker == 0xDA:  # SOS
            out.extend(data[i:])
            break
        # Standalone markers without a length field.
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            out.extend(data[i : i + 2])
            i += 2
            continue
        seg_len = (data[i + 2] << 8) | data[i + 3]
        seg_end = i + 2 + seg_len
        if marker not in STRIP_MARKERS:
            out.extend(data[i:seg_end])  # keep image-defining segment verbatim
        i = seg_end
    return bytes(out)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: strip-jpeg-metadata.py <file.jpg> [...]", file=sys.stderr)
        return 2
    for path in argv[1:]:
        with open(path, "rb") as fh:
            original = fh.read()
        cleaned = strip(original)
        with open(path, "wb") as fh:
            fh.write(cleaned)
        print(f"{path}: {len(original)} -> {len(cleaned)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

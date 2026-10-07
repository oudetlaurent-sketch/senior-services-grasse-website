# Grasse decorative background photos

Optimized, web-displayable copies of four photographs from the business's own Grasse
photo collection. They are used as the decorative page backgrounds (`DecorativeBackground`,
design §9; Requirements 9.1, 9.6, 9.7, 9.8). Files in `public/` are served by Astro at a
stable URL (`/grasse/<name>.jpg`) without being bundled, so the component can reference
them by a fixed path.

## Assets

| Asset           | Source original                 | Output        |
| --------------- | ------------------------------- | ------------- |
| `img-2086.jpg`  | `IMG_2086.HEIC`                 | 1600×1200 JPEG |
| `img-3835.jpg`  | `IMG_3835.JPG`                  | 1600×1200 JPEG |
| `img-7788.jpg`  | `IMG_7788.HEIC`                 | 1600×1200 JPEG |
| `img-9773.jpg`  | `IMG_9773.HEIC`                 | 1600×1200 JPEG |

The filename keys (`img-2086`, `img-3835`, `img-7788`, `img-9773`) match the
`GrassePhotoKey` type in the design, so a page can map a key straight to `/grasse/<key>.jpg`.

## Source

The originals live **outside the repository**, in the user's local
`/Users/loudet/Documents/Grasse` folder. Several are HEIC, which browsers cannot display,
so they are converted at prepare time. Only the optimized web assets in this folder are
committed and shipped.

## Conversion

Produced with macOS `sips` (ImageMagick is not available in this environment). HEIC → JPEG,
downscaled to a 1600px max width and compressed moderately (these are background images, so
some compression is fine) to keep each file comfortably under ~400KB and avoid regressing the
fast-load budgets:

```sh
sips -s format jpeg -s formatOptions 45 --resampleWidth 1600 <source> --out <key>.jpg
```

WebP output was attempted (`-s format webp`) but this `sips` build cannot write WebP
(`Can't write format: org.webmproject.webp`), so only JPEG is shipped. All four pages are
landscape originals (3264–4032px wide), so resizing to 1600px width preserves aspect ratio
(1600×1200) and only downscales.

To regenerate, re-run the command above for each source → key pair in the table.

## Privacy: metadata stripped

Because these photos ship publicly as the decorative backgrounds, their camera EXIF and
any GPS location metadata is removed before shipping (task 24.2). `sips --deleteProperty`
and `sips` re-encoding do not reliably drop these (sips regenerates the camera tags and
can leave the Exif/GPS segment), so metadata is stripped at the JPEG-marker level with
`scripts/strip-jpeg-metadata.py` (stdlib only — no exiftool/ImageMagick/PIL in this
environment):

```sh
python3 scripts/strip-jpeg-metadata.py public/grasse/*.jpg
```

It keeps SOI and every image-defining segment byte-for-byte and drops all `APPn`/`COM`
segments (Exif, JFIF, XMP, ICC, GPS…). Verified afterwards that `sips -g all` reports no
`make`/`model`/`software`/`creation`/GPS properties and no `APPn` metadata segments
remain; the files stay valid 1600×1200 JPEGs comfortably under the size budget. Re-run the
script whenever the assets are regenerated from the originals.

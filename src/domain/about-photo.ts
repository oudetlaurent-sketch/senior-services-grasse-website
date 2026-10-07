/**
 * About_Page photo of Laurent Oudet (design §11, "About page").
 *
 * The About_Page shows a photo of Laurent Oudet (Requirement 11.2) in its correct,
 * upright orientation (Requirement 11.6). Until a real portrait is supplied, this module
 * holds a single empty slot — `src: null` — so the About page can render a provisional
 * placeholder rather than a broken image (Requirement 11.7). When the real photo arrives,
 * flip `src` to the committed, web-displayable asset path (e.g. `/about/laurent-oudet.jpg`);
 * that swap is a content-only edit, no structural change.
 *
 * Preparing the real photo — the contract for an upright, privacy-clean asset (mirrors the
 * Grasse decorative photos in src/domain/grasse-photos.ts and public/grasse/README.md):
 *   1. If the source is HEIC, convert it to JPEG.
 *   2. Bake the EXIF orientation into the pixels so the SHIPPED file is already upright —
 *      browsers do not reliably honor a raw EXIF orientation tag (Requirement 11.6).
 *   3. Strip EXIF/GPS metadata with scripts/strip-jpeg-metadata.py before committing, as
 *      the Grasse photos are, so no camera/GPS data ships publicly.
 *
 * Requirements traceability: 11.2 (About page shows the photo — data-model support here),
 * 11.6 (correct upright orientation — captured as the preparation contract above),
 * 11.7 (provisional placeholder slot while no photo is supplied — the `null` src).
 */

/**
 * The About photo asset slot. `src` is the committed, web-displayable path to the
 * optimized, upright image of Laurent Oudet, or `null` when no photo has been supplied
 * yet. No real portrait exists yet, so `src` is `null`.
 */
export const ABOUT_PHOTO: { src: string | null } = {
  src: null,
};

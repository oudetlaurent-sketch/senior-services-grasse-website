/**
 * Grasse decorative-background photos (design §9, "Decorative Background").
 *
 * The decorative page backgrounds are REAL photographs from the business's own Grasse
 * collection. Four optimized, web-displayable assets are committed under
 * `public/grasse/` and served by Astro at the stable URL `/grasse/<key>.jpg` (see
 * `public/grasse/README.md`). This module owns the stable key type and the mapping to
 * the committed asset path, plus the distinct-per-page assignment, so the pages and any
 * audit share one source of truth.
 *
 * Requirements traceability: 9.1 (a Grasse Decorative_Background on the Home_Page and
 * each Service_Page), 9.6/9.7 (real, optimized Grasse photos as the committed source of
 * truth), 9.8 (a distinct photograph per page — a clean 1:1 over the four photos).
 */

import type { ServiceKey } from "./types.ts";

/**
 * Identifies one of the four Grasse photographs (design §9). The keys match the
 * committed asset filenames under `public/grasse/`, so a key maps straight to
 * `/grasse/<key>.jpg`.
 */
export type GrassePhotoKey = "img-2086" | "img-3835" | "img-7788" | "img-9773";

/** All four photo keys, in a stable order. */
export const GRASSE_PHOTO_KEYS = [
  "img-2086",
  "img-3835",
  "img-7788",
  "img-9773",
] as const satisfies readonly GrassePhotoKey[];

/** Resolve the committed, web-displayable asset path for a photo key. */
export function grassePhotoSrc(photo: GrassePhotoKey): string {
  return `/grasse/${photo}.jpg`;
}

/**
 * Distinct Grasse photograph for each of the three Service_Pages (Requirement 9.8). The
 * mapping is explicit and stable so each service always shows the same photo and the
 * three never collide. The Home_Page takes the remaining fourth photo (see
 * {@link HOME_PHOTO}).
 */
export const SERVICE_PHOTO: Readonly<Record<ServiceKey, GrassePhotoKey>> = {
  "computer-learning": "img-3835",
  "computer-repair": "img-7788",
  "in-home-repair": "img-9773",
} as const;

/** The Home_Page photograph — the fourth, distinct from the three service photos. */
export const HOME_PHOTO: GrassePhotoKey = "img-2086";

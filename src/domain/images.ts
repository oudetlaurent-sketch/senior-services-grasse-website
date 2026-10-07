/**
 * Non-decorative image alt-text invariant (pure).
 *
 * Implements Requirement 6.2 and the design's Property 11: for any rendered page,
 * every non-decorative image must carry a text alternative that conveys its content
 * or function, and every decorative image must expose an empty text alternative so
 * assistive technology skips it rather than announcing a meaningless file name.
 *
 * This module is framework-free and side-effect-free: it models each image on a page
 * as an {@link ImageDescriptor} and reports whether a list of descriptors honors the
 * invariant. The site's components (layout, service pages, home page) must produce
 * markup that satisfies this same rule; keeping the rule here as one pure function
 * gives those components and the property-based test a single source of truth.
 *
 * The text alternative is modeled as `alt`: the string content of an image's `alt`
 * attribute, or `null` when the attribute is absent. For HTML images, a decorative
 * image is marked with an empty `alt=""` (present but empty), so the invariant treats
 * both an empty string and an absent attribute as "no text alternative".
 */

/**
 * One image element on a rendered page.
 *
 * - `decorative` is `true` when the image is purely presentational and carries no
 *   content or function of its own.
 * - `alt` is the text alternative: the `alt` attribute's value, or `null` when the
 *   attribute is absent.
 */
export type ImageDescriptor = {
  decorative: boolean;
  alt: string | null;
};

/**
 * Returns `true` iff the single image honors the alt-text invariant:
 *   - a non-decorative image has a non-empty text alternative, and
 *   - a decorative image has an empty (or absent) text alternative.
 *
 * A text alternative counts as "non-empty" only when it contains at least one
 * non-whitespace character: an alt of `"   "` conveys nothing to a screen-reader user
 * and so does not satisfy a non-decorative image's requirement.
 */
export function imageHasValidAlt(image: ImageDescriptor): boolean {
  const hasText = image.alt !== null && image.alt.trim().length > 0;
  return image.decorative ? !hasText : hasText;
}

/**
 * Returns `true` iff every image in `images` honors the alt-text invariant
 * (Requirement 6.2 / Property 11). An empty list trivially holds.
 */
export function allImagesHaveValidAlt(
  images: readonly ImageDescriptor[],
): boolean {
  return images.every(imageHasValidAlt);
}

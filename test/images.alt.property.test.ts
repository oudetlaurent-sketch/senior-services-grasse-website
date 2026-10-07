import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  allImagesHaveValidAlt,
  imageHasValidAlt,
  type ImageDescriptor,
} from "../src/domain/images.js";

/**
 * Property 11: Non-decorative images always have a text alternative.
 *
 * Validates: Requirements 6.2
 *
 * For any rendered page, every non-decorative image element has a non-empty text
 * alternative, and every decorative image element has an empty text alternative. The
 * checker models each image as an { decorative, alt } descriptor and reports whether a
 * list of descriptors honors that invariant.
 *
 * The expected outcome is computed here from the same rule the acceptance criterion
 * describes, written independently of the module under test, rather than from the
 * module's internals. The generators deliberately produce both honoring and violating
 * images (decorative images with text, non-decorative images with empty/whitespace/
 * absent alt) so both directions of the invariant are exercised.
 */

/**
 * Reference rule matching Requirement 6.2, independent of the module under test: a
 * single image honors the invariant iff a non-decorative image has a text alternative
 * with at least one non-whitespace character, and a decorative image has none.
 */
function expectedImageValid(image: ImageDescriptor): boolean {
  const hasText = image.alt !== null && image.alt.trim().length > 0;
  return image.decorative ? !hasText : hasText;
}

/** A text alternative: a string, including empty/whitespace-only, or an absent attribute. */
const altArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constant(""),
  fc.constant("   "),
  fc.string(),
  fc.string({ minLength: 1 }).map((s) => `${s} `),
);

/** An arbitrary image descriptor over the full space of decorative/alt combinations. */
const imageArb: fc.Arbitrary<ImageDescriptor> = fc.record({
  decorative: fc.boolean(),
  alt: altArb,
});

/** A page's images: a list (possibly empty) of arbitrary descriptors. */
const imageListArb: fc.Arbitrary<ImageDescriptor[]> = fc.array(imageArb, {
  minLength: 0,
  maxLength: 20,
});

describe("images alt-text invariant (Property 11)", () => {
  it("accepts a single image iff decorative-ness matches the presence of a text alternative", () => {
    // Feature: senior-services-website, Property 11: Non-decorative images always
    // have a text alternative. Validates: Requirements 6.2
    fc.assert(
      fc.property(imageArb, (image) => {
        expect(imageHasValidAlt(image)).toBe(expectedImageValid(image));
      }),
      { numRuns: 200 },
    );
  });

  it("accepts a page iff every image on it honors the invariant", () => {
    // Feature: senior-services-website, Property 11: Non-decorative images always
    // have a text alternative. Validates: Requirements 6.2
    fc.assert(
      fc.property(imageListArb, (images) => {
        const expected = images.every(expectedImageValid);
        expect(allImagesHaveValidAlt(images)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it("accepts representative honoring images and pages", () => {
    expect(imageHasValidAlt({ decorative: false, alt: "A technician repairs a laptop" })).toBe(true);
    expect(imageHasValidAlt({ decorative: true, alt: "" })).toBe(true);
    expect(imageHasValidAlt({ decorative: true, alt: null })).toBe(true);
    expect(allImagesHaveValidAlt([])).toBe(true);
    expect(
      allImagesHaveValidAlt([
        { decorative: false, alt: "Business logo" },
        { decorative: true, alt: "" },
        { decorative: true, alt: null },
      ]),
    ).toBe(true);
  });

  it("rejects representative violating images and pages", () => {
    expect(imageHasValidAlt({ decorative: false, alt: "" })).toBe(false); // non-decorative, empty
    expect(imageHasValidAlt({ decorative: false, alt: null })).toBe(false); // non-decorative, absent
    expect(imageHasValidAlt({ decorative: false, alt: "   " })).toBe(false); // whitespace only
    expect(imageHasValidAlt({ decorative: true, alt: "logo.png" })).toBe(false); // decorative with text
    expect(
      allImagesHaveValidAlt([
        { decorative: false, alt: "Logo" },
        { decorative: false, alt: "" }, // one violation taints the page
      ]),
    ).toBe(false);
  });
});

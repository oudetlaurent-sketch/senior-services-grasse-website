import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseHTML } from "linkedom";
import fc from "fast-check";
import { ensureBuiltSite } from "./support/build-site.js";

/**
 * Property 16: Decorative Grasse images expose no text alternative.
 *
 * Validates: Requirements 9.1 (revised), 9.3
 *
 * The full-page Grasse Decorative_Background was REMOVED from the Home_Page and the
 * Service_Pages (Requirement 9.1, revised): those pages no longer render a
 * `.decorative-background` / `DecorativeBackground` layer behind their content. Grasse
 * photographs now appear ONLY as the Home_Page Hero_Banner image (`.hero__photo`) and the
 * image-led Service_Card photos (`img.home-services__photo`), per Requirement 16.
 *
 * This suite therefore asserts two things against the built HTML (via the shared
 * `ensureBuiltSite()` helper):
 *  1. No full-page background layer survives on any Home/Service page (9.1, revised).
 *  2. Every decorative Grasse image that DOES remain — the hero photo layer and each
 *     service-card photo — exposes an EMPTY text alternative and is not announced by
 *     assistive technology (9.3): the hero layer is a nameless `aria-hidden` element with
 *     no `<img>`, and each card photo is an `<img alt="" aria-hidden="true">`.
 *
 * A fast-check property draws permuted, non-empty subsets of the Home pages (where the
 * decorative images live) over >= 100 runs, so the images are checked under many
 * orderings; the reference expectation is computed here from the plain-language rule in
 * Requirement 9.3, independent of the component internals.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");

/**
 * Pages that used to carry a full-page Decorative_Background (Home + the three
 * Service_Pages, both languages). After the revision (Requirement 9.1) NONE of them may
 * render a `.decorative-background` layer; the Home pages additionally carry the
 * decorative hero + card images that Property 16 now checks.
 */
const FORMER_BACKGROUND_PAGE_FILES: ReadonlyArray<{ label: string; file: string }> = [
  { label: "Home_Page (fr)", file: "index.html" },
  { label: "Service_Page: computer-learning (fr)", file: "services/computer-learning/index.html" },
  { label: "Service_Page: computer-repair (fr)", file: "services/computer-repair/index.html" },
  { label: "Service_Page: in-home-repair (fr)", file: "services/in-home-repair/index.html" },
  { label: "Home_Page (en)", file: "en/index.html" },
  {
    label: "Service_Page: computer-learning (en)",
    file: "en/services/computer-learning/index.html",
  },
  { label: "Service_Page: computer-repair (en)", file: "en/services/computer-repair/index.html" },
  { label: "Service_Page: in-home-repair (en)", file: "en/services/in-home-repair/index.html" },
];

/** The Home pages (fr + en), where the decorative hero + card images live. */
const HOME_PAGE_FILES: ReadonlyArray<{ label: string; file: string }> = [
  { label: "Home_Page (fr)", file: "index.html" },
  { label: "Home_Page (en)", file: "en/index.html" },
];

type LoadedPage = { label: string; file: string; document: Document };

let formerBgPages: LoadedPage[] = [];
let homePages: LoadedPage[] = [];

/**
 * Resolve the normalized text alternative a decorative element would expose to AT.
 * Returns the first non-empty name source found, or "" when the element is correctly
 * nameless. Covers aria-label, aria-labelledby (resolved against the document), title,
 * visible text content, and — for an `<img>` — a non-empty `alt`.
 */
function exposedTextAlternative(el: Element, document: Document): string {
  const ariaLabel = (el.getAttribute("aria-label") ?? "").trim();
  if (ariaLabel.length > 0) return ariaLabel;

  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby != null) {
    const named = labelledby
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => (document.getElementById(id)?.textContent ?? "").trim())
      .filter((t) => t.length > 0)
      .join(" ")
      .trim();
    if (named.length > 0) return named;
  }

  const title = (el.getAttribute("title") ?? "").trim();
  if (title.length > 0) return title;

  if (el.tagName.toLowerCase() === "img") {
    const alt = (el.getAttribute("alt") ?? "").trim();
    if (alt.length > 0) return alt;
  }

  const text = (el.textContent ?? "").trim();
  if (text.length > 0) return text;

  return "";
}

describe("decorative Grasse images — empty text alternative (Property 16)", () => {
  beforeAll(() => {
    // Build at most once across concurrent Vitest workers (see test/support/build-site.ts).
    ensureBuiltSite();
    const load = ({ label, file }: { label: string; file: string }): LoadedPage => {
      const html = readFileSync(resolve(distDir, file), "utf8");
      const { document } = parseHTML(html);
      return { label, file, document: document as unknown as Document };
    };
    formerBgPages = FORMER_BACKGROUND_PAGE_FILES.map(load);
    homePages = HOME_PAGE_FILES.map(load);
  }, 120_000);

  it("no Home_Page or Service_Page renders a full-page decorative background layer (9.1, revised)", () => {
    // The full-page Grasse background was removed; none of these pages may still paint a
    // `.decorative-background` layer behind their content.
    for (const { label, document } of formerBgPages) {
      expect(
        document.querySelector(".decorative-background"),
        `${label}: must NOT render a full-page .decorative-background layer`,
      ).toBeNull();
    }
  });

  it("every Home_Page actually renders the decorative hero + card images", () => {
    // Guards the property below against vacuously passing if the images ever disappear.
    for (const { label, document } of homePages) {
      expect(
        document.querySelector(".hero__photo"),
        `${label}: expected the decorative hero photo layer`,
      ).not.toBeNull();
      const cardPhotos = document.querySelectorAll("img.home-services__photo");
      expect(
        cardPhotos.length,
        `${label}: expected three decorative service-card photos`,
      ).toBe(3);
    }
  });

  it("the decorative Grasse images on any subset of Home pages expose no text alternative", () => {
    // Feature: senior-services-website, Property 16: Decorative Grasse images expose no
    // text alternative. Validates: Requirements 9.3
    //
    // Draw a permuted, non-empty subset of the Home pages. For each chosen page assert the
    // hero photo layer and every service-card photo are removed from the accessibility
    // tree (aria-hidden) and expose an empty text alternative.
    const pageIndexArb = fc.subarray(
      homePages.map((_, i) => i),
      { minLength: 1 },
    );

    fc.assert(
      fc.property(pageIndexArb, (indices) => {
        for (const i of indices) {
          const { label, document } = homePages[i];

          // Hero photo layer: nameless, aria-hidden, and NOT an announced <img>.
          const hero = document.querySelector(".hero__photo");
          expect(hero, `${label}: expected the hero photo layer`).not.toBeNull();
          expect(
            (hero as Element).getAttribute("aria-hidden"),
            `${label}: hero photo layer must be aria-hidden="true"`,
          ).toBe("true");
          expect(
            exposedTextAlternative(hero as Element, document),
            `${label}: hero photo layer must expose no text alternative`,
          ).toBe("");

          // Each service-card photo: decorative <img> with empty alt + aria-hidden.
          const cardPhotos = Array.from(document.querySelectorAll("img.home-services__photo"));
          expect(
            cardPhotos.length,
            `${label}: expected three decorative service-card photos`,
          ).toBe(3);
          for (const img of cardPhotos) {
            const alt = img.getAttribute("alt");
            expect(
              alt === "" || alt === null,
              `${label}: a service-card photo must have alt=""`,
            ).toBe(true);
            expect(
              exposedTextAlternative(img, document),
              `${label}: a service-card photo must expose no text alternative`,
            ).toBe("");
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("rejects representative violations of the decorative-image invariant", () => {
    // The reference rule flags a decorative element that leaks a name through any source,
    // confirming the property above is not vacuously satisfiable.
    const { document } = parseHTML(
      '<div class="hero__photo" aria-hidden="true" aria-label="Grasse village"></div>',
    );
    const labeled = document.querySelector(".hero__photo") as unknown as Element;
    expect(exposedTextAlternative(labeled, document as unknown as Document)).toBe("Grasse village");

    const { document: alted } = parseHTML(
      '<img class="home-services__photo" alt="A Grasse street" />',
    );
    const altedEl = alted.querySelector(".home-services__photo") as unknown as Element;
    expect(exposedTextAlternative(altedEl, alted as unknown as Document)).toBe("A Grasse street");

    const { document: titled } = parseHTML(
      '<div class="hero__photo" title="flower fields"></div>',
    );
    const titledEl = titled.querySelector(".hero__photo") as unknown as Element;
    expect(exposedTextAlternative(titledEl, titled as unknown as Document)).toBe("flower fields");
  });

  it("accepts the correctly nameless, aria-hidden decorative image", () => {
    const { document } = parseHTML(
      '<img class="home-services__photo" src="/grasse/img-3835.jpg" alt="" aria-hidden="true" />',
    );
    const el = document.querySelector(".home-services__photo") as unknown as Element;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(exposedTextAlternative(el, document as unknown as Document)).toBe("");
  });
});

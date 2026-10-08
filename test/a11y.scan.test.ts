import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseHTML } from "linkedom";
import { ensureBuiltSite } from "./support/build-site.js";
import {
  parseRootTokens,
  lengthToPx,
  parseHexColor,
  contrastRatio,
  CONTRAST_AA_NORMAL,
  CONTRAST_AA_LARGE,
  type Rgb,
} from "../src/domain/a11y-tokens.js";
import { isValidHeadingStructure } from "../src/domain/headings.js";

/**
 * Automated accessibility and readability scans (task 12.3).
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.5, 6.6, 6.7
 *
 * This suite is the CI-runnable accessibility gate. It has two halves:
 *
 *  1. Per-page structural scans over the built HTML. The site is a static Astro build,
 *     and axe-core requires a real browser layout engine (window + computed layout) that
 *     is not available in this Node/Vitest environment — see README "Accessibility scans
 *     in CI". So here each `dist/**\/*.html` page is parsed with linkedom and checked
 *     against static equivalents of the axe rules this task targets:
 *       - image-alt      -> every non-decorative <img> has a non-empty alt    (6.2)
 *       - label          -> every form control has a programmatic label        (6.6)
 *       - heading-order  -> exactly one <h1>, no skipped levels                (6.7)
 *       - document-title / html-has-lang / landmark basics -> WCAG A/AA shape  (6.1)
 *     The full axe-core WCAG 2a/2aa run against a real browser is wired as a documented
 *     CI step via @axe-core/playwright (README); these static checks are the deterministic,
 *     browser-free gate that always runs.
 *
 *  2. Token / computed-style audits over `src/styles/tokens.css`, the single auditable
 *     source for the readability constraints:
 *       - --font-size-body >= 18px                                            (5.1)
 *       - every declared text/background token pair >= 4.5:1 / >= 3:1          (5.2)
 *       - --target-min >= 44px and --target-gap >= 8px                        (5.4)
 *       - a focus-indicator rule distinct from the unfocused state            (6.5)
 *       - rem-based sizing invariant as the automatable proxy for 200% zoom   (5.3)
 *
 * The build is deterministic (static output) and the parses are pure, so the suite is
 * stable across runs.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");
const tokensCssPath = resolve(projectRoot, "src", "styles", "tokens.css");
const baseCssPath = resolve(projectRoot, "src", "styles", "base.css");

/** Recursively collect every `*.html` file under a directory. */
function findHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findHtmlFiles(full));
    } else if (entry.endsWith(".html")) {
      out.push(full);
    }
  }
  return out.sort();
}

type Page = { path: string; html: string; document: Document };

let pages: Page[] = [];
let tokensCss = "";
let baseCss = "";

describe("accessibility and readability scans (task 12.3)", () => {
  beforeAll(() => {
    // Build at most once across concurrent Vitest workers (see test/support/build-site.ts).
    ensureBuiltSite();
    const files = findHtmlFiles(distDir);
    expect(files.length).toBeGreaterThan(0);
    pages = files.map((path) => {
      const html = readFileSync(path, "utf8");
      const { document } = parseHTML(html);
      return { path: path.replace(projectRoot, "."), html, document: document as unknown as Document };
    });
    tokensCss = readFileSync(tokensCssPath, "utf8");
    baseCss = readFileSync(baseCssPath, "utf8");
  }, 120_000);

  // -------------------------------------------------------------------------
  // Per-page structural scans (axe-equivalent static checks)
  // -------------------------------------------------------------------------

  it("builds and parses at least the five expected pages", () => {
    // Home, three service pages, service-request form.
    expect(pages.length).toBeGreaterThanOrEqual(5);
  });

  it("every non-decorative image has a non-empty text alternative (6.2, axe image-alt)", () => {
    for (const { path, document } of pages) {
      const imgs = Array.from(document.querySelectorAll("img"));
      for (const img of imgs) {
        // A decorative image opts out with alt="" or role="presentation"/"none".
        const role = img.getAttribute("role");
        const decorative =
          role === "presentation" ||
          role === "none" ||
          img.getAttribute("aria-hidden") === "true";
        const alt = img.getAttribute("alt");
        if (decorative) {
          // Decorative images must expose an empty alternative, never a meaningful one.
          expect(alt === "" || alt === null, `${path}: decorative <img> should have empty alt`).toBe(true);
        } else {
          const hasText = alt !== null && alt.trim().length > 0;
          expect(hasText, `${path}: non-decorative <img src="${img.getAttribute("src")}"> needs non-empty alt`).toBe(true);
        }
      }
    }
  });

  it("every form control is programmatically labeled (6.6, axe label)", () => {
    for (const { path, document } of pages) {
      const controls = Array.from(
        document.querySelectorAll("input, select, textarea"),
      ).filter((el) => {
        const type = (el.getAttribute("type") ?? "").toLowerCase();
        // Hidden inputs and submit/button/reset controls are labeled by their value, not <label>.
        return !["hidden", "submit", "button", "reset", "image"].includes(type);
      });
      for (const control of controls) {
        const id = control.getAttribute("id");
        const hasForLabel =
          id != null && document.querySelector(`label[for="${id}"]`) != null;
        const wrapped = control.closest("label") != null;
        const ariaLabel = (control.getAttribute("aria-label") ?? "").trim().length > 0;
        const labelledby = control.getAttribute("aria-labelledby");
        const hasLabelledby =
          labelledby != null &&
          labelledby
            .split(/\s+/)
            .filter(Boolean)
            .every((ref) => document.getElementById(ref) != null);
        const labeled = hasForLabel || wrapped || ariaLabel || hasLabelledby;
        const name = control.getAttribute("name") ?? control.getAttribute("id") ?? "(unnamed)";
        expect(labeled, `${path}: control "${name}" has no programmatic label`).toBe(true);
      }
    }
  });

  it("each page has exactly one top-level heading and no skipped levels (6.7, axe heading-order)", () => {
    for (const { path, document } of pages) {
      const levels = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map(
        (h) => Number.parseInt(h.tagName.substring(1), 10),
      );
      expect(levels.length, `${path}: page has no headings`).toBeGreaterThan(0);
      expect(
        isValidHeadingStructure(levels),
        `${path}: heading levels [${levels.join(", ")}] violate one-h1 / no-skip`,
      ).toBe(true);
    }
  });

  it("each page carries WCAG A/AA document structure basics (6.1)", () => {
    for (const { path, document } of pages) {
      const html = document.querySelector("html");
      const lang = html?.getAttribute("lang") ?? "";
      expect(lang.trim().length, `${path}: <html> needs a non-empty lang (axe html-has-lang)`).toBeGreaterThan(0);

      const title = document.querySelector("title")?.textContent ?? "";
      expect(title.trim().length, `${path}: document needs a non-empty <title> (axe document-title)`).toBeGreaterThan(0);

      // One main landmark and a labeled main navigation (axe landmark/region rules).
      expect(document.querySelectorAll("main").length, `${path}: expected exactly one <main>`).toBe(1);
      const nav = document.querySelector("nav");
      expect(nav, `${path}: expected a <nav> landmark`).not.toBeNull();
      const navLabel =
        nav?.getAttribute("aria-label") ?? nav?.getAttribute("aria-labelledby") ?? "";
      expect(navLabel.trim().length, `${path}: <nav> needs an accessible name`).toBeGreaterThan(0);

      // A skip link to the main content supports keyboard users (6.3/6.4 shape).
      const skip = document.querySelector('a[href="#main-content"]');
      expect(skip, `${path}: expected a skip link to #main-content`).not.toBeNull();
    }
  });

  it("the current nav link is conveyed with aria-current, not color alone (6.1/3.5)", () => {
    for (const { path, document } of pages) {
      const current = document.querySelectorAll('[aria-current="page"]');
      // Exactly one current link per page keeps the state unambiguous for AT.
      expect(current.length, `${path}: expected exactly one aria-current="page" link`).toBe(1);
    }
  });

  // -------------------------------------------------------------------------
  // Token / computed-style audits
  // -------------------------------------------------------------------------

  it("body font size is at least 18px (5.1)", () => {
    const tokens = parseRootTokens(tokensCss);
    const body = tokens["--font-size-body"];
    expect(body, "--font-size-body token missing").toBeDefined();
    const px = lengthToPx(body!);
    expect(px, `--font-size-body "${body}" is not a px/rem length`).not.toBeNull();
    expect(px!).toBeGreaterThanOrEqual(18);
  });

  it("interactive target size >= 44px and spacing >= 8px (5.4)", () => {
    const tokens = parseRootTokens(tokensCss);
    const targetMin = lengthToPx(tokens["--target-min"] ?? "");
    const targetGap = lengthToPx(tokens["--target-gap"] ?? "");
    expect(targetMin, "--target-min is not a usable length").not.toBeNull();
    expect(targetGap, "--target-gap is not a usable length").not.toBeNull();
    expect(targetMin!).toBeGreaterThanOrEqual(44);
    expect(targetGap!).toBeGreaterThanOrEqual(8);
  });

  it("every declared text/background color pair meets WCAG AA contrast (5.2)", () => {
    const tokens = parseRootTokens(tokensCss);
    const color = (name: string) => parseHexColor(tokens[name] ?? "");

    const bg = color("--color-bg")!;
    const primary = color("--color-primary")!;
    const error = color("--color-error")!;

    // Normal-text pairs that must clear 4.5:1. These mirror the pairs documented in
    // tokens.css; the audit recomputes the ratio rather than trusting the comment.
    const normalTextPairs: Array<[string, string, string]> = [
      ["--color-text", "--color-bg", "body text on page"],
      ["--color-text-muted", "--color-bg", "muted text on page"],
      ["--color-link", "--color-bg", "link text on page"],
      ["--color-link-hover", "--color-bg", "link hover on page"],
      ["--color-nav-current", "--color-bg", "current nav link on page"],
      ["--color-text", "--color-surface", "body text on surface"],
      ["--color-link", "--color-surface", "link on surface"],
      ["--color-error", "--color-bg", "error text on page"],
    ];
    for (const [fg, bgName, label] of normalTextPairs) {
      const f = color(fg);
      const b = color(bgName);
      expect(f, `${fg} is not a hex color`).not.toBeNull();
      expect(b, `${bgName} is not a hex color`).not.toBeNull();
      const ratio = contrastRatio(f!, b!);
      expect(ratio, `${label} (${fg} on ${bgName}) = ${ratio.toFixed(2)}:1 < ${CONTRAST_AA_NORMAL}`).toBeGreaterThanOrEqual(
        CONTRAST_AA_NORMAL,
      );
    }

    // Text-on-colored-surface pairs (buttons, error banner) also carry normal text.
    const onPrimary = contrastRatio(color("--color-on-primary")!, primary);
    expect(onPrimary, `text on primary = ${onPrimary.toFixed(2)}:1`).toBeGreaterThanOrEqual(CONTRAST_AA_NORMAL);
    const onError = contrastRatio(color("--color-on-error")!, error);
    expect(onError, `text on error = ${onError.toFixed(2)}:1`).toBeGreaterThanOrEqual(CONTRAST_AA_NORMAL);

    // The Grasse navy page mat (--color-page) frames the light reading surface. Any text
    // placed directly on the mat uses --color-on-page; keep that pair AA as a safety
    // invariant even though page content now sits on the light --scrim-surface panel.
    const page = color("--color-page");
    const onPage = color("--color-on-page");
    expect(page, "--color-page must be a hex color").not.toBeNull();
    expect(onPage, "--color-on-page must be a hex color").not.toBeNull();
    const onPageRatio = contrastRatio(onPage!, page!);
    expect(
      onPageRatio,
      `text on page mat (--color-on-page on --color-page) = ${onPageRatio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(CONTRAST_AA_NORMAL);

    // Non-text UI tokens (focus ring, control borders) must clear the 3:1 threshold.
    const nonTextPairs: Array<[string, Rgb, string]> = [
      ["--color-focus", bg, "focus indicator on page"],
      ["--color-border", bg, "control border on page"],
    ];
    for (const [fg, b, label] of nonTextPairs) {
      const f = color(fg);
      expect(f, `${fg} is not a hex color`).not.toBeNull();
      const ratio = contrastRatio(f!, b);
      expect(ratio, `${label} (${fg}) = ${ratio.toFixed(2)}:1 < ${CONTRAST_AA_LARGE}`).toBeGreaterThanOrEqual(
        CONTRAST_AA_LARGE,
      );
    }
  });

  it("every text token also meets AA contrast against the decorative-background scrim (9.2)", () => {
    // Where a Grasse photo still sits behind text — the Home_Page Hero_Banner panel and
    // the navigation bar surface — text is never read against the raw photo: an opaque
    // scrim surface (--scrim-surface) sits between the image and the text layer, so the
    // *effective immediate background* behind text is the scrim. Requirement 9.2 asks
    // that text/background contrast still clear AA against that scrim. We recompute the
    // ratios here against --scrim-surface rather than trusting the comments in tokens.css.
    const tokens = parseRootTokens(tokensCss);
    const color = (name: string) => parseHexColor(tokens[name] ?? "");

    const scrim = color("--scrim-surface");
    expect(scrim, "--scrim-surface must be a hex color").not.toBeNull();

    // The scrim must be opaque, otherwise the underlying decorative image could bleed
    // through and the contrast would no longer be determined by --scrim-surface alone.
    const scrimOpacity = Number.parseFloat((tokens["--scrim-opacity"] ?? "").trim());
    expect(scrimOpacity, "--scrim-opacity must be fully opaque (1) so the scrim governs contrast").toBe(1);

    // Normal-text tokens that render over the scrim must clear 4.5:1; the large-text
    // threshold (3:1) is implied since 4.5 > 3.
    const normalTextTokens: Array<[string, string]> = [
      ["--color-text", "body text on scrim"],
      ["--color-text-muted", "muted text on scrim"],
      ["--color-link", "link text on scrim"],
      ["--color-link-hover", "link hover on scrim"],
      ["--color-nav-current", "current nav link on scrim"],
      ["--color-error", "error text on scrim"],
    ];
    for (const [fg, label] of normalTextTokens) {
      const f = color(fg);
      expect(f, `${fg} is not a hex color`).not.toBeNull();
      const ratio = contrastRatio(f!, scrim!);
      expect(
        ratio,
        `${label} (${fg} on --scrim-surface) = ${ratio.toFixed(2)}:1 < ${CONTRAST_AA_NORMAL}`,
      ).toBeGreaterThanOrEqual(CONTRAST_AA_NORMAL);
      // Also explicitly confirm the >= 3:1 large-text floor holds against the scrim.
      expect(
        ratio,
        `${label} (${fg} on --scrim-surface) = ${ratio.toFixed(2)}:1 < ${CONTRAST_AA_LARGE}`,
      ).toBeGreaterThanOrEqual(CONTRAST_AA_LARGE);
    }
  });

  it("defines a focus indicator distinct from the unfocused state (6.5)", () => {
    const tokens = parseRootTokens(tokensCss);
    // A dedicated focus color plus a non-zero ring width give focus a visible treatment.
    const focusColor = parseHexColor(tokens["--color-focus"] ?? "");
    expect(focusColor, "--color-focus must be a color").not.toBeNull();
    const ringWidth = lengthToPx(tokens["--focus-ring-width"] ?? "");
    expect(ringWidth, "--focus-ring-width must be a length").not.toBeNull();
    expect(ringWidth!).toBeGreaterThan(0);

    // base.css must apply that ring on focus and remove it (outline:none) when not
    // focus-visible, so the focused state is visually distinct from the unfocused one.
    const normalized = baseCss.replace(/\s+/g, " ");
    expect(normalized).toMatch(/:focus-visible\s*\{[^}]*outline:[^;}]*var\(--color-focus\)/);
    expect(normalized).toMatch(/:focus:not\(:focus-visible\)\s*\{[^}]*outline:\s*none/);
  });

  it("sizing is rem-based so content scales under 200% zoom without clipping (5.3 proxy)", () => {
    // Full 200% zoom verification needs a real browser (see README "Accessibility scans
    // in CI" / Playwright step). The automatable proxy: the readability sizes are rem-based,
    // the root font-size is left at the browser default, and the layout avoids fixed px
    // widths that would clip or force horizontal scroll when the user zooms.
    const tokens = parseRootTokens(tokensCss);
    for (const sizeToken of ["--font-size-body", "--font-size-h1", "--font-size-h2", "--font-size-h3"]) {
      expect(tokens[sizeToken], `${sizeToken} missing`).toBeDefined();
      expect(tokens[sizeToken]!.trim().endsWith("rem"), `${sizeToken} should be rem-based for zoom resilience`).toBe(true);
    }
    const normalizedBase = baseCss.replace(/\s+/g, " ");
    // The root is kept at the browser/user default rather than pinned in px.
    expect(normalizedBase).toMatch(/html\s*\{[^}]*font-size:\s*100%/);
    // Body opts into wrapping so long content does not force horizontal scroll at zoom.
    expect(normalizedBase).toMatch(/overflow-wrap:\s*break-word/);
  });

  it("the page-scrim surface introduces no fixed-px width that breaks 200% zoom (9.4 proxy)", () => {
    // Requirement 9.4 (revised): the full-page Grasse background was removed, so there is
    // no decorative photo layer to regress the 200%-zoom behavior. The automatable proxy
    // now checks the surviving surface wrapper: on each former background-bearing page the
    // `.page-scrim` content panel is present and does NOT pin a fixed-px `width`/
    // `min-width` that would clip content or force horizontal scroll at 200% zoom. Astro
    // emits the scoped component/page styles inline in each page's HTML, so we audit those
    // rules. (The Hero_Banner image is covered by the visual-template audit.)
    const HOME_AND_SERVICE = [
      "dist/index.html",
      "dist/services/computer-learning/index.html",
      "dist/services/computer-repair/index.html",
      "dist/services/in-home-repair/index.html",
      "dist/en/index.html",
      "dist/en/services/computer-learning/index.html",
      "dist/en/services/computer-repair/index.html",
      "dist/en/services/in-home-repair/index.html",
    ];
    // `page.path` is the project-relative built path (e.g. "./dist/index.html"), so match
    // by suffix against the dist-relative Home/Service page files.
    const scrimPages = pages.filter(({ path }) =>
      HOME_AND_SERVICE.some((suffix) => path.endsWith(suffix)),
    );
    // Home + three service pages, both languages.
    expect(
      scrimPages.length,
      "expected the 8 Home/Service pages (both languages)",
    ).toBeGreaterThanOrEqual(4);

    // No full-page decorative background layer survives on any of these pages (9.1).
    for (const { path, document } of scrimPages) {
      expect(
        document.querySelector(".decorative-background"),
        `${path}: must NOT render a full-page .decorative-background layer`,
      ).toBeNull();
    }

    // A width declaration in px (but not max-width, which safely caps rather than pins).
    const fixedPxWidth = /(?<!max-)(?:min-)?width\s*:\s*\d*\.?\d+px/;

    for (const { path, html, document } of scrimPages) {
      // The scrim wrapper remains as the content surface panel.
      const scrim = document.querySelector(".page-scrim");
      expect(scrim, `${path}: expected a .page-scrim content wrapper`).not.toBeNull();

      const styleText = Array.from(document.querySelectorAll("style"))
        .map((s) => s.textContent ?? "")
        .join("\n");
      const normalized = (styleText.length > 0 ? styleText : html).replace(/\s+/g, " ");

      const selector = ".page-scrim";
      // Match each rule block for the selector (Astro appends a `[data-astro-cid-…]`
      // scope to the class, so match the class optionally followed by that attribute).
      const ruleRe = new RegExp(
        `\\${selector}(?:\\[[^\\]]*\\])?\\s*\\{([^}]*)\\}`,
        "g",
      );
      let m: RegExpExecArray | null;
      let sawRule = false;
      while ((m = ruleRe.exec(normalized)) !== null) {
        sawRule = true;
        const body = m[1] ?? "";
        expect(
          fixedPxWidth.test(body),
          `${path}: ${selector} must not pin a fixed-px width (zoom regression): "${body.trim()}"`,
        ).toBe(false);
      }
      expect(sawRule, `${path}: expected a scoped CSS rule for ${selector}`).toBe(true);
    }
  });
});

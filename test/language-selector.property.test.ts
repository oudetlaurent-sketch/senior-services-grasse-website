import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseHTML } from "linkedom";
import {
  buildLanguageSelector,
  pagePath,
  NAV_ORDER,
  PAGE_PATHS,
} from "../src/domain/navigation.js";
import type { Language, PageKey } from "../src/domain/types.js";
import { ensureBuiltSite } from "./support/build-site.js";

/**
 * Property 17: Language selection round-trips through the selector.
 *
 * Validates: Requirements 7.3, 7.4
 *
 * The Language_Selector offers one target per Supported_Language that points at the SAME
 * page the visitor is currently viewing, rendered in the chosen language (design §1,
 * "Shared Layout and Navigation"). So for any page and any Supported_Language L, the
 * selector's link for L must target that page's equivalent in L — resolved from the
 * single source of truth {@link PAGE_PATHS} / {@link pagePath} — and following that link
 * lands on a document that declares `lang="L"`. Picking L and switching back therefore
 * round-trips: you stay on the same page, just in the other language (Requirements 7.3,
 * 7.4).
 *
 * The core property is the pure-helper assertion over all 7 {@link PageKey}s and both
 * Supported_Languages: `buildLanguageSelector(currentPage, current)` returns exactly one
 * entry per language, the entry for language L has `href === pagePath(L, currentPage)`
 * (the same page in that language), and exactly one entry — the one for `current` — is
 * marked current. This is framework-free and exhaustive-shaped, so it is drawn directly
 * from the shared route map.
 *
 * As a cross-check that the pure route genuinely round-trips to the rendered document
 * language (Requirement 7.7), the suite also builds the static site once and asserts that
 * following each selector href lands on a `dist` page whose root `<html lang>` equals the
 * selector entry's language. The dist tree is directory-style (`/en/about` ->
 * `dist/en/about/index.html`, `/` -> `dist/index.html`), so the mapping href -> file is a
 * cheap, deterministic lookup. The build is static (deterministic) and the parse is pure,
 * so the suite is stable across runs.
 */

const SUPPORTED_LANGUAGES: readonly Language[] = ["fr", "en"];

/** Any of the seven Navigation_Menu page keys. */
const pageKeyArb: fc.Arbitrary<PageKey> = fc.constantFrom(...NAV_ORDER);
/** Any Supported_Language (French or English). */
const languageArb: fc.Arbitrary<Language> = fc.constantFrom(
  ...SUPPORTED_LANGUAGES,
);

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");

/**
 * Map a root-relative selector href to its built `dist/*.html` file. Astro emits
 * directory-style output, so a route path resolves to `<path>/index.html` ("/" and
 * trailing-slash paths resolve to the directory's index.html).
 */
function distFileForHref(href: string): string {
  const pathname = new URL(href, "http://local.invalid").pathname;
  const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === ""
    ? join(distDir, "index.html")
    : join(distDir, trimmed, "index.html");
}

/** Read the `lang` attribute off a page's root `<html>` element (null when absent). */
function rootHtmlLang(html: string): string | null {
  const { document } = parseHTML(html);
  return document.querySelector("html")?.getAttribute("lang") ?? null;
}

describe("language selector — round-trips through the selector (Property 17)", () => {
  it("the selector targets the same page in each language, with exactly one current", () => {
    // Feature: senior-services-website, Property 17: Language selection round-trips
    // through the selector. Validates: Requirements 7.3, 7.4
    fc.assert(
      fc.property(pageKeyArb, languageArb, (currentPage, current) => {
        const entries = buildLanguageSelector(currentPage, current);

        // Exactly one entry per Supported_Language, in the fr-then-en order.
        expect(entries.map((e) => e.language)).toEqual(SUPPORTED_LANGUAGES);

        for (const entry of entries) {
          // The selector link for language L targets the SAME page (currentPage) in L,
          // resolved from the shared route map — the round-trip source of truth.
          expect(entry.href).toBe(pagePath(entry.language, currentPage));
          // Equivalently, following the link stays on currentPage: the href is exactly
          // that page's route in the entry's language and no other page's.
          expect(entry.href).toBe(PAGE_PATHS[entry.language][currentPage]);
        }

        // Exactly one entry is marked current — the active language — and it is the entry
        // for `current`.
        const currentEntries = entries.filter((e) => e.current);
        expect(currentEntries).toHaveLength(1);
        expect(currentEntries[0].language).toBe(current);
      }),
      { numRuns: 100 },
    );
  });

  describe("round-trip reaches a document in the selected language", () => {
    beforeAll(() => {
      // Build at most once across concurrent Vitest workers (see test/support/build-site.ts).
      ensureBuiltSite();
    }, 120_000);

    it("following each selector href lands on a page whose <html lang> matches", () => {
      // Feature: senior-services-website, Property 17: Language selection round-trips
      // through the selector. Validates: Requirements 7.3, 7.4
      fc.assert(
        fc.property(pageKeyArb, languageArb, (currentPage, current) => {
          for (const entry of buildLanguageSelector(currentPage, current)) {
            const file = distFileForHref(entry.href);
            const html = readFileSync(file, "utf8");
            const lang = rootHtmlLang(html);
            expect(
              lang,
              `${entry.href} -> ${file}: root <html> must declare lang="${entry.language}"`,
            ).toBe(entry.language);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});

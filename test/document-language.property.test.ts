import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseHTML } from "linkedom";
import { ensureBuiltSite } from "./support/build-site.js";

/**
 * Property 14: Each page declares the selected document language.
 *
 * Validates: Requirements 7.7
 *
 * The site is bilingual with static per-language routes: French (the default language)
 * pages live at the existing paths and English pages under an `/en/` prefix (design §1,
 * "Bilingual architecture"). The selected language of a rendered page is therefore
 * encoded in its route. For any rendered page, the root `<html>` element must declare
 * the selected language of *that* page — `lang="fr"` for a French route and `lang="en"`
 * for an English (`/en/`) route — so assistive technology announces each page in its own
 * language (Requirement 7.7).
 *
 * The site is a static Astro build, so "any rendered page" is the finite set of
 * `dist/**\/*.html` artifacts. Following test/a11y.scan.test.ts, this suite builds the
 * site once (via the shared ensureBuiltSite helper) and collects every emitted HTML
 * page. Each discovered page is classified by whether its dist path lives under the
 * `en/` directory; the expected `lang` is derived from that classification (English iff
 * under `/en/`, French otherwise). The fast-check property then draws arbitrary
 * non-empty permuted subsets of the discovered pages and asserts that every drawn page's
 * root `<html>` tag declares the language expected for its route. Non-vacuity guards
 * assert that BOTH some French and some English pages were discovered, so the property is
 * never satisfied by an empty — or single-language — page set.
 *
 * The build is deterministic (static output) and the parse is pure, so the suite is
 * stable across runs.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");

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

type Page = { path: string; html: string };

/**
 * Read the `lang` attribute off a page's root `<html>` element. Parses with linkedom
 * (the same engine a11y.scan.test.ts uses) rather than trusting a hand-rolled regex, so
 * attribute quoting, ordering, and casing are handled by a real HTML parser. Returns
 * null when there is no `<html>` element or no `lang` attribute.
 */
function rootHtmlLang(html: string): string | null {
  const { document } = parseHTML(html);
  const root = document.querySelector("html");
  return root?.getAttribute("lang") ?? null;
}

let pages: Page[] = [];

/**
 * The document language expected for a built page, from its route: English for any page
 * under the `/en/` prefix, French (the default) otherwise. `path` is the dist-relative
 * path such as `./dist/en/about/index.html` or `./dist/index.html`.
 */
function expectedLangForPath(path: string): "fr" | "en" {
  const normalized = path.split("\\").join("/");
  return /\/dist\/en\//.test(normalized) ? "en" : "fr";
}

describe("document language — each page declares its language (Property 14)", () => {
  beforeAll(() => {
    // Build at most once across concurrent Vitest workers (see test/support/build-site.ts).
    ensureBuiltSite();
    const files = findHtmlFiles(distDir);
    expect(files.length).toBeGreaterThan(0);
    pages = files.map((path) => ({
      path: path.replace(projectRoot, "."),
      html: readFileSync(path, "utf8"),
    }));
  }, 120_000);

  it("discovers both French and English pages (non-vacuity guard)", () => {
    // The bilingual tree emits French pages at the existing paths and English pages under
    // /en/. Guard the property below from being vacuously true over an empty page set,
    // and ensure both languages are actually exercised.
    const frPages = pages.filter((p) => expectedLangForPath(p.path) === "fr");
    const enPages = pages.filter((p) => expectedLangForPath(p.path) === "en");
    expect(frPages.length).toBeGreaterThanOrEqual(5);
    expect(enPages.length).toBeGreaterThanOrEqual(5);
  });

  it("every rendered page's root <html> declares its route's language", () => {
    // Feature: senior-services-website, Property 14: Each page declares the selected
    // document language. Validates: Requirements 7.7
    expect(pages.length).toBeGreaterThanOrEqual(10);
    fc.assert(
      fc.property(
        fc.shuffledSubarray(pages, { minLength: 1 }),
        (subset) => {
          for (const page of subset) {
            const lang = rootHtmlLang(page.html);
            const expected = expectedLangForPath(page.path);
            expect(
              lang,
              `${page.path}: root <html> must declare lang="${expected}"`,
            ).toBe(expected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseHTML } from "linkedom";
import { ensureBuiltSite } from "./support/build-site.js";
import { BUSINESS_INFO } from "../src/content/business.js";
import { getMessages } from "../src/content/i18n.js";
import { NAV_ORDER, PAGE_PATHS, pagePath } from "../src/domain/navigation.js";
import { isValidHeadingStructure } from "../src/domain/headings.js";
import {
  parseRootTokens,
  parseHexColor,
  contrastRatio,
  CONTRAST_AA_NORMAL,
  CONTRAST_AA_LARGE,
} from "../src/domain/a11y-tokens.js";
import type { Language, PageKey } from "../src/domain/types.js";

/**
 * Example / audit checks for the renamed business identity, the removed postal address,
 * the Navigation_Menu + Language_Selector contrast over the decorative background, and
 * the About_Photo (task 32.1).
 *
 * Validates: Requirements 8.2, 9.2, 10.1, 10.3, 11.2, 11.5, 11.6, 11.7
 *
 * These acceptance criteria are per-page content, presence, structure, and computed-style
 * concerns rather than universal properties (design "Testing Strategy"), so this suite
 * audits them deterministically and browser-free: it builds the static site once (via the
 * shared `ensureBuiltSite`) and inspects the emitted `dist/**\/*.html`, parsed with
 * linkedom — the same approach as test/home-sections.audit.test.ts,
 * test/bilingual-pages.audit.test.ts, and test/localization-and-grasse.audit.test.ts.
 *
 * Expected strings and routes are compared against the single content sources
 * (`BUSINESS_INFO`, `getMessages`, `PAGE_PATHS`, `ABOUT_PHOTO`) rather than re-hard-coded,
 * so the audit tracks the content/route/token model instead of a copy of it. In
 * particular the business name is read from `BUSINESS_INFO.name`, so the audit follows a
 * later rename, and the About_Photo assertions handle BOTH the current `src: null`
 * (placeholder) state and a future supplied-photo state without breaking.
 *
 * What is covered here (the pieces specific to tasks 29–31):
 *  - the renamed identity "Aide à la personne" in nav/footer/Home (10.1);
 *  - no postal/street address or postal code in the site-wide contact block (8.2), scoped
 *    to the footer + Home contact block so the prose service-area statement (which still
 *    says "Grasse (06130)") does not trip the check; the email stays labeled "Email" (10.3);
 *  - the header carries an opaque scrim surface (never transparent over the photo) and the
 *    nav/selector link colors clear AA against that scrim (9.2);
 *  - the About_Photo slot: a content <img> with non-empty alt OR a provisional placeholder,
 *    placed before the bio, with a valid single-h1 heading structure (11.2/11.5/11.6/11.7).
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");
const tokensCssPath = resolve(projectRoot, "src", "styles", "tokens.css");
const siteLayoutPath = resolve(projectRoot, "src", "layouts", "SiteLayout.astro");

/** Both Supported_Languages, French first (the default). */
const SUPPORTED_LANGUAGES: readonly Language[] = ["fr", "en"];

/** The postal-code / city / street tokens that must NEVER appear in the contact block (8.2). */
const POSTAL_CODE = "06130";
const CITY = "GRASSE";
const STREET = "Oratoire";

type Page = { file: string; html: string; document: Document };

/**
 * Map a root-relative route href (from the shared PAGE_PATHS) to its built `dist/*.html`
 * file. Astro emits directory-style output, so `/en/about` -> `en/about/index.html` and
 * `/` -> `index.html`.
 */
function distFileForHref(href: string): string {
  const pathname = new URL(href, "http://local.invalid").pathname;
  const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === "" ? "index.html" : `${trimmed}/index.html`;
}

/** The normalized visible text content of an element (whitespace collapsed). */
function textOf(el: Element | Document | null): string {
  if (el == null) return "";
  return ((el as Element).textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Ordered heading levels (1..6) of a document. */
function headingLevels(document: Document): number[] {
  return Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) =>
    Number.parseInt(h.tagName.substring(1), 10),
  );
}

const byFile = new Map<string, Page>();

function loadPage(file: string): Page {
  const existing = byFile.get(file);
  if (existing) return existing;
  const html = readFileSync(join(distDir, file), "utf8");
  const { document } = parseHTML(html);
  const page: Page = { file, html, document: document as unknown as Document };
  byFile.set(file, page);
  return page;
}

/** The built page for a given PageKey in a given language, via the shared route map. */
function pageFor(language: Language, key: PageKey): Page {
  return loadPage(distFileForHref(pagePath(language, key)));
}

describe("identity, address removal, nav contrast, and About photo audit (task 32.1)", () => {
  let tokensCss = "";
  let siteLayoutSrc = "";

  beforeAll(() => {
    // Build at most once across concurrent Vitest workers (see test/support/build-site.ts).
    ensureBuiltSite();
    // Pre-load every page in both languages so a missing file fails loudly.
    for (const language of SUPPORTED_LANGUAGES) {
      for (const key of NAV_ORDER) {
        loadPage(distFileForHref(pagePath(language, key)));
      }
    }
    tokensCss = readFileSync(tokensCssPath, "utf8");
    siteLayoutSrc = readFileSync(siteLayoutPath, "utf8");
  }, 190_000);

  // -------------------------------------------------------------------------
  // 10.1 — The renamed business identity renders in nav, footer, and Home
  // -------------------------------------------------------------------------

  it('the footer contact area is headed "Contact" on every page in both languages (10.1)', () => {
    // The contact area (footer, next to the phone/email) heads its block with the literal
    // "Contact", distinct from the full business identity used elsewhere (nav/Home h1).
    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const { file, document } = pageFor(language, key);
        const footer = document.querySelector("footer.site-footer");
        expect(footer, `${file}: expected a site-wide footer`).not.toBeNull();
        const name = textOf(footer!.querySelector(".site-footer__name"));
        expect(name, `${file}: footer .site-footer__name must read "Contact"`).toBe("Contact");
      }
    }
  });

  it("the Home_Page h1 is the localized home title in both languages (10.1, 7.6)", () => {
    // The Home_Page title/h1 is the per-language home title: FR keeps the brand name
    // "Aide à la personne"; EN uses its English equivalent.
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "home");
      const h1 = textOf(document.querySelector("h1"));
      const expected = getMessages(language).home.title;
      expect(h1, `${file}: Home_Page h1 must be the ${language} home title`).toBe(expected);
    }
  });

  it('the "Contact" chrome identity appears site-wide in the footer in both languages (10.1)', () => {
    // On EVERY page in both languages the footer contact area carries the "Contact"
    // identity next to the phone/email, so the chrome identity is present site-wide.
    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const { file, document } = pageFor(language, key);
        const footer = document.querySelector("footer.site-footer");
        expect(footer, `${file}: expected a site-wide footer`).not.toBeNull();
        expect(
          textOf(footer).includes("Contact"),
          `${file}: the footer must carry the "Contact" identity`,
        ).toBe(true);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 8.2 / 10.3 — No postal address in the site-wide contact block; email labeled "Email"
  // -------------------------------------------------------------------------

  it("the footer contact block shows phone + email only — no postal address or postal code (8.2)", () => {
    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const { file, document } = pageFor(language, key);
        const footer = document.querySelector("footer.site-footer");
        expect(footer, `${file}: expected a site-wide footer`).not.toBeNull();
        const footerText = textOf(footer);

        // The structured postal address was removed (Requirement 8.2): no postal code,
        // no city, no street line anywhere in the site-wide contact block.
        expect(footerText, `${file}: footer must not show the postal code`).not.toContain(
          POSTAL_CODE,
        );
        expect(footerText, `${file}: footer must not show the city`).not.toContain(CITY);
        expect(footerText, `${file}: footer must not show the street line`).not.toContain(STREET);

        // Phone + email ARE still present (the contact block is phone + email only).
        expect(footerText, `${file}: footer must still show the phone`).toContain(
          BUSINESS_INFO.phone,
        );
        expect(footerText, `${file}: footer must still show the email`).toContain(
          BUSINESS_INFO.email,
        );
      }
    }
  });

  it("the Home_Page contact block shows phone + email only — no postal address or postal code (8.2)", () => {
    // Scope the no-address check to the CONTACT BLOCK (the section labelled by
    // #home-contact-heading). The Home_Page prose service-area statement legitimately
    // still says "Grasse (06130)" elsewhere, so a page-wide scan would false-positive —
    // we deliberately look only at the contact section here.
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "home");
      const contact = document.querySelector(
        'section[aria-labelledby="home-contact-heading"]',
      );
      expect(contact, `${file}: expected the Home_Page contact block`).not.toBeNull();
      const contactText = textOf(contact);

      expect(contactText, `${file}: contact block must not show the postal code`).not.toContain(
        POSTAL_CODE,
      );
      expect(contactText, `${file}: contact block must not show the city`).not.toContain(CITY);
      expect(contactText, `${file}: contact block must not show the street line`).not.toContain(
        STREET,
      );

      // Phone + email are the contact details presented.
      expect(contactText, `${file}: contact block must show the phone`).toContain(
        BUSINESS_INFO.phone,
      );
      expect(contactText, `${file}: contact block must show the email`).toContain(
        BUSINESS_INFO.email,
      );
    }
  });

  it("the Home_Page service-area statement may still mention Grasse (06130) in prose (8.2 scope)", () => {
    // This documents the intended scope of the 8.2 check above: the prose service-area
    // statement is NOT part of the structured contact details and legitimately retains
    // "Grasse (06130)". Asserting it here keeps the no-address check honestly scoped —
    // if someone broadened it to the whole page, this expectation and the one above would
    // conflict and surface the mistake.
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "home");
      const area = document.querySelector(".home-service-area");
      expect(area, `${file}: expected the prose service-area statement`).not.toBeNull();
      const text = textOf(area);
      expect(text, `${file}: service-area statement should mention Grasse`).toContain("Grasse");
      expect(text, `${file}: service-area statement should mention 06130`).toContain(POSTAL_CODE);
      // It is NOT inside the contact block (the two regions are distinct).
      const contact = document.querySelector(
        'section[aria-labelledby="home-contact-heading"]',
      );
      expect(contact!.contains(area), `${file}: service-area prose must sit OUTSIDE the contact block`).toBe(
        false,
      );
    }
  });

  it('the email is still present and labeled "Email" in the footer and Home contact block (10.3)', () => {
    // The email label is the WORD "Email" in both languages (never "Courriel").
    for (const language of SUPPORTED_LANGUAGES) {
      expect(getMessages(language).footer.emailLabel, `${language} footer email label`).toBe(
        "Email",
      );
    }

    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const { file, document } = pageFor(language, key);
        const footer = document.querySelector("footer.site-footer");
        const emailLine = Array.from(footer!.querySelectorAll("p")).find((p) =>
          (p.textContent ?? "").includes(BUSINESS_INFO.email),
        );
        expect(emailLine, `${file}: footer must have an email line`).toBeDefined();
        const label = textOf(emailLine!.querySelector("span"));
        expect(label, `${file}: footer email must be labeled "Email"`).toContain("Email");
        expect(
          /courriel/i.test(label),
          `${file}: footer email label must not be "Courriel"`,
        ).toBe(false);
      }
    }

    // Home contact block: the email line is labeled "Email" too.
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "home");
      const contact = document.querySelector(
        'section[aria-labelledby="home-contact-heading"]',
      );
      const emailLine = Array.from(contact!.querySelectorAll("p")).find((p) =>
        (p.textContent ?? "").includes(BUSINESS_INFO.email),
      );
      expect(emailLine, `${file}: Home contact block must have an email line`).toBeDefined();
      const labelSpan = textOf(emailLine!.querySelector(".home-contact__label"));
      expect(labelSpan, `${file}: Home email must be labeled "Email"`).toContain("Email");
      // The email is exposed as a mailto: link.
      expect(
        emailLine!.querySelector(`a[href="mailto:${BUSINESS_INFO.email}"]`),
        `${file}: Home email must be a mailto: link`,
      ).not.toBeNull();
    }
  });

  // -------------------------------------------------------------------------
  // 9.2 — Nav / Language_Selector contrast over the decorative background
  // -------------------------------------------------------------------------

  it("the site-header carries an opaque scrim surface so nav links are never over the photo (9.2)", () => {
    // The regression this guards is "blue link rendered directly over the Grasse photo is
    // unreadable". The fix gives the header the opaque --scrim-surface as its own
    // background, so the nav + Language_Selector are read against a solid surface, not the
    // decorative image. Astro emits the layout's scoped <style> inline on every page, so
    // we assert the rule is present AND the scrim surface is opaque.
    const normalizedLayout = siteLayoutSrc.replace(/\s+/g, " ");
    expect(
      normalizedLayout,
      "SiteLayout .site-header must set an opaque scrim background so nav isn't over the photo",
    ).toMatch(/\.site-header\s*\{[^}]*background-color:\s*var\(--scrim-surface/);

    // The scrim surface must be opaque, otherwise the photo could bleed through and the
    // nav contrast would no longer be governed by --scrim-surface alone.
    const tokens = parseRootTokens(tokensCss);
    const scrimOpacity = Number.parseFloat((tokens["--scrim-opacity"] ?? "").trim());
    expect(scrimOpacity, "--scrim-opacity must be fully opaque (1) so the scrim governs contrast").toBe(
      1,
    );

    // And on every built page the header is actually present and carries the nav + selector.
    for (const language of SUPPORTED_LANGUAGES) {
      for (const key of NAV_ORDER) {
        const { file, document } = pageFor(language, key);
        const header = document.querySelector("header.site-header");
        expect(header, `${file}: expected the site-header`).not.toBeNull();
        expect(
          header!.querySelector('nav[aria-label="Main"]'),
          `${file}: the header must contain the Navigation_Menu`,
        ).not.toBeNull();
        expect(
          header!.querySelector("nav.lang-selector"),
          `${file}: the header must contain the Language_Selector`,
        ).not.toBeNull();
      }
    }
  });

  it("the nav link / current / hover colors clear AA contrast against the scrim surface (9.2)", () => {
    // Recompute the ratios here against --scrim-surface (the header's effective immediate
    // background) rather than trusting the comments in tokens.css. These are exactly the
    // colors the Navigation_Menu and Language_Selector links use (default/current/hover),
    // and the focus indicator the links apply, so this confirms every nav state stays
    // readable over the scrim — the "blue link over the photo" regression cannot return.
    const tokens = parseRootTokens(tokensCss);
    const color = (name: string) => parseHexColor(tokens[name] ?? "");

    const scrim = color("--scrim-surface");
    expect(scrim, "--scrim-surface must be a hex color").not.toBeNull();

    // Normal-text nav colors must clear 4.5:1 against the scrim.
    const navTextTokens: Array<[string, string]> = [
      ["--color-link", "nav link (default)"],
      ["--color-nav-current", "current nav link"],
      ["--color-link-hover", "nav link (hover)"],
    ];
    for (const [tokenName, label] of navTextTokens) {
      const fg = color(tokenName);
      expect(fg, `${tokenName} is not a hex color`).not.toBeNull();
      const ratio = contrastRatio(fg!, scrim!);
      expect(
        ratio,
        `${label} (${tokenName} on --scrim-surface) = ${ratio.toFixed(2)}:1 < ${CONTRAST_AA_NORMAL}`,
      ).toBeGreaterThanOrEqual(CONTRAST_AA_NORMAL);
    }

    // The focus indicator is non-text UI, so the 3:1 floor applies against the scrim.
    const focus = color("--color-focus");
    expect(focus, "--color-focus must be a hex color").not.toBeNull();
    const focusRatio = contrastRatio(focus!, scrim!);
    expect(
      focusRatio,
      `nav focus indicator (--color-focus on --scrim-surface) = ${focusRatio.toFixed(2)}:1 < ${CONTRAST_AA_LARGE}`,
    ).toBeGreaterThanOrEqual(CONTRAST_AA_LARGE);
  });

  // -------------------------------------------------------------------------
  // 11.2 / 11.5 / 11.6 / 11.7 — About_Photo slot and placement
  // -------------------------------------------------------------------------

  it("the About_Page shows NO photo and no photo placeholder (About photo removed)", () => {
    // The About_Page photograph (and its provisional placeholder) was removed per the
    // user's request: the "Qui suis-je ?" / About page is text-only (name + biography).
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "about");
      expect(
        document.querySelector("img.about__photo"),
        `${file}: the About_Page must render no photo <img>`,
      ).toBeNull();
      expect(
        document.querySelector(".about__photo-placeholder"),
        `${file}: the About_Page must render no photo placeholder`,
      ).toBeNull();
      expect(
        document.querySelector(".about__media"),
        `${file}: the About_Page must render no media column`,
      ).toBeNull();
      // The name and biography remain.
      expect(
        document.querySelector(".about__name"),
        `${file}: the About_Page must still show the name`,
      ).not.toBeNull();
      expect(
        document.querySelector(".about__bio"),
        `${file}: the About_Page must still show the biography`,
      ).not.toBeNull();
    }
  });

  it("the About_Page still has exactly one h1 and a valid heading order in both languages (11.5)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "about");
      const levels = headingLevels(document);
      expect(
        levels.filter((l) => l === 1).length,
        `${file}: About_Page needs exactly one h1`,
      ).toBe(1);
      // Reuse the domain heading-structure validator (task 2.8) rather than re-deriving it.
      expect(
        isValidHeadingStructure(levels),
        `${file}: About_Page heading levels [${levels.join(", ")}] violate one-h1 / no-skip`,
      ).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Sanity: the route map resolves to real built pages (both languages, 14 pages).
  // -------------------------------------------------------------------------

  it("every audited page exists in both languages (sanity)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const key of NAV_ORDER) {
        const href = PAGE_PATHS[language][key];
        const file = distFileForHref(href);
        const html = readFileSync(join(distDir, file), "utf8");
        expect(html.length, `${file}: expected a built ${language} page for "${key}"`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});

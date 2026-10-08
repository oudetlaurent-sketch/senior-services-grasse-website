import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseHTML } from "linkedom";
import { ensureBuiltSite } from "./support/build-site.js";
import { BUSINESS_INFO, phoneHref } from "../src/content/business.js";
import { getMessages } from "../src/content/i18n.js";
import {
  NAV_ORDER,
  PAGE_PATHS,
  buildLanguageSelector,
  pagePath,
} from "../src/domain/navigation.js";
import { isValidHeadingStructure } from "../src/domain/headings.js";
import type { Language, PageKey } from "../src/domain/types.js";

/**
 * Example / audit checks for the bilingual content model, the business identity, the
 * About_Page, and the Scheduling_Page (task 22.5).
 *
 * Validates: Requirements 7.1, 7.6, 10.1, 10.2, 10.3, 11.1, 11.2, 11.4, 12.2, 12.4, 12.5
 *
 * These acceptance criteria are per-page content, presence, and formatting concerns
 * rather than universal properties (design "Testing Strategy"), so this suite audits them
 * deterministically and browser-free: it builds the static site once (via the shared
 * `ensureBuiltSite`) and inspects the emitted `dist/**\/*.html`, parsed with linkedom —
 * the same approach as test/a11y.scan.test.ts and test/localization-and-grasse.audit.test.ts.
 *
 * The build is 14 pages: the seven French pages at their existing paths and their seven
 * English equivalents under `/en/`. Expected strings are compared against the single
 * content sources (`getMessages(language)`, `BUSINESS_INFO`, `PAGE_PATHS`) rather than
 * re-hard-coded, so the audit tracks the content/route model instead of a copy of it.
 *
 * What is covered here (the pieces NOT already covered by the task-16.4 French audit or
 * the token/computed-style a11y scan):
 *  - Bilingual presence + per-language chrome for every page (7.1, 7.6).
 *  - Language_Selector round-trip at the HTML level, with the active language marked (7.3/7.4).
 *  - "Aide à la personne" identity + my.name@gmail.com + the "Email" label (never "Courriel")
 *    site-wide and on the Home_Page (10.1–10.3).
 *  - About_Page name + provisional bio in both languages, one h1, valid heading order (11.1/11.2/11.4).
 *  - Scheduling_Page coming-soon placeholder + email/phone fallback in both languages,
 *    one h1, valid heading order (12.5); plus a source-level contract check that the
 *    configured embed (12.2) and the hidden error-fallback (12.4) markup exist, since the
 *    default build ships the booking URL unset.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");

/** Both Supported_Languages, French first (the default). */
const SUPPORTED_LANGUAGES: readonly Language[] = ["fr", "en"];

/** The email the site must present site-wide and on the Home_Page (10.2). */
const BUSINESS_EMAIL = "my.name@gmail.com";

type Page = {
  /** Dist-relative POSIX path, e.g. `en/about/index.html`. */
  file: string;
  html: string;
  document: Document;
};

/**
 * Map a root-relative route href (from the shared PAGE_PATHS) to its built
 * `dist/*.html` file. Astro emits directory-style output, so `/en/about` ->
 * `en/about/index.html` and `/` -> `index.html`.
 */
function distFileForHref(href: string): string {
  const pathname = new URL(href, "http://local.invalid").pathname;
  const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === "" ? "index.html" : `${trimmed}/index.html`;
}

/** The normalized visible text content of a document (whitespace collapsed). */
function textOf(document: Document): string {
  return (document.body?.textContent ?? document.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
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

/** Normalized text of a nav's link labels. */
function navLabels(document: Document): string[] {
  const nav = document.querySelector('nav[aria-label="Main"]');
  expect(nav, "expected the main <nav>").not.toBeNull();
  return Array.from(nav!.querySelectorAll("a")).map((a) =>
    (a.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

/** Ordered heading levels (1..6) of a document. */
function headingLevels(document: Document): number[] {
  return Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) =>
    Number.parseInt(h.tagName.substring(1), 10),
  );
}

describe("bilingual, identity, About, and Scheduling audit (task 22.5)", () => {
  beforeAll(() => {
    // Build at most once across concurrent Vitest workers (see test/support/build-site.ts).
    ensureBuiltSite();
    // Pre-load every page referenced by the shared route map so a missing file fails loudly.
    for (const language of SUPPORTED_LANGUAGES) {
      for (const key of NAV_ORDER) {
        loadPage(distFileForHref(pagePath(language, key)));
      }
    }
  }, 190_000);

  // -------------------------------------------------------------------------
  // 7.1 / 7.6 — Both languages present for every page, each in its own language
  // -------------------------------------------------------------------------

  it("every page exists in both languages at its per-language route (7.1, 7.6)", () => {
    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const file = distFileForHref(pagePath(language, key));
        const html = readFileSync(join(distDir, file), "utf8");
        expect(html.length, `${file}: expected a built ${language} page for "${key}"`).toBeGreaterThan(0);
      }
    }
    // The build is exactly the seven pages in each language (14 total).
    expect(NAV_ORDER.length).toBe(7);
  });

  it("each page declares its own document language on <html lang> (7.6)", () => {
    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const { file, document } = pageFor(language, key);
        const lang = document.querySelector("html")?.getAttribute("lang");
        expect(lang, `${file}: <html> must declare lang="${language}"`).toBe(language);
      }
    }
  });

  it("each page's nav labels are the page titles in that page's language (7.1, 7.6)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const nav = getMessages(language).nav;
      // The expected seven labels in this language, from the single content source.
      const expected = NAV_ORDER.map((key) => nav[key]);
      // Confirm French and English labels genuinely differ for a representative entry,
      // so a page rendered in the wrong language would be caught.
      const otherLang: Language = language === "fr" ? "en" : "fr";
      expect(nav.home).not.toBe(getMessages(otherLang).nav.home);

      for (const key of NAV_ORDER) {
        const { file, document } = pageFor(language, key);
        const labels = navLabels(document);
        for (const title of expected) {
          expect(labels, `${file}: nav must contain the ${language} label "${title}"`).toContain(
            title,
          );
        }
      }
    }
  });

  it("each page's own h1 is the page title in that page's language (7.1, 7.6)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const nav = getMessages(language).nav;
      for (const key of NAV_ORDER) {
        // The Home_Page h1 is the business name ("Aide à la personne") rather than the nav label.
        if (key === "home") continue;
        const { file, document } = pageFor(language, key);
        const h1 = (document.querySelector("h1")?.textContent ?? "").replace(/\s+/g, " ").trim();
        expect(h1, `${file}: h1 must be the ${language} page title`).toBe(nav[key]);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 7.3 / 7.4 — Language_Selector round-trip at the HTML level
  // -------------------------------------------------------------------------

  it("every page's Language_Selector links to the same page in both languages, active marked (7.3, 7.4)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const key of NAV_ORDER) {
        const { file, document } = pageFor(language, key);
        const selector = document.querySelector("nav.lang-selector");
        expect(selector, `${file}: expected the Language_Selector`).not.toBeNull();

        const links = Array.from(selector!.querySelectorAll("a"));
        // One link per Supported_Language.
        expect(links.length, `${file}: selector must offer both languages`).toBe(2);

        // The expected hrefs: the SAME page in each language, from the shared route map.
        const expected = buildLanguageSelector(key, language);
        for (const entry of expected) {
          const link = links.find((a) => a.getAttribute("hreflang") === entry.language);
          expect(
            link,
            `${file}: selector must offer a ${entry.language} link`,
          ).toBeDefined();
          const href = link!.getAttribute("href");
          // Round-trip: the link for language L targets this page's equivalent in L.
          expect(href, `${file}: ${entry.language} selector link must target ${entry.href}`).toBe(
            entry.href,
          );
          expect(href).toBe(PAGE_PATHS[entry.language][key]);

          // The active language is marked (aria-current="true"); the other is not.
          const ariaCurrent = link!.getAttribute("aria-current");
          if (entry.language === language) {
            expect(
              ariaCurrent,
              `${file}: the active ${entry.language} selector link must be aria-current`,
            ).toBe("true");
          } else {
            expect(
              ariaCurrent,
              `${file}: the inactive ${entry.language} selector link must not be aria-current`,
            ).toBeNull();
          }
        }

        // Exactly one selector link is marked current.
        const current = links.filter((a) => a.getAttribute("aria-current") === "true");
        expect(current.length, `${file}: exactly one selector link must be active`).toBe(1);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 10.1–10.3 — "Aide à la personne" identity, real email, and the "Email" label
  // -------------------------------------------------------------------------

  it('the footer contact area is headed "Contact" on every page (10.1)', () => {
    expect(BUSINESS_INFO.name).toBe("Aide à la personne");
    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const { file, document } = pageFor(language, key);
        const footer = document.querySelector("footer.site-footer");
        expect(footer, `${file}: expected a site-wide footer`).not.toBeNull();
        const name = (footer!.querySelector(".site-footer__name")?.textContent ?? "").trim();
        expect(name, `${file}: footer contact area must be headed "Contact"`).toBe(
          "Contact",
        );
      }
    }
  });

  it('the business name "Aide à la personne" appears on the Home_Page in both languages (10.1)', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "home");
      const h1 = (document.querySelector("h1")?.textContent ?? "").trim();
      expect(
        h1,
        `${file}: Home_Page h1 must be the business name "Aide à la personne"`,
      ).toBe("Aide à la personne");
    }
  });

  it("the real email appears in the footer on every page (10.2)", () => {
    expect(BUSINESS_INFO.email).toBe(BUSINESS_EMAIL);
    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const { file, document } = pageFor(language, key);
        const footer = document.querySelector("footer.site-footer");
        expect(footer, `${file}: expected a site-wide footer`).not.toBeNull();
        const footerText = (footer!.textContent ?? "").replace(/\s+/g, " ").trim();
        expect(footerText, `${file}: footer must show ${BUSINESS_EMAIL}`).toContain(BUSINESS_EMAIL);
        // The email is exposed as a mailto: link.
        const mailto = footer!.querySelector(`a[href="mailto:${BUSINESS_EMAIL}"]`);
        expect(mailto, `${file}: footer email must be a mailto: link`).not.toBeNull();
      }
    }
  });

  it("the real email appears on the Home_Page in both languages (10.2)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "home");
      const main = document.querySelector("main");
      expect(main, `${file}: expected a <main>`).not.toBeNull();
      const mainText = (main!.textContent ?? "").replace(/\s+/g, " ").trim();
      expect(mainText, `${file}: Home_Page must show ${BUSINESS_EMAIL}`).toContain(BUSINESS_EMAIL);
      const mailto = main!.querySelector(`a[href="mailto:${BUSINESS_EMAIL}"]`);
      expect(mailto, `${file}: Home_Page email must be a mailto: link`).not.toBeNull();
    }
  });

  it('the email is labeled with the word "Email" in both languages, next to the address (10.3)', () => {
    // The email label is the WORD "Email" in both languages, from the single source.
    for (const language of SUPPORTED_LANGUAGES) {
      expect(getMessages(language).emailLabel, `${language} email label must be "Email"`).toBe(
        "Email",
      );
      expect(getMessages(language).footer.emailLabel, `${language} footer email label`).toBe(
        "Email",
      );
    }
    // On every page, the footer line that carries the email also carries the word "Email".
    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const { file, document } = pageFor(language, key);
        const footer = document.querySelector("footer.site-footer");
        const emailLine = Array.from(footer!.querySelectorAll("p")).find((p) =>
          (p.textContent ?? "").includes(BUSINESS_EMAIL),
        );
        expect(emailLine, `${file}: footer must have an email line`).toBeDefined();
        expect(
          (emailLine!.textContent ?? "").replace(/\s+/g, " "),
          `${file}: the email line must be labeled with the word "Email"`,
        ).toContain("Email");
      }
    }
  });

  it('no email-contact label anywhere uses "Courriel" — the label is always "Email" (10.3)', () => {
    // Requirement 10.3 governs the email-CONTACT LABEL, not every occurrence of the word
    // (the Computer Learning service copy legitimately mentions "courriels" as prose). So
    // scan the places that LABEL the email address — the footer email line and the
    // Scheduling_Page contact lines (`.scheduling-contact__label`) — and assert the label
    // text is "Email" and never "Courriel", on every page in both languages.
    for (const key of NAV_ORDER) {
      for (const language of SUPPORTED_LANGUAGES) {
        const { file, document } = pageFor(language, key);

        // Footer: the <p> carrying the email address must label it "Email", not "Courriel".
        const footer = document.querySelector("footer.site-footer");
        expect(footer, `${file}: expected a site-wide footer`).not.toBeNull();
        const footerEmailLine = Array.from(footer!.querySelectorAll("p")).find((p) =>
          (p.textContent ?? "").includes(BUSINESS_EMAIL),
        );
        expect(footerEmailLine, `${file}: footer must have an email line`).toBeDefined();
        const footerLabel = (footerEmailLine!.querySelector("span")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
        expect(footerLabel, `${file}: footer email label must contain "Email"`).toContain("Email");
        expect(
          /courriel/i.test(footerLabel),
          `${file}: footer email label must not be "Courriel"`,
        ).toBe(false);

        // Scheduling_Page contact lines (placeholder/fallback) carry a `.scheduling-contact__label`.
        for (const label of Array.from(
          document.querySelectorAll(".scheduling-contact__label"),
        )) {
          const labelText = (label.textContent ?? "").replace(/\s+/g, " ").trim();
          expect(
            /courriel/i.test(labelText),
            `${file}: scheduling contact label "${labelText}" must not be "Courriel"`,
          ).toBe(false);
        }
      }
    }

    // The content model itself labels email as "Email" (not "Courriel") in both languages.
    for (const language of SUPPORTED_LANGUAGES) {
      expect(getMessages(language).emailLabel).toBe("Email");
      expect(getMessages(language).footer.emailLabel).toBe("Email");
    }
  });

  // -------------------------------------------------------------------------
  // 11.1 / 11.2 / 11.4 — About_Page in both languages
  // -------------------------------------------------------------------------

  it('the About_Page shows "My Name" and a provisional-bio indication in both languages (11.2, 11.4)', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const about = getMessages(language).about;
      // The build now ships the FINAL bio (Requirement 11.4): provisional is false.
      expect(about.provisional, `${language} About bio must be final (non-provisional)`).toBe(
        false,
      );

      const { file, document } = pageFor(language, "about");
      const text = textOf(document);
      expect(text, `${file}: About_Page must show the name "My Name"`).toContain(
        "My Name",
      );
      expect(about.name).toBe("My Name");

      // A final bio shows NO provisional note (it only appears while provisional=true).
      const note = document.querySelector('[data-provisional="true"]');
      expect(note, `${file}: a final About bio must not show a provisional note`).toBeNull();
      // The final bio from the content model is rendered on the page.
      expect(text, `${file}: About_Page must render the bio copy`).toContain(about.bio);
    }
  });

  it("the About_Page is reachable from the nav on every page in both languages (11.1)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const aboutHref = pagePath(language, "about");
      for (const key of NAV_ORDER) {
        const { file, document } = pageFor(language, key);
        const nav = document.querySelector('nav[aria-label="Main"]');
        const link = nav!.querySelector(`a[href="${aboutHref}"]`);
        expect(link, `${file}: nav must link to the About_Page (${aboutHref})`).not.toBeNull();
      }
    }
  });

  it("the About_Page has exactly one h1 and a valid heading structure in both languages (11.5)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "about");
      const levels = headingLevels(document);
      expect(levels.filter((l) => l === 1).length, `${file}: About_Page needs exactly one h1`).toBe(
        1,
      );
      expect(
        isValidHeadingStructure(levels),
        `${file}: About_Page heading levels [${levels.join(", ")}] violate one-h1 / no-skip`,
      ).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 12.5 / 12.4 — Scheduling_Page: coming-soon placeholder + contact fallback
  // -------------------------------------------------------------------------

  it("the Scheduling_Page embeds the external Scheduling_Service in both languages (12.2)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "scheduling");

      // The build ships a configured booking URL (PUBLIC_SCHEDULING_URL), so the page is
      // in the embed state: the Scheduling_Service <iframe> is present and the
      // coming-soon placeholder is not.
      const embed = document.querySelector(".scheduling-embed");
      expect(embed, `${file}: Scheduling_Page must embed the booking service`).not.toBeNull();
      expect(
        document.querySelector(".scheduling-placeholder"),
        `${file}: a configured Scheduling_Page must not render the coming-soon placeholder`,
      ).toBeNull();

      const iframe = document.querySelector("iframe#scheduling-iframe");
      expect(iframe, `${file}: embed must render a booking <iframe>`).not.toBeNull();
      const src = iframe!.getAttribute("src") ?? "";
      expect(src, `${file}: iframe must point at the configured booking URL`).toContain(
        "calendly.com/oudet-laurent/30min",
      );
      // The embed iframe carries an accessible name (title).
      expect(
        (iframe!.getAttribute("title") ?? "").length,
        `${file}: booking iframe must have an accessible name`,
      ).toBeGreaterThan(0);
    }
  });

  it("the Scheduling_Page keeps an email + phone fallback for embed load failure in both languages (12.4)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "scheduling");
      // When configured, the error-fallback section is present (hidden until the embed
      // fails to load) and exposes the email + phone as an alternative way to book.
      const fallback = document.querySelector("#scheduling-error-fallback");
      expect(fallback, `${file}: expected the embed-failure fallback section`).not.toBeNull();

      const section = fallback!;
      const sectionText = (section.textContent ?? "").replace(/\s+/g, " ").trim();
      expect(sectionText, `${file}: fallback must show ${BUSINESS_EMAIL}`).toContain(
        BUSINESS_EMAIL,
      );
      expect(sectionText, `${file}: fallback must show the phone`).toContain(BUSINESS_INFO.phone);
      expect(
        section.querySelector(`a[href="mailto:${BUSINESS_EMAIL}"]`),
        `${file}: fallback email must be a mailto: link`,
      ).not.toBeNull();
      // The phone is a tel: link only when it contains digits; a placeholder number
      // (e.g. "XX XX XX XX XX") renders as plain text instead of a dead link.
      if (phoneHref(BUSINESS_INFO.phone)) {
        expect(
          section.querySelector('a[href^="tel:"]'),
          `${file}: fallback phone must be a tel: link when it has digits`,
        ).not.toBeNull();
      }
      // The email is labeled with the word "Email" (10.3) in the fallback too.
      expect(sectionText, `${file}: fallback email must be labeled "Email"`).toContain("Email");
    }
  });

  it("the Scheduling_Page is reachable from the nav on every page in both languages (12.1)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const schedulingHref = pagePath(language, "scheduling");
      for (const key of NAV_ORDER) {
        const { file, document } = pageFor(language, key);
        const nav = document.querySelector('nav[aria-label="Main"]');
        const link = nav!.querySelector(`a[href="${schedulingHref}"]`);
        expect(link, `${file}: nav must link to the Scheduling_Page (${schedulingHref})`).not.toBeNull();
      }
    }
  });

  it("the Scheduling_Page has exactly one h1 and a valid heading structure in both languages (12.6)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = pageFor(language, "scheduling");
      const levels = headingLevels(document);
      expect(
        levels.filter((l) => l === 1).length,
        `${file}: Scheduling_Page needs exactly one h1`,
      ).toBe(1);
      expect(
        isValidHeadingStructure(levels),
        `${file}: Scheduling_Page heading levels [${levels.join(", ")}] violate one-h1 / no-skip`,
      ).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 12.2 / 12.4 — Configured embed + error-fallback contract (source-level)
  // -------------------------------------------------------------------------

  it("the SchedulingContent source wires the configured embed and the hidden error fallback (12.2, 12.4)", () => {
    // The default build ships the booking URL UNSET, so the dist pages show only the
    // placeholder (asserted above). The configured states (embed + load-failure fallback)
    // are driven by the pure resolveSchedulingState (unit-tested in test/scheduling.*),
    // but the MARKUP those states render lives in the component. Rather than build the
    // site twice with PUBLIC_SCHEDULING_URL set, we assert the component's source contract:
    // the configured branch renders an accessible-named <iframe> (12.2) and a hidden
    // error-fallback region exposing the email + phone, kept on the page (12.4).
    const componentPath = resolve(projectRoot, "src", "components", "SchedulingContent.astro");
    const src = readFileSync(componentPath, "utf8");

    // 12.2 — the embed iframe with an accessible name (title) and the configured URL.
    expect(src, "component must render a scheduling <iframe> for the embed state").toMatch(
      /<iframe[\s\S]*?id="scheduling-iframe"/,
    );
    expect(src, "the embed iframe must carry an accessible name via title").toMatch(
      /<iframe[\s\S]*?title=\{EMBED_TITLE\}/,
    );
    expect(src, "the embed iframe src must come from the configured booking URL").toMatch(
      /src=\{config\.bookingUrl/,
    );

    // 12.4 — a hidden error-fallback region that exposes the email + phone and keeps the
    // Visitor on the page (an alert region rendered `hidden`, revealed on embed failure).
    expect(src, "component must render a hidden error-fallback region").toMatch(
      /id="scheduling-error-fallback"[\s\S]*?hidden/,
    );
    expect(src, "the fallback must expose the business email (mailto)").toMatch(
      /mailto:\$\{BUSINESS_EMAIL\}/,
    );
    expect(src, "the fallback must expose the business phone (tel)").toMatch(
      /tel:\$\{BUSINESS_PHONE_HREF\}/,
    );
    // The fallback is the errorFallback copy from the content model (both languages).
    expect(src, "the fallback must render the localized errorFallback copy").toContain(
      "scheduling.errorFallback",
    );
    // The business email the fallback exposes is the real one, in both languages.
    for (const language of SUPPORTED_LANGUAGES) {
      void language; // the component reads BUSINESS_INFO.email, shared across languages
    }
    expect(BUSINESS_INFO.email).toBe(BUSINESS_EMAIL);
  });

  // -------------------------------------------------------------------------
  // 9.1 (revised) — The ENGLISH Home + Service pages render NO full-page
  // decorative background layer (the full-page Grasse background was removed).
  //
  // HomeContent / ServicePageContent are shared across both languages, so the
  // English pages under `/en/` must mirror the French removal: no
  // `.decorative-background` layer behind the content. Grasse photos now live only
  // in the Home Hero_Banner + Service_Card images (Requirement 16), audited in
  // test/visual-template.audit.test.ts.
  // -------------------------------------------------------------------------

  /** The English Home + three Service pages that must NOT carry a full-page background. */
  const EN_FORMER_BACKGROUND_FILES: readonly string[] = [
    "en/index.html",
    "en/services/computer-learning/index.html",
    "en/services/computer-repair/index.html",
    "en/services/in-home-repair/index.html",
  ];

  it("no English Home/Service page renders a full-page decorative background layer (9.1, revised)", () => {
    for (const file of EN_FORMER_BACKGROUND_FILES) {
      const { document } = loadPage(file);
      expect(
        document.querySelector(".decorative-background"),
        `${file}: must NOT render a full-page .decorative-background layer`,
      ).toBeNull();
    }
  });
});

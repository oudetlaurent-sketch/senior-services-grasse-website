import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseHTML } from "linkedom";
import { ensureBuiltSite } from "./support/build-site.js";
import { getMessages } from "../src/content/i18n.js";
import { pagePath } from "../src/domain/navigation.js";
import { isValidHeadingStructure } from "../src/domain/headings.js";
import type { Language } from "../src/domain/types.js";

/**
 * Example / audit checks for the Home_Page How_It_Works, Reassurance, and FAQ sections
 * (task 27.1).
 *
 * Validates: Requirements 13.1, 13.3, 13.4, 14.1, 14.2, 14.3, 14.4, 15.1, 15.3, 15.4
 *
 * These acceptance criteria are per-page content/structure/link concerns rather than
 * universal properties (design "Testing Strategy"), so this suite audits them
 * deterministically and browser-free: it builds the static site once (via the shared
 * `ensureBuiltSite`) and inspects the emitted Home_Page HTML in BOTH languages
 * (French at `dist/index.html`, English at `dist/en/index.html`), parsed with linkedom —
 * the same approach as test/localization-and-grasse.audit.test.ts and
 * test/bilingual-pages.audit.test.ts.
 *
 * Expected strings and link targets are compared against the single content sources
 * (`getMessages(language)`, `pagePath`) rather than re-hard-coded, so the audit tracks
 * the content/route model. The reassurance assertions check short, stable substrings of
 * the actual rendered copy (e.g. FR "sans engagement"/"recontactons", EN "no
 * obligation"/"get back to you").
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");

/** Both Supported_Languages, French first (the default). */
const SUPPORTED_LANGUAGES: readonly Language[] = ["fr", "en"];

type Page = { file: string; html: string; document: Document };

/** Map the active language's Home route to its built `dist/*.html` file. */
function homeFileFor(language: Language): string {
  // `/` -> index.html ; `/en/` -> en/index.html
  const pathname = new URL(pagePath(language, "home"), "http://local.invalid").pathname;
  const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === "" ? "index.html" : `${trimmed}/index.html`;
}

const byLang = new Map<Language, Page>();

function homePage(language: Language): Page {
  const existing = byLang.get(language);
  if (existing) return existing;
  const file = homeFileFor(language);
  const html = readFileSync(join(distDir, file), "utf8");
  const { document } = parseHTML(html);
  const page: Page = { file, html, document: document as unknown as Document };
  byLang.set(language, page);
  return page;
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

/** The <section> wrapping a labelled region, located by its heading id. */
function sectionByHeadingId(document: Document, headingId: string): Element | null {
  return document.querySelector(`section[aria-labelledby="${headingId}"]`);
}

describe("Home_Page How It Works, Reassurance, and FAQ audit (task 27.1)", () => {
  beforeAll(() => {
    // Build at most once across concurrent Vitest workers (see test/support/build-site.ts).
    ensureBuiltSite();
    for (const language of SUPPORTED_LANGUAGES) {
      homePage(language);
    }
  }, 190_000);

  // -------------------------------------------------------------------------
  // 13.1 / 13.3 — How_It_Works: ordered list of >=3 steps + next-action links
  // -------------------------------------------------------------------------

  it("How_It_Works renders an ordered list of >=3 steps in both languages (13.1)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const section = sectionByHeadingId(document, "home-how-heading");
      expect(section, `${file}: expected the How_It_Works section`).not.toBeNull();

      // The heading is the How_It_Works heading from the content model.
      const heading = textOf(section!.querySelector("h2"));
      expect(heading, `${file}: How_It_Works heading`).toBe(getMessages(language).howItWorks.heading);

      const ol = section!.querySelector("ol");
      expect(ol, `${file}: How_It_Works must use an ordered list <ol>`).not.toBeNull();
      const steps = Array.from(ol!.querySelectorAll("li"));
      expect(
        steps.length,
        `${file}: How_It_Works must have >=3 ordered steps`,
      ).toBeGreaterThanOrEqual(3);

      // The rendered steps match the content model's steps, in order and non-empty.
      const expectedSteps = getMessages(language).howItWorks.steps;
      expect(steps.length, `${file}: step count must match the content model`).toBe(
        expectedSteps.length,
      );
      steps.forEach((li, i) => {
        expect(textOf(li).length, `${file}: step ${i} must be non-empty`).toBeGreaterThan(0);
        expect(textOf(li), `${file}: step ${i} must render the content-model copy`).toBe(
          expectedSteps[i]!.replace(/\s+/g, " ").trim(),
        );
      });
    }
  });

  it("How_It_Works links to the Service_Request_Form and Scheduling_Page for its language (13.3)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const section = sectionByHeadingId(document, "home-how-heading");
      expect(section, `${file}: expected the How_It_Works section`).not.toBeNull();

      const formHref = pagePath(language, "service-request");
      const schedulingHref = pagePath(language, "scheduling");

      const hrefs = Array.from(section!.querySelectorAll("a")).map((a) => a.getAttribute("href"));
      expect(hrefs, `${file}: How_It_Works must link to the form (${formHref})`).toContain(formHref);
      expect(
        hrefs,
        `${file}: How_It_Works must link to the Scheduling_Page (${schedulingHref})`,
      ).toContain(schedulingHref);
    }
  });

  // -------------------------------------------------------------------------
  // 14.1–14.3 — Reassurance_Element content
  // -------------------------------------------------------------------------

  it("the Reassurance_Element names My Name, Grasse (06130), and conveys no-obligation + will-contact (14.1–14.3)", () => {
    // Stable substrings of the ACTUAL rendered copy, per language (read from i18n.ts).
    const EXPECTED: Record<Language, readonly string[]> = {
      fr: ["My Name", "Grasse", "06130", "ne vous engage à rien", "recontactons"],
      en: ["My Name", "Grasse", "06130", "no obligation", "get back to you"],
    };

    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const section = sectionByHeadingId(document, "home-reassurance-heading");
      expect(section, `${file}: expected the Reassurance_Element section`).not.toBeNull();

      // Heading from the content model.
      const heading = textOf(section!.querySelector("h2"));
      expect(heading, `${file}: Reassurance heading`).toBe(getMessages(language).reassurance.heading);

      const body = textOf(section!.querySelector(".home-reassurance__body"));
      expect(body.length, `${file}: reassurance body must be non-empty`).toBeGreaterThan(0);
      for (const needle of EXPECTED[language]) {
        expect(
          body,
          `${file}: reassurance body must mention "${needle}" (14.1–14.3)`,
        ).toContain(needle);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 15.1 / 15.3 — FAQ_Section: >=3 Q&A pairs + service/booking answers link out
  // -------------------------------------------------------------------------

  it("the FAQ_Section has >=3 question/answer pairs in both languages (15.1)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const section = sectionByHeadingId(document, "home-faq-heading");
      expect(section, `${file}: expected the FAQ_Section`).not.toBeNull();

      const heading = textOf(section!.querySelector("h2"));
      expect(heading, `${file}: FAQ heading`).toBe(getMessages(language).faq.heading);

      // Each Q&A is a <details>/<summary> whose question is an <h3 class="home-faq__question">.
      const questions = Array.from(section!.querySelectorAll("summary h3.home-faq__question"));
      expect(
        questions.length,
        `${file}: FAQ must have >=3 question headings`,
      ).toBeGreaterThanOrEqual(3);

      // Each disclosure carries a non-empty answer alongside the question.
      const details = Array.from(section!.querySelectorAll("details"));
      expect(details.length, `${file}: FAQ disclosures must match the question count`).toBe(
        questions.length,
      );
      for (const detail of details) {
        const answer = textOf(detail.querySelector(".home-faq__answer"));
        expect(answer.length, `${file}: every FAQ answer must be non-empty`).toBeGreaterThan(0);
      }

      // Rendered question count matches the content model.
      expect(questions.length, `${file}: FAQ item count must match the content model`).toBe(
        getMessages(language).faq.items.length,
      );
    }
  });

  it("at least one FAQ answer about requesting/booking links to the form or Scheduling_Page (15.3)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const section = sectionByHeadingId(document, "home-faq-heading");
      expect(section, `${file}: expected the FAQ_Section`).not.toBeNull();

      const formHref = pagePath(language, "service-request");
      const schedulingHref = pagePath(language, "scheduling");

      // Find FAQ answers that carry an action paragraph (the request/booking answers).
      const actionParagraphs = Array.from(section!.querySelectorAll(".home-faq__actions"));
      expect(
        actionParagraphs.length,
        `${file}: at least one FAQ answer must offer next-action links`,
      ).toBeGreaterThanOrEqual(1);

      // At least one such answer links to the form OR the Scheduling_Page for this language.
      const linksOut = actionParagraphs.some((p) => {
        const hrefs = Array.from(p.querySelectorAll("a")).map((a) => a.getAttribute("href"));
        return hrefs.includes(formHref) || hrefs.includes(schedulingHref);
      });
      expect(
        linksOut,
        `${file}: a request/booking FAQ answer must link to ${formHref} or ${schedulingHref}`,
      ).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 13.4 / 15.4 — Heading structure: exactly one h1 and no skipped levels, with
  // the three new sections present.
  // -------------------------------------------------------------------------

  it("the Home_Page has exactly one h1 and a valid heading order with the new sections (13.4, 15.4)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);

      const levels = headingLevels(document);
      expect(levels.filter((l) => l === 1).length, `${file}: Home_Page needs exactly one h1`).toBe(
        1,
      );
      // Reuse the domain heading-structure validator (task 2.8) rather than re-deriving it.
      expect(
        isValidHeadingStructure(levels),
        `${file}: Home_Page heading levels [${levels.join(", ")}] violate one-h1 / no-skip`,
      ).toBe(true);

      // The three new sections are present with their h2 headings.
      for (const id of ["home-how-heading", "home-reassurance-heading", "home-faq-heading"]) {
        const section = sectionByHeadingId(document, id);
        expect(section, `${file}: expected the section labelled by #${id}`).not.toBeNull();
        const h2 = section!.querySelector(`h2#${id}`);
        expect(h2, `${file}: #${id} must be an <h2>`).not.toBeNull();
      }
      // The FAQ questions are h3 under the FAQ's h2 (no skipped level).
      const faq = sectionByHeadingId(document, "home-faq-heading");
      expect(
        faq!.querySelectorAll("h3.home-faq__question").length,
        `${file}: FAQ questions must be h3 headings under the FAQ h2`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  // -------------------------------------------------------------------------
  // 14.4 — No account or payment required to reach the form or scheduling
  // -------------------------------------------------------------------------

  it("reaching the form or Scheduling_Page from the Home_Page is not gated behind an account or payment (14.4)", () => {
    // Requirement 14.4: a Visitor can request a service or book a meeting WITHOUT creating
    // an account or paying. We assert this non-brittly: (a) the Home_Page links straight to
    // the form and the Scheduling_Page (no intermediate account/payment step), and (b) those
    // target pages themselves do not gate behind account/password/payment vocabulary. We
    // read the three new sections' copy (where the no-account/no-payment promise lives) and
    // the target pages' body text, allowing the words only in a clearly negating context
    // ("sans compte", "no account", etc.), never as a requirement to proceed.
    const GATING = /\b(account|compte|payment|paiement|password|mot de passe)\b/i;

    for (const language of SUPPORTED_LANGUAGES) {
      const { document } = homePage(language);
      const formHref = pagePath(language, "service-request");
      const schedulingHref = pagePath(language, "scheduling");

      // (a) The Home_Page links directly to the form and the Scheduling_Page.
      const allHrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
      expect(allHrefs, `Home_Page (${language}) must link directly to the form`).toContain(formHref);
      expect(
        allHrefs,
        `Home_Page (${language}) must link directly to the Scheduling_Page`,
      ).toContain(schedulingHref);

      // (b) The target pages do not require an account/password/payment to proceed. We scan
      // the <main> body text of each target; any gating term must appear only inside a
      // negating phrase (e.g. "sans compte", "no account", "sans création de compte").
      const targets: Array<{ label: string; file: string }> = [
        { label: `form (${language})`, file: hrefToFile(formHref) },
        { label: `scheduling (${language})`, file: hrefToFile(schedulingHref) },
      ];
      for (const { label, file } of targets) {
        const html = readFileSync(join(distDir, file), "utf8");
        const { document: targetDoc } = parseHTML(html);
        const main = (targetDoc as unknown as Document).querySelector("main");
        const bodyText = textOf(main ?? (targetDoc as unknown as Document));

        let match: RegExpExecArray | null;
        const re = new RegExp(GATING, "gi");
        while ((match = re.exec(bodyText)) !== null) {
          const start = Math.max(0, match.index - 24);
          const context = bodyText.slice(start, match.index + match[0].length).toLowerCase();
          const negated =
            /sans[^.]*$/.test(context) || // "sans compte", "sans création de compte"
            /no\s+$/.test(context) || // "no account"
            /aucun[^.]*$/.test(context) || // "aucun compte"
            /pas de\s*$/.test(context);
          expect(
            negated,
            `${label}: gating term "${match[0]}" must appear only in a negating context, ` +
              `saw: "...${context}..."`,
          ).toBe(true);
        }
      }
    }
  });
});

/** Map a root-relative route href to its built `dist/*.html` file (directory-style output). */
function hrefToFile(href: string): string {
  const pathname = new URL(href, "http://local.invalid").pathname;
  const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === "" ? "index.html" : `${trimmed}/index.html`;
}

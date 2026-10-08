import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseHTML } from "linkedom";
import { ensureBuiltSite } from "./support/build-site.js";
import { BUSINESS_INFO } from "../src/content/business.js";
import { CONFIRMATION_MESSAGE } from "../src/integration/handle-service-request.js";
import { validateServiceRequest } from "../src/domain/validation.js";
import { NAV_ITEMS } from "../src/domain/navigation.js";

/**
 * Example / audit checks for French copy, Grasse location, and the decorative
 * background (task 16.4).
 *
 * Validates: Requirements 7.1, 7.2, 7.4, 8.1, 8.2, 8.3, 9.1
 *
 * These acceptance criteria in Requirements 7–9 are content, formatting, and presence
 * concerns rather than universal properties (design "Testing Strategy"): pervasive
 * French copy (7.1), the French document language (7.2), French phone/address
 * formatting and the Grasse 06130 postal code in the site-wide contact details
 * (7.4, 8.2), the French Grasse service-area statements on the Home_Page and the
 * Service_Request_Form (8.1, 8.3), and the presence of a Decorative_Background on the
 * Home_Page and each Service_Page (9.1). This suite audits them deterministically and
 * browser-free: it builds the static site once (via the shared `ensureBuiltSite`) and
 * inspects the emitted `dist/**\/*.html`, parsed with linkedom. The scrim-aware contrast
 * (9.2) and the 200%-zoom proxy (9.4) belong with the token/computed-style audits and
 * are covered in test/a11y.scan.test.ts.
 *
 * The build is deterministic (static output) and the parses are pure, so the checks are
 * stable across runs. Expected French strings are compared against the single content
 * sources (`BUSINESS_INFO`, `CONFIRMATION_MESSAGE`, `NAV_ITEMS`, `validateServiceRequest`)
 * rather than re-hard-coded, so the audit tracks the content model.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");

/** The three Service_Page files that must carry a Decorative_Background (9.1). */
const SERVICE_PAGE_FILES = [
  "services/computer-learning/index.html",
  "services/computer-repair/index.html",
  "services/in-home-repair/index.html",
] as const;

const HOME_FILE = "index.html";
const FORM_FILE = "service-request/index.html";

/**
 * Is a built page a French (default) route? The bilingual tree (task 18.3) emits English
 * pages under the `/en/` prefix and French pages at the existing paths. This task-16.4
 * audit targets the French copy/formatting on the FRENCH pages; the English pages are
 * covered by the dedicated bilingual audit (task 22.5). `path` is dist-relative, e.g.
 * `./dist/en/about/index.html`.
 */
function isFrenchPage(path: string): boolean {
  const normalized = path.split("\\").join("/");
  return !/\/dist\/en\//.test(normalized);
}

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
let byFile: Map<string, Page> = new Map();

/** The normalized visible text content of a document (whitespace collapsed). */
function textOf(document: Document): string {
  return (document.body?.textContent ?? document.textContent ?? "").replace(/\s+/g, " ").trim();
}

function page(file: string): Page {
  const p = byFile.get(file);
  expect(p, `expected built page ${file}`).toBeDefined();
  return p!;
}

describe("localization, Grasse location, and decorative background audit (task 16.4)", () => {
  beforeAll(() => {
    // Build at most once across concurrent Vitest workers (see test/support/build-site.ts).
    ensureBuiltSite();
    const files = findHtmlFiles(distDir);
    expect(files.length).toBeGreaterThan(0);
    pages = files.map((p) => {
      const html = readFileSync(p, "utf8");
      const { document } = parseHTML(html);
      return {
        path: p.replace(projectRoot, "."),
        html,
        document: document as unknown as Document,
      };
    });
    byFile = new Map(
      files.map((p, i) => [p.slice(distDir.length + 1).split("\\").join("/"), pages[i]]),
    );
  }, 190_000);

  // -------------------------------------------------------------------------
  // 7.2 — French document language
  // -------------------------------------------------------------------------

  it('every French built page declares lang="fr" on the root <html> (7.2)', () => {
    // Scoped to French pages: English pages correctly declare lang="en" (task 18.3) and
    // are checked by the per-language Property 14 (test/document-language.property.test.ts)
    // and the bilingual audit (task 22.5).
    for (const { path, document } of pages.filter((p) => isFrenchPage(p.path))) {
      const lang = document.querySelector("html")?.getAttribute("lang");
      expect(lang, `${path}: French page <html> must declare lang="fr"`).toBe("fr");
    }
  });

  // -------------------------------------------------------------------------
  // 7.1 — Pervasive French copy
  // -------------------------------------------------------------------------

  it("the navigation labels are the French page titles on every page (7.1)", () => {
    // The seven expected French nav labels, taken from the single NAV_ITEMS source.
    // (task 18.2: the menu now also carries the About_Page and Scheduling_Page.)
    const expected = NAV_ITEMS.map((i) => i.title);
    expect(expected).toEqual([
      "Accueil",
      "Apprentissage de l'informatique",
      "Dépannage informatique",
      "Petits travaux à domicile",
      "Qui suis-je ?",
      "Prendre rendez-vous",
      "Demande de service",
    ]);

    // Scoped to French pages: English pages render the English nav labels (task 18.3),
    // checked by the bilingual audit (task 22.5).
    for (const { path, document } of pages.filter((p) => isFrenchPage(p.path))) {
      const nav = document.querySelector('nav[aria-label="Main"]');
      expect(nav, `${path}: expected the main <nav>`).not.toBeNull();
      const labels = Array.from(nav!.querySelectorAll("a")).map((a) =>
        (a.textContent ?? "").replace(/\s+/g, " ").trim(),
      );
      for (const title of expected) {
        expect(labels, `${path}: nav must contain the French label "${title}"`).toContain(title);
      }
    }
  });

  it("the Home_Page shows the key French section headings (7.1)", () => {
    const { document } = page(HOME_FILE);
    const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map((h) =>
      (h.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    // The top-level heading is the business name "Aide à la personne" (Requirement 10.1),
    // followed by the French section headings.
    for (const heading of [BUSINESS_INFO.name, "Nos services", "Nous contacter"]) {
      expect(headings, `Home_Page must show the French heading "${heading}"`).toContain(heading);
    }
  });

  it("each Service_Page shows the French includes heading and request call-to-action (7.1)", () => {
    for (const file of SERVICE_PAGE_FILES) {
      const { document } = page(file);
      const headings = Array.from(document.querySelectorAll("h2")).map((h) =>
        (h.textContent ?? "").replace(/\s+/g, " ").trim(),
      );
      expect(headings, `${file}: expected the French includes heading`).toContain(
        "Ce que comprend ce service",
      );
      const text = textOf(document);
      // French call-to-action ("Demander : <service>"), never the English "Request".
      expect(text, `${file}: expected a French request call-to-action`).toContain("Demander :");
      expect(text, `${file}: must not leak the English "What this service includes"`).not.toContain(
        "What this service includes",
      );
      expect(text, `${file}: must not leak an English "Request <service>" CTA`).not.toMatch(
        /\bRequest\b/,
      );
    }
  });

  it("the Service_Request_Form shows French headings, labels, and the submit control (7.1)", () => {
    const { document } = page(FORM_FILE);
    const h1 = (document.querySelector("h1")?.textContent ?? "").trim();
    expect(h1).toBe("Demande de service");

    const labelText = Array.from(document.querySelectorAll("label")).map((l) =>
      (l.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    // Required French field labels (the trailing "*" marker is appended via a span).
    const hasLabel = (needle: string) => labelText.some((t) => t.includes(needle));
    expect(hasLabel("Nom"), "form must label the name field in French").toBe(true);
    expect(hasLabel("Numéro de téléphone"), "form must label the phone field in French").toBe(true);
    expect(hasLabel("Service"), "form must label the service field in French").toBe(true);

    const submit = document.querySelector('button[type="submit"]');
    expect((submit?.textContent ?? "").trim(), "submit button must be French").toBe(
      "Envoyer la demande",
    );
  });

  it("the Confirmation_Message is French (7.1)", () => {
    // Compared against the single source so the audit tracks the content, not a copy.
    expect(CONFIRMATION_MESSAGE).toBe(
      "Merci ! Votre demande a bien été reçue. Nous vous recontacterons très bientôt.",
    );
  });

  it("a representative validation error message is French (7.1)", () => {
    // Invoke the stable validation core with an empty required field and confirm the
    // visitor-facing message is French. The FieldError.code stays a machine identifier.
    const result = validateServiceRequest({
      name: "",
      phone: "",
      email: "",
      service: "",
      description: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return; // narrowing for TypeScript
    const nameError = result.errors.find((e) => e.field === "name" && e.code === "required");
    expect(nameError, "expected a required-name error").toBeDefined();
    expect(nameError!.message).toBe("Le nom est obligatoire.");
  });

  // -------------------------------------------------------------------------
  // 7.9 / 8.2 — French phone + email only in the site-wide contact (no address)
  // -------------------------------------------------------------------------

  it("every built page's footer carries the business name, French phone, and email — no postal address (7.9, 8.2)", () => {
    // The footer is the site-wide contact block (design §1). It must render the business
    // name "Aide à la personne" and the phone in the French two-digit-pair convention,
    // read from the single BUSINESS_INFO source. The structured postal address was
    // removed: the site-wide contact details are phone + email only (Requirement 8.2).
    expect(BUSINESS_INFO.phone).toMatch(/^[0-9X]{2}( [0-9X]{2}){4}$/);

    for (const { path, document } of pages) {
      const footer = document.querySelector("footer.site-footer");
      expect(footer, `${path}: expected a site-wide footer`).not.toBeNull();
      const footerText = (footer!.textContent ?? "").replace(/\s+/g, " ").trim();

      expect(footerText, `${path}: footer must head the contact area with "Contact"`).toContain(
        "Contact",
      );
      expect(footerText, `${path}: footer must show the French-formatted phone`).toContain(
        BUSINESS_INFO.phone,
      );
      expect(footerText, `${path}: footer must show the business email`).toContain(
        BUSINESS_INFO.email,
      );
      // No postal/street address or postal code in the site-wide contact details (8.2).
      expect(footerText, `${path}: footer must not show the postal code`).not.toContain("06130");
      expect(footerText, `${path}: footer must not show the city`).not.toContain("GRASSE");
      expect(footerText, `${path}: footer must not show the street line`).not.toContain(
        "Oratoire",
      );
      // The old US/English placeholder contact must not survive anywhere site-wide.
      expect(footerText, `${path}: footer must not show the old placeholder phone`).not.toContain(
        "(555) 123-4567",
      );
    }
  });

  // -------------------------------------------------------------------------
  // 8.1 / 8.3 — Grasse service-area statements
  // -------------------------------------------------------------------------

  it("the Home_Page shows the French Grasse (06130) service-area statement (8.1)", () => {
    const { document } = page(HOME_FILE);
    const text = textOf(document);
    expect(text, "Home_Page must show the serviceAreaStatement").toContain(
      BUSINESS_INFO.serviceAreaStatement,
    );
    expect(text).toContain("Grasse");
    expect(text).toContain("06130");
  });

  it("the Service_Request_Form indicates service availability in the Grasse (06130) area, in French (8.3)", () => {
    const { document } = page(FORM_FILE);
    const text = textOf(document);
    // The form carries a French Grasse service-area indication (the shared statement).
    expect(text).toContain("Grasse");
    expect(text).toContain("06130");
    expect(text, "form must indicate the Grasse service area in French").toMatch(
      /Nous intervenons à Grasse/,
    );
  });

  // -------------------------------------------------------------------------
  // 9.1 — Decorative background present on Home and each Service page
  // -------------------------------------------------------------------------

  /**
   * After the Requirement 9.1 revision the full-page Grasse Decorative_Background was
   * REMOVED from the Home_Page and the Service_Pages: those pages no longer render a
   * `.decorative-background` layer behind their content. The Grasse photos now live only
   * in the Home_Page Hero_Banner image and the Service_Card images (Requirement 16),
   * audited by test/visual-template.audit.test.ts. Here we assert the full-page layer is
   * gone from every page.
   */
  it("the Home_Page renders no full-page decorative background layer (9.1, revised)", () => {
    expect(
      page(HOME_FILE).document.querySelector(".decorative-background"),
      "Home_Page: must not render a full-page .decorative-background layer",
    ).toBeNull();
  });

  it("no Service_Page renders a full-page decorative background layer (9.1, revised)", () => {
    for (const file of SERVICE_PAGE_FILES) {
      expect(
        page(file).document.querySelector(".decorative-background"),
        `${file}: must not render a full-page .decorative-background layer`,
      ).toBeNull();
    }
  });

  it("the Service_Request_Form renders no full-page decorative background layer (9.1 scope)", () => {
    const { document } = page(FORM_FILE);
    expect(document.querySelector(".decorative-background")).toBeNull();
  });
});

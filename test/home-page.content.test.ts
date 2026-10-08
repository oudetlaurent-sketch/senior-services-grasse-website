import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ensureBuiltSite } from "./support/build-site.js";
import { BUSINESS_INFO, phoneHref } from "../src/content/business.ts";
import { getMessages } from "../src/content/i18n.ts";

/**
 * Example-based unit tests for the Home_Page (task 8.2, src/pages/index.astro),
 * updated for French localization (task 14.4).
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 7.1, 7.4, 8.1, 8.2
 *
 * The Home_Page is an Astro static page, so the most faithful thing to assert against
 * is the HTML actually produced by `astro build`. These tests build the site once
 * (if the artifact is missing) and inspect the generated `dist/index.html` string:
 *
 * - 1.2 business name + one-sentence French description present
 * - 1.3 a link to each of the three Service_Pages (hrefs stable, titles in French)
 * - 1.4 a link to the Service_Request_Form
 * - 1.5 business phone number and email address present (tel:/mailto:)
 * - 1.6 a load-failure region carrying a (French) retry affordance
 * - 1.7 a broken-service-link region whose (French) message keeps the visitor here
 * - 8.1 a French statement that the business serves the Grasse (06130) Service_Area
 * - 8.2 contact details are phone + email only (no postal address / postal code)
 *
 * The build is deterministic (static output), so reading the emitted file is stable.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distIndex = resolve(projectRoot, "dist", "index.html");

let html = "";

describe("Home_Page content and error paths (task 8.2, French)", () => {
  beforeAll(() => {
    // Build fresh so assertions track the current index.astro. The shared helper
    // serializes the build across Vitest worker processes (so concurrent test files that
    // also build never clobber one another's dist/) and reuses a build another worker
    // just produced. A static build is quick and its output is deterministic.
    ensureBuiltSite();
    expect(existsSync(distIndex)).toBe(true);
    html = readFileSync(distIndex, "utf8");
  }, 190_000);

  it("displays the business name and a one-sentence French description (1.2, 7.1)", () => {
    // Business name appears as the page's top-level heading and the <title>.
    const frTitle = getMessages("fr").home.title;
    expect(html).toContain(`<title>${frTitle}</title>`);
    expect(html).toMatch(
      new RegExp(`<h1[^>]*>\\s*${BUSINESS_INFO.name}\\s*<\\/h1>`),
    );
    // One-sentence French description of the services offered.
    expect(html).toContain("nous aidons les seniors à");
    expect(html).toContain("réparer les petites choses du quotidien");
  });

  it("links to each of the three Service_Pages with French titles (1.3, 7.1)", () => {
    // Service page hrefs are the stable English identifiers (unchanged).
    expect(html).toContain('href="/services/computer-learning"');
    expect(html).toContain('href="/services/computer-repair"');
    expect(html).toContain('href="/services/in-home-repair"');
    // Each service link carries the human-readable French title of its target page.
    expect(html).toContain("Apprentissage de l&#39;informatique");
    expect(html).toContain("Dépannage informatique");
    expect(html).toContain("Petits travaux à domicile");
  });

  it("links to the Service_Request_Form (1.4, 7.1)", () => {
    // A direct link to the form page is present on the Home_Page.
    expect(html).toContain('href="/service-request"');
    expect(html).toContain("Accéder au formulaire de demande");
  });

  it("displays the French business phone number and email address (1.5, 7.4)", () => {
    // Phone as a tel: link with the French-formatted number, email as a mailto: link.
    // tel: link only when the number has digits; a placeholder (no digits) is plain text.
    if (phoneHref(BUSINESS_INFO.phone)) {
      expect(html).toContain(`href="tel:${phoneHref(BUSINESS_INFO.phone)}"`);
    } else {
      expect(html).toContain(BUSINESS_INFO.phone);
    }
    expect(html).toContain(BUSINESS_INFO.phone);
    expect(html).toContain(`href="mailto:${BUSINESS_INFO.email}"`);
    expect(html).toContain(BUSINESS_INFO.email);
  });

  it("displays the Grasse service-area statement, in French (8.1)", () => {
    // The full French Service_Area statement naming Grasse (06130) is present.
    expect(html).toContain(BUSINESS_INFO.serviceAreaStatement);
    expect(html).toMatch(/Grasse\s*\(06130\)/);
  });

  it("surfaces contact details as phone + email only, with no postal address (8.2)", () => {
    // The structured postal address was removed from the contact details; the contact
    // block carries the phone and email only. The service-area statement may still name
    // Grasse (06130) as prose, so we assert the absence of the street line specifically.
    expect(html).not.toContain("rue de l&#39;Oratoire");
    expect(html).not.toContain("rue de l'Oratoire");
    expect(html).not.toContain("GRASSE");
  });

  it("provides a load-failure region with a French Retry affordance (1.6, 7.1)", () => {
    // The error region is present (hidden by default) and announced to assistive tech.
    expect(html).toContain('id="home-load-error"');
    expect(html).toMatch(/id="home-load-error"[^>]*role="alert"/);
    // The French message tells the visitor the page could not be loaded.
    expect(html).toMatch(/n(?:'|&#39;)a pas pu se charger/);
    // A retry control is present, labeled in French.
    expect(html).toContain('id="home-load-retry"');
    expect(html).toMatch(/id="home-load-retry"[\s\S]*?Réessayer/);
  });

  it("keeps the visitor on the Home_Page when a service link is unavailable (1.7, 7.1)", () => {
    // A broken-service-link error region is present (hidden by default) and announced.
    expect(html).toContain('id="home-service-error"');
    expect(html).toMatch(/id="home-service-error"[^>]*role="alert"/);
    // French message indicates the page is not reachable...
    expect(html).toMatch(/n(?:'|&#39;)est pas accessible/);
    // ...and reassures the visitor they remain on the home page.
    expect(html).toMatch(/toujours[\s\S]*?sur la page d(?:'|&#39;)accueil/);
    // Service links are marked for interception so navigation can be kept on-page.
    expect(html).toContain("data-service-link");
  });
});

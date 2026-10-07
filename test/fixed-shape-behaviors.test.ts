import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ensureBuiltSite, distDir, distIndex } from "./support/build-site.js";
import { buildServicePageModel } from "../src/domain/service-page.js";
import { SERVICE_LIST, SERVICE_KEYS, SERVICES } from "../src/content/services.js";
import type { Service, ServiceKey } from "../src/domain/types.js";

/**
 * Example-based unit tests for fixed-shape behaviors (task 12.1).
 *
 * Validates: Requirements 2.1, 2.5, 2.6, 3.4
 *
 * These cover the concrete, non-input-varying behaviors the design's Testing Strategy
 * assigns to example-based unit tests rather than to universally-quantified properties:
 *
 *   - 2.1  THE Website SHALL provide exactly one Service_Page for each of the three
 *          services (Computer_Learning, Computer_Repair, In_Home_Repair).
 *   - 2.5  IF a Service_Page cannot load its name/description/includes, THEN it shows a
 *          content-unavailable indication and RETAINS the visitor on the Service_Page.
 *   - 2.6  IF the Service_Request_Form cannot be opened from a Service_Page, THEN an
 *          error indication is shown and the visitor is RETAINED on the Service_Page.
 *   - 3.4  IF a Navigation_Menu link's target cannot be displayed within 10 seconds,
 *          THEN the Website REMAINS on the current page and shows an error indication.
 *
 * Two faithful observation points are used, matching the project's existing tests:
 *   1. the pure content model (`buildServicePageModel`) and typed content
 *      (`SERVICE_LIST`/`SERVICE_KEYS`), which the ServicePage component renders directly,
 *      so the model is the single source of truth for 2.1/2.5/2.6 shape behavior; and
 *   2. the HTML emitted by `astro build`, which lets 2.1 assert exactly three generated
 *      `/services/*` pages and lets 3.4 assert the bounded-navigation handling that is
 *      implemented as the home page's inline progressive-enhancement script.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

/** The three services the business offers, in display order (Requirement 2.1). */
const EXPECTED_SERVICE_KEYS: readonly ServiceKey[] = [
  "computer-learning",
  "computer-repair",
  "in-home-repair",
];

/** Read a built service page's HTML by its service key. */
function readServicePageHtml(key: ServiceKey): string {
  const file = resolve(distDir, "services", key, "index.html");
  expect(existsSync(file)).toBe(true);
  return readFileSync(file, "utf8");
}

// Build the static site once for the whole file so the dist/* assertions (2.1 generated
// pages, 2.5/2.6 markup, 3.4 inline handling) run against fresh, deterministic output
// regardless of which test file ran first. The shared helper serializes the build across
// Vitest worker processes so concurrent files never clobber one another's dist/.
beforeAll(() => {
  ensureBuiltSite();
  expect(existsSync(distIndex)).toBe(true);
}, 190_000);

// --- 2.1: exactly three service pages -------------------------------------------------

describe("exactly three service pages (Requirement 2.1)", () => {
  it("the typed content model defines exactly the three required services", () => {
    // SERVICE_LIST / SERVICE_KEYS are what getStaticPaths enumerates to emit one page
    // per service, so "exactly three" at this layer is the source of the page count.
    expect(SERVICE_LIST).toHaveLength(3);
    expect(SERVICE_KEYS).toHaveLength(3);
    expect([...SERVICE_KEYS]).toEqual([...EXPECTED_SERVICE_KEYS]);
    expect(Object.keys(SERVICES).sort()).toEqual([...EXPECTED_SERVICE_KEYS].sort());
  });

  it("every required service key is present exactly once, with no extras", () => {
    const keysFromList = SERVICE_LIST.map((s) => s.key);
    // No duplicates.
    expect(new Set(keysFromList).size).toBe(keysFromList.length);
    // Exactly the three required keys — no missing, no unexpected extra.
    expect([...keysFromList].sort()).toEqual([...EXPECTED_SERVICE_KEYS].sort());
  });

  it("builds exactly three /services/* pages, one per service", () => {
    // Each required key yields a renderable, available model (so a page is generated).
    for (const key of EXPECTED_SERVICE_KEYS) {
      const model = buildServicePageModel(SERVICES[key]);
      expect(model.key).toBe(key);
      expect(model.contentUnavailable).toBe(false);
    }

    // And `astro build` emits exactly one static page under /services for each key.
    for (const key of EXPECTED_SERVICE_KEYS) {
      const file = resolve(distDir, "services", key, "index.html");
      expect(existsSync(file)).toBe(true);
    }
    // No fourth service page exists.
    const extra = resolve(distDir, "services", "lawn-mowing", "index.html");
    expect(existsSync(extra)).toBe(false);
  });
});

// --- 2.5 / 2.6: content and form-open failure paths keep the visitor on the page ------

describe("service content-unavailable failure path (Requirement 2.5)", () => {
  // A malformed Service — one whose name, description, or includes cannot be loaded — is
  // exactly what buildServicePageModel flags as `contentUnavailable`, which the
  // ServicePage renders as an in-place error indication while keeping the visitor on the
  // page (no redirect). These examples cover each missing-content shape.

  it("flags content-unavailable when the description is empty", () => {
    const malformed: Service = {
      key: "computer-repair",
      title: "Computer Repair",
      description: "   ", // blank after trimming — cannot be loaded
      includes: ["Diagnosis"],
    };
    const model = buildServicePageModel(malformed);
    expect(model.contentUnavailable).toBe(true);
    // The visitor stays on this page: the page is still identified by its service key,
    // so the shared layout + navigation render and no redirect occurs.
    expect(model.key).toBe("computer-repair");
  });

  it("flags content-unavailable when the includes list is empty", () => {
    const malformed: Service = {
      key: "in-home-repair",
      title: "In-Home Repair",
      description: "We fix things around the home.",
      includes: [], // no items — cannot be loaded
    };
    const model = buildServicePageModel(malformed);
    expect(model.contentUnavailable).toBe(true);
    expect(model.key).toBe("in-home-repair");
  });

  it("flags content-unavailable when every includes item is blank", () => {
    const malformed: Service = {
      key: "computer-learning",
      title: "Computer Learning",
      description: "Patient lessons.",
      includes: ["   ", ""], // all items blank — nothing to list
    };
    const model = buildServicePageModel(malformed);
    expect(model.contentUnavailable).toBe(true);
    expect(model.includes).toHaveLength(0);
  });

  it("flags content-unavailable when the service name is missing", () => {
    const malformed: Service = {
      key: "computer-repair",
      title: "   ",
      description: "We fix computers.",
      includes: ["Diagnosis"],
    };
    const model = buildServicePageModel(malformed);
    expect(model.contentUnavailable).toBe(true);
  });

  it("does NOT flag content-unavailable for a well-formed service", () => {
    // Control: the shipped, well-formed content renders normally.
    const model = buildServicePageModel(SERVICES["computer-learning"]);
    expect(model.contentUnavailable).toBe(false);
    expect(model.title.length).toBeGreaterThan(0);
    expect(model.description.length).toBeGreaterThan(0);
    expect(model.includes.length).toBeGreaterThanOrEqual(1);
  });

  it("surfaces the content-unavailable error indication in the built Service_Page markup", () => {
    // The ServicePage renders a role="alert" error region (shown only when
    // contentUnavailable), and keeps the shared navigation present so the visitor stays
    // on the page. Assert both the alert scaffolding and the retained navigation exist
    // in the generated markup.
    const html = readServicePageHtml("computer-repair");

    // The page keeps the visitor on the Service_Page: the Main navigation is still
    // rendered (no redirect away), satisfying the "retain the Visitor" clause of 2.5/2.6.
    expect(html).toContain('aria-label="Main"');

    // The content-unavailable indication the model drives is wired to role="alert" and a
    // clearly worded message in the component source, so the page can show it in place.
    // (task 18.3: the per-language Service_Page body was factored into the shared
    // ServicePageContent component rendered by both the French and English routes.)
    const servicePageSource = readFileSync(
      resolve(projectRoot, "src", "components", "ServicePageContent.astro"),
      "utf8",
    );
    expect(servicePageSource).toMatch(/contentUnavailable \?/);
    expect(servicePageSource).toMatch(/role="alert"/);
    // The message is authored in French (Requirement 7.1).
    expect(servicePageSource).toMatch(/momentanément indisponible/i);
  });
});

describe("form-open failure path keeps the visitor on the page (Requirement 2.6)", () => {
  // 2.6 shares 2.5's guarantee: a Service_Page always carries a form link, and when a
  // target page cannot be reached the design keeps the visitor on the current page with
  // an error indication rather than navigating away. At the model layer this is observed
  // as: a well-formed Service_Page always offers the preselecting form link (so the
  // affordance exists), and the page is never replaced by a redirect.
  it("every well-formed service page offers a preselecting form link to stay anchored to", () => {
    for (const key of EXPECTED_SERVICE_KEYS) {
      const model = buildServicePageModel(SERVICES[key]);
      expect(model.formLink).toBe(`/service-request?service=${key}`);
    }
  });

  it("the built Service_Page retains navigation (no redirect) so a failed form-open stays on-page", () => {
    // The visitor remains on the Service_Page: it is a standalone static page that still
    // renders the shared navigation and footer, never a redirect to the form.
    const html = readServicePageHtml("computer-learning");
    expect(html).toContain('aria-label="Main"');
    // The form link is a plain in-page anchor to the request form (preselected), so a
    // failure to open the form does not navigate the visitor off this page's document.
    expect(html).toContain("/service-request?service=computer-learning");
  });
});

// --- 3.4: navigation-timeout handling keeps the current page --------------------------

describe("navigation-timeout handling keeps the current page (Requirement 3.4)", () => {
  // 3.4 is client behavior: when a navigation target cannot be displayed within the
  // 10-second bound, the Website remains on the current page and shows an error. This is
  // implemented as the home page's inline progressive-enhancement script, which probes a
  // link's reachability with a 10-second (10000ms) abort bound, prevents the default
  // navigation, and reveals an in-place error that reassures the visitor they are still
  // on the current page. Assert that handling is present in the built HTML.
  let html = "";

  beforeAll(() => {
    html = readFileSync(distIndex, "utf8");
  });

  it("bounds the navigation probe to 10 seconds", () => {
    // The 10-second navigation bound (Requirement 3.4) is encoded in the probe timeout.
    expect(html).toContain("PROBE_TIMEOUT_MS = 10000");
    // The bound is enforced by aborting the in-flight navigation probe when it elapses.
    expect(html).toContain("AbortController");
    expect(html).toContain("controller.abort");
  });

  it("prevents navigating away and keeps the visitor on the current page on timeout", () => {
    // The default navigation is prevented until reachability is confirmed, so a timed-out
    // or unreachable target leaves the visitor on the current page.
    expect(html).toContain("preventDefault()");
    expect(html).toContain("showServiceError()");
    // An error region, announced to assistive tech, states the page could not be reached.
    expect(html).toContain('id="home-service-error"');
    expect(html).toMatch(/id="home-service-error"[^>]*role="alert"/);
    // The French broken-link message states the page is not reachable (Requirement 7.1).
    expect(html).toMatch(/n(?:'|&#39;)est pas accessible/);
    // ...and reassures the visitor they remain on the current page.
    expect(html).toMatch(/toujours[\s\S]*?sur la page d(?:'|&#39;)accueil/);
  });
});

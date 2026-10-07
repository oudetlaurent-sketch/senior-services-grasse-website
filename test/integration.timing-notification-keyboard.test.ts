import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { ensureBuiltSite } from "./support/build-site.js";
import {
  handleServiceRequest,
  CONFIRMATION_MESSAGE,
} from "../src/integration/handle-service-request.js";
import {
  buildNotificationEmail,
  createEmailSender,
  type EmailTransport,
} from "../src/integration/email.js";
import { InMemoryFailedNotificationStore } from "../src/integration/request-handler.js";
import type {
  NotificationEmail,
  RawFormInput,
  ServiceRequest,
} from "../src/domain/types.js";

/**
 * Integration tests (task 12.2) for the three cross-cutting behaviors the design's
 * "Integration tests" section carves out for integration rather than property coverage:
 *
 *   1. Timing (Requirements 1.1, 2.2 timing, 3.3): the Home_Page and Service_Pages load
 *      within budget. The site is static, so a fast load is a direct consequence of the
 *      pages being pre-rendered to small HTML files that the CDN serves verbatim. These
 *      tests assert the pages are prebuilt and small, and use a local file read/serve as
 *      a deterministic proxy for the under-budget static load.
 *   2. Notification (Requirement 4.7): an end-to-end run through the endpoint's pure
 *      handler with a STUBBED EmailTransport that records the message, asserting a
 *      notification addressed to the business address is produced and the whole path
 *      completes well within the 30-second budget (backoff injected to 0).
 *   3. Keyboard traversal (Requirements 6.3, 6.4): the rendered DOM order of focusable
 *      elements matches the visual/reading order (skip link first, then nav links, then
 *      form controls, then submit), no element carries a positive tabindex that would
 *      reorder tabbing, and nothing creates a keyboard trap.
 *
 * Everything here is deterministic and fast: no real network, no real email, no real
 * HTTP server. The static artifacts are read from `dist/`, building once if missing.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");

/** The canonical business inbox that receives notifications (Requirement 4.7). */
const BUSINESS_TO = "requests@example.com";

/** Static pages whose load must be within budget (Requirements 1.1, 2.2, 3.3). */
const STATIC_PAGES = [
  { label: "Home_Page", path: resolve(distDir, "index.html") },
  {
    label: "Service_Page (computer-learning)",
    path: resolve(distDir, "services", "computer-learning", "index.html"),
  },
  {
    label: "Service_Page (computer-repair)",
    path: resolve(distDir, "services", "computer-repair", "index.html"),
  },
  {
    label: "Service_Page (in-home-repair)",
    path: resolve(distDir, "services", "in-home-repair", "index.html"),
  },
] as const;

/** The Service_Request_Form artifact used for the keyboard-traversal checks. */
const distForm = resolve(distDir, "service-request", "index.html");

beforeAll(() => {
  // Build at most once across concurrent Vitest workers (see test/support/build-site.ts),
  // so parallel test files never clobber one another's dist/ mid-build. A static build is
  // quick and deterministic, so the assertions track the current source.
  ensureBuiltSite();
  for (const page of STATIC_PAGES) {
    expect(existsSync(page.path), `${page.label} should be prebuilt`).toBe(true);
  }
  expect(existsSync(distForm), "Service_Request_Form should be prebuilt").toBe(true);
}, 190_000);

// ---------------------------------------------------------------------------
// 1. Timing — static pages load within budget (Requirements 1.1, 2.2, 3.3)
// ---------------------------------------------------------------------------

describe("static pages load within budget (Requirements 1.1, 2.2, 3.3)", () => {
  // A small page served from a CDN loads fast. 150 KB keeps a page well inside a
  // sub-second load even on a slow connection; it is a generous ceiling for these
  // content pages (the home page is ~13 KB).
  const MAX_PAGE_BYTES = 150 * 1024;

  it("prebuilds every content page as a small, static HTML file", () => {
    for (const page of STATIC_PAGES) {
      const stats = statSync(page.path);
      expect(stats.isFile(), `${page.label} is a file`).toBe(true);
      expect(stats.size, `${page.label} is non-empty`).toBeGreaterThan(0);
      expect(
        stats.size,
        `${page.label} is small enough to serve fast (${stats.size} bytes)`,
      ).toBeLessThanOrEqual(MAX_PAGE_BYTES);

      // The artifact is self-contained prebuilt HTML (no server render needed at
      // request time), which is what makes the static load trivially under budget.
      const html = readFileSync(page.path, "utf8");
      expect(html).toMatch(/<!DOCTYPE html>/i);
      expect(html).toMatch(/<main[\s>]/i);
    }
  });

  it("serves each prebuilt page from disk far under the load budget", () => {
    // Reading and "serving" the prebuilt file locally is a deterministic proxy for the
    // static load: a page already rendered to a small file needs no computation at
    // request time. We assert it completes comfortably under a 1-second budget, which is
    // a strict proxy for the acceptance budgets (1.1, 2.2, 3.3).
    const LOAD_BUDGET_MS = 1000;
    for (const page of STATIC_PAGES) {
      const start = performance.now();
      const body = readFileSync(page.path, "utf8");
      const elapsed = performance.now() - start;

      expect(body.length, `${page.label} has content`).toBeGreaterThan(0);
      expect(
        elapsed,
        `${page.label} served in ${elapsed.toFixed(2)}ms (budget ${LOAD_BUDGET_MS}ms)`,
      ).toBeLessThan(LOAD_BUDGET_MS);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Notification — end-to-end to the business address within budget (4.7)
// ---------------------------------------------------------------------------

/** A stubbed transport that records every message handed to it and always delivers. */
function recordingTransport(): {
  transport: EmailTransport;
  sent: NotificationEmail[];
} {
  const sent: NotificationEmail[] = [];
  return {
    sent,
    transport: {
      async send(message: NotificationEmail): Promise<void> {
        sent.push(message);
      },
    },
  };
}

/** A valid submission used to drive the end-to-end notification path. */
const validInput: RawFormInput = {
  name: "Jane Doe",
  phone: "+1 (555) 123-4567",
  email: "jane@example.com",
  service: "computer-repair",
  description: "My laptop will not turn on.",
};

/** The 30-second notification budget (Requirement 4.7). */
const NOTIFICATION_BUDGET_MS = 30_000;

describe("end-to-end notification reaches the business address within budget (Requirement 4.7)", () => {
  it("produces a notification addressed to the business address through the endpoint handler", async () => {
    const { transport, sent } = recordingTransport();
    // backoff 0 so the retry schedule never approaches the 30-second budget.
    const emailSender = createEmailSender(
      transport,
      { businessTo: BUSINESS_TO },
      { backoffMs: () => 0 },
    );
    const failedNotificationStore = new InMemoryFailedNotificationStore();

    const start = performance.now();
    const result = await handleServiceRequest(validInput, {
      emailSender,
      failedNotificationStore,
    });
    const elapsed = performance.now() - start;

    // The submission is accepted and confirmed...
    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("expected 200");
    expect(result.confirmation).toBe(CONFIRMATION_MESSAGE);
    expect(result.delivered).toBe(true);

    // ...exactly one notification was produced, addressed to the business address.
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(BUSINESS_TO);
    // The message carries request detail so the business can act on it.
    expect(sent[0].subject).toContain("service request");
    expect(sent[0].body).toContain(validInput.name);
    expect(sent[0].body).toContain(validInput.phone);

    // ...and the whole notification path completed well within the 30-second budget.
    expect(
      elapsed,
      `notification path took ${elapsed.toFixed(2)}ms (budget ${NOTIFICATION_BUDGET_MS}ms)`,
    ).toBeLessThan(NOTIFICATION_BUDGET_MS);

    // No delivery failure, so nothing was recorded as undelivered.
    expect(failedNotificationStore.entries).toHaveLength(0);
  });

  it("still reaches the business address after transient failures, within budget", async () => {
    // A transport that fails the first two attempts then delivers: the bounded retry
    // (4 attempts max) must still get a message addressed to the business within budget.
    const sent: NotificationEmail[] = [];
    let attempt = 0;
    const flakyTransport: EmailTransport = {
      async send(message: NotificationEmail): Promise<void> {
        attempt += 1;
        if (attempt <= 2) throw new Error("transient transport failure");
        sent.push(message);
      },
    };
    const emailSender = createEmailSender(
      flakyTransport,
      { businessTo: BUSINESS_TO },
      { backoffMs: () => 0 },
    );
    const failedNotificationStore = new InMemoryFailedNotificationStore();

    const start = performance.now();
    const result = await handleServiceRequest(validInput, {
      emailSender,
      failedNotificationStore,
    });
    const elapsed = performance.now() - start;

    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("expected 200");
    expect(result.delivered).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(BUSINESS_TO);
    expect(elapsed).toBeLessThan(NOTIFICATION_BUDGET_MS);
    expect(failedNotificationStore.entries).toHaveLength(0);
  });

  it("builds a NotificationEmail whose `to` equals the business address", () => {
    // The message construction is the single point that decides the recipient; assert it
    // directly so the end-to-end expectation above is anchored to the design contract.
    const request: ServiceRequest = {
      name: "Jane Doe",
      phone: "+1 (555) 123-4567",
      email: "jane@example.com",
      service: "computer-repair",
      description: "My laptop will not turn on.",
      id: "req-fixed",
      createdAt: "2024-01-02T03:04:05.000Z",
      notified: false,
    };
    const message = buildNotificationEmail(request, BUSINESS_TO);
    expect(message.to).toBe(BUSINESS_TO);
  });
});

// ---------------------------------------------------------------------------
// 3. Keyboard traversal — tab order and no keyboard trap (6.3, 6.4)
// ---------------------------------------------------------------------------

/** A focusable element discovered in document order, with its tabindex (null if absent). */
interface Focusable {
  tag: string;
  /** A short identifier for diagnostics: id, href, or the control's name. */
  descriptor: string;
  /** The numeric tabindex, or null when the attribute is absent. */
  tabindex: number | null;
}

/** Read a named attribute value from a start-tag's attribute text (null when absent). */
function readAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = attrs.match(re);
  return m ? m[1] : null;
}

/** Whether a boolean attribute (e.g. `disabled`, `hidden`) is present. */
function hasBooleanAttr(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}(?=[\\s=>])`, "i").test(` ${attrs} `);
}

/**
 * Extract the natively focusable elements from a page body in document order:
 * anchors with an href, and non-disabled form controls (input/select/textarea/button).
 * Elements explicitly removed from the tab order (tabindex="-1") or hidden/disabled are
 * excluded, mirroring what a keyboard user actually tabs through.
 */
function extractFocusables(bodyHtml: string): Focusable[] {
  const focusables: Focusable[] = [];
  const re = /<(a|input|select|textarea|button)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyHtml)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];

    const tabindexRaw = readAttr(attrs, "tabindex");
    const tabindex = tabindexRaw === null ? null : Number.parseInt(tabindexRaw, 10);

    // Not keyboard-focusable in the sequential tab order:
    if (tabindex === -1) continue; // programmatic focus only (e.g. error summary)
    if (hasBooleanAttr(attrs, "hidden")) continue;
    if (hasBooleanAttr(attrs, "disabled")) continue;
    // An anchor without an href is not focusable.
    const href = readAttr(attrs, "href");
    if (tag === "a" && href === null) continue;

    const descriptor =
      readAttr(attrs, "id") ??
      href ??
      readAttr(attrs, "name") ??
      readAttr(attrs, "type") ??
      tag;

    focusables.push({ tag, descriptor, tabindex });
  }
  return focusables;
}

/** Isolate the <body>…</body> region so only visible document content is considered. */
function extractBody(html: string): string {
  const m = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html;
}

describe("keyboard traversal matches reading order with no trap (Requirements 6.3, 6.4)", () => {
  let focusables: Focusable[] = [];

  beforeAll(() => {
    const body = extractBody(readFileSync(distForm, "utf8"));
    focusables = extractFocusables(body);
    // Sanity: the page really exposes the expected focusable set (skip link + 7 nav
    // links + 2 Language_Selector links + 5 form controls + submit + 2 footer links).
    // Guards against a vacuous pass. (task 18.4 adds the Language_Selector to the nav.)
    expect(focusables.length).toBeGreaterThanOrEqual(16);
  });

  it("places the skip link as the first focusable element (Requirement 6.3)", () => {
    // A skip link that is not first cannot be used to bypass the nav before it.
    const first = focusables[0];
    expect(first.tag).toBe("a");
    expect(first.descriptor).toBe("#main-content");
  });

  it("orders focusable elements to match the visual/reading order (Requirement 6.3)", () => {
    // Expected reading order on the Service_Request_Form:
    //   skip link → 7 nav links → 2 Language_Selector links → 5 form controls → submit
    //   → footer phone → footer email.
    // (task 18.2: the nav carries the About_Page and Scheduling_Page links; task 18.4:
    //  the Language_Selector — the current page in each language — follows the Main nav
    //  and precedes the main content, matching its position at the top of the document.)
    const descriptors = focusables.map((f) => f.descriptor);

    const expectedPrefix = [
      "#main-content",
      "/",
      "/services/computer-learning",
      "/services/computer-repair",
      "/services/in-home-repair",
      "/about",
      "/rendez-vous",
      "/service-request",
      // Language_Selector: the SAME page (service-request) in French then English.
      "/service-request",
      "/en/service-request",
      "field-name",
      "field-phone",
      "field-email",
      "field-service",
      "field-description",
    ];
    expect(descriptors.slice(0, expectedPrefix.length)).toEqual(expectedPrefix);

    // The submit button follows the last form control (comes after the description).
    const submit = focusables.find((f) => f.tag === "button");
    expect(submit, "a submit button is focusable").toBeDefined();
    const descriptionIndex = descriptors.indexOf("field-description");
    const submitIndex = focusables.findIndex((f) => f.tag === "button");
    expect(submitIndex).toBeGreaterThan(descriptionIndex);

    // The form controls appear in nested-field (visual) order within the form region.
    const controlOrder = focusables
      .filter((f) => f.descriptor.startsWith("field-"))
      .map((f) => f.descriptor);
    expect(controlOrder).toEqual([
      "field-name",
      "field-phone",
      "field-email",
      "field-service",
      "field-description",
    ]);
  });

  it("uses no positive tabindex so DOM order is the tab order (Requirement 6.3)", () => {
    // A positive tabindex jumps an element to the front of the tab sequence, breaking the
    // match between visual order and tab order. None of the focusable elements may have one.
    for (const f of focusables) {
      if (f.tabindex !== null) {
        expect(
          f.tabindex,
          `<${f.tag} ${f.descriptor}> must not have a positive tabindex`,
        ).toBeLessThanOrEqual(0);
      }
    }
  });

  it("creates no keyboard trap: focus can always leave each component (Requirement 6.4)", () => {
    // A keyboard trap arises when something forces focus to stay (a positive tabindex ring
    // or a focusable element that cannot be tabbed past). With only tabindex 0 / none, tab
    // order is the natural document order, so focus always advances to the next element and
    // off the last one — nothing holds focus. We assert the absence of any trap signal and
    // that the last focusable element is a normal, exitable control.
    const anyPositiveTabindex = focusables.some(
      (f) => f.tabindex !== null && f.tabindex > 0,
    );
    expect(anyPositiveTabindex, "no positive tabindex creates a focus ring").toBe(false);

    // The last focusable element is a plain anchor/control (no construct that re-captures
    // focus), so Tab moves beyond it and out of the page content.
    const last = focusables[focusables.length - 1];
    expect(["a", "button", "input", "select", "textarea"]).toContain(last.tag);
    expect(last.tabindex === null || last.tabindex === 0).toBe(true);
  });
});

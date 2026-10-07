import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildServicePageModel } from "../src/domain/service-page.js";
import {
  buildServiceFormLink,
  readPreselectedService,
  SERVICE_REQUEST_PATH,
} from "../src/domain/service-link.js";
import type { Service, ServiceKey } from "../src/domain/types.js";

/**
 * Property 2: Every service page links to the request form.
 *
 * Validates: Requirements 2.3
 *
 * For any valid Service content entry, the rendered Service_Page contains a link to the
 * Service_Request_Form. The ServicePage component (src/pages/services/[service].astro)
 * renders the content model produced by the pure buildServicePageModel helper, so
 * asserting that the model carries a form link whose path targets the
 * Service_Request_Form (/service-request) and encodes the service is equivalent to
 * asserting the rendered page links to the form.
 *
 * This test coordinates with the shared buildServicePageModel helper (task 7.3): it
 * asserts on model.formLink, and cross-checks that the helper produces exactly the link
 * buildServiceFormLink yields for the service's key.
 *
 * A "valid Service content entry" is generated here with the same shape the build-time
 * content check enforces (Requirements 2.1/2.2): a known ServiceKey, a non-blank title
 * and description, and an includes list of at least one non-blank item.
 */

/** The complete set of valid service keys. */
const serviceKeyArb: fc.Arbitrary<ServiceKey> = fc.constantFrom(
  "computer-learning",
  "computer-repair",
  "in-home-repair",
);

/**
 * A string that is non-empty after trimming: at least one non-whitespace character,
 * possibly surrounded by arbitrary whitespace.
 */
const nonBlankTextArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringMatching(/^\s*$/), // leading whitespace (possibly empty)
    fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), // core, non-blank
    fc.stringMatching(/^\s*$/), // trailing whitespace (possibly empty)
  )
  .map(([lead, core, trail]) => `${lead}${core}${trail}`);

/** A valid Service: known key, non-blank title/description, >= 1 non-blank includes item. */
const validServiceArb: fc.Arbitrary<Service> = fc.record({
  key: serviceKeyArb,
  title: nonBlankTextArb,
  description: nonBlankTextArb,
  includes: fc.array(nonBlankTextArb, { minLength: 1, maxLength: 8 }),
});

describe("service page — form link presence (Property 2)", () => {
  it("renders a link whose path targets the Service_Request_Form and encodes the service, for any valid Service", () => {
    // Feature: senior-services-website, Property 2: Every service page links to the
    // request form. Validates: Requirements 2.3
    fc.assert(
      fc.property(validServiceArb, (service) => {
        const model = buildServicePageModel(service);

        // A valid Service yields renderable (available) content with a form link.
        expect(model.contentUnavailable).toBe(false);

        const { formLink } = model;

        // The page carries a form link.
        expect(typeof formLink).toBe("string");
        expect(formLink.length).toBeGreaterThan(0);

        // Its path targets the Service_Request_Form (/service-request). The link is
        // root-relative, so the parsed pathname must equal SERVICE_REQUEST_PATH.
        const parsed = new URL(formLink, "http://local.invalid");
        expect(parsed.pathname).toBe(SERVICE_REQUEST_PATH);

        // It encodes this service: the preselection recovered from the link is the
        // service's own key (Requirement 2.3 — the link reaches the form for this service).
        expect(readPreselectedService(formLink)).toBe(service.key);

        // The page uses the shared buildServiceFormLink helper — the model's link is
        // exactly the one that helper produces for the service's key.
        expect(formLink).toBe(buildServiceFormLink(service.key));
      }),
      { numRuns: 100 },
    );
  });
});

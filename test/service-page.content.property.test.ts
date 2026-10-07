import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildServicePageModel } from "../src/domain/service-page.js";
import type { Service, ServiceKey } from "../src/domain/types.js";

/**
 * Property 1: Service pages present complete content.
 *
 * Validates: Requirements 2.2
 *
 * For any valid Service content entry, the rendered Service_Page contains that
 * service's name, a non-empty description, and at least one includes item. The
 * ServicePage component (src/pages/services/[service].astro) renders the content model
 * produced by the pure buildServicePageModel helper, so asserting the property against
 * that model is equivalent to asserting it against what the page renders.
 *
 * A "valid Service content entry" is generated here: a known ServiceKey, a non-empty
 * (after trimming) title and description, and an includes list of at least one
 * non-empty (after trimming) item — the exact shape the build-time content check
 * (src/content/services.check.ts) enforces for Requirements 2.1/2.2.
 */

/** The complete set of valid service keys. */
const serviceKeyArb: fc.Arbitrary<ServiceKey> = fc.constantFrom(
  "computer-learning",
  "computer-repair",
  "in-home-repair",
);

/**
 * A string that is non-empty after trimming: at least one non-whitespace character,
 * possibly surrounded by arbitrary whitespace. This exercises the helper's trimming
 * while guaranteeing the entry is genuinely non-blank (a valid Service).
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

describe("service page — complete content (Property 1)", () => {
  it("includes the service name, a non-empty description, and >= 1 includes item for any valid Service", () => {
    // Feature: senior-services-website, Property 1: Service pages present complete
    // content. Validates: Requirements 2.2
    fc.assert(
      fc.property(validServiceArb, (service) => {
        const model = buildServicePageModel(service);

        // A valid Service yields renderable (available) content.
        expect(model.contentUnavailable).toBe(false);

        // The service's name is present (the trimmed title).
        expect(model.title).toBe(service.title.trim());
        expect(model.title.length).toBeGreaterThan(0);

        // A non-empty description.
        expect(model.description.length).toBeGreaterThan(0);

        // At least one includes item, each non-empty.
        expect(model.includes.length).toBeGreaterThanOrEqual(1);
        for (const item of model.includes) {
          expect(item.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

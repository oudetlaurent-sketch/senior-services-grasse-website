import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildServiceFormLink,
  readPreselectedService,
} from "../src/domain/service-link.js";
import type { ServiceKey } from "../src/domain/types.js";

/**
 * Property 3: Service preselection round-trips through the form link.
 *
 * Validates: Requirements 2.4
 *
 * For any service key, the form link generated for that service, when followed, yields a
 * Service_Request_Form whose preselected service equals that key. Concretely:
 * readPreselectedService(buildServiceFormLink(key)) === key for every ServiceKey.
 *
 * The generator ranges over the three known service keys (the entire input space for
 * ServiceKey), so the round-trip is exercised across all valid services.
 */

/** The complete set of valid service keys — the full input space for this property. */
const serviceKeyArb: fc.Arbitrary<ServiceKey> = fc.constantFrom(
  "computer-learning",
  "computer-repair",
  "in-home-repair",
);

describe("service form link — preselection round-trip (Property 3)", () => {
  it("recovers the exact service key from the generated form link", () => {
    // Feature: senior-services-website, Property 3: Service preselection round-trips
    // through the form link. Validates: Requirements 2.4
    fc.assert(
      fc.property(serviceKeyArb, (key) => {
        const link = buildServiceFormLink(key);
        expect(readPreselectedService(link)).toBe(key);
      }),
      { numRuns: 100 },
    );
  });
});

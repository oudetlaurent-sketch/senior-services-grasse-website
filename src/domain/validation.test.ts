import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateServiceRequest } from "./validation.js";
import type { FieldName, RawFormInput } from "./types.js";

// Feature: senior-services-website, Property 5: Required-field errors name exactly the
// empty required fields, and values are retained.
//
// Validates: Requirements 4.2, 4.4
//
// For any RawFormInput, the set of fields reported with a `required` error equals
// exactly the set of required fields (name, phone, service) that are empty after
// trimming, and the submitted values are retained field-for-field. Because the current
// validation returns only `{ ok: false, errors }` on failure (echoing of values happens
// at the transport layer per design §6/§11), "values are retained" is asserted against
// the submitted input directly — the test holds the input it generated.

/** The three required fields per Requirement 4.2. */
const REQUIRED_FIELDS: readonly FieldName[] = ["name", "phone", "service"];

/**
 * Strings biased toward the interesting input space for required-field detection:
 * genuinely empty strings, whitespace-only strings (empty after trim), strings with
 * leading/trailing whitespace, and ordinary non-empty values.
 */
const fieldString = fc.oneof(
  fc.constant(""),
  // whitespace-only: empty after trimming
  fc.stringOf(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 1, maxLength: 5 }),
  // arbitrary strings, which may or may not be blank
  fc.string(),
  // non-empty content possibly padded with surrounding whitespace
  fc
    .tuple(
      fc.stringOf(fc.constantFrom(" ", "\t", ""), { maxLength: 3 }),
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.stringOf(fc.constantFrom(" ", "\t", ""), { maxLength: 3 }),
    )
    .map(([lead, core, trail]) => `${lead}${core}${trail}`),
);

const rawFormInput: fc.Arbitrary<RawFormInput> = fc.record({
  name: fieldString,
  phone: fieldString,
  email: fieldString,
  service: fieldString,
  description: fieldString,
});

describe("validateServiceRequest — Property 5: required-field detection and value retention", () => {
  it("reports `required` for exactly the empty-after-trim required fields and retains submitted values", () => {
    fc.assert(
      fc.property(rawFormInput, (input) => {
        // Snapshot the submitted values before validation so we can prove they are
        // retained (unchanged) field-for-field afterward.
        const submitted: RawFormInput = { ...input };

        const result = validateServiceRequest(input);

        // Fields that are empty after trimming among the required set — the exact set
        // the spec says must carry a `required` error (Requirement 4.4).
        const expectedRequired = new Set(
          REQUIRED_FIELDS.filter((field) => input[field].trim().length === 0),
        );

        // Collect the fields that actually carry a `required` error. On success there
        // are no errors, so the observed set is empty.
        const observedRequired = new Set<FieldName>();
        if (!result.ok) {
          for (const error of result.errors) {
            if (error.code === "required") {
              observedRequired.add(error.field);
            }
          }
        }

        // Exact-set equality: no missing and no extra `required` errors.
        expect([...observedRequired].sort()).toEqual([...expectedRequired].sort());

        // At most one `required` error per field (no duplicates).
        if (!result.ok) {
          const requiredErrors = result.errors.filter((e) => e.code === "required");
          expect(requiredErrors.length).toBe(expectedRequired.size);
        }

        // Value retention: validation does not mutate the submitted input, so every
        // field still equals the value that was submitted — the exact values the
        // transport layer echoes back field-for-field (Requirement 4.4).
        expect(input.name).toBe(submitted.name);
        expect(input.phone).toBe(submitted.phone);
        expect(input.email).toBe(submitted.email);
        expect(input.service).toBe(submitted.service);
        expect(input.description).toBe(submitted.description);
      }),
      { numRuns: 200 },
    );
  });
});

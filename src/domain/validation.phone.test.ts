import { describe, it } from "vitest";
import fc from "fast-check";
import { validateServiceRequest } from "./validation.js";
import type { RawFormInput } from "./types.js";

// Feature: senior-services-website, Property 9: Phone is rejected if and only if
// it contains a disallowed character (Validates: Requirements 4.6).
//
// For any RawFormInput, validateServiceRequest reports an `invalid_phone` error on
// the phone field if and only if the trimmed, non-empty phone value contains at
// least one character outside the allowed set: digits, space, `+`, `-`, `(`, `)`.

/** The characters the phone field is allowed to contain (Requirement 4.6). */
const ALLOWED_PHONE_CHARS = "0123456789 +-()".split("");

/**
 * A character generator skewed to produce both allowed phone characters and
 * arbitrary (possibly disallowed) Unicode characters, so the generated phone
 * strings exercise both sides of the property.
 */
const phoneCharArb = fc.oneof(
  fc.constantFrom(...ALLOWED_PHONE_CHARS),
  fc.char(), // may be allowed or disallowed (letters, punctuation, control, etc.)
);

/** True iff `phone` contains at least one character outside the allowed set. */
function hasDisallowedChar(phone: string): boolean {
  for (const ch of phone) {
    if (!ALLOWED_PHONE_CHARS.includes(ch)) {
      return true;
    }
  }
  return false;
}

/** Did the result include an `invalid_phone` error on the phone field? */
function hasInvalidPhoneError(input: RawFormInput): boolean {
  const result = validateServiceRequest(input);
  if (result.ok) {
    return false;
  }
  return result.errors.some(
    (e) => e.field === "phone" && e.code === "invalid_phone",
  );
}

describe("Property 9: phone charset acceptance/rejection", () => {
  it("reports invalid_phone iff the trimmed non-empty phone has a disallowed char", () => {
    fc.assert(
      fc.property(
        fc.array(phoneCharArb, { maxLength: 20 }).map((chars) => chars.join("")),
        (core) => {
          // Build a raw phone and derive what the validator sees after trimming.
          const rawPhone = core;
          const trimmedPhone = rawPhone.trim();

          const input: RawFormInput = {
            // Keep the other required fields valid so only phone-related errors
            // can appear; the invalid_phone check is independent of them anyway.
            name: "Pat",
            phone: rawPhone,
            email: "",
            service: "computer-repair",
            description: "",
          };

          const expectedInvalidPhone =
            trimmedPhone.length > 0 && hasDisallowedChar(trimmedPhone);

          return hasInvalidPhoneError(input) === expectedInvalidPhone;
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never reports invalid_phone when the trimmed phone is empty", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(" ", "\t", "\n", "\r"), { maxLength: 10 }),
        (whitespaceOnly) => {
          const input: RawFormInput = {
            name: "Pat",
            phone: whitespaceOnly,
            email: "",
            service: "computer-repair",
            description: "",
          };
          // Empty-after-trim phone yields a `required` error, never `invalid_phone`.
          return hasInvalidPhoneError(input) === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("accepts phones composed only of allowed characters", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(...ALLOWED_PHONE_CHARS), {
            minLength: 1,
            maxLength: 20,
          })
          .map((chars) => chars.join(""))
          .filter((s) => s.trim().length > 0),
        (allowedPhone) => {
          const input: RawFormInput = {
            name: "Pat",
            phone: allowedPhone,
            email: "",
            service: "computer-repair",
            description: "",
          };
          return hasInvalidPhoneError(input) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

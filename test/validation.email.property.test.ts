import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateServiceRequest } from "../src/domain/validation.js";
import type { FieldError, RawFormInput } from "../src/domain/types.js";

/**
 * Property 8: Email format is rejected if and only if a non-empty email is malformed.
 *
 * Validates: Requirements 4.5
 *
 * For any RawFormInput, validateServiceRequest reports an `invalid_email` error on the
 * email field if and only if the email value (after trimming) is non-empty and does not
 * match a valid email format.
 *
 * The expected outcome is derived here from the same rule the acceptance criterion
 * describes — a single reference email-format matcher applied to the trimmed value —
 * rather than from the module's internals. The email generator deliberately produces
 * both well-formed and malformed emails (plus whitespace-only/empty values) so both
 * directions of the "if and only if" are exercised.
 */

// Reference email-format rule matching Requirement 4.5 / design §6: a single `@`, a
// non-empty local part with no spaces, and a domain with at least one dot and no spaces.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A generator that yields plausibly well-formed email addresses. */
const validEmailArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringMatching(/^[A-Za-z0-9._%+-]{1,20}$/),
    fc.stringMatching(/^[A-Za-z0-9-]{1,15}$/),
    fc.stringMatching(/^[A-Za-z]{2,6}$/),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * A generator that yields likely-malformed emails: missing `@`, missing dot in the
 * domain, embedded spaces, multiple `@`, empty parts, etc. Not every value is guaranteed
 * malformed (and that is fine) — the reference matcher decides the expected outcome, so
 * occasional valid values from this arbitrary just exercise the acceptance direction.
 */
const malformedEmailArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant("plainaddress"),
  fc.constant("@no-local.com"),
  fc.constant("no-domain@"),
  fc.constant("no-dot@domain"),
  fc.constant("two@@at.com"),
  fc.constant("spaces in@domain.com"),
  fc.constant("trailing@domain.com "),
  fc.constant("user@dom ain.com"),
  fc.constant(".@."),
  // Arbitrary free text that is overwhelmingly likely to be malformed.
  fc.string({ minLength: 1, maxLength: 30 }),
);

/** Email arbitrary mixing valid, malformed, and empty/whitespace-only values. */
const emailArb: fc.Arbitrary<string> = fc.oneof(
  validEmailArb,
  malformedEmailArb,
  fc.constant(""),
  fc.constant("   "),
  fc.constant("\t\n"),
);

/** Full raw-form arbitrary; non-email fields vary freely to avoid coupling the property. */
const rawFormInputArb: fc.Arbitrary<RawFormInput> = fc.record({
  name: fc.string(),
  phone: fc.string(),
  email: emailArb,
  service: fc.string(),
  description: fc.string(),
});

function hasInvalidEmailError(errors: FieldError[]): boolean {
  return errors.some((e) => e.field === "email" && e.code === "invalid_email");
}

describe("validateServiceRequest — email format (Property 8)", () => {
  it("reports invalid_email iff a non-empty email is malformed", () => {
    // Feature: senior-services-website, Property 8: Email format is rejected if and only
    // if a non-empty email is malformed. Validates: Requirements 4.5
    fc.assert(
      fc.property(rawFormInputArb, (input) => {
        const trimmedEmail = input.email.trim();
        const expectedInvalidEmail =
          trimmedEmail.length > 0 && !EMAIL_FORMAT.test(trimmedEmail);

        const result = validateServiceRequest(input);
        const actualInvalidEmail = result.ok
          ? false
          : hasInvalidEmailError(result.errors);

        expect(actualInvalidEmail).toBe(expectedInvalidEmail);
      }),
      { numRuns: 200 },
    );
  });

  it("accepts representative well-formed emails (no invalid_email error)", () => {
    for (const email of [
      "pat@example.com",
      "a.b+tag@sub.domain.co",
      "user_name@domain.io",
    ]) {
      const result = validateServiceRequest({
        name: "Pat",
        phone: "555",
        email,
        service: "computer-repair",
        description: "",
      });
      const invalid = result.ok ? false : hasInvalidEmailError(result.errors);
      expect(invalid).toBe(false);
    }
  });

  it("rejects representative malformed non-empty emails (invalid_email error)", () => {
    for (const email of [
      "plainaddress",
      "no-dot@domain",
      "two@@at.com",
      "spaces in@domain.com",
    ]) {
      const result = validateServiceRequest({
        name: "Pat",
        phone: "555",
        email,
        service: "computer-repair",
        description: "",
      });
      const invalid = result.ok ? false : hasInvalidEmailError(result.errors);
      expect(invalid).toBe(true);
    }
  });

  it("does not report invalid_email for empty or whitespace-only emails", () => {
    for (const email of ["", "   ", "\t\n"]) {
      const result = validateServiceRequest({
        name: "Pat",
        phone: "555",
        email,
        service: "computer-repair",
        description: "",
      });
      const invalid = result.ok ? false : hasInvalidEmailError(result.errors);
      expect(invalid).toBe(false);
    }
  });
});

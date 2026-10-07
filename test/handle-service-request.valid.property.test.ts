import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateServiceRequest } from "../src/domain/validation.js";
import {
  CONFIRMATION_MESSAGE,
  handleServiceRequest,
} from "../src/integration/handle-service-request.js";
import type { EmailTransport } from "../src/integration/email.js";
import { createEmailSender } from "../src/integration/email.js";
import { InMemoryFailedNotificationStore } from "../src/integration/request-handler.js";
import type { RawFormInput, ServiceKey } from "../src/domain/types.js";

/**
 * Property 7: Fully valid submissions are accepted and confirmed.
 *
 * Validates: Requirements 4.1, 4.3
 *
 * For any fully-valid RawFormInput — name 1-100 non-empty (after trim), phone 1-20 using
 * only the allowed charset (digits, space, + - ( )), an optional email that is either
 * empty or well-formed and within 254 chars, service equal to one of the three known
 * keys, and a description of 0-2000 chars — `validateServiceRequest` returns `ok`, and
 * `handleServiceRequest` (with a delivering stub EmailSender and an in-memory failed-
 * notification store injected via deps) returns a 200 result carrying the
 * Confirmation_Message and a non-empty requestId for the created ServiceRequest.
 *
 * The generators are constrained to the valid input space described by Requirement 4.1,
 * so every generated case must be accepted and confirmed. Backoff is injected to 0 and
 * the stub transport always delivers so the many iterations run fast and deterministically.
 */

/** The three known service keys (Requirement 2.1 / design §6). */
const serviceKeyArb: fc.Arbitrary<ServiceKey> = fc.constantFrom(
  "computer-learning",
  "computer-repair",
  "in-home-repair",
);

/**
 * A name that is non-empty after trimming and at most 100 chars. We generate from a
 * character set without surrounding whitespace and guarantee at least one non-space
 * character so the trimmed length stays within 1-100.
 */
const nameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => {
    const t = s.trim();
    return t.length >= 1 && t.length <= 100;
  });

/**
 * A phone using only the allowed charset (digits, space, `+`, `-`, `(`, `)`), non-empty
 * after trimming and within 1-20 chars both raw and trimmed. At least one digit is
 * guaranteed so the trimmed value is never empty/whitespace-only.
 */
const phoneArb: fc.Arbitrary<string> = fc
  .stringMatching(/^[0-9 +\-()]{1,20}$/)
  .filter((s) => {
    const t = s.trim();
    return t.length >= 1 && t.length <= 20;
  });

/** A well-formed email within 254 chars (matches the reference format in §6). */
const validEmailArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringMatching(/^[A-Za-z0-9._%+-]{1,20}$/),
    fc.stringMatching(/^[A-Za-z0-9-]{1,15}$/),
    fc.stringMatching(/^[A-Za-z]{2,6}$/),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
  .filter((e) => e.trim().length <= 254);

/** Optional email: empty, whitespace-only (treated as omitted), or well-formed. */
const emailArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  validEmailArb,
);

/** A description within the 0-2000 bound. */
const descriptionArb: fc.Arbitrary<string> = fc.string({ maxLength: 2000 });

/** A fully-valid RawFormInput: every field within the Requirement 4.1 input space. */
const validRawFormInputArb: fc.Arbitrary<RawFormInput> = fc.record({
  name: nameArb,
  phone: phoneArb,
  email: emailArb,
  service: serviceKeyArb,
  description: descriptionArb,
});

/** A transport that always delivers on the first attempt. */
function createDeliveringTransport(): EmailTransport {
  return {
    async send(): Promise<void> {
      // Resolve: delivery succeeds.
    },
  };
}

describe("handleServiceRequest — fully valid submissions are accepted and confirmed (Property 7)", () => {
  it("validates ok and returns 200 with the Confirmation_Message and a requestId", async () => {
    // Feature: senior-services-website, Property 7: Fully valid submissions are accepted
    // and confirmed. Validates: Requirements 4.1, 4.3
    await fc.assert(
      fc.asyncProperty(validRawFormInputArb, async (input) => {
        // Validation accepts every fully-valid input (Requirement 4.1).
        const validation = validateServiceRequest(input);
        expect(validation.ok).toBe(true);

        // Delivering stub sender + in-memory store, backoff 0 for fast runs.
        const emailSender = createEmailSender(
          createDeliveringTransport(),
          { businessTo: "business@example.com" },
          { backoffMs: () => 0 },
        );
        const failedNotificationStore = new InMemoryFailedNotificationStore();

        const result = await handleServiceRequest(input, {
          emailSender,
          failedNotificationStore,
        });

        // The handler accepts and confirms the submission (Requirement 4.3).
        expect(result.status).toBe(200);
        if (result.status === 200) {
          expect(result.confirmation).toBe(CONFIRMATION_MESSAGE);
          expect(typeof result.requestId).toBe("string");
          expect(result.requestId.length).toBeGreaterThan(0);
          // The delivering stub means the notification was delivered.
          expect(result.delivered).toBe(true);
        }

        // A confirmed, delivered request records no failed notification.
        expect(failedNotificationStore.entries).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });
});

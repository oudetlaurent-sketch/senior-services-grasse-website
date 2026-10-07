import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { EmailTransport } from "../src/integration/email.js";
import { createEmailSender } from "../src/integration/email.js";
import {
  InMemoryFailedNotificationStore,
  submitServiceRequest,
} from "../src/integration/request-handler.js";
import type { ServiceRequest, ServiceRequestInput } from "../src/domain/types.js";

/**
 * Property 10: Notification retry is bounded, short-circuits on success, and records
 * total failure.
 *
 * Validates: Requirements 4.8
 *
 * For any sequence of success/failure outcomes from the email transport,
 * `sendWithRetry` (createEmailSender over EmailTransport) makes at most 4 attempts
 * (1 initial + up to 3 retries, default maxRetries 3), stops at the first successful
 * attempt, and reports `delivered = true` iff some attempt within the bound succeeded.
 * When every attempt within the bound fails, `submitServiceRequest` retains the created
 * `ServiceRequest` with `notified = false` and writes exactly one failure record to the
 * `FailedNotificationStore`.
 *
 * The expected outcome is derived here from the outcome sequence itself (the first
 * `true` within the first 4 entries), not from the module internals. Backoff is injected
 * to 0 so the many iterations run fast.
 */

const DEFAULT_MAX_ATTEMPTS = 4; // 1 initial + up to 3 retries (maxRetries default 3)

/** The fixed service keys so `buildNotificationEmail` resolves a real title. */
const serviceKeyArb = fc.constantFrom(
  "computer-learning",
  "computer-repair",
  "in-home-repair",
) as fc.Arbitrary<ServiceRequestInput["service"]>;

/** A validated, normalized input — the shape `submitServiceRequest` consumes. */
const inputArb: fc.Arbitrary<ServiceRequestInput> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  phone: fc.string({ minLength: 1, maxLength: 20 }),
  email: fc.option(fc.string({ minLength: 1, maxLength: 254 }), { nil: null }),
  service: serviceKeyArb,
  description: fc.string({ maxLength: 2000 }),
});

/**
 * A sequence of per-attempt outcomes: `true` means that attempt's `send` resolves,
 * `false` means it rejects. Up to 8 entries so sequences that are longer than the
 * attempt bound are exercised too (extra entries must never be consumed).
 */
const outcomesArb: fc.Arbitrary<boolean[]> = fc.array(fc.boolean(), {
  minLength: 0,
  maxLength: 8,
});

/**
 * A mock transport driven by a fixed outcome sequence. It records how many times it was
 * called and resolves/rejects per the next outcome. Once the sequence is exhausted it
 * rejects (modeling an unavailable provider), so the attempt bound is what stops it.
 */
function createMockTransport(outcomes: boolean[]): {
  transport: EmailTransport;
  callCount: () => number;
} {
  let calls = 0;
  const transport: EmailTransport = {
    async send(): Promise<void> {
      const outcome = outcomes[calls] ?? false;
      calls += 1;
      if (!outcome) {
        throw new Error("mock transport failure");
      }
    },
  };
  return { transport, callCount: () => calls };
}

/** Index of the first success within the attempt bound, or -1 if none. */
function firstSuccessWithinBound(outcomes: boolean[]): number {
  for (let i = 0; i < DEFAULT_MAX_ATTEMPTS; i += 1) {
    if (outcomes[i] === true) return i;
  }
  return -1;
}

/** Fixed id/clock seams so creation is deterministic under the property. */
const fixedDeps = {
  generateId: () => "req-fixed-id",
  now: () => new Date("2024-01-01T00:00:00.000Z"),
};

describe("notification retry — bounded, short-circuit, failure recording (Property 10)", () => {
  it("sendWithRetry is bounded, short-circuits, and sets delivered iff some attempt within the bound succeeds", async () => {
    // Feature: senior-services-website, Property 10: Notification retry is bounded,
    // short-circuits on success, and records total failure. Validates: Requirements 4.8
    await fc.assert(
      fc.asyncProperty(inputArb, outcomesArb, async (input, outcomes) => {
        const { transport, callCount } = createMockTransport(outcomes);
        const sender = createEmailSender(
          transport,
          { businessTo: "business@example.com" },
          { backoffMs: () => 0 },
        );

        const request: ServiceRequest = {
          ...input,
          id: "req-fixed-id",
          createdAt: "2024-01-01T00:00:00.000Z",
          notified: false,
        };

        const result = await sender.sendWithRetry(request);

        const firstSuccess = firstSuccessWithinBound(outcomes);
        const expectedDelivered = firstSuccess !== -1;

        // Bounded: never more than 4 attempts.
        expect(result.attempts).toBeLessThanOrEqual(DEFAULT_MAX_ATTEMPTS);
        expect(callCount()).toBeLessThanOrEqual(DEFAULT_MAX_ATTEMPTS);
        // The sender's reported attempts match the transport call count.
        expect(callCount()).toBe(result.attempts);

        // delivered iff some attempt within the bound succeeded.
        expect(result.delivered).toBe(expectedDelivered);

        if (expectedDelivered) {
          // Short-circuit: stop at the first success — exactly firstSuccess+1 attempts.
          expect(result.attempts).toBe(firstSuccess + 1);
        } else {
          // Total failure: exhausted the full attempt bound.
          expect(result.attempts).toBe(DEFAULT_MAX_ATTEMPTS);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("submitServiceRequest retains the request with notified=false and records exactly one failure on total failure, and notified=true otherwise", async () => {
    // Feature: senior-services-website, Property 10: Notification retry is bounded,
    // short-circuits on success, and records total failure. Validates: Requirements 4.8
    await fc.assert(
      fc.asyncProperty(inputArb, outcomesArb, async (input, outcomes) => {
        const { transport } = createMockTransport(outcomes);
        const emailSender = createEmailSender(
          transport,
          { businessTo: "business@example.com" },
          { backoffMs: () => 0 },
        );
        const failedNotificationStore = new InMemoryFailedNotificationStore();

        const { request, delivered } = await submitServiceRequest(input, {
          emailSender,
          failedNotificationStore,
          ...fixedDeps,
        });

        const expectedDelivered = firstSuccessWithinBound(outcomes) !== -1;

        expect(delivered).toBe(expectedDelivered);
        // The retained request's notified flag mirrors delivery.
        expect(request.notified).toBe(expectedDelivered);
        // The submission is never discarded.
        expect(request.id).toBe("req-fixed-id");

        if (expectedDelivered) {
          // No failure record on delivery.
          expect(failedNotificationStore.entries).toHaveLength(0);
        } else {
          // Exactly one failure record on total failure, for this request, with the
          // retained request carrying notified=false.
          expect(failedNotificationStore.entries).toHaveLength(1);
          const entry = failedNotificationStore.entries[0];
          expect(entry.requestId).toBe(request.id);
          expect(entry.request.notified).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});

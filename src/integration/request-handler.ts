/**
 * Service-request handler and failed-notification store (design §5, §7, §8).
 *
 * This module owns the side of Requirement 4.8 that lives above the retrying
 * {@link EmailSender}: it creates the durable {@link ServiceRequest} record, drives one
 * bounded notification attempt sequence, and — only when every attempt fails — retains
 * the request with `notified = false` and writes **exactly one** failure record to the
 * {@link FailedNotificationStore}.
 *
 * Everything here is kept testable by injection: the id generator, the clock, the
 * {@link EmailSender}, and the {@link FailedNotificationStore} are all supplied by the
 * caller, so the handler can be exercised deterministically without a real email
 * provider or persistent store (design "Testing Strategy", Property 10).
 */

import type { ServiceRequest, ServiceRequestInput } from "../domain/types.js";
import type { EmailSender } from "./email.js";

// ---------------------------------------------------------------------------
// FailedNotificationStore (design §8)
// ---------------------------------------------------------------------------

/**
 * One durable record that a notification could not be delivered to the business after
 * every send attempt failed. Written only on total failure so the business can
 * reconcile undelivered requests out of band (Requirement 4.8).
 */
export type FailedNotificationEntry = {
  /** Id of the retained {@link ServiceRequest} the notification was for. */
  requestId: string;
  /** The full created request, retained so no submission is lost. */
  request: ServiceRequest;
  /** Human-readable reason the notification was not delivered. */
  reason: string;
  /** ISO 8601 timestamp of when the failure was recorded. */
  at: string;
};

/**
 * Append-only durable store for failed notifications (design §8). Called only when
 * every send attempt fails; the created {@link ServiceRequest} is retained with a
 * `notified = false` indication (Requirement 4.8).
 */
export interface FailedNotificationStore {
  record(entry: FailedNotificationEntry): Promise<void>;
}

/**
 * In-memory {@link FailedNotificationStore} — the default implementation and the
 * seam used by tests. A production deployment swaps this for a managed object store or
 * a small database table (design §8), but the handler depends only on the interface so
 * the vendor can change without touching request handling.
 *
 * The accumulated entries are exposed read-only via {@link entries} so tests (and
 * operational tooling) can assert exactly what was recorded.
 */
export class InMemoryFailedNotificationStore implements FailedNotificationStore {
  private readonly records: FailedNotificationEntry[] = [];

  async record(entry: FailedNotificationEntry): Promise<void> {
    this.records.push(entry);
  }

  /** The recorded failures, in the order they were written. */
  get entries(): readonly FailedNotificationEntry[] {
    return this.records;
  }
}

// ---------------------------------------------------------------------------
// ServiceRequest creation (design §5)
// ---------------------------------------------------------------------------

/** Injectable seams so request creation is deterministic under test. */
export type CreateServiceRequestDeps = {
  /** Generates the unique request id. Defaults to {@link crypto.randomUUID}. */
  generateId?: () => string;
  /** Supplies "now". Defaults to the system clock. */
  now?: () => Date;
};

/** Default id generator: a RFC 4122 v4 UUID (available on the Node 20 runtime). */
function defaultGenerateId(): string {
  return crypto.randomUUID();
}

/**
 * Create a {@link ServiceRequest} from validated {@link ServiceRequestInput} (design §5,
 * "H->>H: Persist/assign ServiceRequest (id, timestamp)"). Assigns a unique `id` and an
 * ISO 8601 `createdAt`, and starts `notified = false` — delivery flips it to `true` only
 * once a notification is confirmed sent (see {@link submitServiceRequest}).
 *
 * Pure given its injected seams: with a fixed `generateId`/`now` the output is fully
 * determined by the input.
 *
 * @param input the validated, normalized form input
 * @param deps optional injectable id generator and clock
 * @returns the newly created request record
 */
export function createServiceRequest(
  input: ServiceRequestInput,
  deps: CreateServiceRequestDeps = {},
): ServiceRequest {
  const generateId = deps.generateId ?? defaultGenerateId;
  const now = deps.now ?? (() => new Date());

  return {
    ...input,
    id: generateId(),
    createdAt: now().toISOString(),
    notified: false,
  };
}

// ---------------------------------------------------------------------------
// Handler wiring for total failure (design §5, §7, §8)
// ---------------------------------------------------------------------------

/** Dependencies the handler needs to notify the business and record failures. */
export type SubmitServiceRequestDeps = CreateServiceRequestDeps & {
  /** Retrying email sender (design §7). */
  emailSender: EmailSender;
  /** Durable store written to on total notification failure (design §8). */
  failedNotificationStore: FailedNotificationStore;
};

/** Outcome of handling one submission: the retained request and whether it was delivered. */
export type SubmitServiceRequestResult = {
  /**
   * The created, retained {@link ServiceRequest}. `notified` is `true` iff the
   * notification was delivered within the retry bound.
   */
  request: ServiceRequest;
  /** `true` iff some send attempt within the bound succeeded. */
  delivered: boolean;
};

/**
 * Create a {@link ServiceRequest} and drive its business notification (design §5 flow).
 *
 * Steps, matching the sequence diagram and Requirement 4.8:
 * 1. Create and retain the request (id + createdAt assigned, `notified = false`).
 * 2. Attempt delivery via {@link EmailSender.sendWithRetry} (bounded retries, never throws).
 * 3. On delivery, set `notified = true` and record nothing.
 * 4. On total failure, keep the request with `notified = false` and write **exactly one**
 *    {@link FailedNotificationEntry} to the {@link FailedNotificationStore}.
 *
 * The request is never discarded on failure and the confirmation path does not depend on
 * delivery — delivery to the business is an internal concern reconciled from the failure
 * records (design "Notification errors").
 *
 * @param input the validated, normalized form input
 * @param deps the email sender, failed-notification store, and optional id/clock seams
 * @returns the retained request and its delivered flag
 */
export async function submitServiceRequest(
  input: ServiceRequestInput,
  deps: SubmitServiceRequestDeps,
): Promise<SubmitServiceRequestResult> {
  const request = createServiceRequest(input, deps);

  const { delivered } = await deps.emailSender.sendWithRetry(request);

  if (delivered) {
    request.notified = true;
    return { request, delivered: true };
  }

  // Total failure: retain the request (notified stays false) and record exactly one
  // failure entry so the business can follow up (Requirement 4.8).
  const now = deps.now ?? (() => new Date());
  await deps.failedNotificationStore.record({
    requestId: request.id,
    request,
    reason: "Email notification failed after all retry attempts",
    at: now().toISOString(),
  });

  return { request, delivered: false };
}

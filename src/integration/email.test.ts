import { describe, it, expect, vi } from "vitest";
import {
  buildNotificationEmail,
  createEmailSender,
  type EmailTransport,
} from "./email.js";
import type { NotificationEmail, ServiceRequest } from "../domain/types.js";
import { SERVICES } from "../content/services.js";

/**
 * Unit tests for task 4.1: the pure NotificationEmail builder and the retrying
 * EmailSender over the EmailTransport interface (design §7, Requirements 4.7, 4.8).
 *
 * The property-based coverage of the retry bounds / short-circuit / failure recording
 * lives in task 4.3 (Property 10); these are example-based checks of the concrete
 * message shape and the attempt/short-circuit/never-throw behavior.
 */

/** A representative created ServiceRequest used across the message-shape tests. */
const sampleRequest: ServiceRequest = {
  id: "req-123",
  createdAt: "2024-01-02T03:04:05.000Z",
  name: "Jane Doe",
  phone: "+1 (555) 123-4567",
  email: "jane@example.com",
  service: "computer-repair",
  description: "My laptop will not turn on.",
  notified: false,
};

const BUSINESS_TO = "business@example.com";

/**
 * The human-friendly service title the builder uses for the request's service, read
 * from the content source of truth so this stays correct across localization (the
 * titles are French). The builder derives subject/body from this exact string.
 */
const SAMPLE_SERVICE_TITLE = SERVICES[sampleRequest.service].title;

describe("buildNotificationEmail", () => {
  it("addresses the business and names the service in the subject", () => {
    const email = buildNotificationEmail(sampleRequest, BUSINESS_TO);
    expect(email.to).toBe(BUSINESS_TO);
    expect(email.subject).toBe(`New service request: ${SAMPLE_SERVICE_TITLE}`);
  });

  it("includes every request detail in the body", () => {
    const email = buildNotificationEmail(sampleRequest, BUSINESS_TO);
    expect(email.body).toContain(sampleRequest.id);
    expect(email.body).toContain(sampleRequest.createdAt);
    expect(email.body).toContain(SAMPLE_SERVICE_TITLE);
    expect(email.body).toContain(sampleRequest.name);
    expect(email.body).toContain(sampleRequest.phone);
    expect(email.body).toContain("jane@example.com");
    expect(email.body).toContain(sampleRequest.description);
  });

  it("renders a placeholder when email and description are absent", () => {
    const email = buildNotificationEmail(
      { ...sampleRequest, email: null, description: "" },
      BUSINESS_TO,
    );
    expect(email.body).toContain("(not provided)");
    expect(email.body).toContain("(none)");
  });
});

/** Transport whose send() resolves/rejects per a scripted outcome sequence. */
function scriptedTransport(
  outcomes: boolean[],
): { transport: EmailTransport; sent: NotificationEmail[]; calls: () => number } {
  const sent: NotificationEmail[] = [];
  let index = 0;
  const transport: EmailTransport = {
    async send(message: NotificationEmail): Promise<void> {
      sent.push(message);
      const ok = outcomes[index] ?? false;
      index += 1;
      if (!ok) throw new Error("transport failure");
    },
  };
  return { transport, sent, calls: () => index };
}

describe("createEmailSender.sendWithRetry", () => {
  const fastOpts = { backoffMs: () => 0 };

  it("delivers on the first attempt and skips the rest", async () => {
    const { transport, calls } = scriptedTransport([true, true, true, true]);
    const sender = createEmailSender(transport, { businessTo: BUSINESS_TO }, fastOpts);

    const result = await sender.sendWithRetry(sampleRequest);

    expect(result).toEqual({ delivered: true, attempts: 1 });
    expect(calls()).toBe(1);
  });

  it("retries after failures and short-circuits on the first success", async () => {
    const { transport, calls } = scriptedTransport([false, false, true, false]);
    const sender = createEmailSender(transport, { businessTo: BUSINESS_TO }, fastOpts);

    const result = await sender.sendWithRetry(sampleRequest);

    expect(result).toEqual({ delivered: true, attempts: 3 });
    expect(calls()).toBe(3);
  });

  it("makes at most 4 attempts and never throws on total failure", async () => {
    const { transport, calls } = scriptedTransport([false, false, false, false, false]);
    const sender = createEmailSender(transport, { businessTo: BUSINESS_TO }, fastOpts);

    const result = await sender.sendWithRetry(sampleRequest);

    expect(result).toEqual({ delivered: false, attempts: 4 });
    expect(calls()).toBe(4);
  });

  it("honors a custom maxRetries bound", async () => {
    const { transport, calls } = scriptedTransport([false, false, false]);
    const sender = createEmailSender(transport, { businessTo: BUSINESS_TO }, fastOpts);

    const result = await sender.sendWithRetry(sampleRequest, { maxRetries: 1 });

    expect(result).toEqual({ delivered: false, attempts: 2 });
    expect(calls()).toBe(2);
  });

  it("sends the built notification message to the transport", async () => {
    const { transport, sent } = scriptedTransport([true]);
    const sender = createEmailSender(transport, { businessTo: BUSINESS_TO }, fastOpts);

    await sender.sendWithRetry(sampleRequest);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(buildNotificationEmail(sampleRequest, BUSINESS_TO));
  });

  it("waits the backoff schedule between retries", async () => {
    const { transport } = scriptedTransport([false, false, true]);
    const sleep = vi.fn(async (_ms: number) => {});
    const backoffMs = vi.fn((retryIndex: number) => 10 * (retryIndex + 1));
    const sender = createEmailSender(
      transport,
      { businessTo: BUSINESS_TO },
      { backoffMs, sleep },
    );

    await sender.sendWithRetry(sampleRequest);

    // Two retries → two backoff/sleep calls, with retryIndex 0 then 1.
    expect(backoffMs.mock.calls).toEqual([[0], [1]]);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });
});

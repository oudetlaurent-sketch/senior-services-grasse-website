import { describe, it, expect, vi } from "vitest";
import {
  createServiceRequest,
  submitServiceRequest,
  InMemoryFailedNotificationStore,
  type SubmitServiceRequestDeps,
} from "./request-handler.js";
import type { EmailSender, SendResult } from "./email.js";
import type { ServiceRequest, ServiceRequestInput } from "../domain/types.js";

/**
 * Unit tests for task 4.2: `createServiceRequest`, the in-memory
 * `FailedNotificationStore`, and the handler wiring that retains a request and records
 * exactly one failure on total notification failure (design §5, §7, §8; Requirement 4.8).
 *
 * The universally-quantified coverage of attempt bounds, short-circuit, and
 * failure-recording lives in task 4.3 (Property 10); these are example-based checks of
 * the id/timestamp assignment, the notified flag transitions, and the exactly-one-record
 * guarantee.
 */

const validInput: ServiceRequestInput = {
  name: "Jane Doe",
  phone: "+1 (555) 123-4567",
  email: "jane@example.com",
  service: "computer-repair",
  description: "My laptop will not turn on.",
};

/** An EmailSender whose sendWithRetry resolves to a fixed outcome and counts calls. */
function fixedSender(delivered: boolean, attempts = delivered ? 1 : 4): {
  sender: EmailSender;
  calls: () => number;
} {
  let n = 0;
  const sender: EmailSender = {
    async sendWithRetry(): Promise<SendResult> {
      n += 1;
      return { delivered, attempts };
    },
  };
  return { sender, calls: () => n };
}

describe("createServiceRequest", () => {
  it("assigns id and createdAt and starts notified=false", () => {
    const request = createServiceRequest(validInput, {
      generateId: () => "req-xyz",
      now: () => new Date("2024-01-02T03:04:05.000Z"),
    });

    expect(request.id).toBe("req-xyz");
    expect(request.createdAt).toBe("2024-01-02T03:04:05.000Z");
    expect(request.notified).toBe(false);
  });

  it("carries every validated input field onto the request unchanged", () => {
    const request = createServiceRequest(validInput, { generateId: () => "id" });

    expect(request.name).toBe(validInput.name);
    expect(request.phone).toBe(validInput.phone);
    expect(request.email).toBe(validInput.email);
    expect(request.service).toBe(validInput.service);
    expect(request.description).toBe(validInput.description);
  });

  it("produces a unique id for each request by default", () => {
    const a = createServiceRequest(validInput);
    const b = createServiceRequest(validInput);
    expect(a.id).not.toBe(b.id);
    expect(a.id.length).toBeGreaterThan(0);
  });
});

describe("InMemoryFailedNotificationStore", () => {
  it("retains recorded entries in write order", async () => {
    const store = new InMemoryFailedNotificationStore();
    const request = createServiceRequest(validInput, { generateId: () => "r1" });

    await store.record({
      requestId: request.id,
      request,
      reason: "failed",
      at: "2024-01-02T03:04:05.000Z",
    });

    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].requestId).toBe("r1");
  });

  it("starts empty", () => {
    expect(new InMemoryFailedNotificationStore().entries).toHaveLength(0);
  });
});

describe("submitServiceRequest", () => {
  function deps(
    sender: EmailSender,
    store = new InMemoryFailedNotificationStore(),
  ): SubmitServiceRequestDeps {
    return {
      emailSender: sender,
      failedNotificationStore: store,
      generateId: () => "req-fixed",
      now: () => new Date("2024-01-02T03:04:05.000Z"),
    };
  }

  it("sets notified=true and records no failure on delivery", async () => {
    const store = new InMemoryFailedNotificationStore();
    const { sender } = fixedSender(true);

    const result = await submitServiceRequest(validInput, deps(sender, store));

    expect(result.delivered).toBe(true);
    expect(result.request.notified).toBe(true);
    expect(result.request.id).toBe("req-fixed");
    expect(store.entries).toHaveLength(0);
  });

  it("retains the request with notified=false and writes exactly one record on total failure", async () => {
    const store = new InMemoryFailedNotificationStore();
    const { sender } = fixedSender(false);

    const result = await submitServiceRequest(validInput, deps(sender, store));

    expect(result.delivered).toBe(false);
    expect(result.request.notified).toBe(false);
    // Request is retained, not discarded.
    expect(result.request.id).toBe("req-fixed");
    expect(result.request.name).toBe(validInput.name);
    // Exactly one failure record, referencing the retained request.
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].requestId).toBe("req-fixed");
    expect(store.entries[0].request).toBe(result.request);
    expect(store.entries[0].request.notified).toBe(false);
    expect(store.entries[0].at).toBe("2024-01-02T03:04:05.000Z");
    expect(store.entries[0].reason.length).toBeGreaterThan(0);
  });

  it("invokes the email sender exactly once per submission", async () => {
    const { sender, calls } = fixedSender(true);
    await submitServiceRequest(validInput, deps(sender));
    expect(calls()).toBe(1);
  });

  it("passes the created request to the sender", async () => {
    const seen: ServiceRequest[] = [];
    const sender: EmailSender = {
      async sendWithRetry(request): Promise<SendResult> {
        seen.push(request);
        return { delivered: true, attempts: 1 };
      },
    };

    const result = await submitServiceRequest(validInput, deps(sender));

    expect(seen).toHaveLength(1);
    expect(seen[0].id).toBe(result.request.id);
  });

  it("does not swallow a store write (awaits record on failure)", async () => {
    const { sender } = fixedSender(false);
    const record = vi.fn(async () => {});
    const store = { record };

    await submitServiceRequest(validInput, {
      emailSender: sender,
      failedNotificationStore: store,
      generateId: () => "req-fixed",
    });

    expect(record).toHaveBeenCalledTimes(1);
  });
});

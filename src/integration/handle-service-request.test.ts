import { describe, it, expect, vi } from "vitest";
import {
  handleServiceRequest,
  CONFIRMATION_MESSAGE,
  type HandleServiceRequestDeps,
} from "./handle-service-request.js";
import {
  InMemoryFailedNotificationStore,
} from "./request-handler.js";
import type { EmailSender, SendResult } from "./email.js";
import type { RawFormInput } from "../domain/types.js";

/**
 * Unit tests for task 11.1: the pure, injectable `handleServiceRequest` (design §5).
 *
 * These are example-based checks of the four endpoint behaviors the task calls out:
 *   - 422 on invalid input, carrying every FieldError and the echoed submitted values;
 *   - 200 + Confirmation_Message on valid input, with the generated requestId;
 *   - the `delivered` flag reflecting the email sender's outcome;
 *   - the 500 path: an unhandled exception from the dependencies propagates (the Astro
 *     route maps it to a generic accessible 500 — see src/pages/api/service-request.ts).
 *
 * The universally-quantified acceptance of valid submissions (Property 7) lives in task
 * 11.2; these are the concrete scenarios and the error path.
 */

const validInput: RawFormInput = {
  name: "Jane Doe",
  phone: "+1 (555) 123-4567",
  email: "jane@example.com",
  service: "computer-repair",
  description: "My laptop will not turn on.",
};

/** An EmailSender whose sendWithRetry resolves to a fixed outcome. */
function fixedSender(delivered: boolean): EmailSender {
  return {
    async sendWithRetry(): Promise<SendResult> {
      return { delivered, attempts: delivered ? 1 : 4 };
    },
  };
}

/** Build deps with a fixed id/clock and the given sender/store. */
function deps(
  sender: EmailSender,
  store = new InMemoryFailedNotificationStore(),
): HandleServiceRequestDeps {
  return {
    emailSender: sender,
    failedNotificationStore: store,
    generateId: () => "req-fixed",
    now: () => new Date("2024-01-02T03:04:05.000Z"),
  };
}

describe("handleServiceRequest — 422 on invalid input", () => {
  it("returns 422 with field errors and the echoed values retained", async () => {
    const invalid: RawFormInput = {
      name: "",
      phone: "",
      email: "not-an-email",
      service: "",
      description: "please help",
    };

    const result = await handleServiceRequest(invalid, deps(fixedSender(true)));

    expect(result.status).toBe(422);
    if (result.status !== 422) throw new Error("expected 422");

    // Every empty required field is named, plus the malformed email.
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain("name");
    expect(fields).toContain("phone");
    expect(fields).toContain("service");
    expect(fields).toContain("email");

    // Echoed values equal the submitted input field-for-field (Requirement 4.4).
    expect(result.echoed).toEqual(invalid);
  });

  it("does not attempt to create or notify when validation fails", async () => {
    const invalid: RawFormInput = {
      name: "",
      phone: "555",
      email: "",
      service: "computer-repair",
      description: "",
    };
    const sendWithRetry = vi.fn(async (): Promise<SendResult> => ({
      delivered: true,
      attempts: 1,
    }));
    const store = new InMemoryFailedNotificationStore();

    const result = await handleServiceRequest(invalid, {
      emailSender: { sendWithRetry },
      failedNotificationStore: store,
    });

    expect(result.status).toBe(422);
    expect(sendWithRetry).not.toHaveBeenCalled();
    expect(store.entries).toHaveLength(0);
  });
});

describe("handleServiceRequest — 200 on valid input", () => {
  it("returns 200 with the Confirmation_Message and the generated requestId", async () => {
    const result = await handleServiceRequest(validInput, deps(fixedSender(true)));

    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("expected 200");
    expect(result.confirmation).toBe(CONFIRMATION_MESSAGE);
    expect(result.confirmation.length).toBeGreaterThan(0);
    expect(result.requestId).toBe("req-fixed");
  });

  it("reports delivered=true when a send attempt succeeds and records no failure", async () => {
    const store = new InMemoryFailedNotificationStore();
    const result = await handleServiceRequest(
      validInput,
      deps(fixedSender(true), store),
    );

    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("expected 200");
    expect(result.delivered).toBe(true);
    expect(store.entries).toHaveLength(0);
  });

  it("reports delivered=false and still confirms when every send attempt fails", async () => {
    const store = new InMemoryFailedNotificationStore();
    const result = await handleServiceRequest(
      validInput,
      deps(fixedSender(false), store),
    );

    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("expected 200");
    // The visitor is still confirmed (Requirement 4.3) even though delivery failed...
    expect(result.confirmation).toBe(CONFIRMATION_MESSAGE);
    expect(result.delivered).toBe(false);
    // ...and the request is retained with exactly one failure record (Requirement 4.8).
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].requestId).toBe("req-fixed");
  });
});

describe("handleServiceRequest — 500 path (unhandled exception propagates)", () => {
  it("propagates an exception thrown by the email sender for the transport to map to 500", async () => {
    const throwingSender: EmailSender = {
      async sendWithRetry(): Promise<SendResult> {
        throw new Error("transport exploded");
      },
    };

    await expect(
      handleServiceRequest(validInput, deps(throwingSender)),
    ).rejects.toThrow();
  });

  it("propagates an exception thrown by the failed-notification store", async () => {
    const store = {
      record: vi.fn(async () => {
        throw new Error("store exploded");
      }),
    };

    await expect(
      handleServiceRequest(validInput, {
        emailSender: fixedSender(false),
        failedNotificationStore: store,
        generateId: () => "req-fixed",
      }),
    ).rejects.toThrow();
  });
});

/**
 * Email integration boundary.
 *
 * The request-handling logic depends only on the {@link EmailSender} and
 * {@link EmailTransport} abstractions, never on a concrete vendor. The transactional
 * email provider (Amazon SES / SendGrid / Postmark / any SMTP relay) is reached through
 * Nodemailer, which is kept behind these interfaces so the vendor can be swapped without
 * touching the handler.
 *
 * This module (task 1.1) establishes the abstraction and the env-driven config shape.
 * `EmailSender.sendWithRetry` itself is implemented in task 4.1.
 */

import type {
  NotificationEmail,
  ServiceRequest,
} from "../domain/types.js";
import { SERVICES } from "../content/services.js";
import { BUSINESS_INFO } from "../content/business.js";

/**
 * Low-level transport. A single attempt to deliver one message. Throws on failure so
 * the retrying {@link EmailSender} can observe and count failures.
 */
export interface EmailTransport {
  send(message: NotificationEmail): Promise<void>;
}

/** Outcome of a bounded delivery attempt sequence. */
export type SendResult = {
  delivered: boolean;
  attempts: number;
};

/**
 * High-level sender. Attempts delivery with bounded retries. Resolves to
 * `delivered: true` if any attempt succeeds, `delivered: false` after exhausting all
 * attempts. Never throws for a delivery failure.
 */
export interface EmailSender {
  sendWithRetry(
    request: ServiceRequest,
    opts?: { maxRetries?: number },
  ): Promise<SendResult>;
}

/**
 * Configuration shape for the transactional email provider / SMTP, sourced from
 * environment variables. Provider-agnostic: `host`/`port`/`user`/`pass` describe any
 * SMTP relay; `from` and `businessTo` are the website's own addresses.
 */
export type EmailConfig = {
  /** SMTP host, e.g. "email-smtp.eu-west-1.amazonaws.com". */
  host: string;
  /** SMTP port, typically 465 (secure) or 587 (STARTTLS). */
  port: number;
  /** Whether to use an implicit TLS connection (true for port 465). */
  secure: boolean;
  /** SMTP username / provider access key id. */
  user: string;
  /** SMTP password / provider secret. */
  pass: string;
  /** Envelope "from" address shown to the business. */
  from: string;
  /** Business inbox that receives service-request notifications (Requirement 4.7).
   *  Defaults to BUSINESS_INFO.email (oudet.laurent@gmail.com) when BUSINESS_EMAIL is unset. */
  businessTo: string;
};

/** The environment variables that back {@link EmailConfig}. */
export const EMAIL_ENV_KEYS = {
  host: "SMTP_HOST",
  port: "SMTP_PORT",
  secure: "SMTP_SECURE",
  user: "SMTP_USER",
  pass: "SMTP_PASS",
  from: "EMAIL_FROM",
  businessTo: "BUSINESS_EMAIL",
} as const;

/**
 * Read {@link EmailConfig} from the given environment (defaults to `process.env`).
 * Throws a descriptive error listing every missing required variable so a
 * misconfigured deployment fails fast rather than silently dropping notifications.
 */
export function loadEmailConfig(
  env: Record<string, string | undefined> = process.env,
): EmailConfig {
  const missing: string[] = [];
  const required = (key: string): string => {
    const value = env[key];
    if (value === undefined || value.trim() === "") {
      missing.push(key);
      return "";
    }
    return value;
  };

  const host = required(EMAIL_ENV_KEYS.host);
  const portRaw = required(EMAIL_ENV_KEYS.port);
  const user = required(EMAIL_ENV_KEYS.user);
  const pass = required(EMAIL_ENV_KEYS.pass);
  const from = required(EMAIL_ENV_KEYS.from);
  // The notification recipient defaults to the business inbox (BUSINESS_INFO.email,
  // oudet.laurent@gmail.com) so submissions reach the owner even if BUSINESS_EMAIL is
  // unset; an explicit BUSINESS_EMAIL env var still overrides it.
  const businessToEnv = env[EMAIL_ENV_KEYS.businessTo];
  const businessTo =
    businessToEnv !== undefined && businessToEnv.trim() !== ""
      ? businessToEnv
      : BUSINESS_INFO.email;

  if (missing.length > 0) {
    throw new Error(
      `Missing required email configuration environment variable(s): ${missing.join(", ")}`,
    );
  }

  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(
      `${EMAIL_ENV_KEYS.port} must be a positive integer, received "${portRaw}"`,
    );
  }

  const secureRaw = env[EMAIL_ENV_KEYS.secure];
  const secure =
    secureRaw === undefined ? port === 465 : secureRaw.toLowerCase() === "true";

  return { host, port, secure, user, pass, from, businessTo };
}

/**
 * Build an {@link EmailTransport} backed by Nodemailer from the given config.
 *
 * Nodemailer is imported lazily so the pure domain layer and its property tests never
 * pull the SMTP client into their bundle. The concrete `send` wrapper adapts a
 * {@link NotificationEmail} to a Nodemailer message and resolves/rejects on the
 * provider's outcome, which is exactly the contract the retrying {@link EmailSender}
 * expects.
 */
export function createNodemailerTransport(config: EmailConfig): EmailTransport {
  return {
    async send(message: NotificationEmail): Promise<void> {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
      });
      await transporter.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
    },
  };
}
// ---------------------------------------------------------------------------
// NotificationEmail construction (pure)
// ---------------------------------------------------------------------------

/**
 * Build the business-notification email for a created {@link ServiceRequest} (design §7,
 * "NotificationEmail"). Pure and side-effect-free: given a request and the business
 * address it returns a {@link NotificationEmail} with `to` set to the business address,
 * a subject naming the requested service, and a body carrying every request detail
 * (name, phone, email, service, description, id, createdAt). Keeping it pure lets the
 * retrying sender and the property tests exercise the message shape without a transport.
 *
 * @param request the created service request to describe
 * @param businessTo the business inbox that should receive the notification (Requirement 4.7)
 * @returns the fully-populated notification message
 */
export function buildNotificationEmail(
  request: ServiceRequest,
  businessTo: string,
): NotificationEmail {
  // Prefer the human-friendly service title; fall back to the raw key if the content
  // map has no entry (defensive — the type system already constrains `service`).
  const serviceTitle = SERVICES[request.service]?.title ?? request.service;

  const body = [
    "New service request received.",
    "",
    `Request ID: ${request.id}`,
    `Created at: ${request.createdAt}`,
    `Service:    ${serviceTitle}`,
    "",
    `Name:  ${request.name}`,
    `Phone: ${request.phone}`,
    `Email: ${request.email ?? "(not provided)"}`,
    "",
    "Description:",
    request.description.length > 0 ? request.description : "(none)",
  ].join("\n");

  return {
    to: businessTo,
    subject: `New service request: ${serviceTitle}`,
    body,
  };
}

// ---------------------------------------------------------------------------
// EmailSender with bounded retry (design §7)
// ---------------------------------------------------------------------------

/** Default number of retries after the initial attempt (Requirement 4.8). */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Default backoff before retry number `retryIndex` (0-based). Short and bounded so the
 * whole notification path fits inside the 30-second budget (Requirement 4.7): with 3
 * retries the delays sum to 50 + 100 + 200 = 350ms, well under budget. The schedule is
 * injectable (see {@link createEmailSender}) so tests can drive it to zero and run fast.
 */
function defaultBackoffMs(retryIndex: number): number {
  return 50 * 2 ** retryIndex;
}

/** Options for {@link createEmailSender}. */
export type EmailSenderOptions = {
  /**
   * Backoff in milliseconds to wait before the retry at `retryIndex` (0-based). Return
   * a non-positive value to skip waiting entirely. Defaults to a short bounded schedule
   * that fits the 30-second notification budget; tests can inject `() => 0`.
   */
  backoffMs?: (retryIndex: number) => number;
  /** Sleep primitive, injectable for deterministic fast tests. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
};

/** Default sleep: resolve after `ms` milliseconds (skips the timer for ms <= 0). */
function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a concrete {@link EmailSender} over an {@link EmailTransport} (design §7).
 *
 * `sendWithRetry` builds the {@link NotificationEmail} from the request and the
 * configured business address, then attempts delivery with bounded retries:
 *
 * - At most `1 + maxRetries` attempts (`maxRetries` defaults to 3 → 4 attempts total).
 * - Stops at the first successful attempt (remaining attempts are skipped).
 * - Resolves `{ delivered, attempts }`; `delivered` is `true` iff some attempt within
 *   the bound succeeded. It never throws for a delivery failure — a transport that
 *   rejects on every attempt yields `delivered: false`.
 * - Short bounded backoff between attempts keeps the path inside the 30-second budget
 *   (Requirement 4.7); the schedule and sleep are injectable for fast tests.
 *
 * @param transport the low-level, single-attempt transport
 * @param config supplies the business address the notification is sent to
 * @param options optional injectable backoff/sleep for testing
 */
export function createEmailSender(
  transport: EmailTransport,
  config: Pick<EmailConfig, "businessTo">,
  options: EmailSenderOptions = {},
): EmailSender {
  const backoffMs = options.backoffMs ?? defaultBackoffMs;
  const sleep = options.sleep ?? defaultSleep;

  return {
    async sendWithRetry(
      request: ServiceRequest,
      opts?: { maxRetries?: number },
    ): Promise<SendResult> {
      const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
      // Guard against a negative override: at least the single initial attempt runs.
      const retries = Math.max(0, maxRetries);
      const message = buildNotificationEmail(request, config.businessTo);

      let attempts = 0;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (attempt > 0) {
          // Wait before each retry (attempt 1 is the first retry → retryIndex 0).
          await sleep(backoffMs(attempt - 1));
        }
        attempts += 1;
        try {
          await transport.send(message);
          return { delivered: true, attempts };
        } catch {
          // Swallow and retry; a total failure resolves delivered:false below.
        }
      }

      return { delivered: false, attempts };
    },
  };
}

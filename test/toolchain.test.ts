import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type {
  ErrorCode,
  FieldError,
  FieldName,
  NavItem,
  NotificationEmail,
  PageKey,
  RawFormInput,
  Service,
  ServiceKey,
  ServiceRequest,
  ServiceRequestInput,
  ValidationResult,
} from "../src/domain/types.js";
import {
  EMAIL_ENV_KEYS,
  loadEmailConfig,
} from "../src/integration/email.js";
import { BUSINESS_INFO } from "../src/content/business.js";

// Toolchain smoke tests (task 1.1): confirm Vitest runs, fast-check is wired in as the
// property-based testing dependency, the shared domain types are usable, and the email
// config shape loads from env. Real behavior is tested by later property/unit tasks.

describe("toolchain", () => {
  it("runs Vitest and fast-check together", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 },
    );
    expect(true).toBe(true);
  });
});

describe("shared domain types", () => {
  it("construct values that satisfy each exported type", () => {
    const pageKey: PageKey = "service-request";
    const serviceKey: ServiceKey = "computer-repair";

    const nav: NavItem = {
      key: pageKey,
      title: "Service Request",
      href: "/service-request",
    };

    const service: Service = {
      key: serviceKey,
      title: "Computer Repair",
      description: "We fix computers.",
      includes: ["diagnosis"],
    };

    const raw: RawFormInput = {
      name: "Pat",
      phone: "+1 (555) 123-4567",
      email: "pat@example.com",
      service: serviceKey,
      description: "",
    };

    const input: ServiceRequestInput = {
      name: raw.name,
      phone: raw.phone,
      email: raw.email,
      service: serviceKey,
      description: raw.description,
    };

    const request: ServiceRequest = {
      ...input,
      id: "req_1",
      createdAt: new Date(0).toISOString(),
      notified: false,
    };

    const email: NotificationEmail = {
      to: "requests@example.com",
      subject: "New service request: Computer Repair",
      body: "details",
    };

    const field: FieldName = "email";
    const code: ErrorCode = "invalid_email";
    const fieldError: FieldError = {
      field,
      code,
      message: "Email is not valid.",
    };

    const okResult: ValidationResult = { ok: true, value: input };
    const errResult: ValidationResult = { ok: false, errors: [fieldError] };

    expect(nav.key).toBe(pageKey);
    expect(service.includes).toHaveLength(1);
    expect(request.notified).toBe(false);
    expect(email.to).toContain("@");
    expect(okResult.ok).toBe(true);
    expect(errResult.ok).toBe(false);
  });
});

describe("email config shape", () => {
  it("loads a complete EmailConfig from environment variables", () => {
    const env: Record<string, string> = {
      [EMAIL_ENV_KEYS.host]: "smtp.example.com",
      [EMAIL_ENV_KEYS.port]: "465",
      [EMAIL_ENV_KEYS.user]: "user",
      [EMAIL_ENV_KEYS.pass]: "secret",
      [EMAIL_ENV_KEYS.from]: "no-reply@example.com",
      [EMAIL_ENV_KEYS.businessTo]: "requests@example.com",
    };
    const config = loadEmailConfig(env);
    expect(config.host).toBe("smtp.example.com");
    expect(config.port).toBe(465);
    expect(config.secure).toBe(true);
    expect(config.businessTo).toBe("requests@example.com");
  });

  it("throws listing every missing required SMTP variable", () => {
    // SMTP connection vars remain required; BUSINESS_EMAIL is NOT (it defaults).
    expect(() => loadEmailConfig({})).toThrowError(/SMTP_HOST/);
    expect(() => loadEmailConfig({})).not.toThrowError(/BUSINESS_EMAIL/);
  });

  it("defaults the recipient to the business inbox when BUSINESS_EMAIL is unset", () => {
    // All SMTP vars present, but no BUSINESS_EMAIL: businessTo falls back to
    // BUSINESS_INFO.email (oudet.laurent@gmail.com) so submissions reach the owner.
    const env: Record<string, string> = {
      [EMAIL_ENV_KEYS.host]: "smtp.example.com",
      [EMAIL_ENV_KEYS.port]: "587",
      [EMAIL_ENV_KEYS.user]: "user",
      [EMAIL_ENV_KEYS.pass]: "secret",
      [EMAIL_ENV_KEYS.from]: "no-reply@example.com",
    };
    const config = loadEmailConfig(env);
    expect(config.businessTo).toBe(BUSINESS_INFO.email);
    expect(config.businessTo).toBe("oudet.laurent@gmail.com");
  });

  it("lets an explicit BUSINESS_EMAIL override the default recipient", () => {
    const env: Record<string, string> = {
      [EMAIL_ENV_KEYS.host]: "smtp.example.com",
      [EMAIL_ENV_KEYS.port]: "587",
      [EMAIL_ENV_KEYS.user]: "user",
      [EMAIL_ENV_KEYS.pass]: "secret",
      [EMAIL_ENV_KEYS.from]: "no-reply@example.com",
      [EMAIL_ENV_KEYS.businessTo]: "requests@example.com",
    };
    expect(loadEmailConfig(env).businessTo).toBe("requests@example.com");
  });
});

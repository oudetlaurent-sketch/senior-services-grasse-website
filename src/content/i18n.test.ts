import { describe, it, expect } from "vitest";
import { MESSAGES, getMessages } from "./i18n.js";
import type {
  ErrorCode,
  Language,
  Messages,
  PageKey,
  ServiceKey,
} from "../domain/types.js";

// Localized content model (design "Data Models", "Localized content model").
//
// Validates: the typed per-language dictionary that becomes the single source of truth
// for every visitor-facing string (Requirements 7.1, 7.6). These tests assert both
// Supported_Languages are present and complete, that nothing is left blank, that the
// three services carry stable keys per language, that the About bio is provisional, and
// that the email label is the WORD "Email" in both languages (Requirement 10.3).

const LANGUAGES: readonly Language[] = ["fr", "en"];

const ALL_PAGE_KEYS: readonly PageKey[] = [
  "home",
  "computer-learning",
  "computer-repair",
  "in-home-repair",
  "about",
  "scheduling",
  "service-request",
];

const SERVICE_KEYS: readonly ServiceKey[] = [
  "computer-learning",
  "computer-repair",
  "in-home-repair",
];

const ERROR_CODES: readonly ErrorCode[] = [
  "required",
  "too_long",
  "too_short",
  "invalid_email",
  "invalid_phone",
  "unknown_service",
];

/** Recursively assert every leaf string in a Messages value is non-empty (trimmed). */
function expectNoBlankStrings(value: unknown, path: string): void {
  if (typeof value === "string") {
    expect(value.trim().length, `blank string at ${path}`).toBeGreaterThan(0);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => expectNoBlankStrings(item, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      // `provisional` is a boolean flag, not display copy — skip it here.
      if (key === "provisional") continue;
      expectNoBlankStrings(child, `${path}.${key}`);
    }
  }
}

describe("localized content model (MESSAGES / getMessages)", () => {
  it("provides exactly one Messages entry per Supported_Language", () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...LANGUAGES].sort());
    for (const lang of LANGUAGES) {
      expect(getMessages(lang)).toBe(MESSAGES[lang]);
    }
  });

  it("has both languages present for every key and no blank strings", () => {
    for (const lang of LANGUAGES) {
      const m = getMessages(lang);
      expectNoBlankStrings(m, `MESSAGES.${lang}`);
    }
  });

  it("carries a nav/page title for all seven page keys in both languages", () => {
    for (const lang of LANGUAGES) {
      const nav = getMessages(lang).nav;
      expect(Object.keys(nav).sort()).toEqual([...ALL_PAGE_KEYS].sort());
      for (const key of ALL_PAGE_KEYS) {
        expect(nav[key].trim().length, `${lang}.nav.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("has three service entries per language with stable keys and valid shape", () => {
    for (const lang of LANGUAGES) {
      const services = getMessages(lang).services;
      expect(Object.keys(services).sort()).toEqual([...SERVICE_KEYS].sort());
      for (const key of SERVICE_KEYS) {
        const content = services[key];
        expect(content.title.trim().length, `${lang}.${key}.title`).toBeGreaterThan(0);
        expect(
          content.description.trim().length,
          `${lang}.${key}.description`,
        ).toBeGreaterThan(0);
        expect(
          content.includes.length,
          `${lang}.${key}.includes`,
        ).toBeGreaterThanOrEqual(1);
        content.includes.forEach((item, i) =>
          expect(item.trim().length, `${lang}.${key}.includes[${i}]`).toBeGreaterThan(0),
        );
      }
    }
  });

  it("supplies a message for every error code in both languages", () => {
    for (const lang of LANGUAGES) {
      const errors = getMessages(lang).errors;
      expect(Object.keys(errors).sort()).toEqual([...ERROR_CODES].sort());
      for (const code of ERROR_CODES) {
        expect(errors[code].trim().length, `${lang}.errors.${code}`).toBeGreaterThan(0);
      }
    }
  });

  it("marks the About bio as provisional in both languages", () => {
    for (const lang of LANGUAGES) {
      const about = getMessages(lang).about;
      expect(about.name).toBe("Laurent Oudet");
      expect(about.bio.trim().length).toBeGreaterThan(0);
      expect(about.provisional, `${lang}.about.provisional`).toBe(true);
    }
  });

  it("labels email with the WORD \"Email\" in both languages (never Courriel)", () => {
    for (const lang of LANGUAGES) {
      const m: Messages = getMessages(lang);
      expect(m.emailLabel).toBe("Email");
      expect(m.footer.emailLabel).toBe("Email");
      expect(m.footer.emailLabel).not.toMatch(/courriel/i);
    }
  });

  it("provides a How_It_Works section with >=3 ordered steps in both languages", () => {
    // Validates: Requirements 13.1, 13.2
    for (const lang of LANGUAGES) {
      const howItWorks = getMessages(lang).howItWorks;
      expect(howItWorks.heading.trim().length, `${lang}.howItWorks.heading`).toBeGreaterThan(0);
      expect(
        howItWorks.steps.length,
        `${lang}.howItWorks.steps.length`,
      ).toBeGreaterThanOrEqual(3);
      howItWorks.steps.forEach((step, i) =>
        expect(step.trim().length, `${lang}.howItWorks.steps[${i}]`).toBeGreaterThan(0),
      );
    }
  });

  it("provides a Reassurance_Element naming Laurent Oudet and Grasse in both languages", () => {
    // Validates: Requirements 14.1, 14.2, 14.3
    for (const lang of LANGUAGES) {
      const reassurance = getMessages(lang).reassurance;
      expect(reassurance.body.trim().length, `${lang}.reassurance.body`).toBeGreaterThan(0);
      expect(reassurance.body, `${lang}.reassurance.body names Laurent Oudet`).toContain(
        "Laurent Oudet",
      );
      expect(
        reassurance.body,
        `${lang}.reassurance.body names the Grasse (06130) Service_Area`,
      ).toMatch(/Grasse|06130/);
    }
  });

  it("provides an FAQ_Section with >=3 non-empty Q&A pairs in both languages", () => {
    // Validates: Requirements 15.1, 15.2
    for (const lang of LANGUAGES) {
      const faq = getMessages(lang).faq;
      expect(faq.heading.trim().length, `${lang}.faq.heading`).toBeGreaterThan(0);
      expect(faq.items.length, `${lang}.faq.items.length`).toBeGreaterThanOrEqual(3);
      faq.items.forEach((item, i) => {
        expect(item.question.trim().length, `${lang}.faq.items[${i}].question`).toBeGreaterThan(0);
        expect(item.answer.trim().length, `${lang}.faq.items[${i}].answer`).toBeGreaterThan(0);
      });
    }
  });

  it("gives French and English distinct copy for shared keys", () => {
    // Sanity check that EN is a real translation, not a copy of FR, for a few keys.
    expect(getMessages("fr").confirmation).not.toBe(getMessages("en").confirmation);
    expect(getMessages("fr").nav.home).not.toBe(getMessages("en").nav.home);
    expect(getMessages("fr").errors.required).not.toBe(getMessages("en").errors.required);
  });
});

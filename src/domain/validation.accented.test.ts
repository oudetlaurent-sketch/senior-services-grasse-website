import { describe, it, expect } from "vitest";
import { validateServiceRequest } from "./validation.js";
import type { RawFormInput } from "./types.js";

/**
 * Feature: senior-services-website — accented French free-text acceptance
 * (Validates: Requirements 7.3).
 *
 * Example-based companion to the fast-check Property 15 (task 16.2). These tests pin
 * the implementation-side guarantee from design §6: `name` and `description` carry no
 * character-set restriction — only their length bounds (name 1–100, description
 * 0–2000) and name's required/non-empty-after-trim check apply. Heavily accented
 * French input must therefore never be rejected on the basis of its characters, while
 * the `phone` charset rule and `email` format check stay unchanged.
 */

/** Did the result attribute any error to the given field? */
function errorsForField(input: RawFormInput, field: string): string[] {
  const result = validateServiceRequest(input);
  if (result.ok) {
    return [];
  }
  return result.errors
    .filter((e) => e.field === field)
    .map((e) => e.code);
}

describe("Accented French free text in name/description (Requirement 7.3)", () => {
  it("accepts a heavily accented name and description with other fields valid", () => {
    const input: RawFormInput = {
      name: "Élodie Besançon-Noël",
      phone: "06 13 06 13 06",
      email: "elodie@example.com",
      service: "computer-repair",
      description: "à la crème, où çà et là, cœur — réparé à Grasse ñ ü",
    };

    const result = validateServiceRequest(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Accented characters are preserved verbatim through normalization.
      expect(result.value.name).toBe("Élodie Besançon-Noël");
      expect(result.value.description).toBe(
        "à la crème, où çà et là, cœur — réparé à Grasse ñ ü",
      );
    }
  });

  it("never attributes an error to name or description for accented characters", () => {
    const input: RawFormInput = {
      name: "ÇÀÉÈÙŒ àéèùç œ",
      phone: "06 13 06 13 06",
      email: "",
      service: "in-home-repair",
      description: "Texte très accentué : é è à ç ù œ ê î ô û ë ï ö ü ÿ",
    };

    expect(errorsForField(input, "name")).toEqual([]);
    expect(errorsForField(input, "description")).toEqual([]);
  });

  it("counts length by code points so accented strings keep their real bounds", () => {
    // 100 accented characters is exactly the name max — accepted.
    const name100 = "é".repeat(100);
    expect(name100.length).toBe(100);

    const okInput: RawFormInput = {
      name: name100,
      phone: "0613061306",
      email: "",
      service: "computer-learning",
      description: "à".repeat(2000),
    };
    const okResult = validateServiceRequest(okInput);
    expect(okResult.ok).toBe(true);

    // One accented character over each bound is rejected for length, not charset.
    const tooLongInput: RawFormInput = {
      name: "é".repeat(101),
      phone: "0613061306",
      email: "",
      service: "computer-learning",
      description: "à".repeat(2001),
    };
    expect(errorsForField(tooLongInput, "name")).toEqual(["too_long"]);
    expect(errorsForField(tooLongInput, "description")).toEqual(["too_long"]);
  });

  it("leaves the phone charset rule unchanged alongside accented free text", () => {
    // An accented character in phone is still rejected (phone charset is restricted),
    // while the accented name/description remain error-free.
    const input: RawFormInput = {
      name: "Élodie",
      phone: "06 13 é",
      email: "",
      service: "computer-repair",
      description: "à la crème",
    };

    expect(errorsForField(input, "phone")).toEqual(["invalid_phone"]);
    expect(errorsForField(input, "name")).toEqual([]);
    expect(errorsForField(input, "description")).toEqual([]);
  });

  it("leaves the email format check unchanged alongside accented free text", () => {
    const input: RawFormInput = {
      name: "Besançon",
      phone: "0613061306",
      email: "pas une adresse",
      service: "computer-repair",
      description: "cœur à Grasse",
    };

    expect(errorsForField(input, "email")).toEqual(["invalid_email"]);
    expect(errorsForField(input, "name")).toEqual([]);
    expect(errorsForField(input, "description")).toEqual([]);
  });
});

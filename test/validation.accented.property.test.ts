import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateServiceRequest } from "../src/domain/validation.js";
import type { FieldError, RawFormInput, ServiceKey } from "../src/domain/types.js";

/**
 * Property 15: Validation accepts French and English accented free-text.
 *
 * Validates: Requirements 7.8
 *
 * For any RawFormInput whose `name` and `description` contain arbitrary Unicode letters —
 * mixing accented French characters (é, è, à, ç, ù, œ, æ, …) with typical English letters
 * (a–z, A–Z) — and are within their length bounds, and whose other fields are valid,
 * validation does NOT reject `name` or `description` for their character content: no
 * FieldError is attributed to `name` or `description` on the basis of character set.
 *
 * The validation module intentionally applies no charset restriction to `name` or
 * `description`; the only errors those fields can incur are length/required ones
 * (`required`, `too_long`, `too_short`). This property fixes every other dimension to a
 * valid value and keeps the generated name/description within their length bounds, so a
 * `name`/`description` error would only arise from a (nonexistent) character-content
 * rule. We therefore assert the full result is `ok`, which also implies no name or
 * description error of any kind.
 */

// Pool of accented French characters (lower- and uppercase) plus common ligatures,
// used to bias the free-text generators toward exercising accent acceptance.
const ACCENTED_FRENCH = [
  "é", "è", "ê", "ë", "à", "â", "ä", "ç", "ù", "û", "ü", "î", "ï", "ô", "ö", "œ", "æ",
  "É", "È", "Ê", "Ë", "À", "Â", "Ä", "Ç", "Ù", "Û", "Ü", "Î", "Ï", "Ô", "Ö", "Œ", "Æ",
];

// Typical English letters (plain ASCII, both cases).
const ENGLISH_LETTERS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** A single Unicode "letter-ish" character: an accented French letter, a plain English
 *  (ASCII) letter, or an arbitrary Unicode letter from fast-check's full char range. */
const letterLikeArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...ACCENTED_FRENCH) },
  { weight: 3, arbitrary: fc.constantFrom(...ENGLISH_LETTERS) },
  // Full Unicode characters (incl. letters from many scripts) to stress "arbitrary
  // Unicode letters" acceptance beyond just French and English.
  { weight: 1, arbitrary: fc.fullUnicode().map((c) => c) },
);

/** A free-text string of letter-like characters within [minLen, maxLen] code points,
 *  guaranteed to contain BOTH an accented French character and a typical English letter
 *  so that acceptance of a French/English mix is always exercised. */
function accentedTextArb(minLen: number, maxLen: number): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...ACCENTED_FRENCH),
      fc.constantFrom(...ENGLISH_LETTERS),
      fc.array(letterLikeArb, { minLength: minLen, maxLength: maxLen }),
    )
    .map(([frenchSeed, englishSeed, rest]) => {
      const chars = [frenchSeed, englishSeed, ...rest];
      // Keep within maxLen code points.
      return chars.slice(0, Math.max(maxLen, 2)).join("");
    });
}

// Name: non-empty after trim, within 1–100. The two seed characters plus letter-like
// characters (no leading whitespace from the generator) keep it non-empty after trimming.
const nameArb: fc.Arbitrary<string> = accentedTextArb(0, 98);

// Description: within 0–2000. Allow empty too, but still bias toward a French/English
// mix when present.
const descriptionArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  accentedTextArb(0, 1998),
);

// Phone: valid — within 1–20 using the allowed charset (digits, space, + - ( )).
const phoneArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."0123456789 +-()".split("")), { minLength: 1, maxLength: 20 })
  .map((cs) => cs.join(""))
  // Ensure non-empty after trim by appending a digit if it trims to empty.
  .map((s) => (s.trim().length === 0 ? s + "0" : s))
  .map((s) => s.slice(0, 20));

const serviceArb: fc.Arbitrary<ServiceKey> = fc.constantFrom(
  "computer-learning",
  "computer-repair",
  "in-home-repair",
);

// Email: empty or well-formed (so it never contributes an error).
const validEmailArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringMatching(/^[A-Za-z0-9._%+-]{1,20}$/),
    fc.stringMatching(/^[A-Za-z0-9-]{1,15}$/),
    fc.stringMatching(/^[A-Za-z]{2,6}$/),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

const emailArb: fc.Arbitrary<string> = fc.oneof(fc.constant(""), validEmailArb);

const rawFormInputArb: fc.Arbitrary<RawFormInput> = fc.record({
  name: nameArb,
  phone: phoneArb,
  email: emailArb,
  service: serviceArb,
  description: descriptionArb,
});

function errorsFor(field: "name" | "description", errors: FieldError[]): FieldError[] {
  return errors.filter((e) => e.field === field);
}

describe("validateServiceRequest — French & English accented free text (Property 15)", () => {
  it("accepts arbitrary French/English accented name & description without name/description errors", () => {
    // Feature: senior-services-website, Property 15: Validation accepts French and English
    // accented free-text. Validates: Requirements 7.8
    fc.assert(
      fc.property(rawFormInputArb, (input) => {
        const result = validateServiceRequest(input);

        // No FieldError may be attributed to name or description for character content.
        const nameErrors = result.ok ? [] : errorsFor("name", result.errors);
        const descriptionErrors = result.ok
          ? []
          : errorsFor("description", result.errors);

        expect(nameErrors).toEqual([]);
        expect(descriptionErrors).toEqual([]);

        // With every other field valid and lengths in bounds, validation accepts the
        // submission outright.
        expect(result.ok).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("accepts representative French, English, and mixed names and descriptions", () => {
    const samples: Array<{ name: string; description: string }> = [
      { name: "Hélène Noël", description: "Réparation à domicile près de Grasse." },
      { name: "François Lefèvre", description: "Problème d'écran — l'ordinateur ne démarre pas." },
      { name: "Ça Marche Œuvre", description: "Dépannage çà et là, cœur du métier." },
      { name: "John Smith", description: "My laptop will not turn on and needs a repair." },
      { name: "Mary O'Brien", description: "Please help me learn to use email and video calls." },
      { name: "Hélène & John", description: "Mix of French and English: réparation and repair." },
      { name: "Ágúst Þór", description: "Texte avec des lettres d'autres alphabets: Ωμέγα, Привет." },
    ];

    for (const { name, description } of samples) {
      const result = validateServiceRequest({
        name,
        phone: "06 13 06 13 06",
        email: "",
        service: "in-home-repair",
        description,
      });
      expect(result.ok).toBe(true);
    }
  });
});

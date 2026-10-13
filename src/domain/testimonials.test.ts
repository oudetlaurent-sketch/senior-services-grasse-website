import { describe, it, expect } from "vitest";
import { aggregateRating } from "./testimonials.js";
import { getMessages } from "../content/i18n.js";
import type { Language } from "./types.js";

/**
 * Unit tests for the pure Aggregate_Rating helper (design §2e, Requirement 18.3).
 *
 * `aggregateRating(ratings)` returns `{ average, count }` where `average` is the
 * arithmetic mean rounded to one decimal and `count` is the number of ratings; the empty
 * array yields `{ average: 0, count: 0 }`. Example-based vitest in the same style as
 * `scheduling.test.ts`.
 */

const LANGUAGES: readonly Language[] = ["fr", "en"];

describe("aggregateRating — the Home_Page Aggregate_Rating (Requirement 18.3)", () => {
  it("averages the shipped testimonials set to one decimal with the count", () => {
    // The shipped FR/EN set is three real 5/5 testimonials -> mean 5.0, count 3.
    expect(aggregateRating([5, 5, 5])).toEqual({ average: 5, count: 3 });
  });

  it("returns the single value unchanged for a one-item set", () => {
    expect(aggregateRating([5])).toEqual({ average: 5, count: 1 });
    expect(aggregateRating([4])).toEqual({ average: 4, count: 1 });
  });

  it("returns { average: 0, count: 0 } for an empty set", () => {
    expect(aggregateRating([])).toEqual({ average: 0, count: 0 });
  });

  it("rounds the mean to one decimal (half-up)", () => {
    // [5, 4] -> 4.5 exactly; [5, 5, 5, 4] -> 4.75 -> 4.8.
    expect(aggregateRating([5, 4])).toEqual({ average: 4.5, count: 2 });
    expect(aggregateRating([5, 5, 5, 4])).toEqual({ average: 4.8, count: 4 });
  });

  it("matches the aggregate of the actual shipped testimonials in both languages", () => {
    for (const language of LANGUAGES) {
      const items = getMessages(language).testimonials.items;
      const result = aggregateRating(items.map((item) => item.rating));
      expect(result.count, `${language} testimonial count`).toBe(items.length);
      expect(result.count, `${language} must ship >=3 testimonials`).toBeGreaterThanOrEqual(3);
      // The computed average must equal the mean of the shown stars, to one decimal.
      const expected =
        Math.round((items.reduce((t, i) => t + i.rating, 0) / items.length) * 10) / 10;
      expect(result.average, `${language} aggregate average`).toBe(expected);
    }
  });
});

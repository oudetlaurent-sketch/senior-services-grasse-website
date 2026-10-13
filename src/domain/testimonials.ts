/**
 * Pure Aggregate_Rating helper for the Home_Page Testimonials section (design §2e,
 * Requirement 18).
 *
 * The Testimonials section shows an Aggregate_Rating at the top — the arithmetic mean of
 * the shown Testimonials' Star_Ratings, rounded to one decimal, together with the count
 * (Requirement 18.3). This helper computes that `{ average, count }` from the raw ratings
 * array.
 *
 * It is framework-free, side-effect-free, and **locale-free** (like `scheduling.ts`): it
 * returns the numeric `average`/`count` only, so the component formats the number per
 * Supported_Language (FR comma decimal, EN dot decimal). Keeping the number formatting in
 * the component matches the project's pure-`src/domain` convention and lets the same
 * values feed both the visible text and the schema.org AggregateRating JSON-LD so they
 * always match (Requirement 18.10).
 */

/** The computed Aggregate_Rating: the one-decimal mean and the number of testimonials. */
export type AggregateRating = {
  /** Arithmetic mean of the ratings, rounded to one decimal (0 for an empty array). */
  average: number;
  /** Number of testimonials the aggregate was computed from. */
  count: number;
};

/**
 * Compute the Aggregate_Rating from a list of Star_Ratings (design §2e, Requirement 18.3).
 *
 * `average` is the arithmetic mean of `ratings`, rounded to one decimal; `count` is
 * `ratings.length`. An empty array yields `{ average: 0, count: 0 }` (there is nothing to
 * average). The rounding uses standard half-up rounding on the mean scaled to one decimal.
 *
 * @param ratings the shown Testimonials' 1–5 Star_Ratings
 * @returns the one-decimal mean and the count
 */
export function aggregateRating(ratings: ReadonlyArray<number>): AggregateRating {
  const count = ratings.length;
  if (count === 0) {
    return { average: 0, count: 0 };
  }
  const sum = ratings.reduce((total, rating) => total + rating, 0);
  const average = Math.round((sum / count) * 10) / 10;
  return { average, count };
}

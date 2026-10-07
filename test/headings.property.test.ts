import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isValidHeadingStructure } from "../src/domain/headings.js";

/**
 * Property 13: Heading structure has one top-level heading and no skipped levels.
 *
 * Validates: Requirements 6.7
 *
 * For any page's sequence of heading levels, isValidHeadingStructure accepts the
 * sequence if and only if it contains exactly one top-level heading (exactly one
 * level-1 heading) and no heading increases the depth by more than one level
 * relative to the heading that immediately precedes it.
 *
 * The expected outcome is derived here from the same rule the acceptance criterion
 * describes — applied over a reference implementation independent of the module under
 * test — rather than from the module's internals. The generators deliberately produce
 * both well-formed structures and malformed ones (skipped levels, zero or multiple
 * h1s, out-of-range ranks) so both directions of the "if and only if" are exercised.
 */

/**
 * Reference rule matching Requirement 6.7: a sequence is valid iff it is non-empty,
 * every rank is an integer in 1..6, it contains exactly one level-1 heading, and no
 * heading is more than one level deeper than its predecessor. Written independently
 * of the module under test.
 */
function expectedValid(levels: readonly number[]): boolean {
  if (levels.length === 0) {
    return false;
  }
  if (!levels.every((l) => Number.isInteger(l) && l >= 1 && l <= 6)) {
    return false;
  }
  const topLevelCount = levels.filter((l) => l === 1).length;
  if (topLevelCount !== 1) {
    return false;
  }
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i]! - levels[i - 1]! > 1) {
      return false;
    }
  }
  // With exactly one level-1 heading and no skips, the sequence is only valid when it
  // opens on the top level; a deeper first heading would skip from the implicit top.
  return levels[0] === 1;
}

/**
 * A generator that yields well-formed heading structures: start at level 1, then at
 * each step either stay, go shallower (any amount, but never back to 1), or go one
 * level deeper. This guarantees exactly one h1 and no skipped levels.
 */
const validStructureArb: fc.Arbitrary<number[]> = fc
  .array(fc.integer({ min: -5, max: 1 }), { minLength: 0, maxLength: 20 })
  .map((deltas) => {
    const levels = [1];
    for (const delta of deltas) {
      const previous = levels[levels.length - 1]!;
      // delta of 1 goes one deeper; non-positive deltas go shallower or stay, clamped
      // to level 2 so we never create a second level-1 heading.
      const next = delta === 1 ? previous + 1 : previous + delta;
      levels.push(Math.min(6, Math.max(2, next)));
    }
    return levels;
  });

/**
 * A generator of likely-malformed structures: free sequences of ranks (possibly out of
 * range, possibly empty, possibly with zero or several h1s and skipped levels). Some
 * values may happen to be valid, which is fine — the reference rule decides the
 * expected outcome, so those just exercise the acceptance direction.
 */
const freeStructureArb: fc.Arbitrary<number[]> = fc.array(
  fc.integer({ min: 0, max: 8 }),
  { minLength: 0, maxLength: 20 },
);

/** Representative hand-picked malformed structures covering each failure mode. */
const malformedStructureArb: fc.Arbitrary<number[]> = fc.constantFrom(
  [], // empty: no top-level heading
  [2, 3, 4], // zero h1s
  [1, 1, 2], // two h1s
  [1, 3], // skipped from 1 to 3
  [1, 2, 4], // skipped from 2 to 4
  [2, 1], // first heading is not top-level
  [1, 2, 2, 4, 5], // skip in the middle
);

const headingStructureArb: fc.Arbitrary<number[]> = fc.oneof(
  validStructureArb,
  freeStructureArb,
  malformedStructureArb,
);

describe("isValidHeadingStructure — heading structure (Property 13)", () => {
  it("accepts a sequence iff it has exactly one top-level heading and no skipped levels", () => {
    // Feature: senior-services-website, Property 13: Heading structure has one
    // top-level heading and no skipped levels. Validates: Requirements 6.7
    fc.assert(
      fc.property(headingStructureArb, (levels) => {
        expect(isValidHeadingStructure(levels)).toBe(expectedValid(levels));
      }),
      { numRuns: 200 },
    );
  });

  it("accepts representative well-formed structures", () => {
    for (const levels of [
      [1],
      [1, 2],
      [1, 2, 3],
      [1, 2, 2, 3],
      [1, 2, 3, 2, 3],
      [1, 2, 2, 2],
    ]) {
      expect(isValidHeadingStructure(levels)).toBe(true);
    }
    // Going shallower by more than one level is allowed.
    expect(isValidHeadingStructure([1, 2, 3, 2])).toBe(true);
    expect(isValidHeadingStructure([1, 2, 3, 4, 2])).toBe(true);
  });

  it("rejects representative malformed structures", () => {
    expect(isValidHeadingStructure([])).toBe(false); // no top-level heading
    expect(isValidHeadingStructure([2, 3, 4])).toBe(false); // zero h1s
    expect(isValidHeadingStructure([1, 1])).toBe(false); // two h1s
    expect(isValidHeadingStructure([1, 3])).toBe(false); // skip 1 -> 3
    expect(isValidHeadingStructure([1, 2, 4])).toBe(false); // skip 2 -> 4
    expect(isValidHeadingStructure([2, 1])).toBe(false); // first not top-level
  });
});

/**
 * Heading-structure validator (pure).
 *
 * Implements Requirement 6.7 and the design's Property 13: a page's sequence of
 * heading levels is well-formed if and only if
 *   1. it contains exactly one top-level heading (exactly one `h1`), and
 *   2. no heading increases the depth by more than one level relative to the
 *      heading that immediately precedes it (levels descend without skipping).
 *
 * A heading level is the numeric rank of an HTML heading: 1 for `<h1>`, 2 for
 * `<h2>`, and so on. "Top level" is the shallowest rank, level 1. The function is
 * pure and framework-free: it takes the ordered sequence of heading levels on a
 * page and returns a boolean.
 */

/** The rank of a top-level heading (`<h1>`). */
export const TOP_LEVEL = 1;

/**
 * Returns `true` iff `levels` is a valid page heading structure per Requirement 6.7.
 *
 * The sequence is read in document order. It is valid when it contains exactly one
 * level-1 heading and every heading is at most one level deeper than the heading
 * immediately before it. The first heading, having no predecessor, may not increase
 * depth from nothing by more than one level either: it must itself be the top-level
 * heading (level 1), which the "exactly one top-level heading" clause already
 * requires to appear, and a non-level-1 first heading would skip from the implicit
 * top. Going shallower (toward the top) by any amount is always allowed.
 */
export function isValidHeadingStructure(levels: readonly number[]): boolean {
  // An empty page has no top-level heading, so it cannot satisfy "exactly one".
  if (levels.length === 0) {
    return false;
  }

  // Reject non-integral or out-of-range ranks; heading levels are 1..6.
  for (const level of levels) {
    if (!Number.isInteger(level) || level < 1 || level > 6) {
      return false;
    }
  }

  // Clause 1: exactly one top-level (level-1) heading.
  const topLevelCount = levels.filter((level) => level === TOP_LEVEL).length;
  if (topLevelCount !== 1) {
    return false;
  }

  // The first heading must be the top-level heading: anything deeper would skip
  // levels from the top of the document.
  if (levels[0] !== TOP_LEVEL) {
    return false;
  }

  // Clause 2: no heading goes deeper than one level beyond its predecessor.
  for (let i = 1; i < levels.length; i += 1) {
    const previous = levels[i - 1]!;
    const current = levels[i]!;
    if (current - previous > 1) {
      return false;
    }
  }

  return true;
}

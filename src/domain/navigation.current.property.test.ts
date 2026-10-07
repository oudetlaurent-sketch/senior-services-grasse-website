import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildNavigation, NAV_ORDER, type NavEntry } from "./navigation.js";
import type { Language, PageKey } from "./types.js";

/**
 * Property 6: Exactly one navigation link is marked current.
 *
 * Validates: Requirements 3.5
 *
 * For any Supported_Language and any current page in the menu, `buildNavigation` marks
 * exactly one entry as current, and that entry is the one whose key equals the current
 * page; every other entry is not current.
 *
 * The expected outcome is derived here from the acceptance criterion itself — the single
 * current entry is the one whose key equals `currentPage` — rather than from the
 * module's internals. The generator ranges over both Supported_Languages and every
 * {@link NAV_ORDER} page key, so the "exactly one current" invariant is checked for both
 * the French and the English menus.
 *
 * NOTE (task 18.2): `buildNavigation` now takes `(language, currentPage)` and always
 * resolves the fixed seven-entry per-language menu, so this test was migrated to the new
 * signature. The dedicated Property-6 rework is task 22.1.
 */

/** Both Supported_Languages, used to exercise the French and English menus. */
const ALL_LANGUAGES: readonly Language[] = ["fr", "en"];

/** Every page key that can appear in the canonical menu and serve as the current page. */
const ALL_PAGE_KEYS: readonly PageKey[] = NAV_ORDER;

/** Assert the single-current invariant for a resolved menu against the current page. */
function assertExactlyOneCurrent(
  menu: NavEntry[],
  currentPage: PageKey,
): void {
  const currentEntries = menu.filter((e) => e.current);

  // Exactly one entry is marked current.
  expect(currentEntries).toHaveLength(1);

  // The current entry is the one whose key equals the current page.
  expect(currentEntries[0]?.key).toBe(currentPage);

  // Every other entry is not current.
  for (const entry of menu) {
    expect(entry.current).toBe(entry.key === currentPage);
  }
}

describe("Property 6: exactly one navigation link is marked current", () => {
  it("marks exactly the current-page entry as current over the canonical menu", () => {
    // Feature: senior-services-website, Property 6: Exactly one navigation link is
    // marked current. Validates: Requirements 3.5
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_LANGUAGES),
        fc.constantFrom(...ALL_PAGE_KEYS),
        (language, currentPage) => {
          const menu = buildNavigation(language, currentPage);
          assertExactlyOneCurrent(menu, currentPage);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("preserves one entry per menu page key, in order, for both languages", () => {
    // Feature: senior-services-website, Property 6: Exactly one navigation link is
    // marked current. Validates: Requirements 3.5
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_LANGUAGES),
        fc.constantFrom(...ALL_PAGE_KEYS),
        (language, currentPage) => {
          const menu = buildNavigation(language, currentPage);

          // Order and field preservation: one entry per menu key, in display order.
          expect(menu.map((e) => e.key)).toEqual([...NAV_ORDER]);

          assertExactlyOneCurrent(menu, currentPage);
        },
      ),
      { numRuns: 100 },
    );
  });
});

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildNavigation, NAV_ORDER, type NavEntry } from "./navigation.js";
import { getMessages } from "../content/i18n.js";
import type { Language, PageKey } from "./types.js";

// Feature: senior-services-website, Property 4: Navigation menu is complete and
// correctly labeled.
//
// Validates: Requirements 3.2 — for any Supported_Language, the Navigation_Menu contains
// exactly one link to the Home_Page, one link to each of the three Service_Pages, one to
// the About_Page, one to the Scheduling_Page, and one to the Service_Request_Form (seven
// total, no more and no fewer), and each link is labeled by the title of its target page
// in that language.
//
// `buildNavigation(language, currentPage)` resolves the fixed seven-entry per-language
// menu, with each entry's title read from the localized content model
// (`getMessages(language).nav[key]`). This property is exercised across BOTH
// Supported_Languages ("fr" and "en"), generated over language × currentPage.

/** Both Supported_Languages, so the French and English menus are both exercised. */
const ALL_LANGUAGES: readonly Language[] = ["fr", "en"];

/** Every page key that can be the current page (the generated choice for the menu). */
const ALL_PAGE_KEYS: readonly PageKey[] = NAV_ORDER;

/** The seven page keys the menu must contain, in display order. */
const EXPECTED_KEYS: readonly PageKey[] = NAV_ORDER;

describe("Property 4: navigation menu is complete and correctly labeled", () => {
  it("has exactly seven entries (Home, 3 services, About, Scheduling, Service Request), each labeled by its target page title in the current language", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_LANGUAGES),
        fc.constantFrom(...ALL_PAGE_KEYS),
        (language, currentPage) => {
          const menu: NavEntry[] = buildNavigation(language, currentPage);
          const nav = getMessages(language).nav;

          // Completeness: exactly seven entries, no more and no fewer.
          expect(menu).toHaveLength(EXPECTED_KEYS.length);

          // Exactly one entry per expected page key — one Home, one per service page,
          // one About, one Scheduling, one Service Request — no duplicates, nothing extra.
          const keyCounts = new Map<string, number>();
          for (const entry of menu) {
            keyCounts.set(entry.key, (keyCounts.get(entry.key) ?? 0) + 1);
          }
          expect(keyCounts.size).toBe(EXPECTED_KEYS.length);
          for (const key of EXPECTED_KEYS) {
            expect(keyCounts.get(key)).toBe(1);
          }

          // Labeling: each entry's label (title) equals its target page title in the
          // current language, drawn from the localized content model (Requirement 7.6).
          for (const key of EXPECTED_KEYS) {
            const entry = menu.find((e) => e.key === key);
            expect(entry).toBeDefined();
            expect(entry?.title).toBe(nav[key]);
            // The link also targets a page (href present), so the label names a real page.
            expect(entry?.href).toBeTruthy();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

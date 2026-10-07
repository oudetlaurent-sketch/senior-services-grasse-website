/**
 * Pure navigation-state helpers for the Navigation_Menu and Language_Selector
 * (design §1, "Shared Layout and Navigation").
 *
 * The Navigation_Menu contains exactly SEVEN entries — Home, Computer Learning,
 * Computer Repair, In-Home Repair, About, Scheduling, Service Request — each labeled by
 * the title of its target page **in the current language** (Requirements 3.2, 7.6).
 * `buildNavigation(language, currentPage)` reads those titles from the localized content
 * model (`getMessages(language).nav`) and resolves each entry's per-language route, then
 * stamps a `current` flag so exactly one entry (the one matching `currentPage`) is marked
 * current (Requirement 3.5).
 *
 * `buildLanguageSelector(currentPage, current)` resolves the Language_Selector targets:
 * the equivalent of the current page in each Supported_Language, with the active language
 * flagged (Requirements 7.3, 7.4). It is the source for the Language_Selector round-trip
 * (Property 17): the per-language route of the SAME page in each language.
 *
 * Both helpers are framework-free and side-effect-free so the NavigationMenu component and
 * the property-based tests share one source of truth. The per-language path mappings are
 * centralized in {@link PAGE_PATHS} / {@link pagePath} so navigation and the language
 * selector resolve routes the same way.
 */

import type { Language, NavItem, PageKey } from "./types.js";
import { getMessages } from "../content/i18n.js";

/** A navigation entry with its current-page flag resolved. */
export type NavEntry = NavItem & { current: boolean };

/** A Language_Selector target: the current page's href in one Supported_Language. */
export type LanguageSelectorEntry = {
  language: Language;
  href: string;
  current: boolean;
};

/**
 * The seven Navigation_Menu page keys, in display order: Home, the three Service_Pages,
 * About, Scheduling, Service_Request (design §1, Requirement 3.2). The order is the menu
 * render order and is shared by both languages.
 */
export const NAV_ORDER: readonly PageKey[] = [
  "home",
  "computer-learning",
  "computer-repair",
  "in-home-repair",
  "about",
  "scheduling",
  "service-request",
];

/**
 * Per-language route for every {@link PageKey}, centralized so `buildNavigation` and
 * `buildLanguageSelector` resolve the SAME hrefs. French pages live at the existing
 * paths; English pages live under an `/en/` prefix (design §1, "Bilingual architecture",
 * Requirement 7.2). This is the single source of truth for routes.
 */
export const PAGE_PATHS: Record<Language, Record<PageKey, string>> = {
  fr: {
    home: "/",
    "computer-learning": "/services/computer-learning",
    "computer-repair": "/services/computer-repair",
    "in-home-repair": "/services/in-home-repair",
    about: "/about",
    scheduling: "/rendez-vous",
    "service-request": "/service-request",
  },
  en: {
    home: "/en/",
    "computer-learning": "/en/services/computer-learning",
    "computer-repair": "/en/services/computer-repair",
    "in-home-repair": "/en/services/in-home-repair",
    about: "/en/about",
    scheduling: "/en/schedule",
    "service-request": "/en/service-request",
  },
};

/**
 * Resolve the route for one page in one Supported_Language from the centralized
 * {@link PAGE_PATHS} mapping.
 *
 * @param language the Supported_Language whose route is wanted
 * @param page the page whose href to resolve
 */
export function pagePath(language: Language, page: PageKey): string {
  return PAGE_PATHS[language][page];
}

/**
 * The canonical Navigation_Menu entries for a Supported_Language, in display order. Each
 * `title` is both the display label and the title of its target page **in that language**
 * (Requirements 3.2, 7.6), read from the localized content model; each `href` is that
 * page's per-language route (from {@link PAGE_PATHS}).
 *
 * @param language the active Supported_Language
 */
export function navItems(language: Language): NavItem[] {
  const nav = getMessages(language).nav;
  return NAV_ORDER.map((key) => ({
    key,
    title: nav[key],
    href: pagePath(language, key),
  }));
}

/**
 * The French Navigation_Menu entries, in display order. French is the default language,
 * so this preserves the previous `NAV_ITEMS` export (a route-keyed source of truth) for
 * callers that have not yet been wired to a specific language (e.g. the Home_Page card
 * hrefs). Per-language rendering of the Astro pages is handled by later tasks.
 */
export const NAV_ITEMS: readonly NavItem[] = navItems("fr");

/**
 * Build the Navigation_Menu for a Supported_Language and resolve its current-page state.
 *
 * Returns the SEVEN entries in display order (Home, the three services, About,
 * Scheduling, Service_Request), each labeled by its target page title in `language`
 * (Requirements 3.2, 7.6) with its per-language `href`, and a `current` flag that is
 * `true` for exactly the entry whose `key` equals `currentPage` and `false` for every
 * other entry (Requirement 3.5).
 *
 * @param language the active Supported_Language (titles + routes are resolved for it)
 * @param currentPage the page the visitor is currently viewing
 */
export function buildNavigation(
  language: Language,
  currentPage: PageKey,
): NavEntry[] {
  return navItems(language).map((item) => ({
    ...item,
    current: item.key === currentPage,
  }));
}

/**
 * Resolve the Language_Selector targets for the current page (design §1, Requirement 7.3).
 *
 * Returns one entry per Supported_Language (French then English), each carrying the href
 * of the SAME page (`currentPage`) in that language — resolved from the shared
 * {@link PAGE_PATHS} mapping — and `current: true` for exactly the active language
 * (`current`). This is the Language_Selector round-trip source (Property 17): the selector
 * link for a language points at the current page's equivalent in that language.
 *
 * @param currentPage the page the visitor is currently viewing
 * @param current the active Supported_Language
 */
export function buildLanguageSelector(
  currentPage: PageKey,
  current: Language,
): LanguageSelectorEntry[] {
  const languages: readonly Language[] = ["fr", "en"];
  return languages.map((language) => ({
    language,
    href: pagePath(language, currentPage),
    current: language === current,
  }));
}

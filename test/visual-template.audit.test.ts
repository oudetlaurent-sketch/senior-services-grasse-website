import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseHTML } from "linkedom";
import { ensureBuiltSite } from "./support/build-site.js";
import { getMessages } from "../src/content/i18n.js";
import { pagePath } from "../src/domain/navigation.js";
import { isValidHeadingStructure } from "../src/domain/headings.js";
import { SERVICE_KEYS } from "../src/content/services.js";
import {
  HOME_PHOTO,
  SERVICE_PHOTO,
  grassePhotoSrc,
} from "../src/domain/grasse-photos.js";
import type { Language } from "../src/domain/types.js";

/**
 * Example / audit checks for the needhelp.com visual landing template on the Home_Page:
 * the Hero_Banner, the image-led Service_Cards, and the template section order
 * (task 35.1).
 *
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.6, 16.8, 16.9
 *
 * These acceptance criteria are per-page structure/content/link concerns (design
 * "Testing Strategy") rather than universal properties, so this suite audits them
 * deterministically and browser-free: it builds the static site once (via the shared
 * `ensureBuiltSite`) and inspects the emitted Home_Page HTML in BOTH languages
 * (French at `dist/index.html`, English at `dist/en/index.html`), parsed with linkedom —
 * the same approach as test/home-sections.audit.test.ts, test/identity-nav-about.audit
 * .test.ts, and test/bilingual-pages.audit.test.ts.
 *
 * Expected strings, image references, and link targets are read from the single content
 * sources (`getMessages`, `pagePath`, `grasse-photos`, `services`) rather than
 * re-hard-coded, so the audit tracks the content/route/asset model.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distDir = resolve(projectRoot, "dist");

/** Both Supported_Languages, French first (the default). */
const SUPPORTED_LANGUAGES: readonly Language[] = ["fr", "en"];

type Page = { file: string; html: string; document: Document };

/** Map a root-relative route href to its built `dist/*.html` file (directory output). */
function hrefToFile(href: string): string {
  const pathname = new URL(href, "http://local.invalid").pathname;
  const trimmed = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === "" ? "index.html" : `${trimmed}/index.html`;
}

const pageCache = new Map<string, Page>();

/** Read and parse a built page by its route href, caching by resolved file. */
function pageForHref(href: string): Page {
  const file = hrefToFile(href);
  const existing = pageCache.get(file);
  if (existing) return existing;
  const html = readFileSync(join(distDir, file), "utf8");
  const { document } = parseHTML(html);
  const page: Page = { file, html, document: document as unknown as Document };
  pageCache.set(file, page);
  return page;
}

/** The built Home_Page for a language. */
function homePage(language: Language): Page {
  return pageForHref(pagePath(language, "home"));
}

/** The normalized visible text content of an element (whitespace collapsed). */
function textOf(el: Element | Document | null): string {
  if (el == null) return "";
  return ((el as Element).textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Ordered heading levels (1..6) of a document. */
function headingLevels(document: Document): number[] {
  return Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) =>
    Number.parseInt(h.tagName.substring(1), 10),
  );
}

/** The content region whose template sections are audited. */
function homeContent(document: Document): Element {
  const el = document.querySelector("#home-content");
  if (el == null) throw new Error("expected #home-content on the Home_Page");
  return el;
}

describe("Home_Page visual landing template audit (task 35.1)", () => {
  beforeAll(() => {
    // Build at most once across concurrent Vitest workers (see test/support/build-site.ts).
    ensureBuiltSite();
    for (const language of SUPPORTED_LANGUAGES) {
      homePage(language);
    }
  }, 190_000);

  // -------------------------------------------------------------------------
  // 16.1 / 16.3 — Hero_Banner: headline, supporting sentence, primary CTA,
  // Grasse image, secondary scheduling CTA.
  // -------------------------------------------------------------------------

  it("the Hero_Banner shows the headline, tagline, and a primary CTA to the form, over a Grasse photo (16.1, 16.3)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const hero = document.querySelector('section.hero[aria-labelledby="home-hero-heading"]');
      expect(hero, `${file}: expected the Hero_Banner .hero section`).not.toBeNull();

      const messages = getMessages(language);

      // Headline is the content-model headline, carried by the labelling <h2>.
      const headline = hero!.querySelector("h2#home-hero-heading");
      expect(headline, `${file}: hero must have an <h2> headline`).not.toBeNull();
      expect(textOf(headline), `${file}: hero headline`).toBe(messages.home.hero.headline);

      // Supporting sentence (tagline) from the content model.
      const tagline = textOf(hero!.querySelector(".hero__tagline"));
      expect(tagline, `${file}: hero tagline`).toBe(messages.home.hero.tagline);

      // Primary CTA → Service_Request_Form, labelled with the content-model CTA text.
      const formHref = pagePath(language, "service-request");
      const primary = hero!.querySelector("a.home-link--primary");
      expect(primary, `${file}: hero must have a primary CTA link`).not.toBeNull();
      expect(
        primary!.getAttribute("href"),
        `${file}: hero primary CTA must point to the form (${formHref})`,
      ).toBe(formHref);
      expect(textOf(primary), `${file}: hero primary CTA text`).toBe(messages.home.hero.cta);

      // The hero carries a Grasse image reference: the decorative photo layer's inline
      // background-image references the Home_Page's /grasse/ asset (grassePhotoSrc(HOME_PHOTO)).
      const photo = hero!.querySelector(".hero__photo");
      expect(photo, `${file}: hero must have a .hero__photo layer`).not.toBeNull();
      const style = photo!.getAttribute("style") ?? "";
      const expectedSrc = grassePhotoSrc(HOME_PHOTO);
      expect(
        style.includes("/grasse/"),
        `${file}: hero photo background must reference a /grasse/ asset, saw "${style}"`,
      ).toBe(true);
      expect(
        style.includes(expectedSrc),
        `${file}: hero photo background must reference ${expectedSrc}, saw "${style}"`,
      ).toBe(true);
    }
  });

  it("the Hero_Banner also offers a secondary link to the Scheduling_Page (16.1)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const hero = document.querySelector('section.hero[aria-labelledby="home-hero-heading"]');
      expect(hero, `${file}: expected the Hero_Banner .hero section`).not.toBeNull();

      const schedulingHref = pagePath(language, "scheduling");
      const hrefs = Array.from(hero!.querySelectorAll("a")).map((a) => a.getAttribute("href"));
      expect(
        hrefs,
        `${file}: hero must link to the Scheduling_Page (${schedulingHref})`,
      ).toContain(schedulingHref);
    }
  });

  // -------------------------------------------------------------------------
  // 16.2 / 16.3 / 16.6 — Service_Cards: exactly three image-led cards, each
  // with a distinct Grasse photo (empty alt) and a link to its Service_Page.
  // -------------------------------------------------------------------------

  it("renders exactly three image-led Service_Cards, each with a distinct Grasse photo and a link to its Service_Page (16.2, 16.3, 16.6)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const messages = getMessages(language);

      const cards = Array.from(document.querySelectorAll("ul.home-services > li.home-services__item"));
      expect(cards.length, `${file}: expected exactly three Service_Cards`).toBe(3);
      expect(
        cards.length,
        `${file}: card count must match the three service keys`,
      ).toBe(SERVICE_KEYS.length);

      const seenSrcs: string[] = [];

      // Each service key, in order, maps to one card: a /grasse/ photo whose src equals
      // grassePhotoSrc(SERVICE_PHOTO[key]) with EMPTY decorative alt, and a title link to
      // pagePath(language, key) whose text is the localized service title.
      SERVICE_KEYS.forEach((key, i) => {
        const card = cards[i]!;

        const img = card.querySelector("img.home-services__photo");
        expect(img, `${file}: card ${i} must have a .home-services__photo image`).not.toBeNull();
        const src = img!.getAttribute("src") ?? "";
        const expectedSrc = grassePhotoSrc(SERVICE_PHOTO[key]);
        expect(
          src.includes("/grasse/"),
          `${file}: card ${i} photo src must be a /grasse/ asset, saw "${src}"`,
        ).toBe(true);
        expect(src, `${file}: card ${i} photo src for ${key}`).toBe(expectedSrc);
        // Decorative: empty text alternative (16.6 / 6.2).
        expect(img!.getAttribute("alt"), `${file}: card ${i} photo alt must be empty`).toBe("");
        seenSrcs.push(src);

        // Title link → the service's per-language page, labelled with the service title.
        const link = card.querySelector("a.home-services__link");
        expect(link, `${file}: card ${i} must have a .home-services__link`).not.toBeNull();
        expect(
          link!.getAttribute("href"),
          `${file}: card ${i} link must point to pagePath(${language}, ${key})`,
        ).toBe(pagePath(language, key));
        expect(textOf(link), `${file}: card ${i} link text names the service`).toBe(
          messages.services[key].title,
        );
      });

      // The three photos are distinct (16.2/16.3 — one distinct Grasse photo per card).
      expect(
        new Set(seenSrcs).size,
        `${file}: the three card photos must be distinct, saw [${seenSrcs.join(", ")}]`,
      ).toBe(3);
    }
  });

  // -------------------------------------------------------------------------
  // 16.4 — Template section order: Hero → Service_Cards → How_It_Works →
  // Reassurance → FAQ, by document order of the labelled sections.
  // -------------------------------------------------------------------------

  it("the template sections appear in the required document order (16.4)", () => {
    const EXPECTED_ORDER = [
      "home-hero-heading",
      "home-services-heading",
      "home-how-heading",
      "home-reassurance-heading",
      "home-faq-heading",
    ] as const;

    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const content = homeContent(document);

      // All labelled sections inside #home-content, in document order.
      const idsInOrder = Array.from(
        content.querySelectorAll("section[aria-labelledby]"),
      ).map((s) => s.getAttribute("aria-labelledby"));

      // Every expected template section is present.
      for (const id of EXPECTED_ORDER) {
        expect(idsInOrder, `${file}: expected a section labelled by #${id}`).toContain(id);
      }

      // Their relative order matches EXPECTED_ORDER (other sections like request/contact
      // may appear after the FAQ — we compare indices, not adjacency).
      const indices = EXPECTED_ORDER.map((id) => idsInOrder.indexOf(id));
      for (let i = 1; i < indices.length; i += 1) {
        expect(
          indices[i]! > indices[i - 1]!,
          `${file}: section #${EXPECTED_ORDER[i]} (index ${indices[i]}) must appear after ` +
            `#${EXPECTED_ORDER[i - 1]} (index ${indices[i - 1]})`,
        ).toBe(true);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 16.6 — Decorative images expose no text alternative: the hero photo layer
  // is aria-hidden (not an announced <img>), and each service card photo is alt="".
  // -------------------------------------------------------------------------

  it("the hero photo layer is aria-hidden and each Service_Card photo has an empty alt (16.6)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);

      // Hero photo is a decorative layer, announced to no one: aria-hidden and not an <img>.
      const heroPhoto = document.querySelector(".hero__photo");
      expect(heroPhoto, `${file}: expected the hero .hero__photo layer`).not.toBeNull();
      expect(
        heroPhoto!.getAttribute("aria-hidden"),
        `${file}: the hero photo layer must be aria-hidden`,
      ).toBe("true");
      expect(
        heroPhoto!.tagName.toLowerCase(),
        `${file}: the hero photo must be a decorative background layer, not an announced <img>`,
      ).not.toBe("img");

      // Every service card photo has an EMPTY alt (explicit empty-alt assertion here, in
      // addition to the Property 11 images-alt coverage).
      const cardPhotos = Array.from(document.querySelectorAll("img.home-services__photo"));
      expect(cardPhotos.length, `${file}: expected three card photos`).toBe(3);
      for (const img of cardPhotos) {
        expect(
          img.getAttribute("alt"),
          `${file}: a .home-services__photo must have alt=""`,
        ).toBe("");
      }
    }
  });

  // -------------------------------------------------------------------------
  // 16.8 — No marketplace mechanics: the Home_Page and its linked form +
  // scheduling pages carry no account/payment/quote/rating CONTROLS, and no
  // marketplace vocabulary as visible text (tolerating known negating FAQ phrases).
  // -------------------------------------------------------------------------

  it("the Home_Page and its linked form/scheduling pages expose no marketplace controls (16.8)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const targets: Array<{ label: string; href: string }> = [
        { label: `home (${language})`, href: pagePath(language, "home") },
        { label: `form (${language})`, href: pagePath(language, "service-request") },
        { label: `scheduling (${language})`, href: pagePath(language, "scheduling") },
      ];

      for (const { label, href } of targets) {
        const { document } = pageForHref(href);

        // No password inputs (would imply account/login).
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        expect(
          passwordInputs.length,
          `${label}: must have no password inputs (no account/login mechanics)`,
        ).toBe(0);

        // No login / signup / account links by href or label.
        const links = Array.from(document.querySelectorAll("a"));
        const LOGIN_LINK =
          /\b(log\s*in|login|sign\s*in|sign\s*up|signup|register|account|se\s+connecter|connexion|cr[ée]er\s+un\s+compte|mon\s+compte)\b/i;
        const PAY_LINK = /\b(checkout|payment|pay\s+now|paiement|payer|panier|cart)\b/i;
        for (const a of links) {
          const haystack = `${a.getAttribute("href") ?? ""} ${textOf(a)}`;
          expect(
            LOGIN_LINK.test(haystack),
            `${label}: found an account/login control: "${haystack.trim()}"`,
          ).toBe(false);
          expect(
            PAY_LINK.test(haystack),
            `${label}: found a payment/checkout control: "${haystack.trim()}"`,
          ).toBe(false);
        }
      }
    }
  });

  it("no marketplace vocabulary appears as visible Home_Page text, except known negating FAQ phrases (16.8)", () => {
    // Marketplace vocabulary that must not appear as a mechanic in the visible <main> text.
    // The FAQ reassures seniors with phrases like "sans compte"/"no account" and "sans
    // engagement"/"no obligation"; those negating contexts are tolerated.
    const MARKETPLACE =
      /\b(account|compte|login|log\s*in|sign\s*up|signup|register|checkout|payment|paiement|payer|quote|devis|rating|review|avis|note|se\s+connecter)\b/i;

    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);
      const main = document.querySelector("main") ?? document.querySelector("#home-content");
      const bodyText = textOf(main);

      const re = new RegExp(MARKETPLACE, "gi");
      let match: RegExpExecArray | null;
      while ((match = re.exec(bodyText)) !== null) {
        const start = Math.max(0, match.index - 32);
        const context = bodyText.slice(start, match.index + match[0].length).toLowerCase();
        const negated =
          /sans[^.]*$/.test(context) || // "sans compte", "sans engagement", "sans création de compte"
          /no\s+\w*\s*$/.test(context) || // "no account", "no obligation"
          /aucun[^.]*$/.test(context) || // "aucun compte"
          /pas\s+de[^.]*$/.test(context) || // "pas de compte"
          /without[^.]*$/.test(context); // "without an account"
        expect(
          negated,
          `${file}: marketplace term "${match[0]}" must appear only in a negating context, ` +
            `saw: "...${context}..."`,
        ).toBe(true);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 16.9 — Heading structure: exactly one h1 and valid heading order with the
  // hero + cards present.
  // -------------------------------------------------------------------------

  it("the Home_Page still has exactly one h1 and valid heading order with the hero + cards (16.9)", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { file, document } = homePage(language);

      const levels = headingLevels(document);
      expect(
        levels.filter((l) => l === 1).length,
        `${file}: Home_Page needs exactly one h1`,
      ).toBe(1);
      // Reuse the domain heading-structure validator (task 2.8) rather than re-deriving it.
      expect(
        isValidHeadingStructure(levels),
        `${file}: Home_Page heading levels [${levels.join(", ")}] violate one-h1 / no-skip`,
      ).toBe(true);

      // The hero headline is an <h2> and each card title is an <h3> under the services <h2>.
      const heroHeading = document.querySelector("h2#home-hero-heading");
      expect(heroHeading, `${file}: hero headline must be an <h2>`).not.toBeNull();
      const cardTitles = document.querySelectorAll("h3.home-services__title");
      expect(
        cardTitles.length,
        `${file}: each of the three cards must carry an <h3> title`,
      ).toBe(3);
    }
  });
});

# Senior Services Website

Public-facing, accessibility-first (WCAG 2.1 AA) marketing-and-contact site for a local
business serving senior customers. Built as an Astro static site plus a single Node 20
serverless form endpoint (`POST /api/service-request`).

## Toolchain

- **Astro** (static output) — pre-rendered HTML/CSS for fast, accessible pages.
- **TypeScript** in `strict` mode.
- **Vitest** — test runner.
- **fast-check** — property-based testing dependency (not implemented from scratch).
- **Nodemailer** — SMTP transport, kept behind the `EmailSender` abstraction.

## Directory layout

```
src/
  pages/        Astro pages (routes)
    api/        serverless endpoint(s): POST /api/service-request (task 11.1)
  layouts/      shared SiteLayout (task 6.1)
  components/   NavigationMenu, form markup (tasks 6.1, 9.1)
  content/      typed Service content collection (task 7.1)
  domain/       pure, framework-free logic + shared types (types.ts)
  integration/  EmailSender / EmailTransport + config (email.ts)
test/           Vitest unit and property-based tests
```

## Scripts

```
npm run dev        # local dev server
npm run build      # static build
npm run typecheck  # tsc --noEmit (strict)
npm test           # vitest run (builds once via global setup, then runs all tests)
npm run test:a11y  # build + run only the accessibility/readability scans
```

## Email configuration

When a visitor submits the **Demande de service** form (`POST /api/service-request`), the
server validates it and emails the details to the business inbox
(**oudet.laurent@gmail.com**) via Nodemailer, retrying up to 4 times (Requirements 4.7,
4.8). The recipient and SMTP transport are read from environment variables that back
`EmailConfig` in `src/integration/email.ts` and stay behind the `EmailSender` abstraction.

Copy `.env.example` to `.env` for local runs, and set the same keys as environment
variables in the serverless deployment.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `SMTP_HOST` | **yes** | SMTP relay host (e.g. `smtp.gmail.com`, or an SES/SendGrid/Postmark host) |
| `SMTP_PORT` | **yes** | `465` (implicit TLS) or `587` (STARTTLS) |
| `SMTP_SECURE` | no | `true`/`false`; defaults to `true` when the port is `465`, else `false` |
| `SMTP_USER` | **yes** | SMTP username (for Gmail, the full address `oudet.laurent@gmail.com`) |
| `SMTP_PASS` | **yes** | SMTP password / secret (for Gmail, a 16-char **App Password**) |
| `EMAIL_FROM` | **yes** | Envelope "from" address |
| `BUSINESS_EMAIL` | no | Recipient of submissions. **Defaults to `oudet.laurent@gmail.com`** (from `src/content/business.ts`) when unset; set only to override |

Until the required SMTP variables are set at the hosting layer, the endpoint cannot reach
a mail server and a submission shows the generic accessible 500 page (no internals leak).
Running `npm run preview` locally does not send real email unless you provide these.

### Gmail setup (sending to oudet.laurent@gmail.com)

Gmail's SMTP needs an **App Password**, not the normal account password:

1. In the Google Account for `oudet.laurent@gmail.com`, enable **2-Step Verification**
   (Security settings) — App Passwords are only available with it on.
2. Go to **Security > 2-Step Verification > App passwords**, create one for "Mail", and
   copy the 16-character value.
3. Set the environment variables (local `.env` or the host's dashboard):

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=oudet.laurent@gmail.com
   SMTP_PASS=<the 16-char app password>
   EMAIL_FROM=oudet.laurent@gmail.com
   # BUSINESS_EMAIL is optional; it already defaults to oudet.laurent@gmail.com
   ```

Never commit real secrets. For higher deliverability/volume, a transactional provider
(SES / SendGrid / Postmark) works the same way — just use that provider's host and
credentials.

## Scheduling configuration

The Scheduling_Page (`/rendez-vous`, `/en/schedule`) embeds an external
Scheduling_Service (e.g. Calendly) behind a single documented config value, the booking
URL, read from the `PUBLIC_SCHEDULING_URL` environment variable (`PUBLIC_`-prefixed so
Astro inlines it into the statically pre-rendered page at build time). It backs the
`SchedulingConfig` shape in `src/domain/scheduling.ts`.

- **Unset (default):** the page shows a provisional "coming soon" placeholder
  (Requirement 12.5).
- **Set** to the Scheduling_Service's embeddable URL (e.g.
  `PUBLIC_SCHEDULING_URL=https://calendly.com/your-handle/intro`): the next build embeds
  the booking widget in-page (Requirement 12.2); if the embed fails to load, the page
  reveals the business email and phone as an alternative and keeps the visitor on the
  page (Requirement 12.4).

The three states are decided by the pure `resolveSchedulingState(config, embedLoaded)`
helper in `src/domain/scheduling.ts`.

## Accessibility scans in CI

Accessibility and readability are gated by automated scans (`npm run test:a11y`, which is
also part of `npm test`). The scans live in `test/a11y.scan.test.ts` and have two halves:

**1. Per-page structural scans (browser-free, always run).** The static build is parsed
with [`linkedom`](https://github.com/WebReflection/linkedom) and each `dist/**/*.html`
page is checked against static equivalents of the axe-core rules this project targets:

| Requirement | Check | axe rule mirrored |
| --- | --- | --- |
| 6.2 | every non-decorative `<img>` has a non-empty `alt`; decorative images have empty `alt` | `image-alt` |
| 6.6 | every form control is programmatically labeled (`label[for]`, wrapping `<label>`, `aria-label(ledby)`) | `label` |
| 6.7 | exactly one `<h1>` and no skipped heading levels (via `isValidHeadingStructure`) | `heading-order` |
| 6.1 | `<html lang>`, non-empty `<title>`, one `<main>`, a named `<nav>`, a skip link, one `aria-current="page"` | `html-has-lang`, `document-title`, landmark/region rules |

**2. Token / computed-style audits.** `src/styles/tokens.css` is parsed (helpers in
`src/domain/a11y-tokens.ts`) and asserted against the measurable readability constraints:

| Requirement | Check |
| --- | --- |
| 5.1 | `--font-size-body` ≥ 18px |
| 5.2 | every declared text/background token pair ≥ 4.5:1 (normal) / ≥ 3:1 (non-text UI), recomputed with the WCAG relative-luminance formula |
| 5.4 | `--target-min` ≥ 44px and `--target-gap` ≥ 8px |
| 6.5 | a focus-indicator rule (`:focus-visible` outline in `--color-focus`) distinct from the unfocused state (`:focus:not(:focus-visible){outline:none}`) |
| 5.3 | rem-based sizing + browser-default root + wrapping — the automatable proxy for the 200% zoom requirement |

### Full axe-core + 200% zoom (real-browser CI step)

`axe-core` (pinned as a devDependency) and the 200% zoom requirement (5.3) need a real
browser layout engine, which is **not** available in the Node/Vitest environment — axe
refuses to run against a `linkedom`/`jsdom` DOM because it needs computed layout. These
are therefore wired as a documented, browser-backed CI step rather than a flaky headless
assertion. To enable it in CI (where a headless Chromium is available):

```bash
# One-time: add the browser-backed tooling (pin versions in CI).
npm i -D @playwright/test @axe-core/playwright
npx playwright install --with-deps chromium
```

Then a Playwright spec serves `npm run preview` and, for each page, runs the full axe
WCAG 2a/2aa pass and the zoom check:

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["/", "/services/computer-learning", "/services/computer-repair",
  "/services/in-home-repair", "/service-request"];

for (const path of pages) {
  test(`axe WCAG 2a/2aa: ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations).toEqual([]);
  });

  test(`200% zoom has no horizontal scroll: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path);
    // Emulate 200% zoom by halving the CSS viewport the layout sees.
    await page.evaluate(() => (document.documentElement.style.zoom = "2"));
    const overflowsX = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflowsX).toBe(false); // no horizontal scroll at 200% (Requirement 5.3)
  });
}
```

The browser-free Vitest scans above are the deterministic gate that runs everywhere; this
Playwright step is the full-fidelity complement for CI runners that have a browser.

### Manual review

Automated tooling is necessary but not sufficient for full WCAG 2.1 AA conformance (6.1):
a manual pass with assistive technologies (screen readers, keyboard-only) and expert
review remains part of the acceptance process.

## Node version

Requires Node 20 (see `engines` in `package.json`).

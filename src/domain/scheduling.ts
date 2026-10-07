/**
 * Pure Scheduling_Page state helpers (design §11, "Scheduling Page", and Data Models
 * "SchedulingConfig").
 *
 * The Scheduling_Page embeds an external Scheduling_Service (e.g. Calendly) behind a
 * single documented configuration value — the booking URL. From that config value and
 * whether the embed actually loaded, the page renders exactly one of three states
 * (design §11, Requirements 12.2, 12.4, 12.5):
 *
 *  - `"placeholder"`     — the booking URL is unset, so the page shows clearly
 *                          provisional "online booking coming soon" copy (Requirement
 *                          12.5). This is the current, default state (the booking URL
 *                          ships UNSET).
 *  - `"embed"`           — the booking URL is configured AND the embed loaded, so the
 *                          external Scheduling_Service is shown and the Visitor books
 *                          within the page (Requirement 12.2).
 *  - `"error-fallback"`  — the booking URL is configured BUT the embed did not load, so
 *                          the page shows an error plus the business email and phone as
 *                          an alternative way to book, and keeps the Visitor on the page
 *                          (Requirement 12.4).
 *
 * These helpers are framework-free and side-effect-free so the Scheduling content
 * component and the unit tests share one source of truth for the state decision.
 *
 * ## Booking-URL configuration (documented)
 *
 * The booking URL is read from the single public build-time environment variable
 * **`PUBLIC_SCHEDULING_URL`** (see {@link SCHEDULING_CONFIG} / {@link readSchedulingConfig}).
 * It is UNSET by default, so the Scheduling_Page currently resolves to `"placeholder"`
 * and shows the coming-soon copy (Requirement 12.5). To enable the embed, set
 * `PUBLIC_SCHEDULING_URL` (e.g. in `.env` for local builds, or as a deployment
 * environment variable) to the external Scheduling_Service's embeddable booking URL
 * (e.g. `https://calendly.com/your-handle/intro`); the next static build will then
 * resolve to `"embed"`. The `PUBLIC_` prefix is required so Astro inlines the value into
 * the statically pre-rendered page at build time.
 */

/**
 * Scheduling_Page configuration (design "Data Models", `SchedulingConfig`). A single
 * documented value: the external Scheduling_Service booking URL, or `null`/empty when
 * not configured.
 */
export type SchedulingConfig = {
  /** External Scheduling_Service embed/booking URL; `null`/empty = not configured. */
  bookingUrl: string | null;
};

/** The three mutually exclusive states the Scheduling_Page can render (design §11). */
export type SchedulingState = "embed" | "placeholder" | "error-fallback";

/**
 * The documented environment variable holding the external Scheduling_Service booking
 * URL. `PUBLIC_`-prefixed so Astro inlines it into the statically pre-rendered page at
 * build time. UNSET by default (Requirement 12.5).
 */
export const SCHEDULING_URL_ENV_VAR = "PUBLIC_SCHEDULING_URL";

/**
 * Whether the Scheduling_Service embed should be attempted at all (design "Data Models").
 *
 * The booking URL counts as configured only when it is a non-empty string after
 * trimming; `null`, `undefined`, and blank/whitespace strings all mean "not configured"
 * and resolve to the coming-soon placeholder (Requirement 12.5).
 *
 * @param config the Scheduling_Page configuration
 * @returns `true` when a usable booking URL is present
 */
export function isSchedulingConfigured(config: SchedulingConfig): boolean {
  const url = config?.bookingUrl;
  return typeof url === "string" && url.trim().length > 0;
}

/**
 * Decide which of the three Scheduling_Page states to render (design §11).
 *
 * Pure decision table:
 *  - not configured                 -> `"placeholder"` (coming soon, Requirement 12.5)
 *  - configured and `embedLoaded`   -> `"embed"`        (book within the page, Req 12.2)
 *  - configured and NOT `embedLoaded` -> `"error-fallback"` (email + phone, stay on
 *                                        the page, Requirement 12.4)
 *
 * `embedLoaded` is ignored when the page is not configured — an unset booking URL always
 * resolves to the placeholder regardless of load status.
 *
 * @param config the Scheduling_Page configuration (booking URL)
 * @param embedLoaded whether the external Scheduling_Service embed has loaded
 * @returns the state the page should render
 */
export function resolveSchedulingState(
  config: SchedulingConfig,
  embedLoaded: boolean,
): SchedulingState {
  if (!isSchedulingConfigured(config)) {
    return "placeholder";
  }
  return embedLoaded ? "embed" : "error-fallback";
}

/**
 * Normalize a raw booking-URL value (typically from the environment) into a
 * {@link SchedulingConfig}. A missing, `null`, `undefined`, or blank value becomes
 * `bookingUrl: null` (not configured); otherwise the trimmed URL is kept.
 *
 * @param rawUrl the raw booking-URL value (e.g. `import.meta.env.PUBLIC_SCHEDULING_URL`)
 * @returns the normalized Scheduling_Page configuration
 */
export function readSchedulingConfig(
  rawUrl: string | null | undefined,
): SchedulingConfig {
  const trimmed = typeof rawUrl === "string" ? rawUrl.trim() : "";
  return { bookingUrl: trimmed.length > 0 ? trimmed : null };
}

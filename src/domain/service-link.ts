/**
 * Pure service form-link helpers (design §3).
 *
 * Each Service_Page shows a visible link to the Service_Request_Form that carries the
 * page's service as a preselection (Requirements 2.3, 2.4). The link encodes the
 * {@link ServiceKey} in a `service` query parameter (e.g. `/service-request?service=computer-repair`);
 * the form page recovers it to preselect the matching option. These functions are
 * framework-free and side-effect-free so the ServicePage component, the form page, and
 * the property-based tests share one source of truth and the round-trip
 * (Property 3) is directly testable.
 */

import type { Language, ServiceKey } from "./types.js";
import { pagePath } from "./navigation.js";

/** Path of the Service_Request_Form page the service link targets (French default). */
export const SERVICE_REQUEST_PATH = "/service-request";

/** Query-parameter name that carries the preselected service key. */
export const SERVICE_QUERY_PARAM = "service";

/** The three valid service keys, used to validate a recovered value. */
const SERVICE_KEYS: readonly ServiceKey[] = [
  "computer-learning",
  "computer-repair",
  "in-home-repair",
];

/** Type guard: is `value` one of the three known {@link ServiceKey} values? */
function isServiceKey(value: string | null): value is ServiceKey {
  return value !== null && (SERVICE_KEYS as readonly string[]).includes(value);
}

/**
 * Build the Service_Request_Form link for a given service, encoding the service key in
 * the `service` query parameter (Requirements 2.3, 2.4).
 *
 * The key is URL-encoded via {@link URLSearchParams}; because every {@link ServiceKey}
 * is already URL-safe this yields links like `/service-request?service=computer-repair`.
 *
 * @param key the service to preselect on the form
 * @returns a root-relative URL to the form with the service encoded
 */
export function buildServiceFormLink(key: ServiceKey): string {
  const params = new URLSearchParams({ [SERVICE_QUERY_PARAM]: key });
  return `${SERVICE_REQUEST_PATH}?${params.toString()}`;
}

/**
 * Build the Service_Request_Form link for a given service **in a given language**,
 * encoding the service key in the `service` query parameter (Requirements 2.3, 2.4).
 *
 * Like {@link buildServiceFormLink}, but the target path is the per-language route of
 * the Service_Request_Form resolved from the centralized {@link pagePath} mapping
 * (French at `/service-request`, English under `/en/service-request`), so a Service_Page
 * links to the form **in the same language** (design §1, "Bilingual architecture"). The
 * English Service_Page therefore links to the English form, the French to the French.
 *
 * @param language the active Supported_Language whose form route to target
 * @param key the service to preselect on the form
 * @returns a root-relative URL to that language's form with the service encoded
 */
export function buildServiceFormLinkFor(
  language: Language,
  key: ServiceKey,
): string {
  const params = new URLSearchParams({ [SERVICE_QUERY_PARAM]: key });
  return `${pagePath(language, "service-request")}?${params.toString()}`;
}

/**
 * Recover the preselected {@link ServiceKey} from a form-link URL.
 *
 * Accepts either a root-relative URL (as produced by {@link buildServiceFormLink}) or
 * an absolute URL. Returns the key when the `service` query parameter holds one of the
 * three known services, and `null` for a missing, empty, unknown, or malformed value —
 * so an unrecognized preselection simply leaves the form with no option preselected
 * rather than failing.
 *
 * @param url the URL to read the `service` parameter from
 * @returns the recovered {@link ServiceKey}, or `null` when none is valid
 */
export function readPreselectedService(url: string): ServiceKey | null {
  let params: URLSearchParams;
  try {
    // A base lets the URL parser accept root-relative URLs ("/service-request?...").
    params = new URL(url, "http://local.invalid").searchParams;
  } catch {
    return null;
  }
  const value = params.get(SERVICE_QUERY_PARAM);
  return isServiceKey(value) ? value : null;
}

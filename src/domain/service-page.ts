/**
 * Pure Service_Page content-model builder (design §3, "Service Pages").
 *
 * The ServicePage component (src/pages/services/[service].astro) must render, for each
 * service, the service name, a non-empty description, and an includes list with at
 * least one item (Requirement 2.2), plus a visible link to the Service_Request_Form
 * carrying the service as a preselection (Requirements 2.3, 2.4). It must also keep the
 * visitor on the page with a content-unavailable indication when any of that content is
 * missing (Requirements 2.5, 2.6).
 *
 * This module factors the content-model building out of the `.astro` file so it is pure,
 * framework-free, and directly testable: {@link buildServicePageModel} turns a
 * {@link Service} content entry into the exact {title, description, includes, formLink}
 * model the component renders, and reports `contentUnavailable` using the same rules the
 * page applies. The component imports and renders this model, and the property-based
 * tests (Properties 1 and 2) assert against it, so the two share one source of truth.
 */

import type { Service, ServiceKey } from "./types.js";
import { buildServiceFormLink } from "./service-link.js";

/**
 * The content model a Service_Page renders for one service.
 *
 * `title`, `description`, and `includes` are the normalized, display-ready content
 * (Requirement 2.2); `formLink` is the preselecting link to the Service_Request_Form
 * (Requirements 2.3, 2.4). When `contentUnavailable` is true the component renders the
 * error indication instead of the content and retains the visitor on the page
 * (Requirements 2.5, 2.6).
 */
export type ServicePageModel = {
  /** Service display name, trimmed. Empty only when the source title is missing/blank. */
  title: string;
  /** Non-empty service description, trimmed (Requirement 2.2). */
  description: string;
  /** Includes list with every empty/blank item removed; at least one item when valid. */
  includes: string[];
  /** Preselecting link to the Service_Request_Form (Requirements 2.3, 2.4). */
  formLink: string;
  /** The service key, used for the current-page nav indicator and the form link. */
  key: ServiceKey;
  /**
   * True when the name, description, or includes list is missing or empty, so the page
   * shows a content-unavailable indication rather than blank content (Requirements
   * 2.5, 2.6). False for a well-formed {@link Service}.
   */
  contentUnavailable: boolean;
};

/** Trim a value when it is a string; otherwise treat it as absent (empty string). */
function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Build the {@link ServicePageModel} the ServicePage component renders for a service.
 *
 * The content is normalized exactly as the page needs it:
 *  - `title` and `description` are trimmed; a non-string value becomes an empty string;
 *  - `includes` keeps only non-empty, trimmed string items;
 *  - `contentUnavailable` is true when the title, description, or filtered includes
 *    list is empty — the same guard the page uses to show the unavailable indication
 *    while keeping the visitor on the page (Requirements 2.5, 2.6);
 *  - `formLink` is the preselecting Service_Request_Form link for the service's key
 *    (Requirements 2.3, 2.4).
 *
 * For any well-formed {@link Service} (non-empty title, non-empty description, and at
 * least one non-empty includes item) the returned model carries that name, a non-empty
 * description, and at least one includes item (Property 1 / Requirement 2.2).
 *
 * @param service the service content entry to render
 * @returns the display-ready content model for the Service_Page
 */
export function buildServicePageModel(service: Service): ServicePageModel {
  const title = trimmedString(service?.title);
  const description = trimmedString(service?.description);
  const includes = Array.isArray(service?.includes)
    ? service.includes
        .map((item) => trimmedString(item))
        .filter((item) => item.length > 0)
    : [];

  const contentUnavailable =
    title.length === 0 || description.length === 0 || includes.length === 0;

  const key = service?.key;

  return {
    title,
    description,
    includes,
    formLink: buildServiceFormLink(key),
    key,
    contentUnavailable,
  };
}

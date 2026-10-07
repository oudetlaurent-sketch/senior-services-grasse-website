/**
 * Build-time content check for the {@link Service} entries (design §3, "Service
 * (content, build-time)").
 *
 * Requirement 2.1 requires exactly three services, one per {@link ServiceKey}, and
 * Requirement 2.2 requires each to carry a non-empty description and an includes list
 * with at least one item. This module asserts that shape and throws on any violation so
 * a content mistake fails `astro build` rather than shipping a blank or malformed
 * Service_Page. The astro.config.mjs integration invokes {@link assertServicesShape}
 * during the build; the pure {@link checkServicesShape} returns the problems so tests
 * can exercise both well-formed and malformed content without catching a throw.
 */

import type { Service, ServiceKey } from "../domain/types.js";
import { SERVICES, SERVICE_KEYS } from "./services.js";

/** The exact set of keys that must be present, one Service_Page per service. */
const REQUIRED_KEYS: readonly ServiceKey[] = SERVICE_KEYS;

/**
 * Validate the shape of a service content map against Requirements 2.1 and 2.2.
 *
 * Returns a list of human-readable problems; an empty list means the content is valid.
 * The checks are:
 *  - exactly the three required keys are present — no missing key and no extra key;
 *  - every entry's `key` matches the map key it is filed under;
 *  - every entry has a non-empty `title` (used as the Service_Page/nav label);
 *  - every entry has a non-empty `description` (non-empty after trimming);
 *  - every entry's `includes` is an array with at least one non-empty item.
 *
 * @param services the content map to validate (defaults to {@link SERVICES})
 * @returns the list of problems found; empty when the content is well-formed
 */
export function checkServicesShape(
  services: Record<string, Service> = SERVICES,
): string[] {
  const problems: string[] = [];

  const presentKeys = Object.keys(services);
  const requiredSet = new Set<string>(REQUIRED_KEYS);

  // Exactly the three required keys: flag any missing and any unexpected extra.
  for (const key of REQUIRED_KEYS) {
    if (!(key in services)) {
      problems.push(`Missing required service entry for key "${key}".`);
    }
  }
  for (const key of presentKeys) {
    if (!requiredSet.has(key)) {
      problems.push(`Unexpected service entry for unknown key "${key}".`);
    }
  }

  // Per-entry content shape for each required key that is actually present.
  for (const key of REQUIRED_KEYS) {
    const entry = services[key];
    if (entry === undefined) {
      continue; // Already reported as missing above.
    }

    if (entry.key !== key) {
      problems.push(
        `Service entry filed under "${key}" has mismatched key "${entry.key}".`,
      );
    }

    if (typeof entry.title !== "string" || entry.title.trim().length === 0) {
      problems.push(`Service "${key}" must have a non-empty title.`);
    }

    if (
      typeof entry.description !== "string" ||
      entry.description.trim().length === 0
    ) {
      problems.push(`Service "${key}" must have a non-empty description.`);
    }

    if (!Array.isArray(entry.includes) || entry.includes.length < 1) {
      problems.push(
        `Service "${key}" must list at least one item in its includes.`,
      );
    } else if (
      entry.includes.some(
        (item) => typeof item !== "string" || item.trim().length === 0,
      )
    ) {
      problems.push(
        `Service "${key}" includes must not contain empty items.`,
      );
    }
  }

  return problems;
}

/**
 * Assert the service content is well-formed, throwing on any violation so the build
 * fails (Requirements 2.1, 2.2). Called from the astro.config.mjs integration during
 * `astro build`.
 *
 * @param services the content map to validate (defaults to {@link SERVICES})
 * @throws Error listing every shape problem when the content is malformed
 */
export function assertServicesShape(
  services: Record<string, Service> = SERVICES,
): void {
  const problems = checkServicesShape(services);
  if (problems.length > 0) {
    throw new Error(
      `Service content check failed (Requirements 2.1, 2.2):\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
  }
}

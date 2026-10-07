/**
 * Pure, framework-free validation for the Service_Request_Form (design §6).
 *
 * `validateServiceRequest` takes the untrusted {@link RawFormInput} received from the
 * form POST and returns a {@link ValidationResult}: either the normalized
 * {@link ServiceRequestInput} on success, or every applicable {@link FieldError} on
 * failure. Validation never stops at the first error — it collects all of them so the
 * visitor sees a complete list (design §6, Requirement 4.4).
 *
 * Requirements traceability:
 * - 4.1  Collect name, phone, email, service, description with their length bounds.
 * - 4.2  name, phone, service are required.
 * - 4.4  Empty required fields each produce an error naming that field.
 * - 4.5  A non-empty email that is not well-formed yields an email-field error.
 * - 4.6  A phone with any disallowed character yields a phone-field error.
 */

import type {
  FieldError,
  RawFormInput,
  ServiceKey,
  ServiceRequestInput,
  ValidationResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Length bounds per field (design §6 / Requirement 4.1). */
const LENGTH_BOUNDS = {
  name: { min: 1, max: 100 },
  phone: { min: 1, max: 20 },
  email: { min: 1, max: 254 },
  description: { min: 0, max: 2000 },
} as const;

/** The three known service keys (design §6 / Requirement 2.1). */
const KNOWN_SERVICES: readonly ServiceKey[] = [
  "computer-learning",
  "computer-repair",
  "in-home-repair",
];

/**
 * Characters allowed in a phone number: digits, space, `+`, `-`, `(`, `)`
 * (Requirement 4.6). Any character outside this set makes the phone invalid.
 */
const PHONE_ALLOWED = /^[0-9 +\-()]*$/;

/**
 * Pragmatic email-format check (Requirement 4.5). Requires a single `@`, a
 * non-empty local part with no spaces, and a domain with at least one dot and no
 * spaces. Only applied when the email is non-empty.
 */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize an absent/undefined field to an empty string. */
function normalize(value: string | undefined | null): string {
  return typeof value === "string" ? value : "";
}

function isKnownService(value: string): value is ServiceKey {
  return (KNOWN_SERVICES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a raw form submission, collecting every applicable error.
 *
 * On success returns `{ ok: true, value }` with trimmed required fields, the phone
 * trimmed, a `service` narrowed to a {@link ServiceKey}, and `email` as a trimmed
 * string or `null` when omitted. On failure returns `{ ok: false, errors }` with one
 * entry per problem found.
 */
export function validateServiceRequest(input: RawFormInput): ValidationResult {
  // Normalize absent fields to empty strings before any checks.
  const rawName = normalize(input?.name);
  const rawPhone = normalize(input?.phone);
  const rawEmail = normalize(input?.email);
  const rawService = normalize(input?.service);
  const rawDescription = normalize(input?.description);

  // Trim required fields; email is trimmed for format checking and normalization.
  const name = rawName.trim();
  const phone = rawPhone.trim();
  const service = rawService.trim();
  const email = rawEmail.trim();
  // description is not a required/trimmed field; keep its submitted content but
  // measure its length as submitted (bounds 0–2000).
  const description = rawDescription;

  const errors: FieldError[] = [];

  // --- Required fields (name, phone, service) non-empty after trimming. ---
  if (name.length === 0) {
    errors.push({
      field: "name",
      code: "required",
      message: "Le nom est obligatoire.",
    });
  }
  if (phone.length === 0) {
    errors.push({
      field: "phone",
      code: "required",
      message: "Le numéro de téléphone est obligatoire.",
    });
  }
  if (service.length === 0) {
    errors.push({
      field: "service",
      code: "required",
      message: "Le choix d'un service est obligatoire.",
    });
  }

  // --- Length bounds. Only meaningful when the field is non-empty for the
  //     required fields (an empty required field already reported `required`). ---
  if (name.length > LENGTH_BOUNDS.name.max) {
    errors.push({
      field: "name",
      code: "too_long",
      message: `Le nom ne doit pas dépasser ${LENGTH_BOUNDS.name.max} caractères.`,
    });
  }

  if (phone.length > LENGTH_BOUNDS.phone.max) {
    errors.push({
      field: "phone",
      code: "too_long",
      message: `Le numéro de téléphone ne doit pas dépasser ${LENGTH_BOUNDS.phone.max} caractères.`,
    });
  }

  if (email.length > LENGTH_BOUNDS.email.max) {
    errors.push({
      field: "email",
      code: "too_long",
      message: `L'adresse e-mail ne doit pas dépasser ${LENGTH_BOUNDS.email.max} caractères.`,
    });
  }

  if (description.length > LENGTH_BOUNDS.description.max) {
    errors.push({
      field: "description",
      code: "too_long",
      message: `La description ne doit pas dépasser ${LENGTH_BOUNDS.description.max} caractères.`,
    });
  }

  // --- Service must be one of the three known keys (when present). ---
  if (service.length > 0 && !isKnownService(service)) {
    errors.push({
      field: "service",
      code: "unknown_service",
      message: "Veuillez choisir l'un des services proposés.",
    });
  }

  // --- Email format, only when a non-empty email was provided. ---
  if (email.length > 0 && !EMAIL_FORMAT.test(email)) {
    errors.push({
      field: "email",
      code: "invalid_email",
      message: "Veuillez saisir une adresse e-mail valide.",
    });
  }

  // --- Phone charset: only digits, space, +, -, (, ). ---
  // Checked against the trimmed phone; an empty phone already reported `required`.
  if (phone.length > 0 && !PHONE_ALLOWED.test(phone)) {
    errors.push({
      field: "phone",
      code: "invalid_phone",
      message:
        "Le numéro de téléphone ne peut contenir que des chiffres, des espaces et les caractères + - ( ).",
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Success: `service` is a known key here (non-empty and known).
  const value: ServiceRequestInput = {
    name,
    phone,
    email: email.length > 0 ? email : null,
    service: service as ServiceKey,
    description,
  };

  return { ok: true, value };
}

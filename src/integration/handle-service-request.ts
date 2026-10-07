/**
 * Form endpoint logic (design §5, "Form Endpoint (POST /api/service-request)").
 *
 * `handleServiceRequest` is the pure, injectable core of the serverless endpoint. It is
 * deliberately framework-free (no Astro/HTTP types) so it can be unit-tested without a
 * running server and reused unchanged behind any transport. The thin Astro route in
 * src/pages/api/service-request.ts parses the POST body into a {@link RawFormInput},
 * calls this function, and maps the returned {@link HandlerResult} to an HTTP response.
 *
 * Flow (design §5 sequence diagram):
 *   parse → validateServiceRequest
 *     - on failure → 422 with every {@link FieldError} and the echoed submitted values
 *       (Requirements 4.4–4.6), so the form can re-render with values retained.
 *     - on success → createServiceRequest + EmailSender.sendWithRetry, record a failed
 *       notification if every attempt fails (Requirement 4.8), then 200 with the
 *       Confirmation_Message, the generated `requestId`, and the `delivered` flag
 *       (Requirements 4.3, 4.7).
 *
 * Delivery outcome never blocks or discards the request: per design "Notification
 * errors", the visitor is confirmed once the request is created, and a non-delivered
 * notification is reconciled by the business from the failed-notification records.
 */

import { validateServiceRequest } from "../domain/validation.js";
import type { FieldError, RawFormInput } from "../domain/types.js";
import {
  submitServiceRequest,
  type SubmitServiceRequestDeps,
} from "./request-handler.js";

/**
 * The on-screen Confirmation_Message shown after a Service_Request is successfully
 * submitted (requirements glossary; Requirement 4.3). Senior-friendly: plain language,
 * reassuring, and explicit that follow-up will happen.
 */
export const CONFIRMATION_MESSAGE =
  "Merci ! Votre demande a bien été reçue. Nous vous recontacterons très bientôt.";

/**
 * Result of handling one submission (design §5). A discriminated union keyed by HTTP
 * `status` so the transport can map each case to a response without re-deriving intent:
 *   - 200: the request was created; carries the Confirmation_Message, the generated
 *     `requestId`, and whether the business notification was `delivered`.
 *   - 422: validation failed; carries every {@link FieldError} and the `echoed` raw
 *     input so the form re-renders with the visitor's values retained.
 */
export type HandlerResult =
  | {
      status: 200;
      confirmation: string;
      requestId: string;
      delivered: boolean;
    }
  | { status: 422; errors: FieldError[]; echoed: RawFormInput };

/** Dependencies for {@link handleServiceRequest}: the submission wiring deps (design §5). */
export type HandleServiceRequestDeps = SubmitServiceRequestDeps;

/**
 * Validate, create, and notify for one service-request submission (design §5).
 *
 * Pure with respect to its injected {@link HandleServiceRequestDeps}: given the same
 * input and deps (email sender, failed-notification store, id/clock seams) it returns a
 * deterministic {@link HandlerResult}. It performs no HTTP or body parsing — that is the
 * transport's job.
 *
 * @param payload the untrusted raw form input received from the POST
 * @param deps the email sender, failed-notification store, and optional id/clock seams
 * @returns a 422 result with field errors + echoed values on invalid input, or a 200
 *   result with the Confirmation_Message, generated requestId, and delivered flag on a
 *   created request
 */
export async function handleServiceRequest(
  payload: RawFormInput,
  deps: HandleServiceRequestDeps,
): Promise<HandlerResult> {
  const validation = validateServiceRequest(payload);

  if (!validation.ok) {
    // 422: return every error plus the submitted values so the form retains them
    // (Requirements 4.4–4.6, design "Form validation errors").
    return { status: 422, errors: validation.errors, echoed: payload };
  }

  // Valid: create and retain the request, then attempt the bounded, non-throwing
  // notification. `submitServiceRequest` records exactly one failed-notification entry
  // when every attempt fails (Requirement 4.8) and never discards the request.
  const { request, delivered } = await submitServiceRequest(validation.value, deps);

  return {
    status: 200,
    confirmation: CONFIRMATION_MESSAGE,
    requestId: request.id,
    delivered,
  };
}

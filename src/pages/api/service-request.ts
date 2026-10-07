/**
 * `POST /api/service-request` — the serverless form endpoint (design §5).
 *
 * This Astro API route is the thin transport layer around the pure, injectable
 * {@link handleServiceRequest} (src/integration/handle-service-request.ts). Its only
 * jobs are: parse the form-encoded POST body into a {@link RawFormInput}, build the
 * integration dependencies (a retrying {@link EmailSender} over a Nodemailer transport
 * and the {@link InMemoryFailedNotificationStore}), call the handler, and map the
 * returned {@link HandlerResult} to an HTTP response. All validation and
 * create-and-notify logic lives in the pure layer so it is testable without a server.
 *
 * Because the site is `output: "static"` (astro.config.mjs), this endpoint opts into
 * on-demand rendering with `export const prerender = false` so the hosting layer runs it
 * as a function rather than pre-rendering it.
 *
 * Response mapping:
 *   - 422 (validation failed): redirect (303) back to the Service_Request_Form at
 *     `/service-request` with the echoed submitted values and a JSON-encoded `error`
 *     array in the query string — the documented contract the form page hydrates to
 *     re-render with values retained and per-field errors shown (Requirements 4.4–4.6).
 *   - 200 (request created): render an accessible confirmation page carrying the
 *     Confirmation_Message (Requirement 4.3). Delivery state is internal and does not
 *     change what the visitor sees (design "Notification errors").
 *   - 500 (unhandled exception): render a generic, accessible error page that leaks no
 *     internals and tells the visitor to retry or phone the business (design "Unexpected
 *     server errors").
 */

import type { APIRoute } from "astro";
import type { RawFormInput } from "../../domain/types.js";
import { SERVICE_REQUEST_PATH } from "../../domain/service-link.js";
import { BUSINESS_INFO, phoneHref } from "../../content/business.js";
import {
  handleServiceRequest,
  type HandleServiceRequestDeps,
} from "../../integration/handle-service-request.js";
import {
  createEmailSender,
  createNodemailerTransport,
  loadEmailConfig,
} from "../../integration/email.js";
import { InMemoryFailedNotificationStore } from "../../integration/request-handler.js";

// Opt out of static pre-rendering: this route runs on demand at the hosting layer.
export const prerender = false;

/** Business phone shown on the 500 page (mirrors the SiteLayout footer). */
const BUSINESS_PHONE = BUSINESS_INFO.phone;
const BUSINESS_PHONE_HREF = phoneHref(BUSINESS_INFO.phone);

/** The five fields echoed back to the form on a 422 (design §4 query-string contract). */
const ECHO_FIELDS = ["name", "phone", "email", "service", "description"] as const;

/**
 * Read a POST body into a {@link RawFormInput}, normalizing absent fields to empty
 * strings. Accepts both `application/x-www-form-urlencoded` and `multipart/form-data`
 * (both surface through `Request.formData()`); every value is coerced to a string so the
 * untrusted shape matches what the validator expects.
 */
async function parseRawFormInput(request: Request): Promise<RawFormInput> {
  const data = await request.formData();
  const get = (key: string): string => {
    const value = data.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: get("name"),
    phone: get("phone"),
    email: get("email"),
    service: get("service"),
    description: get("description"),
  };
}

/**
 * Build the integration dependencies for one request. The email config is read from the
 * environment; a retrying {@link EmailSender} wraps a Nodemailer transport, and failed
 * notifications are recorded in an {@link InMemoryFailedNotificationStore}. A missing or
 * invalid email configuration throws here and is caught by the handler's 500 path.
 */
function buildDeps(): HandleServiceRequestDeps {
  // Astro/Vite loads .env into import.meta.env at dev and build time; it does NOT
  // populate process.env for server routes. Merge both so loadEmailConfig() (which
  // reads a plain env record) sees SMTP_*/EMAIL_* regardless of which Astro exposes.
  const env = {
    ...process.env,
    ...(import.meta.env as unknown as Record<string, string | undefined>),
  } as Record<string, string | undefined>;
  const config = loadEmailConfig(env);
  const transport = createNodemailerTransport(config);
  const emailSender = createEmailSender(transport, config);
  const failedNotificationStore = new InMemoryFailedNotificationStore();
  return { emailSender, failedNotificationStore };
}

/**
 * Build the 303 redirect back to the form carrying the echoed values and errors in the
 * query string (the contract the form page hydrates). Using a 303 turns the POST into a
 * GET of `/service-request?...` so a browser reload does not re-submit.
 */
function build422Redirect(
  result: Extract<Awaited<ReturnType<typeof handleServiceRequest>>, { status: 422 }>,
): Response {
  const params = new URLSearchParams();
  for (const field of ECHO_FIELDS) {
    params.set(field, result.echoed[field] ?? "");
  }
  params.set("error", JSON.stringify(result.errors));
  return new Response(null, {
    status: 303,
    headers: { Location: `${SERVICE_REQUEST_PATH}?${params.toString()}` },
  });
}

/** Minimal, dependency-free HTML escaping for the values interpolated into responses. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shared accessible HTML document shell for the confirmation and error pages. */
function htmlPage(title: string, main: string, status: number): Response {
  const body = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <main id="main-content">
${main}
    </main>
  </body>
</html>`;
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** 200 confirmation page carrying the Confirmation_Message (Requirement 4.3). */
function buildConfirmationPage(confirmation: string): Response {
  const main = `      <h1>Demande reçue</h1>
      <p>${escapeHtml(confirmation)}</p>
      <p><a href="/">Revenir à l'accueil</a></p>`;
  return htmlPage("Demande reçue", main, 200);
}

/**
 * Generic accessible 500 page (design "Unexpected server errors"). Leaks no internals;
 * tells the visitor to try again or phone the business.
 */
function buildServerErrorPage(): Response {
  const main = `      <h1>Une erreur est survenue</h1>
      <p role="alert">
        Nous n'avons pas pu envoyer votre demande pour le moment. Merci de
        réessayer dans quelques instants. Si le problème persiste, vous pouvez
        nous joindre par téléphone au
        <a href="tel:${BUSINESS_PHONE_HREF}">${escapeHtml(BUSINESS_PHONE)}</a>.
      </p>
      <p><a href="${SERVICE_REQUEST_PATH}">Revenir au formulaire de demande</a></p>`;
  return htmlPage("Une erreur est survenue", main, 500);
}

/**
 * Handle a service-request submission. Parses the body, delegates to the pure handler,
 * and maps the result to an HTTP response. Any unhandled exception (bad config, body
 * parse failure, unexpected error) falls through to the generic accessible 500 page so
 * the visitor is never stranded and no internals leak.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await parseRawFormInput(request);
    const result = await handleServiceRequest(payload, buildDeps());

    if (result.status === 422) {
      return build422Redirect(result);
    }

    return buildConfirmationPage(result.confirmation);
  } catch {
    // Unhandled failure anywhere above: generic accessible 500 (no internals leaked).
    return buildServerErrorPage();
  }
};

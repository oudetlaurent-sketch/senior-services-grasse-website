/**
 * Business identity and contact-details content model (design "Data Models",
 * "BusinessInfo and localized copy").
 *
 * A single source-controlled, typed entry holds the business name, French-formatted
 * phone, email, and the French Service_Area statement. Keeping it in one place means
 * the identity and service-area wording are authored once and reused site-wide: the
 * layout footer, the Home_Page, and the Service_Request_Form all read from
 * {@link BUSINESS_INFO} rather than hard-coding their own copies.
 *
 * This module is the single source of truth for the contact details that previously
 * lived inline in SiteLayout.astro. All visitor-facing strings are French, except the
 * business `name` ("Aide à la personne"), which is identical in both languages and is
 * not translated (Requirement 10.1). The phone is grouped in two-digit pairs per the
 * French convention (Requirement 7.9). The site-wide contact details carry the phone
 * and email only — no postal/street address or postal code (Requirement 8.2);
 * `serviceAreaStatement` states, in French, that the business serves the Grasse (06130)
 * Service_Area and its surrounding towns (Requirements 8.1, 8.3).
 */

import type { BusinessInfo } from "../domain/types.js";

/**
 * The business identity and French-formatted contact details, authored once and
 * reused across the layout footer, the Home_Page, and the Service_Request_Form.
 *
 * - `name` is "Aide à la personne", identical in both languages (Requirement 10.1).
 * - `phone` follows the French convention of two-digit pairs separated by spaces.
 * - `email` is the business email address.
 * - `serviceAreaStatement` is the French sentence stating the Grasse Service_Area and
 *   surrounding towns surfaced on the Home_Page (8.1) and the form (8.3).
 */
export const BUSINESS_INFO: BusinessInfo = {
  name: "Aide à la personne",
  phone: "07 81 18 01 50",
  email: "oudet.laurent@gmail.com",
  serviceAreaStatement:
    "Nous intervenons à Grasse (06130) et dans les communes alentour, " +
    "sur toute la Riviera : Mouans-Sartoux, Pégomas, Le Tignet, Peymeinade et au-delà.",
};

/**
 * Build the `tel:` href for the business phone number (E.164-style, no spaces).
 *
 * The French domestic number `0X XX XX XX XX` is expressed as `+33X XXXXXXXX` without
 * separators for the link target, while the display string keeps its spaced pairs.
 *
 * @param phone the display phone string (defaults to {@link BUSINESS_INFO.phone})
 * @returns a `tel:`-ready string such as `+33613061306`
 */
export function phoneHref(phone: string = BUSINESS_INFO.phone): string {
  const digits = phone.replace(/\D/g, "");
  // French domestic form "0XXXXXXXXX" -> international "+33XXXXXXXXX".
  if (digits.startsWith("0")) {
    return `+33${digits.slice(1)}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

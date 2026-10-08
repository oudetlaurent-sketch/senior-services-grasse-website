import { describe, it, expect } from "vitest";
import { BUSINESS_INFO, phoneHref } from "./business.js";

// BusinessInfo content model (design "Data Models", "BusinessInfo and localized copy").
//
// Validates: the business identity ("Aide à la personne", Requirement 10.1) and the
// French-formatted contact details that are the single source of truth for the layout
// footer, Home_Page, and Service_Request_Form — phone and email only, no postal address
// (Requirements 7.9, 8.2) — plus the French Service_Area statement surfaced on the
// Home_Page and form (Requirements 8.1, 8.3).

describe("BUSINESS_INFO content", () => {
  it('names the business "Aide à la personne" (same in both languages)', () => {
    expect(BUSINESS_INFO.name).toBe("Aide à la personne");
  });

  it("carries no postal/street address or postal code", () => {
    // The site-wide contact details are phone + email only (Requirement 8.2).
    expect(BUSINESS_INFO).not.toHaveProperty("address");
  });

  it("formats the phone in French two-digit pairs", () => {
    // Five space-separated two-digit groups, e.g. "06 13 06 13 06", or a masked placeholder like "XX XX XX XX XX".
    expect(BUSINESS_INFO.phone).toMatch(/^[0-9X]{2}( [0-9X]{2}){4}$/);
  });

  it("has a non-empty name, email, and French service-area statement", () => {
    expect(BUSINESS_INFO.name.trim().length).toBeGreaterThan(0);
    expect(BUSINESS_INFO.email).toContain("@");
    expect(BUSINESS_INFO.serviceAreaStatement.trim().length).toBeGreaterThan(0);
  });

  it("states the Grasse 06130 service area in the statement", () => {
    expect(BUSINESS_INFO.serviceAreaStatement).toContain("Grasse");
    expect(BUSINESS_INFO.serviceAreaStatement).toContain("06130");
  });
});

describe("phoneHref", () => {
  it("converts the French domestic number to an international tel: target", () => {
    expect(phoneHref("06 13 06 13 06")).toBe("+33613061306");
  });

  it("defaults to the business phone number", () => {
    expect(phoneHref()).toBe("");
  });

  it("preserves an already-international number", () => {
    expect(phoneHref("+33 6 13 06 13 06")).toBe("+33613061306");
  });
});

import { describe, it, expect } from "vitest";
import {
  isSchedulingConfigured,
  readSchedulingConfig,
  resolveSchedulingState,
  type SchedulingConfig,
} from "./scheduling.js";

/**
 * Unit tests for the pure Scheduling_Page state helpers (design §11, "Scheduling Page").
 *
 * `resolveSchedulingState` must return exactly one of the three states for every
 * config/load combination (Requirements 12.2, 12.4, 12.5):
 *  - not configured            -> "placeholder"      (coming soon, Req 12.5)
 *  - configured + loaded       -> "embed"            (book within the page, Req 12.2)
 *  - configured + not loaded   -> "error-fallback"   (email + phone, stay on page, Req 12.4)
 */

const CONFIGURED: SchedulingConfig = {
  bookingUrl: "https://calendly.com/example/intro",
};
const UNSET: SchedulingConfig = { bookingUrl: null };

describe("resolveSchedulingState — the three Scheduling_Page states", () => {
  it("returns 'placeholder' when the booking URL is unset (Requirement 12.5)", () => {
    // The coming-soon state is independent of embed load status.
    expect(resolveSchedulingState(UNSET, false)).toBe("placeholder");
    expect(resolveSchedulingState(UNSET, true)).toBe("placeholder");
  });

  it("returns 'embed' when configured and the embed loaded (Requirement 12.2)", () => {
    expect(resolveSchedulingState(CONFIGURED, true)).toBe("embed");
  });

  it("returns 'error-fallback' when configured but the embed did not load (Requirement 12.4)", () => {
    expect(resolveSchedulingState(CONFIGURED, false)).toBe("error-fallback");
  });

  it("treats an empty or whitespace-only booking URL as not configured", () => {
    expect(resolveSchedulingState({ bookingUrl: "" }, true)).toBe("placeholder");
    expect(resolveSchedulingState({ bookingUrl: "   " }, true)).toBe(
      "placeholder",
    );
  });
});

describe("isSchedulingConfigured", () => {
  it("is false for null, empty, and whitespace-only booking URLs", () => {
    expect(isSchedulingConfigured({ bookingUrl: null })).toBe(false);
    expect(isSchedulingConfigured({ bookingUrl: "" })).toBe(false);
    expect(isSchedulingConfigured({ bookingUrl: "  \t " })).toBe(false);
  });

  it("is true for a non-empty booking URL", () => {
    expect(isSchedulingConfigured(CONFIGURED)).toBe(true);
    expect(isSchedulingConfigured({ bookingUrl: "https://cal.example" })).toBe(
      true,
    );
  });
});

describe("readSchedulingConfig — environment normalization", () => {
  it("normalizes missing/blank values to an unconfigured (null) booking URL", () => {
    expect(readSchedulingConfig(undefined)).toEqual({ bookingUrl: null });
    expect(readSchedulingConfig(null)).toEqual({ bookingUrl: null });
    expect(readSchedulingConfig("")).toEqual({ bookingUrl: null });
    expect(readSchedulingConfig("   ")).toEqual({ bookingUrl: null });
  });

  it("keeps and trims a configured booking URL", () => {
    expect(readSchedulingConfig("https://calendly.com/example")).toEqual({
      bookingUrl: "https://calendly.com/example",
    });
    expect(readSchedulingConfig("  https://calendly.com/example  ")).toEqual({
      bookingUrl: "https://calendly.com/example",
    });
  });
});

import { describe, it, expect } from "vitest";
import { SERVICES, SERVICE_LIST, SERVICE_KEYS } from "./services.js";
import { checkServicesShape, assertServicesShape } from "./services.check.js";
import type { Service, ServiceKey } from "../domain/types.js";

// Build-time Service content check (design §3, "Service (content, build-time)").
//
// Validates: Requirement 2.1 — exactly one Service entry per ServiceKey — and the shape
// constraints the build-time check enforces so malformed content fails `astro build`:
// non-empty description and an includes list with at least one item (Requirement 2.2).

/** Deep-clone the shipped content so a test can mutate a copy without side effects. */
function cloneServices(): Record<ServiceKey, Service> {
  return structuredClone(SERVICES);
}

describe("Service content (shipped entries)", () => {
  it("defines exactly the three required service keys, one per ServiceKey", () => {
    expect(Object.keys(SERVICES).sort()).toEqual([...SERVICE_KEYS].sort());
    expect(SERVICE_LIST).toHaveLength(3);
  });

  it("files each entry under a key that matches its own key field", () => {
    for (const key of SERVICE_KEYS) {
      expect(SERVICES[key].key).toBe(key);
    }
  });

  it("gives every service a non-empty description and at least one includes item", () => {
    for (const service of SERVICE_LIST) {
      expect(service.description.trim().length).toBeGreaterThan(0);
      expect(service.includes.length).toBeGreaterThanOrEqual(1);
      for (const item of service.includes) {
        expect(item.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("checkServicesShape", () => {
  it("reports no problems for the shipped, well-formed content", () => {
    expect(checkServicesShape()).toEqual([]);
  });

  it("flags a missing required service key", () => {
    const services = cloneServices() as Record<string, Service>;
    delete services["computer-repair"];
    const problems = checkServicesShape(services);
    expect(problems.some((p) => p.includes("computer-repair"))).toBe(true);
  });

  it("flags an unexpected extra service key", () => {
    const services = cloneServices() as Record<string, Service>;
    services["lawn-mowing"] = {
      // deliberately invalid extra key
      key: "lawn-mowing" as ServiceKey,
      title: "Lawn Mowing",
      description: "Not a real service.",
      includes: ["Mowing"],
    };
    const problems = checkServicesShape(services);
    expect(problems.some((p) => p.includes("lawn-mowing"))).toBe(true);
  });

  it("flags an empty description", () => {
    const services = cloneServices();
    services["computer-learning"].description = "   ";
    const problems = checkServicesShape(services);
    expect(
      problems.some(
        (p) => p.includes("computer-learning") && p.includes("description"),
      ),
    ).toBe(true);
  });

  it("flags an empty includes list", () => {
    const services = cloneServices();
    services["in-home-repair"].includes = [];
    const problems = checkServicesShape(services);
    expect(
      problems.some(
        (p) => p.includes("in-home-repair") && p.includes("includes"),
      ),
    ).toBe(true);
  });

  it("flags an includes list that contains an empty item", () => {
    const services = cloneServices();
    services["computer-repair"].includes = ["Valid item", "   "];
    const problems = checkServicesShape(services);
    expect(
      problems.some(
        (p) => p.includes("computer-repair") && p.includes("includes"),
      ),
    ).toBe(true);
  });

  it("flags a key/entry mismatch", () => {
    const services = cloneServices();
    services["computer-learning"].key = "computer-repair";
    const problems = checkServicesShape(services);
    expect(problems.some((p) => p.includes("mismatched"))).toBe(true);
  });
});

describe("assertServicesShape", () => {
  it("does not throw for the shipped, well-formed content", () => {
    expect(() => assertServicesShape()).not.toThrow();
  });

  it("throws listing the problems when content is malformed", () => {
    const services = cloneServices();
    services["in-home-repair"].includes = [];
    services["computer-learning"].description = "";
    expect(() => assertServicesShape(services)).toThrow(/Service content check failed/);
    expect(() => assertServicesShape(services)).toThrow(/in-home-repair/);
    expect(() => assertServicesShape(services)).toThrow(/computer-learning/);
  });
});

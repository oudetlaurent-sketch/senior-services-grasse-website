import { defineConfig } from "vitest/config";

// Vitest is the test runner; fast-check (added as a dependency) supplies the
// property-based testing primitives. Property-based testing is NOT implemented from
// scratch — later tasks author properties on top of fast-check at >= 100 iterations.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.{test,spec}.ts", "src/**/*.{test,spec}.ts"],
    // Build the static site once before any worker starts, so the many test files that
    // assert against dist/ never race on concurrent `astro build` runs. See
    // test/support/global-setup.ts. ensureBuiltSite() then reuses this build.
    globalSetup: ["./test/support/global-setup.ts"],
  },
});

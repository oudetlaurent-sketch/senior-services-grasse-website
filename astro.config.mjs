// @ts-check
import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";
import { assertServicesShape } from "./src/content/services.check.ts";

// Build-time content check (design §3, "Service (content, build-time)"): a small
// inline Astro integration that runs the Service shape assertion before the build
// starts. Any violation of Requirement 2.1 (exactly the three service keys) or 2.2
// (non-empty description, includes with at least one item) throws here and fails
// `astro build` rather than shipping a blank or malformed Service_Page.
/** @returns {import('astro').AstroIntegration} */
function serviceContentCheck() {
  return {
    name: "service-content-check",
    hooks: {
      "astro:build:start": () => {
        assertServicesShape();
      },
    },
  };
}

// Static output: pages are pre-rendered to HTML/CSS at build time, satisfying the
// fast-load requirements (1.1, 2.2, 3.3). The only dynamic surface is the single
// POST /api/service-request form endpoint, which is handled by a serverless function
// at the hosting layer (framework-equivalent of src/pages/api) and wired in a later task.
export default defineConfig({
  output: "hybrid",
  // Netlify adapter: pre-rendered pages ship to the CDN; the one on-demand route
  // (POST /api/service-request, prerender=false) runs as a Netlify Function.
  adapter: netlify(),
  trailingSlash: "ignore",
  build: {
    format: "directory",
    // Inline every page's scoped component/page styles into its HTML rather than
    // letting Astro externalize larger bundles ("auto"). The decorative-background +
    // contrast-preserving scrim rules (Requirement 9.2) and the other scoped styles
    // must travel in each page's own <style> so the a11y/zoom audits can read them from
    // the built HTML, and so the critical styling arrives in the first response.
    inlineStylesheets: "always",
  },
  integrations: [serviceContentCheck()],
});

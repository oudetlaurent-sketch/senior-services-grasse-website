import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Vitest global setup: build the static site exactly once, before any worker starts.
 *
 * Several test files assert against the emitted `dist/` HTML (home-page content,
 * fixed-shape behaviors, label association, timing/keyboard integration, and the a11y
 * scans). Vitest runs each test *file* in its own worker process, so if each file builds
 * on demand they can run `astro build` concurrently against the same `dist/` directory —
 * and because Astro clears `dist/` at the start of a build, overlapping builds race and
 * produce spurious ENOENT/ENOTEMPTY failures or long lock-wait stalls.
 *
 * Running the single build here, in the one-time global setup, removes that contention
 * entirely: by the time any worker calls `ensureBuiltSite()` the artifact already exists
 * with a fresh stamp, so the helper returns immediately without building or waiting. This
 * keeps the suite deterministic and fast in CI.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..");
const distDir = resolve(projectRoot, "dist");
const lockDir = resolve(distDir, ".build-lock");
const stampFile = resolve(distDir, ".build-stamp");

export default function globalSetup(): void {
  // `npm run build` -> `astro build`. The Node 20 toolchain is on PATH when Vitest
  // launched; static output is deterministic.
  execFileSync("npm", ["run", "build"], {
    cwd: projectRoot,
    stdio: "pipe",
    env: process.env,
  });
  // Record a fresh stamp so ensureBuiltSite() reuses this build in every worker. The
  // build just recreated dist/, so (re)create the lock dir to hold the stamp.
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(stampFile, String(Date.now()), "utf8");
}

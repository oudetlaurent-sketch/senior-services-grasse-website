import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Shared `astro build` helper for the example-based/integration tests that assert against
 * the emitted `dist/` HTML (home-page content, fixed-shape behaviors).
 *
 * Vitest runs each test file in its own worker process, so when more than one file needs
 * the built site they can otherwise call `astro build` concurrently against the same
 * `dist/` directory. Astro clears `dist/` at the start of a build, so overlapping builds
 * race — one deletes a file the other is mid-write on, producing spurious ENOENT
 * failures. This helper serializes builds across processes with an atomic mkdir-based
 * lock and reuses a fresh build produced by another worker, so exactly one build runs and
 * every caller reads a complete, consistent artifact.
 */

const here = dirname(fileURLToPath(import.meta.url));
/** Project root (test/support -> test -> project). */
const projectRoot = resolve(here, "..", "..");
const distDir = resolve(projectRoot, "dist");
const distIndex = resolve(distDir, "index.html");

/** Lock directory (atomic create via mkdir) and the stamp recording the last build. */
const lockDir = resolve(distDir, ".build-lock");
const stampFile = resolve(distDir, ".build-stamp");

/** A build newer than this is reused instead of rebuilt (one build per test run). */
const FRESH_WINDOW_MS = 10 * 60 * 1000;
/** How long to wait for another worker's in-progress build before giving up. */
const LOCK_WAIT_MS = 180_000;
/** A lock older than this is treated as stale (crashed worker) and reclaimed. */
const STALE_LOCK_MS = 190_000;

/** Block the current worker thread for `ms` without a busy-spin (used while waiting on a lock). */
function sleep(ms: number): void {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  // Wait on a value that never changes, so this always times out after exactly `ms`.
  Atomics.wait(shared, 0, 0, ms);
}

function hasFreshBuild(): boolean {
  if (!existsSync(distIndex) || !existsSync(stampFile)) return false;
  try {
    const stampedAt = Number(readFileSync(stampFile, "utf8").trim());
    if (!Number.isFinite(stampedAt)) return false;
    return Date.now() - stampedAt < FRESH_WINDOW_MS;
  } catch {
    return false;
  }
}

function runBuild(): void {
  // `npm run build` -> `astro build`. The Node 20 toolchain is already on PATH when the
  // runner launched; static output is deterministic.
  execFileSync("npm", ["run", "build"], {
    cwd: projectRoot,
    stdio: "pipe",
    env: process.env,
  });
  // dist/ was just recreated by the build, so (re)create the lock dir to hold the stamp.
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(stampFile, String(Date.now()), "utf8");
}

/**
 * Ensure a fresh static build exists in `dist/`, building at most once across concurrent
 * Vitest workers. Returns the path to the built site's `dist/` directory.
 */
export function ensureBuiltSite(): string {
  if (hasFreshBuild()) return distDir;

  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    // Try to acquire the build lock atomically. mkdir fails if the directory exists.
    let acquired = false;
    try {
      mkdirSync(lockDir, { recursive: false });
      acquired = true;
    } catch {
      acquired = false;
    }

    if (acquired) {
      try {
        if (!hasFreshBuild()) {
          runBuild();
        }
      } finally {
        // Keep the stamp (inside dist/) but release the lock directory marker. The build
        // recreates dist/ and lockDir, so remove only if it still exists.
        try {
          if (existsSync(lockDir)) rmSync(lockDir, { recursive: true, force: true });
        } catch {
          // Non-fatal: a leftover lock dir is reclaimed as stale on the next run.
        }
      }
      return distDir;
    }

    // Another worker holds the lock. If it finished, reuse its build.
    if (hasFreshBuild()) return distDir;

    // Reclaim a stale lock from a crashed worker.
    try {
      const age = Date.now() - statSync(lockDir).mtimeMs;
      if (age > STALE_LOCK_MS) {
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
    } catch {
      // Lock vanished between checks; loop and try to acquire it.
      continue;
    }

    if (Date.now() > deadline) {
      // Last resort: build ourselves rather than hang the suite.
      runBuild();
      return distDir;
    }
    sleep(250);
  }
}

export { distDir, distIndex };

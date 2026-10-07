import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ensureBuiltSite } from "./support/build-site.js";

/**
 * Property 12: Every form input has a visible, programmatically linked label.
 *
 * Validates: Requirements 6.6
 *
 * For any input in the rendered Service_Request_Form, there exists a visible label whose
 * association target matches that input's identifier.
 *
 * The Service_Request_Form (src/pages/service-request.astro) is a static Astro page, so
 * the most faithful artifact to assert against is the HTML `astro build` actually emits.
 * This test builds the site once (if the artifact is missing it builds it) and inspects
 * the generated `dist/service-request/index.html`:
 *
 *   1. Extract every form control — <input>, <select>, <textarea> — that carries an id.
 *      (A control without an id cannot be programmatically linked; the extraction records
 *      such a control with a null id so the property catches it.)
 *   2. Extract every <label> element: its `for` target and whether it is a *visible*
 *      label (present in the markup, not `hidden`, not `aria-hidden="true"`, and with at
 *      least one non-whitespace character of text).
 *   3. The invariant: for each control, there exists a visible label whose `for` equals
 *      the control's id.
 *
 * To exercise the invariant as a property rather than a single assertion, fast-check
 * generates permutations and non-empty subsets of the discovered controls (via
 * `fc.shuffledSubarray`) and asserts the invariant holds for every control in each draw.
 * Because the control set is fixed by the static page, every draw must satisfy the
 * invariant — a single mislabeled or label-less control would fail across the run.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distForm = resolve(projectRoot, "dist", "service-request", "index.html");

/** A form control discovered in the rendered form, with its id (null when absent). */
interface Control {
  tag: "input" | "select" | "textarea";
  id: string | null;
}

/** A label discovered in the rendered form. */
interface Label {
  /** The `for` attribute's value, or null when the attribute is absent. */
  htmlFor: string | null;
  /** Whether this label is visible: rendered, not hidden, with non-blank text. */
  visible: boolean;
}

/** Read a named attribute from a start-tag's attribute text. Returns null when absent. */
function readAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = attrs.match(re);
  return m ? m[1] : null;
}

/** Whether a boolean attribute (e.g. `hidden`) is present on a start-tag's attributes. */
function hasBooleanAttr(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`, "i").test(attrs);
}

/** Extract every <input>/<select>/<textarea> control inside the form markup. */
function extractControls(formHtml: string): Control[] {
  const controls: Control[] = [];
  const re = /<(input|select|textarea)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formHtml)) !== null) {
    const tag = m[1].toLowerCase() as Control["tag"];
    const attrs = m[2];
    controls.push({ tag, id: readAttr(attrs, "id") });
  }
  return controls;
}

/** Extract every <label> and whether it is a visible, text-bearing label. */
function extractLabels(formHtml: string): Label[] {
  const labels: Label[] = [];
  const re = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formHtml)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    // Strip nested tags (e.g. the aria-hidden required marker <span>*</span>) to measure
    // the label's own visible text.
    const text = inner.replace(/<[^>]*>/g, "").trim();
    const hidden =
      hasBooleanAttr(attrs, "hidden") ||
      readAttr(attrs, "aria-hidden") === "true";
    labels.push({
      htmlFor: readAttr(attrs, "for"),
      visible: !hidden && text.length > 0,
    });
  }
  return labels;
}

/** Isolate the <form>…</form> region so only in-form controls/labels are considered. */
function extractForm(html: string): string {
  const m = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/i);
  return m ? m[0] : "";
}

let controls: Control[] = [];
let labels: Label[] = [];

/** A control has a visible, programmatically linked label iff some visible label's `for`
 *  equals the control's id. Written from the acceptance criterion, independent of the
 *  extraction helpers above. */
function hasVisibleLinkedLabel(control: Control): boolean {
  if (control.id === null || control.id.length === 0) return false;
  return labels.some((label) => label.visible && label.htmlFor === control.id);
}

describe("service request form — input/label association (Property 12)", () => {
  beforeAll(() => {
    // Build at most once across concurrent Vitest workers (see test/support/build-site.ts),
    // so parallel test files never clobber one another's dist/ mid-build. The output is
    // deterministic, so assertions track the current service-request.astro.
    ensureBuiltSite();
    expect(existsSync(distForm)).toBe(true);
    const formHtml = extractForm(readFileSync(distForm, "utf8"));
    expect(formHtml.length).toBeGreaterThan(0);
    controls = extractControls(formHtml);
    labels = extractLabels(formHtml);
    // Sanity: the form really does contain the five designed controls (name, phone,
    // email, service, description). Without this, the property could pass vacuously.
    expect(controls.length).toBeGreaterThanOrEqual(5);
  }, 190_000);

  it("associates every rendered form control with a visible label linked by id", () => {
    // Feature: senior-services-website, Property 12: Every form input has a visible,
    // programmatically linked label. Validates: Requirements 6.6
    fc.assert(
      fc.property(
        // Non-empty permuted subsets of the discovered controls: every draw is a set of
        // real controls from the rendered form, in arbitrary order.
        fc.shuffledSubarray(controls, { minLength: 1 }),
        (drawnControls) => {
          for (const control of drawnControls) {
            // Each control must carry an id to be programmatically linkable...
            expect(control.id, `control <${control.tag}> is missing an id`).not.toBeNull();
            // ...and a visible label must target that id.
            expect(
              hasVisibleLinkedLabel(control),
              `control <${control.tag}> id="${control.id}" has no visible <label for="${control.id}">`,
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("extracts the five designed controls, each with its own visible label", () => {
    // A concrete cross-check of the extraction + invariant against the known form shape.
    const ids = controls.map((c) => c.id);
    for (const id of [
      "field-name",
      "field-phone",
      "field-email",
      "field-service",
      "field-description",
    ]) {
      expect(ids).toContain(id);
    }
    for (const control of controls) {
      expect(hasVisibleLinkedLabel(control)).toBe(true);
    }
  });
});

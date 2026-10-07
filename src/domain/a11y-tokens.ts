/**
 * Accessibility / readability token audit helpers (pure).
 *
 * These framework-free functions let the automated accessibility scans (task 12.3)
 * audit the design tokens declared in `src/styles/tokens.css` against the measurable
 * readability requirements, without a browser:
 *
 *   - body text size >= 18px                                   (Requirement 5.1)
 *   - text/background color pairs meeting WCAG 2.1 AA contrast  (Requirement 5.2)
 *   - interactive target size >= 44px and spacing >= 8px        (Requirement 5.4)
 *
 * Everything here operates on strings and numbers only; the test parses the CSS file
 * once and feeds the extracted token values through these helpers. The contrast math
 * is the WCAG 2.1 relative-luminance / contrast-ratio formula, implemented from the
 * specification rather than taken from a library so the audit has an independent
 * reference.
 */

/** A single `--name: value;` custom property parsed from a `:root { ... }` block. */
export type CssTokens = Readonly<Record<string, string>>;

/**
 * Parse the custom properties declared in every `:root { ... }` block of a CSS source.
 *
 * Only `--custom-property: value;` declarations are collected; comments and other
 * rules are ignored. Values are trimmed. Later declarations of the same property win,
 * matching the CSS cascade within a single file. The parse is deterministic and
 * dependency-free (a small regex scan), which keeps the audit fast and stable in CI.
 */
export function parseRootTokens(css: string): CssTokens {
  // Strip block comments first so `/* --x: y; */` is never mistaken for a declaration.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: Record<string, string> = {};

  const rootBlock = /:root\s*\{([^}]*)\}/g;
  let block: RegExpExecArray | null;
  while ((block = rootBlock.exec(withoutComments)) !== null) {
    const body = block[1] ?? "";
    const decl = /(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = decl.exec(body)) !== null) {
      const name = m[1]!.trim();
      const value = m[2]!.trim();
      tokens[name] = value;
    }
  }

  return tokens;
}

/**
 * Convert a length token to pixels. Supports `px` and `rem` (relative to a 16px root
 * by default, as the site keeps the root at the browser default). Returns `null` for
 * units this audit does not reason about numerically.
 */
export function lengthToPx(value: string, rootPx = 16): number | null {
  const trimmed = value.trim();
  const px = /^(-?\d*\.?\d+)px$/.exec(trimmed);
  if (px) {
    return Number.parseFloat(px[1]!);
  }
  const rem = /^(-?\d*\.?\d+)rem$/.exec(trimmed);
  if (rem) {
    return Number.parseFloat(rem[1]!) * rootPx;
  }
  const unitless = /^(-?\d*\.?\d+)$/.exec(trimmed);
  if (unitless) {
    return Number.parseFloat(unitless[1]!);
  }
  return null;
}

/** An sRGB color as integer channels in [0, 255]. */
export type Rgb = { r: number; g: number; b: number };

/**
 * Parse a `#rgb` or `#rrggbb` hex color into {@link Rgb}. Returns `null` for formats
 * this audit does not handle (the token file uses hex exclusively).
 */
export function parseHexColor(value: string): Rgb | null {
  const trimmed = value.trim();
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed);
  if (short) {
    return {
      r: Number.parseInt(short[1]! + short[1]!, 16),
      g: Number.parseInt(short[2]! + short[2]!, 16),
      b: Number.parseInt(short[3]! + short[3]!, 16),
    };
  }
  const long = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(trimmed);
  if (long) {
    return {
      r: Number.parseInt(long[1]!, 16),
      g: Number.parseInt(long[2]!, 16),
      b: Number.parseInt(long[3]!, 16),
    };
  }
  return null;
}

/** The WCAG relative luminance of an sRGB color (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * The WCAG 2.1 contrast ratio between two colors, in the range [1, 21]. The formula is
 * `(Llighter + 0.05) / (Ldarker + 0.05)`, independent of which argument is lighter.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 AA contrast thresholds. */
export const CONTRAST_AA_NORMAL = 4.5;
export const CONTRAST_AA_LARGE = 3;

#!/usr/bin/env tsx
/**
 * Design-token enforcement for shape: radius and shadow.
 *
 * Colour has had a token system, a lint rule and a pre-commit hook for a long
 * time, and every page converged on it. Shape had none of those, so every
 * redesign invented its own radius scale (Tailwind's, Mantine's, raw px in a
 * feature stylesheet, or `--radius-*` tokens scoped to one page). This script
 * is the shape equivalent of the colour hook. See
 * dev-docs/styling-architecture.md, "Shape tokens".
 *
 * Three checks:
 *
 * 1. Undefined custom properties (hard fail). `var(--x)` where `--x` is
 *    declared nowhere under src/. References are read from src/ AND from
 *    tailwind.config.ts: a utility mapped to an undeclared variable
 *    (`bg-warning-bg` -> `var(--color-warning-bg)`) compiles to a declaration
 *    that paints nothing, and no file under src/ contains the `var()` text.
 *    An undefined variable makes the declaration
 *    invalid at computed-value time, so `border-radius: var(--radius-md)`
 *    silently renders 0 and `font-family: var(--font-sans)` silently
 *    inherits. This is exactly how the meeting detail page shipped with square
 *    corners. References with a fallback (`var(--x, 4px)`) are allowed.
 *
 * 2. Raw shape values (ratcheted). `border-radius: 10px` in CSS,
 *    `borderRadius: 8` in a style object, `rounded-[10px]`, `radius={12}`,
 *    box-shadows painted with a colour literal, and hand-rolled surfaces: a
 *    className that draws a box itself (`rounded-* border bg-surface-*`)
 *    instead of using `<Panel>` from src/app/_components/ui. Existing debt is recorded
 *    per file in scripts/design-tokens-baseline.json; a file may never have
 *    MORE raw values than its baseline, and a file not in the baseline must
 *    have none. When you clear debt, run with --update-baseline so the
 *    ceiling comes down with you. The `boxShadow` / `dropShadow` maps of
 *    tailwind.config.ts are read the same way: a theme shadow painted with a
 *    colour literal is a raw shadow, and the config has no baseline.
 *
 * 3. Arbitrary Tailwind values (hard fail). `rounded-[...]` and `shadow-[...]`
 *    bypass the scale entirely. These are also caught by ESLint
 *    (no-restricted-syntax in .eslintrc.cjs) so the editor flags them on save;
 *    this is the CSS-side and CI backstop.
 *
 * 4. Scoped shape tokens (hard fail). A `--radius-*` / `--shadow-*` (or a
 *    per-page copy such as `--ch-radius-*`) declared anywhere but the `:root`
 *    and colour-scheme blocks of globals.css. A scoped copy shadows the
 *    global scale for one page, which is how the pages drifted apart in the
 *    first place.
 *
 * Usage:
 *   tsx scripts/check-design-tokens.ts                  # check
 *   tsx scripts/check-design-tokens.ts --update-baseline
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface Finding {
  file: string;
  line: number;
  kind:
    | "undefined-var"
    | "scoped-shape-token"
    | "raw-radius"
    | "raw-shadow"
    | "raw-surface"
    | "panel-padding-conflict"
    | "arbitrary-tailwind"
    | "numeric-mantine-radius";
  detail: string;
}

export type Baseline = Record<string, number>;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BASELINE_PATH = path.join(HERE, "design-tokens-baseline.json");

const SCAN_EXT = new Set([".css", ".ts", ".tsx"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "test"]);

// Files outside src/ that turn a class name into a `var()` reference. The
// Tailwind theme is where `bg-error-bg` becomes `var(--color-error-bg)`, so a
// token it names must be declared just like one a stylesheet names.
export const ROOT_CONFIG_FILES = ["tailwind.config.ts"];

// Files allowed to hold raw colour values for the colour hook (see
// .husky/pre-commit). They may paint a shadow with a literal because that is
// where the shadow tokens themselves are defined.
const SHADOW_DEFINITION_FILES = new Set([
  "src/styles/globals.css",
  "src/styles/colors.ts",
  "src/styles/mantineTheme.ts",
]);

// The primitives are the one place allowed to compose a surface by hand.
const PRIMITIVES_DIR = "src/app/_components/ui/";

// Vendor-owned variable namespaces we never declare ourselves: Tailwind
// internals, React Flow, and Mantine's theme variables, which MantineProvider
// generates at runtime from the theme (`--mantine-color-brand-4`). Mantine's
// component-scoped vars (`--tab-border-color`, `--button-bg`, ...) carry no
// prefix, so those are collected from its stylesheets below instead.
const EXTERNAL_VAR_PREFIXES = ["--mantine-", "--tw-", "--xy-", "--rf-"];
// Declared by a package at build time, with no stylesheet to read: the `geist`
// font package emits `--font-geist-sans` on the class every root layout puts
// on <html> (`GeistSans.variable`).
const EXTERNAL_VARS = new Set(["--font-geist-sans"]);
const VENDOR_STYLESHEETS = [
  "node_modules/@mantine/core/styles.css",
  "node_modules/@mantine/dates/styles.css",
  "node_modules/@mantine/notifications/styles.css",
  "node_modules/@mantine/tiptap/styles.css",
  "node_modules/@mantine/code-highlight/styles.css",
];

export function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (SCAN_EXT.has(path.extname(entry.name))) {
      if (/\.(test|integration\.test)\.tsx?$/.test(entry.name)) continue;
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Blank out block comments and whole-line `//` comments, keeping line numbers. */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, (c) => c.replace(/[^\n]/g, " "));
}

/**
 * Every custom property the source declares. CSS (`--x: 1px;`), style-object
 * keys (`'--x': 1`), and `setProperty('--x', …)` all count: a property set
 * from JS at runtime is as defined as one in a stylesheet. So does the
 * `variable: '--font-x'` option of a next/font loader (src/lib/fonts.ts), which
 * emits a class declaring that property.
 *
 * Only real declaration positions count: a CSS declaration starts a
 * statement (after `{`, `;` or a line start) and a JS key follows `{`, `,` or
 * a line start. A ternary like `dark ? '--a' : '--b'` or a name in a comment
 * must NOT register, or an undefined reference to it would pass the check.
 */
export function collectDefinitions(sources: Map<string, string>): Set<string> {
  const defs = new Set<string>();
  const cssDecl = /(?:^|[{;])\s*(--[A-Za-z0-9_-]+)\s*:/gm;
  const jsKey = /(?:^|[{,])\s*['"](--[A-Za-z0-9_-]+)['"]\s*:/gm;
  const setProp = /setProperty\(\s*['"](--[A-Za-z0-9_-]+)['"]/g;
  const fontVariable = /(?:^|[{,])\s*variable\s*:\s*['"](--font-[A-Za-z0-9_-]+)['"]/gm;
  for (const raw of sources.values()) {
    const text = stripComments(raw);
    for (const m of text.matchAll(cssDecl)) defs.add(m[1]!);
    for (const m of text.matchAll(jsKey)) defs.add(m[1]!);
    for (const m of text.matchAll(setProp)) defs.add(m[1]!);
    for (const m of text.matchAll(fontVariable)) defs.add(m[1]!);
  }
  return defs;
}

const TOKENS_FILE = "src/styles/globals.css";
// `--radius-*`, `--shadow-*`, and a per-page copy with a short namespace
// (`--ch-radius-*`). `--color-shadow*` is a colour token and must not match.
const SHAPE_TOKEN_DECL = /(?:^|[{;])\s*(--(?:[a-z]{1,4}-)?(?:radius|shadow)-[A-Za-z0-9_-]+)\s*:/gm;

/** The selector that owns the block an index sits in (text between the last unmatched `{` and its preceding `}`/start). */
function enclosingSelector(text: string, index: number): string {
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    const ch = text[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        const start = Math.max(
          text.lastIndexOf("}", i - 1),
          text.lastIndexOf("{", i - 1),
          text.lastIndexOf(";", i - 1),
        );
        return text.slice(start + 1, i).trim();
      }
      depth--;
    }
  }
  return "";
}

/**
 * `--radius-*` / `--shadow-*` (and per-page copies like `--ch-radius-*`) may
 * only be declared on `:root` or a colour-scheme block in globals.css.
 * `--color-shadow` is a colour token, not a shape token, and is not matched.
 */
export function findScopedShapeTokens(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const clean = stripComments(text);
  for (const m of clean.matchAll(SHAPE_TOKEN_DECL)) {
    const name = m[1]!;
    const index = (m.index ?? 0) + m[0].indexOf(name);
    const selector = file === TOKENS_FILE ? enclosingSelector(clean, index) : "";
    const allowed =
      file === TOKENS_FILE && /^(:root|\[data-mantine-color-scheme=[^\]]+\])$/.test(selector);
    if (!allowed) {
      out.push({
        file,
        line: lineOf(text, index),
        kind: "scoped-shape-token",
        detail: `${name} declared ${selector ? `inside \`${selector}\`` : "outside globals.css"} — shape tokens live only on :root; a scoped copy shadows the global scale for one page`,
      });
    }
  }
  return out;
}

export function findUndefinedVars(
  file: string,
  text: string,
  defs: Set<string>,
): Finding[] {
  const out: Finding[] = [];
  // Only a reference that ends right after the name, with no fallback, can
  // silently fail. `var(--x, 4px)` has a fallback; `var(--x-${y})` is a
  // template and cannot be resolved statically.
  const ref = /var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g;
  for (const m of text.matchAll(ref)) {
    const name = m[1]!;
    if (EXTERNAL_VAR_PREFIXES.some((p) => name.startsWith(p))) continue;
    if (EXTERNAL_VARS.has(name)) continue;
    if (defs.has(name)) continue;
    out.push({
      file,
      line: lineOf(text, m.index ?? 0),
      kind: "undefined-var",
      detail: `var(${name}) is declared nowhere under src/ — it resolves to nothing`,
    });
  }
  return out;
}

const RADIUS_TOKEN_HINT =
  "use var(--radius-xs|sm|md|lg|xl|2xl|full) (CSS), the matching rounded-* class, or a Mantine radius size";

/** A border-radius value is token-based when every term is a var(), 0, or a percentage. */
export function isTokenRadius(value: string): boolean {
  const v = value.trim().replace(/\s*!important$/, "");
  if (/^(inherit|initial|unset|revert)$/.test(v)) return true;
  if (/^calc\(.*var\(/.test(v)) return true;
  return v
    .split(/\s+|\s*\/\s*/)
    .filter(Boolean)
    .every((term) => /^(var\(--[A-Za-z0-9_-]+\)|0|\d+(\.\d+)?%)$/.test(term));
}

/** A shadow value is token-based when it paints with no colour literal. */
export function isTokenShadow(value: string): boolean {
  const v = value.trim();
  if (/^(none|inherit|initial|unset)$/.test(v)) return true;
  return !/(rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b|\b(black|white)\b)/.test(v);
}

/**
 * A class list that paints a bordered, rounded, surfaced box by hand - the
 * three things Panel exists to own. Any one or two of them is fine (a border
 * under a toolbar, a rounded image); all three together is a card.
 */
export function isHandRolledSurface(classes: string): boolean {
  const toks = classes.split(/\s+/);
  const hasBorder = toks.some((t) => /^border(-[xytblrse])?(-[0248])?$/.test(t));
  const hasRadius = toks.some((t) =>
    /^rounded(-(t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?(-(xs|sm|md|lg|xl|2xl|3xl))?$/.test(t),
  );
  const hasSurface = toks.some((t) => /^bg-(surface|background)-/.test(t));
  return hasBorder && hasRadius && hasSurface;
}

/**
 * Every class list a `className` can carry: a static `className="…"`, and for
 * `className={…}` (cx calls, ternaries, template literals) all the string
 * literals in the expression joined together, so a surface split across a
 * conditional is still one surface.
 */
export function classNameValues(text: string): { index: number; classes: string }[] {
  const out: { index: number; classes: string }[] = [];
  for (const m of text.matchAll(/className=(["'])([^"']*)\1/g)) {
    out.push({ index: m.index ?? 0, classes: m[2]! });
  }
  for (const m of text.matchAll(/className=\{/g)) {
    const start = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let i = start;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const expr = text.slice(start, i - 1);
    const literals = [...expr.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((l) =>
      l[2]!.replace(/\$\{[^}]*\}/g, " "),
    );
    if (literals.length) out.push({ index: m.index ?? 0, classes: literals.join(" ") });
  }
  return out;
}

export function findRawValues(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const isCss = file.endsWith(".css");
  const push = (index: number, kind: Finding["kind"], detail: string) =>
    out.push({ file, line: lineOf(text, index), kind, detail });

  if (isCss) {
    for (const m of text.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
      if (!isTokenRadius(m[1]!)) {
        push(m.index ?? 0, "raw-radius", `border-radius: ${m[1]!.trim()} — ${RADIUS_TOKEN_HINT}`);
      }
    }
    if (!SHADOW_DEFINITION_FILES.has(file)) {
      for (const m of text.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
        if (!isTokenShadow(m[1]!)) {
          push(m.index ?? 0, "raw-shadow", `box-shadow painted with a colour literal — use var(--shadow-sm|md|lg|xl) or a token colour`);
        }
      }
    }
    return out;
  }

  // TS / TSX
  for (const m of text.matchAll(/borderRadius\s*:\s*(['"`]?)([^,}\n]+)/g)) {
    const raw = m[2]!.trim().replace(/['"`]+$/, "");
    // A number, a px/rem string, or a Mantine rem() call are raw; an
    // identifier or a var() string is not.
    if (/^(\d|rem\()/.test(raw) && !/^(0|\d+(\.\d+)?%)$/.test(raw)) {
      push(m.index ?? 0, "raw-radius", `borderRadius: ${raw} — ${RADIUS_TOKEN_HINT}`);
    }
  }
  if (!SHADOW_DEFINITION_FILES.has(file)) {
    for (const m of text.matchAll(/boxShadow\s*:\s*(['"`])([^'"`]+)\1/g)) {
      if (!isTokenShadow(m[2]!)) {
        push(m.index ?? 0, "raw-shadow", `boxShadow painted with a colour literal — use var(--shadow-*) or a token colour`);
      }
    }
  }
  if (!file.startsWith(PRIMITIVES_DIR)) {
    for (const { index, classes } of classNameValues(text)) {
      if (isHandRolledSurface(classes)) {
        push(index, "raw-surface", `className draws its own box (${classes.trim().slice(0, 60)}…) — use <Panel> from ~/app/_components/ui`);
      }
    }
    for (const m of text.matchAll(/<Panel\b[^>]*>/g)) {
      const tag = m[0];
      if (/\bpadding=["']none["']/.test(tag)) continue;
      const cls = /className=(["'])([^"']*)\1/.exec(tag)?.[2] ?? "";
      if (cls.split(/\s+/).some((t) => /^p[xytblrse]?-/.test(t))) {
        push(m.index ?? 0, "panel-padding-conflict", `<Panel> with a padding step and p-* in className — pick a padding step, or padding="none" and put the padding in className`);
      }
    }
  }
  for (const m of text.matchAll(/\b(rounded|shadow)-\[[^\]]+\]/g)) {
    push(m.index ?? 0, "arbitrary-tailwind", `${m[0]} — arbitrary values bypass the scale; ${RADIUS_TOKEN_HINT}`);
  }
  for (const m of text.matchAll(/\bradius=\{\s*\d/g)) {
    push(m.index ?? 0, "numeric-mantine-radius", `numeric radius prop — use radius="xs|sm|md|lg|xl" so Mantine follows the shared scale`);
  }
  return out;
}

/** Index just past the string literal that opens at `start` (a `'`, `"` or `` ` ``). */
function skipString(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") i += 2;
    else if (ch === quote) return i + 1;
    // Only a template literal spans lines; an unclosed '…' ends with its line.
    else if (ch === "\n" && quote !== "`") return i;
    else i++;
  }
  return text.length;
}

/**
 * Blank out every comment in TS/JS source, keeping line numbers and string
 * literals. Unlike stripComments this reads the source left to right, so it
 * also removes a trailing `// …` after code, leaves `//` inside a string
 * alone (`'https://…'`), and is not thrown by an apostrophe in a comment.
 */
export function stripCodeComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const next = text[i + 1];
    let end = -1;
    if (ch === '"' || ch === "'" || ch === "`") {
      end = skipString(text, i);
      out += text.slice(i, end);
    } else if (ch === "/" && next === "/") {
      const newline = text.indexOf("\n", i);
      end = newline === -1 ? text.length : newline;
      out += " ".repeat(end - i);
    } else if (ch === "/" && next === "*") {
      const close = text.indexOf("*/", i + 2);
      end = close === -1 ? text.length : close + 2;
      out += text.slice(i, end).replace(/[^\n]/g, " ");
    }
    if (end === -1) {
      out += ch;
      i++;
    } else {
      i = end;
    }
  }
  return out;
}

// Tailwind theme keys whose values are shadows: `shadow-*` reads `boxShadow`,
// `drop-shadow-*` reads `dropShadow`. The key may be quoted (`'boxShadow': {`).
const THEME_SHADOW_MAP =
  /(?:\b(boxShadow|dropShadow)|(["'`])(boxShadow|dropShadow)\2)\s*:\s*\{/g;

/**
 * Shadows a Tailwind theme paints with a colour literal:
 * `boxShadow: { card: '0 1px 2px rgba(0,0,0,.1)' }`. `shadow-card` is then a
 * utility that looks like a token and is not one. findRawValues cannot see
 * it (the entry's key is `card`, not `boxShadow`), and the pre-commit colour
 * grep only matches hex. Reported as `raw-shadow`, so it goes through the
 * same per-file ratchet as a raw shadow in a stylesheet: the config is not
 * in the baseline, so it may have none.
 */
export function findThemeShadowLiterals(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  const clean = stripCodeComments(text);
  for (const m of clean.matchAll(THEME_SHADOW_MAP)) {
    const mapName = m[1] ?? m[3]!;
    const open = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let i = open;
    while (i < clean.length && depth > 0) {
      const ch = clean[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        // A brace inside a string is not structure.
        i = skipString(clean, i);
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const block = clean.slice(open, i - 1);
    // Every string literal is consumed in order, keys included, and a key
    // (`'2xl': …`) is skipped afterwards. Rejecting keys inside the pattern
    // would restart the match on the key's closing quote and pair every
    // later quote with the wrong partner.
    for (const v of block.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
      const value = v[2]!;
      const start = v.index ?? 0;
      // A key is followed by `:` AND opens an entry (starts the map, or
      // follows `{` or `,`). The colon alone is not enough: the then-branch
      // of a ternary (`dark ? '0 1px rgba(…)' : 'var(--shadow-sm)'`) is
      // followed by one too, and it is a value.
      const opensEntry = /(?:^|[{,])\s*$/.test(block.slice(0, start));
      const beforeColon = /^\s*:/.test(block.slice(start + v[0].length));
      if (opensEntry && beforeColon) continue;
      if (isTokenShadow(value)) continue;
      out.push({
        file,
        line: lineOf(text, open + (v.index ?? 0)),
        kind: "raw-shadow",
        detail: `${mapName} theme value painted with a colour literal (${value.trim().slice(0, 40)}) — declare a --shadow-* token in globals.css and reference it`,
      });
    }
  }
  return out;
}

const RATCHETED: ReadonlySet<Finding["kind"]> = new Set(["raw-radius", "raw-shadow", "raw-surface"]);

export interface Report {
  hard: Finding[];
  ratcheted: Finding[];
  counts: Baseline;
  regressions: { file: string; count: number; allowed: number }[];
  improvements: { file: string; count: number; allowed: number }[];
}

export function buildReport(findings: Finding[], baseline: Baseline): Report {
  const hard = findings.filter((f) => !RATCHETED.has(f.kind));
  const ratcheted = findings.filter((f) => RATCHETED.has(f.kind));
  const counts: Baseline = {};
  for (const f of ratcheted) counts[f.file] = (counts[f.file] ?? 0) + 1;
  const regressions: Report["regressions"] = [];
  const improvements: Report["improvements"] = [];
  const files = new Set([...Object.keys(counts), ...Object.keys(baseline)]);
  for (const file of [...files].sort()) {
    const count = counts[file] ?? 0;
    const allowed = baseline[file] ?? 0;
    if (count > allowed) regressions.push({ file, count, allowed });
    else if (count < allowed) improvements.push({ file, count, allowed });
  }
  return { hard, ratcheted, counts, regressions, improvements };
}

/**
 * Everything the checks read, keyed by repo-relative path: every scannable
 * file under src/, plus the root config files that reference tokens.
 */
export function loadSources(root: string = ROOT): Map<string, string> {
  const sources = new Map<string, string>();
  for (const abs of walk(path.join(root, "src"))) {
    sources.set(path.relative(root, abs), fs.readFileSync(abs, "utf8"));
  }
  for (const rel of ROOT_CONFIG_FILES) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) sources.set(rel, fs.readFileSync(abs, "utf8"));
  }
  return sources;
}

export function run(opts: { updateBaseline: boolean }): number {
  const sources = loadSources();
  const vendor = new Map<string, string>();
  for (const rel of VENDOR_STYLESHEETS) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) vendor.set(rel, fs.readFileSync(abs, "utf8"));
  }
  const defs = collectDefinitions(new Map([...sources, ...vendor]));
  const findings: Finding[] = [];
  for (const [file, text] of sources) {
    findings.push(...findUndefinedVars(file, text, defs));
    // A config file gets two checks: the variables it references (above) and
    // the shadows its theme declares. The src/ checks below are skipped on
    // purpose, and that exempts the file from no colour rule:
    // - findRawValues keys off what src/ writes: className strings,
    //   `borderRadius:` / `boxShadow:` style keys, CSS declarations. A
    //   Tailwind theme has none of those (its shadows are `sm: '…'` entries
    //   in a map), so all findRawValues reports here is the `rounded-[10px]`
    //   example in the config's own comment.
    // - A hex literal in the config is still rejected by the colour grep in
    //   .husky/pre-commit, which reads every staged .ts file.
    if (ROOT_CONFIG_FILES.includes(file)) {
      findings.push(...findThemeShadowLiterals(file, text));
      continue;
    }
    if (file.endsWith(".css")) findings.push(...findScopedShapeTokens(file, text));
    findings.push(...findRawValues(file, text));
  }

  const baseline: Baseline = fs.existsSync(BASELINE_PATH)
    ? (JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline)
    : {};
  const report = buildReport(findings, baseline);

  if (opts.updateBaseline) {
    const next: Baseline = {};
    for (const [file, count] of Object.entries(report.counts).sort()) {
      if (count > 0) next[file] = count;
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n");
    console.log(
      `Baseline written: ${Object.keys(next).length} files, ${Object.values(next).reduce((a, b) => a + b, 0)} raw shape values.`,
    );
  }

  let failed = false;

  if (report.hard.length > 0) {
    failed = true;
    console.error(`\n❌ ${report.hard.length} hard failure(s):\n`);
    for (const f of report.hard) console.error(`  ${f.file}:${f.line}  [${f.kind}] ${f.detail}`);
  }

  if (report.regressions.length > 0 && !opts.updateBaseline) {
    failed = true;
    console.error(`\n❌ Raw radius/shadow values went UP in ${report.regressions.length} file(s):\n`);
    for (const r of report.regressions) {
      console.error(`  ${r.file}: ${r.count} (baseline ${r.allowed})`);
      for (const f of report.ratcheted.filter((x) => x.file === r.file)) {
        console.error(`      :${f.line}  ${f.detail}`);
      }
    }
    console.error(
      `\n  New code uses tokens. If you only moved existing raw values, run:\n    npm run tokens:check -- --update-baseline`,
    );
  }

  if (report.improvements.length > 0 && !opts.updateBaseline) {
    console.log(
      `\n✨ Raw shape values went down in ${report.improvements.length} file(s). Lock it in with:\n    npm run tokens:check -- --update-baseline`,
    );
  }

  const total = Object.values(report.counts).reduce((a, b) => a + b, 0);
  if (!failed) {
    console.log(
      `✅ Design tokens: no undefined variables, no new raw shape values (${total} legacy values remain across ${Object.keys(report.counts).length} files).`,
    );
  }
  return failed ? 1 : 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  process.exit(run({ updateBaseline: process.argv.includes("--update-baseline") }));
}

import { describe, expect, it } from "vitest";
import {
  buildReport,
  collectDefinitions,
  findRawValues,
  findScopedShapeTokens,
  findUndefinedVars,
  isTokenRadius,
  isTokenShadow,
} from "../check-design-tokens";

describe("collectDefinitions", () => {
  it("counts CSS declarations, style-object keys and setProperty calls", () => {
    const defs = collectDefinitions(
      new Map([
        ["a.css", ":root { --radius-md: 6px; }"],
        ["b.tsx", "style={{ '--okrt-weeks': 13 }} el.style.setProperty(\"--col-glow\", v)"],
      ]),
    );
    expect([...defs].sort()).toEqual(["--col-glow", "--okrt-weeks", "--radius-md"]);
  });

  it("ignores names in comments and ternaries, which are not declarations", () => {
    const defs = collectDefinitions(
      new Map([
        ["a.css", "/* --radius-lg: 10px was here */\n.x { color: red; }"],
        ["b.tsx", "const v = dark ? '--color-a' : '--color-b';\n// '--color-c': 1\nconst s = { '--color-d': 1 };"],
      ]),
    );
    expect([...defs]).toEqual(["--color-d"]);
  });
});

describe("findScopedShapeTokens", () => {
  it("allows shape tokens on :root and colour-scheme blocks of globals.css only", () => {
    const css = [
      "@layer base {",
      "  :root { --radius-md: 6px; --shadow-md: 0 1px 2px var(--c); }",
      '  [data-mantine-color-scheme="dark"] { --color-shadow: rgba(0,0,0,.5); }',
      "}",
      ".auth-surface { --radius-lg: 10px; }",
      ".coaching-home { --ch-radius-sm: 4px; }",
    ].join("\n");
    const out = findScopedShapeTokens("src/styles/globals.css", css);
    expect(out.map((f) => [f.line, f.detail.split(" ")[0]])).toEqual([
      [5, "--radius-lg"],
      [6, "--ch-radius-sm"],
    ]);
  });

  it("rejects any shape token declared in a feature stylesheet", () => {
    const out = findScopedShapeTokens("src/x/feature.css", ".page { --radius-md: 8px; --shadow-sm: none; }");
    expect(out.map((f) => f.kind)).toEqual(["scoped-shape-token", "scoped-shape-token"]);
  });
});

describe("findUndefinedVars", () => {
  const defs = new Set(["--radius-md"]);

  it("flags a bare reference to an undeclared variable", () => {
    const out = findUndefinedVars("x.css", ".a { border-radius: var(--radius-lg); }", defs);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "undefined-var", line: 1 });
    expect(out[0]?.detail).toContain("--radius-lg");
  });

  it("allows references with a fallback, template interpolations and vendor vars", () => {
    const text = [
      "var(--po-accent, var(--radius-md))",
      "var(--activity-${kind})",
      "var(--mantine-color-brand-4)",
      "var(--tw-ring-color)",
    ].join("\n");
    expect(findUndefinedVars("x.tsx", text, defs)).toEqual([]);
  });
});

describe("isTokenRadius", () => {
  it.each([
    "var(--radius-md)",
    "var(--radius-md) var(--radius-md) 0 0",
    "50%",
    "0",
    "inherit",
    "calc(var(--radius-lg) + 2px)",
  ])("accepts %s", (v) => expect(isTokenRadius(v)).toBe(true));

  it.each(["10px", "0.25rem", "999px", "5px 5px 3px 3px", "2px !important"])(
    "rejects %s",
    (v) => expect(isTokenRadius(v)).toBe(false),
  );
});

describe("isTokenShadow", () => {
  it("accepts shadows painted with tokens, including focus rings", () => {
    expect(isTokenShadow("0 0 0 3px var(--color-brand-glow)")).toBe(true);
    expect(isTokenShadow("0 2px 8px color-mix(in srgb, var(--brand-500) 35%, transparent)")).toBe(true);
    expect(isTokenShadow("none")).toBe(true);
  });
  it("rejects colour literals", () => {
    expect(isTokenShadow("0 4px 12px rgba(0, 0, 0, 0.1)")).toBe(false);
    expect(isTokenShadow("0 1px 2px #0003")).toBe(false);
    expect(isTokenShadow("inset 0 0 0 1px color-mix(in srgb, white 8%, transparent)")).toBe(false);
  });
});

describe("findRawValues", () => {
  it("reports raw CSS radius and shadow, not token-based ones", () => {
    const css = [
      ".a { border-radius: 10px; }",
      ".b { border-radius: var(--radius-lg); }",
      ".c { box-shadow: 0 8px 24px rgba(0,0,0,.35); }",
      ".d { box-shadow: var(--shadow-md); }",
    ].join("\n");
    const out = findRawValues("x.css", css);
    expect(out.map((f) => [f.kind, f.line])).toEqual([
      ["raw-radius", 1],
      ["raw-shadow", 3],
    ]);
  });

  it("lets the token definition files paint shadows with literals", () => {
    expect(findRawValues("src/styles/globals.css", "--shadow-sm: 0 1px 2px rgba(0,0,0,.1); .x { box-shadow: 0 0 0 1px rgba(0,0,0,.1) }")).toEqual([]);
  });

  it("reports TSX style objects, arbitrary Tailwind values and numeric Mantine radius", () => {
    const tsx = [
      "const s = { borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,.1)' };",
      "const t = { borderRadius: 'var(--radius-lg)', borderRadius2: radius };",
      "const u = { borderRadius: '50%' };",
      "<div className=\"rounded-[10px] shadow-[0_1px_2px]\" />",
      "<Skeleton radius={12} />",
      "<Skeleton radius=\"lg\" />",
    ].join("\n");
    const kinds = findRawValues("x.tsx", tsx).map((f) => `${f.kind}@${f.line}`);
    expect(kinds).toEqual([
      "raw-radius@1",
      "raw-shadow@1",
      "arbitrary-tailwind@4",
      "arbitrary-tailwind@4",
      "numeric-mantine-radius@5",
    ]);
  });
});

describe("buildReport", () => {
  const f = (file: string, kind: "raw-radius" | "undefined-var") => ({
    file,
    line: 1,
    kind,
    detail: "",
  });

  it("separates hard failures from ratcheted counts", () => {
    const r = buildReport([f("a.css", "undefined-var"), f("a.css", "raw-radius")], {});
    expect(r.hard).toHaveLength(1);
    expect(r.counts).toEqual({ "a.css": 1 });
  });

  it("flags a file above its baseline or absent from it, and notes improvements", () => {
    const r = buildReport(
      [f("up.css", "raw-radius"), f("up.css", "raw-radius"), f("new.css", "raw-radius")],
      { "up.css": 1, "down.css": 3 },
    );
    expect(r.regressions).toEqual([
      { file: "new.css", count: 1, allowed: 0 },
      { file: "up.css", count: 2, allowed: 1 },
    ]);
    expect(r.improvements).toEqual([{ file: "down.css", count: 0, allowed: 3 }]);
  });
});

// @vitest-environment node
/**
 * Guards on the self-host container images (`Dockerfile`,
 * `docker/scheduler.Dockerfile`, `.dockerignore`). Building an image takes
 * minutes and needs Docker, so these read the files and pin the properties
 * that would otherwise only fail at build or run time — or not fail at all,
 * like a secret slipping into an image.
 */

import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** Non-comment lines of a Dockerfile or ignore file. */
const instructions = (file: string) =>
  read(file)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

describe(".dockerignore", () => {
  const patterns = instructions(".dockerignore");

  it("keeps every .env file out of the build context, at any depth", () => {
    expect(patterns).toContain("**/.env*");
    expect(patterns.some((p) => p.startsWith("!") && p.includes(".env"))).toBe(false);
  });

  it("keeps local database dumps out of the build context", () => {
    expect(patterns).toContain("db-backups/");
  });
});

describe("app Dockerfile", () => {
  const dockerfile = read("Dockerfile");

  it("never bakes NEXT_PUBLIC_APP_URL into the build", () => {
    // Next inlines NEXT_PUBLIC_* at build time; the public URL is a runtime
    // setting (NEXTAUTH_URL), so the image must work on any domain.
    expect(dockerfile).not.toMatch(/^\s*(ENV|ARG)\b.*NEXT_PUBLIC_APP_URL/m);
  });

  it("never persists an OpenAI key in an image layer", () => {
    // The build needs a placeholder key for one RUN; ENV or ARG would carry it
    // into the image's config or history.
    expect(dockerfile).not.toMatch(/^\s*(ENV|ARG)\b.*OPENAI_API_KEY/m);
  });

  it("starts with the self-host start command", () => {
    expect(dockerfile).toMatch(/^CMD \["npm", "run", "start:selfhost"\]$/m);
  });
});

describe("scheduler image", () => {
  const dockerfile = read("docker/scheduler.Dockerfile");

  /** Module specifiers imported by a TypeScript file. */
  const importsOf = (file: string) =>
    [...read(file).matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gms)].map((m) => m[1]!);

  /** Every repo file the scheduler entry point reaches through relative imports. */
  function localClosure(entry: string): string[] {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const spec of importsOf(file)) {
        if (!spec.startsWith(".")) continue;
        visit(path.posix.join(path.posix.dirname(file), spec) + ".ts");
      }
    };
    visit(entry);
    return [...seen];
  }

  it("copies every file the scheduler imports", () => {
    const copied = dockerfile
      .split("\n")
      .filter((line) => line.startsWith("COPY "))
      .flatMap((line) => line.split(/\s+/).slice(1, -1));
    for (const file of localClosure("scripts/selfhost/scheduler.ts")) {
      expect(copied, `${file} is imported by the scheduler but not copied`).toContain(file);
    }
  });

  it("installs every package the scheduler imports", () => {
    const builtins = new Set(builtinModules);
    const packages = localClosure("scripts/selfhost/scheduler.ts")
      .flatMap(importsOf)
      .filter((spec) => !spec.startsWith(".") && !spec.startsWith("node:") && !builtins.has(spec));
    // The image installs exactly these two (plus tsx to run them).
    expect([...new Set(packages)].sort()).toEqual(["node-cron"]);
    expect(dockerfile).toMatch(/"node-cron": pin\("node-cron"\)/);
  });
});

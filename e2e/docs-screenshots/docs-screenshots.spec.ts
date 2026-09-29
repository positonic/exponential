import path from "path";
import { test } from "@playwright/test";
import { loadFixture } from "../fixture-data";
import { DOC_SHOTS, type DocShot } from "./manifest";

/**
 * Regenerates the docs screenshots from the dev-fixture workspace.
 * Run with `npm run docs:screenshots` (see playwright.docs.config.ts).
 * `DOCS_SHOTS=goals,today` limits the run to those files.
 */
const OUT_DIR = path.resolve(process.cwd(), "public/doc-assets");
const only = (process.env.DOCS_SHOTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const shots = only.length ? DOC_SHOTS.filter((s) => only.includes(s.file)) : DOC_SHOTS;

function resolvePath(shot: DocShot): string {
  const fixture = loadFixture();
  return shot.path
    .replace("{ws}", fixture.workspaceSlug)
    .replace("{product}", fixture.productSlug);
}

for (const scheme of ["dark", "light"] as const) {
  test.describe(`${scheme} theme`, () => {
    for (const shot of shots) {
      test(`${shot.file}${scheme === "light" ? "-light" : ""}`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          colorScheme: scheme,
          storageState: shot.signedOut ? { cookies: [], origins: [] } : "e2e/.auth/storageState.json",
        });
        await context.addInitScript((value) => {
          try {
            window.localStorage.setItem("mantine-color-scheme-value", value);
          } catch {
            // Storage blocked: the prefers-color-scheme emulation still applies.
          }
        }, scheme);
        const page = await context.newPage();
        await page.goto(resolvePath(shot), { timeout: 90_000 });
        await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
        await page.waitForTimeout(shot.waitMs ?? 2_500);
        if (shot.prepare) await shot.prepare(page);
        // The Next dev overlay badge is not part of the product.
        await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((e) => e.remove()));
        const suffix = scheme === "light" ? "-light" : "";
        await page.screenshot({ path: path.join(OUT_DIR, `${shot.file}${suffix}.png`) });
        await context.close();
      });
    }
  });
}

import { test, expect } from "@playwright/test";

const FIRST_PAINT_TIMEOUT = 60_000;

/**
 * The `/` block menu and the bubble menu's marks (feature "Pages tour", V2).
 *
 * These live in the shared editor engine, so the Feature PRD editor inherits
 * every one of them; a Page is just the cheapest place to drive them. What
 * each spec is really pinning is the round-trip: a block typed into the editor
 * has to survive the autosave, the Markdown projection and a reload.
 */

/** A throwaway page, so a spec that types into the body never disturbs the
 * seeded fixture pages other specs assert on. */
async function createScratchPage(
  page: import("@playwright/test").Page,
  title: string,
) {
  await page.goto("/w/dev-fixture/pages");
  await expect(page.getByRole("button", { name: "New page" })).toBeVisible({
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await page.getByRole("button", { name: "New page" }).click();
  const titleInput = page.getByLabel("Page title");
  await expect(titleInput).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await titleInput.fill(title);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/trpc/") && r.url().includes("page.update"),
    ),
    titleInput.blur(),
  ]);
  return page.url();
}

test("/divider inserts a rule that survives a reload as ---", async ({ page }) => {
  await createScratchPage(page, `Scratch divider ${Date.now()}`);
  const body = page.locator(".ProseMirror").first();

  await body.click();
  await page.keyboard.type("Above");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/div");
  // The filter narrows to one item; Enter takes it.
  await expect(page.getByText("Horizontal rule")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(body.locator("hr")).toHaveCount(1);

  // Wait for the autosave, which is what writes the Markdown projection.
  await page.waitForResponse(
    (r) => r.url().includes("/api/trpc/") && r.url().includes("page.update"),
  );

  await page.reload();
  await expect(page.locator(".ProseMirror hr")).toHaveCount(1, {
    timeout: FIRST_PAINT_TIMEOUT,
  });

  // And the stored Markdown projection carries the thematic break, which is
  // what every off-editor reader (CLI, agents, the public render) sees.
  const pageId = page.url().split("/").pop()!;
  const storedBody = await page.evaluate(async (id) => {
    const input = encodeURIComponent(JSON.stringify({ json: { id } }));
    const res = await fetch(`/api/trpc/page.get?input=${input}`);
    const json = (await res.json()) as {
      result: { data: { json: { body: string | null } } };
    };
    return json.result.data.json.body;
  }, pageId);
  expect(storedBody).toContain("---");
});

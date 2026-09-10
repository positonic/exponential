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

test("the block menu offers Text, Divider and Image", async ({ page }) => {
  await createScratchPage(page, `Scratch blocks ${Date.now()}`);
  const body = page.locator(".ProseMirror").first();

  await body.click();
  await page.keyboard.type("/");
  // The menu is a tippy popup on <body>, not inside the editor.
  for (const label of ["Text", "Divider", "Image"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

test("/text turns a heading back into a paragraph", async ({ page }) => {
  await createScratchPage(page, `Scratch text ${Date.now()}`);
  const body = page.locator(".ProseMirror").first();

  await body.click();
  await page.keyboard.type("# Shouting");
  await expect(body.locator("h1")).toHaveText("Shouting");

  await page.keyboard.type(" /text");
  await expect(page.getByText("Plain paragraph")).toBeVisible();
  await expect(page.getByText("Bullet list", { exact: true })).toBeHidden();
  await page.keyboard.press("Enter");

  await expect(body.locator("h1")).toHaveCount(0);
  await expect(body.locator("p").first()).toContainText("Shouting");
});

test("the block menu filters mid-title and says so when nothing matches", async ({
  page,
}) => {
  await createScratchPage(page, `Scratch filter ${Date.now()}`);
  const body = page.locator(".ProseMirror").first();

  await body.click();
  // Mid-title: a prefix filter would have found neither of these.
  await page.keyboard.type("/list");
  await expect(page.getByText("Bullet list", { exact: true })).toBeVisible();
  await expect(page.getByText("Task list", { exact: true })).toBeVisible();
  await expect(page.getByText("Heading 1", { exact: true })).toBeHidden();

  // No match keeps the menu open and says why, rather than vanishing.
  await page.keyboard.type("zzz");
  await expect(page.getByText("No matches")).toBeVisible();

  // Escape closes it and the typed text stays in the doc.
  await page.keyboard.press("Escape");
  await expect(page.getByText("No matches")).toBeHidden();
});

test("the bubble menu applies underline, strike and highlight, and they persist", async ({
  page,
}) => {
  await createScratchPage(page, `Scratch marks ${Date.now()}`);
  const body = page.locator(".ProseMirror").first();

  await body.click();
  await page.keyboard.type("Mark me");
  // Select the line, which opens the bubble menu.
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");

  for (const label of ["Underline", "Strikethrough", "Highlight"]) {
    await page.getByRole("button", { name: label }).click();
  }
  await expect(body.locator("u")).toHaveCount(1);
  await expect(body.locator("s")).toHaveCount(1);
  await expect(body.locator("mark")).toHaveCount(1);

  await page.waitForResponse(
    (r) => r.url().includes("/api/trpc/") && r.url().includes("page.update"),
  );

  // The three marks survive the ProseMirror -> Markdown -> reload trip.
  await page.reload();
  await expect(page.locator(".ProseMirror u")).toHaveCount(1, {
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await expect(page.locator(".ProseMirror s")).toHaveCount(1);
  await expect(page.locator(".ProseMirror mark")).toHaveCount(1);
});

test("the block-type dropdown names the current block and changes it", async ({
  page,
}) => {
  await createScratchPage(page, `Scratch blocktype ${Date.now()}`);
  const body = page.locator(".ProseMirror").first();

  await body.click();
  await page.keyboard.type("Some prose");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");

  // It says what the selection *is* — the three H1/H2/H3 icon buttons it
  // replaced could not.
  const trigger = page.getByLabel("Block type");
  await expect(trigger).toHaveText(/Text/);

  await trigger.click();
  await page.getByRole("menuitem", { name: "Heading 2" }).click();
  await expect(body.locator("h2")).toHaveText("Some prose");

  // And there is a way back out of a heading, which there was not before.
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await expect(trigger).toHaveText(/Heading 2/);
  await trigger.click();
  // The current block is marked, not merely named on the trigger.
  await expect(
    page.getByRole("menuitem", { name: "Heading 2" }),
  ).toHaveAttribute("aria-current", "true");
  await page.getByRole("menuitem", { name: "Quote" }).click();
  await expect(body.locator("blockquote")).toContainText("Some prose");
});

/** The smallest valid PNG: 1x1, transparent. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("/image uploads the picked file and inserts it", async ({ page }) => {
  await createScratchPage(page, `Scratch image ${Date.now()}`);
  const body = page.locator(".ProseMirror").first();

  await body.click();
  await page.keyboard.type("/image");
  await expect(page.getByText("Upload an image")).toBeVisible();
  // Wait for the *filtered* list to commit before pressing Enter: the
  // suggestion plugin pushes new items through a React render, and Enter
  // arriving first would run whatever was at index 0 of the old list.
  await expect(page.getByText("Bullet list", { exact: true })).toBeHidden();

  // The command builds a native <input type=file> and clicks it.
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });

  await expect(body.locator("img")).toHaveCount(1, { timeout: 30_000 });
  // The "/image" text is gone — the range is deleted before the dialog opens.
  await expect(body).not.toContainText("/image");
});

test("/divider inserts a rule that survives a reload as ---", async ({ page }) => {
  await createScratchPage(page, `Scratch divider ${Date.now()}`);
  const body = page.locator(".ProseMirror").first();

  await body.click();
  await page.keyboard.type("Above");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/div");
  // The filter narrows to one item; Enter takes it — but only once the
  // filtered list has actually rendered (see the /image spec).
  await expect(page.getByText("Horizontal rule")).toBeVisible();
  await expect(page.getByText("Bullet list", { exact: true })).toBeHidden();
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

/**
 * YouTube embeds in the page editor: `/youtube` asks for a link and embeds
 * it; pasting a bare YouTube URL embeds it too; both survive a reload.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;
const ID_A = "dQw4w9WgXcQ";
const ID_B = "jNQXAC9IVRw";

async function openEditor(page: Page) {
  await page.goto(fixture.databasePageUrl);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  return editor;
}

test("/youtube and a pasted link both embed a player that persists", async ({ page }) => {
  test.setTimeout(180_000);
  const editor = await openEditor(page);

  // Slash command → link prompt → embed.
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/youtube");
  await page.getByRole("button", { name: /Embed a video from a YouTube link/ }).click();
  const prompt = page.getByRole("dialog", { name: "Embed a YouTube video" });
  await prompt.getByLabel("YouTube link").fill("https://www.youtube.com/@not-a-video");
  await prompt.getByRole("button", { name: "Embed" }).click();
  await expect(prompt.getByText("Paste a link to a single YouTube video.")).toBeVisible();
  await prompt.getByLabel("YouTube link").fill(`https://youtu.be/${ID_A}?t=42`);
  await prompt.getByRole("button", { name: "Embed" }).click();
  await expect(prompt).toBeHidden();

  const embeds = editor.locator('[data-type="youtube"] iframe');
  await expect(embeds).toHaveCount(1);
  await expect(embeds.first()).toHaveAttribute(
    "src",
    `https://www.youtube-nocookie.com/embed/${ID_A}?start=42`,
  );

  // Paste a bare URL into a fresh paragraph. Register the save wait first:
  // `requestfinished` fires once the streamed tRPC response has fully
  // arrived, i.e. the `page.update` carrying the second video has landed.
  const saved = page.waitForEvent("requestfinished", {
    predicate: (request) =>
      request.url().includes("page.update") && (request.postData() ?? "").includes(ID_B),
    timeout: 30_000,
  });
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.evaluate((url) => {
    const target = document.querySelector(".ProseMirror");
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", url);
    target?.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  }, `https://www.youtube.com/watch?v=${ID_B}`);
  await expect(embeds).toHaveCount(2);
  await expect(embeds.nth(1)).toHaveAttribute(
    "src",
    `https://www.youtube-nocookie.com/embed/${ID_B}`,
  );

  await saved;
  await page.reload();
  const reloaded = page.locator(".ProseMirror").first().locator('[data-type="youtube"] iframe');
  await expect(reloaded).toHaveCount(2, { timeout: FIRST_PAINT_TIMEOUT });

  // The player really loads: the frame navigates to the embed host (a CSP
  // `frame-src` block, or a broken src, leaves it on an error page). The
  // iframe is `loading="lazy"`, so bring it into view first.
  await reloaded.first().scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        page
          .frames()
          .some((frame) =>
            frame.url().startsWith(`https://www.youtube-nocookie.com/embed/${ID_A}`),
          ),
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath("youtube-embeds.png") });
});

/**
 * YouTube embeds in the page editor: `/youtube` asks for a link and embeds
 * it; pasting a bare YouTube URL embeds it too; both survive a reload.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;
/**
 * Fresh, valid video ids per run (the embed host is stubbed below), so a
 * retry on the same fixture page can't match the previous attempt's embeds.
 */
function randomVideoId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return Array.from({ length: 11 }, () => alphabet[Math.floor(Math.random() * 64)]).join("");
}
const EMBED = "https://www.youtube-nocookie.com/embed";
const ID_A = randomVideoId();
const ID_B = randomVideoId();

async function openEditor(page: Page) {
  await page.goto(fixture.youtubePageUrl);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  return editor;
}

/** The fixture page's stored body, as the server returns it from `page.get`. */
async function savedBody(page: Page): Promise<string> {
  const input = encodeURIComponent(JSON.stringify({ "0": { json: { id: fixture.youtubePageId } } }));
  const response = await page.request.get(`/api/trpc/page.get?batch=1&input=${input}`);
  return response.ok() ? response.text() : "";
}

test("/youtube and a pasted link both embed a player that persists", async ({ page }) => {
  test.setTimeout(180_000);
  // Stub the embed host so the spec never depends on reaching YouTube. A
  // frame blocked by CSP `frame-src` never issues its request, so the frame
  // navigation asserted below still proves the embed is allowed to load.
  await page.route(`${EMBED}/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>player stub</title>" }),
  );
  const editor = await openEditor(page);

  // Slash command → link prompt → embed.
  // Click a text paragraph, not the editor's centre: on a page that already
  // holds embeds (a retry) the centre is a player iframe, which takes focus.
  await editor.locator("p").last().click();
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

  // Each embed is found by its own src, so leftovers from an earlier attempt
  // on the shared fixture page don't matter.
  const embedA = (root: Locator) =>
    root.locator(`[data-type="youtube"] iframe[src="${EMBED}/${ID_A}?start=42"]`);
  const embedB = (root: Locator) =>
    root.locator(`[data-type="youtube"] iframe[src="${EMBED}/${ID_B}"]`);
  await expect(embedA(editor)).toHaveCount(1);

  // Paste a bare URL into a fresh paragraph.
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
  await expect(embedB(editor)).toHaveCount(1);

  // Wait until the server has the second video before reloading. Network
  // events can't tell us: the tRPC client aborts the streamed `page.update`
  // once it has the result, so it never reports `requestfinished`. Read the
  // page back instead (`page.request` carries the session cookie).
  await expect
    .poll(() => savedBody(page), { timeout: 30_000 })
    .toContain(ID_B);
  await page.reload();
  const reloaded = page.locator(".ProseMirror").first();
  await expect(embedA(reloaded)).toHaveCount(1, { timeout: FIRST_PAINT_TIMEOUT });
  await expect(embedB(reloaded)).toHaveCount(1);

  // The player loads: the frame navigates to the (stubbed) embed host. A CSP
  // `frame-src` block, or a broken src, leaves it on an error page. The
  // iframe is `loading="lazy"`, so bring it into view first.
  await embedA(reloaded).scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        page
          .frames()
          .some((frame) =>
            frame.url().startsWith(`${EMBED}/${ID_A}`),
          ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath("youtube-embeds.png") });
});

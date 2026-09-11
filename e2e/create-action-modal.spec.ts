/**
 * The sidebar "Create Action" modal must dismiss on submit without waiting for
 * the server.
 *
 * It used to close only at the end of `onSuccess`, i.e. after the
 * `action.create` round-trip *and* the sequential sprint / assignee /
 * screenshot chain that follows it - so the submit button sat spinning for as
 * long as the network took. Creation is optimistic and every post-create step
 * reports its own failure, so there is nothing to wait on.
 *
 * This test holds the create response open and asserts the modal is gone long
 * before it resolves.
 *
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

/** How long the stubbed create response is held open. */
const SERVER_DELAY_MS = 4_000;

test("submitting the create-action modal dismisses it without waiting for the server", async ({
  page,
}) => {
  let createStartedAt = 0;
  await page.route("**/api/trpc/action.create**", async (route) => {
    createStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, SERVER_DELAY_MS));
    await route.continue();
  });

  await page.goto(`/w/${fixture.workspaceSlug}/projects`);
  await page.getByRole("button", { name: /Create Action/i }).click();

  const nameBox = page.locator('form [contenteditable="true"]').first();
  await expect(nameBox).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await nameBox.click();
  await page.keyboard.type("modal close latency guard");

  const submit = page.getByRole("button", { name: "New action", exact: true });
  await submit.click();

  // The form unmounts when Mantine's exit transition finishes (~200ms).
  await expect(nameBox).toHaveCount(0, { timeout: 2_000 });

  // ...and that happened while the create request was still in flight.
  expect(createStartedAt).toBeGreaterThan(0);
  expect(Date.now() - createStartedAt).toBeLessThan(SERVER_DELAY_MS);

  // Reopening straight away must give a usable form: the submit button is not
  // allowed to sit disabled waiting on the previous, still-in-flight create
  // (Mantine's Button sets disabled={disabled || loading}).
  await page.getByRole("button", { name: /Create Action/i }).click();
  await expect(nameBox).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(nameBox).toHaveText("");
  await expect(submit).toBeEnabled();
  expect(Date.now() - createStartedAt).toBeLessThan(SERVER_DELAY_MS);
});

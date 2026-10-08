/**
 * The Add Meeting modal (CreateTranscriptionModal) stacks ParticipantPicker -
 * itself a Mantine Modal - above its own Modal. Mantine's Escape handler is
 * per-modal, so without `closeOnEscape={!pickerOpen}` on the parent, one
 * Escape press closed both and threw away the whole Add Meeting draft.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

const FIRST_PAINT_TIMEOUT = 60_000;

test("Escape in the participant picker closes only the picker, not Add Meeting", async ({ page }) => {
  await page.goto(`/w/${fixture.workspaceSlug}/meetings`);
  await page.getByRole("button", { name: "Add Meeting" }).first().click({ timeout: FIRST_PAINT_TIMEOUT });

  const addMeeting = page.getByRole("dialog", { name: "Add Meeting" });
  await expect(addMeeting).toBeVisible();

  await addMeeting.getByRole("button", { name: "Add participant" }).click();
  const picker = page.getByRole("dialog", { name: "Add participant" });
  await expect(picker).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(picker).toBeHidden();
  await expect(addMeeting).toBeVisible();

  // With the picker gone, Escape closes Add Meeting as usual.
  await page.keyboard.press("Escape");
  await expect(addMeeting).toBeHidden();
});

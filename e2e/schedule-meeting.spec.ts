/**
 * Scheduling a meeting from a project (ADR-0059 amendment, 2026-10-07; V4)
 * on the seeded dev fixture, end to end:
 *
 * project Meetings tab → "Schedule meeting" → the project's DRI is
 * preselected → add a CRM contact → find times → pick a slot → purpose with
 * the "Review progress" preset → the agenda checklist previews counts → book
 * → land on the meeting's page showing the purpose and a Project state
 * section → back on the tab, the meeting is listed above the recordings.
 *
 * The seed clears meetings booked from the project by earlier runs, and the
 * e2e server runs with EMAIL_DELIVERY_DISABLED, so no invite is ever sent
 * (the spec asserts "0 invites sent").
 * Runs authenticated via the storageState minted in global-setup. See
 * dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile cost. */
const FIRST_PAINT_TIMEOUT = 90_000;

const TITLE = "Launch scope review";
const PURPOSE = "Agree the launch scope and who owns each part";

test("schedules a meeting with an agenda from a project's Meetings tab", async ({ page }) => {
  test.skip(
    !fixture.canScheduleWithContact,
    "DATABASE_ENCRYPTION_KEY isn't set, so the fixture contact has no email and an external can't be invited",
  );
  await page.goto(fixture.projectMeetingsUrl);
  const scheduleButton = page.getByRole("button", { name: "Schedule meeting" });
  await expect(scheduleButton).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await scheduleButton.click();

  const modal = page.getByRole("dialog", { name: "Schedule meeting" });
  // The project's DRI is preselected, and the project can't be changed.
  await expect(modal.getByText(fixture.colleagueName)).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // Invite a CRM contact as an external attendee.
  await modal.getByRole("button", { name: "Add attendee" }).click();
  const picker = page.getByRole("dialog", { name: "Add attendee" });
  await picker.getByRole("textbox").fill(fixture.contactName.split(" ")[0]!);
  await picker.getByText(fixture.contactName).click();
  // Escape closes only the picker; the schedule modal keeps its draft.
  await page.keyboard.press("Escape");
  await expect(modal.getByText(fixture.contactName)).toBeVisible();

  await modal.getByRole("button", { name: "Find times" }).click();
  await modal.getByRole("button", { name: / – / }).first().click({ timeout: FIRST_PAINT_TIMEOUT });

  await expect(modal.getByRole("textbox", { name: "Project" })).toBeDisabled();
  await modal.getByPlaceholder("What's the meeting about?").fill(TITLE);
  await modal.getByPlaceholder("e.g. Agree the launch scope and who owns each part").fill(PURPOSE);

  // "Review progress" is the default preset; its sections preview what they hold.
  await expect(modal.getByText("Kind of meeting")).toBeVisible();
  const projectState = modal.getByRole("checkbox", { name: /Project state/ });
  await expect(projectState).toBeChecked();
  await expect(modal.getByText(/1 item · Fixture Linked Project/).first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  await modal.getByRole("button", { name: "Schedule & send invites" }).click();
  // Delivery is switched off on the e2e server. A reused dev server started
  // without EMAIL_DELIVERY_DISABLED would have sent real invites: fail loudly.
  await expect(page.getByText(/0 invites sent/)).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // Lands on the meeting's agenda.
  await page.waitForURL(/\/ceremonies\/[^/]+\/[^/]+$/, { timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByTestId("meeting-purpose")).toContainText(PURPOSE, { timeout: FIRST_PAINT_TIMEOUT });
  // Both the pre-read and the section itself are headed "Project state".
  await expect(page.getByRole("heading", { name: "Project state" }).first()).toBeVisible();
  // A one-off reads as a meeting: the crumb never says "Ceremonies".
  await expect(page.getByRole("link", { name: "Meetings" }).first()).toBeVisible();
  await expect(page.getByText(/ceremon/i)).toHaveCount(0);

  await test.info().attach("occurrence page", { body: await page.screenshot(), contentType: "image/png" });

  // Back on the project's tab, the meeting is listed, upcoming.
  await page.goto(fixture.projectMeetingsUrl);
  const timeline = page.getByTestId("project-occurrences");
  await expect(timeline).toContainText(TITLE, { timeout: FIRST_PAINT_TIMEOUT });
  await expect(timeline).toContainText("Upcoming");
  await test.info().attach("project meetings tab", { body: await page.screenshot(), contentType: "image/png" });
});

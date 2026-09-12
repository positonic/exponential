/**
 * The sidebar "Create Action" modal must dismiss on submit without waiting for
 * the server.
 *
 * It used to call close() only at the end of `onSuccess`, i.e. after the
 * `action.create` round-trip *and* the sequential sprint / assignee /
 * screenshot chain that follows it - so the submit button sat spinning for as
 * long as the network took. Creation is optimistic and every post-create step
 * reports its own failure, so there is nothing to wait on.
 *
 * Both tests hold the create response open until the assertions are done,
 * rather than for a fixed delay: what matters is that the UI is usable *while
 * a create is still in flight*, and a wall-clock budget would turn a slow CI
 * runner into a false pass (the create resolves, and everything looks fine).
 *
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect, type Page } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

const FIRST_NAME = "first in flight";
const SECOND_NAME = "second in flight";

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

/**
 * Holds every `action.create` request at the browser until the returned
 * `release` is called - nothing reaches the server before then.
 */
async function holdCreateResponses(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started: number[] = [];

  await page.route("**/api/trpc/action.create**", async (route) => {
    started.push(Date.now());
    await gate;
    await route.continue();
  });

  return { release, inFlight: () => started.length };
}

/**
 * The two entry points that create an action. They are separate components
 * with separate copies of this flow, which is how they drifted apart in the
 * first place, so anything asserted here is asserted for both.
 */
const ENTRY_POINTS = [
  {
    label: "sidebar Create Action (GlobalAddTaskButton)",
    url: `/w/${fixture.workspaceSlug}/projects`,
    trigger: /Create Action/i,
  },
  {
    label: "projects-tasks Add task (CreateActionModal)",
    url: `/w/${fixture.workspaceSlug}/projects-tasks`,
    trigger: /Add task/i,
  },
] as const;

/** Opens the modal and types a name, leaving it ready to submit. */
async function compose(page: Page, name: string, trigger = /Create Action/i) {
  await page.getByRole("button", { name: trigger }).first().click();
  const nameBox = page.locator('form [contenteditable="true"]').first();
  await expect(nameBox).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await nameBox.click();
  await page.keyboard.type(name);
  return nameBox;
}

test("submitting the create-action modal dismisses it without waiting for the server", async ({
  page,
}) => {
  const { release, inFlight } = await holdCreateResponses(page);

  await page.goto(`/w/${fixture.workspaceSlug}/projects`);
  const nameBox = await compose(page, "modal close latency guard");
  const submit = page.getByRole("button", { name: "New action", exact: true });
  await submit.click();

  // The form unmounts when Mantine's exit transition finishes (~200ms) - while
  // the create is still held open below, so this cannot be the create landing.
  await expect(nameBox).toHaveCount(0, { timeout: 2_000 });
  expect(inFlight()).toBe(1);

  // Reopening straight away must give a clean, usable form: the submit button
  // is not allowed to sit disabled waiting on the previous, still-in-flight
  // create (Mantine's Button sets disabled={disabled || loading}).
  await page.getByRole("button", { name: /Create Action/i }).click();
  await expect(nameBox).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(nameBox).toHaveText("");
  await expect(submit).toBeEnabled();
  expect(inFlight()).toBe(1);

  release();
  // Let the released create finish before the test tears the page down; an
  // in-flight route callback outliving the test fails the whole run.
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("two creates in flight at once keep their own post-create attachments", async ({
  page,
}) => {
  // Closing on submit means a second action can be composed while the first is
  // still in flight. Each submission's post-create attachments (assignees,
  // sprint, screenshots) are recorded against that submission.
  //
  // The first action gets an assignee and the second gets none, which makes the
  // old single-shared-ref behaviour observable without resolving any ids: the
  // second submit overwrote the ref with an empty list, so the first create's
  // onSuccess found nothing and the assignment was silently dropped. Correct
  // behaviour issues exactly one assign.
  const { release, inFlight } = await holdCreateResponses(page);

  const assigned: { actionId: string; userIds: string[] }[] = [];
  await page.route("**/api/trpc/action.assign**", async (route) => {
    const body = route.request().postDataJSON() as Record<
      string,
      { json?: { actionId?: string; userIds?: string[] } }
    >;
    for (const entry of Object.values(body)) {
      if (entry?.json?.actionId) {
        assigned.push({
          actionId: entry.json.actionId,
          userIds: entry.json.userIds ?? [],
        });
      }
    }
    await route.continue();
  });

  await page.goto(`/w/${fixture.workspaceSlug}/projects`);
  const submit = page.getByRole("button", { name: "New action", exact: true });

  // First action: one assignee. In create mode the picker only bubbles the
  // selection up - the assign call happens after this create resolves.
  const nameBox = await compose(page, FIRST_NAME);
  await page.getByRole("button", { name: /Add assignee/i }).click();
  const member = page.locator(".mantine-Checkbox-input").first();
  await expect(member).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await member.click();
  await page.getByRole("button", { name: /Save Changes/i }).click();
  await submit.click();
  await expect(nameBox).toHaveCount(0, { timeout: 2_000 });

  // Second action: no assignee, submitted while the first is still in flight.
  await compose(page, SECOND_NAME);
  await submit.click();
  await expect(nameBox).toHaveCount(0, { timeout: 2_000 });

  // Both reached the browser's create route before either was let through.
  expect(inFlight()).toBe(2);

  release();

  // The first action's assignee survived the second submission.
  await expect.poll(() => assigned.length, { timeout: 15_000 }).toBe(1);
  expect(assigned[0]!.userIds.length).toBeGreaterThan(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/**
 * Tags are applied on a *separate* mutation after the action exists, which is
 * the path that used to lose them: one modal never sent them at all, and the
 * other read them off state that submit had already cleared. Both now go
 * through the same per-submission record, as does the sprint assignment that
 * shared the second bug.
 */
for (const entry of ENTRY_POINTS) {
  test(`tags selected before submit reach the created action - ${entry.label}`, async ({
    page,
  }) => {
    const tagged: { actionId: string; tagIds: string[] }[] = [];
    await page.route("**/api/trpc/tag.setActionTags**", async (route) => {
      const body = route.request().postDataJSON() as Record<
        string,
        { json?: { actionId?: string; tagIds?: string[] } }
      >;
      for (const call of Object.values(body)) {
        if (call?.json?.actionId) {
          tagged.push({
            actionId: call.json.actionId,
            tagIds: call.json.tagIds ?? [],
          });
        }
      }
      await route.continue();
    });

    await page.goto(entry.url);
    const nameBox = await compose(page, `tagged via ${entry.label}`, entry.trigger);

    await page.getByRole("button", { name: "Tags", exact: true }).click();
    const tagChip = page.getByText(fixture.tagName, { exact: true });
    await expect(tagChip).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await tagChip.click();

    // Dismiss via the popover's own Done. Selecting a tag re-renders the Tags
    // button with a badge, so the footer row keeps moving while the popover is
    // open and the submit button never settles enough to be clicked.
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "New action", exact: true }).click();
    await expect(nameBox).toHaveCount(0, { timeout: 5_000 });

    await expect.poll(() => tagged.length, { timeout: 15_000 }).toBe(1);
    expect(tagged[0]!.tagIds).toEqual([fixture.tagId]);

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
}

/**
 * The sidebar "Create Action" modal must dismiss on submit without waiting for
 * the server.
 *
 * It used to call close() only at the end of `onSuccess`, i.e. after the
 * `action.create` round-trip *and* the sequential sprint / assignee /
 * screenshot chain that followed it - so the submit button sat spinning for as
 * long as the network took. Creation is optimistic, and tags, assignees and
 * sprint now travel in the create request itself (the server writes them in
 * one transaction), so there is nothing to wait on.
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

/** The parts of an `action.create` payload these tests look at. */
interface CreatePayload {
  name?: string;
  tagIds?: string[];
  assigneeIds?: string[];
  sprintListId?: string;
}

/** Every `action.create` payload the page sent, in order (a batch may carry several). */
function readCreatePayloads(body: unknown): CreatePayload[] {
  const entries = Object.values((body ?? {}) as Record<string, { json?: CreatePayload }>);
  return entries.flatMap((entry) => (entry?.json ? [entry.json] : []));
}

/**
 * Holds every `action.create` request at the browser until the returned
 * `release` is called - nothing reaches the server before then - and records
 * each request's payload as it was sent.
 */
async function holdCreateResponses(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const payloads: CreatePayload[] = [];

  await page.route("**/api/trpc/action.create**", async (route) => {
    payloads.push(...readCreatePayloads(route.request().postDataJSON()));
    await gate;
    await route.continue();
  });

  return { release, inFlight: () => payloads.length, payloads };
}

/**
 * Counts hits on the three post-create attach procedures. None of them may
 * fire from a create surface any more: the attachments ride the create.
 */
async function countFollowUps(page: Page) {
  const hits: string[] = [];
  for (const proc of ["tag.setActionTags", "action.assign", "list.addAction"]) {
    await page.route(`**/api/trpc/${proc}**`, async (route) => {
      hits.push(proc);
      await route.continue();
    });
  }
  return hits;
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

test("two creates in flight at once each carry their own assignees in the create request", async ({
  page,
}) => {
  // Closing on submit means a second action can be composed while the first is
  // still in flight. Each submission's selections must travel with *its own*
  // create request - not the cleared form's, and not the other submission's.
  //
  // The first action gets an assignee and the second gets none, which makes
  // any shared-state bug observable without resolving any ids: the first
  // create's payload must carry the assignee, the second's must not, and no
  // post-create assign call may fire at all.
  const { release, inFlight, payloads } = await holdCreateResponses(page);
  const followUps = await countFollowUps(page);

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

  // The first action's assignee rode its own create; the second sent none.
  const first = payloads.find((p) => p.name === FIRST_NAME);
  const second = payloads.find((p) => p.name === SECOND_NAME);
  expect(first?.assigneeIds?.length ?? 0).toBeGreaterThan(0);
  expect(second?.assigneeIds).toBeUndefined();

  release();
  // Nothing attaches after the fact any more.
  await page.waitForTimeout(1_000);
  expect(followUps).toEqual([]);

  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/**
 * Tags used to be applied on a *separate* mutation after the action existed,
 * which is the path that lost them: one modal never sent them at all, and the
 * other read them off state that submit had already cleared. They now ride
 * the create request from both entry points, and the server writes them in
 * the same transaction as the Action - so the assertion is on the create
 * payload, and on the old follow-up never firing.
 */
for (const entry of ENTRY_POINTS) {
  test(`tags selected before submit ride the create request - ${entry.label}`, async ({
    page,
  }) => {
    const payloads: CreatePayload[] = [];
    await page.route("**/api/trpc/action.create**", async (route) => {
      payloads.push(...readCreatePayloads(route.request().postDataJSON()));
      await route.continue();
    });
    const followUps = await countFollowUps(page);

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

    await expect.poll(() => payloads.length, { timeout: 15_000 }).toBe(1);
    expect(payloads[0]!.tagIds).toEqual([fixture.tagId]);
    await page.waitForTimeout(1_000);
    expect(followUps).toEqual([]);

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
}

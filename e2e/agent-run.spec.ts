/**
 * Assigning an Assistant starts an Agent run (ADR-0067): the action shows a
 * spinner in place of its status, the pill reads "Working/Queued", and once
 * the hosted executor finishes it flips to "Worked for … · called N tools".
 *
 * Mastra is a stub started by this spec on the port the dev server was told
 * to use (playwright.config.ts webServer.env). The dispatcher is kicked
 * directly with the fixed cron secret rather than relying on the assign
 * mutation's after() hook, which under Playwright posts to whatever base URL
 * the env names, so the spec stays deterministic.
 *
 * Fixture: `Aria` (the fixture user's Assistant) and an unassigned action.
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import http from "node:http";
import { loadFixture, E2E_MASTRA_STUB_PORT, E2E_CRON_SECRET } from "./fixture-data";

const fixture = loadFixture();
const FIRST_PAINT_TIMEOUT = 60_000;

/** A canned FullOutput: one tool step and a public summary. */
const STUB_OUTPUT = {
  text: "Shortlisted two venues; details in the comments.",
  steps: [{ toolCalls: [{ toolName: "get-run-context" }] }],
  usage: { totalTokens: 42 },
};

/** The dev server Playwright started (playwright.config.ts PORT). */
const APP_URL = `http://localhost:${process.env.E2E_PORT ?? 3100}`;

let stub: http.Server;
const stubCalls: Array<{ url: string; body: unknown; auth: string | null }> = [];
const callbackResults: Array<{ status: number; body: string }> = [];

test.beforeAll(async () => {
  stub = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      void (async () => {
        const auth = req.headers.authorization ?? null;
        stubCalls.push({ url: req.url ?? "", body: raw ? JSON.parse(raw) : null, auth });
        // Behave like the real run agent's first tool: call back into the app
        // with the run token, so the app writes a run event (the transcript).
        if (auth) {
          const cb = await fetch(`${APP_URL}/api/trpc/mastra.reportProgress`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: auth },
            body: JSON.stringify({ json: { text: "Reading the venue shortlist" } }),
          });
          callbackResults.push({ status: cb.status, body: (await cb.text()).slice(0, 300) });
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(STUB_OUTPUT));
      })();
    });
  });
  await new Promise<void>((resolve) => stub.listen(E2E_MASTRA_STUB_PORT, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()));
});

test("assigning your Assistant starts a run: spinner, then the pill flips from Queued to Worked for", async ({ page, request }) => {
  await page.goto(fixture.agentRunActionUrl);
  await expect(page.getByText(fixture.agentRunActionName).first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // Assign from the modal.
  await page.getByText("Unassigned").click();
  const modal = page.getByRole("dialog", { name: "Assign Action" });
  const ownRow = modal.getByTestId("assign-group-own").getByText(new RegExp(`^${fixture.assistantName}`));
  await expect(ownRow).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await ownRow.click();
  await modal.getByRole("button", { name: "Save Changes" }).click();
  await expect(modal).toBeHidden();

  // A run is queued: the status badge gives way to the ring, the pill says so.
  const pill = page.getByTestId("agent-run-pill");
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(pill).toHaveAttribute("data-status", /QUEUED|RUNNING/);
  await expect(page.getByTestId("action-running-ring")).toBeVisible();
  await expect(pill.getByRole("button", { name: "Cancel" })).toBeVisible();

  // Kick the hosted executor exactly as the after() hook / cron would.
  const dispatch = await request.post("/api/internal/agent-runs/dispatch", {
    headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(dispatch.ok()).toBe(true);
  const result = (await dispatch.json()) as { claimed: number; succeeded: string[]; failed: unknown[] };
  expect(result.failed).toEqual([]);
  expect(result.succeeded.length).toBeGreaterThanOrEqual(1);

  // The stub was called as the Assistant's shadow user, with the persona and the brief.
  const call = stubCalls.find((c) => c.url.includes("/api/agents/assistantRunAgent/generate"));
  expect(call).toBeDefined();
  expect(call!.auth).toMatch(/^Bearer /);
  const body = call!.body as { messages: Array<{ role: string; content: string }>; memory: { thread: { id: string } } };
  expect(body.messages[0]!.role).toBe("system");
  expect(body.messages[0]!.content).toContain(`Name: ${fixture.assistantName}`);
  expect(body.messages[1]!.content).toContain(fixture.agentRunActionName);
  expect(body.memory.thread.id).toMatch(/^action-/);

  // The pill polls every 2 s while live and flips once the run finished.
  await expect(pill).toHaveAttribute("data-status", "SUCCEEDED", { timeout: 10_000 });
  await expect(pill).toContainText(/Worked for .* · called 1 tool$/);
  await expect(page.getByTestId("action-running-ring")).toHaveCount(0);
  await expect(pill.getByRole("button", { name: "Cancel" })).toHaveCount(0);

  // The stub's callback was accepted with the run token: the app wrote the event.
  expect(callbackResults).toHaveLength(1);
  expect(callbackResults[0]!.status, callbackResults[0]!.body).toBe(200);

  // The owner sees the transcript; the summary is on the pill's tooltip.
  await expect(page.getByTestId("agent-run-transcript")).toBeVisible();
  await page.getByTestId("agent-run-transcript").getByRole("button").click();
  await expect(page.getByText("Reading the venue shortlist")).toBeVisible();
  await pill.hover();
  await expect(page.getByText(STUB_OUTPUT.text)).toBeVisible();

  // Inbox → Delegated lists the finished run under Finished with Mark done;
  // reviewing it completes the action as the human and clears the row.
  await page.goto("/inbox?tab=delegated");
  const tab = page.getByTestId("delegated-tab");
  await expect(tab).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  const row = tab
    .locator('[data-testid^="delegated-row-"][data-status="SUCCEEDED"]')
    .filter({ hasText: fixture.agentRunActionName })
    .first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(STUB_OUTPUT.text.slice(0, 30));
  await row.getByTestId("delegated-mark-done").click();
  // The row leaves Finished (no Mark done any more) for Reviewed this week.
  await expect(row.getByTestId("delegated-mark-done")).toHaveCount(0, { timeout: 10_000 });
  await expect(tab.getByText("Reviewed this week")).toBeVisible();
  // ...and the action itself is complete.
  await page.goto(fixture.agentRunActionUrl);
  await expect(page.getByText(fixture.agentRunActionName).first()).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByText(/^(Completed|Done)$/).first()).toBeVisible();
});

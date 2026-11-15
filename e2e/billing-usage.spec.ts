/**
 * Billing V1, end to end: on an install that meters Assistant use
 * (BILLING_MODE=meter, set for the dev server in playwright.config.ts), one
 * web chat turn in a workspace writes one priced UsageEvent, and the
 * workspace's owner sees the usage bar move on Settings → Billing.
 *
 * Mastra is a stub started by this spec on the port the dev server was told
 * to use. It answers the chat stream with one model step whose usage has
 * fresh input, a cache read, a cache write and output, so the recorded cost
 * proves each class was priced once at its own rate.
 *
 * Also covered: a chat with no workspace is metered to the person's Personal
 * workspace, and a fast-tier attempt that came back empty and was retried on
 * the full model is metered too (both attempts were paid for).
 *
 * And the workspace's own Anthropic key (bring-your-own-key): the Billing tab
 * offers the form, and shows a saved key by its last four characters only.
 * Saving one calls Anthropic, so that path is covered by unit tests, not here.
 *
 * The stub port is shared with agent-run.spec.ts; both run in the
 * `chromium-mastra-stub` project, one file at a time.
 *
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import http from "node:http";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { FREE_ALLOWANCE_MICROS } from "../src/server/services/billing/config";
import { loadFixture, E2E_MASTRA_SERVER_KEY, E2E_MASTRA_STUB_PORT } from "./fixture-data";

// Specs run in their own worker process, so env loading (and its
// production/managed-DB guards) has to happen here as well as in global-setup.
loadDevEnvOrThrow();

test.describe.configure({ mode: "serial" });

const fixture = loadFixture();
/** First hit on a `next dev` route pays the compile cost. */
const FIRST_PAINT_TIMEOUT = 60_000;
const billingUrl = `/w/${fixture.workspaceSlug}/settings?section=billing`;

const HAIKU_MODEL_ID = "claude-haiku-4-5-20251001";
const SONNET_MODEL_ID = "claude-sonnet-4-5-20250929";
/** One model step, in the shape Mastra reports it: `inputTokens` is the whole prompt. */
const STEP_USAGE = {
  inputTokens: 674_000,
  outputTokens: 20_000,
  totalTokens: 694_000,
  cachedInputTokens: 500_000,
  raw: {
    inputTokens: { total: 674_000, noCache: 30_000, cacheRead: 500_000, cacheWrite: 144_000 },
    outputTokens: { total: 20_000 },
  },
};
/**
 * Haiku 4.5 is $1 in / $5 out per million tokens, cache reads at 0.1x and
 * cache writes at 1.25x:
 *   30,000 × $1 + 500,000 × $0.10 + 144,000 × $1.25 + 20,000 × $5, per million
 *   = $0.03 + $0.05 + $0.18 + $0.10 = $0.36
 */
const HAIKU_COST_MICROS = 360_000;
/** Sonnet 4.5 is $3 in / $15 out: the same step costs $0.09 + $0.15 + $0.54 + $0.30 = $1.08. */
const SONNET_COST_MICROS = 1_080_000;
const EXPECTED_PERCENT = Math.round((HAIKU_COST_MICROS / FREE_ALLOWANCE_MICROS) * 100);

const sse = (chunk: unknown) => `data: ${JSON.stringify(chunk)}\n\n`;
/** How Mastra marks a model call it made on the workspace's own key. */
const ownKeyStamp = () => (ranOnOwnKey ? { providerMetadata: { ownKey: { used: true } } } : {});

let db: PrismaClient;
let workspaceId: string;
let personalWorkspaceId: string;
let stub: http.Server;
const streamedAgents: string[] = [];
/** When true, the fast-tier agent answers with no text, which makes the app retry on the full model. */
let fastTierAnswersEmpty = false;
/** When true, the stub reports its model calls as made on the workspace's own Anthropic key. */
let ranOnOwnKey = false;
/**
 * When true, the stub behaves as Mastra does when Anthropic refuses the
 * workspace's key: it tells the app, then answers on the hosted key.
 */
let anthropicRefusesTheKey = false;
const failureReports: { status: number; body: string }[] = [];
const APP_URL = `http://localhost:${process.env.E2E_PORT ?? "3100"}`;

async function clearLedger() {
  const where = { workspaceId: { in: [workspaceId, personalWorkspaceId] } };
  await db.usageEvent.deleteMany({ where });
  await db.workspaceUsagePeriod.deleteMany({ where });
  await db.integration.deleteMany({ where: { workspaceId, type: "model_key" } });
  await db.notification.deleteMany({ where: { category: "billing", dedupeKey: { contains: workspaceId } } });
}

const seedModelKey = (status: "valid" | "failing") =>
  db.integration.create({
    data: {
      name: "Anthropic API key",
      type: "model_key",
      provider: "anthropic",
      workspaceId,
      providerConfig: { last4: "7Q4x", status, checkedAt: new Date().toISOString() },
      credentials: { create: { key: "ciphertext-the-page-never-reads", keyType: "API_KEY", isEncrypted: true } },
    },
  });

const modelKeyState = async () => {
  const row = await db.integration.findFirst({
    where: { workspaceId, type: "model_key" },
    select: { providerConfig: true },
  });
  return (row?.providerConfig as { status?: string } | null)?.status ?? null;
};

const ledgerEvents = (inWorkspaceId: string) =>
  db.usageEvent.findMany({
    where: { workspaceId: inWorkspaceId },
    orderBy: { createdAt: "asc" },
    select: { source: true, modelId: true, costMicros: true, onOwnKey: true, refId: true },
  });

test.beforeAll(async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  db = new Client();
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { slug: fixture.workspaceSlug },
    select: { id: true },
  });
  workspaceId = workspace.id;
  const personal = await db.workspace.findUniqueOrThrow({
    where: { slug: fixture.personalWorkspaceSlug },
    select: { id: true },
  });
  personalWorkspaceId = personal.id;

  stub = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      void (async () => {
        const agent = /^\/api\/agents\/([^/]+)\/stream/.exec(req.url ?? "")?.[1];
        if (!agent) {
          // Anything else that reaches the stub while it is up (a stray agent-run
          // dispatch from another spec) is not this spec's business.
          res.statusCode = 404;
          res.end("{}");
          return;
        }
        streamedAgents.push(agent);
        if (anthropicRefusesTheKey && req.headers.authorization) {
          // The turn's own token says whose turn it is; the server key says the
          // report comes from the Mastra server.
          const report = await fetch(`${APP_URL}/api/trpc/mastra.reportModelKeyFailure`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: req.headers.authorization,
              "x-mastra-server-key": E2E_MASTRA_SERVER_KEY,
            },
            body: JSON.stringify({ json: { workspaceId } }),
          });
          failureReports.push({ status: report.status, body: (await report.text()).slice(0, 300) });
        }
        const isFastTier = agent.endsWith("Haiku");
        res.setHeader("content-type", "text/event-stream");
        if (!(isFastTier && fastTierAnswersEmpty)) {
          res.write(sse({ type: "text-delta", payload: { text: "Three things are due today." } }));
        }
        res.write(
          sse({
            type: "step-finish",
            payload: {
              stepResult: { reason: "stop" },
              output: { usage: STEP_USAGE },
              metadata: { modelId: isFastTier ? HAIKU_MODEL_ID : SONNET_MODEL_ID, ...ownKeyStamp() },
            },
          }),
        );
        res.write(
          sse({
            type: "finish",
            payload: { stepResult: { reason: "stop" }, output: { usage: STEP_USAGE }, metadata: ownKeyStamp() },
          }),
        );
        res.end("data: [DONE]\n\n");
      })();
    });
  });
  await new Promise<void>((resolve) => stub.listen(E2E_MASTRA_STUB_PORT, "127.0.0.1", resolve));
});

test.beforeEach(async () => {
  streamedAgents.length = 0;
  fastTierAnswersEmpty = false;
  ranOnOwnKey = false;
  anthropicRefusesTheKey = false;
  failureReports.length = 0;
  await clearLedger();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()));
  await clearLedger();
  await db.$disconnect();
});

test("a chat turn is metered to its workspace and moves the owner's usage bar", async ({ page, request }) => {
  // Before any Assistant use this month, the bar is empty.
  await page.goto(billingUrl);
  await expect(page.getByText("0% of this month's assistant use")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByText("Nothing is limited yet.")).toBeVisible();

  // One chat turn in the workspace, on the fast tier.
  const turn = await request.post("/api/chat/stream", {
    data: {
      agentId: "zoeAgentHaiku",
      workspaceId,
      messages: [{ role: "user", content: "What is due today?" }],
    },
    timeout: FIRST_PAINT_TIMEOUT,
  });
  expect(turn.ok()).toBe(true);
  expect(await turn.text()).toContain("Three things are due today.");
  expect(streamedAgents).toEqual(["zoeAgentHaiku"]);

  // The ledger write happens after the stream closes: one event, priced once per class.
  await expect.poll(async () => (await ledgerEvents(workspaceId)).length, { timeout: 15_000 }).toBe(1);
  const [event] = await ledgerEvents(workspaceId);
  expect(event).toMatchObject({
    source: "CHAT",
    modelId: HAIKU_MODEL_ID,
    costMicros: HAIKU_COST_MICROS,
    onOwnKey: false,
  });
  // It points at the turn's AiInteractionHistory row.
  const interaction = await db.aiInteractionHistory.findUnique({
    where: { id: event!.refId ?? "" },
    select: { workspaceId: true },
  });
  expect(interaction).toEqual({ workspaceId });

  // The owner sees the bar move.
  await page.reload();
  const label = `${EXPECTED_PERCENT}% of this month's assistant use`;
  await expect(page.getByText(label)).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByRole("progressbar", { name: label })).toHaveAttribute(
    "aria-valuenow",
    String(EXPECTED_PERCENT),
  );
  await page.screenshot({ path: test.info().outputPath("billing-usage-bar.png") });
});

test("a chat with no workspace is metered to the person's Personal workspace", async ({ request }) => {
  // The global chat drawer and /agent send no workspace.
  const turn = await request.post("/api/chat/stream", {
    data: { agentId: "zoeAgentHaiku", messages: [{ role: "user", content: "What is due today?" }] },
    timeout: FIRST_PAINT_TIMEOUT,
  });
  expect(turn.ok()).toBe(true);

  await expect.poll(async () => (await ledgerEvents(personalWorkspaceId)).length, { timeout: 15_000 }).toBe(1);
  expect((await ledgerEvents(personalWorkspaceId))[0]).toMatchObject({
    source: "CHAT",
    modelId: HAIKU_MODEL_ID,
    costMicros: HAIKU_COST_MICROS,
  });
  expect(await ledgerEvents(workspaceId)).toEqual([]);
});

test("a fast-tier attempt that came back empty is metered as well as its retry", async ({ request }) => {
  fastTierAnswersEmpty = true;

  const turn = await request.post("/api/chat/stream", {
    data: {
      agentId: "zoeAgentHaiku",
      workspaceId,
      messages: [{ role: "user", content: "What is due today?" }],
    },
    timeout: FIRST_PAINT_TIMEOUT,
  });
  expect(turn.ok()).toBe(true);
  // The empty fast-tier reply was retried on the full model, which answered.
  expect(await turn.text()).toContain("Three things are due today.");
  expect(streamedAgents).toEqual(["zoeAgentHaiku", "zoeAgent"]);

  // Both attempts were paid for, so both are in the ledger, each at its own model's rate.
  await expect.poll(async () => (await ledgerEvents(workspaceId)).length, { timeout: 15_000 }).toBe(2);
  const events = await ledgerEvents(workspaceId);
  expect(events.map((event) => ({ modelId: event.modelId, costMicros: event.costMicros })).sort((a, b) => a.costMicros - b.costMicros)).toEqual([
    { modelId: HAIKU_MODEL_ID, costMicros: HAIKU_COST_MICROS },
    { modelId: SONNET_MODEL_ID, costMicros: SONNET_COST_MICROS },
  ]);
  // Only the attempt that answered has an AiInteractionHistory row to point at.
  expect(events.filter((event) => event.refId !== null)).toHaveLength(1);

  const period = await db.workspaceUsagePeriod.findFirst({ where: { workspaceId }, select: { costMicros: true } });
  expect(Number(period?.costMicros)).toBe(HAIKU_COST_MICROS + SONNET_COST_MICROS);
});

test("a turn on the workspace's own key is recorded but does not move the usage bar", async ({ page, request }) => {
  ranOnOwnKey = true;

  const turn = await request.post("/api/chat/stream", {
    data: {
      agentId: "zoeAgentHaiku",
      workspaceId,
      messages: [{ role: "user", content: "What is due today?" }],
    },
    timeout: FIRST_PAINT_TIMEOUT,
  });
  expect(turn.ok()).toBe(true);

  // It is in the ledger, at its real cost, marked as the workspace's own key.
  await expect.poll(async () => (await ledgerEvents(workspaceId)).length, { timeout: 15_000 }).toBe(1);
  expect((await ledgerEvents(workspaceId))[0]).toMatchObject({
    source: "CHAT",
    costMicros: HAIKU_COST_MICROS,
    onOwnKey: true,
  });
  // The month's counter was never touched, so the bar stays empty.
  expect(await db.workspaceUsagePeriod.count({ where: { workspaceId } })).toBe(0);
  await page.goto(billingUrl);
  await expect(page.getByText("0% of this month's assistant use")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
});

test("the Billing tab offers the key form and shows a saved key by its last four characters", async ({ page }) => {
  await page.goto(billingUrl);
  await expect(page.getByText("Your own Anthropic key")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByLabel("Anthropic API key")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check and save" })).toBeDisabled();

  // A key saved earlier: only what the server may show again is stored in the clear.
  await seedModelKey("valid");

  await page.reload();
  await expect(page.getByText("Ends in 7Q4x")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByText("Working", { exact: true })).toBeVisible();
  // The form is put away until the owner asks to replace the key.
  await expect(page.getByLabel("Anthropic API key")).toHaveCount(0);
  await page.getByRole("button", { name: "Replace" }).click();
  await expect(page.getByLabel("Anthropic API key")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("billing-model-key.png") });
  await page.getByRole("button", { name: "Cancel" }).click();

  // Removing it asks first, then puts the workspace back on the allowance.
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Remove this key?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByText("Ends in 7Q4x")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByLabel("Anthropic API key")).toBeVisible();
  expect(await db.integration.count({ where: { workspaceId, type: "model_key" } })).toBe(0);
});

test("a key Anthropic stops accepting is marked, its owner is told, and the turn counts against the allowance", async ({
  page,
  request,
}) => {
  await seedModelKey("valid");
  anthropicRefusesTheKey = true;

  const chat = () =>
    request.post("/api/chat/stream", {
      data: {
        agentId: "zoeAgentHaiku",
        workspaceId,
        messages: [{ role: "user", content: "What is due today?" }],
      },
      timeout: FIRST_PAINT_TIMEOUT,
    });
  expect((await chat()).ok()).toBe(true);

  // Mastra's report was believed, and the key is no longer handed out.
  expect(failureReports).toHaveLength(1);
  expect(failureReports[0]?.status).toBe(200);
  expect(failureReports[0]?.body).toContain('"marked":true');
  expect(await modelKeyState()).toBe("failing");

  // The turn ran on the hosted key, so it counts.
  await expect.poll(async () => (await ledgerEvents(workspaceId)).length, { timeout: 15_000 }).toBe(1);
  expect((await ledgerEvents(workspaceId))[0]).toMatchObject({ costMicros: HAIKU_COST_MICROS, onOwnKey: false });

  // The workspace's owner has a notification naming the key, linking to this tab.
  const billingNotifications = () =>
    db.notification.findMany({
      where: { category: "billing", dedupeKey: { contains: workspaceId } },
      select: { title: true, message: true, deeplink: true, userId: true },
    });
  const notifications = await billingNotifications();
  expect(notifications).toHaveLength(1);
  expect(notifications[0]?.userId).toBe(fixture.userId);
  expect(notifications[0]?.title).toContain("stopped working");
  expect(notifications[0]?.message).toContain("7Q4x");
  expect(notifications[0]?.deeplink).toBe(billingUrl);

  // A second failing turn reports again; nobody is told twice.
  expect((await chat()).ok()).toBe(true);
  expect(failureReports).toHaveLength(2);
  expect(failureReports[1]?.body).toContain('"marked":false');
  expect(await billingNotifications()).toHaveLength(1);

  await page.goto(billingUrl);
  await expect(page.getByText("Ends in 7Q4x")).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(page.getByText("Not working", { exact: true })).toBeVisible();
  await expect(page.getByText("Anthropic stopped accepting this key")).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("billing-model-key-failing.png") });
});

test("a report that does not come from the Mastra server is refused", async ({ request }) => {
  await seedModelKey("valid");

  // A signed-in person calling the callback themselves: no server key.
  const report = await request.post("/api/trpc/mastra.reportModelKeyFailure", {
    data: { json: { workspaceId } },
  });

  expect(report.status()).toBe(403);
  expect(await modelKeyState()).toBe("valid");
});


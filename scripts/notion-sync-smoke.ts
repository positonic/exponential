/**
 * Live sandbox Notion ↔ Exponential ticket-sync smoke test (chief.sage).
 *
 * Exercises the layer fakes cannot cover — the real Notion API, the encrypted
 * credential path, and the deployed sync engine — against a DEDICATED sandbox:
 * a test product (`sync-smoke-test`) linked to a Notion database whose title
 * must contain "SYNC-TEST" (hard guard; the script refuses anything else).
 *
 * Flow:
 *   1. Idempotent setup: ensure the test product exists, is linked to the
 *      sandbox database via the user's Notion connection, and sync + push are
 *      enabled. Fails with actionable instructions when the app's Notion
 *      connection cannot see the sandbox database.
 *   2. Outbound: create a ticket via the API → wait for the push queue to
 *      mirror it to Notion → assert every mapped property round-trips.
 *   3. Inbound: edit the page title via the TEST integration token (a
 *      different Notion bot than the sync's connection, so the edit reads as
 *      human) → trigger a manual sync → assert the ticket updated.
 *   4. Quiescence: one more manual sync must report zero created/updated and
 *      the page must not be touched again (live no-ping-pong check).
 *   5. Cleanup (always): archive the ticket and trash the Notion page.
 *
 * Required environment:
 *   EXPONENTIAL_TOKEN         API token (same kind the exponential CLI uses)
 *   NOTION_TEST_TOKEN         Internal-integration secret for the SANDBOX
 *                             database (must NOT be the sync connection's own
 *                             bot, or inbound edits would be echo-suppressed)
 *   NOTION_TEST_DATABASE_URL  Browser URL of the sandbox database
 * Optional:
 *   EXPONENTIAL_API_URL       default https://www.exponential.im
 *   EXPONENTIAL_WORKSPACE_ID  workspace for the test product; default: the
 *                             caller's first workspace whose slug starts with
 *                             "personal-"
 *
 * Run: npx tsx scripts/notion-sync-smoke.ts
 * CI:  .github/workflows/notion-sync-smoke.yml (nightly + manual dispatch)
 */

import { Client as NotionClient } from "@notionhq/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../src/server/api/root";
import {
  mapPoints,
  mapPriority,
  mapStatus,
  mapType,
} from "../src/server/services/ticketSync/mapping";

const PRODUCT_SLUG = "sync-smoke-test";
const PRODUCT_NAME = "Sync Smoke Test";
const DB_TITLE_GUARD = "SYNC-TEST";
const PUSH_TIMEOUT_MS = 5 * 60 * 1000; // immediate drain + 2-min cron net
const POLL_INTERVAL_MS = 10 * 1000;
const QUIESCENCE_WAIT_MS = 30 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function log(message: string): void {
  console.log(`[smoke ${new Date().toISOString()}] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll<T>(
  what: string,
  timeoutMs: number,
  probe: () => Promise<T | null>,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await probe();
    if (result !== null) return result;
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${what}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Extract the 32-hex database id from a Notion URL (dashed or not). */
function databaseIdFromUrl(url: string): string {
  const compact = url.replace(/-/g, "");
  const match = /([0-9a-f]{32})/i.exec(compact);
  if (!match?.[1]) {
    throw new Error(
      `Could not find a Notion database id in NOTION_TEST_DATABASE_URL (${url})`,
    );
  }
  const raw = match[1].toLowerCase();
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

// ── Loosely-shaped Notion payload readers (the SDK's unions are unwieldy) ────

interface NotionProperty {
  type: string;
  title?: Array<{ plain_text?: string }>;
  status?: { name?: string } | null;
  select?: { name?: string } | null;
  number?: number | null;
}

interface NotionPageLike {
  id: string;
  archived?: boolean;
  last_edited_time?: string;
  properties?: Record<string, NotionProperty>;
}

function pageTitle(page: NotionPageLike): string {
  for (const prop of Object.values(page.properties ?? {})) {
    if (prop.type === "title") {
      return (prop.title ?? []).map((t) => t.plain_text ?? "").join("");
    }
  }
  return "";
}

function optionName(page: NotionPageLike, property: string): string | null {
  const prop = page.properties?.[property];
  if (!prop) return null;
  if (prop.type === "status") return prop.status?.name ?? null;
  if (prop.type === "select") return prop.select?.name ?? null;
  if (prop.type === "number") {
    return prop.number == null ? null : String(prop.number);
  }
  return null;
}

function titlePropertyName(page: NotionPageLike): string | null {
  for (const [name, prop] of Object.entries(page.properties ?? {})) {
    if (prop.type === "title") return name;
  }
  return null;
}

async function main(): Promise<void> {
  const apiUrl = process.env.EXPONENTIAL_API_URL ?? "https://www.exponential.im";
  const token = requireEnv("EXPONENTIAL_TOKEN");
  const notionToken = requireEnv("NOTION_TEST_TOKEN");
  const databaseId = databaseIdFromUrl(requireEnv("NOTION_TEST_DATABASE_URL"));

  const api = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/api/trpc`,
        transformer: superjson,
        headers: { Authorization: `Bearer ${token}` },
      }),
    ],
  });
  const notion = new NotionClient({ auth: notionToken });

  // ── Guard: the sandbox database must be unmistakably a test database ──────
  const db = (await notion.databases.retrieve({
    database_id: databaseId,
  })) as unknown as { title?: Array<{ plain_text?: string }> };
  const dbTitle = (db.title ?? []).map((t) => t.plain_text ?? "").join("");
  if (!dbTitle.toUpperCase().includes(DB_TITLE_GUARD)) {
    throw new Error(
      `Refusing to run: database title "${dbTitle}" does not contain "${DB_TITLE_GUARD}". ` +
        `Point NOTION_TEST_DATABASE_URL at the sandbox copy, never a real backlog.`,
    );
  }
  log(`Sandbox database OK: "${dbTitle}" (${databaseId})`);

  // ── Setup: workspace → product → sync config (all idempotent) ─────────────
  const workspaces = await api.workspace.list.query();
  const workspaceId =
    process.env.EXPONENTIAL_WORKSPACE_ID ??
    workspaces.find((w) => w.slug.startsWith("personal-"))?.id;
  if (!workspaceId) {
    throw new Error(
      "No workspace found — set EXPONENTIAL_WORKSPACE_ID to the workspace that should hold the test product",
    );
  }

  const products = await api.product.product.list.query({ workspaceId });
  const existing = products.find((p) => p.slug === PRODUCT_SLUG);
  let product: { id: string; name: string };
  if (existing) {
    product = existing;
  } else {
    log(`Creating test product "${PRODUCT_SLUG}"`);
    product = await api.product.product.create.mutate({
      workspaceId,
      name: PRODUCT_NAME,
      slug: PRODUCT_SLUG,
      description:
        "Dedicated product for the nightly Notion sync smoke test. Safe to ignore; tickets here are synthetic.",
    });
  }
  log(`Test product: ${product.name} (${product.id})`);

  let config = await api.product.ticketSync.getConfig.query({
    productId: product.id,
  });
  if (!config || config.databaseId !== databaseId || !config.integrationId) {
    const connections = await api.integration.listNotionConnections.query({});
    const connection = connections[0];
    if (!connection) {
      throw new Error(
        "No Notion connection found on this account — connect Notion in Exponential first",
      );
    }
    const visible = await api.integration.getNotionDatabases.query({
      integrationId: connection.id,
    });
    if (!visible.some((d) => d.id.replace(/-/g, "") === databaseId.replace(/-/g, ""))) {
      throw new Error(
        `The app's Notion connection "${connection.name}" cannot see the sandbox database. ` +
          `In Notion, open "${dbTitle}" → ⋯ → Connections → add the connection the app uses.`,
      );
    }
    log(`Linking product to sandbox database via connection "${connection.name}"`);
    await api.product.ticketSync.saveConfig.mutate({
      productId: product.id,
      integrationId: connection.id,
      databaseId,
      databaseName: dbTitle,
    });
    config = await api.product.ticketSync.getConfig.query({
      productId: product.id,
    });
  }
  if (!config) throw new Error("Sync config vanished after saveConfig");
  if (!config.enabled) {
    await api.product.ticketSync.setEnabled.mutate({
      productId: product.id,
      enabled: true,
    });
  }
  if (!config.pushEnabled) {
    await api.product.ticketSync.setPushEnabled.mutate({
      productId: product.id,
      pushEnabled: true,
    });
  }
  log("Sync config ready (enabled + push enabled)");

  // ── The run's synthetic ticket ────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const title = `SMOKE ${stamp}`;
  let ticketId: string | null = null;
  let pageId: string | null = null;

  try {
    // ── Outbound leg: Exponential → Notion ──────────────────────────────────
    const ticket = await api.product.ticket.create.mutate({
      productId: product.id,
      title,
      body: "Synthetic ticket created by scripts/notion-sync-smoke.ts — auto-archived at the end of the run.",
      type: "CHORE",
      status: "IN_PROGRESS",
      priority: 1,
      points: 3,
    });
    ticketId = ticket.id;
    log(`Created ticket ${ticket.id} ("${title}") — waiting for the push mirror`);

    const page = await poll(
      `Notion page titled "${title}"`,
      PUSH_TIMEOUT_MS,
      async () => {
        const result = (await notion.databases.query({
          database_id: databaseId,
          page_size: 100,
        })) as unknown as { results: NotionPageLike[] };
        return result.results.find((p) => pageTitle(p) === title) ?? null;
      },
    );
    pageId = page.id;
    log(`Page mirrored: ${page.id}`);

    // Property round-trip assertions via the sync's own tolerant mapping.
    const failures: string[] = [];
    const rawStatus = optionName(page, "Status");
    if (mapStatus(rawStatus).status !== "IN_PROGRESS") {
      failures.push(`Status "${rawStatus ?? "<unset>"}" does not map to IN_PROGRESS`);
    }
    const rawPriority = optionName(page, "Priority");
    if (mapPriority(rawPriority) !== 1) {
      failures.push(`Priority "${rawPriority ?? "<unset>"}" does not map to 1`);
    }
    const rawType = optionName(page, "Type");
    if (rawType !== null && mapType(rawType) !== "CHORE") {
      failures.push(`Type "${rawType}" does not map to CHORE`);
    }
    const rawEffort = optionName(page, "Effort");
    if (rawEffort !== null && mapPoints(rawEffort) !== 3) {
      failures.push(`Effort "${rawEffort}" does not map to 3 points`);
    }
    if (failures.length > 0) {
      throw new Error(`Outbound property assertions failed:\n- ${failures.join("\n- ")}`);
    }
    log("Outbound leg OK: all mapped properties round-trip");

    // ── Inbound leg: Notion → Exponential ───────────────────────────────────
    const editedTitle = `${title} EDITED`;
    const titleProp = titlePropertyName(page);
    if (!titleProp) throw new Error("Sandbox page has no title property");
    await notion.pages.update({
      page_id: page.id,
      properties: {
        [titleProp]: { title: [{ text: { content: editedTitle } }] },
      },
    });
    log(`Edited page title via test integration — triggering manual sync`);

    await poll(`ticket title to become "${editedTitle}"`, PUSH_TIMEOUT_MS, async () => {
      const sync = await api.product.ticketSync.syncNow.mutate({
        productId: product.id,
      });
      log(
        `syncNow: created=${sync.created} updated=${sync.updated} skipped=${sync.skipped} failed=${sync.failed}`,
      );
      const current = await api.product.ticket.getById.query({ id: ticket.id });
      return current.title === editedTitle ? current : null;
    });
    log("Inbound leg OK: the human-style Notion edit reached the ticket");

    // ── Quiescence: nothing left to reconcile, no echo back to Notion ───────
    await sleep(QUIESCENCE_WAIT_MS);
    const before = (await notion.pages.retrieve({
      page_id: page.id,
    })) as unknown as NotionPageLike;
    const quiet = await api.product.ticketSync.syncNow.mutate({
      productId: product.id,
    });
    if (quiet.created !== 0 || quiet.updated !== 0 || quiet.failed !== 0) {
      throw new Error(
        `Quiescence failed: post-convergence sync reported created=${quiet.created} updated=${quiet.updated} failed=${quiet.failed}`,
      );
    }
    await sleep(QUIESCENCE_WAIT_MS);
    const after = (await notion.pages.retrieve({
      page_id: page.id,
    })) as unknown as NotionPageLike;
    if (before.last_edited_time !== after.last_edited_time) {
      throw new Error(
        `Quiescence failed: the Notion page was edited after convergence (${before.last_edited_time ?? "?"} -> ${after.last_edited_time ?? "?"}) — possible echo/ping-pong`,
      );
    }
    log("Quiescence OK: zero pending changes, page untouched");

    log("SMOKE TEST PASSED");
  } finally {
    // ── Cleanup: always, even on assertion failure ──────────────────────────
    if (ticketId) {
      try {
        await api.product.ticket.update.mutate({ id: ticketId, status: "ARCHIVED" });
        log(`Cleanup: ticket ${ticketId} archived`);
      } catch (error) {
        log(`Cleanup warning: could not archive ticket ${ticketId}: ${String(error)}`);
      }
    }
    if (pageId) {
      try {
        await notion.pages.update({ page_id: pageId, archived: true });
        log(`Cleanup: Notion page ${pageId} trashed`);
      } catch (error) {
        log(`Cleanup warning: could not trash page ${pageId}: ${String(error)}`);
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    `[smoke] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});

import { type PrismaClient } from "@prisma/client";

import { generateAgentJWT } from "~/server/utils/jwt";

const MASTRA_API_URL = process.env.MASTRA_API_URL;

// How many contacts a single cron sweep will hand to the enrichment agent.
// Bounded so one invocation stays well inside the serverless time budget; the
// remainder is picked up on the next sweep.
const BATCH_SIZE = 10;

export interface RunEnrichmentsResult {
  claimed: number;
  completed: string[];
  failed: { id: string; error: string }[];
}

/**
 * Drains PENDING `CrmContactEnrichment` rows and hands each contact to Mastra's
 * `enrichmentAgent`, which web-searches the person and writes the results back
 * to the contact itself (via its CRM update tool, through exponential's
 * encrypted update path). This runner only claims work, triggers the agent, and
 * records status — it never touches contact PII directly.
 *
 * Claiming is atomic per row (updateMany filtered on status=PENDING) so
 * overlapping cron sweeps never double-process the same job.
 */
export async function runPendingEnrichments(
  db: PrismaClient,
  now: Date,
): Promise<RunEnrichmentsResult> {
  const result: RunEnrichmentsResult = { claimed: 0, completed: [], failed: [] };

  if (!MASTRA_API_URL) {
    console.error(
      "[crmEnrichment] MASTRA_API_URL not set; skipping enrichment sweep",
    );
    return result;
  }

  const pending = await db.crmContactEnrichment.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });

  for (const { id } of pending) {
    // Atomic claim: only the sweep that flips PENDING→RUNNING owns this row.
    const claim = await db.crmContactEnrichment.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: now },
    });
    if (claim.count !== 1) continue;
    result.claimed += 1;

    try {
      await enrichOne(db, id);
      await db.crmContactEnrichment.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      result.completed.push(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db.crmContactEnrichment.update({
        where: { id },
        data: { status: "FAILED", error: message, completedAt: new Date() },
      });
      result.failed.push({ id, error: message });
    }
  }

  return result;
}

async function enrichOne(db: PrismaClient, enrichmentId: string): Promise<void> {
  const enrichment = await db.crmContactEnrichment.findUniqueOrThrow({
    where: { id: enrichmentId },
    include: {
      contact: { include: { organization: { select: { name: true } } } },
    },
  });
  const contact = enrichment.contact;

  // Load the job's creator to authenticate the agent's CRM write-back as a
  // real workspace member (the tools authorize via this JWT).
  const creator = enrichment.createdById
    ? await db.user.findUnique({
        where: { id: enrichment.createdById },
        select: { id: true, email: true, name: true, image: true },
      })
    : null;
  if (!creator) {
    throw new Error("Enrichment job has no resolvable creator to authorize");
  }

  const agentJWT = generateAgentJWT(
    { id: creator.id, email: creator.email, name: creator.name, image: creator.image },
    30,
  );

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();

  // Provenance (ADR-0036). A field already populated by a HUMAN (present but not
  // in aiSourcedFields) is locked — the agent must not touch it. Empty fields, or
  // fields still AI-sourced, are fair game (fill or refresh). Presence is a plain
  // null-check on the (encrypted) columns; no PII is decrypted.
  const aiSourced = new Set(contact.aiSourcedFields);
  const contactRow = contact as unknown as Record<string, unknown>;
  const humanLocked = ENRICHABLE_FIELDS.filter(
    (f) => isFieldPresent(contactRow, f.key) && !aiSourced.has(f.key),
  );

  const known: string[] = [];
  if (contact.organization?.name) known.push(`Organization: ${contact.organization.name}`);
  if (contact.tags?.length) known.push(`Tags: ${contact.tags.join(", ")}`);

  const prompt = [
    `Enrich the CRM contact with id "${contact.id}" (workspace "${contact.workspaceId}").`,
    name ? `Name: ${name}.` : "Name unknown.",
    known.length ? `Context:\n${known.join("\n")}` : "No other details known.",
    "",
    "Web-search this person, then update the contact (contactId above) with any",
    "details you can verify: email, LinkedIn, Twitter/X, a concise bio (about), and",
    "their current organization (link by name if found).",
    humanLocked.length
      ? `Do NOT modify these human-verified fields — leave them exactly as they are: ${humanLocked
          .map((f) => f.label)
          .join(", ")}.`
      : "",
    "You may fill any empty field, and may correct a field only if it was itself",
    "AI-suggested. Never invent a value you cannot verify.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(`${MASTRA_API_URL}/api/agents/enrichmentAgent/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agentJWT}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      requestContext: {
        authToken: agentJWT,
        userId: creator.id,
        userEmail: creator.email,
        workspaceId: contact.workspaceId,
        todoAppBaseUrl:
          process.env.TODO_APP_BASE_URL ??
          process.env.NEXTAUTH_URL ??
          "http://localhost:3000",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Mastra enrichmentAgent failed (${res.status}): ${errText.slice(0, 500)}`,
    );
  }

  // Provenance write-back (ADR-0036): re-read the contact and mark which
  // enrichable fields are now AI-sourced — anything present that the agent was
  // free to write (i.e. not human-locked). Only presence is inspected; no PII is
  // decrypted or stored. We deliberately do NOT persist the agent's free-text
  // response (it can echo PII into the plaintext metadata column).
  const after = await db.crmContact.findUniqueOrThrow({
    where: { id: contact.id },
    select: {
      email: true,
      phone: true,
      linkedIn: true,
      telegram: true,
      twitter: true,
      github: true,
      bluesky: true,
      about: true,
      organizationId: true,
    },
  });
  const afterRow = after as unknown as Record<string, unknown>;
  const lockedKeys = new Set(humanLocked.map((f) => f.key));
  const nextAiSourced = ENRICHABLE_FIELDS.filter(
    (f) => isFieldPresent(afterRow, f.key) && !lockedKeys.has(f.key),
  ).map((f) => f.key);

  await db.crmContact.update({
    where: { id: contact.id },
    data: { aiSourcedFields: nextAiSourced },
  });
}

// The contact fields enrichment may write, with human-facing labels. `about` is
// treated empty when blank; the rest are empty when null (encrypted PII columns
// are null when unset, so presence needs no decryption).
const ENRICHABLE_FIELDS = [
  { key: "email", label: "email" },
  { key: "phone", label: "phone" },
  { key: "linkedIn", label: "LinkedIn" },
  { key: "telegram", label: "Telegram" },
  { key: "twitter", label: "Twitter" },
  { key: "github", label: "GitHub" },
  { key: "bluesky", label: "Bluesky" },
  { key: "about", label: "bio" },
  { key: "organizationId", label: "organization" },
] as const;

function isFieldPresent(row: Record<string, unknown>, key: string): boolean {
  const v = row[key];
  if (key === "about") return typeof v === "string" && v.trim().length > 0;
  return v != null;
}

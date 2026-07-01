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

  // Tell the agent which contactable fields are ALREADY populated by name only —
  // presence, never the decrypted value. This keeps the "only fill empty fields"
  // guidance actionable without decrypting PII into the prompt (and thus into the
  // external agent request / model context). Presence is a plain null-check on
  // the encrypted columns; no decryption needed.
  const alreadySet: string[] = [];
  if (contact.email != null) alreadySet.push("email");
  if (contact.phone != null) alreadySet.push("phone");
  if (contact.linkedIn != null) alreadySet.push("LinkedIn");
  if (contact.twitter != null) alreadySet.push("Twitter");
  if (contact.github != null) alreadySet.push("GitHub");
  if (contact.bluesky != null) alreadySet.push("Bluesky");

  const known: string[] = [];
  if (contact.about) known.push(`Bio: ${contact.about}`);
  if (contact.organization?.name) known.push(`Organization: ${contact.organization.name}`);
  if (contact.tags?.length) known.push(`Tags: ${contact.tags.join(", ")}`);
  if (alreadySet.length) {
    known.push(`Already-populated fields (do NOT overwrite): ${alreadySet.join(", ")}`);
  }

  const prompt = [
    `Enrich the CRM contact with id "${contact.id}" (workspace "${contact.workspaceId}").`,
    name ? `Name: ${name}.` : "Name unknown.",
    known.length ? `Already known:\n${known.join("\n")}` : "No other details known.",
    "",
    "Web-search this person, then update the contact (contactId above) with any",
    "new details you can verify: email, LinkedIn, Twitter/X, a concise bio (about),",
    "and their current organization. Only fill fields that are currently empty —",
    "never overwrite an existing value. Link the organization by name if found.",
  ].join("\n");

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

  // Deliberately do NOT persist the agent's free-text response: it can echo
  // back PII it found/confirmed (e.g. the contact's email), and metadata is a
  // plaintext JSONB column — storing it there would undercut the encryption-at-
  // rest guarantee for contact PII. The enrichment result is already reflected
  // on the contact record itself (the source of truth), and this job's
  // status/timestamps provide the audit trail.
}

import crypto from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { encryptString } from "~/server/utils/encryption";
import { dispatchContactTypeAutomations } from "./automation/dispatchContactTypeAutomations";

/**
 * Shared contact-create used by non-session paths (notably the public Forms
 * intake, ADR-0029). Dedupes by `(workspaceId, emailHash)`, encrypts the email
 * at rest, stamps the Customer type (`profileType`), and fires the CRM
 * automation trigger — so a form submission lands as a contact and the existing
 * automation engine takes over.
 *
 * Distinct from `crmContact.create` (the authenticated tRPC mutation), which is
 * intentionally left unchanged: it allows duplicate-email manual entries and
 * does not set `emailHash`. This service is the deduping, automation-firing path
 * for machine/public intake.
 */
export function emailHashFor(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}

export interface CreateCrmContactInput {
  workspaceId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Free-text company; stored as a tag in v1 (no auto-organization). */
  company?: string | null;
  /** The Customer type to stamp, e.g. "Applicant" — drives the automation. */
  profileType?: string | null;
  createdById?: string | null;
  importSource?: string;
  triggeredById?: string;
}

export interface CreateCrmContactResult {
  contactId: string;
  created: boolean;
  fired: boolean;
}

export async function createCrmContact(
  db: PrismaClient,
  input: CreateCrmContactInput,
): Promise<CreateCrmContactResult> {
  const email = input.email?.trim() ? input.email.trim() : null;
  const emailHash = email ? emailHashFor(email) : null;

  // Dedupe by (workspaceId, emailHash) — uniqueness is workspace-scoped, so
  // the same person can exist as an independent contact in multiple
  // workspaces. Within a workspace, repeats do not re-create or re-fire.
  if (emailHash) {
    const existing = await db.crmContact.findUnique({
      where: {
        workspaceId_emailHash: {
          workspaceId: input.workspaceId,
          emailHash,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return { contactId: existing.id, created: false, fired: false };
    }
  }

  const tags = input.company?.trim() ? [input.company.trim()] : [];

  let contact: { id: string };
  try {
    contact = await db.crmContact.create({
      data: {
        workspaceId: input.workspaceId,
        createdById: input.createdById ?? undefined,
        firstName: input.firstName?.trim() ?? undefined,
        lastName: input.lastName?.trim() ?? undefined,
        profileType: input.profileType ?? undefined,
        importSource: input.importSource ?? undefined,
        tags,
        ...(email ? { email: encryptString(email), emailHash } : {}),
      },
      select: { id: true },
    });
  } catch (err) {
    // Concurrent double-submit: between the dedupe lookup above and this
    // insert, another request landed a row with the same
    // (workspaceId, emailHash). Treat as a dedupe hit so the caller sees
    // idempotent behaviour and the automation engine does not fire twice.
    if (
      emailHash &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const winner = await db.crmContact.findUniqueOrThrow({
        where: {
          workspaceId_emailHash: {
            workspaceId: input.workspaceId,
            emailHash,
          },
        },
        select: { id: true },
      });
      return { contactId: winner.id, created: false, fired: false };
    }
    throw err;
  }

  let fired = false;
  if (input.profileType) {
    try {
      const result = await dispatchContactTypeAutomations(db, {
        contactId: contact.id,
        workspaceId: input.workspaceId,
        oldProfileType: null,
        newProfileType: input.profileType,
        triggeredById: input.triggeredById,
      });
      fired = result.firedDefinitionIds.length > 0;
    } catch (e) {
      console.error(
        "createCrmContact: automation dispatch failed for contact",
        contact.id,
        e,
      );
    }
  }

  return { contactId: contact.id, created: true, fired };
}

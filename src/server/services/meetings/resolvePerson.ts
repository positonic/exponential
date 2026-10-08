/**
 * Person resolution for both meeting models: a recorded Meeting's
 * **Participant** and a Scheduled meeting's **Attendee** (CONTEXT.md) are the
 * same kinds of person, resolved by one set of rules so they match on email
 * when a recording attaches (ADR-0059 amendment, 2026-10-07).
 *
 * A person is a workspace member (`userId`), an existing CRM contact
 * (`contactId`, optionally with an email to capture), or free text — a name
 * and/or email, where an email finds-or-creates a CRM contact by the
 * workspace's `emailHash`. Resolution runs inside the caller's transaction
 * and returns the denormalised fields; it writes no participant or attendee
 * row itself (it may write a CrmContact — creating one, or capturing an email
 * onto one that has none).
 */
import { z } from "zod";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { encryptString, decryptBufferSafe } from "~/server/utils/encryption";

export const personSchema = z
  .object({
    userId: z.string().optional(),
    contactId: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.userId ?? v.contactId ?? v.email ?? v.name, {
    message: "Provide a member, a contact, or a name/email",
  });

export type Person = z.infer<typeof personSchema>;

export interface ResolvedPerson {
  userId: string | null;
  contactId: string | null;
  email: string | null;
  name: string | null;
}

const hashEmail = (email: string) => createHash("sha256").update(email.toLowerCase().trim()).digest("hex");

export async function resolvePerson(
  tx: Prisma.TransactionClient,
  args: {
    workspaceId: string;
    actorId: string;
    person: Person;
    /**
     * Who counts as a member. Omitted: a direct `WorkspaceUser` row (the
     * recorded-Meeting rule). Scheduling passes its roster, which also
     * counts members through a team linked to the workspace.
     */
    memberIds?: ReadonlySet<string>;
  },
): Promise<ResolvedPerson> {
  const { workspaceId, actorId, person, memberIds } = args;

  if (person.userId) {
    const isMember = memberIds
      ? memberIds.has(person.userId)
      : !!(await tx.workspaceUser.findFirst({ where: { userId: person.userId, workspaceId } }));
    if (!isMember) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User is not a member of this workspace",
      });
    }
    const user = await tx.user.findUnique({
      where: { id: person.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }
    return { userId: user.id, contactId: null, email: user.email ?? null, name: user.name ?? null };
  }

  if (person.contactId) {
    const contact = await tx.crmContact.findUnique({
      where: { id: person.contactId },
      select: { id: true, workspaceId: true, firstName: true, lastName: true, email: true },
    });
    if (!contact || contact.workspaceId !== workspaceId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Contact must belong to this workspace",
      });
    }
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;

    const existingEmail = decryptBufferSafe(contact.email);
    if (existingEmail) return { userId: null, contactId: contact.id, email: existingEmail, name };
    if (!person.email) return { userId: null, contactId: contact.id, email: null, name };

    // The contact has no email on file: capture the one supplied at link time
    // and write it back onto the CrmContact, so the contact record improves
    // everywhere — not just this row.
    const emailHash = hashEmail(person.email);
    // emailHash uniqueness is workspace-scoped. If another contact in this
    // workspace already owns this email, don't collide on update — surface a
    // clear error. Contacts in other workspaces with the same email are fine.
    const owner = await tx.crmContact.findUnique({
      where: { workspaceId_emailHash: { workspaceId, emailHash } },
      select: { id: true },
    });
    if (owner && owner.id !== contact.id) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "That email already belongs to another contact",
      });
    }
    await tx.crmContact.update({
      where: { id: contact.id },
      data: { email: encryptString(person.email), emailHash },
    });
    return { userId: null, contactId: contact.id, email: person.email, name };
  }

  // Free text. With an email, link (or create) a CRM contact so the person
  // lands in the CRM.
  let name = person.name ?? null;
  if (!person.email) return { userId: null, contactId: null, email: null, name };

  const emailHash = hashEmail(person.email);
  // Workspace-scoped lookup: the same email may exist as a contact in other
  // workspaces; that's allowed and irrelevant here.
  let contact = await tx.crmContact.findUnique({
    where: { workspaceId_emailHash: { workspaceId, emailHash } },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!contact) {
    const [firstName, ...rest] = (person.name ?? "").trim().split(/\s+/);
    contact = await tx.crmContact.create({
      data: {
        workspaceId,
        createdById: actorId,
        firstName: firstName || null,
        lastName: rest.length > 0 ? rest.join(" ") : null,
        email: encryptString(person.email),
        emailHash,
        importSource: "MANUAL",
      },
      select: { id: true, firstName: true, lastName: true },
    });
  }
  name ??= [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;
  return { userId: null, contactId: contact.id, email: person.email, name };
}

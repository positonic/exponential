import { type PrismaClient } from "@prisma/client";

import { decryptBuffer } from "~/server/utils/encryption";
import {
  CRM_CONTACT_MEMBER_TYPE,
  type MemberTypeResolver,
  type ResolvedMember,
  type MemberResolveContext,
} from "../collections/memberTypeRegistry";

/**
 * CRM-contributed resolver that expands `crm_contact` Collection members into
 * usable recipients — the CRM's contribution to the generic List primitive
 * ([ADR-0030](../../../../docs/adr/0030-generic-collection-list-primitive.md)).
 *
 * Returns decrypted email + merge variables. Contacts without a decryptable
 * email are dropped (they cannot receive a Broadcast). Consent filtering
 * (`emailOptedOutAt`) is layered on by the consent ticket (T2).
 */
export class CrmContactMemberResolver implements MemberTypeResolver {
  memberType = CRM_CONTACT_MEMBER_TYPE;

  constructor(private db: PrismaClient) {}

  async resolve(
    memberIds: string[],
    ctx: MemberResolveContext,
  ): Promise<ResolvedMember[]> {
    if (memberIds.length === 0) return [];

    const contacts = await this.db.crmContact.findMany({
      where: { id: { in: memberIds }, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    const resolved: ResolvedMember[] = [];
    for (const c of contacts) {
      const email = decryptBuffer(c.email);
      if (!email) continue; // unmailable — cannot be a recipient

      const firstName = c.firstName ?? "";
      const lastName = c.lastName ?? "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

      resolved.push({
        memberId: c.id,
        label: fullName || email,
        email,
        mergeVars: { firstName, lastName, fullName, email },
      });
    }
    return resolved;
  }
}

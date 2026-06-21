/**
 * Member-type resolver registry for the generic **List** (`Collection`) primitive
 * ([ADR-0030](../../../../docs/adr/0030-generic-collection-list-primitive.md)).
 *
 * The `Collection` core stays type-agnostic: it stores `(memberType, memberId)`
 * rows and delegates "turn these ids into usable members" to a resolver
 * registered for that `memberType`. The CRM registers `crm_contact`; a future
 * "list of projects" registers `project` — no `Collection` change, no migration.
 *
 * This is the same in-process extension-point shape as `StepRegistry` /
 * `TriggerRegistry`.
 */

export interface ResolvedMember {
  memberId: string;
  /** Human label for UI (e.g. a contact's name or email). */
  label: string;
  /** Email, when the member type has one (CRM contacts do). */
  email?: string | null;
  /** Template variables for rendering (e.g. firstName) — resolver-specific. */
  mergeVars?: Record<string, unknown>;
}

export interface MemberResolveContext {
  workspaceId: string;
}

export interface MemberTypeResolver {
  memberType: string;
  /**
   * Resolve member ids to usable members. Implementations MAY return fewer
   * members than ids (e.g. filtered/missing) — callers must not assume a 1:1
   * mapping. Order is not guaranteed.
   */
  resolve(
    memberIds: string[],
    ctx: MemberResolveContext,
  ): Promise<ResolvedMember[]>;
}

export class MemberTypeRegistry {
  private resolvers = new Map<string, MemberTypeResolver>();

  register(resolver: MemberTypeResolver): void {
    this.resolvers.set(resolver.memberType, resolver);
  }

  get(memberType: string): MemberTypeResolver {
    const resolver = this.resolvers.get(memberType);
    if (!resolver) {
      throw new Error(
        `No member-type resolver registered for: ${memberType}`,
      );
    }
    return resolver;
  }

  has(memberType: string): boolean {
    return this.resolvers.has(memberType);
  }

  listTypes(): string[] {
    return [...this.resolvers.keys()];
  }
}

/** Canonical member-type value for CRM contacts. */
export const CRM_CONTACT_MEMBER_TYPE = "crm_contact";

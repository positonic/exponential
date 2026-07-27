import { type PrismaClient } from "@prisma/client";

import { MemberTypeRegistry } from "./memberTypeRegistry";
import { CrmContactMemberResolver } from "../crm/crmContactMemberResolver";

/**
 * Builds the member-type registry with all registered resolvers. The CRM
 * contributes `crm_contact`; new member types (e.g. `project`) register here.
 * Kept separate from `memberTypeRegistry.ts` so that module stays free of any
 * domain (CRM) import — the registry core is domain-neutral.
 */
export function createMemberTypeRegistry(db: PrismaClient): MemberTypeRegistry {
  const registry = new MemberTypeRegistry();
  registry.register(new CrmContactMemberResolver(db));
  return registry;
}

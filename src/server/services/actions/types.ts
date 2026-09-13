import type { PrismaClient } from "@prisma/client";

/**
 * Who is writing. The three fields `createTRPCContext` already puts on
 * `ctx.session.user` / `ctx.tokenType`; routers build it from `ctx`, voice,
 * cron and webhook callers build it from what they have. No tRPC `Context`
 * crosses this seam.
 */
export interface ActionActor {
  userId: string;
  /** JWT / key token type (`agent-key`, `whatsapp-gateway`, …) when known. */
  tokenType?: string;
  isAdmin: boolean;
}

/** Plain dependencies for every Action write. */
export interface ActionWriteDeps {
  db: PrismaClient;
  actor: ActionActor;
}

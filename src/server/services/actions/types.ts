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

/**
 * Build `ActionWriteDeps` from what a tRPC context already resolved: the
 * client and the three actor fields. Takes plain data, not the tRPC
 * `Context` type, so any router (or anything holding a session) can call it
 * without the module learning about tRPC.
 */
export function actionWriteDeps(ctx: {
  db: PrismaClient;
  session: { user: { id: string; isAdmin: boolean } };
  tokenType?: string;
}): ActionWriteDeps {
  return {
    db: ctx.db,
    actor: {
      userId: ctx.session.user.id,
      tokenType: ctx.tokenType,
      isAdmin: ctx.session.user.isAdmin,
    },
  };
}

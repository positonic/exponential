/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { isExternalAgentKey } from "~/server/utils/external-agent-keys";
import { bearerTokenFrom, resolveBearerToken } from "~/server/services/access/bearer";
import { captureProcedureCall, resolveSurface } from "~/server/analytics/posthog";
import { conflictFromError } from "~/server/services/revisions/revisionConflict";
import { propertyRejectionFromError } from "~/server/services/databases/values";
import { alreadyInProjectFromError } from "~/server/services/resources/alreadyInProject";
import { isPersonCredential, resolvePrincipal, type Principal } from "~/server/services/access/principal";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  // First try to get the session from NextAuth
  const session = await auth();

  // If no session, check for a bearer credential: an External agent key or a
  // JWT. Resolved by the shared bearer resolver, which `/api/mcp` also uses.
  if (!session?.user) {
    const token = bearerTokenFrom(opts.headers);
    if (token) {
      const resolved = await resolveBearerToken(token);
      if (resolved) {
        return { db, ...resolved, ...opts };
      }
      // A prefixed agent key that fails to resolve is unauthenticated: it can
      // never be a valid JWT, and it never falls back to the cookie session.
      if (isExternalAgentKey(token)) {
        return {
          db,
          session: null,
          tokenType: undefined as string | undefined,
          agentRunId: undefined as string | undefined,
          ...opts,
        };
      }
    }
  }
  return {
    db,
    session,
    tokenType: undefined as string | undefined,
    agentRunId: undefined as string | undefined,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
        // A compare-and-set write that lost: the structured revision conflict
        // (entity, id, field, expected and current revision) so clients can
        // re-read and reconcile rather than parse the message.
        conflict: conflictFromError(error),
        // A database write rejected by the property-type registry (ADR-0078):
        // which property, and why, so the CLI and the table block can point at
        // the cell instead of parsing the message.
        property: propertyRejectionFromError(error),
        // Filing a Resource under a Project that already lists the page
        // (ADR-0082): which Resource holds its place and who saved it, so a
        // client can say "Already in this project, saved by James".
        alreadyInProject: alreadyInProjectFromError(error),
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure;

/**
 * Product analytics (PostHog) for every authenticated procedure call.
 *
 * All client surfaces reach the app through tRPC, so this one middleware is
 * the whole instrumentation: event = procedure path, keyed by user id and
 * tagged with the calling surface. Inputs are never captured. A no-op unless
 * `POSTHOG_KEY` is set. See src/server/analytics/posthog.ts for the capture
 * rule (mutations always; queries only from non-browser surfaces).
 */
const analyticsMiddleware = t.middleware(async ({ ctx, path, type, next }) => {
  const startedAt = Date.now();
  const result = await next();
  const userId = ctx.session?.user?.id;
  if (userId) {
    captureProcedureCall({
      userId,
      path,
      type,
      surface: resolveSurface({ tokenType: ctx.tokenType, headers: ctx.headers }),
      ok: result.ok,
      errorCode: result.ok ? undefined : result.error.code,
      durationMs: Date.now() - startedAt,
    });
  }
  return result;
});

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  })
  .use(analyticsMiddleware);

/**
 * Human-only procedure (ADR-0049, ADR-0070, ADR-0071)
 *
 * The denylist gate for anything only a person may do: JWT-minting
 * procedures, workspace-membership mutations, integration/credential
 * management, agent management, and confirming what an agent proposed.
 *
 * A thin call to `resolvePrincipal`: only a `human` principal passes. An
 * `agent` (a shadow user, however it authenticated — a credential laundered
 * into another token type still resolves to the agent) and an
 * `agent_for_human` (Zoe's agent-context JWT, the chat gateways, voice — Zoe
 * acting for someone is not that person acting) are refused. A token type the
 * resolver does not know resolves to `agent_for_human`, so the gate fails
 * closed. `isPersonCredential` — the resolver's own list of person
 * credentials — lets the gate refuse every other token type before any DB
 * lookup.
 */
export const humanOnlyProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const FORBIDDEN_FOR_AGENTS = new TRPCError({
    code: "FORBIDDEN",
    message: "Only a person can do this, signed in as themselves — agents (including Zoe) cannot",
  });
  // Fast path: a credential that can never resolve to a person is refused
  // before the resolver's lookups.
  if (!isPersonCredential(ctx.tokenType)) {
    throw FORBIDDEN_FOR_AGENTS;
  }
  let principal: Principal;
  try {
    principal = await resolvePrincipal(ctx);
  } catch (error) {
    // The resolver refuses a shadow user with no owning agent; to the caller
    // that is the same answer as any other agent.
    if (error instanceof TRPCError && error.code === "FORBIDDEN") throw FORBIDDEN_FOR_AGENTS;
    throw error;
  }
  if (principal.kind !== "human") {
    throw FORBIDDEN_FOR_AGENTS;
  }
  return next();
});

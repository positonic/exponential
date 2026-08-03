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
import jwt from 'jsonwebtoken';
import { type Session } from "next-auth";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { SECURITY_FIX_TIMESTAMP, CURRENT_SECURITY_VERSION } from "~/server/utils/jwt";
import { hashExternalAgentKey, isExternalAgentKey } from "~/server/utils/external-agent-keys";

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

  // If no session, check for JWT token in Authorization header
  if (!session?.user) {
    const authHeader = opts.headers.get('authorization');
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // External-agent key (ADR-0049): an opaque `exp_agent_…` credential, never
      // a JWT. Resolved by hash to the agent's shadow User so the request runs as
      // that principal. A prefixed token that fails to resolve is unauthenticated
      // — it can never be a valid JWT, so we don't fall through to jwt.verify.
      if (isExternalAgentKey(token)) {
        try {
          const key = await db.externalAgentKey.findUnique({
            where: { keyHash: hashExternalAgentKey(token) },
            include: { agent: { include: { shadowUser: true } } },
          });

          if (key && (!key.expiresAt || key.expiresAt > new Date())) {
            // Fire-and-forget: lastUsedAt is observability, not auth.
            void db.externalAgentKey
              .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
              .catch((error) => console.error('[external-agent] lastUsedAt update failed:', error));

            const shadowUser = key.agent.shadowUser;
            const agentSession: Session = {
              user: {
                id: shadowUser.id,
                email: shadowUser.email,
                name: shadowUser.name,
                image: shadowUser.image,
                // Agents are never admins, whatever the row says.
                isAdmin: false,
              },
              expires: (key.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000)).toISOString(),
            };
            return {
              db,
              session: agentSession,
              tokenType: 'agent-key' as string | undefined,
              ...opts,
            };
          }
        } catch (error) {
          console.error('[external-agent] key resolution failed:', error);
        }
        return {
          db,
          session: null,
          tokenType: undefined as string | undefined,
          ...opts,
        };
      }

      try {
        // Verify the JWT token
        const decoded = jwt.verify(token, process.env.AUTH_SECRET ?? '') as {
          userId?: string;   // Legacy format
          sub?: string;      // New API token format
          email: string;
          name?: string;
          picture?: string;
          tokenType?: string;
          exp?: number;
          iat?: number;
          nbf?: number;      // Not before timestamp
          jti?: string;
          securityVersion?: number;
        };

        // Security validation - require security claims on all tokens
        // Tokens without nbf or securityVersion are rejected (closes security gap)
        if (decoded.nbf === undefined || decoded.securityVersion === undefined) {
          console.warn('🚨 [JWT SECURITY] Token missing required security claims', {
            tokenType: decoded.tokenType,
            hasNbf: decoded.nbf !== undefined,
            hasSecurityVersion: decoded.securityVersion !== undefined,
          });
          throw new Error('JWT missing required security claims');
        }

        if (decoded.nbf < SECURITY_FIX_TIMESTAMP) {
          throw new Error('JWT issued before security fix - token invalidated');
        }

        if (decoded.securityVersion < CURRENT_SECURITY_VERSION) {
          throw new Error('JWT security version too old - token invalidated');
        }

        // Support both legacy and new token formats
        const userId = decoded.userId || decoded.sub;
        if (!userId) {
          throw new Error('Invalid token: missing user identifier');
        }

        console.log('🔐 [JWT DEBUG] Token decoded successfully', {
          userId: userId,
          userEmail: decoded.email,
          tokenType: decoded.tokenType,
          issuedAt: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : 'not set',
          expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'not set',
          securityVersion: decoded.securityVersion
        });

        // Find the user
        const user = await db.user.findUnique({
          where: { id: userId }
        });

        console.log('👤 [USER LOOKUP] Database user lookup', {
          userId: userId,
          userFound: !!user,
          userEmail: user?.email || 'not found',
          userName: user?.name || 'not found',
          userCreatedAt: 'not available in token'
        });

        if (user) {
          // Create a session-like object from the JWT token
          const jwtSession: Session = {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
              isAdmin: user.isAdmin,
            },
            expires: decoded.exp
              ? new Date(decoded.exp * 1000).toISOString()
              : new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes fallback
          };
          return {
            db,
            session: jwtSession,
            // Surface the JWT token type so procedures can attribute writes to
            // the calling surface (e.g. Action.source for chat gateways).
            tokenType: decoded.tokenType,
            ...opts,
          };
        }
      } catch (error) {
        console.error('JWT verification failed:', error);
      }
    }
  }
  return {
    db,
    session,
    tokenType: undefined as string | undefined,
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
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next }) => {
  // if (t._config.isDev) {
  //   // artificial delay in dev
  //   const waitMs = Math.floor(Math.random() * 400) + 100;
  //   await new Promise((resolve) => setTimeout(resolve, waitMs));
  // }

  const result = await next();

  // console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
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
  });

/**
 * Human-only procedure (ADR-0049)
 *
 * The denylist gate for External-agent principals: JWT-minting procedures,
 * workspace-membership mutations, integration/credential management, and
 * agent management itself. Keyed on the *principal* (the DB `isAgent` flag),
 * not on how the caller authenticated — so even a credential laundered into
 * another token type still cannot reach these procedures. The `tokenType`
 * check is just a fast path that skips the DB read for the common case.
 */
export const humanOnlyProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const FORBIDDEN_FOR_AGENTS = new TRPCError({
    code: "FORBIDDEN",
    message: "This operation is not available to external agents",
  });
  if (ctx.tokenType === "agent-key") {
    throw FORBIDDEN_FOR_AGENTS;
  }
  const principal = await ctx.db.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { isAgent: true },
  });
  if (principal?.isAgent) {
    throw FORBIDDEN_FOR_AGENTS;
  }
  return next();
});

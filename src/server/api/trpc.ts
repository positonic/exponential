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

        // Additional security validation for post-fix JWTs
        const securityFixTimestamp = Math.floor(new Date('2025-08-06T15:45:00Z').getTime() / 1000);
        
        if (decoded.nbf && decoded.nbf < securityFixTimestamp) {
          throw new Error('JWT issued before security fix - token invalidated');
        }
        
        if (decoded.securityVersion && decoded.securityVersion < 1) {
          throw new Error('JWT security version too old - token invalidated');
        }

        // Support both legacy and new token formats
        const userId = decoded.userId || decoded.sub;
        if (!userId) {
          throw new Error('Invalid token: missing user identifier');
        }

        // Find the user
        const user = await db.user.findUnique({
          where: { id: userId }
        });

        if (user) {
          // Create a session-like object from the JWT token
          const jwtSession: Session = {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
            },
            expires: decoded.exp 
              ? new Date(decoded.exp * 1000).toISOString() 
              : new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes fallback
          };
          return {
            db,
            session: jwtSession,
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
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  // if (t._config.isDev) {
  //   // artificial delay in dev
  //   const waitMs = Math.floor(Math.random() * 400) + 100;
  //   await new Promise((resolve) => setTimeout(resolve, waitMs));
  // }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

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

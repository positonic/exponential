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
  console.log('🔍 [AUTH DEBUG] tRPC Context Creation Started');
  
  // First try to get the session from NextAuth
  const session = await auth();
  console.log('🔍 [AUTH DEBUG] NextAuth session:', session?.user ? { userId: session.user.id, email: session.user.email } : 'No session');

  // If no session, check for JWT token in Authorization header
  if (!session?.user) {
    console.log('🔍 [AUTH DEBUG] No NextAuth session, checking for JWT token...');
    const authHeader = opts.headers.get('authorization');
    console.log('🔍 [AUTH DEBUG] Authorization header:', authHeader ? `Bearer ${authHeader.substring(7, 20)}...` : 'No auth header');
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      console.log('🔍 [AUTH DEBUG] JWT token length:', token.length);
      console.log('🔍 [AUTH DEBUG] JWT token preview:', token.substring(0, 50) + '...');
      
      try {
        console.log('🔍 [AUTH DEBUG] Attempting JWT verification with AUTH_SECRET...');
        // Verify the JWT token
        const decoded = jwt.verify(token, process.env.AUTH_SECRET ?? '') as {
          userId?: string;   // Legacy format
          sub?: string;      // New API token format
          email: string;
          name?: string;
          picture?: string;
          tokenType?: string;
          exp?: number;
        };

        console.log('🔍 [AUTH DEBUG] JWT decoded successfully:', {
          userId: decoded.userId,
          sub: decoded.sub,
          email: decoded.email,
          tokenType: decoded.tokenType,
          exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'No expiry'
        });

        // Support both legacy and new token formats
        const userId = decoded.userId || decoded.sub;
        if (!userId) {
          console.log('❌ [AUTH DEBUG] No userId found in JWT payload');
          throw new Error('Invalid token: missing user identifier');
        }

        console.log('🔍 [AUTH DEBUG] Looking up user with ID:', userId);
        // Find the user
        const user = await db.user.findUnique({
          where: { id: userId }
        });

        console.log('🔍 [AUTH DEBUG] User lookup result:', user ? { id: user.id, email: user.email, name: user.name } : 'User not found');

        if (user) {
          console.log('✅ [AUTH DEBUG] User found! Creating JWT session...');
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
          console.log('✅ [AUTH DEBUG] JWT session created successfully for user:', user.email);
          return {
            db,
            session: jwtSession,
            ...opts,
          };
        } else {
          console.log('❌ [AUTH DEBUG] JWT token valid but user not found in database');
        }
      } catch (error) {
        console.error('❌ [AUTH DEBUG] JWT verification failed:', error);
        console.error('❌ [AUTH DEBUG] Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          tokenPreview: token.substring(0, 50),
          authSecret: process.env.AUTH_SECRET ? 'Present' : 'Missing'
        });
      }
    } else {
      console.log('🔍 [AUTH DEBUG] No Bearer token found in headers');
    }
  }

  console.log('🔍 [AUTH DEBUG] Returning context with session:', session?.user ? 'Session present' : 'No session');
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

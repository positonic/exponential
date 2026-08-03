import * as Sentry from "@sentry/nextjs";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

export const maxDuration = 60;

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    // Agent tools always POST, including to query procedures (ADR-0041).
    allowMethodOverride: true,
    // tRPC catches procedure exceptions and turns them into HTTP responses,
    // so Next's onRequestError hook never sees them — this is the only place
    // they can be reported.
    onError: ({ path, type, error }) => {
      if (env.NODE_ENV === "development") {
        console.error(
          `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`
        );
        return;
      }
      // INTERNAL_SERVER_ERROR is what unexpected exceptions surface as;
      // expected client errors (UNAUTHORIZED, NOT_FOUND, Zod input
      // failures…) would only be noise in Sentry.
      if (error.code === "INTERNAL_SERVER_ERROR") {
        Sentry.captureException(error.cause ?? error, {
          tags: { "trpc.path": path ?? "<no-path>", "trpc.type": type },
        });
        console.error(
          `tRPC ${type} ${path ?? "<no-path>"} failed: ${error.message}`
        );
      }
    },
  });

export { handler as GET, handler as POST };

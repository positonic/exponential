/**
 * The tRPC fetch handler as the app serves it, shared by the HTTP route
 * (`/api/trpc`) and by the hosted MCP endpoint, which hands each tool call's
 * tRPC request to it in-process (hosted MCP Agent PRD, D4). Both get the same
 * router, method override and error reporting.
 */

import * as Sentry from "@sentry/nextjs";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import type { createTRPCContext } from "~/server/api/trpc";

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

export const TRPC_ENDPOINT = "/api/trpc";

export function handleTRPCRequest(
  req: Request,
  createContext: () => TRPCContext | Promise<TRPCContext>,
): Promise<Response> {
  return fetchRequestHandler({
    endpoint: TRPC_ENDPOINT,
    req,
    router: appRouter,
    createContext,
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
}

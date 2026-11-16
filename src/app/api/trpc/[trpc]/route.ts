import { after, type NextRequest } from "next/server";

import { flushAnalytics } from "~/server/analytics/posthog";
import { handleTRPCRequest } from "~/server/api/fetchHandler";
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

const handler = (req: NextRequest) => {
  // Analytics events captured by the tRPC middleware queue in memory; send
  // them once the response is out, before Vercel freezes the function.
  after(flushAnalytics);
  return handleTRPCRequest(req, () => createContext(req));
};

export { handler as GET, handler as POST };

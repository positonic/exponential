import { NextResponse } from "next/server";

import { auth } from "~/server/auth";
import { generateAgentJWT } from "~/server/utils/jwt";

/**
 * Dev-only: mint a short-lived agent JWT for the browser.
 *
 * Exists for the V2 transport spike (`/dev/mastra-client-tools`), which needs a
 * token in the *browser* so it can stream straight to the Mastra server. The
 * shipping version of this is a `mastra.mintAgentToken` tRPC procedure; this
 * route is throwaway scaffolding and 404s outside development.
 *
 * A signed-in session is used when there is one. Without it — the usual case
 * when poking at this from a scratch browser — it mints for a synthetic id
 * instead. That is only tolerable because it is dev-gated and because the spike
 * drives the weather demo agent, which touches no user data; never widen this to
 * production or to an agent with real tools.
 */
export const dynamic = "force-dynamic";

const SYNTHETIC_SPIKE_USER_ID = "spike-user";

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const session = await auth();
  const user = session?.user?.id
    ? { id: session.user.id, email: session.user.email, name: session.user.name }
    : { id: SYNTHETIC_SPIKE_USER_ID, email: null, name: "Spike" };

  return NextResponse.json({
    token: generateAgentJWT(user, 10),
    userId: user.id,
    synthetic: user.id === SYNTHETIC_SPIKE_USER_ID,
    mastraUrl: process.env.MASTRA_API_URL ?? "http://localhost:4111",
  });
}

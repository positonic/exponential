/**
 * The principal resolver — the one answer to "who is making this write: a
 * person, an agent, or an agent acting for a person?" (Agent principles PRD,
 * Phase 3 item 1; ADR-0071 change integrity and authorized agency; D-0016).
 *
 * It reads only verified inputs:
 *
 * - `tokenType`, which the tRPC context sets from the DB key lookup
 *   (`agent-key`) or from a JWT whose signature it has checked;
 * - `agentRunId`, the verified `runId` claim on an `agent-context` JWT;
 * - `User.isAgent` and the `ExternalAgent` row behind a shadow user.
 *
 * It never reads request input. A label a caller chooses (`source`,
 * `createdBy`, …) cannot move the answer: identity comes from the credential.
 *
 * The six older helpers (`humanOnlyProcedure`, `isAgentPrincipal`,
 * `assertHumanPrincipal`, `resolveTimeEntryPrincipal`, `sourceForPrincipal`,
 * `resolveAgentActionSource`) answer the same question with different inputs.
 * They move onto this resolver one at a time, each with its own test; see
 * `dev-docs/AGENT_PRINCIPLES_AUDIT.md`.
 */

import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

/** How the caller reached the API, derived from the verified credential. */
export type PrincipalSurface =
  | "web" // a NextAuth cookie session
  | "api-token" // a person's own API token (CLI, SDK, MCP)
  | "device" // native app sign-in
  | "extension" // browser extension
  | "agent-key" // an External agent's `exp_agent_…` key (ADR-0049)
  | "agent-run" // an Assistant run's agent-context JWT (ADR-0067)
  | "agent-context" // an agent-context JWT for a person or shadow user, no run
  | "voice"
  | "whatsapp"
  | "telegram"
  | "matrix"
  | "unknown";

export type Principal =
  | { kind: "human"; userId: string; surface: PrincipalSurface }
  | {
      /** A shadow user: an External agent or an Assistant (ADR-0049, ADR-0067). */
      kind: "agent";
      userId: string;
      agentId: string;
      /** The accountable person who owns the agent. */
      ownerId: string;
      runId?: string;
      surface: PrincipalSurface;
    }
  | {
      /**
       * An agent working under a person's own identity: Zoe in chat
       * (`agent-context` whose `sub` is the person), the chat gateways and the
       * voice session. The person is accountable; the hand on the keyboard is
       * an agent's.
       */
      kind: "agent_for_human";
      userId: string;
      surface: PrincipalSurface;
    };

/** The slice of the tRPC context the resolver reads. */
export interface PrincipalContext {
  db: PrismaClient;
  session: { user: { id: string } } | null;
  tokenType: string | undefined;
  agentRunId?: string;
}

/** Credentials a person presents themselves. */
const HUMAN_SURFACES: Record<string, PrincipalSurface> = {
  "api-token": "api-token",
  "device-token": "device",
  "extension-token": "extension",
};

/** JWTs an agent presents while working under a person's identity. */
const AGENT_FOR_HUMAN_SURFACES: Record<string, PrincipalSurface> = {
  "agent-context": "agent-context",
  "voice-session": "voice",
  "whatsapp-gateway": "whatsapp",
  "telegram-gateway": "telegram",
  "matrix-gateway": "matrix",
};

function agentSurface(tokenType: string | undefined, runId: string | undefined): PrincipalSurface {
  if (tokenType === "agent-key") return "agent-key";
  if (tokenType === "agent-context") return runId ? "agent-run" : "agent-context";
  if (tokenType === undefined) return "web";
  return HUMAN_SURFACES[tokenType] ?? AGENT_FOR_HUMAN_SURFACES[tokenType] ?? "unknown";
}

export async function resolvePrincipal(ctx: PrincipalContext): Promise<Principal> {
  const userId = ctx.session?.user.id;
  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const { tokenType } = ctx;

  const user = await ctx.db.user.findUnique({
    where: { id: userId },
    select: { isAgent: true },
  });

  if (tokenType === "agent-key" || user?.isAgent) {
    const agent = await ctx.db.externalAgent.findUnique({
      where: { shadowUserId: userId },
      select: { id: true, ownerId: true },
    });
    if (!agent) {
      // A shadow user with no agent row has no accountable owner. Refuse
      // rather than fall back to treating it as a person.
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This agent credential has no owning agent",
      });
    }
    // The runId claim is meaningful only on a run's agent-context token.
    const runId = tokenType === "agent-context" ? ctx.agentRunId : undefined;
    return {
      kind: "agent",
      userId,
      agentId: agent.id,
      ownerId: agent.ownerId,
      ...(runId ? { runId } : {}),
      surface: agentSurface(tokenType, runId),
    };
  }

  if (tokenType === undefined) {
    return { kind: "human", userId, surface: "web" };
  }
  const humanSurface = HUMAN_SURFACES[tokenType];
  if (humanSurface) {
    return { kind: "human", userId, surface: humanSurface };
  }
  // Every other JWT (Zoe's agent-context, the gateways, voice) is an agent
  // using the person's identity. An unrecognised token type lands here too:
  // it is never promoted to a human.
  return {
    kind: "agent_for_human",
    userId,
    surface: AGENT_FOR_HUMAN_SURFACES[tokenType] ?? "unknown",
  };
}


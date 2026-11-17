/**
 * OAuth connections for MCP clients (hosted MCP Agent PRD, D11). Every
 * procedure is `humanOnlyProcedure`: an agent credential, an OAuth access
 * token included, can never grant access to anything.
 *
 * `approve` binds the connection to an External agent: one the person already
 * owns, or a new one they set up on the consent page. Agent-per-client reuse
 * and editing the workspaces on reconnect are V3.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, humanOnlyProcedure } from "~/server/api/trpc";
import {
  authorizeParamsSchema,
  authorizeSuccessRedirect,
  validateAuthorizeRequest,
} from "~/server/mcp/oauth/authorizeRequest";
import { clientKeyFor } from "~/server/mcp/oauth/clients";
import { mcpOAuthMode } from "~/server/mcp/oauth/metadata";
import { createExternalAgent } from "~/server/services/externalAgentCreate";
import { requireDelegableWorkspaces } from "~/server/services/externalAgentAccess";
import {
  AUTHORIZATION_CODE_LIFETIME_MS,
  AUTHORIZATION_CODE_PREFIX,
  generateOAuthSecret,
} from "~/server/mcp/oauth/tokens";

/** A new agent set up on the consent page: its name and the workspaces it may see. */
const newAgentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // At least one: an agent in no workspace connects and then sees nothing.
  workspaceIds: z.array(z.string().min(1).max(64)).min(1).max(100),
});

const approveInput = z
  .object({
    request: authorizeParamsSchema,
    agentId: z.string().min(1).max(64).optional(),
    newAgent: newAgentSchema.optional(),
  })
  .refine((input) => (input.agentId === undefined) !== (input.newAgent === undefined), {
    message: "Choose one of your agents or set up a new one.",
  });

export const oauthConnectionRouter = createTRPCRouter({
  /**
   * Approve an authorization request: re-validate it, bind the connection to
   * the chosen agent (or to a new one, created here) and return the client's
   * redirect URI carrying a one-time code, `state` and `iss`.
   */
  approve: humanOnlyProcedure
    .input(approveInput)
    .mutation(async ({ ctx, input }) => {
      const mode = mcpOAuthMode();
      if (mode === "off") throw new TRPCError({ code: "NOT_FOUND" });
      if (mode === "admin" && !ctx.session.user.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Connecting apps with OAuth is limited to admins on this install for now.",
        });
      }

      const validation = await validateAuthorizeRequest(ctx.db, input.request);
      if (validation.kind !== "valid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.kind === "invalid-client" ? validation.message : "This authorization request is not valid.",
        });
      }
      const { request } = validation;
      const ownerId = ctx.session.user.id;

      // Every check reads only and runs before the transaction, so a refusal
      // writes nothing: no agent, connection or code.
      type Target = { kind: "existing"; agentId: string } | { kind: "new"; name: string; workspaceIds: string[] };
      let target: Target;
      if (input.newAgent) {
        target = {
          kind: "new",
          name: input.newAgent.name,
          workspaceIds: await requireDelegableWorkspaces(ctx.db, ownerId, input.newAgent.workspaceIds),
        };
      } else {
        // One of the person's own External agents, and not an Assistant's principal.
        const agent = await ctx.db.externalAgent.findFirst({
          where: { id: input.agentId, ownerId, assistant: { is: null } },
          select: { id: true },
        });
        if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "You have no External agent with that id." });
        target = { kind: "existing", agentId: agent.id };
      }

      const clientKey = clientKeyFor(request.client);
      const code = generateOAuthSecret(AUTHORIZATION_CODE_PREFIX);

      await ctx.db.$transaction(async (tx) => {
        // A new agent has no key: the connection's OAuth tokens are its only credential.
        const agent =
          target.kind === "new"
            ? await createExternalAgent(tx, { ownerId, name: target.name, workspaceIds: target.workspaceIds })
            : { id: target.agentId };

        const existing = await tx.oAuthConnection.findUnique({
          where: { ownerId_clientKey: { ownerId, clientKey } },
          select: { id: true, agentId: true },
        });

        let connectionId: string;
        if (existing) {
          // Rebinding to another agent must not carry the old agent's tokens over.
          if (existing.agentId !== agent.id) {
            await tx.oAuthToken.deleteMany({ where: { connectionId: existing.id } });
            await tx.oAuthAuthorizationCode.deleteMany({ where: { connectionId: existing.id } });
          }
          await tx.oAuthConnection.update({
            where: { id: existing.id },
            data: {
              clientId: request.client.id,
              clientName: request.client.name,
              agentId: agent.id,
              resource: request.resource,
              disconnectedAt: null,
            },
          });
          connectionId = existing.id;
        } else {
          const created = await tx.oAuthConnection.create({
            data: {
              ownerId,
              clientId: request.client.id,
              clientKey,
              clientName: request.client.name,
              agentId: agent.id,
              resource: request.resource,
            },
            select: { id: true },
          });
          connectionId = created.id;
        }

        await tx.oAuthAuthorizationCode.create({
          data: {
            connectionId,
            codeHash: code.hash,
            codeChallenge: request.codeChallenge,
            redirectUri: request.redirectUri,
            expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_LIFETIME_MS),
          },
        });
      });

      return { redirectTo: authorizeSuccessRedirect(request.redirectUri, code.secret, request.state) };
    }),
});

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, humanOnlyProcedure } from "~/server/api/trpc";
import { generateJWT } from "~/server/utils/jwt";

const MATRIX_GATEWAY_URL =
  process.env.MATRIX_GATEWAY_URL ?? "http://localhost:4114";

const MXID_PATTERN = /^@[^:\s]+:\S+$/;

/**
 * Mirrors telegramGateway procedure-for-procedure, with one structural
 * difference: there is no MatrixGatewaySession table (V1 is deliberately
 * migration-free). Live status comes from the gateway; the DB fallback is the
 * IntegrationUserMapping row under the system "matrix" Integration (ADR-0043).
 */
export const matrixGatewayRouter = createTRPCRouter({
  // Check if user has a connected Matrix account
  getStatus: humanOnlyProcedure.query(async ({ ctx }) => {
    try {
      const authToken = generateJWT(ctx.session.user, {
        tokenType: "matrix-gateway",
      });
      const res = await fetch(`${MATRIX_GATEWAY_URL}/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        return (await res.json()) as {
          paired: boolean;
          mxid?: string;
          agentId?: string;
          lastActive?: string;
        };
      }
    } catch (error) {
      console.error("[matrixGateway] Failed to check gateway status:", error);
    }

    // Fallback to DB truth: a pairing mapping under the system matrix Integration
    const mapping = await ctx.db.integrationUserMapping.findFirst({
      where: {
        userId: ctx.session.user.id,
        integration: { provider: "matrix", status: "ACTIVE", userId: null },
      },
    });

    return {
      paired: !!mapping,
      mxid: mapping?.externalUserId,
    };
  }),

  // Begin pairing: the gateway creates the unencrypted DM and returns the code
  initiatePairing: humanOnlyProcedure
    .input(
      z.object({
        mxid: z
          .string()
          .regex(
            MXID_PATTERN,
            "Enter your full Matrix ID, e.g. @you:syntro.fi",
          ),
        agentId: z.string().default("assistant"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const authToken = generateJWT(ctx.session.user, {
        tokenType: "matrix-gateway",
      });

      // Look up the user's default assistant to pass its name to the gateway
      const assistant = await ctx.db.assistant.findFirst({
        where: { createdById: ctx.session.user.id, isDefault: true },
        select: { name: true, id: true, workspaceId: true },
      });

      let res: Response;
      try {
        res = await fetch(`${MATRIX_GATEWAY_URL}/pair`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mxid: input.mxid,
            agentId: input.agentId,
            assistantId: assistant?.id,
            assistantName: assistant?.name,
            workspaceId: assistant?.workspaceId,
          }),
        });
      } catch (error) {
        console.error(
          "[matrixGateway] Failed to reach gateway for pairing:",
          error,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Unable to reach the Matrix gateway service. Please try again later.",
        });
      }

      if (!res.ok) {
        const error = (await res.json().catch(() => ({
          error: "Gateway error",
        }))) as { error: string };
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.error ?? `Gateway returned ${res.status}`,
        });
      }

      const data = (await res.json()) as {
        pairingCode: string;
        roomId: string | null;
        botUserId: string;
        expiresInSeconds: number;
      };

      return data;
    }),

  // Disconnect Matrix account
  disconnect: humanOnlyProcedure.mutation(async ({ ctx }) => {
    const authToken = generateJWT(ctx.session.user, {
      tokenType: "matrix-gateway",
    });

    try {
      await fetch(`${MATRIX_GATEWAY_URL}/pair`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
    } catch (error) {
      console.error(
        "[matrixGateway] Failed to call gateway disconnect:",
        error,
      );
    }

    // Always clear the mapping row too, so disconnect works even when the
    // gateway is unreachable (the gateway's own unpair also deletes it; both
    // paths are idempotent).
    await ctx.db.integrationUserMapping.deleteMany({
      where: {
        userId: ctx.session.user.id,
        integration: { provider: "matrix", status: "ACTIVE", userId: null },
      },
    });

    return { success: true };
  }),
});

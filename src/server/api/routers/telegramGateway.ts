import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { generateJWT } from "~/server/utils/jwt";

const TELEGRAM_GATEWAY_URL =
  process.env.TELEGRAM_GATEWAY_URL ?? "http://localhost:4113";

export const telegramGatewayRouter = createTRPCRouter({
  // Check if user has a connected Telegram account
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.telegramGatewaySession.findUnique({
      where: { userId: ctx.session.user.id },
    });

    // Check the gateway for live status
    try {
      const authToken = generateJWT(ctx.session.user, {
        tokenType: "telegram-gateway",
      });
      const res = await fetch(`${TELEGRAM_GATEWAY_URL}/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        const data = (await res.json()) as {
          paired: boolean;
          telegramUsername?: string;
          agentId?: string;
          lastActive?: string;
        };

        if (data.paired && (!session || session.status !== "CONNECTED")) {
          // Gateway says paired but DB doesn't reflect it — sync
          await ctx.db.telegramGatewaySession.upsert({
            where: { userId: ctx.session.user.id },
            create: {
              userId: ctx.session.user.id,
              telegramUsername: data.telegramUsername,
              agentId: data.agentId ?? "assistant",
              status: "CONNECTED",
              connectedAt: new Date(),
              lastActiveAt: data.lastActive
                ? new Date(data.lastActive)
                : null,
            },
            update: {
              telegramUsername: data.telegramUsername,
              agentId: data.agentId ?? "assistant",
              status: "CONNECTED",
              lastActiveAt: data.lastActive
                ? new Date(data.lastActive)
                : null,
            },
          });

          return {
            paired: true,
            telegramUsername: data.telegramUsername,
            agentId: data.agentId,
            lastActive: data.lastActive,
          };
        }

        if (!data.paired && session?.status === "CONNECTED") {
          // Gateway says not paired but DB says connected — sync
          await ctx.db.telegramGatewaySession.update({
            where: { userId: ctx.session.user.id },
            data: { status: "DISCONNECTED", telegramUsername: null },
          });
          return { paired: false };
        }

        return data;
      }
    } catch (error) {
      console.error(
        "[telegramGateway] Failed to check gateway status:",
        error,
      );
    }

    // Fallback to DB state
    return {
      paired: session?.status === "CONNECTED",
      telegramUsername: session?.telegramUsername,
      agentId: session?.agentId,
      lastActive: session?.lastActiveAt?.toISOString(),
    };
  }),

  // Generate pairing code and return deep link
  initiatePairing: protectedProcedure
    .input(
      z.object({
        agentId: z.string().default("assistant"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const authToken = generateJWT(ctx.session.user, {
        tokenType: "telegram-gateway",
      });

      const res = await fetch(`${TELEGRAM_GATEWAY_URL}/pair`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentId: input.agentId }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({
          error: "Gateway error",
        }))) as { error: string };
        throw new Error(error.error ?? `Gateway returned ${res.status}`);
      }

      const data = (await res.json()) as {
        pairingCode: string;
        botUsername: string;
        expiresInSeconds: number;
      };

      // Create/update a DISCONNECTED session so we know pairing was initiated
      await ctx.db.telegramGatewaySession.upsert({
        where: { userId: ctx.session.user.id },
        create: {
          userId: ctx.session.user.id,
          agentId: input.agentId,
          status: "DISCONNECTED",
        },
        update: {
          agentId: input.agentId,
          status: "DISCONNECTED",
        },
      });

      return {
        pairingCode: data.pairingCode,
        botUsername: data.botUsername,
        deepLink: `https://t.me/${data.botUsername}?start=${data.pairingCode}`,
        expiresInSeconds: data.expiresInSeconds,
      };
    }),

  // Disconnect Telegram account
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const authToken = generateJWT(ctx.session.user, {
      tokenType: "telegram-gateway",
    });

    try {
      await fetch(`${TELEGRAM_GATEWAY_URL}/pair`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
    } catch (error) {
      console.error(
        "[telegramGateway] Failed to call gateway disconnect:",
        error,
      );
    }

    // Always update local DB regardless of gateway response
    await ctx.db.telegramGatewaySession
      .update({
        where: { userId: ctx.session.user.id },
        data: { status: "DISCONNECTED", telegramUsername: null },
      })
      .catch(() => {}); // Ignore if no session exists

    return { success: true };
  }),

  // Update agent selection
  updateSettings: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const authToken = generateJWT(ctx.session.user, {
        tokenType: "telegram-gateway",
      });

      try {
        await fetch(`${TELEGRAM_GATEWAY_URL}/settings`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentId: input.agentId }),
        });
      } catch (error) {
        console.error(
          "[telegramGateway] Failed to update gateway settings:",
          error,
        );
      }

      await ctx.db.telegramGatewaySession.update({
        where: { userId: ctx.session.user.id },
        data: { agentId: input.agentId },
      });

      return { success: true };
    }),
});

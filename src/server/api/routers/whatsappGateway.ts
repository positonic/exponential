import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// Environment variable for gateway URL
const WHATSAPP_GATEWAY_URL = process.env.WHATSAPP_GATEWAY_URL;

// Helper function to generate JWT for gateway auth
function generateGatewayJWT(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}): string {
  return jwt.sign(
    {
      userId: user.id,
      sub: user.id,
      email: user.email,
      name: user.name,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
      jti: crypto.randomUUID(),
      tokenType: "whatsapp-gateway",
      aud: "whatsapp-gateway",
      iss: "todo-app",
    },
    process.env.AUTH_SECRET ?? ""
  );
}

export const whatsappGatewayRouter = createTRPCRouter({
  // Check if gateway is configured
  isConfigured: protectedProcedure.query(() => {
    return {
      configured: !!WHATSAPP_GATEWAY_URL,
    };
  }),

  // Initiate login session
  initiateLogin: protectedProcedure.mutation(async ({ ctx }) => {
    if (!WHATSAPP_GATEWAY_URL) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "WhatsApp Gateway not configured",
      });
    }

    const authToken = generateGatewayJWT(ctx.session.user);

    const response = await fetch(`${WHATSAPP_GATEWAY_URL}/login`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[whatsappGateway] Login initiation failed:", errorText);

      if (response.status === 409) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Maximum sessions reached. Please disconnect an existing session first.",
        });
      }

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Gateway login failed: ${errorText}`,
      });
    }

    const data = (await response.json()) as { sessionId: string };
    const sessionId = data.sessionId;

    // Create database record
    const session = await ctx.db.whatsAppGatewaySession.create({
      data: {
        sessionId,
        userId: ctx.session.user.id,
        status: "PENDING",
      },
    });

    return {
      id: session.id,
      sessionId,
    };
  }),

  // Get QR code for session
  getQrCode: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!WHATSAPP_GATEWAY_URL) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "WhatsApp Gateway not configured",
        });
      }

      // Verify session belongs to user
      const session = await ctx.db.whatsAppGatewaySession.findFirst({
        where: {
          sessionId: input.sessionId,
          userId: ctx.session.user.id,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      const authToken = generateGatewayJWT(ctx.session.user);

      const response = await fetch(
        `${WHATSAPP_GATEWAY_URL}/login/${input.sessionId}/qr`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { qrCode: null, expired: true };
        }
        console.error(
          "[whatsappGateway] QR code fetch failed:",
          response.status
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to fetch QR code",
        });
      }

      // Return as base64 data URL
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      return {
        qrCode: `data:image/png;base64,${base64}`,
        expired: false,
      };
    }),

  // Check session status
  getSessionStatus: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!WHATSAPP_GATEWAY_URL) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "WhatsApp Gateway not configured",
        });
      }

      // Verify session belongs to user
      const dbSession = await ctx.db.whatsAppGatewaySession.findFirst({
        where: {
          sessionId: input.sessionId,
          userId: ctx.session.user.id,
        },
      });

      if (!dbSession) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      const authToken = generateGatewayJWT(ctx.session.user);

      const response = await fetch(
        `${WHATSAPP_GATEWAY_URL}/login/${input.sessionId}/status`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (!response.ok) {
        console.error(
          "[whatsappGateway] Status fetch failed:",
          response.status
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to fetch status",
        });
      }

      const data = (await response.json()) as {
        connected: boolean;
        phoneNumber?: string;
        qrAvailable: boolean;
      };

      // Update database if connected
      if (data.connected && dbSession.status !== "CONNECTED") {
        await ctx.db.whatsAppGatewaySession.update({
          where: { id: dbSession.id },
          data: {
            status: "CONNECTED",
            phoneNumber: data.phoneNumber,
            connectedAt: new Date(),
          },
        });
      }

      return {
        connected: data.connected,
        phoneNumber: data.phoneNumber,
        qrAvailable: data.qrAvailable,
        status: data.connected ? "CONNECTED" : "PENDING",
      };
    }),

  // List user's sessions
  listSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.db.whatsAppGatewaySession.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return sessions.map((s: { id: string; sessionId: string; phoneNumber: string | null; status: string; connectedAt: Date | null; createdAt: Date }) => ({
      id: s.id,
      sessionId: s.sessionId,
      phoneNumber: s.phoneNumber,
      status: s.status,
      connectedAt: s.connectedAt?.toISOString(),
      createdAt: s.createdAt.toISOString(),
    }));
  }),

  // Disconnect a session
  disconnectSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!WHATSAPP_GATEWAY_URL) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "WhatsApp Gateway not configured",
        });
      }

      // Verify session belongs to user
      const session = await ctx.db.whatsAppGatewaySession.findFirst({
        where: {
          sessionId: input.sessionId,
          userId: ctx.session.user.id,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      const authToken = generateGatewayJWT(ctx.session.user);

      // Call gateway to disconnect
      try {
        await fetch(`${WHATSAPP_GATEWAY_URL}/sessions/${input.sessionId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
      } catch (error) {
        console.error("[whatsappGateway] Disconnect call failed:", error);
        // Continue with database update even if gateway call fails
      }

      // Update database
      await ctx.db.whatsAppGatewaySession.update({
        where: { id: session.id },
        data: {
          status: "DISCONNECTED",
        },
      });

      return { success: true };
    }),

  // Delete session record (cleanup)
  deleteSession: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.whatsAppGatewaySession.findFirst({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      await ctx.db.whatsAppGatewaySession.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});

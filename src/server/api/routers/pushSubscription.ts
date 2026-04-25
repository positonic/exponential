import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { sendPushNotification } from "~/server/services/notifications/WebPushService";
import { PRODUCT_NAME } from "~/lib/brand";

export const pushSubscriptionRouter = createTRPCRouter({
  /** Save a push subscription for the current user */
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
        userAgent: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const subscription = await ctx.db.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        update: {
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent,
          userId: ctx.session.user.id,
        },
        create: {
          userId: ctx.session.user.id,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent,
        },
      });

      return { id: subscription.id };
    }),

  /** Remove a push subscription */
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.deleteMany({
        where: {
          endpoint: input.endpoint,
          userId: ctx.session.user.id,
        },
      });
      return { success: true };
    }),

  /** List current user's push subscriptions */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.pushSubscription.findMany({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
      },
    });
  }),

  /** Send a test push notification to all of the current user's devices */
  sendTest: protectedProcedure.mutation(async ({ ctx }) => {
    const subscriptions = await ctx.db.pushSubscription.findMany({
      where: { userId: ctx.session.user.id },
    });

    if (subscriptions.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No push subscriptions found. Enable notifications first.",
      });
    }

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        sendPushNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          {
            title: PRODUCT_NAME,
            body: "Push notifications are working!",
            tag: "test",
            url: "/",
          },
        ),
      ),
    );

    const sent = results.filter(
      (r): r is PromiseFulfilledResult<void> => r.status === "fulfilled",
    ).length;
    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    ).length;

    // Clean up expired subscriptions (410 Gone)
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result && result.status === "rejected") {
        const reason = result.reason as { statusCode?: number };
        if (reason?.statusCode === 410) {
          await ctx.db.pushSubscription.delete({
            where: { id: subscriptions[i]!.id },
          });
        }
      }
    }

    return { sent, failed };
  }),

  /** Get the VAPID public key for client-side subscription */
  getVapidPublicKey: protectedProcedure.query(() => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "VAPID public key not configured",
      });
    }
    return { publicKey: key };
  }),
});

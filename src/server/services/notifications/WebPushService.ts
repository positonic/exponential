import webpush from "web-push";

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

function getVapidKeys() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars.",
    );
  }

  return { publicKey, privateKey };
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload,
): Promise<void> {
  const { publicKey, privateKey } = getVapidKeys();

  webpush.setVapidDetails(
    "mailto:support@exponential.im",
    publicKey,
    privateKey,
  );

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    JSON.stringify(payload),
  );
}

/**
 * Send a push notification to all of a user's subscriptions.
 * Automatically cleans up expired subscriptions (410 Gone).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  db: {
    pushSubscription: {
      findMany: (args: {
        where: { userId: string };
      }) => Promise<
        Array<{ id: string; endpoint: string; p256dh: string; auth: string }>
      >;
      delete: (args: { where: { id: string } }) => Promise<unknown>;
    };
  },
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendPushNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ),
    ),
  );

  // Clean up expired subscriptions
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result && result.status === "rejected") {
      const reason = result.reason as { statusCode?: number };
      if (reason?.statusCode === 410) {
        await db.pushSubscription.delete({
          where: { id: subscriptions[i]!.id },
        });
      }
    }
  }

  return {
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
}

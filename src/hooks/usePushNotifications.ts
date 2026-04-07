"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "~/trpc/react";

type PushPermissionState = "prompt" | "granted" | "denied" | "unsupported";

export type SubscribeResult =
  | { success: true }
  | {
      success: false;
      reason:
        | "vapid-not-ready"
        | "permission-denied"
        | "sw-failed"
        | "subscription-failed"
        | "server-error";
    };

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>("prompt");
  const [isSubscribed, setIsSubscribed] = useState(false);

  const subscribeMutation = api.pushSubscription.subscribe.useMutation();
  const unsubscribeMutation = api.pushSubscription.unsubscribe.useMutation();
  const sendTestMutation = api.pushSubscription.sendTest.useMutation();
  const {
    data: vapidData,
    isLoading: isVapidLoading,
    isError: isVapidError,
  } = api.pushSubscription.getVapidPublicKey.useQuery(undefined, {
    retry: 2,
    retryDelay: 1000,
  });

  // Check current permission + subscription state on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission as PushPermissionState);

    // Check if already subscribed
    void navigator.serviceWorker.ready.then(async (registration) => {
      const sub = await registration.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });
  }, []);

  const subscribe = useCallback(async (): Promise<SubscribeResult> => {
    if (!vapidData?.publicKey) {
      console.error("[Push] VAPID public key not available");
      return { success: false, reason: "vapid-not-ready" };
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      if (result !== "granted") {
        console.error("[Push] Permission denied:", result);
        return { success: false, reason: "permission-denied" };
      }

      let registration: ServiceWorkerRegistration;
      try {
        registration = await navigator.serviceWorker.ready;
      } catch (err) {
        console.error("[Push] Service worker not ready:", err);
        return { success: false, reason: "sw-failed" };
      }

      let subscription: PushSubscription;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidData.publicKey,
        });
      } catch (err) {
        console.error("[Push] pushManager.subscribe failed:", err);
        return { success: false, reason: "subscription-failed" };
      }

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        console.error("[Push] Invalid subscription data:", json);
        return { success: false, reason: "subscription-failed" };
      }

      await subscribeMutation.mutateAsync({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        userAgent: navigator.userAgent,
      });

      setIsSubscribed(true);
      return { success: true };
    } catch (err) {
      console.error("[Push] Server error saving subscription:", err);
      return { success: false, reason: "server-error" };
    }
  }, [vapidData?.publicKey, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeMutation.mutateAsync({
          endpoint: subscription.endpoint,
        });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error("[Push] Unsubscribe failed:", err);
      return false;
    }
  }, [unsubscribeMutation]);

  const sendTest = useCallback(async () => {
    return sendTestMutation.mutateAsync();
  }, [sendTestMutation]);

  return {
    permission,
    isSubscribed,
    isSupported: permission !== "unsupported",
    isVapidLoading,
    isVapidError,
    subscribe,
    unsubscribe,
    sendTest,
    isLoading:
      subscribeMutation.isPending ||
      unsubscribeMutation.isPending ||
      sendTestMutation.isPending,
  };
}

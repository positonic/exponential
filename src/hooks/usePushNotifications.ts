"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "~/trpc/react";

type PushPermissionState = "prompt" | "granted" | "denied" | "unsupported";

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>("prompt");
  const [isSubscribed, setIsSubscribed] = useState(false);

  const subscribeMutation = api.pushSubscription.subscribe.useMutation();
  const unsubscribeMutation = api.pushSubscription.unsubscribe.useMutation();
  const sendTestMutation = api.pushSubscription.sendTest.useMutation();
  const { data: vapidData } = api.pushSubscription.getVapidPublicKey.useQuery(
    undefined,
    { retry: false },
  );

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

  const subscribe = useCallback(async () => {
    if (!vapidData?.publicKey) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      if (result !== "granted") return false;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidData.publicKey,
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Invalid subscription data");
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
      return true;
    } catch (err) {
      console.error("[Push] Subscribe failed:", err);
      return false;
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
    subscribe,
    unsubscribe,
    sendTest,
    isLoading:
      subscribeMutation.isPending ||
      unsubscribeMutation.isPending ||
      sendTestMutation.isPending,
  };
}

"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const ACTION_PARAM = "actionId";

interface UseActionDeepLinkReturn {
  /** The action ID from the URL ?actionId= param, or null */
  actionIdFromUrl: string | null;
  /** Set the action ID in the URL (opens deep link) */
  setActionId: (id: string) => void;
  /** Remove the action ID from the URL (closes deep link) */
  clearActionId: () => void;
}

export function useActionDeepLink(): UseActionDeepLinkReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const actionIdFromUrl = searchParams.get(ACTION_PARAM);

  const setActionId = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(ACTION_PARAM, id);
      const newUrl = `${pathname}?${params.toString()}`;
      router.replace(newUrl, { scroll: false });
    },
    [router, searchParams, pathname],
  );

  const clearActionId = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(ACTION_PARAM);
    const newUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.replace(newUrl, { scroll: false });
  }, [router, searchParams, pathname]);

  return { actionIdFromUrl, setActionId, clearActionId };
}

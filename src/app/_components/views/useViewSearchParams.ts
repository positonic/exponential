"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const VIEW_PARAM = "view";
const DEFAULT_SLUG = "all-items";

interface UseViewSearchParamsReturn {
  /** The view slug from the URL, or null if on default view */
  viewSlugFromUrl: string | null;
  /** Update the URL to reflect the selected view slug */
  setViewSlug: (slug: string | null) => void;
}

export function useViewSearchParams(): UseViewSearchParamsReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const rawSlug = searchParams.get(VIEW_PARAM);
  const viewSlugFromUrl =
    rawSlug && rawSlug !== DEFAULT_SLUG ? rawSlug : null;

  const setViewSlug = useCallback(
    (slug: string | null) => {
      const params = new URLSearchParams(searchParams.toString());

      if (!slug || slug === DEFAULT_SLUG) {
        params.delete(VIEW_PARAM);
      } else {
        params.set(VIEW_PARAM, slug);
      }

      const newUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;

      router.replace(newUrl, { scroll: false });
    },
    [router, searchParams, pathname],
  );

  return { viewSlugFromUrl, setViewSlug };
}

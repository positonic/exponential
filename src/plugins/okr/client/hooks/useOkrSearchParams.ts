"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import {
  getCurrentYear,
  getCurrentQuarterType,
  isOkrPeriodTab,
  type OkrPeriodTab,
} from "../utils/periodUtils";

export type DrawerEntity = "objective" | "keyResult";

export interface DrawerParam {
  type: DrawerEntity;
  /** Raw id from the URL. Objective ids are numeric; key result ids are cuids. */
  id: string;
}

/**
 * Parse the `drawer` query param. Encoded as `objective:<goalId>` or
 * `keyResult:<keyResultId>`. Returns null for missing or malformed values so
 * stale/invalid deep links fail gracefully (drawer stays closed).
 */
export function parseDrawerParam(raw: string | null): DrawerParam | null {
  if (!raw) return null;
  const sep = raw.indexOf(":");
  if (sep <= 0) return null;
  const type = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if ((type === "objective" || type === "keyResult") && id) {
    return { type, id };
  }
  return null;
}

export function useOkrSearchParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const year = searchParams.get("year") ?? getCurrentYear();
  // Anything that isn't a real period — including the retired
  // `period=Timeline` pseudo-period, now `view=timeline` — falls back to the
  // current quarter.
  const rawPeriod = searchParams.get("period");
  const period: OkrPeriodTab = isOkrPeriodTab(rawPeriod)
    ? rawPeriod
    : (getCurrentQuarterType() as OkrPeriodTab);

  const drawerParam = useMemo(
    () => parseDrawerParam(searchParams.get("drawer")),
    [searchParams],
  );

  // Opening pushes a history entry so the browser back button restores the
  // prior drawer state; closing removes the param the same way.
  const openDrawer = useCallback(
    (type: DrawerEntity, id: string | number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("drawer", `${type}:${id}`);
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router, pathname, startTransition],
  );

  const closeDrawer = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("drawer");
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [searchParams, router, pathname, startTransition]);

  const setParams = useCallback(
    (newYear: string, newPeriod: OkrPeriodTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("year", newYear);
      params.set("period", newPeriod);
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router, pathname, startTransition]
  );

  const setYear = useCallback(
    (newYear: string) => {
      setParams(newYear, period);
    },
    [period, setParams]
  );

  const setPeriod = useCallback(
    (newPeriod: OkrPeriodTab) => {
      setParams(year, newPeriod);
    },
    [year, setParams]
  );

  return {
    year,
    period,
    isPending,
    setYear,
    setPeriod,
    setParams,
    drawerParam,
    openDrawer,
    closeDrawer,
  };
}

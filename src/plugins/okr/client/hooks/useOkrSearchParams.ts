"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { getCurrentYear, getCurrentQuarterType } from "../utils/periodUtils";

export function useOkrSearchParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const year = searchParams.get("year") ?? getCurrentYear();
  const period = (searchParams.get("period") as "Annual" | "Q1" | "Q2" | "Q3" | "Q4") ??
    getCurrentQuarterType().replace(/-(Annual)?/, '') as "Q1" | "Q2" | "Q3" | "Q4";

  const setParams = useCallback(
    (newYear: string, newPeriod: "Annual" | "Q1" | "Q2" | "Q3" | "Q4") => {
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
    (newPeriod: "Annual" | "Q1" | "Q2" | "Q3" | "Q4") => {
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
  };
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

export type GoalsTab = "goals" | "okrs";
export type GoalsView = "list" | "timeline";

export const GOALS_TAB_PARAM = "tab";
/** `?mine=1` — only goals/OKRs the current user is the DRI on. */
export const GOALS_MINE_PARAM = "mine";
/** `?view=timeline` — gantt rendering of whichever tab is active. */
export const GOALS_VIEW_PARAM = "view";

export interface GoalsViewParams {
  tab: GoalsTab;
  onlyMine: boolean;
  view: GoalsView;
  /**
   * True when the URL used a retired encoding (`tab=my-goals`, or the old
   * `period=Timeline` pseudo-period) that should be rewritten to the current
   * `mine` / `view` params so shared links keep working.
   */
  isLegacy: boolean;
}

/**
 * Read the goals page's view state from its query string.
 *
 * "Mine" and "Timeline" are orthogonal toggles layered over the Goals / OKRs
 * tabs rather than tabs of their own, so every combination (my goals on a
 * timeline, everyone's OKRs as a list, …) has a URL.
 */
export function parseGoalsViewParams(params: URLSearchParams): GoalsViewParams {
  const rawTab = params.get(GOALS_TAB_PARAM);
  const legacyMyGoalsTab = rawTab === "my-goals";
  const legacyTimelinePeriod = params.get("period") === "Timeline";

  const tab: GoalsTab = rawTab === "okrs" || legacyMyGoalsTab ? "okrs" : "goals";
  const onlyMine = legacyMyGoalsTab || params.get(GOALS_MINE_PARAM) === "1";
  const view: GoalsView =
    legacyTimelinePeriod || params.get(GOALS_VIEW_PARAM) === "timeline"
      ? "timeline"
      : "list";

  return {
    tab,
    onlyMine,
    view,
    isLegacy: legacyMyGoalsTab || legacyTimelinePeriod,
  };
}

/** Write the view state back into a copy of `params` in canonical form. */
export function applyGoalsViewParams(
  params: URLSearchParams,
  next: Pick<GoalsViewParams, "tab" | "onlyMine" | "view">,
): URLSearchParams {
  const out = new URLSearchParams(params.toString());
  out.set(GOALS_TAB_PARAM, next.tab);
  if (next.onlyMine) out.set(GOALS_MINE_PARAM, "1");
  else out.delete(GOALS_MINE_PARAM);
  if (next.view === "timeline") out.set(GOALS_VIEW_PARAM, "timeline");
  else out.delete(GOALS_VIEW_PARAM);
  // "Timeline" was never a real period; dropping it lets the OKR period
  // default (the current quarter) take over.
  if (out.get("period") === "Timeline") out.delete("period");
  return out;
}

export function useGoalsViewParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const parsed = useMemo(
    () => parseGoalsViewParams(searchParams),
    [searchParams],
  );

  const write = useCallback(
    (patch: Partial<Pick<GoalsViewParams, "tab" | "onlyMine" | "view">>) => {
      const current = parseGoalsViewParams(searchParams);
      const next = applyGoalsViewParams(searchParams, { ...current, ...patch });
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  // Rewrite retired encodings once so the address bar (and anything copied
  // from it) carries the current form.
  useEffect(() => {
    if (parsed.isLegacy) write({});
  }, [parsed.isLegacy, write]);

  const setTab = useCallback((tab: GoalsTab) => write({ tab }), [write]);
  const setOnlyMine = useCallback(
    (onlyMine: boolean) => write({ onlyMine }),
    [write],
  );
  const setView = useCallback((view: GoalsView) => write({ view }), [write]);

  return {
    tab: parsed.tab,
    onlyMine: parsed.onlyMine,
    view: parsed.view,
    /**
     * A retired URL is still being rewritten. Callers should hold off
     * mounting children until it clears: the panels below run their own
     * `router.replace` effects (filter restore, debounced `?q=`), and the
     * rewrite flushing last would discard whatever they just wrote.
     */
    isRewritingLegacyUrl: parsed.isLegacy,
    setTab,
    setOnlyMine,
    setView,
  };
}

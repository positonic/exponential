"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useTransition } from "react";
import {
  isGoalsPagePeriod,
  type GoalsPagePeriod,
} from "~/plugins/okr/client/utils/periodUtils";

/** A rendering of the Goals page's one objective list. */
export type GoalsPageView = "table" | "okrs" | "key-results" | "timeline";

export const GOALS_PAGE_VIEWS: readonly GoalsPageView[] = [
  "table",
  "okrs",
  "key-results",
  "timeline",
];

export const GOALS_VIEW_PARAM = "view";
export const GOALS_PERIOD_PARAM = "period";
export const GOALS_YEAR_PARAM = "year";
/** `?mine=1` — only objectives the current user is the DRI on. */
export const GOALS_MINE_PARAM = "mine";
/** `?drawer=objective:<goalId>` / `?drawer=keyResult:<id>` — the OKR drawer. */
export const GOALS_DRAWER_PARAM = "drawer";

export type DrawerEntity = "objective" | "keyResult";

export interface DrawerParam {
  type: DrawerEntity;
  /** Raw id from the URL. Objective ids are numeric; key result ids are cuids. */
  id: string;
}

export interface GoalsPageParams {
  view: GoalsPageView;
  period: GoalsPagePeriod;
  year: string;
  onlyMine: boolean;
  drawer: DrawerParam | null;
  /**
   * True when the URL used a retired encoding (`tab=…`, or the old
   * `period=Timeline` pseudo-period) that should be rewritten to the current
   * params once so shared links keep working.
   */
  isLegacy: boolean;
}

/** The part of the state the page writes; the drawer has its own writers. */
export type GoalsPageState = Pick<
  GoalsPageParams,
  "view" | "period" | "year" | "onlyMine"
>;

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

export interface GoalsPageDefaults {
  view: GoalsPageView;
  period: GoalsPagePeriod;
  year: string;
}

/** The defaults the URL omits: Table, the current quarter, the current year. */
export function goalsPageDefaults(now: Date = new Date()): GoalsPageDefaults {
  const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}` as GoalsPagePeriod;
  return { view: "table", period: quarter, year: now.getFullYear().toString() };
}

function isGoalsPageView(value: string | null): value is GoalsPageView {
  return (GOALS_PAGE_VIEWS as readonly string[]).includes(value ?? "");
}

/**
 * Read the Goals page's state from its query string.
 *
 * The page is one period-scoped list with several renderings, so `view`,
 * `period`, `year` and `mine` are independent: every combination (my OKRs
 * for Q2 on a timeline, everyone's objectives for all time as a table, …)
 * has a URL, and switching one never touches the others.
 */
export function parseGoalsViewParams(
  params: URLSearchParams,
  now: Date = new Date(),
): GoalsPageParams {
  const defaults = goalsPageDefaults(now);

  const rawView = params.get(GOALS_VIEW_PARAM);
  const rawPeriod = params.get(GOALS_PERIOD_PARAM);
  const rawYear = params.get(GOALS_YEAR_PARAM);

  // Retired encodings. `tab=` carried the view before the Goals / OKRs tabs
  // merged; `period=Timeline` was a pseudo-period before Timeline became a
  // view. Each maps to one row of the current grammar.
  const rawTab = params.get("tab");
  const legacyTab =
    rawTab === "goals" || rawTab === "okrs" || rawTab === "my-goals";
  const legacyTimelinePeriod = rawPeriod === "Timeline";
  const isLegacy = rawTab !== null || legacyTimelinePeriod;

  let view: GoalsPageView = isGoalsPageView(rawView) ? rawView : defaults.view;
  if (legacyTab && !isGoalsPageView(rawView)) {
    view = rawTab === "goals" ? "table" : "okrs";
  }
  if (legacyTimelinePeriod || rawView === "timeline") view = "timeline";

  const period: GoalsPagePeriod = isGoalsPagePeriod(rawPeriod)
    ? rawPeriod
    : defaults.period;
  const year = rawYear && /^\d{4}$/.test(rawYear) ? rawYear : defaults.year;
  const onlyMine =
    rawTab === "my-goals" || params.get(GOALS_MINE_PARAM) === "1";

  return {
    view,
    period,
    year,
    onlyMine,
    drawer: parseDrawerParam(params.get(GOALS_DRAWER_PARAM)),
    isLegacy,
  };
}

/**
 * Write the page state back into a copy of `params` in canonical form:
 * `view`, `period` and `year` are omitted at their defaults, `mine` is
 * present only when on, and every retired encoding is dropped. Params the
 * page does not own (`q`, filters, `drawer`) pass through untouched.
 */
export function applyGoalsViewParams(
  params: URLSearchParams,
  next: GoalsPageState,
  now: Date = new Date(),
): URLSearchParams {
  const defaults = goalsPageDefaults(now);
  const out = new URLSearchParams(params.toString());
  out.delete("tab");

  if (next.view === defaults.view) out.delete(GOALS_VIEW_PARAM);
  else out.set(GOALS_VIEW_PARAM, next.view);

  if (next.period === defaults.period) out.delete(GOALS_PERIOD_PARAM);
  else out.set(GOALS_PERIOD_PARAM, next.period);

  if (next.year === defaults.year) out.delete(GOALS_YEAR_PARAM);
  else out.set(GOALS_YEAR_PARAM, next.year);

  if (next.onlyMine) out.set(GOALS_MINE_PARAM, "1");
  else out.delete(GOALS_MINE_PARAM);

  return out;
}

/** `null` on All: the page resolves the period itself instead of building one. */
export function effectivePeriodOf(
  period: GoalsPagePeriod,
  year: string,
): string | null {
  return period === "all" ? null : `${period}-${year}`;
}

export function useGoalsViewParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const parsed = useMemo(
    () => parseGoalsViewParams(searchParams),
    [searchParams],
  );

  const write = useCallback(
    (patch: Partial<GoalsPageState>) => {
      const current = parseGoalsViewParams(searchParams);
      const next = applyGoalsViewParams(searchParams, { ...current, ...patch });
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [searchParams, router, pathname, startTransition],
  );

  // Rewrite retired encodings once so the address bar (and anything copied
  // from it) carries the current form.
  useEffect(() => {
    if (parsed.isLegacy) write({});
  }, [parsed.isLegacy, write]);

  const setView = useCallback(
    (view: GoalsPageView) => write({ view }),
    [write],
  );
  const setPeriod = useCallback(
    (period: GoalsPagePeriod) => write({ period }),
    [write],
  );
  const setYear = useCallback((year: string) => write({ year }), [write]);
  const setOnlyMine = useCallback(
    (onlyMine: boolean) => write({ onlyMine }),
    [write],
  );

  // Opening pushes a history entry so the browser back button restores the
  // prior drawer state; closing removes the param the same way.
  const openDrawer = useCallback(
    (type: DrawerEntity, id: string | number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(GOALS_DRAWER_PARAM, `${type}:${id}`);
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router, pathname, startTransition],
  );

  const closeDrawer = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(GOALS_DRAWER_PARAM);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [searchParams, router, pathname, startTransition]);

  return {
    view: parsed.view,
    period: parsed.period,
    year: parsed.year,
    onlyMine: parsed.onlyMine,
    drawer: parsed.drawer,
    /** `null` on All; otherwise the `Q4-2026`-style period the list is scoped to. */
    effectivePeriod: effectivePeriodOf(parsed.period, parsed.year),
    isPending,
    /**
     * A retired URL is still being rewritten. Callers should hold off
     * mounting children until it clears: the bodies below run their own
     * `router.replace` effects (filter restore, debounced `?q=`), and the
     * rewrite flushing last would discard whatever they just wrote.
     */
    isRewritingLegacyUrl: parsed.isLegacy,
    setView,
    setPeriod,
    setYear,
    setOnlyMine,
    openDrawer,
    closeDrawer,
  };
}

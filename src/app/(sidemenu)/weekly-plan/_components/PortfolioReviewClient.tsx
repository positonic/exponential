"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  IconArrowRight,
  IconChevronLeft,
  IconClock,
  IconFolder,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import "../_styles/portfolio-review.css";
import { PortfolioReviewIntro } from "./PortfolioReviewIntro";
import { PortfolioReviewStepper } from "./PortfolioReviewStepper";
import {
  buildInitialFocusMap,
  WorkspaceFocusList,
} from "./WorkspaceFocusList";
import { OkrCheckInTabs } from "./OkrCheckInTabs";
import { CrossWorkspaceProjectList } from "./CrossWorkspaceProjectList";
import { PortfolioReviewCompletion } from "./PortfolioReviewCompletion";
import { PHASE_META, PHASE_ORDER, type Phase, type ReviewData } from "./types";

type ProjectPriority = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export function PortfolioReviewClient() {
  const reviewData = api.portfolioReview.getReviewData.useQuery();
  const completedQuery =
    api.portfolioReview.isCompletedThisWeek.useQuery();

  if (
    reviewData.isLoading ||
    !reviewData.data ||
    completedQuery.isLoading ||
    !completedQuery.data
  ) {
    return (
      <div className="portfolio-review-surface -m-4 -mt-16 sm:-mt-4 lg:-m-8 -mb-20 sm:-mb-4 lg:-mb-8">
        <div className="pr-shell">
          <div className="pr-empty">Loading your portfolio…</div>
        </div>
      </div>
    );
  }

  return (
    <PortfolioReviewInner
      data={reviewData.data}
      isCompletedThisWeek={completedQuery.data.isCompleted}
    />
  );
}

interface InnerProps {
  data: ReviewData;
  isCompletedThisWeek: boolean;
}

function PortfolioReviewInner({ data, isCompletedThisWeek }: InnerProps) {
  // Resume rule:
  // - already completed this week  → land on `complete` (summary + drill-in)
  // - any in-progress focus state  → land on `scope` (resume editing)
  // - clean slate                  → `intro`
  const initialPhase: Phase = (() => {
    if (isCompletedThisWeek) return "complete";
    const hasAnyFocusState = data.currentWeekFocuses.some(
      (f) => f.isInFocus || f.focusText || f.focusKeyResultIds.length > 0,
    );
    if (hasAnyFocusState) return "scope";
    return "intro";
  })();

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [furthestReached, setFurthestReached] = useState<Phase>(initialPhase);

  // Phase 1 — focus map keyed by workspaceId
  const [focusMap, setFocusMap] = useState(() =>
    buildInitialFocusMap(
      data.workspaces,
      data.currentWeekFocuses,
      data.lastWeekFocuses,
    ),
  );

  // Phase 2 — KR focuses per workspace
  const [focuses, setFocuses] = useState<Map<string, string[]>>(() => {
    const m = new Map<string, string[]>();
    for (const f of data.currentWeekFocuses) {
      m.set(f.workspaceId, f.focusKeyResultIds);
    }
    return m;
  });
  const [krCheckInsLogged, setKrCheckInsLogged] = useState(0);
  const setFocusesForWorkspace = (workspaceId: string, next: string[]) => {
    const newMap = new Map(focuses);
    newMap.set(workspaceId, next);
    setFocuses(newMap);
    void setWeeklyFocusGoals.mutateAsync({
      workspaceId,
      focusGoalIds: [], // not pinning goals from this UI yet
      focusKeyResultIds: next,
    });
  };

  const setWeeklyFocusGoals = api.portfolioReview.setWeeklyFocusGoals.useMutation();

  // Phase 3 — priority changes ledger
  const [priorityChanges, setPriorityChanges] = useState<
    Map<string, { before: ProjectPriority; after: ProjectPriority }>
  >(new Map());
  const recordPriorityChange = (
    projectId: string,
    before: ProjectPriority,
    after: ProjectPriority,
  ) => {
    const next = new Map(priorityChanges);
    next.set(projectId, { before, after });
    setPriorityChanges(next);
  };

  // Snapshot focused workspaces at the moment we leave Phase 1 so steps 2/3
  // remain stable even if the toggles change after.
  const focusedSnapshotRef = useRef<string[]>([]);
  const focusedWorkspaces = useMemo(() => {
    const ids =
      focusedSnapshotRef.current.length > 0
        ? focusedSnapshotRef.current
        : data.workspaces
            .filter((w) => focusMap.get(w.id)?.isInFocus)
            .map((w) => w.id);
    return ids
      .map((id) => data.workspaces.find((w) => w.id === id))
      .filter((w): w is (typeof data.workspaces)[number] => Boolean(w));
  }, [focusMap, data]);

  // Themes derived from focusMap (text values)
  const themes = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const ws of data.workspaces) {
      m.set(ws.id, focusMap.get(ws.id)?.focusText ?? null);
    }
    return m;
  }, [focusMap, data.workspaces]);

  // Track elapsed time
  const startedAt = useRef<Date | null>(null);
  useEffect(() => {
    if (phase !== "intro" && !startedAt.current) {
      startedAt.current = new Date();
    }
  }, [phase]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (phase === "intro" || phase === "complete") return;
    const i = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(i);
  }, [phase]);
  const elapsedMin =
    startedAt.current
      ? Math.floor((Date.now() - startedAt.current.getTime()) / 60000)
      : 0;
  // Reference tick so the linter knows it triggers re-renders for elapsedMin
  void tick;

  const advance = (next: Phase) => {
    if (phase === "scope" && next !== "scope") {
      // Snapshot the current focused workspaces
      focusedSnapshotRef.current = data.workspaces
        .filter((w) => focusMap.get(w.id)?.isInFocus)
        .map((w) => w.id);
    }
    setPhase(next);
    if (PHASE_ORDER.indexOf(next) > PHASE_ORDER.indexOf(furthestReached)) {
      setFurthestReached(next);
    }
  };

  const focusedCount = focusedWorkspaces.length;
  const liveFocusedCount = data.workspaces.filter(
    (w) => focusMap.get(w.id)?.isInFocus,
  ).length;

  const handleFocusChange = (
    workspaceId: string,
    next: { isInFocus: boolean; focusText: string | null },
  ) => {
    const newMap = new Map(focusMap);
    newMap.set(workspaceId, next);
    setFocusMap(newMap);
  };

  const continueDisabled = phase === "scope" && liveFocusedCount === 0;

  return (
    <div className="portfolio-review-surface -m-4 -mt-16 sm:-mt-4 lg:-m-8 -mb-20 sm:-mb-4 lg:-mb-8">
      <header className="pr-topbar">
        <div className="pr-crumb">
          <IconFolder size={14} /> Portfolio
          <span className="pr-crumb__sep">/</span>
          <span className="pr-crumb__current">Weekly Review</span>
        </div>
        <div className="pr-topbar__right">
          {phase !== "intro" && phase !== "complete" && (
            <span className="pr-topbar__elapsed">
              <IconClock size={13} /> {elapsedMin} min elapsed
            </span>
          )}
          <Link href="/home" className="pr-topbar__close" aria-label="Save & exit">
            <IconX size={16} />
          </Link>
        </div>
      </header>

      <div className="pr-shell">
        {phase !== "intro" && (
          <PortfolioReviewStepper
            current={phase}
            furthestReached={furthestReached}
            onJump={(p) => setPhase(p)}
          />
        )}

        {phase === "intro" && (
          <PortfolioReviewIntro
            data={data}
            onStart={() => advance("scope")}
          />
        )}

        {phase === "scope" && (
          <>
            <PhaseHeader
              eyebrow={`${PHASE_META.scope.label} of 4 · ${PHASE_META.scope.title}`}
              title="Which workspaces matter this week?"
              sub="Drop in only what you'll genuinely touch. Set a one-line theme so the week has a shape. Dormant workspaces stay visible but won't surface in plans."
              progress={1 / 4}
              counter="step 1 / 4"
            />
            <WorkspaceFocusList
              data={data}
              focusMap={focusMap}
              onChange={handleFocusChange}
            />
          </>
        )}

        {phase === "okrs" && (
          <>
            <PhaseHeader
              eyebrow={`${PHASE_META.okrs.label} of 4 · ${PHASE_META.okrs.title}`}
              title="Re-rank goals inside each focus workspace"
              sub="Click a row to expand its KRs. Mark this week's focus areas to anchor your theme to specific results, and inline-edit current values to log a check-in."
              progress={2 / 4}
              counter="step 2 / 4"
            />
            <OkrCheckInTabs
              data={data}
              focusedWorkspaces={focusedWorkspaces}
              themes={themes}
              focuses={focuses}
              onFocusesChange={setFocusesForWorkspace}
              onCheckInLogged={() => setKrCheckInsLogged((n) => n + 1)}
            />
          </>
        )}

        {phase === "projects" && (
          <>
            <PhaseHeader
              eyebrow={`${PHASE_META.projects.label} of 4 · ${PHASE_META.projects.title}`}
              title="Prioritize projects across all in-focus workspaces"
              sub="One list. Hard cap of 5 in Top focus. Move projects between tiers using the chip buttons. Filter by workspace to focus."
              progress={3 / 4}
              counter="step 3 / 4"
            />
            <CrossWorkspaceProjectList
              data={data}
              focusedWorkspaces={focusedWorkspaces}
              focuses={focuses}
              onPriorityChange={recordPriorityChange}
            />
          </>
        )}

        {phase === "complete" && (
          <PortfolioReviewCompletion
            data={data}
            focusedWorkspaces={focusedWorkspaces}
            themes={themes}
            focuses={focuses}
            priorityChanges={priorityChanges}
            krCheckInsLogged={krCheckInsLogged}
            durationMinutes={elapsedMin > 0 ? elapsedMin : null}
            resumedFromCompletion={initialPhase === "complete"}
          />
        )}

        {phase !== "intro" && phase !== "complete" && (
          <div className="pr-foot">
            <div className="pr-foot__hint">
              {phase === "scope" && (
                <>
                  <IconInfoCircle size={13} />
                  {liveFocusedCount} workspace
                  {liveFocusedCount === 1 ? "" : "s"} in focus
                </>
              )}
              {phase === "okrs" && (
                <>
                  <IconInfoCircle size={13} />
                  {Array.from(focuses.values()).reduce(
                    (acc, arr) => acc + arr.length,
                    0,
                  )}{" "}
                  KR
                  {Array.from(focuses.values()).reduce(
                    (acc, arr) => acc + arr.length,
                    0,
                  ) === 1
                    ? ""
                    : "s"}{" "}
                  in focus across {focusedCount} workspace
                  {focusedCount === 1 ? "" : "s"}
                </>
              )}
              {phase === "projects" && (
                <>
                  <IconInfoCircle size={13} />
                  {priorityChanges.size} priority change
                  {priorityChanges.size === 1 ? "" : "s"} this session
                </>
              )}
            </div>
            <div className="pr-foot__actions">
              <button
                type="button"
                className="pr-btn pr-btn--ghost"
                onClick={() => {
                  const idx = PHASE_ORDER.indexOf(phase);
                  if (idx > 0) setPhase(PHASE_ORDER[idx - 1]!);
                }}
              >
                <IconChevronLeft size={13} /> Back
              </button>
              <button
                type="button"
                className="pr-btn pr-btn--primary"
                disabled={continueDisabled}
                onClick={() => {
                  const idx = PHASE_ORDER.indexOf(phase);
                  const next = PHASE_ORDER[idx + 1];
                  if (next) advance(next);
                }}
              >
                {phase === "projects" ? "Finish review" : "Continue"}{" "}
                <IconArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface PhaseHeaderProps {
  eyebrow: string;
  title: string;
  sub: string;
  progress: number;
  counter: string;
}

function PhaseHeader({
  eyebrow,
  title,
  sub,
  progress,
  counter,
}: PhaseHeaderProps) {
  return (
    <div className="pr-phase-head">
      <div>
        <div className="pr-phase-head__eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <div className="pr-phase-head__sub">{sub}</div>
      </div>
      <div className="pr-phase-head__counter">
        <div className="pr-mini-bar">
          <div
            className="pr-mini-bar__fill"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span>{counter}</span>
      </div>
    </div>
  );
}

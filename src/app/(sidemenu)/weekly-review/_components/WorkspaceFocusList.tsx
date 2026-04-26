"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconArchive, IconBolt, IconInfoCircle } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  ConfidenceLegend,
  ConfidenceStack,
} from "./PortfolioReviewIntro";
import {
  daysBetween,
  quarterElapsedPct,
  workspaceGlyphVar,
  workspaceShortName,
  type ReviewData,
  type ReviewFocus,
  type ReviewRollup,
  type ReviewWorkspace,
} from "./types";

interface Props {
  data: ReviewData;
  focusMap: Map<string, { isInFocus: boolean; focusText: string | null }>;
  onChange: (
    workspaceId: string,
    next: { isInFocus: boolean; focusText: string | null },
  ) => void;
}

export function WorkspaceFocusList({ data, focusMap, onChange }: Props) {
  const focused = data.workspaces.filter(
    (w) => focusMap.get(w.id)?.isInFocus,
  );
  const dormant = data.workspaces.filter(
    (w) => !focusMap.get(w.id)?.isInFocus,
  );

  return (
    <div className="pr-triage">
      <div className="pr-bucket pr-bucket--focus">
        <div className="pr-bucket__head">
          <span>
            <IconBolt
              size={11}
              style={{ marginRight: 6, verticalAlign: "-1px" }}
            />
            In focus this week
          </span>
          <span className="pr-bucket__count">{focused.length}</span>
        </div>
        {focused.length === 0 ? (
          <div className="pr-bucket__empty">
            Nothing in focus yet — pull at least one workspace in from the
            right.
          </div>
        ) : (
          focused.map((ws) => (
            <WorkspaceFocusToggleCard
              key={ws.id}
              workspace={ws}
              workspaceIndex={
                data.workspaces.findIndex((w) => w.id === ws.id)
              }
              rollup={
                data.quarterRollupByWorkspace.find(
                  (r) => r.workspaceId === ws.id,
                ) ?? null
              }
              focused
              focusState={focusMap.get(ws.id) ?? defaultFocus()}
              now={new Date(data.now)}
              quarterStart={new Date(data.quarterStart)}
              quarterEnd={new Date(data.quarterEnd)}
              currentQuarter={data.currentQuarter}
              onChange={(next) => onChange(ws.id, next)}
            />
          ))
        )}
      </div>

      <div className="pr-bucket">
        <div className="pr-bucket__head">
          <span>
            <IconArchive
              size={11}
              style={{ marginRight: 6, verticalAlign: "-1px" }}
            />
            Dormant — not this week
          </span>
          <span className="pr-bucket__count">{dormant.length}</span>
        </div>
        {dormant.length === 0 ? (
          <div className="pr-bucket__empty">
            Every workspace is in focus. That&apos;s ambitious — sure?
          </div>
        ) : (
          dormant.map((ws) => (
            <WorkspaceFocusToggleCard
              key={ws.id}
              workspace={ws}
              workspaceIndex={
                data.workspaces.findIndex((w) => w.id === ws.id)
              }
              rollup={
                data.quarterRollupByWorkspace.find(
                  (r) => r.workspaceId === ws.id,
                ) ?? null
              }
              focused={false}
              focusState={focusMap.get(ws.id) ?? defaultFocus()}
              now={new Date(data.now)}
              quarterStart={new Date(data.quarterStart)}
              quarterEnd={new Date(data.quarterEnd)}
              currentQuarter={data.currentQuarter}
              onChange={(next) => onChange(ws.id, next)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function defaultFocus() {
  return { isInFocus: false, focusText: null as string | null };
}

interface CardProps {
  workspace: ReviewWorkspace;
  workspaceIndex: number;
  rollup: ReviewRollup | null;
  focused: boolean;
  focusState: { isInFocus: boolean; focusText: string | null };
  now: Date;
  quarterStart: Date;
  quarterEnd: Date;
  currentQuarter: string;
  onChange: (next: { isInFocus: boolean; focusText: string | null }) => void;
}

function WorkspaceFocusToggleCard({
  workspace,
  workspaceIndex,
  rollup,
  focused,
  focusState,
  now,
  quarterStart,
  quarterEnd,
  currentQuarter,
  onChange,
}: CardProps) {
  const setFocus = api.portfolioReview.setWorkspaceFocus.useMutation();
  const [textValue, setTextValue] = useState(focusState.focusText ?? "");

  // Sync local input when external state changes (e.g. toggle off then on).
  useEffect(() => {
    setTextValue(focusState.focusText ?? "");
  }, [focusState.focusText]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistText = (value: string) => {
    setTextValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = { isInFocus: focused, focusText: value || null };
      onChange(next);
      setFocus.mutate({
        workspaceId: workspace.id,
        isInFocus: next.isInFocus,
        focusText: next.focusText,
      });
    }, 500);
  };

  const handleToggle = () => {
    const next = {
      isInFocus: !focused,
      focusText: focusState.focusText,
    };
    onChange(next);
    setFocus.mutate({
      workspaceId: workspace.id,
      isInFocus: next.isInFocus,
      focusText: next.focusText,
    });
  };

  const elapsedPct = quarterElapsedPct(now, quarterStart, quarterEnd);
  const okrCount = rollup?.okrCount ?? 0;
  const counts = rollup?.healthCounts ?? {
    onTrack: 0,
    atRisk: 0,
    offTrack: 0,
    noUpdate: 0,
  };
  const totalKrish = okrCount;

  // Pace = rough placeholder until we have weighted KR progress.
  // For now show "x at risk / off track" as the only flag.
  const offTrack = counts.offTrack;
  const atRisk = counts.atRisk;

  const lastReviewedDays = useMemo(() => {
    const t = rollup?.mostRecentActivity;
    if (!t) return null;
    return daysBetween(now, new Date(t));
  }, [rollup, now]);

  const healthDot = useMemo(() => {
    if (!lastReviewedDays && lastReviewedDays !== 0) return "pr-ws__dot--cold";
    if (lastReviewedDays <= 3) return "pr-ws__dot--ok";
    if (lastReviewedDays <= 10) return "pr-ws__dot--warn";
    return "pr-ws__dot--cold";
  }, [lastReviewedDays]);

  return (
    <div className={focused ? "pr-ws pr-ws--focus" : "pr-ws"}>
      <div className="pr-ws__top">
        <div
          className="pr-ws__glyph"
          style={{ background: workspaceGlyphVar(workspaceIndex) }}
        >
          {workspaceShortName(workspace.name)}
        </div>
        <div className="pr-ws__name">{workspace.name}</div>
        {workspace.type !== "personal" && (
          <div className="pr-ws__role">{workspace.type}</div>
        )}
      </div>

      <div className="pr-ws__stats">
        <div className="pr-ws__stat">
          <strong>{okrCount}</strong> objectives
        </div>
        <div className="pr-ws__stat">
          <strong>{rollup?.activeProjectCount ?? workspace.counts.projects}</strong>{" "}
          projects
        </div>
        <div className="pr-ws__stat">
          <strong>{rollup?.dueActions ?? 0}</strong> due
        </div>
      </div>

      {totalKrish > 0 ? (
        <div className="pr-ws__okr">
          <div className="pr-ws__okr-head">
            <span>
              {currentQuarter} · <strong>{elapsedPct}%</strong> through
            </span>
          </div>
          <ConfidenceStack counts={counts} total={totalKrish} />
          <ConfidenceLegend counts={counts} />
          {(offTrack > 0 || atRisk > 0) && (
            <div className="pr-ws__okr-flag">
              {offTrack > 0
                ? `${offTrack} off track`
                : `${atRisk} at risk`}
            </div>
          )}
        </div>
      ) : (
        <div className="pr-ws__okr">
          <div className="pr-ws__okr-flag pr-ws__okr-flag--info">
            <IconInfoCircle size={11} /> No OKRs set for this quarter
          </div>
        </div>
      )}

      <div className="pr-ws__last">
        <span className={`pr-ws__dot ${healthDot}`} />
        {lastReviewedDays === null
          ? "No recent activity"
          : lastReviewedDays === 0
            ? "Activity today"
            : `Last activity ${lastReviewedDays}d ago`}
      </div>

      {focused && (
        <div className="pr-ws__theme">
          <span className="pr-ws__theme-label">Theme</span>
          <input
            className="pr-ws__theme-input"
            placeholder="What does winning this week look like?"
            value={textValue}
            onChange={(e) => persistText(e.target.value)}
          />
        </div>
      )}

      <div className="pr-ws__actions">
        {focused ? (
          <button
            type="button"
            className="pr-ws-action"
            onClick={handleToggle}
          >
            <IconArchive size={13} /> Mark dormant
          </button>
        ) : (
          <button
            type="button"
            className="pr-ws-action pr-ws-action--primary"
            onClick={handleToggle}
          >
            <IconBolt size={13} /> Bring into focus
          </button>
        )}
      </div>
    </div>
  );
}

// Initial focus state derivation — exported so the client can build the map.
export function buildInitialFocusMap(
  workspaces: ReviewWorkspace[],
  current: ReviewFocus[],
  last: ReviewFocus[],
): Map<string, { isInFocus: boolean; focusText: string | null }> {
  const map = new Map<
    string,
    { isInFocus: boolean; focusText: string | null }
  >();
  for (const ws of workspaces) {
    const existing = current.find((f) => f.workspaceId === ws.id);
    if (existing) {
      map.set(ws.id, {
        isInFocus: existing.isInFocus,
        focusText: existing.focusText,
      });
      continue;
    }
    const lastWeek = last.find((f) => f.workspaceId === ws.id);
    map.set(ws.id, {
      isInFocus: lastWeek?.isInFocus ?? false,
      focusText: null,
    });
  }
  return map;
}

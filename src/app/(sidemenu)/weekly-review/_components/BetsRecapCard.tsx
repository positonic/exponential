"use client";

import { useMemo } from "react";
import { IconBolt, IconAlertCircle } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  workspaceGlyphVar,
  type ReviewData,
  type ReviewWorkspace,
} from "./types";

interface Props {
  data: ReviewData;
  focusedWorkspaces: ReviewWorkspace[];
  /** Map of workspaceId → KR ids the user has bet on this week. */
  bets: Map<string, string[]>;
  /** Map of bet KR id → number of in-list projects linked to it. */
  projectCountByKrId: Map<string, number>;
  /** Currently active filter mode (for highlighting selected bet). */
  activeBetFilter: string | null;
  onSelectBet: (krId: string | null) => void;
}

export function BetsRecapCard({
  data,
  focusedWorkspaces,
  bets,
  projectCountByKrId,
  activeBetFilter,
  onSelectBet,
}: Props) {
  const allBetKrIds = useMemo(() => {
    const ids: string[] = [];
    for (const ws of focusedWorkspaces) {
      const wsBets = bets.get(ws.id) ?? [];
      for (const id of wsBets) ids.push(id);
    }
    return ids;
  }, [bets, focusedWorkspaces]);

  const krsQuery = api.okr.getByIds.useQuery(
    { ids: allBetKrIds },
    { enabled: allBetKrIds.length > 0 },
  );

  if (allBetKrIds.length === 0) return null;

  const krById = new Map(
    (krsQuery.data ?? []).map((k) => [k.id, k] as const),
  );

  return (
    <div className="pr-bets-recap">
      <div className="pr-bets-recap__head">
        <span className="pr-bets-recap__icon">
          <IconBolt size={13} />
        </span>
        <span className="pr-bets-recap__title">Your bets this week</span>
        <span className="pr-bets-recap__count">
          {allBetKrIds.length} bet{allBetKrIds.length === 1 ? "" : "s"}
        </span>
        {activeBetFilter && (
          <button
            type="button"
            className="pr-bets-recap__clear"
            onClick={() => onSelectBet(null)}
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="pr-bets-recap__list">
        {focusedWorkspaces.map((ws) => {
          const wsBets = bets.get(ws.id) ?? [];
          if (wsBets.length === 0) return null;
          const wsIdx = data.workspaces.findIndex((w) => w.id === ws.id);
          return (
            <div key={ws.id} className="pr-bets-recap__group">
              <div className="pr-bets-recap__ws">
                <span
                  className="pr-bets-recap__ws-dot"
                  style={{ background: workspaceGlyphVar(wsIdx) }}
                />
                <span className="pr-bets-recap__ws-name">{ws.name}</span>
              </div>
              {wsBets.map((krId) => {
                const kr = krById.get(krId);
                const linked = projectCountByKrId.get(krId) ?? 0;
                const isActive = activeBetFilter === krId;
                const range =
                  kr && kr.targetValue - kr.startValue > 0
                    ? kr.targetValue - kr.startValue
                    : 0;
                const pct =
                  kr && range > 0
                    ? Math.max(
                        0,
                        Math.min(
                          100,
                          Math.round(
                            ((kr.currentValue - kr.startValue) / range) *
                              100,
                          ),
                        ),
                      )
                    : 0;
                const fillVar =
                  kr?.status === "off-track"
                    ? "var(--pr-off-track)"
                    : kr?.status === "at-risk"
                      ? "var(--pr-at-risk)"
                      : "var(--pr-on-track)";
                return (
                  <button
                    key={krId}
                    type="button"
                    className={
                      isActive
                        ? "pr-bets-recap__row is-active"
                        : "pr-bets-recap__row"
                    }
                    onClick={() => onSelectBet(isActive ? null : krId)}
                    title={
                      linked > 0
                        ? `Filter project list to ${linked} project${linked === 1 ? "" : "s"} linked to this KR`
                        : "No projects link to this bet yet"
                    }
                  >
                    <div className="pr-bets-recap__row-main">
                      <div className="pr-bets-recap__obj">
                        {kr?.goal?.title ?? "Objective"}
                      </div>
                      <div className="pr-bets-recap__kr">
                        {krsQuery.isLoading
                          ? "Loading…"
                          : (kr?.title ?? "Key result not found")}
                      </div>
                    </div>
                    <div className="pr-bets-recap__progress">
                      <div className="pr-bets-recap__bar">
                        <div
                          className="pr-bets-recap__bar-fill"
                          style={{ width: `${pct}%`, background: fillVar }}
                        />
                      </div>
                      <span className="pr-bets-recap__pct">{pct}%</span>
                    </div>
                    <div
                      className={
                        linked === 0
                          ? "pr-bets-recap__linked pr-bets-recap__linked--empty"
                          : "pr-bets-recap__linked"
                      }
                    >
                      {linked === 0 ? (
                        <>
                          <IconAlertCircle size={11} /> 0 projects
                        </>
                      ) : (
                        <>
                          {linked} project{linked === 1 ? "" : "s"}
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

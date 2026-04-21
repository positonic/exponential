/**
 * OkrTimeline
 * Quarter-gantt timeline of Objectives and their Key Results.
 * Pure presentational — no data fetching, no state.
 */

"use client";

import { Fragment } from "react";
import "./OkrTimeline.css";

export type OkrStatus = "ok" | "warn" | "bad" | "idle";

export interface TimelineUser {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface TimelineKr {
  id: string;
  title: string;
  owner: string;
  progress: number;
  currentLabel: string;
  targetLabel: string;
  due: string;
  endFrac?: number;
  startFrac?: number;
  status: OkrStatus;
}

export interface TimelineObjective {
  id: string;
  code: string;
  title: string;
  owner: string;
  coOwners?: string[];
  progress: number;
  status: OkrStatus;
  krs: TimelineKr[];
}

export interface OkrTimelineProps {
  objectives: TimelineObjective[];
  getUser: (id: string) => TimelineUser | undefined;
  weekCount?: number;
  weekLabels?: string[];
  monthStarts?: number[];
  monthLabels?: string[];
  todayFrac?: number;
  dueMap?: Record<string, number>;
  renderHeader?: () => React.ReactNode;
  onObjectiveClick?: (objective: TimelineObjective) => void;
  onKeyResultClick?: (kr: TimelineKr, objective: TimelineObjective) => void;
  className?: string;
}

const DEFAULT_WEEKS = 13;
const DEFAULT_WEEK_LABELS = [
  "W14",
  "W15",
  "W16",
  "W17",
  "W18",
  "W19",
  "W20",
  "W21",
  "W22",
  "W23",
  "W24",
  "W25",
  "W26",
];
const DEFAULT_MONTH_STARTS = [0, 5, 9];
const DEFAULT_MONTH_LABELS = ["Apr", "May", "Jun"];
const DEFAULT_TODAY = 0.61;
const DEFAULT_DUE_MAP: Record<string, number> = {};

const Avatar = ({
  user,
  size = 22,
  title,
}: {
  user?: TimelineUser;
  size?: number;
  title?: string;
}) => {
  const u = user ?? {
    initials: "?",
    color: "var(--color-surface-tertiary)",
    name: "Unknown",
    id: "?",
  };
  return (
    <div
      className="okrt-avatar"
      style={{
        width: size,
        height: size,
        background: u.color,
        fontSize: size * 0.4,
      }}
      title={title ?? u.name}
    >
      {u.initials}
    </div>
  );
};

const OwnerStack = ({
  ids,
  getUser,
}: {
  ids: string[];
  getUser: (id: string) => TimelineUser | undefined;
}) => {
  const shown = ids.slice(0, 3);
  const more = ids.length - shown.length;
  return (
    <div className="okrt-owners">
      {shown.map((id) => (
        <Avatar key={id} user={getUser(id)} size={20} />
      ))}
      {more > 0 && <div className="okrt-owners__more">+{more}</div>}
    </div>
  );
};

const Track = ({
  start,
  end,
  progress,
  status,
  isObj,
  todayFrac,
}: {
  start: number;
  end: number;
  progress: number;
  status: OkrStatus;
  isObj?: boolean;
  todayFrac: number;
}) => {
  const widthPct = Math.max(0, end - start) * 100;
  const fillPct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div className={`okrt-track okrt-track--${status}`}>
      <div
        className="okrt-track__bar"
        style={{ left: `${start * 100}%`, width: `${widthPct}%` }}
      >
        <div className="okrt-track__fill" style={{ width: `${fillPct}%` }}>
          {widthPct > 14 && `${Math.round(progress * 100)}%`}
        </div>
        {progress > 0 && progress < 1 && (
          <div
            className="okrt-track__pace"
            style={{ left: `${fillPct}%` }}
            title="Current pace"
          />
        )}
      </div>
      {isObj && (
        <div className="okrt-today" style={{ left: `${todayFrac * 100}%` }} />
      )}
    </div>
  );
};

export function OkrTimeline({
  objectives,
  getUser,
  weekCount = DEFAULT_WEEKS,
  weekLabels = DEFAULT_WEEK_LABELS,
  monthStarts = DEFAULT_MONTH_STARTS,
  monthLabels = DEFAULT_MONTH_LABELS,
  todayFrac = DEFAULT_TODAY,
  dueMap = DEFAULT_DUE_MAP,
  renderHeader,
  onObjectiveClick,
  onKeyResultClick,
  className = "",
}: OkrTimelineProps) {
  const resolveEnd = (kr: TimelineKr): number => {
    if (typeof kr.endFrac === "number") return kr.endFrac;
    return dueMap[kr.due] ?? 1.0;
  };

  const header = renderHeader ? (
    renderHeader()
  ) : (
    <div className="okrt-head">
      <div className="okrt-legend">
        <span>
          <i className="okrt-dot okrt-dot--ok" /> On track
        </span>
        <span>
          <i className="okrt-dot okrt-dot--warn" /> At risk
        </span>
        <span>
          <i className="okrt-dot okrt-dot--bad" /> Off track
        </span>
        <span>
          <i className="okrt-dot okrt-dot--pace" /> pace dot
        </span>
      </div>
      <div
        className="okrt-weeks"
        style={{ gridTemplateColumns: `repeat(${weekCount}, 1fr)` }}
      >
        {weekLabels.slice(0, weekCount).map((w, i) => {
          const monthIx = monthStarts.indexOf(i);
          return (
            <div
              key={i}
              className={`okrt-week ${monthIx >= 0 ? "okrt-week--month" : ""}`}
            >
              {monthIx >= 0 ? monthLabels[monthIx] : w}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={`okrt ${className}`}>
      {header}

      {objectives.map((obj) => (
        <Fragment key={obj.id}>
          <div
            className="okrt-row okrt-row--obj"
            onClick={onObjectiveClick ? () => onObjectiveClick(obj) : undefined}
            style={onObjectiveClick ? { cursor: "pointer" } : undefined}
          >
            <div className="okrt-label">
              <div className="okrt-label__code">{obj.code}</div>
              <div className="okrt-label__title">{obj.title}</div>
              <div className="okrt-label__meta">
                <OwnerStack
                  ids={[obj.owner, ...(obj.coOwners ?? [])]}
                  getUser={getUser}
                />
                <span>
                  {Math.round(obj.progress * 100)}% · {obj.krs.length} KRs
                </span>
              </div>
            </div>
            <Track
              start={0}
              end={1.0}
              progress={obj.progress}
              status={obj.status}
              isObj
              todayFrac={todayFrac}
            />
          </div>

          {obj.krs.map((kr) => (
            <div
              key={kr.id}
              className="okrt-row"
              onClick={
                onKeyResultClick ? () => onKeyResultClick(kr, obj) : undefined
              }
              style={onKeyResultClick ? { cursor: "pointer" } : undefined}
            >
              <div className="okrt-label okrt-label--kr">
                <div className="okrt-label__title">
                  <span className="okrt-label__kr-code">{kr.id}</span>
                  {kr.title}
                </div>
                <div className="okrt-label__meta">
                  <Avatar user={getUser(kr.owner)} size={18} />
                  <span>
                    {kr.currentLabel} / {kr.targetLabel}
                  </span>
                  <span>· due {kr.due}</span>
                </div>
              </div>
              <Track
                start={kr.startFrac ?? 0.05}
                end={resolveEnd(kr)}
                progress={kr.progress}
                status={kr.status}
                todayFrac={todayFrac}
              />
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

export default OkrTimeline;

"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  IconArrowAutofitWidth,
  IconCode,
  IconMicrophone,
  IconPencil,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import {
  MAX_PX_PER_DAY,
  MIN_PX_PER_DAY,
  fitPxPerDay,
  layoutTimeline,
  timelineRange,
  type DecisionGraph,
  type GraphEdge,
  type GraphLane,
  type PlacedNode,
} from "~/lib/decision-graph";
import type { LogSource, LogStatus } from "~/lib/decision-log";
import "./decision-timeline.css";

/**
 * The Decision Log as a timeline: time runs left to right on a sticky
 * month axis, one horizontal lane per repository (ADRs) or ceremony /
 * project / workspace bucket (Decisions), cards packed into rows where
 * they would overlap, and the same edges as the network view drawn between
 * cards — SUPERSEDES solid, MENTIONS dashed, FORMALISED (Decision → ADR)
 * dotted. Undated decisions sit in a "No date" column after the axis.
 * Hovering a card lights its edges and the cards on the other end. Fit,
 * zoom in and zoom out change the day scale; the layout itself is pure
 * (see ~/lib/decision-graph).
 */

const HEAD_W = 200;
const AXIS_H = 36;
const CARD_W = 196;
const CARD_H = 56;
const CARD_GAP = 12;
const ROW_GAP = 8;
const LANE_PAD = 10;
const UNDATED_GAP = 36;
const ZOOM_STEP = 1.5;

const STATUS_CLASS: Record<LogStatus, string> = {
  ACCEPTED: "accepted",
  SUPERSEDED: "superseded",
  PROPOSED: "proposed",
  OPEN: "open",
  DEPRECATED: "deprecated",
  UNKNOWN: "unknown",
};

const LANE_KIND_LABEL: Record<GraphLane["kind"], string> = {
  repository: "Repository",
  ceremony: "Ceremony",
  project: "Project",
  workspace: "Workspace",
};

const SOURCE_ICON: Record<LogSource, React.ReactNode> = {
  code: <IconCode size={11} stroke={1.75} />,
  meeting: <IconMicrophone size={11} stroke={1.75} />,
  manual: <IconPencil size={11} stroke={1.75} />,
};

function formatCardDate(date: Date | string | null): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** `owner/name` → de-emphasised owner prefix + name (as in the index). */
function LaneName({ lane }: { lane: GraphLane }) {
  if (lane.kind !== "repository") {
    return <span className="dtl__lane-name">{lane.name}</span>;
  }
  const slash = lane.name.indexOf("/");
  return (
    <span className="dtl__lane-name dtl__lane-name--repo">
      {slash === -1 ? (
        lane.name
      ) : (
        <>
          <em>{lane.name.slice(0, slash + 1)}</em>
          {lane.name.slice(slash + 1)}
        </>
      )}
    </span>
  );
}

/**
 * A cubic path from one card to another. Left/right when the cards are
 * apart on the x axis (bowing over the row when they share one, so the
 * curve clears the cards between), vertical when they overlap in x.
 */
function edgePath(from: PlacedNode, to: PlacedNode): string {
  const a = { l: from.x, r: from.x + CARD_W, cx: from.x + CARD_W / 2, cy: from.y + CARD_H / 2, t: from.y, b: from.y + CARD_H };
  const b = { l: to.x, r: to.x + CARD_W, cx: to.x + CARD_W / 2, cy: to.y + CARD_H / 2, t: to.y, b: to.y + CARD_H };
  const sameRow = from.y === to.y;
  if (b.l >= a.r) {
    const dx = Math.max(32, (b.l - a.r) / 2);
    const lift = sameRow ? CARD_H * 0.9 : 0;
    return `M ${a.r} ${a.cy} C ${a.r + dx} ${a.cy - lift}, ${b.l - dx} ${b.cy - lift}, ${b.l} ${b.cy}`;
  }
  if (b.r <= a.l) {
    const dx = Math.max(32, (a.l - b.r) / 2);
    const lift = sameRow ? CARD_H * 0.9 : 0;
    return `M ${a.l} ${a.cy} C ${a.l - dx} ${a.cy - lift}, ${b.r + dx} ${b.cy - lift}, ${b.r} ${b.cy}`;
  }
  const down = b.t >= a.b;
  const y1 = down ? a.b : a.t;
  const y2 = down ? b.t : b.b;
  const dy = Math.max(24, Math.abs(y2 - y1) / 2) * (down ? 1 : -1);
  return `M ${a.cx} ${y1} C ${a.cx} ${y1 + dy}, ${b.cx} ${y2 - dy}, ${b.cx} ${y2}`;
}

interface Props {
  graph: DecisionGraph;
}

export function DecisionTimeline({ graph }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // null = fit the dated range to the viewport; a number = an explicit scale.
  const [pxPerDay, setPxPerDay] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [hot, setHot] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const range = useMemo(() => timelineRange(graph.nodes), [graph.nodes]);
  const hasUndated = useMemo(() => graph.nodes.some((n) => !n.decidedAt), [graph.nodes]);

  const fitted = useMemo(() => {
    const undatedRoom = hasUndated ? UNDATED_GAP + CARD_W + CARD_GAP * 2 : 0;
    const available = viewportWidth - HEAD_W - undatedRoom - 24;
    return fitPxPerDay(range, available, CARD_W);
  }, [range, viewportWidth, hasUndated]);

  const scale = pxPerDay ?? fitted;

  const layout = useMemo(
    () =>
      layoutTimeline(graph, {
        pxPerDay: scale,
        cardWidth: CARD_W,
        cardHeight: CARD_H,
        cardGap: CARD_GAP,
        rowGap: ROW_GAP,
        lanePadding: LANE_PAD,
        undatedGap: UNDATED_GAP,
      }),
    [graph, scale],
  );

  const placedById = useMemo(
    () => new Map(layout.nodes.map((p) => [p.node.id, p])),
    [layout.nodes],
  );

  // Keep the point under the viewport's centre in place across a zoom.
  const pendingCentre = useRef<number | null>(null);
  const zoom = (factor: number) => {
    const el = scrollRef.current;
    if (el) {
      const centre = el.scrollLeft + el.clientWidth / 2 - HEAD_W;
      pendingCentre.current = centre / scale;
    }
    setPxPerDay(Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, scale * factor)));
  };
  useEffect(() => {
    const el = scrollRef.current;
    const days = pendingCentre.current;
    if (!el || days === null) return;
    pendingCentre.current = null;
    el.scrollLeft = days * scale - el.clientWidth / 2 + HEAD_W;
  }, [scale]);

  const linked = useMemo(() => {
    if (!hot) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graph.edges) {
      if (e.fromId === hot) ids.add(e.toId);
      if (e.toId === hot) ids.add(e.fromId);
    }
    return ids;
  }, [graph.edges, hot]);

  const isHotEdge = (e: GraphEdge) => hot !== null && (e.fromId === hot || e.toId === hot);

  const contentWidth = HEAD_W + layout.width + 24;
  const contentHeight = AXIS_H + layout.height;

  return (
    <div className="dtl-wrap">
      <div
        ref={scrollRef}
        className={`dtl${hot ? " is-focused" : ""}`}
        role="figure"
        aria-label="Decision timeline"
      >
        <div className="dtl__content" style={{ width: contentWidth, height: contentHeight }}>
          <div className="dtl__axis" style={{ width: contentWidth }}>
            <div className="dtl__corner" style={{ width: HEAD_W }}>
              {layout.range ? "Decided" : "Lanes"}
            </div>
            {layout.ticks.map((tick) => (
              <span
                key={tick.x}
                className={`dtl__tick${tick.major ? " dtl__tick--major" : ""}`}
                style={{ left: HEAD_W + tick.x }}
              >
                {tick.label}
              </span>
            ))}
            {layout.todayX !== null ? (
              <span className="dtl__axis-today" style={{ left: HEAD_W + layout.todayX }}>
                Today
              </span>
            ) : null}
            {layout.undated ? (
              <span
                className="dtl__axis-undated"
                style={{ left: HEAD_W + layout.undated.x + CARD_GAP }}
              >
                No date
              </span>
            ) : null}
          </div>

          <div className="dtl__body" style={{ height: layout.height }}>
            <svg
              className="dtl__svg"
              style={{ left: HEAD_W, width: layout.width, height: layout.height }}
              width={layout.width}
              height={layout.height}
              aria-hidden
            >
              <defs>
                {(["SUPERSEDES", "MENTIONS", "FORMALISED"] as const).map((type) => (
                  <marker
                    key={type}
                    id={`dtl-arrow-${type}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" className={`dtl__arrow--${type}`} />
                  </marker>
                ))}
              </defs>
              {layout.lanes.map((lane, i) => (
                <g key={lane.lane.key}>
                  <rect
                    x={-HEAD_W}
                    y={lane.y}
                    width={layout.width + HEAD_W + 24}
                    height={lane.height}
                    className={`dtl__band${i % 2 === 1 ? " dtl__band--alt" : ""}`}
                  />
                  <line
                    x1={-HEAD_W}
                    x2={layout.width + 24}
                    y1={lane.y + lane.height - 0.5}
                    y2={lane.y + lane.height - 0.5}
                    className="dtl__lane-rule"
                  />
                </g>
              ))}
              {layout.ticks.map((tick) => (
                <line
                  key={tick.x}
                  x1={tick.x + 0.5}
                  x2={tick.x + 0.5}
                  y1={0}
                  y2={layout.height}
                  className={`dtl__grid${tick.major ? " dtl__grid--major" : ""}`}
                />
              ))}
              {layout.undated ? (
                <line
                  x1={layout.undated.x + 0.5}
                  x2={layout.undated.x + 0.5}
                  y1={0}
                  y2={layout.height}
                  className="dtl__undated-rule"
                />
              ) : null}
              {layout.todayX !== null ? (
                <line
                  x1={layout.todayX + 0.5}
                  x2={layout.todayX + 0.5}
                  y1={0}
                  y2={layout.height}
                  className="dtl__today"
                />
              ) : null}
              {graph.edges.map((edge) => {
                const from = placedById.get(edge.fromId);
                const to = placedById.get(edge.toId);
                if (!from || !to) return null;
                return (
                  <path
                    key={edge.id}
                    d={edgePath(from, to)}
                    className={`dtl__edge dtl__edge--${edge.type}${isHotEdge(edge) ? " is-hot" : ""}`}
                    markerEnd={`url(#dtl-arrow-${edge.type})`}
                  />
                );
              })}
            </svg>

            {layout.lanes.map((lane) => (
              <div
                key={lane.lane.key}
                className="dtl__lane"
                style={{ top: lane.y, height: lane.height }}
              >
                <div className="dtl__lane-head" style={{ width: HEAD_W }}>
                  <LaneName lane={lane.lane} />
                  <span className="dtl__lane-meta">
                    <span className="dtl__lane-kind">{LANE_KIND_LABEL[lane.lane.kind]}</span>
                    <span className="dtl__lane-n">{lane.count}</span>
                  </span>
                </div>
              </div>
            ))}

            {layout.nodes.map((p) => {
              const date = formatCardDate(p.node.decidedAt);
              const statusClass = STATUS_CLASS[p.node.status];
              return (
                <Link
                  key={p.node.id}
                  href={p.node.href}
                  className={`dtl__card dtl__card--${statusClass} dtl__card--${p.node.kind}${
                    p.dated ? "" : " dtl__card--undated"
                  }${linked.has(p.node.id) ? " is-linked" : ""}`}
                  style={{ left: HEAD_W + p.x, top: p.y, width: CARD_W, height: CARD_H }}
                  title={`${p.node.label ?? ""} ${p.node.title}`.trim()}
                  onMouseEnter={() => setHot(p.node.id)}
                  onMouseLeave={() => setHot((h) => (h === p.node.id ? null : h))}
                  onFocus={() => setHot(p.node.id)}
                  onBlur={() => setHot((h) => (h === p.node.id ? null : h))}
                  data-kind={p.node.kind}
                >
                  <span className="dtl__card-top">
                    <span className={`dot dot--${statusClass}`} />
                    <span className="dtl__card-label">{p.node.label ?? "—"}</span>
                    <span className="dtl__card-src" aria-hidden>
                      {SOURCE_ICON[p.node.source]}
                    </span>
                    {date ? <span className="dtl__card-date">{date}</span> : null}
                  </span>
                  <span className="dtl__card-title">{p.node.title.replace(/`/g, "")}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="dtl__controls" role="group" aria-label="Timeline zoom">
        <button
          type="button"
          onClick={() => zoom(1 / ZOOM_STEP)}
          disabled={!layout.range || scale <= MIN_PX_PER_DAY}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <IconZoomOut size={15} stroke={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setPxPerDay(null)}
          disabled={!layout.range || pxPerDay === null}
          aria-label="Fit to width"
          title="Fit to width"
        >
          <IconArrowAutofitWidth size={15} stroke={1.75} />
        </button>
        <button
          type="button"
          onClick={() => zoom(ZOOM_STEP)}
          disabled={!layout.range || scale >= MAX_PX_PER_DAY}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <IconZoomIn size={15} stroke={1.75} />
        </button>
      </div>
    </div>
  );
}

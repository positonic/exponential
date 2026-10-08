"use client";

import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@mantine/core";
import { IconCheck, IconCopy, IconSparkles } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  buildMarkdown,
  splitBold,
  formatDay,
  pathStatusLine,
  riskLabel,
  type ManagerOverviewData,
} from "./managerFormat";

type Burnup = NonNullable<NonNullable<ManagerOverviewData["cycle"]>["burnup"]>;

function Inline({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((p, i) =>
        p.bold ? (
          <span key={i} className="mo-summary__strong">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function SummaryCard({
  data,
  productId,
  productName,
}: {
  data: ManagerOverviewData;
  productId: string;
  productName: string;
}) {
  const [copied, setCopied] = useState(false);
  const summaryQ = api.product.product.getOverviewSummary.useQuery(
    { productId },
    { staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 },
  );
  const ai = summaryQ.data ?? null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown(data, productName, ai));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); no-op.
    }
  };

  return (
    <section className="mo-card">
      <header className="mo-card__head">
        <span className="mo-label">
          <IconSparkles size={15} className="mo-label__sparkle" />
          Summary
        </span>
        <span className="mo-card__window">Last {data.windowDays} days</span>
        <button type="button" className="mo-copy" onClick={() => void copy()}>
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          {copied ? "Copied" : "Copy as Markdown"}
        </button>
      </header>
      {summaryQ.isLoading ? (
        <div className="mo-summary" aria-busy="true" aria-label="Writing summary">
          <Skeleton height={13} width="92%" mt={6} />
          <Skeleton height={13} width="64%" mt={12} />
        </div>
      ) : ai ? (
        <p className="mo-summary">
          <Inline text={ai.summary} />
          {ai.risk && (
            <>
              {" "}
              <span className="mo-summary__risk">One risk:</span> <Inline text={ai.risk} />
            </>
          )}
        </p>
      ) : (
        <p className="mo-empty">The summary couldn&apos;t be written right now.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Burn-up
// ---------------------------------------------------------------------------

const W = 600;
const H = 190;

function BurnupChart({
  burnup,
  startLabel,
  endLabel,
}: {
  burnup: Burnup;
  startLabel: string;
  endLabel: string;
}) {
  const last = burnup.totalDays - 1;
  const today = burnup.points.length - 1;
  const maxY = Math.max(1, ...burnup.points.map((p) => p.scope), burnup.scopeNow) * 1.08;
  const x = (day: number) => (last === 0 ? 0 : (Math.min(day, last) / last) * W);
  const y = (v: number) => H - (v / maxY) * H;

  const done = burnup.points.map((p) => `${x(p.day)},${y(p.done)}`).join(" ");
  const scopeSteps = burnup.points
    .map((p, i) => {
      const prev = burnup.points[i - 1];
      return prev && prev.scope !== p.scope
        ? `${x(p.day)},${y(prev.scope)} ${x(p.day)},${y(p.scope)}`
        : `${x(p.day)},${y(p.scope)}`;
    })
    .join(" ");
  const scope = `${scopeSteps} ${x(last)},${y(burnup.scopeNow)}`;

  let projection: string | null = null;
  if (burnup.projectedFinishDay !== null && burnup.doneNow < burnup.scopeNow) {
    const endDay = Math.min(burnup.projectedFinishDay, last);
    const rate =
      (burnup.scopeNow - burnup.doneNow) / Math.max(0.0001, burnup.projectedFinishDay - today);
    projection = `${x(today)},${y(burnup.doneNow)} ${x(endDay)},${y(
      Math.min(burnup.scopeNow, burnup.doneNow + rate * (endDay - today)),
    )}`;
  }

  return (
    <div className="mo-burnup">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mo-burnup__svg" role="img" aria-label="Cycle burn-up chart">
        <polygon
          className="mo-burnup__area"
          points={`${x(0)},${H} ${done} ${x(today)},${H}`}
        />
        <polyline className="mo-burnup__scope" points={scope} vectorEffect="non-scaling-stroke" />
        <line
          className="mo-burnup__ideal"
          x1={x(0)} y1={y(0)} x2={x(last)} y2={y(burnup.scopeNow)}
          vectorEffect="non-scaling-stroke"
        />
        {projection && (
          <polyline className="mo-burnup__projected" points={projection} vectorEffect="non-scaling-stroke" />
        )}
        <polyline className="mo-burnup__done" points={done} vectorEffect="non-scaling-stroke" />
        <line
          className="mo-burnup__today"
          x1={x(today)} y1={0} x2={x(today)} y2={H}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mo-burnup__axis">
        <span>{startLabel}</span>
        <span className="mo-burnup__todaylabel" style={{ left: `${(x(today) / W) * 100}%` }}>
          today
        </span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

export function BurnupCard({ cycle }: { cycle: NonNullable<ManagerOverviewData["cycle"]> }) {
  const b = cycle.burnup;
  if (!b) {
    return (
      <section className="mo-card mo-card--burnup">
        <span className="mo-label">{cycle.name}</span>
        <p className="mo-empty">This cycle has no start or end date, so there is no burn-up to draw.</p>
      </section>
    );
  }
  const early = b.projectedDaysEarly;
  const projectedDate =
    b.projectedFinishDay !== null && cycle.startDate
      ? formatDay(new Date(new Date(cycle.startDate).getTime() + Math.round(b.projectedFinishDay) * 86_400_000))
      : null;
  const meetsRate = b.actualPerDay >= b.neededPerDay;

  return (
    <section className="mo-card mo-card--burnup">
      <header className="mo-card__head">
        <span className="mo-label">
          {cycle.name} · Day {b.dayNumber} of {b.totalDays}
        </span>
        {projectedDate && early !== null && (
          <span className={`mo-projection ${early >= 0 ? "is-ahead" : "is-behind"}`}>
            Projected to finish {projectedDate}
            {early !== 0 && ` · ${Math.abs(early)} day${Math.abs(early) === 1 ? "" : "s"} ${early > 0 ? "early" : "late"}`}
          </span>
        )}
      </header>
      <div className="mo-hero">
        <span className="mo-hero__num">{b.doneNow}</span>
        <span className="mo-hero__of"> / {b.scopeNow}</span>
        <span className="mo-hero__note">tickets done · ideal today {b.idealToday}</span>
      </div>
      <BurnupChart
        burnup={b}
        startLabel={cycle.startDate ? formatDay(cycle.startDate) : ""}
        endLabel={cycle.endDate ? formatDay(cycle.endDate) : ""}
      />
      <footer className="mo-burnup__stats">
        <span><strong>+{b.addedMidCycle}</strong> added mid-cycle</span>
        <span>
          <strong>{b.neededPerDay}</strong> tickets/day needed vs{" "}
          <strong className={meetsRate ? "is-good" : undefined}>{b.actualPerDay}</strong> actual
        </span>
      </footer>
    </section>
  );
}

export function WeeklyCard({ weekly }: { weekly: ManagerOverviewData["weekly"] }) {
  const max = Math.max(1, ...weekly.map((w) => w.count));
  const total = weekly.slice(-2).reduce((s, w) => s + w.count, 0);
  return (
    <section className="mo-card mo-card--burnup">
      <header className="mo-card__head">
        <span className="mo-label">Completed tickets · last 12 weeks</span>
      </header>
      <div className="mo-hero">
        <span className="mo-hero__num">{total}</span>
        <span className="mo-hero__note">completed in the last 2 weeks · no active cycle</span>
      </div>
      <div className="mo-weekly">
        {weekly.map((w) => (
          <div key={String(w.weekStart)} className="mo-weekly__col" title={`Week of ${formatDay(w.weekStart)}: ${w.count}`}>
            <div className="mo-weekly__bar" style={{ height: `${(w.count / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mo-burnup__dates">
        <span>{weekly[0] ? formatDay(weekly[0].weekStart) : ""}</span>
        <span>this week</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// At risk + critical path
// ---------------------------------------------------------------------------

export function AtRiskCard({ items, basePath }: { items: ManagerOverviewData["atRisk"]; basePath: string }) {
  return (
    <section className="mo-card">
      <header className="mo-card__head">
        <span className="mo-label">At risk this cycle</span>
      </header>
      {items.length === 0 ? (
        <p className="mo-empty">Nothing blocked, unassigned or waiting on review.</p>
      ) : (
        <ul className="mo-list">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`${basePath}/tickets/${r.urlId}`} className="mo-row">
                <span className="mo-id">{r.displayId}</span>
                <span className="mo-row__title">{r.title}</span>
                <span className={`mo-pill ${r.reason.kind === "blocked" ? "is-red" : "is-amber"}`}>
                  {riskLabel(r)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CriticalPathCard({
  nodes,
  hasDeps,
  basePath,
}: {
  nodes: ManagerOverviewData["criticalPath"];
  hasDeps: boolean;
  basePath: string;
}) {
  return (
    <section className="mo-card">
      <header className="mo-card__head">
        <span className="mo-label">Critical path</span>
      </header>
      {nodes.length === 0 ? (
        <p className="mo-empty">
          {hasDeps
            ? "No chain of two or more open tickets blocks this work."
            : "No ticket here has a \"blocked by\" link yet. Add dependencies on tickets to see the critical path."}
        </p>
      ) : (
        <ol className="mo-path">
          {nodes.map((n) => (
            <li key={n.id} className={`mo-path__node is-${n.kind}`}>
              <span className="mo-path__dot" />
              <Link href={`${basePath}/tickets/${n.urlId}`} className="mo-path__body">
                <span className="mo-path__title">
                  <span className="mo-id">{n.displayId}</span> {n.title}
                </span>
                <span className="mo-path__status">{pathStatusLine(n)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

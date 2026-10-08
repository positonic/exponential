"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import {
  STAGE_LABEL,
  STAGE_NOUN,
  ageBucket,
  formatDuration,
  type ManagerOverviewData,
} from "./managerFormat";

export function BottleneckCallout({ bottleneck }: { bottleneck: ManagerOverviewData["bottleneck"] }) {
  if (!bottleneck) return null;
  const noun = STAGE_NOUN[bottleneck.stage] ?? STAGE_LABEL[bottleneck.stage];
  return (
    <div className="mo-callout" role="status">
      <IconAlertTriangle size={17} className="mo-callout__icon" />
      <p>
        <strong>{noun} is the bottleneck.</strong> {bottleneck.count} tickets wait{" "}
        {formatDuration(bottleneck.avgAgeMs)} on average
        {bottleneck.agentCount > 0
          ? `; ${bottleneck.agentCount} of them ${bottleneck.agentCount === 1 ? "is" : "are"} agent work.`
          : "."}
      </p>
    </div>
  );
}

export function StageTiles({
  stages,
  bottleneckStage,
}: {
  stages: ManagerOverviewData["stages"];
  bottleneckStage: string | null;
}) {
  return (
    <>
      <div className="mo-stages">
        {stages.map((s) => (
          <div
            key={s.key}
            className={`mo-stage is-${s.key}${s.key === bottleneckStage ? " is-bottleneck" : ""}`}
          >
            <span className="mo-stage__name">
              <span className="mo-stage__swatch" />
              {STAGE_LABEL[s.key]}
            </span>
            <span className="mo-stage__count">{s.count}</span>
            <span className="mo-stage__avg">
              {s.key === "deployed"
                ? "live in production"
                : s.count
                  ? `avg ${formatDuration(s.avgAgeMs)} in stage`
                  : "empty"}
            </span>
            <span className="mo-stage__dots">
              {s.key === "deployed"
                ? Array.from({ length: s.count }, (_, i) => (
                    <span key={i} className="mo-dot is-fresh" />
                  ))
                : s.agesMs.map((age, i) => (
                    <span
                      key={i}
                      className={`mo-dot is-${ageBucket(age)}`}
                      title={formatDuration(age)}
                    />
                  ))}
            </span>
          </div>
        ))}
      </div>
      <div className="mo-age-legend">
        Ticket age in stage:
        <span><span className="mo-dot is-fresh" /> &lt; 1d</span>
        <span><span className="mo-dot is-aging" /> 1–3d</span>
        <span><span className="mo-dot is-old" /> &gt; 3d</span>
      </div>
    </>
  );
}

export function WaitingOnCard({ waitingOn }: { waitingOn: ManagerOverviewData["waitingOn"] }) {
  const total = waitingOn.people + waitingOn.agents + waitingOn.blocked;
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <section className="mo-card">
      <header className="mo-card__head">
        <span className="mo-label">Waiting on</span>
      </header>
      {total === 0 ? (
        <p className="mo-empty">Nothing is waiting.</p>
      ) : (
        <>
          <div className="mo-stack" aria-hidden>
            <span className="is-people" style={{ width: pct(waitingOn.people) }} />
            <span className="is-agents" style={{ width: pct(waitingOn.agents) }} />
            <span className="is-blocked" style={{ width: pct(waitingOn.blocked) }} />
          </div>
          <div className="mo-stack__legend">
            <span><strong>{waitingOn.people}</strong> on people (review)</span>
            <span><strong>{waitingOn.agents}</strong> on agents (building)</span>
            <span><strong>{waitingOn.blocked}</strong> blocked</span>
          </div>
        </>
      )}
    </section>
  );
}

export function WipCard({
  wip,
  stages,
}: {
  wip: ManagerOverviewData["wip"];
  stages: ManagerOverviewData["stages"];
}) {
  const count = (key: string) => stages.find((s) => s.key === key)?.count ?? 0;
  const waiting = count("inReview");
  const building = count("inProgress");
  const perPerson = wip.activeHumans ? Math.round((wip.count / wip.activeHumans) * 10) / 10 : null;
  const advice =
    wip.count === 0
      ? "Nothing is in flight."
      : waiting > building
        ? `Finish before starting: ${waiting} tickets wait in review, more than the ${building} being built.`
        : "More work is being built than waiting for review, so flow is moving.";
  return (
    <section className="mo-card">
      <header className="mo-card__head">
        <span className="mo-label">Work in progress</span>
      </header>
      <div className="mo-wip">
        <span className="mo-wip__num">{wip.count}</span>
        <span className="mo-wip__note">
          in flight{perPerson !== null ? ` · ${perPerson} per person` : ""}
        </span>
      </div>
      <p className="mo-wip__advice">{advice}</p>
    </section>
  );
}

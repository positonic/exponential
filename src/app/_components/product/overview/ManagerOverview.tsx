"use client";

import type { ReactNode } from "react";
import {
  AtRiskCard,
  BurnupCard,
  CriticalPathCard,
  SummaryCard,
  WeeklyCard,
} from "./CycleSection";
import { BottleneckCallout, StageTiles, WaitingOnCard, WipCard } from "./FlowSection";
import { PrsWaitingCard, WhoIsWorkingCard } from "./TeamSection";
import { formatDay, type ManagerOverviewData } from "./managerFormat";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mo-group">
      <h2 className="mo-group__title">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Manager view of the product Overview tab: will we hit the cycle, where does
 * work get stuck, and who is doing what. Data: `product.getManagerOverview`.
 */
export function ManagerOverview({
  data,
  productId,
  productName,
  basePath,
}: {
  data: ManagerOverviewData;
  productId: string;
  productName: string;
  basePath: string;
}) {
  const { cycle } = data;
  const note = cycle
    ? [
        cycle.name,
        cycle.startDate && cycle.endDate
          ? `${formatDay(cycle.startDate)} – ${formatDay(cycle.endDate)}`
          : null,
        `numbers cover the last ${data.windowDays} days`,
      ]
        .filter(Boolean)
        .join(" · ")
    : `No active cycle · numbers cover the last ${data.windowDays} days`;

  return (
    <div className="mo-page">
      <div className="mo-header">
        <h1 className="mo-header__title">Overview</h1>
        <span className="mo-header__note">{note}</span>
      </div>

      <Group title={cycle ? "Cycle" : "Delivery"}>
        <SummaryCard data={data} productId={productId} productName={productName} />
        <div className="mo-cockpit">
          <div className="mo-cockpit__main">
            {cycle ? <BurnupCard cycle={cycle} /> : <WeeklyCard weekly={data.weekly} />}
          </div>
          <div className="mo-cockpit__side">
            {cycle && <AtRiskCard items={data.atRisk} basePath={basePath} />}
            <CriticalPathCard
              nodes={data.criticalPath}
              hasDeps={data.criticalPathHasDeps}
              basePath={basePath}
            />
          </div>
        </div>
      </Group>

      <Group title="Flow">
        <BottleneckCallout bottleneck={data.bottleneck} />
        <StageTiles stages={data.stages} bottleneckStage={data.bottleneck?.stage ?? null} />
        <div className="mo-two">
          <WaitingOnCard waitingOn={data.waitingOn} />
          <WipCard wip={data.wip} stages={data.stages} />
        </div>
      </Group>

      <Group title="Team">
        <WhoIsWorkingCard team={data.team} basePath={basePath} />
        <PrsWaitingCard prs={data.prs} basePath={basePath} />
      </Group>
    </div>
  );
}

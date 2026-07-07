"use client";

import Link from "next/link";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import { Button } from "@mantine/core";
import { STATUS_LABELS } from "~/lib/ticket-statuses";
import {
  statusCss,
  ticketDisplayId,
  type OverviewProduct,
  type ProductOverviewData,
} from "./overviewShared";

const DAY = 24 * 60 * 60 * 1000;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

interface CycleHeroProps {
  cycle: ProductOverviewData["cycle"];
  product: OverviewProduct;
  basePath: string;
}

function EmptyHero({
  title,
  sub,
  cta,
  href,
}: {
  title: string;
  sub: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="po-hero is-empty">
      <div className="po-hero-empty">
        <div className="po-hero-empty__icon">
          <IconRefresh size={22} />
        </div>
        <div className="po-hero-empty__body">
          <div className="po-hero-empty__title">{title}</div>
          <div className="po-hero-empty__sub">{sub}</div>
        </div>
        <Button
          component={Link}
          href={href}
          leftSection={<IconPlus size={14} />}
          size="xs"
        >
          {cta}
        </Button>
      </div>
    </div>
  );
}

export function CycleHero({ cycle, product, basePath }: CycleHeroProps) {
  if (!cycle) {
    return (
      <EmptyHero
        title="No active cycle"
        sub="Plan a cycle to time-box the next stretch of work and track burn against it."
        cta="Plan a cycle"
        href={`${basePath}/cycles/new`}
      />
    );
  }

  if (cycle.committed === 0) {
    return (
      <EmptyHero
        title={`${cycle.name} has no tickets from ${product.name}`}
        sub="Commit tickets to the current cycle to start tracking progress here."
        cta="Open backlog"
        href={`${basePath}/tickets`}
      />
    );
  }

  const now = Date.now();
  const end = cycle.endDate ? new Date(cycle.endDate).getTime() : null;
  const start = cycle.startDate ? new Date(cycle.startDate).getTime() : null;

  const daysLeft = end !== null ? Math.ceil((end - now) / DAY) : null;
  const over = daysLeft !== null && daysLeft < 0;

  const donePct = clamp((cycle.completed / cycle.committed) * 100, 0, 100);
  const progPct = clamp(
    ((cycle.completed + cycle.inProgress) / cycle.committed) * 100,
    0,
    100,
  );
  const timePct =
    start !== null && end !== null && end > start
      ? clamp(((now - start) / (end - start)) * 100, 0, 100)
      : null;

  const pace =
    timePct === null
      ? null
      : donePct >= timePct + 15
        ? "ahead"
        : donePct + 1 >= timePct
          ? "ontrack"
          : "behind";
  const paceLabel =
    pace === "ahead" ? "Ahead" : pace === "behind" ? "Behind pace" : "On pace";

  const dateFmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  const range =
    cycle.startDate && cycle.endDate
      ? `${dateFmt.format(new Date(cycle.startDate))} – ${dateFmt.format(new Date(cycle.endDate))}`
      : null;

  const unit = cycle.usesPoints ? "pts" : "tickets";

  return (
    <Link
      className="po-hero"
      href={`${basePath}/cycles/${cycle.id}`}
      aria-label={`Open cycle ${cycle.name}`}
    >
      <div className="po-hero__top">
        <div>
          <div className="po-hero__eyebrow">
            <span className="po-hero__dot" /> Current cycle
          </div>
          <div className="po-hero__name">{cycle.name}</div>
          {range && <div className="po-hero__dates">{range}</div>}
        </div>
        {daysLeft !== null && (
          <div className="po-hero__countdown">
            <div className={`po-hero__days ${over ? "is-over" : ""}`}>
              {Math.abs(daysLeft)}
            </div>
            <div className="po-hero__days-unit">
              {over ? "days over" : "days left"}
            </div>
          </div>
        )}
      </div>

      <div className="po-viz">
        <div className="po-viz__stat">
          <span className="po-viz__num">
            {cycle.completed}
            <em>
              {" "}
              / {cycle.committed} {unit} done
            </em>
          </span>
          {pace && (
            <span className={`po-viz__pace po-viz__pace--${pace}`}>
              {paceLabel}
            </span>
          )}
        </div>
        <div className="po-track">
          <div
            className="po-track__prog"
            style={{
              left: `${donePct}%`,
              width: `${Math.max(0, progPct - donePct)}%`,
            }}
          />
          <div className="po-track__done" style={{ width: `${donePct}%` }} />
          {timePct !== null && (
            <div
              className="po-track__now"
              style={{ left: `${timePct}%` }}
              title={`${Math.round(timePct)}% of time elapsed`}
            />
          )}
        </div>
        <div className="po-viz__legend">
          <span>
            <i className="po-lg-done" /> Completed
          </span>
          <span>
            <i className="po-lg-prog" /> In progress
          </span>
          {timePct !== null && (
            <span>
              <i className="po-lg-now" /> Time elapsed · {Math.round(timePct)}%
            </span>
          )}
        </div>
      </div>

      {cycle.statusCounts.length > 0 && (
        <div className="po-hero__chips">
          {cycle.statusCounts.map((s) => (
            <span className="po-chip" key={s.status}>
              <span
                className="po-chip__dot"
                style={{ background: statusCss(s.status) }}
              />
              {STATUS_LABELS[s.status] ?? s.status} <b>{s.count}</b>
            </span>
          ))}
        </div>
      )}

      {cycle.myTickets.length > 0 && (
        <div className="po-mine">
          <div className="po-mine__label">Your tickets in this cycle</div>
          {cycle.myTickets.map((t) => {
            const done =
              t.status === "DONE" ||
              t.status === "DEPLOYED" ||
              t.status === "ARCHIVED";
            const blocked = t.status === "BLOCKED";
            return (
              <div
                className={`po-mine__row ${done ? "is-done" : ""} ${blocked ? "is-blocked" : ""}`}
                key={t.id}
              >
                <span className="po-mine__check" />
                <span className="po-mine__id">
                  {ticketDisplayId(product, t)}
                </span>
                <span className="po-mine__title">{t.title}</span>
                <span className="po-mine__st">
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowUpRight, IconListDetails } from "@tabler/icons-react";
import { STATUS_LABELS } from "~/lib/ticket-statuses";
import {
  OPEN_PULSE_STATUSES,
  statusCss,
  type ProductOverviewData,
} from "./overviewShared";

export function BacklogPulse({
  statusCounts,
  counts,
  basePath,
}: {
  statusCounts: ProductOverviewData["statusCounts"];
  counts: ProductOverviewData["counts"];
  basePath: string;
}) {
  const router = useRouter();
  const byStatus = new Map(statusCounts.map((s) => [s.status, s.count]));
  const open = OPEN_PULSE_STATUSES.map((status) => ({
    status,
    count: byStatus.get(status) ?? 0,
  })).filter((s) => s.count > 0);
  const total = open.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="po-block">
      <div className="po-block__head">
        <div className="po-block__title">
          <IconListDetails size={13} /> Backlog pulse
        </div>
        <div className="po-block__spacer" />
        <Link className="po-block__link" href={`${basePath}/tickets`}>
          Open backlog <IconArrowUpRight size={11} />
        </Link>
      </div>
      <div className="po-pulse__body">
        {total === 0 ? (
          <div className="po-pulse__empty">
            No open tickets. New work lands here as soon as it&apos;s filed.
          </div>
        ) : (
          <>
            <div className="po-pulse__bar" role="img" aria-label={`${total} open tickets by status`}>
              {open.map((s) => (
                <div
                  key={s.status}
                  className="po-pulse__seg"
                  title={`${STATUS_LABELS[s.status]} · ${s.count}`}
                  style={{ flex: s.count, background: statusCss(s.status) }}
                />
              ))}
            </div>
            <div className="po-pulse__legend">
              {open.map((s) => (
                <button
                  key={s.status}
                  type="button"
                  className="po-pulse__key"
                  onClick={() =>
                    router.push(`${basePath}/tickets?status=${s.status}`)
                  }
                >
                  <i style={{ background: statusCss(s.status) }} />
                  {STATUS_LABELS[s.status]} <b>{s.count}</b>
                </button>
              ))}
              <span className="po-pulse__total">
                {total} open · done &amp; archived hidden
              </span>
            </div>
          </>
        )}
        <div className="po-pulse__nav">
          <button
            type="button"
            className="po-pulse__nav-item"
            onClick={() => router.push(`${basePath}/features`)}
          >
            <span className="po-pulse__nav-num">{counts.features}</span>{" "}
            Features
          </button>
          <div className="po-pulse__nav-sep" />
          <button
            type="button"
            className="po-pulse__nav-item"
            onClick={() => router.push(`${basePath}/insights`)}
          >
            <span className="po-pulse__nav-num">{counts.researches}</span>{" "}
            Research
          </button>
          <div className="po-pulse__nav-sep" />
          <button
            type="button"
            className="po-pulse__nav-item"
            onClick={() => router.push(`${basePath}/retrospectives`)}
          >
            <span className="po-pulse__nav-num">{counts.retrospectives}</span>{" "}
            Retros
          </button>
        </div>
      </div>
    </div>
  );
}

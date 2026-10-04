"use client";

import { useState } from "react";
import Link from "next/link";
import { Tooltip } from "@mantine/core";
import { IconGitPullRequest, IconRobot, IconUsers } from "@tabler/icons-react";
import { getAvatarColor } from "~/utils/avatarColors";
import { STAGE_LABEL, formatDuration, type ManagerOverviewData } from "./managerFormat";

type PrState = ManagerOverviewData["prs"]["rows"][number]["state"];

const PR_PILL: Record<PrState, { label: string; tone: string }> = {
  open: { label: "Review required", tone: "is-amber" },
  approved: { label: "Approved", tone: "is-green" },
  changes: { label: "Changes requested", tone: "is-red" },
  merged: { label: "Merged", tone: "is-grey" },
  closed: { label: "Closed", tone: "is-grey" },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

function Avatar({ name, id, isAgent, size = 26 }: { name: string; id: string; isAgent: boolean; size?: number }) {
  return (
    <Tooltip label={name} withArrow openDelay={300}>
      {isAgent ? (
        <span className="mo-avatar is-agent" style={{ width: size, height: size }}>
          <IconRobot size={Math.round(size * 0.6)} />
        </span>
      ) : (
        <span
          className="mo-avatar"
          style={{ width: size, height: size, backgroundColor: getAvatarColor(id), fontSize: size < 20 ? 8 : 10 }}
        >
          {initials(name)}
        </span>
      )}
    </Tooltip>
  );
}

export function WhoIsWorkingCard({ team, basePath }: { team: ManagerOverviewData["team"]; basePath: string }) {
  return (
    <section className="mo-card">
      <header className="mo-card__head">
        <span className="mo-label">
          <IconUsers size={15} />
          Who&apos;s working on what
        </span>
        <span className="mo-legend">
          <span className="is-inProgress">In progress</span>
          <span className="is-inReview">In review</span>
          <span className="is-committed">Committed</span>
        </span>
      </header>
      {team.length === 0 ? (
        <p className="mo-empty">Nobody has open, assigned tickets here.</p>
      ) : (
        <ul className="mo-team">
          {team.map((m) => (
            <li key={m.id} className="mo-team__row">
              <div className="mo-team__who">
                <Avatar name={m.name} id={m.id} isAgent={m.isAgent} />
                <div>
                  <div className="mo-team__name">
                    {m.name}
                    {m.isAgent && <span className="mo-agent-chip">Agent</span>}
                  </div>
                  {m.areas.length > 0 && <div className="mo-team__areas">{m.areas.join(" · ")}</div>}
                  <div className="mo-team__load">
                    <strong>{m.tickets.length}</strong> active
                  </div>
                </div>
              </div>
              <ul className="mo-team__tickets">
                {m.tickets.map((t) => (
                  <li key={t.ticket.id}>
                    <Link href={`${basePath}/tickets/${t.ticket.urlId}`} className={`mo-tline is-${t.stage}`}>
                      <span className="mo-tline__dot" />
                      <span className="mo-id">{t.ticket.displayId}</span>
                      <span className="mo-row__title">{t.ticket.title}</span>
                      <span className="mo-tline__meta">
                        <span className={`mo-tline__status${t.blocked ? " is-blocked" : ""}`}>
                          {t.blocked ? "Blocked" : STAGE_LABEL[t.stage]}
                        </span>
                        {t.pr && (
                          <span className={`mo-prpill ${PR_PILL[t.pr.state].tone}`}>
                            {`#${t.pr.number} · ${PR_PILL[t.pr.state].label}`}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function prReason(row: ManagerOverviewData["prs"]["rows"][number]): { text: string; tone: string } {
  if (row.state === "changes") return { text: "Changes requested", tone: "is-red" };
  if (row.state === "approved") return { text: "Ready to merge", tone: "is-green" };
  if (row.authorIsAgent) return { text: "Agent PR · waiting on review", tone: "is-violet" };
  return { text: "No review yet", tone: row.waitMs > 86_400_000 ? "is-red" : "is-amber" };
}

export function PrsWaitingCard({ prs, basePath }: { prs: ManagerOverviewData["prs"]; basePath: string }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? prs.rows : prs.rows.slice(0, 5);
  const stats = [
    `${prs.open} open`,
    `${prs.withoutReview} without a review`,
    prs.medianWaitMs !== null ? `median wait ${formatDuration(prs.medianWaitMs)}` : null,
    prs.medianMergeMs !== null ? `median time to merge ${formatDuration(prs.medianMergeMs)}` : null,
  ].filter(Boolean);

  return (
    <section className="mo-card">
      <header className="mo-card__head">
        <span className="mo-label">
          <IconGitPullRequest size={15} />
          PRs waiting
        </span>
        {prs.hasData && <span className="mo-card__window">{stats.join(" · ")}</span>}
      </header>
      {!prs.hasData ? (
        <p className="mo-empty">
          No pull request data yet. Connect GitHub and link repositories to this product in its settings.
        </p>
      ) : rows.length === 0 ? (
        <p className="mo-empty">No open pull requests.</p>
      ) : (
        <>
          <ul className="mo-list">
            {rows.map((r) => {
              const reason = prReason(r);
              return (
                <li key={r.url} className="mo-pr">
                  <IconGitPullRequest size={16} className="mo-pr__icon" />
                  <span className="mo-pr__main">
                    <a href={r.url} target="_blank" rel="noreferrer" className="mo-pr__title">
                      {r.title}
                    </a>
                    <span className="mo-id">{`${r.repo.split("/")[1] ?? r.repo}#${r.number}`}</span>
                    {r.ticket ? (
                      <Link href={`${basePath}/tickets/${r.ticket.urlId}`} className="mo-id mo-pr__ticket">
                        {r.ticket.displayId}
                      </Link>
                    ) : (
                      <span className="mo-id">–</span>
                    )}
                  </span>
                  <span className={`mo-pr__reason ${reason.tone}`}>
                    {r.author && <Avatar name={r.author} id={r.author} isAgent={r.authorIsAgent} size={16} />}
                    {reason.text}
                  </span>
                  <span className="mo-pr__wait">{r.waitMs ? formatDuration(r.waitMs) : ""}</span>
                </li>
              );
            })}
          </ul>
          {prs.rows.length > 5 && (
            <button type="button" className="mo-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `View all ${prs.open} open PRs`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

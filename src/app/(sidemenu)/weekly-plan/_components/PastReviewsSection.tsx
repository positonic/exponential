"use client";

import Link from "next/link";
import {
  IconArrowRight,
  IconCalendarStats,
  IconCheck,
  IconTarget,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  workspaceGlyphVar,
  workspaceShortName,
  type ReviewWorkspace,
} from "./types";

type PastReview = RouterOutputs["portfolioReview"]["getCompletedReviews"][number];

interface Props {
  /**
   * How many past reviews to show. Use a small number on the intro screen
   * (e.g. 4); use undefined / null on the dedicated history page to show
   * the full list (defaults server-side to 12, can be raised via `limit`).
   */
  limit?: number;
  /**
   * The full workspace list — used to compute deterministic glyph colors.
   */
  workspaces: ReviewWorkspace[];
  /** When true, show "View full history →" link at bottom of section. */
  showViewAllLink?: boolean;
  /** Variant used when this is rendered standalone on a dedicated page. */
  variant?: "intro" | "page";
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatWeekRange(weekStart: Date): string {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  const sm = MONTH_SHORT[start.getUTCMonth()];
  const em = MONTH_SHORT[end.getUTCMonth()];
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${sm} ${start.getUTCDate()}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  return `${sm} ${start.getUTCDate()} – ${em} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

export function PastReviewsSection({
  limit,
  workspaces,
  showViewAllLink,
  variant = "intro",
}: Props) {
  const query = api.portfolioReview.getCompletedReviews.useQuery({
    limit: limit ?? 52,
  });

  if (query.isLoading) {
    return (
      <div className="pr-history">
        <div className="pr-history__head">
          <span className="pr-history__title">
            <IconCalendarStats size={13} /> Past reviews
          </span>
        </div>
        <div className="pr-empty" style={{ padding: "20px" }}>
          Loading history…
        </div>
      </div>
    );
  }

  const reviews = query.data ?? [];

  if (reviews.length === 0) {
    if (variant === "page") {
      return (
        <div className="pr-history">
          <div className="pr-empty" style={{ padding: "60px 24px" }}>
            No completed portfolio reviews yet. Run one — it&apos;ll show up
            here.
          </div>
        </div>
      );
    }
    return null; // hide section entirely on intro when empty
  }

  return (
    <div className="pr-history">
      <div className="pr-history__head">
        <span className="pr-history__title">
          <IconCalendarStats size={13} /> Past reviews
        </span>
        {showViewAllLink && (
          <Link href="/weekly-plan/history" className="pr-history__more">
            View full history <IconArrowRight size={11} />
          </Link>
        )}
      </div>

      <div className="pr-history__list">
        {reviews.map((r) => (
          <PastReviewRow key={r.id} review={r} workspaces={workspaces} />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  review: PastReview;
  workspaces: ReviewWorkspace[];
}

function PastReviewRow({ review, workspaces }: RowProps) {
  const completedAt = new Date(review.completedAt);
  const completedAtStr = completedAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const focuses = review.focuses;
  const totalThemes = focuses.filter(
    (f) => f.focusText && f.focusText.trim().length > 0,
  ).length;

  return (
    <div className="pr-history-row">
      <div className="pr-history-row__date">
        <div className="pr-history-row__week">
          {formatWeekRange(new Date(review.weekStartDate))}
        </div>
        <div className="pr-history-row__completed">
          <IconCheck size={11} /> Completed {completedAtStr}
        </div>
      </div>

      <div className="pr-history-row__focuses">
        {focuses.length === 0 ? (
          <span className="pr-history-row__empty">No workspaces in focus</span>
        ) : (
          focuses.map((f) => {
            const idx = workspaces.findIndex((w) => w.id === f.workspaceId);
            return (
              <div key={f.id} className="pr-history-focus">
                <div
                  className="pr-history-focus__glyph"
                  style={{ background: workspaceGlyphVar(idx) }}
                  title={f.workspace.name}
                >
                  {workspaceShortName(f.workspace.name)}
                </div>
                <div className="pr-history-focus__body">
                  <div className="pr-history-focus__name">
                    {f.workspace.name}
                  </div>
                  {f.focusText && (
                    <div className="pr-history-focus__theme">
                      <IconTarget size={10} /> {f.focusText}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="pr-history-row__stats">
        <div className="pr-history-stat">
          <strong>{review.workspacesInFocus}</strong>
          <span>workspaces</span>
        </div>
        <div className="pr-history-stat">
          <strong>{totalThemes}</strong>
          <span>themes</span>
        </div>
        <div className="pr-history-stat">
          <strong>{review.krCheckInsLogged}</strong>
          <span>check-ins</span>
        </div>
        <div className="pr-history-stat">
          <strong>{review.projectsReprioritized}</strong>
          <span>projects</span>
        </div>
      </div>
    </div>
  );
}

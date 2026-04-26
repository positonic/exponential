"use client";

import Link from "next/link";
import {
  IconArrowLeft,
  IconCalendarStats,
  IconFolder,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import "../_styles/portfolio-review.css";
import { PastReviewsSection } from "../_components/PastReviewsSection";

export function PortfolioReviewHistoryClient() {
  const reviewData = api.portfolioReview.getReviewData.useQuery();

  const workspaces = reviewData.data?.workspaces ?? [];

  return (
    <div className="portfolio-review-surface -m-4 -mt-16 sm:-mt-4 lg:-m-8 -mb-20 sm:-mb-4 lg:-mb-8">
      <header className="pr-topbar">
        <div className="pr-crumb">
          <IconFolder size={14} /> Portfolio
          <span className="pr-crumb__sep">/</span>
          <Link href="/weekly-review" className="pr-crumb__link">
            Weekly Review
          </Link>
          <span className="pr-crumb__sep">/</span>
          <span className="pr-crumb__current">History</span>
        </div>
        <div className="pr-topbar__right">
          <Link href="/home" className="pr-topbar__close" aria-label="Close">
            <IconX size={16} />
          </Link>
        </div>
      </header>

      <div className="pr-shell">
        <div className="pr-history-page-head">
          <Link href="/weekly-review" className="pr-history-back">
            <IconArrowLeft size={13} /> Back to weekly review
          </Link>
          <div>
            <div className="pr-phase-head__eyebrow">
              <IconCalendarStats
                size={11}
                style={{ display: "inline-block", marginRight: 5, verticalAlign: "-1px" }}
              />
              Portfolio review history
            </div>
            <h1>Every week you&apos;ve set the portfolio.</h1>
            <div className="pr-phase-head__sub">
              Each row shows the workspaces you put in focus, the themes you
              committed to, and the work you moved. Useful for spotting drift
              or recurring focus.
            </div>
          </div>
        </div>

        {reviewData.isLoading ? (
          <div className="pr-empty">Loading…</div>
        ) : (
          <PastReviewsSection
            limit={52}
            workspaces={workspaces}
            variant="page"
          />
        )}
      </div>
    </div>
  );
}

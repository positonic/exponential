"use client";

import { IconChevronRight, IconSparkles } from "@tabler/icons-react";
import type { Chapter } from "./helpers";

interface SummaryPaneProps {
  tldr: string | null;
  chapters: Chapter[];
  onJumpToTimestamp: (startSeconds: number) => void;
}

export function SummaryPane({
  tldr,
  chapters,
  onJumpToTimestamp,
}: SummaryPaneProps) {
  const hasAnything = tldr || chapters.length > 0;

  return (
    <div className="mdm-pane">
      <div className="mdm-summary">
        {tldr && (
          <div className="mdm-tldr">
            <div className="mdm-tldr__head">
              <IconSparkles size={12} />
              AI summary
            </div>
            <p className="mdm-tldr__text">{tldr}</p>
          </div>
        )}

        {chapters.length > 0 && (
          <div>
            <div className="mdm-section-head">
              <h3>Key moments</h3>
              <span className="mdm-section-head__count">{chapters.length}</span>
              <span className="mdm-section-head__rule" />
            </div>
            <div className="mdm-moments">
              {chapters.map((c, i) => (
                <button
                  key={i}
                  className="mdm-moment"
                  onClick={() => onJumpToTimestamp(c.startSeconds)}
                  type="button"
                >
                  <span className="mdm-moment__time">{c.time}</span>
                  <div className="min-w-0">
                    <div className="mdm-moment__title">{c.title}</div>
                    {c.summary && (
                      <p className="mdm-moment__summary">{c.summary}</p>
                    )}
                  </div>
                  <IconChevronRight size={14} className="mdm-moment__jump" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!hasAnything && (
          <div className="mdm-tldr">
            <div className="mdm-tldr__head">
              <IconSparkles size={12} />
              AI summary
            </div>
            <p className="mdm-tldr__text" style={{ color: "var(--color-text-muted)" }}>
              No AI summary available yet for this meeting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

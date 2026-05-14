"use client";

import {
  IconArchive,
  IconArrowRight,
  IconExternalLink,
  IconFileText,
  IconShare,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { extractTalkShares, initialsOf } from "./helpers";

interface RailParticipant {
  id: string;
  name: string | null;
  email: string;
  isHost: boolean;
  isMe: boolean;
}

interface RailLink {
  href: string;
  glyph: string;
  title: string;
  sub: string;
}

interface RailProps {
  participants: RailParticipant[];
  analyticsJson: unknown;
  links: RailLink[];
  sourceTitle: string;
  sourceSub: string;
  onShare?: () => void;
  onOpenJournal?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function Rail({
  participants,
  analyticsJson,
  links,
  sourceTitle,
  sourceSub,
  onShare,
  onOpenJournal,
  onArchive,
  onDelete,
}: RailProps) {
  const talkShares = extractTalkShares(analyticsJson);
  const getShare = (p: RailParticipant): string | null => {
    const byEmail = talkShares.get(p.email.toLowerCase());
    if (typeof byEmail === "number") return formatShare(byEmail);
    if (p.name) {
      const byName = talkShares.get(p.name.toLowerCase());
      if (typeof byName === "number") return formatShare(byName);
    }
    return null;
  };

  return (
    <aside className="mdm-rail">
      {participants.length > 0 && (
        <div className="mdm-rail__section">
          <div className="mdm-rail__label">Participants</div>
          <div className="mdm-people">
            {participants.map((p) => {
              const share = getShare(p);
              const display = p.name ?? p.email;
              return (
                <div key={p.id} className="mdm-person">
                  <div
                    className={`mdm-person__avatar mdm-person__avatar--${p.isMe ? "me" : "them"}`}
                  >
                    {initialsOf(display)}
                  </div>
                  <div className="min-w-0">
                    <div className="mdm-person__name truncate">{display}</div>
                    <div className="mdm-person__role">
                      {p.isMe ? "You" : p.isHost ? "Host" : "Guest"}
                    </div>
                  </div>
                  {share && (
                    <span className="mdm-person__talk" title="Talk-time share">
                      {share}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div className="mdm-rail__section">
          <div className="mdm-rail__label">Linked</div>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="mdm-link-row">
              <span className="mdm-link-row__glyph">{l.glyph}</span>
              <div className="min-w-0">
                <div className="mdm-link-row__title">{l.title}</div>
                <div className="mdm-link-row__sub">{l.sub}</div>
              </div>
              <IconArrowRight size={12} className="mdm-link-row__arrow" />
            </Link>
          ))}
        </div>
      )}

      <div className="mdm-rail__section">
        <div className="mdm-rail__label">Source</div>
        <div className="mdm-source">
          <div className="mdm-source__icon">
            <IconFileText size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mdm-source__title truncate">{sourceTitle}</div>
            <div className="mdm-source__sub">{sourceSub}</div>
          </div>
        </div>
      </div>

      <div className="mdm-rail__section" style={{ marginTop: "auto" }}>
        <div className="mdm-rail__label">Actions</div>
        <div className="mdm-rail__quick">
          {onShare && (
            <button className="mdm-rail__quick-btn" onClick={onShare}>
              <IconShare size={13} /> Share
            </button>
          )}
          {onOpenJournal && (
            <button className="mdm-rail__quick-btn" onClick={onOpenJournal}>
              <IconExternalLink size={13} /> Open in journal
            </button>
          )}
          {onArchive && (
            <button className="mdm-rail__quick-btn" onClick={onArchive}>
              <IconArchive size={13} /> Archive
            </button>
          )}
          {onDelete && (
            <button
              className="mdm-rail__quick-btn mdm-rail__quick-btn--danger"
              onClick={onDelete}
            >
              <IconX size={13} /> Delete record
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function formatShare(value: number): string {
  // Fireflies sometimes stores as 0–1 fraction, sometimes as 0–100.
  const pct = value <= 1 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

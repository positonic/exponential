"use client";

import {
  IconArrowRight,
  IconArrowUpRight,
  IconPlayerPlayFilled,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  getAvatarColor,
  getColorSeed,
  getInitial,
  getTextColor,
} from "~/utils/avatarColors";
import { extractTalkShares } from "./helpers";

interface RailParticipant {
  id: string;
  name: string | null;
  email: string;
  isHost: boolean;
  isMe: boolean;
  /**
   * Always true now — the panel only renders managed Participant rows. Kept so
   * the remove affordance stays explicit about acting on persisted rows.
   */
  isPersisted: boolean;
}

type RailTone = "blue" | "amber" | "purple" | "green";

interface RailLink {
  href: string;
  /** Single-character glyph shown when no icon is supplied. */
  glyph: string;
  /** Optional icon rendered inside the glyph box instead of the letter. */
  icon?: ReactNode;
  tone?: RailTone;
  title: string;
  sub: string;
}

interface RailSource {
  title: string;
  sub: string;
  /** When set, the source card becomes an external link. */
  href?: string;
}

interface RailDetail {
  label: string;
  value: string;
  mono?: boolean;
}

interface RailAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface RailProps {
  participants: RailParticipant[];
  analyticsJson: unknown;
  links: RailLink[];
  source: RailSource | null;
  details: RailDetail[];
  actions: RailAction[];
  onAddParticipant?: () => void;
  onRemoveParticipant?: (id: string) => void;
}

export function Rail({
  participants,
  analyticsJson,
  links,
  source,
  details,
  actions,
  onAddParticipant,
  onRemoveParticipant,
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
      <div className="mdm-rail__section">
        <div className="mdm-rail__label">
          <span>Participants</span>
          {onAddParticipant && (
            <button
              type="button"
              className="mdm-rail__add"
              onClick={onAddParticipant}
              aria-label="Add participant"
            >
              <IconPlus size={14} />
            </button>
          )}
        </div>
        {participants.length === 0 ? (
          // Only managed Participant rows populate this panel — never derived
          // transcript Speakers (CONTEXT.md → Speaker). Empty state, not fakes.
          <div className="mdm-people__empty">
            {onAddParticipant ? "No participants yet — add one" : "No participants yet"}
          </div>
        ) : (
          <div className="mdm-people">
            {participants.map((p) => {
              const share = getShare(p);
              const display = p.name ?? p.email;
              const seed = getColorSeed(p.name, p.email);
              const bg = getAvatarColor(seed);
              return (
                <div key={p.id} className="mdm-person">
                  <div
                    className="mdm-person__avatar"
                    style={{ backgroundColor: bg, color: getTextColor(bg) }}
                  >
                    {getInitial(p.name, p.email)}
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
                  {p.isPersisted && onRemoveParticipant && (
                    <button
                      type="button"
                      className="mdm-person__remove"
                      onClick={() => onRemoveParticipant(p.id)}
                      aria-label={`Remove ${display}`}
                      title="Remove participant"
                    >
                      <IconX size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {links.length > 0 && (
        <div className="mdm-rail__section">
          <div className="mdm-rail__label">
            <span>Linked</span>
          </div>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="mdm-link-row">
              <span
                className={`mdm-link-row__glyph mdm-link-row__glyph--${l.tone ?? "blue"}`}
              >
                {l.icon ?? l.glyph}
              </span>
              <div className="min-w-0">
                <div className="mdm-link-row__title">{l.title}</div>
                <div className="mdm-link-row__sub">{l.sub}</div>
              </div>
              <IconArrowRight size={14} className="mdm-link-row__arrow" />
            </Link>
          ))}
        </div>
      )}

      {source && (
        <div className="mdm-rail__section">
          <div className="mdm-rail__label">
            <span>Source</span>
          </div>
          <SourceCard source={source} />
        </div>
      )}

      {details.length > 0 && (
        <div className="mdm-rail__section">
          <div className="mdm-rail__label">
            <span>Details</span>
          </div>
          <div className="mdm-detail-list">
            {details.map((d) => (
              <div key={d.label} className="mdm-detail-row">
                <span className="mdm-detail-row__label">{d.label}</span>
                <span
                  className={`mdm-detail-row__value${d.mono ? " mdm-detail-row__value--mono" : ""}`}
                  title={d.value}
                >
                  {d.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <div className="mdm-rail__section" style={{ marginTop: "auto" }}>
          <div className="mdm-rail__label">
            <span>Actions</span>
          </div>
          <div className="mdm-rail__quick">
            {actions.map((a) => (
              <button
                key={a.key}
                className={`mdm-rail__quick-btn${a.danger ? " mdm-rail__quick-btn--danger" : ""}`}
                onClick={a.onClick}
              >
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function SourceCard({ source }: { source: RailSource }) {
  const inner = (
    <>
      <div className="mdm-source__icon">
        <IconPlayerPlayFilled size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mdm-source__title truncate">{source.title}</div>
        <div className="mdm-source__sub">{source.sub}</div>
      </div>
      {source.href && (
        <IconArrowUpRight size={14} className="mdm-source__arrow" />
      )}
    </>
  );

  if (source.href) {
    return (
      <a
        href={source.href}
        target="_blank"
        rel="noopener noreferrer"
        className="mdm-source mdm-source--link"
      >
        {inner}
      </a>
    );
  }
  return <div className="mdm-source">{inner}</div>;
}

function formatShare(value: number): string {
  // Fireflies sometimes stores as 0–1 fraction, sometimes as 0–100.
  const pct = value <= 1 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

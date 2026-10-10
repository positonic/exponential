import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  IconArrowLeft,
  IconCalendar,
  IconClock,
  IconPencil,
  IconPlayerPlay,
  IconShare,
} from "@tabler/icons-react";
import { MpAvatar } from "./MpAvatar";
import type { MeetingParticipant } from "~/lib/meeting-view-model";

interface MeetingHeaderProps {
  title: string;
  /** Rename the meeting in place. Omit for read-only viewers (static title). */
  onRenameTitle?: (title: string) => Promise<void>;
  meetingType: string | null;
  dateLabel: string | null;
  timeLabel: string | null;
  durationLabel: string | null;
  participants: MeetingParticipant[];
  sourceLabel: string | null;
  workspaceName: string | null;
  backHref: string;
  onShare: () => void;
  /** Extra actions rendered beside Share, e.g. posting the summary to a chat room. */
  extraActions?: React.ReactNode;
}

/**
 * The meeting title, editable in place: click it (or the pencil) to turn it
 * into an input; Enter or blur saves, Escape cancels. An empty or unchanged
 * value reverts without a round-trip.
 */
function MeetingTitle({
  title,
  onRename,
}: {
  title: string;
  onRename?: (title: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape blurs the input too; this stops that blur from saving.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isEditing) setDraft(title);
  }, [title, isEditing]);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  if (!onRename) {
    return (
      <h1 className="mp-title">
        <span className="mp-title__text">{title}</span>
      </h1>
    );
  }

  function startEditing() {
    cancelledRef.current = false;
    setDraft(title);
    setIsEditing(true);
  }

  async function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setIsEditing(false);
      return;
    }
    const next = draft.trim();
    if (!next || next === title || !onRename) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onRename(next);
      setIsEditing(false);
    } catch {
      // onRename surfaces its own error notification; keep the draft open.
      inputRef.current?.focus();
    } finally {
      setIsSaving(false);
    }
  }

  if (isEditing) {
    return (
      <h1 className="mp-title">
        <input
          ref={inputRef}
          className="mp-title__input"
          value={draft}
          disabled={isSaving}
          aria-label="Meeting title"
          placeholder="Meeting title"
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelledRef.current = true;
              e.currentTarget.blur();
            }
          }}
        />
      </h1>
    );
  }

  return (
    <h1 className="mp-title mp-title--editable">
      <span
        className="mp-title__text"
        role="button"
        tabIndex={0}
        title="Click to rename"
        onClick={startEditing}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startEditing();
          }
        }}
      >
        {title}
      </span>
      <button
        type="button"
        className="mp-title__edit"
        aria-label="Rename meeting"
        onClick={startEditing}
      >
        <IconPencil size={15} />
      </button>
    </h1>
  );
}

export function MeetingHeader({
  title,
  onRenameTitle,
  meetingType,
  dateLabel,
  timeLabel,
  durationLabel,
  participants,
  sourceLabel,
  workspaceName,
  backHref,
  onShare,
  extraActions,
}: MeetingHeaderProps) {
  return (
    <header className="mp-head">
      <div className="mp-crumb">
        <Link href={backHref} className="mp-crumb__back">
          <IconArrowLeft size={13} /> Meetings
        </Link>
        {workspaceName && (
          <>
            <span className="mp-crumb__sep">/</span>
            <span>{workspaceName}</span>
          </>
        )}
        {dateLabel && (
          <>
            <span className="mp-crumb__sep">/</span>
            <span className="mp-crumb__cur">{dateLabel}</span>
          </>
        )}
      </div>

      <div className="mp-titlebar">
        <div className="mp-titlebar__main">
          {meetingType && (
            <span className="mp-type">
              <span className="mp-type__dot" />
              {meetingType}
            </span>
          )}
          <MeetingTitle title={title} onRename={onRenameTitle} />
          <div className="mp-meta">
            {dateLabel && (
              <span className="mp-meta__item">
                <IconCalendar size={14} />
                <b>{dateLabel}</b>
                {timeLabel ? ` · ${timeLabel}` : null}
              </span>
            )}
            {durationLabel && (
              <span className="mp-meta__item">
                <IconClock size={14} /> {durationLabel}
              </span>
            )}
            {participants.length > 0 && (
              <span className="mp-meta__item">
                <span className="mp-meta__avs">
                  {participants.slice(0, 5).map((p) => (
                    <MpAvatar key={p.id} initial={p.initial} flavor={p.flavor} title={p.name} />
                  ))}
                </span>
                {participants.length} {participants.length === 1 ? "person" : "people"}
              </span>
            )}
            {sourceLabel && (
              <span className="mp-meta__item">
                <IconPlayerPlay size={13} /> {sourceLabel}
              </span>
            )}
          </div>
        </div>
        <div className="mp-head-actions">
          <button className="mp-btn" onClick={onShare}>
            <IconShare size={14} /> Share
          </button>
          {extraActions}
        </div>
      </div>
    </header>
  );
}

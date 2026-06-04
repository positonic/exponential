import Link from "next/link";
import {
  IconArrowLeft,
  IconCalendar,
  IconClock,
  IconPlayerPlay,
  IconShare,
} from "@tabler/icons-react";
import { MpAvatar } from "./MpAvatar";
import type { MeetingParticipant } from "~/lib/meeting-view-model";

interface MeetingHeaderProps {
  title: string;
  meetingType: string | null;
  dateLabel: string | null;
  timeLabel: string | null;
  durationLabel: string | null;
  participants: MeetingParticipant[];
  sourceLabel: string | null;
  workspaceName: string | null;
  backHref: string;
  onShare: () => void;
}

export function MeetingHeader({
  title,
  meetingType,
  dateLabel,
  timeLabel,
  durationLabel,
  participants,
  sourceLabel,
  workspaceName,
  backHref,
  onShare,
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
          <h1 className="mp-title">
            <span className="mp-title__text">{title}</span>
          </h1>
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
        </div>
      </div>
    </header>
  );
}

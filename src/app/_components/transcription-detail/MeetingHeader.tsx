"use client";

import { ActionIcon, TextInput, Tooltip } from "@mantine/core";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconDots,
  IconFolder,
  IconHash,
  IconPencil,
  IconShare,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { formatDurationMinutes, formatMeetingDate } from "./helpers";

interface MeetingHeaderProps {
  title: string | null;
  sessionId: string;
  meetingTypeLabel: string;
  meetingDate: Date | string | null;
  durationSeconds: number | null;
  participantCount: number;
  projectName: string | null;
  workspaceName: string | null;
  editingTitle: boolean;
  editedTitle: string;
  onEditedTitleChange: (value: string) => void;
  onStartEditTitle: () => void;
  onSaveTitle: () => void;
  onCancelEditTitle: () => void;
  isSavingTitle: boolean;
  onShare?: () => void;
  onMore?: () => void;
  onClose: () => void;
}

export function MeetingHeader({
  title,
  sessionId,
  meetingTypeLabel,
  meetingDate,
  durationSeconds,
  participantCount,
  projectName,
  workspaceName,
  editingTitle,
  editedTitle,
  onEditedTitleChange,
  onStartEditTitle,
  onSaveTitle,
  onCancelEditTitle,
  isSavingTitle,
  onShare,
  onMore,
  onClose,
}: MeetingHeaderProps) {
  const dateInfo = formatMeetingDate(meetingDate);
  const durationLabel = formatDurationMinutes(durationSeconds);

  return (
    <header className="mdm-head">
      <div className="mdm-head__top">
        <div className="mdm-head__crumb">
          <IconFolder size={13} />
          {workspaceName && <span>{workspaceName}</span>}
          {workspaceName && <span className="mdm-head__crumb-sep">/</span>}
          <span>Meetings</span>
          <span className="mdm-head__crumb-sep">/</span>
          <span className="mdm-head__crumb-current">
            {dateInfo.dayLabel}
          </span>
        </div>
        <div className="flex-1" />
        {onShare && (
          <Tooltip label="Share">
            <button className="mdm-icon-btn" onClick={onShare} aria-label="Share">
              <IconShare size={15} />
            </button>
          </Tooltip>
        )}
        {onMore && (
          <Tooltip label="More">
            <button className="mdm-icon-btn" onClick={onMore} aria-label="More">
              <IconDots size={16} />
            </button>
          </Tooltip>
        )}
        <Tooltip label="Close">
          <button className="mdm-icon-btn" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </Tooltip>
      </div>

      <div className="mdm-head__title-row">
        <span className="mdm-head__type">
          <span className="mdm-head__type-dot" />
          {meetingTypeLabel}
        </span>
        {editingTitle ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TextInput
              value={editedTitle}
              onChange={(e) => onEditedTitleChange(e.currentTarget.value)}
              placeholder="Enter title…"
              autoFocus
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveTitle();
                else if (e.key === "Escape") onCancelEditTitle();
              }}
            />
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={onCancelEditTitle}
              disabled={isSavingTitle}
              aria-label="Cancel"
            >
              <IconX size={16} />
            </ActionIcon>
            <ActionIcon
              variant="filled"
              color="blue"
              onClick={onSaveTitle}
              loading={isSavingTitle}
              aria-label="Save title"
            >
              <IconCheck size={16} />
            </ActionIcon>
          </div>
        ) : (
          <>
            <h1 className="mdm-head__title">{title ?? "Untitled meeting"}</h1>
            <Tooltip label="Rename">
              <button
                className="mdm-icon-btn"
                onClick={onStartEditTitle}
                aria-label="Rename"
                style={{ width: 24, height: 24 }}
              >
                <IconPencil size={13} />
              </button>
            </Tooltip>
          </>
        )}
      </div>

      <div className="mdm-head__meta">
        <span className="mdm-head__meta-item">
          <IconCalendar size={13} className="mdm-icon-muted" />
          <b>{dateInfo.fullLabel}</b>
          {dateInfo.timeLabel && (
            <>
              <span style={{ color: "var(--color-text-muted)" }}>·</span>
              <span>{dateInfo.timeLabel}</span>
            </>
          )}
        </span>
        {durationLabel && (
          <span className="mdm-head__meta-item">
            <IconClock size={13} className="mdm-icon-muted" />
            {durationLabel}
          </span>
        )}
        <span className="mdm-head__meta-item">
          <IconUsers size={13} className="mdm-icon-muted" />
          {participantCount} {participantCount === 1 ? "participant" : "participants"}
        </span>
        {projectName && (
          <span className="mdm-head__meta-item">
            <IconHash size={13} className="mdm-icon-muted" />
            <b>{projectName}</b>
          </span>
        )}
        <span className="flex-1" />
        <span className="mdm-head__id" title="Internal record ID">
          {sessionId}
        </span>
      </div>
    </header>
  );
}

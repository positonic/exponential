"use client";

import Link from "next/link";
import { Select } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import {
  IconPlayerPlay,
  IconArrowRight,
  IconShare,
  IconFileExport,
  IconExternalLink,
} from "@tabler/icons-react";
import { MpAvatar } from "./MpAvatar";
import type { MeetingParticipant } from "~/lib/meeting-view-model";

interface ContextRailProps {
  participants: MeetingParticipant[];
  project: { name: string } | null;
  projectHref: string | null;
  hasVideo: boolean;
  videoUrl: string | null;
  sourceLabel: string | null;
  sourceSub: string | null;
  sessionId: string;
  createdLabel: string;
  updatedLabel: string;
  meetingDate: Date | null;
  onMeetingDateChange: (value: Date | null) => void;
  workspaceId: string | null;
  workspaces: { id: string; name: string }[];
  onWorkspaceChange: (value: string | null) => void;
  onShare: () => void;
  onExportTranscript: () => void;
  canExport: boolean;
}

export function ContextRail({
  participants,
  project,
  projectHref,
  hasVideo,
  videoUrl,
  sourceLabel,
  sourceSub,
  sessionId,
  createdLabel,
  updatedLabel,
  meetingDate,
  onMeetingDateChange,
  workspaceId,
  workspaces,
  onWorkspaceChange,
  onShare,
  onExportTranscript,
  canExport,
}: ContextRailProps) {
  return (
    <aside className="mp-rail">
      {participants.length > 0 && (
        <div className="mp-rail__section">
          <div className="mp-rail__label">Participants</div>
          <div className="mp-people">
            {participants.map((p) => (
              <div key={p.id} className="mp-person">
                <MpAvatar initial={p.initial} flavor={p.flavor} />
                <div style={{ minWidth: 0 }}>
                  <div className="mp-person__name">{p.name}</div>
                  {p.role && <div className="mp-person__role">{p.role}</div>}
                </div>
                {p.talk && <span className="mp-person__talk" title="Talk-time">{p.talk}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {project && (
        <div className="mp-rail__section">
          <div className="mp-rail__label">Linked</div>
          {projectHref ? (
            <Link href={projectHref} className="mp-linkrow">
              <span className="mp-linkrow__glyph mp-linkrow__glyph--ritual">
                {project.name.charAt(0).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="mp-linkrow__title">{project.name}</div>
                <div className="mp-linkrow__sub">Project</div>
              </div>
              <IconArrowRight size={13} className="mp-linkrow__arrow" />
            </Link>
          ) : (
            <div className="mp-linkrow">
              <span className="mp-linkrow__glyph mp-linkrow__glyph--ritual">
                {project.name.charAt(0).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="mp-linkrow__title">{project.name}</div>
                <div className="mp-linkrow__sub">Project</div>
              </div>
            </div>
          )}
        </div>
      )}

      {(hasVideo || sourceLabel) && (
        <div className="mp-rail__section">
          <div className="mp-rail__label">Source</div>
          <div className="mp-source">
            <span className="mp-source__icon">
              <IconPlayerPlay size={14} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mp-source__title">{sourceLabel ?? "Recording"}</div>
              {sourceSub && <div className="mp-source__sub">{sourceSub}</div>}
            </div>
            {videoUrl && (
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" aria-label="Open recording">
                <IconExternalLink size={14} className="mp-linkrow__arrow" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Demoted plumbing — editable, but out of the main flow */}
      <div className="mp-rail__section">
        <div className="mp-rail__label">Details</div>
        <div className="mp-railkv">
          <div className="mp-railkv__row">
            <span className="mp-railkv__k">Created</span>
            <span className="mp-railkv__v">{createdLabel}</span>
          </div>
          <div className="mp-railkv__row">
            <span className="mp-railkv__k">Updated</span>
            <span className="mp-railkv__v">{updatedLabel}</span>
          </div>
          <div className="mp-railkv__row">
            <span className="mp-railkv__k">Session</span>
            <span className="mp-railkv__v mp-railkv__v--mono" title={sessionId}>
              {sessionId}
            </span>
          </div>
        </div>
        <div className="mp-rail__field">
          <DateTimePicker
            label="Meeting date"
            value={meetingDate}
            onChange={(value) => onMeetingDateChange(value ? new Date(value) : null)}
            clearable
            size="xs"
            valueFormat="MMM D, YYYY h:mm A"
            popoverProps={{ withinPortal: true }}
          />
        </div>
        {workspaces.length > 0 && (
          <div className="mp-rail__field">
            <Select
              label="Workspace"
              size="xs"
              data={[
                { value: "", label: "No workspace" },
                ...workspaces.map((ws) => ({ value: ws.id, label: ws.name })),
              ]}
              value={workspaceId ?? ""}
              onChange={(value) => onWorkspaceChange(value === "" ? null : value)}
            />
          </div>
        )}
      </div>

      <div className="mp-rail__section">
        <div className="mp-rail__label">Actions</div>
        <div className="mp-quick">
          <button className="mp-quick__btn" onClick={onShare}>
            <IconShare size={13} /> Share with team
          </button>
          <button className="mp-quick__btn" onClick={onExportTranscript} disabled={!canExport}>
            <IconFileExport size={13} /> Export transcript
          </button>
          {videoUrl && (
            <a
              className="mp-quick__btn"
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconExternalLink size={13} /> Open recording
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}

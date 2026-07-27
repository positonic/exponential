"use client";

import Link from "next/link";
import { DateTimePicker } from "@mantine/dates";
import {
  IconPlayerPlay,
  IconShare,
  IconFileExport,
  IconExternalLink,
  IconArchive,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { Loader } from "@mantine/core";
import { MpAvatar } from "./MpAvatar";
import {
  MeetingProjectPicker,
  type MeetingProjectOption,
} from "./MeetingProjectPicker";
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
  /** Current placement + candidates. Workspace is derived from the project. */
  projectId: string | null;
  assignableProjects: MeetingProjectOption[];
  onProjectChange: (projectId: string | null) => void;
  /** Read-only workspace label, derived from the placed project. */
  workspaceName: string | null;
  onShare: () => void;
  onExportTranscript: () => void;
  canExport: boolean;
  onArchive: () => void;
  onAddParticipant?: () => void;
  onRemoveParticipant?: (id: string) => void;
  /** Id of the participant currently being removed, for a per-row spinner. */
  removingParticipantId?: string | null;
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
  projectId,
  assignableProjects,
  onProjectChange,
  workspaceName,
  onShare,
  onExportTranscript,
  canExport,
  onArchive,
  onAddParticipant,
  onRemoveParticipant,
  removingParticipantId,
}: ContextRailProps) {
  return (
    <aside className="mp-rail">
      {(participants.length > 0 || onAddParticipant) && (
        <div className="mp-rail__section">
          <div className="mp-rail__label">
            <span>Participants</span>
            {onAddParticipant && (
              <button
                type="button"
                className="mp-rail__add"
                onClick={onAddParticipant}
                aria-label="Add participant"
              >
                <IconPlus size={14} />
              </button>
            )}
          </div>
          {participants.length > 0 ? (
            <div className="mp-people">
              {participants.map((p) => {
                const removing = removingParticipantId === p.id;
                return (
                  <div key={p.id} className="mp-person">
                    <MpAvatar initial={p.initial} flavor={p.flavor} />
                    <div style={{ minWidth: 0 }}>
                      <div className="mp-person__name">{p.name}</div>
                      {p.role && <div className="mp-person__role">{p.role}</div>}
                    </div>
                    {p.talk && <span className="mp-person__talk" title="Talk-time">{p.talk}</span>}
                    {onRemoveParticipant && (
                      <button
                        type="button"
                        className="mp-person__remove"
                        onClick={() => onRemoveParticipant(p.id)}
                        disabled={removing}
                        aria-label={`Remove ${p.name}`}
                        title={`Remove ${p.name}`}
                      >
                        {removing ? <Loader size={12} /> : <IconX size={13} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mp-rail__empty">No participants yet.</div>
          )}
        </div>
      )}

      <div className="mp-rail__section">
        <div className="mp-rail__label">Linked</div>
        {/* Project placement — searchable, grouped by workspace. Picking a
            project sets the meeting's workspace (and re-homes its Actions). */}
        <MeetingProjectPicker
          projects={assignableProjects}
          value={projectId}
          onChange={onProjectChange}
        >
          {({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="mp-linkrow"
              style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
            >
              <span className="mp-linkrow__glyph mp-linkrow__glyph--ritual">
                {project ? project.name.charAt(0).toUpperCase() : "+"}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="mp-linkrow__title">
                  {project ? project.name : "Assign to project"}
                </div>
                <div className="mp-linkrow__sub">
                  {project
                    ? workspaceName ?? "Project"
                    : "Sets the workspace too"}
                </div>
              </div>
            </button>
          )}
        </MeetingProjectPicker>
        {project && projectHref && (
          <Link
            href={projectHref}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-brand-400"
          >
            <IconExternalLink size={12} /> Open project
          </Link>
        )}
      </div>

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
              {sessionId.length > 8 ? `…${sessionId.slice(-6)}` : sessionId}
            </span>
          </div>
          <div className="mp-railkv__row">
            <span className="mp-railkv__k">Workspace</span>
            <span className="mp-railkv__v">{workspaceName ?? "Personal"}</span>
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
          <button className="mp-quick__btn" onClick={onArchive}>
            <IconArchive size={13} /> Archive meeting
          </button>
        </div>
      </div>
    </aside>
  );
}

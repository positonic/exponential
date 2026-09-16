"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionIcon, Checkbox, Menu, Stack, Tooltip } from "@mantine/core";
import {
  IconArchive,
  IconArrowRight,
  IconBrandSlack,
  IconCalendarEvent,
  IconCheckbox,
  IconChevronDown,
  IconDotsVertical,
  IconExternalLink,
  IconFolder,
  IconPlayerPlay,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";
import { parseFirefliesSummary } from "~/lib/fireflies-summary";
import {
  buildMeetingCardViewModel,
  type MeetingCardParticipant,
  type MeetingCardSession,
} from "~/lib/meetingCardViewModel";
import { MeetingProjectPicker, type MeetingProjectOption } from "./MeetingProjectPicker";

/** One row of `transcription.getMeetingCards` — the shape every card renders. */
export type MeetingCardRow = RouterOutputs["transcription"]["getMeetingCards"][number];

// ── Date grouping helpers ────────────────────────────────────────────
// Group Meetings by their *local* calendar day. Day boundaries respect the
// user's browser timezone (not UTC), and the header label resolves to TODAY /
// YESTERDAY / `<Weekday>, <Mon Day>`.

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DayLabelParts {
  dayLabel: string;       // "Thu, Apr 23" (full short date)
  relativeLabel: string;  // "TODAY" / "YESTERDAY" / "EARLIER THIS WEEK" / "Tue, May 13"
  isToday: boolean;
}

function dayLabels(d: Date, now: Date): DayLabelParts {
  const day = startOfLocalDay(d);
  const today = startOfLocalDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const dayLabel = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (day.getTime() === today.getTime()) {
    return { dayLabel, relativeLabel: "TODAY", isToday: true };
  }
  if (day.getTime() === yesterday.getTime()) {
    return { dayLabel, relativeLabel: "YESTERDAY", isToday: false };
  }
  if (day >= sevenDaysAgo && day < yesterday) {
    return { dayLabel, relativeLabel: "EARLIER THIS WEEK", isToday: false };
  }
  // Fall back to the same short-date label for the relative slot so we still
  // print something compact-but-honest beyond a week.
  return { dayLabel, relativeLabel: dayLabel.toUpperCase(), isToday: false };
}

interface MeetingDateLike {
  meetingDate: Date | string | null;
  createdAt: Date | string;
}

interface DayGroup<T> {
  key: string;
  dayLabel: string;
  relativeLabel: string;
  isToday: boolean;
  meetings: T[];
}

function groupMeetingsByLocalDay<T extends MeetingDateLike>(
  meetings: T[],
  now: Date = new Date(),
): Array<DayGroup<T>> {
  const buckets = new Map<string, DayGroup<T> & { sortDate: Date }>();
  for (const m of meetings) {
    const raw = m.meetingDate ?? m.createdAt;
    const d = raw instanceof Date ? raw : new Date(raw);
    const key = localDayKey(d);
    const existing = buckets.get(key);
    if (existing) {
      existing.meetings.push(m);
    } else {
      const labels = dayLabels(d, now);
      buckets.set(key, {
        key,
        dayLabel: labels.dayLabel,
        relativeLabel: labels.relativeLabel,
        isToday: labels.isToday,
        sortDate: startOfLocalDay(d),
        meetings: [m],
      });
    }
  }
  // Sort buckets by date descending, and meetings within each by their date
  // descending (so newest in the day comes first).
  return Array.from(buckets.values())
    .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
    .map(({ meetings: items, sortDate: _sortDate, ...rest }) => ({
      ...rest,
      meetings: items.slice().sort((a, b) => {
        const ad = a.meetingDate ?? a.createdAt;
        const bd = b.meetingDate ?? b.createdAt;
        return new Date(bd).getTime() - new Date(ad).getTime();
      }),
    }));
}

// ── Card helpers ───────────────────────────────────────────────────
// Format a Meeting timestamp like "9:05a" / "11:30p" — lowercase shorthand
// am/pm matching the design's tight font-mono gutter.
function formatMeetingTime(raw: Date | string): string {
  const d = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(d.getTime())) return "";
  const hours24 = d.getHours();
  const minutes = d.getMinutes();
  const period = hours24 >= 12 ? "p" : "a";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")}${period}`;
}

// "18m", "42m", "1h 04m". Null when durationSeconds is missing — caller hides.
function formatDuration(durationSeconds: number | null | undefined): string | null {
  if (durationSeconds == null || durationSeconds <= 0) return null;
  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

// 5 project-tag colour variants, picked deterministically from a project id
// so the same project always renders in the same colour. Mirrors the avatar
// hash strategy in meetingCardViewModel.
const PROJECT_TAG_VARIANTS: ReadonlyArray<{ bg: string; text: string; dot: string }> = [
  { bg: "bg-brand-400/10",        text: "text-brand-400",       dot: "bg-brand-400" },
  { bg: "bg-accent-meetings/10",  text: "text-accent-meetings", dot: "bg-accent-meetings" },
  { bg: "bg-accent-crm/10",       text: "text-accent-crm",      dot: "bg-accent-crm" },
  { bg: "bg-accent-okr/10",       text: "text-accent-okr",      dot: "bg-accent-okr" },
  { bg: "bg-accent-knowledge/10", text: "text-accent-knowledge",dot: "bg-accent-knowledge" },
];

function projectTagClass(projectId: string): { bg: string; text: string; dot: string } {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) >>> 0;
  }
  return PROJECT_TAG_VARIANTS[hash % PROJECT_TAG_VARIANTS.length]!;
}

// Whether a meeting's summary carries action items the extractor can use.
function hasExtractableActions(session: { summary: string | null }): boolean {
  const summary = parseFirefliesSummary(session.summary);
  if (!summary?.action_items) return false;
  if (Array.isArray(summary.action_items)) return summary.action_items.length > 0;
  if (typeof summary.action_items === "string") return summary.action_items.trim().length > 0;
  return false;
}

function AiSummaryDisclosure({
  onContainerClick,
  children,
}: {
  onContainerClick: (e: React.MouseEvent | React.KeyboardEvent) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={onContainerClick}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 pt-1 text-[11.5px] font-medium text-text-muted hover:text-text-secondary"
        aria-expanded={open}
      >
        <IconChevronDown
          size={11}
          className={`transition-transform ${open ? "rotate-180" : "rotate-0"}`}
        />
        <span>{open ? "Hide AI summary" : "Show AI summary"}</span>
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

interface MeetingCardListProps {
  meetings: MeetingCardRow[];
  /** Edit-scoped placement candidates for the project pill picker. */
  assignableProjects: MeetingProjectOption[];
  onProjectChange: (transcriptionId: string, projectId: string | null) => void;
  /** Row selection for bulk actions; checkboxes are hidden when omitted. */
  selectedIds?: Set<string>;
  onSelectedChange?: (transcriptionId: string, selected: boolean) => void;
  // Kebab menu items — each renders only when its handler is supplied.
  onExtractActions?: (session: MeetingCardRow) => void;
  onSendToSlack?: (session: MeetingCardRow) => void;
  onSyncToIntegration?: (session: MeetingCardRow) => void;
  onArchive?: (session: MeetingCardRow) => void;
  onDelete?: (session: MeetingCardRow) => void;
}

/**
 * The day-grouped meeting card list: a sticky date gutter per local day, and
 * one card per meeting that links to its `/recording/[id]` detail page. Shared
 * by the workspace Meetings page and a project's Meetings tab so both surfaces
 * look and behave the same. Callers own the data, mutations and empty state.
 */
export function MeetingCardList({
  meetings,
  assignableProjects,
  onProjectChange,
  selectedIds,
  onSelectedChange,
  onExtractActions,
  onSendToSlack,
  onSyncToIntegration,
  onArchive,
  onDelete,
}: MeetingCardListProps) {
  const router = useRouter();
  const groups = groupMeetingsByLocalDay(meetings);

  return (
    <Stack gap={36}>
      {groups.map((group) => (
        <div
          key={group.key}
          className="grid grid-cols-[84px_minmax(0,1fr)] gap-5"
        >
          <div className="sticky top-4 self-start pt-1.5">
            <div className="text-sm font-semibold tracking-tight text-text-primary">
              {group.dayLabel}
            </div>
            <div
              className={`mt-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${
                group.isToday ? "text-brand-400" : "text-text-muted"
              }`}
            >
              {group.relativeLabel}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {group.meetings.map((session) => {
              const vmSession: MeetingCardSession = {
                id: session.id,
                sessionId: session.sessionId,
                title: session.title,
                summary: session.summary,
                project: session.project ? { id: session.project.id, name: session.project.name } : null,
                actions: session.actions ?? [],
              };
              const vmParticipants: MeetingCardParticipant[] = (session.participants ?? []).map((p) => ({
                id: p.id,
                email: p.email,
                name: p.name,
                user: p.user ? { id: p.user.id, name: p.user.name, image: p.user.image } : null,
                contact: p.contact
                  ? {
                      id: p.contact.id,
                      firstName: p.contact.firstName,
                      lastName: p.contact.lastName,
                    }
                  : null,
              }));
              const vm = buildMeetingCardViewModel(vmSession, vmParticipants);
              const detailHref = `/recording/${session.id}`;
              const navigateToDetail = () => router.push(detailHref);
              const stopBubble = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

              const time = formatMeetingTime(session.meetingDate ?? session.createdAt);
              const duration = formatDuration(session.durationSeconds);
              const provider = session.sourceIntegration?.provider;
              const tagClass = vm.projectPill
                ? projectTagClass(vm.projectPill.id)
                : null;
              const taskTool = session.project?.taskManagementTool;

              return (
                <div
                  key={session.id}
                  role="link"
                  tabIndex={0}
                  onClick={navigateToDetail}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigateToDetail();
                    }
                  }}
                  className="group cursor-pointer rounded-[10px] border border-border-subtle bg-background-secondary px-[18px] py-4 transition-colors hover:border-border-strong hover:bg-background-elevated"
                >
                  {/* Top row: checkbox + time + title block + project tag + avatars + kebab */}
                  <div className="mb-3 flex items-start gap-3">
                    {selectedIds && onSelectedChange && (
                      <Checkbox
                        mt={2}
                        checked={selectedIds.has(session.id)}
                        onChange={(event) => onSelectedChange(session.id, event.currentTarget.checked)}
                        onClick={stopBubble}
                        size="xs"
                      />
                    )}
                    <div className="w-12 pt-[3px] font-mono text-[11.5px] tabular-nums text-text-muted">
                      {time}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={detailHref}
                        onClick={stopBubble}
                        className="block truncate text-[14.5px] font-semibold leading-snug tracking-tight text-text-primary hover:text-brand-400"
                      >
                        {vm.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-text-muted">
                        {duration && (
                          <>
                            <span>{duration}</span>
                            <span className="h-[3px] w-[3px] rounded-full bg-text-faint" aria-hidden />
                          </>
                        )}
                        <span>
                          {vm.attendeeCount} attendee{vm.attendeeCount === 1 ? "" : "s"}
                        </span>
                        {provider && (
                          <>
                            <span className="h-[3px] w-[3px] rounded-full bg-text-faint" aria-hidden />
                            <span className="capitalize">via {provider}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-3">
                      {/* Project placement — searchable, grouped by workspace, across all editable workspaces */}
                      <div onClick={stopBubble}>
                        <MeetingProjectPicker
                          projects={assignableProjects}
                          value={session.projectId}
                          onChange={(projectId) => onProjectChange(session.id, projectId)}
                        >
                          {({ toggle }) =>
                            vm.projectPill && tagClass ? (
                              <button
                                type="button"
                                onClick={toggle}
                                className={`inline-flex h-[22px] max-w-[180px] items-center gap-1.5 truncate rounded px-2 text-[11.5px] font-medium ${tagClass.bg} ${tagClass.text}`}
                              >
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tagClass.dot}`} />
                                <span className="truncate">{vm.projectPill.name}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={toggle}
                                className="inline-flex h-[22px] items-center gap-1 rounded border border-dashed border-border-strong px-2 text-[11.5px] text-text-muted hover:border-brand-400 hover:text-brand-400"
                              >
                                <IconFolder size={11} />
                                <span>Assign to project</span>
                              </button>
                            )
                          }
                        </MeetingProjectPicker>
                      </div>

                      {/* Avatar stack — Participants (calendar invitees) */}
                      {vm.avatars.length > 0 && (
                        <div className="flex items-center">
                          {vm.avatars.slice(0, 3).map((a, idx) => (
                            <Tooltip key={a.key} label={a.displayName} withArrow>
                              <div
                                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-background-secondary text-[10px] font-semibold text-white group-hover:border-background-elevated ${a.colorClass}`}
                                style={{ marginLeft: idx === 0 ? 0 : -8 }}
                              >
                                {a.initials}
                              </div>
                            </Tooltip>
                          ))}
                          {vm.attendeeCount > 3 && (
                            <div
                              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background-secondary bg-surface-muted text-[10px] font-semibold text-text-secondary group-hover:border-background-elevated"
                              style={{ marginLeft: -8 }}
                            >
                              +{vm.attendeeCount - 3}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Kebab — on-hover surface */}
                      <div
                        onClick={stopBubble}
                        className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                      >
                        <Menu shadow="md" position="bottom-end">
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Meeting actions">
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconExternalLink size={14} />}
                              component={Link}
                              href={detailHref}
                            >
                              Open page
                            </Menu.Item>
                            {onExtractActions && session.projectId && !session.processedAt && hasExtractableActions(session) && (
                              <Menu.Item
                                leftSection={<IconPlayerPlay size={14} />}
                                onClick={() => onExtractActions(session)}
                              >
                                Extract actions
                              </Menu.Item>
                            )}
                            {onSendToSlack && session.processedAt && (
                              <Menu.Item
                                leftSection={<IconBrandSlack size={14} />}
                                onClick={() => onSendToSlack(session)}
                              >
                                Send summary to Slack
                              </Menu.Item>
                            )}
                            {onSyncToIntegration && taskTool && taskTool !== "internal" && vm.actionCount > 0 && (
                              <Menu.Item
                                leftSection={<IconCalendarEvent size={14} />}
                                onClick={() => onSyncToIntegration(session)}
                              >
                                Sync to {taskTool}
                              </Menu.Item>
                            )}
                            {(onArchive ?? onDelete) && <Menu.Divider />}
                            {onArchive && (
                              <Menu.Item
                                leftSection={<IconArchive size={14} />}
                                onClick={() => onArchive(session)}
                              >
                                Archive
                              </Menu.Item>
                            )}
                            {onDelete && (
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={14} />}
                                onClick={() => onDelete(session)}
                              >
                                Delete
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      </div>
                    </div>
                  </div>

                  {/* AI summary — collapsed by default; Zoe gradient panel with summary + Actions chip + Open transcript link */}
                  <AiSummaryDisclosure onContainerClick={stopBubble}>
                    <div className="flex gap-2.5 rounded-lg border border-accent-meetings/20 bg-gradient-to-b from-accent-meetings/[0.06] to-accent-meetings/[0.02] px-3.5 py-3">
                      <IconSparkles size={14} className="mt-0.5 shrink-0 text-accent-meetings" />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[13px] leading-[1.55] text-text-primary">
                          {vm.highlight ?? "Summary not yet extracted."}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1.5 rounded border border-border-subtle bg-background-primary px-2 py-[3px] text-[11px] font-medium text-brand-400">
                            <IconCheckbox size={10} />
                            <span className="font-semibold tabular-nums text-text-primary">
                              {vm.actionCount}
                            </span>
                            <span>action{vm.actionCount === 1 ? "" : "s"}</span>
                          </span>
                          <span className="flex-1" />
                          <Link
                            href={detailHref}
                            onClick={stopBubble}
                            className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] font-medium text-text-muted hover:text-brand-400"
                          >
                            Open transcript
                            <IconArrowRight size={11} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </AiSummaryDisclosure>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Stack>
  );
}

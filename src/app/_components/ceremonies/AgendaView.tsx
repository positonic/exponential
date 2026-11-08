"use client";

import Link from "next/link";
import { ActionIcon, Avatar, Badge, Checkbox, Group, Paper, Stack, Text } from "@mantine/core";
import { IconArrowDown, IconArrowUp } from "@tabler/icons-react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import type { AgendaItem, AgendaItemLive, AgendaSnapshot } from "~/server/services/ceremonies/agenda/types";
import { linkAgendaRefs, type AgendaRefLinkContext } from "./linkAgendaRefs";
import { formatDecisionLabel } from "~/lib/decision-label";
import { DecisionStatusMenu } from "~/app/_components/decisions/DecisionStatusMenu";
import { AgendaAddItem, type AgendaAddInput } from "./AgendaAddItem";

/**
 * Whether resolving the item means anything: an action gets done, an open
 * question gets decided, a point someone added by hand gets covered. A
 * cycle's progress, a project card, a key result or a meeting is context to
 * read, not a task to tick, so those get a bullet instead of a checkbox.
 */
const dueFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

/** Where a referenced Action stands right now: done, past due, or open. */
export function actionLiveState(live: Extract<AgendaItemLive, { kind: "action" }>, now = new Date()): "done" | "overdue" | "open" {
  if (live.status === "COMPLETED") return "done";
  if (live.dueDate && new Date(live.dueDate).getTime() < now.getTime()) return "overdue";
  return "open";
}

/** An item reads as resolved when someone ticked it, or when the record it references is settled. */
export function isItemResolved(item: Pick<AgendaItem, "resolvedAt" | "live">): boolean {
  if (item.resolvedAt) return true;
  if (item.live?.kind === "action") return item.live.status === "COMPLETED";
  if (item.live?.kind === "decision") return item.live.status === "ACCEPTED";
  return false;
}

const STATE_COLOR = { done: "green", overdue: "red", open: "gray" } as const;

/** Decision statuses that still ask for a decision. */
const OPEN_DECISION: ReadonlySet<string> = new Set(["OPEN", "PROPOSED"]);

/** How a Decision's status reads on an agenda line. */
function decisionStatusLabel(status: string): string {
  return status === "OPEN" ? "open question" : status.toLowerCase();
}

export function isResolvableItem(item: Pick<AgendaItem, "refType" | "addedByUserId" | "live">): boolean {
  if (item.refType === "action") return true;
  // A decision is resolvable while it is still open or proposed; one already
  // accepted (or superseded) is a fact to read, not a question to close.
  if (item.refType === "decision") return item.live?.kind !== "decision" || OPEN_DECISION.has(item.live.status);
  return item.refType === "text" && Boolean(item.addedByUserId);
}

interface AgendaViewProps {
  agenda: AgendaSnapshot;
  /** App-relative path of the OKR dashboard for goal chips. */
  goalsHref?: string;
  /** When given, items of a resolvable kind (see `isResolvableItem`) get a resolve checkbox. */
  onToggleResolved?: (itemId: string, resolved: boolean) => void;
  /** When given (with `workspaceId`), each section gets the add box: Note, Action or Decision. */
  onAddItem?: (sectionKey: string, input: AgendaAddInput) => void;
  /** The workspace the add box's owner picker and decision search look in. */
  workspaceId?: string;
  /** When given, items get move up/down controls, shown on hover or focus. */
  onReorder?: (sectionKey: string, itemIds: string[]) => void;
  /** Where D-numbers and ticket numbers in hand-added items link to. */
  refLinks?: AgendaRefLinkContext;
  /**
   * When given, an open or proposed decision item offers Decide: the
   * Decision Log's status menu, inline. `onChanged` runs after the status
   * lands (the page resolves the item on ACCEPTED and refreshes).
   */
  decide?: { workspaceId: string; onChanged: (itemId: string, status: string) => void };
}

/**
 * Renders an agenda snapshot: sections in order, items with detail and links
 * (ADR-0059). The pre-read narrative is not rendered here: it is the body of
 * the notification and the Matrix post, opened from the page's status line. Query items carry record names and render as plain text; a
 * hand-added item (by a person or an agent through `addAgendaItem`) is prose,
 * so its title and detail are Markdown (ADR-0017): a `[link](url)` becomes a
 * link, and a bare `D-0150` or `#1339` links to its record (`refLinks`).
 */
export function AgendaView({ agenda, goalsHref, onToggleResolved, onAddItem, onReorder, refLinks, decide, workspaceId }: AgendaViewProps) {
  const prose = (text: string) => (refLinks ? linkAgendaRefs(text, refLinks) : text);
  const move = (sectionKey: string, ids: string[], index: number, delta: number) => {
    const next = ids.slice();
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onReorder?.(sectionKey, next);
  };
  return (
    <Stack gap="md" data-testid="agenda-view">
      {agenda.sections.map((section) => (
        <Paper key={section.key} withBorder radius="md" p="md" data-testid={`agenda-section-${section.key}`}>
          <Group justify="space-between" mb={6}>
            <Text fw={600}>{section.title}</Text>
            {section.minutes ? (
              <Text size="xs" className="text-text-muted">
                {section.minutes} min
              </Text>
            ) : null}
          </Group>
          {section.items.length === 0 ? (
            <Text size="sm" className="text-text-muted">
              {section.emptyReason ?? "Nothing to raise"}
            </Text>
          ) : (
            <Stack gap={6}>
              {section.items.map((item, index) => (
                <div key={item.id} className="group flex items-start gap-2" data-testid={`agenda-item-${item.id}`}>
                  {onToggleResolved && isResolvableItem(item) ? (
                    <Checkbox
                      size="xs"
                      mt={3}
                      checked={isItemResolved(item)}
                      onChange={(e) => onToggleResolved(item.id, e.currentTarget.checked)}
                      aria-label={isItemResolved(item) ? "Reopen item" : "Mark item resolved"}
                      data-testid={`agenda-item-resolve-${item.id}`}
                    />
                  ) : (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <Text size="sm" td={isItemResolved(item) ? "line-through" : undefined}>
                      {item.href ? (
                        <Link href={item.href} className="hover:underline">
                          {item.title}
                        </Link>
                      ) : item.addedByUserId ? (
                        <MarkdownRenderer content={prose(item.title)} variant="inline" />
                      ) : (
                        item.title
                      )}
                      {item.carriedFromOccurrenceId && (
                        <Badge size="xs" variant="outline" ml={6}>
                          carried over
                        </Badge>
                      )}
                    </Text>
                    {item.detail && (
                      <Text size="xs" className="text-text-muted" data-testid={`agenda-item-detail-${item.id}`}>
                        {item.addedByUserId ? <MarkdownRenderer content={prose(item.detail)} variant="inline" /> : item.detail}
                      </Text>
                    )}
                    {item.live?.kind === "action" && (() => {
                      const live = item.live;
                      const state = actionLiveState(live);
                      const owners = live.assignees.map((a) => a.name ?? "Someone");
                      return (
                        <Group gap={6} mt={2} wrap="wrap" data-testid={`agenda-item-live-${item.id}`}>
                          {live.assignees.length > 0 ? (
                            <Avatar.Group spacing={6}>
                              {live.assignees.slice(0, 3).map((a) => (
                                <Avatar key={a.id} src={a.image} size={16} radius="xl" alt={a.name ?? ""}>
                                  {(a.name ?? "?").slice(0, 1)}
                                </Avatar>
                              ))}
                            </Avatar.Group>
                          ) : null}
                          <Text size="xs" className="text-text-muted">
                            {[owners.length ? owners.join(", ") : "unassigned", live.dueDate ? `due ${new Date(live.dueDate).toLocaleDateString("en-GB", dueFmt)}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                          <Badge size="xs" variant="light" color={STATE_COLOR[state]} data-testid={`agenda-item-state-${item.id}`}>
                            {state}
                          </Badge>
                        </Group>
                      );
                    })()}
                    {decide && item.live?.kind === "decision" && OPEN_DECISION.has(item.live.status) && (
                      <div className="mt-1" data-testid={`agenda-item-decide-${item.id}`}>
                        <DecisionStatusMenu
                          workspaceId={decide.workspaceId}
                          decision={{
                            id: item.refId,
                            label: formatDecisionLabel(item.live.number),
                            status: item.live.status as "OPEN" | "PROPOSED",
                          }}
                          targetLabel="Decide"
                          size="compact-xs"
                          onChanged={(status) => decide.onChanged(item.id, status)}
                        />
                      </div>
                    )}
                    {/* Query decision items already carry "D-0003 · open question" in their detail. */}
                    {item.live?.kind === "decision" && item.addedByUserId && (
                      <Group gap={6} mt={2} data-testid={`agenda-item-live-${item.id}`}>
                        <Badge size="xs" variant="outline">
                          {formatDecisionLabel(item.live.number)}
                        </Badge>
                        <Badge
                          size="xs"
                          variant="light"
                          color={OPEN_DECISION.has(item.live.status) ? "yellow" : item.live.status === "ACCEPTED" ? "green" : "gray"}
                          data-testid={`agenda-item-state-${item.id}`}
                        >
                          {decisionStatusLabel(item.live.status)}
                        </Badge>
                      </Group>
                    )}
                    {/* Goal chips (ADR-0059): what the item rolls up to, when known. */}
                    {(item.goalTitle ?? item.keyResultTitle) ? (
                      <Group gap={4} mt={2} data-testid={`agenda-goal-${item.id}`}>
                        {(() => {
                          const chips = (
                            <>
                              {item.goalTitle && (
                                <Badge size="xs" variant="light" color="brand">
                                  {item.goalTitle}
                                </Badge>
                              )}
                              {item.keyResultTitle && (
                                <Badge size="xs" variant="outline">
                                  KR · {item.keyResultTitle}
                                </Badge>
                              )}
                            </>
                          );
                          return goalsHref ? (
                            <Link href={goalsHref} className="inline-flex items-center gap-1 no-underline">
                              {chips}
                            </Link>
                          ) : (
                            chips
                          );
                        })()}
                      </Group>
                    ) : null}
                  </div>
                  {onReorder && section.items.length > 1 && (
                    <Group
                      gap={0}
                      ml="auto"
                      wrap="nowrap"
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      data-testid={`agenda-item-reorder-${item.id}`}
                    >
                      <ActionIcon size="xs" variant="subtle" color="gray" aria-label="Move up" disabled={index === 0} onClick={() => move(section.key, section.items.map((i) => i.id), index, -1)}>
                        <IconArrowUp size={12} />
                      </ActionIcon>
                      <ActionIcon size="xs" variant="subtle" color="gray" aria-label="Move down" disabled={index === section.items.length - 1} onClick={() => move(section.key, section.items.map((i) => i.id), index, 1)}>
                        <IconArrowDown size={12} />
                      </ActionIcon>
                    </Group>
                  )}
                </div>
              ))}
            </Stack>
          )}
          {onAddItem && workspaceId && <AgendaAddItem sectionKey={section.key} workspaceId={workspaceId} onAdd={onAddItem} />}
        </Paper>
      ))}
    </Stack>
  );
}

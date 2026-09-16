"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionIcon, Badge, Button, Checkbox, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconPlus } from "@tabler/icons-react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import type { AgendaSnapshot } from "~/server/services/ceremonies/agenda/types";

/** Item kinds that should roll up to an objective; the rest (cycles, text) need no chip. */
const GOAL_BEARING: ReadonlySet<string> = new Set(["action", "decision", "key_result", "ticket"]);

interface AgendaViewProps {
  agenda: AgendaSnapshot;
  /** App-relative path of the OKR dashboard for goal chips. */
  goalsHref?: string;
  /** When given, each item gets a resolve checkbox. */
  onToggleResolved?: (itemId: string, resolved: boolean) => void;
  /** When given, each section gets an "add item" input. */
  onAddItem?: (sectionKey: string, title: string) => void;
  /** When given, items get move up/down controls. */
  onReorder?: (sectionKey: string, itemIds: string[]) => void;
}

/** Renders an agenda snapshot: sections in order, items with detail and links (ADR-0059). */
export function AgendaView({ agenda, goalsHref, onToggleResolved, onAddItem, onReorder }: AgendaViewProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const move = (sectionKey: string, ids: string[], index: number, delta: number) => {
    const next = ids.slice();
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onReorder?.(sectionKey, next);
  };
  return (
    <Stack gap="md" data-testid="agenda-view">
      {agenda.narrative && (
        <Paper withBorder radius="md" p="md" data-testid="agenda-narrative">
          <Text size="xs" fw={600} tt="uppercase" className="text-text-muted" mb={6}>
            Pre-read
          </Text>
          <MarkdownRenderer content={agenda.narrative} variant="compact" />
        </Paper>
      )}
      {agenda.sections.map((section) => (
        <Paper key={section.key} withBorder radius="md" p="md" data-testid={`agenda-section-${section.key}`}>
          <Group justify="space-between" mb={6}>
            <Group gap="xs">
              <Text fw={600}>{section.title}</Text>
              <Badge size="xs" variant="light">
                {section.type.replace(/_/g, " ")}
              </Badge>
            </Group>
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
                <div key={item.id} className="flex items-start gap-2" data-testid={`agenda-item-${item.id}`}>
                  {onToggleResolved ? (
                    <Checkbox
                      size="xs"
                      mt={3}
                      checked={Boolean(item.resolvedAt)}
                      onChange={(e) => onToggleResolved(item.id, e.currentTarget.checked)}
                      aria-label={item.resolvedAt ? "Reopen item" : "Mark item resolved"}
                      data-testid={`agenda-item-resolve-${item.id}`}
                    />
                  ) : (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <Text size="sm" td={item.resolvedAt ? "line-through" : undefined}>
                      {item.href ? (
                        <Link href={item.href} className="hover:underline">
                          {item.title}
                        </Link>
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
                      <Text size="xs" className="text-text-muted">
                        {item.detail}
                      </Text>
                    )}
                    {/* Goal chips (ADR-0059): what the item rolls up to, or an honest flag that nothing does. */}
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
                    ) : GOAL_BEARING.has(item.refType) ? (
                      <Text size="xs" className="text-text-muted" fs="italic" data-testid={`agenda-nogoal-${item.id}`}>
                        no goal linked
                      </Text>
                    ) : null}
                  </div>
                  {onReorder && section.items.length > 1 && (
                    <Group gap={0} ml="auto" wrap="nowrap">
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
          {onAddItem && (
            <Group gap="xs" mt={8} wrap="nowrap">
              <TextInput
                size="xs"
                placeholder="Add an item by hand"
                value={drafts[section.key] ?? ""}
                onChange={(e) => setDrafts({ ...drafts, [section.key]: e.currentTarget.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (drafts[section.key] ?? "").trim()) {
                    onAddItem(section.key, drafts[section.key]!.trim());
                    setDrafts({ ...drafts, [section.key]: "" });
                  }
                }}
                style={{ flex: 1 }}
                data-testid={`agenda-add-${section.key}`}
              />
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={12} />}
                disabled={!(drafts[section.key] ?? "").trim()}
                onClick={() => {
                  onAddItem(section.key, drafts[section.key]!.trim());
                  setDrafts({ ...drafts, [section.key]: "" });
                }}
              >
                Add
              </Button>
            </Group>
          )}
        </Paper>
      ))}
    </Stack>
  );
}

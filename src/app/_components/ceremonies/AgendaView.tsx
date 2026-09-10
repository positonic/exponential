"use client";

import Link from "next/link";
import { Badge, Checkbox, Group, Paper, Stack, Text } from "@mantine/core";
import type { AgendaSnapshot } from "~/server/services/ceremonies/agenda/types";

interface AgendaViewProps {
  agenda: AgendaSnapshot;
  /** When given, each item gets a resolve checkbox. */
  onToggleResolved?: (itemId: string, resolved: boolean) => void;
}

/** Renders an agenda snapshot: sections in order, items with detail and links (ADR-0059). */
export function AgendaView({ agenda, onToggleResolved }: AgendaViewProps) {
  return (
    <Stack gap="md" data-testid="agenda-view">
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
              {section.items.map((item) => (
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
                  </div>
                </div>
              ))}
            </Stack>
          )}
        </Paper>
      ))}
    </Stack>
  );
}

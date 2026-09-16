"use client";

import { Avatar, Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

/**
 * The merged async summary for a standup occurrence (ADR-0059, V3): every
 * participant's submitted update, and who has yet to answer. This is the
 * meeting when it isn't held — so the people who haven't spoken are listed
 * too, rather than a tidy summary of whoever happened to reply.
 */
export function OccurrenceAsyncSummary({
  workspaceId,
  occurrenceId,
}: {
  workspaceId: string;
  occurrenceId: string;
}) {
  const { data } = api.ceremony.occurrenceUpdateSummary.useQuery({ workspaceId, occurrenceId });
  if (!data || data.questions.length === 0 || data.participants.length === 0) return null;

  const { participants, submittedCount, blockedCount } = data;
  return (
    <Paper withBorder radius="md" p="lg" data-testid="occurrence-async-summary">
      <Group justify="space-between" align="center" mb="sm">
        <Text fw={600}>Async summary</Text>
        <Group gap="xs">
          <Text size="xs" className="text-text-muted">
            {submittedCount} of {participants.length} submitted
          </Text>
          {blockedCount > 0 && (
            <Badge variant="light" color="orange" leftSection={<IconAlertTriangle size={12} />}>
              {blockedCount} blocked
            </Badge>
          )}
        </Group>
      </Group>

      <Stack gap="lg">
        {participants.map((participant) => {
          const who = participant.name ?? participant.email ?? "Someone";
          const answered = data.questions.filter((q) => participant.answers[q.key]?.trim());
          return (
            <div key={participant.userId} data-testid="async-summary-participant">
              <Group gap="xs" mb={6}>
                <Avatar src={participant.image} size={22} radius="xl">
                  {who.slice(0, 1).toUpperCase()}
                </Avatar>
                <Text size="sm" fw={500}>
                  {who}
                </Text>
                {participant.flaggedBlocker && (
                  <Badge size="xs" variant="light" color="orange">
                    blocked
                  </Badge>
                )}
                {!participant.submittedAt && (
                  <Text size="xs" className="text-text-muted">
                    hasn&apos;t answered yet
                  </Text>
                )}
              </Group>
              {participant.submittedAt && (
                <Stack gap={8} pl={30}>
                  {answered.length === 0 ? (
                    <Text size="sm" className="text-text-muted">
                      Submitted with nothing to raise.
                    </Text>
                  ) : (
                    answered.map((question) => (
                      <div key={question.key}>
                        <Text size="xs" className="text-text-muted" mb={2}>
                          {question.prompt}
                        </Text>
                        <MarkdownRenderer content={participant.answers[question.key]!} variant="compact" />
                      </div>
                    ))
                  )}
                </Stack>
              )}
            </div>
          );
        })}
      </Stack>
    </Paper>
  );
}

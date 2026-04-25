"use client";

import { Paper, Title, Text, Group, Badge, Stack, Accordion, ActionIcon, Tooltip } from "@mantine/core";
import { IconChevronRight, IconCalendar, IconChartBar } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface AssessmentHistoryListProps {
  currentAssessmentId: string;
  onCompare?: (assessmentId: string) => void;
}

export function AssessmentHistoryList({ currentAssessmentId, onCompare }: AssessmentHistoryListProps) {
  const { data: history, isLoading } = api.wheelOfLife.getAssessmentHistory.useQuery({
    limit: 10,
  });

  // Filter out the current assessment from history
  const pastAssessments = history?.filter((a) => a.id !== currentAssessmentId) ?? [];

  if (isLoading) {
    return (
      <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
        <Title order={4} mb="md">
          Assessment History
        </Title>
        <Text size="sm" c="dimmed">
          Loading history...
        </Text>
      </Paper>
    );
  }

  if (pastAssessments.length === 0) {
    return (
      <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
        <Title order={4} mb="md">
          Assessment History
        </Title>
        <Text size="sm" c="dimmed">
          This is your first assessment. Complete more assessments to track your progress over time.
        </Text>
      </Paper>
    );
  }

  return (
    <Accordion variant="contained" radius="md">
      <Accordion.Item value="history" className="border-border-primary">
        <Accordion.Control className="bg-surface-secondary">
          <Group gap="sm">
            <IconCalendar size={18} className="text-text-muted" />
            <div>
              <Text fw={600}>Assessment History</Text>
              <Text size="xs" c="dimmed">
                {pastAssessments.length} past assessment{pastAssessments.length !== 1 ? "s" : ""}
              </Text>
            </div>
          </Group>
        </Accordion.Control>
        <Accordion.Panel className="bg-surface-primary">
          <Stack gap="sm">
            {pastAssessments.map((assessment) => (
              <Paper
                key={assessment.id}
                p="md"
                radius="sm"
                className="bg-surface-secondary border border-border-primary hover:border-border-focus transition-colors cursor-pointer"
                onClick={() => onCompare?.(assessment.id)}
              >
                <Group justify="space-between" wrap="nowrap">
                  <div>
                    <Group gap="xs" mb={4}>
                      <Text size="sm" fw={500}>
                        {new Date(assessment.completedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </Text>
                      <Badge
                        size="xs"
                        variant="light"
                        color={assessment.mode === "deep" ? "violet" : "blue"}
                      >
                        {assessment.mode === "deep" ? "Deep" : "Quick"}
                      </Badge>
                      {assessment.type === "quarterly" && assessment.quarterYear && (
                        <Badge size="xs" variant="light" color="green">
                          {assessment.quarterYear}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {assessment.scores.length} domains scored
                    </Text>
                  </div>
                  <Group gap="xs">
                    {onCompare && (
                      <Tooltip label="Compare with current">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCompare(assessment.id);
                          }}
                        >
                          <IconChartBar size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <IconChevronRight size={16} className="text-text-muted" />
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

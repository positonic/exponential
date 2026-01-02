"use client";

import { Paper, Title, Text, Group, Stack, Badge, UnstyledButton } from "@mantine/core";
import { IconBolt, IconTarget } from "@tabler/icons-react";

interface ModeSelectorProps {
  onSelect: (mode: "quick" | "deep") => void;
  isLoading: boolean;
}

export function ModeSelector({ onSelect, isLoading }: ModeSelectorProps) {
  return (
    <Stack gap="lg">
      <div className="text-center mb-4">
        <Title order={3} mb="xs">
          Choose Your Assessment Mode
        </Title>
        <Text c="dimmed" size="sm">
          Select how detailed you want your assessment to be
        </Text>
      </div>

      <Group grow align="stretch">
        {/* Quick Mode */}
        <UnstyledButton
          onClick={() => !isLoading && onSelect("quick")}
          disabled={isLoading}
          className="h-auto"
        >
          <Paper
            p="xl"
            radius="md"
            className="bg-surface-primary border-2 border-border-primary hover:border-blue-500 transition-colors cursor-pointer h-full"
          >
            <Stack align="center" gap="md">
              <div className="p-4 rounded-full bg-blue-500/10">
                <IconBolt size={32} className="text-blue-500" />
              </div>
              <div className="text-center">
                <Group justify="center" gap="xs" mb="xs">
                  <Title order={4}>Quick Assessment</Title>
                  <Badge color="blue" variant="light" size="sm">
                    ~3 min
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Rank your life areas by priority only. Fast way to identify where you need to shift focus.
                </Text>
              </div>
              <Stack gap={4} mt="sm">
                <Text size="xs" c="dimmed">
                  ✓ Current priority ranking
                </Text>
                <Text size="xs" c="dimmed">
                  ✓ Desired priority ranking
                </Text>
                <Text size="xs" c="dimmed">
                  ✓ Gap analysis
                </Text>
              </Stack>
            </Stack>
          </Paper>
        </UnstyledButton>

        {/* Deep Mode */}
        <UnstyledButton
          onClick={() => !isLoading && onSelect("deep")}
          disabled={isLoading}
          className="h-auto"
        >
          <Paper
            p="xl"
            radius="md"
            className="bg-surface-primary border-2 border-border-primary hover:border-violet-500 transition-colors cursor-pointer h-full"
          >
            <Stack align="center" gap="md">
              <div className="p-4 rounded-full bg-violet-500/10">
                <IconTarget size={32} className="text-violet-500" />
              </div>
              <div className="text-center">
                <Group justify="center" gap="xs" mb="xs">
                  <Title order={4}>Deep Assessment</Title>
                  <Badge color="violet" variant="light" size="sm">
                    ~8 min
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Full assessment with priority rankings AND satisfaction scores. Get complete insights.
                </Text>
              </div>
              <Stack gap={4} mt="sm">
                <Text size="xs" c="dimmed">
                  ✓ Everything in Quick mode
                </Text>
                <Text size="xs" c="dimmed">
                  ✓ Satisfaction scores (1-10)
                </Text>
                <Text size="xs" c="dimmed">
                  ✓ Detailed recommendations
                </Text>
              </Stack>
            </Stack>
          </Paper>
        </UnstyledButton>
      </Group>
    </Stack>
  );
}

"use client";

import { useState } from "react";
import {
  Stack,
  Group,
  Title,
  Text,
  Button,
  Paper,
  Textarea,
  List,
  Badge,
  Loader,
} from "@mantine/core";
import { IconArrowLeft, IconCheck } from "@tabler/icons-react";
import type { RouterOutputs } from "~/trpc/react";
import { HTMLContent } from "~/app/_components/HTMLContent";

type DailyPlan = RouterOutputs["dailyPlan"]["getOrCreateToday"];
type DailyPlanAction = DailyPlan["plannedActions"][number];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface DocumentStepProps {
  dailyPlan: DailyPlan;
  tasks: DailyPlanAction[];
  totalMinutes: number;
  onUpdatePlan: (updates: { obstacles?: string }) => Promise<void>;
  onComplete: () => Promise<void>;
  onBack: () => void;
  isLoading: boolean;
}

export function DocumentStep({
  dailyPlan,
  tasks,
  totalMinutes,
  onUpdatePlan,
  onComplete,
  onBack,
  isLoading,
}: DocumentStepProps) {
  const [obstacles, setObstacles] = useState(dailyPlan.obstacles ?? "");

  const handleObstaclesChange = (value: string) => {
    setObstacles(value);
  };

  const handleObstaclesBlur = () => {
    void onUpdatePlan({ obstacles });
  };

  return (
    <Group align="flex-start" gap={60} wrap="nowrap">
      {/* Left: Summary Card */}
      <Stack flex={1} gap="lg" maw={500}>
        <div>
          <Title
            order={2}
            className="text-text-primary"
            style={{ fontStyle: "italic" }}
          >
            Daily plan
          </Title>
          <Text c="dimmed" mt="xs">
            Document and share your plan for today.
          </Text>
        </div>

        <Paper
          p="lg"
          className="bg-surface-secondary border border-border-primary"
        >
          <Stack gap="lg">
            {/* Planned for today */}
            <div>
              <Title order={4} mb="sm" className="text-text-primary" fw={600}>
                Planned for today
              </Title>
              <List spacing="xs" size="sm">
                {tasks.map((task) => (
                  <List.Item
                    key={task.id}
                    icon={
                      <IconCheck
                        size={14}
                        className="text-text-muted"
                        style={{ marginTop: 4 }}
                      />
                    }
                  >
                    <Group gap="xs">
                      <Text className="text-text-primary" component="div">
                        <HTMLContent html={task.name} />
                      </Text>
                      <Text span c="dimmed" fs="italic">
                        · {formatDuration(task.duration)}
                      </Text>
                    </Group>
                  </List.Item>
                ))}
              </List>
              {tasks.length === 0 && (
                <Text c="dimmed" size="sm">
                  No tasks planned
                </Text>
              )}
            </div>

            {/* Obstacles */}
            <div>
              <Title order={4} mb="sm" className="text-text-primary" fw={600}>
                Obstacles in my way
              </Title>
              <Textarea
                placeholder="write things here"
                value={obstacles}
                onChange={(e) => handleObstaclesChange(e.target.value)}
                onBlur={handleObstaclesBlur}
                autosize
                minRows={2}
                classNames={{
                  input: "bg-surface-primary border-border-primary",
                }}
              />
            </div>
          </Stack>
        </Paper>

        {/* Action Buttons */}
        <Group>
          <Button
            variant="default"
            onClick={onBack}
            leftSection={<IconArrowLeft size={16} />}
            className="border-border-primary"
          >
            Back
          </Button>
          <Button
            onClick={() => void onComplete()}
            disabled={isLoading}
            className="bg-brand-primary hover:bg-brand-primary/90"
          >
            {isLoading ? <Loader size="xs" color="white" /> : "Get started"}
          </Button>
        </Group>
      </Stack>

      {/* Right: Task Cards Preview */}
      <Stack w={350} gap="md">
        <Text fw={600} size="sm" c="dimmed">
          Today&apos;s Tasks
        </Text>

        <Stack gap="sm">
          {tasks.map((task) => (
            <Paper
              key={task.id}
              p="md"
              className="bg-surface-secondary border border-border-primary"
            >
              <Group justify="space-between" mb="xs">
                {task.scheduledStart ? (
                  <Text size="xs" c="dimmed">
                    {formatTime(new Date(task.scheduledStart))}
                    {task.scheduledEnd &&
                      ` - ${formatTime(new Date(task.scheduledEnd))}`}
                  </Text>
                ) : (
                  <Text size="xs" c="dimmed">
                    Flexible
                  </Text>
                )}
                <Badge variant="light" color="gray" size="sm">
                  {formatDuration(task.duration)}
                </Badge>
              </Group>
              <Text fw={500} className="text-text-primary" component="div">
                <HTMLContent html={task.name} />
              </Text>
              {task.source !== "manual" && (
                <Badge size="xs" variant="light" color="blue" mt="xs">
                  #{task.source}
                </Badge>
              )}
            </Paper>
          ))}
        </Stack>

        {tasks.length > 0 && (
          <Paper p="sm" className="bg-surface-tertiary border border-border-primary">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Total planned time
              </Text>
              <Text fw={600} className="text-text-primary">
                {formatDuration(totalMinutes)}
              </Text>
            </Group>
          </Paper>
        )}
      </Stack>
    </Group>
  );
}

"use client";

import { useState } from "react";
import {
  Card,
  Group,
  Text,
  Progress,
  NumberInput,
  Button,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { IconPencil, IconRotateClockwise } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  keyResultProgress,
  type KrForProgress,
} from "~/server/services/goalProgress";

interface GoalProgressControlProps {
  goalId: number;
  /** Resolved progress (manual override > KR mean > null) from the server. */
  resolvedProgress: number | null;
  /** Whether the resolved value comes from a manual override. */
  isManual: boolean;
  /** Key results, used to show the auto KR value as a hint when overridden. */
  keyResults: KrForProgress[];
  onChange?: () => void;
}

/**
 * Goal progress display + manual override editor.
 *
 * Reads the server-resolved progress and lets the user set or clear a manual
 * override. A manual value always wins; clearing it reverts to the KR-derived
 * mean (or "Not started" when the goal has no measurable key results).
 */
export function GoalProgressControl({
  goalId,
  resolvedProgress,
  isManual,
  keyResults,
  onChange,
}: GoalProgressControlProps) {
  const utils = api.useUtils();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | string>(resolvedProgress ?? 0);

  const setOverride = api.goal.setProgressOverride.useMutation({
    onSuccess: async () => {
      await utils.goal.getById.invalidate({ id: goalId });
      onChange?.();
      setEditing(false);
    },
  });

  const autoValue = keyResultProgress(keyResults);
  const hasProgress = resolvedProgress !== null;

  const startEditing = () => {
    setDraft(resolvedProgress ?? 0);
    setEditing(true);
  };

  const save = () => {
    const value = typeof draft === "number" ? draft : Number(draft);
    setOverride.mutate({
      id: goalId,
      progress: Number.isFinite(value) ? value : 0,
    });
  };

  const revertToAuto = () => {
    setOverride.mutate({ id: goalId, progress: null });
  };

  return (
    <Card withBorder radius="md" p="lg" className="border-border-primary">
      <Group justify="space-between" mb="sm">
        <Text size="sm" fw={500} className="text-text-muted">
          Progress
        </Text>
        {!editing && (
          <Group gap={6} className="cursor-pointer" onClick={startEditing}>
            <IconPencil size={14} className="text-text-muted" />
            <Text size="sm" className="text-text-secondary">
              {hasProgress ? "Edit" : "Set progress"}
            </Text>
          </Group>
        )}
      </Group>

      {editing ? (
        <Group gap="sm" align="flex-end">
          <NumberInput
            label="Manual progress"
            value={draft}
            onChange={setDraft}
            min={0}
            max={100}
            suffix="%"
            clampBehavior="strict"
            w={160}
            aria-label="Manual goal progress percentage"
          />
          <Button
            variant="filled"
            color="brand"
            onClick={save}
            loading={setOverride.isPending}
          >
            Save
          </Button>
          {isManual && (
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconRotateClockwise size={14} />}
              onClick={revertToAuto}
              loading={setOverride.isPending}
            >
              Revert to auto
            </Button>
          )}
          <Button variant="subtle" color="gray" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </Group>
      ) : hasProgress ? (
        <>
          <Group gap="sm" align="center">
            <Progress
              value={resolvedProgress}
              color="brand"
              radius="xl"
              size="md"
              className="flex-1"
            />
            <Text size="sm" fw={600} className="tabular-nums text-text-primary">
              {resolvedProgress}%
            </Text>
          </Group>
          <Group gap={6} mt={6}>
            <Text size="xs" c="dimmed">
              {isManual ? "Set manually" : "From key results"}
            </Text>
            {isManual && autoValue !== null && autoValue !== resolvedProgress && (
              <Text size="xs" c="dimmed">
                · key results say {autoValue}%
              </Text>
            )}
            {isManual && (
              <Tooltip label="Revert to auto (key results)">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color="gray"
                  aria-label="Revert progress to auto"
                  onClick={revertToAuto}
                  loading={setOverride.isPending}
                >
                  <IconRotateClockwise size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Not started — no key results to measure. Set progress manually.
        </Text>
      )}
    </Card>
  );
}

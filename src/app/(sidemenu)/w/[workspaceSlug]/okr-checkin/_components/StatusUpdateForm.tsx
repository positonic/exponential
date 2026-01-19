"use client";

import { useState, useEffect } from "react";
import { Textarea, Button, Group, Stack, Text, Badge } from "@mantine/core";
import { IconSend, IconDeviceFloppy } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface StatusUpdate {
  id: string;
  accomplishments: string | null;
  blockers: string | null;
  priorities: string | null;
  isSubmitted: boolean;
  submittedAt: Date | null;
}

interface StatusUpdateFormProps {
  okrCheckinId: string;
  existingUpdate?: StatusUpdate;
  onSubmit?: () => void;
}

export function StatusUpdateForm({
  okrCheckinId,
  existingUpdate,
  onSubmit,
}: StatusUpdateFormProps) {
  const [accomplishments, setAccomplishments] = useState(existingUpdate?.accomplishments ?? "");
  const [blockers, setBlockers] = useState(existingUpdate?.blockers ?? "");
  const [priorities, setPriorities] = useState(existingUpdate?.priorities ?? "");
  const [isSubmitted, setIsSubmitted] = useState(existingUpdate?.isSubmitted ?? false);

  // Update form when existingUpdate changes
  useEffect(() => {
    if (existingUpdate) {
      setAccomplishments(existingUpdate.accomplishments ?? "");
      setBlockers(existingUpdate.blockers ?? "");
      setPriorities(existingUpdate.priorities ?? "");
      setIsSubmitted(existingUpdate.isSubmitted);
    }
  }, [existingUpdate]);

  const upsertMutation = api.okrCheckin.upsertStatusUpdate.useMutation({
    onSuccess: (data) => {
      if (data.isSubmitted) {
        notifications.show({
          title: "Status Submitted",
          message: "Your status update has been submitted for the team to review.",
          color: "green",
        });
        setIsSubmitted(true);
        onSubmit?.();
      } else {
        notifications.show({
          title: "Draft Saved",
          message: "Your status update has been saved as a draft.",
          color: "blue",
        });
      }
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const handleSaveDraft = () => {
    upsertMutation.mutate({
      okrCheckinId,
      accomplishments,
      blockers,
      priorities,
      isSubmitted: false,
    });
  };

  const handleSubmit = () => {
    upsertMutation.mutate({
      okrCheckinId,
      accomplishments,
      blockers,
      priorities,
      isSubmitted: true,
    });
  };

  const hasContent = accomplishments.trim() || blockers.trim() || priorities.trim();

  return (
    <Stack gap="md">
      {isSubmitted && (
        <Badge color="green" size="lg" variant="light">
          Submitted {existingUpdate?.submittedAt && `on ${new Date(existingUpdate.submittedAt).toLocaleString()}`}
        </Badge>
      )}

      <div>
        <Text size="sm" fw={500} mb={4}>
          What did you accomplish this week?
        </Text>
        <Textarea
          placeholder="Share your wins and completed work..."
          value={accomplishments}
          onChange={(e) => setAccomplishments(e.target.value)}
          minRows={3}
          disabled={isSubmitted}
        />
      </div>

      <div>
        <Text size="sm" fw={500} mb={4}>
          What&apos;s blocking you?
        </Text>
        <Textarea
          placeholder="Any blockers or challenges you need help with..."
          value={blockers}
          onChange={(e) => setBlockers(e.target.value)}
          minRows={2}
          disabled={isSubmitted}
        />
      </div>

      <div>
        <Text size="sm" fw={500} mb={4}>
          What are your priorities for next week?
        </Text>
        <Textarea
          placeholder="Top 2-3 things you'll focus on..."
          value={priorities}
          onChange={(e) => setPriorities(e.target.value)}
          minRows={2}
          disabled={isSubmitted}
        />
      </div>

      {!isSubmitted && (
        <Group justify="flex-end" mt="sm">
          <Button
            variant="light"
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSaveDraft}
            loading={upsertMutation.isPending}
            disabled={!hasContent}
          >
            Save Draft
          </Button>
          <Button
            leftSection={<IconSend size={16} />}
            onClick={handleSubmit}
            loading={upsertMutation.isPending}
            disabled={!hasContent}
          >
            Submit
          </Button>
        </Group>
      )}
    </Stack>
  );
}

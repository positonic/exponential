"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Title,
  Text,
  Button,
  Group,
  Stack,
  Progress,
  Badge,
  Textarea,
  ActionIcon,
  Alert,
} from "@mantine/core";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconCheck,
  IconAlertCircle,
  IconCircleDot,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface AgendaItem {
  id: string;
  order: number;
  type: string;
  title: string;
  durationMinutes: number;
  isCompleted: boolean;
  notes: string | null;
}

interface Checkin {
  id: string;
  status: string;
  startedAt: Date | null;
  agendaItems: AgendaItem[];
}

interface MeetingViewProps {
  checkin: Checkin;
  onComplete: () => void;
}

export function MeetingView({ checkin, onComplete }: MeetingViewProps) {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState("");

  const sortedAgendaItems = [...checkin.agendaItems].sort((a, b) => a.order - b.order);
  const currentItem = sortedAgendaItems[currentItemIndex];
  const totalDuration = sortedAgendaItems.reduce((sum, item) => sum + item.durationMinutes, 0);
  const completedDuration = sortedAgendaItems
    .filter((item) => item.isCompleted)
    .reduce((sum, item) => sum + item.durationMinutes, 0);

  // Initialize timer when current item changes
  useEffect(() => {
    if (currentItem && !currentItem.isCompleted) {
      setTimeRemaining(currentItem.durationMinutes * 60);
    }
  }, [currentItem]);

  // Timer countdown
  useEffect(() => {
    if (!isRunning || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining]);

  const startMeetingMutation = api.okrCheckin.startMeeting.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Meeting Started",
        message: "The OKR check-in meeting has begun.",
        color: "green",
      });
      setIsRunning(true);
      onComplete();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const completeMeetingMutation = api.okrCheckin.completeMeeting.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Meeting Completed",
        message: "The OKR check-in has been marked as complete.",
        color: "green",
      });
      onComplete();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const updateAgendaItemMutation = api.okrCheckin.updateAgendaItem.useMutation({
    onSuccess: () => {
      onComplete();
    },
  });

  const handleStartMeeting = () => {
    startMeetingMutation.mutate({ okrCheckinId: checkin.id });
  };

  const handleCompleteItem = useCallback(() => {
    if (!currentItem) return;

    updateAgendaItemMutation.mutate({
      agendaItemId: currentItem.id,
      isCompleted: true,
    });

    // Move to next item
    if (currentItemIndex < sortedAgendaItems.length - 1) {
      setCurrentItemIndex((prev) => prev + 1);
      setIsRunning(true);
    } else {
      setIsRunning(false);
    }
  }, [currentItem, currentItemIndex, sortedAgendaItems.length, updateAgendaItemMutation]);

  const handleCompleteMeeting = () => {
    completeMeetingMutation.mutate({
      okrCheckinId: checkin.id,
      notes: meetingNotes || undefined,
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isOvertime = timeRemaining === 0 && isRunning === false && currentItem && !currentItem.isCompleted;

  // Meeting not started yet
  if (checkin.status === "PREPARING") {
    return (
      <Card withBorder p="xl">
        <Stack align="center" gap="lg">
          <Title order={2}>Ready to Start?</Title>
          <Text c="dimmed" ta="center" maw={400}>
            Once you start the meeting, the timer will begin. Make sure all team members
            have submitted their status updates.
          </Text>
          <Group>
            <Text size="sm" c="dimmed">
              Estimated duration: {totalDuration} minutes
            </Text>
          </Group>
          <Button
            size="lg"
            leftSection={<IconPlayerPlay size={20} />}
            onClick={handleStartMeeting}
            loading={startMeetingMutation.isPending}
          >
            Start Meeting
          </Button>
        </Stack>
      </Card>
    );
  }

  // All items completed
  const allCompleted = sortedAgendaItems.every((item) => item.isCompleted);

  return (
    <Stack gap="lg">
      {/* Progress Bar */}
      <Card withBorder p="md">
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={500}>Meeting Progress</Text>
          <Text size="sm" c="dimmed">
            {completedDuration} / {totalDuration} min
          </Text>
        </Group>
        <Progress
          value={(completedDuration / totalDuration) * 100}
          size="lg"
          radius="xl"
          color="green"
        />
      </Card>

      {/* Current Agenda Item */}
      {currentItem && !allCompleted && (
        <Card withBorder p="lg">
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Badge mb="xs">{currentItem.type.replace("_", " ")}</Badge>
                <Title order={3}>{currentItem.title}</Title>
              </div>
              <div className="text-center">
                <Text
                  size="xl"
                  fw={700}
                  c={isOvertime ? "red" : timeRemaining < 60 ? "orange" : undefined}
                >
                  {formatTime(timeRemaining)}
                </Text>
                <Text size="xs" c="dimmed">
                  {isOvertime ? "Overtime!" : "remaining"}
                </Text>
              </div>
            </Group>

            {isOvertime && (
              <Alert icon={<IconAlertCircle size={16} />} color="orange">
                Time&apos;s up for this item. Consider wrapping up or extending if needed.
              </Alert>
            )}

            <Group>
              <Button
                variant={isRunning ? "light" : "filled"}
                leftSection={isRunning ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                onClick={() => setIsRunning(!isRunning)}
              >
                {isRunning ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="light"
                color="green"
                leftSection={<IconCheck size={16} />}
                onClick={handleCompleteItem}
                loading={updateAgendaItemMutation.isPending}
              >
                Complete & Next
              </Button>
              <ActionIcon
                variant="subtle"
                size="lg"
                onClick={() => setTimeRemaining((prev) => prev + 60)}
                title="Add 1 minute"
              >
                +1m
              </ActionIcon>
            </Group>
          </Stack>
        </Card>
      )}

      {/* Agenda Overview */}
      <Card withBorder p="md">
        <Title order={4} mb="md">Agenda</Title>
        <Stack gap="xs">
          {sortedAgendaItems.map((item, index) => (
            <Group
              key={item.id}
              justify="space-between"
              p="xs"
              className={`rounded ${index === currentItemIndex && !allCompleted ? "bg-surface-hover" : ""}`}
            >
              <Group gap="sm">
                {item.isCompleted ? (
                  <IconCheck size={16} className="text-green-500" />
                ) : index === currentItemIndex ? (
                  <IconPlayerPlay size={16} className="text-blue-500" />
                ) : (
                  <IconCircleDot size={16} className="text-text-muted" />
                )}
                <Text size="sm" c={item.isCompleted ? "dimmed" : undefined}>
                  {item.title}
                </Text>
              </Group>
              <Text size="sm" c="dimmed">
                {item.durationMinutes}m
              </Text>
            </Group>
          ))}
        </Stack>
      </Card>

      {/* Complete Meeting */}
      {allCompleted && (
        <Card withBorder p="lg">
          <Stack gap="md">
            <Title order={3}>Wrap Up</Title>
            <Text c="dimmed">
              All agenda items are complete. Add any final notes and complete the meeting.
            </Text>
            <Textarea
              label="Meeting Notes (optional)"
              placeholder="Key decisions, action items, or follow-ups..."
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
              minRows={3}
            />
            <Button
              size="lg"
              color="green"
              leftSection={<IconCheck size={20} />}
              onClick={handleCompleteMeeting}
              loading={completeMeetingMutation.isPending}
            >
              Complete Meeting
            </Button>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

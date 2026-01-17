"use client";

import { useEffect, useState, useCallback } from "react";
import { Group, Text, Badge, ActionIcon, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconClock, IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";

interface ReviewTimerProps {
  initialMinutes: number;
  onTimeUp?: () => void;
  isActive?: boolean;
}

export function ReviewTimer({
  initialMinutes,
  onTimeUp,
  isActive = true,
}: ReviewTimerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(initialMinutes * 60);
  const [isPaused, setIsPaused] = useState(false);
  const [hasNotified, setHasNotified] = useState(false);

  const isOvertime = secondsRemaining < 0;
  const absSeconds = Math.abs(secondsRemaining);
  const minutes = Math.floor(absSeconds / 60);
  const seconds = absSeconds % 60;

  const formatTime = useCallback(() => {
    const prefix = isOvertime ? "+" : "";
    return `${prefix}${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [minutes, seconds, isOvertime]);

  useEffect(() => {
    if (!isActive || isPaused) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, isPaused]);

  // Show notification when time is up
  useEffect(() => {
    if (secondsRemaining === 0 && !hasNotified) {
      setHasNotified(true);
      notifications.show({
        title: "Time's up!",
        message: "You've hit your time box. Wrap up when you're ready, or keep going.",
        color: "yellow",
        autoClose: 10000,
        withCloseButton: true,
      });
      onTimeUp?.();
    }
  }, [secondsRemaining, hasNotified, onTimeUp]);

  const getTimerColor = () => {
    if (isOvertime) return "red";
    if (secondsRemaining <= 60) return "orange";
    if (secondsRemaining <= 180) return "yellow";
    return "gray";
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  return (
    <Group gap="xs" align="center">
      <Badge
        size="lg"
        variant="light"
        color={getTimerColor()}
        leftSection={<IconClock size={14} />}
        className="font-mono"
      >
        {formatTime()}
      </Badge>
      <Tooltip label={isPaused ? "Resume timer" : "Pause timer"}>
        <ActionIcon
          variant="subtle"
          size="sm"
          color="gray"
          onClick={togglePause}
        >
          {isPaused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
        </ActionIcon>
      </Tooltip>
      {isOvertime && (
        <Text size="xs" className="text-text-muted">
          overtime
        </Text>
      )}
    </Group>
  );
}

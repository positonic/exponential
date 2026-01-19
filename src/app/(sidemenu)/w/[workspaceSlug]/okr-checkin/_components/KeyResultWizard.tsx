"use client";

import { useState } from "react";
import {
  Card,
  Title,
  Text,
  Button,
  Group,
  Stack,
  Progress,
  Badge,
  NumberInput,
  Textarea,
  Slider,
  SegmentedControl,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconTarget,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface KeyResult {
  id: string;
  title: string;
  description: string | null;
  startValue: number;
  currentValue: number;
  targetValue: number;
  unit: string;
  unitLabel: string | null;
  status: string;
  confidence: number | null;
  goal: {
    id: number;
    title: string;
    lifeDomain: {
      title: string;
      color: string | null;
    } | null;
  };
  checkIns: Array<{
    id: string;
    createdAt: Date;
    previousValue: number;
    newValue: number;
    notes: string | null;
  }>;
}

interface CheckinUpdate {
  keyResultId: string;
  keyResultTitle: string;
  objectiveTitle: string;
  previousValue: number;
  newValue: number;
  notes?: string;
}

interface KeyResultWizardProps {
  keyResults: KeyResult[];
  onComplete: (updates: CheckinUpdate[]) => void;
  onBack: () => void;
}

export function KeyResultWizard({ keyResults, onComplete, onBack }: KeyResultWizardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [updates, setUpdates] = useState<CheckinUpdate[]>([]);

  // Current KR state
  const [newValue, setNewValue] = useState<number | string>("");
  const [notes, setNotes] = useState("");
  const [confidence, setConfidence] = useState<number>(70);
  const [status, setStatus] = useState<string>("on-track");

  const currentKR = keyResults[currentIndex];
  const isLastKR = currentIndex === keyResults.length - 1;
  const progress = ((currentIndex + 1) / keyResults.length) * 100;

  // Calculate progress percentage for current KR
  const getKRProgress = (kr: KeyResult) => {
    const range = kr.targetValue - kr.startValue;
    if (range === 0) return 0;
    return Math.min(100, Math.max(0, ((kr.currentValue - kr.startValue) / range) * 100));
  };

  // Initialize state when current KR changes
  const initializeCurrentKR = () => {
    if (currentKR) {
      setNewValue(currentKR.currentValue);
      setNotes("");
      setConfidence(currentKR.confidence ?? 70);
      setStatus(currentKR.status);
    }
  };

  // Check-in mutation
  const checkInMutation = api.okr.checkIn.useMutation({
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  // Update mutation for confidence/status
  const updateMutation = api.okr.update.useMutation({
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  // Handle saving current KR and moving to next
  const handleNext = async () => {
    if (!currentKR) return;

    const numericValue = typeof newValue === "string" ? parseFloat(newValue) : newValue;

    // Only create check-in if value changed
    if (numericValue !== currentKR.currentValue) {
      await checkInMutation.mutateAsync({
        keyResultId: currentKR.id,
        newValue: numericValue,
        notes: notes || undefined,
      });
    }

    // Update confidence if changed
    if (confidence !== currentKR.confidence) {
      await updateMutation.mutateAsync({
        id: currentKR.id,
        confidence,
      });
    }

    // Record the update
    const update: CheckinUpdate = {
      keyResultId: currentKR.id,
      keyResultTitle: currentKR.title,
      objectiveTitle: currentKR.goal.title,
      previousValue: currentKR.currentValue,
      newValue: numericValue,
      notes: notes || undefined,
    };

    const newUpdates = [...updates, update];
    setUpdates(newUpdates);

    if (isLastKR) {
      onComplete(newUpdates);
    } else {
      setCurrentIndex((prev) => prev + 1);
      // Reset form for next KR
      const nextKR = keyResults[currentIndex + 1];
      if (nextKR) {
        setNewValue(nextKR.currentValue);
        setNotes("");
        setConfidence(nextKR.confidence ?? 70);
        setStatus(nextKR.status);
      }
    }
  };

  // Handle skipping current KR
  const handleSkip = () => {
    if (isLastKR) {
      onComplete(updates);
    } else {
      setCurrentIndex((prev) => prev + 1);
      const nextKR = keyResults[currentIndex + 1];
      if (nextKR) {
        setNewValue(nextKR.currentValue);
        setNotes("");
        setConfidence(nextKR.confidence ?? 70);
        setStatus(nextKR.status);
      }
    }
  };

  // Handle going back
  const handlePrevious = () => {
    if (currentIndex === 0) {
      onBack();
    } else {
      setCurrentIndex((prev) => prev - 1);
      const prevKR = keyResults[currentIndex - 1];
      if (prevKR) {
        // Try to restore previous update if exists
        const prevUpdate = updates.find((u) => u.keyResultId === prevKR.id);
        setNewValue(prevUpdate?.newValue ?? prevKR.currentValue);
        setNotes(prevUpdate?.notes ?? "");
        setConfidence(prevKR.confidence ?? 70);
        setStatus(prevKR.status);
      }
    }
  };

  // Initialize on mount
  useState(() => {
    initializeCurrentKR();
  });

  if (!currentKR) return null;

  const currentProgress = getKRProgress(currentKR);
  const unitDisplay = currentKR.unitLabel ?? currentKR.unit;

  return (
    <Stack gap="lg">
      {/* Progress indicator */}
      <Card withBorder p="sm">
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={500}>
            Key Result {currentIndex + 1} of {keyResults.length}
          </Text>
          <Text size="sm" c="dimmed">
            {Math.round(progress)}% complete
          </Text>
        </Group>
        <Progress value={progress} size="sm" radius="xl" color="brand" />
      </Card>

      {/* Current Key Result Card */}
      <Card withBorder p="lg">
        <Stack gap="md">
          {/* Objective context */}
          <div>
            <Group gap="xs" mb="xs">
              <IconTarget size={14} className="text-text-muted" />
              <Text size="xs" c="dimmed">Objective</Text>
            </Group>
            <Text size="sm" fw={500} className="text-text-secondary">
              {currentKR.goal.title}
            </Text>
            {currentKR.goal.lifeDomain && (
              <Badge size="xs" variant="light" mt="xs">
                {currentKR.goal.lifeDomain.title}
              </Badge>
            )}
          </div>

          {/* Key Result title */}
          <div>
            <Title order={3} className="text-text-primary">
              {currentKR.title}
            </Title>
            {currentKR.description && (
              <Text size="sm" c="dimmed" mt="xs">
                {currentKR.description}
              </Text>
            )}
          </div>

          {/* Current progress visualization */}
          <Card withBorder p="md" className="bg-surface-secondary">
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed">Current Progress</Text>
              <Badge
                color={
                  currentKR.status === "achieved"
                    ? "green"
                    : currentKR.status === "on-track"
                      ? "blue"
                      : currentKR.status === "at-risk"
                        ? "yellow"
                        : "red"
                }
              >
                {currentKR.status.replace("-", " ")}
              </Badge>
            </Group>
            <Progress
              value={currentProgress}
              size="xl"
              radius="md"
              color={
                currentKR.status === "achieved"
                  ? "green"
                  : currentKR.status === "on-track"
                    ? "blue"
                    : currentKR.status === "at-risk"
                      ? "yellow"
                      : "red"
              }
            />
            <Group justify="space-between" mt="xs">
              <Text size="xs" c="dimmed">
                Start: {currentKR.startValue} {unitDisplay}
              </Text>
              <Text size="sm" fw={600}>
                {currentKR.currentValue} / {currentKR.targetValue} {unitDisplay}
              </Text>
              <Text size="xs" c="dimmed">
                Target: {currentKR.targetValue} {unitDisplay}
              </Text>
            </Group>
          </Card>

          {/* Update form */}
          <div>
            <Text size="sm" fw={500} mb="sm">
              Update Progress
            </Text>
            <NumberInput
              value={newValue}
              onChange={setNewValue}
              label={`New value (${unitDisplay})`}
              placeholder={`Enter new value in ${unitDisplay}`}
              min={0}
              size="md"
            />
          </div>

          {/* Confidence slider */}
          <div>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>
                Confidence Level
              </Text>
              <Badge variant="light">{confidence}%</Badge>
            </Group>
            <Slider
              value={confidence}
              onChange={setConfidence}
              min={0}
              max={100}
              step={5}
              marks={[
                { value: 0, label: "0%" },
                { value: 50, label: "50%" },
                { value: 100, label: "100%" },
              ]}
              color={confidence >= 70 ? "green" : confidence >= 40 ? "yellow" : "red"}
            />
            <Text size="xs" c="dimmed" mt="xs">
              How confident are you in achieving this Key Result by the end of the period?
            </Text>
          </div>

          {/* Status override */}
          <div>
            <Text size="sm" fw={500} mb="sm">
              Status (auto-calculated, can override)
            </Text>
            <SegmentedControl
              value={status}
              onChange={setStatus}
              data={[
                { value: "on-track", label: "On Track" },
                { value: "at-risk", label: "At Risk" },
                { value: "off-track", label: "Off Track" },
                { value: "achieved", label: "Achieved" },
              ]}
              fullWidth
            />
          </div>

          {/* Notes */}
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            label="Notes (optional)"
            placeholder="What progress did you make? Any blockers or learnings?"
            minRows={2}
          />
        </Stack>
      </Card>

      {/* Navigation */}
      <Group justify="space-between">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={handlePrevious}
        >
          {currentIndex === 0 ? "Back to Period" : "Previous"}
        </Button>

        <Group gap="sm">
          <Button variant="light" onClick={handleSkip}>
            Skip
          </Button>
          <Button
            rightSection={isLastKR ? <IconCheck size={16} /> : <IconArrowRight size={16} />}
            onClick={handleNext}
            loading={checkInMutation.isPending || updateMutation.isPending}
          >
            {isLastKR ? "Complete Check-in" : "Next"}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

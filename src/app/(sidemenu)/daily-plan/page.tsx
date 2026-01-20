"use client";

import { useState, useMemo } from "react";
import { Container, Stepper, Loader, Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { WelcomeStep } from "./_components/steps/WelcomeStep";
import { AddTaskStep } from "./_components/steps/AddTaskStep";
import { EstimateTimingStep } from "./_components/steps/EstimateTimingStep";
import { FillDayStep } from "./_components/steps/FillDayStep";
import { ScheduleStep } from "./_components/steps/ScheduleStep";
import { DocumentStep } from "./_components/steps/DocumentStep";
import type { RouterOutputs } from "~/trpc/react";

type WizardStep =
  | "welcome"
  | "add-task"
  | "estimate"
  | "fill-day"
  | "schedule"
  | "document";

type DailyPlan = RouterOutputs["dailyPlan"]["getOrCreateToday"];
type DailyPlanAction = DailyPlan["plannedActions"][number];

export default function DailyPlanPage() {
  const [currentStep, setCurrentStep] = useState<WizardStep>("welcome");

  // Get or create today's daily plan (no workspace - user-level)
  const {
    data: dailyPlan,
    isLoading: planLoading,
    refetch: refetchPlan,
  } = api.dailyPlan.getOrCreateToday.useQuery({});

  // Mutations
  const addTaskMutation = api.dailyPlan.addTask.useMutation({
    onSuccess: () => void refetchPlan(),
  });

  const updateTaskMutation = api.dailyPlan.updateTask.useMutation({
    onSuccess: () => void refetchPlan(),
  });

  const removeTaskMutation = api.dailyPlan.removeTask.useMutation({
    onSuccess: () => void refetchPlan(),
  });

  const reorderTasksMutation = api.dailyPlan.reorderTasks.useMutation({
    onSuccess: () => void refetchPlan(),
  });

  const updatePlanMutation = api.dailyPlan.updatePlan.useMutation({
    onSuccess: () => void refetchPlan(),
  });

  const completePlanMutation = api.dailyPlan.completePlan.useMutation();

  // Computed values
  const tasks = dailyPlan?.plannedActions ?? [];
  const totalPlannedMinutes = useMemo(
    () => tasks.reduce((sum: number, task: { duration: number }) => sum + task.duration, 0),
    [tasks]
  );

  // Step index for stepper (0-based, steps 1-6 in UI)
  const getStepIndex = () => {
    switch (currentStep) {
      case "welcome":
        return -1; // Before first step
      case "add-task":
        return 0;
      case "estimate":
        return 1;
      case "fill-day":
        return 2;
      case "schedule":
        return 4; // Skip prioritize (combined with fill-day)
      case "document":
        return 5;
      default:
        return 0;
    }
  };

  // Task handlers
  const handleAddTask = async (name: string, duration = 30) => {
    if (!dailyPlan) return;
    await addTaskMutation.mutateAsync({
      dailyPlanId: dailyPlan.id,
      name,
      duration,
    });
  };

  const handleUpdateTask = async (
    taskId: string,
    updates: Partial<Pick<DailyPlanAction, "name" | "duration" | "scheduledStart" | "scheduledEnd" | "completed">>
  ) => {
    await updateTaskMutation.mutateAsync({
      id: taskId,
      ...updates,
    });
  };

  const handleRemoveTask = async (taskId: string) => {
    await removeTaskMutation.mutateAsync({ id: taskId });
  };

  const handleReorderTasks = async (taskIds: string[]) => {
    if (!dailyPlan) return;
    await reorderTasksMutation.mutateAsync({
      dailyPlanId: dailyPlan.id,
      taskIds,
    });
  };

  const handleUpdatePlan = async (
    updates: { shutdownTime?: string; obstacles?: string; status?: "DRAFT" | "COMPLETED" }
  ) => {
    if (!dailyPlan) return;
    await updatePlanMutation.mutateAsync({
      id: dailyPlan.id,
      ...updates,
    });
  };

  const handleCompletePlan = async () => {
    if (!dailyPlan) return;
    await completePlanMutation.mutateAsync({ id: dailyPlan.id });
    // Redirect to /act page
    window.location.href = "/act";
  };

  // Loading state
  if (planLoading) {
    return (
      <Container size="xl" py="xl">
        <div className="flex justify-center py-12">
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  if (!dailyPlan) {
    return (
      <Container size="xl" py="xl">
        <Text className="text-text-secondary">Unable to load daily plan</Text>
      </Container>
    );
  }

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Header with Stepper */}
      <div className="border-b border-border-primary bg-surface-secondary px-6 py-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <Text size="sm" fw={500} className="text-text-primary">
                Planning your day
              </Text>
              <Text size="xs" c="dimmed">
                Step {Math.max(0, getStepIndex()) + 1} / 6
              </Text>
            </div>
          </div>

          {currentStep !== "welcome" && (
            <Stepper
              active={getStepIndex()}
              size="xs"
              color="green"
              styles={{
                step: { padding: 0 },
                stepLabel: { fontSize: "12px" },
                separator: { marginLeft: 4, marginRight: 4 },
              }}
            >
              <Stepper.Step label="Add a task" />
              <Stepper.Step label="Estimate timing" />
              <Stepper.Step label="Fill task list" />
              <Stepper.Step label="Prioritize" />
              <Stepper.Step label="Schedule" />
              <Stepper.Step label="Document" />
            </Stepper>
          )}
        </div>
      </div>

      {/* Main Content */}
      <Container size="xl" py="xl">
        {/* Step 0: Welcome */}
        {currentStep === "welcome" && (
          <WelcomeStep onStart={() => setCurrentStep("add-task")} />
        )}

        {/* Step 1: Add Task */}
        {currentStep === "add-task" && (
          <AddTaskStep
            tasks={tasks}
            onAddTask={handleAddTask}
            onNext={() => setCurrentStep("estimate")}
            isLoading={addTaskMutation.isPending}
          />
        )}

        {/* Step 2: Estimate Timing */}
        {currentStep === "estimate" && (
          <EstimateTimingStep
            tasks={tasks}
            totalMinutes={totalPlannedMinutes}
            onUpdateTask={handleUpdateTask}
            onAddTask={handleAddTask}
            onNext={() => setCurrentStep("fill-day")}
            onBack={() => setCurrentStep("add-task")}
            isLoading={updateTaskMutation.isPending || addTaskMutation.isPending}
          />
        )}

        {/* Step 3: Fill Day (includes Prioritize) */}
        {currentStep === "fill-day" && (
          <FillDayStep
            dailyPlan={dailyPlan}
            tasks={tasks}
            totalMinutes={totalPlannedMinutes}
            onAddTask={handleAddTask}
            onRemoveTask={handleRemoveTask}
            onUpdateTask={handleUpdateTask}
            onReorderTasks={handleReorderTasks}
            onUpdatePlan={handleUpdatePlan}
            onNext={() => setCurrentStep("schedule")}
            onBack={() => setCurrentStep("estimate")}
          />
        )}

        {/* Step 5: Schedule */}
        {currentStep === "schedule" && (
          <ScheduleStep
            dailyPlan={dailyPlan}
            tasks={tasks}
            onUpdateTask={handleUpdateTask}
            onNext={() => setCurrentStep("document")}
            onBack={() => setCurrentStep("fill-day")}
          />
        )}

        {/* Step 6: Document */}
        {currentStep === "document" && (
          <DocumentStep
            dailyPlan={dailyPlan}
            tasks={tasks}
            totalMinutes={totalPlannedMinutes}
            onUpdatePlan={handleUpdatePlan}
            onComplete={handleCompletePlan}
            onBack={() => setCurrentStep("schedule")}
            isLoading={completePlanMutation.isPending}
          />
        )}
      </Container>
    </div>
  );
}

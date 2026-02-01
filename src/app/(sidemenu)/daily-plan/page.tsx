"use client";

import { useState, useMemo } from "react";
import { Container, Stepper, Loader, Text } from "@mantine/core";
import { addDays, startOfDay } from "date-fns";
import { api } from "~/trpc/react";
import { useDayRollover } from "~/hooks/useDayRollover";
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

type PlanDate = "today" | "tomorrow";

type DailyPlan = RouterOutputs["dailyPlan"]["getOrCreateToday"];
type DailyPlanAction = DailyPlan["plannedActions"][number];

export default function DailyPlanPage() {
  const [currentStep, setCurrentStep] = useState<WizardStep>("welcome");
  const [selectedDate, setSelectedDate] = useState<PlanDate>("today");

  const today = useDayRollover();

  // Calculate the actual date based on selection
  const planDate = useMemo(() => {
    return selectedDate === "tomorrow" ? addDays(today, 1) : startOfDay(today);
  }, [selectedDate, today]);

  // Get or create daily plan for the selected date (no workspace - user-level)
  const {
    data: dailyPlan,
    isLoading: planLoading,
    refetch: refetchPlan,
  } = api.dailyPlan.getOrCreateToday.useQuery({ date: planDate });

  // Fetch all actions for the existing actions panel
  const { data: allActions } = api.action.getAll.useQuery();

  // Filter actions into overdue and today
  const { overdueActions, todayActions } = useMemo(() => {
    if (!allActions) return { overdueActions: [], todayActions: [] };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = allActions.filter((action) => {
      if (!action.dueDate || action.status !== "ACTIVE") return false;
      const dueDate = new Date(action.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });

    const todayList = allActions.filter((action) => {
      if (!action.dueDate || action.status !== "ACTIVE") return false;
      const dueDate = new Date(action.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate.getTime() === today.getTime();
    });

    return { overdueActions: overdue, todayActions: todayList };
  }, [allActions]);

  // Get user's work hours for the timeline
  const { data: workHours } = api.dailyPlan.getUserWorkHours.useQuery();

  // Utils for optimistic updates
  const utils = api.useUtils();

  // Mutations
  const addTaskMutation = api.dailyPlan.addTask.useMutation({
    onSuccess: () => void refetchPlan(),
  });

  const updateTaskMutation = api.dailyPlan.updateTask.useMutation({
    onMutate: async (updates) => {
      // Cancel outgoing refetches
      await utils.dailyPlan.getOrCreateToday.cancel();

      // Snapshot previous value
      const previousData = utils.dailyPlan.getOrCreateToday.getData({ date: planDate });

      // Optimistically update the cache
      if (previousData) {
        utils.dailyPlan.getOrCreateToday.setData({ date: planDate }, {
          ...previousData,
          plannedActions: previousData.plannedActions.map((action) =>
            action.id === updates.id
              ? { ...action, ...updates }
              : action
          ),
        });
      }

      return { previousData };
    },
    onError: (_err, _updates, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.dailyPlan.getOrCreateToday.setData({ date: planDate }, context.previousData);
      }
    },
    onSettled: () => void refetchPlan(),
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

  const deferTaskMutation = api.dailyPlan.deferTask.useMutation({
    onSuccess: () => void refetchPlan(),
  });

  const completePlanMutation = api.dailyPlan.completePlan.useMutation();

  // Computed values
  const tasks = useMemo(() => dailyPlan?.plannedActions ?? [], [dailyPlan?.plannedActions]);
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

  const handleDeferTask = async (taskId: string, newDate: Date) => {
    await deferTaskMutation.mutateAsync({
      taskId,
      newDate,
      timezoneOffset: new Date().getTimezoneOffset(),
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
    // Redirect to /today page
    window.location.href = "/today";
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
          <WelcomeStep
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onStart={() => setCurrentStep("add-task")}
          />
        )}

        {/* Step 1: Add Task */}
        {currentStep === "add-task" && (
          <AddTaskStep
            tasks={tasks}
            onAddTask={handleAddTask}
            onNext={() => setCurrentStep("estimate")}
            isLoading={addTaskMutation.isPending}
            overdueActions={overdueActions}
            todayActions={todayActions}
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
            planDate={planDate}
            workHoursStart={workHours?.workHoursStart ?? "09:00"}
            workHoursEnd={workHours?.workHoursEnd ?? "17:00"}
            onAddTask={handleAddTask}
            onRemoveTask={handleRemoveTask}
            onDeferTask={handleDeferTask}
            onUpdateTask={handleUpdateTask}
            onReorderTasks={handleReorderTasks}
            onUpdatePlan={handleUpdatePlan}
            onRefetch={() => void refetchPlan()}
            onNext={() => setCurrentStep("schedule")}
            onBack={() => setCurrentStep("estimate")}
          />
        )}

        {/* Step 5: Schedule */}
        {currentStep === "schedule" && (
          <ScheduleStep
            dailyPlan={dailyPlan}
            tasks={tasks}
            planDate={planDate}
            workHoursStart={workHours?.workHoursStart ?? "09:00"}
            workHoursEnd={workHours?.workHoursEnd ?? "17:00"}
            onUpdateTask={handleUpdateTask}
            onRefetch={() => void refetchPlan()}
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

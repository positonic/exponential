"use client";

import { useState, useMemo, useRef } from "react";
import { Container, Title, Group } from "@mantine/core";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { WeeklyReviewIntro, type ReviewMode, type TimerDuration } from "./_components/WeeklyReviewIntro";
import { ProjectReviewCard } from "./_components/ProjectReviewCard";
import { ReviewProgress } from "./_components/ReviewProgress";
import { ReviewCompletion } from "./_components/ReviewCompletion";
import { ReviewTimer } from "./_components/ReviewTimer";
import { WeeklyReviewExplainer } from "./_components/WeeklyReviewExplainer";
import { CompletedReviewsList } from "./_components/CompletedReviewsList";
import { type RouterOutputs } from "~/trpc/react";

type ReviewStep = "intro" | "reviewing" | "complete";

// Type for the projects array from the getActiveWithDetails query
type ProjectsArray = RouterOutputs["project"]["getActiveWithDetails"];
type Project = ProjectsArray[number];

interface ProjectChanges {
  statusChanged: boolean;
  priorityChanged: boolean;
  actionAdded: boolean;
  outcomesChanged: boolean;
}

/**
 * Calculate project health score (0-100)
 * Lower scores = more issues = should be reviewed first
 */
function calculateProjectHealthScore(project: Project): number {
  let score = 100;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // -30 if no active action (no next action defined)
  const hasActiveAction = project.actions.some((a) => a.status === "ACTIVE");
  if (!hasActiveAction) score -= 30;

  // -25 if no recent activity (no completions in 7 days)
  const hasRecentActivity = project.actions.some(
    (a) => a.completedAt && new Date(a.completedAt) > sevenDaysAgo
  );
  if (!hasRecentActivity) score -= 25;

  // -20 if has overdue actions
  const hasOverdue = project.actions.some(
    (a) =>
      a.dueDate &&
      new Date(a.dueDate) < today &&
      a.status !== "COMPLETED" &&
      a.status !== "DONE"
  );
  if (hasOverdue) score -= 20;

  // -15 if no outcome linked
  const hasOutcome = project.outcomes.length > 0;
  if (!hasOutcome) score -= 15;

  // -10 if status is stuck or blocked
  if (project.status === "STUCK" || project.status === "BLOCKED") {
    score -= 10;
  }

  return Math.max(0, score);
}

export default function WeeklyReviewPage() {
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();
  const [step, setStep] = useState<ReviewStep>("intro");
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [reviewedProjects, setReviewedProjects] = useState<Set<string>>(
    new Set()
  );
  const [changes, setChanges] = useState<Map<string, ProjectChanges>>(
    new Map()
  );
  // Snapshot of projects when review starts - prevents blank screen if projects change mid-review
  const [reviewSessionProjects, setReviewSessionProjects] = useState<
    ProjectsArray
  >([]);
  // Review mode and timer state
  const [reviewMode, setReviewMode] = useState<ReviewMode>("quick");
  const [timerMinutes, setTimerMinutes] = useState<TimerDuration>(15);
  const reviewStartTime = useRef<Date | null>(null);

  const { data: projects, isLoading } =
    api.project.getActiveWithDetails.useQuery({
      workspaceId: workspaceId ?? undefined,
    });

  // Fetch all outcomes for the outcome linking feature
  const { data: allOutcomes } = api.outcome.getMyOutcomes.useQuery({
    workspaceId: workspaceId ?? undefined,
  });

  // Fetch streak data for motivation display
  const { data: streakData } = api.weeklyReview.getStreak.useQuery({
    workspaceId: workspaceId ?? undefined,
  });

  // Fetch inbox count for display (server-filtered by workspace)
  const { data: allActions } = api.action.getAll.useQuery({ workspaceId: workspaceId ?? undefined });
  const inboxCount = useMemo(() => {
    return allActions?.filter(
      (action) => !action.projectId && action.status === "ACTIVE"
    ).length ?? 0;
  }, [allActions]);

  // Sort projects by health score (lowest first = needs most attention)
  const activeProjects = useMemo(() => {
    const projectList = projects ?? [];
    return [...projectList].sort((a, b) => {
      const scoreA = calculateProjectHealthScore(a);
      const scoreB = calculateProjectHealthScore(b);
      return scoreA - scoreB; // Lower scores (more issues) first
    });
  }, [projects]);

  // Count projects that need attention (health score < 50 for quick mode threshold)
  const projectsNeedingAttention = useMemo(() => {
    return activeProjects.filter((p) => calculateProjectHealthScore(p) < 50)
      .length;
  }, [activeProjects]);

  // Use snapshot during review, live data otherwise
  const currentProjects =
    step === "reviewing" ? reviewSessionProjects : activeProjects;

  const currentProject = currentProjects[currentProjectIndex];

  const handleStartReview = (mode: ReviewMode, timer: TimerDuration) => {
    // Store selected mode and timer
    setReviewMode(mode);
    setTimerMinutes(timer);
    reviewStartTime.current = new Date();

    // Snapshot the projects at the start of the review session
    // For quick mode, only include projects needing attention
    const projectsToReview = mode === "quick"
      ? activeProjects.filter((p) => calculateProjectHealthScore(p) < 50)
      : [...activeProjects];

    setReviewSessionProjects(projectsToReview);
    setStep("reviewing");
    setCurrentProjectIndex(0);
  };

  const handleMarkReviewed = (projectId: string, projectChanges: ProjectChanges) => {
    setReviewedProjects((prev) => new Set(prev).add(projectId));
    setChanges((prev) => new Map(prev).set(projectId, projectChanges));

    if (currentProjectIndex < reviewSessionProjects.length - 1) {
      setCurrentProjectIndex((prev) => prev + 1);
    } else {
      // Review complete - refresh the projects list now that all changes are done
      void utils.project.getActiveWithDetails.invalidate();
      setStep("complete");
    }
  };

  const handleSkip = () => {
    if (currentProjectIndex < reviewSessionProjects.length - 1) {
      setCurrentProjectIndex((prev) => prev + 1);
    } else {
      // Review complete - refresh the projects list
      void utils.project.getActiveWithDetails.invalidate();
      setStep("complete");
    }
  };

  const handlePrevious = () => {
    if (currentProjectIndex > 0) {
      setCurrentProjectIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentProjectIndex < reviewSessionProjects.length - 1) {
      setCurrentProjectIndex((prev) => prev + 1);
    }
  };

  const handleRestartReview = () => {
    // Refresh the projects list to get latest data before restarting
    void utils.project.getActiveWithDetails.invalidate();
    setStep("intro");
    setCurrentProjectIndex(0);
    setReviewedProjects(new Set());
    setChanges(new Map());
  };

  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-surface-hover" />
          <div className="h-64 rounded bg-surface-hover" />
        </div>
      </Container>
    );
  }

  // Calculate duration when review completes
  const getReviewDuration = (): number | null => {
    if (!reviewStartTime.current) return null;
    const endTime = new Date();
    return Math.round((endTime.getTime() - reviewStartTime.current.getTime()) / 60000);
  };

  return (
    <Container size="md" py="xl">
      <Group justify="space-between" align="center" className="mb-6">
        <Title order={2} className="text-text-primary">
          Weekly Review
        </Title>
        {step === "reviewing" && timerMinutes && (
          <ReviewTimer
            initialMinutes={timerMinutes}
            isActive={step === "reviewing"}
          />
        )}
      </Group>

      {step === "intro" && (
        <>
          <WeeklyReviewIntro
            projectCount={activeProjects.length}
            projectsNeedingAttention={projectsNeedingAttention}
            onStart={handleStartReview}
            streakData={streakData}
            inboxCount={inboxCount}
          />
          <div className="mt-8">
            <CompletedReviewsList />
          </div>
        </>
      )}

      {step === "reviewing" && currentProject && (
        <>
          <ReviewProgress
            current={currentProjectIndex + 1}
            total={reviewSessionProjects.length}
            reviewedCount={reviewedProjects.size}
          />
          <ProjectReviewCard
            key={currentProject.id}
            project={currentProject}
            isReviewed={reviewedProjects.has(currentProject.id)}
            onMarkReviewed={(projectChanges) =>
              handleMarkReviewed(currentProject.id, projectChanges)
            }
            onSkip={handleSkip}
            onPrevious={handlePrevious}
            onNext={handleNext}
            hasPrevious={currentProjectIndex > 0}
            hasNext={currentProjectIndex < reviewSessionProjects.length - 1}
            workspaceId={workspaceId}
            allOutcomes={allOutcomes}
          />
        </>
      )}

      {step === "reviewing" && reviewSessionProjects.length === 0 && (
        <ReviewCompletion
          totalProjects={activeProjects.length}
          reviewedCount={0}
          changes={changes}
          onRestart={handleRestartReview}
          reviewMode={reviewMode}
          durationMinutes={getReviewDuration()}
          quickModeNoProjects
        />
      )}

      {step === "complete" && (
        <ReviewCompletion
          totalProjects={reviewSessionProjects.length}
          reviewedCount={reviewedProjects.size}
          changes={changes}
          onRestart={handleRestartReview}
          reviewMode={reviewMode}
          durationMinutes={getReviewDuration()}
        />
      )}

      <WeeklyReviewExplainer />
    </Container>
  );
}

"use client";

import { useState, useMemo } from "react";
import { Container, Title } from "@mantine/core";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { WeeklyReviewIntro } from "./_components/WeeklyReviewIntro";
import { ProjectReviewCard } from "./_components/ProjectReviewCard";
import { ReviewProgress } from "./_components/ReviewProgress";
import { ReviewCompletion } from "./_components/ReviewCompletion";
import { WeeklyReviewExplainer } from "./_components/WeeklyReviewExplainer";

type ReviewStep = "intro" | "reviewing" | "complete";

interface ProjectChanges {
  statusChanged: boolean;
  priorityChanged: boolean;
  actionAdded: boolean;
  outcomesChanged: boolean;
}

export default function WeeklyReviewPage() {
  const { workspaceId } = useWorkspace();
  const [step, setStep] = useState<ReviewStep>("intro");
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [reviewedProjects, setReviewedProjects] = useState<Set<string>>(
    new Set()
  );
  const [changes, setChanges] = useState<Map<string, ProjectChanges>>(
    new Map()
  );

  const { data: projects, isLoading } =
    api.project.getActiveWithDetails.useQuery({
      workspaceId: workspaceId ?? undefined,
    });

  const activeProjects = useMemo(() => {
    return projects ?? [];
  }, [projects]);

  const currentProject = activeProjects[currentProjectIndex];

  const handleStartReview = () => {
    setStep("reviewing");
    setCurrentProjectIndex(0);
  };

  const handleMarkReviewed = (projectId: string, projectChanges: ProjectChanges) => {
    setReviewedProjects((prev) => new Set(prev).add(projectId));
    setChanges((prev) => new Map(prev).set(projectId, projectChanges));

    if (currentProjectIndex < activeProjects.length - 1) {
      setCurrentProjectIndex((prev) => prev + 1);
    } else {
      setStep("complete");
    }
  };

  const handleSkip = () => {
    if (currentProjectIndex < activeProjects.length - 1) {
      setCurrentProjectIndex((prev) => prev + 1);
    } else {
      setStep("complete");
    }
  };

  const handlePrevious = () => {
    if (currentProjectIndex > 0) {
      setCurrentProjectIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentProjectIndex < activeProjects.length - 1) {
      setCurrentProjectIndex((prev) => prev + 1);
    }
  };

  const handleRestartReview = () => {
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

  return (
    <Container size="md" py="xl">
      <Title order={2} className="mb-6 text-text-primary">
        Weekly Review
      </Title>

      {step === "intro" && (
        <WeeklyReviewIntro
          projectCount={activeProjects.length}
          onStart={handleStartReview}
        />
      )}

      {step === "reviewing" && currentProject && (
        <>
          <ReviewProgress
            current={currentProjectIndex + 1}
            total={activeProjects.length}
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
            hasNext={currentProjectIndex < activeProjects.length - 1}
            workspaceId={workspaceId}
          />
        </>
      )}

      {step === "complete" && (
        <ReviewCompletion
          totalProjects={activeProjects.length}
          reviewedCount={reviewedProjects.size}
          changes={changes}
          onRestart={handleRestartReview}
        />
      )}

      <WeeklyReviewExplainer />
    </Container>
  );
}

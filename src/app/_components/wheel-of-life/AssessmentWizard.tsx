"use client";

import { useState, useCallback } from "react";
import { Paper, Stepper, Button, Group, Text, Loader, Center } from "@mantine/core";
import { IconArrowLeft, IconArrowRight, IconCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { ModeSelector } from "./ModeSelector";
import { PriorityRankingStep } from "./PriorityRankingStep";
import { SatisfactionScoreStep } from "./SatisfactionScoreStep";
import { AssessmentSummary } from "./AssessmentSummary";

interface AssessmentWizardProps {
  assessmentType: "on_demand" | "quarterly";
}

interface DomainScore {
  lifeDomainId: number;
  currentRank: number;
  desiredRank: number;
  score?: number;
  reflection?: string;
}

export function AssessmentWizard({ assessmentType }: AssessmentWizardProps) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [mode, setMode] = useState<"quick" | "deep" | null>(null);
  const [currentRanking, setCurrentRanking] = useState<number[]>([]);
  const [desiredRanking, setDesiredRanking] = useState<number[]>([]);
  const [satisfactionScores, setSatisfactionScores] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState("");
  const [assessmentId, setAssessmentId] = useState<string | null>(null);

  const { data: lifeDomains, isLoading: domainsLoading } = api.wheelOfLife.getLifeDomains.useQuery();

  const createAssessment = api.wheelOfLife.createAssessment.useMutation();
  const saveAllScores = api.wheelOfLife.saveAllScores.useMutation();
  const completeAssessment = api.wheelOfLife.completeAssessment.useMutation();

  // Calculate the current quarter for quarterly assessments
  const getCurrentQuarter = () => {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return `${now.getFullYear()}-Q${quarter}`;
  };

  // Initialize rankings when domains load
  const initializeRankings = useCallback(() => {
    if (lifeDomains && currentRanking.length === 0) {
      const domainIds = lifeDomains.map((d) => d.id);
      setCurrentRanking(domainIds);
      setDesiredRanking([...domainIds]);
    }
  }, [lifeDomains, currentRanking.length]);

  // Call initialize when domains are loaded
  if (lifeDomains && currentRanking.length === 0) {
    initializeRankings();
  }

  const handleModeSelect = async (selectedMode: "quick" | "deep") => {
    setMode(selectedMode);

    // Create the assessment
    const assessment = await createAssessment.mutateAsync({
      mode: selectedMode,
      type: assessmentType,
      quarterYear: assessmentType === "quarterly" ? getCurrentQuarter() : undefined,
    });

    setAssessmentId(assessment.id);
    setActiveStep(1);
  };

  const handleNext = () => {
    const totalSteps = mode === "deep" ? 4 : 3;
    if (activeStep < totalSteps) {
      setActiveStep(activeStep + 1);
    }
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  const handleComplete = async () => {
    if (!assessmentId || !lifeDomains) return;

    // Build scores from rankings
    const scores: DomainScore[] = lifeDomains.map((domain) => {
      const currentIdx = currentRanking.indexOf(domain.id);
      const desiredIdx = desiredRanking.indexOf(domain.id);

      return {
        lifeDomainId: domain.id,
        currentRank: currentIdx + 1, // 1-based ranking
        desiredRank: desiredIdx + 1,
        score: mode === "deep" ? satisfactionScores[domain.id] : undefined,
      };
    });

    // Save all scores
    await saveAllScores.mutateAsync({
      assessmentId,
      scores,
    });

    // Complete the assessment
    await completeAssessment.mutateAsync({
      assessmentId,
      notes: notes || undefined,
    });

    // Redirect to results
    router.push("/wheel-of-life");
  };

  if (domainsLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!lifeDomains) {
    return (
      <Paper p="xl" className="bg-surface-secondary">
        <Text c="dimmed" ta="center">
          Unable to load life domains. Please try again.
        </Text>
      </Paper>
    );
  }

  const stepLabels = mode === "deep"
    ? ["Mode", "Current", "Desired", "Satisfaction", "Summary"]
    : ["Mode", "Current", "Desired", "Summary"];

  return (
    <Paper p="xl" radius="md" className="bg-surface-secondary border border-border-primary">
      {/* Stepper */}
      <Stepper
        active={activeStep}
        onStepClick={setActiveStep}
        allowNextStepsSelect={false}
        mb="xl"
      >
        {stepLabels.map((label, index) => (
          <Stepper.Step key={index} label={label} />
        ))}
      </Stepper>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {/* Step 0: Mode Selection */}
        {activeStep === 0 && (
          <ModeSelector onSelect={handleModeSelect} isLoading={createAssessment.isPending} />
        )}

        {/* Step 1: Current Priority Ranking */}
        {activeStep === 1 && (
          <PriorityRankingStep
            title="Current Priorities"
            description="Drag to order these areas by how you currently allocate your time and energy. Put what takes most of your focus at the top."
            domains={lifeDomains}
            ranking={currentRanking}
            onRankingChange={setCurrentRanking}
          />
        )}

        {/* Step 2: Desired Priority Ranking */}
        {activeStep === 2 && (
          <PriorityRankingStep
            title="Desired Priorities"
            description="Now order these by how you WANT to prioritize them. What should be getting more of your attention?"
            domains={lifeDomains}
            ranking={desiredRanking}
            onRankingChange={setDesiredRanking}
          />
        )}

        {/* Step 3 (Deep mode only): Satisfaction Scores */}
        {mode === "deep" && activeStep === 3 && (
          <SatisfactionScoreStep
            domains={lifeDomains}
            scores={satisfactionScores}
            onScoresChange={setSatisfactionScores}
          />
        )}

        {/* Summary Step */}
        {((mode === "quick" && activeStep === 3) || (mode === "deep" && activeStep === 4)) && (
          <AssessmentSummary
            mode={mode}
            domains={lifeDomains}
            currentRanking={currentRanking}
            desiredRanking={desiredRanking}
            satisfactionScores={mode === "deep" ? satisfactionScores : undefined}
            notes={notes}
            onNotesChange={setNotes}
          />
        )}
      </div>

      {/* Navigation */}
      {activeStep > 0 && (
        <Group justify="space-between" mt="xl">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={handleBack}
          >
            Back
          </Button>

          {((mode === "quick" && activeStep < 3) || (mode === "deep" && activeStep < 4)) ? (
            <Button
              rightSection={<IconArrowRight size={16} />}
              onClick={handleNext}
            >
              Next
            </Button>
          ) : (
            <Button
              color="green"
              leftSection={<IconCheck size={16} />}
              onClick={handleComplete}
              loading={saveAllScores.isPending || completeAssessment.isPending}
            >
              Complete Assessment
            </Button>
          )}
        </Group>
      )}
    </Paper>
  );
}

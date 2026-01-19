"use client";

import { useState } from "react";
import {
  Container,
  Title,
  Text,
  Stepper,
  Loader,
  Alert,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { PeriodSelector } from "./_components/PeriodSelector";
import { KeyResultWizard } from "./_components/KeyResultWizard";
import { WizardSummary } from "./_components/WizardSummary";

type WizardStep = "period" | "checkin" | "summary";

interface CheckinUpdate {
  keyResultId: string;
  keyResultTitle: string;
  objectiveTitle: string;
  previousValue: number;
  newValue: number;
  notes?: string;
}

export default function OkrCheckinPage() {
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [currentStep, setCurrentStep] = useState<WizardStep>("period");
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [completedUpdates, setCompletedUpdates] = useState<CheckinUpdate[]>([]);

  // Get key results for the selected period
  const { data: keyResults, isLoading: keyResultsLoading, refetch: refetchKeyResults } =
    api.okr.getAll.useQuery(
      {
        workspaceId: workspaceId ?? undefined,
        period: selectedPeriod ?? undefined,
      },
      { enabled: !!selectedPeriod && !!workspaceId }
    );

  // Handle period selection
  const handlePeriodSelect = (period: string) => {
    setSelectedPeriod(period);
    setCurrentStep("checkin");
    setCompletedUpdates([]);
  };

  // Handle wizard completion
  const handleWizardComplete = (updates: CheckinUpdate[]) => {
    setCompletedUpdates(updates);
    setCurrentStep("summary");
  };

  // Handle starting over
  const handleStartOver = () => {
    setCurrentStep("period");
    setSelectedPeriod(null);
    setCompletedUpdates([]);
  };

  // Handle continuing with same period
  const handleContinue = () => {
    void refetchKeyResults();
    setCurrentStep("checkin");
    setCompletedUpdates([]);
  };

  // Get active step index for Stepper
  const getStepIndex = () => {
    switch (currentStep) {
      case "period":
        return 0;
      case "checkin":
        return 1;
      case "summary":
        return 2;
      default:
        return 0;
    }
  };

  if (workspaceLoading) {
    return (
      <Container size="lg" py="xl">
        <div className="flex justify-center py-12">
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="lg" py="xl">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return (
    <Container size="lg" py="md">
      {/* Header */}
      <div className="mb-6">
        <Title order={1} className="text-text-primary">
          OKR Check-in
        </Title>
        <Text size="sm" c="dimmed">
          Weekly progress update for your Key Results
        </Text>
      </div>

      {/* Stepper */}
      <Stepper active={getStepIndex()} mb="xl" size="sm">
        <Stepper.Step label="Select Period" description="Choose OKRs to review" />
        <Stepper.Step label="Update Progress" description="Record your progress" />
        <Stepper.Step label="Summary" description="Review your updates" />
      </Stepper>

      {/* Step 1: Period Selection */}
      {currentStep === "period" && (
        <PeriodSelector
          workspaceId={workspaceId!}
          onSelect={handlePeriodSelect}
        />
      )}

      {/* Step 2: Key Result Updates */}
      {currentStep === "checkin" && (
        <>
          {keyResultsLoading ? (
            <div className="flex justify-center py-12">
              <Loader size="lg" />
            </div>
          ) : keyResults && keyResults.length > 0 ? (
            <KeyResultWizard
              keyResults={keyResults}
              onComplete={handleWizardComplete}
              onBack={() => setCurrentStep("period")}
            />
          ) : (
            <Alert icon={<IconAlertCircle size={16} />} title="No Key Results" color="yellow">
              No Key Results found for the selected period. Create some OKRs first or select a different period.
            </Alert>
          )}
        </>
      )}

      {/* Step 3: Summary */}
      {currentStep === "summary" && (
        <WizardSummary
          updates={completedUpdates}
          period={selectedPeriod!}
          onStartOver={handleStartOver}
          onContinue={handleContinue}
        />
      )}
    </Container>
  );
}

'use client';

import { useState } from 'react';
import { Container, Title, Text, Stepper, Group, Button, TextInput, Textarea, Paper } from '@mantine/core';
import React from 'react';

// Define the structure for the elevator pitch data
interface PitchData {
  customers: string;
  triggeringEvent: string;
  jobToBeDone: string;
  desiredOutcome: string;
  existingAlternatives: string;
  switchingTrigger: string;
  problems: string;
  stakes: string;
  uniqueValueProposition: string;
}

export default function ElevatorPitchWorkflowPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [pitchData, setPitchData] = useState<PitchData>({
    customers: '',
    triggeringEvent: '',
    jobToBeDone: '',
    desiredOutcome: '',
    existingAlternatives: '',
    switchingTrigger: '',
    problems: '',
    stakes: '',
    uniqueValueProposition: '',
  });

  const handleInputChange = (field: keyof PitchData, value: string) => {
    setPitchData((prevData) => ({ ...prevData, [field]: value }));
  };

  const nextStep = () => setActiveStep((current) => (current < 5 ? current + 1 : current));
  const prevStep = () => setActiveStep((current) => (current > 0 ? current - 1 : current));

  // Function to create styled text for user input
  const HighlightedInput = ({ children }: { children: React.ReactNode }) => (
    <Text component="span" c="teal.6" fw={500}>{children}</Text>
  );

  const generatePitch = (): React.ReactNode[] => {
    const {
      customers,
      triggeringEvent,
      jobToBeDone,
      desiredOutcome,
      existingAlternatives,
      switchingTrigger,
      problems,
      stakes,
      uniqueValueProposition,
    } = pitchData;

    // Use placeholders if data is empty
    const customerText = customers || '[customers]';
    const triggerText = triggeringEvent || '[a triggering event]';
    const jobText = jobToBeDone || '[job-to-be-done]';
    const outcomeText = desiredOutcome || '[desired outcome]';
    const alternativesText = existingAlternatives || '[existing alternatives]';
    const switchText = switchingTrigger || '[switching trigger]';
    const problemsText = problems || '[these problems]';
    const stakesText = stakes || "[what's at stake]";
    const valuePropText = uniqueValueProposition || '[unique value proposition]';

    // Construct the pitch as an array of React nodes
    return [
      'When ', <HighlightedInput key="cust">{customerText}</HighlightedInput>, ' encounter ', <HighlightedInput key="trig">{triggerText}</HighlightedInput>, ', they need to ', <HighlightedInput key="job">{jobText}</HighlightedInput>, ' to achieve ', <HighlightedInput key="out">{outcomeText}</HighlightedInput>, '.\n',
      'They might normally use ', <HighlightedInput key="alt">{alternativesText}</HighlightedInput>, ', but due to ', <HighlightedInput key="swit">{switchText}</HighlightedInput>, ', these alternatives often fail because ', <HighlightedInput key="prob">{problemsText}</HighlightedInput>, '.\n',
      'If this situation continues, ', <HighlightedInput key="stak">{stakesText}</HighlightedInput>, '.\n',
      "That's why we built a solution to help ", <HighlightedInput key="cust2">{customerText}</HighlightedInput>, ' achieve ', <HighlightedInput key="out2">{outcomeText}</HighlightedInput>, ' by ', <HighlightedInput key="val">{valuePropText}</HighlightedInput>, '.'
    ];
  };

  return (
    <Container size="md" py="xl">
      <Title
        order={1}
        ta="center"
        className="mb-4 bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-4xl font-bold text-transparent"
      >
        Craft Your Elevator Pitch
      </Title>
      <Text c="dimmed" size="lg" ta="center" mb="xl">
        Follow the steps to build a compelling pitch based on customer needs.
      </Text>

      <Stepper active={activeStep} onStepClick={setActiveStep} allowNextStepsSelect={false}>
        {/* Step 1: The Customer & Trigger */}
        <Stepper.Step label="Customer & Trigger" description="Who needs this and why now?">
          <TextInput
            label="When [customers]..."
            placeholder="e.g., entrepreneurs get hit with a killer idea"
            value={pitchData.customers}
            onChange={(event) => handleInputChange('customers', event.currentTarget.value)}
            mb="md"
          />
          <TextInput
            label="...encounter a [triggering event]..."
            placeholder="e.g., needing to raise money"
            value={pitchData.triggeringEvent}
            onChange={(event) => handleInputChange('triggeringEvent', event.currentTarget.value)}
            mb="md"
          />
        </Stepper.Step>

        {/* Step 2: The Job & Outcome */}
        <Stepper.Step label="Job & Outcome" description="What do they need to do?">
          <TextInput
            label="...they need to do [job-to-be-done]..."
            placeholder="e.g., get their idea off the ground"
            value={pitchData.jobToBeDone}
            onChange={(event) => handleInputChange('jobToBeDone', event.currentTarget.value)}
            mb="md"
          />
          <TextInput
            label="...in order to achieve [desired outcome]."
            placeholder="e.g., secure funding"
            value={pitchData.desiredOutcome}
            onChange={(event) => handleInputChange('desiredOutcome', event.currentTarget.value)}
            mb="md"
          />
        </Stepper.Step>

        {/* Step 3: Alternatives & Switching Trigger */}
        <Stepper.Step label="Alternatives & Switch" description="What did they use before?">
           <TextInput
            label="They would normally use [existing alternatives]..."
            placeholder="e.g., write a 40-page business plan"
            value={pitchData.existingAlternatives}
            onChange={(event) => handleInputChange('existingAlternatives', event.currentTarget.value)}
            mb="md"
          />
          <TextInput
            label="...but because of [switching trigger]..."
            placeholder="e.g., the recent explosion in startups"
            value={pitchData.switchingTrigger}
            onChange={(event) => handleInputChange('switchingTrigger', event.currentTarget.value)}
             mb="md"
          />
        </Stepper.Step>

        {/* Step 4: Problems & Stakes */}
        <Stepper.Step label="Problems & Stakes" description="Why don't alternatives work?">
          <Textarea
            label="...these [existing alternatives] no longer work because of [these problems]."
            placeholder="e.g., no one reads business plans anymore, investors fund traction"
            value={pitchData.problems}
            onChange={(event) => handleInputChange('problems', event.currentTarget.value)}
            mb="md"
          />
          <Textarea
            label="If these problems are left unaddressed, then [what's at stake]."
            placeholder="e.g., a startup fails to grab attention and get funded"
            value={pitchData.stakes}
            onChange={(event) => handleInputChange('stakes', event.currentTarget.value)}
            mb="md"
          />
        </Stepper.Step>

        {/* Step 5: Solution & Value Prop */}
        <Stepper.Step label="Solution & Value" description="How do you help?">
          <Textarea
            label="So we built a solution that helps [customers] achieve [desired outcome] by helping them [unique value proposition]."
            placeholder="e.g., quickly validate their idea and build traction using lean methods"
            value={pitchData.uniqueValueProposition}
            onChange={(event) => handleInputChange('uniqueValueProposition', event.currentTarget.value)}
            mb="md"
          />
        </Stepper.Step>

        {/* Step 6: Completed Pitch */}
        <Stepper.Completed>
          <Title order={3} mt="xl" mb="md">Your Generated Elevator Pitch:</Title>
          <Paper shadow="xs" p="md" withBorder>
            {/* Render the array of nodes */}
            <Text style={{ whiteSpace: 'pre-line' }}>
              {generatePitch()}
            </Text>
          </Paper>
        </Stepper.Completed>
      </Stepper>

      <Group justify="center" mt="xl">
        {activeStep > 0 && activeStep < 5 && (
          <Button variant="default" onClick={prevStep}>
            Back
          </Button>
        )}
        {activeStep < 5 && (
          <Button onClick={nextStep} variant="gradient" gradient={{ from: 'teal', to: 'blue' }}>
            {activeStep === 4 ? 'Generate Pitch' : 'Next step'}
          </Button>
        )}
        {activeStep === 5 && (
           <Button variant="light" onClick={() => setActiveStep(0)}>
             Start Over
           </Button>
        )}
      </Group>
    </Container>
  );
}

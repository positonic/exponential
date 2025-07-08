"use client";
import { Container, Title, Button } from "@mantine/core";
import { OutcomesTable } from "~/app/_components/OutcomesTable";
import { CreateOutcomeModal } from "~/app/_components/CreateOutcomeModal";
import { api } from "~/trpc/react";

export default function Outcomes() {
  const outcomesQuery = api.outcome.getMyOutcomes.useQuery();

  return (
    <Container size="xl" className="py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Title
          order={1}
          className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
        >
          🎯 Outcomes
        </Title>
        <CreateOutcomeModal>
          <Button 
            variant="filled" 
            color="dark"
            leftSection="+"
          >
            Add Outcome
          </Button>
        </CreateOutcomeModal>
      </div>

      {/* Content */}
      <OutcomesTable outcomes={outcomesQuery.data ?? []} />
    </Container>
  );
} 
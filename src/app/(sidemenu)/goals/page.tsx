"use client";
import { Container, Title, Button } from "@mantine/core";
import { GoalsTable } from "~/app/_components/GoalsTable";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { api } from "~/trpc/react";

export default function Goals() {
  const { data: goals, isLoading } = api.goal.getAllMyGoals.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  return (
    <Container size="xl" className="py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Title
          order={1}
          className="text-4xl font-bold bg-gradient-to-r from-green-400 to-teal-400 bg-clip-text text-transparent"
        >
          🎯 Goals
        </Title>
        <CreateGoalModal>
          <Button 
            variant="filled" 
            color="dark"
            leftSection="+"
          >
            Add Goal
          </Button>
        </CreateGoalModal>
      </div>

      {/* Content */}
      <GoalsTable goals={goals || []} />
    </Container>
  );
}

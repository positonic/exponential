"use client";

import { Suspense } from "react";
import { Skeleton, Container, Stack, Text } from "@mantine/core";
import { InitiativeDashboard } from "~/app/_components/initiatives/InitiativeDashboard";
import { useWorkspace } from "~/providers/WorkspaceProvider";

function GoalsPageContent() {
  const { workspace, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={200} mb="lg" />
        <Skeleton height={300} />
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return <InitiativeDashboard />;
}

export default function WorkspaceGoalsPage() {
  return (
    <main className="flex h-full flex-col items-center justify-start text-text-primary">
      <Suspense
        fallback={
          <Container size="xl" className="py-8">
            <Stack gap="md">
              <Skeleton height={60} />
              <Skeleton height={100} />
              <Skeleton height={200} />
            </Stack>
          </Container>
        }
      >
        <GoalsPageContent />
      </Suspense>
    </main>
  );
}

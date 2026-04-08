"use client";

import { Suspense } from "react";
import { Container, Skeleton, Stack } from "@mantine/core";
import { useParams } from "next/navigation";
import { GoalDetailContent } from "~/app/_components/initiatives/GoalDetailContent";

export default function GoalDetailPage() {
  const params = useParams<{ workspaceSlug: string; goalId: string }>();
  const goalId = Number(params.goalId);

  if (isNaN(goalId)) {
    return (
      <Container size="xl" className="py-8">
        <p className="text-text-secondary">Invalid goal ID</p>
      </Container>
    );
  }

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
        <GoalDetailContent goalId={goalId} workspaceSlug={params.workspaceSlug} />
      </Suspense>
    </main>
  );
}

"use client";

import { Suspense } from "react";
import { Container, Skeleton, Stack } from "@mantine/core";
import { GoalsPageBody } from "~/app/_components/goals/GoalsPageBody";

export default function WorkspaceGoalsPage() {
  return (
    <main className="flex h-full flex-col items-start justify-start text-text-primary">
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
        <GoalsPageBody />
      </Suspense>
    </main>
  );
}

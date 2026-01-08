"use client";

import { Suspense } from "react";
import { Skeleton, Container, Stack } from "@mantine/core";
import { OkrDashboard } from "~/plugins/okr/client/components/OkrDashboard";

function OkrPageContent() {
  return <OkrDashboard />;
}

export default function OkrsPage() {
  return (
    <main className="flex h-full flex-col items-center justify-start text-text-primary">
      <Suspense
        fallback={
          <Container size="lg" className="py-8">
            <Stack gap="md">
              <Skeleton height={60} />
              <Skeleton height={100} />
              <Skeleton height={200} />
            </Stack>
          </Container>
        }
      >
        <OkrPageContent />
      </Suspense>
    </main>
  );
}

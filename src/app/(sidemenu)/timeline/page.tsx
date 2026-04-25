"use client";

import { Suspense } from "react";
import { Container, Skeleton, Stack } from "@mantine/core";
import { ProjectTimelineView } from "~/app/_components/ProjectTimelineView";

function TimelineContent() {
  return (
    <Container size="xl" className="py-8">
      <ProjectTimelineView />
    </Container>
  );
}

export default function TimelinePage() {
  return (
    <main className="flex h-full flex-col text-text-primary">
      <Suspense
        fallback={
          <Container size="xl" className="py-8">
            <Stack gap="sm">
              <Skeleton height={24} width={200} />
              <Skeleton height={320} />
            </Stack>
          </Container>
        }
      >
        <TimelineContent />
      </Suspense>
    </main>
  );
}

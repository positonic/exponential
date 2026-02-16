'use client';

import { Suspense } from 'react';
import { Skeleton, Container } from '@mantine/core';
import { ProjectsTasksView } from '~/app/_components/ProjectsTasksView/ProjectsTasksView';

function AllProjectsTasksContent() {
  return <ProjectsTasksView />;
}

export default function AllProjectsTasksPage() {
  return (
    <main className="flex h-full flex-col text-text-primary">
      <div className="flex-1 overflow-auto">
        <Suspense
          fallback={
            <Container size="xl" className="py-8">
              <Skeleton height={40} width={200} mb="lg" />
              <Skeleton height={400} />
            </Container>
          }
        >
          <AllProjectsTasksContent />
        </Suspense>
      </div>
    </main>
  );
}

"use client";

import { Suspense } from "react";
import { Skeleton, Container, Stack, Text, Tabs } from "@mantine/core";
import { IconTarget, IconChartBar } from "@tabler/icons-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { InitiativeDashboard } from "~/app/_components/initiatives/InitiativeDashboard";
import { OkrDashboard } from "~/plugins/okr/client/components/OkrDashboard";
import { useWorkspace } from "~/providers/WorkspaceProvider";

function GoalsPageContent() {
  const { workspace, isLoading } = useWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = searchParams.get("tab") ?? "goals";

  const handleTabChange = (value: string | null) => {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

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

  return (
    <Tabs
      value={activeTab}
      onChange={handleTabChange}
      className="w-full"
    >
      <Tabs.List className="px-4 border-b border-border-primary">
        <Tabs.Tab value="goals" leftSection={<IconTarget size={16} />}>
          Goals
        </Tabs.Tab>
        <Tabs.Tab value="okrs" leftSection={<IconChartBar size={16} />}>
          OKRs
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="goals">
        <InitiativeDashboard />
      </Tabs.Panel>

      <Tabs.Panel value="okrs">
        <OkrDashboard />
      </Tabs.Panel>
    </Tabs>
  );
}

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
        <GoalsPageContent />
      </Suspense>
    </main>
  );
}

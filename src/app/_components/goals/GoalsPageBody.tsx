"use client";

import { Container, Skeleton, Text } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { GoalsWorkspaceTabs } from "./GoalsWorkspaceTabs";

/**
 * The goals page body, shared by the workspace-scoped route and the legacy
 * unscoped `/goals` route. Both resolve their workspace through
 * WorkspaceProvider, so there is nothing route-specific left to differ.
 */
export function GoalsPageBody() {
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

  return <GoalsWorkspaceTabs />;
}

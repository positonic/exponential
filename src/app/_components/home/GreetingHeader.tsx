"use client";

import { Text } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export function GreetingHeader() {
  const { workspace } = useWorkspace();
  const workspaceName = workspace?.name ?? "Workspace";

  return (
    <div className="mb-6">
      <Text className="mb-1 text-3xl font-semibold text-text-primary text-balance">
        {workspaceName}
      </Text>
      <Text size="sm" className="text-text-muted text-balance">
        Your workspace command center for projects, goals, and daily execution.
      </Text>
    </div>
  );
}

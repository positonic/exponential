"use client";

import { useWorkspace } from "~/providers/WorkspaceProvider";
import { ContentDashboard } from "~/app/_components/content/ContentDashboard";

export default function WorkspaceContentPage() {
  const { workspaceId, isLoading } = useWorkspace();

  return (
    <ContentDashboard
      workspaceId={workspaceId ?? undefined}
      isLoading={isLoading}
    />
  );
}

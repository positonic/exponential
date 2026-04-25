"use client";

import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { resolveDetailedActions } from "~/lib/resolveDetailedActions";

/**
 * Hook to determine if detailed action pages are enabled for the current context.
 * Uses project-level setting if available, otherwise falls back to workspace default.
 */
export function useDetailedActionsEnabled(
  projectId?: string | null,
): boolean {
  const { workspaceSlug } = useWorkspace();

  const { data: workspaceData } = api.workspace.getBySlug.useQuery(
    { slug: workspaceSlug ?? "" },
    { enabled: !!workspaceSlug },
  );

  const { data: projectData } = api.project.getById.useQuery(
    { id: projectId ?? "" },
    { enabled: !!projectId },
  );

  return resolveDetailedActions(workspaceData, projectData);
}

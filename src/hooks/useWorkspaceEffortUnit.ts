"use client";

import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import type { EffortUnit } from "~/types/effort";

/**
 * The current workspace's effort unit (story points / t-shirt / hours), the
 * same setting the Action forms honour. Reads the workspace query the
 * provider already holds, so it costs no extra request. Story points until
 * the workspace has loaded.
 */
export function useWorkspaceEffortUnit(): EffortUnit {
  const { workspaceSlug } = useWorkspace();
  const { data } = api.workspace.getBySlug.useQuery(
    { slug: workspaceSlug ?? "" },
    { enabled: !!workspaceSlug },
  );
  return (data?.effortUnit as EffortUnit | undefined) ?? "STORY_POINTS";
}

"use client";

import { useMemo } from "react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";

/**
 * The canonical @mention candidate list for comment composers inside a
 * workspace: direct workspace members + members of teams linked to the
 * workspace (deduped) + Mastra agents. Agents are taggable badges only;
 * notifications go to human workspace members (the server drops non-member
 * ids on fan-out).
 *
 * Must be rendered under a WorkspaceProvider (any `/w/[workspaceSlug]/`
 * route). Extracted from the identical blocks in ActionDetailContent and
 * FeatureActivitySection so every comment surface shares one source.
 */
export function useWorkspaceMentionCandidates(): MentionCandidate[] {
  const { workspace } = useWorkspace();

  const { data: mastraAgents } = api.mastra.getMastraAgents.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const { data: teamsForLinking } = api.workspace.getUserTeamsForLinking.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id },
  );

  return useMemo(() => {
    const seenIds = new Set<string>();
    const members: MentionCandidate[] = [];

    // Direct workspace members
    for (const m of workspace?.members ?? []) {
      if (!seenIds.has(m.user.id)) {
        seenIds.add(m.user.id);
        members.push({
          id: m.user.id,
          name: m.user.name ?? m.user.email ?? "Unknown",
          type: "member" as const,
          image: m.user.image,
        });
      }
    }

    // Members from teams linked to this workspace
    const linkedTeams = (teamsForLinking ?? []).filter(
      (t) => t.isLinkedToThisWorkspace,
    );
    for (const team of linkedTeams) {
      for (const tm of team.members) {
        if (!seenIds.has(tm.user.id)) {
          seenIds.add(tm.user.id);
          members.push({
            id: tm.user.id,
            name: tm.user.name ?? tm.user.email ?? "Unknown",
            type: "member" as const,
            image: tm.user.image,
          });
        }
      }
    }

    const agents: MentionCandidate[] = (mastraAgents ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      type: "agent" as const,
      image: null,
    }));

    return [...members, ...agents];
  }, [workspace?.members, teamsForLinking, mastraAgents]);
}

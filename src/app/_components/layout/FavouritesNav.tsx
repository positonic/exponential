"use client";

import React from "react";
import { IconTarget, IconTrendingUp } from "@tabler/icons-react";
import { NavLink } from "./NavLinks";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

/**
 * "Favourites" sidebar section. Lists the current user's favourited OKR items
 * scoped to the active workspace (per-user dynamic data from a tRPC query, not
 * the plugin manifest). Each row deep-links to the OKRs page and opens that
 * item's drawer via the `?drawer=<type>:<id>` URL state. Renders nothing when
 * there are no favourites for the workspace.
 */
export function FavouritesNav(): React.JSX.Element | null {
  const { workspaceId, workspaceSlug } = useWorkspace();

  const { data: favourites } = api.favorite.list.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  if (!workspaceSlug || !favourites || favourites.length === 0) {
    return null;
  }

  return (
    <>
      <div className="sb-divider" />
      <div className="sb-section-label">Favourites</div>
      <div className="sb-group sb-group--secondary">
        {favourites.map((fav) => (
          <NavLink
            key={fav.id}
            href={`/w/${workspaceSlug}/goals?tab=okrs&drawer=${fav.entityType}:${fav.entityId}`}
            icon={fav.entityType === "objective" ? IconTarget : IconTrendingUp}
          >
            {fav.title}
          </NavLink>
        ))}
      </div>
    </>
  );
}

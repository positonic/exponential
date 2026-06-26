"use client";

import React from "react";
import {
  IconTarget,
  IconTrendingUp,
  IconBox,
  IconTargetArrow,
  IconLayoutList,
  IconBulb,
  IconAffiliate,
  IconCalendarClock,
  IconClipboardList,
  IconSettings,
  IconFile,
  type Icon,
} from "@tabler/icons-react";
import { NavLink } from "./NavLinks";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

// Maps a stored page-favourite icon name to a glyph. Names are produced by the
// products favourite-target helper; unknown names fall back to a generic file.
const PAGE_ICONS: Record<string, Icon> = {
  product: IconBox,
  problems: IconTargetArrow,
  backlog: IconLayoutList,
  features: IconBulb,
  graph: IconAffiliate,
  cycles: IconCalendarClock,
  research: IconBulb,
  retro: IconClipboardList,
  settings: IconSettings,
};

/**
 * "Favourites" sidebar section. Lists the current user's favourites scoped to
 * the active workspace (per-user dynamic data from a tRPC query). OKR rows
 * (objective / keyResult) deep-link to the OKRs page drawer via the
 * `?drawer=<type>:<id>` URL state; "page" rows link straight to their stored
 * workspace-relative path. Renders nothing when there are no favourites.
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
        {favourites.map((fav) => {
          const href =
            fav.entityType === "page"
              ? `/w/${workspaceSlug}/${fav.entityId}`
              : `/w/${workspaceSlug}/goals?tab=okrs&drawer=${fav.entityType}:${fav.entityId}`;

          let icon: React.ComponentType<IconProps>;
          if (fav.entityType === "objective") {
            icon = IconTarget;
          } else if (fav.entityType === "keyResult") {
            icon = IconTrendingUp;
          } else {
            icon = (fav.icon ? PAGE_ICONS[fav.icon] : undefined) ?? IconFile;
          }

          return (
            <NavLink key={fav.id} href={href} icon={icon}>
              {fav.title}
            </NavLink>
          );
        })}
      </div>
    </>
  );
}

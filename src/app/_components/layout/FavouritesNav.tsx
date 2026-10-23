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
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { NavLink, SectionLabel } from "./NavLinks";
import { useSidebarMode } from "./sidebarMode";
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
 * workspace-relative path. Each row can be un-favourited from a hover
 * control. Renders nothing when there are no favourites, and nothing in the
 * rail, where the generic page glyphs would not tell the rows apart.
 */
export function FavouritesNav(): React.JSX.Element | null {
  const { workspaceId, workspaceSlug } = useWorkspace();
  const mode = useSidebarMode();
  const utils = api.useUtils();

  const { data: favourites } = api.favorite.list.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  const toggle = api.favorite.toggle.useMutation({
    onMutate: async (vars) => {
      const key = { workspaceId: workspaceId ?? undefined };
      await utils.favorite.list.cancel(key);
      const prev = utils.favorite.list.getData(key);
      utils.favorite.list.setData(key, (old) =>
        (old ?? []).filter(
          (f) => !(f.entityType === vars.entityType && f.entityId === vars.entityId),
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        utils.favorite.list.setData({ workspaceId: workspaceId ?? undefined }, ctx.prev);
      }
    },
    onSettled: () => utils.favorite.list.invalidate(),
  });

  if (mode === 'rail') return null;
  if (!workspaceSlug || !favourites || favourites.length === 0) {
    return null;
  }

  return (
    <div className="sb-section">
      <SectionLabel>Favourites</SectionLabel>
      <div className="sb-group sb-group--secondary">
        {favourites.map((fav) => {
          const href =
            fav.entityType === "page"
              ? `/w/${workspaceSlug}/${fav.entityId}`
              : `/w/${workspaceSlug}/goals?tab=okrs&drawer=${fav.entityType}:${fav.entityId}`;

          let icon: Icon;
          if (fav.entityType === "objective") {
            icon = IconTarget;
          } else if (fav.entityType === "keyResult") {
            icon = IconTrendingUp;
          } else {
            icon = (fav.icon ? PAGE_ICONS[fav.icon] : undefined) ?? IconFile;
          }

          return (
            <div key={fav.id} className="sb-nav-row sb-nav-row--actionable">
              <NavLink href={href} icon={icon} title={fav.title}>
                {fav.title}
              </NavLink>
              <button
                type="button"
                className="sb-row-action"
                aria-label={`Remove ${fav.title} from favourites`}
                title="Remove from favourites"
                onClick={() =>
                  toggle.mutate({
                    entityType: fav.entityType,
                    entityId: fav.entityId,
                    workspaceId,
                  })
                }
              >
                <IconX size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

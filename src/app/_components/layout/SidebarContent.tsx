"use client";

import React from "react";
import {
  IconDeviceProjector, IconTarget, IconLayoutGrid,
} from "@tabler/icons-react";
import { NavLink } from "./NavLinks";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

export function SidebarContent(): React.JSX.Element {
  const { workspaceId, workspaceSlug } = useWorkspace();

  const { data: enabledPlugins } = api.pluginConfig.getEnabled.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId, staleTime: 5 * 60 * 1000 },
  );

  const isProductEnabled = enabledPlugins?.includes("product") ?? false;

  return (
    <>
      <NavLink href="/projects" icon={IconDeviceProjector}>
        Projects
      </NavLink>

      {isProductEnabled && workspaceSlug && (
        <NavLink href={`/w/${workspaceSlug}/products`} icon={IconLayoutGrid}>
          Products
        </NavLink>
      )}

      {workspaceSlug && (
        <NavLink href={`/w/${workspaceSlug}/alignment`} icon={IconTarget}>
          Alignment
        </NavLink>
      )}
    </>
  );
}

"use client";

import { IconTargetArrow } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { HomeTile } from "./HomeTile";

export function OkrTile() {
  const { workspaceSlug } = useWorkspace();

  return (
    <HomeTile
      tileId="okrs"
      href={`/w/${workspaceSlug}/okrs`}
      icon={
        <IconTargetArrow
          size={20}
          className="flex-shrink-0 text-amber-400"
        />
      }
      title="OKRs"
      description="Objectives and key results"
    />
  );
}

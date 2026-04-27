import { Badge, Tooltip } from "@mantine/core";
import {
  IconAlertTriangle,
  IconBrandNotion,
  IconCloudCheck,
  IconCloudOff,
} from "@tabler/icons-react";
import { getSyncStatus } from "~/lib/actions/syncStatus";
import type { Action } from "~/lib/actions/types";

export function SyncStatusIndicator({ action }: { action: Action }) {
  const syncInfo = getSyncStatus(action);

  if (syncInfo.status === "not_synced") {
    return null;
  }

  if (syncInfo.status === "deleted_remotely") {
    return (
      <Tooltip
        label={`Deleted from ${syncInfo.provider === "notion" ? "Notion" : syncInfo.provider}. This task no longer exists in the external system.`}
      >
        <Badge
          size="sm"
          color="red"
          variant="light"
          leftSection={<IconCloudOff size={12} />}
        >
          Deleted from {syncInfo.provider === "notion" ? "Notion" : syncInfo.provider}
        </Badge>
      </Tooltip>
    );
  }

  if (syncInfo.status === "failed") {
    return (
      <Tooltip
        label={`Failed to sync to ${syncInfo.provider === "notion" ? "Notion" : syncInfo.provider}. There was an error during synchronization.`}
      >
        <Badge
          size="sm"
          color="orange"
          variant="light"
          leftSection={<IconAlertTriangle size={12} />}
        >
          Sync failed
        </Badge>
      </Tooltip>
    );
  }

  if (syncInfo.status === "synced") {
    if (syncInfo.provider === "notion") {
      return (
        <Tooltip
          label={`Synced to Notion on ${syncInfo.syncedAt ? new Date(syncInfo.syncedAt).toLocaleDateString() : "unknown date"}`}
        >
          <IconBrandNotion size={16} style={{ color: "var(--mantine-color-gray-5)" }} />
        </Tooltip>
      );
    }
    return (
      <Tooltip
        label={`Synced to ${syncInfo.provider} on ${syncInfo.syncedAt ? new Date(syncInfo.syncedAt).toLocaleDateString() : "unknown date"}`}
      >
        <IconCloudCheck size={16} style={{ color: "var(--mantine-color-green-5)" }} />
      </Tooltip>
    );
  }

  return null;
}

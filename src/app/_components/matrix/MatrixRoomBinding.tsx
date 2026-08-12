"use client";

import {
  Alert,
  Button,
  Modal,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "~/trpc/react";
import { MatrixRoomPicker, type MatrixRoomChoice } from "./MatrixRoomPicker";

interface MatrixRoomBindingProps {
  workspaceId: string;
  /** Null binds the workspace default; a project id binds that project. */
  projectId?: string | null;
}

/**
 * Where this project's (or workspace's) meeting summaries go.
 *
 * The project control is the tri-state used elsewhere in the drawer. `Off` is not
 * cosmetic: it hard-blocks posting and does not fall through to the workspace default,
 * which is what makes it usable as a confidential-project escape hatch.
 *
 * The workspace default has no `Off` — there is nothing above it to opt out of, and it
 * ships unset so nothing posts until someone deliberately picks a room.
 */
export function MatrixRoomBinding({
  workspaceId,
  projectId = null,
}: MatrixRoomBindingProps) {
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);
  const [chosen, setChosen] = useState<MatrixRoomChoice | null>(null);

  const utils = api.useUtils();
  const serversQuery = api.matrixServer.list.useQuery({ workspaceId });
  const bindingQuery = api.matrixRoom.getBinding.useQuery({ workspaceId, projectId });

  const servers = serversQuery.data ?? [];
  const serverId = servers[0]?.id ?? null;

  function refresh() {
    void utils.matrixRoom.getBinding.invalidate({ workspaceId, projectId });
  }

  const bind = api.matrixRoom.bind.useMutation({
    onSuccess: () => {
      refresh();
      closePicker();
      setChosen(null);
    },
  });
  const setOff = api.matrixRoom.setOff.useMutation({ onSuccess: refresh });
  const unbind = api.matrixRoom.unbind.useMutation({ onSuccess: refresh });

  if (serversQuery.isLoading || bindingQuery.isLoading) {
    return <Skeleton height={40} radius="md" />;
  }

  if (servers.length === 0) {
    return (
      <Text size="sm" className="text-text-muted">
        No Matrix server is registered for this workspace yet.
      </Text>
    );
  }

  const binding = bindingQuery.data;
  const pending = bind.isPending || setOff.isPending || unbind.isPending;
  const error = bind.error ?? setOff.error ?? unbind.error;

  function handleModeChange(value: string) {
    if (value === "inherit") {
      unbind.mutate({ workspaceId, projectId });
      return;
    }
    if (value === "off" && projectId) {
      setOff.mutate({ workspaceId, projectId });
      return;
    }
    // "room" needs a choice before it means anything.
    openPicker();
  }

  const effective = binding?.effective;

  return (
    <Stack gap="xs">
      {projectId ? (
        <SegmentedControl
          value={binding?.mode ?? "inherit"}
          onChange={handleModeChange}
          disabled={pending}
          fullWidth
          data={[
            {
              label:
                effective?.kind === "room" && binding?.mode === "inherit"
                  ? `Inherit (${effective.name})`
                  : "Inherit (none)",
              value: "inherit",
            },
            { label: "Room", value: "room" },
            { label: "Off", value: "off" },
          ]}
        />
      ) : (
        <Button variant="light" size="xs" onClick={openPicker} disabled={pending}>
          {binding?.room ? "Change default room" : "Set a default room"}
        </Button>
      )}

      {binding?.mode === "room" && binding.room && (
        <Text size="xs" className="text-text-secondary">
          Posting to <span className="text-text-primary">{binding.room.name}</span>.{" "}
          <Button
            variant="subtle"
            size="compact-xs"
            onClick={openPicker}
            disabled={pending}
          >
            Change
          </Button>
        </Text>
      )}

      {binding?.mode === "off" && (
        <Text size="xs" className="text-text-muted">
          Meeting summaries for this project stay in Exponential.
        </Text>
      )}

      {binding?.mode === "inherit" && effective?.kind === "none" && (
        <Text size="xs" className="text-text-muted">
          Nothing is configured, so nothing posts until a room is chosen.
        </Text>
      )}

      {error && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
          {error.message}
        </Alert>
      )}

      <Modal
        opened={pickerOpened}
        onClose={closePicker}
        title={projectId ? "Choose this project's room" : "Choose the default room"}
        size="lg"
      >
        <Stack gap="md">
          {serverId && (
            <MatrixRoomPicker
              workspaceId={workspaceId}
              serverId={serverId}
              selectedRoomId={chosen?.roomId ?? binding?.room?.roomId ?? null}
              onSelect={setChosen}
            />
          )}

          {bind.error && (
            <Alert color="red" variant="light">
              {bind.error.message}
            </Alert>
          )}

          <Button
            disabled={!chosen || !serverId}
            loading={bind.isPending}
            onClick={() => {
              if (!chosen || !serverId) return;
              bind.mutate({
                workspaceId,
                projectId,
                serverId,
                roomId: chosen.roomId,
                roomName: chosen.name,
              });
            }}
          >
            Bind {chosen?.name ?? "the selected room"}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}

"use client";

import { Alert, Loader, Radio, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { api } from "~/trpc/react";

export interface MatrixRoomChoice {
  roomId: string;
  name: string;
  isEncrypted: boolean;
}

interface MatrixRoomPickerProps {
  workspaceId: string;
  serverId: string;
  selectedRoomId?: string | null;
  onSelect?: (room: MatrixRoomChoice) => void;
}

/**
 * Lists the rooms a registered Matrix bot can reach.
 *
 * Only rooms the bot has joined appear — there is no directory search, because the bot
 * cannot post anywhere it has not been invited and joined.
 */
export function MatrixRoomPicker({
  workspaceId,
  serverId,
  selectedRoomId,
  onSelect,
}: MatrixRoomPickerProps) {
  const roomsQuery = api.matrixServer.rooms.useQuery({ workspaceId, serverId });

  if (roomsQuery.isLoading) {
    return (
      <Stack align="center" py="md" gap="xs">
        <Loader size="sm" />
        <Text size="xs" className="text-text-muted">
          Asking the homeserver which rooms the bot is in…
        </Text>
      </Stack>
    );
  }

  if (roomsQuery.error) {
    return (
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
        {roomsQuery.error.message}
      </Alert>
    );
  }

  const joined = roomsQuery.data?.joined ?? [];

  if (joined.length === 0) {
    return (
      <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
        This bot has not joined any rooms yet. Invite it to a room from your Matrix
        client, then check back.
      </Alert>
    );
  }

  return (
    <Stack gap={4}>
      {joined.map((room) => (
        <label
          key={room.roomId}
          className="flex cursor-pointer items-center gap-3 rounded-md border border-border-primary bg-surface-primary px-3 py-2 hover:bg-surface-hover"
        >
          <Radio
            checked={selectedRoomId === room.roomId}
            onChange={() => onSelect?.(room)}
            aria-label={room.name}
          />
          <div className="min-w-0">
            <Text size="sm" className="truncate text-text-primary">
              {room.name}
            </Text>
            <Text size="xs" className="truncate text-text-muted">
              {room.roomId}
            </Text>
          </div>
        </label>
      ))}
    </Stack>
  );
}

"use client";

import { Alert, Button, Loader, Radio, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";
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
 * Why an encrypted room can never be a destination.
 *
 * Not a permission problem and not fixable by inviting the bot again: the bot has no
 * crypto stack (ADR-0043). A homeserver will happily *accept* a plaintext event into an
 * encrypted room, where every client renders it as undecryptable — so silently allowing
 * the choice would look like a successful post that nobody can read.
 */
export const ENCRYPTED_ROOM_REASON =
  "Encrypted — the bot has no encryption keys, so it cannot post here.";

function RoomRow({
  room,
  selected,
  onSelect,
}: {
  room: MatrixRoomChoice;
  selected: boolean;
  onSelect?: (room: MatrixRoomChoice) => void;
}) {
  if (room.isEncrypted) {
    return (
      <div
        className="flex items-center gap-3 rounded-md border border-border-primary bg-surface-secondary px-3 py-2 opacity-60"
        aria-disabled="true"
      >
        <Radio checked={false} disabled readOnly aria-label={room.name} />
        <div className="min-w-0">
          <Text size="sm" className="truncate text-text-secondary">
            {room.name}
          </Text>
          <Text size="xs" className="truncate text-text-muted">
            {ENCRYPTED_ROOM_REASON}
          </Text>
        </div>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border-primary bg-surface-primary px-3 py-2 hover:bg-surface-hover">
      <Radio
        checked={selected}
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
  );
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
  const [acceptingRoomId, setAcceptingRoomId] = useState<string | null>(null);
  const utils = api.useUtils();
  const roomsQuery = api.matrixServer.rooms.useQuery({ workspaceId, serverId });

  const acceptInvite = api.matrixServer.acceptInvite.useMutation({
    onSuccess: (room) => {
      // The room moves from "invited" to "joined", so the listing must be re-read
      // before it can be offered as a destination.
      void utils.matrixServer.rooms.invalidate({ workspaceId, serverId });
      onSelect?.(room);
    },
  });

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
  const invited = roomsQuery.data?.invited ?? [];

  if (joined.length === 0 && invited.length === 0) {
    return (
      <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
        This bot has not joined any rooms yet, and has no pending invites. Invite it
        to a room from your Matrix client, then check back.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {joined.length > 0 && (
        <Stack gap={4}>
          {joined.map((room) => (
            <RoomRow
              key={room.roomId}
              room={room}
              selected={selectedRoomId === room.roomId}
              onSelect={onSelect}
            />
          ))}
        </Stack>
      )}

      {invited.length > 0 && (
        <Stack gap={4}>
          <Text size="xs" fw={600} className="text-text-secondary">
            Pending invites
          </Text>
          <Text size="xs" className="text-text-muted">
            The bot has been invited but has not joined. It cannot post until it does.
          </Text>
          {invited.map((room) => (
            <div
              key={room.roomId}
              className={
                room.isEncrypted
                  ? "flex items-center gap-3 rounded-md border border-border-primary bg-surface-secondary px-3 py-2 opacity-60"
                  : "flex items-center gap-3 rounded-md border border-border-primary bg-surface-secondary px-3 py-2"
              }
            >
              <div className="min-w-0 flex-1">
                <Text
                  size="sm"
                  className={
                    room.isEncrypted
                      ? "truncate text-text-secondary"
                      : "truncate text-text-primary"
                  }
                >
                  {room.name}
                </Text>
                <Text size="xs" className="truncate text-text-muted">
                  {room.isEncrypted ? ENCRYPTED_ROOM_REASON : room.roomId}
                </Text>
              </div>
              <Button
                size="xs"
                variant="light"
                loading={
                  acceptInvite.isPending && acceptingRoomId === room.roomId
                }
                // Joining an encrypted room would spend the invite on a destination
                // the bot can never post to.
                disabled={acceptInvite.isPending || room.isEncrypted}
                onClick={() => {
                  setAcceptingRoomId(room.roomId);
                  acceptInvite.mutate({
                    workspaceId,
                    serverId,
                    roomId: room.roomId,
                  });
                }}
              >
                Accept
              </Button>
            </div>
          ))}
          {acceptInvite.error && (
            <Alert color="red" variant="light">
              {acceptInvite.error.message}
            </Alert>
          )}
        </Stack>
      )}
    </Stack>
  );
}

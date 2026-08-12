"use client";

import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle, IconServer } from "@tabler/icons-react";
import { MatrixRoomPicker } from "~/app/_components/matrix/MatrixRoomPicker";
import { MatrixRoomBinding } from "~/app/_components/matrix/MatrixRoomBinding";
import { useState } from "react";
import { api } from "~/trpc/react";

interface MatrixServerSettingsProps {
  workspace: { id: string; name: string };
  /** Owners and admins only — registering a server means handing over a bot credential. */
  canManage: boolean;
}

export function MatrixServerSettings({
  workspace,
  canManage,
}: MatrixServerSettingsProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [browsingServerId, setBrowsingServerId] = useState<string | null>(null);
  const [removingServerId, setRemovingServerId] = useState<string | null>(null);
  const [homeserverUrl, setHomeserverUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [name, setName] = useState("");

  const utils = api.useUtils();
  const serversQuery = api.matrixServer.list.useQuery({
    workspaceId: workspace.id,
  });

  const removeMutation = api.matrixServer.remove.useMutation({
    onSuccess: () => {
      void utils.matrixServer.list.invalidate({ workspaceId: workspace.id });
    },
  });

  const registerMutation = api.matrixServer.register.useMutation({
    onSuccess: () => {
      void utils.matrixServer.list.invalidate({ workspaceId: workspace.id });
      handleClose();
    },
  });

  function handleClose() {
    close();
    setHomeserverUrl("");
    setAccessToken("");
    setName("");
    registerMutation.reset();
  }

  const servers = serversQuery.data ?? [];

  return (
    <Stack gap="sm">
      {serversQuery.isLoading ? (
        <Skeleton height={56} radius="md" />
      ) : servers.length === 0 ? (
        <Text size="sm" className="text-text-muted">
          No Matrix server registered. Meeting summaries can only be posted to a
          homeserver this workspace has registered.
        </Text>
      ) : (
        servers.map((server) => (
          <Group
            key={server.id}
            gap="sm"
            wrap="nowrap"
            className="rounded-md border border-border-primary bg-surface-primary p-3"
          >
            <IconServer size={18} className="text-text-secondary" />
            <div className="min-w-0">
              <Text size="sm" fw={600} className="truncate text-text-primary">
                {server.botUserId}
              </Text>
              <Text size="xs" className="truncate text-text-muted">
                {server.homeserverUrl}
              </Text>
            </div>
            <Badge
              color={server.status === "ACTIVE" ? "green" : "gray"}
              variant="dot"
              ml="auto"
            >
              {server.status === "ACTIVE" ? "Connected" : server.status}
            </Badge>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setBrowsingServerId(server.id)}
            >
              Browse rooms
            </Button>
            {canManage && (
              <Button
                variant="subtle"
                color="red"
                size="xs"
                loading={
                  removeMutation.isPending && removingServerId === server.id
                }
                onClick={() => {
                  setRemovingServerId(server.id);
                  removeMutation.mutate({
                    workspaceId: workspace.id,
                    serverId: server.id,
                  });
                }}
              >
                Remove
              </Button>
            )}
          </Group>
        ))
      )}

      {servers.length > 0 && (
        <Stack gap={4} className="rounded-md border border-border-primary bg-surface-secondary p-3">
          <Text size="sm" fw={600} className="text-text-primary">
            Default room
          </Text>
          <Text size="xs" className="text-text-muted">
            Used by projects set to Inherit. Ships unset, so nothing posts until
            someone chooses a room.
          </Text>
          <MatrixRoomBinding workspaceId={workspace.id} projectId={null} />
        </Stack>
      )}

      {removeMutation.error && (
        <Alert color="red" variant="light">
          {removeMutation.error.message}
        </Alert>
      )}

      {canManage ? (
        <Group>
          <Button variant="light" onClick={open}>
            {servers.length === 0 ? "Register a Matrix server" : "Register another"}
          </Button>
        </Group>
      ) : (
        <Text size="xs" className="text-text-muted">
          Only workspace owners and admins can register a Matrix server.
        </Text>
      )}

      <Modal
        opened={opened}
        onClose={handleClose}
        title="Register a Matrix server"
        size="lg"
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="md">
          <Text size="sm" className="text-text-muted">
            Exponential posts to your homeserver as a bot user. Create a bot account
            on your homeserver, log it in once, and paste its access token here — the
            token is stored encrypted and is never shown again.
          </Text>

          <TextInput
            label="Homeserver URL"
            placeholder="https://matrix.example.org"
            description="The Client-Server API base URL, not the server name."
            value={homeserverUrl}
            onChange={(event) => setHomeserverUrl(event.currentTarget.value)}
            required
          />

          <PasswordInput
            label="Bot access token"
            placeholder="syt_…"
            description="Verified against the homeserver before anything is saved."
            value={accessToken}
            onChange={(event) => setAccessToken(event.currentTarget.value)}
            required
          />

          <TextInput
            label="Label (optional)"
            placeholder={`Matrix for ${workspace.name}`}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />

          <Alert
            color="yellow"
            variant="light"
            icon={<IconAlertTriangle size={16} />}
          >
            The bot can only post to rooms it has joined, and it cannot post to
            encrypted rooms.
          </Alert>

          {registerMutation.error && (
            <Alert color="red" variant="light">
              {registerMutation.error.message}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="subtle" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              loading={registerMutation.isPending}
              disabled={!homeserverUrl.trim() || !accessToken.trim()}
              onClick={() =>
                registerMutation.mutate({
                  workspaceId: workspace.id,
                  homeserverUrl: homeserverUrl.trim(),
                  accessToken: accessToken.trim(),
                  ...(name.trim() ? { name: name.trim() } : {}),
                })
              }
            >
              Verify and save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={browsingServerId !== null}
        onClose={() => setBrowsingServerId(null)}
        title="Rooms this bot can reach"
        size="lg"
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="md">
          <Text size="sm" className="text-text-muted">
            Only rooms the bot has joined are listed. Invite it from your Matrix
            client to add more.
          </Text>
          {browsingServerId && (
            <MatrixRoomPicker
              workspaceId={workspace.id}
              serverId={browsingServerId}
              canCreateRooms={false}
            />
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}

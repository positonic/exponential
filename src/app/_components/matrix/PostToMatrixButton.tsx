"use client";

import { Alert, Button, Checkbox, Modal, Popover, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle, IconCheck, IconSend } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "~/trpc/react";
import { MatrixRoomPicker, type MatrixRoomChoice } from "./MatrixRoomPicker";

interface PostToMatrixButtonProps {
  meetingId: string;
  workspaceId: string | null;
  projectId?: string | null;
}

/**
 * Posting is always a click, never an event.
 *
 * Matrix has no un-send, so there is deliberately no automatic trigger anywhere — not
 * on project assignment, not on summarization. This button is the only way a summary
 * reaches a room.
 */
export function PostToMatrixButton({
  meetingId,
  workspaceId,
  projectId = null,
}: PostToMatrixButtonProps) {
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);
  // Mantine's Popover is controlled — without `opened` the target click does nothing.
  const [popoverOpened, { toggle: togglePopover, close: closePopover }] =
    useDisclosure(false);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "posted"; roomId: string }
    | { kind: "blocked"; message: string }
    | { kind: "confirm"; roomId: string; lastPostedAt: Date }
  >({ kind: "idle" });
  const [chosen, setChosen] = useState<MatrixRoomChoice | null>(null);
  // Off by default: a one-off post is not a configuration change, and quietly
  // rebinding someone's project from a post dialog would be a surprise.
  const [saveAsProjectRoom, setSaveAsProjectRoom] = useState(false);

  const utils = api.useUtils();
  const serversQuery = api.matrixServer.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );
  const servers = serversQuery.data ?? [];
  const serverId = servers[0]?.id ?? null;

  // Show where this will actually go before it goes there — the destination is
  // configured elsewhere, so the button must not be a leap of faith.
  const bindingQuery = api.matrixRoom.getBinding.useQuery(
    { workspaceId: workspaceId ?? "", projectId },
    { enabled: !!workspaceId },
  );
  const effective = bindingQuery.data?.effective;

  const bindRoom = api.matrixRoom.bind.useMutation({
    onSuccess: () => {
      void utils.matrixRoom.getBinding.invalidate({
        workspaceId: workspaceId ?? "",
        projectId,
      });
    },
  });

  const post = api.transcription.postToMatrix.useMutation({
    onSuccess: (result) => {
      switch (result.kind) {
        case "posted":
          // Persist only now: binding a room to a project on the strength of a post
          // that then failed would leave the project pointing somewhere unproven.
          if (saveAsProjectRoom && chosen && serverId && projectId) {
            bindRoom.mutate({
              workspaceId: workspaceId ?? "",
              projectId,
              serverId,
              roomId: chosen.roomId,
              roomName: chosen.name,
            });
          }
          setStatus({ kind: "posted", roomId: result.roomId });
          closePicker();
          return;
        case "needs-confirm":
          setStatus({
            kind: "confirm",
            roomId: result.roomId,
            lastPostedAt: new Date(result.lastPostedAt),
          });
          return;
        case "no-destination":
          // Not a dead end: offer the picker so the post can still happen.
          setStatus({ kind: "idle" });
          openPicker();
          return;
        case "blocked-off":
          setStatus({
            kind: "blocked",
            message:
              "This project's Matrix posting is switched off, so its summaries stay in Exponential.",
          });
          return;
        case "no-summary":
          setStatus({
            kind: "blocked",
            message: "This meeting has no summary yet — generate one first.",
          });
          return;
        default:
          setStatus({ kind: "blocked", message: result.reason });
      }
    },
  });

  if (!workspaceId || servers.length === 0) return null;

  function postToResolvedRoom(confirmRepost = false) {
    setStatus({ kind: "idle" });
    post.mutate({ meetingId, ...(confirmRepost ? { confirmRepost } : {}) });
  }

  function postToChosenRoom(confirmRepost = false) {
    if (!chosen || !serverId) return;
    setStatus({ kind: "idle" });
    post.mutate({
      meetingId,
      roomId: chosen.roomId,
      serverId,
      ...(confirmRepost ? { confirmRepost } : {}),
    });
  }

  return (
    <>
      <Popover
        width={320}
        position="bottom-end"
        withArrow
        opened={popoverOpened}
        onChange={(next) => (next ? togglePopover() : closePopover())}
        // No transition: the dropdown is a decision surface, not an animation, and a
        // deferred mount makes it untestable and slower to appear.
        transitionProps={{ duration: 0 }}
      >
        <Popover.Target>
          <button className="mp-btn" type="button" onClick={togglePopover}>
            <IconSend size={14} /> Post to Matrix
          </button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            {status.kind === "posted" && (
              <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
                Posted to {status.roomId}.
              </Alert>
            )}

            {status.kind === "blocked" && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
                {status.message}
              </Alert>
            )}

            {status.kind === "confirm" && (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
                <Text size="sm">
                  Already posted to this room{" "}
                  {status.lastPostedAt.toLocaleString()}. Matrix has no un-send, so a
                  second copy is permanent.
                </Text>
                <Button
                  size="xs"
                  mt="xs"
                  color="yellow"
                  loading={post.isPending}
                  onClick={() => (chosen ? postToChosenRoom(true) : postToResolvedRoom(true))}
                >
                  Post again
                </Button>
              </Alert>
            )}

            {post.error && (
              <Alert color="red" variant="light">
                {post.error.message}
              </Alert>
            )}

            {effective?.kind === "room" ? (
              <Text size="xs" className="text-text-muted">
                Goes to <span className="text-text-primary">{effective.name}</span>
                {effective.inherited ? " (workspace default)" : ""}.
              </Text>
            ) : effective?.kind === "off" ? (
              <Text size="xs" className="text-text-muted">
                This project&apos;s Matrix posting is switched off.
              </Text>
            ) : (
              <Text size="xs" className="text-text-muted">
                No room is bound yet — you&apos;ll be asked to pick one.
              </Text>
            )}

            <Button
              size="xs"
              loading={post.isPending}
              onClick={() => postToResolvedRoom()}
            >
              Post summary
            </Button>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => {
                closePopover();
                openPicker();
              }}
            >
              Choose a room
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <Modal
        opened={pickerOpened}
        onClose={closePicker}
        title="Post this summary to a room"
        size="lg"
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="md">
          {serverId && (
            <MatrixRoomPicker
              workspaceId={workspaceId}
              serverId={serverId}
              selectedRoomId={chosen?.roomId ?? null}
              onSelect={setChosen}
            />
          )}

          {projectId && (
            <Checkbox
              checked={saveAsProjectRoom}
              onChange={(event) => setSaveAsProjectRoom(event.currentTarget.checked)}
              label="Save as this project's room"
              description="Future summaries for this project will go here by default."
            />
          )}

          {status.kind === "blocked" && (
            <Alert color="red" variant="light">
              {status.message}
            </Alert>
          )}

          <Button
            disabled={!chosen}
            loading={post.isPending}
            onClick={() => postToChosenRoom()}
          >
            Post to {chosen?.name ?? "the selected room"}
          </Button>
        </Stack>
      </Modal>
    </>
  );
}

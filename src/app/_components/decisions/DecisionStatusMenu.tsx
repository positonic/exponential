"use client";

import { useState } from "react";
import { Button, Group, Menu, Modal, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowsExchange,
  IconBan,
  IconCheck,
  IconChevronDown,
  IconQuestionMark,
  IconRotate,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

/**
 * Lifecycle controls for one confirmed decision (ADR-0060): accept,
 * propose, reopen as a question, supersede (choose the successor) or
 * deprecate. There is deliberately no delete — confirmed decisions leave
 * the log only by being superseded or deprecated.
 */

type DecisionStatus = "OPEN" | "PROPOSED" | "ACCEPTED" | "SUPERSEDED" | "DEPRECATED";

interface DecisionStatusMenuProps {
  workspaceId: string;
  decision: { id: string; label: string; status: DecisionStatus };
}

export function DecisionStatusMenu({ workspaceId, decision }: DecisionStatusMenuProps) {
  const utils = api.useUtils();
  const [supersedeOpen, setSupersedeOpen] = useState(false);
  const [successorId, setSuccessorId] = useState<string | null>(null);

  const setStatus = api.decision.setStatus.useMutation({
    onSuccess: (updated) => {
      void utils.decision.get.invalidate({ workspaceId, decisionId: decision.id });
      void utils.decision.list.invalidate();
      void utils.decision.listForMeeting.invalidate();
      if (updated.supersededById) {
        void utils.decision.get.invalidate({
          workspaceId,
          decisionId: updated.supersededById,
        });
      }
      setSupersedeOpen(false);
      setSuccessorId(null);
    },
    onError: (error) =>
      notifications.show({
        title: "Couldn't change the status",
        message: error.message,
        color: "red",
      }),
  });

  // Candidates for "superseded by": every other confirmed decision the
  // caller may read. Loaded only while the picker is open.
  const { data: candidates } = api.decision.list.useQuery(
    { workspaceId },
    { enabled: supersedeOpen },
  );
  const options = (candidates ?? [])
    .filter((d) => d.id !== decision.id)
    .map((d) => ({ value: d.id, label: `${d.label} — ${d.statement}` }));

  const move = (status: DecisionStatus) =>
    setStatus.mutate({ workspaceId, decisionId: decision.id, status });

  return (
    <>
      <Menu position="bottom-end" width={240} withinPortal>
        <Menu.Target>
          <Button
            variant="default"
            size="xs"
            rightSection={<IconChevronDown size={13} />}
            loading={setStatus.isPending}
          >
            Change status
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {decision.status !== "ACCEPTED" ? (
            <Menu.Item leftSection={<IconCheck size={14} />} onClick={() => move("ACCEPTED")}>
              Mark accepted
            </Menu.Item>
          ) : null}
          {decision.status !== "PROPOSED" ? (
            <Menu.Item leftSection={<IconRotate size={14} />} onClick={() => move("PROPOSED")}>
              Mark proposed
            </Menu.Item>
          ) : null}
          {decision.status !== "OPEN" ? (
            <Menu.Item
              leftSection={<IconQuestionMark size={14} />}
              onClick={() => move("OPEN")}
            >
              Reopen as a question
            </Menu.Item>
          ) : null}
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconArrowsExchange size={14} />}
            onClick={() => setSupersedeOpen(true)}
          >
            Superseded by…
          </Menu.Item>
          {decision.status !== "DEPRECATED" ? (
            <Menu.Item
              color="red"
              leftSection={<IconBan size={14} />}
              onClick={() => move("DEPRECATED")}
            >
              Deprecate
            </Menu.Item>
          ) : null}
        </Menu.Dropdown>
      </Menu>

      <Modal
        opened={supersedeOpen}
        onClose={() => setSupersedeOpen(false)}
        title={`Supersede ${decision.label}`}
        centered
      >
        <Stack gap="md">
          <Text size="sm" className="text-text-secondary">
            Choose the decision that replaces this one. {decision.label} stays in the log,
            marked superseded and linked forward.
          </Text>
          <Select
            label="Superseded by"
            placeholder={options.length === 0 ? "No other decisions yet" : "Pick a decision"}
            data={options}
            value={successorId}
            onChange={setSuccessorId}
            searchable
            nothingFoundMessage="No match"
            disabled={options.length === 0}
          />
          <Group justify="flex-end" gap="xs">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => setSupersedeOpen(false)}
              disabled={setStatus.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                successorId &&
                setStatus.mutate({
                  workspaceId,
                  decisionId: decision.id,
                  status: "SUPERSEDED",
                  supersededById: successorId,
                })
              }
              disabled={!successorId}
              loading={setStatus.isPending}
            >
              Mark superseded
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

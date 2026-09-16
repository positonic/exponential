"use client";

import { useState } from "react";
import { Alert, Button, Code, CopyButton, Group, Modal, Stack, Text } from "@mantine/core";
import { IconCheck, IconCopy, IconFileText, IconInfoCircle } from "@tabler/icons-react";
import { api } from "~/trpc/react";

/**
 * "Draft ADR" (ADR-0060, V3): the ADR file an accepted decision would become,
 * rendered for a person to put in the repository themselves.
 *
 * Exponential never writes ADR content — git is the source of truth and the
 * Decision Log only projects from it. This surface keeps that true: it shows
 * the markdown and the path it belongs at, and the human opens the pull
 * request. Opening that pull request from here needs `contents` and
 * `pull_requests` write on the GitHub App installation, which is read-only
 * today; when that changes this modal grows a button and the rendering below
 * is what it will send.
 */
export function DraftAdrModal({
  workspaceId,
  decisionId,
  opened,
  onClose,
}: {
  workspaceId: string;
  decisionId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, error } = api.decision.adrDraft.useQuery(
    { workspaceId, decisionId },
    { enabled: opened },
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Draft ADR" size="xl" data-testid="draft-adr-modal">
      {isLoading && <Text size="sm" className="text-text-muted">Rendering…</Text>}
      {error && <Text size="sm" className="text-text-muted">{error.message}</Text>}
      {data && (
        <Stack gap="md">
          <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />}>
            <Text size="sm">
              Exponential doesn&apos;t write ADR files — the repository stays the record. Copy this
              into a new file and open a pull request; once it merges, the next sync links it back
              to this decision.
            </Text>
          </Alert>

          <div>
            <Text size="xs" className="text-text-muted" mb={4}>
              Suggested path
              {data.repositoryFullName ? ` in ${data.repositoryFullName}` : " (no ADR repository enrolled yet)"}
            </Text>
            <Code block>{data.path}</Code>
          </div>

          <div>
            <Group justify="space-between" align="center" mb={4}>
              <Text size="xs" className="text-text-muted">
                File content
              </Text>
              <CopyButton value={data.markdown}>
                {({ copied, copy }) => (
                  <Button
                    size="compact-sm"
                    variant={copied ? "light" : "default"}
                    color={copied ? "green" : undefined}
                    leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    onClick={copy}
                    data-testid="copy-adr-markdown"
                  >
                    {copied ? "Copied" : "Copy markdown"}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Code block className="max-h-96 overflow-auto whitespace-pre-wrap">
              {data.markdown}
            </Code>
          </div>
        </Stack>
      )}
    </Modal>
  );
}

/** The button that opens the modal; only meaningful on an accepted decision. */
export function DraftAdrButton({
  workspaceId,
  decisionId,
}: {
  workspaceId: string;
  decisionId: string;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Button
        variant="default"
        size="compact-sm"
        leftSection={<IconFileText size={14} />}
        onClick={() => setOpened(true)}
        data-testid="draft-adr"
      >
        Draft ADR
      </Button>
      <DraftAdrModal
        workspaceId={workspaceId}
        decisionId={decisionId}
        opened={opened}
        onClose={() => setOpened(false)}
      />
    </>
  );
}

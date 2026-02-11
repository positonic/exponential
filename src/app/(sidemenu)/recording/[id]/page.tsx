'use client';

import { api } from "~/trpc/react";
// import { useRouter } from "next/navigation";
import {
  Paper,
  Title,
  Text,
  Skeleton,
  Group,
  Image,
  SimpleGrid,
  Stack,
  Tabs,
  ActionIcon,
  Textarea,
  Button,
  Select,
} from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { use, useEffect, useMemo, useState } from "react";
import RecordingChat from "~/app/_components/RecordingChat";
import { SmartContentRenderer } from "~/app/_components/SmartContentRenderer";
import { TranscriptionContentEditor } from "~/app/_components/TranscriptionContentEditor";
import { TranscriptionRenderer } from "~/app/_components/TranscriptionRenderer";
import SaveActionsButton from "~/app/_components/SaveActionsButton";
import { notifications } from "@mantine/notifications";
import { useAgentModal } from "~/providers/AgentModalProvider";
import { ActionList } from "~/app/_components/ActionList";
import { useRegisterPageContext } from "~/hooks/useRegisterPageContext";

function isMarkdownContent(content: string) {
  const markdownPatterns = [
    /^#{1,6}\s/m,
    /\*\*[^*]+\*\*/,
    /(?<!\*)\*[^*]+\*(?!\*)/,
    /\[[^\]]+\]\([^)]+\)/,
    /^[-*+]\s/m,
    /^\d+\.\s/m,
    /```[\s\S]*?```/,
    /`[^`]+`/,
    /^>\s/m,
  ];
  return markdownPatterns.some((pattern) => pattern.test(content));
}

interface AutoSwitchActionsEffectProps {
  hasAutoSwitched: boolean;
  setHasAutoSwitched: (value: boolean) => void;
  setActiveTab: (value: string) => void;
  actionsSavedAt?: Date | null;
  actionsCount: number;
}

function AutoSwitchActionsEffect({
  hasAutoSwitched,
  setHasAutoSwitched,
  setActiveTab,
  actionsSavedAt,
  actionsCount,
}: AutoSwitchActionsEffectProps) {
  useEffect(() => {
    if (hasAutoSwitched) return;
    const shouldFocusActions = Boolean(actionsSavedAt) || actionsCount > 0;
    if (!shouldFocusActions) return;
    setActiveTab("actions");
    setHasAutoSwitched(true);
  }, [actionsCount, actionsSavedAt, hasAutoSwitched, setActiveTab, setHasAutoSwitched]);

  return null;
}

function isFirefliesFormat(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "sentences" in parsed &&
      Array.isArray((parsed as { sentences: unknown }).sentences) &&
      (parsed as { sentences: unknown[] }).sentences.length > 0
    );
  } catch {
    return false;
  }
}

function TranscriptionTabContent({
  session,
}: {
  session: {
    id: string;
    transcription: string | null;
    sourceIntegration?: { provider: string } | null;
  };
}) {
  const [showRaw, setShowRaw] = useState(false);

  if (!session.transcription) {
    return <Text c="dimmed">No transcription available yet</Text>;
  }

  const provider = session.sourceIntegration?.provider;
  const isFireflies =
    provider === "fireflies" ||
    (!provider && isFirefliesFormat(session.transcription));

  if (isFireflies && !showRaw) {
    return (
      <Stack gap="md">
        <Group justify="flex-end">
          <Button variant="subtle" size="xs" onClick={() => setShowRaw(true)}>
            View Raw / Edit
          </Button>
        </Group>
        <TranscriptionRenderer
          transcription={session.transcription}
          provider="fireflies"
          isPreview={false}
          showCopyButton={true}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {isFireflies && (
        <Group justify="flex-end">
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShowRaw(false)}
          >
            View Formatted
          </Button>
        </Group>
      )}
      <TranscriptionContentEditor
        transcriptionId={session.id}
        initialContent={session.transcription}
      />
    </Stack>
  );
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  
  const { data: session, isLoading } = api.transcription.getById.useQuery({ 
    id: id 
  });
  const { data: transcriptActions = [], isLoading: isActionsLoading } =
    api.action.getByTranscription.useQuery(
      { transcriptionId: id },
      { enabled: Boolean(id) }
    );
  const { data: workspaces } = api.workspace.list.useQuery();
  const utils = api.useUtils();
  const updateDetailsMutation = api.transcription.updateDetails.useMutation();
  const { openModal, setMessages, isOpen: isAgentModalOpen } = useAgentModal();
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [activeTab, setActiveTab] = useState<string>("details");
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false);

  // Register page context so the agent chat knows what recording the user is viewing
  const recordingPageContext = useMemo(() => {
    if (!session) return null;
    return {
      pageType: 'recording' as const,
      pageTitle: session.title ?? 'Transcription Details',
      pagePath: `/recording/${id}`,
      data: {
        transcriptionId: session.id,
        title: session.title ?? 'Untitled',
        summary: session.summary ?? null,
        description: session.description ?? null,
        actionsCount: transcriptActions.length,
        hasTranscription: Boolean(session.transcription),
        meetingDate: session.meetingDate ? String(session.meetingDate) : null,
        workspaceName: session.workspace?.name ?? null,
      },
    };
  }, [session, transcriptActions.length, id]);

  useRegisterPageContext(recordingPageContext);

  // const router = useRouter();

  function handleStartEditDescription() {
    if (!session) return;
    setEditedDescription(session.description ?? "");
    setIsEditingDescription(true);
  }

  function handleStartEditNotes() {
    if (!session) return;
    setEditedNotes(session.notes ?? "");
    setIsEditingNotes(true);
  }

  function handleStartEditSummary() {
    if (!session) return;
    setEditedSummary(session.summary ?? "");
    setIsEditingSummary(true);
  }

  async function handleSaveDescription() {
    if (!session) return;
    try {
      await updateDetailsMutation.mutateAsync({
        id: session.id,
        description: editedDescription,
      });
      notifications.show({
        title: "Saved",
        message: "Description updated successfully",
        color: "green",
      });
      setIsEditingDescription(false);
      void utils.transcription.getById.invalidate({ id });
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to update description",
        color: "red",
      });
    }
  }

  async function handleSaveNotes() {
    if (!session) return;
    try {
      await updateDetailsMutation.mutateAsync({
        id: session.id,
        notes: editedNotes,
      });
      notifications.show({
        title: "Saved",
        message: "Notes updated successfully",
        color: "green",
      });
      setIsEditingNotes(false);
      void utils.transcription.getById.invalidate({ id });
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to update notes",
        color: "red",
      });
    }
  }

  async function handleSaveSummary() {
    if (!session) return;
    try {
      await updateDetailsMutation.mutateAsync({
        id: session.id,
        summary: editedSummary,
      });
      notifications.show({
        title: "Saved",
        message: "Summary updated successfully",
        color: "green",
      });
      setIsEditingSummary(false);
      void utils.transcription.getById.invalidate({ id });
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to update summary",
        color: "red",
      });
    }
  }

  async function handleWorkspaceChange(workspaceId: string | null) {
    if (!session) return;
    try {
      await updateDetailsMutation.mutateAsync({
        id: session.id,
        workspaceId,
      });
      notifications.show({
        title: "Saved",
        message: workspaceId
          ? "Recording moved to workspace"
          : "Recording removed from workspace",
        color: "green",
      });
      void utils.transcription.getById.invalidate({ id });
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to update workspace",
        color: "red",
      });
    }
  }

  if (isLoading) {
    return (
      <>
        <AutoSwitchActionsEffect
          hasAutoSwitched={hasAutoSwitched}
          setHasAutoSwitched={setHasAutoSwitched}
          setActiveTab={setActiveTab}
          actionsSavedAt={undefined}
          actionsCount={transcriptActions.length}
        />
        <Skeleton height={400} />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <AutoSwitchActionsEffect
          hasAutoSwitched={hasAutoSwitched}
          setHasAutoSwitched={setHasAutoSwitched}
          setActiveTab={setActiveTab}
          actionsSavedAt={undefined}
          actionsCount={transcriptActions.length}
        />
        <Paper p="md">
          <Text>Transcription session not found</Text>
        </Paper>
      </>
    );
  }

  const actionPromptText = "Want me to create actions for this transcript?";
  const shouldShowActionPrompt = Boolean(session.transcription) && !session.actionsSavedAt && !isAgentModalOpen;

  function handleActionPromptClick() {
    setMessages((currentMessages) => {
      const hasPrompt = currentMessages.some(
        (message) => message.type === "ai" && message.content === actionPromptText
      );
      if (hasPrompt) return currentMessages;
      return [
        ...currentMessages,
        {
          type: "ai",
          agentName: "Zoe",
          content: actionPromptText,
        },
      ];
    });
    openModal();
  }
  
  return (
    <>
      <AutoSwitchActionsEffect
        hasAutoSwitched={hasAutoSwitched}
        setHasAutoSwitched={setHasAutoSwitched}
        setActiveTab={setActiveTab}
        actionsSavedAt={session.actionsSavedAt}
        actionsCount={transcriptActions.length}
      />
      <Paper p="md">
        <Group justify="space-between" mb="lg">
          <Title order={2}>{session.title ?? "Transcription Details"}</Title>
          {session.transcription && (
            <SaveActionsButton
              transcriptionId={session.id}
              actionsSavedAt={session.actionsSavedAt}
            />
          )}
        </Group>

      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value ?? "details")}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="transcription">Transcription</Tabs.Tab>
          <Tabs.Tab value="screenshots">Screenshots</Tabs.Tab>
          <Tabs.Tab value="actions">Actions</Tabs.Tab>
          <Tabs.Tab value="agent">Agent</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="details" pt="md">
          <Stack gap="sm">
            <Stack gap={4}>
              <Group justify="space-between">
                <Text fw={500}>Description</Text>
                {!isEditingDescription && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handleStartEditDescription}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                )}
              </Group>
              {isEditingDescription ? (
                <Stack gap="sm">
                  <Textarea
                    value={editedDescription}
                    onChange={(event) => setEditedDescription(event.currentTarget.value)}
                    minRows={6}
                    autosize
                    maxRows={16}
                    placeholder="Enter description..."
                    styles={{
                      input: {
                        fontFamily: isMarkdownContent(editedDescription) ? "monospace" : undefined,
                      },
                    }}
                  />
                  {isMarkdownContent(editedDescription) && (
                    <Text size="xs" c="dimmed">
                      Markdown supported.
                    </Text>
                  )}
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => setIsEditingDescription(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => void handleSaveDescription()}
                      loading={updateDetailsMutation.isPending}
                    >
                      Save
                    </Button>
                  </Group>
                </Stack>
              ) : session.description ? (
                <SmartContentRenderer content={session.description} />
              ) : (
                <Text c="dimmed">No description available</Text>
              )}
            </Stack>
            <Stack gap={4}>
              <Group justify="space-between">
                <Text fw={500}>Notes</Text>
                {!isEditingNotes && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handleStartEditNotes}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                )}
              </Group>
              {isEditingNotes ? (
                <Stack gap="sm">
                  <Textarea
                    value={editedNotes}
                    onChange={(event) => setEditedNotes(event.currentTarget.value)}
                    minRows={6}
                    autosize
                    maxRows={16}
                    placeholder="Enter notes..."
                    styles={{
                      input: {
                        fontFamily: isMarkdownContent(editedNotes) ? "monospace" : undefined,
                      },
                    }}
                  />
                  {isMarkdownContent(editedNotes) && (
                    <Text size="xs" c="dimmed">
                      Markdown supported.
                    </Text>
                  )}
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => setIsEditingNotes(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => void handleSaveNotes()}
                      loading={updateDetailsMutation.isPending}
                    >
                      Save
                    </Button>
                  </Group>
                </Stack>
              ) : session.notes ? (
                <SmartContentRenderer content={session.notes} />
              ) : (
                <Text c="dimmed">No notes available</Text>
              )}
            </Stack>
            <Stack gap={4}>
              <Group justify="space-between">
                <Text fw={500}>Summary</Text>
                {!isEditingSummary && (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handleStartEditSummary}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                )}
              </Group>
              {isEditingSummary ? (
                <Stack gap="sm">
                  <Textarea
                    value={editedSummary}
                    onChange={(event) => setEditedSummary(event.currentTarget.value)}
                    minRows={6}
                    autosize
                    maxRows={16}
                    placeholder="Enter summary..."
                    styles={{
                      input: {
                        fontFamily: isMarkdownContent(editedSummary) ? "monospace" : undefined,
                      },
                    }}
                  />
                  {isMarkdownContent(editedSummary) && (
                    <Text size="xs" c="dimmed">
                      Markdown supported.
                    </Text>
                  )}
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => setIsEditingSummary(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => void handleSaveSummary()}
                      loading={updateDetailsMutation.isPending}
                    >
                      Save
                    </Button>
                  </Group>
                </Stack>
              ) : session.summary ? (
                <SmartContentRenderer content={session.summary} />
              ) : (
                <Text c="dimmed">No summary available</Text>
              )}
            </Stack>
          </Stack>
          <Stack gap="xs" mt="lg">
            <Text><strong>Session ID:</strong> {session.sessionId}</Text>
            <Text><strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}</Text>
            <Text><strong>Updated:</strong> {new Date(session.updatedAt).toLocaleString()}</Text>
            {session.meetingDate && (
              <Text><strong>Meeting Date:</strong> {new Date(session.meetingDate).toLocaleString()}</Text>
            )}
          </Stack>
          {workspaces && workspaces.length > 0 && (
            <Select
              label="Workspace"
              description="Move this recording to a different workspace"
              data={[
                { value: '', label: 'No Workspace' },
                ...workspaces.map(ws => ({ value: ws.id, label: ws.name }))
              ]}
              value={session.workspaceId ?? ''}
              onChange={(value) => {
                void handleWorkspaceChange(value === '' ? null : value);
              }}
              mt="md"
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="transcription" pt="md">
          <TranscriptionTabContent session={session} />
        </Tabs.Panel>

        <Tabs.Panel value="screenshots" pt="md">
          {session.screenshots && session.screenshots.length > 0 ? (
            <SimpleGrid cols={3} spacing="md">
              {session.screenshots.map((screenshot: any) => (
                <div key={screenshot.id}>
                  <Text size="sm" c="dimmed" mb="xs">
                    {screenshot.timestamp}
                  </Text>
                  <Image
                    src={screenshot.url}
                    alt={`Screenshot from ${screenshot.timestamp}`}
                    radius="md"
                    onClick={() => window.open(screenshot.url, "_blank")}
                    style={{ cursor: "pointer" }}
                  />
                </div>
              ))}
            </SimpleGrid>
          ) : (
            <Text c="dimmed">No screenshots for this session</Text>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="actions" pt="md">
          {isActionsLoading ? (
            <Skeleton height={200} />
          ) : transcriptActions.length > 0 ? (
            <ActionList
              viewName="transcription-actions"
              actions={transcriptActions}
              showCheckboxes={false}
              showProject
            />
          ) : (
            <Text c="dimmed">No actions created from this transcript yet.</Text>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="agent" pt="md">
          <RecordingChat
            initialMessages={undefined}
            transcription={session.transcription}
            githubSettings={{
              owner: "akashic-fund", // This would come from your project settings in the future
              repo: "akashic",
              validAssignees: ["0xshikhar", "Prajjawalk", "Positonic"],
            }}
          />
        </Tabs.Panel>
      </Tabs>

      {shouldShowActionPrompt ? (
        <button
          type="button"
          onClick={handleActionPromptClick}
          aria-label="Ask the agent to create actions for this transcript"
          className="fixed bottom-36 right-4 z-50 max-w-[240px] rounded-lg border border-border-primary bg-surface-primary px-3 py-2 text-left text-sm text-text-primary shadow-sm transition hover:bg-surface-hover sm:bottom-20"
        >
          <span className="block font-medium">{actionPromptText}</span>
          <span className="absolute -bottom-2 right-6 h-4 w-4 rotate-45 border-b border-r border-border-primary bg-surface-primary" />
        </button>
      ) : null}
      </Paper>
    </>
  );
} 
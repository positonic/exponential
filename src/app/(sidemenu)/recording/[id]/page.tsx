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
} from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { use, useState } from "react";
import RecordingChat from "~/app/_components/RecordingChat";
import { SmartContentRenderer } from "~/app/_components/SmartContentRenderer";
import { TranscriptionContentEditor } from "~/app/_components/TranscriptionContentEditor";
import SaveActionsButton from "~/app/_components/SaveActionsButton";
import { notifications } from "@mantine/notifications";

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

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  // Use React.use to unwrap the params Promise in a client component
  const { id } = use(params);
  
  const { data: session, isLoading } = api.transcription.getById.useQuery({ 
    id: id 
  });
  const utils = api.useUtils();
  const updateDetailsMutation = api.transcription.updateDetails.useMutation();
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  
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

  if (isLoading) {
    return <Skeleton height={400} />;
  }

  if (!session) {
    return (
      <Paper p="md">
        <Text>Transcription session not found</Text>
      </Paper>
    );
  }
  
  return (
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

      <Tabs defaultValue="details" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="transcription">Transcription</Tabs.Tab>
          <Tabs.Tab value="screenshots">Screenshots</Tabs.Tab>
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
        </Tabs.Panel>

        <Tabs.Panel value="transcription" pt="md">
          {session.transcription !== undefined ? (
            <TranscriptionContentEditor
              transcriptionId={session.id}
              initialContent={session.transcription ?? ""}
            />
          ) : (
            <Text c="dimmed">No transcription available yet</Text>
          )}
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

      <Stack gap="xs" mt="lg">
        <Text><strong>Session ID:</strong> {session.sessionId}</Text>
        <Text><strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}</Text>
        <Text><strong>Updated:</strong> {new Date(session.updatedAt).toLocaleString()}</Text>
        {session.meetingDate && (
          <Text><strong>Meeting Date:</strong> {new Date(session.meetingDate).toLocaleString()}</Text>
        )}
      </Stack>
    </Paper>
  );
} 
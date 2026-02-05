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
  Modal,
  Textarea,
  Button,
} from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { use, useState } from "react";
import RecordingChat from "~/app/_components/RecordingChat";
import { SmartContentRenderer } from "~/app/_components/SmartContentRenderer";
import { TranscriptionContentEditor } from "~/app/_components/TranscriptionContentEditor";
import SaveActionsButton from "~/app/_components/SaveActionsButton";

type EditableField = "description" | "notes" | "summary";

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

function getFieldLabel(field: EditableField) {
  if (field === "description") return "Description";
  if (field === "notes") return "Notes";
  return "Summary";
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  // Use React.use to unwrap the params Promise in a client component
  const { id } = use(params);
  
  const { data: session, isLoading } = api.transcription.getById.useQuery({ 
    id: id 
  });
  const utils = api.useUtils();
  const updateDetailsMutation = api.transcription.updateDetails.useMutation({
    onSuccess: () => {
      void utils.transcription.getById.invalidate({ id });
    },
  });
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editingValue, setEditingValue] = useState("");
  
  // const router = useRouter();

  function handleOpenEdit(field: EditableField) {
    if (!session) return;
    const initialValue =
      field === "description"
        ? session.description
        : field === "notes"
          ? session.notes
          : session.summary;
    setEditingValue(initialValue ?? "");
    setEditingField(field);
  }

  function handleCloseEdit() {
    setEditingField(null);
    setEditingValue("");
  }

  function handleSaveEdit() {
    if (!session || !editingField) return;
    const payload =
      editingField === "description"
        ? { description: editingValue }
        : editingField === "notes"
          ? { notes: editingValue }
          : { summary: editingValue };
    updateDetailsMutation.mutate({
      id: session.id,
      ...payload,
    });
    handleCloseEdit();
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
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => handleOpenEdit("description")}
                >
                  <IconPencil size={16} />
                </ActionIcon>
              </Group>
              {session.description ? (
                <SmartContentRenderer content={session.description} />
              ) : (
                <Text c="dimmed">No description available</Text>
              )}
            </Stack>
            <Stack gap={4}>
              <Group justify="space-between">
                <Text fw={500}>Notes</Text>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => handleOpenEdit("notes")}
                >
                  <IconPencil size={16} />
                </ActionIcon>
              </Group>
              {session.notes ? (
                <SmartContentRenderer content={session.notes} />
              ) : (
                <Text c="dimmed">No notes available</Text>
              )}
            </Stack>
            <Stack gap={4}>
              <Group justify="space-between">
                <Text fw={500}>Summary</Text>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => handleOpenEdit("summary")}
                >
                  <IconPencil size={16} />
                </ActionIcon>
              </Group>
              {session.summary ? (
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

      <Modal
        opened={editingField !== null}
        onClose={handleCloseEdit}
        title={editingField ? `Edit ${getFieldLabel(editingField)}` : "Edit"}
        centered
      >
        <Stack gap="sm">
          <Textarea
            value={editingValue}
            onChange={(event) => setEditingValue(event.currentTarget.value)}
            minRows={6}
            autosize
            maxRows={16}
            placeholder={`Enter ${editingField ? getFieldLabel(editingField).toLowerCase() : "content"}...`}
            styles={{
              input: {
                fontFamily: isMarkdownContent(editingValue) ? "monospace" : undefined,
              },
            }}
          />
          {isMarkdownContent(editingValue) && (
            <Text size="xs" c="dimmed">
              Markdown supported.
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={handleCloseEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} loading={updateDetailsMutation.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

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
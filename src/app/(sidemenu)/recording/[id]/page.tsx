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
  Accordion,
  Stack,
} from '@mantine/core';

import { use } from 'react';
import RecordingChat from "~/app/_components/RecordingChat";
import { TranscriptionContentEditor } from "~/app/_components/TranscriptionContentEditor";
import SaveActionsButton from "~/app/_components/SaveActionsButton";
export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  // Use React.use to unwrap the params Promise in a client component
  const { id } = use(params);
  
  const { data: session, isLoading } = api.transcription.getById.useQuery({ 
    id: id 
  });
  
  // const router = useRouter();

 

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
        {session.transcription && <SaveActionsButton />}
      </Group>

      <Stack gap="xs" mb="lg">
        <Text><strong>Session ID:</strong> {session.sessionId}</Text>
        <Text><strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}</Text>
        <Text><strong>Updated:</strong> {new Date(session.updatedAt).toLocaleString()}</Text>
        {session.meetingDate && (
          <Text><strong>Meeting Date:</strong> {new Date(session.meetingDate).toLocaleString()}</Text>
        )}
      </Stack>

      <Accordion multiple defaultValue={["details"]}>
        <Accordion.Item value="details">
          <Accordion.Control>
            <Title order={4}>Details</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <div>
                <Text fw={500}>Description</Text>
                <Text c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                  {session.description ?? "No description available"}
                </Text>
              </div>
              <div>
                <Text fw={500}>Notes</Text>
                <Text c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                  {session.notes ?? "No notes available"}
                </Text>
              </div>
              <div>
                <Text fw={500}>Summary</Text>
                <Text c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                  {session.summary ?? "No summary available"}
                </Text>
              </div>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="transcription">
          <Accordion.Control>
            <Title order={4}>Transcription</Title>
          </Accordion.Control>
          <Accordion.Panel>
            {session.transcription !== undefined ? (
              <TranscriptionContentEditor
                transcriptionId={session.id}
                initialContent={session.transcription ?? ''}
              />
            ) : (
              <Text c="dimmed">No transcription available yet</Text>
            )}
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="screenshots">
          <Accordion.Control>
            <Title order={4}>Screenshots</Title>
          </Accordion.Control>
          <Accordion.Panel>
            {session.screenshots && session.screenshots.length > 0 ? (
              <SimpleGrid cols={3} spacing="md">
                {session.screenshots.map((screenshot: any) => (
                  <div key={screenshot.id}>
                    <Text size="sm" c="dimmed" mb="xs">{screenshot.timestamp}</Text>
                    <Image
                      src={screenshot.url}
                      alt={`Screenshot from ${screenshot.timestamp}`}
                      radius="md"
                      onClick={() => window.open(screenshot.url, '_blank')}
                      style={{ cursor: 'pointer' }}
                    />
                  </div>
                ))}
              </SimpleGrid>
            ) : (
              <Text c="dimmed">No screenshots for this session</Text>
            )}
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="chat">
          <Accordion.Control>
            <Title order={4}>Chat</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <RecordingChat 
              initialMessages={undefined}
              transcription={session.transcription}
              githubSettings={{
                owner: "akashic-fund", // This would come from your project settings in the future
                repo: "akashic",
                validAssignees: ["0xshikhar", "Prajjawalk", "Positonic"]
              }}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Paper>
  );
} 
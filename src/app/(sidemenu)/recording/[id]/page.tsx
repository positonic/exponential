'use client';

import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";
import { 
  Paper, 
  Title, 
  Text,
  Skeleton,
  Button,
  Group,
  Table,
  Badge,
  Image,
  SimpleGrid,
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
  
  const router = useRouter();

 

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
        <Title order={2}>Transcription Details</Title>
        {session.transcription && (
          <SaveActionsButton />
        )}
      </Group>
      
      <Text mb="xs"><strong>Session ID:</strong> {session.sessionId}</Text>
      <Text mb="xs"><strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}</Text>
      <Text mb="xs"><strong>Updated:</strong> {new Date(session.updatedAt).toLocaleString()}</Text>
      
      <Title order={3} mt="xl" mb="md">Transcription</Title>
      {session.transcription !== undefined ? (
        <TranscriptionContentEditor
          transcriptionId={session.id}
          initialContent={session.transcription ?? ''}
        />
      ) : (
        <Text c="dimmed">No transcription available yet</Text>
      )}

      <Title order={3} mt="xl" mb="md">Screenshots</Title>
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

      <RecordingChat 
        initialMessages={undefined}
        transcription={session.transcription}
        githubSettings={{
          owner: "akashic-fund", // This would come from your project settings in the future
          repo: "akashic",
          validAssignees: ["0xshikhar", "Prajjawalk", "Positonic"]
        }}
      />
    </Paper>
  );
} 
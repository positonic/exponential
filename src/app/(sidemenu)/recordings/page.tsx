'use client';

import { api } from "~/trpc/react";
import { 
  Paper, 
  Title, 
  Table, 
  Badge,
  Text,
  Skeleton,
  Button,
  Group,
} from '@mantine/core';
import { useRouter } from 'next/navigation';


const meetingSummaryPrompt = `
  [Meeting Topic or Title]
[Meeting Date]

Summary
Concise overview of the key themes, goals, and outcomes of the meeting.

Technical Discussion
Key architectural or protocol decisions

Integration details

Design trade-offs or requirements

Decisions Made
Clear bullet points for each decision taken during the meeting

Next Steps
High-level next actions that were agreed upon

Tasks by Person
List all action items discussed in the transcript, grouped by person responsible, including any needed context.

[Name]:

Task 1

Task 2

...

The goal is to make this usable for project tracking (e.g. in GitHub or Notion). Make sure it’s written clearly, with specific actionable language and no informal speech.


`;

function SessionsList() {
  const { data: sessions, isLoading } = api.transcription.getSessions.useQuery();
  // const createSetupsMutation = api.setups.createFromTranscription.useMutation({
  //   onSuccess: () => {
  //     notifications.show({
  //       title: 'Success',
  //       message: 'Setups created successfully',
  //       color: 'green',
  //     });
  //   },
  //   onError: (error) => {
  //     notifications.show({
  //       title: 'Error',
  //       message: error.message,
  //       color: 'red',
  //     });
  //   },
  // });
  const router = useRouter();

  if (isLoading) {
    return <Skeleton height={400} />;
  }

  const formatDuration = (startDate: Date, endDate: Date) => {
    const diff = new Date(endDate).getTime() - new Date(startDate).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Paper p="md" radius="sm">
      <Title order={2} mb="lg">Transcription Sessions</Title>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Session ID</Table.Th>
            <Table.Th>Duration</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sessions?.map((session) => (
            <Table.Tr 
              key={session.id}
              style={{ cursor: 'pointer' }}
              onClick={() => router.push(`/session/${session.id}`)}
            >
              <Table.Td>{session.setupId}</Table.Td>
              <Table.Td>{formatDuration(session.createdAt, session.updatedAt)}</Table.Td>
              <Table.Td>
                <Badge color={session.transcription ? 'green' : 'yellow'}>
                  {session.transcription ? 'Completed' : 'In Progress'}
                </Badge>
              </Table.Td>
              <Table.Td onClick={(e) => e.stopPropagation()}>
                <Group gap="xs">
                  <Button 
                    size="xs"
                    variant="light"
                    onClick={() => router.push(`/session/${session.id}`)}
                  >
                    View
                  </Button>
                  {/* {session.transcription && (
                    <Button
                      size="xs"
                      variant="light"
                      loading={createSetupsMutation.isPending}
                      onClick={() => createSetupsMutation.mutate({ transcriptionId: session.id })}
                    >
                      Create Setups
                    </Button>
                  )} */}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {!sessions?.length && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed">
                  No transcription sessions found
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

export default function ScansPage() {
  return (
    <div>
      <h1>Recordings</h1>
      <SessionsList />
    </div>
  );
} 
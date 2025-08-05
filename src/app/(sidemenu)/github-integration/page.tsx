'use client';

import { useState } from 'react';
import { api } from '~/trpc/react';
import { 
  Button, 
  Container, 
  Group, 
  Paper, 
  Text, 
  Title, 
  TextInput, 
  Textarea,
  Box,
  Stack,
  Alert,
  Code,
  Skeleton,
} from '@mantine/core';
import { IconBrandGithub, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { DEFAULT_SETTINGS } from '~/server/services/githubService';

interface CreatedIssue {
  number: number;
  title: string;
  url: string;
}

export default function GitHubIntegrationPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [repo, setRepo] = useState(DEFAULT_SETTINGS.repo);
  const [owner, setOwner] = useState(DEFAULT_SETTINGS.owner);
  const [issueType, setIssueType] = useState<'user-story' | 'task' | 'epic'>('task');
  const [createdIssue, setCreatedIssue] = useState<CreatedIssue | null>(null);
  
  const createIssueMutation = api.github.createIssue.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Issue Created',
        message: `Successfully created issue #${data.issue.number}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      
      setCreatedIssue({
        number: data.issue.number,
        title: data.issue.title,
        url: data.issue.url,
      });
      
      // Reset form
      setTitle('');
      setDescription('');
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message,
        color: 'red',
      });
    }
  });

  const handleCreateIssue = () => {
    createIssueMutation.mutate({
      title,
      body: description,
      repo: repo,
      owner: owner,
      type: issueType,
      labels: [issueType],
    });
  };

  return (
    <Container size="lg" py="xl">
      <Title mb="lg">GitHub Issue Creator</Title>
      
      <Alert icon={<IconAlertCircle size={16} />} color="blue" mb="md">
        This tool requires a GitHub token to be set as <Code>GITHUB_TOKEN</Code> in your environment variables.
      </Alert>
      
      <Paper p="md" mb="xl" withBorder>
        <Title order={2} mb="md">Create GitHub Issue</Title>
        <Stack>
          <TextInput
            label="Title"
            placeholder="Issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          
          <Textarea
            label="Description"
            placeholder="Issue description"
            minRows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          
          <Group align="flex-end">
            <TextInput
              label="Repository"
              placeholder="Repository name"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              required
            />
            
            <TextInput
              label="Owner"
              placeholder="Repository owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              required
            />
          </Group>
          
          <Group>
            <Button 
              variant="outline" 
              color={issueType === 'task' ? 'blue' : 'gray'}
              onClick={() => setIssueType('task')}
            >
              Task
            </Button>
            <Button 
              variant="outline" 
              color={issueType === 'user-story' ? 'blue' : 'gray'}
              onClick={() => setIssueType('user-story')}
            >
              User Story
            </Button>
            <Button 
              variant="outline" 
              color={issueType === 'epic' ? 'blue' : 'gray'}
              onClick={() => setIssueType('epic')}
            >
              Epic
            </Button>
          </Group>
          
          <Button 
            leftSection={<IconBrandGithub size={20} />}
            onClick={handleCreateIssue}
            loading={createIssueMutation.isPending}
            disabled={!title || !description}
            mt="md"
          >
            Create Issue
          </Button>
        </Stack>
      </Paper>
      
      {createIssueMutation.isPending && (
        <Paper p="md" withBorder>
          <Skeleton height={100} />
        </Paper>
      )}
      
      {createdIssue && (
        <Paper p="md" withBorder>
          <Title order={3} mb="md">Issue Created</Title>
          <Text>
            <strong>#{createdIssue.number}:</strong> {createdIssue.title}
          </Text>
          <Box mt="md">
            <a 
              href={createdIssue.url} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <Button variant="outline" leftSection={<IconBrandGithub size={16} />}>
                View on GitHub
              </Button>
            </a>
          </Box>
        </Paper>
      )}
    </Container>
  );
}

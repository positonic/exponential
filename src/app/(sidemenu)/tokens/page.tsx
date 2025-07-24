'use client';

import { useState } from 'react';
import { 
  Container, 
  Title, 
  Text, 
  Button, 
  Table, 
  Badge, 
  Group,
  Stack,
  Paper,
  ActionIcon,
  Tooltip,
  Modal,
  TextInput,
  Select,
  Textarea,
  Alert,
  Code,
  CopyButton
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconKey, IconTrash, IconCopy, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import Link from 'next/link';

// interface ApiToken {
//   tokenId: string;
//   name: string;
//   expiresAt: string;
//   expiresIn: string;
//   userId: string;
// }

interface CreateTokenForm {
  name: string;
  expiresIn: string;
  description?: string;
}

export default function TokensPage() {
  const [opened, { open, close }] = useDisclosure(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  // API calls
  const { data: tokens = [], isLoading, refetch } = api.mastra.listApiTokens.useQuery();
  const generateToken = api.mastra.generateApiToken.useMutation({
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      setShowToken(true);
      notifications.show({
        title: 'API Key Generated',
        message: 'Your 32-character API key has been generated successfully. Perfect for webhooks! Make sure to copy it now!',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
      form.reset();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to generate API key',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const revokeToken = api.mastra.revokeApiToken.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'API Key Revoked',
        message: 'The API key has been revoked successfully.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to revoke API key',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const form = useForm<CreateTokenForm>({
    initialValues: {
      name: '',
      expiresIn: '24h',
      description: '',
    },
    validate: {
      name: (value) => value.trim().length === 0 ? 'API key name is required' : null,
    },
  });

  const handleCreateToken = async (values: CreateTokenForm) => {
    await generateToken.mutateAsync({
      name: values.name,
      expiresIn: values.expiresIn,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = (dateString: string) => {
    return new Date(dateString) < new Date();
  };

  const handleCloseModal = () => {
    close();
    setShowToken(false);
    setGeneratedToken(null);
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={1} size="h2">API Access Tokens</Title>
            <Text c="dimmed" size="sm">
              Generate API keys for external applications to access YOUR Exponential data
            </Text>
            <Text c="orange" size="sm" mt="xs">
              🔗 Looking to connect Exponential to external services? <Link href="/integrations" style={{ textDecoration: 'underline' }}>Set up integrations here</Link>
            </Text>
          </div>
          <Button 
            leftSection={<IconPlus size={16} />}
            onClick={open}
          >
            Create API Key
          </Button>
        </Group>

        {/* Tokens Table */}
        <Paper withBorder p="md">
          {isLoading ? (
            <Text>Loading API keys...</Text>
          ) : tokens && tokens.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Expires</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tokens.map((token) => (
                  <Table.Tr key={token.tokenId}>
                    <Table.Td>
                      <Group gap="xs">
                        <IconKey size={16} />
                        <Text fw={500}>{token.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(token.expiresAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge 
                        color={isExpired(token.expiresAt) ? 'red' : 'green'}
                        variant="light"
                      >
                        {isExpired(token.expiresAt) ? 'Expired' : 'Active'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Revoke API key">
                          <ActionIcon 
                            color="red" 
                            variant="light"
                            size="sm"
                            loading={revokeToken.isPending}
                            onClick={() => revokeToken.mutate({ tokenId: token.tokenId })}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Stack align="center" py="xl">
              <IconKey size={48} color="gray" />
              <Text size="lg" fw={500}>No API keys found</Text>
              <Text c="dimmed" ta="center">
                Create your first API key to start using the API with Mastra agents and webhooks
              </Text>
            </Stack>
          )}
        </Paper>

        {/* Create Token Modal */}
        <Modal 
          opened={opened} 
          onClose={handleCloseModal}
          title="Create API Key"
          size="md"
        >
          <form onSubmit={form.onSubmit(handleCreateToken)}>
            <Stack gap="md">
              {!showToken ? (
                <>
                  <TextInput
                    label="API Key Name"
                    placeholder="e.g., Fireflies Webhook"
                    required
                    {...form.getInputProps('name')}
                  />

                  <Select
                    label="Expires In"
                    data={[
                      { value: '1h', label: '1 hour' },
                      { value: '24h', label: '24 hours' },
                      { value: '7d', label: '7 days' },
                      { value: '30d', label: '30 days' },
                      { value: '90d', label: '90 days' },
                    ]}
                    {...form.getInputProps('expiresIn')}
                  />

                  <Textarea
                    label="Description (Optional)"
                    placeholder="What will this token be used for?"
                    {...form.getInputProps('description')}
                    minRows={2}
                  />

                  <Alert 
                    icon={<IconAlertCircle size={16} />}
                    title="Important"
                    color="blue"
                  >
                    API keys are 32 characters and perfect for webhooks (like Fireflies). Copy your key after creation - you won&apos;t be able to see it again.
                  </Alert>

                  <Group justify="flex-end">
                    <Button variant="light" onClick={handleCloseModal}>
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      loading={generateToken.isPending}
                    >
                      Generate API Key
                    </Button>
                  </Group>
                </>
              ) : (
                <>
                  <Alert 
                    icon={<IconCheck size={16} />}
                    title="API Key Generated Successfully"
                    color="green"
                  >
                    Your 32-character API key has been generated. Perfect for webhook secrets! Copy it now and store it securely.
                  </Alert>

                  <div>
                    <Text size="sm" fw={500} mb="xs">Your API Key (32 characters):</Text>
                    <Paper withBorder p="sm" bg="gray.0">
                      <Group justify="space-between" wrap="nowrap">
                        <Code 
                          style={{ 
                            wordBreak: 'break-all',
                            fontSize: '12px',
                            flex: 1
                          }}
                        >
                          {generatedToken}
                        </Code>
                        <CopyButton value={generatedToken || ''}>
                          {({ copied, copy }) => (
                            <ActionIcon 
                              color={copied ? 'teal' : 'gray'} 
                              onClick={copy}
                              variant="light"
                            >
                              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            </ActionIcon>
                          )}
                        </CopyButton>
                      </Group>
                    </Paper>
                  </div>

                  <Alert 
                    icon={<IconAlertCircle size={16} />}
                    title="Security Notice"
                    color="red"
                  >
                    This API key will not be shown again. Save it securely - it&apos;s perfect for webhook configurations!
                  </Alert>

                  <Group justify="flex-end">
                    <Button onClick={handleCloseModal}>
                      Done
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </form>
        </Modal>
      </Stack>
    </Container>
  );
}
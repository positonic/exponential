'use client';

import { useState } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Button,
  Group,
  Select,
  Alert,
  Table,
  Text,
  Badge,
  ActionIcon,
  Avatar,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconUserPlus,
  IconTrash,
  IconPhone,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';

interface WhatsAppPhoneMappingProps {
  integrationId: string;
  opened: boolean;
  onClose: () => void;
}

export function WhatsAppPhoneMapping({ integrationId, opened, onClose }: WhatsAppPhoneMappingProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Fetch existing mappings
  const { data: mappings = [], refetch } = api.integration.getWhatsAppPhoneMappings.useQuery(
    { integrationId },
    { enabled: opened }
  );

  // Fetch team members for selection
  const { data: teamData } = api.team.list.useQuery();
  const teamMembers = teamData?.flatMap(team => 
    team.members.map(m => ({
      value: m.user.id,
      label: m.user.name || m.user.email || 'Unknown',
      image: m.user.image,
      role: m.role,
    }))
  ) || [];

  // Add phone mapping mutation
  const addMapping = api.integration.mapWhatsAppPhoneToUser.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Phone Number Mapped',
        message: 'Successfully mapped phone number to user',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      form.reset();
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Mapping Failed',
        message: error.message,
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  // Remove phone mapping mutation
  const removeMapping = api.integration.removeWhatsAppPhoneMapping.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Mapping Removed',
        message: 'Successfully removed phone number mapping',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: 'Removal Failed',
        message: error.message,
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const form = useForm({
    initialValues: {
      phoneNumber: '',
      userId: '',
    },
    validate: {
      phoneNumber: (value) => {
        if (!value) return 'Phone number is required';
        if (!value.match(/^\+?[1-9]\d{1,14}$/)) {
          return 'Invalid phone number format. Use international format (e.g., +1234567890)';
        }
        return null;
      },
      userId: (value) => {
        if (!value) return 'Please select a user';
        return null;
      },
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setIsLoading(true);
    try {
      await addMapping.mutateAsync({
        integrationId,
        phoneNumber: values.phoneNumber,
        userId: values.userId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhoneNumber = (phone: string) => {
    // Format phone number for display
    if (phone.length === 11 && phone.startsWith('1')) {
      return `+1 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`;
    }
    return phone;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="WhatsApp Phone Number Mapping"
      size="lg"
    >
      <Stack gap="lg">
        <Alert
          icon={<IconPhone size={16} />}
          color="blue"
        >
          Map WhatsApp phone numbers to users in your system. When users send messages from these phone numbers, 
          they will be automatically linked to their accounts.
        </Alert>

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label="Phone Number"
              placeholder="+1234567890"
              description="Use international format with country code"
              required
              leftSection={<IconPhone size={16} />}
              {...form.getInputProps('phoneNumber')}
            />

            <Select
              label="User"
              placeholder="Select a user"
              description="The user this phone number belongs to"
              required
              data={[
                { value: '', label: 'Current User (Me)' },
                ...teamMembers,
              ]}
              searchable
              {...form.getInputProps('userId')}
            />

            <Button
              type="submit"
              leftSection={<IconUserPlus size={16} />}
              loading={isLoading}
              fullWidth
            >
              Add Mapping
            </Button>
          </Stack>
        </form>

        {mappings.length > 0 && (
          <>
            <Text fw={500} size="sm">Existing Mappings</Text>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Phone Number</Table.Th>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {mappings.map((mapping) => (
                  <Table.Tr key={mapping.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <IconPhone size={16} />
                        <Text size="sm">{formatPhoneNumber(mapping.externalUserId)}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Avatar
                          src={mapping.user.image}
                          size="sm"
                          radius="xl"
                        >
                          {mapping.user.name?.[0] || mapping.user.email?.[0]}
                        </Avatar>
                        <div>
                          <Text size="sm" fw={500}>{mapping.user.name}</Text>
                          <Text size="xs" c="dimmed">{mapping.user.email}</Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {/* Role would come from team membership, not user directly */}
                      <Text size="sm" c="dimmed">-</Text>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Remove mapping">
                        <ActionIcon
                          color="red"
                          variant="light"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to remove this phone number mapping?')) {
                              removeMapping.mutate({
                                integrationId,
                                phoneNumber: mapping.externalUserId,
                              });
                            }
                          }}
                          loading={removeMapping.isPending}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </>
        )}
      </Stack>
    </Modal>
  );
}
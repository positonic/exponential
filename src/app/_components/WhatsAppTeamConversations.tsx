'use client';

import { useState } from 'react';
import {
  Modal,
  Stack,
  Table,
  Text,
  Badge,
  Group,
  Avatar,
  TextInput,
  Select,
  ScrollArea,
  Alert,
  LoadingOverlay,
} from '@mantine/core';
import {
  IconSearch,
  IconMessage,
  IconUsers,
  IconShieldCheck,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatDistanceToNow } from 'date-fns';

interface WhatsAppTeamConversationsProps {
  integrationId: string;
  opened: boolean;
  onClose: () => void;
}


export function WhatsAppTeamConversations({ 
  integrationId, 
  opened, 
  onClose 
}: WhatsAppTeamConversationsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  // Get user permissions
  const { data: permissions } = api.integration.getWhatsAppPermissions.useQuery(
    { integrationId },
    { enabled: opened }
  );

  // Get team conversations
  const { data: conversationsData, isLoading } = api.integration.getWhatsAppTeamConversations.useQuery(
    { integrationId },
    { enabled: opened }
  );

  const conversations = conversationsData?.conversations || [];
  
  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = searchQuery === '' || 
      conv.phoneNumber.includes(searchQuery) ||
      conv.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.user?.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = !roleFilter || conv.user?.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  // Get unique roles for filter
  const uniqueRoles = Array.from(
    new Set(conversations.map(c => c.user?.role).filter(Boolean))
  );

  const hasViewAllPermission = permissions?.includes('whatsapp:view_all_conversations');
  const hasViewTeamPermission = permissions?.includes('whatsapp:view_team_conversations');

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Team WhatsApp Conversations"
      size="xl"
    >
      <Stack gap="lg">
        <Alert
          icon={<IconUsers size={16} />}
          color="blue"
        >
          {hasViewAllPermission ? (
            'You can view all conversations across your organization.'
          ) : hasViewTeamPermission ? (
            'You can view conversations from your team members.'
          ) : (
            'You can only view your own conversations.'
          )}
        </Alert>

        <Group>
          <TextInput
            placeholder="Search by phone or user..."
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          
          <Select
            placeholder="Filter by role"
            data={[
              { value: '', label: 'All Roles' },
              ...uniqueRoles.map(role => ({ value: role, label: role }))
            ]}
            value={roleFilter}
            onChange={setRoleFilter}
            clearable
            style={{ width: 150 }}
          />
        </Group>

        <LoadingOverlay visible={isLoading} />
        
        <ScrollArea h={400}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Phone Number</Table.Th>
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Messages</Table.Th>
                <Table.Th>Last Activity</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredConversations.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed" ta="center" py="md">
                      No conversations found
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredConversations.map((conversation) => (
                  <Table.Tr key={conversation.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <IconMessage size={16} />
                        <Text size="sm">{conversation.phoneNumber}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {conversation.user ? (
                        <Group gap="xs">
                          <Avatar
                            src={conversation.user.image}
                            size="sm"
                            radius="xl"
                          >
                            {conversation.user.name?.[0] || conversation.user.email?.[0]}
                          </Avatar>
                          <div>
                            <Text size="sm" fw={500}>{conversation.user.name}</Text>
                            <Text size="xs" c="dimmed">{conversation.user.email}</Text>
                          </div>
                        </Group>
                      ) : (
                        <Text size="sm" c="dimmed">Unknown User</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {conversation.user?.role && (
                        <Badge size="sm" variant="light">
                          {conversation.user.role}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="filled" color="gray">
                        {conversation.messageCount}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {/* View conversation action removed */}
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        {permissions && (
          <Group gap="xs">
            <IconShieldCheck size={16} />
            <Text size="xs" c="dimmed">
              Your permissions: {permissions.join(', ')}
            </Text>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}
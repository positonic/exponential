'use client';

import { useState } from 'react';
import {
  Title,
  Text,
  TextInput,
  Button,
  Table,
  Group,
  Avatar,
  Badge,
  Skeleton,
  ActionIcon,
  Menu,
  Modal,
  Stack,
  Select,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconSearch,
  IconPlus,
  IconDotsVertical,
  IconEye,
  IconEdit,
  IconTrash,
  IconBuilding,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';

function ContactForm({
  workspaceId,
  onSuccess,
  onCancel,
}: {
  workspaceId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    linkedIn: '',
    organizationId: '',
  });

  const utils = api.useUtils();

  const { data: organizations } = api.crmOrganization.getAll.useQuery({
    workspaceId,
    limit: 100,
  });

  const createContact = api.crmContact.create.useMutation({
    onSuccess: () => {
      void utils.crmContact.getAll.invalidate();
      void utils.crmContact.getStats.invalidate();
      notifications.show({
        title: 'Success',
        message: 'Contact created successfully',
        color: 'green',
      });
      onSuccess();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message,
        color: 'red',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createContact.mutate({
      workspaceId,
      firstName: formData.firstName || undefined,
      lastName: formData.lastName || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      linkedIn: formData.linkedIn || undefined,
      organizationId: formData.organizationId || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Group grow>
          <TextInput
            label="First Name"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
          />
          <TextInput
            label="Last Name"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
          />
        </Group>
        <TextInput
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
        <TextInput
          label="Phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
        <TextInput
          label="LinkedIn URL"
          value={formData.linkedIn}
          onChange={(e) => setFormData({ ...formData, linkedIn: e.target.value })}
        />
        <Select
          label="Organization"
          placeholder="Select organization"
          data={organizations?.organizations.map((org) => ({
            value: org.id,
            label: org.name,
          })) ?? []}
          value={formData.organizationId}
          onChange={(value) => setFormData({ ...formData, organizationId: value ?? '' })}
          clearable
          searchable
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={createContact.isPending}>
            Create Contact
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [search, setSearch] = useState('');
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);

  const { data, isLoading } = api.crmContact.getAll.useQuery(
    {
      workspaceId: workspaceId!,
      includeOrganization: true,
      search: search || undefined,
    },
    { enabled: !!workspaceId }
  );

  const utils = api.useUtils();

  const deleteContact = api.crmContact.delete.useMutation({
    onSuccess: () => {
      void utils.crmContact.getAll.invalidate();
      void utils.crmContact.getStats.invalidate();
      notifications.show({
        title: 'Success',
        message: 'Contact deleted successfully',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message,
        color: 'red',
      });
    },
  });

  if (workspaceLoading) {
    return (
      <div className="space-y-6">
        <Skeleton height={40} width={200} />
        <Skeleton height={400} />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="space-y-6">
        <Text className="text-text-secondary">Workspace not found</Text>
      </div>
    );
  }

  const basePath = `/w/${workspace.slug}/crm`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title order={2} className="text-text-primary">
            Contacts
          </Title>
          <Text className="text-text-muted">
            Manage your contacts and relationships
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
          Add Contact
        </Button>
      </div>

      <TextInput
        placeholder="Search contacts..."
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {isLoading ? (
        <div className="overflow-hidden rounded-lg border border-border-primary">
          <Table>
            <Table.Thead className="bg-surface-secondary">
              <Table.Tr>
                <Table.Th className="text-text-muted">Name</Table.Th>
                <Table.Th className="text-text-muted">Email</Table.Th>
                <Table.Th className="text-text-muted">Organization</Table.Th>
                <Table.Th className="text-text-muted">Last Interaction</Table.Th>
                <Table.Th className="text-text-muted">Tags</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  <Table.Td>
                    <Group gap="sm">
                      <Skeleton circle height={32} />
                      <Skeleton height={20} width={100} />
                    </Group>
                  </Table.Td>
                  <Table.Td><Skeleton height={20} width={150} /></Table.Td>
                  <Table.Td><Skeleton height={20} width={100} /></Table.Td>
                  <Table.Td><Skeleton height={20} width={80} /></Table.Td>
                  <Table.Td><Skeleton height={20} width={60} /></Table.Td>
                  <Table.Td><Skeleton height={20} width={30} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      ) : data?.contacts && data.contacts.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border-primary">
          <Table highlightOnHover>
            <Table.Thead className="bg-surface-secondary">
              <Table.Tr>
                <Table.Th className="text-text-muted">Name</Table.Th>
                <Table.Th className="text-text-muted">Email</Table.Th>
                <Table.Th className="text-text-muted">Organization</Table.Th>
                <Table.Th className="text-text-muted">Last Interaction</Table.Th>
                <Table.Th className="text-text-muted">Tags</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.contacts.map((contact) => (
                <Table.Tr
                  key={contact.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`${basePath}/contacts/${contact.id}`)}
                >
                  <Table.Td>
                    <Group gap="sm">
                      <Avatar size="sm" radius="xl">
                        {contact.firstName?.[0] ?? contact.lastName?.[0] ?? '?'}
                      </Avatar>
                      <Text size="sm" className="text-text-primary">
                        {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className="text-text-secondary">{contact.email ?? '-'}</Text>
                  </Table.Td>
                  <Table.Td>
                    {contact.organization ? (
                      <Group gap="xs">
                        <IconBuilding size={14} className="text-text-muted" />
                        <Text size="sm" className="text-text-secondary">{contact.organization.name}</Text>
                      </Group>
                    ) : (
                      <Text size="sm" className="text-text-muted">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className="text-text-muted">
                      {contact.lastInteractionAt
                        ? new Date(contact.lastInteractionAt).toLocaleDateString()
                        : 'Never'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {contact.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} size="xs" variant="light">
                          {tag}
                        </Badge>
                      ))}
                      {contact.tags.length > 2 && (
                        <Badge size="xs" variant="light" color="gray">
                          +{contact.tags.length - 2}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Menu position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconEye size={14} />}
                          component={Link}
                          href={`${basePath}/contacts/${contact.id}`}
                        >
                          View
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconEdit size={14} />}
                          component={Link}
                          href={`${basePath}/contacts/${contact.id}?edit=true`}
                        >
                          Edit
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => deleteContact.mutate({ id: contact.id })}
                        >
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-border-primary bg-surface-secondary py-12 text-center">
          <Text className="text-text-muted">
            {search ? 'No contacts found matching your search' : 'No contacts yet. Create your first contact!'}
          </Text>
        </div>
      )}

      {/* Create Contact Modal */}
      <Modal opened={createModalOpened} onClose={closeCreateModal} title="New Contact" size="md">
        <ContactForm
          workspaceId={workspaceId!}
          onSuccess={closeCreateModal}
          onCancel={closeCreateModal}
        />
      </Modal>
    </div>
  );
}

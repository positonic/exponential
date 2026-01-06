'use client';

import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  TextInput,
  Button,
  Table,
  Group,
  Avatar,
  Skeleton,
  ActionIcon,
  Menu,
  Modal,
  Stack,
  Select,
  Textarea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconSearch,
  IconPlus,
  IconDotsVertical,
  IconEye,
  IconEdit,
  IconTrash,
  IconUsers,
  IconWorld,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';

function OrganizationForm({
  workspaceId,
  onSuccess,
  onCancel,
}: {
  workspaceId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    websiteUrl: '',
    description: '',
    industry: '',
    size: '',
  });

  const utils = api.useUtils();

  const createOrganization = api.crmOrganization.create.useMutation({
    onSuccess: () => {
      void utils.crmOrganization.getAll.invalidate();
      void utils.crmOrganization.getStats.invalidate();
      notifications.show({
        title: 'Success',
        message: 'Organization created successfully',
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
    if (!formData.name.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Name is required',
        color: 'red',
      });
      return;
    }
    createOrganization.mutate({
      workspaceId,
      name: formData.name,
      websiteUrl: formData.websiteUrl || undefined,
      description: formData.description || undefined,
      industry: formData.industry || undefined,
      size: (formData.size as "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1000+") || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <TextInput
          label="Name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
        <TextInput
          label="Website URL"
          type="url"
          placeholder="https://example.com"
          value={formData.websiteUrl}
          onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
        />
        <Textarea
          label="Description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          minRows={2}
        />
        <TextInput
          label="Industry"
          placeholder="e.g., Technology, Healthcare, Finance"
          value={formData.industry}
          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
        />
        <Select
          label="Company Size"
          placeholder="Select size"
          data={[
            { value: '1-10', label: '1-10 employees' },
            { value: '11-50', label: '11-50 employees' },
            { value: '51-200', label: '51-200 employees' },
            { value: '201-500', label: '201-500 employees' },
            { value: '501-1000', label: '501-1000 employees' },
            { value: '1000+', label: '1000+ employees' },
          ]}
          value={formData.size}
          onChange={(value) => setFormData({ ...formData, size: value ?? '' })}
          clearable
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={createOrganization.isPending}>
            Create Organization
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export default function OrganizationsPage() {
  const router = useRouter();
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [search, setSearch] = useState('');
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);

  const { data, isLoading } = api.crmOrganization.getAll.useQuery(
    {
      workspaceId: workspaceId!,
      includeContacts: false,
      search: search || undefined,
    },
    { enabled: !!workspaceId }
  );

  const utils = api.useUtils();

  const deleteOrganization = api.crmOrganization.delete.useMutation({
    onSuccess: () => {
      void utils.crmOrganization.getAll.invalidate();
      void utils.crmOrganization.getStats.invalidate();
      notifications.show({
        title: 'Success',
        message: 'Organization deleted successfully',
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
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={200} mb="lg" />
        <Skeleton height={400} />
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  const basePath = `/w/${workspace.slug}/crm`;

  return (
    <Container size="xl" className="py-8">
      <Group justify="space-between" mb="lg">
        <Title order={1} className="text-text-primary">
          Organizations
        </Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
          Add Organization
        </Button>
      </Group>

      <TextInput
        placeholder="Search organizations..."
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        mb="md"
        className="max-w-md"
      />

      {isLoading ? (
        <Stack gap="sm">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={60} />
          ))}
        </Stack>
      ) : data?.organizations && data.organizations.length > 0 ? (
        <Table.ScrollContainer minWidth={800}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Website</Table.Th>
                <Table.Th>Industry</Table.Th>
                <Table.Th>Size</Table.Th>
                <Table.Th>Contacts</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.organizations.map((org) => (
                <Table.Tr
                  key={org.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`${basePath}/organizations/${org.id}`)}
                >
                  <Table.Td>
                    <Group gap="sm">
                      <Avatar size="sm" radius="md" src={org.logoUrl}>
                        {org.name[0]}
                      </Avatar>
                      <Text className="text-text-primary">{org.name}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {org.websiteUrl ? (
                      <Group gap="xs" onClick={(e) => e.stopPropagation()}>
                        <IconWorld size={14} className="text-text-muted" />
                        <a
                          href={org.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-secondary hover:text-brand-primary"
                        >
                          {new URL(org.websiteUrl).hostname}
                        </a>
                      </Group>
                    ) : (
                      <Text className="text-text-muted">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text className="text-text-secondary">{org.industry ?? '-'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text className="text-text-secondary">{org.size ?? '-'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <IconUsers size={14} className="text-text-muted" />
                      <Text className="text-text-secondary">{org._count.contacts}</Text>
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
                          href={`${basePath}/organizations/${org.id}`}
                        >
                          View
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconEdit size={14} />}
                          component={Link}
                          href={`${basePath}/organizations/${org.id}?edit=true`}
                        >
                          Edit
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => deleteOrganization.mutate({ id: org.id })}
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
        </Table.ScrollContainer>
      ) : (
        <Text className="text-text-muted text-center py-8">
          {search ? 'No organizations found matching your search' : 'No organizations yet. Create your first organization!'}
        </Text>
      )}

      {/* Create Organization Modal */}
      <Modal opened={createModalOpened} onClose={closeCreateModal} title="New Organization" size="md">
        <OrganizationForm
          workspaceId={workspaceId!}
          onSuccess={closeCreateModal}
          onCancel={closeCreateModal}
        />
      </Modal>
    </Container>
  );
}

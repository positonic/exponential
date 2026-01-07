'use client';

import { useState } from 'react';
import {
  Text,
  TextInput,
  Button,
  Avatar,
  Skeleton,
  Menu,
  Modal,
  Stack,
  Select,
  Checkbox,
  ActionIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconPlus,
  IconChevronDown,
  IconSettings,
  IconDownload,
  IconArrowsSort,
  IconFilter,
  IconDotsVertical,
  IconEye,
  IconEdit,
  IconTrash,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';

// Helper function to get relative time
function getRelativeTime(date: Date | null): string {
  if (!date) return 'No contact';
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `about ${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `about ${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  return `about ${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
}

// Connection strength component
function ConnectionStrength({ interactionCount }: { interactionCount: number }) {
  const strength = interactionCount > 5 ? 'Strong' : interactionCount > 0 ? 'Moderate' : 'Very weak';
  const colorClass =
    interactionCount > 5
      ? 'bg-blue-500'
      : interactionCount > 0
        ? 'bg-yellow-500'
        : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${colorClass}`} />
      <Text size="sm" className="text-text-primary">
        {strength}
      </Text>
    </div>
  );
}

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
        <div className="grid grid-cols-2 gap-3">
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
        </div>
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
          data={
            organizations?.organizations.map((org) => ({
              value: org.id,
              label: org.name,
            })) ?? []
          }
          value={formData.organizationId}
          onChange={(value) => setFormData({ ...formData, organizationId: value ?? '' })}
          clearable
          searchable
        />
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={createContact.isPending}>
            Create Contact
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] =
    useDisclosure(false);

  const { data, isLoading } = api.crmContact.getAll.useQuery(
    {
      workspaceId: workspaceId!,
      includeOrganization: true,
      includeInteractions: true,
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

  const toggleSelectAll = () => {
    if (!data?.contacts) return;
    if (selectedIds.size === data.contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.contacts.map((c) => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

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
  const contacts = data?.contacts ?? [];
  const allSelected = contacts.length > 0 && selectedIds.size === contacts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < contacts.length;

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border-primary bg-background-primary px-4 py-3">
        <div className="flex items-center gap-3">
          {/* View Selector */}
          <Menu position="bottom-start">
            <Menu.Target>
              <button className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-surface-hover transition-colors">
                <div className="h-3 w-3 rounded bg-orange-400" />
                <Text size="sm" className="font-medium text-text-primary">
                  Recently Contacted People
                </Text>
                <IconChevronDown size={16} className="text-text-muted" />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-orange-400" />
                  <span>Recently Contacted People</span>
                </div>
              </Menu.Item>
              <Menu.Item>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-blue-400" />
                  <span>All People</span>
                </div>
              </Menu.Item>
              <Menu.Item>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-green-400" />
                  <span>New Contacts</span>
                </div>
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>

          {/* View Settings */}
          <Menu position="bottom-start">
            <Menu.Target>
              <button className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-surface-hover transition-colors">
                <IconSettings size={16} className="text-text-muted" />
                <Text size="sm" className="text-text-muted">
                  View settings
                </Text>
                <IconChevronDown size={14} className="text-text-muted" />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item>Customize columns</Menu.Item>
              <Menu.Item>Density settings</Menu.Item>
              <Menu.Item>Save view</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>

        <div className="flex items-center gap-2">
          {/* Import / Export */}
          <Menu position="bottom-end">
            <Menu.Target>
              <button className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-surface-hover transition-colors">
                <IconDownload size={16} className="text-text-muted" />
                <Text size="sm" className="text-text-muted">
                  Import / Export
                </Text>
                <IconChevronDown size={14} className="text-text-muted" />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item>Import contacts</Menu.Item>
              <Menu.Item>Export to CSV</Menu.Item>
              <Menu.Item>Export to Excel</Menu.Item>
            </Menu.Dropdown>
          </Menu>

          {/* New Person Button */}
          <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
            New Person
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 border-b border-border-primary bg-background-primary px-4 py-2">
        <button className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors">
          <IconArrowsSort size={16} />
          <Text size="sm">Sorted by Last email interaction</Text>
        </button>
        <button className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors">
          <IconFilter size={16} />
          <Text size="sm">Filter</Text>
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton circle height={32} />
                <Skeleton height={20} width={150} />
                <Skeleton height={20} width={100} />
                <Skeleton height={20} width={120} />
              </div>
            ))}
          </div>
        ) : contacts.length > 0 ? (
          <table className="w-full">
            <thead className="border-b border-border-primary bg-background-primary sticky top-0">
              <tr>
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <Text size="sm" className="font-medium text-text-muted">
                      Person
                    </Text>
                    <ActionIcon variant="subtle" size="xs" color="gray">
                      <IconPlus size={12} />
                    </ActionIcon>
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full border-2 border-text-muted" />
                    <Text size="sm" className="font-medium text-text-muted">
                      Connection stren...
                    </Text>
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <Checkbox size="xs" disabled className="opacity-50" />
                    <Text size="sm" className="font-medium text-text-muted">
                      Last email interaction
                    </Text>
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <Checkbox size="xs" disabled className="opacity-50" />
                    <Text size="sm" className="font-medium text-text-muted">
                      Last calendar interaction
                    </Text>
                  </div>
                </th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors">
                    <IconPlus size={14} />
                    <Text size="sm">Add column</Text>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => {
                const fullName =
                  [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
                const interactionCount = contact.interactions?.length ?? 0;

                return (
                  <tr
                    key={contact.id}
                    className="border-b border-border-primary hover:bg-surface-hover cursor-pointer transition-colors"
                    onClick={() => router.push(`${basePath}/contacts/${contact.id}`)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onChange={() => toggleSelect(contact.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar size="sm" radius="xl">
                          {contact.firstName?.[0]?.toUpperCase() ??
                            contact.lastName?.[0]?.toUpperCase() ??
                            '?'}
                        </Avatar>
                        <Text size="sm" className="font-medium text-text-primary">
                          {fullName}
                        </Text>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ConnectionStrength interactionCount={interactionCount} />
                    </td>
                    <td className="px-4 py-3">
                      <Text size="sm" className="text-text-muted">
                        {getRelativeTime(contact.lastInteractionAt)}
                      </Text>
                    </td>
                    <td className="px-4 py-3">
                      <Text size="sm" className="text-text-muted">
                        No contact
                      </Text>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" size="sm">
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Text className="text-text-muted mb-4">No contacts yet. Create your first contact!</Text>
              <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
                New Person
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Contact Modal */}
      <Modal opened={createModalOpened} onClose={closeCreateModal} title="New Person" size="md">
        <ContactForm
          workspaceId={workspaceId!}
          onSuccess={closeCreateModal}
          onCancel={closeCreateModal}
        />
      </Modal>
    </div>
  );
}

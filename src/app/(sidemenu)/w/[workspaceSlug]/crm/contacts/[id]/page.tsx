'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Container,
  Title,
  Text,
  Paper,
  Group,
  Stack,
  Avatar,
  Badge,
  Button,
  Tabs,
  TextInput,
  Textarea,
  Select,
  Skeleton,
  ActionIcon,
  Timeline,
  Modal,
  Divider,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowLeft,
  IconEdit,
  IconMail,
  IconPhone,
  IconBrandLinkedin,
  IconBrandTelegram,
  IconBrandTwitter,
  IconBrandGithub,
  IconBuilding,
  IconPlus,
  IconMessage,
  IconPhoneCall,
  IconCalendar,
  IconNote,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';
import { notifications } from '@mantine/notifications';

const interactionIcons: Record<string, React.ReactNode> = {
  EMAIL: <IconMail size={14} />,
  TELEGRAM: <IconBrandTelegram size={14} />,
  PHONE_CALL: <IconPhoneCall size={14} />,
  MEETING: <IconCalendar size={14} />,
  NOTE: <IconNote size={14} />,
  LINKEDIN: <IconBrandLinkedin size={14} />,
  OTHER: <IconMessage size={14} />,
};

function AddInteractionForm({
  contactId,
  onSuccess,
  onCancel,
}: {
  contactId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    type: 'NOTE' as const,
    direction: 'OUTBOUND' as const,
    subject: '',
    notes: '',
  });

  const utils = api.useUtils();

  const addInteraction = api.crmContact.addInteraction.useMutation({
    onSuccess: () => {
      void utils.crmContact.getById.invalidate({ id: contactId });
      void utils.crmContact.getInteractions.invalidate({ contactId });
      notifications.show({
        title: 'Success',
        message: 'Interaction added successfully',
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
    addInteraction.mutate({
      contactId,
      type: formData.type,
      direction: formData.direction,
      subject: formData.subject || undefined,
      notes: formData.notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Group grow>
          <Select
            label="Type"
            data={[
              { value: 'EMAIL', label: 'Email' },
              { value: 'PHONE_CALL', label: 'Phone Call' },
              { value: 'MEETING', label: 'Meeting' },
              { value: 'NOTE', label: 'Note' },
              { value: 'TELEGRAM', label: 'Telegram' },
              { value: 'LINKEDIN', label: 'LinkedIn' },
              { value: 'OTHER', label: 'Other' },
            ]}
            value={formData.type}
            onChange={(value) => setFormData({ ...formData, type: value as typeof formData.type })}
            required
          />
          <Select
            label="Direction"
            data={[
              { value: 'OUTBOUND', label: 'Outbound' },
              { value: 'INBOUND', label: 'Inbound' },
            ]}
            value={formData.direction}
            onChange={(value) => setFormData({ ...formData, direction: value as typeof formData.direction })}
            required
          />
        </Group>
        <TextInput
          label="Subject"
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
        />
        <Textarea
          label="Notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          minRows={3}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={addInteraction.isPending}>
            Add Interaction
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const [interactionModalOpened, { open: openInteractionModal, close: closeInteractionModal }] = useDisclosure(false);

  const { data: contact, isLoading } = api.crmContact.getById.useQuery(
    { id: contactId, includeInteractions: true },
    { enabled: !!contactId }
  );

  if (workspaceLoading || isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={200} mb="lg" />
        <Skeleton height={300} />
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

  if (!contact) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Contact not found</Text>
      </Container>
    );
  }

  const basePath = `/w/${workspace.slug}/crm`;
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown Contact';

  return (
    <Container size="xl" className="py-8">
      {/* Header */}
      <Group mb="lg">
        <ActionIcon
          variant="subtle"
          onClick={() => router.push(`${basePath}/contacts`)}
        >
          <IconArrowLeft size={20} />
        </ActionIcon>
        <Title order={1} className="text-text-primary">
          Contact Details
        </Title>
      </Group>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2">
          <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary mb-6">
            <Group justify="space-between" mb="md">
              <Group>
                <Avatar size="xl" radius="xl">
                  {contact.firstName?.[0] ?? contact.lastName?.[0] ?? '?'}
                </Avatar>
                <Stack gap={0}>
                  <Title order={2} className="text-text-primary">
                    {fullName}
                  </Title>
                  {contact.organization && (
                    <Group gap="xs">
                      <IconBuilding size={14} className="text-text-muted" />
                      <Link
                        href={`${basePath}/organizations/${contact.organization.id}`}
                        className="text-text-secondary hover:text-brand-primary transition-colors"
                      >
                        {contact.organization.name}
                      </Link>
                    </Group>
                  )}
                </Stack>
              </Group>
              <Button leftSection={<IconEdit size={16} />} variant="light">
                Edit
              </Button>
            </Group>

            {/* Contact Info */}
            <Stack gap="sm">
              {contact.email && (
                <Group gap="sm">
                  <IconMail size={16} className="text-text-muted" />
                  <a href={`mailto:${contact.email}`} className="text-text-primary hover:text-brand-primary">
                    {contact.email}
                  </a>
                </Group>
              )}
              {contact.phone && (
                <Group gap="sm">
                  <IconPhone size={16} className="text-text-muted" />
                  <a href={`tel:${contact.phone}`} className="text-text-primary hover:text-brand-primary">
                    {contact.phone}
                  </a>
                </Group>
              )}
              {contact.linkedIn && (
                <Group gap="sm">
                  <IconBrandLinkedin size={16} className="text-text-muted" />
                  <a href={contact.linkedIn} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-brand-primary">
                    LinkedIn Profile
                  </a>
                </Group>
              )}
              {contact.telegram && (
                <Group gap="sm">
                  <IconBrandTelegram size={16} className="text-text-muted" />
                  <Text className="text-text-primary">{contact.telegram}</Text>
                </Group>
              )}
              {contact.twitter && (
                <Group gap="sm">
                  <IconBrandTwitter size={16} className="text-text-muted" />
                  <Text className="text-text-primary">{contact.twitter}</Text>
                </Group>
              )}
              {contact.github && (
                <Group gap="sm">
                  <IconBrandGithub size={16} className="text-text-muted" />
                  <a href={`https://github.com/${contact.github}`} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-brand-primary">
                    {contact.github}
                  </a>
                </Group>
              )}
            </Stack>

            {/* Tags */}
            {contact.tags.length > 0 && (
              <>
                <Divider my="md" />
                <Group gap="xs">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} variant="light">
                      {tag}
                    </Badge>
                  ))}
                </Group>
              </>
            )}

            {/* About */}
            {contact.about && (
              <>
                <Divider my="md" />
                <Text className="text-text-secondary whitespace-pre-wrap">{contact.about}</Text>
              </>
            )}
          </Paper>

          {/* Activity Timeline */}
          <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
            <Group justify="space-between" mb="md">
              <Title order={3} className="text-text-primary">
                Activity
              </Title>
              <Button leftSection={<IconPlus size={16} />} size="xs" onClick={openInteractionModal}>
                Add Interaction
              </Button>
            </Group>

            {contact.interactions && contact.interactions.length > 0 ? (
              <Timeline active={-1} bulletSize={24} lineWidth={2}>
                {contact.interactions.map((interaction) => (
                  <Timeline.Item
                    key={interaction.id}
                    bullet={interactionIcons[interaction.type] ?? <IconMessage size={14} />}
                    title={
                      <Group gap="xs">
                        <Text fw={500} className="text-text-primary">
                          {interaction.type.replace('_', ' ')}
                        </Text>
                        <Badge size="xs" variant="light" color={interaction.direction === 'INBOUND' ? 'green' : 'blue'}>
                          {interaction.direction}
                        </Badge>
                      </Group>
                    }
                  >
                    {interaction.subject && (
                      <Text size="sm" className="text-text-primary" mt={4}>
                        {interaction.subject}
                      </Text>
                    )}
                    {interaction.notes && (
                      <Text size="sm" className="text-text-secondary" mt={4}>
                        {interaction.notes}
                      </Text>
                    )}
                    <Text size="xs" className="text-text-muted" mt={4}>
                      {new Date(interaction.createdAt).toLocaleString()}
                      {(interaction as { user?: { name?: string | null; email?: string | null } }).user && (
                        <> by {(interaction as { user?: { name?: string | null; email?: string | null } }).user?.name ?? (interaction as { user?: { name?: string | null; email?: string | null } }).user?.email}</>
                      )}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Text className="text-text-muted text-center py-4">No interactions recorded yet</Text>
            )}
          </Paper>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
            <Title order={4} className="text-text-primary mb-4">
              Quick Info
            </Title>
            <Stack gap="sm">
              <div>
                <Text size="xs" className="text-text-muted">
                  Created
                </Text>
                <Text className="text-text-primary">
                  {new Date(contact.createdAt).toLocaleDateString()}
                </Text>
              </div>
              <div>
                <Text size="xs" className="text-text-muted">
                  Last Interaction
                </Text>
                <Text className="text-text-primary">
                  {contact.lastInteractionAt
                    ? new Date(contact.lastInteractionAt).toLocaleDateString()
                    : 'Never'}
                </Text>
              </div>
              {contact.lastInteractionType && (
                <div>
                  <Text size="xs" className="text-text-muted">
                    Last Interaction Type
                  </Text>
                  <Text className="text-text-primary">
                    {contact.lastInteractionType.replace('_', ' ')}
                  </Text>
                </div>
              )}
              <div>
                <Text size="xs" className="text-text-muted">
                  Created By
                </Text>
                <Text className="text-text-primary">
                  {contact.createdBy.name ?? contact.createdBy.email}
                </Text>
              </div>
            </Stack>
          </Paper>
        </div>
      </div>

      {/* Add Interaction Modal */}
      <Modal opened={interactionModalOpened} onClose={closeInteractionModal} title="Add Interaction" size="md">
        <AddInteractionForm
          contactId={contactId}
          onSuccess={closeInteractionModal}
          onCancel={closeInteractionModal}
        />
      </Modal>
    </Container>
  );
}

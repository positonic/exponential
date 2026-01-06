'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Title,
  Text,
  Stack,
  Avatar,
  Badge,
  Button,
  TextInput,
  Textarea,
  Select,
  Skeleton,
  ActionIcon,
  Modal,
  Tabs,
  Tooltip,
  Collapse,
  Anchor,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconMail,
  IconPhone,
  IconBrandLinkedin,
  IconBrandTelegram,
  IconBrandTwitter,
  IconBrandGithub,
  IconBuilding,
  IconPlus,
  IconPhoneCall,
  IconCalendar,
  IconNote,
  IconStar,
  IconStarFilled,
  IconBolt,
  IconMapPin,
  IconBriefcase,
  IconUser,
  IconMessageCircle,
  IconChevronDown,
  IconChevronUp,
  IconChecklist,
  IconFile,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';
import { notifications } from '@mantine/notifications';

// Helper function to get relative time
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 60) return '1 month ago';
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return new Date(date).toLocaleDateString();
}

// Highlight card component
function HighlightCard({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-lg border border-border-primary bg-surface-secondary p-4 ${
        onClick ? 'cursor-pointer hover:border-border-focus transition-colors' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <Text size="xs" className="text-text-muted">
          {label}
        </Text>
        <span className="text-text-muted">{icon}</span>
      </div>
      <div className="mt-2">{value}</div>
    </div>
  );
}

// Activity item component
function ActivityItem({
  actor,
  action,
  date,
  subject,
}: {
  actor: string;
  action: string;
  date: Date;
  subject?: string;
}) {
  const initial = actor[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex items-start gap-3 py-3">
      <Avatar size="sm" radius="xl" className="mt-0.5">
        {initial}
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <Text span size="sm" className="font-medium text-text-primary">
              {actor}
            </Text>{' '}
            <Text span size="sm" className="text-text-muted">
              {action}
            </Text>
          </div>
          <Text size="xs" className="text-text-muted">
            {getRelativeTime(date)}
          </Text>
        </div>
        {subject && (
          <Text size="sm" className="text-text-secondary mt-1 line-clamp-1">
            {subject}
          </Text>
        )}
      </div>
    </div>
  );
}

// Collapsible section component
function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-primary last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-3 px-1 text-left hover:bg-surface-hover transition-colors"
      >
        <Text size="xs" className="font-medium text-text-muted">
          {isOpen ? '▾' : '▸'} {title}
        </Text>
        {isOpen ? (
          <IconChevronUp size={14} className="text-text-muted" />
        ) : (
          <IconChevronDown size={14} className="text-text-muted" />
        )}
      </button>
      <Collapse in={isOpen}>
        <div className="pb-4 px-1">{children}</div>
      </Collapse>
    </div>
  );
}

// Detail row component
function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-1">
      <div className="w-28 shrink-0 flex items-start gap-1.5">
        <span className="text-text-muted opacity-50">{icon}</span>
        <Text size="xs" className="text-text-muted">
          {label}
        </Text>
      </div>
      <div className="flex-1 text-sm">{value}</div>
    </div>
  );
}

// Add interaction form
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
        <div className="grid grid-cols-2 gap-3">
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
            onChange={(value) =>
              setFormData({ ...formData, direction: value as typeof formData.direction })
            }
            required
          />
        </div>
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
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={addInteraction.isPending}>
            Add Interaction
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [activeTab, setActiveTab] = useState<string | null>('overview');
  const [sidebarTab, setSidebarTab] = useState<string | null>('details');
  const [isStarred, setIsStarred] = useState(false);
  const [interactionModalOpened, { open: openInteractionModal, close: closeInteractionModal }] =
    useDisclosure(false);

  // Get current contact
  const { data: contact, isLoading } = api.crmContact.getById.useQuery(
    { id: contactId, includeInteractions: true },
    { enabled: !!contactId }
  );

  // Get all contacts for prev/next navigation
  const { data: allContacts } = api.crmContact.getAll.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  // Calculate navigation info
  const navigationInfo = useMemo(() => {
    if (!allContacts?.contacts || !contactId) {
      return { currentIndex: -1, total: 0, prevId: null, nextId: null };
    }
    const contacts = allContacts.contacts;
    const currentIndex = contacts.findIndex((c) => c.id === contactId);
    return {
      currentIndex,
      total: contacts.length,
      prevId: currentIndex > 0 ? contacts[currentIndex - 1]?.id : null,
      nextId: currentIndex < contacts.length - 1 ? contacts[currentIndex + 1]?.id : null,
    };
  }, [allContacts, contactId]);

  // Build activity items
  const activityItems = useMemo(() => {
    if (!contact) return [];
    const items: Array<{
      id: string;
      actor: string;
      action: string;
      date: Date;
      subject?: string;
    }> = [];

    const fullName =
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';

    // Add interactions as activity
    contact.interactions?.forEach((interaction) => {
      items.push({
        id: interaction.id,
        actor: fullName,
        action:
          interaction.type === 'EMAIL'
            ? 'sent an email'
            : interaction.type === 'TELEGRAM'
              ? 'sent a message'
              : interaction.type === 'PHONE_CALL'
                ? 'had a call'
                : interaction.type === 'MEETING'
                  ? 'had a meeting'
                  : 'added a note',
        date: new Date(interaction.createdAt),
        subject: interaction.subject ?? interaction.notes ?? undefined,
      });
    });

    // Add creation as activity
    items.push({
      id: 'created',
      actor: fullName,
      action: 'was created by System',
      date: new Date(contact.createdAt),
    });

    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [contact]);

  if (workspaceLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton height={40} width={200} />
        <Skeleton height={500} />
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

  if (!contact) {
    return (
      <div className="space-y-6">
        <Text className="text-text-secondary">Contact not found</Text>
      </div>
    );
  }

  const basePath = `/w/${workspace.slug}/crm`;
  const fullName =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown Contact';
  const interactionCount = contact.interactions?.length ?? 0;

  // Calculate connection strength
  const connectionStrength =
    interactionCount > 5 ? 'Strong' : interactionCount > 0 ? 'Moderate' : 'Very weak';
  const connectionColor =
    interactionCount > 5 ? 'bg-green-500' : interactionCount > 0 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between border-b border-border-primary bg-surface-secondary px-4 py-2">
        <div className="flex items-center gap-2">
          <Tooltip label="Back to Contacts">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => router.push(`${basePath}/contacts`)}
            >
              <IconArrowLeft size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Previous Contact">
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!navigationInfo.prevId}
              onClick={() =>
                navigationInfo.prevId &&
                router.push(`${basePath}/contacts/${navigationInfo.prevId}`)
              }
            >
              <IconChevronLeft size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Next Contact">
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!navigationInfo.nextId}
              onClick={() =>
                navigationInfo.nextId &&
                router.push(`${basePath}/contacts/${navigationInfo.nextId}`)
              }
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Tooltip>

          {navigationInfo.total > 0 && (
            <Text size="xs" className="text-text-muted ml-2">
              {navigationInfo.currentIndex + 1} of {navigationInfo.total} in All People
            </Text>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button size="xs" variant="light" leftSection={<IconMail size={14} />}>
            Compose email
          </Button>
        </div>
      </div>

      {/* Contact Header */}
      <div className="flex items-center gap-4 border-b border-border-primary bg-background-primary px-6 py-4">
        <Avatar size="lg" radius="xl">
          {contact.firstName?.[0]?.toUpperCase() ?? contact.lastName?.[0]?.toUpperCase() ?? '?'}
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Title order={3} className="text-text-primary">
              {fullName}
            </Title>
            <ActionIcon
              variant="subtle"
              color={isStarred ? 'yellow' : 'gray'}
              onClick={() => setIsStarred(!isStarred)}
            >
              {isStarred ? <IconStarFilled size={18} /> : <IconStar size={18} />}
            </ActionIcon>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border-primary bg-background-primary px-6">
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="activity">Activity</Tabs.Tab>
            <Tabs.Tab
              value="emails"
              rightSection={
                <Badge size="xs" variant="light">
                  {contact.interactions?.filter((i) => i.type === 'EMAIL').length ?? 0}
                </Badge>
              }
            >
              Emails
            </Tabs.Tab>
            <Tabs.Tab
              value="telegram"
              rightSection={
                <Badge size="xs" variant="light">
                  {contact.interactions?.filter((i) => i.type === 'TELEGRAM').length ?? 0}
                </Badge>
              }
            >
              Telegram
            </Tabs.Tab>
            <Tabs.Tab
              value="calls"
              rightSection={
                <Badge size="xs" variant="light">
                  {contact.interactions?.filter((i) => i.type === 'PHONE_CALL').length ?? 0}
                </Badge>
              }
            >
              Calls
            </Tabs.Tab>
            <Tabs.Tab
              value="company"
              rightSection={
                <Badge size="xs" variant="light">
                  {contact.organization ? 1 : 0}
                </Badge>
              }
            >
              Company
            </Tabs.Tab>
            <Tabs.Tab
              value="notes"
              rightSection={
                <Badge size="xs" variant="light">
                  {contact.interactions?.filter((i) => i.type === 'NOTE').length ?? 0}
                </Badge>
              }
            >
              Notes
            </Tabs.Tab>
            <Tabs.Tab value="tasks" rightSection={<Badge size="xs" variant="light">0</Badge>}>
              Tasks
            </Tabs.Tab>
            <Tabs.Tab value="files">Files</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Highlights Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <IconBolt size={16} className="text-text-muted" />
                  <Text size="sm" className="font-medium text-text-muted">
                    Highlights
                  </Text>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <HighlightCard
                    icon={<IconStar size={14} />}
                    label="Connection strength"
                    value={
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${connectionColor}`} />
                        <Text size="sm" className="font-medium text-text-primary">
                          {connectionStrength}
                        </Text>
                      </div>
                    }
                  />

                  <HighlightCard
                    icon={<IconCalendar size={14} />}
                    label="Next calendar interaction"
                    value={
                      <Text size="sm" className="text-text-muted">
                        No interaction
                      </Text>
                    }
                  />

                  <HighlightCard
                    icon={<IconBuilding size={14} />}
                    label="Company"
                    value={
                      contact.organization ? (
                        <div className="flex items-center gap-2">
                          <Text size="sm" className="font-medium text-text-primary">
                            {contact.organization.name}
                          </Text>
                          <Avatar size="xs" radius="sm" color="cyan">
                            {contact.organization.name[0]}
                          </Avatar>
                        </div>
                      ) : (
                        <Text size="sm" className="text-text-muted">
                          No company
                        </Text>
                      )
                    }
                    onClick={
                      contact.organization
                        ? () =>
                            router.push(`${basePath}/organizations/${contact.organization?.id}`)
                        : undefined
                    }
                  />

                  <HighlightCard
                    icon={<IconMail size={14} />}
                    label="Email addresses"
                    value={
                      contact.email ? (
                        <Anchor href={`mailto:${contact.email}`} size="sm">
                          {contact.email}
                        </Anchor>
                      ) : (
                        <Text size="sm" className="text-text-muted">
                          No email
                        </Text>
                      )
                    }
                  />

                  <HighlightCard
                    icon={<IconPhone size={14} />}
                    label="Phone numbers"
                    value={
                      contact.phone ? (
                        <Anchor href={`tel:${contact.phone}`} size="sm">
                          {contact.phone}
                        </Anchor>
                      ) : (
                        <Text size="sm" className="text-text-muted">
                          No phone numbers
                        </Text>
                      )
                    }
                  />

                  <HighlightCard
                    icon={<IconMapPin size={14} />}
                    label="Primary location"
                    value={
                      <Text size="sm" className="text-text-muted">
                        No Primary location
                      </Text>
                    }
                  />
                </div>
              </div>

              {/* Activity Section */}
              <div className="rounded-lg border border-border-primary bg-surface-secondary">
                <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
                  <div className="flex items-center gap-2">
                    <IconBolt size={16} className="text-text-muted" />
                    <Text size="sm" className="font-medium text-text-primary">
                      Activity
                    </Text>
                  </div>
                  <Button variant="subtle" size="xs" onClick={() => setActiveTab('activity')}>
                    View all &gt;
                  </Button>
                </div>
                <div className="px-4 divide-y divide-border-primary">
                  {activityItems.length > 0 ? (
                    activityItems.slice(0, 3).map((item) => (
                      <ActivityItem
                        key={item.id}
                        actor={item.actor}
                        action={item.action}
                        date={item.date}
                        subject={item.subject}
                      />
                    ))
                  ) : (
                    <div className="py-8 text-center">
                      <Text size="sm" className="text-text-muted">
                        No activity yet
                      </Text>
                    </div>
                  )}
                </div>
              </div>

              {/* Emails Section */}
              <div className="rounded-lg border border-border-primary bg-surface-secondary">
                <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
                  <div className="flex items-center gap-2">
                    <IconMail size={16} className="text-text-muted" />
                    <Text size="sm" className="font-medium text-text-primary">
                      Emails
                    </Text>
                    <Badge size="xs" variant="light">
                      {contact.interactions?.filter((i) => i.type === 'EMAIL').length ?? 0}
                    </Badge>
                    <Button variant="subtle" size="xs" onClick={() => setActiveTab('emails')}>
                      &gt;
                    </Button>
                  </div>
                  <ActionIcon variant="subtle" size="sm" onClick={openInteractionModal}>
                    <IconPlus size={14} />
                  </ActionIcon>
                </div>
                <div className="px-4 divide-y divide-border-primary">
                  {contact.interactions?.filter((i) => i.type === 'EMAIL').length ? (
                    contact.interactions
                      .filter((i) => i.type === 'EMAIL')
                      .slice(0, 3)
                      .map((email) => (
                        <div key={email.id} className="py-3 flex items-start gap-3">
                          <Avatar size="sm" radius="xl">
                            {contact.firstName?.[0]?.toUpperCase() ?? '?'}
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Text size="sm" className="font-medium text-text-primary">
                                  {fullName}
                                </Text>
                                <Text
                                  size="sm"
                                  className="font-medium text-text-primary truncate"
                                >
                                  {email.subject ?? 'No subject'}
                                </Text>
                              </div>
                              <Text size="xs" className="text-text-muted shrink-0">
                                {getRelativeTime(new Date(email.createdAt))}
                              </Text>
                            </div>
                            {email.notes && (
                              <Text size="sm" className="text-text-muted line-clamp-1 mt-0.5">
                                {email.notes}
                              </Text>
                            )}
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="py-8 text-center">
                      <Text size="sm" className="text-text-muted">
                        No emails yet
                      </Text>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Title order={4} className="text-text-primary">
                  Activity
                </Title>
                <Button size="xs" variant="light" onClick={openInteractionModal}>
                  Add interaction
                </Button>
              </div>
              <div className="rounded-lg border border-border-primary bg-surface-secondary">
                <div className="px-4 divide-y divide-border-primary">
                  {activityItems.length > 0 ? (
                    activityItems.map((item) => (
                      <ActivityItem
                        key={item.id}
                        actor={item.actor}
                        action={item.action}
                        date={item.date}
                        subject={item.subject}
                      />
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <IconBolt size={40} className="text-text-muted mx-auto mb-3" />
                      <Text size="sm" className="text-text-muted">
                        No activity yet
                      </Text>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'emails' && (
            <div className="space-y-4">
              <Title order={4} className="text-text-primary">
                Emails
              </Title>
              {contact.interactions?.filter((i) => i.type === 'EMAIL').length ? (
                <div className="rounded-lg border border-border-primary bg-surface-secondary divide-y divide-border-primary">
                  {contact.interactions
                    .filter((i) => i.type === 'EMAIL')
                    .map((email) => (
                      <div key={email.id} className="p-4 flex items-start gap-3">
                        <Avatar size="md" radius="xl">
                          {contact.firstName?.[0]?.toUpperCase() ?? '?'}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-1">
                            <Text size="sm" className="font-semibold text-text-primary">
                              {email.subject ?? 'No subject'}
                            </Text>
                            <Text size="xs" className="text-text-muted shrink-0">
                              {new Date(email.createdAt).toLocaleDateString('en-US', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </Text>
                          </div>
                          <Text size="sm" className="text-text-muted">
                            {fullName}
                          </Text>
                          {email.notes && (
                            <Text size="sm" className="text-text-muted mt-1 line-clamp-2">
                              {email.notes}
                            </Text>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                  <IconMail size={40} className="text-text-muted mx-auto mb-3" />
                  <Text size="sm" className="text-text-muted">
                    No emails yet
                  </Text>
                </div>
              )}
            </div>
          )}

          {activeTab === 'telegram' && (
            <div className="space-y-4">
              <Title order={4} className="text-text-primary">
                Telegram Messages
              </Title>
              {contact.interactions?.filter((i) => i.type === 'TELEGRAM').length ? (
                <div className="rounded-lg border border-border-primary bg-surface-secondary divide-y divide-border-primary">
                  {contact.interactions
                    .filter((i) => i.type === 'TELEGRAM')
                    .map((msg) => (
                      <div key={msg.id} className="p-4 flex items-start gap-3">
                        <Avatar size="md" radius="xl">
                          {contact.firstName?.[0]?.toUpperCase() ?? '?'}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-1">
                            <Text size="sm" className="font-semibold text-text-primary">
                              {fullName}
                            </Text>
                            <Text size="xs" className="text-text-muted shrink-0">
                              {new Date(msg.createdAt).toLocaleDateString('en-US', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </Text>
                          </div>
                          {msg.notes && (
                            <Text size="sm" className="text-text-muted line-clamp-2">
                              {msg.notes}
                            </Text>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                  <IconBrandTelegram size={40} className="text-text-muted mx-auto mb-3" />
                  <Text size="sm" className="text-text-muted">
                    No Telegram messages yet
                  </Text>
                </div>
              )}
            </div>
          )}

          {activeTab === 'calls' && (
            <div className="space-y-4">
              <Title order={4} className="text-text-primary">
                Calls
              </Title>
              <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                <IconPhoneCall size={40} className="text-text-muted mx-auto mb-3" />
                <Text size="sm" className="text-text-muted">
                  No calls yet
                </Text>
              </div>
            </div>
          )}

          {activeTab === 'company' && (
            <div className="space-y-4">
              <Title order={4} className="text-text-primary">
                Company
              </Title>
              {contact.organization ? (
                <Link
                  href={`${basePath}/organizations/${contact.organization.id}`}
                  className="flex items-center gap-4 rounded-lg border border-border-primary bg-surface-secondary p-4 hover:border-border-focus transition-colors"
                >
                  <Avatar size="lg" radius="md" color="cyan">
                    <IconBuilding size={24} />
                  </Avatar>
                  <div>
                    <Text className="font-medium text-text-primary text-lg">
                      {contact.organization.name}
                    </Text>
                    {contact.organization.websiteUrl && (
                      <Text size="sm" className="text-text-muted">
                        {new URL(contact.organization.websiteUrl).hostname.replace('www.', '')}
                      </Text>
                    )}
                  </div>
                </Link>
              ) : (
                <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                  <IconBuilding size={40} className="text-text-muted mx-auto mb-3" />
                  <Text size="sm" className="text-text-muted">
                    No company associated
                  </Text>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Title order={4} className="text-text-primary">
                  Notes
                </Title>
                <Button size="xs" variant="light" onClick={openInteractionModal}>
                  Add Note
                </Button>
              </div>
              {contact.interactions?.filter((i) => i.type === 'NOTE').length ? (
                <div className="rounded-lg border border-border-primary bg-surface-secondary divide-y divide-border-primary">
                  {contact.interactions
                    .filter((i) => i.type === 'NOTE')
                    .map((note) => (
                      <div key={note.id} className="p-4">
                        {note.subject && (
                          <Text size="sm" className="font-medium text-text-primary mb-1">
                            {note.subject}
                          </Text>
                        )}
                        {note.notes && (
                          <Text size="sm" className="text-text-secondary">
                            {note.notes}
                          </Text>
                        )}
                        <Text size="xs" className="text-text-muted mt-2">
                          {new Date(note.createdAt).toLocaleString()}
                        </Text>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                  <IconNote size={40} className="text-text-muted mx-auto mb-3" />
                  <Text size="sm" className="text-text-muted">
                    No notes yet
                  </Text>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <Title order={4} className="text-text-primary">
                Tasks
              </Title>
              <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                <IconChecklist size={40} className="text-text-muted mx-auto mb-3" />
                <Text size="sm" className="text-text-muted">
                  No tasks yet
                </Text>
                <Button variant="light" size="sm" mt="md">
                  Add Task
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-4">
              <Title order={4} className="text-text-primary">
                Files
              </Title>
              <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                <IconFile size={40} className="text-text-muted mx-auto mb-3" />
                <Text size="sm" className="text-text-muted">
                  No files attached
                </Text>
                <Button variant="light" size="sm" mt="md">
                  Upload File
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-80 shrink-0 border-l border-border-primary bg-background-primary overflow-y-auto">
          {/* Sidebar Tabs */}
          <div className="border-b border-border-primary">
            <Tabs value={sidebarTab} onChange={setSidebarTab}>
              <Tabs.List grow>
                <Tabs.Tab value="details" className="text-xs">
                  Details
                </Tabs.Tab>
                <Tabs.Tab
                  value="comments"
                  className="text-xs"
                  rightSection={
                    <Badge size="xs" variant="light">
                      0
                    </Badge>
                  }
                >
                  Comments
                </Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </div>

          {sidebarTab === 'details' && (
            <div className="p-4">
              {/* Record Details */}
              <CollapsibleSection title="Record Details">
                <Stack gap="sm">
                  <DetailRow
                    icon={<IconUser size={14} />}
                    label="Name"
                    value={<Text className="text-text-primary">{fullName}</Text>}
                  />

                  <DetailRow
                    icon={<IconMail size={14} />}
                    label="Email addresses"
                    value={
                      contact.email ? (
                        <Anchor href={`mailto:${contact.email}`} size="sm">
                          {contact.email}
                        </Anchor>
                      ) : (
                        <Text className="text-text-muted">—</Text>
                      )
                    }
                  />

                  <DetailRow
                    icon={<IconNote size={14} />}
                    label="Description"
                    value={
                      <Text className="text-text-muted">
                        {contact.about ?? 'Set Description...'}
                      </Text>
                    }
                  />

                  <DetailRow
                    icon={<IconBuilding size={14} />}
                    label="Company"
                    value={
                      contact.organization ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar size="xs" color="cyan" radius="sm">
                            {contact.organization.name[0]}
                          </Avatar>
                          <Anchor
                            component={Link}
                            href={`${basePath}/organizations/${contact.organization.id}`}
                            size="sm"
                          >
                            {contact.organization.name}
                          </Anchor>
                        </div>
                      ) : (
                        <Text className="text-text-muted">—</Text>
                      )
                    }
                  />

                  <DetailRow
                    icon={<IconBriefcase size={14} />}
                    label="Job title"
                    value={<Text className="text-text-muted">Set Job title...</Text>}
                  />

                  {contact.telegram && (
                    <DetailRow
                      icon={<IconBrandTelegram size={14} />}
                      label="Telegram"
                      value={
                        <Anchor
                          href={`https://t.me/${contact.telegram.replace('@', '')}`}
                          target="_blank"
                          size="sm"
                        >
                          @{contact.telegram.replace('@', '')}
                        </Anchor>
                      }
                    />
                  )}

                  {contact.linkedIn && (
                    <DetailRow
                      icon={<IconBrandLinkedin size={14} />}
                      label="LinkedIn"
                      value={
                        <Anchor href={contact.linkedIn} target="_blank" size="sm">
                          Profile
                        </Anchor>
                      }
                    />
                  )}

                  {contact.twitter && (
                    <DetailRow
                      icon={<IconBrandTwitter size={14} />}
                      label="Twitter"
                      value={<Text className="text-text-primary">@{contact.twitter}</Text>}
                    />
                  )}

                  {contact.github && (
                    <DetailRow
                      icon={<IconBrandGithub size={14} />}
                      label="GitHub"
                      value={
                        <Anchor
                          href={`https://github.com/${contact.github}`}
                          target="_blank"
                          size="sm"
                        >
                          {contact.github}
                        </Anchor>
                      }
                    />
                  )}

                  <Anchor size="xs" className="text-text-muted">
                    Show all values &gt;
                  </Anchor>
                </Stack>
              </CollapsibleSection>

              {/* Lists Section */}
              <CollapsibleSection title="Lists" defaultOpen={false}>
                <div className="flex items-center justify-between">
                  <Text size="sm" className="text-text-muted">
                    This record has not been added to any lists
                  </Text>
                </div>
              </CollapsibleSection>
            </div>
          )}

          {sidebarTab === 'comments' && (
            <div className="p-4">
              <div className="py-8 text-center">
                <IconMessageCircle size={32} className="text-text-muted mx-auto mb-2" />
                <Text size="sm" className="text-text-muted">
                  No comments yet
                </Text>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Interaction Modal */}
      <Modal
        opened={interactionModalOpened}
        onClose={closeInteractionModal}
        title="Add Interaction"
        size="md"
      >
        <AddInteractionForm
          contactId={contactId}
          onSuccess={closeInteractionModal}
          onCancel={closeInteractionModal}
        />
      </Modal>
    </div>
  );
}

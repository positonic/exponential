'use client';

import { useState, useMemo, useEffect } from 'react';
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
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconStar,
  IconStarFilled,
  IconMail,
  IconBolt,
  IconCalendar,
  IconUsers,
  IconMessageCircle,
  IconBuilding,
  IconWorld,
  IconChevronDown,
  IconChevronUp,
  IconNote,
  IconChecklist,
  IconFile,
  IconPencil,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';
import { notifications } from '@mantine/notifications';

function getInitialFromName(name?: string | null) {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.length === 0) return '?';
  return trimmed[0]!.toUpperCase();
}

function getHostnameFromUrl(url?: string | null) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// Stat card for the highlights section
function HighlightCard({
  icon,
  label,
  value,
  subValue,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subValue?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-lg border border-border-primary bg-surface-secondary p-4 ${
        onClick ? 'cursor-pointer hover:border-border-focus transition-colors' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background-primary text-text-muted">
          {icon}
        </div>
        <div className="flex-1 text-right">
          <div className="text-lg font-semibold text-text-primary">{value}</div>
          {subValue && <div className="text-xs text-text-muted">{subValue}</div>}
        </div>
      </div>
      <div className="mt-2 text-xs text-text-muted">{label}</div>
    </button>
  );
}

// Activity item component
function ActivityItem({
  contact,
  action,
  date,
  basePath,
}: {
  contact: { id: string; firstName: string | null; lastName: string | null };
  action: string;
  date: Date;
  basePath: string;
}) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
  const initial = getInitialFromName(contact.firstName ?? contact.lastName);

  return (
    <div className="flex items-start gap-3 py-3">
      <Link href={`${basePath}/contacts/${contact.id}`}>
        <Avatar size="sm" radius="xl" className="mt-0.5">
          {initial}
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            href={`${basePath}/contacts/${contact.id}`}
            className="font-medium text-text-primary hover:text-brand-primary text-sm"
          >
            {name}
          </Link>
          <Text size="xs" className="text-text-muted">
            {action}
          </Text>
        </div>
        <Text size="xs" className="text-text-muted mt-0.5">
          {new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
      </div>
    </div>
  );
}

// Collapsible section component
function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-primary last:border-b-0">
      <div className="flex items-center justify-between py-3 px-1">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-1 items-center justify-between text-left hover:bg-surface-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            {icon && <span className="text-text-muted">{icon}</span>}
            <Text size="sm" className="font-medium text-text-primary">
              {title}
            </Text>
          </div>
          {isOpen ? (
            <IconChevronUp size={16} className="text-text-muted" />
          ) : (
            <IconChevronDown size={16} className="text-text-muted" />
          )}
        </button>
        {action ? (
          <div
            className="ml-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {action}
          </div>
        ) : null}
      </div>
      <Collapse in={isOpen}>
        <div className="pb-3 px-1">{children}</div>
      </Collapse>
    </div>
  );
}

// Detail row component for sidebar
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1">
      <Text size="xs" className="text-text-muted shrink-0">
        {label}
      </Text>
      <div className="text-right text-sm text-text-primary">{value}</div>
    </div>
  );
}

interface OrganizationEditFormProps {
  organization: {
    id: string;
    name: string;
    websiteUrl: string | null;
    description: string | null;
    industry: string | null;
    size: string | null;
  };
  onSuccess: () => void;
  onCancel: () => void;
}

function OrganizationEditForm({ organization, onSuccess, onCancel }: OrganizationEditFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    websiteUrl: '',
    description: '',
    industry: '',
    size: '',
  });

  const utils = api.useUtils();

  const updateOrganization = api.crmOrganization.update.useMutation({
    onSuccess: () => {
      void utils.crmOrganization.getById.invalidate({ id: organization.id });
      void utils.crmOrganization.getAll.invalidate();
      notifications.show({
        title: 'Success',
        message: 'Organization updated successfully',
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

  useEffect(() => {
    setFormData({
      name: organization.name,
      websiteUrl: organization.websiteUrl ?? '',
      description: organization.description ?? '',
      industry: organization.industry ?? '',
      size: organization.size ?? '',
    });
  }, [organization]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Name is required',
        color: 'red',
      });
      return;
    }
    updateOrganization.mutate({
      id: organization.id,
      name: formData.name.trim(),
      websiteUrl: formData.websiteUrl.trim() ? formData.websiteUrl.trim() : null,
      description: formData.description.trim(),
      industry: formData.industry.trim(),
      size: formData.size.length > 0 ? formData.size as "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1000+" : null,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <TextInput
          label="Name"
          required
          value={formData.name}
          onChange={(event) => setFormData({ ...formData, name: event.target.value })}
        />
        <TextInput
          label="Website URL"
          type="url"
          placeholder="https://example.com"
          value={formData.websiteUrl}
          onChange={(event) =>
            setFormData({ ...formData, websiteUrl: event.target.value })
          }
        />
        <Textarea
          label="Description"
          minRows={2}
          value={formData.description}
          onChange={(event) =>
            setFormData({ ...formData, description: event.target.value })
          }
        />
        <TextInput
          label="Industry"
          placeholder="e.g., Technology, Healthcare, Finance"
          value={formData.industry}
          onChange={(event) =>
            setFormData({ ...formData, industry: event.target.value })
          }
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
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={updateOrganization.isPending}>
            Save Changes
          </Button>
        </div>
      </Stack>
    </form>
  );
}

export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const organizationId = params.id as string;
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [activeTab, setActiveTab] = useState<string | null>('overview');
  const [sidebarTab, setSidebarTab] = useState<string | null>('details');
  const [isStarred, setIsStarred] = useState(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] =
    useDisclosure(false);

  // Get current organization
  const { data: organization, isLoading } = api.crmOrganization.getById.useQuery(
    { id: organizationId, includeContacts: true },
    { enabled: !!organizationId }
  );

  // Get all organizations for prev/next navigation
  const { data: allOrgs } = api.crmOrganization.getAll.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  // Calculate navigation info
  const navigationInfo = useMemo(() => {
    if (!allOrgs?.organizations || !organizationId) {
      return { currentIndex: -1, total: 0, prevId: null, nextId: null };
    }
    const orgs = allOrgs.organizations;
    const currentIndex = orgs.findIndex((o) => o.id === organizationId);
    return {
      currentIndex,
      total: orgs.length,
      prevId: currentIndex > 0 ? orgs[currentIndex - 1]?.id : null,
      nextId: currentIndex < orgs.length - 1 ? orgs[currentIndex + 1]?.id : null,
    };
  }, [allOrgs, organizationId]);

  // Build activity from contacts' interactions
  const activities = useMemo(() => {
    if (!organization?.contacts) return [];
    const items: Array<{
      id: string;
      contact: { id: string; firstName: string | null; lastName: string | null };
      action: string;
      date: Date;
    }> = [];

    organization.contacts.forEach((contact) => {
      // Add contact creation as activity
      items.push({
        id: `${contact.id}-created`,
        contact: {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
        },
        action: 'was added to organization',
        date: new Date(contact.createdAt),
      });

      // Add last interaction if exists
      if (contact.lastInteractionAt) {
        items.push({
          id: `${contact.id}-interaction`,
          contact: {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
          },
          action: 'had an interaction',
          date: new Date(contact.lastInteractionAt),
        });
      }
    });

    return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);
  }, [organization]);

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

  if (!organization) {
    return (
      <div className="space-y-6">
        <Text className="text-text-secondary">Organization not found</Text>
      </div>
    );
  }

  const basePath = `/w/${workspace.slug}/crm`;
  const contactCount = organization._count.contacts;
  const teamMembers = organization.contacts?.slice(0, 5) ?? [];

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between border-b border-border-primary bg-surface-secondary px-4 py-2">
        <div className="flex items-center gap-2">
          <Tooltip label="Back to Organizations">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => router.push(`${basePath}/organizations`)}
            >
              <IconArrowLeft size={18} />
            </ActionIcon>
          </Tooltip>

          <div className="h-5 w-px bg-border-primary mx-1" />

          <Tooltip label="Previous Organization">
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!navigationInfo.prevId}
              onClick={() =>
                navigationInfo.prevId &&
                router.push(`${basePath}/organizations/${navigationInfo.prevId}`)
              }
            >
              <IconChevronLeft size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Next Organization">
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!navigationInfo.nextId}
              onClick={() =>
                navigationInfo.nextId &&
                router.push(`${basePath}/organizations/${navigationInfo.nextId}`)
              }
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Tooltip>

          {navigationInfo.total > 0 && navigationInfo.currentIndex >= 0 && (
            <Text size="xs" className="text-text-muted ml-2">
              {navigationInfo.currentIndex + 1} of {navigationInfo.total} organizations
            </Text>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconMail size={14} />}
          >
            Compose Email
          </Button>
        </div>
      </div>

      {/* Company Header */}
      <div className="flex items-center gap-4 border-b border-border-primary bg-background-primary px-6 py-4">
        <Avatar size="lg" radius="md" src={organization.logoUrl}>
          <IconBuilding size={28} />
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Title order={3} className="text-text-primary">
              {organization.name}
            </Title>
            <ActionIcon
              variant="subtle"
              color={isStarred ? 'yellow' : 'gray'}
              onClick={() => setIsStarred(!isStarred)}
            >
              {isStarred ? <IconStarFilled size={18} /> : <IconStar size={18} />}
            </ActionIcon>
          </div>
          {organization.industry && (
            <Badge variant="light" size="sm" mt={4}>
              {organization.industry}
            </Badge>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border-primary bg-background-primary px-6">
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="activity">Activity</Tabs.Tab>
            <Tabs.Tab value="emails" rightSection={<Badge size="xs" variant="light">0</Badge>}>
              Emails
            </Tabs.Tab>
            <Tabs.Tab value="team" rightSection={<Badge size="xs" variant="light">{contactCount}</Badge>}>
              Team
            </Tabs.Tab>
            <Tabs.Tab value="notes">Notes</Tabs.Tab>
            <Tabs.Tab value="tasks">Tasks</Tabs.Tab>
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
              {/* Highlights Grid */}
              <div className="grid grid-cols-3 gap-4">
                <HighlightCard
                  icon={<IconBolt size={18} />}
                  label="Connection Strength"
                  value={
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span>Strong</span>
                    </div>
                  }
                  subValue={contactCount > 0 ? `${contactCount} contacts` : 'No contacts yet'}
                />

                <HighlightCard
                  icon={<IconCalendar size={18} />}
                  label="Next Interaction"
                  value="—"
                  subValue="No upcoming events"
                />

                <HighlightCard
                  icon={<IconUsers size={18} />}
                  label="Team"
                  value={
                    <div className="flex items-center justify-end -space-x-2">
                      {teamMembers.length > 0 ? (
                        <>
                          {teamMembers.slice(0, 4).map((member) => (
                            <Avatar
                              key={member.id}
                              size="sm"
                              radius="xl"
                              className="border-2 border-surface-secondary"
                            >
                              {member.firstName?.[0] ?? member.lastName?.[0] ?? '?'}
                            </Avatar>
                          ))}
                          {teamMembers.length > 4 && (
                            <Avatar
                              size="sm"
                              radius="xl"
                              className="border-2 border-surface-secondary bg-brand-primary text-white"
                            >
                              +{teamMembers.length - 4}
                            </Avatar>
                          )}
                        </>
                      ) : (
                        <Text size="sm">—</Text>
                      )}
                    </div>
                  }
                  subValue={`${contactCount} member${contactCount !== 1 ? 's' : ''}`}
                  onClick={() => setActiveTab('team')}
                />

                <HighlightCard
                  icon={<IconCalendar size={18} />}
                  label="Events"
                  value="0"
                  subValue="No events"
                />

                <HighlightCard
                  icon={<IconUsers size={18} />}
                  label="Contacts"
                  value={contactCount.toString()}
                  subValue={contactCount > 0 ? 'Active' : 'None'}
                  onClick={() => setActiveTab('team')}
                />

                <HighlightCard
                  icon={<IconMessageCircle size={18} />}
                  label="Communications"
                  value={activities.length.toString()}
                  subValue="All time"
                  onClick={() => setActiveTab('activity')}
                />
              </div>

              {/* Activity Section */}
              <div className="rounded-lg border border-border-primary bg-surface-secondary">
                <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
                  <div className="flex items-center gap-2">
                    <IconBolt size={18} className="text-text-muted" />
                    <Text size="sm" className="font-medium text-text-primary">
                      Activity
                    </Text>
                  </div>
                  <Button variant="subtle" size="xs" onClick={() => setActiveTab('activity')}>
                    View All
                  </Button>
                </div>
                <div className="px-4 divide-y divide-border-primary">
                  {activities.length > 0 ? (
                    activities.slice(0, 5).map((activity) => (
                      <ActivityItem
                        key={activity.id}
                        contact={activity.contact}
                        action={activity.action}
                        date={activity.date}
                        basePath={basePath}
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
                    <IconMail size={18} className="text-text-muted" />
                    <Text size="sm" className="font-medium text-text-primary">
                      Emails
                    </Text>
                    <Badge size="xs" variant="light">
                      0
                    </Badge>
                  </div>
                  <Button variant="subtle" size="xs" onClick={() => setActiveTab('emails')}>
                    View All
                  </Button>
                </div>
                <div className="p-8 text-center">
                  <Text size="sm" className="text-text-muted">
                    No emails yet
                  </Text>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4">
              <Title order={4} className="text-text-primary">
                All Activity
              </Title>
              <div className="rounded-lg border border-border-primary bg-surface-secondary">
                <div className="px-4 divide-y divide-border-primary">
                  {activities.length > 0 ? (
                    activities.map((activity) => (
                      <ActivityItem
                        key={activity.id}
                        contact={activity.contact}
                        action={activity.action}
                        date={activity.date}
                        basePath={basePath}
                      />
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <IconBolt size={40} className="text-text-muted mx-auto mb-3" />
                      <Text size="sm" className="text-text-muted">
                        No activity recorded yet
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
              <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                <IconMail size={40} className="text-text-muted mx-auto mb-3" />
                <Text size="sm" className="text-text-muted">
                  No email communication recorded
                </Text>
                <Button variant="light" size="sm" mt="md" leftSection={<IconMail size={14} />}>
                  Compose Email
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Title order={4} className="text-text-primary">
                  Team Members ({contactCount})
                </Title>
                <Button
                  size="xs"
                  variant="light"
                  component={Link}
                  href={`${basePath}/contacts?organizationId=${organization.id}`}
                >
                  Add Contact
                </Button>
              </div>
              {organization.contacts && organization.contacts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {organization.contacts.map((contact) => (
                    <Link
                      key={contact.id}
                      href={`${basePath}/contacts/${contact.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border-primary bg-surface-secondary p-4 hover:border-border-focus transition-colors"
                    >
                      <Avatar size="md" radius="xl">
                        {contact.firstName?.[0] ?? contact.lastName?.[0] ?? '?'}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <Text size="sm" className="font-medium text-text-primary truncate">
                          {[contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
                            'Unknown'}
                        </Text>
                        {contact.email && (
                          <Text size="xs" className="text-text-muted truncate">
                            {contact.email}
                          </Text>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                  <IconUsers size={40} className="text-text-muted mx-auto mb-3" />
                  <Text size="sm" className="text-text-muted">
                    No team members yet
                  </Text>
                  <Button
                    variant="light"
                    size="sm"
                    mt="md"
                    component={Link}
                    href={`${basePath}/contacts?organizationId=${organization.id}`}
                  >
                    Add First Contact
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-4">
              <Title order={4} className="text-text-primary">
                Notes
              </Title>
              <div className="rounded-lg border border-border-primary bg-surface-secondary p-12 text-center">
                <IconNote size={40} className="text-text-muted mx-auto mb-3" />
                <Text size="sm" className="text-text-muted">
                  No notes yet
                </Text>
                <Button variant="light" size="sm" mt="md">
                  Add Note
                </Button>
              </div>
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
                <Tabs.Tab value="comments" className="text-xs">
                  Comments
                </Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </div>

          {sidebarTab === 'details' && (
            <div className="p-4">
              {/* Record Details */}
              <CollapsibleSection
                title="Record Details"
                action={
                  <Tooltip label="Edit details">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditModal();
                      }}
                      aria-label="Edit organization details"
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                }
              >
                <Stack gap="xs">
                  {organization.websiteUrl && (
                    <DetailRow
                      label="Website"
                      value={
                        <a
                          href={organization.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-primary hover:underline text-sm flex items-center gap-1"
                        >
                          <IconWorld size={12} />
                          {getHostnameFromUrl(organization.websiteUrl)}
                        </a>
                      }
                    />
                  )}
                  <DetailRow label="Name" value={organization.name} />
                  {organization.description && (
                    <DetailRow
                      label="Description"
                      value={
                        <Text size="xs" className="text-text-secondary line-clamp-3">
                          {organization.description}
                        </Text>
                      }
                    />
                  )}
                  {organization.industry && (
                    <DetailRow label="Industry" value={organization.industry} />
                  )}
                  {organization.size && (
                    <DetailRow label="Company Size" value={`${organization.size} employees`} />
                  )}
                  <DetailRow
                    label="Team"
                    value={`${contactCount} contact${contactCount !== 1 ? 's' : ''}`}
                  />
                </Stack>
              </CollapsibleSection>

              {/* Metadata */}
              <CollapsibleSection title="Metadata" defaultOpen={false}>
                <Stack gap="xs">
                  <DetailRow
                    label="Created"
                    value={new Date(organization.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  />
                  <DetailRow
                    label="Updated"
                    value={new Date(organization.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  />
                  <DetailRow
                    label="Created By"
                    value={organization.createdBy?.name ?? organization.createdBy?.email ?? 'Unknown'}
                  />
                </Stack>
              </CollapsibleSection>

              {/* Lists */}
              <CollapsibleSection title="Lists" defaultOpen={false}>
                <Text size="xs" className="text-text-muted">
                  Not added to any lists
                </Text>
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
                <Text size="xs" className="text-text-muted mt-1">
                  Add a comment to start a discussion
                </Text>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        opened={editModalOpened}
        onClose={closeEditModal}
        title="Edit Organization"
        size="lg"
      >
        {organization ? (
          <OrganizationEditForm
            organization={organization}
            onSuccess={closeEditModal}
            onCancel={closeEditModal}
          />
        ) : null}
      </Modal>
    </div>
  );
}

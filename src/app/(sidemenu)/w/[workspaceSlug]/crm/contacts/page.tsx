'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  TextInput,
  Textarea,
  Button,
  Avatar,
  Skeleton,
  Menu,
  Modal,
  Stack,
  Select,
  Checkbox,
  ActionIcon,
  Collapse,
  Loader,
} from '@mantine/core';
import { useDisclosure, useDebouncedValue } from '@mantine/hooks';
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
  IconUpload,
  IconUsers,
  IconSearch,
  IconLetterCase,
  IconChartBar,
  IconMail,
  IconCalendarPlus,
  IconBriefcase,
  IconBuilding,
} from '@tabler/icons-react';
import { keepPreviousData } from '@tanstack/react-query';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { ImportDialog } from './_components/ImportDialog';
import { CsvImportDialog } from './_components/CsvImportDialog';
import { ConnectionScoreBadge } from './_components/ConnectionScoreGauge';
import { EmptyState } from '~/app/_components/EmptyState';
import { EnrichContactButton } from '~/app/_components/crm/EnrichContactButton';
import { FilterBar } from '~/app/_components/filters';
import { ProjectSortMenu, type SortFieldDef } from '~/app/_components/toolbar';
import { useProjectViewState } from '~/app/_components/projects/useProjectViewState';
import { usePageSearchHotkey } from '~/hooks/usePageSearchHotkey';
import { hasActiveFilters } from '~/types/filter';
import type { FilterBarConfig } from '~/types/filter';
import styles from './Contacts.module.css';

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

const PROFILE_TYPE_OPTIONS = [
  { value: 'Channel Partner', label: 'Channel Partner' },
  { value: 'Advisor', label: 'Advisor' },
  { value: 'Developer', label: 'Developer' },
  { value: 'Designer', label: 'Designer' },
  { value: 'Founder', label: 'Founder' },
  { value: 'Product Manager', label: 'Product Manager' },
  { value: 'Investor', label: 'Investor' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Sales', label: 'Sales' },
  { value: 'Other', label: 'Other' },
];

/** URL query params the contacts FilterBar owns. */
const CONTACT_FILTER_KEYS = ['profileType', 'organizationId'] as const;

/** Sort keys match `crmContact.getAll`'s `sortBy` enum — sorting is server-side
 * so it orders the whole workspace's contacts, not just the loaded pages. */
const CONTACT_SORT_FIELDS: SortFieldDef[] = [
  { key: 'name', label: 'Name', icon: IconLetterCase },
  { key: 'connectionScore', label: 'Connection score', icon: IconChartBar },
  { key: 'lastInteractionAt', label: 'Last interaction', icon: IconMail },
  { key: 'createdAt', label: 'Created', icon: IconCalendarPlus },
];

const CONTACT_SORT_KEYS = new Set(CONTACT_SORT_FIELDS.map((f) => f.key));

const PAGE_SIZE = 50;


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
    github: '',
    bluesky: '',
    about: '',
    profileType: '',
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
      github: formData.github || undefined,
      bluesky: formData.bluesky || undefined,
      about: formData.about || undefined,
      profileType: formData.profileType || undefined,
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
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="GitHub"
            placeholder="username"
            value={formData.github}
            onChange={(e) => setFormData({ ...formData, github: e.target.value })}
          />
          <TextInput
            label="BlueSky"
            placeholder="@handle.bsky.social"
            value={formData.bluesky}
            onChange={(e) => setFormData({ ...formData, bluesky: e.target.value })}
          />
        </div>
        <Textarea
          label="Description"
          minRows={2}
          value={formData.about}
          onChange={(e) => setFormData({ ...formData, about: e.target.value })}
        />
        <Select
          label="Profile Type"
          placeholder="Select type"
          data={PROFILE_TYPE_OPTIONS}
          value={formData.profileType}
          onChange={(value) => setFormData({ ...formData, profileType: value ?? '' })}
          clearable
          searchable
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
  const [csvImportDialogOpened, { open: openCsvImportDialog, close: closeCsvImportDialog }] =
    useDisclosure(false);
  const [importDialogOpened, { open: openImportDialog, close: closeImportDialog }] =
    useDisclosure(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const {
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    sortState,
    setSortField,
    clearSort,
  } = useProjectViewState(CONTACT_FILTER_KEYS);
  const [filterRowOpen, { toggle: toggleFilterRow }] = useDisclosure(false);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') searchRef.current?.blur();
    },
    [],
  );
  usePageSearchHotkey(searchRef);

  // Search and filters run server-side (the list is paginated, so client-side
  // filtering would only see loaded pages). Debounce so we don't fire a
  // request per keystroke.
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);

  const profileTypeFilter = filters.profileType as string[] | undefined;
  const organizationFilter = filters.organizationId as string[] | undefined;
  const sortBy =
    sortState && CONTACT_SORT_KEYS.has(sortState.field)
      ? (sortState.field as 'name' | 'connectionScore' | 'lastInteractionAt' | 'createdAt')
      : undefined;

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.crmContact.getAll.useInfiniteQuery(
    {
      workspaceId: workspaceId!,
      // The table reads no organization/interaction fields — don't join them.
      search: debouncedSearch.trim() || undefined,
      profileTypes: profileTypeFilter?.length ? profileTypeFilter : undefined,
      organizationIds: organizationFilter?.length ? organizationFilter : undefined,
      sortBy,
      sortDir: sortBy ? sortState?.direction : undefined,
      limit: PAGE_SIZE,
    },
    {
      enabled: !!workspaceId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    }
  );

  // Overall workspace total, independent of the active search/filters.
  const { data: stats } = api.crmContact.getStats.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const { data: organizationsData } = api.crmOrganization.getAll.useQuery(
    { workspaceId: workspaceId!, limit: 100 },
    { enabled: !!workspaceId }
  );

  const filterConfig: FilterBarConfig = useMemo(
    () => ({
      fields: [
        {
          key: 'profileType',
          label: 'Profile type',
          type: 'multi-select',
          icon: IconBriefcase,
          badgeColor: 'grape',
          options: PROFILE_TYPE_OPTIONS,
        },
        {
          key: 'organizationId',
          label: 'Organization',
          type: 'multi-select',
          icon: IconBuilding,
          badgeColor: 'cyan',
          options:
            organizationsData?.organizations.map((org) => ({
              value: org.id,
              label: org.name,
            })) ?? [],
        },
      ],
    }),
    [organizationsData?.organizations],
  );

  const filtersActive = hasActiveFilters(filterConfig, filters);
  const searchActive = debouncedSearch.trim().length > 0;

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

  const contacts = useMemo(
    () => data?.pages.flatMap((page) => page.contacts) ?? [],
    [data],
  );
  // Count of contacts matching the active search/filters (all pages, not just
  // the loaded ones); getStats.totalContacts is the unfiltered workspace total.
  const matchingCount = data?.pages[0]?.totalCount;

  // Load the next page when the sentinel row below the table scrolls into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // !isFetching (not just isFetchingNextPage): with keepPreviousData a
        // filter change leaves the old hasNextPage visible while the new first
        // page loads — fetching "next" then would cancel that in-flight fetch.
        if (entries[0]?.isIntersecting && hasNextPage && !isFetching) {
          void fetchNextPage();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, fetchNextPage, contacts.length]);

  // A selection made under one search/filter/sort doesn't carry meaning under
  // another — and the all-selected checkbox compares sizes, so a stale set
  // could misreport. Reset when the query inputs change.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearch, filters, sortState]);

  const toggleSelectAll = () => {
    if (contacts.length === 0) return;
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
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
  const allSelected = contacts.length > 0 && selectedIds.size === contacts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < contacts.length;

  const totalContacts = stats?.totalContacts;
  const countText =
    matchingCount === undefined
      ? null
      : (searchActive || filtersActive) && totalContacts !== undefined
        ? `${matchingCount.toLocaleString()} of ${totalContacts.toLocaleString()} contacts`
        : `${matchingCount.toLocaleString()} contact${matchingCount === 1 ? '' : 's'}`;

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
              <Menu.Item
                leftSection={<IconUpload size={14} />}
                onClick={openCsvImportDialog}
              >
                Import from CSV
              </Menu.Item>
              <Menu.Item
                leftSection={<IconUpload size={14} />}
                onClick={openImportDialog}
              >
                Import contacts from Google Contacts/Calendar
              </Menu.Item>
              <Menu.Item leftSection={<IconDownload size={14} />}>
                Export to CSV
              </Menu.Item>
              <Menu.Item leftSection={<IconDownload size={14} />}>
                Export to Excel
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>

          {/* New Person Button */}
          <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
            New Person
          </Button>
        </div>
      </div>

      {/* Toolbar: total on the left; search / filter / sort (projects-page look) right */}
      <div className="flex items-center justify-between gap-4 border-b border-border-primary bg-background-primary px-4 py-2">
        <Text size="sm" className="text-text-muted">
          {countText ?? ' '}
        </Text>

        <div className={styles.actions}>
          <div className={styles.searchWrap}>
            <IconSearch className={styles.searchIcon} size={13} stroke={1.75} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search  ⌘F"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className={styles.searchInput}
            />
          </div>

          <button
            className={styles.actionBtn}
            type="button"
            onClick={toggleFilterRow}
            data-active={filtersActive ? 'true' : 'false'}
          >
            <IconFilter size={13} stroke={1.75} />
            Filter
          </button>

          <ProjectSortMenu
            sortState={sortState}
            onSortChange={setSortField}
            onClearSort={clearSort}
            fields={CONTACT_SORT_FIELDS}
            trigger={
              <button
                type="button"
                className={styles.actionBtn}
                data-active={sortState ? 'true' : 'false'}
              >
                <IconArrowsSort size={13} stroke={1.75} />
                Sort
              </button>
            }
          />
        </div>
      </div>

      {/* Collapsible filter row */}
      <Collapse in={filterRowOpen || filtersActive}>
        <div className={`${styles.filterRow} border-b border-border-primary`}>
          <FilterBar
            config={filterConfig}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      </Collapse>

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
          <>
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
                      Connection Score
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
                  [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
                  contact.email ||
                  'Unknown Contact';

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
                        <Avatar size="sm" radius="xl" src={contact.imageUrl}>
                          {contact.firstName?.[0]?.toUpperCase() ??
                            contact.lastName?.[0]?.toUpperCase() ??
                            contact.email?.[0]?.toUpperCase() ??
                            '?'}
                        </Avatar>
                        <Text size="sm" className="font-medium text-text-primary">
                          {fullName}
                        </Text>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ConnectionScoreBadge score={contact.connectionScore} />
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
                          <EnrichContactButton
                            contactId={contact.id}
                            variant="menu-item"
                          />
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
          {/* Sentinel: fetches the next page as it approaches the viewport.
              The button is a fallback for environments where the observer
              doesn't fire; clicking is never required in a normal browser. */}
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {isFetchingNextPage ? (
              <Loader size="sm" />
            ) : hasNextPage ? (
              <Button
                variant="subtle"
                size="xs"
                disabled={isFetching}
                onClick={() => void fetchNextPage()}
              >
                Load more
              </Button>
            ) : (
              <Text size="xs" className="text-text-muted">
                {countText}
              </Text>
            )}
          </div>
          </>
        ) : searchActive || filtersActive ? (
          <div className="flex items-center justify-center py-16">
            <Text size="sm" className="text-text-muted">
              No contacts match your search.
            </Text>
          </div>
        ) : (
          <EmptyState
            icon={IconUsers}
            title="No contacts yet"
            message="Keep track of your relationships. Add your first contact to get started with your CRM."
            action={
              <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
                New Person
              </Button>
            }
          />
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

      {/* Import Dialog */}
      {workspaceId && (
        <ImportDialog
          opened={importDialogOpened}
          onClose={closeImportDialog}
          workspaceId={workspaceId}
        />
      )}

      {/* CSV Import Dialog */}
      {workspaceId && (
        <CsvImportDialog
          opened={csvImportDialogOpened}
          onClose={closeCsvImportDialog}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}

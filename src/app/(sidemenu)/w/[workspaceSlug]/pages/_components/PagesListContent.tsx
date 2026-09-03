'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ActionIcon,
  Avatar,
  Button,
  Collapse,
  Group,
  Menu,
  Modal,
  Skeleton,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowsSort,
  IconCalendar,
  IconCalendarPlus,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconFileText,
  IconFilter,
  IconFolder,
  IconLetterCase,
  IconPlus,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUser,
  IconWorld,
} from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { api, type RouterOutputs } from '~/trpc/react';
import { FilterBar } from '~/app/_components/filters';
import { ProjectSortMenu, type SortFieldDef } from '~/app/_components/toolbar';
import type { ProjectSortState } from '~/app/_components/toolbar/useProjectSort';
import { usePageSearchHotkey } from '~/hooks/usePageSearchHotkey';
import { hasActiveFilters, type FilterBarConfig, type FilterState } from '~/types/filter';
import styles from './PagesList.module.css';

interface PagesListContentProps {
  workspaceId: string;
  workspaceSlug: string;
}

type PageRow = RouterOutputs['page']['tree'][number];

type VisibilityTab = 'all' | 'public' | 'private';

const VISIBILITY_TABS: { value: VisibilityTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
];

const SORT_FIELDS: SortFieldDef[] = [
  { key: 'updatedAt', label: 'Date modified', icon: IconCalendar },
  { key: 'createdAt', label: 'Date created', icon: IconCalendarPlus },
  { key: 'title', label: 'Title', icon: IconLetterCase },
];

const DEFAULT_SORT: ProjectSortState = { field: 'updatedAt', direction: 'desc' };

function isDefaultSort(sort: ProjectSortState) {
  return sort.field === DEFAULT_SORT.field && sort.direction === DEFAULT_SORT.direction;
}

function compareRows(a: PageRow, b: PageRow, sort: ProjectSortState): number {
  let cmp = 0;
  if (sort.field === 'title') {
    cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  } else {
    const key = sort.field === 'createdAt' ? 'createdAt' : 'updatedAt';
    cmp = new Date(a[key]).getTime() - new Date(b[key]).getTime();
  }
  return sort.direction === 'asc' ? cmp : -cmp;
}

function initialOf(name: string | null | undefined) {
  const trimmed = name?.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

export function PagesListContent({ workspaceId, workspaceSlug }: PagesListContentProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const searchRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<VisibilityTab>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ProjectSortState>(DEFAULT_SORT);
  const [filters, setFilters] = useState<FilterState>({});
  const [filterRowOpen, setFilterRowOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PageRow | null>(null);

  usePageSearchHotkey(searchRef);

  // The tree carries the nesting (ADR-0039) — pages ordered depth-first with a
  // `depth` for indentation. Any narrowing or re-ordering flattens it: matches
  // surface without their ancestors, so indentation would be misleading.
  const { data: pages, isLoading } = api.page.tree.useQuery({ workspaceId });

  // One favourites read for the whole list rather than an `isFavorite` query
  // per row. Page favourites key on the workspace-relative path.
  const favorites = api.favorite.list.useQuery({ workspaceId });
  const favoritedPaths = useMemo(
    () => new Set((favorites.data ?? []).map((f) => f.entityId)),
    [favorites.data],
  );

  const toggleFavorite = api.favorite.toggle.useMutation({
    onMutate: async (vars) => {
      await utils.favorite.list.cancel({ workspaceId });
      const prev = utils.favorite.list.getData({ workspaceId });
      utils.favorite.list.setData({ workspaceId }, (old) => {
        const list = old ?? [];
        const existing = list.find((f) => f.entityId === vars.entityId);
        if (existing) return list.filter((f) => f.entityId !== vars.entityId);
        return [
          {
            id: `optimistic-${vars.entityId}`,
            entityType: 'page' as const,
            entityId: vars.entityId,
            title: vars.label ?? vars.entityId,
            icon: null,
            workspaceId,
          },
          ...list,
        ];
      });
      return { prev };
    },
    onError: (error, _vars, context) => {
      utils.favorite.list.setData({ workspaceId }, context?.prev);
      notifications.show({
        color: 'red',
        title: 'Could not update favourites',
        message: error.message,
      });
    },
    onSettled: (_data, _error, vars) => {
      void utils.favorite.list.invalidate();
      void utils.favorite.isFavorite.invalidate({
        entityType: 'page',
        entityId: vars.entityId,
      });
    },
  });

  const createPage = api.page.create.useMutation({
    onSuccess: (page) => {
      router.push(`/w/${workspaceSlug}/pages/${page.id}`);
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Could not create page',
        message: error.message,
      });
    },
  });

  const duplicatePage = api.page.duplicate.useMutation({
    onSuccess: (copy) => {
      void utils.page.list.invalidate();
      void utils.page.tree.invalidate();
      router.push(`/w/${workspaceSlug}/pages/${copy.id}`);
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Could not duplicate page',
        message: error.message,
      });
    },
  });

  const deletePage = api.page.delete.useMutation({
    onSuccess: () => {
      setPendingDelete(null);
      void utils.page.list.invalidate();
      void utils.page.tree.invalidate();
      void utils.favorite.list.invalidate();
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Could not delete page',
        message: error.message,
      });
    },
  });

  // Filter options come from the pages themselves — no extra round-trips.
  const filterConfig: FilterBarConfig = useMemo(() => {
    const projects = new Map<string, string>();
    const authors = new Map<string, string>();
    for (const page of pages ?? []) {
      if (page.project) projects.set(page.project.id, page.project.name);
      authors.set(page.createdBy.id, page.createdBy.name ?? 'Unknown');
    }
    const toOptions = (map: Map<string, string>) =>
      [...map.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    return {
      fields: [
        {
          key: 'projectId',
          label: 'Project',
          type: 'multi-select',
          icon: IconFolder,
          badgeColor: 'cyan',
          options: toOptions(projects),
        },
        {
          key: 'createdById',
          label: 'Created by',
          type: 'multi-select',
          icon: IconUser,
          badgeColor: 'grape',
          options: toOptions(authors),
        },
      ],
    };
  }, [pages]);

  const filtersActive = hasActiveFilters(filterConfig, filters);
  const query = search.trim().toLowerCase();

  const counts = useMemo(() => {
    const all = pages?.length ?? 0;
    const pub = pages?.filter((p) => p.isPublic).length ?? 0;
    return { all, public: pub, private: all - pub };
  }, [pages]);

  const rows = useMemo(() => {
    if (!pages) return [];
    const projectIds = filters.projectId;
    const authorIds = filters.createdById;
    const narrowed =
      tab !== 'all' || query || filtersActive || !isDefaultSort(sort);
    if (!narrowed) return pages;

    const matches = pages.filter((p) => {
      if (tab === 'public' && !p.isPublic) return false;
      if (tab === 'private' && p.isPublic) return false;
      if (query && !p.title.toLowerCase().includes(query)) return false;
      if (Array.isArray(projectIds) && projectIds.length > 0) {
        if (!p.project || !projectIds.includes(p.project.id)) return false;
      }
      if (Array.isArray(authorIds) && authorIds.length > 0) {
        if (!authorIds.includes(p.createdBy.id)) return false;
      }
      return true;
    });
    return matches
      .map((p) => ({ ...p, depth: 0 }))
      .sort((a, b) => compareRows(a, b, sort));
  }, [pages, tab, query, filters, filtersActive, sort]);

  const setSortField = useCallback((field: string) => {
    setSort((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field, direction: field === 'title' ? 'asc' : 'desc' };
    });
  }, []);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') searchRef.current?.blur();
  }, []);

  const sortLabel = SORT_FIELDS.find((f) => f.key === sort.field)?.label ?? 'Sort';

  const emptyMessage =
    pages && pages.length > 0
      ? 'No pages match.'
      : 'No pages yet. Create your first one.';

  return (
    <div className={styles.page}>
      {/* Top bar: visibility tabs left, search / sort / filter / new right */}
      <div className={styles.topBar}>
        <nav className={styles.tabs} aria-label="Page visibility">
          {VISIBILITY_TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={styles.tab}
              data-active={tab === value ? 'true' : 'false'}
              onClick={() => setTab(value)}
            >
              <span className={styles.tabLabel}>{label}</span>
              {!isLoading ? (
                <span className={styles.tabCount}>{counts[value]}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className={styles.actions}>
          <div className={styles.searchWrap}>
            <IconSearch className={styles.searchIcon} size={13} stroke={1.75} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search  ⌘F"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className={styles.searchInput}
              aria-label="Search pages"
            />
          </div>

          <ProjectSortMenu
            sortState={sort}
            onSortChange={setSortField}
            onClearSort={() => setSort(DEFAULT_SORT)}
            fields={SORT_FIELDS}
            trigger={
              <button
                type="button"
                className={styles.actionBtn}
                data-active={isDefaultSort(sort) ? 'false' : 'true'}
              >
                <IconArrowsSort size={13} stroke={1.75} />
                {sortLabel}
              </button>
            }
          />

          <button
            className={styles.actionBtn}
            type="button"
            onClick={() => setFilterRowOpen((o) => !o)}
            data-active={filtersActive ? 'true' : 'false'}
          >
            <IconFilter size={13} stroke={1.75} />
            Filters
          </button>

          <button
            className={styles.newBtn}
            type="button"
            onClick={() => createPage.mutate({ workspaceId })}
            disabled={createPage.isPending}
          >
            <IconPlus size={13} stroke={2.5} />
            New page
          </button>
        </div>
      </div>

      <Collapse in={filterRowOpen || filtersActive}>
        <div className={styles.filterRow}>
          <FilterBar config={filterConfig} filters={filters} onFiltersChange={setFilters} />
        </div>
      </Collapse>

      <div className={styles.list}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.row}>
              <Skeleton height={16} width={16} radius="sm" />
              <Skeleton height={14} width={i % 2 ? 220 : 160} />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className={styles.empty}>{emptyMessage}</div>
        ) : (
          rows.map((page) => {
            const favoritePath = `pages/${page.id}`;
            const favorited = favoritedPaths.has(favoritePath);
            const favoriteLabel = favorited ? 'Remove from favourites' : 'Add to favourites';
            return (
              <div
                key={page.id}
                className={styles.row}
                style={page.depth > 0 ? { paddingLeft: 32 + page.depth * 22 } : undefined}
              >
                {/* The link covers icon + title + timestamp; the controls on the
                    right are siblings, never nested inside the anchor. */}
                <Link href={`/w/${workspaceSlug}/pages/${page.id}`} className={styles.rowLink}>
                  {page.depth > 0 ? (
                    <IconChevronRight size={14} className={styles.rowIcon} aria-hidden />
                  ) : null}
                  <IconFileText size={18} stroke={1.75} className={styles.rowIcon} aria-hidden />
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{page.title}</span>
                    {page.project ? (
                      <span className={styles.rowMeta}>· {page.project.name}</span>
                    ) : null}
                  </div>
                  <span className={styles.rowMeta}>
                    {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
                  </span>
                </Link>

                <div className={styles.rowActions}>
                  <span className={styles.rowSlot}>
                    {page.isPublic ? (
                      <Tooltip label="Published to the web" withArrow>
                        <IconWorld size={16} stroke={1.75} aria-label="Published to the web" />
                      </Tooltip>
                    ) : null}
                  </span>

                  <span className={styles.rowSlot}>
                    <Tooltip label={`Created by ${page.createdBy.name ?? 'Unknown'}`} withArrow>
                      <Avatar
                        src={page.createdBy.image}
                        alt={page.createdBy.name ?? 'Unknown'}
                        size={20}
                        radius="xl"
                        color="brand"
                      >
                        {initialOf(page.createdBy.name)}
                      </Avatar>
                    </Tooltip>
                  </span>

                  <Tooltip label={favoriteLabel} withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label={favoriteLabel}
                      aria-pressed={favorited}
                      onClick={() =>
                        toggleFavorite.mutate({
                          entityType: 'page',
                          entityId: favoritePath,
                          label: page.title,
                          workspaceId,
                        })
                      }
                    >
                      {favorited ? (
                        <IconStarFilled size={16} className="text-brand-warning" />
                      ) : (
                        <IconStar size={16} stroke={1.75} />
                      )}
                    </ActionIcon>
                  </Tooltip>

                  <Menu position="bottom-end" shadow="md" withinPortal>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`Actions for ${page.title}`}
                      >
                        <IconDots size={16} stroke={1.75} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconExternalLink size={14} />}
                        onClick={() =>
                          window.open(`/w/${workspaceSlug}/pages/${page.id}`, '_blank', 'noopener')
                        }
                      >
                        Open in new tab
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconCopy size={14} />}
                        disabled={duplicatePage.isPending}
                        onClick={() => duplicatePage.mutate({ id: page.id })}
                      >
                        Duplicate
                      </Menu.Item>
                      {page.hasChildren ? (
                        <Menu.Item
                          leftSection={<IconCopy size={14} />}
                          disabled={duplicatePage.isPending}
                          onClick={() => duplicatePage.mutate({ id: page.id, withSubpages: true })}
                        >
                          Duplicate with sub-pages
                        </Menu.Item>
                      ) : null}
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => setPendingDelete(page)}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete page"
        centered
      >
        <Text size="sm" className="text-text-secondary">
          Delete <strong className="text-text-primary">{pendingDelete?.title}</strong>? This
          cannot be undone.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deletePage.isPending}
            onClick={() => pendingDelete && deletePage.mutate({ id: pendingDelete.id })}
          >
            Delete
          </Button>
        </Group>
      </Modal>
    </div>
  );
}

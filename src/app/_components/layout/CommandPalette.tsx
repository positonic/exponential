'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useHotkeys, useDebouncedValue } from '@mantine/hooks';
import {
  Modal,
  TextInput,
  Group,
  Kbd,
  UnstyledButton,
  Skeleton,
  Text,
} from '@mantine/core';
import {
  IconSearch,
  IconSparkles,
  IconSquareRoundedCheck,
  IconStack2,
  IconMessageCircle,
  IconFlag,
  IconTarget,
  IconPlus,
  IconCalendar,
  IconLayoutDashboard,
  IconArrowRight,
  IconHome,
  IconLayoutGrid,
  IconRobot,
  IconBook2,
  IconCalendarEvent,
  IconUsers,
  IconTicket,
  IconBulb,
  IconTrophy,
  IconUser,
  IconBuilding,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import type { RouterOutputs } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { useAgentModal } from '~/providers/AgentModalProvider';
import styles from '../home/WorkspaceHomeConceptD.module.css';

type Mode = 'all' | 'projects' | 'tasks' | 'goals' | 'ai';

type SearchResult = RouterOutputs['search']['global']['results'][number];
type SearchType = SearchResult['type'];

const MODES: { id: Mode; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All', icon: IconSparkles },
  { id: 'tasks', label: 'Tasks', icon: IconSquareRoundedCheck },
  { id: 'projects', label: 'Projects', icon: IconStack2 },
  { id: 'goals', label: 'Goals', icon: IconTarget },
  { id: 'ai', label: 'Ask Zoe', icon: IconMessageCircle },
];

const PAGES = [
  { label: 'Home', path: 'home', icon: IconLayoutDashboard },
  { label: 'Projects', path: 'projects', icon: IconStack2 },
  { label: 'Tasks', path: 'projects-tasks', icon: IconSquareRoundedCheck },
  { label: 'Goals', path: 'goals', icon: IconTarget },
];

const PAGE_LABELS = new Set(PAGES.map((p) => p.label.toLowerCase()));

// Workspace-scoped sections surfaced when searching by workspace name.
const WORKSPACE_SECTIONS: {
  label: string;
  icon: React.ElementType;
  href: (slug: string) => string;
  requiresProduct?: boolean;
}[] = [
  { label: 'Home', icon: IconHome, href: (s) => `/w/${s}/home` },
  { label: 'Goals', icon: IconTarget, href: (s) => `/w/${s}/goals` },
  { label: 'Projects', icon: IconStack2, href: (s) => `/w/${s}/projects` },
  { label: 'Products', icon: IconLayoutGrid, href: (s) => `/w/${s}/products`, requiresProduct: true },
  { label: 'Agent', icon: IconRobot, href: (s) => `/w/${s}/agent` },
  { label: 'Knowledge', icon: IconBook2, href: (s) => `/w/${s}/knowledge-base` },
  { label: 'Meetings', icon: IconCalendarEvent, href: (s) => `/w/${s}/meetings` },
  { label: 'CRM', icon: IconUsers, href: (s) => `/w/${s}/crm` },
  { label: 'Calendar', icon: IconCalendar, href: () => `/calendar` },
];

// How each entity type from search.global is presented, in the order the
// sections appear. Two of the router's types are deliberately absent:
// `workspace`, because a matching workspace already surfaces below with all of
// its sub-pages, and `epic`, which has no detail route to navigate to.
const RESULT_SECTIONS: { type: SearchType; label: string; icon: React.ElementType }[] = [
  { type: 'project', label: 'Projects', icon: IconStack2 },
  { type: 'action', label: 'Tasks', icon: IconSquareRoundedCheck },
  { type: 'ticket', label: 'Tickets', icon: IconTicket },
  { type: 'goal', label: 'Goals', icon: IconTarget },
  { type: 'keyResult', label: 'Key results', icon: IconTrophy },
  { type: 'outcome', label: 'Outcomes', icon: IconFlag },
  { type: 'feature', label: 'Features', icon: IconBulb },
  { type: 'product', label: 'Products', icon: IconLayoutGrid },
  { type: 'page', label: 'Pages', icon: IconBook2 },
  { type: 'meeting', label: 'Meetings', icon: IconCalendarEvent },
  { type: 'contact', label: 'Contacts', icon: IconUser },
  { type: 'organization', label: 'Organizations', icon: IconBuilding },
];

// Which entity types each filter chip keeps. `all` keeps everything.
const MODE_TYPES: Record<Exclude<Mode, 'ai'>, SearchType[] | null> = {
  all: null,
  tasks: ['action', 'ticket'],
  projects: ['project', 'product'],
  goals: ['goal', 'keyResult', 'outcome'],
};

// Each search fans out to one `contains` query per entity type, and none of
// those columns are trigram-indexed, so a query that matches nothing scans
// every table. One character matches almost everything and tells you almost
// nothing, so it isn't worth the round trip — navigation still filters from
// the first keystroke.
const MIN_SEARCH_LENGTH = 2;

const SUGGESTED = [
  { icon: IconFlag, label: 'Run weekly plan', sub: 'Keystone ritual · 45 min' },
  { icon: IconTarget, label: 'Review Q2 OKR progress', sub: 'Summary from Zoe' },
  { icon: IconPlus, label: 'Create project', sub: 'Start from template' },
  { icon: IconCalendar, label: 'Plan my day', sub: 'Ask Zoe' },
] as const;

type PaletteRow = {
  key: string;
  label: string;
  sub: string;
  icon: React.ElementType;
  href: string;
  /** Navigation rows are tinted; entity results stay muted. */
  accent: boolean;
  /** Position in the flat result list, for keyboard highlighting. */
  index: number;
};

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { workspaceId, workspaceSlug } = useWorkspace();
  const { openModal } = useAgentModal();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useHotkeys([['mod+k', open]]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setMode('all');
      setHighlightedIndex(null);
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const trimmedQuery = query.trim();
  const q = trimmedQuery.toLowerCase();
  const [debouncedQuery] = useDebouncedValue(trimmedQuery, 180);

  // One server-side search covering every entity type the app knows about,
  // scoped to the workspace you are in, each block carrying the same access
  // rules as that entity's own list endpoint.
  const { data: searchData, isFetching: searchFetching } = api.search.global.useQuery(
    { query: debouncedQuery, workspaceId: workspaceId ?? undefined, limit: 5 },
    {
      enabled: isOpen && mode !== 'ai' && debouncedQuery.length >= MIN_SEARCH_LENGTH,
      // Keep the previous matches on screen while the next query is in flight,
      // instead of blanking the list on every keystroke.
      placeholderData: (previous) => previous,
      staleTime: 30_000,
    },
  );

  // All workspaces the user can navigate to (for workspace-name search).
  const { data: workspacesData } = api.workspace.list.useQuery(undefined, {
    enabled: isOpen,
  });

  // Per-workspace enabled plugins, so the "Products" section only appears
  // for workspaces where the product plugin is activated.
  const pluginResults = api.useQueries((t) =>
    (workspacesData ?? []).map((w) =>
      t.pluginConfig.getEnabled(
        { workspaceId: w.id },
        { enabled: isOpen && q.length > 0, staleTime: 5 * 60 * 1000 },
      ),
    ),
  );

  const productEnabledByWorkspaceId = useMemo(() => {
    const map = new Map<string, boolean>();
    (workspacesData ?? []).forEach((w, idx) => {
      const enabled = pluginResults[idx]?.data;
      map.set(w.id, Array.isArray(enabled) && enabled.includes('product'));
    });
    return map;
  }, [workspacesData, pluginResults]);

  // Workspace sections split by where they belong in the list: the workspace
  // you are in sits with the other navigation at the top, every other
  // workspace goes below the results as somewhere to switch to.
  const { currentWorkspaceNav, otherWorkspaceNav } = useMemo(() => {
    const current: { label: string; href: string; icon: React.ElementType }[] = [];
    const other: { label: string; href: string; icon: React.ElementType }[] = [];
    if (!q) return { currentWorkspaceNav: current, otherWorkspaceNav: other };

    for (const w of workspacesData ?? []) {
      const productEnabled = productEnabledByWorkspaceId.get(w.id) ?? false;
      const workspaceMatches = w.name.toLowerCase().includes(q);
      const isCurrent = w.id === workspaceId;
      for (const section of WORKSPACE_SECTIONS) {
        if (section.requiresProduct && !productEnabled) continue;
        if (isCurrent) {
          // Inside your own workspace you navigate by section name. Matching
          // its name too would list all nine sections above the results you
          // actually searched for — and you are already in it.
          if (PAGE_LABELS.has(section.label.toLowerCase())) continue;
          if (!section.label.toLowerCase().includes(q)) continue;
          current.push({ label: section.label, href: section.href(w.slug), icon: section.icon });
        } else {
          // Other workspaces are reached by name: "syntrofi" lists that
          // workspace's sections. Matching on section name here turned a
          // search for "projects" into one row per workspace you belong to.
          if (!workspaceMatches) continue;
          other.push({
            label: `${w.name} - ${section.label}`,
            href: section.href(w.slug),
            icon: section.icon,
          });
        }
      }
    }
    return { currentWorkspaceNav: current, otherWorkspaceNav: other.slice(0, 10) };
  }, [q, workspacesData, productEnabledByWorkspaceId, workspaceId]);

  const filteredPages = useMemo(
    () => (workspaceSlug ? PAGES.filter((p) => !q || p.label.toLowerCase().includes(q)) : []),
    [workspaceSlug, q],
  );

  // Results carry the query they were fetched for. While the next search is in
  // flight we keep the previous ones only if the typed query extends them —
  // narrowing "fix" to "fixt" holds its results, starting a new word drops
  // them rather than showing matches for something you are no longer typing.
  const shownResults = useMemo(() => {
    if (!searchData) return [];
    return trimmedQuery.toLowerCase().startsWith(searchData.query.toLowerCase())
      ? searchData.results
      : [];
  }, [searchData, trimmedQuery]);

  const resultsByType = useMemo(() => {
    const allowed = mode === 'ai' ? null : MODE_TYPES[mode];
    const byType = new Map<SearchType, SearchResult[]>();
    for (const result of shownResults) {
      // Every row in the palette navigates somewhere; entities without a
      // detail route are dropped rather than rendered as dead ends.
      if (!result.url) continue;
      if (allowed && !allowed.includes(result.type)) continue;
      const bucket = byType.get(result.type);
      if (bucket) bucket.push(result);
      else byType.set(result.type, [result]);
    }
    return byType;
  }, [shownResults, mode]);

  // Sections in render order, each row carrying its position in the flat list
  // so keyboard highlighting and rendering cannot drift apart.
  const resultSections = useMemo(() => {
    const sections: { key: string; heading: string; rows: PaletteRow[] }[] = [];
    let index = 0;
    const row = (r: Omit<PaletteRow, 'index'>): PaletteRow => ({ ...r, index: index++ });

    const navRows: PaletteRow[] = [
      ...filteredPages.map((p) =>
        row({
          key: `page-${p.path}`,
          label: p.label,
          sub: 'Navigate',
          icon: p.icon,
          href: `/w/${workspaceSlug}/${p.path}`,
          accent: true,
        }),
      ),
      ...currentWorkspaceNav.map((w, i) =>
        row({
          key: `workspace-nav-${i}`,
          label: w.label,
          sub: 'Navigate',
          icon: w.icon,
          href: w.href,
          accent: true,
        }),
      ),
    ];
    if (navRows.length > 0) {
      sections.push({ key: 'navigate', heading: 'Navigate', rows: navRows });
    }

    for (const section of RESULT_SECTIONS) {
      const items = resultsByType.get(section.type) ?? [];
      if (items.length === 0) continue;
      sections.push({
        key: section.type,
        heading: section.label,
        rows: items.map((item) =>
          row({
            key: `${section.type}-${item.id}`,
            label: item.title,
            // On routes with no workspace context (/calendar, a recording)
            // the search spans workspaces, so name the one each result lives
            // in — otherwise two same-named meetings are indistinguishable.
            sub:
              item.workspace && item.workspace.id !== workspaceId
                ? item.workspace.name
                : item.subtitle ?? section.label,
            icon: section.icon,
            href: item.url ?? '',
            accent: false,
          }),
        ),
      });
    }

    // Other workspaces go last: matching one by name lists all of its
    // sections, which would otherwise bury the results you searched for.
    if (otherWorkspaceNav.length > 0) {
      sections.push({
        key: 'other-workspaces',
        heading: 'Other workspaces',
        rows: otherWorkspaceNav.map((w, i) =>
          row({
            key: `other-workspace-${i}`,
            label: w.label,
            sub: 'Workspace',
            icon: w.icon,
            href: w.href,
            accent: true,
          }),
        ),
      });
    }

    return sections;
  }, [filteredPages, currentWorkspaceNav, otherWorkspaceNav, resultsByType, workspaceSlug, workspaceId]);

  const allResults = useMemo(
    () => resultSections.flatMap((section) => section.rows),
    [resultSections],
  );

  // True from the first keystroke until results for that exact query land, so
  // a slow search never flashes "No matches".
  const isSearching = q.length > 0 && (debouncedQuery !== trimmedQuery || searchFetching);

  const showSkeleton = isSearching && allResults.length === 0;
  const showNoResults =
    q.length >= MIN_SEARCH_LENGTH && !isSearching && allResults.length === 0;

  const navigate = useCallback(
    (path: string) => {
      close();
      router.push(path);
    },
    [close, router],
  );

  const handleAskZoe = useCallback(() => {
    close();
    openModal();
  }, [close, openModal]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => (i === null ? 0 : Math.min(i + 1, allResults.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i === null ? allResults.length - 1 : Math.max(i - 1, 0),
        );
      } else if (e.key === 'Enter') {
        if (highlightedIndex !== null && allResults[highlightedIndex]) {
          navigate(allResults[highlightedIndex].href);
        } else if (q.length > 0) {
          handleAskZoe();
        }
      }
    },
    [highlightedIndex, allResults, q, close, navigate, handleAskZoe],
  );

  // Switching filter chips rebuilds the list, so a held index would point at
  // an unrelated row.
  useEffect(() => {
    setHighlightedIndex(null);
  }, [query, mode]);

  // The results area scrolls, and twelve sections overflow it easily — without
  // this, arrowing past the fold moves the selection somewhere you can't see
  // and Enter navigates to a row you never read.
  useEffect(() => {
    if (highlightedIndex === null) return;
    listRef.current
      ?.querySelector(`[data-palette-index="${highlightedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  const renderRow = (row: PaletteRow) => {
    const Icon = row.icon;
    return (
      <UnstyledButton
        key={row.key}
        className={styles.resultRow}
        data-palette-index={row.index}
        data-highlighted={highlightedIndex === row.index ? 'true' : 'false'}
        onClick={() => navigate(row.href)}
      >
        <Icon
          size={14}
          stroke={1.75}
          style={{
            color: row.accent ? 'var(--brand-400)' : 'var(--color-text-muted)',
            flexShrink: 0,
          }}
        />
        <Text
          size="sm"
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--color-text-primary)',
          }}
        >
          {row.label}
        </Text>
        <Text size="xs" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {row.sub}
        </Text>
      </UnstyledButton>
    );
  };

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      centered
      size={680}
      radius="lg"
      padding={0}
      withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.6, blur: 6 }}
      styles={{
        content: {
          backgroundColor: 'var(--color-bg-modal)',
          border: '1px solid var(--color-border-primary)',
          overflow: 'hidden',
        },
        body: { padding: '20px 24px 24px' },
      }}
    >
      <TextInput
        ref={inputRef}
        placeholder="Search, command, or ask Zoe…"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        leftSection={
          <IconSearch size={18} stroke={1.75} style={{ color: 'var(--color-text-muted)' }} />
        }
        rightSection={
          <Group gap={4} wrap="nowrap" pr={6}>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </Group>
        }
        rightSectionWidth={56}
        classNames={{ input: styles.input }}
        styles={{
          input: {
            height: 58,
            borderRadius: 14,
            fontSize: 16,
            paddingLeft: 52,
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-primary)',
            color: 'var(--color-text-primary)',
          },
        }}
      />

      <Group gap={6} mt={12} wrap="wrap">
        {MODES.map(({ id, label, icon: Icon }) => {
          const isActive = mode === id;
          return (
            <UnstyledButton
              key={id}
              onClick={() => {
                setMode(id);
                if (id === 'ai') handleAskZoe();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 20,
                fontSize: 12,
                border: `1px solid ${isActive ? 'var(--brand-500)' : 'var(--color-border-subtle)'}`,
                color: isActive ? 'var(--brand-400)' : 'var(--color-text-secondary)',
                background: isActive ? 'var(--color-brand-subtle)' : 'transparent',
                transition: 'border-color 120ms, color 120ms, background 120ms',
                cursor: 'pointer',
              }}
            >
              <Icon size={12} stroke={1.75} />
              {label}
            </UnstyledButton>
          );
        })}
      </Group>

      <div ref={listRef} style={{ marginTop: 20, maxHeight: '52vh', overflowY: 'auto' }}>
        {showSkeleton ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={36} mb={4} radius="sm" />
          ))
        ) : showNoResults ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Text c="dimmed" size="sm">
              No matches —{' '}
              <Text
                span
                style={{ color: 'var(--brand-400)', cursor: 'pointer' }}
                onClick={handleAskZoe}
              >
                ask Zoe?
              </Text>
            </Text>
          </div>
        ) : q.length === 0 ? (
          <>
            {filteredPages.length > 0 && (
              <>
                <div className={styles.colHeading}>Navigate</div>
                {filteredPages.map((page, i) => {
                  const Icon = page.icon;
                  return (
                    <UnstyledButton
                      key={page.path}
                      className={styles.resultRow}
                      data-highlighted={highlightedIndex === i ? 'true' : 'false'}
                      onClick={() => navigate(`/w/${workspaceSlug}/${page.path}`)}
                    >
                      <Icon
                        size={14}
                        stroke={1.75}
                        style={{ color: 'var(--brand-400)', flexShrink: 0 }}
                      />
                      <Text size="sm" style={{ flex: 1, color: 'var(--color-text-primary)' }}>
                        {page.label}
                      </Text>
                      <IconArrowRight size={12} style={{ color: 'var(--color-text-muted)' }} />
                    </UnstyledButton>
                  );
                })}
              </>
            )}

            <div className={styles.colHeading} style={{ marginTop: filteredPages.length > 0 ? 16 : 0 }}>
              Suggested
            </div>
            {SUGGESTED.map((item) => {
              const Icon = item.icon;
              return (
                <UnstyledButton key={item.label} className={styles.resultRow}>
                  <Icon
                    size={14}
                    stroke={1.75}
                    style={{ color: 'var(--brand-400)', flexShrink: 0 }}
                  />
                  <Text
                    size="sm"
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {item.label}
                  </Text>
                  <Text size="xs" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                    {item.sub}
                  </Text>
                </UnstyledButton>
              );
            })}
          </>
        ) : (
          <>
            {resultSections.map((section, i) => (
              <div key={section.key} style={{ marginTop: i === 0 ? 0 : 14 }}>
                <div className={styles.colHeading}>{section.heading}</div>
                {section.rows.map(renderRow)}
              </div>
            ))}
            {/* Below the minimum the search hasn't run, so say so rather than
                leaving an empty panel that reads as "nothing found". */}
            {q.length < MIN_SEARCH_LENGTH && (
              <Text
                size="xs"
                style={{
                  color: 'var(--color-text-muted)',
                  padding: resultSections.length > 0 ? '14px 0 0' : '24px 0',
                  textAlign: resultSections.length > 0 ? 'left' : 'center',
                }}
              >
                Keep typing to search…
              </Text>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useHotkeys } from '@mantine/hooks';
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
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { stripHtml } from '~/lib/utils';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { useAgentModal } from '~/providers/AgentModalProvider';
import styles from '../home/WorkspaceHomeConceptD.module.css';

type Mode = 'all' | 'projects' | 'tasks' | 'goals' | 'ai';

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

const SUGGESTED = [
  { icon: IconFlag, label: 'Run weekly plan', sub: 'Keystone ritual · 45 min' },
  { icon: IconTarget, label: 'Review Q2 OKR progress', sub: 'Summary from Zoe' },
  { icon: IconPlus, label: 'Create project', sub: 'Start from template' },
  { icon: IconCalendar, label: 'Plan my day', sub: 'Ask Zoe' },
] as const;

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const showProjects = mode === 'all' || mode === 'projects';
  const showTasks = mode === 'all' || mode === 'tasks';
  const showGoals = mode === 'all' || mode === 'goals';

  const { data: projectsData, isLoading: projectsLoading } = api.project.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId && isOpen && showProjects },
  );

  const { data: actionsData, isLoading: actionsLoading } = api.action.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId && isOpen && showTasks },
  );

  const { data: goalsData, isLoading: goalsLoading } = api.goal.getAllMyGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId && isOpen && showGoals },
  );

  const q = query.toLowerCase();

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

  const filteredWorkspaceNav = useMemo(() => {
    if (!q) return [];
    const results: { label: string; href: string; icon: React.ElementType }[] = [];
    for (const w of workspacesData ?? []) {
      const productEnabled = productEnabledByWorkspaceId.get(w.id) ?? false;
      for (const section of WORKSPACE_SECTIONS) {
        if (section.requiresProduct && !productEnabled) continue;
        const label = `${w.name} - ${section.label}`;
        if (!label.toLowerCase().includes(q)) continue;
        results.push({ label, href: section.href(w.slug), icon: section.icon });
      }
    }
    return results.slice(0, 12);
  }, [q, workspacesData, productEnabledByWorkspaceId]);

  const filteredProjects = useMemo(
    () =>
      showProjects
        ? (projectsData ?? []).filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 4)
        : [],
    [showProjects, projectsData, q],
  );

  const filteredActions = useMemo(
    () =>
      showTasks
        ? (actionsData ?? [])
            .filter((a) => q && stripHtml(a.name).toLowerCase().includes(q))
            .slice(0, 4)
        : [],
    [showTasks, actionsData, q],
  );

  const filteredGoals = useMemo(
    () =>
      showGoals
        ? (goalsData ?? []).filter((g) => q && g.title.toLowerCase().includes(q)).slice(0, 3)
        : [],
    [showGoals, goalsData, q],
  );

  const filteredPages = useMemo(
    () => (workspaceSlug ? PAGES.filter((p) => !q || p.label.toLowerCase().includes(q)) : []),
    [workspaceSlug, q],
  );

  const allResults = useMemo(
    () => [
      ...filteredPages.map((p) => ({
        type: 'page' as const,
        label: p.label,
        sub: 'Navigate',
        icon: p.icon,
        href: `/w/${workspaceSlug}/${p.path}`,
      })),
      ...filteredWorkspaceNav.map((w) => ({
        type: 'workspace-nav' as const,
        label: w.label,
        sub: 'Workspace',
        icon: w.icon,
        href: w.href,
      })),
      ...filteredProjects.map((p) => ({
        type: 'project' as const,
        label: p.name,
        sub: p.progress > 0 ? `${Math.round(p.progress)}% done` : 'Project',
        icon: IconStack2,
        href: `/w/${workspaceSlug}/projects/${p.slug}`,
      })),
      ...filteredActions.map((a) => ({
        type: 'task' as const,
        label: stripHtml(a.name),
        sub: 'Task',
        icon: IconSquareRoundedCheck,
        href: `/w/${workspaceSlug}/projects-tasks`,
      })),
      ...filteredGoals.map((g) => ({
        type: 'goal' as const,
        label: g.title,
        sub: 'Goal',
        icon: IconTarget,
        href: `/w/${workspaceSlug}/goals/${g.id}`,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredPages, filteredWorkspaceNav, filteredProjects, filteredActions, filteredGoals, workspaceSlug],
  );

  const showNoResults =
    q.length > 0 &&
    filteredProjects.length === 0 &&
    filteredActions.length === 0 &&
    filteredGoals.length === 0 &&
    filteredWorkspaceNav.length === 0 &&
    filteredPages.length === 0;

  const isLoading = (showProjects && projectsLoading) || (showTasks && actionsLoading) || (showGoals && goalsLoading);

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

  useEffect(() => {
    setHighlightedIndex(null);
  }, [query]);

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

      <div style={{ marginTop: 20 }}>
        {isLoading ? (
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
          allResults.map((result, i) => {
            const Icon = result.icon;
            return (
              <UnstyledButton
                key={`${result.type}-${i}`}
                className={styles.resultRow}
                data-highlighted={highlightedIndex === i ? 'true' : 'false'}
                onClick={() => navigate(result.href)}
              >
                <Icon
                  size={14}
                  stroke={1.75}
                  style={{
                    color:
                      result.type === 'page' || result.type === 'workspace-nav'
                        ? 'var(--brand-400)'
                        : 'var(--color-text-muted)',
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
                  {result.label}
                </Text>
                <Text size="xs" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {result.sub}
                </Text>
              </UnstyledButton>
            );
          })
        )}
      </div>
    </Modal>
  );
}

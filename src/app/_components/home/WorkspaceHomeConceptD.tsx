'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Container,
  Text,
  Title,
  TextInput,
  Group,
  Kbd,
  SimpleGrid,
  UnstyledButton,
  Skeleton,
} from '@mantine/core';
import {
  IconSearch,
  IconSparkles,
  IconSquareRoundedCheck,
  IconStack2,
  IconBook,
  IconUsers,
  IconMessageCircle,
  IconFlag,
  IconTarget,
  IconPlus,
  IconCalendar,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import styles from './WorkspaceHomeConceptD.module.css';

type Mode = 'all' | 'tasks' | 'projects' | 'docs' | 'people' | 'ai';

const MODES: { id: Mode; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All', icon: IconSparkles },
  { id: 'tasks', label: 'Tasks', icon: IconSquareRoundedCheck },
  { id: 'projects', label: 'Projects', icon: IconStack2 },
  { id: 'docs', label: 'Docs', icon: IconBook },
  { id: 'people', label: 'People', icon: IconUsers },
  { id: 'ai', label: 'Ask Zoe', icon: IconMessageCircle },
];

type SuggestedItem = {
  icon: React.ElementType;
  label: string;
  sub: string;
  href: string | null;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function WorkspaceHomeConceptD() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { data: session } = useSession();
  const { workspace, workspaceId, workspaceSlug } = useWorkspace();

  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';
  const today = formatDate(new Date());
  const eyebrow = workspace?.name ? `${workspace.name} · ${today}` : today;

  const { data: projectsData, isLoading: projectsLoading } = api.project.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  const filteredProjects = (projectsData ?? [])
    .filter((p) =>
      query.length === 0 || p.name.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 4);

  const suggested: SuggestedItem[] = [
    {
      icon: IconFlag,
      label: 'Plan your week',
      sub: 'Keystone ritual · 45 min',
      href: workspaceSlug ? `/w/${workspaceSlug}/weekly-plan` : null,
    },
    { icon: IconTarget, label: 'Review Q2 OKR progress', sub: 'Summary from Zoe', href: null },
    { icon: IconPlus, label: 'Create project', sub: 'Start from template', href: null },
    { icon: IconCalendar, label: 'Plan my day', sub: 'Ask Zoe', href: null },
  ];

  const totalRows = filteredProjects.length + suggested.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        inputRef.current?.blur();
        setHighlightedIndex(null);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => (i === null ? 0 : Math.min(i + 1, totalRows - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => (i === null ? totalRows - 1 : Math.max(i - 1, 0)));
      } else if (e.key === 'Enter') {
        if (highlightedIndex !== null && highlightedIndex < filteredProjects.length) {
          const project = filteredProjects[highlightedIndex];
          if (project) {
            router.push(`/w/${workspaceSlug}/projects/${project.slug}`);
          }
        }
      }
    },
    [highlightedIndex, filteredProjects, totalRows, router, workspaceSlug],
  );

  useEffect(() => {
    setHighlightedIndex(null);
  }, [query]);

  const hasResults = filteredProjects.length > 0 || suggested.length > 0;
  const showNoResults = query.length > 0 && filteredProjects.length === 0;

  return (
    <div className={styles.stage}>
      <Text
        size="xs"
        tt="uppercase"
        style={{
          letterSpacing: '0.04em',
          color: 'var(--color-text-muted)',
          marginBottom: 20,
        }}
      >
        {eyebrow}
      </Text>

      <Title
        order={1}
        ta="center"
        style={{
          fontSize: 38,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          marginBottom: 28,
          color: 'var(--color-text-primary)',
        }}
      >
        What do you need,{' '}
        <span style={{ color: 'var(--brand-400)' }}>{firstName}?</span>
      </Title>

      <div className={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          placeholder="Search, command, or ask Zoe…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          leftSection={
            <IconSearch
              size={18}
              stroke={1.75}
              style={{ color: 'var(--color-text-muted)' }}
            />
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
      </div>

      <Group gap={6} mt={16} justify="center" wrap="wrap">
        {MODES.map(({ id, label, icon: Icon }) => {
          const isActive = mode === id;
          return (
            <UnstyledButton
              key={id}
              onClick={() => setMode(id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
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

      <Container size={860} w="100%" mt={56} px={0}>
        {showNoResults ? (
          <Text ta="center" c="dimmed" size="sm">
            No matches —{' '}
            <Text
              span
              style={{ color: 'var(--brand-400)', cursor: 'pointer' }}
              onClick={() => setMode('ai')}
            >
              ask Zoe?
            </Text>
          </Text>
        ) : (
          hasResults && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={32}>
              <div>
                <div className={styles.colHeading}>Recent</div>
                {projectsLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} height={36} mb={4} radius="sm" />
                    ))
                  : filteredProjects.map((project, i) => (
                      <UnstyledButton
                        key={project.id}
                        component={Link}
                        href={`/w/${workspaceSlug}/projects/${project.slug}`}
                        className={styles.resultRow}
                        data-highlighted={highlightedIndex === i ? 'true' : 'false'}
                      >
                        <IconStack2
                          size={14}
                          stroke={1.75}
                          style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
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
                          {project.name}
                        </Text>
                        <Text
                          size="xs"
                          style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
                        >
                          {project.progress > 0
                            ? `${Math.round(project.progress)}% complete`
                            : 'Project'}
                        </Text>
                      </UnstyledButton>
                    ))}
              </div>

              <div>
                <div className={styles.colHeading}>Suggested</div>
                {suggested.map((item, i) => {
                  const Icon = item.icon;
                  const highlightIdx = filteredProjects.length + i;
                  const isHighlighted = highlightedIndex === highlightIdx ? 'true' : 'false';
                  const content = (
                    <>
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
                      <Text
                        size="xs"
                        style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
                      >
                        {item.sub}
                      </Text>
                    </>
                  );
                  return item.href ? (
                    <UnstyledButton
                      key={item.label}
                      component={Link}
                      href={item.href}
                      className={styles.resultRow}
                      data-highlighted={isHighlighted}
                    >
                      {content}
                    </UnstyledButton>
                  ) : (
                    <UnstyledButton
                      key={item.label}
                      className={styles.resultRow}
                      data-highlighted={isHighlighted}
                    >
                      {content}
                    </UnstyledButton>
                  );
                })}
              </div>
            </SimpleGrid>
          )
        )}
      </Container>
    </div>
  );
}

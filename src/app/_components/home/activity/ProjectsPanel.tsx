'use client';

import { ActionIcon, Skeleton, TextInput } from '@mantine/core';
import {
  IconArchive,
  IconFilter,
  IconFolder,
  IconSearch,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

interface ProjectLike {
  id: string;
  name: string;
  slug: string;
  status: string;
  isPublic: boolean;
}

type StatusFilter = 'all' | 'active' | 'paused' | 'archived';

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'archived', label: 'Archived' },
];

function matchesStatusFilter(status: string, filter: StatusFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return status === 'ACTIVE';
    case 'paused':
      return status === 'ON_HOLD';
    case 'archived':
      return status === 'COMPLETED' || status === 'CANCELLED';
  }
}

type Tab = 'workspace' | 'organization';

/**
 * Projects rail panel. Lists every project in the workspace with live
 * substring filtering on `name` and status segment chips. The "Organization"
 * tab is stubbed for this slice — clicking it doesn't change data, just the
 * visual tab indicator.
 */
export function ProjectsPanel() {
  const { workspaceId, workspaceSlug } = useWorkspace();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tab, setTab] = useState<Tab>('workspace');

  const { data, isLoading } = api.project.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  const projects = useMemo<ProjectLike[]>(() => {
    if (!data) return [];
    return data as ProjectLike[];
  }, [data]);

  const counts = useMemo(() => {
    const byStatus: Record<StatusFilter, number> = {
      all: projects.length,
      active: 0,
      paused: 0,
      archived: 0,
    };
    for (const project of projects) {
      if (matchesStatusFilter(project.status, 'active')) byStatus.active += 1;
      if (matchesStatusFilter(project.status, 'paused')) byStatus.paused += 1;
      if (matchesStatusFilter(project.status, 'archived')) byStatus.archived += 1;
    }
    return byStatus;
  }, [projects]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (!matchesStatusFilter(project.status, statusFilter)) return false;
      if (!needle) return true;
      return project.name.toLowerCase().includes(needle);
    });
  }, [projects, query, statusFilter]);

  return (
    <section className="wsa-card">
      <div className="wsa-card__head" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
          {(['workspace', 'organization'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              style={{
                background: 'transparent',
                border: 0,
                padding: '0 0 4px',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                color:
                  tab === value
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-muted)',
                borderBottom:
                  tab === value
                    ? '2px solid var(--color-brand-primary)'
                    : '2px solid transparent',
              }}
            >
              {value === 'workspace' ? 'Workspace' : 'Organization'}
            </button>
          ))}
        </div>
        <span className="wsa-card__count">{filtered.length}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TextInput
          size="xs"
          placeholder="Search projects"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          leftSection={<IconSearch size={14} stroke={1.8} />}
          style={{ flex: 1 }}
        />
        <ActionIcon
          variant="default"
          size="md"
          aria-label="Filter"
          disabled
        >
          <IconFilter size={14} stroke={1.8} />
        </ActionIcon>
      </div>

      <div className="wsa-projects__seg">
        {STATUS_FILTERS.map((option) => (
          <button
            type="button"
            key={option.key}
            className="wsa-projects__seg-btn"
            data-active={statusFilter === option.key}
            onClick={() => setStatusFilter(option.key)}
          >
            {option.label}
            <span className="wsa-projects__seg-count">{counts[option.key]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={32} mt={i === 0 ? 0 : 6} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="wsa-card__caption" style={{ marginTop: 10 }}>
          {query.trim()
            ? `No projects match "${query.trim()}".`
            : 'No projects in this view yet.'}
        </p>
      ) : (
        <div>
          {filtered.map((project) => {
            const FolderIcon = project.isPublic ? IconFolder : IconArchive;
            return (
              <div key={project.id} className="wsa-projects__row">
                <FolderIcon
                  size={14}
                  stroke={1.8}
                  style={{ color: 'var(--color-text-muted)' }}
                />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <em>{workspaceSlug ?? 'workspace'}/</em>
                  {project.slug}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

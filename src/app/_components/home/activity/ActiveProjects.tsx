'use client';

import { Skeleton } from '@mantine/core';
import { IconLayoutGrid } from '@tabler/icons-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

interface ProjectLike {
  id: string;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  actions?: Array<unknown>;
}

function truncate(text: string, limit = 64): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function ProgressRing({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(100, progress));
  const style: React.CSSProperties = {
    background: `conic-gradient(var(--color-brand-primary) ${clamped}%, var(--color-surface-muted) ${clamped}% 100%)`,
  };
  return <span className="wsa-active__ring" style={style} aria-hidden="true" />;
}

/**
 * Active-projects rail. Real data from `project.getAll`, filtered to
 * `status === 'ACTIVE'`. Renders up to 5 rows with a progress ring, name,
 * truncated description, and a count chip.
 */
export function ActiveProjects() {
  const { workspaceId, workspaceSlug } = useWorkspace();

  const { data, isLoading } = api.project.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  const projects = useMemo<ProjectLike[]>(() => {
    if (!data) return [];
    return (data as ProjectLike[])
      .filter((project) => project.status === 'ACTIVE')
      .slice(0, 5);
  }, [data]);

  const projectsHref = workspaceSlug ? `/w/${workspaceSlug}/projects` : '#';

  return (
    <section className="wsa-card">
      <div className="wsa-card__head">
        <h2 className="wsa-card__title">
          <IconLayoutGrid size={14} stroke={1.8} />
          Active projects
          <span className="wsa-card__count">{projects.length}</span>
        </h2>
        <Link
          href={projectsHref}
          style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
        >
          All projects
        </Link>
      </div>

      {isLoading ? (
        <div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={42} mt={i === 0 ? 0 : 8} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <p className="wsa-card__caption">No active projects yet.</p>
      ) : (
        projects.map((project) => {
          const actionCount = Array.isArray(project.actions)
            ? project.actions.length
            : null;
          const sub = project.description
            ? `Next: ${truncate(project.description)}`
            : 'No next action set';
          return (
            <div key={project.id} className="wsa-active__row">
              <ProgressRing progress={project.progress ?? 0} />
              <div style={{ minWidth: 0 }}>
                <span className="wsa-active__name">{project.name}</span>
                <span className="wsa-active__sub">{sub}</span>
              </div>
              <div className="wsa-active__meta">
                <span className="wsa-active__chip">
                  {actionCount ?? '—'}
                </span>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

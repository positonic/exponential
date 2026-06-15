'use client';

import { Skeleton } from '@mantine/core';
import { IconBrandGithub } from '@tabler/icons-react';
import Link from 'next/link';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

/**
 * Activity-rail panel listing the repos this workspace tracks (ADR-0020).
 * Styled as a `wsa-card` to sit alongside the projects panel in the right rail.
 * Self-hides when nothing is tracked (the Connect CTA covers that case).
 */
export function GithubReposPanel() {
  const { workspaceId } = useWorkspace();

  const { data, isLoading } = api.github.getGithubConnectionState.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const repos = data?.repos ?? [];
  if (!isLoading && repos.length === 0) return null;

  return (
    <section className="wsa-card">
      <div className="wsa-card__head" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <IconBrandGithub
            size={16}
            stroke={1.8}
            style={{ color: 'var(--color-text-muted)' }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-text-primary)',
            }}
          >
            GitHub Repositories
          </span>
        </div>
        <span className="wsa-card__count">{repos.length}</span>
      </div>

      {isLoading ? (
        <div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={28} mt={i === 0 ? 0 : 6} />
          ))}
        </div>
      ) : (
        <div>
          {repos.map((repo) => (
            <div key={repo.id} className="wsa-projects__row">
              <IconBrandGithub
                size={14}
                stroke={1.8}
                style={{ color: 'var(--color-text-muted)' }}
              />
              <span
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <em>{repo.owner}/</em>
                {repo.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/settings/integrations"
        className="wsa-card__caption"
        style={{ marginTop: 10, display: 'inline-block' }}
      >
        Manage repositories
      </Link>
    </section>
  );
}

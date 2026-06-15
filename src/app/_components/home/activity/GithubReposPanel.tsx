'use client';

import { Button, Skeleton, TextInput } from '@mantine/core';
import { IconBrandGithub, IconSearch } from '@tabler/icons-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

/**
 * GitHub repositories rail widget (ADR-0020). Replaces the redundant projects
 * panel in the activity-home rail (Active Projects above already lists
 * projects). One `wsa-card` that adapts to connection state:
 *  - tracks ≥1 repo → searchable list of repos (with a Manage link)
 *  - not connected yet (owner/admin) → a compact Connect prompt
 *  - otherwise (members, or not configured) → hidden
 */
export function GithubReposPanel() {
  const { workspaceId, userRole } = useWorkspace();
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
  const [query, setQuery] = useState('');

  const { data, isLoading } = api.github.getGithubConnectionState.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const repos = useMemo(() => data?.repos ?? [], [data?.repos]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return repos;
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(needle));
  }, [repos, query]);

  if (isLoading) {
    return (
      <section className="wsa-card">
        <Skeleton height={18} width={150} />
        <Skeleton height={30} mt={10} />
        <Skeleton height={24} mt={8} />
      </section>
    );
  }
  if (!data) return null;

  const showConnectPrompt =
    repos.length === 0 &&
    isOwnerOrAdmin &&
    (data.state === 'NOT_INSTALLED' || data.state === 'NO_REPOS');

  // Nothing tracked and no actionable prompt → hide entirely.
  if (repos.length === 0 && !showConnectPrompt) return null;

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
        {repos.length > 0 ? (
          <span className="wsa-card__count">{filtered.length}</span>
        ) : null}
      </div>

      {showConnectPrompt ? (
        <>
          <p
            className="wsa-card__caption"
            style={{ marginTop: 0, marginBottom: 10 }}
          >
            Link your repositories to bring GitHub activity into this workspace.
          </p>
          <Button
            component={Link}
            href="/settings/integrations"
            variant="filled"
            color="brand"
            size="xs"
            fullWidth
          >
            Connect GitHub
          </Button>
        </>
      ) : (
        <>
          {repos.length > 5 ? (
            <TextInput
              size="xs"
              placeholder="Search repositories"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              leftSection={<IconSearch size={14} stroke={1.8} />}
              mb={8}
            />
          ) : null}

          {filtered.length === 0 ? (
            <p className="wsa-card__caption" style={{ marginTop: 4 }}>
              No repositories match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <div>
              {filtered.map((repo) => (
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
        </>
      )}
    </section>
  );
}

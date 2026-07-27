'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Group,
  Skeleton,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChevronRight,
  IconFileText,
  IconPlus,
  IconSearch,
  IconWorld,
} from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '~/trpc/react';

interface PagesListContentProps {
  workspaceId: string;
  workspaceSlug: string;
}

export function PagesListContent({ workspaceId, workspaceSlug }: PagesListContentProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');

  // The tree carries the nesting (ADR-0039) — pages ordered depth-first with a
  // `depth` for indentation. Search flattens it (matches surface without their
  // ancestors, so indentation would be misleading).
  const { data: pages, isLoading } = api.page.tree.useQuery({ workspaceId });

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

  const query = search.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!pages) return [];
    if (!query) return pages;
    return pages
      .filter((p) => p.title.toLowerCase().includes(query))
      .map((p) => ({ ...p, depth: 0, hasChildren: false }));
  }, [pages, query]);

  return (
    <div className="w-full px-6 py-8">
      <Group justify="space-between" align="center" mb="lg">
        <Group gap="xs" align="center">
          <IconFileText size={22} className="text-text-secondary" />
          <Text size="xl" fw={700} className="text-text-primary">
            Pages
          </Text>
        </Group>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => createPage.mutate({ workspaceId })}
          loading={createPage.isPending}
        >
          New page
        </Button>
      </Group>

      <TextInput
        leftSection={<IconSearch size={14} />}
        placeholder="Search pages…"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        size="sm"
        mb="md"
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[10px] border border-border-primary bg-background-secondary px-6 py-12 text-center">
          <Text className="text-text-secondary">
            {pages && pages.length > 0
              ? 'No pages match your search.'
              : 'No pages yet. Create your first one.'}
          </Text>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((page) => (
            <Link
              key={page.id}
              href={`/w/${workspaceSlug}/pages/${page.id}`}
              className="group flex items-center justify-between gap-4 rounded-[10px] border border-border-primary bg-background-secondary px-[18px] py-3 transition-colors hover:border-border-focus hover:bg-surface-hover"
              style={page.depth > 0 ? { marginLeft: page.depth * 22 } : undefined}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {page.depth > 0 ? (
                  <IconChevronRight
                    size={14}
                    className="shrink-0 text-text-muted"
                    aria-hidden
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Text className="truncate text-[14.5px] font-semibold text-text-primary">
                      {page.title}
                    </Text>
                    {page.isPublic ? (
                      <Tooltip label="Published to the web" withArrow>
                        <IconWorld size={14} className="shrink-0 text-text-muted" />
                      </Tooltip>
                    ) : null}
                  </div>
                  <Text className="text-xs text-text-muted">
                    Updated {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
                  </Text>
                </div>
              </div>
              {page.project ? (
                <Badge variant="light" color="gray" size="sm" className="shrink-0">
                  {page.project.name}
                </Badge>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

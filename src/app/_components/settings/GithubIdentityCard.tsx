'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandGithub } from '@tabler/icons-react';
import { api } from '~/trpc/react';

/** Messages for the `?github_link=` outcome the link flow redirects back with. */
const OUTCOMES: Record<string, { title: string; message: string; color: string }> = {
  linked: {
    title: 'GitHub linked',
    message: 'Your PRs and commits now count toward you on the Metrics page.',
    color: 'green',
  },
  denied: {
    title: 'GitHub not linked',
    message: 'Authorization was cancelled on GitHub.',
    color: 'gray',
  },
  taken: {
    title: 'GitHub not linked',
    message: 'That GitHub account is already linked to another Exponential user.',
    color: 'red',
  },
  invalid_state: {
    title: 'GitHub not linked',
    message: 'The link request expired or did not match. Please try again.',
    color: 'red',
  },
  failed: {
    title: 'GitHub not linked',
    message: 'Something went wrong talking to GitHub. Please try again.',
    color: 'red',
  },
  not_configured: {
    title: 'GitHub linking unavailable',
    message: 'GitHub linking has not been set up on this server yet.',
    color: 'yellow',
  },
};

/**
 * Turns the `?github_link=` outcome into a notification, then strips it from
 * the URL. Its own component so `useSearchParams` sits inside a Suspense
 * boundary — required on statically rendered pages like /settings/profile.
 */
function LinkOutcomeNotifier() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const outcome = searchParams.get('github_link');

  useEffect(() => {
    if (!outcome) return;
    const shown = OUTCOMES[outcome];
    if (shown) notifications.show(shown);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('github_link');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [outcome, searchParams, router, pathname]);

  return null;
}

/**
 * Settings card for the user's GitHub identity claim (CONTEXT.md).
 *
 * "Link GitHub" is a plain navigation to the OAuth start route — the login is
 * whatever GitHub says authorized, never typed in.
 */
export function GithubIdentityCard({ returnPath = '/settings/profile' }: { returnPath?: string }) {
  const utils = api.useUtils();
  const { data, isLoading } = api.githubIdentity.get.useQuery();
  const unlink = api.githubIdentity.unlink.useMutation({
    onSuccess: async () => {
      await utils.githubIdentity.get.invalidate();
      notifications.show({ title: 'GitHub unlinked', message: 'Your GitHub account is no longer linked.', color: 'blue' });
    },
    onError: (error) => {
      notifications.show({ title: 'Error', message: error.message, color: 'red' });
    },
  });

  const linkHref = `/api/auth/github-identity?returnUrl=${encodeURIComponent(returnPath)}`;

  return (
    <Card withBorder radius="md" className="border-border-primary bg-surface-secondary">
      <Suspense fallback={null}>
        <LinkOutcomeNotifier />
      </Suspense>
      <Group justify="space-between" align="center" wrap="nowrap" gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <IconBrandGithub size={22} className="mt-0.5 text-text-secondary" />
          <Stack gap={2}>
            <Text fw={500} className="text-text-primary">
              GitHub account
            </Text>
            {isLoading ? (
              <div className="h-4 w-40 animate-pulse rounded bg-surface-hover" />
            ) : data?.login ? (
              <Text size="sm" className="text-text-secondary">
                Linked as <span className="font-medium text-text-primary">@{data.login}</span>. Your PRs
                and commits count toward you on the Metrics page.
              </Text>
            ) : (
              <Text size="sm" className="text-text-secondary">
                Link your GitHub account so your PRs and commits count toward you on the Metrics page.
              </Text>
            )}
          </Stack>
        </Group>

        {!isLoading &&
          (data?.login ? (
            <Button
              variant="default"
              size="sm"
              loading={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              Unlink
            </Button>
          ) : data?.isConfigured ? (
            <Button
              component="a"
              href={linkHref}
              size="sm"
              leftSection={<IconBrandGithub size={16} />}
            >
              Link GitHub
            </Button>
          ) : (
            <Text size="xs" className="max-w-[180px] text-right text-text-muted">
              GitHub linking isn&apos;t set up on this server yet.
            </Text>
          ))}
      </Group>
    </Card>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronRight, IconRefresh } from '@tabler/icons-react';
import { format } from 'date-fns';
import { api, type RouterOutputs } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { CHANGELOG_MAX_CYCLES } from '~/plugins/product/server/cycleChangelog';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';
import { DraftActions, DraftSections } from './CycleChangelogDraft';

type WorkspaceChangelog = RouterOutputs['product']['cycle']['changelog'];
type ChangelogCycle = WorkspaceChangelog['cycles'][number];
type ChangelogEntry =
  ChangelogCycle['changelog']['sections'][number]['entries'][number];
type ChangelogItem = ChangelogEntry['items'][number];

const PAGE_SIZE = 4;

function sizeLabel(entry: ChangelogEntry): string {
  const parts: string[] = [];
  if (entry.points > 0) parts.push(`${entry.points} pts`);
  if (entry.pullRequestCount > 0) {
    parts.push(
      `${entry.pullRequestCount} ${entry.pullRequestCount === 1 ? 'PR' : 'PRs'}`,
    );
  }
  return parts.join(' · ');
}

function cycleDates(cycle: ChangelogCycle): string {
  const start = new Date(cycle.startDate);
  const end = new Date(cycle.endDate);
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
}

/**
 * `/w/[workspaceSlug]/change-log` — what shipped in each cycle, newest cycle
 * first, laid out as toggles (Features / Fixes / Under the hood / Also this
 * cycle) with each section ordered from the largest piece of work down.
 *
 * Entirely derived from the cycle's finished Tickets and the PRs merged in its
 * dates (see `cycleChangelog.ts`), so it is always current and needs no
 * authoring.
 */
export function CycleChangelogView() {
  const {
    workspace,
    workspaceId,
    userRole,
    isLoading: workspaceLoading,
  } = useWorkspace();
  const utils = api.useUtils();
  const canEdit =
    userRole === 'owner' || userRole === 'admin' || userRole === 'member';
  const [productId, setProductId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, isFetching } =
    api.product.cycle.changelog.useQuery(
      {
        workspaceId: workspaceId!,
        limit,
        ...(productId ? { productId } : {}),
      },
      { enabled: !!workspaceId, placeholderData: (prev) => prev },
    );

  if (workspaceLoading || isLoading || !workspace) {
    return (
      <Center h={240}>
        <Loader size="sm" />
      </Center>
    );
  }

  const products = data?.products ?? [];
  const cycles = data?.cycles ?? [];
  const productSlug = data?.product?.slug ?? null;

  return (
    <Stack gap="lg" p="md" maw={880}>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2} c="var(--color-text-primary)">
            Change log
          </Title>
          <Text size="sm" c="var(--color-text-muted)">
            What shipped in each cycle, largest work first. Built from finished
            tickets and the pull requests merged during the cycle, then written
            up by AI once the cycle ends.
          </Text>
        </div>
        {products.length > 1 ? (
          <Select
            label="Product"
            size="xs"
            w={220}
            value={data?.product?.id ?? null}
            onChange={(value) => {
              setProductId(value);
              setLimit(PAGE_SIZE);
            }}
            data={products.map((p) => ({ value: p.id, label: p.name }))}
            allowDeselect={false}
          />
        ) : null}
      </Group>

      {cycles.length === 0 ? (
        <Alert color="var(--color-text-muted)">
          No cycles have started yet. Once a cycle with dates is underway, what
          ships in it appears here.
        </Alert>
      ) : null}

      <Stack gap="xs">
        {cycles.map((cycle, index) => (
          <CycleToggle
            key={cycle.id}
            cycle={cycle}
            defaultOpen={index === 0}
            canEdit={canEdit}
            onChanged={() => utils.product.cycle.changelog.invalidate()}
            ticketHref={(ticketId) =>
              productSlug
                ? `/w/${workspace.slug}/products/${productSlug}/tickets/${ticketId}`
                : null
            }
          />
        ))}
      </Stack>

      {data?.hasMore && limit < CHANGELOG_MAX_CYCLES ? (
        <Group>
          <Button
            variant="subtle"
            size="xs"
            loading={isFetching}
            onClick={() =>
              setLimit((l) => Math.min(l + PAGE_SIZE, CHANGELOG_MAX_CYCLES))
            }
          >
            Show older cycles
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <IconChevronRight
      size={14}
      className="flex-none text-text-muted transition-transform"
      style={{ transform: open ? 'rotate(90deg)' : undefined }}
      aria-hidden
    />
  );
}

function CycleToggle({
  cycle,
  defaultOpen,
  canEdit,
  onChanged,
  ticketHref,
}: {
  cycle: ChangelogCycle;
  defaultOpen: boolean;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  ticketHref: (ticketId: string) => string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showRaw, setShowRaw] = useState(false);
  const showDraft = !!cycle.draft && !showRaw;
  const { sections, totals } = cycle.changelog;
  const maxSize = Math.max(
    1,
    ...sections.flatMap((s) => s.entries.map((e) => e.size)),
  );

  return (
    <div>
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-hover"
      >
        <Chevron open={open} />
        <Group gap="xs" wrap="wrap" className="min-w-0 flex-1">
          <IconRefresh
            size={16}
            className="text-brand-primary"
            aria-hidden
          />
          {cycle.draft?.version ? (
            <Text fw={600} size="md" c="var(--color-text-primary)">
              {cycle.draft.version}
            </Text>
          ) : null}
          <Text fw={600} size="md" c="var(--color-text-primary)">
            {cycle.name}
          </Text>
          {cycle.draft?.source === 'generated' ? (
            <Badge size="xs" variant="outline" color="var(--color-text-muted)">
              AI draft
            </Badge>
          ) : null}
          {cycle.status === 'ACTIVE' ? (
            <Badge size="xs" variant="light" color="var(--color-brand-primary)">
              In progress
            </Badge>
          ) : null}
          <Text size="xs" c="var(--color-text-muted)">
            {cycleDates(cycle)} · {totals.tickets}{' '}
            {totals.tickets === 1 ? 'ticket' : 'tickets'} ·{' '}
            {totals.pullRequests} merged{' '}
            {totals.pullRequests === 1 ? 'PR' : 'PRs'}
          </Text>
        </Group>
      </UnstyledButton>

      {open ? (
        <div className="pb-4 pl-7">
          {canEdit ? (
            <DraftActions
              cycle={cycle}
              showRaw={showRaw}
              onToggleRaw={() => setShowRaw((r) => !r)}
              onChanged={onChanged}
            />
          ) : null}
          {cycle.cycleGoal ? (
            <div className="mt-2 text-sm text-text-secondary">
              <MarkdownRenderer content={cycle.cycleGoal} variant="compact" />
            </div>
          ) : null}
          {showDraft && cycle.draft ? (
            <DraftSections draft={cycle.draft} ticketHref={ticketHref} />
          ) : null}
          {!showDraft && sections.length === 0 ? (
            <Text size="sm" c="var(--color-text-muted)" mt="sm">
              Nothing has shipped in this cycle yet.
            </Text>
          ) : null}
          {!showDraft && sections.map((section) => (
            <div key={section.key}>
              <Title order={4} mt="lg" mb={6} c="var(--color-text-primary)">
                {section.label}
              </Title>
              {section.entries.map((entry) => (
                <EntryToggle
                  key={entry.key}
                  entry={entry}
                  maxSize={maxSize}
                  ticketHref={ticketHref}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EntryToggle({
  entry,
  maxSize,
  ticketHref,
}: {
  entry: ChangelogEntry;
  maxSize: number;
  ticketHref: (ticketId: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
  // A lone PR is titled by itself, so it links straight out instead of
  // opening a toggle that repeats its title.
  const [onlyItem] = entry.items;
  const lonePullRequest =
    entry.items.length === 1 &&
    onlyItem?.kind === 'pull_request' &&
    onlyItem.title === entry.title
      ? onlyItem
      : null;
  const expandable = entry.items.length > 0 && !lonePullRequest;
  const width = `${Math.max(4, Math.round((entry.size / maxSize) * 100))}%`;

  const row = (
    <>
      {expandable ? (
        <Chevron open={open} />
      ) : (
        <IconChevronRight size={14} className="invisible flex-none" aria-hidden />
      )}
      <Text size="sm" c="var(--color-text-primary)" className="min-w-0 flex-1">
        {lonePullRequest?.url ? (
          <Anchor
            href={lonePullRequest.url}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            c="var(--color-text-primary)"
          >
            {entry.title}
          </Anchor>
        ) : (
          entry.title
        )}
        {lonePullRequest ? (
          <span className="ml-2 text-xs text-text-muted">
            {lonePullRequest.repoName}
            {lonePullRequest.prNumber ? ` #${lonePullRequest.prNumber}` : ''}
          </span>
        ) : null}
      </Text>
      <Text size="xs" c="var(--color-text-muted)" className="flex-none">
        {sizeLabel(entry)}
      </Text>
      <span className="hidden h-1 w-16 flex-none overflow-hidden rounded-full bg-surface-secondary sm:block">
        <span
          className="block h-full rounded-full"
          style={{ width, backgroundColor: 'var(--color-text-faint)' }}
        />
      </span>
    </>
  );

  return (
    <div>
      {/* Plain rows render through the same UnstyledButton (as a div) so both
          kinds share line height and alignment. */}
      <UnstyledButton
        component={expandable ? 'button' : 'div'}
        onClick={expandable ? () => setOpen((o) => !o) : undefined}
        aria-expanded={expandable ? open : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-1 py-1${
          expandable ? ' hover:bg-surface-hover' : ' cursor-default'
        }`}
      >
        {row}
      </UnstyledButton>
      {open ? (
        <ul className="mb-2 ml-8 list-disc space-y-0.5 text-sm text-text-secondary">
          {entry.items.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <ItemLine item={item} ticketHref={ticketHref} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ItemLine({
  item,
  ticketHref,
}: {
  item: ChangelogItem;
  ticketHref: (ticketId: string) => string | null;
}) {
  if (item.kind === 'ticket') {
    const href = ticketHref(item.id);
    const ref = item.shortId ?? `#${item.number}`;
    return (
      <span>
        {href ? (
          <Anchor component={Link} href={href} size="sm" c="var(--color-text-primary)">
            {item.title}
          </Anchor>
        ) : (
          item.title
        )}{' '}
        <span className="text-xs text-text-muted">
          {ref}
          {item.points ? ` · ${item.points} pts` : ''}
        </span>
      </span>
    );
  }
  return (
    <span>
      {item.url ? (
        <Anchor
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
          c="var(--color-text-primary)"
        >
          {item.title}
        </Anchor>
      ) : (
        item.title
      )}{' '}
      <span className="text-xs text-text-muted">
        {item.repoName}
        {item.prNumber ? ` #${item.prNumber}` : ''}
      </span>
    </span>
  );
}

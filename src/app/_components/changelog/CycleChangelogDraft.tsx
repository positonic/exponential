'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconChevronRight, IconTrash } from '@tabler/icons-react';
import Link from 'next/link';
import { api, type RouterOutputs } from '~/trpc/react';
import { MarkdownInput } from '~/app/_components/shared/MarkdownInput';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';

type WorkspaceChangelog = RouterOutputs['product']['cycle']['changelog'];
export type ChangelogCycle = WorkspaceChangelog['cycles'][number];
type CycleDraft = NonNullable<ChangelogCycle['draft']>;
type DraftEntry = CycleDraft['content']['sections'][number]['entries'][number];
type DraftItem = DraftEntry['items'][number];
type SectionKey = CycleDraft['content']['sections'][number]['key'];

export const SECTION_LABELS: Record<SectionKey, string> = {
  features: 'Features',
  fixes: 'Fixes',
  underTheHood: 'Under the hood',
  alsoThisCycle: 'Also this cycle',
};

type DraftRunResult =
  | { outcome: 'drafted' }
  | { outcome: 'skipped_edited' }
  | { outcome: 'skipped_empty' };

async function requestDraft(
  cycleId: string,
  overwriteEdited: boolean,
): Promise<DraftRunResult> {
  const response = await fetch(`/api/cycles/${cycleId}/changelog-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overwriteEdited }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & Partial<DraftRunResult>;
  if (!response.ok) {
    throw new Error(body.error ?? "The draft couldn't be written. Try again.");
  }
  return body as DraftRunResult;
}

function sizeLabel(entry: { points: number; pullRequestCount: number }) {
  const parts: string[] = [];
  if (entry.points > 0) parts.push(`${entry.points} pts`);
  if (entry.pullRequestCount > 0) {
    parts.push(
      `${entry.pullRequestCount} ${entry.pullRequestCount === 1 ? 'PR' : 'PRs'}`,
    );
  }
  return parts.join(' · ');
}

/**
 * The "Draft with AI" / "Regenerate" / "Edit" / "Discard" row for one cycle.
 * Only rendered for members who can edit workspace content.
 */
export function DraftActions({
  cycle,
  showRaw,
  onToggleRaw,
  onChanged,
}: {
  cycle: ChangelogCycle;
  showRaw: boolean;
  onToggleRaw: () => void;
  onChanged: () => Promise<void>;
}) {
  const [isDrafting, setIsDrafting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const deleteDraft = api.product.cycle.deleteChangelogDraft.useMutation({
    onSuccess: onChanged,
  });

  const runDraft = async (overwriteEdited: boolean) => {
    setIsDrafting(true);
    try {
      const result = await requestDraft(cycle.id, overwriteEdited);
      if (result.outcome === 'skipped_edited') {
        modals.openConfirmModal({
          title: 'Replace your edits?',
          children: (
            <Text size="sm">
              This draft has been edited. Writing a new one replaces those
              edits.
            </Text>
          ),
          labels: { confirm: 'Replace', cancel: 'Keep edits' },
          onConfirm: () => void runDraft(true),
        });
        return;
      }
      if (result.outcome === 'skipped_empty') {
        notifications.show({
          message: 'Nothing has shipped in this cycle yet.',
        });
        return;
      }
      await onChanged();
    } catch (error) {
      notifications.show({
        color: 'red',
        message:
          error instanceof Error
            ? error.message
            : "The draft couldn't be written. Try again.",
      });
    } finally {
      setIsDrafting(false);
    }
  };

  const confirmDiscard = () =>
    modals.openConfirmModal({
      title: 'Discard this draft?',
      children: (
        <Text size="sm">
          The cycle goes back to the list of tickets and pull requests. You can
          write a new draft at any time.
        </Text>
      ),
      labels: { confirm: 'Discard', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteDraft.mutate({ cycleId: cycle.id }),
    });

  return (
    <Group gap="xs" mt="xs">
      {cycle.draft ? (
        <>
          <Button size="compact-xs" variant="light" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            loading={isDrafting}
            onClick={() => void runDraft(false)}
          >
            Regenerate
          </Button>
          <Button size="compact-xs" variant="subtle" onClick={onToggleRaw}>
            {showRaw ? 'Show draft' : 'Show tickets and PRs'}
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            loading={deleteDraft.isPending}
            onClick={confirmDiscard}
          >
            Discard
          </Button>
          <EditDraftModal
            cycle={cycle}
            draft={cycle.draft}
            opened={isEditing}
            onClose={() => setIsEditing(false)}
            onSaved={onChanged}
          />
        </>
      ) : (
        <Button
          size="compact-xs"
          variant="light"
          loading={isDrafting}
          onClick={() => void runDraft(false)}
        >
          Draft with AI
        </Button>
      )}
      {isDrafting ? (
        <Text size="xs" c="var(--color-text-muted)">
          Writing the draft, this takes a minute or two…
        </Text>
      ) : null}
    </Group>
  );
}

/** A stored draft, laid out like the raw view: sections of toggles. */
export function DraftSections({
  draft,
  ticketHref,
}: {
  draft: CycleDraft;
  ticketHref: (ticketId: string) => string | null;
}) {
  const maxSize = Math.max(
    1,
    ...draft.content.sections.flatMap((s) =>
      s.entries.map((e) => e.points + e.pullRequestCount),
    ),
  );
  return (
    <>
      {draft.content.sections.map((section) => (
        <div key={section.key}>
          <Title order={4} mt="lg" mb={6} c="var(--color-text-primary)">
            {SECTION_LABELS[section.key]}
          </Title>
          {section.entries.map((entry) => (
            <DraftEntryToggle
              key={entry.key}
              entry={entry}
              maxSize={maxSize}
              ticketHref={ticketHref}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function DraftEntryToggle({
  entry,
  maxSize,
  ticketHref,
}: {
  entry: DraftEntry;
  maxSize: number;
  ticketHref: (ticketId: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const size = entry.points + entry.pullRequestCount;
  const width = `${Math.max(4, Math.round((size / maxSize) * 100))}%`;

  return (
    <div>
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-hover"
      >
        <IconChevronRight
          size={14}
          className="flex-none text-text-muted transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : undefined }}
          aria-hidden
        />
        <Text size="sm" c="var(--color-text-primary)" className="min-w-0 flex-1">
          {entry.title}
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
      </UnstyledButton>
      {open ? (
        <div className="mb-2 ml-8 text-sm text-text-secondary">
          {entry.summary ? (
            <MarkdownRenderer content={entry.summary} variant="compact" />
          ) : null}
          {entry.items.length > 0 ? (
            <Anchor
              component="button"
              type="button"
              size="xs"
              c="var(--color-text-muted)"
              onClick={() => setShowSources((s) => !s)}
            >
              {showSources
                ? 'Hide sources'
                : `${entry.items.length} ${entry.items.length === 1 ? 'source' : 'sources'}`}
            </Anchor>
          ) : null}
          {showSources ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {entry.items.map((item) => (
                <li key={`${item.kind}:${item.id}`}>
                  <SourceLine item={item} ticketHref={ticketHref} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SourceLine({
  item,
  ticketHref,
}: {
  item: DraftItem;
  ticketHref: (ticketId: string) => string | null;
}) {
  if (item.kind === 'ticket') {
    const href = ticketHref(item.id);
    const ref = item.shortId ?? `#${item.number}`;
    return (
      <span>
        {href ? (
          <Anchor component={Link} href={href} size="xs" c="var(--color-text-secondary)">
            {item.title}
          </Anchor>
        ) : (
          item.title
        )}{' '}
        <span className="text-text-muted">{ref}</span>
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
          size="xs"
          c="var(--color-text-secondary)"
        >
          {item.title}
        </Anchor>
      ) : (
        item.title
      )}{' '}
      <span className="text-text-muted">
        {item.repoName}
        {item.prNumber ? ` #${item.prNumber}` : ''}
      </span>
    </span>
  );
}

interface EditableEntry {
  key: string;
  section: SectionKey;
  title: string;
  summary: string;
  size: string;
}

function toEditable(draft: CycleDraft): EditableEntry[] {
  return draft.content.sections.flatMap((section) =>
    section.entries.map((entry) => ({
      key: entry.key,
      section: section.key,
      title: entry.title,
      summary: entry.summary,
      size: sizeLabel(entry),
    })),
  );
}

const SECTION_OPTIONS = (Object.keys(SECTION_LABELS) as SectionKey[]).map(
  (key) => ({ value: key, label: SECTION_LABELS[key] }),
);

/**
 * Edit a draft's version label and each entry's title, summary and section,
 * or remove entries. Sizes and sources aren't editable — they come from what
 * the cycle actually shipped.
 */
function EditDraftModal({
  cycle,
  draft,
  opened,
  onClose,
  onSaved,
}: {
  cycle: ChangelogCycle;
  draft: CycleDraft;
  opened: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [version, setVersion] = useState(draft.version ?? '');
  const [entries, setEntries] = useState<EditableEntry[]>(() => toEditable(draft));
  const [error, setError] = useState<string | null>(null);
  const save = api.product.cycle.updateChangelogDraft.useMutation({
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const update = (key: string, patch: Partial<EditableEntry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  const onSave = () => {
    if (entries.some((e) => !e.title.trim())) {
      setError('Every entry needs a title.');
      return;
    }
    setError(null);
    save.mutate({
      cycleId: cycle.id,
      version: version.trim() || null,
      entries: entries.map(({ key, section, title, summary }) => ({
        key,
        section,
        title,
        summary,
      })),
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Edit ${cycle.name} change log`}
      size="xl"
    >
      <Stack gap="md">
        <TextInput
          label="Version"
          placeholder="v0.18"
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          maxLength={40}
          w={160}
        />
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="rounded-md border border-border-primary p-3"
          >
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <TextInput
                label="Title"
                value={entry.title}
                onChange={(e) => update(entry.key, { title: e.currentTarget.value })}
                maxLength={200}
                className="flex-1"
              />
              <Select
                label="Section"
                data={SECTION_OPTIONS}
                value={entry.section}
                onChange={(value) =>
                  value && update(entry.key, { section: value as SectionKey })
                }
                allowDeselect={false}
                w={170}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={`Remove ${entry.title}`}
                onClick={() =>
                  setEntries((list) => list.filter((e) => e.key !== entry.key))
                }
                mb={4}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
            <div className="mt-2">
              <MarkdownInput
                value={entry.summary}
                onChange={(value) => update(entry.key, { summary: value })}
                placeholder="- What's new or different"
                minRows={2}
                maxRows={8}
                hint={entry.size ? `Size: ${entry.size}` : undefined}
              />
            </div>
          </div>
        ))}
        {error ? (
          <Text size="sm" c="var(--color-brand-error)">
            {error}
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={save.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

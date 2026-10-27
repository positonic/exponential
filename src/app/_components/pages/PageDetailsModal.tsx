'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Modal, Select, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

const NO_PROJECT = '__none__';

interface PageDetailsModalProps {
  page: {
    id: string;
    title: string;
    workspaceId: string;
    project: { id: string } | null;
    /** Provenance (ADR-0074): where the facts come from, and when they were true. */
    source?: string | null;
    asOf?: Date | string | null;
  } | null;
  /** Slug of the workspace the caller is showing — a move out of it navigates
   * to the page in its new home only when `followMove` is set. */
  workspaceSlug: string;
  followMove?: boolean;
  onClose: () => void;
}

/**
 * Edit a Page's metadata: title, source, as-of date, workspace and project.
 * Title and provenance go through `page.update`; a workspace/project change
 * goes through `page.move`, which gates the target placement server-side.
 */
export function PageDetailsModal({
  page,
  workspaceSlug,
  followMove = false,
  onClose,
}: PageDetailsModalProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const opened = page !== null;

  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>(NO_PROJECT);

  // Seed the form once per opened page — keyed on the id, not the object, so
  // a list refetch (new object identity) doesn't wipe what's being typed.
  const pageId = page?.id ?? null;
  useEffect(() => {
    if (!page) return;
    setTitle(page.title);
    setSource(page.source ?? '');
    setAsOf(page.asOf ? new Date(page.asOf) : null);
    setWorkspaceId(page.workspaceId);
    setProjectId(page.project?.id ?? NO_PROJECT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const { data: workspaces = [] } = api.workspace.list.useQuery(undefined, { enabled: opened });
  const { data: projects = [], isLoading: projectsLoading } =
    api.project.getAssignable.useQuery(undefined, { enabled: opened });

  const workspaceOptions = useMemo(
    () => workspaces.map((w) => ({ value: w.id, label: w.name })),
    [workspaces],
  );
  const projectOptions = useMemo(
    () => [
      { value: NO_PROJECT, label: 'No project' },
      ...projects
        .filter((p) => p.workspaceId === workspaceId)
        .map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects, workspaceId],
  );

  const update = api.page.update.useMutation();
  const move = api.page.move.useMutation();
  const isSaving = update.isPending || move.isPending;

  const save = async () => {
    if (!page || !workspaceId) return;
    const nextProjectId = projectId === NO_PROJECT ? null : projectId;
    const trimmed = title.trim();
    const nextSource = source.trim();
    const prevSource = page.source ?? '';
    const prevAsOf = page.asOf ? new Date(page.asOf).getTime() : null;
    const asOfChanged = (asOf?.getTime() ?? null) !== prevAsOf;
    try {
      const patch: { title?: string; source?: string | null; asOf?: Date | null } = {};
      if (trimmed && trimmed !== page.title) patch.title = trimmed;
      if (nextSource !== prevSource) patch.source = nextSource || null;
      if (asOfChanged) patch.asOf = asOf;
      if (Object.keys(patch).length) {
        await update.mutateAsync({ id: page.id, ...patch });
      }
      let movedToSlug: string | null = null;
      if (workspaceId !== page.workspaceId || nextProjectId !== (page.project?.id ?? null)) {
        const result = await move.mutateAsync({
          id: page.id,
          workspaceId,
          projectId: nextProjectId,
        });
        if (result.workspaceSlug !== workspaceSlug) movedToSlug = result.workspaceSlug;
      }
      await Promise.all([
        utils.page.tree.invalidate(),
        utils.page.list.invalidate(),
        utils.page.get.invalidate({ id: page.id }),
        utils.page.audience.invalidate({ id: page.id }),
      ]);
      onClose();
      if (movedToSlug) {
        notifications.show({ color: 'green', message: 'Page moved to another workspace' });
        if (followMove) router.push(`/w/${movedToSlug}/pages/${page.id}`);
      }
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Could not save page details',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const movingWorkspace = page !== null && workspaceId !== page.workspaceId;

  return (
    <Modal opened={opened} onClose={onClose} title="Page details" centered>
      <div className="flex flex-col gap-3">
        <TextInput
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          data-autofocus
        />
        <TextInput
          label="Source"
          description="Where these facts come from — a link, a document, a person."
          placeholder="https://… or 'Q3 board deck'"
          value={source}
          onChange={(e) => setSource(e.currentTarget.value)}
          data-testid="page-source-input"
        />
        <DateInput
          label="As of"
          description="The date the facts on this page were true."
          placeholder="Pick a date"
          value={asOf}
          onChange={(value) => setAsOf(value ? new Date(value) : null)}
          clearable
          valueFormat="D MMM YYYY"
          data-testid="page-asof-input"
        />
        <Select
          label="Workspace"
          data={workspaceOptions}
          value={workspaceId}
          onChange={(value) => {
            setWorkspaceId(value);
            // A project only lives in one workspace.
            setProjectId(NO_PROJECT);
          }}
          allowDeselect={false}
          searchable
        />
        <Select
          label="Project"
          data={projectOptions}
          value={projectId}
          onChange={(value) => setProjectId(value ?? NO_PROJECT)}
          allowDeselect={false}
          searchable
          disabled={projectsLoading}
        />
        {movingWorkspace ? (
          <Text size="xs" className="text-text-muted">
            Moving to another workspace detaches this page from its parent and sub-pages.
          </Text>
        ) : null}
      </div>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={isSaving} onClick={() => void save()} disabled={!title.trim()}>
          Save
        </Button>
      </Group>
    </Modal>
  );
}

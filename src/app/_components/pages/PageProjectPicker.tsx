'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { notifications } from '@mantine/notifications';
import { IconFolder } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import {
  MeetingProjectPicker,
  type MeetingProjectOption,
} from '~/app/_components/meeting/MeetingProjectPicker';

interface PageProjectPickerProps {
  pageId: string;
  workspaceId: string;
  workspaceSlug: string;
  project: { id: string; name: string; slug: string } | null;
  editable: boolean;
}

/**
 * Moving a page to another project (or out of one). Shared by the picker under
 * the title and the Share popover's "Change…" — both change who can see the
 * page, so both refresh the popover's audience.
 */
export function usePageProjectPlacement(pageId: string, workspaceId: string) {
  const utils = api.useUtils();
  const { workspace, userRole } = useWorkspace();
  // Detaching (projectId: null) is a workspace-level placement, which
  // `assertCanPlacePage` only allows for members and up — a viewer who can
  // edit the page through its project can move it between projects, not out.
  const canDetach =
    workspace?.id === workspaceId &&
    (userRole === 'owner' || userRole === 'admin' || userRole === 'member');
  // Candidates load lazily on first open — most page views never re-place.
  const [wantProjects, setWantProjects] = useState(false);
  const { data: assignable = [], isLoading } = api.project.getAssignable.useQuery(
    undefined,
    { enabled: wantProjects },
  );
  const options: MeetingProjectOption[] = useMemo(
    () => assignable.filter((p) => p.workspaceId === workspaceId),
    [assignable, workspaceId],
  );

  const setProject = api.page.update.useMutation({
    onSuccess: () => {
      void utils.page.get.invalidate({ id: pageId });
      void utils.page.audience.invalidate({ id: pageId });
      void utils.page.list.invalidate();
      void utils.page.tree.invalidate();
    },
    onError: (error) => {
      notifications.show({
        color: 'red',
        title: 'Could not change project',
        message: error.message,
      });
    },
  });

  return {
    options,
    isLoading,
    canDetach,
    loadOptions: () => setWantProjects(true),
    move: (projectId: string | null, currentProjectId: string | null) => {
      if (projectId === currentProjectId) return;
      setProject.mutate({ id: pageId, projectId });
    },
    isPending: setProject.isPending,
  };
}

/**
 * The page's Project link, shown under the title. Editors get a searchable
 * picker (candidates = projects they can edit in the page's workspace, the
 * same rule `page.update` enforces); readers just see a link to the project.
 * Re-placing a page changes who can see it (project-linked pages inherit the
 * project's visibility), so it goes through the normal `page.update` gate.
 */
export function PageProjectPicker({
  pageId,
  workspaceId,
  workspaceSlug,
  project,
  editable,
}: PageProjectPickerProps) {
  const placement = usePageProjectPlacement(pageId, workspaceId);

  const projectHref = project ? `/w/${workspaceSlug}/projects/${project.slug}?tab=pages` : null;

  if (!editable) {
    if (!project || !projectHref) return null;
    return (
      <Link
        href={projectHref}
        className="inline-flex items-center gap-1 text-xs text-text-muted hover:underline"
        data-testid="page-project-link"
      >
        <IconFolder size={14} />
        {project.name}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <MeetingProjectPicker
        projects={placement.options}
        value={project?.id ?? null}
        onChange={(projectId) => placement.move(projectId, project?.id ?? null)}
        noneLabel="No project"
        allowNone={placement.canDetach}
        loading={placement.isLoading}
        onOpen={placement.loadOptions}
      >
        {() => (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-text-muted hover:bg-surface-hover hover:text-text-primary"
            aria-label={project ? `Project: ${project.name} — change` : 'Add to project'}
            data-testid="page-project-picker"
            disabled={placement.isPending}
          >
            <IconFolder size={14} />
            {project ? project.name : 'Add to project'}
          </button>
        )}
      </MeetingProjectPicker>
      {project && projectHref ? (
        <Link href={projectHref} className="text-xs text-text-muted hover:underline">
          Open project
        </Link>
      ) : null}
    </div>
  );
}

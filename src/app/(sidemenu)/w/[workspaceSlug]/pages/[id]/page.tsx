'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ActionIcon, Skeleton, Text, TextInput, Tooltip } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconViewportNarrow, IconViewportWide } from '@tabler/icons-react';
import type { JSONContent } from '@tiptap/core';
import { api } from '~/trpc/react';
import { PageDocument } from '~/app/_components/pages/PageDocument';
import { PageShareMenu } from '~/app/_components/pages/PageShareMenu';
import { PageSubpages } from '~/app/_components/pages/PageSubpages';
import { PageCommentsSection } from '~/app/_components/pages/PageCommentsSection';
import { FavoriteButton } from '~/app/_components/shared/FavoriteButton';
import type { RichDocEditorHandle } from '~/app/_components/shared/RichDocEditor';

/** Inline-editable page title; saves on blur/Enter when changed (metadata-only
 * update, so no docVersion dance). Read-only users see static text. */
function PageTitle({
  pageId,
  initialTitle,
  editable,
}: {
  pageId: string;
  initialTitle: string;
  editable: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const utils = api.useUtils();
  const updateTitle = api.page.update.useMutation({
    onSuccess: () => {
      void utils.page.list.invalidate();
      // Favourite titles are resolved live from the page, so a rename should
      // show up in the sidebar immediately.
      void utils.favorite.list.invalidate();
    },
  });

  // Keep local state in sync if the upstream title changes (e.g. agent edit).
  useEffect(() => setTitle(initialTitle), [initialTitle]);

  const commit = () => {
    const next = title.trim();
    if (!next || next === initialTitle) {
      setTitle(initialTitle);
      return;
    }
    updateTitle.mutate({ id: pageId, title: next });
  };

  if (!editable) {
    return (
      <Text component="h1" className="text-2xl font-bold text-text-primary">
        {initialTitle}
      </Text>
    );
  }

  return (
    <TextInput
      value={title}
      onChange={(e) => setTitle(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      variant="unstyled"
      placeholder="Untitled"
      aria-label="Page title"
      styles={{
        input: {
          fontSize: '1.5rem',
          fontWeight: 700,
          height: 'auto',
          padding: 0,
        },
      }}
    />
  );
}

/** Reading-column width preference. Pages default to the same centred column
 * the published (/p/...) render uses; "Full width" is the opt-in. Stored per
 * browser (not on the page) so it stays a reader-side view preference rather
 * than something one editor imposes on everyone. */
const FULL_WIDTH_STORAGE_KEY = 'pages:full-width';

function PageEditorContent({
  pageId,
  workspaceSlug,
}: {
  pageId: string;
  workspaceSlug: string;
}) {
  const { data: page, isLoading, error } = api.page.get.useQuery({ id: pageId });
  const [fullWidth, setFullWidth] = useLocalStorage({
    key: FULL_WIDTH_STORAGE_KEY,
    defaultValue: false,
  });
  const widthClass = fullWidth ? 'w-full' : 'mx-auto w-full max-w-3xl';
  const utils = api.useUtils();
  const editorHandleRef = useRef<RichDocEditorHandle | null>(null);

  // Detach a sub-page: remove its `pageLink` block(s) from the live doc, flush
  // the save, then refresh the child list. Editing the live editor (not the DB)
  // keeps the body the single source of truth and avoids a docVersion conflict
  // with the open editor (ADR-0039).
  const detachChild = async (childId: string) => {
    const editor = editorHandleRef.current?.editor;
    if (!editor) return;
    const ranges: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'pageLink' && node.attrs.pageId === childId) {
        ranges.push({ from: pos, to: pos + node.nodeSize });
      }
      return true;
    });
    if (ranges.length === 0) return;
    // Delete highest position first so earlier ranges stay valid.
    let chain = editor.chain();
    for (const range of ranges.sort((a, b) => b.from - a.from)) {
      chain = chain.deleteRange(range);
    }
    chain.run();
    await editorHandleRef.current?.flushSave();
    await utils.page.children.invalidate({ id: pageId });
    await utils.page.get.invalidate({ id: pageId });
    void utils.page.list.invalidate();
  };

  if (isLoading) {
    return (
      <div className={`${widthClass} px-6 py-8`}>
        <Skeleton height={36} width={320} mb="xl" />
        <Skeleton height={400} />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className={`${widthClass} px-6 py-8`}>
        <Text className="text-text-secondary">
          {error?.data?.code === 'FORBIDDEN'
            ? "You don't have access to this page."
            : 'Page not found.'}
        </Text>
      </div>
    );
  }

  return (
    <div className={`${widthClass} px-6 py-8`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PageTitle pageId={page.id} initialTitle={page.title} editable={page.canEdit} />
        </div>
        <div className="flex items-center gap-2">
          <Tooltip label={fullWidth ? 'Use narrow width' : 'Use full width'}>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={fullWidth ? 'Use narrow width' : 'Use full width'}
              aria-pressed={fullWidth}
              // Value form, not the updater form: Mantine's setter writes to
              // localStorage *inside* the state updater, and React replays
              // updaters, which would persist the toggle a second time and
              // land back on the old value.
              onClick={() => setFullWidth(!fullWidth)}
            >
              {fullWidth ? (
                <IconViewportNarrow size={18} />
              ) : (
                <IconViewportWide size={18} />
              )}
            </ActionIcon>
          </Tooltip>
          <FavoriteButton
            entityType="page"
            entityId={`pages/${page.id}`}
            label={page.title}
            workspaceId={page.workspaceId}
          />
          <PageShareMenu
            pageId={page.id}
            workspaceSlug={workspaceSlug}
            isPublic={page.isPublic}
            publicId={page.publicId}
            publicSlug={page.publicSlug}
            publicSeoIndexed={page.publicSeoIndexed}
            canEdit={page.canEdit}
          />
        </div>
      </div>
      <PageDocument
        pageId={page.id}
        bodyDoc={(page.bodyDoc as JSONContent | null) ?? null}
        body={page.body ?? null}
        docVersion={page.docVersion}
        editable={page.canEdit}
        workspaceId={page.workspaceId}
        workspaceSlug={workspaceSlug}
        projectId={page.projectId}
        onEditorReady={(handle) => {
          editorHandleRef.current = handle;
        }}
      />
      <PageSubpages
        pageId={page.id}
        workspaceSlug={workspaceSlug}
        editable={page.canEdit}
        onDetach={page.canEdit ? detachChild : undefined}
      />
      <PageCommentsSection pageId={page.id} />
    </div>
  );
}

export default function WorkspacePageEditorPage() {
  const params = useParams<{ id: string; workspaceSlug: string }>();
  const pageId = params?.id;
  const workspaceSlug = params?.workspaceSlug;

  if (!pageId || !workspaceSlug) return null;

  return (
    <main className="flex h-full flex-col text-text-primary">
      <PageEditorContent pageId={pageId} workspaceSlug={workspaceSlug} />
    </main>
  );
}

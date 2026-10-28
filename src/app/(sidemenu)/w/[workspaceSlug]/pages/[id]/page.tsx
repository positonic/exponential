'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Skeleton, Text, Textarea } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconCalendarEvent } from '@tabler/icons-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { JSONContent } from '@tiptap/core';
import { api } from '~/trpc/react';
import { PageDocument } from '~/app/_components/pages/PageDocument';
import { PageShareMenu } from '~/app/_components/pages/PageShareMenu';
import { PageSubpages } from '~/app/_components/pages/PageSubpages';
import { PageCommentsSection } from '~/app/_components/pages/PageCommentsSection';
import { PageProjectPicker } from '~/app/_components/pages/PageProjectPicker';
import { PageDetailsModal } from '~/app/_components/pages/PageDetailsModal';
import { PageHistoryModal } from '~/app/_components/pages/PageHistoryModal';
import { PageOutline } from '~/app/_components/pages/PageOutline';
import { UpdateReviewBanner } from '~/app/_components/pages/UpdateReviewBanner';
import { FavoriteButton } from '~/app/_components/shared/FavoriteButton';
import type { RichDocEditorHandle } from '~/app/_components/shared/RichDocEditor';

/** The page title is the largest text on the page — above the body's H1
 * (30px), which it used to sit below. Shared between the read-only heading and
 * the invisible input so a page looks the same to editors and viewers. */
const TITLE_FONT_SIZE = '2.5rem';
const TITLE_CLASS =
  'text-[2.5rem] font-bold leading-[1.2] tracking-[-0.01em] text-text-primary';

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
      // The breadcrumb and "Edited" stamp read from the page query.
      void utils.page.get.invalidate({ id: pageId });
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
      <Text component="h1" className={TITLE_CLASS}>
        {initialTitle}
      </Text>
    );
  }

  // A textarea, not an input, so a long title wraps onto new lines like the
  // read-only heading does instead of being clipped by the reading column.
  // Titles are still single-line: Enter commits and pasted newlines become
  // spaces.
  return (
    <Textarea
      value={title}
      onChange={(e) => setTitle(e.currentTarget.value.replace(/\r?\n/g, ' '))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      autosize
      minRows={1}
      variant="unstyled"
      placeholder="Untitled"
      aria-label="Page title"
      styles={{
        input: {
          fontSize: TITLE_FONT_SIZE,
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: '-0.01em',
          height: 'auto',
          minHeight: 0,
          padding: 0,
          resize: 'none',
          overflow: 'hidden',
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Bumped after a restore so the editor remounts on the restored content
  // instead of keeping the doc it loaded (the engine owns its doc after mount).
  const [editorEpoch, setEditorEpoch] = useState(0);
  const widthClass = fullWidth ? 'w-full' : 'mx-auto w-full max-w-3xl';
  const utils = api.useUtils();
  const editorHandleRef = useRef<RichDocEditorHandle | null>(null);
  // State (not only the ref) so the outline re-renders once the editor exists.
  const [editorHandle, setEditorHandle] = useState<RichDocEditorHandle | null>(null);

  // Markdown for the "Copy/Export as Markdown" actions. Read off the live
  // editor rather than `page.body` so an export includes edits the debounced
  // autosave hasn't written yet.
  const currentMarkdown = () => {
    const editor = editorHandleRef.current?.editor;
    if (!editor) return null;
    return (
      editor.storage.markdown as { getMarkdown: () => string }
    ).getMarkdown();
  };

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
      <div className={`${widthClass} px-6 pb-24 pt-20`}>
        <Skeleton height={48} width={360} mb="xl" />
        <Skeleton height={400} />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className={`${widthClass} px-6 pb-24 pt-20`}>
        <Text className="text-text-secondary">
          {error?.data?.code === 'FORBIDDEN'
            ? "You don't have access to this page."
            : 'Page not found.'}
        </Text>
      </div>
    );
  }

  const edited = formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true });
  // Ghost affordances ("Add to project", "Move…") surface on hover of the title
  // block, the way Notion reveals "Add icon / Add cover"; a page that already
  // has a project keeps the row visible since the name is information.
  const metaRowClass = page.project
    ? ''
    : 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

  return (
    <div className="flex min-h-full flex-col">
      {/* Thin sticky page bar: breadcrumb left, "Edited …" + actions right.
          `top-16` clears the fixed mobile nav; from `sm` the bar sits at the
          top of the scrolling main. No rule under it — spacing separates. */}
      <header
        className="sticky top-16 z-20 flex h-11 shrink-0 items-center justify-between gap-4 bg-background-primary px-4 sm:top-0"
        data-testid="page-topbar"
      >
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link
            href={`/w/${workspaceSlug}/pages`}
            className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
          >
            Pages
          </Link>
          <span className="text-text-muted">/</span>
          <span className="truncate text-text-primary">{page.title || 'Untitled'}</span>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <Text size="xs" className="mr-1 hidden text-text-muted md:block" data-testid="page-edited">
            Edited {edited}
          </Text>
          <FavoriteButton
            entityType="page"
            entityId={`pages/${page.id}`}
            label={page.title}
            workspaceId={page.workspaceId}
          />
          <PageShareMenu
            pageId={page.id}
            workspaceId={page.workspaceId}
            workspaceSlug={workspaceSlug}
            isPublic={page.isPublic}
            publicId={page.publicId}
            publicSlug={page.publicSlug}
            publicSeoIndexed={page.publicSeoIndexed}
            canEdit={page.canEdit}
            title={page.title}
            getMarkdown={currentMarkdown}
            fullWidth={fullWidth}
            // Value form, not the updater form: Mantine's setter writes to
            // localStorage *inside* the state updater, and React replays
            // updaters, which would persist the toggle a second time and
            // land back on the old value.
            onToggleFullWidth={() => setFullWidth(!fullWidth)}
            onOpenHistory={() => {
              // Land pending autosaves first, so the history (and the version
              // a restore pins) includes the edits on screen.
              void (editorHandleRef.current?.flushSave() ?? Promise.resolve()).finally(() =>
                setHistoryOpen(true),
              );
            }}
          />
        </div>
      </header>

      {/* The reading column: generous air above the title (Notion leaves the
          cover/icon band empty), the title and body on one left edge. */}
      <div className={`${widthClass} px-6 pb-24 pt-20`}>
        {page.ceremonyOccurrence ? (
          <Link
            href={`/w/${workspaceSlug}/ceremonies/${page.ceremonyOccurrence.ceremonyId}/${page.ceremonyOccurrence.id}`}
            className="mb-3 inline-flex items-center gap-1 text-xs text-text-muted hover:underline"
            data-testid="page-occurrence-crumb"
          >
            <IconCalendarEvent size={14} />
            Notes for {page.ceremonyOccurrence.ceremony.name} ·{' '}
            {new Date(page.ceremonyOccurrence.scheduledStart).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: page.ceremonyOccurrence.ceremony.timezone,
            })}
          </Link>
        ) : null}
        <UpdateReviewBanner pageId={page.id} />
        <div className="group mb-6">
          <PageTitle pageId={page.id} initialTitle={page.title} editable={page.canEdit} />
          <div className={`mt-2 flex min-h-6 items-center gap-2 ${metaRowClass}`}>
            <PageProjectPicker
              pageId={page.id}
              workspaceId={page.workspaceId}
              workspaceSlug={workspaceSlug}
              project={page.project}
              editable={page.canEdit}
            />
            {page.canEdit ? (
              <button
                type="button"
                className="rounded px-1 py-0.5 text-xs text-text-muted hover:bg-surface-hover hover:text-text-primary"
                onClick={() => setDetailsOpen(true)}
                data-testid="page-move-workspace"
              >
                Move…
              </button>
            ) : null}
            {page.canEdit && !page.source && !page.asOf ? (
              <button
                type="button"
                className="rounded px-1 py-0.5 text-xs text-text-muted hover:bg-surface-hover hover:text-text-primary"
                onClick={() => setDetailsOpen(true)}
                data-testid="page-add-provenance"
              >
                Add source / as-of…
              </button>
            ) : null}
          </div>
          {page.source || page.asOf ? (
            // Provenance (ADR-0074): where the facts come from and when they
            // were true. Always visible once set — it is what makes the page
            // trustworthy — and a click opens the details to change it.
            <button
              type="button"
              className={`mt-1 flex flex-wrap items-center gap-1 text-left text-xs text-text-muted ${
                page.canEdit ? 'hover:text-text-primary' : 'cursor-default'
              }`}
              onClick={page.canEdit ? () => setDetailsOpen(true) : undefined}
              disabled={!page.canEdit}
              data-testid="page-provenance"
            >
              {page.asOf ? <span>As of {format(new Date(page.asOf), 'd MMM yyyy')}</span> : null}
              {page.asOf && page.source ? <span>·</span> : null}
              {page.source ? (
                /^https?:\/\//i.test(page.source) ? (
                  <span>
                    Source:{' '}
                    <a
                      href={page.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-text-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {page.source.replace(/^https?:\/\//i, '')}
                    </a>
                  </span>
                ) : (
                  <span>Source: {page.source}</span>
                )
              ) : null}
            </button>
          ) : null}
          <PageDetailsModal
            page={detailsOpen ? page : null}
            workspaceSlug={workspaceSlug}
            followMove
            onClose={() => setDetailsOpen(false)}
          />
          <PageHistoryModal
            pageId={page.id}
            opened={historyOpen}
            canEdit={page.canEdit}
            onClose={() => setHistoryOpen(false)}
            onRestored={() => setEditorEpoch((n) => n + 1)}
          />
        </div>
        <PageDocument
          key={editorEpoch}
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
            setEditorHandle(handle);
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
      <PageOutline editor={editorHandle?.editor ?? null} />
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

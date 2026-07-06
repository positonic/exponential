'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Skeleton, Text, TextInput } from '@mantine/core';
import type { JSONContent } from '@tiptap/core';
import { api } from '~/trpc/react';
import { PageDocument } from '~/app/_components/pages/PageDocument';
import { PageShareMenu } from '~/app/_components/pages/PageShareMenu';

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

function PageEditorContent({
  pageId,
  workspaceSlug,
}: {
  pageId: string;
  workspaceSlug: string;
}) {
  const { data: page, isLoading, error } = api.page.get.useQuery({ id: pageId });

  if (isLoading) {
    return (
      <div className="w-full px-6 py-8">
        <Skeleton height={36} width={320} mb="xl" />
        <Skeleton height={400} />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="w-full px-6 py-8">
        <Text className="text-text-secondary">
          {error?.data?.code === 'FORBIDDEN'
            ? "You don't have access to this page."
            : 'Page not found.'}
        </Text>
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PageTitle pageId={page.id} initialTitle={page.title} editable={page.canEdit} />
        </div>
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
      <PageDocument
        pageId={page.id}
        bodyDoc={(page.bodyDoc as JSONContent | null) ?? null}
        body={page.body ?? null}
        docVersion={page.docVersion}
        editable={page.canEdit}
        workspaceId={page.workspaceId}
        workspaceSlug={workspaceSlug}
        projectId={page.projectId}
      />
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

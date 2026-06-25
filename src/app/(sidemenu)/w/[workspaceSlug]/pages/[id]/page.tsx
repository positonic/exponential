'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Container, Skeleton, Text, TextInput } from '@mantine/core';
import type { JSONContent } from '@tiptap/core';
import { api } from '~/trpc/react';
import { PageDocument } from '~/app/_components/pages/PageDocument';

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

function PageEditorContent({ pageId }: { pageId: string }) {
  const { data: page, isLoading, error } = api.page.get.useQuery({ id: pageId });

  if (isLoading) {
    return (
      <Container size="md" className="py-8">
        <Skeleton height={36} width={320} mb="xl" />
        <Skeleton height={400} />
      </Container>
    );
  }

  if (error || !page) {
    return (
      <Container size="md" className="py-8">
        <Text className="text-text-secondary">
          {error?.data?.code === 'FORBIDDEN'
            ? "You don't have access to this page."
            : 'Page not found.'}
        </Text>
      </Container>
    );
  }

  return (
    <Container size="md" className="py-8">
      <div className="mb-4">
        <PageTitle pageId={page.id} initialTitle={page.title} editable={page.canEdit} />
      </div>
      <PageDocument
        pageId={page.id}
        bodyDoc={(page.bodyDoc as JSONContent | null) ?? null}
        body={page.body ?? null}
        docVersion={page.docVersion}
        editable={page.canEdit}
      />
    </Container>
  );
}

export default function WorkspacePageEditorPage() {
  const params = useParams<{ id: string }>();
  const pageId = params?.id;

  if (!pageId) return null;

  return (
    <main className="flex h-full flex-col text-text-primary">
      <PageEditorContent pageId={pageId} />
    </main>
  );
}

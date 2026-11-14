"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Group, Paper, Skeleton, Text } from "@mantine/core";
import { IconExternalLink, IconPlus } from "@tabler/icons-react";
import type { JSONContent } from "@tiptap/core";
import { api } from "~/trpc/react";
import { PageDocument } from "~/app/_components/pages/PageDocument";

interface OccurrenceNotesProps {
  pageId: string;
  workspaceSlug: string;
  /**
   * Forces the editor read-only regardless of page access — a skipped
   * occurrence has nothing to take notes on. Viewer-role members are already
   * read-only through `page.get`'s `canEdit`.
   */
  readOnly?: boolean;
}

/**
 * The occurrence's notes page (ADR-0059), rendered inline under the agenda
 * with the same editor the Pages route uses (ADR-0024 / ADR-0033). The body
 * is read and autosaved through `page.get` / `page.update`, so who may see
 * or edit it is decided by the page access resolver, not by this component:
 * a restricted project's notes come back FORBIDDEN and render as a hint.
 *
 * A page nobody has written in (blank body, `docVersion` 0) renders
 * collapsed — a header and "Add notes" — so an empty editor does not sit
 * under every agenda. It expands on click, and stays open once it has text
 * (a person's notes, or the recording's summary appended after capture).
 */
export function OccurrenceNotes({ pageId, workspaceSlug, readOnly = false }: OccurrenceNotesProps) {
  const { data: page, isLoading, error } = api.page.get.useQuery({ id: pageId });
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <Paper withBorder radius="md" p="lg" data-testid="occurrence-notes">
        <Skeleton height={16} width={120} mb="md" />
        <Skeleton height={120} />
      </Paper>
    );
  }

  if (error || !page) {
    return (
      <Paper withBorder radius="md" p="lg" data-testid="occurrence-notes">
        <Text fw={600} mb={6}>
          Notes
        </Text>
        <Text size="sm" className="text-text-muted">
          {error?.data?.code === "FORBIDDEN"
            ? "You don't have access to this occurrence's notes."
            : "The notes page for this occurrence is missing."}
        </Text>
      </Paper>
    );
  }

  const editable = page.canEdit && !readOnly;
  const blank = page.docVersion === 0 && !page.body?.trim();
  if (blank && !expanded) {
    return (
      <Paper withBorder radius="md" p="md" data-testid="occurrence-notes" data-collapsed="true">
        <Group justify="space-between" align="center">
          <Text fw={600}>Notes</Text>
          {editable ? (
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={<IconPlus size={14} />}
              onClick={() => setExpanded(true)}
              data-testid="occurrence-notes-expand"
            >
              Add notes
            </Button>
          ) : (
            <Text size="xs" className="text-text-muted">
              No notes yet.
            </Text>
          )}
        </Group>
      </Paper>
    );
  }
  return (
    <Paper withBorder radius="md" p="lg" data-testid="occurrence-notes">
      <Group justify="space-between" align="center" mb="sm">
        <div>
          <Text fw={600}>Notes</Text>
          <Text size="xs" className="text-text-muted">
            {editable ? "Autosaves as you type." : "Read-only."}
          </Text>
        </div>
        <Link
          href={`/w/${workspaceSlug}/pages/${page.id}`}
          className="flex items-center gap-1 text-xs text-text-muted hover:underline"
          data-testid="occurrence-notes-open-page"
        >
          Open as page
          <IconExternalLink size={12} />
        </Link>
      </Group>
      <PageDocument
        pageId={page.id}
        bodyDoc={(page.bodyDoc as JSONContent | null) ?? null}
        body={page.body ?? null}
        docVersion={page.docVersion}
        editable={editable}
        workspaceId={page.workspaceId}
        workspaceSlug={workspaceSlug}
        projectId={page.projectId}
      />
    </Paper>
  );
}

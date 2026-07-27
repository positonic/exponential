"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionIcon, Badge, Button, Group, Select } from "@mantine/core";
import { IconFileText, IconPlus, IconX } from "@tabler/icons-react";
import { api } from "~/trpc/react";

export interface FeaturePageLink {
  pageId: string;
  scopeId: string | null;
  page: { title: string };
}

// Seed body for one-click PRD pages. Sections follow ADR-0039: requirements
// are EARS statements, not user stories.
const PRD_TEMPLATE = `## Problem

What problem does this solve, and for whom?

## Goals

## Non-goals

## Requirements

One testable "shall" statement per line (EARS), e.g. "When a user submits the form, the system shall send a confirmation email within one minute."

## Rollout / scopes

How does this ship incrementally? Map bullets here to the feature's scopes.

## Open questions
`;

/**
 * The Docs block (Knowledge pages - PRDs, research, specs - linked to a
 * feature, plus the link picker and the one-click "New PRD") - extracted
 * from the feature detail page so the peek renders the same functionality.
 * Callers wrap it in a CollapsibleSection.
 */
export function FeatureDocsSection({
  featureId,
  featureName,
  workspaceId,
  workspaceSlug,
  pages,
  scopes,
}: {
  featureId: string;
  featureName: string;
  workspaceId: string | null;
  workspaceSlug: string | undefined;
  pages: FeaturePageLink[];
  scopes: Array<{ id: string; version: string }>;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [pageToLink, setPageToLink] = useState<string | null>(null);
  const [creatingPrd, setCreatingPrd] = useState(false);

  const { data: workspacePages } = api.page.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const linkPage = api.product.feature.linkPage.useMutation({
    onSuccess: async () => {
      setPageToLink(null);
      await utils.product.feature.getById.invalidate({ id: featureId });
    },
  });
  const unlinkPage = api.product.feature.unlinkPage.useMutation({
    onSuccess: () => void utils.product.feature.getById.invalidate({ id: featureId }),
  });
  const createPage = api.page.create.useMutation();

  // One-click PRD: create a pre-titled, pre-structured Knowledge page
  // (ADR-0039), link it, and open it for writing.
  const handleCreatePrd = async () => {
    if (!workspaceId) return;
    setCreatingPrd(true);
    try {
      const page = await createPage.mutateAsync({
        workspaceId,
        title: `PRD: ${featureName}`,
        body: PRD_TEMPLATE,
      });
      await linkPage.mutateAsync({ featureId, pageId: page.id });
      await utils.page.list.invalidate({ workspaceId });
      if (workspaceSlug) router.push(`/w/${workspaceSlug}/pages/${page.id}`);
    } finally {
      setCreatingPrd(false);
    }
  };

  return (
    <div>
      {pages.length > 0 && (
        <div className="border border-border-primary rounded-lg overflow-hidden mb-4">
          {pages.map((link, i) => {
            const linkScope = scopes.find((s) => s.id === link.scopeId);
            return (
              <div
                key={link.pageId}
                className={`group flex items-center gap-3 px-3 py-2.5 ${i < pages.length - 1 ? "border-b border-border-primary" : ""}`}
              >
                <IconFileText size={14} className="text-text-muted shrink-0" />
                <Link
                  href={`/w/${workspaceSlug}/pages/${link.pageId}`}
                  className="text-sm text-text-primary hover:underline flex-1 min-w-0 truncate"
                >
                  {link.page.title}
                </Link>
                {linkScope && (
                  <Badge size="xs" variant="light" color="gray" className="shrink-0">
                    {linkScope.version}
                  </Badge>
                )}
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 text-brand-error hover:bg-surface-hover"
                  onClick={() => unlinkPage.mutate({ featureId, pageId: link.pageId })}
                  aria-label="Unlink page"
                >
                  <IconX size={12} />
                </ActionIcon>
              </div>
            );
          })}
        </div>
      )}
      <Group gap="xs">
        <Select
          placeholder="Link a page (PRD, spec, research)..."
          value={pageToLink}
          onChange={setPageToLink}
          data={(workspacePages ?? [])
            .filter((p) => !pages.some((l) => l.pageId === p.id))
            .map((p) => ({ value: p.id, label: p.title }))}
          size="xs"
          searchable
          clearable
          nothingFoundMessage="No pages found"
          className="flex-1"
          comboboxProps={{ withinPortal: true }}
        />
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={12} />}
          onClick={() => { if (pageToLink) linkPage.mutate({ featureId, pageId: pageToLink }); }}
          loading={linkPage.isPending}
          disabled={!pageToLink}
        >
          Link
        </Button>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconFileText size={12} />}
          onClick={() => void handleCreatePrd()}
          loading={creatingPrd}
        >
          New PRD
        </Button>
      </Group>
    </div>
  );
}

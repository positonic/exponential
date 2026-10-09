"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Anchor,
  Button,
  CopyButton,
  Divider,
  Group,
  Menu,
  Popover,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconFileExport,
  IconMarkdown,
  IconWorld,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { buildPublicPagePath } from "~/lib/pages/public-url";
import {
  buildMarkdownExport,
  markdownFilename,
} from "~/lib/pages/markdown-export";

interface PageShareMenuProps {
  pageId: string;
  workspaceSlug: string;
  isPublic: boolean;
  publicId: string | null;
  publicSlug: string | null;
  publicSeoIndexed: boolean;
  canEdit: boolean;
  /** Page title — the H1 of the export and the download's filename. */
  title: string;
  /**
   * Current Markdown projection of the body, read from the live editor so an
   * export reflects edits the debounced autosave hasn't written yet. Returns
   * null before the editor has mounted.
   */
  getMarkdown: () => string | null;
}

/**
 * The "Share" popover + page actions menu on the Page editor (ADR-0038).
 * Publishing is gated server-side on edit access; this component is the
 * consent surface — it says plainly that the page becomes public.
 */
export function PageShareMenu({
  pageId,
  workspaceSlug,
  isPublic,
  publicId,
  publicSlug,
  publicSeoIndexed,
  canEdit,
  title,
  getMarkdown,
}: PageShareMenuProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [slugDraft, setSlugDraft] = useState(publicSlug ?? "");

  // Follow upstream changes (first publish derives the slug server-side).
  useEffect(() => setSlugDraft(publicSlug ?? ""), [publicSlug]);

  const onSettled = () => utils.page.get.invalidate({ id: pageId });
  const onError = (error: { message: string }, failed: string) =>
    notifications.show({ color: "red", title: failed, message: error.message });

  const publish = api.page.publish.useMutation({
    onSettled,
    onError: (e) => onError(e, "Could not publish page"),
  });
  const unpublish = api.page.unpublish.useMutation({
    onSettled,
    onError: (e) => onError(e, "Could not unpublish page"),
  });
  const updateSettings = api.page.updatePublicSettings.useMutation({
    onSettled,
    onError: (e) => onError(e, "Could not update public settings"),
  });
  // Linked pages that aren't public yet — their links render as plain text on
  // the public page. Listed here so publishing them stays an explicit act.
  const linkedUnpublished = api.page.linkedUnpublished.useQuery(
    { id: pageId },
    { enabled: canEdit && isPublic },
  );
  const linkedPages = linkedUnpublished.data ?? [];
  const publishMany = api.page.publishMany.useMutation({
    onSettled: () => {
      void utils.page.linkedUnpublished.invalidate({ id: pageId });
      void onSettled();
    },
    onError: (e) => onError(e, "Could not publish linked pages"),
  });
  // Whether this page has sub-pages — gates the "with sub-pages" duplicate.
  const children = api.page.children.useQuery({ id: pageId });
  const hasSubpages = (children.data?.length ?? 0) > 0;
  const duplicate = api.page.duplicate.useMutation({
    onSuccess: (copy) => {
      void utils.page.list.invalidate();
      void utils.page.tree.invalidate();
      router.push(`/w/${workspaceSlug}/pages/${copy.id}`);
    },
    onError: (e) => onError(e, "Could not duplicate page"),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicPath =
    publicId != null
      ? buildPublicPagePath(publicSlug ?? "untitled", publicId)
      : null;
  const publicUrl = publicPath ? `${origin}${publicPath}` : null;

  /** Title-as-H1 + the live body projection, or null if the editor isn't up. */
  const markdownDocument = () => {
    const body = getMarkdown();
    return body == null ? null : buildMarkdownExport(title, body);
  };

  const copyMarkdown = async () => {
    const markdown = markdownDocument();
    if (markdown == null) return;
    try {
      await navigator.clipboard.writeText(markdown);
      notifications.show({
        color: "teal",
        title: "Copied as Markdown",
        message: "Paste into Notion, Obsidian, or any Markdown editor.",
      });
    } catch {
      // Denied permission, or a non-secure origin.
      notifications.show({
        color: "red",
        title: "Could not copy",
        message: "Your browser blocked clipboard access.",
      });
    }
  };

  const exportMarkdown = () => {
    const markdown = markdownDocument();
    if (markdown == null) return;
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = markdownFilename(title);
    link.click();
    URL.revokeObjectURL(url);
  };

  const commitSlug = () => {
    const next = slugDraft.trim();
    if (!next || next === publicSlug) {
      setSlugDraft(publicSlug ?? "");
      return;
    }
    updateSettings.mutate({ id: pageId, publicSlug: next });
  };

  return (
    <Group gap="xs" wrap="nowrap">
      {canEdit ? (
        <Popover width={360} position="bottom-end" shadow="md">
          <Popover.Target>
            <Button
              variant={isPublic ? "light" : "default"}
              size="xs"
              leftSection={<IconWorld size={14} />}
            >
              {isPublic ? "Published" : "Share"}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="sm">
              <Switch
                label="Publish to web"
                description="Anyone with the link can view the live page."
                checked={isPublic}
                disabled={publish.isPending || unpublish.isPending}
                onChange={(e) =>
                  e.currentTarget.checked
                    ? publish.mutate({ id: pageId })
                    : unpublish.mutate({ id: pageId })
                }
              />

              {isPublic && publicUrl && publicId ? (
                <>
                  <TextInput
                    label="Link"
                    description="Edit the readable part — the ending is permanent, so old links keep working."
                    value={slugDraft}
                    onChange={(e) => setSlugDraft(e.currentTarget.value)}
                    onBlur={commitSlug}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    rightSection={
                      <Text size="xs" className="pr-2 text-text-muted">
                        -{publicId}
                      </Text>
                    }
                    rightSectionWidth={90}
                  />
                  <Group gap="xs" wrap="nowrap">
                    <Text
                      size="xs"
                      className="min-w-0 flex-1 truncate text-text-muted"
                      title={publicUrl}
                    >
                      {publicUrl}
                    </Text>
                    <CopyButton value={publicUrl}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? "Copied" : "Copy link"}>
                          <ActionIcon
                            variant="subtle"
                            color={copied ? "teal" : "gray"}
                            onClick={copy}
                            aria-label="Copy public link"
                          >
                            {copied ? (
                              <IconCheck size={16} />
                            ) : (
                              <IconCopy size={16} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    <Anchor
                      href={publicPath ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open public page"
                    >
                      <ActionIcon variant="subtle" color="gray" component="span">
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Anchor>
                  </Group>
                  <Switch
                    label="Allow search engines"
                    description="Off means the page is link-only (noindex)."
                    size="xs"
                    checked={publicSeoIndexed}
                    disabled={updateSettings.isPending}
                    onChange={(e) =>
                      updateSettings.mutate({
                        id: pageId,
                        publicSeoIndexed: e.currentTarget.checked,
                      })
                    }
                  />
                  {linkedPages.length > 0 ? (
                    <>
                      <Divider />
                      <Stack gap={6}>
                        <Text size="sm" fw={500}>
                          Linked pages not yet public
                        </Text>
                        <Text size="xs" className="text-text-muted">
                          Links to these pages show as plain text on the
                          public page until they are published too.
                        </Text>
                        {linkedPages.map((linked) => (
                          <Text
                            key={linked.id}
                            size="xs"
                            className="truncate text-text-secondary"
                          >
                            • {linked.title}
                          </Text>
                        ))}
                        <Button
                          size="xs"
                          variant="light"
                          loading={publishMany.isPending}
                          onClick={() =>
                            publishMany.mutate({
                              ids: linkedPages.map((l) => l.id),
                            })
                          }
                        >
                          Publish{" "}
                          {linkedPages.length === 1
                            ? "1 linked page"
                            : `${linkedPages.length} linked pages`}
                        </Button>
                      </Stack>
                    </>
                  ) : null}
                </>
              ) : null}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      ) : null}

      <Menu position="bottom-end" shadow="md">
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label="Page actions">
            <IconDots size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconCopy size={14} />}
            disabled={duplicate.isPending}
            onClick={() => duplicate.mutate({ id: pageId })}
          >
            Duplicate
          </Menu.Item>
          {hasSubpages ? (
            <Menu.Item
              leftSection={<IconCopy size={14} />}
              disabled={duplicate.isPending}
              onClick={() => duplicate.mutate({ id: pageId, withSubpages: true })}
            >
              Duplicate with sub-pages
            </Menu.Item>
          ) : null}
          <Menu.Divider />
          {/* Plain copy (Cmd-C) puts text on the clipboard and the formatted
              slice on `text/html`; these two are the explicit Markdown route,
              for a Markdown-source target. */}
          <Menu.Item
            leftSection={<IconMarkdown size={14} />}
            onClick={() => void copyMarkdown()}
          >
            Copy as Markdown
          </Menu.Item>
          <Menu.Item
            leftSection={<IconFileExport size={14} />}
            onClick={exportMarkdown}
          >
            Export as Markdown
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

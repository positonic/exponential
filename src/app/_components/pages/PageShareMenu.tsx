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
  IconWorld,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { buildPublicPagePath } from "~/lib/pages/public-url";

interface PageShareMenuProps {
  pageId: string;
  workspaceSlug: string;
  isPublic: boolean;
  publicId: string | null;
  publicSlug: string | null;
  publicSeoIndexed: boolean;
  canEdit: boolean;
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
}: PageShareMenuProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [slugDraft, setSlugDraft] = useState(publicSlug ?? "");

  // Follow upstream changes (first publish derives the slug server-side).
  useEffect(() => setSlugDraft(publicSlug ?? ""), [publicSlug]);

  const onSettled = () => utils.page.get.invalidate({ id: pageId });
  const onError = (error: { message: string }, title: string) =>
    notifications.show({ color: "red", title, message: error.message });

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
  const duplicate = api.page.duplicate.useMutation({
    onSuccess: (copy) => {
      void utils.page.list.invalidate();
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
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

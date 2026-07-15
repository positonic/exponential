"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Avatar,
  Badge,
  Group,
  Menu,
  Popover,
  Skeleton,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import {
  IconCircleDot,
  IconDots,
  IconExternalLink,
  IconFlag,
  IconFlame,
  IconFolder,
  IconGitBranch,
  IconRepeat,
  IconTag,
  IconTargetArrow,
  IconUser,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { PropertyPill, PillRow } from "~/app/_components/product/PropertyPill";
import { PriorityIcon, PRIORITY_LABELS } from "~/app/_components/product/PriorityIcon";
import { TicketBodyEditor } from "~/app/_components/product/TicketBodyEditor";
import { LinkedActionsSection } from "~/app/_components/product/LinkedActionsSection";
import { TicketDependenciesSection } from "~/app/_components/product/TicketDependenciesSection";
import { LabelsCombobox } from "~/app/_components/product/LabelsCombobox";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { ActivityFeed } from "~/app/_components/shared/ActivityFeed";
import { ActivityComposer } from "~/app/_components/shared/ActivityComposer";
import { useTicketActivity } from "~/hooks/useTicketActivity";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";
import { generateLinearId } from "~/lib/fun-ids";
import {
  TICKET_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
} from "~/lib/ticket-statuses";

const TYPE_COLORS: Record<string, string> = {
  BUG: "red", FEATURE: "blue", CHORE: "gray", IMPROVEMENT: "teal", SPIKE: "violet", RESEARCH: "yellow",
};

const EFFORT_OPTIONS = [1, 2, 3, 5, 8, 13];

/**
 * Full ticket content for the peek drawer: everything the detail page offers,
 * with the properties sidebar compressed into a two-line pill strip
 * (workflow line + planning line + ⋯ overflow) below the title.
 */
export function TicketPeek({ ticketId, basePath }: { ticketId: string; basePath: string }) {
  const { data: session } = useSession();
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: ticket, isLoading } = api.product.ticket.getById.useQuery(
    { id: ticketId },
    { enabled: !!ticketId },
  );

  const { data: features } = api.product.feature.list.useQuery(
    { productId: ticket?.product.id ?? "" },
    { enabled: !!ticket?.product.id },
  );
  const { data: epics } = api.epic.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );
  const { data: cycles } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );
  const { data: tags } = api.tag.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const invalidate = async () => {
    await utils.product.ticket.getById.invalidate({ id: ticketId });
    if (ticket?.product.id) {
      await utils.product.ticket.list.invalidate({ productId: ticket.product.id });
    }
  };

  const updateTicket = api.product.ticket.update.useMutation({ onSuccess: invalidate });
  const setTicketTags = api.tag.setTicketTags.useMutation({ onSuccess: invalidate });
  const createTag = api.tag.create.useMutation({
    onSuccess: async (newTag) => {
      await utils.tag.list.invalidate();
      const currentIds = ticket?.tags?.map((t: { tag: { id: string } }) => t.tag.id) ?? [];
      setTicketTags.mutate({ ticketId, tagIds: [...currentIds, newTag.id] });
    },
  });

  const setField = (field: string, value: unknown) => {
    updateTicket.mutate({ id: ticketId, [field]: value });
  };

  const [titleValue, setTitleValue] = useState("");
  useEffect(() => {
    if (ticket) setTitleValue(ticket.title);
  }, [ticket]);

  const mentionCandidates: MentionCandidate[] = useMemo(
    () =>
      (workspace?.members ?? []).map(
        (m: { user: { id: string; name: string | null; email: string | null; image: string | null } }) => ({
          id: m.user.id,
          name: m.user.name ?? m.user.email ?? "Unknown",
          type: "member" as const,
          image: m.user.image,
        }),
      ),
    [workspace?.members],
  );
  const mentionNames = useMemo(() => mentionCandidates.map((c) => c.name), [mentionCandidates]);
  const activity = useTicketActivity(ticketId, { mentionCandidates, mentionNames });

  if (isLoading || !ticket) {
    return (
      <Stack gap="md">
        <Skeleton height={20} width={180} />
        <Skeleton height={32} width="80%" />
        <Skeleton height={28} />
        <Skeleton height={160} />
      </Stack>
    );
  }

  const displayId =
    ticket.product.funTicketIds && ticket.shortId
      ? ticket.shortId
      : ticket.number > 0
        ? generateLinearId(ticket.product.name, ticket.number)
        : null;

  const members = workspace?.members ?? [];
  const hasLinks = !!(ticket.branchName ?? ticket.prUrl ?? ticket.designUrl ?? ticket.specUrl);

  return (
    <Stack gap="md">
      {/* Header: type + id */}
      <Group gap="sm">
        <Badge size="xs" variant="light" color={TYPE_COLORS[ticket.type] ?? "gray"}>
          {ticket.type.toLowerCase()}
        </Badge>
        {displayId && (
          <Text size="xs" className="text-text-muted font-mono">
            {displayId}
          </Text>
        )}
      </Group>

      {/* Editable title */}
      <Textarea
        value={titleValue}
        onChange={(e) => setTitleValue(e.currentTarget.value)}
        autosize
        minRows={1}
        maxRows={3}
        variant="unstyled"
        classNames={{ input: "text-text-primary font-bold p-0 leading-tight resize-none" }}
        styles={{ input: { fontWeight: 700, fontSize: "1.25rem" } }}
        onBlur={() => {
          const trimmed = titleValue.trim();
          if (trimmed && trimmed !== ticket.title) setField("title", trimmed);
        }}
      />

      {/* Property strip - line 1: workflow */}
      <div>
        <PillRow>
          <PropertyPill
            tooltip="Status"
            icon={
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: `var(--mantine-color-${STATUS_COLORS[ticket.status] ?? "gray"}-6)` }}
              />
            }
            label={STATUS_LABELS[ticket.status] ?? ticket.status}
          >
            {TICKET_STATUSES.map((s) => (
              <Menu.Item
                key={s.value}
                onClick={() => setField("status", s.value)}
                leftSection={
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: `var(--mantine-color-${s.color}-6)` }}
                  />
                }
              >
                {s.label}
              </Menu.Item>
            ))}
          </PropertyPill>

          <PropertyPill
            tooltip="Priority"
            ghost={ticket.priority == null}
            icon={ticket.priority == null ? <IconFlag size={13} /> : <PriorityIcon priority={ticket.priority} size={13} />}
            label={ticket.priority == null ? "Priority" : (PRIORITY_LABELS[ticket.priority] ?? String(ticket.priority))}
          >
            {[0, 1, 2, 3, 4].map((p) => (
              <Menu.Item key={p} leftSection={<PriorityIcon priority={p} size={13} />} onClick={() => setField("priority", p)}>
                {PRIORITY_LABELS[p]}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item onClick={() => setField("priority", null)}>No priority</Menu.Item>
          </PropertyPill>

          <PropertyPill
            tooltip="DRI"
            ghost={!ticket.assignee}
            icon={
              ticket.assignee ? (
                <Avatar size={16} radius="xl" src={ticket.assignee.image}>
                  {(ticket.assignee.name ?? "?")[0]?.toUpperCase()}
                </Avatar>
              ) : (
                <IconUser size={13} />
              )
            }
            label={ticket.assignee ? (ticket.assignee.name ?? ticket.assignee.email ?? "Unknown") : "DRI"}
          >
            {members.map((m: { user: { id: string; name: string | null } }) => (
              <Menu.Item key={m.user.id} onClick={() => setField("assigneeId", m.user.id)}>
                {m.user.name ?? "Unnamed"}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item onClick={() => setField("assigneeId", null)}>Unassigned</Menu.Item>
          </PropertyPill>

          <PropertyPill
            tooltip="Effort"
            ghost={ticket.points == null}
            icon={<IconFlame size={13} />}
            label={ticket.points == null ? "Effort" : `${ticket.points} pts`}
          >
            {EFFORT_OPTIONS.map((n) => (
              <Menu.Item key={n} onClick={() => setField("points", n)}>
                {n}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item onClick={() => setField("points", null)}>Clear</Menu.Item>
          </PropertyPill>
        </PillRow>

        {/* Property strip - line 2: planning & relations */}
        <div className="mt-1.5">
          <PillRow>
            <PropertyPill
              tooltip="Feature"
              ghost={!ticket.feature}
              icon={<IconFolder size={13} />}
              label={ticket.feature?.name ?? "Feature"}
            >
              {(features ?? []).map((f) => (
                <Menu.Item key={f.id} onClick={() => setField("featureId", f.id)}>
                  {f.name}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item onClick={() => setField("featureId", null)}>No feature</Menu.Item>
            </PropertyPill>

            <PropertyPill
              tooltip="Epic"
              ghost={!ticket.epic}
              icon={<IconTargetArrow size={13} />}
              label={ticket.epic?.name ?? "Epic"}
            >
              {(epics ?? []).map((e) => (
                <Menu.Item key={e.id} onClick={() => setField("epicId", e.id)}>
                  {e.name}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item onClick={() => setField("epicId", null)}>No epic</Menu.Item>
            </PropertyPill>

            <PropertyPill
              tooltip="Cycle"
              ghost={!ticket.cycle}
              icon={<IconRepeat size={13} />}
              label={ticket.cycle?.name ?? "Cycle"}
            >
              {(cycles ?? []).map((c) => (
                <Menu.Item key={c.id} onClick={() => setField("cycleId", c.id)}>
                  {c.name}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item onClick={() => setField("cycleId", null)}>No cycle</Menu.Item>
            </PropertyPill>

            {/* Labels: combobox needs a popover, not a menu */}
            <Popover position="bottom-start" withinPortal shadow="md">
              <Popover.Target>
                <button
                  type="button"
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors cursor-pointer bg-transparent whitespace-nowrap max-w-56 ${
                    (ticket.tags?.length ?? 0) > 0
                      ? "border-border-primary text-text-secondary hover:border-border-focus hover:text-text-primary"
                      : "border-dashed border-border-primary text-text-muted hover:border-border-focus hover:text-text-secondary"
                  }`}
                >
                  <IconTag size={13} />
                  <span className="truncate">
                    {(ticket.tags?.length ?? 0) > 0
                      ? ticket.tags.map((t: { tag: { name: string } }) => t.tag.name).join(", ")
                      : "Labels"}
                  </span>
                </button>
              </Popover.Target>
              <Popover.Dropdown
                styles={{ dropdown: { backgroundColor: "var(--color-bg-elevated)", border: "1px solid var(--color-border-primary)", minWidth: 260 } }}
              >
                <LabelsCombobox
                  selectedIds={ticket.tags?.map((t: { tag: { id: string } }) => t.tag.id) ?? []}
                  allTags={tags?.allTags ?? []}
                  entityTags={ticket.tags ?? []}
                  onChange={(tagIds) => setTicketTags.mutate({ ticketId, tagIds })}
                  onCreate={(name) => {
                    if (workspaceId) createTag.mutate({ name, color: "avatar-blue", workspaceId });
                  }}
                />
              </Popover.Dropdown>
            </Popover>

            {/* Overflow: engineering links */}
            <PropertyPill tooltip="Links" ghost={!hasLinks} icon={<IconDots size={13} />} label={hasLinks ? "Links" : "More"}>
              {ticket.branchName && (
                <Menu.Item leftSection={<IconGitBranch size={13} />} onClick={() => void navigator.clipboard.writeText(ticket.branchName ?? "")}>
                  Copy branch: {ticket.branchName}
                </Menu.Item>
              )}
              {ticket.prUrl && (
                <Menu.Item leftSection={<IconExternalLink size={13} />} component="a" href={ticket.prUrl} target="_blank">
                  Open PR
                </Menu.Item>
              )}
              {ticket.designUrl && (
                <Menu.Item leftSection={<IconExternalLink size={13} />} component="a" href={ticket.designUrl} target="_blank">
                  Open design
                </Menu.Item>
              )}
              {ticket.specUrl && (
                <Menu.Item leftSection={<IconExternalLink size={13} />} component="a" href={ticket.specUrl} target="_blank">
                  Open spec
                </Menu.Item>
              )}
              {!hasLinks && <Menu.Item disabled>No links yet - add them on the full page</Menu.Item>}
            </PropertyPill>
          </PillRow>
        </div>

        {/* Meta - display only, not pills */}
        <Group gap={6} mt={8}>
          <IconCircleDot size={11} className="text-text-muted opacity-60" />
          <Text size="xs" className="text-text-muted">
            Created by {ticket.createdBy?.name ?? "Unknown"} ·{" "}
            {new Date(ticket.createdAt).toLocaleDateString()}
          </Text>
        </Group>
      </div>

      <div className="border-t border-border-primary" />

      {/* Body */}
      <TicketBodyEditor ticketId={ticketId} initialContent={ticket.body} />

      {/* Linked actions - same component as the detail page */}
      <LinkedActionsSection
        ticketId={ticketId}
        actions={ticket.actions ?? []}
        workspaceId={workspaceId}
        onChanged={() => void invalidate()}
      />

      {/* Dependencies */}
      <TicketDependenciesSection
        ticketId={ticketId}
        productId={ticket.product.id}
        basePath={basePath}
        dependsOn={ticket.dependsOn ?? []}
        requiredFor={ticket.requiredFor ?? []}
      />

      {/* Activity - the app-wide feed + composer */}
      <div className="mt-2">
        <CollapsibleSection title="Activity">
          <ActivityFeed
            items={activity.items}
            currentUserId={session?.user?.id}
            onDeleteComment={activity.deleteComment}
            onEditComment={activity.editComment}
            mentionNames={activity.mentionNames}
            emptyMessage="No comments yet. Start the discussion!"
          />
          <ActivityComposer
            onAddComment={activity.addComment}
            commentPlaceholder="Leave a comment... Use @ to mention"
            mentionCandidates={activity.mentionCandidates}
          />
        </CollapsibleSection>
      </div>
    </Stack>
  );
}

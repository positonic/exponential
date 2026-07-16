"use client";

import { useEffect, useState } from "react";
import {
  Avatar,
  Menu,
  Popover,
  Skeleton,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import {
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
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { PropertyPill, PillRow, pillClassName } from "~/app/_components/product/PropertyPill";
import { PriorityIcon, PRIORITY_LABELS } from "~/app/_components/product/PriorityIcon";
import { TicketBodyEditor } from "~/app/_components/product/TicketBodyEditor";
import { LinkedActionsSection } from "~/app/_components/product/LinkedActionsSection";
import { TicketDependenciesSection } from "~/app/_components/product/TicketDependenciesSection";
import { LabelsCombobox } from "~/app/_components/product/LabelsCombobox";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { ActivityTimeline } from "~/app/_components/shared/ActivityTimeline";
import { ActivityFilterMenu, useActivityFilter } from "~/app/_components/shared/ActivityFilterMenu";
import { useTicketActivity } from "~/hooks/useTicketActivity";
import { generateLinearId } from "~/lib/fun-ids";
import {
  TICKET_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
} from "~/lib/ticket-statuses";

const TICKET_TYPES = ["BUG", "FEATURE", "CHORE", "IMPROVEMENT", "SPIKE", "RESEARCH"] as const;

const TYPE_COLORS: Record<string, string> = {
  BUG: "red", FEATURE: "blue", CHORE: "gray", IMPROVEMENT: "teal", SPIKE: "violet", RESEARCH: "yellow",
};

const EFFORT_OPTIONS = [1, 2, 3, 5, 8, 13];

function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: `var(--mantine-color-${color}-6)` }}
    />
  );
}

/**
 * Full ticket content for the peek drawer: everything the detail page offers,
 * with the properties sidebar compressed into ONE pill line. Workflow pills
 * (status/priority/type/DRI/effort) are always present; relational pills
 * (feature/epic/cycle/labels) appear when set or when revealed via the
 * ⋯ overflow - the CreateTicketModal pattern.
 */
export function TicketPeek({ ticketId, basePath }: { ticketId: string; basePath: string }) {
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
    await utils.product.ticket.listEvents.invalidate({ id: ticketId });
    if (ticket?.product.id) {
      await utils.product.ticket.list.invalidate({ productId: ticket.product.id });
    }
  };

  // Optimistic single-field patches: pill edits land instantly in the cached
  // getById (relations rebuilt from the already-loaded option lists), roll
  // back on error, reconcile with a background refetch on settle.
  const updateTicket = api.product.ticket.update.useMutation({
    onMutate: async (vars) => {
      await utils.product.ticket.getById.cancel({ id: ticketId });
      const prev = utils.product.ticket.getById.getData({ id: ticketId });
      if (prev) {
        const next = { ...prev };
        if (vars.title !== undefined) next.title = vars.title;
        if (vars.status !== undefined) next.status = vars.status;
        if (vars.type !== undefined) next.type = vars.type;
        if (vars.priority !== undefined) next.priority = vars.priority ?? null;
        if (vars.points !== undefined) next.points = vars.points ?? null;
        if (vars.assigneeId !== undefined) {
          const m = (workspace?.members ?? []).find(
            (x: { user: { id: string } }) => x.user.id === vars.assigneeId,
          );
          next.assigneeId = vars.assigneeId ?? null;
          next.assignee =
            vars.assigneeId && m
              ? { id: m.user.id, name: m.user.name, email: m.user.email ?? null, image: m.user.image ?? null }
              : null;
        }
        if (vars.featureId !== undefined) {
          const f = (features ?? []).find((x) => x.id === vars.featureId);
          next.featureId = vars.featureId ?? null;
          next.feature = vars.featureId && f ? { id: f.id, name: f.name, status: f.status } : null;
        }
        if (vars.epicId !== undefined) {
          const e = (epics ?? []).find((x) => x.id === vars.epicId);
          next.epicId = vars.epicId ?? null;
          next.epic = vars.epicId && e ? { id: e.id, name: e.name, status: e.status } : null;
        }
        if (vars.cycleId !== undefined) {
          const c = (cycles ?? []).find((x) => x.id === vars.cycleId);
          next.cycleId = vars.cycleId ?? null;
          next.cycle =
            vars.cycleId && c
              ? { id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate }
              : null;
        }
        utils.product.ticket.getById.setData({ id: ticketId }, next);
      }
      return { prev };
    },
    onError: (_err, _vars, mctx) => {
      if (mctx?.prev) {
        utils.product.ticket.getById.setData({ id: ticketId }, mctx.prev);
      }
      notifications.show({
        title: "Update failed",
        message: "Your change was not saved. Please try again.",
        color: "red",
      });
    },
    onSettled: invalidate,
  });
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

  // One-row strip: relational pills render when set or explicitly revealed
  // via the ⋯ overflow.
  // Reveals persist across prev/next flips - collapsing what the user just
  // opened mid-triage was a recall burden.
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const reveal = (key: string) =>
    setRevealed((prev) => new Set(prev).add(key));

  const activity = useTicketActivity(ticketId);
  const [activityFilter, setActivityFilter] = useActivityFilter();

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

  const showFeature = !!ticket.feature || revealed.has("feature");
  const showEpic = !!ticket.epic || revealed.has("epic");
  const showCycle = !!ticket.cycle || revealed.has("cycle");
  const showLabels = (ticket.tags?.length ?? 0) > 0 || revealed.has("labels");

  return (
    <Stack gap="md">
      {/* Id kicker + editable title - one tight block */}
      <div>
        {displayId && (
          // mb via prop: Tailwind margin utilities are dead on Mantine Text
          // (its margin reset wins the cascade).
          <Text size="xs" mb={4} className="text-text-muted font-mono">
            {displayId}
          </Text>
        )}
        <Textarea
          value={titleValue}
          onChange={(e) => setTitleValue(e.currentTarget.value)}
          autosize
          minRows={1}
          maxRows={3}
          variant="unstyled"
          classNames={{ input: "text-text-primary font-bold p-0 leading-tight resize-none" }}
          styles={{ input: { fontWeight: 700, fontSize: "1.25rem", paddingTop: 6, paddingBottom: 6 } }}
          onKeyDown={(e) => {
            // A ticket title has no newlines - Enter commits.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            const trimmed = titleValue.trim();
            if (trimmed && trimmed !== ticket.title) setField("title", trimmed);
          }}
        />
      </div>

      {/* Property strip - one line, wraps; ⋯ reveals the unset relations */}
      <div>
        <PillRow>
          <PropertyPill
            tooltip="Status"
            icon={<ColorDot color={STATUS_COLORS[ticket.status] ?? "gray"} />}
            label={STATUS_LABELS[ticket.status] ?? ticket.status}
          >
            {TICKET_STATUSES.map((s) => (
              <Menu.Item
                key={s.value}
                onClick={() => setField("status", s.value)}
                leftSection={<ColorDot color={s.color} />}
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
            tooltip="Type"
            icon={<ColorDot color={TYPE_COLORS[ticket.type] ?? "gray"} />}
            label={ticket.type.toLowerCase()}
          >
            {TICKET_TYPES.map((t) => (
              <Menu.Item
                key={t}
                onClick={() => setField("type", t)}
                leftSection={<ColorDot color={TYPE_COLORS[t] ?? "gray"} />}
              >
                {t.toLowerCase()}
              </Menu.Item>
            ))}
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

          {showFeature && (
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
          )}

          {showEpic && (
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
          )}

          {showCycle && (
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
          )}

          {showLabels && (
            <Popover position="bottom-start" withinPortal shadow="md">
              <Popover.Target>
                <button
                  type="button"
                  className={pillClassName((ticket.tags?.length ?? 0) === 0)}
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
          )}

          {/* ⋯ overflow: reveal unset relations + engineering links */}
          <PropertyPill tooltip="More" ghost icon={<IconDots size={13} />} label="">
            {!showFeature && <Menu.Item leftSection={<IconFolder size={13} />} onClick={() => reveal("feature")}>Feature</Menu.Item>}
            {!showEpic && <Menu.Item leftSection={<IconTargetArrow size={13} />} onClick={() => reveal("epic")}>Epic</Menu.Item>}
            {!showCycle && <Menu.Item leftSection={<IconRepeat size={13} />} onClick={() => reveal("cycle")}>Cycle</Menu.Item>}
            {!showLabels && <Menu.Item leftSection={<IconTag size={13} />} onClick={() => reveal("labels")}>Labels</Menu.Item>}
            {hasLinks && (!showFeature || !showEpic || !showCycle || !showLabels) && <Menu.Divider />}
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
            {!hasLinks && showFeature && showEpic && showCycle && showLabels && (
              <Menu.Item disabled>Nothing more to add</Menu.Item>
            )}
          </PropertyPill>
        </PillRow>

        {/* No created-by meta line: the Activity timeline's "created this
            ticket" event carries that information. */}
      </div>

      <div className="border-t border-border-primary" />

      {/* Body */}
      <TicketBodyEditor ticketId={ticketId} initialContent={ticket.body} />

      {/* Sections get pt-2 on top of the Stack's 16px gap: 24px between
          sections vs 8px header-to-content inside one - the grouping ratio
          a uniform gap="md" couldn't provide. */}

      {/* Linked actions - same component as the detail page */}
      <div className="pt-2">
        <LinkedActionsSection
          ticketId={ticketId}
          actions={ticket.actions ?? []}
          workspaceId={workspaceId}
          onChanged={() => void invalidate()}
        />
      </div>

      {/* Dependencies - same collapsible section header as Actions/Activity;
          count in the meta slot so a collapsed section still signals deps. */}
      <div className="pt-2">
        <CollapsibleSection
          title="Dependencies"
          meta={
            (ticket.dependsOn?.length ?? 0) + (ticket.requiredFor?.length ?? 0) > 0
              ? String((ticket.dependsOn?.length ?? 0) + (ticket.requiredFor?.length ?? 0))
              : undefined
          }
        >
          <TicketDependenciesSection
            ticketId={ticketId}
            productId={ticket.product.id}
            basePath={basePath}
            dependsOn={ticket.dependsOn ?? []}
            requiredFor={ticket.requiredFor ?? []}
            variant="wide"
            productName={ticket.product.name}
            funTicketIds={ticket.product.funTicketIds}
          />
        </CollapsibleSection>
      </div>

      {/* Activity - the app-wide feed + composer */}
      <div className="pt-2">
        <CollapsibleSection
          title="Activity"
          action={<ActivityFilterMenu value={activityFilter} onChange={setActivityFilter} />}
        >
          <ActivityTimeline activity={activity} filter={activityFilter} />
        </CollapsibleSection>
      </div>
    </Stack>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Drawer,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  Textarea,
  ActionIcon,
  Avatar,
  Anchor,
  Loader,
  NumberInput,
  TextInput,
  Input,
  Select,
  Tooltip,
  Collapse,
} from "@mantine/core";
import { UnifiedDatePicker } from "~/app/_components/UnifiedDatePicker";
import {
  IconArrowRight,
  IconBolt,
  IconBuilding,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconCurrencyDollar,
  IconNote,
  IconPencil,
  IconPercentage,
  IconPlus,
  IconTargetArrow,
  IconTrash,
  IconUser,
  IconUserCheck,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  type: string;
}

interface PipelineOption {
  id: string;
  name: string;
  pipelineStages: PipelineStage[];
}

interface DealDetailDrawerProps {
  dealId: string | null;
  projectId: string;
  opened: boolean;
  onClose: () => void;
  /** Every pipeline in the workspace — lets the deal be moved between them. */
  pipelines: PipelineOption[];
}

// Relative time helper matching the contact detail page's activity feed.
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 60) return "1 month ago";
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return new Date(date).toLocaleDateString();
}

// Highlight card component (same visual language as the contact detail page)
function HighlightCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  const card = (
    <div
      className={`rounded-lg border border-border-primary bg-surface-secondary p-4 ${
        href ? "cursor-pointer hover:border-border-focus transition-colors" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <Text size="xs" className="text-text-muted">
          {label}
        </Text>
        <span className="text-text-muted">{icon}</span>
      </div>
      <div className="mt-2">{value}</div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }
  return card;
}

// Detail row component (same visual language as the contact detail page)
function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-1">
      <div className="w-28 shrink-0 flex items-start gap-1.5">
        <span className="text-text-muted opacity-50">{icon}</span>
        <Text size="xs" className="text-text-muted">
          {label}
        </Text>
      </div>
      <div className="flex-1 text-sm">{value}</div>
    </div>
  );
}

// Collapsible section component (same visual language as the contact detail page)
function CollapsibleSection({
  title,
  defaultOpen = true,
  action,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-primary last:border-b-0">
      <div className="flex items-center justify-between py-3 px-1">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-1 items-center justify-between text-left hover:bg-surface-hover transition-colors"
        >
          <Text size="xs" className="font-medium text-text-muted">
            {isOpen ? "▾" : "▸"} {title}
          </Text>
          {isOpen ? (
            <IconChevronUp size={14} className="text-text-muted" />
          ) : (
            <IconChevronDown size={14} className="text-text-muted" />
          )}
        </button>
        {action ? (
          <div
            className="ml-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {action}
          </div>
        ) : null}
      </div>
      <Collapse in={isOpen}>
        <div className="pb-4 px-1">{children}</div>
      </Collapse>
    </div>
  );
}

const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: "created the deal",
  STAGE_CHANGE: "moved the deal",
  NOTE: "added a note",
  VALUE_CHANGE: "updated the value",
};

export function DealDetailDrawer({
  dealId,
  projectId,
  opened,
  onClose,
  pipelines,
}: DealDetailDrawerProps) {
  const { workspace, workspaceId } = useWorkspace();
  const [noteText, setNoteText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editValue, setEditValue] = useState<number | undefined>();
  const [editProbability, setEditProbability] = useState<number | undefined>();
  const [editExpectedCloseDate, setEditExpectedCloseDate] = useState<Date | null>(null);
  const [editProjectId, setEditProjectId] = useState<string>("");
  const [editStageId, setEditStageId] = useState<string>("");
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [editOrganizationId, setEditOrganizationId] = useState<string | null>(null);

  // Stages of the pipeline currently chosen in the editor.
  const editPipeline =
    pipelines.find((p) => p.id === editProjectId) ?? pipelines[0];
  const editStages = editPipeline?.pipelineStages ?? [];

  const utils = api.useUtils();

  const { data: deal, isLoading } = api.pipeline.getDeal.useQuery(
    { id: dealId! },
    { enabled: !!dealId && opened },
  );

  // Contacts/organizations for the edit form's link selectors.
  const { data: contactsData } = api.crmContact.getAll.useQuery(
    { workspaceId: workspaceId!, limit: 100 },
    { enabled: opened && isEditing && !!workspaceId },
  );
  const { data: orgsData } = api.crmOrganization.getAll.useQuery(
    { workspaceId: workspaceId!, limit: 100 },
    { enabled: opened && isEditing && !!workspaceId },
  );

  const addNoteMutation = api.pipeline.addNote.useMutation({
    onSuccess: () => {
      setNoteText("");
      void utils.pipeline.getDeal.invalidate({ id: dealId! });
    },
  });

  const updateDealMutation = api.pipeline.updateDeal.useMutation({
    onSuccess: (updatedDeal) => {
      setIsEditing(false);
      void utils.pipeline.getDeal.invalidate({ id: dealId! });
      // Refresh both the pipeline being viewed and the destination pipeline, in
      // case the deal was moved between them. Read the destination from the
      // mutation response rather than component state, which may have changed.
      void utils.pipeline.getDeals.invalidate({ projectId });
      void utils.pipeline.getStats.invalidate({ projectId });
      if (updatedDeal.projectId !== projectId) {
        void utils.pipeline.getDeals.invalidate({
          projectId: updatedDeal.projectId,
        });
        void utils.pipeline.getStats.invalidate({
          projectId: updatedDeal.projectId,
        });
      }
      notifications.show({
        title: "Deal updated",
        message: "Changes saved successfully",
        color: "green",
      });
    },
  });

  const deleteDealMutation = api.pipeline.deleteDeal.useMutation({
    onSuccess: () => {
      void utils.pipeline.getDeals.invalidate({ projectId });
      void utils.pipeline.getStats.invalidate({ projectId });
      onClose();
      notifications.show({
        title: "Deal deleted",
        message: "Deal has been removed",
        color: "green",
      });
    },
  });

  function startEditing() {
    if (!deal) return;
    setEditTitle(deal.title);
    setEditValue(deal.value ?? undefined);
    setEditProbability(deal.probability ?? undefined);
    setEditExpectedCloseDate(deal.expectedCloseDate ? new Date(deal.expectedCloseDate) : null);
    setEditProjectId(deal.projectId);
    setEditStageId(deal.stageId);
    setEditContactId(deal.contact?.id ?? null);
    setEditOrganizationId(deal.organization?.id ?? null);
    setIsEditing(true);
  }

  function handleEditPipelineChange(value: string | null) {
    if (!value) return;
    setEditProjectId(value);
    // Stages are per-pipeline, so switching pipelines re-defaults the stage to
    // the destination's first stage ("Lead") unless the current one survives.
    const stages = pipelines.find((p) => p.id === value)?.pipelineStages ?? [];
    setEditStageId(
      stages.some((s) => s.id === editStageId)
        ? editStageId
        : (stages[0]?.id ?? ""),
    );
  }

  function saveEdits() {
    if (!deal) return;
    updateDealMutation.mutate({
      id: deal.id,
      title: editTitle,
      value: editValue ?? null,
      probability: editProbability ?? null,
      expectedCloseDate: editExpectedCloseDate,
      projectId: editProjectId,
      stageId: editStageId,
      contactId: editContactId,
      organizationId: editOrganizationId,
    });
  }

  function formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  // The deal's current contact/organization may fall outside the first page of
  // options, so make sure they are always selectable in the edit form.
  const contactOptions = (() => {
    const options = (contactsData?.contacts ?? []).map((c) => ({
      value: c.id,
      label: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed",
    }));
    if (deal?.contact && !options.some((o) => o.value === deal.contact!.id)) {
      options.unshift({
        value: deal.contact.id,
        label:
          [deal.contact.firstName, deal.contact.lastName]
            .filter(Boolean)
            .join(" ") || "Unnamed",
      });
    }
    return options;
  })();

  const orgOptions = (() => {
    const options = (orgsData?.organizations ?? []).map((o) => ({
      value: o.id,
      label: o.name,
    }));
    if (
      deal?.organization &&
      !options.some((o) => o.value === deal.organization!.id)
    ) {
      options.unshift({
        value: deal.organization.id,
        label: deal.organization.name,
      });
    }
    return options;
  })();

  const basePath = workspace ? `/w/${workspace.slug}/crm` : null;
  const contactName = deal?.contact
    ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(" ") ||
      "Unnamed"
    : null;
  const pipelineName =
    pipelines.find((p) => p.id === deal?.projectId)?.name ?? null;

  return (
    <Drawer
      opened={opened}
      onClose={() => {
        setIsEditing(false);
        onClose();
      }}
      position="right"
      size="lg"
      title={
        <Text fw={600} size="lg">
          Deal Details
        </Text>
      }
    >
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader />
        </div>
      )}

      {deal && !isEditing && (
        <Stack gap="lg">
          {/* Header */}
          <Group justify="space-between" wrap="nowrap">
            <Group gap="md" wrap="nowrap" className="min-w-0">
              <Avatar
                size="lg"
                radius="xl"
                color={getAvatarColor(getColorSeed(deal.title))}
              >
                <span
                  style={{
                    color: getTextColor(getAvatarColor(getColorSeed(deal.title))),
                  }}
                >
                  {getInitial(deal.title)}
                </span>
              </Avatar>
              <div className="min-w-0">
                <Text fw={600} size="xl" className="truncate">
                  {deal.title}
                </Text>
                <Group gap="xs" mt={4}>
                  <Badge variant="light" color={deal.stage.color} size="sm">
                    {deal.stage.name}
                  </Badge>
                  {pipelineName && (
                    <Text size="xs" className="text-text-muted">
                      {pipelineName}
                    </Text>
                  )}
                </Group>
              </div>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Tooltip label="Edit deal">
                <ActionIcon variant="light" onClick={startEditing}>
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Delete deal">
                <ActionIcon
                  variant="light"
                  color="red"
                  onClick={() => deleteDealMutation.mutate({ id: deal.id })}
                  loading={deleteDealMutation.isPending}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {/* Highlights */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <IconBolt size={16} className="text-text-muted" />
              <Text size="sm" className="font-medium text-text-muted">
                Highlights
              </Text>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <HighlightCard
                icon={<IconCurrencyDollar size={14} />}
                label="Value"
                value={
                  deal.value != null ? (
                    <Text size="sm" className="font-medium text-text-primary">
                      {formatCurrency(deal.value, deal.currency)}
                    </Text>
                  ) : (
                    <Text size="sm" className="text-text-muted">
                      No value
                    </Text>
                  )
                }
              />
              <HighlightCard
                icon={<IconTargetArrow size={14} />}
                label="Win probability"
                value={
                  deal.probability != null ? (
                    <Text size="sm" className="font-medium text-text-primary">
                      {deal.probability}%
                    </Text>
                  ) : (
                    <Text size="sm" className="text-text-muted">
                      Not set
                    </Text>
                  )
                }
              />
              <HighlightCard
                icon={<IconCalendar size={14} />}
                label="Expected close"
                value={
                  deal.expectedCloseDate ? (
                    <Text size="sm" className="font-medium text-text-primary">
                      {new Date(deal.expectedCloseDate).toLocaleDateString()}
                    </Text>
                  ) : (
                    <Text size="sm" className="text-text-muted">
                      No close date
                    </Text>
                  )
                }
              />
              <HighlightCard
                icon={<IconUser size={14} />}
                label="Contact"
                href={
                  deal.contact && basePath
                    ? `${basePath}/contacts/${deal.contact.id}`
                    : undefined
                }
                value={
                  contactName ? (
                    <div className="flex items-center gap-2">
                      <Avatar
                        size="xs"
                        radius="xl"
                        color={getAvatarColor(getColorSeed(contactName))}
                      >
                        <span
                          style={{
                            color: getTextColor(
                              getAvatarColor(getColorSeed(contactName)),
                            ),
                            fontSize: 10,
                          }}
                        >
                          {getInitial(contactName)}
                        </span>
                      </Avatar>
                      <Text size="sm" className="font-medium text-text-primary">
                        {contactName}
                      </Text>
                    </div>
                  ) : (
                    <Text size="sm" className="text-text-muted">
                      No contact
                    </Text>
                  )
                }
              />
              <HighlightCard
                icon={<IconBuilding size={14} />}
                label="Company"
                href={
                  deal.organization && basePath
                    ? `${basePath}/organizations/${deal.organization.id}`
                    : undefined
                }
                value={
                  deal.organization ? (
                    <div className="flex items-center gap-2">
                      <Avatar size="xs" radius="sm" color="cyan">
                        {getInitial(deal.organization.name)}
                      </Avatar>
                      <Text size="sm" className="font-medium text-text-primary">
                        {deal.organization.name}
                      </Text>
                    </div>
                  ) : (
                    <Text size="sm" className="text-text-muted">
                      No company
                    </Text>
                  )
                }
              />
              <HighlightCard
                icon={<IconUserCheck size={14} />}
                label="Assignee"
                value={
                  deal.assignedTo ? (
                    <div className="flex items-center gap-2">
                      <Avatar
                        src={deal.assignedTo.image}
                        size="xs"
                        radius="xl"
                        color={getAvatarColor(
                          getColorSeed(deal.assignedTo.name ?? ""),
                        )}
                      >
                        <span
                          style={{
                            color: getTextColor(
                              getAvatarColor(
                                getColorSeed(deal.assignedTo.name ?? ""),
                              ),
                            ),
                            fontSize: 10,
                          }}
                        >
                          {getInitial(deal.assignedTo.name ?? "")}
                        </span>
                      </Avatar>
                      <Text size="sm" className="font-medium text-text-primary">
                        {deal.assignedTo.name}
                      </Text>
                    </div>
                  ) : (
                    <Text size="sm" className="text-text-muted">
                      Unassigned
                    </Text>
                  )
                }
              />
            </div>
          </div>

          {/* Description */}
          {deal.description && (
            <div className="rounded-lg border border-border-primary bg-surface-secondary p-4">
              <div className="flex items-center gap-2 mb-2">
                <IconNote size={16} className="text-text-muted" />
                <Text size="sm" className="font-medium text-text-primary">
                  Description
                </Text>
              </div>
              <Text size="sm" className="text-text-secondary">
                {deal.description}
              </Text>
            </div>
          )}

          {/* Activity */}
          <div className="rounded-lg border border-border-primary bg-surface-secondary">
            <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
              <div className="flex items-center gap-2">
                <IconBolt size={16} className="text-text-muted" />
                <Text size="sm" className="font-medium text-text-primary">
                  Activity
                </Text>
                <Badge size="xs" variant="light">
                  {deal.activities.length}
                </Badge>
              </div>
            </div>
            <div className="px-4 divide-y divide-border-primary">
              {deal.activities.length === 0 && (
                <div className="py-8 text-center">
                  <Text size="sm" className="text-text-muted">
                    No activity yet
                  </Text>
                </div>
              )}
              {deal.activities.map((activity) => {
                const actor = activity.user?.name ?? "System";
                return (
                  <div key={activity.id} className="flex items-start gap-3 py-3">
                    <Avatar
                      src={activity.user?.image}
                      size="sm"
                      radius="xl"
                      className="mt-0.5"
                      color={getAvatarColor(getColorSeed(actor))}
                    >
                      {activity.type === "STAGE_CHANGE" ? (
                        <IconArrowRight size={14} />
                      ) : activity.type === "NOTE" ? (
                        <IconNote size={14} />
                      ) : activity.type === "VALUE_CHANGE" ? (
                        <IconCurrencyDollar size={14} />
                      ) : (
                        <span
                          style={{
                            color: getTextColor(
                              getAvatarColor(getColorSeed(actor)),
                            ),
                          }}
                        >
                          {getInitial(actor)}
                        </span>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <div>
                          <Text
                            span
                            size="sm"
                            className="font-medium text-text-primary"
                          >
                            {actor}
                          </Text>{" "}
                          <Text span size="sm" className="text-text-muted">
                            {ACTIVITY_LABELS[activity.type] ??
                              activity.type.replace("_", " ").toLowerCase()}
                          </Text>
                        </div>
                        <Text size="xs" className="text-text-muted">
                          {getRelativeTime(new Date(activity.createdAt))}
                        </Text>
                      </div>
                      {activity.content && (
                        <Text
                          size="sm"
                          className="text-text-secondary mt-1"
                        >
                          {activity.content}
                        </Text>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Add note */}
            <div className="border-t border-border-primary p-4">
              <Textarea
                placeholder="Write a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.currentTarget.value)}
                minRows={2}
              />
              <Group justify="flex-end" mt="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    if (!noteText.trim()) return;
                    addNoteMutation.mutate({
                      dealId: deal.id,
                      content: noteText.trim(),
                    });
                  }}
                  loading={addNoteMutation.isPending}
                  disabled={!noteText.trim()}
                >
                  Add Note
                </Button>
              </Group>
            </div>
          </div>

          {/* Record Details */}
          <div>
            <CollapsibleSection
              title="Record Details"
              action={
                <Tooltip label="Edit details">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={startEditing}
                    aria-label="Edit deal details"
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                </Tooltip>
              }
            >
              <Stack gap="sm">
                <DetailRow
                  icon={<IconNote size={14} />}
                  label="Title"
                  value={<Text className="text-text-primary">{deal.title}</Text>}
                />
                <DetailRow
                  icon={<IconBolt size={14} />}
                  label="Stage"
                  value={
                    <Badge variant="light" color={deal.stage.color} size="sm">
                      {deal.stage.name}
                    </Badge>
                  }
                />
                <DetailRow
                  icon={<IconCurrencyDollar size={14} />}
                  label="Value"
                  value={
                    deal.value != null ? (
                      <Text className="text-text-primary">
                        {formatCurrency(deal.value, deal.currency)}
                      </Text>
                    ) : (
                      <Text className="text-text-muted">—</Text>
                    )
                  }
                />
                <DetailRow
                  icon={<IconPercentage size={14} />}
                  label="Probability"
                  value={
                    deal.probability != null ? (
                      <Text className="text-text-primary">
                        {deal.probability}%
                      </Text>
                    ) : (
                      <Text className="text-text-muted">—</Text>
                    )
                  }
                />
                <DetailRow
                  icon={<IconCalendar size={14} />}
                  label="Expected close"
                  value={
                    deal.expectedCloseDate ? (
                      <Text className="text-text-primary">
                        {new Date(deal.expectedCloseDate).toLocaleDateString()}
                      </Text>
                    ) : (
                      <Text className="text-text-muted">—</Text>
                    )
                  }
                />
                {deal.closedAt && (
                  <DetailRow
                    icon={<IconCalendar size={14} />}
                    label="Closed"
                    value={
                      <Text className="text-text-primary">
                        {new Date(deal.closedAt).toLocaleDateString()}
                      </Text>
                    }
                  />
                )}
                <DetailRow
                  icon={<IconUser size={14} />}
                  label="Contact"
                  value={
                    deal.contact && basePath ? (
                      <Anchor
                        component={Link}
                        href={`${basePath}/contacts/${deal.contact.id}`}
                        size="sm"
                      >
                        {contactName}
                      </Anchor>
                    ) : (
                      <Text className="text-text-muted">—</Text>
                    )
                  }
                />
                <DetailRow
                  icon={<IconBuilding size={14} />}
                  label="Company"
                  value={
                    deal.organization && basePath ? (
                      <Anchor
                        component={Link}
                        href={`${basePath}/organizations/${deal.organization.id}`}
                        size="sm"
                      >
                        {deal.organization.name}
                      </Anchor>
                    ) : (
                      <Text className="text-text-muted">—</Text>
                    )
                  }
                />
                <DetailRow
                  icon={<IconUserCheck size={14} />}
                  label="Assignee"
                  value={
                    deal.assignedTo ? (
                      <Text className="text-text-primary">
                        {deal.assignedTo.name}
                      </Text>
                    ) : (
                      <Text className="text-text-muted">—</Text>
                    )
                  }
                />
              </Stack>
            </CollapsibleSection>
          </div>
        </Stack>
      )}

      {deal && isEditing && (
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600} size="lg">
              Edit Deal
            </Text>
            <Group gap="xs">
              <ActionIcon
                variant="light"
                color="green"
                onClick={saveEdits}
                loading={updateDealMutation.isPending}
                aria-label="Save changes"
              >
                <IconCheck size={16} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                color="gray"
                onClick={() => setIsEditing(false)}
                aria-label="Cancel editing"
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
          </Group>

          <TextInput
            label="Title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.currentTarget.value)}
          />
          {pipelines.length > 1 && (
            <Select
              label="Pipeline"
              data={pipelines.map((p) => ({ value: p.id, label: p.name }))}
              value={editProjectId}
              onChange={handleEditPipelineChange}
              allowDeselect={false}
            />
          )}
          <Select
            label="Stage"
            data={editStages.map((s) => ({ value: s.id, label: s.name }))}
            value={editStageId}
            onChange={(val) => val && setEditStageId(val)}
            allowDeselect={false}
          />
          <Group grow>
            <NumberInput
              label="Value"
              prefix="$"
              min={0}
              thousandSeparator=","
              value={editValue ?? ""}
              onChange={(val) => setEditValue(typeof val === "number" ? val : undefined)}
            />
            <NumberInput
              label="Probability"
              suffix="%"
              min={0}
              max={100}
              value={editProbability ?? ""}
              onChange={(val) => setEditProbability(typeof val === "number" ? val : undefined)}
            />
          </Group>
          <Select
            label="Contact"
            placeholder="Link to a contact"
            data={contactOptions}
            value={editContactId}
            onChange={setEditContactId}
            searchable
            clearable
          />
          <Select
            label="Organization"
            placeholder="Link to an organization"
            data={orgOptions}
            value={editOrganizationId}
            onChange={setEditOrganizationId}
            searchable
            clearable
          />
          <Input.Wrapper label="Expected Close Date">
            <div>
              <UnifiedDatePicker
                value={editExpectedCloseDate}
                onChange={setEditExpectedCloseDate}
                placeholder="Select date"
                notificationContext="deal"
              />
            </div>
          </Input.Wrapper>
        </Stack>
      )}
    </Drawer>
  );
}

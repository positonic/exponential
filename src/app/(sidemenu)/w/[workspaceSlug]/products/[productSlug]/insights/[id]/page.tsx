"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { JSONContent } from "@tiptap/core";
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCalendar,
  IconCategory,
  IconChevronDown,
  IconChevronRight,
  IconCircleDot,
  IconCopy,
  IconDots,
  IconFlask,
  IconGauge,
  IconGitMerge,
  IconLink,
  IconMoodSmile,
  IconPlayerPause,
  IconPlayerPlay,
  IconTag,
  IconTarget,
  IconTrash,
  IconUser,
  IconWorld,
  IconWorldOff,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useSession } from "next-auth/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import {
  PropertiesSidebar,
  PropertyRow,
  PropertyDivider,
} from "~/app/_components/PropertiesSidebar";
import { InsightDocument } from "~/app/_components/product/InsightDocument";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { CommentInput } from "~/app/_components/shared/CommentInput";
import {
  INSIGHT_TYPES,
  TYPE_MAP,
  STATUS_OPTIONS,
  STATUS_COLORS,
  PUBLISHABLE_INSIGHT_TYPES,
  type InsightStatus,
  type InsightType,
} from "~/app/_components/product/insightMeta";

const SCORE_OPTIONS = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

const SENTIMENT_OPTIONS = [
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
];

const statusLabel = (v: unknown): string =>
  STATUS_OPTIONS.find((s) => s.value === v)?.label ??
  (typeof v === "string" ? v : "?");

/**
 * Human copy for a WorkspaceActivityEvent row on this insight's timeline.
 * Events carry their specifics in `metadata` (`change` discriminates the
 * "updated" events); unknown events render as null and are skipped.
 */
function describeEvent(action: string, metadata: unknown): string | null {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  if (action === "status_changed") {
    return `changed status from ${statusLabel(meta.from)} to ${statusLabel(meta.to)}`;
  }
  switch (meta.change) {
    case "published":
      return "published this to the feedback board";
    case "unpublished":
      return "removed this from the feedback board";
    case "marked_duplicate":
      return `marked this as a duplicate of "${typeof meta.canonicalTitle === "string" ? meta.canonicalTitle : "another insight"}"`;
    case "duplicate_added":
      return `marked "${typeof meta.duplicateTitle === "string" ? meta.duplicateTitle : "another insight"}" as a duplicate of this`;
    case "unmarked_duplicate":
      return "removed the duplicate mark";
    default:
      return null;
  }
}

export default function InsightDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productSlug = params.productSlug as string;
  const insightId = params.id as string;
  const { workspace } = useWorkspace();
  const { data: session } = useSession();
  const utils = api.useUtils();

  const { data: insight, isLoading } = api.product.insight.getById.useQuery(
    { id: insightId },
    { enabled: !!insightId },
  );

  // Local drafts for text fields that save on blur.
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [parkModalOpen, setParkModalOpen] = useState(false);
  const [parkReason, setParkReason] = useState("");
  const [dupModalOpen, setDupModalOpen] = useState(false);
  const [dupTargetId, setDupTargetId] = useState<string | null>(null);
  const [activityCollapsed, setActivityCollapsed] = useState(false);

  useEffect(() => {
    if (insight) {
      setTitle(insight.title);
      setCategory(insight.category ?? "");
      setSource(insight.source ?? "");
    }
  }, [insight]);

  const invalidate = async () => {
    await utils.product.insight.getById.invalidate({ id: insightId });
    if (insight?.product.id) {
      void utils.product.insight.list.invalidate({ productId: insight.product.id });
    }
  };

  const updateInsight = api.product.insight.update.useMutation({
    onSuccess: invalidate,
  });
  const deleteInsight = api.product.insight.delete.useMutation();
  const parkInsight = api.product.insight.park.useMutation({ onSuccess: invalidate });
  const unparkInsight = api.product.insight.unpark.useMutation({ onSuccess: invalidate });
  const publishInsight = api.product.insight.publish.useMutation({ onSuccess: invalidate });
  const unpublishInsight = api.product.insight.unpublish.useMutation({ onSuccess: invalidate });
  const setFeatures = api.product.insight.setFeatures.useMutation({
    onSuccess: invalidate,
  });

  const invalidateActivity = async () => {
    await invalidate();
    await utils.product.insight.listEvents.invalidate({ id: insightId });
  };
  const markDuplicate = api.product.insight.markDuplicate.useMutation({
    onSuccess: invalidateActivity,
  });
  const unmarkDuplicate = api.product.insight.unmarkDuplicate.useMutation({
    onSuccess: invalidateActivity,
  });
  const addComment = api.product.insight.addComment.useMutation({ onSuccess: invalidate });
  const deleteComment = api.product.insight.deleteComment.useMutation({
    onSuccess: invalidate,
  });

  const { data: events } = api.product.insight.listEvents.useQuery(
    { id: insightId },
    { enabled: !!insightId },
  );

  const { data: features } = api.product.feature.list.useQuery(
    { productId: insight?.product.id ?? "" },
    { enabled: !!insight?.product.id },
  );

  // Candidates for the "Mark as duplicate" picker: other insights of the same
  // product (the list excludes duplicates by default, so targets are always
  // canonical).
  const { data: dupCandidates } = api.product.insight.list.useQuery(
    { productId: insight?.product.id ?? "" },
    { enabled: dupModalOpen && !!insight?.product.id },
  );

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={20} width={120} />
        <Skeleton height={36} width="60%" />
        <Skeleton height={200} />
      </Stack>
    );
  }

  if (!insight) return <Text className="text-text-muted">Insight not found</Text>;

  const backPath = `/w/${workspace?.slug}/products/${productSlug}/insights`;
  const typeDef = TYPE_MAP[insight.type];
  const TypeIcon = typeDef?.icon ?? IconTarget;
  const isParked = insight.parkedAt != null;

  // Unified activity feed: comments + system events, oldest first.
  const commentItems = insight.comments.map((c) => ({
    kind: "comment" as const,
    createdAt: new Date(c.createdAt),
    comment: c,
  }));
  const eventItems = (events ?? []).flatMap((e) => {
    const text = describeEvent(e.action, e.metadata);
    return text
      ? [{ kind: "event" as const, createdAt: new Date(e.createdAt), event: e, text }]
      : [];
  });
  const feed = [...commentItems, ...eventItems].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== insight.title) {
      updateInsight.mutate({ id: insight.id, title: next });
    } else {
      setTitle(insight.title);
    }
  };

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Delete insight",
      children: (
        <Text size="sm">Delete &quot;{insight.title}&quot;? This cannot be undone.</Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () =>
        deleteInsight.mutate(
          { id: insight.id },
          {
            onSuccess: () => {
              void utils.product.insight.list.invalidate({
                productId: insight.product.id,
              });
              router.push(backPath);
            },
          },
        ),
    });
  };

  return (
    <div className="flex min-h-0">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto pr-6">
        <Stack gap="lg">
          {/* Back nav */}
          <Link
            href={backPath}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <IconArrowLeft size={14} />
            Insights
          </Link>

          {/* Duplicate banner - this insight defers to its canonical. */}
          {insight.duplicateOf && (
            <div className="flex items-center gap-2 border border-border-primary rounded-lg px-3 py-2 bg-surface-secondary">
              <IconGitMerge size={14} className="text-text-muted shrink-0" />
              <Text size="sm" className="text-text-secondary flex-1 min-w-0" lineClamp={1}>
                Duplicate of{" "}
                <Link
                  href={`${backPath}/${insight.duplicateOf.id}`}
                  className="text-brand-primary hover:underline"
                >
                  {insight.duplicateOf.title}
                </Link>
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                onClick={() => unmarkDuplicate.mutate({ id: insight.id })}
                loading={unmarkDuplicate.isPending}
              >
                Not a duplicate
              </Button>
            </div>
          )}

          {/* Badges + title + overflow menu */}
          <div>
            <Group gap="sm" mb={8}>
              <Badge
                size="xs"
                variant="light"
                color={typeDef?.color ?? "gray"}
                leftSection={<TypeIcon size={11} />}
              >
                {typeDef?.label ?? insight.type}
              </Badge>
              <Badge size="xs" variant="light" color={STATUS_COLORS[insight.status] ?? "gray"}>
                {STATUS_OPTIONS.find((s) => s.value === insight.status)?.label ?? insight.status}
              </Badge>
              {isParked && (
                <Badge size="xs" variant="light" color="orange">
                  parked
                </Badge>
              )}
              {insight.publishedAt != null && (
                <Badge
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconWorld size={11} />}
                >
                  public
                </Badge>
              )}
            </Group>

            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Textarea
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                variant="unstyled"
                autosize
                minRows={1}
                className="flex-1"
                styles={{
                  input: {
                    fontSize: "1.375rem",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    padding: 0,
                  },
                }}
              />
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" className="text-text-muted">
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconCopy size={14} />}
                    onClick={() => {
                      void navigator.clipboard.writeText(window.location.href);
                    }}
                  >
                    Copy link
                  </Menu.Item>
                  {!insight.duplicateOf && (
                    <Menu.Item
                      leftSection={<IconGitMerge size={14} />}
                      onClick={() => {
                        setDupTargetId(null);
                        setDupModalOpen(true);
                      }}
                    >
                      Mark as duplicate...
                    </Menu.Item>
                  )}
                  {PUBLISHABLE_INSIGHT_TYPES.includes(insight.type) &&
                    (insight.publishedAt != null ? (
                      <Menu.Item
                        leftSection={<IconWorldOff size={14} />}
                        onClick={() => unpublishInsight.mutate({ id: insight.id })}
                      >
                        Unpublish from board
                      </Menu.Item>
                    ) : (
                      <Menu.Item
                        leftSection={<IconWorld size={14} />}
                        onClick={() => publishInsight.mutate({ id: insight.id })}
                      >
                        Publish to board
                      </Menu.Item>
                    ))}
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={handleDelete}
                  >
                    Delete insight
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </div>

          {/* Body - rich document (ADR-0024). Editable for any workspace member
              (getById already gates membership). */}
          <InsightDocument
            insightId={insight.id}
            bodyDoc={(insight.bodyDoc as JSONContent | null) ?? null}
            body={insight.body ?? null}
            docVersion={insight.docVersion}
            editable
          />

          {/* Legacy evidence field (pre-fold Problems / older insights). */}
          {insight.evidence && (
            <div className="border border-border-primary rounded-lg p-3">
              <Text size="xs" className="text-text-muted uppercase tracking-wider mb-1">
                Evidence
              </Text>
              <MarkdownRenderer content={insight.evidence} variant="compact" />
            </div>
          )}

          {/* Duplicates of this (canonical) insight - each is a separate piece
              of evidence for the same thing. */}
          {insight.duplicates.length > 0 && (
            <div className="border border-border-primary rounded-lg p-3">
              <Text size="xs" className="text-text-muted uppercase tracking-wider mb-2">
                Duplicates ({insight.duplicates.length})
              </Text>
              <Stack gap={4}>
                {insight.duplicates.map((d) => (
                  <Link
                    key={d.id}
                    href={`${backPath}/${d.id}`}
                    className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <IconGitMerge size={13} className="text-text-muted shrink-0" />
                    <span className="truncate">{d.title}</span>
                  </Link>
                ))}
              </Stack>
            </div>
          )}

          {/* Activity - comments merged with system events (status changes,
              publish/unpublish, duplicate marks) by time. */}
          <div>
            <button
              className="flex items-center gap-1.5 mb-3"
              onClick={() => setActivityCollapsed((v) => !v)}
            >
              {activityCollapsed ? (
                <IconChevronRight size={13} className="text-text-muted" />
              ) : (
                <IconChevronDown size={13} className="text-text-muted" />
              )}
              <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
                Activity
              </Text>
            </button>

            {!activityCollapsed && feed.length > 0 && (
              <Stack gap="sm" mb="md">
                {feed.map((item) =>
                  item.kind === "comment" ? (
                    <div
                      key={`c-${item.comment.id}`}
                      className="border border-border-primary rounded-lg p-3"
                    >
                      <Group justify="space-between" align="flex-start">
                        <div className="flex-1">
                          <Group gap="xs" mb={4}>
                            <Avatar size="xs" radius="xl" src={item.comment.author.image}>
                              {(item.comment.author.name ?? "?")[0]?.toUpperCase()}
                            </Avatar>
                            <Text size="xs" fw={500} className="text-text-secondary">
                              {item.comment.author.name}
                            </Text>
                            <Text size="xs" className="text-text-muted">
                              {new Date(item.comment.createdAt).toLocaleDateString()}
                            </Text>
                          </Group>
                          <div className="ml-6">
                            <MarkdownRenderer content={item.comment.content} />
                          </div>
                        </div>
                        {/* Server restricts deletes to the author - only
                            offer the button where it can succeed. */}
                        {item.comment.author.id === session?.user?.id && (
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="xs"
                            onClick={() => deleteComment.mutate({ id: item.comment.id })}
                          >
                            <IconTrash size={12} />
                          </ActionIcon>
                        )}
                      </Group>
                    </div>
                  ) : (
                    <Group key={`e-${item.event.id}`} gap="xs" wrap="nowrap" className="px-1">
                      <Avatar size={16} radius="xl" src={item.event.user?.image}>
                        {(item.event.user?.name ?? "?")[0]?.toUpperCase()}
                      </Avatar>
                      <Text size="xs" className="text-text-muted min-w-0" lineClamp={2}>
                        <Text span size="xs" fw={500} className="text-text-secondary">
                          {item.event.user?.name ?? "Someone"}
                        </Text>{" "}
                        {item.text} · {new Date(item.event.createdAt).toLocaleDateString()}
                      </Text>
                    </Group>
                  ),
                )}
              </Stack>
            )}

            {!activityCollapsed && (
              <CommentInput
                placeholder="Leave a comment..."
                isSubmitting={addComment.isPending}
                onSubmit={async (content) => {
                  await addComment.mutateAsync({ insightId: insight.id, content });
                }}
              />
            )}
          </div>
        </Stack>
      </div>

      {/* Properties sidebar */}
      <PropertiesSidebar>
        <PropertyRow icon={<IconCircleDot size={14} />} label="Status">
          <Select
            value={insight.status}
            onChange={(v) =>
              v && updateInsight.mutate({ id: insight.id, status: v as InsightStatus })
            }
            data={STATUS_OPTIONS}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconCategory size={14} />} label="Type">
          <Select
            value={insight.type}
            onChange={(v) =>
              v && updateInsight.mutate({ id: insight.id, type: v as InsightType })
            }
            data={INSIGHT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconGauge size={14} />} label="Impact">
          <Select
            value={insight.impact != null ? String(insight.impact) : null}
            onChange={(v) =>
              updateInsight.mutate({ id: insight.id, impact: v ? Number(v) : null })
            }
            data={SCORE_OPTIONS}
            placeholder="1-5"
            size="xs"
            variant="unstyled"
            clearable
            comboboxProps={{ withinPortal: true }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconGauge size={14} />} label="Confidence">
          <Select
            value={insight.confidence != null ? String(insight.confidence) : null}
            onChange={(v) =>
              updateInsight.mutate({ id: insight.id, confidence: v ? Number(v) : null })
            }
            data={SCORE_OPTIONS}
            placeholder="1-5"
            size="xs"
            variant="unstyled"
            clearable
            comboboxProps={{ withinPortal: true }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconTag size={14} />} label="Category">
          <TextInput
            value={category}
            onChange={(e) => setCategory(e.currentTarget.value)}
            onBlur={() => {
              const next = category.trim();
              if (next !== (insight.category ?? "")) {
                updateInsight.mutate({ id: insight.id, category: next || null });
              }
            }}
            placeholder="None"
            size="xs"
            variant="unstyled"
          />
        </PropertyRow>

        {insight.type === "FEEDBACK" && (
          <PropertyRow icon={<IconMoodSmile size={14} />} label="Sentiment">
            <Select
              value={insight.sentiment}
              onChange={(v) =>
                updateInsight.mutate({
                  id: insight.id,
                  sentiment: (v ?? null) as "positive" | "neutral" | "negative" | null,
                })
              }
              data={SENTIMENT_OPTIONS}
              placeholder="None"
              size="xs"
              variant="unstyled"
              clearable
              comboboxProps={{ withinPortal: true }}
            />
          </PropertyRow>
        )}

        <PropertyRow icon={<IconLink size={14} />} label="Source">
          <TextInput
            value={source}
            onChange={(e) => setSource(e.currentTarget.value)}
            onBlur={() => {
              const next = source.trim();
              if (next !== (insight.source ?? "")) {
                updateInsight.mutate({ id: insight.id, source: next || null });
              }
            }}
            placeholder="None"
            size="xs"
            variant="unstyled"
          />
        </PropertyRow>

        <PropertyDivider />

        <PropertyRow icon={<IconTarget size={14} />} label="Features">
          <MultiSelect
            value={insight.features.map((f) => f.feature.id)}
            onChange={(next) =>
              setFeatures.mutate({ insightId: insight.id, featureIds: next })
            }
            data={(features ?? []).map((f) => ({ value: f.id, label: f.name }))}
            placeholder={insight.features.length === 0 ? "None" : undefined}
            size="xs"
            variant="unstyled"
            searchable
            comboboxProps={{ withinPortal: true }}
            nothingFoundMessage="No features yet"
          />
        </PropertyRow>

        {insight.research && (
          <PropertyRow icon={<IconFlask size={14} />} label="Research">
            <Text size="xs" className="text-text-secondary" lineClamp={1}>
              {insight.research.title}
            </Text>
          </PropertyRow>
        )}

        <PropertyDivider />

        {isParked ? (
          <>
            <PropertyRow icon={<IconPlayerPause size={14} />} label="Parked">
              <Text size="xs" className="text-text-secondary" lineClamp={2}>
                {insight.parkReason}
              </Text>
            </PropertyRow>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={() => unparkInsight.mutate({ id: insight.id })}
              loading={unparkInsight.isPending}
            >
              Unpark
            </Button>
          </>
        ) : (
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconPlayerPause size={14} />}
            onClick={() => {
              setParkReason("");
              setParkModalOpen(true);
            }}
          >
            Park
          </Button>
        )}

        <PropertyDivider />

        <PropertyRow icon={<IconUser size={14} />} label="Created by">
          <div className="flex items-center gap-1.5">
            <Avatar size="xs" radius="xl" src={insight.createdBy?.image}>
              {(insight.createdBy?.name ?? "?")[0]?.toUpperCase()}
            </Avatar>
            <Text size="xs" className="text-text-secondary" lineClamp={1}>
              {insight.createdBy?.name ?? "Unknown"}
            </Text>
          </div>
        </PropertyRow>

        <PropertyRow icon={<IconCalendar size={14} />} label="Created">
          <Text size="xs" className="text-text-secondary">
            {new Date(insight.createdAt).toLocaleDateString()}
          </Text>
        </PropertyRow>
      </PropertiesSidebar>

      {/* Park modal - collects a meaningful reason (parking = defer WITH a reason). */}
      <Modal
        opened={parkModalOpen}
        onClose={() => setParkModalOpen(false)}
        title="Park insight"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" className="text-text-muted">
            Parking defers &quot;{insight.title}&quot; with a reason; it keeps its status and
            can be revived later.
          </Text>
          <Textarea
            label="Reason"
            placeholder="Why park this? e.g. out of scope, duplicate, insufficient evidence"
            value={parkReason}
            onChange={(e) => setParkReason(e.currentTarget.value)}
            data-autofocus
            autosize
            minRows={2}
            maxRows={5}
            required
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setParkModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const reason = parkReason.trim();
                if (!reason) return;
                parkInsight.mutate({ id: insight.id, reason });
                setParkModalOpen(false);
              }}
              disabled={!parkReason.trim()}
              loading={parkInsight.isPending}
            >
              Park
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Mark-as-duplicate modal - pick the canonical insight this one
          duplicates. Non-destructive: content stays, the insight just defers
          to the canonical and drops out of default lists. */}
      <Modal
        opened={dupModalOpen}
        onClose={() => setDupModalOpen(false)}
        title="Mark as duplicate"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" className="text-text-muted">
            &quot;{insight.title}&quot; keeps all its content and remains linked as
            evidence, but defers to the insight you pick and is hidden from the
            default list.
          </Text>
          <Select
            label="Duplicate of"
            placeholder="Pick the canonical insight"
            value={dupTargetId}
            onChange={setDupTargetId}
            data={(dupCandidates ?? [])
              .filter((c) => c.id !== insight.id)
              .map((c) => ({ value: c.id, label: c.title }))}
            searchable
            nothingFoundMessage="No other insights"
            data-autofocus
            comboboxProps={{ withinPortal: true }}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDupModalOpen(false)}>
              Cancel
            </Button>
            <Button
              leftSection={<IconGitMerge size={14} />}
              onClick={() => {
                if (!dupTargetId) return;
                markDuplicate.mutate({ id: insight.id, canonicalId: dupTargetId });
                setDupModalOpen(false);
              }}
              disabled={!dupTargetId}
              loading={markDuplicate.isPending}
            >
              Mark duplicate
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}

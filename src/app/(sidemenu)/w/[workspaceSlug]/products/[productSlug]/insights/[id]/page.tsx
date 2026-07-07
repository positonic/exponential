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
  IconCircleDot,
  IconCopy,
  IconDots,
  IconFlask,
  IconGauge,
  IconLink,
  IconMoodSmile,
  IconPlayerPause,
  IconPlayerPlay,
  IconTag,
  IconTarget,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import {
  PropertiesSidebar,
  PropertyRow,
  PropertyDivider,
} from "~/app/_components/PropertiesSidebar";
import { InsightDocument } from "~/app/_components/product/InsightDocument";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import {
  INSIGHT_TYPES,
  TYPE_MAP,
  STATUS_OPTIONS,
  STATUS_COLORS,
  type InsightStatus,
  type InsightType,
} from "~/app/_components/product/insightMeta";

const SCORE_OPTIONS = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

const SENTIMENT_OPTIONS = [
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
];

export default function InsightDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productSlug = params.productSlug as string;
  const insightId = params.id as string;
  const { workspace } = useWorkspace();
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
  const setFeatures = api.product.insight.setFeatures.useMutation({
    onSuccess: invalidate,
  });

  const { data: features } = api.product.feature.list.useQuery(
    { productId: insight?.product.id ?? "" },
    { enabled: !!insight?.product.id },
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
    </div>
  );
}

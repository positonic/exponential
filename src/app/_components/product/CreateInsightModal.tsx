"use client";

import { useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Menu,
  Modal,
  MultiSelect,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  IconDots,
  IconGauge,
  IconMoodSmile,
  IconTargetArrow,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  INSIGHT_TYPES,
  TYPE_MAP,
  type InsightType,
} from "~/app/_components/product/insightMeta";

const SCORE_VALUES = [1, 2, 3, 4, 5];

const SENTIMENT_OPTIONS = [
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
];

// ---------------------------------------------------------------------------
// Pill button - a Menu trigger that looks like a compact chip
// ---------------------------------------------------------------------------

function Pill({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border-primary px-2.5 py-1 text-xs font-medium text-text-secondary hover:border-border-focus hover:text-text-primary transition-colors cursor-pointer bg-transparent whitespace-nowrap"
        >
          {icon}
          <span>{label}</span>
        </button>
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CreateInsightModalProps {
  opened: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
}

export function CreateInsightModal({
  opened,
  onClose,
  productId,
  productName,
}: CreateInsightModalProps) {
  const utils = api.useUtils();
  const titleRef = useRef<HTMLInputElement>(null);

  // core
  const [type, setType] = useState<InsightType>("PAIN_POINT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [impact, setImpact] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [sentiment, setSentiment] = useState<string | null>(null);

  // overflow
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [showSource, setShowSource] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);

  const [createMore, setCreateMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: features } = api.product.feature.list.useQuery(
    { productId },
    { enabled: !!productId && opened && showFeatures },
  );

  // Reset capture fields but keep type + revealed rows - "create more" is for
  // batch capture (e.g. dumping interview notes), where consecutive insights
  // usually share a type and source.
  const resetCapture = () => {
    setTitle("");
    setBody("");
    setImpact(null);
    setConfidence(null);
    setSentiment(null);
    setFeatureIds([]);
    setError(null);
  };

  const resetAll = () => {
    resetCapture();
    setType("PAIN_POINT");
    setSource("");
    setCategory("");
    setShowSource(false);
    setShowCategory(false);
    setShowFeatures(false);
  };

  const create = api.product.insight.create.useMutation({
    onSuccess: async () => {
      await utils.product.insight.list.invalidate({ productId });
      if (createMore) {
        resetCapture();
        titleRef.current?.focus();
      } else {
        resetAll();
        onClose();
      }
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = () => {
    if (!title.trim() || create.isPending) return;
    create.mutate({
      productId,
      type,
      title: title.trim(),
      body: body.trim() || undefined,
      source: source.trim() || undefined,
      sentiment: (sentiment ?? undefined) as
        | "positive"
        | "neutral"
        | "negative"
        | undefined,
      category: category.trim() || undefined,
      impact: impact ?? undefined,
      confidence: confidence ?? undefined,
      featureIds: featureIds.length > 0 ? featureIds : undefined,
    });
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const typeDef = TYPE_MAP[type];
  const TypeIcon = typeDef?.icon ?? IconTargetArrow;
  const sentimentLabel = sentiment
    ? SENTIMENT_OPTIONS.find((o) => o.value === sentiment)?.label ?? "Sentiment"
    : "Sentiment";

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="lg"
      radius="lg"
      padding={0}
      withCloseButton={false}
      styles={{
        content: {
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
        body: {
          padding: 0,
          display: "flex",
          flexDirection: "column",
          flex: 1,
        },
      }}
    >
      <div
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="light" size="sm" radius="sm" className="uppercase">
              {productName}
            </Badge>
            <Text span size="sm" className="text-text-muted">
              New insight
            </Text>
          </div>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={handleClose}
            className="text-text-muted hover:text-text-primary"
          >
            <IconX size={16} />
          </ActionIcon>
        </div>

        {/* Title */}
        <div className="px-5 pt-5">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-transparent text-base font-medium text-text-primary placeholder-text-muted outline-none"
            autoFocus
          />
        </div>

        {/* Body - plain Markdown (ADR-0017); evidence and quotes go here. */}
        <div className="px-5 py-1" style={{ minHeight: 140 }}>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            placeholder="Description"
            autosize
            minRows={4}
            maxRows={12}
            variant="unstyled"
            styles={{
              input: { fontSize: "0.875rem", padding: 0 },
            }}
          />
        </div>

        {/* Property pills */}
        <div className="border-t border-border-primary px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Type */}
            <Pill icon={<TypeIcon size={14} />} label={typeDef?.label ?? type}>
              {INSIGHT_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <Menu.Item
                    key={t.value}
                    leftSection={<Icon size={14} />}
                    onClick={() => setType(t.value)}
                  >
                    {t.label}
                  </Menu.Item>
                );
              })}
            </Pill>

            {/* Impact */}
            <Pill
              icon={<IconGauge size={14} />}
              label={impact != null ? `Impact ${impact}` : "Impact"}
            >
              {SCORE_VALUES.map((n) => (
                <Menu.Item key={n} onClick={() => setImpact(n)}>
                  {n}
                </Menu.Item>
              ))}
              {impact != null && (
                <>
                  <Menu.Divider />
                  <Menu.Item onClick={() => setImpact(null)}>Clear</Menu.Item>
                </>
              )}
            </Pill>

            {/* Confidence */}
            <Pill
              icon={<IconGauge size={14} />}
              label={confidence != null ? `Confidence ${confidence}` : "Confidence"}
            >
              {SCORE_VALUES.map((n) => (
                <Menu.Item key={n} onClick={() => setConfidence(n)}>
                  {n}
                </Menu.Item>
              ))}
              {confidence != null && (
                <>
                  <Menu.Divider />
                  <Menu.Item onClick={() => setConfidence(null)}>Clear</Menu.Item>
                </>
              )}
            </Pill>

            {/* Sentiment - only meaningful for feedback */}
            {type === "FEEDBACK" && (
              <Pill icon={<IconMoodSmile size={14} />} label={sentimentLabel}>
                {SENTIMENT_OPTIONS.map((o) => (
                  <Menu.Item key={o.value} onClick={() => setSentiment(o.value)}>
                    {o.label}
                  </Menu.Item>
                ))}
                {sentiment && (
                  <>
                    <Menu.Divider />
                    <Menu.Item onClick={() => setSentiment(null)}>Clear</Menu.Item>
                  </>
                )}
              </Pill>
            )}

            {/* 3-dot overflow menu */}
            <Menu position="top-end" withinPortal>
              <Menu.Target>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-border-primary w-7 h-7 text-text-muted hover:border-border-focus hover:text-text-primary transition-colors cursor-pointer bg-transparent"
                >
                  <IconDots size={14} />
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                {!showSource && (
                  <Menu.Item onClick={() => setShowSource(true)}>Source</Menu.Item>
                )}
                {!showCategory && (
                  <Menu.Item onClick={() => setShowCategory(true)}>
                    Category
                  </Menu.Item>
                )}
                {!showFeatures && (
                  <Menu.Item onClick={() => setShowFeatures(true)}>
                    Features
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </div>

          {/* Revealed extras */}
          {(showSource || showCategory) && (
            <div className="mt-3 flex gap-2">
              {showSource && (
                <TextInput
                  size="xs"
                  placeholder="Source - e.g. User interview, Zendesk #4231"
                  value={source}
                  onChange={(e) => setSource(e.currentTarget.value)}
                  className="flex-1"
                />
              )}
              {showCategory && (
                <TextInput
                  size="xs"
                  placeholder="Category - e.g. Onboarding, Billing"
                  value={category}
                  onChange={(e) => setCategory(e.currentTarget.value)}
                  className="flex-1"
                />
              )}
            </div>
          )}
          {showFeatures && (
            <div className="mt-3">
              <MultiSelect
                size="xs"
                placeholder="Link to one or more features..."
                value={featureIds}
                onChange={setFeatureIds}
                data={(features ?? []).map((f) => ({ value: f.id, label: f.name }))}
                searchable
                clearable
                comboboxProps={{ withinPortal: true }}
                nothingFoundMessage="No features yet"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border-primary px-5 py-3">
          <div className="flex items-center gap-3">
            <Switch
              size="xs"
              label="Create more"
              checked={createMore}
              onChange={(e) => setCreateMore(e.currentTarget.checked)}
              styles={{
                label: { fontSize: "0.75rem", color: "var(--color-text-muted)" },
              }}
            />
            {error && (
              <Text size="xs" c="red">
                {error}
              </Text>
            )}
          </div>
          <Button
            size="sm"
            color="brand"
            radius="md"
            onClick={handleSubmit}
            loading={create.isPending}
            disabled={!title.trim()}
          >
            Create insight
          </Button>
        </div>
      </div>
    </Modal>
  );
}

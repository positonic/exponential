"use client";

import { useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Menu,
  Modal,
  NumberInput,
  Select,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  IconCircleDot,
  IconDots,
  IconFlag,
  IconMap2,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  FEATURE_STATUS_OPTIONS,
  type FeatureStatus,
} from "~/lib/feature-statuses";

// A new registry entry starts at a registry stage - Live/Deprecated/Archived
// are reached later, not at creation.
const NEW_STATUS_OPTIONS = FEATURE_STATUS_OPTIONS.filter((o) =>
  ["IDEA", "DEFINED", "IN_PROGRESS"].includes(o.value),
);

const PRIORITY_OPTIONS = [
  { value: 0, label: "Urgent" },
  { value: 1, label: "High" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Low" },
  { value: 4, label: "No priority" },
];

// ---------------------------------------------------------------------------
// Pill button - a Menu trigger that looks like a compact chip (same pattern
// as CreateInsightModal).
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

interface CreateFeatureModalProps {
  opened: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  workspaceId?: string;
}

export function CreateFeatureModal({
  opened,
  onClose,
  productId,
  productName,
  workspaceId,
}: CreateFeatureModalProps) {
  const utils = api.useUtils();
  const titleRef = useRef<HTMLInputElement>(null);

  // core
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<FeatureStatus>("IDEA");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [priority, setPriority] = useState<number | null>(null);

  // overflow
  const [vision, setVision] = useState("");
  const [effort, setEffort] = useState<number | "">("");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [showVision, setShowVision] = useState(false);
  const [showEffort, setShowEffort] = useState(false);
  const [showGoal, setShowGoal] = useState(false);

  const [createMore, setCreateMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: areas } = api.product.feature.listAreas.useQuery(
    { productId },
    { enabled: !!productId && opened },
  );

  const { data: goals } = api.goal.getAllMyGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId && opened && showGoal },
  );

  // Reset capture fields but keep status/area + revealed rows - "create more"
  // is for batch capture (filling a fresh area's features), where consecutive
  // entries usually share both.
  const resetCapture = () => {
    setName("");
    setDescription("");
    setPriority(null);
    setVision("");
    setEffort("");
    setGoalId(null);
    setError(null);
  };

  const resetAll = () => {
    resetCapture();
    setStatus("IDEA");
    setAreaId(null);
    setShowVision(false);
    setShowEffort(false);
    setShowGoal(false);
  };

  const create = api.product.feature.create.useMutation({
    onSuccess: async () => {
      await utils.product.feature.list.invalidate({ productId });
      await utils.product.feature.listAreas.invalidate({ productId });
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
    if (!name.trim() || create.isPending) return;
    create.mutate({
      productId,
      name: name.trim(),
      description: description.trim() || undefined,
      vision: vision.trim() || undefined,
      status,
      priority: priority ?? undefined,
      effort: typeof effort === "number" ? effort : undefined,
      goalId: goalId ? parseInt(goalId, 10) : undefined,
      areaId: areaId ?? undefined,
    });
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const statusLabel =
    NEW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
  const areaLabel = areaId
    ? (areas ?? []).find((a) => a.id === areaId)?.name ?? "Area"
    : "Area";
  const priorityLabel =
    priority != null
      ? PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? "Priority"
      : "Priority";

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
              New feature
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full bg-transparent text-base font-medium text-text-primary placeholder-text-muted outline-none"
            autoFocus
          />
        </div>

        {/* Description - plain Markdown (ADR-0017); the living description of
            what this capability is. */}
        <div className="px-5 py-1" style={{ minHeight: 140 }}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
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
            {/* Status */}
            <Pill icon={<IconCircleDot size={14} />} label={statusLabel}>
              {NEW_STATUS_OPTIONS.map((o) => (
                <Menu.Item key={o.value} onClick={() => setStatus(o.value)}>
                  {o.label}
                </Menu.Item>
              ))}
            </Pill>

            {/* Area */}
            <Pill icon={<IconMap2 size={14} />} label={areaLabel}>
              {(areas ?? []).map((a) => (
                <Menu.Item key={a.id} onClick={() => setAreaId(a.id)}>
                  {a.name}
                </Menu.Item>
              ))}
              {(areas ?? []).length === 0 && (
                <Menu.Item disabled>No areas yet - create them in product settings</Menu.Item>
              )}
              {areaId && (
                <>
                  <Menu.Divider />
                  <Menu.Item onClick={() => setAreaId(null)}>Clear</Menu.Item>
                </>
              )}
            </Pill>

            {/* Priority */}
            <Pill icon={<IconFlag size={14} />} label={priorityLabel}>
              {PRIORITY_OPTIONS.map((o) => (
                <Menu.Item key={o.value} onClick={() => setPriority(o.value)}>
                  {o.label}
                </Menu.Item>
              ))}
              {priority != null && (
                <>
                  <Menu.Divider />
                  <Menu.Item onClick={() => setPriority(null)}>Clear</Menu.Item>
                </>
              )}
            </Pill>

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
                {!showVision && (
                  <Menu.Item onClick={() => setShowVision(true)}>Vision</Menu.Item>
                )}
                {!showEffort && (
                  <Menu.Item onClick={() => setShowEffort(true)}>Effort</Menu.Item>
                )}
                {!showGoal && (
                  <Menu.Item onClick={() => setShowGoal(true)}>Goal</Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </div>

          {/* Revealed extras */}
          {showVision && (
            <div className="mt-3">
              <TextInput
                size="xs"
                placeholder="Vision - where should this capability go long-term?"
                value={vision}
                onChange={(e) => setVision(e.currentTarget.value)}
              />
            </div>
          )}
          {(showEffort || showGoal) && (
            <div className="mt-3 flex gap-2">
              {showEffort && (
                <NumberInput
                  size="xs"
                  placeholder="Effort"
                  value={effort}
                  onChange={(v) => setEffort(typeof v === "number" ? v : "")}
                  min={0}
                  className="w-32"
                />
              )}
              {showGoal && (
                <Select
                  size="xs"
                  placeholder="Aligned goal / objective"
                  value={goalId}
                  onChange={setGoalId}
                  data={(goals ?? []).map((g) => ({
                    value: String(g.id),
                    label: g.title,
                  }))}
                  searchable
                  clearable
                  nothingFoundMessage="No goals"
                  comboboxProps={{ withinPortal: true }}
                  className="flex-1"
                />
              )}
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
            disabled={!name.trim()}
          >
            Create feature
          </Button>
        </div>
      </div>
    </Modal>
  );
}

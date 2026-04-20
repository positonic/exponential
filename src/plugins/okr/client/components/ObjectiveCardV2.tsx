"use client";

import { Text, Badge, ActionIcon, Tooltip, Avatar, Collapse } from "@mantine/core";
import {
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconTrash,
  IconMessageCircle,
} from "@tabler/icons-react";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import {
  clamp01,
  expectedProgress,
  krProgress,
  relativeTimeLabel,
  statusToConfidence,
  type Confidence,
} from "../utils/okrDashboardUtils";
import {
  getAvatarColor,
  getColorSeed,
  getInitial,
  getTextColor,
} from "~/utils/avatarColors";

interface KrCheckIn {
  previousValue: number;
  newValue: number;
  createdAt: Date | string;
}

interface KrUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface LinkedProject {
  project: {
    id: string;
    name: string;
    status: string;
    slug: string;
  };
}

export interface ObjectiveCardKeyResult {
  id: string;
  title: string;
  currentValue: number;
  targetValue: number;
  startValue: number;
  unit?: string;
  unitLabel?: string | null;
  status: string;
  confidence?: number | null;
  description?: string | null;
  period?: string;
  checkIns?: KrCheckIn[];
  user?: KrUser | null;
  driUser?: KrUser | null;
  projects?: LinkedProject[];
}

interface LifeDomain {
  id: number;
  name: string;
}

export interface ObjectiveCardObjective {
  id: number;
  title: string;
  description?: string | null;
  whyThisGoal?: string | null;
  notes?: string | null;
  dueDate?: Date | null;
  period?: string | null;
  progress: number; // 0–100
  lifeDomain?: LifeDomain | null;
  workspaceId?: string | null;
  driUserId?: string | null;
  user?: KrUser | null;
  driUser?: KrUser | null;
  keyResults: ObjectiveCardKeyResult[];
}

interface ObjectiveCardV2Props {
  objective: ObjectiveCardObjective;
  code: string; // e.g. "O1"
  period: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete?: (id: number) => void;
  isDeleting?: boolean;
  onEditSuccess?: () => void;
  onAddKeyResult?: (objectiveId: number) => void;
  onEditKeyResult?: (keyResult: ObjectiveCardKeyResult) => void;
  onViewObjective?: () => void;
  onViewKeyResult?: (kr: ObjectiveCardKeyResult) => void;
}

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  ok: "var(--color-brand-success)",
  warn: "var(--accent-okr)",
  bad: "var(--accent-due)",
  idle: "var(--color-text-muted)",
};

const CONFIDENCE_PILL: Record<
  Confidence,
  { label: string; color: string; bg: string }
> = {
  ok: {
    label: "On track",
    color: "var(--color-brand-success)",
    bg: "var(--mantine-color-green-light)",
  },
  warn: {
    label: "At risk",
    color: "var(--accent-okr)",
    bg: "var(--mantine-color-yellow-light)",
  },
  bad: {
    label: "Off track",
    color: "var(--accent-due)",
    bg: "var(--mantine-color-red-light)",
  },
  idle: {
    label: "Not started",
    color: "var(--color-text-muted)",
    bg: "var(--color-surface-tertiary)",
  },
};

/** Roll-up status for the objective: worst KR wins. */
function objectiveRollupStatus(krs: ObjectiveCardKeyResult[]): Confidence {
  if (krs.length === 0) return "idle";
  const confs = krs.map((k) => statusToConfidence(k.status));
  if (confs.includes("bad")) return "bad";
  if (confs.includes("warn")) return "warn";
  if (confs.every((c) => c === "idle")) return "idle";
  return "ok";
}

function formatKrValue(kr: ObjectiveCardKeyResult): string {
  if (kr.unit === "percent") return `${Math.round(kr.currentValue)}%`;
  if (kr.unit === "currency")
    return `$${kr.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (kr.unit === "hours") return `${kr.currentValue.toLocaleString()}h`;
  return kr.currentValue.toLocaleString();
}

function formatKrTarget(kr: ObjectiveCardKeyResult): string {
  if (kr.unit === "percent") return `${Math.round(kr.targetValue)}%`;
  if (kr.unit === "currency")
    return `$${kr.targetValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (kr.unit === "hours") return `${kr.targetValue.toLocaleString()}h`;
  if (kr.unit === "custom" && kr.unitLabel)
    return `${kr.targetValue.toLocaleString()} ${kr.unitLabel}`;
  return kr.targetValue.toLocaleString();
}

function OwnerAvatar({
  user,
  size = 24,
}: {
  user: KrUser | null | undefined;
  size?: number;
}) {
  if (!user) {
    return <div style={{ width: size, height: size }} className="flex-shrink-0" />;
  }
  const seed = getColorSeed(user.name, user.email);
  const bg = !user.image ? getAvatarColor(seed) : undefined;
  const color = bg ? getTextColor(bg) : "white";
  return (
    <Tooltip label={user.name ?? user.email ?? "Owner"}>
      <Avatar
        size={size}
        src={user.image}
        radius="xl"
        className="flex-shrink-0"
        styles={{
          root: {
            backgroundColor: bg,
            color,
            fontWeight: 600,
            fontSize: size * 0.42,
            border: "2px solid var(--color-surface-secondary)",
          },
        }}
      >
        {!user.image && getInitial(user.name, user.email)}
      </Avatar>
    </Tooltip>
  );
}

/**
 * Stacked/overlapping avatars for all contributors on an objective.
 * Dedupes by user id. Shows up to 3 avatars plus a +N chip.
 */
function OwnerStack({
  users,
  size = 26,
  max = 3,
}: {
  users: Array<KrUser | null | undefined>;
  size?: number;
  max?: number;
}) {
  const seen = new Set<string>();
  const unique: KrUser[] = [];
  for (const u of users) {
    if (!u || seen.has(u.id)) continue;
    seen.add(u.id);
    unique.push(u);
  }
  const shown = unique.slice(0, max);
  const more = unique.length - shown.length;
  const overlap = Math.round(size * 0.32);

  return (
    <div className="flex items-center">
      {shown.map((u, i) => (
        <div
          key={u.id}
          style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: shown.length - i }}
          className="relative"
        >
          <OwnerAvatar user={u} size={size} />
        </div>
      ))}
      {more > 0 && (
        <div
          style={{
            width: size,
            height: size,
            marginLeft: -overlap,
            border: "2px solid var(--color-surface-secondary)",
            background: "var(--color-surface-tertiary)",
            color: "var(--color-text-secondary)",
            fontSize: size * 0.34,
          }}
          className="z-0 grid flex-shrink-0 place-items-center rounded-full font-medium tabular-nums"
        >
          +{more}
        </div>
      )}
    </div>
  );
}

function KrLine({
  kr,
  code,
  onEdit,
  onView,
}: {
  kr: ObjectiveCardKeyResult;
  code: string;
  onEdit?: () => void;
  onView?: () => void;
}) {
  const progress = krProgress(kr);
  const expected = kr.period ? expectedProgress(kr.period) : 0;
  const confidence = statusToConfidence(kr.status);
  const color = CONFIDENCE_COLOR[confidence];
  const latestCheckIn = kr.checkIns?.[0];
  const updated = relativeTimeLabel(latestCheckIn?.createdAt);
  const owner = kr.driUser ?? kr.user;

  return (
    <div
      className="group grid grid-cols-[4px_1fr_auto_24px_26px_28px] items-center gap-3 border-t border-border-primary px-1 py-3 first:border-t-0"
    >
      {/* Status bar */}
      <div
        className="h-8 w-1 self-stretch rounded-sm"
        style={{ background: color, opacity: confidence === "idle" ? 0.4 : 1 }}
      />

      {/* Title + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="flex-shrink-0 text-[11px] uppercase tracking-wider text-text-muted"
            style={{ fontFamily: "var(--mantine-font-family-monospace, ui-monospace, monospace)" }}
          >
            {code}
          </span>
          <Text size="sm" className="truncate font-medium text-text-primary">
            {kr.title}
          </Text>
          {onView && (
            <Tooltip label="Discussion">
              <ActionIcon
                variant="subtle"
                size="xs"
                className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="View discussion"
                onClick={(e) => {
                  e.stopPropagation();
                  onView();
                }}
              >
                <IconMessageCircle size={13} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
          <span>Updated {updated}</span>
          <span className="inline-block h-[3px] w-[3px] rounded-full bg-[color:var(--color-text-faint,currentColor)] opacity-60" />
          <span>{Math.round(progress * 100)}% of target</span>
        </div>
      </div>

      {/* Value + bar */}
      <div className="flex w-[180px] flex-col items-end gap-1.5">
        <Text size="xs" className="font-medium tabular-nums text-text-primary">
          {formatKrValue(kr)}{" "}
          <span className="font-normal text-text-muted">/ {formatKrTarget(kr)}</span>
        </Text>
        <div className="relative h-1 w-[160px] overflow-visible rounded-sm bg-surface-tertiary">
          <div
            className="absolute left-0 top-0 h-full rounded-sm"
            style={{
              width: `${clamp01(progress) * 100}%`,
              background: color,
              opacity: confidence === "idle" ? 0.6 : 1,
            }}
          />
          <div
            className="absolute w-px bg-text-primary opacity-60"
            style={{
              left: `${clamp01(expected) * 100}%`,
              top: "-2px",
              bottom: "-2px",
            }}
          />
        </div>
      </div>

      {/* Confidence dot */}
      <div className="flex justify-center">
        <Tooltip label={`Confidence: ${CONFIDENCE_PILL[confidence].label}`}>
          <span
            className="block h-2.5 w-2.5 rounded-full border border-border-primary"
            style={{
              background: color,
              borderColor: color,
              opacity: confidence === "idle" ? 0.4 : 1,
            }}
          />
        </Tooltip>
      </div>

      {/* Owner avatar */}
      <div className="flex justify-center">
        <OwnerAvatar user={owner} size={24} />
      </div>

      {/* Edit button */}
      <div className="flex justify-end">
        {onEdit && (
          <Tooltip label="Edit / check in">
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label="Edit key result"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <IconPencil size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function ObjectiveCardV2({
  objective,
  code,
  isExpanded,
  onToggleExpand,
  onDelete,
  isDeleting,
  onEditSuccess,
  onAddKeyResult,
  onEditKeyResult,
  onViewObjective,
  onViewKeyResult,
}: ObjectiveCardV2Props) {
  const status = objectiveRollupStatus(objective.keyResults);
  const pill = CONFIDENCE_PILL[status];
  const owner = objective.driUser ?? objective.user;

  // Contributor stack: owner first, then KR DRIs, then KR creators — deduped.
  const contributors = [
    owner,
    ...objective.keyResults.map((kr) => kr.driUser ?? kr.user),
  ];

  // Derive KR numbering from the objective code (e.g. "O1" → "KR1.X").
  const objNum = /(\d+)/.exec(code)?.[1] ?? "1";

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border-primary bg-surface-secondary">
      {/* Header row */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="group grid w-full grid-cols-[auto_1fr_auto_180px_auto_auto] items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
      >
        <IconChevronRight
          size={14}
          className={`text-text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />

        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            <span style={{ color: "var(--color-brand-primary)" }}>{code}</span>
            <span className="inline-block h-[3px] w-[3px] rounded-full bg-text-muted opacity-60" />
            <span>{objective.lifeDomain?.name ?? "Company"}</span>
            <span className="inline-block h-[3px] w-[3px] rounded-full bg-text-muted opacity-60" />
            <span>
              {objective.keyResults.length} key result
              {objective.keyResults.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="truncate text-base font-semibold text-text-primary">
            {objective.title}
          </div>
        </div>

        <Badge
          size="sm"
          radius="xl"
          variant="filled"
          styles={{
            root: {
              backgroundColor: pill.bg,
              color: pill.color,
              fontWeight: 500,
              textTransform: "none",
              border: "none",
            },
          }}
          leftSection={
            status !== "idle" ? (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: pill.color }}
              />
            ) : undefined
          }
        >
          {pill.label}
        </Badge>

        {/* Progress: bar + number */}
        <div className="flex items-center gap-2.5">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-tertiary">
            <div
              className="absolute left-0 top-0 h-full rounded-sm"
              style={{
                width: `${clamp01(objective.progress / 100) * 100}%`,
                background: `linear-gradient(90deg, var(--color-brand-primary), ${pill.color})`,
              }}
            />
          </div>
          <Text
            size="sm"
            fw={600}
            className="min-w-[44px] text-right tabular-nums text-text-primary"
          >
            {Math.round(objective.progress)}%
          </Text>
        </div>

        {/* Contributor stack + owner name */}
        <div className="flex items-center gap-2">
          <OwnerStack users={contributors} size={26} max={3} />
          {owner && (
            <Text size="xs" className="hidden whitespace-nowrap text-text-secondary lg:block">
              {owner.name ?? owner.email ?? ""}
            </Text>
          )}
        </div>

        {/* Edit/delete/discuss actions */}
        <div
          className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {onViewObjective && (
            <Tooltip label="Discussion">
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label="View discussion"
                onClick={onViewObjective}
              >
                <IconMessageCircle size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <CreateGoalModal
            goal={{
              id: objective.id,
              title: objective.title,
              description: objective.description ?? null,
              whyThisGoal: objective.whyThisGoal ?? null,
              notes: objective.notes ?? null,
              dueDate: objective.dueDate ?? null,
              period: objective.period ?? null,
              lifeDomainId: objective.lifeDomain?.id ?? null,
              workspaceId: objective.workspaceId ?? null,
              driUserId: objective.driUserId ?? null,
            }}
            onSuccess={onEditSuccess}
          >
            <ActionIcon variant="subtle" size="sm" aria-label="Edit objective">
              <IconPencil size={14} />
            </ActionIcon>
          </CreateGoalModal>
          {onDelete && (
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              aria-label="Delete objective"
              loading={isDeleting}
              onClick={() => onDelete(objective.id)}
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </div>
      </button>

      {/* KR rows */}
      <Collapse in={isExpanded}>
        <div className="border-t border-border-primary px-4 pb-3 pl-12 pt-1">
          {objective.keyResults.length === 0 ? (
            <Text size="sm" className="py-3 text-text-muted">
              No key results in this period yet.
            </Text>
          ) : (
            objective.keyResults.map((kr, i) => (
              <KrLine
                key={kr.id}
                kr={kr}
                code={`KR${objNum}.${i + 1}`}
                onEdit={onEditKeyResult ? () => onEditKeyResult(kr) : undefined}
                onView={onViewKeyResult ? () => onViewKeyResult(kr) : undefined}
              />
            ))
          )}

          {onAddKeyResult && (
            <div className="pt-2">
              <Tooltip label="Add Key Result" position="right">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label="Add key result"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddKeyResult(objective.id);
                  }}
                >
                  <IconPlus size={14} />
                </ActionIcon>
              </Tooltip>
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Drawer, Tooltip, ActionIcon, Skeleton, Textarea } from "@mantine/core";
import {
  IconTarget,
  IconTrendingUp,
  IconX,
  IconDots,
  IconExternalLink,
  IconSparkles,
  IconEdit,
  IconMessage,
  IconFlag,
  IconStar,
  IconShare,
  IconPaperclip,
  IconAt,
  IconPlus,
  IconLink,
} from "@tabler/icons-react";
import { formatDistanceToNow, format } from "date-fns";
import { api } from "~/trpc/react";
import {
  clamp01,
  expectedProgress,
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

interface OkrDetailDrawerProps {
  opened: boolean;
  onClose: () => void;
  type: "objective" | "keyResult";
  itemId: number | string | null;
  title?: string;
  description?: string | null;
  progress?: number;
  status?: string;
  lifeDomainName?: string | null;
}

interface DrawerUser {
  id: string;
  name: string | null;
  email?: string | null;
  image: string | null;
}

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  ok: "var(--color-brand-success)",
  warn: "var(--accent-okr)",
  bad: "var(--accent-due)",
  idle: "var(--color-text-muted)",
};

const CONFIDENCE_BG: Record<Confidence, string> = {
  ok: "var(--mantine-color-green-light)",
  warn: "var(--mantine-color-yellow-light)",
  bad: "var(--mantine-color-red-light)",
  idle: "var(--color-surface-tertiary)",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  ok: "On Track",
  warn: "At Risk",
  bad: "Off Track",
  idle: "Not Started",
};

function Avatar({
  user,
  size = 24,
  bordered = false,
}: {
  user: DrawerUser | null | undefined;
  size?: number;
  bordered?: boolean;
}) {
  if (!user) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex-shrink-0 rounded-full bg-surface-tertiary"
      />
    );
  }
  const seed = getColorSeed(user.name, user.email ?? null);
  const bg = !user.image ? getAvatarColor(seed) : undefined;
  const color = bg ? getTextColor(bg) : "white";
  const initial = getInitial(user.name, user.email ?? null);

  if (user.image) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundImage: `url("${user.image}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          border: bordered ? "2px solid var(--color-surface-secondary)" : undefined,
        }}
        className="flex-shrink-0"
        title={user.name ?? user.email ?? ""}
        role="img"
        aria-label={user.name ?? "avatar"}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        color,
        fontSize: Math.max(9, size * 0.4),
        border: bordered ? "2px solid var(--color-surface-secondary)" : undefined,
      }}
      className="grid flex-shrink-0 place-items-center rounded-full font-semibold"
      title={user.name ?? user.email ?? ""}
    >
      {initial}
    </div>
  );
}

function AvatarStack({ users, size = 22 }: { users: DrawerUser[]; size?: number }) {
  const seen = new Set<string>();
  const unique: DrawerUser[] = [];
  for (const u of users) {
    if (!u || seen.has(u.id)) continue;
    seen.add(u.id);
    unique.push(u);
  }
  const overlap = Math.round(size * 0.32);
  return (
    <div className="flex items-center">
      {unique.map((u, i) => (
        <div
          key={u.id}
          style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: unique.length - i }}
        >
          <Avatar user={u} size={size} bordered />
        </div>
      ))}
    </div>
  );
}

function StatusPill({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
      style={{
        background: CONFIDENCE_BG[confidence],
        color: CONFIDENCE_COLOR[confidence],
      }}
    >
      {confidence !== "idle" && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: CONFIDENCE_COLOR[confidence] }}
        />
      )}
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

function MetaPill({
  children,
  variant = "default",
  icon,
}: {
  children: React.ReactNode;
  variant?: "default" | "code";
  icon?: React.ReactNode;
}) {
  const isCode = variant === "code";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
      style={{
        background: isCode
          ? "var(--color-brand-glow)"
          : "var(--color-surface-tertiary)",
        borderColor: isCode
          ? "var(--color-brand-glow)"
          : "var(--color-border-primary)",
        color: isCode ? "var(--brand-400)" : "var(--color-text-muted)",
      }}
    >
      {icon}
      {children}
    </span>
  );
}

type TopBarSize = "s" | "m" | "l" | "max";

function TopBar({
  kind,
  crumb,
  size,
  onSize,
  onClose,
  onOpenFull,
}: {
  kind: "objective" | "keyResult";
  crumb: React.ReactNode;
  size: TopBarSize;
  onSize: (s: TopBarSize) => void;
  onClose: () => void;
  onOpenFull?: () => void;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-secondary px-4 py-3">
      <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {kind === "objective" ? (
          <IconTarget size={12} />
        ) : (
          <IconTrendingUp size={12} />
        )}
        {kind === "objective" ? "Objective" : "Key Result"}
      </div>
      <div className="ml-1 truncate text-xs text-text-muted">{crumb}</div>
      <div className="flex-1" />
      <div
        className="inline-flex items-center gap-0.5 rounded-md border border-border-primary p-0.5"
        style={{ background: "var(--color-surface-tertiary)" }}
      >
        {(["s", "m", "l"] as TopBarSize[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSize(s)}
            className="grid h-5 min-w-[22px] place-items-center rounded px-1.5 text-[11px] font-semibold uppercase"
            style={{
              background:
                size === s ? "var(--color-surface-secondary)" : "transparent",
              color:
                size === s
                  ? "var(--color-text-primary)"
                  : "var(--color-text-muted)",
            }}
          >
            {s}
          </button>
        ))}
      </div>
      {onOpenFull && (
        <Tooltip label="Open full page">
          <ActionIcon variant="subtle" size="sm" onClick={onOpenFull}>
            <IconExternalLink size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      <ActionIcon variant="subtle" size="sm" aria-label="More">
        <IconDots size={14} />
      </ActionIcon>
      <ActionIcon variant="subtle" size="sm" aria-label="Close" onClick={onClose}>
        <IconX size={14} />
      </ActionIcon>
    </div>
  );
}

function ProgressRow({
  progress,
  expected,
  deltaPts,
  confidence,
}: {
  progress: number;
  expected: number;
  deltaPts: number;
  confidence: Confidence;
}) {
  const pct = Math.round(clamp01(progress) * 100);
  const expPct = Math.round(clamp01(expected) * 100);
  const sign = deltaPts >= 0 ? "+" : "";
  const deltaColor =
    deltaPts < 0 ? "var(--color-brand-error)" : "var(--color-brand-success)";

  return (
    <div className="mt-4 grid grid-cols-[1fr_auto_auto] items-center gap-5">
      <div className="relative pt-3">
        <div
          className="absolute top-0 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
          style={{
            left: `${clamp01(expected) * 100}%`,
            letterSpacing: "0.08em",
          }}
        >
          expected
        </div>
        <div className="relative mt-1 h-1.5 overflow-visible rounded-full bg-surface-tertiary">
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: `${Math.max(pct, 2)}%`,
              background: CONFIDENCE_COLOR[confidence],
              opacity: confidence === "idle" ? 0.7 : 1,
            }}
          />
          <div
            className="absolute top-[-3px] bottom-[-3px] w-px bg-text-primary opacity-70"
            style={{ left: `${clamp01(expected) * 100}%` }}
          />
        </div>
      </div>
      <div className="flex flex-col items-end tabular-nums">
        <div className="text-2xl font-semibold leading-none text-text-primary">
          {pct}%
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Progress
        </div>
        {deltaPts !== 0 && (
          <div
            className="mt-0.5 text-[11px] font-medium"
            style={{ color: deltaColor }}
          >
            {sign}
            {deltaPts.toFixed(1)}pt wk
          </div>
        )}
      </div>
      <div className="flex flex-col items-end tabular-nums opacity-60">
        <div className="text-lg font-semibold leading-none text-text-muted">
          {expPct}%
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Expected
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  withDivider,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  withDivider?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 ${withDivider ? "border-l border-border-secondary pl-4" : ""}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums text-text-primary">
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

function HeroCtas({
  onUpdateProgress,
  onPostUpdate,
  onSetStatus,
  onStar,
  onShare,
}: {
  onUpdateProgress?: () => void;
  onPostUpdate?: () => void;
  onSetStatus?: () => void;
  onStar?: () => void;
  onShare?: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onUpdateProgress}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-text-inverse"
        style={{ background: "var(--color-brand-primary)" }}
      >
        <IconEdit size={13} /> Update progress
        <span
          className="ml-1 rounded px-1 py-px text-[10px]"
          style={{ background: "var(--color-cta-overlay-light)" }}
        >
          U
        </span>
      </button>
      <button
        type="button"
        onClick={onPostUpdate}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-surface-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      >
        <IconMessage size={13} /> Post update
      </button>
      <button
        type="button"
        onClick={onSetStatus}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-surface-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      >
        <IconFlag size={13} /> Set status
      </button>
      <div className="flex-1" />
      <ActionIcon
        variant="subtle"
        size="md"
        aria-label="Star"
        onClick={onStar}
      >
        <IconStar size={14} />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        size="md"
        aria-label="Share"
        onClick={onShare}
      >
        <IconShare size={14} />
      </ActionIcon>
    </div>
  );
}

function PeopleStrip({
  owner,
  collaborators,
  updatedLabel,
}: {
  owner: DrawerUser | null | undefined;
  collaborators: DrawerUser[];
  updatedLabel: string;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-border-secondary px-6 py-3 text-xs">
      <div className="inline-flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Owner
        </span>
        <Avatar user={owner} size={22} />
        <span className="font-medium text-text-primary">
          {owner?.name ?? owner?.email ?? "Unassigned"}
        </span>
      </div>
      {collaborators.length > 0 && (
        <>
          <div className="h-4 w-px bg-border-secondary" />
          <div className="inline-flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Collaborators
            </span>
            <AvatarStack users={collaborators} size={22} />
          </div>
        </>
      )}
      <div className="flex-1" />
      <div className="text-[11px] text-text-muted">
        Last update{" "}
        <span className="font-medium text-text-secondary">{updatedLabel}</span>
      </div>
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex flex-shrink-0 items-center gap-1 border-b border-border-secondary px-6"
    >
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className="relative inline-flex items-center gap-2 py-3 text-xs font-medium transition-colors"
            style={{
              color: on
                ? "var(--color-text-primary)"
                : "var(--color-text-muted)",
              paddingLeft: 10,
              paddingRight: 10,
            }}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                style={{
                  background: on
                    ? "var(--color-brand-glow)"
                    : "var(--color-surface-tertiary)",
                  border: `1px solid ${on ? "var(--color-brand-glow)" : "var(--color-border-primary)"}`,
                  color: on ? "var(--brand-400)" : "var(--color-text-muted)",
                }}
              >
                {t.count}
              </span>
            )}
            {on && (
              <span
                className="absolute left-2 right-2 -bottom-px h-0.5 rounded-sm"
                style={{ background: "var(--brand-400)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 mt-5 flex items-center gap-2 first:mt-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </div>
      {count !== undefined && (
        <div className="text-[11px] tabular-nums text-text-muted">{count}</div>
      )}
      <div className="flex-1" />
      {action}
    </div>
  );
}

function ZoeNudge({
  body,
  ctaLabel,
  onCta,
}: {
  body: React.ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-xl border p-4"
      style={{
        background:
          "linear-gradient(90deg, var(--color-brand-subtle), transparent 80%)",
        borderColor: "var(--color-brand-glow)",
      }}
    >
      <div
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md"
        style={{
          background: "var(--color-brand-glow)",
          color: "var(--brand-400)",
        }}
      >
        <IconSparkles size={14} />
      </div>
      <div className="flex-1 text-sm text-text-primary">
        <span className="font-semibold">Zoe noticed</span>
        <div className="mt-0.5 text-text-secondary">{body}</div>
      </div>
      {ctaLabel && (
        <button
          type="button"
          onClick={onCta}
          className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium"
          style={{
            borderColor: "var(--color-brand-glow)",
            color: "var(--brand-400)",
            background: "transparent",
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

function LatestUpdateCard({
  latest,
  onPostUpdate,
}: {
  latest: {
    author: DrawerUser;
    body: string;
    confidence: Confidence;
    whenLabel: string;
  } | null;
  onPostUpdate?: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-border-secondary bg-surface-primary p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Latest update
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onPostUpdate}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <IconEdit size={12} /> Update
        </button>
      </div>
      {latest ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            <Avatar user={latest.author} size={22} />
            <span className="text-xs font-medium text-text-primary">
              {latest.author.name ?? latest.author.email ?? "Unknown"}
            </span>
            <StatusPill confidence={latest.confidence} />
            <div className="flex-1" />
            <span className="text-[11px] text-text-muted">{latest.whenLabel}</span>
          </div>
          <div className="text-sm leading-relaxed text-text-secondary">
            {latest.body}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          No update yet. Be the first to post one.
        </div>
      )}
    </div>
  );
}

function DescriptionCard({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <div className="mb-4 rounded-xl border border-border-secondary bg-surface-primary p-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Description
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
        {text}
      </div>
    </div>
  );
}

function TrendChart({
  series,
  confidence,
  expectedFrac,
}: {
  series: number[]; // 0..1 weekly
  confidence: Confidence;
  expectedFrac: number;
}) {
  const width = 640;
  const height = 110;
  const pad = { l: 28, r: 12, t: 8, b: 18 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const color = CONFIDENCE_COLOR[confidence];

  if (series.length < 2) {
    return (
      <div className="mb-4 rounded-xl border border-border-secondary bg-surface-primary p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Progress trajectory
          </div>
        </div>
        <div className="grid h-[110px] place-items-center text-xs text-text-muted">
          No check-in history yet
        </div>
      </div>
    );
  }

  const stepX = iw / Math.max(series.length - 1, 1);
  const pts = series.map((v, i) => [pad.l + i * stepX, pad.t + ih * (1 - clamp01(v))] as const);
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const areaPath = `${path} L${pts[pts.length - 1]![0]},${pad.t + ih} L${pts[0]![0]},${pad.t + ih} Z`;
  const expY = pad.t + ih * (1 - clamp01(expectedFrac));

  return (
    <div className="mb-4 rounded-xl border border-border-secondary bg-surface-primary p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Progress trajectory
        </div>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-3 text-[10px] text-text-muted">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-2.5 rounded-sm"
              style={{ background: color }}
            />
            Actual
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-2.5"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--color-text-muted) 50%, transparent 50%)",
                backgroundSize: "4px 2px",
              }}
            />
            Expected
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="okr-drawer-spark" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={pad.l}
          x2={width - pad.r}
          y1={expY}
          y2={expY}
          stroke="var(--color-text-muted)"
          strokeDasharray="3 4"
        />
        <path d={areaPath} fill="url(#okr-drawer-spark)" />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={pts[pts.length - 1]![0]}
          cy={pts[pts.length - 1]![1]}
          r={3.5}
          fill={color}
        />
      </svg>
    </div>
  );
}

function KrMiniCard({
  kr,
  onOpen,
}: {
  kr: {
    id: string;
    code: string;
    title: string;
    progress: number;
    status: string;
    currentValue: number;
    targetValue: number;
    unit?: string | null;
  };
  onOpen?: () => void;
}) {
  const confidence = statusToConfidence(kr.status);
  const pct = Math.round(clamp01(kr.progress) * 100);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-2.5 block w-full rounded-xl border border-border-secondary bg-surface-primary p-4 text-left transition-colors hover:bg-surface-hover"
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            background: "var(--color-brand-glow)",
            color: "var(--brand-400)",
            fontFamily:
              "var(--mantine-font-family-monospace, ui-monospace, monospace)",
          }}
        >
          {kr.code}
        </span>
        <div className="flex-1 text-sm font-medium text-text-primary">
          {kr.title}
        </div>
        <StatusPill confidence={confidence} />
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-4">
        <div>
          <div className="relative h-1 overflow-hidden rounded-sm bg-surface-tertiary">
            <div
              className="absolute left-0 top-0 h-full rounded-sm"
              style={{
                width: `${Math.max(pct, 2)}%`,
                background: CONFIDENCE_COLOR[confidence],
              }}
            />
          </div>
        </div>
        <div className="text-right text-sm font-semibold tabular-nums text-text-primary">
          {pct}%
        </div>
      </div>
    </button>
  );
}

function ActivityFeed({
  comments,
  checkIns,
}: {
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date | string;
    author: DrawerUser;
  }>;
  checkIns?: Array<{
    id: string;
    previousValue: number;
    newValue: number;
    notes: string | null;
    createdAt: Date | string;
    createdBy?: DrawerUser | null;
  }>;
}) {
  type Item =
    | {
        kind: "comment";
        id: string;
        at: Date;
        author: DrawerUser;
        body: string;
      }
    | {
        kind: "checkIn";
        id: string;
        at: Date;
        author: DrawerUser | null;
        previousValue: number;
        newValue: number;
        notes: string | null;
      };

  const items: Item[] = [
    ...comments.map(
      (c): Item => ({
        kind: "comment",
        id: c.id,
        at: new Date(c.createdAt),
        author: c.author,
        body: c.content,
      }),
    ),
    ...(checkIns ?? []).map(
      (c): Item => ({
        kind: "checkIn",
        id: c.id,
        at: new Date(c.createdAt),
        author: c.createdBy ?? null,
        previousValue: c.previousValue,
        newValue: c.newValue,
        notes: c.notes,
      }),
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-primary p-8 text-center text-sm text-text-muted">
        No activity yet. Post an update or comment to get things started.
      </div>
    );
  }

  return (
    <div>
      {items.map((it) => (
        <div
          key={`${it.kind}-${it.id}`}
          className="grid grid-cols-[28px_1fr] gap-3 border-b border-border-secondary py-3 last:border-b-0"
        >
          <Avatar user={it.author} size={26} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-text-primary">
                {it.author?.name ?? it.author?.email ?? "Unknown"}
              </span>
              <span className="text-xs text-text-secondary">
                {it.kind === "comment" ? "commented" : "updated progress"}
              </span>
              <div className="flex-1" />
              <span className="text-[11px] text-text-muted">
                {formatDistanceToNow(it.at, { addSuffix: true })}
              </span>
            </div>
            {it.kind === "comment" ? (
              <div className="mt-2 whitespace-pre-wrap rounded-lg border border-border-secondary bg-surface-primary p-3 text-sm leading-relaxed text-text-secondary">
                {it.body}
              </div>
            ) : (
              <div className="mt-2 inline-flex items-baseline gap-2 rounded-lg border border-border-secondary bg-surface-primary px-3 py-2 tabular-nums">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Progress
                </span>
                <span className="text-sm text-text-muted line-through">
                  {it.previousValue}
                </span>
                <span className="text-xs text-text-muted">→</span>
                <span className="text-base font-semibold text-text-primary">
                  {it.newValue}
                </span>
                {it.notes && (
                  <span className="ml-2 text-xs text-text-secondary">
                    {it.notes}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityComposer({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (text: string) => Promise<void> | void;
  isSubmitting: boolean;
}) {
  const [text, setText] = useState("");
  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    await onSubmit(value);
    setText("");
  };
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-border-secondary bg-surface-primary">
      <Textarea
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Add a comment… use @ to mention"
        autosize
        minRows={2}
        variant="unstyled"
        styles={{
          input: {
            padding: "12px 14px",
            fontSize: 13,
            background: "transparent",
            color: "var(--color-text-primary)",
          },
        }}
      />
      <div className="flex items-center gap-2 border-t border-border-secondary px-3 py-2">
        <ActionIcon variant="subtle" size="sm" aria-label="Attach">
          <IconPaperclip size={13} />
        </ActionIcon>
        <ActionIcon variant="subtle" size="sm" aria-label="Mention">
          <IconAt size={13} />
        </ActionIcon>
        <div className="flex-1" />
        <span className="text-[11px] text-text-muted">⌘↵ to send</span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!text.trim() || isSubmitting}
          className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-text-inverse disabled:opacity-50"
          style={{ background: "var(--color-brand-primary)" }}
        >
          Comment
        </button>
      </div>
    </div>
  );
}

export function OkrDetailDrawer({
  opened,
  onClose,
  type,
  itemId,
  title: titleProp,
  status: statusProp = "on-track",
  lifeDomainName,
}: OkrDetailDrawerProps) {
  const utils = api.useUtils();
  const [tab, setTab] = useState<string>("overview");
  const [size, setSize] = useState<TopBarSize>("m");

  const drawerSize =
    size === "s" ? 560 : size === "l" ? 960 : size === "max" ? "100%" : 720;

  // Data queries
  const objectiveQuery = api.goal.getById.useQuery(
    { id: itemId as number },
    { enabled: opened && type === "objective" && typeof itemId === "number" },
  );
  const krQuery = api.okr.getById.useQuery(
    { id: itemId as string },
    { enabled: opened && type === "keyResult" && typeof itemId === "string" },
  );

  const goalCommentsQuery = api.okr.getGoalComments.useQuery(
    { goalId: itemId as number },
    { enabled: opened && type === "objective" && typeof itemId === "number" },
  );
  const krCommentsQuery = api.okr.getKeyResultComments.useQuery(
    { keyResultId: itemId as string },
    { enabled: opened && type === "keyResult" && typeof itemId === "string" },
  );

  const addGoalComment = api.okr.addGoalComment.useMutation({
    onSuccess: () => {
      void utils.okr.getGoalComments.invalidate({ goalId: itemId as number });
    },
  });
  const addKrComment = api.okr.addKeyResultComment.useMutation({
    onSuccess: () => {
      void utils.okr.getKeyResultComments.invalidate({
        keyResultId: itemId as string,
      });
    },
  });

  const isObjective = type === "objective";
  const data = isObjective ? objectiveQuery.data : krQuery.data;
  const isLoading = isObjective ? objectiveQuery.isLoading : krQuery.isLoading;

  // Compute all display fields once we have data
  const view = useMemo(() => {
    if (!data) return null;

    if (isObjective) {
      const g = objectiveQuery.data!;
      const krs = (g.keyResults ?? []).map((kr, i) => {
        const range = kr.targetValue - kr.startValue;
        const progress =
          range > 0
            ? Math.max(0, Math.min(1, (kr.currentValue - kr.startValue) / range))
            : 0;
        return {
          id: kr.id,
          code: `KR${g.id}.${i + 1}`,
          title: kr.title,
          progress,
          status: kr.status,
          currentValue: kr.currentValue,
          targetValue: kr.targetValue,
          unit: kr.unit,
        };
      });
      const avgProgress =
        krs.length > 0 ? krs.reduce((a, k) => a + k.progress, 0) / krs.length : 0;
      const onTrack = krs.filter(
        (k) => statusToConfidence(k.status) === "ok",
      ).length;
      const atRisk = krs.filter((k) => {
        const c = statusToConfidence(k.status);
        return c === "warn" || c === "bad";
      }).length;
      const statusConf = statusToConfidence(statusProp);
      const expFrac = g.period ? expectedProgress(g.period) : 0;
      const parent = g.period ? /^(Q[1-4]|H[12])-(\d{4})$/.exec(g.period) : null;
      const parentLabel = parent ? `ANNUAL-${parent[2]}` : null;
      const latest = goalCommentsQuery.data?.[goalCommentsQuery.data.length - 1];
      return {
        kind: "objective" as const,
        id: g.id,
        code: `O${g.id}`,
        title: g.title,
        description: g.description ?? g.whyThisGoal ?? null,
        period: g.period,
        parentLabel,
        statusConf,
        progressFrac: avgProgress,
        expectedFrac: expFrac,
        deltaPts: 0, // no per-objective history available
        owner: g.driUser ?? g.user,
        collaborators: [] as DrawerUser[],
        updatedLabel: g.updatedAt ? relativeTimeLabel(g.updatedAt) : "—",
        kpis: {
          krsTotal: krs.length,
          krsOnTrack: onTrack,
          krsAtRisk: atRisk,
          contributors: 1 + krs.length, // best-effort estimate until we store real contributors
          due: g.dueDate ? format(new Date(g.dueDate), "MMM d, yyyy") : "—",
        },
        trend: [] as number[],
        krs,
        latestUpdate: latest
          ? {
              author: latest.author,
              body: latest.content,
              confidence: statusConf,
              whenLabel: formatDistanceToNow(new Date(latest.createdAt), {
                addSuffix: true,
              }),
            }
          : null,
      };
    }

    // Key Result
    const kr = krQuery.data!;
    const range = kr.targetValue - kr.startValue;
    const progressFrac =
      range > 0
        ? Math.max(0, Math.min(1, (kr.currentValue - kr.startValue) / range))
        : 0;
    const statusConf = statusToConfidence(kr.status);
    const expFrac = kr.period ? expectedProgress(kr.period) : 0;

    // Build trend from check-ins (progress per check-in, oldest first)
    const sortedCheckIns = [...(kr.checkIns ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const trend = sortedCheckIns.map((c) =>
      range > 0
        ? Math.max(0, Math.min(1, (c.newValue - kr.startValue) / range))
        : 0,
    );
    // Prepend a 0 so the line starts at origin
    if (trend.length >= 1) trend.unshift(0);

    // Delta: current progress vs previous check-in
    const prev = sortedCheckIns[sortedCheckIns.length - 2];
    const prevFrac = prev
      ? range > 0
        ? (prev.newValue - kr.startValue) / range
        : 0
      : 0;
    const deltaPts =
      sortedCheckIns.length >= 2 ? (progressFrac - prevFrac) * 100 : 0;

    const parent = kr.period ? /^(Q[1-4]|H[12])-(\d{4})$/.exec(kr.period) : null;
    const parentLabel = parent ? `ANNUAL-${parent[2]}` : null;

    const latest = krCommentsQuery.data?.[krCommentsQuery.data.length - 1];
    const latestUpdate = latest
      ? {
          author: latest.author,
          body: latest.content,
          confidence: statusConf,
          whenLabel: formatDistanceToNow(new Date(latest.createdAt), {
            addSuffix: true,
          }),
        }
      : null;

    const unitLabel =
      kr.unit === "percent"
        ? "%"
        : kr.unit === "currency"
          ? "$"
          : kr.unit === "hours"
            ? "h"
            : (kr.unitLabel ?? "");
    const fmtValue = (v: number) =>
      kr.unit === "percent"
        ? `${Math.round(v)}%`
        : kr.unit === "currency"
          ? `$${v.toLocaleString()}`
          : kr.unit === "hours"
            ? `${v.toLocaleString()}h`
            : kr.unitLabel
              ? `${v.toLocaleString()} ${kr.unitLabel}`
              : v.toLocaleString();

    const due = kr.goal?.dueDate
      ? format(new Date(kr.goal.dueDate), "MMM d, yyyy")
      : "—";

    const latestCheckIn = sortedCheckIns[sortedCheckIns.length - 1];
    const updatedLabel = latestCheckIn
      ? formatDistanceToNow(new Date(latestCheckIn.createdAt), {
          addSuffix: true,
        })
      : "never";

    return {
      kind: "keyResult" as const,
      id: kr.id,
      code: `KR${kr.goal.id}.1`, // best-effort code until we persist index
      title: kr.title,
      description: kr.description ?? null,
      period: kr.period,
      parentLabel,
      parentCode: `O${kr.goal.id}`,
      parentTitle: kr.goal.title,
      statusConf,
      progressFrac,
      expectedFrac: expFrac,
      deltaPts,
      owner: kr.driUser,
      collaborators: [] as DrawerUser[],
      updatedLabel,
      kpis: {
        current: fmtValue(kr.currentValue),
        target: fmtValue(kr.targetValue),
        unit: unitLabel,
        due,
      },
      trend,
      checkIns: kr.checkIns ?? [],
      projects: kr.projects ?? [],
      latestUpdate,
    };
  }, [
    isObjective,
    data,
    objectiveQuery.data,
    krQuery.data,
    goalCommentsQuery.data,
    krCommentsQuery.data,
    statusProp,
  ]);

  const comments =
    type === "objective"
      ? (goalCommentsQuery.data ?? [])
      : (krCommentsQuery.data ?? []);

  const handleAddComment = async (text: string) => {
    if (type === "objective") {
      await addGoalComment.mutateAsync({
        goalId: itemId as number,
        content: text,
      });
    } else {
      await addKrComment.mutateAsync({
        keyResultId: itemId as string,
        content: text,
      });
    }
  };

  const kind: "objective" | "keyResult" = type;

  const tabs = useMemo(() => {
    if (!view) return [{ id: "overview", label: "Overview" }];
    if (view.kind === "objective") {
      return [
        { id: "overview", label: "Overview" },
        { id: "krs", label: "Key Results", count: view.krs.length },
        { id: "activity", label: "Activity", count: comments.length },
      ];
    }
    return [
      { id: "overview", label: "Overview" },
      { id: "projects", label: "Projects", count: view.projects.length },
      {
        id: "activity",
        label: "Activity",
        count: comments.length + (view.checkIns?.length ?? 0),
      },
    ];
  }, [view, comments.length]);

  const heroCrumb = view
    ? view.kind === "objective"
      ? `${view.code}${lifeDomainName ? ` · ${lifeDomainName}` : ""}${view.period ? ` · ${view.period.replace("-", " ")}` : ""}`
      : `${view.parentCode} · ${view.parentTitle}`
    : "";

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={drawerSize}
      withCloseButton={false}
      padding={0}
      withOverlay={false}
      styles={{
        content: {
          background: "var(--color-bg-primary)",
          display: "flex",
          flexDirection: "column",
        },
        body: { padding: 0, display: "flex", flexDirection: "column", flex: 1 },
      }}
      trapFocus={false}
      lockScroll={false}
    >
      <TopBar
        kind={kind}
        crumb={heroCrumb}
        size={size}
        onSize={setSize}
        onClose={onClose}
      />

      {isLoading || !view ? (
        <div className="flex-1 p-6">
          <Skeleton height={28} width={160} mb="md" />
          <Skeleton height={32} width="80%" mb="lg" />
          <Skeleton height={8} mb="md" />
          <Skeleton height={80} mb="md" />
          <Skeleton height={200} />
        </div>
      ) : (
        <>
          {/* Hero */}
          <div className="flex-shrink-0 border-b border-border-secondary px-6 pb-5 pt-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <MetaPill
                variant="code"
                icon={
                  kind === "objective" ? (
                    <IconTarget size={10} />
                  ) : (
                    <IconTrendingUp size={10} />
                  )
                }
              >
                {view.code}
              </MetaPill>
              <StatusPill confidence={view.statusConf} />
              {view.period && (
                <MetaPill>{view.period.replace("-", " ")}</MetaPill>
              )}
              {view.parentLabel && <MetaPill>{view.parentLabel}</MetaPill>}
            </div>

            <h2 className="m-0 text-2xl font-semibold leading-tight tracking-tight text-text-primary">
              {titleProp ?? view.title}
            </h2>

            <ProgressRow
              progress={view.progressFrac}
              expected={view.expectedFrac}
              deltaPts={view.deltaPts}
              confidence={view.statusConf}
            />

            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border-secondary pt-3.5">
              {view.kind === "objective" ? (
                <>
                  <Kpi
                    label="Key Results"
                    value={view.kpis.krsTotal}
                    sub={
                      <>
                        {view.kpis.krsOnTrack} on track · {view.kpis.krsAtRisk}{" "}
                        at risk
                      </>
                    }
                  />
                  <Kpi
                    withDivider
                    label="Contributors"
                    value={view.kpis.contributors}
                  />
                  <Kpi withDivider label="Due" value={view.kpis.due} />
                </>
              ) : (
                <>
                  <Kpi label="Current" value={view.kpis.current} />
                  <Kpi withDivider label="Target" value={view.kpis.target} />
                  <Kpi withDivider label="Due" value={view.kpis.due} />
                </>
              )}
            </div>

            <HeroCtas />
          </div>

          <PeopleStrip
            owner={view.owner}
            collaborators={view.collaborators}
            updatedLabel={view.updatedLabel}
          />

          <Tabs tabs={tabs} active={tab} onChange={setTab} />

          <div className="flex-1 overflow-y-auto px-6 pb-10 pt-5">
            {tab === "overview" && (
              <>
                <LatestUpdateCard latest={view.latestUpdate} />
                <ZoeNudge
                  body={
                    view.statusConf === "bad" || view.statusConf === "warn"
                      ? `This ${view.kind === "objective" ? "objective" : "KR"} is off the expected pace. Want me to draft a summary for the team?`
                      : `You're ${Math.round((view.progressFrac - view.expectedFrac) * 100)}pt ahead of pace this week. Want me to draft a quick update?`
                  }
                  ctaLabel="Draft update"
                />
                {view.description && <DescriptionCard text={view.description} />}
                <TrendChart
                  series={
                    view.kind === "keyResult"
                      ? view.trend
                      : [0, view.progressFrac]
                  }
                  confidence={view.statusConf}
                  expectedFrac={view.expectedFrac}
                />
              </>
            )}

            {tab === "krs" && view.kind === "objective" && (
              <>
                <SectionHeader
                  title="Key Results"
                  count={view.krs.length}
                  action={
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    >
                      <IconPlus size={11} /> Add KR
                    </button>
                  }
                />
                {view.krs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border-primary p-8 text-center text-sm text-text-muted">
                    No key results yet.
                  </div>
                ) : (
                  view.krs.map((kr) => <KrMiniCard key={kr.id} kr={kr} />)
                )}
              </>
            )}

            {tab === "projects" && view.kind === "keyResult" && (
              <>
                <SectionHeader
                  title="Linked projects"
                  count={view.projects.length}
                  action={
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    >
                      <IconLink size={11} /> Link project
                    </button>
                  }
                />
                {view.projects.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border-primary p-8 text-center text-sm text-text-muted">
                    No projects linked to this key result yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border-secondary">
                    {view.projects.map((p, idx) => (
                      <div
                        key={p.project.id}
                        className={`grid grid-cols-[32px_1fr_auto] items-center gap-3 px-4 py-3 ${
                          idx > 0 ? "border-t border-border-secondary" : ""
                        }`}
                      >
                        <div
                          className="grid h-8 w-8 place-items-center rounded-md text-xs font-semibold text-text-inverse"
                          style={{ background: "var(--color-brand-primary)" }}
                        >
                          {(p.project.name ?? "·").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-text-primary">
                            {p.project.name}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            {p.project.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "activity" && (
              <>
                <ActivityComposer
                  onSubmit={handleAddComment}
                  isSubmitting={
                    addGoalComment.isPending || addKrComment.isPending
                  }
                />
                <SectionHeader title="Activity" count={tabs.find((t) => t.id === "activity")?.count} />
                <ActivityFeed
                  comments={comments}
                  checkIns={
                    view.kind === "keyResult" ? view.checkIns : undefined
                  }
                />
              </>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

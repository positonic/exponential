"use client";

import { useMemo, useState } from "react";
import { Loader, Popover, Select, Stack, Text } from "@mantine/core";
import { IconCompass, IconLink, IconPlus, IconTarget } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { EditKeyResultModal } from "~/plugins/okr/client/components/EditKeyResultModal";

type ProjectWithDetails = RouterOutputs["project"]["getActiveWithDetails"][number];

interface KeyResultsSectionProps {
  project: ProjectWithDetails;
  workspaceId: string | null;
  workspaceName: string | null;
  /** Called after a link/unlink so parent can refetch project data. */
  onLinksChanged: () => void;
}

/** Normalized shape both `okr.getByIds` and `okr.getAll` map into. */
interface DisplayKr {
  id: string;
  title: string;
  status: string | null;
  currentValue: number;
  targetValue: number;
  startValue: number;
  goalId: number;
  goalTitle: string;
  linked: boolean;
}

function getCurrentQuarter(now: Date): {
  label: string;
  shortLabel: string;
  period: string;
  start: Date;
  end: Date;
} {
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  const year = now.getFullYear();
  return {
    label: `Q${quarter} ${year}`,
    shortLabel: `Q${quarter}`,
    period: `Q${quarter}-${year}`,
    start: new Date(year, (quarter - 1) * 3, 1),
    end: new Date(year, quarter * 3, 0, 23, 59, 59, 999),
  };
}

function computeProgressPct(kr: DisplayKr): number {
  const range = kr.targetValue - kr.startValue;
  if (range === 0) return 0;
  const pct = ((kr.currentValue - kr.startValue) / range) * 100;
  return Math.min(Math.max(pct, 0), 100);
}

/** Confidence dot / progress-bar color, driven by KR status. */
function confColor(status: string | null): string {
  switch (status) {
    case "achieved":
    case "on-track":
      return "bg-green-500";
    case "at-risk":
      return "bg-yellow-500";
    case "off-track":
      return "bg-red-500";
    default:
      return "bg-surface-hover";
  }
}

/**
 * Pace chip — derived from progress vs. how much of the quarter has elapsed,
 * blended with KR status (per the Stage-0 decision). Status flags risk first;
 * otherwise progress-vs-time decides ahead / on pace / behind.
 */
function derivePace(
  pct: number,
  elapsedPct: number,
  status: string | null,
): { label: string; className: string } {
  const ahead = { label: "Ahead", className: "bg-green-500/10 text-green-500" };
  const on = { label: "On pace", className: "bg-green-500/10 text-green-500" };
  const behind = { label: "Behind", className: "bg-red-500/10 text-red-500" };
  const watch = { label: "Watch", className: "bg-yellow-500/10 text-yellow-500" };

  if (status === "off-track") return behind;
  if (status === "at-risk") return watch;
  if (status === "achieved") return ahead;

  const delta = pct - elapsedPct;
  if (delta >= 10) return ahead;
  if (delta <= -10) return behind;
  return on;
}

/** Assign O{n}.{m} codes over the union of displayed KRs, grouped by goal. */
function buildCodes(
  rows: DisplayKr[],
): Map<string, { objectiveCode: string; krCode: string }> {
  const sorted = [...rows].sort((a, b) => a.goalTitle.localeCompare(b.goalTitle));
  const goalNum = new Map<number, number>();
  let next = 1;
  for (const r of sorted) {
    if (!goalNum.has(r.goalId)) goalNum.set(r.goalId, next++);
  }
  const pos = new Map<number, number>();
  const codes = new Map<string, { objectiveCode: string; krCode: string }>();
  for (const r of sorted) {
    const o = goalNum.get(r.goalId) ?? 0;
    const p = (pos.get(r.goalId) ?? 0) + 1;
    pos.set(r.goalId, p);
    codes.set(r.id, { objectiveCode: `O${o}`, krCode: `${o}.${p}` });
  }
  return codes;
}

interface KrRowProps {
  kr: DisplayKr;
  objectiveCode: string;
  krCode: string;
  elapsedPct: number;
  pending: boolean;
  onToggle: () => void;
}

/**
 * A single KR row. The link control is a PILL toggle — deliberately NOT a
 * round to-do checkbox — so KRs read as a relationship, not a completable task.
 */
function KrRow({ kr, objectiveCode, krCode, elapsedPct, pending, onToggle }: KrRowProps) {
  const pct = computeProgressPct(kr);
  const pace = derivePace(pct, elapsedPct, kr.status);
  const dot = confColor(kr.status);

  return (
    <div
      className={
        "flex items-center gap-3 rounded-lg border px-3 py-3 " +
        (kr.linked
          ? "border-l-[3px] border-l-blue-500 border-border-primary bg-surface-secondary"
          : "border-border-subtle bg-background-primary hover:border-border-strong")
      }
    >
      {kr.linked ? (
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          aria-label="Unlink this Key Result"
          className="group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-blue-500 bg-blue-500 px-2.5 text-[11px] font-semibold text-white transition-colors hover:border-red-500 hover:bg-red-500 disabled:opacity-50"
        >
          <IconLink size={13} />
          <span className="group-hover:hidden">Linked</span>
          <span className="hidden group-hover:inline">Unlink</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          aria-label="Link this Key Result"
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-2.5 text-[11px] font-semibold text-text-muted transition-colors hover:border-blue-500 hover:text-blue-500 disabled:opacity-50"
        >
          <IconLink size={13} />
          Link
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] tracking-wide text-text-muted">
            <span className={"h-1.5 w-1.5 rounded-full " + dot} />
            KR {krCode}
          </span>
          <span
            className={
              "truncate text-sm " +
              (kr.linked ? "text-text-primary" : "text-text-secondary")
            }
          >
            {kr.title}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-text-muted">
          Objective {objectiveCode}
          {kr.goalTitle ? (
            <>
              {" · "}
              <span className="text-text-secondary">{kr.goalTitle}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="h-1.5 w-[72px] overflow-hidden rounded-full bg-surface-hover">
          <div
            className={"h-full transition-all " + confColor(kr.status)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-9 text-right font-mono text-xs text-text-secondary">
          {Math.round(pct)}%
        </span>
        <span
          className={
            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
            pace.className
          }
        >
          {pace.label}
        </span>
      </div>
    </div>
  );
}

export function KeyResultsSection({
  project,
  workspaceId,
  workspaceName,
  onLinksChanged,
}: KeyResultsSectionProps) {
  const [showAllKrs, setShowAllKrs] = useState(false);

  // Create-new-KR flow (goal picker → EditKeyResultModal), lives in the footer.
  const [createOpen, setCreateOpen] = useState(false);
  const [createGoalId, setCreateGoalId] = useState<number | null>(null);
  const [krModalOpen, setKrModalOpen] = useState(false);

  const quarter = useMemo(() => getCurrentQuarter(new Date()), []);

  const linkedKrIds = useMemo(
    () => project.keyResults.map((k) => k.keyResultId),
    [project.keyResults],
  );
  const linkedSet = useMemo(() => new Set(linkedKrIds), [linkedKrIds]);

  // Linked KR details (any period — always shown).
  const linkedQuery = api.okr.getByIds.useQuery(
    { ids: linkedKrIds },
    { enabled: linkedKrIds.length > 0 },
  );

  // The workspace's KR pool for the current quarter (for "link another KR").
  const poolQuery = api.okr.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined, period: quarter.period },
    { enabled: workspaceId !== null },
  );

  // Goals available for the "Create new Key Result" picker.
  const goalsQuery = api.okr.getAvailableGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );
  const goalOptions = useMemo(
    () =>
      (goalsQuery.data ?? []).map((g) => ({ value: String(g.id), label: g.title })),
    [goalsQuery.data],
  );

  const linkProject = api.okr.linkProject.useMutation();
  const unlinkProject = api.okr.unlinkProject.useMutation();
  const isPending = linkProject.isPending || unlinkProject.isPending;

  // Quarter pacing meta.
  const totalDays = Math.max(
    1,
    Math.round(
      (quarter.end.getTime() - quarter.start.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  const elapsedDays = Math.max(
    0,
    Math.round((Date.now() - quarter.start.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const daysLeft = Math.max(0, totalDays - elapsedDays);
  const elapsedPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

  // Normalize linked + pool into one display list, then split.
  const { linkedRows, otherRows, codes } = useMemo(() => {
    const linked: DisplayKr[] = (linkedQuery.data ?? []).map((kr) => ({
      id: kr.id,
      title: kr.title,
      status: kr.status,
      currentValue: kr.currentValue,
      targetValue: kr.targetValue,
      startValue: kr.startValue,
      goalId: kr.goalId,
      goalTitle: kr.goal?.title ?? "",
      linked: true,
    }));
    const others: DisplayKr[] = (poolQuery.data ?? [])
      .filter((kr) => !linkedSet.has(kr.id))
      .map((kr) => ({
        id: kr.id,
        title: kr.title,
        status: kr.status,
        currentValue: kr.currentValue,
        targetValue: kr.targetValue,
        startValue: kr.startValue,
        goalId: kr.goalId,
        goalTitle: kr.goal?.title ?? "",
        linked: false,
      }));
    return {
      linkedRows: linked,
      otherRows: others,
      codes: buildCodes([...linked, ...others]),
    };
  }, [linkedQuery.data, poolQuery.data, linkedSet]);

  const refetchAll = () => {
    void linkedQuery.refetch();
    void poolQuery.refetch();
    onLinksChanged();
  };

  const handleToggle = (krId: string, currentlyLinked: boolean) => {
    const mutation = currentlyLinked ? unlinkProject : linkProject;
    mutation.mutate(
      { keyResultId: krId, projectId: project.id },
      { onSuccess: refetchAll },
    );
  };

  const loading = linkedKrIds.length > 0 && linkedQuery.isLoading;

  return (
    <div>
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconTarget size={15} className="text-text-muted" />
          <span className="text-sm font-semibold text-text-primary">
            Key Results
          </span>
          <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 font-mono text-[10.5px] text-yellow-500">
            {quarter.label}
          </span>
        </div>
        <span className="text-xs text-text-muted">
          {linkedRows.length} linked · {daysLeft} days left · {elapsedPct}% elapsed
        </span>
      </div>

      {/* Rows */}
      {loading ? (
        <div className="flex justify-center p-6">
          <Loader size="sm" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {linkedRows.length === 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-yellow-500/30 bg-yellow-500/5 px-4 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-500">
                <IconCompass size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary">
                  Not tied to a Key Result yet
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  Link the bet this project drives — or use the pass to ask
                  whether it&apos;s the right work for {quarter.shortLabel}.
                </div>
              </div>
            </div>
          )}

          {linkedRows.map((kr) => {
            const code = codes.get(kr.id) ?? { objectiveCode: "O0", krCode: "0.0" };
            return (
              <KrRow
                key={kr.id}
                kr={kr}
                objectiveCode={code.objectiveCode}
                krCode={code.krCode}
                elapsedPct={elapsedPct}
                pending={isPending}
                onToggle={() => handleToggle(kr.id, true)}
              />
            );
          })}

          {showAllKrs &&
            otherRows.map((kr) => {
              const code = codes.get(kr.id) ?? {
                objectiveCode: "O0",
                krCode: "0.0",
              };
              return (
                <KrRow
                  key={kr.id}
                  kr={kr}
                  objectiveCode={code.objectiveCode}
                  krCode={code.krCode}
                  elapsedPct={elapsedPct}
                  pending={isPending}
                  onToggle={() => handleToggle(kr.id, false)}
                />
              );
            })}
        </div>
      )}

      {/* Footer: link-another (inline reveal) + create-new */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAllKrs((s) => !s)}
          disabled={!showAllKrs && otherRows.length === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-40"
        >
          <IconLink size={13} />
          {showAllKrs
            ? "Hide other Key Results"
            : otherRows.length > 0
              ? `Link another KR · ${otherRows.length} more${
                  workspaceName ? ` in ${workspaceName}` : ""
                }`
              : "Link another KR"}
        </button>

        <Popover
          opened={createOpen}
          onChange={setCreateOpen}
          position="bottom-start"
          withArrow
          shadow="md"
        >
          <Popover.Target>
            <button
              type="button"
              onClick={() => setCreateOpen((o) => !o)}
              disabled={!workspaceId}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-40"
            >
              <IconPlus size={13} /> Create new Key Result
            </button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs" style={{ minWidth: 260 }}>
              <Text size="xs" className="text-text-secondary">
                Pick a goal for this Key Result
              </Text>
              <Select
                placeholder={
                  goalsQuery.isLoading ? "Loading goals…" : "Select a goal"
                }
                data={goalOptions}
                value={createGoalId != null ? String(createGoalId) : null}
                onChange={(val) => {
                  if (!val) return;
                  setCreateGoalId(Number(val));
                  setCreateOpen(false);
                  setKrModalOpen(true);
                }}
                searchable
                nothingFoundMessage="No goals in this workspace"
              />
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </div>

      {createGoalId != null && workspaceId && (
        <EditKeyResultModal
          mode="create"
          opened={krModalOpen}
          onClose={() => {
            setKrModalOpen(false);
            setCreateGoalId(null);
          }}
          goalId={createGoalId}
          period={quarter.period}
          workspaceId={workspaceId}
          initialProjectIds={[project.id]}
          onSuccess={refetchAll}
        />
      )}
    </div>
  );
}

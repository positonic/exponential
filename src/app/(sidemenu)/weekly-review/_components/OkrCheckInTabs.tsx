"use client";

import { useMemo, useState } from "react";
import {
  IconChevronRight,
  IconCheck,
  IconBolt,
  IconPlus,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { EditKeyResultModal } from "~/plugins/okr/client/components/EditKeyResultModal";
import {
  workspaceGlyphVar,
  workspaceShortName,
  type ReviewData,
  type ReviewWorkspace,
} from "./types";

type ObjectiveData = RouterOutputs["okr"]["getByObjective"][number];
type KrData = ObjectiveData["keyResults"][number];

interface Props {
  data: ReviewData;
  focusedWorkspaces: ReviewWorkspace[];
  themes: Map<string, string | null>;
  bets: Map<string, string[]>; // workspaceId -> KR ids
  onBetsChange: (workspaceId: string, betIds: string[]) => void;
  onCheckInLogged: () => void;
}

const QUARTERS = ["Q1", "Q2", "Q3", "Q4", "Annual"];

export function OkrCheckInTabs({
  data,
  focusedWorkspaces,
  themes,
  bets,
  onBetsChange,
  onCheckInLogged,
}: Props) {
  const [activeWsId, setActiveWsId] = useState<string | null>(
    focusedWorkspaces[0]?.id ?? null,
  );

  const active = useMemo(
    () =>
      focusedWorkspaces.find((w) => w.id === activeWsId) ??
      focusedWorkspaces[0] ??
      null,
    [activeWsId, focusedWorkspaces],
  );

  if (!active) {
    return (
      <div className="pr-empty">
        Pick at least one workspace in Phase 1 to review its objectives here.
      </div>
    );
  }

  const activeIndex = data.workspaces.findIndex((w) => w.id === active.id);

  return (
    <div>
      <div className="pr-goals-tabs">
        {focusedWorkspaces.map((ws) => {
          const idx = data.workspaces.findIndex((w) => w.id === ws.id);
          const rollup = data.quarterRollupByWorkspace.find(
            (r) => r.workspaceId === ws.id,
          );
          return (
            <button
              key={ws.id}
              type="button"
              className={
                ws.id === active.id ? "pr-goal-tab is-active" : "pr-goal-tab"
              }
              onClick={() => setActiveWsId(ws.id)}
            >
              <span
                className="pr-goal-tab__glyph"
                style={{ background: workspaceGlyphVar(idx) }}
              >
                {workspaceShortName(ws.name)}
              </span>
              <span>{ws.name}</span>
              <span className="pr-goal-tab__count">
                {rollup?.okrCount ?? 0} obj
              </span>
            </button>
          );
        })}
      </div>

      <ObjectivesPanel
        data={data}
        workspace={active}
        workspaceIndex={activeIndex}
        theme={themes.get(active.id) ?? null}
        bets={bets.get(active.id) ?? []}
        onBetsChange={(next) => onBetsChange(active.id, next)}
        onCheckInLogged={onCheckInLogged}
      />
    </div>
  );
}

interface ObjectivesPanelProps {
  data: ReviewData;
  workspace: ReviewWorkspace;
  workspaceIndex: number;
  theme: string | null;
  bets: string[];
  onBetsChange: (next: string[]) => void;
  onCheckInLogged: () => void;
}

function ObjectivesPanel({
  data,
  workspace,
  theme,
  bets,
  onBetsChange,
  onCheckInLogged,
}: ObjectivesPanelProps) {
  const [quarter, setQuarter] = useState<string>(
    data.currentQuarter.split("-")[0] ?? "Q2",
  );
  const year = new Date(data.now).getUTCFullYear();
  const period =
    quarter === "Annual" ? `Annual-${year}` : `${quarter}-${year}`;

  const objectives = api.okr.getByObjective.useQuery({
    workspaceId: workspace.id,
    period,
    includePairedPeriod: quarter !== "Annual",
  });

  const monthlyOutcomes = (data.monthlyOutcomesByWorkspace[workspace.id] ??
    []) as Array<{ id: string; description: string; dueDate: Date | null }>;

  return (
    <div>
      <div className="pr-quarter-row">
        <div className="pr-quarter-bar">
          {QUARTERS.map((q) => (
            <button
              key={q}
              type="button"
              className={
                q === quarter
                  ? "pr-quarter-bar__btn is-active"
                  : "pr-quarter-bar__btn"
              }
              onClick={() => setQuarter(q)}
            >
              <span>{q}</span>
            </button>
          ))}
        </div>
        <CreateGoalModal
          defaultWorkspaceId={workspace.id}
          defaultPeriod={period}
          onSuccess={() => void objectives.refetch()}
          trigger={
            <button type="button" className="pr-create-goal-btn">
              <IconPlus size={13} /> Create goal
            </button>
          }
        />
      </div>

      {theme && (
        <div className="pr-theme-banner">
          <div className="pr-theme-banner__top">
            <span className="pr-theme-banner__label">Theme</span>
            <span className="pr-theme-banner__text">{theme}</span>
          </div>
        </div>
      )}

      {objectives.isLoading ? (
        <div className="pr-empty">Loading objectives…</div>
      ) : !objectives.data || objectives.data.length === 0 ? (
        <div className="pr-empty">
          <p style={{ marginBottom: 14 }}>
            No objectives set for {workspace.name} in {period}.
          </p>
          <CreateGoalModal
            defaultWorkspaceId={workspace.id}
            defaultPeriod={period}
            onSuccess={() => void objectives.refetch()}
            trigger={
              <button
                type="button"
                className="pr-create-goal-btn pr-create-goal-btn--primary"
              >
                <IconPlus size={14} /> Create goal
              </button>
            }
          />
        </div>
      ) : (
        <div className="pr-obj-list">
          {objectives.data.map((obj, idx) => (
            <ObjectiveRow
              key={obj.id}
              objective={obj}
              rank={idx + 1}
              bets={bets}
              onToggleBet={(krId) => {
                const next = bets.includes(krId)
                  ? bets.filter((b) => b !== krId)
                  : [...bets, krId];
                onBetsChange(next);
              }}
              onCheckInLogged={onCheckInLogged}
              workspaceId={workspace.id}
              period={period}
              onKrCreated={() => void objectives.refetch()}
            />
          ))}
        </div>
      )}

      {monthlyOutcomes.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="pr-phase-head__eyebrow">This month · outcomes due</div>
          <div className="pr-obj-list">
            {monthlyOutcomes.map((o) => (
              <div key={o.id} className="pr-obj">
                <div className="pr-obj__head">
                  <div className="pr-obj__rank">M</div>
                  <div className="pr-obj__id">OUT</div>
                  <div className="pr-obj__title">{o.description}</div>
                  <div />
                  <div />
                  <div />
                  <div />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ObjectiveRowProps {
  objective: ObjectiveData;
  rank: number;
  bets: string[];
  onToggleBet: (krId: string) => void;
  onCheckInLogged: () => void;
  workspaceId: string;
  period: string;
  onKrCreated: () => void;
}

function ObjectiveRow({
  objective,
  rank,
  bets,
  onToggleBet,
  onCheckInLogged,
  workspaceId,
  period,
  onKrCreated,
}: ObjectiveRowProps) {
  const [open, setOpen] = useState(rank === 1);
  const [addKrOpen, setAddKrOpen] = useState(false);
  const krs = objective.keyResults;

  // Aggregate confidence from KRs
  const counts = krs.reduce(
    (acc, kr) => {
      const s = kr.status;
      if (s === "on-track") acc.on++;
      else if (s === "at-risk") acc.atRisk++;
      else if (s === "off-track") acc.off++;
      else if (s === "achieved") acc.on++;
      else acc.none++;
      return acc;
    },
    { on: 0, atRisk: 0, off: 0, none: 0 },
  );

  const confLabel =
    counts.off > 0
      ? "Off track"
      : counts.atRisk > counts.on
        ? "At risk"
        : "On track";
  const confDotVar =
    counts.off > 0
      ? "var(--pr-off-track)"
      : counts.atRisk > counts.on
        ? "var(--pr-at-risk)"
        : "var(--pr-on-track)";

  return (
    <div className="pr-obj">
      <div className="pr-obj__head" onClick={() => setOpen(!open)}>
        <div
          className={
            rank <= 2 ? "pr-obj__rank pr-obj__rank--top" : "pr-obj__rank"
          }
        >
          {rank}
        </div>
        <div className="pr-obj__id">O{rank}</div>
        <div className="pr-obj__title">{objective.title}</div>
        <span className="pr-conf-pill">
          <span
            className="pr-conf-pill__dot"
            style={{ background: confDotVar }}
          />
          {confLabel}
        </span>
        <div />
        <div
          style={{
            fontSize: 11.5,
            color: "var(--pr-text-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {krs.length} KRs
        </div>
        <button
          type="button"
          className="pr-obj__expand"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          <IconChevronRight
            size={13}
            style={{
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }}
          />
        </button>
      </div>
      {open && (
        <div className="pr-kr-list">
          {krs.map((kr) => (
            <KrRow
              key={kr.id}
              kr={kr}
              isBet={bets.includes(kr.id)}
              onToggleBet={() => onToggleBet(kr.id)}
              onCheckInLogged={onCheckInLogged}
            />
          ))}
          <div className="pr-kr-add-row">
            <button
              type="button"
              className="pr-kr-add-btn"
              onClick={() => setAddKrOpen(true)}
            >
              <IconPlus size={12} /> Add key result
            </button>
          </div>
        </div>
      )}
      <EditKeyResultModal
        mode="create"
        variant="review"
        opened={addKrOpen}
        onClose={() => setAddKrOpen(false)}
        onSuccess={() => {
          onKrCreated();
          setAddKrOpen(false);
        }}
        goalId={objective.id}
        period={period}
        workspaceId={workspaceId}
      />
    </div>
  );
}

interface KrRowProps {
  kr: KrData;
  isBet: boolean;
  onToggleBet: () => void;
  onCheckInLogged: () => void;
}

function KrRow({ kr, isBet, onToggleBet, onCheckInLogged }: KrRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(kr.currentValue);

  const checkIn = api.okr.checkIn.useMutation({
    onSuccess: () => {
      setEditing(false);
      onCheckInLogged();
    },
  });

  const range = kr.targetValue - kr.startValue;
  const pct =
    range > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(((kr.currentValue - kr.startValue) / range) * 100),
          ),
        )
      : 0;

  const fillVar =
    kr.status === "off-track"
      ? "var(--pr-off-track)"
      : kr.status === "at-risk"
        ? "var(--pr-at-risk)"
        : "var(--pr-on-track)";

  const owner = kr.driUser?.name ?? kr.user?.name ?? "—";
  const ownerInitials = owner
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <div className="pr-kr-row">
      <div className="pr-kr-row__id">KR</div>
      <div className="pr-kr-row__owner">{ownerInitials}</div>
      <div className="pr-kr-row__title">{kr.title}</div>
      <div className="pr-kr-row__progress">
        <div className="pr-kr-row__bar">
          <div
            className="pr-kr-row__bar-fill"
            style={{ width: `${pct}%`, background: fillVar }}
          />
        </div>
        <div className="pr-kr-row__pct">{pct}%</div>
      </div>
      {editing ? (
        <input
          type="number"
          value={draftValue}
          onChange={(e) => setDraftValue(Number(e.target.value))}
          onBlur={() => {
            if (draftValue !== kr.currentValue) {
              checkIn.mutate({
                keyResultId: kr.id,
                newValue: draftValue,
              });
            } else {
              setEditing(false);
            }
          }}
          autoFocus
          style={{
            width: 80,
            background: "var(--pr-surface-muted)",
            border: "1px solid var(--pr-border-subtle)",
            color: "var(--pr-text-primary)",
            borderRadius: 4,
            padding: "3px 6px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}
        />
      ) : (
        <button
          type="button"
          className="pr-kr-row__target"
          onClick={() => {
            setDraftValue(kr.currentValue);
            setEditing(true);
          }}
          style={{
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
        >
          {kr.currentValue}/{kr.targetValue}
          {kr.unit && kr.unit !== "percent" ? ` ${kr.unit}` : ""}
        </button>
      )}
      <button
        type="button"
        className={isBet ? "pr-kr-row__bet is-on" : "pr-kr-row__bet"}
        onClick={onToggleBet}
      >
        {isBet ? (
          <>
            <IconCheck size={11} /> Bet
          </>
        ) : (
          <>
            <IconBolt size={11} /> Bet on
          </>
        )}
      </button>
    </div>
  );
}

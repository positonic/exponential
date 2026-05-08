"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";
import {
  IconSparkles,
  IconSend,
  IconFolder,
  IconCalendar,
  IconTarget,
  IconFlag,
  IconMicrophone,
  IconCheck,
  IconPlayerPlay,
  IconClock,
  IconArrowRight,
  IconStack2,
  IconCheckbox,
  IconActivity,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useAgentModal } from "~/providers/AgentModalProvider";
import { stripHtml } from "~/lib/utils";
import { calculateProjectHealth } from "./ProjectHealth";
import { RitualCards } from "./RitualCards";
import classes from "./UserHomeDashboard.module.css";

type ProjectPill = "ok" | "active" | "due" | "amber";

const SUGGESTIONS = [
  "Standup on my projects",
  "Health-check my active work",
  "Summarise this week's OKRs",
  "What should I focus on today?",
];

export function UserHomeDashboard() {
  const { workspace, workspaceId } = useWorkspace();
  const { data: session } = useSession();
  const { openWithPrompt } = useAgentModal();

  const [prompt, setPrompt] = useState("");

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const workspaceName = workspace?.name ?? "Workspace";

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const shortDay = today.split(",")[0] ?? today;

  const utils = api.useUtils();

  const { data: projects, isLoading: projectsLoading } =
    api.project.getActiveWithDetails.useQuery({
      workspaceId: workspaceId ?? undefined,
    });

  const { data: habitStatus, isLoading: habitsLoading } =
    api.habit.getTodayStatus.useQuery();
  const toggleHabit = api.habit.toggleCompletion.useMutation({
    onSettled: () => {
      void utils.habit.getTodayStatus.invalidate();
    },
  });

  const { data: todayActions } = api.action.getToday.useQuery({
    workspaceId: workspaceId ?? undefined,
  });

  const schedulerStatus = api.pmScheduler.getStatus.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const recentRuns = api.workflowPipeline.listRuns.useQuery(
    { definitionId: "", limit: 4 },
    { refetchInterval: 30_000 },
  );
  const runTask = api.pmScheduler.runTask.useMutation({
    onSuccess: () => {
      void recentRuns.refetch();
    },
  });

  const habitsDone = habitStatus?.filter((h) => h.isCompletedToday).length ?? 0;
  const totalHabits = habitStatus?.length ?? 0;

  const completedActions =
    todayActions?.filter((a) => a.status === "COMPLETED").length ?? 0;
  const totalActions = todayActions?.length ?? 0;

  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects].sort((a, b) => {
      const healthA = calculateProjectHealth(a).score;
      const healthB = calculateProjectHealth(b).score;
      return healthA - healthB;
    });
  }, [projects]);

  const activeScheduleCount =
    schedulerStatus.data?.filter((t) => t.running).length ?? 0;

  const projectsHref = workspace ? `/w/${workspace.slug}/projects` : "/projects";
  const okrHref = workspace ? `/w/${workspace.slug}/goals` : "/goals";
  const planHref = "/daily-plan";

  const sendPrompt = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    openWithPrompt(trimmed);
    setPrompt("");
  };

  return (
    <div className={classes.shell}>
      {/* Hero */}
      <header className={classes.hero}>
        <div>
          <div className={classes.eyebrow}>
            <span className={classes.workspacePill}>{workspaceName}</span>
            <span className={classes.dotSep}>·</span>
            <span>{today}</span>
          </div>
          <h1 className={classes.heroTitle}>
            {greeting}, {firstName}. <em>What&apos;s on your mind?</em>
          </h1>
        </div>

        <div className={classes.heroActions}>
          <Link href={okrHref} className={classes.quietBtn}>
            <IconTarget size={13} />
            OKRs
          </Link>
          <Link href={planHref} className={classes.planCta}>
            <span className={classes.planCtaGlyph}>
              <IconSparkles size={12} />
            </span>
            Plan your day
          </Link>
        </div>
      </header>

      {/* Zoe */}
      <section className={classes.agentHero}>
        <div className={classes.agentHead}>
          <div className={classes.agentAvatar}>
            <IconSparkles size={15} />
          </div>
          <div>
            <span className={classes.agentName}>Zoe</span>
            <span className={classes.agentNameSub}>your PM agent</span>
          </div>
          <div className={classes.agentContext}>
            <span className={classes.contextPill}>
              <IconFolder size={11} />
              {workspaceName}
            </span>
            <span className={classes.contextPill}>
              <IconCalendar size={11} />
              Today
            </span>
          </div>
        </div>
        <textarea
          className={classes.agentInput}
          placeholder="Ask Zoe anything, draft a plan, run an agent, or search your workspace…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              sendPrompt(prompt);
            }
          }}
          rows={2}
        />
        <div className={classes.agentFoot}>
          <div className={classes.agentSuggestions}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={classes.agentSuggest}
                onClick={() => sendPrompt(s)}
              >
                <IconSparkles size={11} />
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={classes.agentSend}
            onClick={() => sendPrompt(prompt)}
            disabled={!prompt.trim()}
            aria-label="Send"
          >
            <IconSend size={14} />
          </button>
        </div>
      </section>

      <RitualCards />

      {/* Dashboard grid */}
      <div className={classes.dashGrid}>
        {/* LEFT — Active projects */}
        <div className={classes.dashCard}>
          <div className={classes.dashCardHead}>
            <div className={classes.dashCardTitle}>
              <IconStack2 size={13} className={classes.dashCardTitleIcon} />
              Active projects
              <span className={classes.dashCardCount}>
                {projectsLoading ? "" : sortedProjects.length}
              </span>
            </div>
            <Link href={projectsHref} className={classes.dashCardLink}>
              All projects <IconArrowRight size={11} />
            </Link>
          </div>
          <div className={classes.dashCardBody}>
            {projectsLoading ? (
              <ProjectRowSkeleton />
            ) : sortedProjects.length === 0 ? (
              <div className={classes.dashCardEmpty}>
                No active projects yet.{" "}
                <Link
                  href={projectsHref}
                  style={{ color: "var(--brand-400)" }}
                >
                  Create one
                </Link>
                .
              </div>
            ) : (
              sortedProjects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  workspaceSlug={workspace?.slug}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Momentum + Habits + PM Agent */}
        <div className={classes.dashColumn}>
          <div className={classes.dashCard}>
            <div className={classes.momentumBlock}>
              <div className={classes.momentumHead}>
                <span className={classes.momentumTitle}>Today&apos;s momentum</span>
                <span className={classes.momentumDay}>{shortDay}</span>
              </div>
              <div className={classes.momentumRings}>
                <MomentumRing
                  color="var(--accent-okr)"
                  value={habitsDone}
                  total={totalHabits}
                  label="Habits"
                />
                <MomentumRing
                  color="var(--brand-400)"
                  value={completedActions}
                  total={totalActions}
                  label="Actions"
                />
              </div>
            </div>

            <div>
              {habitsLoading ? (
                <div style={{ padding: "16px" }}>
                  <div className={classes.skeleton} style={{ height: 32 }} />
                </div>
              ) : !habitStatus || habitStatus.length === 0 ? (
                <div className={classes.dashCardEmpty}>
                  No habits for today.
                </div>
              ) : (
                habitStatus.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={clsx(
                      classes.habitRow,
                      h.isCompletedToday && classes.habitRow_done,
                    )}
                    onClick={() =>
                      toggleHabit.mutate({
                        habitId: h.id,
                        date: new Date(),
                      })
                    }
                  >
                    <div className={classes.habitCheck}>
                      {h.isCompletedToday && <IconCheck size={10} />}
                    </div>
                    <div className={classes.habitBody}>
                      <div className={classes.habitTitle}>{h.title}</div>
                    </div>
                    <span className={classes.habitStreak}>
                      <IconFlag size={10} />
                      {h.frequency}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* PM Agent */}
          <div className={classes.dashCard}>
            <div className={classes.dashCardHead}>
              <div className={classes.dashCardTitle}>
                <IconSparkles
                  size={13}
                  className={classes.dashCardTitleIcon}
                  style={{ color: "var(--accent-meetings)" }}
                />
                PM Agent
              </div>
              {activeScheduleCount > 0 && (
                <span
                  className={clsx(classes.agentBadge, classes.agentBadge_active)}
                >
                  {activeScheduleCount} ACTIVE
                </span>
              )}
            </div>
            <div className={classes.dashCardBody}>
              <div
                className={classes.agentMiniRow}
                role="button"
                onClick={() =>
                  runTask.mutate({ taskId: "daily-standup-workflow" })
                }
              >
                <div className={classes.agentMiniIcon}>
                  <IconMicrophone size={14} />
                </div>
                <div className={classes.agentMiniBody}>
                  <div className={classes.agentMiniTitle}>Standup</div>
                  <div className={classes.agentMiniSub}>
                    Daily at 9:00
                  </div>
                </div>
                <button
                  type="button"
                  className={classes.agentMiniPlay}
                  onClick={(e) => {
                    e.stopPropagation();
                    runTask.mutate({ taskId: "daily-standup-workflow" });
                  }}
                  disabled={runTask.isPending}
                  aria-label="Run standup"
                >
                  <IconPlayerPlay size={11} />
                </button>
              </div>

              <div
                className={classes.agentMiniRow}
                role="button"
                onClick={() =>
                  runTask.mutate({ taskId: "project-health-workflow" })
                }
              >
                <div
                  className={clsx(
                    classes.agentMiniIcon,
                    classes.agentMiniIcon_green,
                  )}
                >
                  <IconActivity size={14} />
                </div>
                <div className={classes.agentMiniBody}>
                  <div className={classes.agentMiniTitle}>Health Check</div>
                  <div className={classes.agentMiniSub}>Weekly</div>
                </div>
                <button
                  type="button"
                  className={classes.agentMiniPlay}
                  onClick={(e) => {
                    e.stopPropagation();
                    runTask.mutate({ taskId: "project-health-workflow" });
                  }}
                  disabled={runTask.isPending}
                  aria-label="Run health check"
                >
                  <IconPlayerPlay size={11} />
                </button>
              </div>

              {recentRuns.data?.runs?.slice(0, 3).map((r) => {
                const statusClass =
                  r.status === "SUCCESS"
                    ? classes.agentRunDot_ok
                    : r.status === "FAILED"
                      ? classes.agentRunDot_fail
                      : classes.agentRunDot_running;
                const statusTextClass =
                  r.status === "SUCCESS"
                    ? classes.agentRunStatusOk
                    : r.status === "FAILED"
                      ? classes.agentRunStatusFail
                      : classes.agentRunStatusRunning;
                return (
                  <div key={r.id} className={classes.agentMiniRow}>
                    <span className={clsx(classes.agentRunDot, statusClass)} />
                    <div className={classes.agentMiniBody}>
                      <div className={classes.agentRunName}>
                        {r.definition.name}
                      </div>
                      <div className={classes.agentMiniSub}>
                        <span className={statusTextClass}>
                          {r.status.toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <span className={classes.agentRunTime}>
                      {formatDistanceToNow(new Date(r.startedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type ActiveProject =
  RouterOutputs["project"]["getActiveWithDetails"][number];

function ProjectRow({
  project,
  workspaceSlug,
}: {
  project: ActiveProject;
  workspaceSlug: string | undefined;
}) {
  const { score, indicators } = calculateProjectHealth(project);
  const activeActions = project.actions.filter(
    (a) => a.status === "ACTIVE",
  ).length;
  const nextAction = project.actions.find((a) => a.status === "ACTIVE");

  const ringColor =
    score >= 60
      ? "var(--accent-crm)"
      : score >= 40
        ? "var(--accent-okr)"
        : "var(--accent-due)";

  const pills: ProjectPill[] = [];
  if (indicators.onTrack) pills.push("ok");
  if (indicators.momentum) pills.push("active");
  if (!indicators.recentActivity) pills.push("amber");
  if (!indicators.onTrack) pills.push("due");

  const href = workspaceSlug
    ? `/w/${workspaceSlug}/projects/${project.slug}-${project.id}`
    : `/projects/${project.slug}-${project.id}`;

  return (
    <Link href={href} className={classes.projRow}>
      <div
        className={classes.projRing}
        style={{
          background: `conic-gradient(${ringColor} ${project.progress}%, var(--color-surface-muted) 0)`,
        }}
      />
      <div className={classes.projBody}>
        <div className={classes.projTitle}>{project.name}</div>
        <div className={classes.projNext}>
          {nextAction ? (
            <>
              <strong>Next:</strong> {stripHtml(nextAction.name)}
            </>
          ) : (
            <span>No active actions</span>
          )}
        </div>
      </div>
      <div className={classes.projMeta}>
        <span className={classes.projStat}>
          <IconCheckbox size={11} />
          {activeActions}
        </span>
        {pills.length > 0 && (
          <div className={classes.projPills}>
            {pills.map((pill, i) => (
              <span
                key={i}
                className={clsx(classes.projPill, classes[`projPill_${pill}`])}
              >
                {pill === "ok" && <IconCheck size={10} />}
                {pill === "active" && <IconPlayerPlay size={9} />}
                {pill === "due" && <IconFlag size={10} />}
                {pill === "amber" && <IconClock size={10} />}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function ProjectRowSkeleton() {
  return (
    <div style={{ padding: "10px 16px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={classes.skeleton}
          style={{ height: 44, marginBottom: 8 }}
        />
      ))}
    </div>
  );
}

interface MomentumRingProps {
  color: string;
  value: number;
  total: number;
  label: string;
}

function MomentumRing({ color, value, total, label }: MomentumRingProps) {
  const pct = total > 0 ? (value / total) * 100.5 : 0;
  return (
    <div className={classes.momentumRing}>
      <svg className={classes.momentumRingSvg} viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke="var(--color-surface-muted)"
          strokeWidth="4"
        />
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${pct} 100.5`}
          strokeLinecap="round"
          transform="rotate(-90 20 20)"
        />
      </svg>
      <div>
        <div className={classes.momentumRingLabel}>{label}</div>
        <div className={classes.momentumRingValue}>
          {value}
          <span> / {total}</span>
        </div>
      </div>
    </div>
  );
}

export default UserHomeDashboard;

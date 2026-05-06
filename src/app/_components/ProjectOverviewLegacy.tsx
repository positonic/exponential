"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Group,
  Indicator,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { Calendar } from "@mantine/dates";
import {
  IconChecklist,
  IconDotsVertical,
  IconExternalLink,
  IconLayersIntersect,
  IconPlus,
  IconTarget,
  IconTargetArrow,
  IconTrash,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { format, isSameDay, isToday, isTomorrow, startOfDay } from "date-fns";
import { CreateActionModal } from "./CreateActionModal";
import { CreateGoalModal } from "./CreateGoalModal";
import { CreateOutcomeModal } from "./CreateOutcomeModal";
import { ProjectCalendarCard } from "./ProjectCalendarCard";
import { ProjectOverviewTimeline } from "./ProjectOverviewTimeline";
import styles from "./ProjectOverviewLegacy.module.css";

type Project = NonNullable<RouterOutputs["project"]["getById"]>;
type Goal = RouterOutputs["goal"]["getProjectGoals"][number];
type Outcome = RouterOutputs["outcome"]["getProjectOutcomes"][number];
type Action = RouterOutputs["action"]["getProjectActions"][number];

interface ProjectOverviewLegacyProps {
  project: Project;
  goals: Goal[];
  outcomes: Outcome[];
}

type ShowFilter = "active" | "all" | "done";

function outcomeTypeColor(type: string | null | undefined): string {
  switch (type?.toUpperCase()) {
    case "DAILY":
      return "blue";
    case "WEEKLY":
      return "teal";
    case "MONTHLY":
      return "violet";
    case "QUARTERLY":
      return "orange";
    default:
      return "gray";
  }
}

function formatDueDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "MMM d");
}

function isOverdue(date: Date | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) < startOfDay(new Date());
}

export function ProjectOverviewLegacy({ project, goals, outcomes }: ProjectOverviewLegacyProps) {
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date>(new Date());
  const [showFilter, setShowFilter] = useState<ShowFilter>("active");

  const utils = api.useUtils();
  const { data: actions = [] } = api.action.getProjectActions.useQuery({
    projectId: project.id,
  });

  const deleteGoalMutation = api.goal.deleteGoal.useMutation({
    onSuccess: () => {
      void utils.goal.getProjectGoals.invalidate({ projectId: project.id });
    },
  });

  const updateActionMutation = api.action.update.useMutation({
    onSuccess: async () => {
      await utils.action.getProjectActions.invalidate({ projectId: project.id });
      await utils.action.getToday.invalidate();
    },
  });

  const toggleAction = (action: Action) => {
    const nextStatus = action.status === "COMPLETED" ? "ACTIVE" : "COMPLETED";
    updateActionMutation.mutate({ id: action.id, status: nextStatus });
  };

  const handleDeleteGoal = (goalId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this goal?")) {
      deleteGoalMutation.mutate({ id: goalId });
    }
  };

  // Calendar helpers — event dots for goals/outcomes/project dates
  const getItemsForDate = (date: Date) => {
    const dateStr = date.toDateString();
    const items: { type: "goal" | "outcome" | "project"; title: string; color: string }[] = [];
    if (project.reviewDate && new Date(project.reviewDate).toDateString() === dateStr) {
      items.push({ type: "project", title: "Project End", color: "red" });
    }
    if (project.nextActionDate && new Date(project.nextActionDate).toDateString() === dateStr) {
      items.push({ type: "project", title: "Project Start", color: "orange" });
    }
    for (const g of goals) {
      if (g.dueDate && new Date(g.dueDate).toDateString() === dateStr) {
        items.push({ type: "goal", title: g.title, color: "yellow" });
      }
    }
    for (const o of outcomes) {
      if (o.dueDate && new Date(o.dueDate).toDateString() === dateStr) {
        items.push({ type: "outcome", title: o.description, color: "teal" });
      }
    }
    return items;
  };

  const visibleActions = useMemo(() => {
    return actions.filter((a) => {
      const done = a.status === "COMPLETED";
      if (showFilter === "active") return !done;
      if (showFilter === "done") return done;
      return true;
    });
  }, [actions, showFilter]);

  return (
    <div className={styles.grid}>
      {/* ── LEFT column ─────────────────────────────── */}
      <div>
        {/* Mini calendar */}
        <div className={styles.card}>
          <div className={styles.calendarWrap}>
            <Calendar
              date={calendarSelectedDate}
              getDayProps={(date) => ({
                selected: isSameDay(date, calendarSelectedDate),
                onClick: () => setCalendarSelectedDate(date),
              })}
              renderDay={(date) => {
                const day = date.getDate();
                const items = getItemsForDate(date);
                if (items.length === 0) {
                  return <div>{day}</div>;
                }
                return (
                  <Tooltip
                    label={
                      <Stack gap={4}>
                        {items.map((item, idx) => (
                          <Group key={idx} gap="xs">
                            <Badge size="xs" color={item.color} variant="filled">
                              {item.type}
                            </Badge>
                            <Text size="xs" lineClamp={1}>
                              {item.title}
                            </Text>
                          </Group>
                        ))}
                      </Stack>
                    }
                    withArrow
                    multiline
                    w={220}
                  >
                    <Indicator size={6} color={items[0]?.color ?? "blue"} offset={-2}>
                      <div>{day}</div>
                    </Indicator>
                  </Tooltip>
                );
              }}
            />
          </div>
        </div>

        {/* Today's Schedule — reuse existing component */}
        <ProjectCalendarCard
          projectId={project.id}
          projectName={project.name}
          selectedDate={calendarSelectedDate}
        />
      </div>

      {/* ── MIDDLE column ───────────────────────────── */}
      <div>
        {/* Goals card */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <IconTarget size={14} className={styles.cardTitleIcon} />
              Goals
              <span className={styles.cardCount}>{goals.length}</span>
            </div>
            <div className={styles.cardHeadActions}>
              <CreateGoalModal projectId={project.id}>
                <ActionIcon variant="subtle" size="sm" aria-label="Add goal">
                  <IconPlus size={14} />
                </ActionIcon>
              </CreateGoalModal>
            </div>
          </div>

          {goals.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <IconTarget size={16} />
              </div>
              <div>No goals linked to this project yet</div>
              <CreateGoalModal projectId={project.id}>
                <button type="button" className={styles.emptyCta}>
                  <IconPlus size={12} />
                  Link a goal
                </button>
              </CreateGoalModal>
            </div>
          ) : (
            <div className={styles.rowList}>
              {goals.slice(0, 5).map((goal) => (
                <div key={goal.id} className={styles.rowItem}>
                  <CreateGoalModal
                    goal={{
                      id: goal.id,
                      title: goal.title,
                      description: goal.description,
                      whyThisGoal: goal.whyThisGoal,
                      notes: goal.notes,
                      dueDate: goal.dueDate,
                      period: goal.period ?? null,
                      lifeDomainId: goal.lifeDomainId,
                      outcomes: goal.outcomes,
                    }}
                    trigger={
                      <div className={styles.rowBody}>
                        <div className={styles.rowTitle}>{goal.title}</div>
                        <div className={styles.rowSub}>
                          {goal.lifeDomain && <span>{goal.lifeDomain.title}</span>}
                          {goal.dueDate && (
                            <span>Due {format(new Date(goal.dueDate), "MMM d")}</span>
                          )}
                        </div>
                      </div>
                    }
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={(e) => handleDeleteGoal(goal.id, e)}
                    loading={deleteGoalMutation.isPending}
                    aria-label="Delete goal"
                  >
                    <IconTrash size={12} />
                  </ActionIcon>
                </div>
              ))}
              {goals.length > 5 && (
                <div className={styles.rowSub} style={{ padding: "8px 16px" }}>
                  +{goals.length - 5} more goals
                </div>
              )}
            </div>
          )}
        </div>

        {/* Outcomes card */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <IconTargetArrow size={14} className={styles.cardTitleIcon} />
              Outcomes
              <span className={styles.cardCount}>{outcomes.length}</span>
            </div>
            <div className={styles.cardHeadActions}>
              <CreateOutcomeModal projectId={project.id}>
                <ActionIcon variant="subtle" size="sm" aria-label="Add outcome">
                  <IconPlus size={14} />
                </ActionIcon>
              </CreateOutcomeModal>
            </div>
          </div>

          {outcomes.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <IconTargetArrow size={16} />
              </div>
              <div>No outcomes linked to this project yet</div>
              <CreateOutcomeModal projectId={project.id}>
                <button type="button" className={styles.emptyCta}>
                  <IconPlus size={12} />
                  Add outcome
                </button>
              </CreateOutcomeModal>
            </div>
          ) : (
            <div className={styles.rowList}>
              {outcomes.slice(0, 5).map((outcome) => (
                <CreateOutcomeModal
                  key={outcome.id}
                  outcome={{
                    id: outcome.id,
                    description: outcome.description,
                    dueDate: outcome.dueDate,
                    type: (outcome.type ?? "daily") as
                      | "daily"
                      | "weekly"
                      | "monthly"
                      | "quarterly"
                      | "annual"
                      | "life"
                      | "problem",
                    whyThisOutcome: outcome.whyThisOutcome,
                    projectId: project.id,
                    goalId: outcome.goals?.[0]?.id,
                  }}
                  trigger={
                    <div className={styles.rowItem}>
                      <div className={styles.rowBody}>
                        <div className={styles.rowTitle}>{outcome.description}</div>
                        <div className={styles.rowSub}>
                          {outcome.type && (
                            <Badge
                              variant="light"
                              color={outcomeTypeColor(outcome.type)}
                              size="xs"
                            >
                              {outcome.type}
                            </Badge>
                          )}
                          {outcome.dueDate && (
                            <span>Due {format(new Date(outcome.dueDate), "MMM d")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  }
                />
              ))}
              {outcomes.length > 5 && (
                <div className={styles.rowSub} style={{ padding: "8px 16px" }}>
                  +{outcomes.length - 5} more outcomes
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timeline card */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <IconLayersIntersect size={14} className={styles.cardTitleIcon} />
              Timeline
            </div>
            <div className={styles.cardHeadActions}>
              <ActionIcon variant="subtle" size="sm" aria-label="View full timeline">
                <IconExternalLink size={12} />
              </ActionIcon>
            </div>
          </div>
          <ProjectOverviewTimeline
            project={project}
            goals={goals}
            outcomes={outcomes}
            actions={actions}
          />
        </div>
      </div>

      {/* ── RIGHT column ────────────────────────────── */}
      <div>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <IconChecklist size={14} className={styles.cardTitleIcon} />
              Project Actions
              <span className={styles.cardCount}>{visibleActions.length}</span>
            </div>
            <div className={styles.cardHeadActions}>
              <div className={styles.showSeg}>
                {(["active", "all", "done"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={showFilter === id ? "on" : ""}
                    onClick={() => setShowFilter(id)}
                  >
                    {id[0]!.toUpperCase() + id.slice(1)}
                  </button>
                ))}
              </div>
              <CreateActionModal
                projectId={project.id}
                viewName={`project-${project.id}`}
              >
                <ActionIcon variant="subtle" size="sm" aria-label="Add action">
                  <IconPlus size={14} />
                </ActionIcon>
              </CreateActionModal>
            </div>
          </div>

          <div className={styles.actions}>
            {visibleActions.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <IconChecklist size={16} />
                </div>
                <div>
                  {showFilter === "done"
                    ? "No completed actions yet"
                    : showFilter === "all"
                      ? "No actions for this project yet"
                      : "Nothing active — all caught up"}
                </div>
              </div>
            ) : (
              visibleActions.map((action) => {
                const done = action.status === "COMPLETED";
                const due = formatDueDate(action.dueDate);
                const overdue = !done && isOverdue(action.dueDate);
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={`${styles.action} ${done ? styles.actionDone : ""}`}
                    onClick={() => toggleAction(action)}
                  >
                    <div className={styles.actionCheck}>
                      {done && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="5 12 10 17 19 7" />
                        </svg>
                      )}
                    </div>
                    <div className={styles.actionBody}>
                      <div className={styles.actionTitle}>{action.name}</div>
                      <div className={styles.actionMeta}>
                        <span className={styles.actionMetaTag}>
                          {action.priority ?? "Action"}
                        </span>
                        {due && (
                          <span
                            className={`${styles.actionMetaDue} ${
                              overdue ? styles.actionMetaDueUrgent : ""
                            }`}
                          >
                            {due}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={styles.actionMenu}
                      role="button"
                      tabIndex={-1}
                      aria-label="Action menu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconDotsVertical size={14} />
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <CreateActionModal
            projectId={project.id}
            viewName={`project-${project.id}`}
          >
            <button type="button" className={styles.addRow}>
              <IconPlus size={12} />
              Add action…
            </button>
          </CreateActionModal>
        </div>
      </div>
    </div>
  );
}

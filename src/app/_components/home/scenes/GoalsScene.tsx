import { IconCheck, IconTarget, IconTrendingUp } from "@tabler/icons-react";
import { Panel } from "~/app/_components/ui";
import {
  AgentPill,
  Avatar,
  ProgressBar,
  SceneFrame,
  SceneLabel,
  StatusDot,
  ToneChip,
  type SceneTone,
} from "./parts";

const keyResults = [
  { title: "Data room ready before the first 10 investor calls", percent: 60 },
  { title: "20 qualified investor conversations", percent: 45 },
  { title: "Signed term sheet by the end of the quarter", percent: 10 },
];

const projects: { name: string; health: string; tone: SceneTone; owner: string; ownerTone: SceneTone; actions: number }[] = [
  { name: "Seed round prep", health: "On track", tone: "green", owner: "MC", ownerTone: "green", actions: 6 },
  { name: "Launch v1", health: "At risk", tone: "amber", owner: "DO", ownerTone: "blue", actions: 11 },
];

const actions = [
  { title: "Build the data room index for investor diligence", who: "S", tone: "violet" as SceneTone, agent: true, done: false },
  { title: "Update the financial model with October actuals", who: "MC", tone: "green" as SceneTone, agent: false, done: false },
  { title: "Shortlist 30 seed investors", who: "DO", tone: "blue" as SceneTone, agent: false, done: true },
];

/** A goal, its key results, and the projects and actions that deliver it. */
export function GoalsScene() {
  return (
    <SceneFrame
      title="Goals / Close the seed round"
      description="A goal with three key results and their progress, beside the two projects that deliver it and the actions inside one of them."
    >
      <div className="grid md:grid-cols-2">
        <div className="min-w-0 p-5 sm:p-8">
          <SceneLabel>Goal · This quarter</SceneLabel>
          <p className="mb-6 flex items-center gap-2.5 text-lg font-medium text-text-primary">
            <IconTarget size={20} stroke={1.75} className="shrink-0 text-accent-okr" />
            Close the seed round
          </p>

          <SceneLabel>Key results</SceneLabel>
          <ul className="space-y-5">
            {keyResults.map((keyResult) => (
              <li key={keyResult.title}>
                <p className="mb-2 flex items-start gap-2.5 text-sm text-text-primary">
                  <IconTrendingUp size={16} stroke={1.75} className="mt-0.5 shrink-0 text-text-muted" />
                  {keyResult.title}
                </p>
                <div className="flex items-center gap-3 pl-[1.625rem]">
                  <ProgressBar percent={keyResult.percent} />
                  <span className="w-8 text-right text-xs tabular-nums text-text-muted">
                    {keyResult.percent}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 border-t border-border-primary bg-background-primary p-5 sm:p-8 md:border-l md:border-t-0">
          <SceneLabel>Projects</SceneLabel>
          <div className="mb-7 space-y-2.5">
            {projects.map((project) => (
              <Panel key={project.name} variant="muted" radius="md" padding="sm">
                <div className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                    {project.name}
                  </span>
                  <ToneChip tone={project.tone}>
                    <StatusDot tone={project.tone} />
                    {project.health}
                  </ToneChip>
                  <span className="hidden text-xs text-text-muted sm:inline">
                    {project.actions} actions
                  </span>
                  <Avatar initials={project.owner} tone={project.ownerTone} />
                </div>
              </Panel>
            ))}
          </div>

          <SceneLabel>Actions · Seed round prep</SceneLabel>
          <ul className="space-y-3">
            {actions.map((action) => (
              <li key={action.title} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${action.done ? "border-transparent bg-accent-crm/20 text-accent-crm" : "border-border-strong"}`}
                >
                  {action.done && <IconCheck size={11} stroke={3} />}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${action.done ? "text-text-muted line-through" : "text-text-primary"}`}
                >
                  {action.title}
                </span>
                {action.agent && <AgentPill />}
                <Avatar initials={action.who} tone={action.tone} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SceneFrame>
  );
}

import {
  IconCalendarEvent,
  IconChevronRight,
  IconFolder,
  IconKey,
  IconTarget,
  IconTrendingUp,
} from "@tabler/icons-react";
import { Panel } from "~/app/_components/ui";
import {
  AgentPill,
  Avatar,
  ProgressBar,
  SceneFrame,
  SceneLabel,
  StatusDot,
  ToneChip,
} from "./parts";

const trail = [
  {
    who: "Scout",
    agent: true,
    what: "created this action from the Investor sync meeting",
    when: "2h ago",
  },
  {
    who: "Scout",
    agent: true,
    what: "linked it to the key result Data room ready",
    when: "2h ago",
  },
  {
    who: "Scout",
    agent: true,
    what: "updated the description and attached the index",
    when: "1h ago",
  },
  {
    who: "Maya Chen",
    agent: false,
    what: "moved it to In review",
    when: "12m ago",
  },
];

/**
 * The hero scene: one action, made by an agent, with the trail of what the
 * agent did and the goal the work rolls up to.
 */
export function HeroScene() {
  return (
    <SceneFrame
      title="Seed round prep / Actions"
      description="An action created by an agent called Scout. It carries an Agent badge, a trail of each change Scout made, and the goal and key result the work rolls up to. A side panel shows which workspaces Scout can reach and the key it signs in with."
    >
      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 p-5 sm:p-8">
          <p className="mb-4 text-lg font-medium leading-snug text-text-primary sm:text-xl">
            Build the data room index for investor diligence
          </p>

          <div className="mb-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-text-secondary">
            <ToneChip tone="amber">
              <StatusDot tone="amber" />
              In review
            </ToneChip>
            <span className="inline-flex items-center gap-2">
              <Avatar initials="S" tone="violet" />
              <span className="text-text-primary">Scout</span>
              <AgentPill />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconCalendarEvent size={15} stroke={1.5} />
              Due Friday
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconFolder size={15} stroke={1.5} />
              Seed round prep
            </span>
          </div>

          <SceneLabel>Rolls up to</SceneLabel>
          <Panel variant="muted" radius="lg" padding="md" className="mb-7">
            <div className="flex items-center gap-2.5 text-sm">
              <IconTarget size={16} stroke={1.75} className="shrink-0 text-accent-okr" />
              <span className="text-text-muted">Goal</span>
              <span className="truncate font-medium text-text-primary">
                Close the seed round
              </span>
            </div>
            <div className="ml-2 mt-2 border-l border-border-strong pl-5 pt-2">
              <div className="flex items-center gap-2.5 text-sm">
                <IconTrendingUp size={16} stroke={1.75} className="shrink-0 text-accent-okr" />
                <span className="text-text-muted">Key result</span>
                <span className="truncate text-text-primary">
                  Data room ready before the first 10 investor calls
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <ProgressBar percent={60} />
                <span className="text-xs tabular-nums text-text-muted">60%</span>
              </div>
            </div>
          </Panel>

          <SceneLabel>Activity</SceneLabel>
          <ol className="space-y-3.5">
            {trail.map((entry, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <Avatar
                  initials={entry.agent ? "S" : "MC"}
                  tone={entry.agent ? "violet" : "green"}
                />
                <p className="min-w-0 flex-1 leading-5 text-text-secondary">
                  <span className="font-medium text-text-primary">{entry.who}</span>{" "}
                  {entry.agent && (
                    <span className="mr-1 inline-flex align-middle">
                      <AgentPill />
                    </span>
                  )}
                  {entry.what}
                </p>
                <span className="shrink-0 text-xs leading-5 text-text-muted">
                  {entry.when}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <aside className="hidden border-l border-border-primary bg-background-primary p-6 lg:block">
          <div className="mb-6 flex items-center gap-3">
            <Avatar initials="S" tone="violet" size="lg" />
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
                Scout <AgentPill />
              </p>
              <p className="text-xs text-text-muted">Added by Maya Chen</p>
            </div>
          </div>

          <SceneLabel>Workspace access</SceneLabel>
          <ul className="mb-6 space-y-2.5 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="text-text-primary">Northwind</span>
              <ToneChip tone="green">Granted</ToneChip>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-text-primary">Northwind Board</span>
              <ToneChip tone="neutral">No access</ToneChip>
            </li>
          </ul>

          <SceneLabel>Key</SceneLabel>
          <Panel variant="muted" radius="md" padding="sm" className="mb-6">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 text-text-primary">
                <IconKey size={15} stroke={1.5} className="text-text-muted" />
                Ending 7f3a
              </span>
              <span className="text-xs font-medium text-text-secondary">Revoke</span>
            </div>
          </Panel>

          <p className="flex items-center gap-1 text-xs text-text-muted">
            14 changes this week
            <IconChevronRight size={13} stroke={1.75} />
          </p>
        </aside>
      </div>
    </SceneFrame>
  );
}

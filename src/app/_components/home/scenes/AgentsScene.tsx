import { IconKey } from "@tabler/icons-react";
import { Panel } from "~/app/_components/ui";
import {
  AgentPill,
  Avatar,
  SceneFrame,
  SceneLabel,
  ToneChip,
  type SceneTone,
} from "./parts";

const members: { name: string; initials: string; tone: SceneTone; role: string; agent: boolean; selected?: boolean }[] = [
  { name: "Maya Chen", initials: "MC", tone: "green", role: "Owner", agent: false },
  { name: "Dev Okafor", initials: "DO", tone: "blue", role: "Member", agent: false },
  { name: "Scout", initials: "S", tone: "violet", role: "Added by Maya", agent: true, selected: true },
  { name: "Relay", initials: "R", tone: "amber", role: "Added by Dev", agent: true },
];

const record = [
  { what: "Created 3 actions in Seed round prep", when: "Today" },
  { what: "Linked an action to a key result", when: "Today" },
  { what: "Commented on Launch v1 pricing page", when: "Yesterday" },
];

/** An agent as a member: who added it, what it can reach, its keys, its record. */
export function AgentsScene() {
  return (
    <SceneFrame
      title="Workspace / Members"
      description="A workspace member list with two people and two agents. The agent Scout is selected, showing which workspaces it has been granted, an active key that can be revoked, a revoked key, and a record of its recent changes."
    >
      <div className="grid md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-border-primary bg-background-primary p-4 sm:p-5 md:border-b-0 md:border-r">
          <SceneLabel>Members</SceneLabel>
          <ul className="space-y-1">
            {members.map((member) => (
              <li
                key={member.name}
                className={`flex items-center gap-3 rounded-md px-2.5 py-2 ${member.selected ? "bg-surface-hover" : ""}`}
              >
                <Avatar initials={member.initials} tone={member.tone} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    {member.name}
                    {member.agent && <AgentPill />}
                  </span>
                  <span className="block text-xs text-text-muted">{member.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 p-5 sm:p-8">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <SceneLabel>Workspace access</SceneLabel>
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-center justify-between gap-3">
                  <span className="text-text-primary">Northwind</span>
                  <ToneChip tone="green">Granted</ToneChip>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-text-primary">Northwind Board</span>
                  <ToneChip tone="neutral">No access</ToneChip>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-text-primary">Maya · Personal</span>
                  <ToneChip tone="neutral">No access</ToneChip>
                </li>
              </ul>
            </div>

            <div>
              <SceneLabel>Keys</SceneLabel>
              <div className="space-y-2.5">
                <Panel variant="muted" radius="md" padding="sm">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="inline-flex items-center gap-2 text-text-primary">
                      <IconKey size={15} stroke={1.5} className="text-text-muted" />
                      Ending 7f3a
                    </span>
                    <span className="text-xs font-medium text-text-secondary">Revoke</span>
                  </div>
                </Panel>
                <Panel variant="muted" radius="md" padding="sm">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="inline-flex items-center gap-2 text-text-muted line-through">
                      <IconKey size={15} stroke={1.5} />
                      Ending 21bc
                    </span>
                    <span className="text-xs text-text-muted">Revoked 3 Nov</span>
                  </div>
                </Panel>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-border-primary pt-6">
            <SceneLabel>Record · Scout</SceneLabel>
            <ul className="space-y-3">
              {record.map((entry) => (
                <li key={entry.what} className="flex items-center gap-3 text-sm">
                  <Avatar initials="S" tone="violet" />
                  <span className="min-w-0 flex-1 truncate text-text-secondary">
                    {entry.what}
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">{entry.when}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}

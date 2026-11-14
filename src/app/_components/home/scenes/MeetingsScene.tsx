import { IconCheck, IconGavel, IconX } from "@tabler/icons-react";
import { Panel } from "~/app/_components/ui";
import { Avatar, SceneFrame, SceneLabel, type SceneTone } from "./parts";

const transcript: { who: string; initials: string; tone: SceneTone; text: string }[] = [
  {
    who: "Maya",
    initials: "MC",
    tone: "green",
    text: "Two of the leads asked for a SAFE. I think we take it and close faster.",
  },
  {
    who: "Dev",
    initials: "DO",
    tone: "blue",
    text: "Agreed. Then the data room needs the cap table and October numbers by Friday.",
  },
  {
    who: "Maya",
    initials: "MC",
    tone: "green",
    text: "I will update the model. Can someone draft the investor update too?",
  },
];

const drafts = [
  { title: "Add the cap table and October actuals to the data room", project: "Seed round prep" },
  { title: "Draft the November investor update", project: "Seed round prep" },
  { title: "Update the financial model for a SAFE", project: "Seed round prep" },
];

/** A meeting, the actions drafted from it for review, and a logged decision. */
export function MeetingsScene() {
  return (
    <SceneFrame
      title="Meetings / Investor sync"
      description="A meeting transcript beside three actions drafted from it, each waiting for a person to accept or dismiss, and a logged decision with its owner and rationale."
    >
      <div className="grid md:grid-cols-2">
        <div className="min-w-0 bg-background-primary p-5 sm:p-8">
          <SceneLabel>Transcript · Thursday</SceneLabel>
          <ul className="space-y-5">
            {transcript.map((line, index) => (
              <li key={index} className="flex items-start gap-3">
                <Avatar initials={line.initials} tone={line.tone} size="md" />
                <p className="text-sm leading-relaxed text-text-secondary">
                  <span className="mb-0.5 block text-xs font-medium text-text-primary">
                    {line.who}
                  </span>
                  {line.text}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 border-t border-border-primary p-5 sm:p-8 md:border-l md:border-t-0">
          <SceneLabel>Drafted actions · 3 to review</SceneLabel>
          <div className="mb-7 space-y-2.5">
            {drafts.map((draft) => (
              <Panel key={draft.title} variant="muted" radius="md" padding="sm">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary">{draft.title}</p>
                    <p className="text-xs text-text-muted">{draft.project}</p>
                  </div>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-crm/15 text-accent-crm">
                    <IconCheck size={13} stroke={2.5} />
                  </span>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-text-muted">
                    <IconX size={13} stroke={2.5} />
                  </span>
                </div>
              </Panel>
            ))}
          </div>

          <SceneLabel>Decision logged</SceneLabel>
          <Panel variant="muted" radius="md" padding="md">
            <p className="mb-2 flex items-start gap-2.5 text-sm font-medium text-text-primary">
              <IconGavel size={16} stroke={1.75} className="mt-0.5 shrink-0 text-accent-meetings" />
              Raise the seed on a SAFE, not a priced round
            </p>
            <p className="mb-3 pl-[1.625rem] text-xs leading-relaxed text-text-muted">
              Two lead investors asked for it, and it closes weeks sooner.
            </p>
            <p className="flex items-center gap-2 pl-[1.625rem] text-xs text-text-muted">
              <Avatar initials="MC" tone="green" />
              Owner: Maya Chen
            </p>
          </Panel>
        </div>
      </div>
    </SceneFrame>
  );
}

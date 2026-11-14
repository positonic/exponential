import { Panel } from "~/app/_components/ui";

interface PillarsSectionProps {
  id?: string;
}

/**
 * Line drawings for the three pillars. They use `currentColor` only, so they
 * follow the text colour of whatever holds them.
 */
function TraceArt() {
  // A goal at the top, fanning out to the work beneath it.
  return (
    <svg viewBox="0 0 240 96" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" className="h-24 w-full">
      <rect x="92" y="6" width="56" height="20" rx="10" />
      <path d="M120 26v14M120 40H52v12M120 40h68v12M120 40v12" />
      <rect x="24" y="52" width="56" height="16" rx="8" />
      <rect x="92" y="52" width="56" height="16" rx="8" />
      <rect x="160" y="52" width="56" height="16" rx="8" />
      <path d="M52 68v10M120 68v10M188 68v10" strokeDasharray="2 3" />
      <circle cx="52" cy="84" r="4" />
      <circle cx="120" cy="84" r="4" fill="currentColor" />
      <circle cx="188" cy="84" r="4" />
    </svg>
  );
}

function AccountableArt() {
  // An agent's badge, with the trail of entries it leaves behind.
  return (
    <svg viewBox="0 0 240 96" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" className="h-24 w-full">
      <circle cx="48" cy="48" r="22" />
      <rect x="38" y="40" width="20" height="15" rx="4" />
      <path d="M48 40v-6M44 47h.01M52 47h.01" strokeLinecap="round" />
      <path d="M70 48h22" strokeDasharray="2 3" />
      <path d="M100 22v52" />
      <circle cx="100" cy="28" r="3.5" fill="currentColor" />
      <circle cx="100" cy="48" r="3.5" fill="currentColor" />
      <circle cx="100" cy="68" r="3.5" />
      <path d="M114 28h96M114 48h72M114 68h84" strokeLinecap="round" />
    </svg>
  );
}

function AttachedArt() {
  // A decision, pinned to the piece of work it shaped.
  return (
    <svg viewBox="0 0 240 96" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" className="h-24 w-full">
      <rect x="28" y="14" width="96" height="68" rx="8" />
      <path d="M42 32h52M42 46h68M42 60h40" strokeLinecap="round" />
      <path d="M124 48h28" strokeDasharray="2 3" />
      <rect x="152" y="28" width="60" height="40" rx="8" />
      <path d="M170 48l8 8 16-16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const pillars = [
  {
    art: TraceArt,
    title: "Goals that trace to work",
    body: "Goals, key results, projects and actions live in one model, so anyone can see why a piece of work exists and how it is going.",
  },
  {
    art: AccountableArt,
    title: "Agents that answer for their work",
    body: "Each agent has its own identity and badge, access limited to the workspaces you grant, and a record of everything it changed.",
  },
  {
    art: AttachedArt,
    title: "Decisions that stay attached",
    body: "What you decided, who owns it and why are logged next to the work, not left in a meeting or a chat thread.",
  },
];

export function PillarsSection({ id }: PillarsSectionProps) {
  return (
    <section id={id} className="mkt-section">
      <div className="mkt-container mkt-reveal">
        <div className="mb-14 max-w-2xl">
          <p className="mkt-eyebrow mb-4">Why it holds together</p>
          <h2 className="mkt-h2 mb-4">A record the whole company works from</h2>
          <p className="mkt-body">
            People and agents read and write the same goals, projects and
            decisions, so the next one to pick something up can carry on.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {pillars.map((pillar) => {
            const Art = pillar.art;
            return (
              <Panel key={pillar.title} radius="xl" padding="none" className="p-7">
                <div className="mb-8 text-text-muted">
                  <Art />
                </div>
                <h3 className="mkt-h3 mb-2">{pillar.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-text-muted">
                  {pillar.body}
                </p>
              </Panel>
            );
          })}
        </div>
      </div>
    </section>
  );
}

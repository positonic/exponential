import { FeatureTabs, type FeatureTab } from "./FeatureTabs";
import { GoalsScene } from "./scenes/GoalsScene";
import { AgentsScene } from "./scenes/AgentsScene";
import { MeetingsScene } from "./scenes/MeetingsScene";

interface FeatureTabsSectionProps {
  id?: string;
}

interface Feature {
  id: string;
  label: string;
  title: string;
  body: string;
  chips: string[];
  scene: React.ReactNode;
}

// Three product areas, one view each. Copy states what the product does
// today; see the claims register in the home page PRD before adding to it.
const features: Feature[] = [
  {
    id: "goals",
    label: "Goals & projects",
    title: "Work that traces back to what matters",
    body: "Set goals and key results, then link the projects and actions that deliver them.",
    chips: ["Goals and key results", "Project health and owners", "Pages, CRM and time tracking"],
    scene: <GoalsScene />,
  },
  {
    id: "agents",
    label: "Agents",
    title: "Every agent is accountable for what it does",
    body: "Each agent gets its own identity, access limited to the workspaces you grant, and keys you can rotate or revoke.",
    chips: ["Its own name and badge", "Per-workspace grants", "Any agent that speaks CLI or MCP"],
    scene: <AgentsScene />,
  },
  {
    id: "meetings",
    label: "Meetings & decisions",
    title: "What you decided stays attached to the work",
    body: "Bring in a meeting transcript, review the actions drafted from it, and log decisions next to the work they shape.",
    chips: ["Actions drafted from transcripts", "A decision log with owners", "Weekly reviews"],
    scene: <MeetingsScene />,
  },
];

export function FeatureTabsSection({ id }: FeatureTabsSectionProps) {
  const tabs: FeatureTab[] = features.map((feature) => ({
    id: feature.id,
    label: feature.label,
    panel: (
      <>
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <h2 className="mkt-h2 mb-4">{feature.title}</h2>
          <p className="mkt-body mx-auto mb-7 max-w-xl">{feature.body}</p>
          <ul className="flex flex-wrap justify-center gap-2.5">
            {feature.chips.map((chip) => (
              <li key={chip} className="mkt-chip">
                {chip}
              </li>
            ))}
          </ul>
        </div>
        <div className="mx-auto max-w-5xl">{feature.scene}</div>
      </>
    ),
  }));

  return (
    <section id={id} className="mkt-section border-t border-border-primary">
      <div className="mkt-container mkt-reveal">
        <FeatureTabs tabs={tabs} label="Product areas" />
      </div>
    </section>
  );
}

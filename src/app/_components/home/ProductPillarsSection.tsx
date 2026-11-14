import { Container } from "@mantine/core";
import Image from "next/image";
import { IconCheck } from "@tabler/icons-react";

interface ProductPillarsSectionProps {
  id?: string;
}

interface Pillar {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  image: { src: string; alt: string; width: number; height: number };
}

// Three things the page has to make visible, one product view each. Copy
// states what the product does today; see the claims register in the home
// page PRD before adding to it.
const pillars: Pillar[] = [
  {
    eyebrow: "From goal to action",
    title: "Work that traces back to what matters",
    body: "Set goals and key results, then link the projects and actions that deliver them. Anyone can see why a piece of work exists and how it is going.",
    points: [
      "Goals, key results, projects and actions in one model",
      "Project health and ownership at a glance",
      "Pages, a CRM and time tracking alongside the work",
    ],
    image: {
      src: "/product-shots/exponential-projects.jpg",
      alt: "Projects list with health, status and priority for each project",
      width: 3444,
      height: 1970,
    },
  },
  {
    eyebrow: "Agents as members",
    title: "Every agent is accountable for what it does",
    body: "Connect the agents you already use. Each one gets its own identity, access limited to the workspaces you grant, and keys you can rotate or revoke.",
    points: [
      "Its own name and badge on everything it creates or changes",
      "Per-workspace grants, never more than its owner's access",
      "A built-in assistant, plus any agent that speaks CLI or MCP",
    ],
    image: {
      src: "/product-shots/expo-specialist-agents.jpg",
      alt: "The assistant answering a question about project risk from workspace data",
      width: 3450,
      height: 1982,
    },
  },
  {
    eyebrow: "Meetings and decisions",
    title: "What you decided stays attached to the work",
    body: "Bring in a meeting transcript and review the actions drafted from it before they join a project. Decisions are logged next to the work they shape.",
    points: [
      "Draft actions from transcripts, accepted by a person",
      "A decision log with owners and rationale",
      "Weekly reviews that start from the projects themselves",
    ],
    image: {
      src: "/product-shots/expo-auto-actions-from-meeting.jpg",
      alt: "Actions drafted from a meeting, waiting for review",
      width: 3450,
      height: 1978,
    },
  },
];

export function ProductPillarsSection({ id }: ProductPillarsSectionProps) {
  return (
    <section id={id} className="bg-background-primary py-20 md:py-28 scroll-mt-20">
      <Container size="lg">
        <div className="space-y-20 md:space-y-28">
          {pillars.map((pillar, index) => (
            <div
              key={pillar.title}
              className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center"
            >
              <div
                className={`lg:col-span-2 ${index % 2 === 1 ? "lg:order-2" : ""}`}
              >
                <p className="text-accent-indigo uppercase tracking-wider text-sm font-semibold mb-4">
                  {pillar.eyebrow}
                </p>
                <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-4 font-inter leading-tight">
                  {pillar.title}
                </h2>
                <p className="text-lg text-text-secondary leading-relaxed mb-6">
                  {pillar.body}
                </p>
                <ul className="space-y-3">
                  {pillar.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <IconCheck
                        size={18}
                        stroke={2.5}
                        className="text-brand-success flex-shrink-0 mt-1"
                      />
                      <span className="text-text-secondary">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className={`lg:col-span-3 rounded-xl border border-border-primary overflow-hidden shadow-lg ${index % 2 === 1 ? "lg:order-1" : ""}`}
              >
                <Image
                  src={pillar.image.src}
                  alt={pillar.image.alt}
                  width={pillar.image.width}
                  height={pillar.image.height}
                  sizes="(min-width: 1024px) 680px, 100vw"
                  className="w-full h-auto block"
                />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

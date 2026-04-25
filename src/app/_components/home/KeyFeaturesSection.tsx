import { Container, SimpleGrid } from "@mantine/core";
import {
  IconTarget,
  IconRobot,
  IconUsers,
  IconMessageCircle,
  IconCalendarWeek,
  IconPlug,
} from "@tabler/icons-react";

interface KeyFeaturesSectionProps {
  id?: string;
}

const features = [
  {
    icon: IconTarget,
    title: "Goals cascade to execution",
    description: "Every action traces back to an organizational outcome. Nothing happens in isolation.",
    color: "var(--color-accent-indigo)",
  },
  {
    icon: IconRobot,
    title: "AI agents run the execution layer",
    description: "Actions generated, assigned, tracked, and updated — by AI that understands the bigger picture.",
    color: "var(--color-brand-success)",
  },
  {
    icon: IconUsers,
    title: "Organization-wide visibility",
    description: "Outcomes, capacity, and progress across every team — visible without asking.",
    color: "var(--color-brand-info)",
  },
  {
    icon: IconMessageCircle,
    title: "Meetings become actions",
    description: "AI captures decisions and action items. They flow into the right projects automatically.",
    color: "var(--color-brand-warning)",
  },
  {
    icon: IconCalendarWeek,
    title: "Built-in cadence",
    description: "Weekly reviews and planning rhythms that keep humans and AI in sync.",
    color: "var(--color-brand-primary)",
  },
  {
    icon: IconPlug,
    title: "Connects your stack",
    description: "Slack, Notion, GitHub, and more. One coordination layer, not five disconnected tools.",
    color: "var(--color-accent-periwinkle)",
  },
];

export function KeyFeaturesSection({ id }: KeyFeaturesSectionProps) {
  return (
    <section id={id} className="bg-surface-secondary py-20 md:py-28">
      <Container size="lg">
        <div className="text-center mb-16">
          <p className="text-accent-indigo uppercase tracking-wider text-sm font-semibold mb-4">
            Features
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4 font-inter">
            Everything your AI-first org needs
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Built for organizations where humans and AI work side by side.
          </p>
        </div>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-background-primary border border-border-primary rounded-xl p-6 hover:border-border-focus hover:shadow-lg transition-all duration-200"
              >
                <div
                  className="w-12 h-12 rounded-lg mb-4 flex items-center justify-center"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${feature.color} 15%, transparent)`,
                  }}
                >
                  <Icon size={24} style={{ color: feature.color }} stroke={1.5} />
                </div>

                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  {feature.title}
                </h3>
                <p className="text-text-secondary leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </SimpleGrid>
      </Container>
    </section>
  );
}

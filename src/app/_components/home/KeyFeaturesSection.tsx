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
    title: "Every task connects to why",
    description: "See how your daily work drives quarterly outcomes.",
    color: "var(--color-accent-indigo)",
  },
  {
    icon: IconRobot,
    title: "AI handles the task layer",
    description: "Actions generated, tracked, and updated—so you don't have to.",
    color: "var(--color-brand-success)",
  },
  {
    icon: IconUsers,
    title: "Know what your team is doing",
    description: "Weekly outcomes, capacity, and progress—visible without asking.",
    color: "var(--color-brand-info)",
  },
  {
    icon: IconMessageCircle,
    title: "Meetings become actions",
    description: "AI captures decisions and action items. They appear in your workflow.",
    color: "var(--color-brand-warning)",
  },
  {
    icon: IconCalendarWeek,
    title: "Never lose the thread",
    description: "Structured weekly reset that keeps you aligned with your goals.",
    color: "var(--color-brand-primary)",
  },
  {
    icon: IconPlug,
    title: "Works where you work",
    description: "Connect Slack, Notion, GitHub. One workspace, not five apps.",
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
            Everything you need to stay aligned
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Built for teams who want to focus on outcomes, not process.
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

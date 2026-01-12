import { Container, SimpleGrid } from "@mantine/core";
import { IconUser, IconUsersGroup, IconCpu } from "@tabler/icons-react";

interface PersonaSectionProps {
  id?: string;
}

const personas = [
  {
    icon: IconUser,
    title: "For founders who think in outcomes",
    description:
      "You don't need a task manager. You need to know the 3 things that matter this week—and ignore everything else.",
    audience: "Solo Founders",
    color: "var(--color-accent-indigo)",
  },
  {
    icon: IconUsersGroup,
    title: "For teams that move as one",
    description:
      "2-10 people who want to stay aligned without endless standups. See what everyone's doing. Ship together.",
    audience: "Small Teams",
    color: "var(--color-brand-success)",
  },
  {
    icon: IconCpu,
    title: "For those building with AI",
    description:
      "Your AI agents need a home base. Exponential is where human judgment and AI capability meet.",
    audience: "AI-Forward Builders",
    color: "var(--color-brand-warning)",
  },
];

export function PersonaSection({ id }: PersonaSectionProps) {
  return (
    <section id={id} className="bg-background-primary py-20 md:py-28">
      <Container size="lg">
        <div className="text-center mb-16">
          <p className="text-text-muted uppercase tracking-wider text-sm font-medium mb-4">
            Who it&apos;s for
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary">
            Built for people who ship
          </h2>
        </div>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          {personas.map((persona, index) => {
            const Icon = persona.icon;
            return (
              <div
                key={index}
                className="bg-surface-secondary border border-border-primary rounded-2xl p-8 hover:border-border-focus transition-colors"
              >
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-xl mb-6 flex items-center justify-center"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${persona.color} 15%, transparent)`,
                  }}
                >
                  <Icon
                    size={28}
                    style={{ color: persona.color }}
                    stroke={1.5}
                  />
                </div>

                {/* Audience Tag */}
                <span
                  className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-4"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${persona.color} 10%, transparent)`,
                    color: persona.color,
                  }}
                >
                  {persona.audience}
                </span>

                {/* Content */}
                <h3 className="text-xl font-semibold text-text-primary mb-3">
                  {persona.title}
                </h3>
                <p className="text-text-secondary leading-relaxed">
                  {persona.description}
                </p>
              </div>
            );
          })}
        </SimpleGrid>
      </Container>
    </section>
  );
}

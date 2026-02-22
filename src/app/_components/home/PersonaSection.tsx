import { Container, SimpleGrid } from "@mantine/core";
import { IconUser, IconUsersGroup, IconCpu } from "@tabler/icons-react";

interface PersonaSectionProps {
  id?: string;
}

const personas = [
  {
    icon: IconUser,
    title: "For AI-native founders",
    description:
      "You're building with AI agents already. Now give them — and yourself — a system that connects capability to outcomes.",
    audience: "Founders",
    color: "var(--color-accent-indigo)",
  },
  {
    icon: IconUsersGroup,
    title: "For product teams going AI-first",
    description:
      "Coordinate humans and AI agents across projects. See what everyone — and every agent — is working on. Ship together.",
    audience: "Product Teams",
    color: "var(--color-brand-success)",
  },
  {
    icon: IconCpu,
    title: "For organizations scaling with AI",
    description:
      "As AI takes on more execution, coordination becomes the bottleneck. Exponential is the operating system that solves it.",
    audience: "AI-First Organizations",
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
            Built for AI-first organizations
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

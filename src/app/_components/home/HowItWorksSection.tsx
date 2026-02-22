import { Container } from "@mantine/core";
import { IconTarget, IconSparkles, IconUsers } from "@tabler/icons-react";

interface HowItWorksSectionProps {
  id?: string;
}

const steps = [
  {
    number: "01",
    icon: IconTarget,
    title: "Define outcomes, not tasks",
    description:
      "Set what success looks like for your organization this week, month, or quarter. AI breaks it down from there.",
    color: "var(--color-accent-indigo)",
  },
  {
    number: "02",
    icon: IconSparkles,
    title: "AI agents execute",
    description:
      "AI decomposes outcomes into actions, assigns work, tracks progress, and surfaces what needs human attention.",
    color: "var(--color-brand-success)",
  },
  {
    number: "03",
    icon: IconUsers,
    title: "Your organization stays aligned",
    description:
      "Everyone — humans and AI — sees the same picture. No status meetings. No coordination overhead.",
    color: "var(--color-brand-warning)",
  },
];

export function HowItWorksSection({ id }: HowItWorksSectionProps) {
  return (
    <section id={id} className="bg-background-primary py-20 md:py-28">
      <Container size="lg">
        <div className="text-center mb-16">
          <p className="text-accent-indigo uppercase tracking-wider text-sm font-semibold mb-4">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary font-inter">
            Three steps to AI-native coordination
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative">
                {/* Connection line (desktop only) */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-16 left-1/2 w-full h-0.5 bg-border-primary" />
                )}

                <div className="relative bg-surface-secondary border border-border-primary rounded-2xl p-8 text-center hover:border-border-focus transition-colors">
                  {/* Step number */}
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: step.color }}
                    >
                      {step.number}
                    </span>
                  </div>

                  {/* Icon */}
                  <div
                    className="w-16 h-16 rounded-xl mx-auto mb-6 flex items-center justify-center"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${step.color} 15%, transparent)`,
                    }}
                  >
                    <Icon size={32} style={{ color: step.color }} stroke={1.5} />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-text-primary mb-3">
                    {step.title}
                  </h3>
                  <p className="text-text-secondary leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

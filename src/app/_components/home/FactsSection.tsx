import { Container } from "@mantine/core";

interface FactsSectionProps {
  id?: string;
}

// Only claims that are verifiable from the product itself — no usage
// numbers or outcome percentages without a source behind them.
const facts = [
  {
    value: "AGPL-3.0",
    label: "Open source",
  },
  {
    value: "$0",
    label: "Free to start, no credit card",
  },
  {
    value: "Self-host",
    label: "Or run it on your own servers",
  },
  {
    value: "Agent API",
    label: "Connect your own AI agents",
  },
];

export function FactsSection({ id }: FactsSectionProps) {
  return (
    <section id={id} className="bg-background-primary py-12 md:py-16 border-y border-border-primary">
      <Container size="lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {facts.map((fact) => (
            <div key={fact.label} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-accent-indigo mb-2 font-inter">
                {fact.value}
              </div>
              <div className="text-sm md:text-base text-text-secondary font-medium">
                {fact.label}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

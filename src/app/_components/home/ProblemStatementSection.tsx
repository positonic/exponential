import { Container } from "@mantine/core";
import { IconSquare } from "@tabler/icons-react";

interface ProblemStatementSectionProps {
  id?: string;
}

const painPoints = [
  "You have 6 tools open. None of them talk to each other.",
  "Your task list grows faster than you can check things off.",
  "You finished 23 tasks last week. You're not sure any of them mattered.",
  "Stand-ups take an hour. Everyone forgets by Wednesday.",
  "AI can write your emails, but you still don't know what to focus on.",
];

export function ProblemStatementSection({ id }: ProblemStatementSectionProps) {
  return (
    <section id={id} className="bg-gradient-problem-bg py-20 md:py-28">
      <Container size="md">
        <div className="text-center">
          {/* Headline */}
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-12">
            Sound familiar?
          </h2>

          {/* Pain Points */}
          <div className="space-y-5 text-left max-w-xl mx-auto mb-12">
            {painPoints.map((point, index) => (
              <div
                key={index}
                className="flex items-start gap-4 text-text-secondary text-lg"
              >
                <IconSquare
                  size={24}
                  stroke={1.5}
                  className="text-text-muted flex-shrink-0 mt-0.5"
                />
                <span>{point}</span>
              </div>
            ))}
          </div>

          {/* Transition Line */}
          <div className="border-t border-border-primary pt-12 mt-12">
            <p className="text-xl md:text-2xl text-text-muted italic max-w-2xl mx-auto">
              Task management was built for a slower world.
              <br />
              <span className="text-white font-medium">
                You need something different.
              </span>
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

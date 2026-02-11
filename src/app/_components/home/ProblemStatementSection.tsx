import { Container } from "@mantine/core";
import { IconSquare } from "@tabler/icons-react";

interface ProblemStatementSectionProps {
  id?: string;
}

const painPoints = [
  "You have 6 tools open. None of them talk to each other.",
  "Your task list grows faster than you can check things off.",
  "You finished 23 tasks last week. You're not sure any of them mattered.",
  "AI can write your emails, but you still don't know what to focus on.",
];

export function ProblemStatementSection({ id }: ProblemStatementSectionProps) {
  return (
    <section id={id} className="bg-gradient-problem-bg py-20 md:py-28">
      <Container size="lg">
        <div className="text-center">
          {/* Headline */}
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-12 font-inter">
            Sound familiar?
          </h2>

          {/* Pain Points - Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
            {painPoints.map((point, index) => (
              <div
                key={index}
                className="flex items-start gap-4 text-text-secondary text-base md:text-lg bg-surface-secondary/20 p-6 rounded-lg border border-border-secondary/30 backdrop-blur-sm"
              >
                <IconSquare
                  size={20}
                  stroke={1.5}
                  className="text-accent-indigo flex-shrink-0 mt-1"
                />
                <span className="text-left">{point}</span>
              </div>
            ))}
          </div>

          {/* Transition Line */}
          <div className="border-t border-border-primary/30 pt-12 mt-12">
            <p className="text-lg md:text-xl text-text-muted italic max-w-2xl mx-auto">
              Task management was built for a slower world.
              <br />
              <span className="text-white font-semibold">
                You need something different.
              </span>
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

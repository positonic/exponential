import { Container } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";

interface SolutionIntroSectionProps {
  id?: string;
}

export function SolutionIntroSection({ id }: SolutionIntroSectionProps) {
  return (
    <section id={id} className="bg-background-primary py-20 md:py-28">
      <Container size="lg">
        <div className="text-center max-w-3xl mx-auto">
          {/* Headline */}
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-text-primary mb-6">
            From task management to{" "}
            <span className="text-accent-indigo">collective flow.</span>
          </h2>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-text-secondary mb-16 leading-relaxed">
            Exponential isn&apos;t another to-do list. It&apos;s the alignment
            layer where your goals, your team, and your AI stay in sync.
          </p>

          {/* Flow Diagram */}
          <div className="bg-surface-secondary border border-border-primary rounded-2xl p-8 md:p-12">
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-8">
              {/* Goals */}
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-accent-indigo/10 border border-accent-indigo/30 flex items-center justify-center mb-3">
                  <span className="text-3xl md:text-4xl">🎯</span>
                </div>
                <span className="font-semibold text-text-primary">Goals</span>
              </div>

              <IconArrowRight
                className="text-text-muted hidden md:block"
                size={28}
              />
              <span className="text-text-muted text-2xl md:hidden">↓</span>

              {/* Outcomes */}
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-brand-success/10 border border-brand-success/30 flex items-center justify-center mb-3">
                  <span className="text-3xl md:text-4xl">📊</span>
                </div>
                <span className="font-semibold text-text-primary">Outcomes</span>
              </div>

              <IconArrowRight
                className="text-text-muted hidden md:block"
                size={28}
              />
              <span className="text-text-muted text-2xl md:hidden">↓</span>

              {/* Actions */}
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-brand-warning/10 border border-brand-warning/30 flex items-center justify-center mb-3">
                  <span className="text-3xl md:text-4xl">⚡</span>
                </div>
                <span className="font-semibold text-text-primary">Actions</span>
              </div>
            </div>

            {/* AI Layer Indicator */}
            <div className="border-t border-border-primary pt-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-indigo/10 border border-accent-indigo/20">
                <span className="text-lg">🤖</span>
                <span className="text-sm font-medium text-accent-indigo">
                  AI manages this layer
                </span>
              </div>
              <p className="text-text-muted mt-4 text-sm">
                Humans stay aligned. AI handles the execution details.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

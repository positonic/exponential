import { Container } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";

interface SolutionIntroSectionProps {
  id?: string;
}

export function SolutionIntroSection({ id }: SolutionIntroSectionProps) {
  return (
    <section id={id} className="bg-gradient-to-b from-background-primary to-gradient-hero-start/20 py-20 md:py-28 relative overflow-hidden">
      {/* Subtle blue radial gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--color-accent-indigo) 8%, transparent) 0%, transparent 50%)",
        }}
      />

      <Container size="lg" className="relative z-10">
        <div className="text-center max-w-3xl mx-auto">
          {/* Headline */}
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-text-primary mb-6">
            The operating system for{" "}
            <span className="bg-gradient-to-r from-accent-indigo to-accent-periwinkle bg-clip-text text-transparent">AI-first teams.</span>
          </h2>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-text-secondary mb-16 leading-relaxed">
            Exponential isn&apos;t another project tool. It&apos;s the
            coordination layer where your goals, your team, and your AI agents
            work as one system.
          </p>

          {/* Flow Diagram */}
          <div className="bg-gradient-to-br from-gradient-hero-start/40 to-gradient-cta-end/20 backdrop-blur-sm border border-accent-indigo/30 rounded-2xl p-8 md:p-12 shadow-lg shadow-accent-indigo/10">
            <div className="flex flex-col md:flex-row items-center justify-center mb-8">
              {/* Goals + Arrow */}
              <div className="flex flex-col md:flex-row items-center">
                <div className="flex flex-col items-center">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-accent-indigo/20 border-2 border-accent-indigo/40 flex items-center justify-center mb-3 shadow-lg shadow-accent-indigo/20">
                    <span className="text-3xl md:text-4xl">🎯</span>
                  </div>
                  <span className="font-semibold text-text-primary">Goals</span>
                </div>
                <IconArrowRight
                  className="text-accent-periwinkle hidden md:block shrink-0 mx-4 md:mx-6"
                  size={28}
                />
                <span className="text-accent-periwinkle text-2xl md:hidden my-4">↓</span>
              </div>

              {/* Outcomes + Arrow */}
              <div className="flex flex-col md:flex-row items-center">
                <div className="flex flex-col items-center">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-gradient-cta-end/20 border-2 border-gradient-cta-end/40 flex items-center justify-center mb-3 shadow-lg shadow-gradient-cta-end/20">
                    <span className="text-3xl md:text-4xl">📊</span>
                  </div>
                  <span className="font-semibold text-text-primary">Outcomes</span>
                </div>
                <IconArrowRight
                  className="text-accent-periwinkle hidden md:block shrink-0 mx-4 md:mx-6"
                  size={28}
                />
                <span className="text-accent-periwinkle text-2xl md:hidden my-4">↓</span>
              </div>

              {/* Actions (no arrow) */}
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-accent-periwinkle/20 border-2 border-accent-periwinkle/40 flex items-center justify-center mb-3 shadow-lg shadow-accent-periwinkle/20">
                  <span className="text-3xl md:text-4xl">⚡</span>
                </div>
                <span className="font-semibold text-text-primary">Actions</span>
              </div>
            </div>

            {/* AI Layer Indicator */}
            <div className="border-t border-accent-indigo/20 pt-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-indigo/20 border border-accent-indigo/40 shadow-lg shadow-accent-indigo/10">
                <span className="text-lg">🤖</span>
                <span className="text-sm font-medium text-accent-periwinkle">
                  AI agents execute this layer
                </span>
              </div>
              <p className="text-text-secondary mt-4 text-sm">
                Humans set direction. AI handles execution. The system keeps
                everything in sync.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

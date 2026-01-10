import { Container } from "@mantine/core";
import { CTAButton } from "./shared/CTAButton";

interface HeroSectionProps {
  id?: string;
}

export function HeroSection({ id }: HeroSectionProps) {
  return (
    <section
      id={id}
      className="bg-hero-gradient min-h-[85vh] flex items-center relative overflow-hidden"
    >
      {/* Subtle radial gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, var(--color-accent-periwinkle) 0%, transparent 50%)",
          opacity: 0.15,
        }}
      />

      <Container size="lg" className="relative z-10 py-20">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="mb-8">
            <span className="inline-flex items-center px-4 py-2 rounded-full bg-surface-secondary border border-border-secondary text-text-secondary text-sm font-medium">
              For founders who ship
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-text-primary mb-6 leading-tight">
            Stop managing work.{" "}
            <span className="text-accent-indigo">Start doing it.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
            Exponential connects your daily work to your goals—with AI that
            handles the noise so you can focus on what actually moves the
            needle.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <CTAButton href="/signin" variant="primary" size="large">
              Try Now For Free
            </CTAButton>
            <CTAButton
              href="#demo"
              variant="secondary"
              size="large"
              showArrow={false}
            >
              See how it works
            </CTAButton>
          </div>

          {/* Social Proof */}
          <p className="text-text-muted text-sm">
            Join 50+ founders already using Exponential
          </p>
        </div>
      </Container>
    </section>
  );
}

import { Container } from "@mantine/core";
import { CTAButton } from "./shared/CTAButton";
import { SocialProof } from "./shared/SocialProof";

interface HeroSectionProps {
  id?: string;
}

export function HeroSection({ id }: HeroSectionProps) {
  return (
    <section
      id={id}
      className="bg-hero-gradient min-h-[75vh] flex items-center relative overflow-hidden"
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

      <Container size="lg" className="relative z-10 py-16 md:py-24">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="mb-6 md:mb-8 animate-fade-in">
            <span className="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-accent-indigo/10 to-accent-periwinkle/10 border border-accent-indigo/20 text-accent-indigo text-sm font-semibold backdrop-blur-sm">
              ✨ For founders who ship
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-bold text-text-primary mb-6 leading-[1.15] font-inter">
            Stop managing work.{" "}
            <span className="bg-gradient-to-r from-accent-indigo to-accent-periwinkle bg-clip-text text-transparent">
              Start doing it.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-8 md:mb-10 leading-relaxed">
            Exponential connects your daily work to your goals—with AI that
            handles the noise so you can focus on what actually moves the
            needle.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10 md:mb-12">
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
          <SocialProof />
        </div>
      </Container>
    </section>
  );
}

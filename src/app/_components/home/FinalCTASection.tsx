import { Container } from "@mantine/core";
import { CTAButton } from "./shared/CTAButton";

interface FinalCTASectionProps {
  id?: string;
}

export function FinalCTASection({ id }: FinalCTASectionProps) {
  return (
    <section id={id} className="bg-cta-gradient py-20 md:py-28 relative overflow-hidden">
      {/* Background decorations */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 20% 50%, var(--color-cta-overlay-light) 0%, transparent 40%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 80% 50%, var(--color-cta-overlay-lighter) 0%, transparent 40%)",
        }}
      />

      <Container size="md" className="relative z-10">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to coordinate your
            <br />
            AI-first organization?
          </h2>

          <p className="text-xl text-white/80 mb-10 max-w-xl mx-auto">
            Join teams building the future where humans and AI work as one.
          </p>

          <CTAButton
            href="/signin"
            variant="primary"
            size="large"
          >
            Get Started Free
          </CTAButton>
        </div>
      </Container>
    </section>
  );
}

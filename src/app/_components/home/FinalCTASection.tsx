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
            "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 40%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 80% 50%, rgba(255,255,255,0.08) 0%, transparent 40%)",
        }}
      />

      <Container size="md" className="relative z-10">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to stop managing tasks
            <br />
            and start making progress?
          </h2>

          <p className="text-xl text-white/80 mb-10 max-w-xl mx-auto">
            Join founders who&apos;ve moved beyond the to-do list.
          </p>

          <CTAButton
            href="/signin"
            variant="secondary"
            size="large"
            className="bg-white text-accent-indigo hover:bg-white/90 border-white"
          >
            Try Now For Free
          </CTAButton>
        </div>
      </Container>
    </section>
  );
}

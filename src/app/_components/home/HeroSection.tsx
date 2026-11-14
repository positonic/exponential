import { Container } from "@mantine/core";
import Image from "next/image";
import { CTAButton } from "./shared/CTAButton";
import { PRODUCT_NAME } from "~/lib/brand";

interface HeroSectionProps {
  id?: string;
}

export function HeroSection({ id }: HeroSectionProps) {
  return (
    <section id={id} className="bg-hero-gradient relative overflow-hidden">
      {/* Subtle radial gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 20%, var(--color-accent-periwinkle) 0%, transparent 50%)",
          opacity: 0.12,
        }}
      />

      <Container size="lg" className="relative z-10 pt-10 md:pt-14">
        <div className="text-center max-w-4xl mx-auto">
          <p className="text-accent-indigo uppercase tracking-wider text-xs md:text-sm font-semibold mb-5">
            Open source · Cloud or self-hosted · AGPL-3.0
          </p>

          <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-bold text-text-primary mb-6 leading-[1.15] font-inter">
            The operating workspace for your organization, its people and its
            AI agents
          </h1>

          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-8 md:mb-10 leading-relaxed">
            Goals, projects, meetings and decisions in one place. Every agent
            has its own identity, scoped access and a record of what it did.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <CTAButton href="/signin" variant="primary" size="large">
              Get started free
            </CTAButton>
            <CTAButton
              href="#self-host"
              variant="secondary"
              size="large"
              showArrow={false}
            >
              Self-host it
            </CTAButton>
          </div>
        </div>

        {/* The product, in the first screen */}
        <div className="mt-12 md:mt-16 rounded-t-xl border border-b-0 border-border-primary overflow-hidden shadow-xl">
          <Image
            src="/product-shots/exponential-home.jpg"
            alt={`A ${PRODUCT_NAME} workspace home: objectives, active projects and review rituals`}
            width={3412}
            height={1978}
            sizes="(min-width: 1200px) 1140px, 100vw"
            priority
            className="w-full h-auto block"
          />
        </div>
      </Container>
    </section>
  );
}

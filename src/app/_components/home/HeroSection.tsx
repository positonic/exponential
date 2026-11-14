import { CTAButton } from "./shared/CTAButton";
import { HeroScene } from "./scenes/HeroScene";

interface HeroSectionProps {
  id?: string;
}

export function HeroSection({ id }: HeroSectionProps) {
  return (
    <section id={id} className="relative overflow-hidden pb-16 md:pb-24">
      <div className="mkt-container relative pt-16 md:pt-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="mkt-eyebrow mkt-rise mb-6">Open source · AGPL-3.0</p>

          <h1 className="mkt-h1 mkt-rise mb-6">
            The operating system for startups run by people and agents
          </h1>

          <p className="mkt-lead mkt-rise mx-auto mb-10 max-w-2xl">
            Goals, projects, meetings and decisions in one place, with every
            agent accountable for what it does.
          </p>

          <div className="mkt-rise flex flex-col items-center justify-center gap-x-8 gap-y-5 sm:flex-row">
            <CTAButton href="/signin" variant="pill" size="large">
              Get started free
            </CTAButton>
            <CTAButton href="#self-host" variant="text">
              Self-host
            </CTAButton>
          </div>
        </div>

        {/* The product, in the first screen: one action an agent made, and
            the record of it. The glow is the page's one brand highlight. */}
        <div className="mkt-rise relative mx-auto mt-16 max-w-5xl md:mt-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-24 h-48"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 50%, color-mix(in srgb, var(--color-brand-primary) 22%, transparent), transparent)",
            }}
          />
          {/* `relative` lifts the scene above the glow behind it. */}
          <div className="relative">
            <HeroScene />
          </div>
        </div>
      </div>
    </section>
  );
}

import { CTAButton } from "./shared/CTAButton";

interface FinalCTASectionProps {
  id?: string;
}

export function FinalCTASection({ id }: FinalCTASectionProps) {
  return (
    <section id={id} className="mkt-section border-t border-border-primary">
      <div className="mkt-container mkt-reveal text-center">
        <h2 className="mkt-h2 mb-5">
          One place for your team, your agents and the work
        </h2>

        <p className="mkt-body max-w-xl mx-auto mb-10">
          Open source and free to start. Bring your team, connect an agent,
          and see what changed this week.
        </p>

        <CTAButton href="/signin" variant="pill" size="large">
          Get started free
        </CTAButton>
      </div>
    </section>
  );
}

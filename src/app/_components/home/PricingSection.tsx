import { CTAButton } from "./shared/CTAButton";

interface PricingSectionProps {
  id?: string;
}

/**
 * Pricing, as one statement. There is a single hosted plan and it is free,
 * so a plan card says nothing a sentence does not. When there is more than
 * one plan, this becomes a link to a pricing page.
 */
export function PricingSection({ id }: PricingSectionProps) {
  return (
    <section id={id} className="mkt-section border-t border-border-primary">
      <div className="mkt-container mkt-reveal">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="mkt-eyebrow mb-4">Pricing</p>
            <h2 className="mkt-h2 mb-4">Free to start, on our servers or yours</h2>
            <p className="mkt-body">
              The hosted workspace is $0 a month with no credit card: the full
              platform, the assistant and meeting features, and your own
              agents. Self-hosting is free under AGPL-3.0.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-5">
            <CTAButton href="/signin" variant="pill" size="large">
              Get started free
            </CTAButton>
            <CTAButton href="#self-host" variant="text">
              Self-host
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  );
}

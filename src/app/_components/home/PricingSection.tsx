import { Container } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { CTAButton } from "./shared/CTAButton";

interface PricingSectionProps {
  id?: string;
}

const features = [
  "Full platform access",
  "AI features included",
  "Unlimited goals & outcomes",
  "Team collaboration",
  "Weekly reviews & planning",
  "No credit card required",
];

export function PricingSection({ id }: PricingSectionProps) {
  return (
    <section id={id} className="bg-background-primary py-20 md:py-28">
      <Container size="sm">
        <div className="text-center mb-12">
          <p className="text-text-muted uppercase tracking-wider text-sm font-medium mb-4">
            Pricing
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary">
            Free to use. Forever.
          </h2>
        </div>

        {/* Pricing Card */}
        <div className="bg-surface-secondary border-2 border-accent-indigo/30 rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
          {/* Background decoration */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at top right, var(--color-accent-indigo) 0%, transparent 50%)",
              opacity: 0.05,
            }}
          />

          <div className="relative z-10">
            {/* Badge */}
            <span className="inline-block px-4 py-1 rounded-full bg-accent-indigo/10 text-accent-indigo text-sm font-semibold mb-6">
              FREE FOREVER
            </span>

            {/* Price */}
            <div className="mb-8">
              <span className="text-6xl font-bold text-text-primary">$0</span>
              <span className="text-text-muted ml-2">/month</span>
            </div>

            {/* Features */}
            <ul className="space-y-4 mb-10 text-left max-w-xs mx-auto">
              {features.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-brand-success/20 flex items-center justify-center flex-shrink-0">
                    <IconCheck
                      size={14}
                      className="text-brand-success"
                      stroke={2.5}
                    />
                  </div>
                  <span className="text-text-secondary">{feature}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <CTAButton href="/signin" variant="primary" size="large">
              Try Now For Free
            </CTAButton>

            <p className="text-text-muted text-sm mt-4">
              No credit card required
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

import type { Metadata } from "next";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import { auth } from "~/server/auth";
import {
  FinalCTASection,
  FooterSection,
  MarketingHeader,
} from "~/app/_components/home";
import { CTAButton } from "~/app/_components/home/shared/CTAButton";
import { Panel, Pill } from "~/app/_components/ui";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import {
  COMPARISON,
  DESIGN_PARTNER_EMAIL,
  ENTERPRISE_CONTACT_HREF,
  FAQ,
  PLANS,
  PRICING_RULES,
  RAILWAY_DEPLOY_URL,
  SELF_HOSTING_GUIDE_URL,
  type Cell,
  type Plan,
} from "./_data/plans";

const pricingUrl = `${getPublicBaseUrlFromEnv()}/pricing`;
const title = `Pricing | ${PRODUCT_NAME}`;
const description =
  "Exponential is free, hosted or self-hosted. You pay for people, never for agents: the MCP server, CLI and every agent come with every plan.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: pricingUrl },
  openGraph: {
    type: "website",
    title,
    description,
    url: pricingUrl,
    siteName: PRODUCT_NAME,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

export default async function PricingPage() {
  // Signed-in people can read this page too; they get "Open app" in the header.
  const session = await auth();

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      <MarketingHeader session={session} mobileNav />

      <main>
        <section className="mkt-section">
          <div className="mkt-container">
            <div className="mb-12 max-w-3xl">
              <p className="mkt-eyebrow mkt-rise mb-4">Pricing</p>
              <h1 className="mkt-h1 mkt-rise mb-5">
                Pay for your people.
                <br />
                Your agents are free.
              </h1>
              <p className="mkt-lead mkt-rise max-w-2xl">
                {PRODUCT_NAME} is free today, on our servers or yours. Every
                agent, the MCP server and the CLI come with every plan.
              </p>
            </div>

            <Panel
              radius="xl"
              padding="none"
              className="grid grid-cols-1 divide-y divide-border-primary overflow-hidden lg:grid-cols-3 lg:divide-x lg:divide-y-0"
            >
              {PLANS.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </Panel>

            <Panel
              radius="xl"
              padding="lg"
              className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-text-muted">
                <span className="font-semibold text-text-primary">
                  Need more than this?
                </span>{" "}
                SSO, an audit log, a private managed deployment or help moving
                off Jira or Linear: tell us what your company needs.
              </p>
              <CTAButton href={ENTERPRISE_CONTACT_HREF} variant="text" className="shrink-0">
                Talk to us
              </CTAButton>
            </Panel>
          </div>
        </section>

        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <p className="mkt-eyebrow mb-4">How pricing works</p>
            <h2 className="mkt-h2 mb-12 max-w-2xl">
              You pay for people and for the AI we run. That&apos;s all.
            </h2>
            <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
              {PRICING_RULES.map((rule) => (
                <div key={rule.title}>
                  <h3 className="mkt-h3 mb-2">{rule.title}</h3>
                  <p className="text-[15px] leading-relaxed text-text-muted">{rule.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="compare" className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <h2 className="mkt-h2 mb-10">Compare plans</h2>
            <ComparisonTable />
          </div>
        </section>

        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <p className="mkt-eyebrow mb-4">Self-hosted</p>
                <h2 className="mkt-h2 mb-4">The code we host is the code you get</h2>
                <p className="mkt-body mb-8 max-w-lg">
                  {PRODUCT_NAME} is AGPL-3.0. Run it on your own servers with
                  your own Postgres, and bring your own model key if you want
                  AI. Running it inside your company doesn&apos;t oblige you to
                  publish your changes.
                </p>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
                  <CTAButton href={RAILWAY_DEPLOY_URL} variant="ghost" size="large">
                    Deploy on Railway
                  </CTAButton>
                  <CTAButton href={SELF_HOSTING_GUIDE_URL} variant="text">
                    Self-hosting guide
                  </CTAButton>
                </div>
              </div>
              <Panel radius="xl" padding="none" className="overflow-hidden">
                <div className="border-b border-border-primary px-4 py-2.5 text-xs font-medium text-text-muted">
                  From a checkout of the repository
                </div>
                <pre className="overflow-x-auto p-5 font-mono text-sm leading-7">
                  <span className="select-none text-text-muted">$ </span>
                  <span className="text-text-primary">docker compose up -d --build</span>
                </pre>
              </Panel>
            </div>
          </div>
        </section>

        <section id="faq" className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
              <div>
                <h2 className="mkt-h2 mb-4">Questions</h2>
                <p className="mkt-body">
                  Anything else? Email{" "}
                  <a href={`mailto:${DESIGN_PARTNER_EMAIL}`} className="mkt-link">
                    {DESIGN_PARTNER_EMAIL}
                  </a>
                  .
                </p>
              </div>
              <div className="border-t border-border-primary">
                {FAQ.map((item) => (
                  <details key={item.question} className="group border-b border-border-primary">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-medium text-text-primary [&::-webkit-details-marker]:hidden">
                      {item.question}
                      <span
                        aria-hidden
                        className="text-xl font-normal text-text-muted transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-text-muted">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <FinalCTASection />
      </main>

      <FooterSection />
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`flex flex-col gap-6 p-6 sm:p-8 ${
        plan.highlighted ? "bg-background-tertiary" : ""
      }`}
    >
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mkt-h3">{plan.name}</h2>
          {plan.tag && <Pill size="sm">{plan.tag}</Pill>}
        </div>
        <p className="mb-3 flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight tabular-nums text-text-primary">
            {plan.price}
          </span>
          {plan.priceNote && (
            <span className="text-sm text-text-muted">{plan.priceNote}</span>
          )}
        </p>
        <p className="text-[15px] leading-relaxed text-text-muted lg:min-h-[3rem]">
          {plan.description}
        </p>
      </div>

      <ul className="flex flex-col gap-3 text-[15px] text-text-primary">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <IconCheck size={16} stroke={2} className="mt-1 shrink-0 text-text-muted" aria-hidden />
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3 pt-2">
        <CTAButton href={plan.cta.href} variant={plan.cta.variant} size="large" className="w-full">
          {plan.cta.label}
        </CTAButton>
        {plan.footnote && <p className="text-xs leading-relaxed text-text-muted">{plan.footnote}</p>}
      </div>
    </div>
  );
}

function ComparisonTable() {
  return (
    // `relative` keeps the cells' absolutely positioned sr-only labels inside
    // the scroll box; without it they widen the page on a phone.
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-[15px]">
        <thead>
          <tr className="border-b border-border-primary">
            <th scope="col" className="w-2/5 py-3 pr-4 font-medium text-text-muted">
              <span className="sr-only">Feature</span>
            </th>
            {PLANS.map((plan) => (
              <th key={plan.id} scope="col" className="px-4 py-3 font-medium text-text-primary">
                {plan.name}
                {plan.tag === "Coming soon" && (
                  <span className="ml-2 text-xs font-normal text-text-muted">Soon</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        {COMPARISON.map((group) => (
          <tbody key={group.label}>
            <tr>
              <th
                scope="colgroup"
                colSpan={PLANS.length + 1}
                className="pb-3 pt-10 text-sm font-semibold text-text-primary"
              >
                {group.label}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.feature} className="border-b border-border-primary">
                <th scope="row" className="py-3 pr-4 font-normal text-text-primary">
                  {row.feature}
                </th>
                {PLANS.map((plan) => (
                  <td key={plan.id} className="px-4 py-3 text-text-muted">
                    <CellValue value={row.values[plan.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <IconCheck size={16} stroke={2} className="text-text-primary" aria-hidden />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <IconMinus size={16} stroke={1.5} className="text-text-muted" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <>{value}</>;
}

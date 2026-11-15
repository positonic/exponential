import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getAllIntegrationSlugs,
  getIntegrationBySlug,
} from "../_data/integrations";
import { CTAButton } from "~/app/_components/home/shared/CTAButton";
import { FooterSection, MarketingHeader } from "~/app/_components/home";
import { Panel } from "~/app/_components/ui";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

interface IntegrationPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllIntegrationSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: IntegrationPageProps) {
  const { slug } = await params;
  const integration = getIntegrationBySlug(slug);

  if (!integration) {
    return { title: "Integration Not Found" };
  }

  const url = `${getPublicBaseUrlFromEnv()}/features/integrations/${slug}`;
  const title = `${integration.seoTitle} | ${PRODUCT_NAME}`;

  return {
    title,
    description: integration.seoDescription,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      title,
      description: integration.seoDescription,
      url,
      siteName: PRODUCT_NAME,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: integration.seoDescription,
      images: ["/og-image.png"],
    },
  };
}

export default async function IntegrationPage({ params }: IntegrationPageProps) {
  const { slug } = await params;
  const integration = getIntegrationBySlug(slug);

  if (!integration) {
    notFound();
  }

  const baseUrl = getPublicBaseUrlFromEnv();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: integration.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: PRODUCT_NAME, item: baseUrl },
        {
          "@type": "ListItem",
          position: 2,
          name: `${integration.name} integration`,
          item: `${baseUrl}/features/integrations/${integration.slug}`,
        },
      ],
    },
  ];

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <MarketingHeader />

      <main>
        {/* Hero */}
        <section className="pb-16 md:pb-24">
          <div className="mkt-container pt-16 md:pt-24">
            <div className="max-w-3xl">
              <p className="mkt-eyebrow mkt-rise mb-6">
                {integration.name} + {PRODUCT_NAME}
              </p>
              <h1 className="mkt-h1 mkt-rise mb-6">{integration.headline}</h1>
              <p className="mkt-lead mkt-rise mb-10">{integration.intro}</p>
              <div className="mkt-rise flex flex-wrap items-center gap-x-8 gap-y-5">
                <CTAButton href="/signin" variant="pill" size="large">
                  Get your API key
                </CTAButton>
                <CTAButton href={integration.docsHref} variant="text">
                  Read the setup docs
                </CTAButton>
              </div>
            </div>
          </div>
        </section>

        {/* Example prompts */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <h2 className="mkt-h2 mb-10 max-w-3xl">
              What you can ask {integration.name}
            </h2>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {integration.examplePrompts.map((prompt) => (
                <Panel
                  as="li"
                  key={prompt}
                  radius="xl"
                  padding="none"
                  className="p-6 text-[0.9375rem] leading-relaxed text-text-primary"
                >
                  &ldquo;{prompt}&rdquo;
                </Panel>
              ))}
            </ul>
          </div>
        </section>

        {/* Setup */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <h2 className="mkt-h2 mb-10 max-w-3xl">
              How to connect {integration.name} to {PRODUCT_NAME}
            </h2>
            <ol className="max-w-3xl space-y-10">
              {integration.setupSteps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border-strong text-sm font-semibold text-text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="mkt-h3 mb-2">{step.title}</h3>
                    <p className="mkt-body">{step.body}</p>
                    {step.code && (
                      <Panel
                        as="pre"
                        padding="none"
                        className="mt-5 overflow-x-auto p-5 font-mono text-sm leading-7 text-text-primary"
                      >
                        <code>{step.code.content}</code>
                      </Panel>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Tools */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <div className="mb-10 max-w-3xl">
              <h2 className="mkt-h2 mb-4">The tools {integration.name} gets</h2>
              <p className="mkt-body">
                Every tool the integration exposes, by the name{" "}
                {integration.name} sees.
              </p>
            </div>
            <Panel
              as="dl"
              radius="xl"
              padding="none"
              className="divide-y divide-border-primary"
            >
              {integration.tools.map((tool) => (
                <div
                  key={tool.names.join(",")}
                  className="grid grid-cols-1 gap-2 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6"
                >
                  <dt className="flex flex-wrap gap-2">
                    {tool.names.map((name) => (
                      <code
                        key={name}
                        className="break-all font-mono text-sm text-text-primary"
                      >
                        {name}
                      </code>
                    ))}
                  </dt>
                  <dd className="text-[0.9375rem] leading-relaxed text-text-muted">
                    {tool.description}
                  </dd>
                </div>
              ))}
            </Panel>
          </div>
        </section>

        {/* Reasons */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <h2 className="mkt-h2 mb-10 max-w-3xl">
              Why connect {integration.name} to {PRODUCT_NAME}
            </h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {integration.reasons.map((reason) => (
                <Panel
                  key={reason.title}
                  radius="xl"
                  padding="none"
                  className="p-7"
                >
                  <h3 className="mkt-h3 mb-2">{reason.title}</h3>
                  <p className="text-[0.9375rem] leading-relaxed text-text-muted">
                    {reason.body}
                  </p>
                </Panel>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <h2 className="mkt-h2 mb-10 max-w-3xl">
              {integration.name} integration FAQ
            </h2>
            <div className="max-w-3xl space-y-8">
              {integration.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="mkt-h3 mb-2">{faq.question}</h3>
                  <p className="mkt-body">{faq.answer}</p>
                </div>
              ))}
            </div>

            <h2 className="mkt-h3 mb-4 mt-16">Related</h2>
            <ul className="flex flex-wrap gap-3">
              {integration.related.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="mkt-btn mkt-btn-ghost">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal text-center">
            <h2 className="mkt-h2 mb-5">
              Bring your workspace into {integration.name}
            </h2>
            <p className="mkt-body mx-auto mb-10 max-w-xl">
              Free to start. Open source. Set up in a couple of minutes.
            </p>
            <CTAButton href="/signin" variant="pill" size="large">
              Get started free
            </CTAButton>
          </div>
        </section>
      </main>

      <FooterSection />
    </div>
  );
}

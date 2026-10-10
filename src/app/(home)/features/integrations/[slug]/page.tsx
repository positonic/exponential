import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import {
  getAllIntegrationSlugs,
  getIntegrationBySlug,
} from "../_data/integrations";
import { CTAButton } from "~/app/_components/home/shared/CTAButton";
import { LogoDisplay } from "~/app/_components/layout/LogoDisplay";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { themes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";
import { FooterSection } from "~/app/_components/home";
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
  const domain = getThemeDomain();
  const theme = themes[domain];

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
    <div className="min-h-screen bg-background-primary text-text-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background-primary/80 backdrop-blur-md border-b border-border-primary">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <LogoDisplay theme={theme} href="/" className="text-xl" />
            </div>

            <nav className="hidden md:flex items-center space-x-8">
              <Link
                href="/#features"
                className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                Features
              </Link>
              <Link
                href="/docs"
                className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                Docs
              </Link>
              <Link
                href="/#pricing"
                className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                Pricing
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <CTAButton href="/signin" size="default">
                Try For Free
              </CTAButton>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-16" />

      <main>
        {/* Hero */}
        <section className="py-20 md:py-28">
          <Container size="md">
            <p className="text-accent-indigo font-medium mb-4">
              {integration.icon} {integration.name} + {PRODUCT_NAME}
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-text-primary mb-6 leading-tight">
              {integration.headline}
            </h1>
            <p className="text-lg md:text-xl text-text-secondary mb-8 leading-relaxed">
              {integration.intro}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <CTAButton href="/signin" variant="primary" size="large">
                Get your API key
              </CTAButton>
              <Link
                href={integration.docsHref}
                className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors font-medium"
              >
                Read the setup docs <IconArrowRight size={16} />
              </Link>
            </div>
          </Container>
        </section>

        {/* Example prompts */}
        <section className="py-16 md:py-20 bg-surface-secondary">
          <Container size="md">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-8">
              What you can ask {integration.name}
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {integration.examplePrompts.map((prompt) => (
                <li
                  key={prompt}
                  className="bg-background-primary rounded-xl p-5 border border-border-primary text-text-primary"
                >
                  &ldquo;{prompt}&rdquo;
                </li>
              ))}
            </ul>
          </Container>
        </section>

        {/* Setup */}
        <section className="py-16 md:py-20">
          <Container size="md">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-8">
              How to connect {integration.name} to {PRODUCT_NAME}
            </h2>
            <ol className="space-y-8">
              {integration.setupSteps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-secondary border border-border-primary flex items-center justify-center text-sm font-semibold text-text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-text-primary mb-2">
                      {step.title}
                    </h3>
                    <p className="text-text-secondary leading-relaxed">
                      {step.body}
                    </p>
                    {step.code && (
                      <pre className="mt-4 bg-background-secondary border border-border-primary rounded-lg p-4 overflow-x-auto text-sm text-text-primary">
                        <code>{step.code.content}</code>
                      </pre>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        {/* Tools */}
        <section className="py-16 md:py-20 bg-surface-secondary">
          <Container size="md">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">
              The tools {integration.name} gets
            </h2>
            <p className="text-text-secondary mb-8">
              Every tool the integration exposes, by the name {integration.name}{" "}
              sees.
            </p>
            <dl className="divide-y divide-border-primary border border-border-primary rounded-xl bg-background-primary">
              {integration.tools.map((tool) => (
                <div
                  key={tool.names.join(",")}
                  className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 md:gap-6 p-5"
                >
                  <dt className="flex flex-wrap gap-2">
                    {tool.names.map((name) => (
                      <code
                        key={name}
                        className="text-sm text-accent-indigo break-all"
                      >
                        {name}
                      </code>
                    ))}
                  </dt>
                  <dd className="text-text-secondary">{tool.description}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>

        {/* Reasons */}
        <section className="py-16 md:py-20">
          <Container size="md">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-8">
              Why connect {integration.name} to {PRODUCT_NAME}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {integration.reasons.map((reason) => (
                <div
                  key={reason.title}
                  className="rounded-xl p-6 border border-border-primary bg-surface-secondary"
                >
                  <h3 className="font-semibold text-text-primary mb-2">
                    {reason.title}
                  </h3>
                  <p className="text-text-secondary leading-relaxed">
                    {reason.body}
                  </p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* FAQ */}
        <section className="py-16 md:py-20 bg-surface-secondary">
          <Container size="md">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-8">
              {integration.name} integration FAQ
            </h2>
            <div className="space-y-6">
              {integration.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="font-semibold text-text-primary mb-2">
                    {faq.question}
                  </h3>
                  <p className="text-text-secondary leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>

            <h2 className="text-xl font-bold text-text-primary mt-14 mb-4">
              Related
            </h2>
            <ul className="flex flex-wrap gap-3">
              {integration.related.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-block rounded-lg px-4 py-2 border border-border-primary bg-background-primary text-text-secondary hover:text-text-primary transition-colors text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28 bg-cta-gradient">
          <Container size="md">
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Bring your workspace into {integration.name}
              </h2>
              <p className="text-xl text-white/80 mb-10 max-w-xl mx-auto">
                Free to start. Open source. Set up in a couple of minutes.
              </p>
              <CTAButton href="/signin" variant="primary" size="large">
                Try Now For Free
              </CTAButton>
            </div>
          </Container>
        </section>
      </main>

      <FooterSection />
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { getFeatureBySlug, getAllFeatureSlugs } from "../_data/features";
import { CTAButton } from "~/app/_components/home/shared/CTAButton";
import { LogoDisplay } from "~/app/_components/layout/LogoDisplay";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { themes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";
import { FooterSection } from "~/app/_components/home";

interface FeaturePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllFeatureSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: FeaturePageProps) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);

  if (!feature) {
    return { title: "Feature Not Found" };
  }

  const url = `https://www.exponential.im/features/${slug}`;

  return {
    title: `${feature.title} | Exponential`,
    description: feature.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      title: `${feature.title} | Exponential`,
      description: feature.description,
      url,
      siteName: 'Exponential',
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${feature.title} | Exponential`,
      description: feature.description,
      images: ['/og-image.png'],
    },
  };
}

export default async function FeaturePage({ params }: FeaturePageProps) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  const domain = getThemeDomain();
  const theme = themes[domain];

  if (!feature) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background-primary text-text-primary">
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
                href="/#how-it-works"
                className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                How It Works
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
        {/* Hero Section */}
        <section className="py-20 md:py-28">
          <Container size="xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Left: Content */}
              <div>
                <p className="text-accent-indigo font-medium mb-4">
                  {feature.category}
                </p>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-text-primary mb-6 leading-tight">
                  {feature.headline}
                </h1>
                <p className="text-lg md:text-xl text-text-secondary mb-8 leading-relaxed">
                  {feature.description}
                </p>

                <CTAButton href="/signin" variant="primary" size="large">
                  Try Now For Free
                </CTAButton>
                <p className="text-sm text-text-muted mt-4">
                  No credit card required
                </p>
              </div>

              {/* Right: Visual */}
              <div className="relative">
                <div
                  className="rounded-3xl p-8 md:p-12 aspect-square flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--color-accent-periwinkle) 10%, transparent) 0%, color-mix(in srgb, var(--color-accent-indigo) 15%, transparent) 100%)",
                  }}
                >
                  {/* Feature Icon */}
                  <div className="text-center">
                    <span className="text-8xl md:text-9xl">{feature.icon}</span>
                    <p className="text-text-muted mt-6 text-lg">
                      {feature.title}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* Benefits Section */}
        <section className="py-16 md:py-20 bg-surface-secondary">
          <Container size="lg">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-text-primary">
                Why you&apos;ll love {feature.title}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {feature.benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 bg-background-primary rounded-xl p-6 border border-border-primary"
                >
                  <div className="w-6 h-6 rounded-full bg-brand-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <IconCheck
                      size={14}
                      className="text-brand-success"
                      stroke={2.5}
                    />
                  </div>
                  <p className="text-text-primary font-medium">{benefit}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* CTA Section */}
        <section className="py-20 md:py-28 bg-cta-gradient">
          <Container size="md">
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Ready to try {feature.title}?
              </h2>
              <p className="text-xl text-white/80 mb-10 max-w-xl mx-auto">
                Join teams where humans and AI coordinate as one.
              </p>
              <CTAButton
                href="/signin"
                variant="primary"
                size="large"
              >
                Try Now For Free
              </CTAButton>
            </div>
          </Container>
        </section>
      </main>

      {/* Footer */}
      <FooterSection />
    </div>
  );
}

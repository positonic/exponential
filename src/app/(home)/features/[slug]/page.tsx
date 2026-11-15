import type { ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconCheck } from "@tabler/icons-react";
import {
  getFeatureBySlug,
  getAllFeatureSlugs,
  type FeatureScene,
} from "../_data/features";
import { CTAButton } from "~/app/_components/home/shared/CTAButton";
import {
  FinalCTASection,
  FooterSection,
  MarketingHeader,
} from "~/app/_components/home";
import { GoalsScene } from "~/app/_components/home/scenes/GoalsScene";
import { MeetingsScene } from "~/app/_components/home/scenes/MeetingsScene";
import { Panel } from "~/app/_components/ui";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { serializeJsonLd } from "~/lib/jsonLd";

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

  const url = `${getPublicBaseUrlFromEnv()}/features/${slug}`;
  const title = `${feature.seoTitle} | ${PRODUCT_NAME}`;
  // Share the feature's own screenshot where it has one.
  const image = feature.screenshot
    ? { url: `/doc-assets/${feature.screenshot.name}.png`, width: 1280, height: 800 }
    : { url: '/og-image.png', width: 1200, height: 630 };

  return {
    title,
    description: feature.seoDescription,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      title,
      description: feature.seoDescription,
      url,
      siteName: PRODUCT_NAME,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: feature.seoDescription,
      images: [image.url],
    },
  };
}

const SCENES: Record<FeatureScene, ComponentType> = {
  goals: GoalsScene,
  meetings: MeetingsScene,
};

export default async function FeaturePage({ params }: FeaturePageProps) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);

  if (!feature) {
    notFound();
  }

  const Scene = feature.scene ? SCENES[feature.scene] : null;
  const baseUrl = getPublicBaseUrlFromEnv();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: feature.faqs.map((faq) => ({
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
          name: feature.title,
          item: `${baseUrl}/features/${feature.slug}`,
        },
      ],
    },
  ];

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />

      <MarketingHeader />

      <main>
        {/* Hero: the home page's, with this feature's copy. */}
        <section className="relative overflow-hidden pb-16 md:pb-24">
          <div className="mkt-container relative pt-16 md:pt-24">
            <div className="mx-auto max-w-4xl text-center">
              <p className="mkt-eyebrow mkt-rise mb-6">{feature.category}</p>

              <h1 className="mkt-h1 mkt-rise mb-6">{feature.headline}</h1>

              <p className="mkt-lead mkt-rise mx-auto mb-10 max-w-2xl">
                {feature.description}
              </p>

              <div className="mkt-rise flex flex-col items-center justify-center gap-x-8 gap-y-5 sm:flex-row">
                <CTAButton href="/signin" variant="pill" size="large">
                  Get started free
                </CTAButton>
                <CTAButton href="/#features" variant="text">
                  See how it fits together
                </CTAButton>
              </div>
            </div>

            {/* The product itself, where a scene shows this feature. No
                scene, no picture: a placeholder says nothing. */}
            {Scene && (
              <div className="mkt-rise relative mx-auto mt-16 max-w-5xl md:mt-20">
                <Scene />
              </div>
            )}

            {/* No scene: the real screen, from the docs screenshots. */}
            {!Scene && feature.screenshot && (
              <figure className="mkt-rise relative mx-auto mt-16 max-w-5xl md:mt-20">
                <Panel radius="xl" padding="none" className="overflow-hidden">
                  <Image
                    src={`/doc-assets/${feature.screenshot.name}.png`}
                    alt={feature.screenshot.alt}
                    width={1280}
                    height={800}
                    sizes="(min-width: 1024px) 1024px, 100vw"
                    className="hidden h-auto w-full dark:block"
                  />
                  <Image
                    src={`/doc-assets/${feature.screenshot.name}-light.png`}
                    alt={feature.screenshot.alt}
                    width={1280}
                    height={800}
                    sizes="(min-width: 1024px) 1024px, 100vw"
                    className="block h-auto w-full dark:hidden"
                  />
                </Panel>
              </figure>
            )}
          </div>
        </section>

        {/* Benefits */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <div className="mb-14 max-w-2xl">
              <p className="mkt-eyebrow mb-4">{feature.title}</p>
              <h2 className="mkt-h2">What you get with {feature.title}</h2>
            </div>

            <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {feature.benefits.map((benefit) => (
                <Panel
                  as="li"
                  key={benefit}
                  radius="xl"
                  padding="none"
                  className="flex items-start gap-3 p-6"
                >
                  <IconCheck
                    size={18}
                    stroke={2}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-text-muted"
                  />
                  <span className="text-[0.9375rem] leading-relaxed text-text-primary">
                    {benefit}
                  </span>
                </Panel>
              ))}
            </ul>
          </div>
        </section>

        {/* Scene pages: the real screen too, after the benefits. */}
        {Scene && feature.screenshot && (
          <section className="mkt-section border-t border-border-primary">
            <div className="mkt-container mkt-reveal">
              <Panel
                as="figure"
                radius="xl"
                padding="none"
                className="mx-auto max-w-5xl overflow-hidden"
              >
                <Image
                  src={`/doc-assets/${feature.screenshot.name}.png`}
                  alt={feature.screenshot.alt}
                  width={1280}
                  height={800}
                  sizes="(min-width: 1024px) 1024px, 100vw"
                  className="hidden h-auto w-full dark:block"
                />
                <Image
                  src={`/doc-assets/${feature.screenshot.name}-light.png`}
                  alt={feature.screenshot.alt}
                  width={1280}
                  height={800}
                  sizes="(min-width: 1024px) 1024px, 100vw"
                  className="block h-auto w-full dark:hidden"
                />
              </Panel>
            </div>
          </section>
        )}

        {/* Depth: how it works, who it is for, how agents use it */}
        {feature.sections.map((section) => (
          <section
            key={section.heading}
            className="mkt-section border-t border-border-primary"
          >
            <div className="mkt-container mkt-reveal">
              <div className="max-w-3xl">
                <h2 className="mkt-h2 mb-6">{section.heading}</h2>
                <div className="space-y-5">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="mkt-body">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ))}

        {/* FAQ */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <h2 className="mkt-h2 mb-10 max-w-3xl">{feature.title} FAQ</h2>
            <div className="max-w-3xl space-y-8">
              {feature.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="mkt-h3 mb-2">{faq.question}</h3>
                  <p className="mkt-body">{faq.answer}</p>
                </div>
              ))}
            </div>

            <h2 className="mkt-h3 mb-4 mt-16">Related</h2>
            <ul className="flex flex-wrap gap-3">
              {feature.related.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="mkt-btn mkt-btn-ghost">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <FinalCTASection />
      </main>

      <FooterSection />
    </div>
  );
}

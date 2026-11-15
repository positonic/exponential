import type { ComponentType } from "react";
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

  return {
    title: `${feature.title} | ${PRODUCT_NAME}`,
    description: feature.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      title: `${feature.title} | ${PRODUCT_NAME}`,
      description: feature.description,
      url,
      siteName: PRODUCT_NAME,
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${feature.title} | ${PRODUCT_NAME}`,
      description: feature.description,
      images: ['/og-image.png'],
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

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
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
          </div>
        </section>

        {/* Benefits */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <div className="mb-14 max-w-2xl">
              <p className="mkt-eyebrow mb-4">{feature.title}</p>
              <h2 className="mkt-h2">What {feature.title} gives you</h2>
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

        <FinalCTASection />
      </main>

      <FooterSection />
    </div>
  );
}

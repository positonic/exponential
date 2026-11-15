import Link from "next/link";
import type { Metadata } from "next";
import { IconArrowRight, IconStar } from "@tabler/icons-react";
import {
  getAllLearnArticles,
  getAllClusters,
  getClusterArticles,
} from "~/lib/learn/getLearnArticle";
import { Panel } from "~/app/_components/ui";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

const learnUrl = `${getPublicBaseUrlFromEnv()}/learn`;

export const metadata: Metadata = {
  title: `Learn | ${PRODUCT_NAME}`,
  description:
    "Guides and frameworks for founders building in the AI era. Learn about AI-native execution, weekly planning, and the founder operating system.",
  alternates: {
    canonical: learnUrl,
  },
  openGraph: {
    type: "website",
    title: `Learn | ${PRODUCT_NAME}`,
    description:
      "Guides and frameworks for founders building in the AI era.",
    url: learnUrl,
    siteName: PRODUCT_NAME,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Learn | ${PRODUCT_NAME}`,
    description:
      "Guides and frameworks for founders building in the AI era.",
    images: ["/og-image.png"],
  },
};

export default async function LearnPage() {
  const clusters = await getAllClusters();
  const allArticles = await getAllLearnArticles();

  // Group articles by cluster, with unclustered articles separate
  const clusteredSections = await Promise.all(
    clusters.map(async (cluster) => ({
      name: cluster,
      articles: await getClusterArticles(cluster),
    })),
  );

  const unclusteredArticles = allArticles.filter((a) => !a.meta.cluster);

  return (
    <div>
      <section className="pb-12 md:pb-16">
        <div className="mkt-container pt-16 text-center md:pt-24">
          <h1 className="mkt-h1 mkt-rise mb-6">Learn</h1>
          <p className="mkt-lead mkt-rise mx-auto max-w-2xl">
            Guides and frameworks for founders building in the AI era.
          </p>
        </div>
      </section>

      <div className="mkt-container pb-24">
        <div className="mx-auto max-w-4xl">
          {allArticles.length === 0 ? (
            <p className="mkt-body text-center">
              Articles coming soon. Check back shortly.
            </p>
          ) : (
            <div className="space-y-16">
              {/* Clustered content */}
              {clusteredSections.map((section) => {
                const pillar = section.articles.find((a) => a.meta.isPillar);
                const subArticles = section.articles.filter(
                  (a) => !a.meta.isPillar,
                );

                return (
                  <section key={section.name}>
                    <h2 className="mkt-eyebrow mb-6">{section.name}</h2>

                    {/* Pillar article - featured */}
                    {pillar && (
                      <Panel
                        as={Link}
                        href={`/learn/${pillar.slug}`}
                        interactive
                        radius="xl"
                        padding="none"
                        className="mb-5 block p-7 md:p-8"
                      >
                        <div className="mb-4 flex items-center gap-2 text-text-muted">
                          <IconStar size={16} aria-hidden="true" />
                          <span className="mkt-eyebrow">Pillar guide</span>
                        </div>
                        <h3 className="mkt-h3 mb-2">{pillar.meta.title}</h3>
                        {pillar.meta.description && (
                          <p className="text-[0.9375rem] leading-relaxed text-text-muted">
                            {pillar.meta.description}
                          </p>
                        )}
                        <span className="mkt-link mt-5 text-sm">
                          Read the guide
                          <IconArrowRight size={16} aria-hidden="true" />
                        </span>
                      </Panel>
                    )}

                    {/* Sub-articles */}
                    {subArticles.length > 0 && (
                      <div className="space-y-4">
                        {subArticles.map((article) => (
                          <ArticleRow
                            key={article.slug}
                            href={`/learn/${article.slug}`}
                            title={article.meta.title}
                            description={article.meta.description}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}

              {/* Unclustered articles */}
              {unclusteredArticles.length > 0 && (
                <section>
                  {clusters.length > 0 && (
                    <h2 className="mkt-eyebrow mb-6">More guides</h2>
                  )}
                  <div className="space-y-4">
                    {unclusteredArticles.map((article) => (
                      <ArticleRow
                        key={article.slug}
                        href={`/learn/${article.slug}`}
                        title={article.meta.title}
                        description={article.meta.description}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ArticleRowProps {
  href: string;
  title: string;
  description?: string;
}

function ArticleRow({ href, title, description }: ArticleRowProps) {
  return (
    <Panel
      as={Link}
      href={href}
      interactive
      padding="none"
      className="flex items-start gap-4 p-5"
    >
      <div className="min-w-0 flex-1">
        <h3 className="mkt-h3 mb-1">{title}</h3>
        {description && (
          <p className="text-sm leading-6 text-text-muted">{description}</p>
        )}
      </div>
      <IconArrowRight
        size={16}
        aria-hidden="true"
        className="mt-1 flex-shrink-0 text-text-muted"
      />
    </Panel>
  );
}

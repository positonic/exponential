import Link from "next/link";
import { Title, Text, Badge } from "@mantine/core";
import type { Metadata } from "next";
import { IconArrowRight, IconStar } from "@tabler/icons-react";
import {
  getAllLearnArticles,
  getAllClusters,
  getClusterArticles,
} from "~/lib/learn/getLearnArticle";

export const metadata: Metadata = {
  title: "Learn | Exponential",
  description:
    "Guides and frameworks for founders building in the AI era. Learn about AI-native execution, weekly planning, and the founder operating system.",
  alternates: {
    canonical: "https://www.exponential.im/learn",
  },
  openGraph: {
    type: "website",
    title: "Learn | Exponential",
    description:
      "Guides and frameworks for founders building in the AI era.",
    url: "https://www.exponential.im/learn",
    siteName: "Exponential",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Learn | Exponential",
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
      {/* Hero banner */}
      <div
        className="relative flex items-center justify-center overflow-hidden py-20 md:py-28"
        style={{
          backgroundImage: "url('/banners/dyna-banner.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-background-primary/70" />
        <header className="relative z-10 text-center">
          <Title order={1} className="mb-3 text-4xl md:text-5xl">
            Learn
          </Title>
          <Text size="lg" className="text-text-secondary max-w-xl mx-auto">
            Guides and frameworks for founders building in the AI era.
          </Text>
        </header>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-16">
        {allArticles.length === 0 ? (
          <Text className="text-text-muted text-center">
            Articles coming soon. Check back shortly!
          </Text>
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
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-6">
                    {section.name}
                  </h2>

                  {/* Pillar article - featured */}
                  {pillar && (
                    <Link
                      href={`/learn/${pillar.slug}`}
                      className="group mb-6 block rounded-xl border border-border-primary bg-surface-secondary p-6 md:p-8 transition-colors hover:border-brand-primary/50"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <IconStar
                          size={18}
                          className="text-brand-primary mt-0.5 flex-shrink-0"
                        />
                        <Badge variant="light" size="sm">
                          Pillar Guide
                        </Badge>
                      </div>
                      <Title
                        order={3}
                        className="mb-2 transition-colors group-hover:text-brand-primary"
                      >
                        {pillar.meta.title}
                      </Title>
                      {pillar.meta.description && (
                        <Text className="text-text-secondary leading-7">
                          {pillar.meta.description}
                        </Text>
                      )}
                      <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-brand-primary">
                        Read the guide
                        <IconArrowRight size={14} />
                      </div>
                    </Link>
                  )}

                  {/* Sub-articles */}
                  {subArticles.length > 0 && (
                    <div className="space-y-4">
                      {subArticles.map((article) => (
                        <Link
                          key={article.slug}
                          href={`/learn/${article.slug}`}
                          className="group flex items-start gap-4 rounded-lg border border-border-primary p-5 transition-colors hover:border-brand-primary/50"
                        >
                          <div className="flex-1">
                            <Title
                              order={4}
                              className="mb-1 transition-colors group-hover:text-brand-primary"
                            >
                              {article.meta.title}
                            </Title>
                            {article.meta.description && (
                              <Text
                                size="sm"
                                className="text-text-secondary leading-6"
                              >
                                {article.meta.description}
                              </Text>
                            )}
                          </div>
                          <IconArrowRight
                            size={16}
                            className="mt-1 flex-shrink-0 text-text-muted transition-colors group-hover:text-brand-primary"
                          />
                        </Link>
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
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-6">
                    More Guides
                  </h2>
                )}
                <div className="space-y-4">
                  {unclusteredArticles.map((article) => (
                    <Link
                      key={article.slug}
                      href={`/learn/${article.slug}`}
                      className="group flex items-start gap-4 rounded-lg border border-border-primary p-5 transition-colors hover:border-brand-primary/50"
                    >
                      <div className="flex-1">
                        <Title
                          order={4}
                          className="mb-1 transition-colors group-hover:text-brand-primary"
                        >
                          {article.meta.title}
                        </Title>
                        {article.meta.description && (
                          <Text
                            size="sm"
                            className="text-text-secondary leading-6"
                          >
                            {article.meta.description}
                          </Text>
                        )}
                      </div>
                      <IconArrowRight
                        size={16}
                        className="mt-1 flex-shrink-0 text-text-muted transition-colors group-hover:text-brand-primary"
                      />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

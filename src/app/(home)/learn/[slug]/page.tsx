import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Text, Badge } from "@mantine/core";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import {
  getLearnArticle,
  getAllLearnSlugs,
  getClusterArticles,
} from "~/lib/learn/getLearnArticle";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

interface LearnArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllLearnSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: LearnArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getLearnArticle(slug);

  if (!article) {
    return { title: "Article Not Found" };
  }

  const url = `https://www.exponential.im/learn/${slug}`;

  return {
    title: `${article.meta.title} | Exponential`,
    description: article.meta.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "article",
      title: article.meta.title,
      description: article.meta.description,
      url,
      siteName: "Exponential",
      publishedTime: new Date(article.meta.date).toISOString(),
      authors: article.meta.author ? [article.meta.author] : undefined,
      tags: article.meta.tags,
      images: article.meta.coverImage
        ? [{ url: article.meta.coverImage, width: 1200, height: 630 }]
        : [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.meta.title,
      description: article.meta.description,
      images: article.meta.coverImage
        ? [article.meta.coverImage]
        : ["/og-image.png"],
    },
  };
}

export default async function LearnArticlePage({
  params,
}: LearnArticlePageProps) {
  const { slug } = await params;
  const article = await getLearnArticle(slug);

  if (!article) {
    notFound();
  }

  // Get related articles from the same cluster
  const clusterArticles = article.meta.cluster
    ? await getClusterArticles(article.meta.cluster)
    : [];
  const relatedArticles = clusterArticles.filter((a) => a.slug !== slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.meta.title,
    description: article.meta.description,
    datePublished: new Date(article.meta.date).toISOString(),
    author: {
      "@type":
        article.meta.author === "Exponential Team" ? "Organization" : "Person",
      name: article.meta.author ?? "Exponential Team",
    },
    publisher: {
      "@type": "Organization",
      name: "Exponential",
      url: "https://www.exponential.im",
      logo: {
        "@type": "ImageObject",
        url: "https://www.exponential.im/expo-logo-20.png",
      },
    },
    url: `https://www.exponential.im/learn/${slug}`,
    mainEntityOfPage: `https://www.exponential.im/learn/${slug}`,
    ...(article.meta.coverImage ? { image: article.meta.coverImage } : {}),
    ...(article.meta.tags
      ? { keywords: article.meta.tags.join(", ") }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div>
        {/* Hero banner */}
        <div
          className="relative flex items-end overflow-hidden py-16 md:py-24"
          style={{
            backgroundImage: "url('/banners/dyna-banner.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-background-primary/70" />
          <div className="relative z-10 mx-auto w-full max-w-3xl px-6">
            <Link
              href="/learn"
              className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <IconArrowLeft size={16} />
              Back to Learn
            </Link>

            {article.meta.cluster && (
              <div className="mb-3">
                <Badge variant="light" size="sm">
                  {article.meta.cluster}
                </Badge>
              </div>
            )}

            <h1 className="mb-4 text-3xl md:text-4xl font-bold text-text-primary">
              {article.meta.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
              <time dateTime={article.meta.date}>
                {new Date(article.meta.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              {article.meta.author && (
                <>
                  <span>·</span>
                  <span>{article.meta.author}</span>
                </>
              )}
            </div>

            {article.meta.tags && article.meta.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {article.meta.tags.map((tag) => (
                  <Badge key={tag} variant="light" size="sm">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Article content */}
        <article className="mx-auto max-w-3xl px-6 py-12">
          {article.meta.description && (
            <Text
              size="lg"
              className="mb-10 border-b border-border-primary pb-8 leading-7 text-text-secondary"
            >
              {article.meta.description}
            </Text>
          )}

          <div className="blog-content">
            <MarkdownRenderer content={article.content} />
          </div>

          {/* Related articles from same cluster */}
          {relatedArticles.length > 0 && (
            <div className="mt-16 border-t border-border-primary pt-8">
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                Continue reading
              </h2>
              <div className="space-y-3">
                {relatedArticles.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/learn/${related.slug}`}
                    className="group flex items-center justify-between rounded-lg border border-border-primary p-4 transition-colors hover:border-brand-primary/50"
                  >
                    <div>
                      <p className="font-medium text-text-primary transition-colors group-hover:text-brand-primary">
                        {related.meta.title}
                      </p>
                      {related.meta.isPillar && (
                        <Badge variant="light" size="xs" mt={4}>
                          Pillar Guide
                        </Badge>
                      )}
                    </div>
                    <IconArrowRight
                      size={16}
                      className="flex-shrink-0 text-text-muted transition-colors group-hover:text-brand-primary"
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="mt-16 overflow-hidden rounded-2xl bg-cta-gradient p-8 text-center md:p-12">
            <h2 className="mb-3 text-2xl text-white md:text-3xl font-bold">
              Ready to build your founder operating system?
            </h2>
            <Text className="mx-auto mb-8 max-w-lg text-white/80">
              Exponential gives you an AI copilot that runs your productivity
              system — so you stay focused on the work that matters.
            </Text>

            <div className="mx-auto mb-8 flex max-w-md flex-col gap-3 text-left text-sm text-white/90">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">&#10003;</span>
                <span>
                  AI-powered daily planning that adapts to your priorities
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">&#10003;</span>
                <span>
                  Goals, outcomes, and projects linked in one system
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">&#10003;</span>
                <span>Free to start — no credit card required</span>
              </div>
            </div>

            <Link
              href="/signin"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-background-primary shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl"
            >
              Get Started Free
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </article>
      </div>
    </>
  );
}

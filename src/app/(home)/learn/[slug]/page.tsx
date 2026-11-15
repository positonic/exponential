import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import {
  getLearnArticle,
  getAllLearnSlugs,
  getClusterArticles,
} from "~/lib/learn/getLearnArticle";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { FinalCTASection } from "~/app/_components/home";
import { Panel } from "~/app/_components/ui";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

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

  const url = `${getPublicBaseUrlFromEnv()}/learn/${slug}`;

  return {
    title: `${article.meta.title} | ${PRODUCT_NAME}`,
    description: article.meta.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "article",
      title: article.meta.title,
      description: article.meta.description,
      url,
      siteName: PRODUCT_NAME,
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
        article.meta.author === `${PRODUCT_NAME} Team` ? "Organization" : "Person",
      name: article.meta.author ?? `${PRODUCT_NAME} Team`,
    },
    publisher: {
      "@type": "Organization",
      name: PRODUCT_NAME,
      url: getPublicBaseUrlFromEnv(),
      logo: {
        "@type": "ImageObject",
        url: `${getPublicBaseUrlFromEnv()}/expo-logo-20.png`,
      },
    },
    url: `${getPublicBaseUrlFromEnv()}/learn/${slug}`,
    mainEntityOfPage: `${getPublicBaseUrlFromEnv()}/learn/${slug}`,
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
        <header className="mkt-container pt-12 md:pt-16">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/learn"
              className="mb-8 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <IconArrowLeft size={16} aria-hidden="true" />
              Back to Learn
            </Link>

            {article.meta.cluster && (
              <p className="mkt-eyebrow mb-4">{article.meta.cluster}</p>
            )}

            <h1 className="mkt-h2 mb-5">{article.meta.title}</h1>

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
              <ul className="mt-5 flex flex-wrap gap-2">
                {article.meta.tags.map((tag) => (
                  <li key={tag} className="mkt-chip">
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </header>

        {/* Article content */}
        <article className="mkt-container py-12">
          <div className="mx-auto max-w-3xl">
            {article.meta.description && (
              <p className="mkt-lead mb-10 border-b border-border-primary pb-8">
                {article.meta.description}
              </p>
            )}

            <div className="blog-content">
              <MarkdownRenderer content={article.content} />
            </div>

            {/* Related articles from same cluster */}
            {relatedArticles.length > 0 && (
              <div className="mt-16 border-t border-border-primary pt-8">
                <h2 className="mkt-h3 mb-4">Continue reading</h2>
                <div className="space-y-3">
                  {relatedArticles.map((related) => (
                    <Panel
                      as={Link}
                      key={related.slug}
                      href={`/learn/${related.slug}`}
                      interactive
                      padding="none"
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary">
                          {related.meta.title}
                        </p>
                        {related.meta.isPillar && (
                          <p className="mkt-eyebrow mt-1">Pillar guide</p>
                        )}
                      </div>
                      <IconArrowRight
                        size={16}
                        aria-hidden="true"
                        className="flex-shrink-0 text-text-muted"
                      />
                    </Panel>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>

        <FinalCTASection />
      </div>
    </>
  );
}

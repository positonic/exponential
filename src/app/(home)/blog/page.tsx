import Link from "next/link";
import type { Metadata } from "next";
import { getAllBlogPosts } from "~/lib/blog/getBlogPost";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

const blogUrl = `${getPublicBaseUrlFromEnv()}/blog`;

export const metadata: Metadata = {
  title: `Blog | ${PRODUCT_NAME}`,
  description:
    "Insights on productivity, AI-powered project management, and building products as a solo founder.",
  alternates: {
    canonical: blogUrl,
    types: {
      'application/rss+xml': '/blog/feed.xml',
    },
  },
  openGraph: {
    type: 'website',
    title: `Blog | ${PRODUCT_NAME}`,
    description: "Insights on productivity, AI-powered project management, and building products as a solo founder.",
    url: blogUrl,
    siteName: PRODUCT_NAME,
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Blog | ${PRODUCT_NAME}`,
    description: "Insights on productivity, AI-powered project management, and building products as a solo founder.",
    images: ['/og-image.png'],
  },
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPage() {
  const posts = await getAllBlogPosts();

  return (
    <div>
      <section className="pb-12 md:pb-16">
        <div className="mkt-container pt-16 text-center md:pt-24">
          <h1 className="mkt-h1 mkt-rise mb-6">Blog</h1>
          <p className="mkt-lead mkt-rise mx-auto max-w-2xl">
            Insights on productivity, AI, and building products.
          </p>
        </div>
      </section>

      <div className="mkt-container pb-24">
        <div className="mx-auto max-w-3xl">
          {posts.length === 0 ? (
            <p className="mkt-body">No posts yet. Check back soon.</p>
          ) : (
            <div className="space-y-10">
              {posts.map((post) => (
                <article
                  key={post.slug}
                  className="group border-b border-border-primary pb-10 last:border-b-0"
                >
                  <Link href={`/blog/${post.slug}`} className="block">
                    <time className="text-sm text-text-muted">
                      {formatDate(post.meta.date)}
                    </time>
                    <h2 className="mkt-h3 mt-2 transition-colors group-hover:text-link">
                      {post.meta.title}
                    </h2>
                    {post.meta.description && (
                      <p className="mkt-body mt-2">{post.meta.description}</p>
                    )}
                  </Link>
                  {post.meta.tags && post.meta.tags.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {post.meta.tags.map((tag) => (
                        <li key={tag} className="mkt-chip">
                          {tag}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

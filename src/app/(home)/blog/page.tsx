import Link from "next/link";
import { Title, Text, Badge } from "@mantine/core";
import type { Metadata } from "next";
import { getAllBlogPosts } from "~/lib/blog/getBlogPost";

export const metadata: Metadata = {
  title: "Blog | Exponential",
  description:
    "Insights on productivity, AI-powered project management, and building products as a solo founder.",
  alternates: {
    canonical: "https://www.exponential.im/blog",
    types: {
      'application/rss+xml': '/blog/feed.xml',
    },
  },
  openGraph: {
    type: 'website',
    title: "Blog | Exponential",
    description: "Insights on productivity, AI-powered project management, and building products as a solo founder.",
    url: "https://www.exponential.im/blog",
    siteName: "Exponential",
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Blog | Exponential",
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
            Blog
          </Title>
          <Text size="lg" className="text-text-secondary">
            Insights on productivity, AI, and building products.
          </Text>
        </header>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-16">

      {posts.length === 0 ? (
        <Text className="text-text-muted">No posts yet. Check back soon!</Text>
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
                <Title
                  order={2}
                  className="mt-2 transition-colors group-hover:text-brand-primary"
                >
                  {post.meta.title}
                </Title>
                {post.meta.description && (
                  <Text className="mt-2 leading-7 text-text-secondary">
                    {post.meta.description}
                  </Text>
                )}
              </Link>
              {post.meta.tags && post.meta.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {post.meta.tags.map((tag) => (
                    <Badge key={tag} variant="light" size="sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

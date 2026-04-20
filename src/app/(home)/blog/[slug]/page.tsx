import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBlogPost, getAllBlogSlugs } from "~/lib/blog/getBlogPost";
import { BlogContent } from "~/app/_components/blog/BlogContent";
import { auth } from "~/server/auth";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllBlogSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return { title: "Post Not Found" };
  }

  const url = `${getPublicBaseUrlFromEnv()}/blog/${slug}`;

  return {
    title: `${post.meta.title} | ${PRODUCT_NAME}`,
    description: post.meta.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'article',
      title: post.meta.title,
      description: post.meta.description,
      url,
      siteName: PRODUCT_NAME,
      publishedTime: new Date(post.meta.date).toISOString(),
      authors: post.meta.author ? [post.meta.author] : undefined,
      tags: post.meta.tags,
      images: post.meta.coverImage
        ? [{ url: post.meta.coverImage, width: 1200, height: 630 }]
        : [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.meta.title,
      description: post.meta.description,
      images: post.meta.coverImage ? [post.meta.coverImage] : ['/og-image.png'],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const [post, session] = await Promise.all([getBlogPost(slug), auth()]);

  if (!post) {
    notFound();
  }

  const baseUrl = getPublicBaseUrlFromEnv();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.meta.title,
    description: post.meta.description,
    datePublished: new Date(post.meta.date).toISOString(),
    author: {
      "@type": post.meta.author === `${PRODUCT_NAME} Team` ? "Organization" : "Person",
      name: post.meta.author ?? `${PRODUCT_NAME} Team`,
    },
    publisher: {
      "@type": "Organization",
      name: PRODUCT_NAME,
      url: baseUrl,
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/expo-logo-20.png`,
      },
    },
    url: `${baseUrl}/blog/${slug}`,
    mainEntityOfPage: `${baseUrl}/blog/${slug}`,
    ...(post.meta.coverImage ? { image: post.meta.coverImage } : {}),
    ...(post.meta.tags ? { keywords: post.meta.tags.join(", ") } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogContent
        post={post}
        isLoggedIn={!!session?.user}
        userId={session?.user?.id}
      />
    </>
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBlogPost, getAllBlogSlugs } from "~/lib/blog/getBlogPost";
import { BlogContent } from "~/app/_components/blog/BlogContent";
import { auth } from "~/server/auth";

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

  return {
    title: `${post.meta.title} | Exponential Blog`,
    description: post.meta.description,
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const [post, session] = await Promise.all([getBlogPost(slug), auth()]);

  if (!post) {
    notFound();
  }

  return (
    <BlogContent
      post={post}
      isLoggedIn={!!session?.user}
      userId={session?.user?.id}
    />
  );
}

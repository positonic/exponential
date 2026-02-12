"use client";

import Link from "next/link";
import { Title, Text, Badge } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type { BlogPost } from "~/lib/blog/types";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

interface BlogContentProps {
  post: BlogPost;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BlogContent({ post }: BlogContentProps) {
  return (
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
            href="/blog"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <IconArrowLeft size={16} />
            Back to blog
          </Link>

          <Title order={1} className="mb-4 text-3xl md:text-4xl">
            {post.meta.title}
          </Title>

          <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
            <time dateTime={post.meta.date}>
              {formatDate(post.meta.date)}
            </time>
            {post.meta.author && (
              <>
                <span>·</span>
                <span>{post.meta.author}</span>
              </>
            )}
          </div>

          {post.meta.tags && post.meta.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.meta.tags.map((tag) => (
                <Badge key={tag} variant="light" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Post content */}
      <article className="mx-auto max-w-3xl px-6 py-12">
        {post.meta.description && (
          <Text
            size="lg"
            className="mb-10 border-b border-border-primary pb-8 leading-7 text-text-secondary"
          >
            {post.meta.description}
          </Text>
        )}

        <div className="blog-content">
          <MarkdownRenderer content={post.content} />
        </div>
      </article>
    </div>
  );
}

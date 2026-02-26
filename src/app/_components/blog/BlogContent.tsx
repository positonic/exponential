"use client";

import Link from "next/link";
import { Title, Text, Badge } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type { BlogPost } from "~/lib/blog/types";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { CommentThread } from "~/plugins/okr/client/components/CommentThread";
import { CommentInput } from "~/plugins/okr/client/components/CommentInput";
import { api } from "~/trpc/react";

interface BlogContentProps {
  post: BlogPost;
  isLoggedIn?: boolean;
  userId?: string;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BlogContent({ post, isLoggedIn, userId }: BlogContentProps) {
  const utils = api.useUtils();
  const slug = post.slug;

  const { data: comments = [] } = api.blogComment.getComments.useQuery(
    { slug },
    { enabled: !!isLoggedIn },
  );

  const addCommentMutation = api.blogComment.addComment.useMutation({
    onSuccess: () => void utils.blogComment.getComments.invalidate({ slug }),
  });

  const deleteCommentMutation = api.blogComment.deleteComment.useMutation({
    onSuccess: () => void utils.blogComment.getComments.invalidate({ slug }),
  });

  const updateCommentMutation = api.blogComment.updateComment.useMutation({
    onSuccess: () => void utils.blogComment.getComments.invalidate({ slug }),
  });

  const handleAddComment = async (content: string) => {
    await addCommentMutation.mutateAsync({ slug, content });
  };

  const handleDeleteComment = (commentId: string) => {
    deleteCommentMutation.mutate({ commentId });
  };

  const handleEditComment = async (commentId: string, newContent: string) => {
    await updateCommentMutation.mutateAsync({ commentId, content: newContent });
  };

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

        {/* Discussion */}
        {isLoggedIn && (
          <div className="mt-16 border-t border-border-primary pt-8">
            <Text className="text-text-primary font-semibold" size="sm" mb="md">
              Discussion
            </Text>

            <CommentThread
              comments={comments.map((c) => ({
                ...c,
                createdAt: new Date(c.createdAt),
                updatedAt: new Date(c.updatedAt),
              }))}
              onDeleteComment={handleDeleteComment}
              onEditComment={handleEditComment}
              currentUserId={userId}
            />

            <CommentInput
              onSubmit={handleAddComment}
              isSubmitting={addCommentMutation.isPending}
              placeholder="Leave a comment..."
            />
          </div>
        )}

        {/* CTA for non-logged-in users */}
        {!isLoggedIn && (
          <div className="mt-16 overflow-hidden rounded-2xl bg-cta-gradient p-8 text-center md:p-12">
            <Title order={3} className="mb-3 text-2xl text-white md:text-3xl">
              Stop managing. Start steering.
            </Title>
            <Text className="mx-auto mb-8 max-w-lg text-white/80">
              Exponential gives you an AI copilot that runs your
              productivity system — so you stay focused on the work that
              matters.
            </Text>

            <div className="mx-auto mb-8 flex max-w-md flex-col gap-3 text-left text-sm text-white/90">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">&#10003;</span>
                <span>AI-powered daily planning that adapts to your priorities</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">&#10003;</span>
                <span>Goals, outcomes, and projects linked in one system</span>
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
        )}
      </article>
    </div>
  );
}

"use client";

import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import type { BlogPost } from "~/lib/blog/types";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { CommentThread } from "~/app/_components/shared/CommentThread";
import { CommentInput } from "~/app/_components/shared/CommentInput";
import { api } from "~/trpc/react";
import { FinalCTASection } from "~/app/_components/home/FinalCTASection";

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
      <header className="mkt-container pt-12 md:pt-16">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/blog"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <IconArrowLeft size={16} aria-hidden="true" />
            Back to blog
          </Link>

          <h1 className="mkt-h2 mb-5">{post.meta.title}</h1>

          <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
            <time dateTime={post.meta.date}>{formatDate(post.meta.date)}</time>
            {post.meta.author && (
              <>
                <span>·</span>
                <span>{post.meta.author}</span>
              </>
            )}
          </div>

          {post.meta.tags && post.meta.tags.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {post.meta.tags.map((tag) => (
                <li key={tag} className="mkt-chip">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {/* Post content */}
      <article className="mkt-container py-12">
        <div className="mx-auto max-w-3xl">
          {post.meta.description && (
            <p className="mkt-lead mb-10 border-b border-border-primary pb-8">
              {post.meta.description}
            </p>
          )}

          <div className="blog-content">
            <MarkdownRenderer content={post.content} />
          </div>

          {/* Discussion */}
          {isLoggedIn && (
            <div className="mt-16 border-t border-border-primary pt-8">
              <h2 className="mkt-h3 mb-4">Discussion</h2>

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
        </div>
      </article>

      {/* Closing call to action for visitors who are not signed in */}
      {!isLoggedIn && <FinalCTASection />}
    </div>
  );
}

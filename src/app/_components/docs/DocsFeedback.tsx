"use client";

import { useEffect, useState } from "react";
import { Button, Textarea } from "@mantine/core";
import { IconThumbDown, IconThumbUp } from "@tabler/icons-react";
import { api } from "~/trpc/react";

type Step = "ask" | "comment" | "done";

const storageKey = (path: string) => `docs-feedback:${path}`;

function readAnswered(path: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(path)) !== null;
  } catch {
    return false;
  }
}

function markAnswered(path: string) {
  try {
    window.localStorage.setItem(storageKey(path), new Date().toISOString());
  } catch {
    // Storage blocked: the reader may be asked again next visit, which is fine.
  }
}

/**
 * "Was this helpful?" at the foot of every docs page. Works signed out. One
 * click records the answer; an optional comment can follow. The browser
 * remembers that this page was answered so the question does not repeat.
 */
export function DocsFeedback({ path }: { path: string }) {
  const [step, setStep] = useState<Step>("ask");
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const submit = api.docs.submitFeedback.useMutation();
  const addComment = api.docs.addFeedbackComment.useMutation();

  useEffect(() => {
    setStep(readAnswered(path) ? "done" : "ask");
    setHelpful(null);
    setFeedbackId(null);
    setComment("");
  }, [path]);

  const answer = async (value: boolean) => {
    setHelpful(value);
    setStep("comment");
    markAnswered(path);
    try {
      const created = await submit.mutateAsync({ path, helpful: value });
      setFeedbackId(created.id);
    } catch {
      // Recorded locally as answered either way; a failed write is not worth interrupting the reader.
    }
  };

  const sendComment = async () => {
    const text = comment.trim();
    if (text && feedbackId) {
      try {
        await addComment.mutateAsync({ id: feedbackId, comment: text });
      } catch {
        // See above.
      }
    }
    setStep("done");
  };

  return (
    <section
      aria-label="Page feedback"
      className="mt-10 rounded-lg border border-border-primary bg-surface-secondary px-4 py-4"
    >
      {step === "ask" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-text-secondary">Was this page helpful?</span>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconThumbUp size={14} />}
              onClick={() => void answer(true)}
            >
              Yes
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconThumbDown size={14} />}
              onClick={() => void answer(false)}
            >
              No
            </Button>
          </div>
        </div>
      )}

      {step === "comment" && (
        <div className="flex flex-col gap-3">
          <span className="text-sm text-text-secondary">
            {helpful ? "Thanks! Anything we could make clearer?" : "Thanks. What were you looking for, or what was wrong?"}
          </span>
          <Textarea
            aria-label="Optional comment"
            placeholder="Optional"
            autosize
            minRows={2}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
          />
          <div className="flex gap-2">
            <Button size="xs" onClick={() => void sendComment()} loading={addComment.isPending}>
              Send
            </Button>
            <Button size="xs" variant="subtle" onClick={() => setStep("done")}>
              Skip
            </Button>
          </div>
        </div>
      )}

      {step === "done" && <span className="text-sm text-text-muted">Thanks for the feedback.</span>}
    </section>
  );
}

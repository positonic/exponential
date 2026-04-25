"use client";

import { useState, useEffect, memo } from "react";
import {
  Rating,
  Text,
  Textarea,
  Button,
  Group,
  Collapse,
  Paper,
} from "@mantine/core";
import { IconCheck, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface AgentMessageFeedbackProps {
  aiInteractionId: string;
  conversationId?: string;
  agentName?: string;
}

const RATED_MESSAGES_KEY = "agent-feedback-rated";

function getRatedMessages(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(RATED_MESSAGES_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function markAsRated(interactionId: string) {
  if (typeof window === "undefined") return;
  const rated = getRatedMessages();
  rated.add(interactionId);
  // Keep only last 100 to prevent unbounded growth
  const arr = Array.from(rated).slice(-100);
  localStorage.setItem(RATED_MESSAGES_KEY, JSON.stringify(arr));
}

export const AgentMessageFeedback = memo(function AgentMessageFeedback({
  aiInteractionId,
  conversationId: _conversationId,
  agentName: _agentName,
}: AgentMessageFeedbackProps) {
  const [rating, setRating] = useState(0);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [improvementSuggestion, setImprovementSuggestion] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  useEffect(() => {
    setAlreadyRated(getRatedMessages().has(aiInteractionId));
  }, [aiInteractionId]);

  const submitFeedback = api.feedback.submitAgentFeedback.useMutation({
    onSuccess: () => {
      markAsRated(aiInteractionId);
      setSubmitted(true);
    },
  });

  const handleRatingChange = (value: number) => {
    setRating(value);
    // Auto-expand comment for low ratings
    if (value <= 2) {
      setShowComment(true);
    }
  };

  const handleSubmit = () => {
    if (rating === 0) return;

    submitFeedback.mutate({
      aiInteractionId,
      rating,
      comment: comment || undefined,
      improvementSuggestion: improvementSuggestion || undefined,
    });
  };

  // Quick submit without comment for high ratings
  const handleQuickSubmit = () => {
    if (rating === 0) return;

    submitFeedback.mutate({
      aiInteractionId,
      rating,
    });
  };

  if (alreadyRated || submitted) {
    if (submitted) {
      return (
        <Group gap="xs" className="mt-2 opacity-60">
          <IconCheck size={14} className="text-brand-success" />
          <Text size="xs" className="text-text-muted">
            Thanks for your feedback!
          </Text>
        </Group>
      );
    }
    return null;
  }

  return (
    <div className="mt-2">
      <Group gap="xs" align="center">
        <Text size="xs" className="text-text-muted">
          Rate this response:
        </Text>
        <Rating
          value={rating}
          onChange={handleRatingChange}
          size="sm"
          fractions={1}
        />
        {rating > 0 && !showComment && (
          <>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={handleQuickSubmit}
              loading={submitFeedback.isPending}
            >
              Submit
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setShowComment(true)}
              rightSection={<IconChevronDown size={12} />}
            >
              Add comment
            </Button>
          </>
        )}
        {showComment && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => setShowComment(false)}
            rightSection={<IconChevronUp size={12} />}
          >
            Hide
          </Button>
        )}
      </Group>

      <Collapse in={showComment}>
        <Paper className="mt-2 space-y-3 border border-border-primary bg-surface-secondary p-3">
          <Textarea
            placeholder="Any comments about this response? (optional)"
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
            size="xs"
            minRows={2}
            autosize
          />

          {rating <= 3 && (
            <Textarea
              placeholder="What could have made this response better?"
              value={improvementSuggestion}
              onChange={(e) => setImprovementSuggestion(e.currentTarget.value)}
              size="xs"
              minRows={2}
              autosize
              description="This helps us improve the agent"
            />
          )}

          <Group justify="flex-end">
            <Button
              size="xs"
              onClick={handleSubmit}
              loading={submitFeedback.isPending}
              disabled={rating === 0}
            >
              Submit Feedback
            </Button>
          </Group>
        </Paper>
      </Collapse>
    </div>
  );
});

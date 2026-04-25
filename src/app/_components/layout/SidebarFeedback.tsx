"use client";

import {
  Button,
  Modal,
  Textarea,
  Radio,
  Stack,
  Text,
  Title,
  Group,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { IconMessageReport, IconSend } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

interface SidebarFeedbackProps {
  onClose?: () => void;
  /** When provided, the component is externally controlled (no trigger button rendered) */
  opened?: boolean;
  onOpenChange?: (opened: boolean) => void;
}

export function SidebarFeedback({ onClose, opened: externalOpened, onOpenChange }: SidebarFeedbackProps) {
  const [internalOpened, { open: internalOpen, close: internalClose }] = useDisclosure(false);
  const [rating, setRating] = useState<string>("");
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const isControlled = externalOpened !== undefined;
  const opened = isControlled ? externalOpened : internalOpened;
  const open = isControlled ? () => onOpenChange?.(true) : internalOpen;
  const close = isControlled ? () => onOpenChange?.(false) : internalClose;

  const submitFeedback = api.feedback.submitCalendarFeedback.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      notifications.show({
        title: "Thank you!",
        message: "Your feedback has been submitted successfully.",
        color: "green",
      });
      setTimeout(() => {
        close();
        // Reset form after closing
        setTimeout(() => {
          setRating("");
          setFeedback("");
          setSubmitted(false);
        }, 300);
      }, 2000);
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to submit feedback. Please try again.",
        color: "red",
      });
    },
  });

  const handleSubmit = () => {
    if (!rating || !feedback.trim()) {
      notifications.show({
        title: "Missing Information",
        message: "Please provide both a rating and feedback.",
        color: "yellow",
      });
      return;
    }

    submitFeedback.mutate({
      feature: "general",
      rating: parseInt(rating),
      feedback: feedback.trim(),
      metadata: {
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        timestamp: new Date().toISOString(),
      },
    });
  };

  const handleOpen = () => {
    open();
    onClose?.();
  };

  return (
    <>
      {!isControlled && (
        <button
          onClick={handleOpen}
          className="text-text-secondary transition-colors hover:text-text-primary"
          aria-label="Give Feedback"
        >
          <IconMessageReport size={20} />
        </button>
      )}

      <Modal
        opened={opened}
        onClose={close}
        title={<Title order={4}>Share Your Feedback</Title>}
        size="md"
        centered
      >
        {submitted ? (
          <Stack align="center" py="xl">
            <Text size="lg" fw={500}>
              Thank you for your feedback!
            </Text>
            <Text size="sm">We appreciate your help in improving the app.</Text>
          </Stack>
        ) : (
          <Stack gap="lg">
            <div>
              <Text size="sm" fw={500} mb="xs">
                How would you rate your overall experience?
              </Text>
              <Radio.Group
                value={rating}
                onChange={setRating}
                name="generalRating"
              >
                <Stack gap="xs">
                  <Radio value="5" label="Excellent - Love it!" />
                  <Radio value="4" label="Good - Works well" />
                  <Radio value="3" label="Okay - Could be better" />
                  <Radio value="2" label="Poor - Having issues" />
                  <Radio value="1" label="Very Poor - Major problems" />
                </Stack>
              </Radio.Group>
            </div>

            <div>
              <Text size="sm" fw={500} mb="xs">
                What&apos;s on your mind?
              </Text>
              <Textarea
                placeholder="Share your thoughts, suggestions, bug reports, or feature requests..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                minRows={4}
                maxRows={8}
                autosize
              />
            </div>

            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                onClick={close}
                disabled={submitFeedback.isPending}
              >
                Cancel
              </Button>
              <Button
                leftSection={<IconSend size={16} />}
                onClick={handleSubmit}
                loading={submitFeedback.isPending}
              >
                Submit Feedback
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}

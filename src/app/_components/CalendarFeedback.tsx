"use client";

import { Button, Modal, Textarea, Radio, Group, Stack, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { IconMessageCircle, IconSend } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

export function CalendarFeedback() {
  const [opened, { open, close }] = useDisclosure(false);
  const [rating, setRating] = useState<string>("");
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);

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
      feature: "calendar_integration",
      rating: parseInt(rating),
      feedback: feedback.trim(),
      metadata: {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
    });
  };

  return (
    <>
      <Button
        variant="subtle"
        size="sm"
        leftSection={<IconMessageCircle size={16} />}
        onClick={open}
        color="gray"
      >
        Give Feedback
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={
          <Title order={4}>Calendar Integration Feedback</Title>
        }
        size="md"
        centered
      >
        {submitted ? (
          <Stack align="center" py="xl">
            <Text size="lg" fw={500} c="green">
              Thank you for your feedback!
            </Text>
            <Text size="sm" c="dimmed">
              We appreciate your help in improving this feature.
            </Text>
          </Stack>
        ) : (
          <Stack gap="lg">
            <div>
              <Text size="sm" fw={500} mb="xs">
                How would you rate the calendar integration experience?
              </Text>
              <Radio.Group
                value={rating}
                onChange={setRating}
                name="calendarRating"
              >
                <Stack gap="xs">
                  <Radio value="5" label="Excellent - Works perfectly!" />
                  <Radio value="4" label="Good - Minor issues only" />
                  <Radio value="3" label="Okay - Some problems" />
                  <Radio value="2" label="Poor - Major issues" />
                  <Radio value="1" label="Very Poor - Doesn't work" />
                </Stack>
              </Radio.Group>
            </div>

            <div>
              <Text size="sm" fw={500} mb="xs">
                Please share your experience and any suggestions:
              </Text>
              <Textarea
                placeholder="What worked well? What could be improved? Any bugs or issues?"
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
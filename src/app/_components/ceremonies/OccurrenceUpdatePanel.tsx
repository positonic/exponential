"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Checkbox, Group, Paper, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconPencil, IconSend, IconSparkles } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

/**
 * The participant's own async-first update on an occurrence page (ADR-0059,
 * V3). Renders only for ceremony kinds that have per-person questions and
 * only for people who take part; everyone else sees nothing here.
 *
 * "Draft from my activity" fills empty answers from what the server found in
 * their Actions, ticket moves and commits — it never overwrites something
 * already written, because a draft losing someone's typed answer is worse
 * than no draft at all.
 */
export function OccurrenceUpdatePanel({
  workspaceId,
  occurrenceId,
}: {
  workspaceId: string;
  occurrenceId: string;
}) {
  const utils = api.useUtils();
  const queryKey = { workspaceId, occurrenceId };
  const { data } = api.ceremony.myOccurrenceUpdate.useQuery(queryKey);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState(false);
  const [editing, setEditing] = useState(false);
  // Server state seeds the fields exactly once, on first load. Every later
  // refetch — React Query refetches on window focus past its 30s staleTime —
  // must leave the fields alone: re-seeding from the server would throw away
  // whatever the participant has typed since, which is the one thing this
  // panel is not allowed to do. Writes set the fields from their own result.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !data) return;
    hydrated.current = true;
    setAnswers(data.answers);
    setBlocked(data.flaggedBlocker);
  }, [data]);

  const invalidate = () => utils.ceremony.myOccurrenceUpdate.invalidate(queryKey);
  const draft = api.ceremony.draftMyOccurrenceUpdate.useMutation({
    onSuccess: async (res) => {
      // Only fill what is still empty.
      setAnswers((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(res.draftAnswers)) {
          if (!next[key]?.trim() && value.trim()) next[key] = value;
        }
        return next;
      });
      const filled = Object.values(res.draftAnswers).filter((v) => v.trim().length > 0).length;
      notifications.show({
        title: filled > 0 ? "Drafted from your activity" : "Nothing to draft",
        message:
          filled > 0
            ? "Edit anything that isn't right, then submit."
            : "No actions, ticket moves or commits found for you since the last occurrence.",
        color: filled > 0 ? "green" : "yellow",
      });
      await invalidate();
    },
    onError: (e) => notifications.show({ title: "Couldn't draft your update", message: e.message, color: "red" }),
  });
  const save = api.ceremony.saveMyOccurrenceUpdate.useMutation({
    onSuccess: async (res) => {
      setEditing(false);
      setAnswers(res.answers);
      setBlocked(res.flaggedBlocker);
      notifications.show({
        title: res.submittedAt ? "Update submitted" : "Update saved",
        message: res.submittedAt ? "Your answers are part of this occurrence." : "Saved as a draft — submit when ready.",
        color: "green",
      });
      await invalidate();
    },
    onError: (e) => notifications.show({ title: "Couldn't save your update", message: e.message, color: "red" }),
  });

  const questions = data?.questions ?? [];
  const submitted = Boolean(data?.submittedAt);
  const hasAnything = useMemo(() => Object.values(answers).some((v) => v.trim().length > 0), [answers]);

  if (!data || questions.length === 0 || !data.isParticipant) return null;

  const readOnly = submitted && !editing;
  return (
    <Paper withBorder radius="md" p="lg" data-testid="occurrence-update-panel">
      <Group justify="space-between" align="center" mb="sm">
        <Group gap="xs">
          <Text fw={600}>Your update</Text>
          {submitted ? (
            <Badge variant="light" color="green">
              submitted {new Date(data.submittedAt!).toLocaleString()}
            </Badge>
          ) : (
            <Badge variant="light">not submitted</Badge>
          )}
        </Group>
        {readOnly ? (
          <Button
            variant="default"
            size="compact-sm"
            leftSection={<IconPencil size={14} />}
            onClick={() => setEditing(true)}
            data-testid="edit-occurrence-update"
          >
            Edit
          </Button>
        ) : (
          <Button
            variant="default"
            size="compact-sm"
            leftSection={<IconSparkles size={14} />}
            loading={draft.isPending}
            onClick={() => draft.mutate(queryKey)}
            data-testid="draft-occurrence-update"
          >
            Draft from my activity
          </Button>
        )}
      </Group>

      <Stack gap="md">
        {questions.map((question) => (
          <div key={question.key}>
            <Text size="sm" fw={500} mb={4}>
              {question.prompt}
            </Text>
            {readOnly ? (
              answers[question.key]?.trim() ? (
                <MarkdownRenderer content={answers[question.key]!} variant="compact" />
              ) : (
                <Text size="sm" className="text-text-muted">
                  Nothing said.
                </Text>
              )
            ) : (
              <MarkdownInput
                value={answers[question.key] ?? ""}
                onChange={(value) => setAnswers((current) => ({ ...current, [question.key]: value }))}
                placeholder={question.placeholder}
                minRows={2}
              />
            )}
          </div>
        ))}
      </Stack>

      {readOnly
        ? data.flaggedBlocker && (
            <Group gap={6} mt="md">
              <IconAlertTriangle size={14} className="text-text-muted" />
              <Text size="sm" className="text-text-muted">
                You flagged a blocker, so this occurrence won&apos;t be proposed for a skip.
              </Text>
            </Group>
          )
        : (
          <Group justify="space-between" align="center" mt="md">
            <Checkbox
              label="I'm blocked on something"
              description="Keeps the standup on the calendar even if the agenda comes up empty"
              checked={blocked}
              onChange={(e) => setBlocked(e.currentTarget.checked)}
              data-testid="flag-blocker"
            />
            <Group gap="xs">
              <Button
                variant="subtle"
                loading={save.isPending && !save.variables?.submit}
                onClick={() => save.mutate({ ...queryKey, answers, flaggedBlocker: blocked })}
              >
                Save draft
              </Button>
              <Button
                leftSection={<IconSend size={14} />}
                disabled={!hasAnything}
                loading={save.isPending && Boolean(save.variables?.submit)}
                onClick={() => save.mutate({ ...queryKey, answers, flaggedBlocker: blocked, submit: true })}
                data-testid="submit-occurrence-update"
              >
                {submitted ? "Resubmit" : "Submit"}
              </Button>
            </Group>
          </Group>
        )}
    </Paper>
  );
}

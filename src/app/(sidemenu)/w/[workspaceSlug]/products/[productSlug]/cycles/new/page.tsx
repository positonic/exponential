"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

export default function NewCyclePage() {
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [cycleGoal, setCycleGoal] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createCycle = api.product.cycle.create.useMutation({
    onSuccess: async (cycle) => {
      if (workspaceId) {
        await utils.product.cycle.list.invalidate({ workspaceId });
      }
      if (workspace) {
        router.push(
          `/w/${workspace.slug}/products/${productSlug}/cycles/${cycle.id}`,
        );
      }
    },
    onError: (err) => setError(err.message),
  });

  if (!workspace || !workspaceId) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createCycle.mutate({
      workspaceId,
      name: name.trim(),
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
      cycleGoal: cycleGoal.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <Stack gap="lg" maw={640}>
      <div>
        <Title order={2} className="text-text-primary">
          New cycle
        </Title>
        <Text className="text-text-muted">
          A cycle is a time-boxed iteration. Tickets assigned to a cycle are
          tracked for velocity and burndown.
        </Text>
      </div>

      <Card className="border border-border-primary bg-surface-secondary">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="e.g. Sprint 12"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              maxLength={120}
            />
            <Group grow>
              <DateInput
                label="Start date"
                value={startDate}
                onChange={(v) =>
                  setStartDate(v ? (typeof v === "string" ? new Date(v) : v) : null)
                }
                clearable
              />
              <DateInput
                label="End date"
                value={endDate}
                onChange={(v) =>
                  setEndDate(v ? (typeof v === "string" ? new Date(v) : v) : null)
                }
                clearable
              />
            </Group>
            <Textarea
              label="Cycle goal"
              placeholder="What do we want to achieve in this cycle?"
              value={cycleGoal}
              onChange={(e) => setCycleGoal(e.currentTarget.value)}
              autosize
              minRows={2}
            />
            <Textarea
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              autosize
              minRows={2}
            />
            {error && (
              <Text size="sm" className="text-text-error">
                {error}
              </Text>
            )}
            <Group justify="flex-end">
              <Button
                variant="subtle"
                component={Link}
                href={`/w/${workspace.slug}/products/${productSlug}/cycles`}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="brand"
                loading={createCycle.isPending}
                disabled={!name.trim()}
              >
                Create cycle
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}

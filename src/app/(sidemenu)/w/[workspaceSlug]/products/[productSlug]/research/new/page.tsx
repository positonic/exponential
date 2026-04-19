"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

const TYPE_OPTIONS = [
  { value: "INTERVIEW", label: "Interview" },
  { value: "DESK_RESEARCH", label: "Desk research" },
  { value: "EXPERIMENT", label: "Experiment" },
  { value: "ANALYTICS", label: "Analytics" },
  { value: "SURVEY", label: "Survey" },
  { value: "OBSERVATION", label: "Observation" },
  { value: "OTHER", label: "Other" },
];

type ResearchType =
  | "INTERVIEW"
  | "DESK_RESEARCH"
  | "EXPERIMENT"
  | "ANALYTICS"
  | "SURVEY"
  | "OBSERVATION"
  | "OTHER";

export default function NewResearchPage() {
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const [title, setTitle] = useState("");
  const [type, setType] = useState<ResearchType>("OTHER");
  const [conductedAt, setConductedAt] = useState<Date | null>(null);
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createResearch = api.product.research.create.useMutation({
    onSuccess: async (research) => {
      if (product?.id) {
        await utils.product.research.list.invalidate({ productId: product.id });
      }
      if (workspace) {
        router.push(
          `/w/${workspace.slug}/products/${productSlug}/research/${research.id}`,
        );
      }
    },
    onError: (err) => setError(err.message),
  });

  if (!workspace || !product) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createResearch.mutate({
      productId: product.id,
      title: title.trim(),
      type,
      conductedAt: conductedAt ?? undefined,
      participants: participants.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Stack gap="lg" maw={720}>
      <div>
        <Title order={2} className="text-text-primary">
          New research
        </Title>
      </div>

      <Card className="border border-border-primary bg-surface-secondary">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <TextInput
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              required
              maxLength={300}
            />
            <Group grow>
              <Select
                label="Type"
                data={TYPE_OPTIONS}
                value={type}
                onChange={(v) => v && setType(v as ResearchType)}
              />
              <DateInput
                label="Conducted at"
                value={conductedAt}
                onChange={(v) =>
                  setConductedAt(v ? (typeof v === "string" ? new Date(v) : v) : null)
                }
                clearable
              />
            </Group>
            <TextInput
              label="Participants"
              placeholder="e.g. 3 users from cohort A"
              value={participants}
              onChange={(e) => setParticipants(e.currentTarget.value)}
            />
            <Textarea
              label="Notes"
              placeholder="Raw notes, summary, or link to transcript..."
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
              autosize
              minRows={4}
            />
            {error && (
              <Text size="sm" className="text-text-error">
                {error}
              </Text>
            )}
            <Group justify="flex-end">
              <Button
                variant="subtle"
                component="a"
                href={`/w/${workspace.slug}/products/${productSlug}/research`}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="brand"
                loading={createResearch.isPending}
                disabled={!title.trim()}
              >
                Create research
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}

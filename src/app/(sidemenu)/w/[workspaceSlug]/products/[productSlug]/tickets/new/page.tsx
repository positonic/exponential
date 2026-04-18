"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

const TYPE_OPTIONS = [
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "CHORE", label: "Chore" },
  { value: "IMPROVEMENT", label: "Improvement" },
  { value: "SPIKE", label: "Spike" },
  { value: "RESEARCH", label: "Research" },
];

const STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "NEEDS_REFINEMENT", label: "Needs Refinement" },
  { value: "READY_TO_PLAN", label: "Ready to Plan" },
  { value: "COMMITTED", label: "Committed" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "QA", label: "QA" },
  { value: "DONE", label: "Done" },
  { value: "DEPLOYED", label: "Deployed" },
  { value: "ARCHIVED", label: "Archived" },
];

type TicketType =
  | "BUG"
  | "FEATURE"
  | "CHORE"
  | "IMPROVEMENT"
  | "SPIKE"
  | "RESEARCH";

type TicketStatus =
  | "BACKLOG"
  | "NEEDS_REFINEMENT"
  | "READY_TO_PLAN"
  | "COMMITTED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "QA"
  | "DONE"
  | "DEPLOYED"
  | "ARCHIVED";

export default function NewTicketPage() {
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: features } = api.product.feature.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const { data: cycles } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<TicketType>("FEATURE");
  const [status, setStatus] = useState<TicketStatus>("BACKLOG");
  const [points, setPoints] = useState<number | "">("");
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [designUrl, setDesignUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createTicket = api.product.ticket.create.useMutation({
    onSuccess: async (ticket) => {
      if (product?.id) {
        await utils.product.ticket.list.invalidate({ productId: product.id });
      }
      if (workspace) {
        router.push(
          `/w/${workspace.slug}/products/${productSlug}/tickets/${ticket.id}`,
        );
      }
    },
    onError: (err) => setError(err.message),
  });

  if (!workspace || !product) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createTicket.mutate({
      productId: product.id,
      title: title.trim(),
      body: body.trim() || undefined,
      type,
      status,
      points: typeof points === "number" ? points : undefined,
      featureId: featureId ?? undefined,
      cycleId: cycleId ?? undefined,
      branchName: branchName.trim() || undefined,
      prUrl: prUrl.trim() || undefined,
      designUrl: designUrl.trim() || undefined,
    });
  };

  return (
    <Stack gap="lg" maw={760}>
      <div>
        <Title order={2} className="text-text-primary">
          New ticket
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
            <Textarea
              label="Body (markdown)"
              description="Headings, acceptance criteria, repro steps, etc."
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
              autosize
              minRows={4}
            />
            <Group grow>
              <Select
                label="Type"
                data={TYPE_OPTIONS}
                value={type}
                onChange={(v) => v && setType(v as TicketType)}
              />
              <Select
                label="Status"
                data={STATUS_OPTIONS}
                value={status}
                onChange={(v) => v && setStatus(v as TicketStatus)}
              />
              <NumberInput
                label="Story points"
                value={points}
                onChange={(v) =>
                  setPoints(typeof v === "number" ? v : "")
                }
                min={0}
                allowDecimal={false}
              />
            </Group>
            <Group grow>
              <Select
                label="Feature"
                placeholder="None"
                clearable
                data={
                  features?.map((f) => ({ value: f.id, label: f.name })) ?? []
                }
                value={featureId}
                onChange={setFeatureId}
              />
              <Select
                label="Cycle"
                placeholder="None"
                clearable
                data={
                  cycles?.map((c) => ({ value: c.id, label: c.name })) ?? []
                }
                value={cycleId}
                onChange={setCycleId}
              />
            </Group>
            <Group grow>
              <TextInput
                label="Branch"
                placeholder="feat/my-branch"
                value={branchName}
                onChange={(e) => setBranchName(e.currentTarget.value)}
              />
              <TextInput
                label="PR URL"
                placeholder="https://github.com/..."
                value={prUrl}
                onChange={(e) => setPrUrl(e.currentTarget.value)}
              />
              <TextInput
                label="Design URL"
                placeholder="https://figma.com/..."
                value={designUrl}
                onChange={(e) => setDesignUrl(e.currentTarget.value)}
              />
            </Group>
            {error && (
              <Text size="sm" className="text-text-error">
                {error}
              </Text>
            )}
            <Group justify="flex-end">
              <Button
                variant="subtle"
                component={Link}
                href={`/w/${workspace.slug}/products/${productSlug}/tickets`}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="brand"
                loading={createTicket.isPending}
                disabled={!title.trim()}
              >
                Create ticket
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}

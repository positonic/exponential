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
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

const STATUS_OPTIONS = [
  { value: "IDEA", label: "Idea" },
  { value: "DEFINED", label: "Defined" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "ARCHIVED", label: "Archived" },
];

export default function NewFeaturePage() {
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: goals } = api.goal.getAllMyGoals.useQuery(
    workspaceId ? { workspaceId } : undefined,
    { enabled: !!workspaceId },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vision, setVision] = useState("");
  const [status, setStatus] = useState<string>("IDEA");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createFeature = api.product.feature.create.useMutation({
    onSuccess: async (feature) => {
      if (product?.id) {
        await utils.product.feature.list.invalidate({ productId: product.id });
      }
      if (workspace) {
        router.push(
          `/w/${workspace.slug}/products/${productSlug}/features/${feature.id}`,
        );
      }
    },
    onError: (err) => setError(err.message),
  });

  if (!workspace || !product) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createFeature.mutate({
      productId: product.id,
      name: name.trim(),
      description: description.trim() || undefined,
      vision: vision.trim() || undefined,
      status: status as "IDEA" | "DEFINED" | "IN_PROGRESS" | "SHIPPED" | "ARCHIVED",
      goalId: goalId ? parseInt(goalId, 10) : undefined,
    });
  };

  return (
    <Stack gap="lg" maw={720}>
      <div>
        <Title order={2} className="text-text-primary">
          New feature
        </Title>
        <Text className="text-text-muted">
          Capture a long-lived product area. You can add versioned scopes and user
          stories after creation.
        </Text>
      </div>

      <Card className="border border-border-primary bg-surface-secondary">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="e.g. Notifications"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              maxLength={200}
            />
            <Textarea
              label="Description"
              placeholder="What is this feature about?"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              autosize
              minRows={3}
            />
            <Textarea
              label="Vision"
              placeholder="Where do we want this feature to go long-term?"
              value={vision}
              onChange={(e) => setVision(e.currentTarget.value)}
              autosize
              minRows={2}
            />
            <Select
              label="Status"
              data={STATUS_OPTIONS}
              value={status}
              onChange={(v) => v && setStatus(v)}
            />
            <Select
              label="Aligned goal / objective"
              description="Link this feature to an OKR goal for strategic alignment."
              placeholder="None"
              clearable
              searchable
              data={
                goals?.map((g) => ({
                  value: String(g.id),
                  label: g.title,
                })) ?? []
              }
              value={goalId}
              onChange={setGoalId}
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
                href={`/w/${workspace.slug}/products/${productSlug}/features`}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="brand"
                loading={createFeature.isPending}
                disabled={!name.trim()}
              >
                Create feature
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}

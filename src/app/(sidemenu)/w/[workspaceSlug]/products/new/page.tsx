"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Card,
  Group,
  Stack,
  TextInput,
  Textarea,
  Title,
  Text,
} from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export default function NewProductPage() {
  const router = useRouter();
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createProduct = api.product.product.create.useMutation({
    onSuccess: async (product) => {
      if (workspaceId) {
        await utils.product.product.list.invalidate({ workspaceId });
      }
      if (workspace) {
        router.push(`/w/${workspace.slug}/products/${product.slug}`);
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  if (!workspace || !workspaceId) {
    return <Text className="text-text-secondary">Workspace not found</Text>;
  }

  const onNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createProduct.mutate({
      workspaceId,
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
    });
  };

  return (
    <Stack gap="lg" maw={640}>
      <div>
        <Title order={2} className="text-text-primary">
          New product
        </Title>
        <Text className="text-text-muted">
          A product is a container for features, tickets, research, and cycles.
        </Text>
      </div>

      <Card className="border border-border-primary bg-surface-secondary">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="e.g. Exponential Core"
              value={name}
              onChange={(e) => onNameChange(e.currentTarget.value)}
              required
              maxLength={120}
            />
            <TextInput
              label="Slug"
              placeholder="exponential-core"
              description="URL-safe identifier. Lowercase letters, numbers, and hyphens only."
              value={slug}
              onChange={(e) => {
                setSlug(e.currentTarget.value);
                setSlugEdited(true);
              }}
              required
              maxLength={60}
            />
            <Textarea
              label="Description"
              placeholder="Briefly describe what this product is and who it's for."
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              autosize
              minRows={3}
              maxLength={2000}
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
                href={`/w/${workspace.slug}/products`}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="brand"
                loading={createProduct.isPending}
                disabled={!name.trim() || !slug.trim()}
              >
                Create product
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}

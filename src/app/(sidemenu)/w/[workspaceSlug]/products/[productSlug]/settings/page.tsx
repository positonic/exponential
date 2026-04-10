"use client";

import { useEffect, useState } from "react";
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
import { IconArrowLeft } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

export default function ProductSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description ?? "");
    }
  }, [product]);

  const updateProduct = api.product.product.update.useMutation({
    onSuccess: async () => {
      if (workspaceId) {
        await utils.product.product.list.invalidate({ workspaceId });
        await utils.product.product.getBySlug.invalidate({
          workspaceId,
          slug: productSlug,
        });
      }
    },
    onError: (err) => setError(err.message),
  });

  const deleteProduct = api.product.product.delete.useMutation({
    onSuccess: async () => {
      if (workspaceId) {
        await utils.product.product.list.invalidate({ workspaceId });
      }
      if (workspace) {
        router.push(`/w/${workspace.slug}/products`);
      }
    },
    onError: (err) => setError(err.message),
  });

  if (!product) return null;

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    updateProduct.mutate({
      id: product.id,
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  const onDelete = () => {
    modals.openConfirmModal({
      title: "Delete product",
      children: (
        <Text size="sm">
          This will permanently delete the product and all of its features,
          tickets, research, and retrospectives. This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteProduct.mutate({ id: product.id }),
    });
  };

  const backPath = `/w/${workspace.slug}/products/${productSlug}`;

  return (
    <Stack gap="lg" maw={640}>
      <div>
        <Link
          href={backPath}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-4"
        >
          <IconArrowLeft size={16} />
          Back to {product.name}
        </Link>
        <Title order={2} className="text-text-primary">
          Settings
        </Title>
      </div>

      <Card className="border border-border-primary bg-surface-secondary">
        <form onSubmit={onSave}>
          <Stack gap="md">
            <TextInput
              label="Name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              maxLength={120}
            />
            <Textarea
              label="Description"
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
                type="submit"
                color="brand"
                loading={updateProduct.isPending}
                disabled={!name.trim()}
              >
                Save changes
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>

      <Card className="border border-red-500/40 bg-surface-secondary">
        <Stack gap="sm">
          <Title order={5} className="text-text-primary">
            Danger zone
          </Title>
          <Text size="sm" className="text-text-muted">
            Deleting a product cannot be undone.
          </Text>
          <Group>
            <Button
              color="red"
              variant="outline"
              onClick={onDelete}
              loading={deleteProduct.isPending}
            >
              Delete product
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}

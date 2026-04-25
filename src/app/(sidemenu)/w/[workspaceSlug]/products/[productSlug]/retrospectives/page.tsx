"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconClipboardList, IconPlus } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";

export default function RetrospectivesListPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: retros, isLoading } = api.product.retrospective.list.useQuery(
    {
      workspaceId: workspaceId ?? "",
      productId: product?.id,
    },
    { enabled: !!workspaceId },
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/retrospectives`;

  return (
    <Stack gap="lg">
      <Group justify="flex-end">
        <Button
          component={Link}
          href={`${basePath}/new`}
          leftSection={<IconPlus size={16} />}
          color="brand"
        >
          New retrospective
        </Button>
      </Group>

      {isLoading ? (
        <Stack gap="sm">
          {[1, 2].map((i) => (
            <Skeleton key={i} height={80} />
          ))}
        </Stack>
      ) : retros && retros.length > 0 ? (
        <Stack gap="sm">
          {retros.map((retro) => (
            <Link key={retro.id} href={`${basePath}/${retro.id}`}>
              <Card className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors">
                <Group justify="space-between">
                  <div>
                    <Title order={5} className="text-text-primary">
                      {retro.title}
                    </Title>
                    <Text size="xs" className="text-text-muted mt-1">
                      {retro.conductedAt
                        ? new Date(retro.conductedAt).toLocaleDateString()
                        : `Created ${new Date(retro.createdAt).toLocaleDateString()}`}
                      {retro.cycle && <> · Cycle: {retro.cycle.name}</>}
                    </Text>
                  </div>
                </Group>
              </Card>
            </Link>
          ))}
        </Stack>
      ) : (
        <EmptyState
          icon={IconClipboardList}
          message="No retrospectives yet. Reflect on what went well, what didn't, and what to try next."
          action={
            <Button
              component={Link}
              href={`${basePath}/new`}
              leftSection={<IconPlus size={16} />}
              color="brand"
            >
              New retrospective
            </Button>
          }
        />
      )}
    </Stack>
  );
}

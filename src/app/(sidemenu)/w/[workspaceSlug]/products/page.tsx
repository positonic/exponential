"use client";

import Link from "next/link";
import {
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconLayoutGrid, IconPlus } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";

export default function ProductsListPage() {
  const { workspace, workspaceId, isLoading: wsLoading } = useWorkspace();

  const { data: products, isLoading } = api.product.product.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  if (wsLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={40} width={240} />
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={140} />
          ))}
        </SimpleGrid>
      </Stack>
    );
  }

  if (!workspace) {
    return <Text className="text-text-secondary">Workspace not found</Text>;
  }

  const basePath = `/w/${workspace.slug}/products`;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2} className="text-text-primary">
            Products
          </Title>
          <Text className="text-text-muted">
            Manage products, features, tickets, research, and cycles.
          </Text>
        </div>
        <Button
          component={Link}
          href={`${basePath}/new`}
          leftSection={<IconPlus size={16} />}
          color="brand"
        >
          New product
        </Button>
      </Group>

      {isLoading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={140} />
          ))}
        </SimpleGrid>
      ) : products && products.length > 0 ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`${basePath}/${product.slug}`}
              className="block"
            >
              <Card className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors h-full">
                <Stack gap="sm">
                  <Group gap="sm" align="center">
                    <div className="rounded-lg bg-background-primary p-2 text-text-muted">
                      <IconLayoutGrid size={20} />
                    </div>
                    <Title order={4} className="text-text-primary truncate">
                      {product.name}
                    </Title>
                  </Group>
                  {product.description ? (
                    <Text size="sm" className="text-text-muted line-clamp-2">
                      {product.description}
                    </Text>
                  ) : (
                    <Text size="sm" className="text-text-muted italic">
                      No description
                    </Text>
                  )}
                  <Group gap="md" mt="xs">
                    <Text size="xs" className="text-text-muted">
                      {product._count.features} features
                    </Text>
                    <Text size="xs" className="text-text-muted">
                      {product._count.tickets} tickets
                    </Text>
                    <Text size="xs" className="text-text-muted">
                      {product._count.researches} research
                    </Text>
                  </Group>
                </Stack>
              </Card>
            </Link>
          ))}
        </SimpleGrid>
      ) : (
        <EmptyState
          icon={IconLayoutGrid}
          message="No products yet. Create your first product to start managing features, tickets, and research."
          action={
            <Button
              component={Link}
              href={`${basePath}/new`}
              leftSection={<IconPlus size={16} />}
              color="brand"
            >
              New product
            </Button>
          }
        />
      )}
    </Stack>
  );
}

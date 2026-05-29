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
} from "@mantine/core";
import { IconLayoutGrid, IconPlus } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { ProductsViewTabs } from "~/app/_components/products/ProductsViewTabs";

export default function ProductsGridPage() {
  const { workspace, workspaceId, isLoading: wsLoading } = useWorkspace();

  const { data: products, isLoading } = api.product.product.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  if (!wsLoading && !workspace) {
    return (
      <Text className="px-10 pt-6 text-text-secondary">Workspace not found</Text>
    );
  }

  const basePath = workspace ? `/w/${workspace.slug}/products` : "";

  const newProductButton = (
    <Button
      component={Link}
      href={`${basePath}/new`}
      leftSection={<IconPlus size={16} />}
      color="brand"
      size="xs"
    >
      New product
    </Button>
  );

  return (
    <div className="flex h-full flex-col text-text-primary">
      <ProductsViewTabs actions={workspace ? newProductButton : undefined} />

      {wsLoading || isLoading ? (
        <Stack gap="md" className="px-8 pt-6">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={140} />
            ))}
          </SimpleGrid>
        </Stack>
      ) : products && products.length > 0 ? (
        <Stack gap="lg" className="px-8 pt-6">
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
                      <Text fw={600} className="text-text-primary truncate">
                        {product.name}
                      </Text>
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
        </Stack>
      ) : (
        <div className="px-8 pt-6">
          <EmptyState
            icon={IconLayoutGrid}
            message="No products yet. Create your first product to start managing features, tickets, and research."
            action={newProductButton}
          />
        </div>
      )}
    </div>
  );
}

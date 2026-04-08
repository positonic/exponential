"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconBulb, IconPlus } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";

const STATUS_COLORS: Record<string, string> = {
  IDEA: "gray",
  DEFINED: "blue",
  IN_PROGRESS: "yellow",
  SHIPPED: "green",
  ARCHIVED: "dark",
};

export default function FeaturesListPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: features, isLoading } = api.product.feature.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/features`;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2} className="text-text-primary">
            Features
          </Title>
          <Text className="text-text-muted">
            Long-lived product areas with versioned scopes and user stories.
          </Text>
        </div>
        <Button
          component={Link}
          href={`${basePath}/new`}
          leftSection={<IconPlus size={16} />}
          color="brand"
          disabled={!product}
        >
          New feature
        </Button>
      </Group>

      {isLoading ? (
        <Stack gap="sm">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={80} />
          ))}
        </Stack>
      ) : features && features.length > 0 ? (
        <Stack gap="sm">
          {features.map((feature) => (
            <Link key={feature.id} href={`${basePath}/${feature.id}`}>
              <Card className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors">
                <Group justify="space-between" align="flex-start">
                  <div className="flex-1">
                    <Group gap="sm">
                      <Title order={5} className="text-text-primary">
                        {feature.name}
                      </Title>
                      <Badge
                        color={STATUS_COLORS[feature.status] ?? "gray"}
                        variant="light"
                      >
                        {feature.status.replace("_", " ").toLowerCase()}
                      </Badge>
                    </Group>
                    {feature.description && (
                      <Text size="sm" className="text-text-muted line-clamp-2 mt-1">
                        {feature.description}
                      </Text>
                    )}
                    {feature.goal && (
                      <Text size="xs" className="text-text-muted mt-2">
                        → {feature.goal.title}
                      </Text>
                    )}
                  </div>
                  <Group gap="md">
                    <Text size="xs" className="text-text-muted">
                      {feature._count.scopes} scopes
                    </Text>
                    <Text size="xs" className="text-text-muted">
                      {feature._count.tickets} tickets
                    </Text>
                  </Group>
                </Group>
              </Card>
            </Link>
          ))}
        </Stack>
      ) : (
        <EmptyState
          icon={IconBulb}
          message="No features yet. Create one to start tracking what you're building."
          action={
            product && (
              <Button
                component={Link}
                href={`${basePath}/new`}
                leftSection={<IconPlus size={16} />}
                color="brand"
              >
                New feature
              </Button>
            )
          }
        />
      )}
    </Stack>
  );
}

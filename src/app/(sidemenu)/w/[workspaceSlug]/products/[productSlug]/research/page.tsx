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
import { IconMicrophone, IconPlus } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";

export default function ResearchListPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: items, isLoading } = api.product.research.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/research`;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2} className="text-text-primary">
            Research
          </Title>
          <Text className="text-text-muted">
            User interviews, desk research, experiments, analytics, and the
            insights that come out of them.
          </Text>
        </div>
        <Button
          component={Link}
          href={`${basePath}/new`}
          leftSection={<IconPlus size={16} />}
          color="brand"
          disabled={!product}
        >
          New research
        </Button>
      </Group>

      {isLoading ? (
        <Stack gap="sm">
          {[1, 2].map((i) => (
            <Skeleton key={i} height={100} />
          ))}
        </Stack>
      ) : items && items.length > 0 ? (
        <Stack gap="sm">
          {items.map((r) => (
            <Link key={r.id} href={`${basePath}/${r.id}`}>
              <Card className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Group gap="sm">
                      <Title order={5} className="text-text-primary">
                        {r.title}
                      </Title>
                      <Badge variant="light" size="sm">
                        {r.type.toLowerCase().replace("_", " ")}
                      </Badge>
                    </Group>
                    {r.conductedAt && (
                      <Text size="xs" className="text-text-muted mt-1">
                        {new Date(r.conductedAt).toLocaleDateString()}
                      </Text>
                    )}
                  </div>
                  <Text size="xs" className="text-text-muted">
                    {r._count.insights} insights
                  </Text>
                </Group>
              </Card>
            </Link>
          ))}
        </Stack>
      ) : (
        <EmptyState
          icon={IconMicrophone}
          message="No research yet. Capture user interviews, surveys, experiments, or analytics observations here."
          action={
            product && (
              <Button
                component={Link}
                href={`${basePath}/new`}
                leftSection={<IconPlus size={16} />}
                color="brand"
              >
                New research
              </Button>
            )
          }
        />
      )}
    </Stack>
  );
}

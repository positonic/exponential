"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBulb,
  IconTicket,
  IconMicrophone,
  IconCalendarClock,
  IconClipboardList,
} from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

interface StatCardProps {
  label: string;
  value: number | undefined;
  icon: React.ReactNode;
  href: string;
  isLoading: boolean;
}

function StatCard({ label, value, icon, href, isLoading }: StatCardProps) {
  return (
    <Link href={href}>
      <Card className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors">
        <Group gap="md">
          <div className="rounded-lg bg-background-primary p-3 text-text-muted">
            {icon}
          </div>
          <div>
            <Text size="sm" className="text-text-muted">
              {label}
            </Text>
            {isLoading ? (
              <Skeleton height={28} width={60} mt={4} />
            ) : (
              <Title order={3} className="text-text-primary">
                {value ?? 0}
              </Title>
            )}
          </div>
        </Group>
      </Card>
    </Link>
  );
}

export default function ProductOverviewPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();

  const { data: product, isLoading } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}`;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2} className="text-text-primary">
          Overview
        </Title>
        {product?.description ? (
          <Text className="text-text-muted">{product.description}</Text>
        ) : (
          <Text className="text-text-muted italic">No description</Text>
        )}
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard
          label="Features"
          value={product?._count.features}
          icon={<IconBulb size={20} />}
          href={`${basePath}/features`}
          isLoading={isLoading}
        />
        <StatCard
          label="Tickets"
          value={product?._count.tickets}
          icon={<IconTicket size={20} />}
          href={`${basePath}/tickets`}
          isLoading={isLoading}
        />
        <StatCard
          label="Research"
          value={product?._count.researches}
          icon={<IconMicrophone size={20} />}
          href={`${basePath}/research`}
          isLoading={isLoading}
        />
        <StatCard
          label="Retrospectives"
          value={product?._count.retrospectives}
          icon={<IconClipboardList size={20} />}
          href={`${basePath}/retrospectives`}
          isLoading={isLoading}
        />
      </SimpleGrid>

      <Card className="border border-border-primary bg-surface-secondary">
        <Stack gap="sm">
          <Group gap="sm">
            <IconCalendarClock size={20} className="text-text-muted" />
            <Title order={5} className="text-text-primary">
              Quick links
            </Title>
          </Group>
          <Text size="sm" className="text-text-muted">
            Jump into the areas of this product.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}

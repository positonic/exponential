"use client";

import { Card, SimpleGrid, Text, Title, Skeleton } from "@mantine/core";
import {
  IconUsers,
  IconMessageCircle,
  IconFolder,
  IconClock,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface StatCardProps {
  title: string;
  value: number | undefined;
  icon: React.ReactNode;
  isLoading: boolean;
}

function StatCard({ title, value, icon, isLoading }: StatCardProps) {
  return (
    <Card className="border border-border-primary bg-surface-secondary">
      <div className="flex items-center gap-4">
        <div className="rounded-lg bg-background-primary p-3 text-text-muted">
          {icon}
        </div>
        <div>
          <Text size="sm" className="text-text-muted">
            {title}
          </Text>
          {isLoading ? (
            <Skeleton height={28} width={60} mt={4} />
          ) : (
            <Title order={3} className="text-text-primary">
              {value?.toLocaleString() ?? 0}
            </Title>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AdminDashboard() {
  const { data: stats, isLoading } = api.admin.getStats.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <Title order={2} className="text-text-primary">
          Dashboard
        </Title>
        <Text className="text-text-muted">
          Overview of your application stats
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard
          title="Total Users"
          value={stats?.totalUsers}
          icon={<IconUsers size={24} />}
          isLoading={isLoading}
        />
        <StatCard
          title="Total AI Interactions"
          value={stats?.totalInteractions}
          icon={<IconMessageCircle size={24} />}
          isLoading={isLoading}
        />
        <StatCard
          title="Total Projects"
          value={stats?.totalProjects}
          icon={<IconFolder size={24} />}
          isLoading={isLoading}
        />
        <StatCard
          title="Interactions (24h)"
          value={stats?.recentInteractions}
          icon={<IconClock size={24} />}
          isLoading={isLoading}
        />
      </SimpleGrid>
    </div>
  );
}

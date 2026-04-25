'use client';

import { Card, SimpleGrid, Text, Title, Skeleton } from '@mantine/core';
import {
  IconUsers,
  IconBuilding,
  IconMessageCircle,
  IconMail,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';
import { EmptyState } from '~/app/_components/EmptyState';

interface StatCardProps {
  title: string;
  value: number | undefined;
  icon: React.ReactNode;
  isLoading: boolean;
  href?: string;
}

function StatCard({ title, value, icon, isLoading, href }: StatCardProps) {
  const content = (
    <Card className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors">
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

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export default function CRMDashboardPage() {
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();

  const { data: contactStats, isLoading: contactStatsLoading, error: contactStatsError } = api.crmContact.getStats.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const { data: orgStats, isLoading: orgStatsLoading, error: orgStatsError } = api.crmOrganization.getStats.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  if (workspaceLoading) {
    return (
      <div className="space-y-6">
        <Skeleton height={40} width={200} />
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={100} />
          ))}
        </SimpleGrid>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="space-y-6">
        <Text className="text-text-secondary">Workspace not found</Text>
      </div>
    );
  }

  if (contactStatsError || orgStatsError) {
    return (
      <div className="space-y-6">
        <Text className="text-text-secondary">Failed to load dashboard data</Text>
      </div>
    );
  }

  const basePath = `/w/${workspace.slug}/crm`;
  const isLoading = contactStatsLoading || orgStatsLoading;

  return (
    <div className="space-y-6">
      <div>
        <Title order={2} className="text-text-primary">
          Dashboard
        </Title>
        <Text className="text-text-muted">
          Overview of your CRM data
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard
          title="Total Contacts"
          value={contactStats?.totalContacts}
          icon={<IconUsers size={24} />}
          isLoading={isLoading}
          href={`${basePath}/contacts`}
        />
        <StatCard
          title="Organizations"
          value={orgStats?.totalOrganizations}
          icon={<IconBuilding size={24} />}
          isLoading={isLoading}
          href={`${basePath}/organizations`}
        />
        <StatCard
          title="Recent Interactions"
          value={contactStats?.recentInteractions}
          icon={<IconMessageCircle size={24} />}
          isLoading={isLoading}
        />
        <StatCard
          title="Contacts with Email"
          value={contactStats?.contactsWithEmail}
          icon={<IconMail size={24} />}
          isLoading={isLoading}
        />
      </SimpleGrid>

      {/* Top Organizations */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Title order={4} className="text-text-primary mb-4">
          Top Organizations
        </Title>
        {orgStatsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={40} />
            ))}
          </div>
        ) : orgStats?.topOrganizations && orgStats.topOrganizations.length > 0 ? (
          <div className="space-y-2">
            {orgStats.topOrganizations.map((org) => (
              <Link
                key={org.id}
                href={`${basePath}/organizations/${org.id}`}
                className="flex justify-between items-center p-3 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <Text className="text-text-primary">{org.name}</Text>
                <Text size="sm" className="text-text-muted">
                  {org.contactCount} contacts
                </Text>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={IconBuilding}
            compact
            message="No organizations yet. Add organizations to group your contacts."
          />
        )}
      </Card>
    </div>
  );
}

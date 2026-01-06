'use client';

import { Container, Title, Text, SimpleGrid, Paper, Skeleton, Group, Stack, RingProgress, Center } from '@mantine/core';
import { IconUsers, IconBuilding, IconMessageCircle, IconTrendingUp } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';

function StatCard({
  title,
  value,
  icon: Icon,
  href,
  description,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  href?: string;
  description?: string;
}) {
  const content = (
    <Paper p="md" radius="md" className="bg-surface-secondary border border-border-primary hover:border-border-focus transition-colors">
      <Group justify="space-between">
        <Stack gap={0}>
          <Text size="xs" className="text-text-muted uppercase tracking-wide">
            {title}
          </Text>
          <Text size="xl" fw={700} className="text-text-primary">
            {value}
          </Text>
          {description && (
            <Text size="xs" className="text-text-secondary mt-1">
              {description}
            </Text>
          )}
        </Stack>
        <Icon size={32} className="text-text-muted" />
      </Group>
    </Paper>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export default function CRMDashboardPage() {
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();

  const { data: contactStats, isLoading: contactStatsLoading } = api.crmContact.getStats.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const { data: orgStats, isLoading: orgStatsLoading } = api.crmOrganization.getStats.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  if (workspaceLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={200} mb="lg" />
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={100} />
          ))}
        </SimpleGrid>
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  const basePath = `/w/${workspace.slug}/crm`;
  const isLoading = contactStatsLoading || orgStatsLoading;

  return (
    <Container size="xl" className="py-8">
      <Title order={1} className="text-text-primary mb-6">
        CRM Dashboard
      </Title>

      {/* Stats Grid */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" mb="xl">
        {isLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={100} />
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Total Contacts"
              value={contactStats?.totalContacts ?? 0}
              icon={IconUsers}
              href={`${basePath}/contacts`}
            />
            <StatCard
              title="Organizations"
              value={orgStats?.totalOrganizations ?? 0}
              icon={IconBuilding}
              href={`${basePath}/organizations`}
            />
            <StatCard
              title="Recent Interactions"
              value={contactStats?.recentInteractions ?? 0}
              icon={IconMessageCircle}
              description="Last 7 days"
            />
            <StatCard
              title="Contacts with Email"
              value={contactStats?.contactsWithEmail ?? 0}
              icon={IconTrendingUp}
            />
          </>
        )}
      </SimpleGrid>

      {/* Quick Stats */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Top Organizations */}
        <Paper p="md" radius="md" className="bg-surface-secondary border border-border-primary">
          <Title order={3} size="h5" className="text-text-primary mb-4">
            Top Organizations
          </Title>
          {orgStatsLoading ? (
            <Stack gap="sm">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={40} />
              ))}
            </Stack>
          ) : orgStats?.topOrganizations && orgStats.topOrganizations.length > 0 ? (
            <Stack gap="sm">
              {orgStats.topOrganizations.map((org) => (
                <Link
                  key={org.id}
                  href={`${basePath}/organizations/${org.id}`}
                  className="flex justify-between items-center p-2 rounded hover:bg-surface-hover transition-colors"
                >
                  <Text className="text-text-primary">{org.name}</Text>
                  <Text size="sm" className="text-text-muted">
                    {org.contactCount} contacts
                  </Text>
                </Link>
              ))}
            </Stack>
          ) : (
            <Text className="text-text-muted text-center py-4">No organizations yet</Text>
          )}
        </Paper>

        {/* Contact Coverage */}
        <Paper p="md" radius="md" className="bg-surface-secondary border border-border-primary">
          <Title order={3} size="h5" className="text-text-primary mb-4">
            Contact Coverage
          </Title>
          {contactStatsLoading ? (
            <Center py="lg">
              <Skeleton height={120} width={120} circle />
            </Center>
          ) : (
            <Center py="lg">
              <RingProgress
                size={140}
                thickness={14}
                roundCaps
                sections={[
                  {
                    value: contactStats?.totalContacts
                      ? (contactStats.contactsWithOrganization / contactStats.totalContacts) * 100
                      : 0,
                    color: 'blue',
                    tooltip: 'With Organization',
                  },
                ]}
                label={
                  <Center>
                    <Stack gap={0} align="center">
                      <Text size="lg" fw={700} className="text-text-primary">
                        {contactStats?.totalContacts
                          ? Math.round(
                              (contactStats.contactsWithOrganization / contactStats.totalContacts) * 100
                            )
                          : 0}
                        %
                      </Text>
                      <Text size="xs" className="text-text-muted">
                        with org
                      </Text>
                    </Stack>
                  </Center>
                }
              />
            </Center>
          )}
        </Paper>
      </SimpleGrid>
    </Container>
  );
}

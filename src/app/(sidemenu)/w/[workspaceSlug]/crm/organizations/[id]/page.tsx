'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  Title,
  Text,
  Group,
  Stack,
  Avatar,
  Badge,
  Button,
  Skeleton,
  ActionIcon,
  Table,
  Divider,
  Card,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconEdit,
  IconWorld,
  IconUsers,
  IconBuilding,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import Link from 'next/link';

export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const organizationId = params.id as string;
  const { workspace, isLoading: workspaceLoading } = useWorkspace();

  const { data: organization, isLoading } = api.crmOrganization.getById.useQuery(
    { id: organizationId, includeContacts: true },
    { enabled: !!organizationId }
  );

  if (workspaceLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton height={40} width={200} />
        <Skeleton height={300} />
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

  if (!organization) {
    return (
      <div className="space-y-6">
        <Text className="text-text-secondary">Organization not found</Text>
      </div>
    );
  }

  const basePath = `/w/${workspace.slug}/crm`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ActionIcon
          variant="subtle"
          onClick={() => router.push(`${basePath}/organizations`)}
        >
          <IconArrowLeft size={20} />
        </ActionIcon>
        <div>
          <Title order={2} className="text-text-primary">
            Organization Details
          </Title>
          <Text className="text-text-muted">
            View and manage organization information
          </Text>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-border-primary bg-surface-secondary">
            <Group justify="space-between" mb="md">
              <Group>
                <Avatar size="xl" radius="md" src={organization.logoUrl}>
                  <IconBuilding size={32} />
                </Avatar>
                <Stack gap={0}>
                  <Title order={3} className="text-text-primary">
                    {organization.name}
                  </Title>
                  {organization.industry && (
                    <Badge variant="light" size="sm" mt={4}>
                      {organization.industry}
                    </Badge>
                  )}
                </Stack>
              </Group>
              <Button leftSection={<IconEdit size={16} />} variant="light" size="sm">
                Edit
              </Button>
            </Group>

            {/* Organization Info */}
            <Stack gap="sm">
              {organization.websiteUrl && (
                <Group gap="sm">
                  <IconWorld size={16} className="text-text-muted" />
                  <a
                    href={organization.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-primary hover:text-brand-primary text-sm"
                  >
                    {organization.websiteUrl}
                  </a>
                </Group>
              )}
              {organization.size && (
                <Group gap="sm">
                  <IconUsers size={16} className="text-text-muted" />
                  <Text size="sm" className="text-text-primary">{organization.size} employees</Text>
                </Group>
              )}
            </Stack>

            {/* Description */}
            {organization.description && (
              <>
                <Divider my="md" />
                <Text size="sm" className="text-text-secondary whitespace-pre-wrap">
                  {organization.description}
                </Text>
              </>
            )}
          </Card>

          {/* Contacts */}
          <Card className="border border-border-primary bg-surface-secondary">
            <Group justify="space-between" mb="md">
              <Title order={4} className="text-text-primary">
                Contacts ({organization._count.contacts})
              </Title>
              <Button
                size="xs"
                variant="light"
                component={Link}
                href={`${basePath}/contacts?organizationId=${organization.id}`}
              >
                View All
              </Button>
            </Group>

            {organization.contacts && organization.contacts.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border-primary">
                <Table highlightOnHover>
                  <Table.Thead className="bg-background-primary">
                    <Table.Tr>
                      <Table.Th className="text-text-muted">Name</Table.Th>
                      <Table.Th className="text-text-muted">Email</Table.Th>
                      <Table.Th className="text-text-muted">Last Interaction</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {organization.contacts.map((contact) => (
                      <Table.Tr
                        key={contact.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`${basePath}/contacts/${contact.id}`)}
                      >
                        <Table.Td>
                          <Group gap="sm">
                            <Avatar size="sm" radius="xl">
                              {contact.firstName?.[0] ?? contact.lastName?.[0] ?? '?'}
                            </Avatar>
                            <Text size="sm" className="text-text-primary">
                              {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'}
                            </Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" className="text-text-secondary">{contact.email ?? '-'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" className="text-text-muted">
                            {contact.lastInteractionAt
                              ? new Date(contact.lastInteractionAt).toLocaleDateString()
                              : 'Never'}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-border-primary bg-background-primary py-8 text-center">
                <Text className="text-text-muted">
                  No contacts associated with this organization
                </Text>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card className="border border-border-primary bg-surface-secondary">
            <Title order={4} className="text-text-primary mb-4">
              Quick Info
            </Title>
            <Stack gap="sm">
              <div>
                <Text size="xs" className="text-text-muted">
                  Created
                </Text>
                <Text size="sm" className="text-text-primary">
                  {new Date(organization.createdAt).toLocaleDateString()}
                </Text>
              </div>
              <div>
                <Text size="xs" className="text-text-muted">
                  Total Contacts
                </Text>
                <Text size="sm" className="text-text-primary">{organization._count.contacts}</Text>
              </div>
              <div>
                <Text size="xs" className="text-text-muted">
                  Created By
                </Text>
                <Text size="sm" className="text-text-primary">
                  {organization.createdBy.name ?? organization.createdBy.email}
                </Text>
              </div>
            </Stack>
          </Card>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  Container,
  Title,
  Text,
  Paper,
  Group,
  Stack,
  Avatar,
  Badge,
  Button,
  Skeleton,
  ActionIcon,
  Table,
  Divider,
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
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={200} mb="lg" />
        <Skeleton height={300} />
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

  if (!organization) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Organization not found</Text>
      </Container>
    );
  }

  const basePath = `/w/${workspace.slug}/crm`;

  return (
    <Container size="xl" className="py-8">
      {/* Header */}
      <Group mb="lg">
        <ActionIcon
          variant="subtle"
          onClick={() => router.push(`${basePath}/organizations`)}
        >
          <IconArrowLeft size={20} />
        </ActionIcon>
        <Title order={1} className="text-text-primary">
          Organization Details
        </Title>
      </Group>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2">
          <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary mb-6">
            <Group justify="space-between" mb="md">
              <Group>
                <Avatar size="xl" radius="md" src={organization.logoUrl}>
                  <IconBuilding size={32} />
                </Avatar>
                <Stack gap={0}>
                  <Title order={2} className="text-text-primary">
                    {organization.name}
                  </Title>
                  {organization.industry && (
                    <Badge variant="light" mt={4}>
                      {organization.industry}
                    </Badge>
                  )}
                </Stack>
              </Group>
              <Button leftSection={<IconEdit size={16} />} variant="light">
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
                    className="text-text-primary hover:text-brand-primary"
                  >
                    {organization.websiteUrl}
                  </a>
                </Group>
              )}
              {organization.size && (
                <Group gap="sm">
                  <IconUsers size={16} className="text-text-muted" />
                  <Text className="text-text-primary">{organization.size} employees</Text>
                </Group>
              )}
            </Stack>

            {/* Description */}
            {organization.description && (
              <>
                <Divider my="md" />
                <Text className="text-text-secondary whitespace-pre-wrap">
                  {organization.description}
                </Text>
              </>
            )}
          </Paper>

          {/* Contacts */}
          <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
            <Group justify="space-between" mb="md">
              <Title order={3} className="text-text-primary">
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
              <Table.ScrollContainer minWidth={500}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Last Interaction</Table.Th>
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
                            <Text className="text-text-primary">
                              {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'}
                            </Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text className="text-text-secondary">{contact.email ?? '-'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text className="text-text-muted" size="sm">
                            {contact.lastInteractionAt
                              ? new Date(contact.lastInteractionAt).toLocaleDateString()
                              : 'Never'}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : (
              <Text className="text-text-muted text-center py-4">
                No contacts associated with this organization
              </Text>
            )}
          </Paper>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
            <Title order={4} className="text-text-primary mb-4">
              Quick Info
            </Title>
            <Stack gap="sm">
              <div>
                <Text size="xs" className="text-text-muted">
                  Created
                </Text>
                <Text className="text-text-primary">
                  {new Date(organization.createdAt).toLocaleDateString()}
                </Text>
              </div>
              <div>
                <Text size="xs" className="text-text-muted">
                  Total Contacts
                </Text>
                <Text className="text-text-primary">{organization._count.contacts}</Text>
              </div>
              <div>
                <Text size="xs" className="text-text-muted">
                  Created By
                </Text>
                <Text className="text-text-primary">
                  {organization.createdBy.name ?? organization.createdBy.email}
                </Text>
              </div>
            </Stack>
          </Paper>
        </div>
      </div>
    </Container>
  );
}

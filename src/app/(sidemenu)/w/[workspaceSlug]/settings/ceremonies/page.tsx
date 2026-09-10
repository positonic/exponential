"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Container,
  Group,
  Menu,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconCalendarRepeat, IconChevronDown, IconPlus } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { describeCadence } from "~/lib/ceremonies/cadence";
import {
  CEREMONY_KIND_LABELS,
  CeremonyEditorModal,
} from "~/app/_components/ceremonies/CeremonyEditorModal";
import type { CeremonyTemplate } from "~/server/services/ceremonies/templates";

/**
 * Settings → Ceremonies (ADR-0059): the workspace's operating rhythm as
 * definitions. Members create and edit; viewers read. Modelled on
 * settings/decisions.
 */
export default function CeremoniesSettingsPage() {
  const { workspace, workspaceId, userRole, isLoading } = useWorkspace();
  const canEdit = userRole === "owner" || userRole === "admin" || userRole === "member";

  const { data: ceremonies, isLoading: listLoading } = api.ceremony.list.useQuery(
    { workspaceId: workspaceId ?? "", includeInactive: true },
    { enabled: !!workspaceId },
  );
  const { data: templates = [] } = api.ceremony.templates.useQuery(undefined, { enabled: canEdit });

  const [editor, setEditor] = useState<{ ceremonyId: string | null; template: CeremonyTemplate | null } | null>(null);

  if (isLoading || !workspace || !workspaceId) {
    return (
      <Container size="lg" py="xl">
        <Skeleton height={32} width={260} mb="md" />
        <Skeleton height={180} />
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs">
              <IconCalendarRepeat size={22} />
              <Title order={2}>Ceremonies</Title>
            </Group>
            <Text size="sm" className="text-text-muted" mt={4}>
              The recurring meetings that make up {workspace.name}&apos;s operating rhythm. Each one has an owner,
              a cadence, participants, a purpose and a &quot;not for&quot; list; occurrences are generated from the
              cadence and recordings attach to them.
            </Text>
          </div>
          {canEdit && (
            <Group gap="xs">
              <Menu shadow="md" width={260} position="bottom-end">
                <Menu.Target>
                  <Button variant="default" rightSection={<IconChevronDown size={14} />} data-testid="add-from-template">
                    Add from template
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {templates.map((t) => (
                    <Menu.Item key={t.slug} onClick={() => setEditor({ ceremonyId: null, template: t })}>
                      <Text size="sm">{t.name}</Text>
                      <Text size="xs" className="text-text-muted">
                        {describeCadence(t.cadenceRule)} · {t.durationMinutes} min
                      </Text>
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
              <Button leftSection={<IconPlus size={14} />} onClick={() => setEditor({ ceremonyId: null, template: null })} data-testid="new-ceremony">
                New ceremony
              </Button>
            </Group>
          )}
        </Group>

        <Paper withBorder radius="md" p={0}>
          {listLoading ? (
            <Skeleton height={120} m="md" />
          ) : !ceremonies || ceremonies.length === 0 ? (
            <Stack align="center" py="xl" gap="xs">
              <Text size="sm" className="text-text-muted">
                No ceremonies yet.
              </Text>
              {canEdit && (
                <Text size="xs" className="text-text-muted">
                  Start from a template: a standup, cycle planning, review, retrospective, prioritisation or all-hands.
                </Text>
              )}
            </Stack>
          ) : (
            <Table verticalSpacing="sm" highlightOnHover data-testid="ceremonies-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ceremony</Table.Th>
                  <Table.Th>Cadence</Table.Th>
                  <Table.Th>Owner</Table.Th>
                  <Table.Th>Participants</Table.Th>
                  <Table.Th>Occurrences</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {ceremonies.map((c) => (
                  <Table.Tr key={c.id} data-testid={`ceremony-row-${c.slug}`}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Link href={`/w/${workspace.slug}/ceremonies/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <Badge size="xs" variant="light">
                          {CEREMONY_KIND_LABELS[c.kind]}
                        </Badge>
                        {!c.isActive && (
                          <Badge size="xs" variant="outline" color="gray">
                            Inactive
                          </Badge>
                        )}
                      </Group>
                      {c.aliases.length > 0 && (
                        <Text size="xs" className="text-text-muted">
                          aka {c.aliases.join(", ")}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{describeCadence(c.cadenceRule)}</Text>
                      <Text size="xs" className="text-text-muted">
                        {c.timezone} · {c.durationMinutes} min
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{c.owner.name ?? c.owner.email ?? "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{c._count.participants}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{c._count.occurrences}</Text>
                    </Table.Td>
                    <Table.Td align="right">
                      {canEdit && (
                        <Button size="xs" variant="subtle" onClick={() => setEditor({ ceremonyId: c.id, template: null })}>
                          Edit
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </Stack>

      <CeremonyEditorModal
        opened={editor !== null}
        onClose={() => setEditor(null)}
        workspaceId={workspaceId}
        ceremonyId={editor?.ceremonyId ?? null}
        template={editor?.template ?? null}
      />
    </Container>
  );
}

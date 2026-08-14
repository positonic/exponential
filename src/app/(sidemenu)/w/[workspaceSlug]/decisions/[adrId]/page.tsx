"use client";

import {
  Anchor,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { ImplementedByPicker } from "~/app/_components/decisions/ImplementedByPicker";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

/**
 * ADR detail page. Deliberately read-only: git is the source of truth and
 * there is NO write path to ADR content — not disabled, absent. The GitHub
 * link pins at the last-synced commit, never HEAD, so it always shows the
 * exact text projected here.
 */

const STATUS_COLOR: Record<string, string> = {
  PROPOSED: "blue",
  ACCEPTED: "green",
  SUPERSEDED: "orange",
  DEPRECATED: "red",
};

export default function DecisionDetailPage() {
  const { workspace, workspaceId, isLoading } = useWorkspace();
  const params = useParams<{ adrId: string; workspaceSlug: string }>();
  const adrId = params?.adrId ?? "";

  const {
    data: adr,
    isLoading: adrLoading,
    error,
  } = api.adr.get.useQuery(
    { workspaceId: workspaceId ?? "", adrId },
    { enabled: !!workspaceId && !!adrId },
  );

  if (isLoading || (workspace && adrLoading)) {
    return (
      <Container size="md" className="py-8">
        <Skeleton height={40} width={280} mb="lg" />
        <Skeleton height={400} />
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="md" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  if (error ?? !adr) {
    return (
      <Container size="md" className="py-8">
        <Text className="text-text-secondary">
          {error?.data?.code === "FORBIDDEN"
            ? "You don't have access to this decision — it is visible to workspace members only."
            : "Decision not found."}
        </Text>
      </Container>
    );
  }

  const supersededBy = adr.linksTo.filter((l) => l.type === "SUPERSEDES");
  const supersedes = adr.linksFrom.filter((l) => l.type === "SUPERSEDES");
  const mentions = [
    ...adr.linksFrom
      .filter((l) => l.type === "MENTIONS")
      .map((l) => ({ id: l.id, doc: l.to, evidence: l.evidence, direction: "out" as const })),
    ...adr.linksTo
      .filter((l) => l.type === "MENTIONS")
      .map((l) => ({ id: l.id, doc: l.from, evidence: l.evidence, direction: "in" as const })),
  ];

  const decisionHref = (id: string) => `/w/${workspace.slug}/decisions/${id}`;

  return (
    <Container size="md" className="py-8">
      <Anchor
        component={Link}
        href={`/w/${workspace.slug}/decisions`}
        size="sm"
        className="text-text-secondary"
      >
        <Group gap={4} wrap="nowrap">
          <IconArrowLeft size={14} />
          All decisions
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" mt="md" mb="xs" wrap="nowrap">
        <div>
          <Group gap="sm" mb={4}>
            {adr.label ? (
              <Text size="sm" fw={700} className="text-text-secondary">
                {adr.label}
              </Text>
            ) : null}
            {adr.status === "UNKNOWN" ? (
              <Badge variant="light" color="gray" title={adr.statusRaw ?? undefined}>
                no status
              </Badge>
            ) : (
              <Badge
                variant="light"
                color={STATUS_COLOR[adr.status] ?? "gray"}
                title={adr.statusRaw ?? undefined}
              >
                {adr.status.toLowerCase()}
              </Badge>
            )}
            {adr.deletedAt ? (
              <Badge variant="light" color="red">
                removed from repo
              </Badge>
            ) : null}
          </Group>
          <Title order={2}>{adr.title}</Title>
          <Group gap="xs" mt={6}>
            <Badge variant="outline" color="gray">
              {adr.repository.fullName}
            </Badge>
            {adr.repository.product ? (
              <Badge variant="outline" color="gray">
                {adr.repository.product.name}
              </Badge>
            ) : (
              <Badge variant="outline" color="gray">
                workspace-wide
              </Badge>
            )}
            {adr.decidedAt ? (
              <Text size="sm" className="text-text-secondary">
                {new Date(adr.decidedAt).toLocaleDateString()}
              </Text>
            ) : null}
          </Group>
        </div>
        <Button
          component="a"
          href={adr.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="light"
          size="sm"
          leftSection={<IconBrandGithub size={16} />}
        >
          View on GitHub
        </Button>
      </Group>

      {supersededBy.length > 0 || supersedes.length > 0 ? (
        <Stack gap={4} mb="md" mt="md">
          {supersededBy.map((link) => (
            <Text key={link.id} size="sm" className="text-text-secondary">
              Superseded by{" "}
              <Anchor component={Link} href={decisionHref(link.from.id)} size="sm">
                {link.from.label ?? link.from.title}
              </Anchor>{" "}
              — {link.from.title}
            </Text>
          ))}
          {supersedes.map((link) => (
            <Text key={link.id} size="sm" className="text-text-secondary">
              Supersedes{" "}
              <Anchor component={Link} href={decisionHref(link.to.id)} size="sm">
                {link.to.label ?? link.to.title}
              </Anchor>{" "}
              — {link.to.title}
            </Text>
          ))}
        </Stack>
      ) : null}

      <Divider my="lg" />

      <ImplementedByPicker
        workspaceId={workspaceId ?? ""}
        adrId={adr.id}
        links={adr.ticketLinks}
        canEdit
      />

      <Divider my="lg" />

      <MarkdownRenderer content={adr.body} variant="prose" />

      {mentions.length > 0 ? (
        <>
          <Divider my="lg" />
          <Title order={5} className="text-text-secondary" mb="xs">
            Related (detected)
          </Title>
          <Stack gap="xs">
            {mentions.map((mention) => (
              <Paper key={mention.id} p="sm" withBorder className="bg-surface-secondary">
                <Text size="sm">
                  <Anchor
                    component={Link}
                    href={decisionHref(mention.doc.id)}
                    size="sm"
                    className="text-text-secondary"
                  >
                    {mention.doc.label ?? mention.doc.title}
                  </Anchor>{" "}
                  <Text span size="sm" className="text-text-muted">
                    — {mention.doc.title}
                    {mention.direction === "in" ? " (mentions this decision)" : ""}
                  </Text>
                </Text>
                {mention.evidence ? (
                  <Text size="xs" className="text-text-muted" mt={4} lineClamp={2}>
                    “{mention.evidence}”
                  </Text>
                ) : null}
              </Paper>
            ))}
          </Stack>
        </>
      ) : null}
    </Container>
  );
}

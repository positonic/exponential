"use client";

import {
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { ImplementedByPicker } from "~/app/_components/decisions/ImplementedByPicker";
import { api } from "~/trpc/react";

/**
 * An ADR's content. Deliberately read-only: git is the source of truth and
 * there is NO write path to ADR content — not disabled, absent. The GitHub
 * link pins at the last-synced commit, never HEAD, so it always shows the
 * exact text projected here. Shared by the full page at `/decisions/[adrId]`
 * and the Decision Log's peek drawer.
 */

const STATUS_COLOR: Record<string, string> = {
  PROPOSED: "blue",
  ACCEPTED: "green",
  SUPERSEDED: "orange",
  DEPRECATED: "red",
};

export function AdrDetail({
  workspaceId,
  workspaceSlug,
  adrId,
}: {
  workspaceId: string;
  workspaceSlug: string;
  adrId: string;
}) {
  const {
    data: adr,
    isLoading,
    error,
  } = api.adr.get.useQuery(
    { workspaceId, adrId },
    { enabled: !!workspaceId && !!adrId },
  );
  // Decisions formalised as this ADR (ADR-0060). Read through the decision
  // router so the meeting resolver, not this component, decides what is shown.
  const { data: decidedIn } = api.decision.listForAdr.useQuery(
    { workspaceId, adrDocumentId: adrId },
    { enabled: !!workspaceId && !!adrId },
  );

  if (isLoading) {
    return (
      <>
        <Skeleton height={40} width={280} mb="lg" />
        <Skeleton height={400} />
      </>
    );
  }

  if (error ?? !adr) {
    return (
      <Text className="text-text-secondary">
        {error?.data?.code === "FORBIDDEN"
          ? "You don't have access to this decision — it is visible to workspace members only."
          : "Decision not found."}
      </Text>
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

  const decisionHref = (id: string) => `/w/${workspaceSlug}/decisions/${id}`;

  return (
    <>
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
          className="shrink-0"
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

      {decidedIn && decidedIn.length > 0 ? (
        <Stack gap={4} mb="md" mt="md">
          {decidedIn.map((d) => (
            <Text key={d.id} size="sm" className="text-text-secondary">
              Decided in{" "}
              <Anchor
                component={Link}
                href={`/w/${workspaceSlug}/decisions/d/${d.id}`}
                size="sm"
              >
                {d.label}
              </Anchor>{" "}
              — {d.statement}
              {d.transcriptionSession
                ? ` (${d.transcriptionSession.title ?? "meeting"}${
                    d.decidedAt ? `, ${new Date(d.decidedAt).toLocaleDateString()}` : ""
                  })`
                : d.decidedAt
                  ? ` (${new Date(d.decidedAt).toLocaleDateString()})`
                  : ""}
            </Text>
          ))}
        </Stack>
      ) : null}

      <Divider my="lg" />

      <ImplementedByPicker
        workspaceId={workspaceId}
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
    </>
  );
}

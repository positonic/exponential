"use client";

import {
  Anchor,
  Badge,
  Container,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconMicrophone, IconPencil, IconQuote } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import {
  evidenceHref,
  formatEvidenceTime,
  parseEvidence,
} from "~/lib/decision-evidence";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

/**
 * Decision detail page (ADR-0060): statement, status, provenance (the
 * meeting and ceremony it came from, with each evidence quote deep-linked
 * to its transcript turn), deciders, the supersession chain and links.
 * Sits beside the read-only ADR page at `/decisions/[adrId]`.
 */

const STATUS_COLOR: Record<string, string> = {
  OPEN: "yellow",
  PROPOSED: "blue",
  ACCEPTED: "green",
  SUPERSEDED: "orange",
  DEPRECATED: "red",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "open question",
  PROPOSED: "proposed",
  ACCEPTED: "accepted",
  SUPERSEDED: "superseded",
  DEPRECATED: "deprecated",
};

function formatDate(value: Date | string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DecisionPage() {
  const { workspace, workspaceId, isLoading } = useWorkspace();
  const params = useParams<{ decisionId: string; workspaceSlug: string }>();
  const decisionId = params?.decisionId ?? "";

  const {
    data: decision,
    isLoading: decisionLoading,
    error,
  } = api.decision.get.useQuery(
    { workspaceId: workspaceId ?? "", decisionId },
    { enabled: !!workspaceId && !!decisionId },
  );

  if (isLoading || (workspace && decisionLoading)) {
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

  if (error ?? !decision) {
    return (
      <Container size="md" className="py-8">
        <Text className="text-text-secondary">
          {error?.data?.code === "FORBIDDEN"
            ? "You don't have access to this decision."
            : "Decision not found."}
        </Text>
      </Container>
    );
  }

  const evidence = parseEvidence(decision.evidence);
  const meeting = decision.transcriptionSession;
  const decided = formatDate(decision.decidedAt);
  const decisionHref = (id: string) => `/w/${workspace.slug}/decisions/d/${id}`;

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
        <div className="min-w-0">
          <Group gap="sm" mb={4}>
            <Text size="sm" fw={700} className="text-text-secondary">
              {decision.label}
            </Text>
            <Badge variant="light" color={STATUS_COLOR[decision.status] ?? "gray"}>
              {STATUS_LABEL[decision.status] ?? decision.status.toLowerCase()}
            </Badge>
            <Badge
              variant="outline"
              color="gray"
              leftSection={
                decision.source === "MEETING" ? (
                  <IconMicrophone size={11} />
                ) : (
                  <IconPencil size={11} />
                )
              }
            >
              {decision.source === "MEETING"
                ? "meeting"
                : decision.source === "AGENT"
                  ? "logged by Zoe"
                  : "manual"}
            </Badge>
          </Group>
          <Title order={2}>{decision.statement}</Title>
          <Group gap="xs" mt={6}>
            {decision.product ? (
              <Badge variant="outline" color="gray">
                {decision.product.name}
              </Badge>
            ) : (
              <Badge variant="outline" color="gray">
                workspace-wide
              </Badge>
            )}
            {decision.project ? (
              <Badge
                variant="outline"
                color="gray"
                component={Link}
                href={`/w/${workspace.slug}/projects/${decision.project.slug}`}
                className="cursor-pointer"
              >
                {decision.project.name}
              </Badge>
            ) : null}
            {decision.occurrence ? (
              <Badge variant="outline" color="gray">
                {decision.occurrence.ceremony.name}
                {decision.occurrence.scheduledStart
                  ? ` · ${formatDate(decision.occurrence.scheduledStart)}`
                  : ""}
              </Badge>
            ) : null}
            {decided ? (
              <Text size="sm" className="text-text-secondary">
                Decided {decided}
              </Text>
            ) : null}
          </Group>
        </div>
      </Group>

      <Stack gap={4} mt="md">
        {meeting ? (
          <Text size="sm" className="text-text-secondary">
            Decided in{" "}
            <Anchor component={Link} href={`/recording/${meeting.id}`} size="sm">
              {meeting.title ?? "Meeting"}
            </Anchor>
            {meeting.meetingDate ? ` — ${formatDate(meeting.meetingDate)}` : ""}
          </Text>
        ) : null}
        {decision.deciders.length > 0 ? (
          <Text size="sm" className="text-text-secondary">
            Deciders: {decision.deciders.map((d) => d.name).join(", ")}
          </Text>
        ) : null}
        {decision.owner ? (
          <Text size="sm" className="text-text-secondary">
            Owner: {decision.owner.name ?? decision.owner.email}
          </Text>
        ) : null}
        {decision.supersededBy ? (
          <Text size="sm" className="text-text-secondary">
            Superseded by{" "}
            <Anchor component={Link} href={decisionHref(decision.supersededBy.id)} size="sm">
              {decision.supersededBy.label}
            </Anchor>{" "}
            — {decision.supersededBy.statement}
          </Text>
        ) : null}
        {decision.supersedes.map((d) => (
          <Text key={d.id} size="sm" className="text-text-secondary">
            Supersedes{" "}
            <Anchor component={Link} href={decisionHref(d.id)} size="sm">
              {d.label}
            </Anchor>{" "}
            — {d.statement}
          </Text>
        ))}
      </Stack>

      {evidence.length > 0 && meeting ? (
        <>
          <Divider my="lg" />
          <Title order={5} className="text-text-secondary" mb="xs">
            <Group gap={6}>
              <IconQuote size={14} />
              Evidence
            </Group>
          </Title>
          <Stack gap="xs">
            {evidence
              .slice()
              .sort((a, b) => a.turnIndex - b.turnIndex)
              .map((turn) => {
                const time = formatEvidenceTime(turn.startTime);
                return (
                  <Paper
                    key={turn.turnIndex}
                    p="sm"
                    withBorder
                    className="bg-surface-secondary"
                    component={Link}
                    href={evidenceHref(meeting.id, turn.turnIndex)}
                  >
                    <Text size="xs" fw={600} className="text-text-secondary">
                      {turn.speaker ?? "Unknown"}
                      {time ? ` · ${time}` : ""}
                      <Text span size="xs" fw={400} className="text-text-muted">
                        {" "}
                        · turn {turn.turnIndex + 1} in the transcript
                      </Text>
                    </Text>
                    <Text size="sm" mt={4}>
                      “{turn.text}”
                    </Text>
                  </Paper>
                );
              })}
          </Stack>
        </>
      ) : null}

      {decision.links.length > 0 ? (
        <>
          <Divider my="lg" />
          <Title order={5} className="text-text-secondary" mb="xs">
            Implemented by
          </Title>
          <Stack gap={4}>
            {decision.links.map((l) => (
              <Group key={l.id} gap="xs" wrap="nowrap">
                <Badge variant="light" color={l.ticket ? "blue" : "grape"}>
                  {l.ticket ? "ticket" : "feature"}
                </Badge>
                <Text size="sm" className="min-w-0 flex-1 truncate">
                  {l.ticket
                    ? `${l.ticket.shortId ?? `#${l.ticket.number}`} — ${l.ticket.title}`
                    : (l.feature?.name ?? "—")}
                </Text>
              </Group>
            ))}
          </Stack>
        </>
      ) : null}

      {decision.body ? (
        <>
          <Divider my="lg" />
          <MarkdownRenderer content={decision.body} variant="prose" />
        </>
      ) : null}
    </Container>
  );
}

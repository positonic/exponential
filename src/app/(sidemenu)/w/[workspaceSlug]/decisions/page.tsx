"use client";

import { Button, Container, Group, Skeleton, Text, Title } from "@mantine/core";
import { IconAffiliate } from "@tabler/icons-react";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { DecisionsIndex } from "~/app/_components/decisions/DecisionsIndex";

/**
 * Decision Log — workspace-level index of ADRs projected read-only from every
 * enrolled repo. Git is the source of truth; there is deliberately no write
 * path to ADR content anywhere in this UI.
 */
export default function DecisionsPage() {
  const { workspace, workspaceId, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={240} mb="lg" />
        <Skeleton height={300} />
      </Container>
    );
  }

  if (!workspace || !workspaceId) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" className="py-8">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>Decisions</Title>
          <Text size="sm" className="text-text-secondary">
            Architectural decision records across this workspace&apos;s enrolled
            repos. Read-only — git is the source of truth.
          </Text>
        </div>
        <Button
          component={Link}
          href={`/w/${workspace.slug}/decisions/graph`}
          variant="light"
          size="sm"
          leftSection={<IconAffiliate size={16} />}
        >
          Graph
        </Button>
      </Group>
      <DecisionsIndex workspaceId={workspaceId} workspaceSlug={workspace.slug} />
    </Container>
  );
}

"use client";

import {
  Badge,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
  Loader,
  Center,
  Anchor,
  Breadcrumbs,
} from "@mantine/core";
import {
  IconCoin,
  IconCode,
  IconArrowLeft,
} from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "green",
  intermediate: "yellow",
  advanced: "red",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "green",
  IN_PROGRESS: "blue",
  IN_REVIEW: "yellow",
  COMPLETED: "gray",
  CANCELLED: "red",
};

export function ProjectPageClient({ slug }: { slug: string }) {
  const { data: project, isLoading } = api.bounty.getPublicProject.useQuery({
    slug,
  });

  if (isLoading) {
    return (
      <Center py="xl" mih={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!project) {
    return (
      <Container size="lg" py="xl">
        <Stack align="center" gap="md">
          <Title order={2} className="text-text-primary">
            Project not found
          </Title>
          <Text className="text-text-secondary">
            This project doesn&apos;t exist or isn&apos;t public.
          </Text>
          <Anchor component={Link} href="/explore" size="sm">
            <Group gap={4}>
              <IconArrowLeft size={14} />
              Back to Explore
            </Group>
          </Anchor>
        </Stack>
      </Container>
    );
  }

  const openBounties = project.actions.filter(
    (a) => a.bountyStatus === "OPEN"
  );
  const otherBounties = project.actions.filter(
    (a) => a.bountyStatus !== "OPEN"
  );

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Breadcrumbs */}
        <Breadcrumbs>
          <Anchor component={Link} href="/explore" size="sm">
            Explore
          </Anchor>
          <Text size="sm" className="text-text-primary">
            {project.name}
          </Text>
        </Breadcrumbs>

        {/* Project Header */}
        <div>
          <Group gap="md" align="flex-start">
            <div style={{ flex: 1 }}>
              <Title order={1} className="text-text-primary">
                {project.name}
              </Title>
              {project.description && (
                <Text
                  size="lg"
                  className="text-text-secondary"
                  mt="xs"
                >
                  {project.description}
                </Text>
              )}
            </div>
            <Group gap="xs">
              {project.status && (
                <Badge variant="light">{project.status}</Badge>
              )}
              {typeof project.progress === "number" && project.progress > 0 && (
                <Badge variant="outline">{Math.round(project.progress)}% complete</Badge>
              )}
            </Group>
          </Group>
        </div>

        {/* Open Bounties */}
        <div>
          <Title order={3} className="text-text-primary" mb="md">
            Open Bounties ({openBounties.length})
          </Title>
          {openBounties.length === 0 ? (
            <Text className="text-text-muted">
              No open bounties at the moment.
            </Text>
          ) : (
            <Stack gap="sm">
              {openBounties.map((bounty) => (
                <BountyCard key={bounty.id} bounty={bounty} />
              ))}
            </Stack>
          )}
        </div>

        {/* Other Bounties */}
        {otherBounties.length > 0 && (
          <div>
            <Title order={3} className="text-text-primary" mb="md">
              Other Bounties ({otherBounties.length})
            </Title>
            <Stack gap="sm">
              {otherBounties.map((bounty) => (
                <BountyCard key={bounty.id} bounty={bounty} />
              ))}
            </Stack>
          </div>
        )}
      </Stack>
    </Container>
  );
}

interface BountyAction {
  id: string;
  name: string;
  description: string | null;
  bountyAmount: { toString(): string } | null;
  bountyToken: string | null;
  bountyStatus: string | null;
  bountyDifficulty: string | null;
  bountySkills: string[];
  bountyDeadline: Date | null;
  bountyMaxClaimants: number;
  _count: { bountyClaims: number };
}

function BountyCard({ bounty }: { bounty: BountyAction }) {
  const status = bounty.bountyStatus ?? "OPEN";

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
      p="md"
    >
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Group gap="xs" wrap="nowrap">
            <Text fw={600} className="text-text-primary" truncate>
              {bounty.name}
            </Text>
            <Badge
              variant="light"
              color={STATUS_COLORS[status] ?? "gray"}
              size="xs"
            >
              {status}
            </Badge>
            {bounty.bountyDifficulty && (
              <Badge
                variant="dot"
                color={DIFFICULTY_COLORS[bounty.bountyDifficulty] ?? "gray"}
                size="xs"
              >
                {bounty.bountyDifficulty}
              </Badge>
            )}
          </Group>
          {bounty.description && (
            <Text
              size="sm"
              className="text-text-secondary"
              lineClamp={2}
              mt={4}
            >
              {bounty.description}
            </Text>
          )}
          {bounty.bountySkills.length > 0 && (
            <Group gap={4} mt="xs">
              {bounty.bountySkills.map((skill) => (
                <Badge key={skill} variant="outline" size="xs">
                  {skill}
                </Badge>
              ))}
            </Group>
          )}
        </div>
        <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
          {bounty.bountyAmount != null && (
            <Group gap={4}>
              <IconCoin size={14} className="text-text-muted" />
              <Text size="sm" fw={600} className="text-text-primary">
                {bounty.bountyAmount.toString()} {bounty.bountyToken ?? ""}
              </Text>
            </Group>
          )}
          <Group gap={4}>
            <IconCode size={14} className="text-text-muted" />
            <Text size="xs" className="text-text-muted">
              {bounty._count.bountyClaims}/{bounty.bountyMaxClaimants} claimed
            </Text>
          </Group>
          {bounty.bountyDeadline && (
            <Text size="xs" className="text-text-muted">
              Due {new Date(bounty.bountyDeadline).toLocaleDateString()}
            </Text>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

"use client";

import {
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Center,
  Stack,
  Text,
  Title,
  Tooltip,
  Anchor,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCoin,
  IconCode,
  IconExternalLink,
  IconCalendar,
} from "@tabler/icons-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { notifications } from "@mantine/notifications";
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

interface BountyDetailClientProps {
  bountyId: string;
  projectSlug: string;
}

export function BountyDetailClient({ bountyId, projectSlug }: BountyDetailClientProps) {
  const { data: session } = useSession();
  const utils = api.useUtils();

  const { data: bounty, isLoading } = api.bounty.getPublic.useQuery({ id: bountyId });

  const { data: myClaim } = api.bounty.getMyClaimForBounty.useQuery(
    { bountyId },
    { enabled: !!session?.user }
  );

  const claimMutation = api.bounty.claim.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Bounty Claimed",
        message: "You have successfully claimed this bounty.",
        color: "green",
      });
      void utils.bounty.getPublic.invalidate({ id: bountyId });
      void utils.bounty.getMyClaimForBounty.invalidate({ bountyId });
    },
    onError: (error) => {
      notifications.show({
        title: "Failed to Claim",
        message: error.message,
        color: "red",
      });
    },
  });

  if (isLoading) {
    return (
      <Center py="xl" mt="xl">
        <Loader />
      </Center>
    );
  }

  if (!bounty) {
    return (
      <Container size="md" py="xl" mt="xl">
        <Stack align="center" gap="md">
          <Title order={2} className="text-text-primary">
            Bounty Not Found
          </Title>
          <Text className="text-text-secondary">
            This bounty may have been removed or doesn&apos;t exist.
          </Text>
          <Button component={Link} href="/explore" variant="light">
            Back to Explore
          </Button>
        </Stack>
      </Container>
    );
  }

  const status = bounty.bountyStatus ?? "OPEN";
  const activeClaimCount = bounty.bountyClaims.length;
  const maxReached = activeClaimCount >= bounty.bountyMaxClaimants;
  const hasActiveClaim = myClaim && (myClaim.status === "ACTIVE" || myClaim.status === "SUBMITTED");
  const isOpen = status === "OPEN" || status === "IN_PROGRESS";

  return (
    <Container size="md" py="xl" mt="xl">
      <Stack gap="lg">
        {/* Breadcrumbs */}
        <Breadcrumbs>
          <Anchor component={Link} href="/explore" className="text-text-secondary hover:text-text-primary">
            Explore
          </Anchor>
          <Anchor
            component={Link}
            href={`/explore/${projectSlug}`}
            className="text-text-secondary hover:text-text-primary"
          >
            {bounty.project?.name ?? projectSlug}
          </Anchor>
          <Text className="text-text-primary">{bounty.name}</Text>
        </Breadcrumbs>

        {/* Back link */}
        <Anchor
          component={Link}
          href={`/explore/${projectSlug}`}
          className="text-text-secondary hover:text-text-primary"
          style={{ width: "fit-content" }}
        >
          <Group gap={4}>
            <IconArrowLeft size={16} />
            <Text size="sm">Back to project</Text>
          </Group>
        </Anchor>

        {/* Header */}
        <div>
          <Group gap="sm" wrap="nowrap">
            <Title order={2} className="text-text-primary">
              {bounty.name}
            </Title>
            <Badge variant="light" color={STATUS_COLORS[status] ?? "gray"}>
              {status}
            </Badge>
            {bounty.bountyDifficulty && (
              <Badge variant="dot" color={DIFFICULTY_COLORS[bounty.bountyDifficulty] ?? "gray"}>
                {bounty.bountyDifficulty}
              </Badge>
            )}
          </Group>
        </div>

        {/* Details card */}
        <Card withBorder radius="md" className="border-border-primary bg-surface-secondary" p="lg">
          <Stack gap="md">
            {/* Description */}
            {bounty.description && (
              <Text className="text-text-secondary" style={{ whiteSpace: "pre-wrap" }}>
                {bounty.description}
              </Text>
            )}

            {/* Reward */}
            {bounty.bountyAmount != null && (
              <Group gap="sm">
                <IconCoin size={20} className="text-text-muted" />
                <Text size="lg" fw={700} className="text-text-primary">
                  {bounty.bountyAmount.toString()} {bounty.bountyToken ?? ""}
                </Text>
              </Group>
            )}

            {/* Skills */}
            {bounty.bountySkills.length > 0 && (
              <div>
                <Text size="sm" fw={500} className="text-text-secondary" mb={4}>
                  Required Skills
                </Text>
                <Group gap={6}>
                  {bounty.bountySkills.map((skill) => (
                    <Badge key={skill} variant="outline" size="sm">
                      {skill}
                    </Badge>
                  ))}
                </Group>
              </div>
            )}

            {/* Metadata row */}
            <Group gap="lg">
              <Group gap={4}>
                <IconCode size={16} className="text-text-muted" />
                <Text size="sm" className="text-text-secondary">
                  {activeClaimCount}/{bounty.bountyMaxClaimants} claimed
                </Text>
              </Group>
              {bounty.bountyDeadline && (
                <Group gap={4}>
                  <IconCalendar size={16} className="text-text-muted" />
                  <Text size="sm" className="text-text-secondary">
                    Due {new Date(bounty.bountyDeadline).toLocaleDateString()}
                  </Text>
                </Group>
              )}
            </Group>

            {/* External URL */}
            {bounty.bountyExternalUrl && (
              <Anchor
                href={bounty.bountyExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-secondary hover:text-text-primary"
              >
                <Group gap={4}>
                  <IconExternalLink size={16} />
                  <Text size="sm">View full specification</Text>
                </Group>
              </Anchor>
            )}
          </Stack>
        </Card>

        {/* Claim CTA */}
        <Card withBorder radius="md" className="border-border-primary bg-surface-secondary" p="lg">
          {!session?.user ? (
            <Stack align="center" gap="sm">
              <Text className="text-text-secondary">Sign in to claim this bounty</Text>
              <Button
                component={Link}
                href={`/signin?callbackUrl=/explore/${projectSlug}/bounties/${bountyId}`}
                size="md"
              >
                Sign in to Claim
              </Button>
            </Stack>
          ) : hasActiveClaim ? (
            <Stack align="center" gap="sm">
              <Text className="text-text-secondary">
                You have an active claim ({myClaim?.status})
              </Text>
              <Badge variant="light" color="blue" size="lg">
                Claimed
              </Badge>
            </Stack>
          ) : !isOpen ? (
            <Stack align="center" gap="sm">
              <Text className="text-text-secondary">This bounty is no longer open for claims</Text>
            </Stack>
          ) : maxReached ? (
            <Stack align="center" gap="sm">
              <Tooltip label="All available spots have been claimed">
                <Button size="md" disabled>
                  Max Claimants Reached
                </Button>
              </Tooltip>
            </Stack>
          ) : (
            <Stack align="center" gap="sm">
              <Button
                size="md"
                onClick={() => claimMutation.mutate({ bountyId })}
                loading={claimMutation.isPending}
              >
                Claim Bounty
              </Button>
            </Stack>
          )}
        </Card>

        {/* Active claims */}
        {bounty.bountyClaims.length > 0 && (
          <div>
            <Text fw={500} className="text-text-primary" mb="sm">
              Active Contributors
            </Text>
            <Stack gap="xs">
              {bounty.bountyClaims.map((claim) => (
                <Card
                  key={claim.id}
                  withBorder
                  radius="md"
                  className="border-border-primary bg-surface-secondary"
                  p="sm"
                >
                  <Group gap="sm">
                    <Avatar
                      src={claim.claimant.image}
                      size="sm"
                      radius="xl"
                    >
                      {(claim.claimant.displayName ?? "?").charAt(0).toUpperCase()}
                    </Avatar>
                    <Text size="sm" className="text-text-primary">
                      {claim.claimant.displayName ?? "Anonymous"}
                    </Text>
                    <Badge
                      variant="light"
                      color={claim.status === "SUBMITTED" ? "yellow" : "blue"}
                      size="xs"
                    >
                      {claim.status}
                    </Badge>
                  </Group>
                </Card>
              ))}
            </Stack>
          </div>
        )}
      </Stack>
    </Container>
  );
}

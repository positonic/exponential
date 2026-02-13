"use client";

import {
  Container,
  Card,
  Title,
  Text,
  Button,
  Stack,
  Alert,
  Avatar,
  Group,
  Badge,
  Skeleton,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconMail,
} from "@tabler/icons-react";
import { useParams, useRouter } from "next/navigation";
import { api } from "~/trpc/react";

export default function TeamInviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const {
    data: invitation,
    isLoading,
    error,
  } = api.team.getInvitationByToken.useQuery(
    { token },
    { enabled: !!token }
  );

  const acceptMutation = api.team.acceptInvitation.useMutation({
    onSuccess: (data) => {
      router.push(`/teams/${data.team.slug}`);
    },
  });

  if (isLoading) {
    return (
      <Container size="sm" className="py-16">
        <Card className="border-border-primary bg-surface-secondary" withBorder>
          <Stack gap="md" align="center">
            <Skeleton height={60} width={60} circle />
            <Skeleton height={24} width={200} />
            <Skeleton height={16} width={300} />
            <Skeleton height={40} width={150} />
          </Stack>
        </Card>
      </Container>
    );
  }

  if (error ?? !invitation) {
    return (
      <Container size="sm" className="py-16">
        <Card className="border-border-primary bg-surface-secondary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconAlertCircle size={48} className="text-red-500" />
            <Title order={2} className="text-text-primary">
              Invalid Invitation
            </Title>
            <Text className="text-center text-text-secondary">
              This invitation link is invalid or has been revoked.
            </Text>
            <Button variant="light" onClick={() => router.push("/")}>
              Go to Home
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (invitation.isExpired) {
    return (
      <Container size="sm" className="py-16">
        <Card className="border-border-primary bg-surface-secondary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconClock size={48} className="text-yellow-500" />
            <Title order={2} className="text-text-primary">
              Invitation Expired
            </Title>
            <Text className="text-center text-text-secondary">
              This invitation has expired. Please contact the team admin to
              request a new invitation.
            </Text>
            <Button variant="light" onClick={() => router.push("/")}>
              Go to Home
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (invitation.status !== "pending") {
    return (
      <Container size="sm" className="py-16">
        <Card className="border-border-primary bg-surface-secondary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconCheck size={48} className="text-green-500" />
            <Title order={2} className="text-text-primary">
              Invitation Already Used
            </Title>
            <Text className="text-center text-text-secondary">
              This invitation has already been accepted.
            </Text>
            <Button
              variant="light"
              onClick={() => router.push(`/teams/${invitation.team.slug}`)}
            >
              Go to Team
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (!invitation.isLoggedIn) {
    return (
      <Container size="sm" className="py-16">
        <Card className="border-border-primary bg-surface-secondary" withBorder>
          <Stack gap="lg" className="py-4">
            <Stack gap="md" align="center">
              <Avatar size="xl" color="brand" radius="xl">
                {invitation.team.name.charAt(0).toUpperCase()}
              </Avatar>
              <div className="text-center">
                <Title order={2} className="text-text-primary">
                  Join {invitation.team.name}
                </Title>
                <Text className="mt-1 text-text-secondary">
                  You&apos;ve been invited to join this team as a{" "}
                  <Badge color={invitation.role === "admin" ? "blue" : "green"} component="span">
                    {invitation.role}
                  </Badge>
                </Text>
              </div>
            </Stack>

            <Alert color="blue" icon={<IconMail size={16} />}>
              <Text size="sm" className="text-text-primary">
                Sign in or create an account with{" "}
                <strong>{invitation.email}</strong> to accept this invitation.
              </Text>
            </Alert>

            <Group justify="center">
              <Button onClick={() => router.push("/signin")} leftSection={<IconCheck size={16} />}>
                Sign In to Accept
              </Button>
            </Group>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (!invitation.isForCurrentUser) {
    return (
      <Container size="sm" className="py-16">
        <Card className="border-border-primary bg-surface-secondary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconMail size={48} className="text-blue-500" />
            <Title order={2} className="text-text-primary">
              Wrong Account
            </Title>
            <Text className="text-center text-text-secondary">
              This invitation was sent to <strong>{invitation.email}</strong>.
              Please sign in with that email address to accept.
            </Text>
            <Button variant="light" onClick={() => router.push("/signin")}>
              Sign In with Different Account
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="sm" className="py-16">
      <Card className="border-border-primary bg-surface-secondary" withBorder>
        <Stack gap="lg" className="py-4">
          <Stack gap="md" align="center">
            <Avatar size="xl" color="brand" radius="xl">
              {invitation.team.name.charAt(0).toUpperCase()}
            </Avatar>
            <div className="text-center">
              <Title order={2} className="text-text-primary">
                Join {invitation.team.name}
              </Title>
              <Text className="mt-1 text-text-secondary">
                You&apos;ve been invited to join this team
              </Text>
            </div>
          </Stack>

          <Card className="bg-surface-primary" withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" className="text-text-muted">
                  Team
                </Text>
                <Text size="sm" className="font-medium text-text-primary">
                  {invitation.team.name}
                </Text>
              </Group>
              {invitation.team.description && (
                <Group justify="space-between">
                  <Text size="sm" className="text-text-muted">
                    Description
                  </Text>
                  <Text size="sm" className="text-text-primary">
                    {invitation.team.description}
                  </Text>
                </Group>
              )}
              <Group justify="space-between">
                <Text size="sm" className="text-text-muted">
                  Your role
                </Text>
                <Badge
                  color={invitation.role === "admin" ? "blue" : "green"}
                >
                  {invitation.role}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm" className="text-text-muted">
                  Invited by
                </Text>
                <Text size="sm" className="text-text-primary">
                  {invitation.createdBy.name ?? invitation.createdBy.email}
                </Text>
              </Group>
            </Stack>
          </Card>

          {acceptMutation.error && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {acceptMutation.error.message}
            </Alert>
          )}

          <Group justify="center" gap="md">
            <Button
              variant="subtle"
              onClick={() => router.push("/")}
              className="text-text-secondary"
            >
              Decline
            </Button>
            <Button
              onClick={() => acceptMutation.mutate({ token })}
              loading={acceptMutation.isPending}
              leftSection={<IconCheck size={16} />}
            >
              Accept Invitation
            </Button>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
}

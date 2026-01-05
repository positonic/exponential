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

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const {
    data: invitation,
    isLoading,
    error,
  } = api.workspace.getInvitationByToken.useQuery(
    { token },
    { enabled: !!token }
  );

  const acceptMutation = api.workspace.acceptInvitation.useMutation({
    onSuccess: (data) => {
      router.push(`/w/${data.workspace.slug}`);
    },
  });

  if (isLoading) {
    return (
      <Container size="sm" className="py-16">
        <Card className="bg-surface-secondary border-border-primary" withBorder>
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

  if (error || !invitation) {
    return (
      <Container size="sm" className="py-16">
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconAlertCircle size={48} className="text-red-500" />
            <Title order={2} className="text-text-primary">
              Invalid Invitation
            </Title>
            <Text className="text-text-secondary text-center">
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
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconClock size={48} className="text-yellow-500" />
            <Title order={2} className="text-text-primary">
              Invitation Expired
            </Title>
            <Text className="text-text-secondary text-center">
              This invitation has expired. Please contact the workspace admin to
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
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconCheck size={48} className="text-green-500" />
            <Title order={2} className="text-text-primary">
              Invitation Already Used
            </Title>
            <Text className="text-text-secondary text-center">
              This invitation has already been accepted.
            </Text>
            <Button
              variant="light"
              onClick={() => router.push(`/w/${invitation.workspace.slug}`)}
            >
              Go to Workspace
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (!invitation.isForCurrentUser) {
    return (
      <Container size="sm" className="py-16">
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Stack gap="md" align="center" className="py-8">
            <IconMail size={48} className="text-blue-500" />
            <Title order={2} className="text-text-primary">
              Wrong Account
            </Title>
            <Text className="text-text-secondary text-center">
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
      <Card className="bg-surface-secondary border-border-primary" withBorder>
        <Stack gap="lg" className="py-4">
          <Stack gap="md" align="center">
            <Avatar size="xl" color="brand" radius="xl">
              {invitation.workspace.name.charAt(0).toUpperCase()}
            </Avatar>
            <div className="text-center">
              <Title order={2} className="text-text-primary">
                Join {invitation.workspace.name}
              </Title>
              <Text className="text-text-secondary mt-1">
                You&apos;ve been invited to join this workspace
              </Text>
            </div>
          </Stack>

          <Card className="bg-surface-primary" withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" className="text-text-muted">
                  Workspace
                </Text>
                <Text size="sm" className="text-text-primary font-medium">
                  {invitation.workspace.name}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" className="text-text-muted">
                  Your role
                </Text>
                <Badge
                  color={
                    invitation.role === "admin"
                      ? "blue"
                      : invitation.role === "viewer"
                        ? "gray"
                        : "green"
                  }
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

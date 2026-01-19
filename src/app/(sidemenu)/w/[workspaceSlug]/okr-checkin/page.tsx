"use client";

import { useState } from "react";
import {
  Container,
  Title,
  Text,
  Tabs,
  Card,
  Group,
  Select,
  Loader,
  Badge,
  Avatar,
  Stack,
  Alert,
} from "@mantine/core";
import {
  IconClipboardCheck,
  IconPlayerPlay,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { StatusUpdateForm } from "./_components/StatusUpdateForm";
import { TeamUpdatesGrid } from "./_components/TeamUpdatesGrid";
import { MeetingView } from "./_components/MeetingView";
import { CheckinSummary } from "./_components/CheckinSummary";

type Phase = "prep" | "meeting" | "summary";

export default function OkrCheckinPage() {
  const { workspace, workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<Phase>("prep");

  // Get available teams for this workspace
  const { data: teams, isLoading: teamsLoading } = api.okrCheckin.getAvailableTeams.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  // Get or create current check-in when team is selected
  const { data: checkin, isLoading: checkinLoading, refetch: refetchCheckin } =
    api.okrCheckin.getCurrentCheckin.useQuery(
      { teamId: selectedTeamId! },
      { enabled: !!selectedTeamId }
    );

  const createCheckinMutation = api.okrCheckin.getOrCreateCurrentCheckin.useMutation({
    onSuccess: () => {
      void refetchCheckin();
    },
  });

  // Auto-select first team if only one available
  const effectiveTeamId = selectedTeamId ?? (teams?.length === 1 ? teams[0]?.id : null);

  // Handle team selection and ensure check-in exists
  const handleTeamSelect = (teamId: string | null) => {
    setSelectedTeamId(teamId);
    if (teamId && workspaceId) {
      createCheckinMutation.mutate({ teamId, workspaceId });
    }
  };

  // Update phase based on check-in status
  const effectivePhase = checkin?.status === "COMPLETED"
    ? "summary"
    : checkin?.status === "IN_PROGRESS"
      ? "meeting"
      : activePhase;

  if (workspaceLoading) {
    return (
      <Container size="xl" py="xl">
        <div className="flex justify-center py-12">
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="xl" py="xl">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      {/* Header */}
      <Group justify="space-between" align="flex-start" mb="lg">
        <div>
          <Title order={1} className="text-text-primary">
            OKR Check-in
          </Title>
          <Text size="sm" c="dimmed">
            Weekly team sync for {workspace.name}
          </Text>
        </div>

        {/* Team Selector */}
        <Select
          placeholder="Select a team"
          data={teams?.map((t) => ({ value: t.id, label: t.name })) ?? []}
          value={effectiveTeamId}
          onChange={handleTeamSelect}
          disabled={teamsLoading}
          w={200}
          rightSection={teamsLoading ? <Loader size="xs" /> : undefined}
        />
      </Group>

      {/* No teams message */}
      {!teamsLoading && teams?.length === 0 && (
        <Alert icon={<IconAlertCircle size={16} />} title="No Teams Found" color="yellow">
          You need to be a member of a team to use OKR Check-ins.
          Create a team or ask to be added to one in workspace settings.
        </Alert>
      )}

      {/* Main content when team is selected */}
      {effectiveTeamId && (
        <>
          {checkinLoading || createCheckinMutation.isPending ? (
            <div className="flex justify-center py-12">
              <Loader size="lg" />
            </div>
          ) : checkin ? (
            <>
              {/* Check-in Info Bar */}
              <Card withBorder mb="md" p="sm">
                <Group justify="space-between">
                  <Group gap="md">
                    <Badge
                      color={
                        checkin.status === "COMPLETED"
                          ? "green"
                          : checkin.status === "IN_PROGRESS"
                            ? "blue"
                            : "gray"
                      }
                      size="lg"
                    >
                      {checkin.status === "COMPLETED"
                        ? "Completed"
                        : checkin.status === "IN_PROGRESS"
                          ? "In Progress"
                          : "Preparing"}
                    </Badge>
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">Facilitator:</Text>
                      <Avatar src={checkin.facilitator.image} size="sm" radius="xl" />
                      <Text size="sm">{checkin.facilitator.name}</Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      Week of {new Date(checkin.weekStartDate).toLocaleDateString()}
                    </Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">
                      {checkin.statusUpdates.filter((u) => u.isSubmitted).length} / {checkin.team?.members.length ?? 0} submitted
                    </Text>
                  </Group>
                </Group>
              </Card>

              {/* Phase Tabs */}
              <Tabs value={effectivePhase} onChange={(v) => setActivePhase(v as Phase)}>
                <Tabs.List mb="md">
                  <Tabs.Tab
                    value="prep"
                    leftSection={<IconClipboardCheck size={16} />}
                    disabled={checkin.status === "COMPLETED"}
                  >
                    Prep
                  </Tabs.Tab>
                  <Tabs.Tab
                    value="meeting"
                    leftSection={<IconPlayerPlay size={16} />}
                    disabled={checkin.status === "COMPLETED"}
                  >
                    Meeting
                  </Tabs.Tab>
                  <Tabs.Tab
                    value="summary"
                    leftSection={<IconCheck size={16} />}
                  >
                    Summary
                  </Tabs.Tab>
                </Tabs.List>

                {/* Prep Phase */}
                <Tabs.Panel value="prep">
                  <Stack gap="lg">
                    {/* User's own status update form */}
                    <Card withBorder>
                      <Title order={3} mb="md">Your Status Update</Title>
                      <StatusUpdateForm
                        okrCheckinId={checkin.id}
                        existingUpdate={checkin.statusUpdates.find(
                          (u) => u.user.id === checkin.facilitator.id // This should check current user
                        )}
                        onSubmit={() => void refetchCheckin()}
                      />
                    </Card>

                    {/* Team updates grid */}
                    <Card withBorder>
                      <Title order={3} mb="md">Team Updates</Title>
                      <TeamUpdatesGrid
                        okrCheckinId={checkin.id}
                        teamMembers={checkin.team?.members ?? []}
                        statusUpdates={checkin.statusUpdates}
                      />
                    </Card>
                  </Stack>
                </Tabs.Panel>

                {/* Meeting Phase */}
                <Tabs.Panel value="meeting">
                  <MeetingView
                    checkin={checkin}
                    onComplete={() => void refetchCheckin()}
                  />
                </Tabs.Panel>

                {/* Summary Phase */}
                <Tabs.Panel value="summary">
                  <CheckinSummary checkin={checkin} />
                </Tabs.Panel>
              </Tabs>
            </>
          ) : (
            <Alert icon={<IconAlertCircle size={16} />} color="red">
              Failed to load or create check-in. Please try again.
            </Alert>
          )}
        </>
      )}
    </Container>
  );
}

"use client";

import { useState } from "react";
import { OneOnOneBoard } from "~/app/_components/OneOnOneBoard";
import { ShareableLinks } from "~/app/_components/ShareableLinks";
import { Container, Group, Button, Title, Text, Modal, Stack, Select, Alert, Loader } from "@mantine/core";
import { IconSettings, IconBrandSlack, IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { api } from "~/trpc/react";

export function WeeklyReviewPageClient() {
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedIntegration, setSelectedIntegration] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("");

  // Get preview data and available integrations
  const { data: previewData, isLoading: previewLoading } = api.weeklyReview.getWeeklyReviewPreview.useQuery(
    {},
    { enabled: opened } // Only fetch when modal is opened
  );

  // Get available channels for selected integration
  const { data: availableChannels, isLoading: channelsLoading } = api.weeklyReview.getAvailableSlackChannels.useQuery(
    { integrationId: selectedIntegration },
    { enabled: !!selectedIntegration }
  );

  // Send to Slack mutation
  const sendToSlackMutation = api.weeklyReview.sendWeeklyReviewToSlack.useMutation({
    onSuccess: (result) => {
      notifications.show({
        title: "Success!",
        message: result.message,
        color: "green",
        icon: <IconCheck size={16} />,
      });
      close();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const handleSendToSlack = () => {
    sendToSlackMutation.mutate({
      integrationId: selectedIntegration || undefined,
      channelOverride: selectedChannel || undefined,
    });
  };

  const handleOpenModal = () => {
    open();
    // Reset selections when opening modal
    if (previewData?.availableIntegrations?.length ?? 0 > 0) {
      const firstIntegration = previewData?.availableIntegrations?.[0];
      if (firstIntegration) {
        setSelectedIntegration(firstIntegration.id);
      }
    }
    if (previewData?.defaultChannel) {
      setSelectedChannel(previewData.defaultChannel);
    }
  };

  // Prepare integration options for Select component
  const integrationOptions = previewData?.availableIntegrations?.map(integration => ({
    value: integration.id,
    label: integration.name || `Slack Integration`
  })) ?? [];

  // Prepare channel options for Select component
  const channelOptions = availableChannels?.map(channel => ({
    value: channel.name,
    label: `${channel.name} ${channel.type === 'private' ? '(Private)' : ''}`
  })) ?? [];

  const hasSlackIntegration = integrationOptions.length > 0;

  return (
    <>
      {/* Header with Settings Link and Send to Slack Button */}
      <Container size="xl" py="md">
        <Group justify="space-between" align="center">
          <div>
            <Title order={1} className="text-text-primary">
              Weekly Review
            </Title>
            <Text size="sm" c="dimmed">
              Review your active projects and weekly outcomes
            </Text>
          </div>
          <Group>
            <Button
              variant="filled"
              leftSection={<IconBrandSlack size={16} />}
              onClick={handleOpenModal}
              disabled={!hasSlackIntegration}
              loading={previewLoading}
            >
              Send to Slack
            </Button>
            <Button
              variant="light"
              leftSection={<IconSettings size={16} />}
              component={Link}
              href="/weekly-review/settings"
            >
              Sharing Settings
            </Button>
          </Group>
        </Group>
      </Container>
      
      {/* Shareable Links Section */}
      <Container size="xl" py="md">
        <ShareableLinks />
      </Container>
      
      {/* Main Content */}
      <OneOnOneBoard />

      {/* Send to Slack Modal */}
      <Modal
        opened={opened}
        onClose={close}
        title="Send Weekly Review to Slack"
        size="md"
      >
        <Stack gap="md">
          {!hasSlackIntegration ? (
            <Alert 
              icon={<IconAlertCircle size={16} />} 
              title="No Slack Integration" 
              color="orange"
            >
              You need to configure a Slack integration first. Go to the Integrations page to set up Slack.
            </Alert>
          ) : (
            <>
              {/* Preview Section */}
              {previewData?.summary && (
                <div>
                  <Text size="sm" fw={600} mb="xs">Preview:</Text>
                  <Alert color="blue" p="md">
                    <Text size="sm" fw={600}>{previewData.summary.title}</Text>
                    <Text size="xs" c="dimmed" mt="xs">
                      {previewData.summary.message.slice(0, 200)}...
                    </Text>
                  </Alert>
                </div>
              )}

              {/* Integration Selection */}
              <Select
                label="Slack Integration"
                placeholder="Select a Slack workspace"
                data={integrationOptions}
                value={selectedIntegration}
                onChange={(value) => {
                  setSelectedIntegration(value ?? "");
                  setSelectedChannel(""); // Reset channel when integration changes
                }}
                required
              />

              {/* Channel Selection */}
              <Select
                label="Slack Channel"
                placeholder={channelsLoading ? "Loading channels..." : "Select a channel"}
                data={channelOptions}
                value={selectedChannel}
                onChange={(value) => setSelectedChannel(value ?? "")}
                disabled={!selectedIntegration || channelsLoading}
                searchable
                required
                rightSection={channelsLoading ? <Loader size="xs" /> : undefined}
              />

              {/* Action Buttons */}
              <Group justify="flex-end" mt="md">
                <Button variant="light" onClick={close}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendToSlack}
                  loading={sendToSlackMutation.isPending}
                  disabled={!selectedIntegration || !selectedChannel}
                  leftSection={<IconBrandSlack size={16} />}
                >
                  Send to Slack
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
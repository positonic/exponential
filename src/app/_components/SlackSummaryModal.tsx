'use client';

import { useState } from 'react';
import { 
  Modal, 
  Stack, 
  Text, 
  Button, 
  Checkbox, 
  Select,
  Group,
  Alert
} from '@mantine/core';
import { IconAlertCircle, IconBrandSlack } from '@tabler/icons-react';
import { api } from '~/trpc/react';

interface SlackSummaryModalProps {
  opened: boolean;
  onClose: () => void;
  transcriptionId: string;
  meetingTitle: string;
  projectId?: string | null;
  teamId?: string | null;
}

export function SlackSummaryModal({
  opened,
  onClose,
  transcriptionId,
  meetingTitle,
  projectId,
  teamId
}: SlackSummaryModalProps) {
  const [sendSummary, setSendSummary] = useState(true);
  const [sendActions, setSendActions] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  // Get available Slack channels
  const { data: channels, isLoading: channelsLoading } = api.slack.getChannelsForMeeting.useQuery({
    projectId: projectId || undefined,
    teamId: teamId || undefined,
  }, {
    enabled: opened
  });

  // Get default channel configuration
  const { data: defaultChannel } = api.slack.getDefaultChannel.useQuery({
    projectId: projectId || undefined,
    teamId: teamId || undefined,
  }, {
    enabled: opened
  });

  // Update selected channel when default channel loads
  if (defaultChannel?.channel && !selectedChannel) {
    setSelectedChannel(defaultChannel.channel);
  }

  const sendSlackSummaryMutation = api.transcription.sendSlackSummary.useMutation({
    onSuccess: () => {
      onClose();
    }
  });

  const handleSend = () => {
    if (!selectedChannel) return;
    if (!sendSummary && !sendActions) return;

    sendSlackSummaryMutation.mutate({
      transcriptionId,
      channel: selectedChannel,
      includeSummary: sendSummary,
      includeActions: sendActions,
    });
  };

  const channelOptions = channels?.map(channel => ({
    value: channel.id,
    label: `#${channel.name}${channel.isDefault ? ' (default)' : ''}`
  })) || [];

  const canSend = selectedChannel && (sendSummary || sendActions);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <IconBrandSlack size={20} />
          <Text fw={600}>Send to Slack</Text>
        </Group>
      }
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Send meeting summary and actions for &quot;{meetingTitle}&quot;
        </Text>

        {/* Channel Selection */}
        <Select
          label="Slack Channel"
          placeholder={channelsLoading ? "Loading channels..." : "Select a channel"}
          data={channelOptions}
          value={selectedChannel}
          onChange={setSelectedChannel}
          searchable
          required
          disabled={channelsLoading}
        />

        {selectedChannel && defaultChannel?.channel === selectedChannel && (
          <Alert color="blue" variant="light" icon={<IconAlertCircle size={16} />}>
            {projectId ? 
              'This is the default configured channel for this project.' :
              teamId ? 
                'This is the default configured channel for this team.' :
                'This is a default channel from your Slack integration.'
            }
          </Alert>
        )}

        {!projectId && !teamId && (
          <Alert color="cyan" variant="light">
            💡 This meeting isn&apos;t assigned to a project. Actions will appear in your personal inbox and can be assigned to projects later.
          </Alert>
        )}

        {/* Content Options */}
        <Stack gap="xs">
          <Text size="sm" fw={500}>What to send:</Text>
          
          <Checkbox
            label="Meeting Summary"
            description="Send the detailed breakdown from the meeting"
            checked={sendSummary}
            onChange={(event) => setSendSummary(event.currentTarget.checked)}
          />
          
          <Checkbox
            label="Action Items"
            description="Send the list of action items created from this meeting"
            checked={sendActions}
            onChange={(event) => setSendActions(event.currentTarget.checked)}
          />
        </Stack>

        {!sendSummary && !sendActions && (
          <Alert color="orange" variant="light">
            Please select at least one content type to send.
          </Alert>
        )}

        {/* Action Buttons */}
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            loading={sendSlackSummaryMutation.isPending}
            disabled={!canSend}
            leftSection={<IconBrandSlack size={16} />}
          >
            Send to Slack
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
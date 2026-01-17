"use client";

import { useState, useEffect } from "react";
import {
  Modal,
  Stack,
  Text,
  Button,
  Radio,
  Group,
  Progress,
  Badge,
  Alert,
  List,
  Divider,
  Paper,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconCalendar,
  IconMail,
  IconAlertCircle,
  IconCheck,
  IconBrandGoogle,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { subMonths, subYears } from "date-fns";

interface ImportDialogProps {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
}

type ImportStep = "connect" | "options" | "progress" | "success";
type ImportSource = "GMAIL" | "CALENDAR" | "BOTH";

interface DateRange {
  start: Date;
  end: Date;
}

export function ImportDialog({
  opened,
  onClose,
  workspaceId,
}: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("connect");
  const [source, setSource] = useState<ImportSource>("BOTH");
  const [dateRange, setDateRange] = useState<DateRange>({
    start: subYears(new Date(), 1),
    end: new Date(),
  });
  const [batchId, setBatchId] = useState<string | null>(null);

  // Check Google connection
  const { data: connection, isLoading: connectionLoading } =
    api.crmContact.getGoogleConnection.useQuery(
      { workspaceId },
      { enabled: opened }
    );

  // Import mutation
  const importMutation = api.crmContact.importContacts.useMutation({
    onSuccess: (data) => {
      setBatchId(data.batchId);
      setStep("progress");
    },
    onError: (error) => {
      notifications.show({
        title: "Import Failed",
        message: error.message,
        color: "red",
        icon: <IconAlertCircle />,
      });
    },
  });

  // Poll import status
  const { data: importStatus } = api.crmContact.getImportStatus.useQuery(
    { batchId: batchId ?? "" },
    {
      enabled: step === "progress" && batchId !== null,
      refetchInterval: 2000, // Poll every 2 seconds
    }
  );

  // Handle import completion
  useEffect(() => {
    if (importStatus?.status === "COMPLETED" || importStatus?.status === "PARTIAL_SUCCESS") {
      setStep("success");
    }
  }, [importStatus?.status]);

  // Determine initial step based on connection
  useEffect(() => {
    if (!connectionLoading && opened) {
      if (connection && connection.hasAllScopes && connection.hasRefreshToken) {
        setStep("options");  // Has Google with all scopes → Go to import options
      } else {
        setStep("connect");  // No Google or missing scopes/refresh token → Show connect step
      }
    }
  }, [connection, connectionLoading, opened]);

  // Reset state on close
  const handleClose = () => {
    setStep("connect");
    setSource("BOTH");
    setDateRange({
      start: subYears(new Date(), 1),
      end: new Date(),
    });
    setBatchId(null);
    onClose();
  };

  // Handle OAuth redirect
  const handleConnectGoogle = () => {
    const returnUrl = window.location.pathname;
    window.location.href = `/api/auth/google-calendar?returnUrl=${encodeURIComponent(returnUrl)}`;
  };

  // Handle import start
  const handleStartImport = () => {
    importMutation.mutate({
      workspaceId,
      source,
      dateRange: source === "CALENDAR" || source === "BOTH" ? dateRange : undefined,
    });
  };

  // Calculate progress percentage
  const progressPercentage =
    importStatus?.totalContacts ?? 0 > 0
      ? Math.round(
          ((importStatus?.processedContacts ?? 0) /
            (importStatus?.totalContacts ?? 1)) *
            100
        )
      : 0;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Import Contacts"
      size="lg"
      closeOnClickOutside={step !== "progress"}
      closeOnEscape={step !== "progress"}
    >
      <Stack gap="lg">
        {/* Connect Step */}
        {step === "connect" && (
          <>
            {connection && (!connection.hasAllScopes || !connection.hasRefreshToken) ? (
              <Alert icon={<IconAlertCircle />} color="yellow" mb="md">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>
                    Additional permissions required
                  </Text>
                  <Text size="sm">
                    {!connection.hasRefreshToken
                      ? "Your Google connection is missing the refresh token needed for importing contacts. "
                      : "Your Google account needs additional permissions to import contacts. "}
                    Please reconnect to grant the required access.
                  </Text>
                </Stack>
              </Alert>
            ) : (
              <Text size="sm" c="dimmed">
                Connect your Google account to import contacts from Gmail and
                Google Calendar.
              </Text>
            )}

            <Paper p="md" withBorder>
              <Stack gap="sm">
                <Group gap="xs">
                  <IconBrandGoogle size={20} />
                  <Text fw={500}>Google Account</Text>
                </Group>
                <Text size="sm" c="dimmed">
                  We&apos;ll request access to:
                </Text>
                <List size="sm" spacing="xs">
                  <List.Item>
                    <strong>Google Contacts</strong> - Read your contacts
                  </List.Item>
                  <List.Item>
                    <strong>Gmail</strong> - Read email metadata (read-only)
                  </List.Item>
                  <List.Item>
                    <strong>Google Calendar</strong> - Read calendar events
                  </List.Item>
                </List>
              </Stack>
            </Paper>

            <Alert icon={<IconAlertCircle />} color="blue">
              Your data is encrypted and stored securely. We only access
              information necessary for contact management.
            </Alert>

            <Button
              leftSection={<IconBrandGoogle />}
              onClick={handleConnectGoogle}
              loading={connectionLoading}
            >
              {connection ? "Reconnect Google Account" : "Connect Google Account"}
            </Button>
          </>
        )}

        {/* Options Step */}
        {step === "options" && (
          <>
            <Text size="sm" c="dimmed">
              Choose where to import contacts from and configure options.
            </Text>

            <Divider label="Import Source" labelPosition="center" />

            <Radio.Group
              value={source}
              onChange={(value) => setSource(value as ImportSource)}
            >
              <Stack gap="sm">
                <Radio
                  value="BOTH"
                  label={
                    <Group gap="xs">
                      <IconMail size={16} />
                      <IconCalendar size={16} />
                      <Text size="sm">
                        <strong>Gmail & Calendar</strong> - Import from both
                        sources (Recommended)
                      </Text>
                    </Group>
                  }
                  description="Get the most complete view of your connections"
                />
                <Radio
                  value="GMAIL"
                  label={
                    <Group gap="xs">
                      <IconMail size={16} />
                      <Text size="sm">
                        <strong>Gmail Contacts Only</strong> - Import from
                        Google Contacts
                      </Text>
                    </Group>
                  }
                  description="Import saved contacts from your Gmail address book"
                />
                <Radio
                  value="CALENDAR"
                  label={
                    <Group gap="xs">
                      <IconCalendar size={16} />
                      <Text size="sm">
                        <strong>Calendar Events Only</strong> - Extract from
                        meeting attendees
                      </Text>
                    </Group>
                  }
                  description="Discover contacts from people you've met with"
                />
              </Stack>
            </Radio.Group>

            {(source === "CALENDAR" || source === "BOTH") && (
              <>
                <Divider label="Date Range" labelPosition="center" />

                <Stack gap="xs">
                  <Text size="sm" fw={500}>
                    Calendar Event Date Range
                  </Text>
                  <Text size="xs" c="dimmed">
                    Import contacts from calendar events within this period
                  </Text>

                  <Group grow>
                    <DatePickerInput
                      label="Start Date"
                      placeholder="Select start date"
                      value={dateRange.start}
                      onChange={(date) =>
                        date && setDateRange({ ...dateRange, start: date })
                      }
                      maxDate={dateRange.end}
                    />
                    <DatePickerInput
                      label="End Date"
                      placeholder="Select end date"
                      value={dateRange.end}
                      onChange={(date) =>
                        date && setDateRange({ ...dateRange, end: date })
                      }
                      minDate={dateRange.start}
                      maxDate={new Date()}
                    />
                  </Group>

                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() =>
                        setDateRange({
                          start: subMonths(new Date(), 6),
                          end: new Date(),
                        })
                      }
                    >
                      Last 6 Months
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() =>
                        setDateRange({
                          start: subYears(new Date(), 1),
                          end: new Date(),
                        })
                      }
                    >
                      Last Year
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() =>
                        setDateRange({
                          start: subYears(new Date(), 2),
                          end: new Date(),
                        })
                      }
                    >
                      Last 2 Years
                    </Button>
                  </Group>
                </Stack>

                {dateRange.start <
                  subYears(new Date(), 2) && (
                  <Alert icon={<IconAlertCircle />} color="yellow">
                    Large date ranges may take longer to process. Consider
                    importing a shorter time period first.
                  </Alert>
                )}
              </>
            )}

            <Group justify="space-between" mt="md">
              <Button variant="subtle" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleStartImport}
                loading={importMutation.isPending}
              >
                Start Import
              </Button>
            </Group>
          </>
        )}

        {/* Progress Step */}
        {step === "progress" && (
          <>
            <Text size="sm" c="dimmed">
              Importing your contacts... This may take a few minutes.
            </Text>

            <Stack gap="md">
              <div>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>
                    Progress
                  </Text>
                  <Text size="sm" c="dimmed">
                    {importStatus?.processedContacts ?? 0} of{" "}
                    {importStatus?.totalContacts ?? 0} contacts
                  </Text>
                </Group>
                <Progress
                  value={progressPercentage}
                  size="lg"
                  animated
                  striped
                />
              </div>

              <Paper p="md" withBorder>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm">Status:</Text>
                    <Badge
                      color={
                        importStatus?.status === "IN_PROGRESS"
                          ? "blue"
                          : "gray"
                      }
                      variant="light"
                    >
                      {importStatus?.status ?? "PENDING"}
                    </Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">New Contacts:</Text>
                    <Text size="sm" fw={500}>
                      {importStatus?.newContacts ?? 0}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Updated Contacts:</Text>
                    <Text size="sm" fw={500}>
                      {importStatus?.updatedContacts ?? 0}
                    </Text>
                  </Group>
                  {(importStatus?.errorCount ?? 0) > 0 && (
                    <Group justify="space-between">
                      <Text size="sm" c="red">
                        Errors:
                      </Text>
                      <Text size="sm" fw={500} c="red">
                        {importStatus?.errorCount}
                      </Text>
                    </Group>
                  )}
                </Stack>
              </Paper>

              <Alert icon={<IconAlertCircle />} color="blue">
                Please keep this window open while importing. You can continue
                working in other tabs.
              </Alert>
            </Stack>
          </>
        )}

        {/* Success Step */}
        {step === "success" && (
          <>
            <Alert icon={<IconCheck />} color="green" title="Import Complete">
              Your contacts have been successfully imported!
            </Alert>

            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Import Summary
                </Text>
                <Divider />
                <Group justify="space-between">
                  <Text size="sm">Total Processed:</Text>
                  <Text size="sm" fw={500}>
                    {importStatus?.processedContacts ?? 0}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="green">
                    New Contacts:
                  </Text>
                  <Text size="sm" fw={500} c="green">
                    {importStatus?.newContacts ?? 0}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="blue">
                    Updated Contacts:
                  </Text>
                  <Text size="sm" fw={500} c="blue">
                    {importStatus?.updatedContacts ?? 0}
                  </Text>
                </Group>
                {(importStatus?.errorCount ?? 0) > 0 && (
                  <>
                    <Group justify="space-between">
                      <Text size="sm" c="red">
                        Errors:
                      </Text>
                      <Text size="sm" fw={500} c="red">
                        {importStatus?.errorCount}
                      </Text>
                    </Group>
                    <Alert icon={<IconAlertCircle />} color="yellow" mt="xs">
                      Some contacts could not be imported. This is usually due
                      to missing email addresses or invalid data.
                    </Alert>
                  </>
                )}
              </Stack>
            </Paper>

            <Text size="sm" c="dimmed">
              Connection scores are being calculated in the background based on
              interaction recency and frequency.
            </Text>

            <Button onClick={handleClose} fullWidth>
              Done
            </Button>
          </>
        )}
      </Stack>
    </Modal>
  );
}

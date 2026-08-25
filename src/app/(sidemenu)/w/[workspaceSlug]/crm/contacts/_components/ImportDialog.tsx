"use client";

import { useState, useEffect, useRef } from "react";
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
  Divider,
  Paper,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconCalendar,
  IconMail,
  IconAlertCircle,
  IconCheck,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { subMonths, subYears } from "date-fns";
import { GooglePremiumFeature } from "~/app/_components/GooglePremiumFeature";

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

interface ImportProgress {
  phase: "GMAIL" | "CALENDAR" | null;
  processed: number;
  created: number;
  updated: number;
  errorCount: number;
  errors: string[];
}

const PHASE_LABELS: Record<"GMAIL" | "CALENDAR", string> = {
  GMAIL: "Importing Google Contacts…",
  CALENDAR: "Importing calendar attendees…",
};

/**
 * Safety valve on the step loop: far above any real import (each step
 * covers a Google page), but keeps a misbehaving server from spinning the
 * client forever. Retry resumes the same batch, so hitting it loses nothing.
 */
const MAX_STEPS_PER_RUN = 2000;

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
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // The server batch carries the resume cursor (Google page tokens), so
  // retrying with the same batchId continues where the failed step stopped.
  const batchIdRef = useRef<string | null>(null);

  // Check Google connection
  const { data: connection, isLoading: connectionLoading } =
    api.crmContact.getGoogleConnection.useQuery(
      { workspaceId },
      { enabled: opened }
    );

  const importMutation = api.crmContact.importContacts.useMutation();

  // Drive the import step by step, sequentially; each step fetches one slice
  // from Google, processes it inside its own request, and returns the
  // batch's cumulative counters. Background processing doesn't survive
  // serverless, so the client is the loop.
  const runImport = async () => {
    setStep("progress");
    setImportError(null);
    try {
      let completed = false;
      let steps = 0;
      while (!completed) {
        if (++steps > MAX_STEPS_PER_RUN) {
          throw new Error("The import is taking unusually long");
        }
        const result = await importMutation.mutateAsync({
          workspaceId,
          source,
          dateRange:
            source === "CALENDAR" || source === "BOTH" ? dateRange : undefined,
          batchId: batchIdRef.current,
        });
        batchIdRef.current = result.batchId;
        completed = result.completed;
        setProgress({
          phase: result.phase,
          processed: result.processedContacts,
          created: result.newContacts,
          updated: result.updatedContacts,
          errorCount: result.errorCount,
          errors: result.errors,
        });
      }
      setStep("success");
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "The import was interrupted",
      );
    }
  };

  // Determine initial step based on connection
  useEffect(() => {
    if (!connectionLoading && opened) {
      if (connection?.hasAllScopes && connection.hasRefreshToken) {
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
    setProgress(null);
    setImportError(null);
    batchIdRef.current = null;
    onClose();
  };

  // Handle import start
  const handleStartImport = () => {
    batchIdRef.current = null;
    setProgress(null);
    void runImport();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Import Contacts"
      size="lg"
      closeOnClickOutside={step !== "progress" || importError !== null}
      closeOnEscape={step !== "progress" || importError !== null}
    >
      <Stack gap="lg">
        {/* Connect step: there is deliberately no connect button. Requesting
            the contacts scope is paused while Google's OAuth verification is
            in progress (see googleScopes.ts), so new grants cannot be
            started — only accounts that already granted access can import,
            and those skip straight to the options step. */}
        {step === "connect" && (
          <GooglePremiumFeature feature="contacts" variant="alert" />
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
                        <strong>Contacts & Calendar</strong> - Import from both
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
                        <strong>Google Contacts Only</strong> - Import from
                        your saved contacts
                      </Text>
                    </Group>
                  }
                  description="Import saved contacts from your Google Contacts address book"
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
              {progress?.phase
                ? PHASE_LABELS[progress.phase]
                : "Importing your contacts…"}{" "}
              This may take a few minutes.
            </Text>

            <Stack gap="md">
              <div>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>
                    Progress
                  </Text>
                  <Text size="sm" c="dimmed">
                    {progress?.processed ?? 0} contacts processed
                  </Text>
                </Group>
                {/* Google doesn't announce a total upfront (calendar
                    contacts are discovered page by page), so the bar is
                    indeterminate: full-width, animated while running. */}
                <Progress
                  value={100}
                  size="lg"
                  animated={importError === null}
                  striped
                />
              </div>

              <Paper p="md" withBorder>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm">Status:</Text>
                    <Badge
                      color={importError === null ? "blue" : "red"}
                      variant="light"
                    >
                      {importError === null ? "IN_PROGRESS" : "INTERRUPTED"}
                    </Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">New Contacts:</Text>
                    <Text size="sm" fw={500}>
                      {progress?.created ?? 0}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Updated Contacts:</Text>
                    <Text size="sm" fw={500}>
                      {progress?.updated ?? 0}
                    </Text>
                  </Group>
                  {(progress?.errorCount ?? 0) > 0 && (
                    <Group justify="space-between">
                      <Text size="sm" c="red">
                        Errors:
                      </Text>
                      <Text size="sm" fw={500} c="red">
                        {progress?.errorCount}
                      </Text>
                    </Group>
                  )}
                </Stack>
              </Paper>

              {importError !== null ? (
                <Alert
                  icon={<IconAlertCircle />}
                  color="red"
                  title="Import interrupted"
                >
                  <Stack gap="xs" align="flex-start">
                    <Text size="sm">
                      {importError} — nothing was lost; Retry continues from
                      where it stopped.
                    </Text>
                    <Button size="xs" onClick={() => void runImport()}>
                      Retry
                    </Button>
                  </Stack>
                </Alert>
              ) : (
                <Alert icon={<IconAlertCircle />} color="blue">
                  Please keep this window open while importing. You can
                  continue working in other tabs.
                </Alert>
              )}
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
                    {progress?.processed ?? 0}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="green">
                    New Contacts:
                  </Text>
                  <Text size="sm" fw={500} c="green">
                    {progress?.created ?? 0}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="blue">
                    Updated Contacts:
                  </Text>
                  <Text size="sm" fw={500} c="blue">
                    {progress?.updated ?? 0}
                  </Text>
                </Group>
                {(progress?.errorCount ?? 0) > 0 && (
                  <>
                    <Group justify="space-between">
                      <Text size="sm" c="red">
                        Errors:
                      </Text>
                      <Text size="sm" fw={500} c="red">
                        {progress?.errorCount}
                      </Text>
                    </Group>
                    <Alert icon={<IconAlertCircle />} color="yellow" mt="xs">
                      Some contacts could not be imported. This is usually due
                      to missing email addresses or invalid data.
                    </Alert>
                    {(progress?.errors.length ?? 0) > 0 && (
                      <Stack gap={2} mt="xs">
                        {progress?.errors.map((line, i) => (
                          <Text key={i} size="xs" c="dimmed">
                            {line}
                          </Text>
                        ))}
                      </Stack>
                    )}
                  </>
                )}
              </Stack>
            </Paper>

            <Text size="sm" c="dimmed">
              Connection scores are calculated as each contact&apos;s meetings
              are imported.
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

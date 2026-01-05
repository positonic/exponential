"use client";

import {
  Modal,
  Button,
  Group,
  TextInput,
  Textarea,
  Stack,
  Switch,
  NumberInput,
  Text,
  Alert,
} from "@mantine/core";
import { DateInput, TimeInput } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import {
  IconCalendarPlus,
  IconAlertCircle,
  IconVideo,
  IconExternalLink,
} from "@tabler/icons-react";
import { GoogleCalendarConnect } from "./GoogleCalendarConnect";

interface CreateMeetingModalProps {
  projectId: string;
  projectName: string;
  children?: React.ReactNode;
}

export function CreateMeetingModal({
  projectId,
  projectName,
  children,
}: CreateMeetingModalProps) {
  const [opened, { open, close }] = useDisclosure(false);

  // Form state
  const [title, setTitle] = useState(`${projectName} Meeting`);
  const [description, setDescription] = useState("");
  const [meetingDate, setMeetingDate] = useState<Date | null>(new Date());
  const [startTime, setStartTime] = useState("10:00");
  const [duration, setDuration] = useState<number | string>(60);
  const [attendeeEmails, setAttendeeEmails] = useState("");
  const [includeGoogleMeet, setIncludeGoogleMeet] = useState(true);

  // Check calendar connection status
  const { data: connectionStatus, isLoading: statusLoading } =
    api.calendar.getConnectionStatus.useQuery();

  // Reset form when project changes
  useEffect(() => {
    setTitle(`${projectName} Meeting`);
  }, [projectName]);

  const utils = api.useUtils();

  const createEvent = api.calendar.createEvent.useMutation({
    onSuccess: (event) => {
      // Clear calendar cache
      void utils.calendar.getTodayEvents.invalidate();
      void utils.calendar.getUpcomingEvents.invalidate();
      void utils.calendar.getEvents.invalidate();

      close();
      resetForm();

      notifications.show({
        title: "Meeting Created",
        message: (
          <Stack gap="xs">
            <Text size="sm">
              Your meeting has been added to Google Calendar.
            </Text>
            {event.htmlLink && (
              <Button
                component="a"
                href={event.htmlLink}
                target="_blank"
                variant="light"
                size="xs"
                leftSection={<IconExternalLink size={14} />}
              >
                View in Calendar
              </Button>
            )}
          </Stack>
        ),
        color: "green",
        autoClose: 8000,
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to create meeting",
        color: "red",
      });
    },
  });

  const resetForm = () => {
    setTitle(`${projectName} Meeting`);
    setDescription("");
    setMeetingDate(new Date());
    setStartTime("10:00");
    setDuration(60);
    setAttendeeEmails("");
    setIncludeGoogleMeet(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !meetingDate) return;

    // Parse start time
    const [hoursStr, minutesStr] = startTime.split(":");
    const hours = parseInt(hoursStr ?? "10", 10);
    const minutes = parseInt(minutesStr ?? "0", 10);
    const startDateTime = new Date(meetingDate);
    startDateTime.setHours(hours, minutes, 0, 0);

    // Calculate end time
    const durationNum = typeof duration === "number" ? duration : 60;
    const endDateTime = new Date(startDateTime.getTime() + durationNum * 60000);

    // Get user's timezone
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Parse attendee emails
    const attendees = attendeeEmails
      .split(/[,;\s]+/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0 && email.includes("@"))
      .map((email) => ({ email }));

    createEvent.mutate({
      summary: title.trim(),
      description: description.trim() || undefined,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone,
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone,
      },
      attendees: attendees.length > 0 ? attendees : undefined,
      conferenceData: includeGoogleMeet
        ? {
            createRequest: {
              requestId: `${projectId}-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          }
        : undefined,
    });
  };

  const isValid = title.trim() && meetingDate && startTime;
  const isConnected = connectionStatus?.isConnected ?? false;

  return (
    <>
      {children ? (
        <div onClick={open} style={{ cursor: "pointer" }}>
          {children}
        </div>
      ) : (
        <Button
          leftSection={<IconCalendarPlus size={16} />}
          variant="light"
          size="xs"
          onClick={open}
        >
          Create Meeting
        </Button>
      )}

      <Modal
        opened={opened}
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        title="Schedule Meeting"
      >
        {statusLoading ? (
          <Stack align="center" py="xl">
            <Text c="dimmed">Checking calendar connection...</Text>
          </Stack>
        ) : !isConnected ? (
          <Stack gap="md" py="md">
            <Alert icon={<IconAlertCircle size={16} />} color="orange">
              Connect your Google Calendar to create meetings.
            </Alert>
            <GoogleCalendarConnect isConnected={false} />
          </Stack>
        ) : (
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Meeting Title"
                placeholder="Enter meeting title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />

              <Textarea
                label="Description"
                placeholder="Add meeting description or agenda (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                minRows={3}
                autosize
              />

              <Group grow>
                <DateInput
                  label="Date"
                  placeholder="Select date"
                  value={meetingDate}
                  onChange={setMeetingDate}
                  required
                  minDate={new Date()}
                />
                <TimeInput
                  label="Start Time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.currentTarget.value)}
                  required
                />
              </Group>

              <NumberInput
                label="Duration (minutes)"
                value={duration}
                onChange={setDuration}
                min={15}
                max={480}
                step={15}
              />

              <TextInput
                label="Attendees"
                placeholder="Enter email addresses (comma or space separated)"
                description="Invitations will be sent to these email addresses"
                value={attendeeEmails}
                onChange={(e) => setAttendeeEmails(e.target.value)}
              />

              <Switch
                label="Add Google Meet link"
                description="Automatically generate a video conferencing link"
                checked={includeGoogleMeet}
                onChange={(e) => setIncludeGoogleMeet(e.currentTarget.checked)}
                thumbIcon={
                  includeGoogleMeet ? <IconVideo size={12} /> : undefined
                }
              />

              <Group justify="flex-end" mt="md">
                <Button variant="subtle" color="gray" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={createEvent.isPending}
                  disabled={!isValid}
                  leftSection={<IconCalendarPlus size={16} />}
                >
                  Create Meeting
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
    </>
  );
}

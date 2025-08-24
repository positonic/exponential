"use client";

import { useState } from "react";
import { Modal, TextInput, Textarea, Select, MultiSelect, Button, Group, Text, Stack } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface WeeklyOutcomeModalProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  teamId: string;
  weekStartDate: Date;
}

// Helper function to get start of week (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export function WeeklyOutcomeModal({ 
  opened, 
  onClose, 
  projectId, 
  teamId, 
  weekStartDate 
}: WeeklyOutcomeModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  
  const utils = api.useUtils();

  // Get team members for assignment
  const { data: teamMembersData } = api.weeklyPlanning.getTeamMembers.useQuery({
    teamId
  });
  
  const teamMembers = teamMembersData?.members?.map(member => ({
    value: member.id,
    label: member.name || member.email || "Unknown user"
  })) || [];

  const priorityOptions = [
    { value: "HIGH", label: "High Priority" },
    { value: "MEDIUM", label: "Medium Priority" },
    { value: "LOW", label: "Low Priority" },
  ];

  const createWeeklyOutcome = api.weeklyPlanning.createWeeklyOutcome.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Success",
        message: "Weekly outcome created successfully",
        color: "green"
      });
      
      // Reset form
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setAssigneeIds([]);
      setDueDate(null);
      
      // Close modal and invalidate queries
      onClose();
      void utils.weeklyPlanning.getWeeklyOutcomes.invalidate();
      void utils.weeklyPlanning.getTeamWeeklyView.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to create weekly outcome",
        color: "red"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      notifications.show({
        title: "Validation Error",
        message: "Title is required",
        color: "red"
      });
      return;
    }

    createWeeklyOutcome.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      teamId,
      projectId,
      weekStartDate: getWeekStart(weekStartDate),
      priority,
      assigneeIds,
      dueDate: dueDate || undefined
    });
  };

  const handleClose = () => {
    // Reset form when closing
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setAssigneeIds([]);
    setDueDate(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create Weekly Outcome"
      size="lg"
      overlayProps={{
        backgroundOpacity: 0.55,
        blur: 3,
      }}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label="Title"
            placeholder="What do you want to achieve this week?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            data-autofocus
          />
          
          <Textarea
            label="Description"
            placeholder="Provide more details about this weekly outcome..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          
          <Group grow>
            <Select
              label="Priority"
              value={priority}
              onChange={(value) => setPriority(value as "HIGH" | "MEDIUM" | "LOW")}
              data={priorityOptions}
              required
            />
            
            <DatePickerInput
              label="Due Date (Optional)"
              placeholder="Select due date"
              value={dueDate}
              onChange={setDueDate}
              minDate={weekStartDate}
              maxDate={new Date(weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000)} // End of week
            />
          </Group>
          
          <MultiSelect
            label="Assign to Team Members"
            placeholder="Select team members"
            data={teamMembers}
            value={assigneeIds}
            onChange={setAssigneeIds}
            searchable
            clearable
          />
          
          <Text size="xs" c="dimmed">
            This outcome will be tracked for the week of {weekStartDate.toLocaleDateString('en-US', { 
              month: 'long', 
              day: 'numeric',
              year: 'numeric'
            })}
          </Text>
          
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              loading={createWeeklyOutcome.isPending}
              disabled={!title.trim()}
            >
              Create Outcome
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
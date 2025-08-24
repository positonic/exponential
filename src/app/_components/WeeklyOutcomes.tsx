"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Text, Group, Title, Container, ScrollArea, Badge, Button, Select, Loader, Alert } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconPlus, IconCalendarWeek, IconAlertCircle } from "@tabler/icons-react";
import { type RouterOutputs } from "~/trpc/react";
import { WeeklyOutcomeModal } from "./WeeklyOutcomeModal";


interface WeeklyOutcomesProps {
  projectId: string;
}

// Helper function to get start of week (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export function WeeklyOutcomes({ projectId }: WeeklyOutcomesProps) {
  const [expandedOutcomes, setExpandedOutcomes] = useState<Set<string>>(new Set());
  const [currentWeekStart] = useState(() => getWeekStart(new Date()));
  const [modalOpened, setModalOpened] = useState(false);
  const utils = api.useUtils();

  // Get project to access teamId
  const { data: project } = api.project.getById.useQuery({ id: projectId });

  // Fetch real weekly outcomes data
  const { data: weeklyOutcomesData, isLoading, error } = api.weeklyPlanning.getWeeklyOutcomes.useQuery({
    projectId,
    weekStartDate: currentWeekStart
  });

  // Mutations for updating outcomes
  const updateOutcome = api.weeklyPlanning.updateWeeklyOutcome.useMutation({
    onSuccess: () => {
      void utils.weeklyPlanning.getWeeklyOutcomes.invalidate();
    },
  });

  const statusOptions = [
    { value: "NOT_STARTED", label: "Not Started" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "COMPLETED", label: "Completed" },
    { value: "BLOCKED", label: "Blocked" },
  ];

  const priorityOptions = [
    { value: "HIGH", label: "High" },
    { value: "MEDIUM", label: "Medium" },
    { value: "LOW", label: "Low" },
  ];

  const formatWeekRange = (weekStart: Date) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const toggleOutcomeExpanded = (outcomeId: string) => {
    setExpandedOutcomes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(outcomeId)) {
        newSet.delete(outcomeId);
      } else {
        newSet.add(outcomeId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "green";
      case "IN_PROGRESS":
        return "blue";
      case "BLOCKED":
        return "red";
      case "NOT_STARTED":
      default:
        return "gray";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return "red";
      case "MEDIUM":
        return "orange";
      case "LOW":
      default:
        return "cyan";
    }
  };

  if (isLoading) {
    return (
      <Container size="xl" py="xl">
        <Title order={2} mb="xl" className="text-text-primary">
          Weekly Outcomes
        </Title>
        <div className="flex justify-center py-12">
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Title order={2} mb="xl" className="text-text-primary">
          Weekly Outcomes
        </Title>
        <Alert variant="light" color="red" icon={<IconAlertCircle size={16} />}>
          <Text size="sm">
            {error.message || "Failed to load weekly outcomes. Please try again."}
          </Text>
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <Title order={2} className="text-text-primary">
            Weekly Outcomes
          </Title>
          <Text size="sm" c="dimmed">
            Outcome-centric view: Focus on what the team needs to achieve this week
          </Text>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <IconCalendarWeek size={16} className="text-text-secondary" />
            <Text size="sm" fw={500} className="text-text-primary">
              Week of {formatWeekRange(currentWeekStart)}
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Text size="xs" c="dimmed">
              {weeklyOutcomesData?.outcomes.length || 0} outcomes
            </Text>
            <Button 
              leftSection={<IconPlus size={16} />} 
              variant="filled" 
              color="blue" 
              size="sm"
              onClick={() => setModalOpened(true)}
              disabled={!project?.teamId}
            >
              Add Weekly Outcome
            </Button>
          </div>
        </div>
      </div>
      
      <ScrollArea>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '40px' }}></th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm">Weekly Objective</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '150px' }}>Assigned To</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '100px' }}>Priority</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '120px' }}>Status</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '100px' }}>Due Date</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '150px' }}>Related Tasks</th>
            </tr>
          </thead>
          <tbody>
            {weeklyOutcomesData?.outcomes.length ? (
              weeklyOutcomesData.outcomes.map((outcome) => {
                const isExpanded = expandedOutcomes.has(outcome.id);
                
                return (
                  <>
                    <tr key={outcome.id} className="border-b border-border-primary hover:bg-surface-hover transition-colors">
                      <td className="p-3">
                        <button
                          onClick={() => toggleOutcomeExpanded(outcome.id)}
                          className="text-text-secondary hover:text-text-primary transition-colors"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? (
                            <IconChevronDown size={18} />
                          ) : (
                            <IconChevronRight size={18} />
                          )}
                        </button>
                      </td>
                      <td className="p-3">
                        <div>
                          <Text fw={500} className="text-text-primary" size="sm" mb={2}>
                            {outcome.title}
                          </Text>
                          {outcome.description && (
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              {outcome.description}
                            </Text>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {outcome.assignees.length > 0 ? (
                            outcome.assignees.slice(0, 3).map((assignee) => (
                              <Badge key={assignee.id} variant="light" size="xs">
                                {assignee.name || assignee.email}
                              </Badge>
                            ))
                          ) : (
                            <Text size="xs" c="dimmed" fs="italic">
                              No assignees
                            </Text>
                          )}
                          {outcome.assignees.length > 3 && (
                            <Badge variant="outline" size="xs">
                              +{outcome.assignees.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Select
                          value={outcome.priority}
                          onChange={(value) => {
                            if (value) {
                              updateOutcome.mutate({
                                id: outcome.id,
                                priority: value as "HIGH" | "MEDIUM" | "LOW"
                              });
                            }
                          }}
                          data={priorityOptions}
                          size="xs"
                          variant="filled"
                          styles={{
                            input: {
                              backgroundColor: `var(--mantine-color-${getPriorityColor(outcome.priority)}-light)`,
                              color: `var(--mantine-color-${getPriorityColor(outcome.priority)}-filled)`,
                              fontWeight: 500,
                              border: 'none',
                            }
                          }}
                        />
                      </td>
                      <td className="p-3">
                        <Select
                          value={outcome.status}
                          onChange={(value) => {
                            if (value) {
                              updateOutcome.mutate({
                                id: outcome.id,
                                status: value as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED"
                              });
                            }
                          }}
                          data={statusOptions}
                          size="xs"
                          variant="filled"
                          styles={{
                            input: {
                              backgroundColor: `var(--mantine-color-${getStatusColor(outcome.status)}-light)`,
                              color: `var(--mantine-color-${getStatusColor(outcome.status)}-filled)`,
                              fontWeight: 500,
                              border: 'none',
                            }
                          }}
                        />
                      </td>
                      <td className="p-3">
                        {outcome.dueDate ? (
                          <Text size="sm" className="text-text-primary">
                            {new Date(outcome.dueDate).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </Text>
                        ) : (
                          <Text size="sm" c="dimmed" fs="italic">
                            No due date
                          </Text>
                        )}
                      </td>
                      <td className="p-3">
                        <Group gap="xs">
                          <Text size="sm" className="text-text-secondary">
                            {outcome.relatedActions.length} tasks
                          </Text>
                          <Badge variant="light" color="gray" size="xs">
                            {outcome.progress}% complete
                          </Badge>
                        </Group>
                      </td>
                    </tr>
                    
                    {/* Expanded row showing outcome details and related tasks */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-background-secondary border-t border-border-primary">
                            <div className="pl-12 pr-4 py-4">
                              <div className="grid grid-cols-2 gap-6">
                                <div>
                                  <Text size="sm" fw={500} mb="sm" className="text-text-primary">
                                    Outcome Details
                                  </Text>
                                  <Text size="sm" c="dimmed" mb="md">
                                    {outcome.description || "No description provided"}
                                  </Text>
                                  <Group gap="md">
                                    <div>
                                      <Text size="xs" c="dimmed">Assigned to:</Text>
                                      <Text size="sm" fw={500}>
                                        {outcome.assignees.length > 0 
                                          ? outcome.assignees.map(a => a.name || a.email).join(", ")
                                          : "No assignees"
                                        }
                                      </Text>
                                    </div>
                                    <div>
                                      <Text size="xs" c="dimmed">Progress:</Text>
                                      <Text size="sm" fw={500}>
                                        {outcome.progress}% complete
                                      </Text>
                                    </div>
                                  </Group>
                                </div>
                                <div>
                                  <Text size="sm" fw={500} mb="sm" className="text-text-primary">
                                    Related Tasks ({outcome.relatedActions.length})
                                  </Text>
                                  {outcome.relatedActions.length > 0 ? (
                                    <div className="space-y-2">
                                      {outcome.relatedActions.slice(0, 3).map((action) => (
                                        <div key={action.id} className="flex items-center justify-between p-2 rounded bg-surface-primary border border-border-primary">
                                          <Text size="sm" className="text-text-primary flex-1">
                                            {action.name}
                                          </Text>
                                          <Group gap="xs">
                                            <Badge size="xs" variant="light" color={action.priority === 'HIGH' ? 'red' : action.priority === 'MEDIUM' ? 'orange' : 'cyan'}>
                                              {action.priority}
                                            </Badge>
                                            <Badge size="xs" variant="filled" color={action.status === 'DONE' ? 'green' : action.status === 'IN_PROGRESS' ? 'blue' : 'gray'}>
                                              {action.status}
                                            </Badge>
                                          </Group>
                                        </div>
                                      ))}
                                      {outcome.relatedActions.length > 3 && (
                                        <Text size="xs" c="dimmed" fs="italic">
                                          +{outcome.relatedActions.length - 3} more tasks
                                        </Text>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-center py-4">
                                      <Text size="sm" c="dimmed" fs="italic">
                                        No related tasks
                                      </Text>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <Text size="lg" c="dimmed" mb="sm">
                    No weekly outcomes yet
                  </Text>
                  <Text size="sm" c="dimmed">
                    Create your first weekly outcome to start planning your team&apos;s week
                  </Text>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
      
      <div className="mt-8 p-4 bg-surface-secondary rounded-lg border border-border-primary">
        <Text size="sm" className="text-text-secondary">
          <strong>Outcome-Centric Approach:</strong> This view focuses on the team&apos;s weekly objectives and goals.
          Perfect for ensuring the team stays aligned on what needs to be accomplished and tracking progress toward shared outcomes.
        </Text>
      </div>

      {/* Weekly Outcome Creation Modal */}
      {project?.teamId && (
        <WeeklyOutcomeModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          projectId={projectId}
          teamId={project.teamId}
          weekStartDate={currentWeekStart}
        />
      )}
    </Container>
  );
}
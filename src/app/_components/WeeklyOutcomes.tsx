"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Text, Group, Title, Container, ScrollArea, Badge, Avatar, Button, Select, MultiSelect } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconPlus, IconCalendarWeek } from "@tabler/icons-react";

type WeeklyOutcome = {
  id: string;
  title: string;
  description?: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
  priority: "HIGH" | "MEDIUM" | "LOW";
  assignedTo: string[];
  dueDate: string;
  relatedTasks: any[];
  progress: number;
};

interface WeeklyOutcomesProps {
  projectId: string;
}

export function WeeklyOutcomes({ projectId }: WeeklyOutcomesProps) {
  const [expandedOutcomes, setExpandedOutcomes] = useState<Set<string>>(new Set());
  const [currentWeekStart, setCurrentWeekStart] = useState(getWeekStart(new Date()));

  // Mock team members for assignment
  const mockTeamMembers = [
    { value: "1", label: "Sarah Johnson" },
    { value: "2", label: "Mike Chen" }, 
    { value: "3", label: "Alex Rivera" }
  ];

  // Mock weekly outcomes data
  const mockWeeklyOutcomes: WeeklyOutcome[] = [
    {
      id: "1",
      title: "Complete user authentication system",
      description: "Implement JWT-based authentication with password reset functionality",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignedTo: ["1", "2"],
      dueDate: "2024-01-19",
      relatedTasks: [],
      progress: 65
    },
    {
      id: "2",
      title: "Set up CI/CD pipeline",
      description: "Configure automated testing and deployment pipeline",
      status: "NOT_STARTED", 
      priority: "MEDIUM",
      assignedTo: ["3"],
      dueDate: "2024-01-18",
      relatedTasks: [],
      progress: 0
    },
    {
      id: "3",
      title: "Design review and approval",
      description: "Complete design review sessions with stakeholders",
      status: "COMPLETED",
      priority: "LOW",
      assignedTo: ["1"],
      dueDate: "2024-01-17",
      relatedTasks: [],
      progress: 100
    }
  ];

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

  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

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

  const getAssigneeNames = (assignedTo: string[]) => {
    return assignedTo.map(id => {
      const member = mockTeamMembers.find(m => m.value === id);
      return member ? member.label : "Unknown";
    }).join(", ");
  };

  const formatWeekRange = (weekStart: Date) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

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
          <Button leftSection={<IconPlus size={16} />} variant="filled" color="blue" size="sm">
            Add Weekly Outcome
          </Button>
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
            {mockWeeklyOutcomes.map((outcome) => {
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
                      <MultiSelect
                        data={mockTeamMembers}
                        value={outcome.assignedTo}
                        onChange={() => {}} // Mock - would update in real implementation
                        placeholder="Assign members"
                        size="xs"
                        maxDropdownHeight={150}
                        disabled // Mock - would be editable in real implementation
                        styles={{
                          input: { minHeight: '28px' }
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <Select
                        value={outcome.priority}
                        onChange={() => {}} // Mock - would update in real implementation
                        data={priorityOptions}
                        size="xs"
                        variant="filled"
                        disabled // Mock - would be editable in real implementation
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
                        onChange={() => {}} // Mock - would update in real implementation
                        data={statusOptions}
                        size="xs"
                        variant="filled"
                        disabled // Mock - would be editable in real implementation
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
                      <Text size="sm" className="text-text-primary">
                        {new Date(outcome.dueDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </Text>
                    </td>
                    <td className="p-3">
                      <Group gap="xs">
                        <Text size="sm" className="text-text-secondary">
                          {outcome.relatedTasks.length} tasks
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
                                      {getAssigneeNames(outcome.assignedTo)}
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
                                  Related Tasks
                                </Text>
                                <div className="text-center py-4">
                                  <Text size="sm" c="dimmed" fs="italic">
                                    Related tasks will appear here once backend integration is complete
                                  </Text>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
      
      <div className="mt-8 p-4 bg-surface-secondary rounded-lg border border-border-primary">
        <Text size="sm" className="text-text-secondary">
          <strong>Outcome-Centric Approach:</strong> This view focuses on the team's weekly objectives and goals.
          Perfect for ensuring the team stays aligned on what needs to be accomplished and tracking progress toward shared outcomes.
        </Text>
      </div>
    </Container>
  );
}
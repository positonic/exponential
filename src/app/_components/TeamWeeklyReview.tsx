"use client";

import React, { useState } from "react";
import { api } from "~/trpc/react";
import { Text, Group, Progress, Title, Container, ScrollArea, Badge, Avatar, Loader, Alert } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconAlertCircle } from "@tabler/icons-react";
import { HTMLContent } from "./HTMLContent";
import Link from "next/link";


interface TeamWeeklyReviewProps {
  projectId: string;
}

// Helper function to get start of week (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export function TeamWeeklyReview({ projectId }: TeamWeeklyReviewProps) {
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [currentWeekStart] = useState(() => getWeekStart(new Date()));
  
  // Fetch real team weekly data
  const { data: teamWeeklyData, isLoading, error } = api.weeklyPlanning.getTeamWeeklyView.useQuery({
    projectId,
    weekStartDate: currentWeekStart
  });

  const toggleMemberExpanded = (memberId: string) => {
    setExpandedMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const formatWeekRange = (weekStart: Date) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  if (isLoading) {
    return (
      <Container size="xl" py="xl">
        <Title order={2} mb="xl" className="text-text-primary">
          Weekly Team Review
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
          Weekly Team Review
        </Title>
        <Alert variant="light" color="red" icon={<IconAlertCircle size={16} />}>
          <Text size="sm">
            {error.message || "Failed to load team weekly data. Please try again."}
          </Text>
        </Alert>
      </Container>
    );
  }

  if (!teamWeeklyData?.teamMembers.length) {
    return (
      <Container size="xl" py="xl">
        <Title order={2} mb="xl" className="text-text-primary">
          Weekly Team Review
        </Title>
        <Alert variant="light" color="blue" icon={<IconAlertCircle size={16} />}>
          <Text size="sm">
            No team members found for this project. Make sure this project has a team assigned.
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
            Weekly Team Review
          </Title>
          <Text size="sm" c="dimmed">
            Member-centric view: Review what each team member is working on this week
          </Text>
        </div>
        <div className="text-right">
          <Text size="sm" fw={500} className="text-text-primary">
            Week of {formatWeekRange(currentWeekStart)}
          </Text>
          <Text size="xs" c="dimmed">
            {teamWeeklyData.teamMembers.length} team members
          </Text>
        </div>
      </div>
      
      <ScrollArea>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '40px' }}></th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm">Team Member</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '120px' }}>Role</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm">Weekly Outcomes</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '100px' }}>Capacity</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '300px' }}>Task Progress</th>
              <th className="text-left p-3 text-text-secondary font-medium text-sm" style={{ width: '120px' }}>Status/Notes</th>
            </tr>
          </thead>
          <tbody>
            {teamWeeklyData.teamMembers.map((member) => {
              const isExpanded = expandedMembers.has(member.user.id);
              const { progress } = member;
              
              return (
                <>
                  <tr key={member.user.id} className="border-b border-border-primary hover:bg-surface-hover transition-colors">
                    <td className="p-3">
                      <button
                        onClick={() => toggleMemberExpanded(member.user.id)}
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
                      <Group gap="sm">
                        <Avatar 
                          src={member.user.image || undefined} 
                          alt={member.user.name || "Team member"}
                          size="sm"
                          radius="xl"
                        >
                          {member.user.name?.split(' ').map(n => n[0]).join('') || '?'}
                        </Avatar>
                        <div>
                          <Text fw={500} className="text-text-primary" size="sm">
                            {member.user.name || member.user.email}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {member.user.email}
                          </Text>
                        </div>
                      </Group>
                    </td>
                    <td className="p-3">
                      <Badge variant="light" color="blue" size="sm">
                        {member.role}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {member.weeklyOutcomes.length > 0 ? (
                        <div>
                          {member.weeklyOutcomes.slice(0, 2).map((outcome) => (
                            <Badge key={outcome.id} variant="outline" size="xs" mb={2} mr={4}>
                              {outcome.title}
                            </Badge>
                          ))}
                          {member.weeklyOutcomes.length > 2 && (
                            <Text size="xs" c="dimmed">
                              +{member.weeklyOutcomes.length - 2} more
                            </Text>
                          )}
                        </div>
                      ) : (
                        <Text size="sm" c="dimmed" fs="italic">
                          No weekly outcomes assigned
                        </Text>
                      )}
                    </td>
                    <td className="p-3">
                      <div>
                        <Text size="sm" fw={500} className="text-text-primary">
                          {member.capacity}h
                        </Text>
                        <Text size="xs" c="dimmed">
                          this week
                        </Text>
                      </div>
                    </td>
                    <td className="p-3">
                      <Group gap="xs" align="center">
                        <Text size="sm" className="text-text-secondary">
                          {progress.completed}/{progress.total} completed
                        </Text>
                        <Progress 
                          value={progress.percentage} 
                          size="sm" 
                          style={{ width: 80 }}
                          color={progress.percentage === 100 ? "green" : "blue"}
                          className="bg-surface-secondary"
                        />
                        <Text size="xs" className="text-text-muted">
                          {progress.percentage}%
                        </Text>
                      </Group>
                    </td>
                    <td className="p-3">
                      <Badge 
                        variant="dot" 
                        color={progress.percentage >= 80 ? "green" : progress.percentage >= 50 ? "yellow" : "orange"} 
                        size="sm"
                      >
                        {progress.percentage >= 80 ? "On Track" : progress.percentage >= 50 ? "Progressing" : "Behind"}
                      </Badge>
                    </td>
                  </tr>
                  
                  {/* Expanded row showing member's detailed tasks */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <div className="bg-background-secondary border-t border-border-primary">
                          <div className="pl-12 pr-4 py-4">
                            <Text size="sm" fw={500} mb="md" className="text-text-primary">
                              {member.user.name}&apos;s Tasks This Week
                            </Text>
                            {member.actions.length > 0 ? (
                              <div className="space-y-2">
                                {member.actions.map((action) => (
                                  <div key={action.id} className="flex items-center justify-between p-2 rounded bg-surface-primary border border-border-primary">
                                    <div className="flex-1">
                                      <Text size="sm" fw={500} className="text-text-primary">
                                        <HTMLContent html={action.name} className="text-text-primary" />
                                      </Text>
                                      {action.dueDate && (
                                        <Text size="xs" c="dimmed">
                                          Due: {new Date(action.dueDate).toLocaleDateString()}
                                        </Text>
                                      )}
                                    </div>
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
                              </div>
                            ) : (
                              <div className="text-center py-8">
                                <Text size="sm" c="dimmed" fs="italic">
                                  No tasks assigned for this week
                                </Text>
                              </div>
                            )}
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
          <strong>Member-Centric Approach:</strong> This view focuses on what each team member is working on this week.
          Perfect for team leads to understand individual workloads and identify potential bottlenecks or support needs.
        </Text>
        <Text size="sm" className="text-text-secondary mt-3">
          <Link 
            href="/productivity-methods/team-weekly-planning" 
            className="text-brand-primary hover:text-brand-primary-hover underline"
          >
            Learn more about the Team Weekly Planning methodology →
          </Link>
        </Text>
      </div>
    </Container>
  );
}
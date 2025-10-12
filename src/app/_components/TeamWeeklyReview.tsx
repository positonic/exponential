"use client";

import React, { useState } from "react";
import { api } from "~/trpc/react";
import { Text, Group, Progress, Title, Container, ScrollArea, Badge, Avatar, Loader, Alert, Paper, Stack, Card, Button } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconAlertCircle, IconShare, IconCalendarWeek, IconSettings } from "@tabler/icons-react";
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
      
      {/* Shared Weekly Reviews Section */}
      <SharedWeeklyReviewsSection 
        projectId={projectId}
        currentWeekStart={currentWeekStart}
      />
      
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

// Component for displaying shared weekly reviews from team members
interface SharedWeeklyReviewsSectionProps {
  projectId: string;
  currentWeekStart: Date;
}

function SharedWeeklyReviewsSection({ projectId, currentWeekStart }: SharedWeeklyReviewsSectionProps) {
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());

  // First get the project to get the team ID
  const { data: project } = api.project.getById.useQuery({ id: projectId });
  
  // Then fetch shared reviews for this team
  const { data: sharedReviews, isLoading, error } = api.weeklyReview.getTeamSharedReviews.useQuery(
    {
      teamId: project?.teamId ?? "",
      weekStartDate: currentWeekStart
    },
    {
      enabled: !!project?.teamId
    }
  );

  const toggleReviewExpanded = (userId: string) => {
    setExpandedReviews(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const formatWeekRange = (weekStart: Date) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  // Don't show section if project has no team
  if (!project?.teamId) {
    return null;
  }

  if (isLoading) {
    return (
      <Paper p="lg" mt="xl" withBorder radius="md" className="bg-surface-secondary">
        <Group justify="center" py="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading shared weekly reviews...</Text>
        </Group>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="lg" mt="xl" withBorder radius="md" className="bg-surface-secondary">
        <Alert variant="light" color="red" icon={<IconAlertCircle size={16} />}>
          <Text size="sm">
            {error.message || "Failed to load shared weekly reviews."}
          </Text>
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper p="lg" mt="xl" withBorder radius="md" className="bg-surface-secondary">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Group gap="sm" align="center">
              <IconShare size={20} className="text-brand-primary" />
              <Title order={3} className="text-text-primary">
                Shared Weekly Reviews
              </Title>
            </Group>
            <Text size="sm" c="dimmed">
              Weekly reviews shared by team members for {formatWeekRange(currentWeekStart)}
            </Text>
          </div>
          <Group gap="xs">
            <Button
              variant="light"
              size="sm"
              leftSection={<IconSettings size={16} />}
              component={Link}
              href="/weekly-review/settings"
            >
              Manage Sharing
            </Button>
          </Group>
        </Group>

        {sharedReviews && sharedReviews.length > 0 ? (
          <Stack gap="md">
            {sharedReviews.map((sharing: any) => {
              const isExpanded = expandedReviews.has(sharing.user.id);
              
              return (
                <Card key={sharing.user.id} withBorder radius="md" className="bg-surface-primary">
                  <Stack gap="md">
                    <Group justify="space-between" align="center">
                      <Group gap="md">
                        <Avatar
                          src={sharing.user.image || undefined}
                          alt={sharing.user.name || "Team member"}
                          size="md"
                          radius="xl"
                        >
                          {sharing.user.name?.split(' ').map((n: string) => n[0]).join('') || '?'}
                        </Avatar>
                        <div>
                          <Text fw={500} className="text-text-primary">
                            {sharing.user.name || sharing.user.email}
                          </Text>
                          <Text size="sm" c="dimmed">
                            Sharing weekly reviews with this team
                          </Text>
                        </div>
                      </Group>
                      <Group gap="xs">
                        <Badge variant="dot" color="green" size="sm">
                          Sharing Enabled
                        </Badge>
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={() => toggleReviewExpanded(sharing.user.id)}
                          rightSection={
                            isExpanded ? 
                              <IconChevronDown size={14} /> : 
                              <IconChevronRight size={14} />
                          }
                        >
                          {isExpanded ? 'Hide' : 'View'} Reviews
                        </Button>
                      </Group>
                    </Group>

                    {isExpanded && (
                      <Paper p="md" radius="sm" className="bg-background-secondary border border-border-primary">
                        <Stack gap="sm">
                          <Text size="sm" fw={500} className="text-text-primary">
                            Weekly Review Content
                          </Text>
                          <Alert variant="light" color="blue">
                            <Text size="sm">
                              <strong>Coming Soon:</strong> Actual weekly review content integration is in development. 
                              This will show the member&apos;s weekly outcomes, reflections, and progress summaries.
                            </Text>
                          </Alert>
                          <Group mt="sm">
                            <Button
                              variant="light"
                              size="xs"
                              leftSection={<IconCalendarWeek size={14} />}
                              component={Link}
                              href={`/weekly-review?user=${sharing.user.id}&week=${currentWeekStart.toISOString()}`}
                            >
                              View Full Review
                            </Button>
                          </Group>
                        </Stack>
                      </Paper>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        ) : (
          <Alert variant="light" color="blue" icon={<IconShare size={16} />}>
            <Stack gap="xs">
              <Text fw={500} size="sm">No Shared Weekly Reviews</Text>
              <Text size="sm">
                No team members are currently sharing their weekly reviews with this team. 
                Team members can enable sharing in their weekly review settings.
              </Text>
              <Group mt="sm">
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconSettings size={16} />}
                  component={Link}
                  href="/weekly-review/settings"
                >
                  Manage Your Sharing
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
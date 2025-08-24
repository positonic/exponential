"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Text, Group, Progress, Title, Container, ScrollArea, Badge, Avatar } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { type RouterOutputs } from "~/trpc/react";
import { ActionList } from "./ActionList";

type TeamMember = {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
  responsibilities: string[];
  actions: any[];
  weeklyOutcomes: any[];
};

interface TeamWeeklyReviewProps {
  projectId: string;
}

export function TeamWeeklyReview({ projectId }: TeamWeeklyReviewProps) {
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  
  // For now, mock data until we have the backend API
  const mockTeamMembers: TeamMember[] = [
    {
      id: "1",
      name: "Sarah Johnson",
      role: "Lead Developer",
      avatarUrl: undefined,
      responsibilities: ["Backend development", "Code reviews"],
      actions: [],
      weeklyOutcomes: []
    },
    {
      id: "2", 
      name: "Mike Chen",
      role: "Frontend Developer",
      avatarUrl: undefined,
      responsibilities: ["UI/UX implementation", "Testing"],
      actions: [],
      weeklyOutcomes: []
    },
    {
      id: "3",
      name: "Alex Rivera", 
      role: "DevOps Engineer",
      avatarUrl: undefined,
      responsibilities: ["CI/CD", "Infrastructure"],
      actions: [],
      weeklyOutcomes: []
    }
  ];

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

  const calculateMemberProgress = (member: TeamMember) => {
    if (!member.actions || member.actions.length === 0) return 0;
    const completedTasks = member.actions.filter(action => action.status === "DONE").length;
    return Math.round((completedTasks / member.actions.length) * 100);
  };

  const getMemberCapacity = (member: TeamMember) => {
    // Mock capacity calculation - in real implementation this would come from the backend
    return Math.floor(Math.random() * 30) + 20; // 20-50 hours
  };

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xl" className="text-text-primary">
        Weekly Team Review
      </Title>
      
      <Text size="sm" c="dimmed" mb="lg">
        Member-centric view: Review what each team member is working on this week
      </Text>
      
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
            {mockTeamMembers.map((member) => {
              const isExpanded = expandedMembers.has(member.id);
              const progress = calculateMemberProgress(member);
              const capacity = getMemberCapacity(member);
              
              return (
                <>
                  <tr key={member.id} className="border-b border-border-primary hover:bg-surface-hover transition-colors">
                    <td className="p-3">
                      <button
                        onClick={() => toggleMemberExpanded(member.id)}
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
                          src={member.avatarUrl} 
                          alt={member.name}
                          size="sm"
                          radius="xl"
                        >
                          {member.name.split(' ').map(n => n[0]).join('')}
                        </Avatar>
                        <div>
                          <Text fw={500} className="text-text-primary" size="sm">
                            {member.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {member.responsibilities.join(", ")}
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
                      <Text size="sm" c="dimmed" fs="italic">
                        Weekly outcomes will appear here
                      </Text>
                    </td>
                    <td className="p-3">
                      <div>
                        <Text size="sm" fw={500} className="text-text-primary">
                          {capacity}h
                        </Text>
                        <Text size="xs" c="dimmed">
                          this week
                        </Text>
                      </div>
                    </td>
                    <td className="p-3">
                      <Group gap="xs" align="center">
                        <Text size="sm" className="text-text-secondary">
                          {member.actions?.filter(a => a.status === "DONE").length || 0}/{member.actions?.length || 0} completed
                        </Text>
                        <Progress 
                          value={progress} 
                          size="sm" 
                          style={{ width: 80 }}
                          color={progress === 100 ? "green" : "blue"}
                          className="bg-surface-secondary"
                        />
                        <Text size="xs" className="text-text-muted">
                          {progress}%
                        </Text>
                      </Group>
                    </td>
                    <td className="p-3">
                      <Badge variant="dot" color="green" size="sm">
                        On Track
                      </Badge>
                    </td>
                  </tr>
                  
                  {/* Expanded row showing member's detailed tasks */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <div className="bg-background-secondary border-t border-border-primary">
                          <div className="pl-12 pr-4 py-2 max-w-5xl">
                            <Text size="sm" fw={500} mb="sm" className="text-text-primary">
                              {member.name}'s Tasks This Week
                            </Text>
                            <div className="text-center py-8">
                              <Text size="sm" c="dimmed" fs="italic">
                                Task assignments will appear here once backend integration is complete
                              </Text>
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
          <strong>Member-Centric Approach:</strong> This view focuses on what each team member is working on this week.
          Perfect for team leads to understand individual workloads and identify potential bottlenecks or support needs.
        </Text>
      </div>
    </Container>
  );
}